import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { XteinkClient } from "../device/xteink-client.js";
import type { BaselineEntry, PlannedAction, ProbeResult, ScanSummary, SyncProfile, SyncRunSummary, TreeEntry } from "../types.js";

const toPosixPath = (filePath: string): string => filePath.split(path.sep).join("/");

const scanLocalTree = (rootPath: string): TreeEntry[] => {
  const entries: TreeEntry[] = [];

  const walk = (currentPath: string): void => {
    const dirEntries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of dirEntries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = toPosixPath(path.relative(rootPath, fullPath));
      if (entry.isDirectory()) {
        const stats = fs.statSync(fullPath);
        entries.push({
          path: fullPath,
          relativePath,
          isDirectory: true,
          size: stats.size
        });
        walk(fullPath);
      } else if (entry.isFile()) {
        const stats = fs.statSync(fullPath);
        entries.push({
          path: fullPath,
          relativePath,
          isDirectory: false,
          size: stats.size
        });
      }
    }
  };

  walk(rootPath);
  return entries;
};

const summarizeScan = (entries: TreeEntry[]): { files: number; dirs: number } => ({
  files: entries.filter((entry) => !entry.isDirectory).length,
  dirs: entries.filter((entry) => entry.isDirectory).length
});

const toRemotePath = (remoteRoot: string, relativePath: string): string => {
  if (!relativePath) {
    return remoteRoot;
  }

  if (remoteRoot === "/") {
    return `/${relativePath}`;
  }

  return `${remoteRoot}/${relativePath}`;
};

const toRemoteDir = (remoteRoot: string, relativePath: string): string => {
  const parent = path.posix.dirname(relativePath);
  if (parent === ".") {
    return remoteRoot;
  }

  return toRemotePath(remoteRoot, parent);
};

const appendConflictSuffix = (filePath: string, suffix: string): string => {
  const extension = path.extname(filePath);
  if (!extension) {
    return `${filePath}.${suffix}`;
  }

  return `${filePath.slice(0, -extension.length)}.${suffix}${extension}`;
};

const sha256 = (bytes: Uint8Array): string => crypto.createHash("sha256").update(bytes).digest("hex");

const hashLocalFile = (localPath: string): string => sha256(fs.readFileSync(localPath));

const toBaselineEntries = (entries: TreeEntry[]): BaselineEntry[] =>
  entries
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({
      relativePath: entry.relativePath,
      size: entry.size,
      hash: hashLocalFile(entry.path)
    }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

const planActions = async (
  localEntries: TreeEntry[],
  remoteEntries: TreeEntry[],
  baselineEntries: BaselineEntry[],
  mode: SyncProfile["mode"],
  client: XteinkClient,
  remoteRoot: string
): Promise<PlannedAction[]> => {
  const localFiles = new Map(localEntries.filter((entry) => !entry.isDirectory).map((entry) => [entry.relativePath, entry]));
  const remoteFiles = new Map(remoteEntries.filter((entry) => !entry.isDirectory).map((entry) => [entry.relativePath, entry]));
  const baselineFiles = new Map(baselineEntries.map((entry) => [entry.relativePath, entry]));
  const allPaths = new Set<string>([...localFiles.keys(), ...remoteFiles.keys(), ...baselineFiles.keys()]);
  const planned: PlannedAction[] = [];
  const localHashCache = new Map<string, string>();
  const remoteHashCache = new Map<string, string>();

  const getLocalHash = (entry: TreeEntry): string => {
    const cached = localHashCache.get(entry.path);
    if (cached) {
      return cached;
    }

    const hash = hashLocalFile(entry.path);
    localHashCache.set(entry.path, hash);
    return hash;
  };

  const getRemoteHash = async (entry: TreeEntry): Promise<string> => {
    const cached = remoteHashCache.get(entry.path);
    if (cached) {
      return cached;
    }

    const bytes = await client.downloadBytes(toRemotePath(remoteRoot, entry.relativePath));
    const hash = sha256(bytes);
    remoteHashCache.set(entry.path, hash);
    return hash;
  };

  for (const pathKey of [...allPaths].sort()) {
    const local = localFiles.get(pathKey);
    const remote = remoteFiles.get(pathKey);
    const baseline = baselineFiles.get(pathKey);
    let localChanged = local ? !baseline || baseline.size !== local.size : baseline !== undefined;
    let remoteChanged = remote ? !baseline || baseline.size !== remote.size : baseline !== undefined;

    if (baseline && local && baseline.size === local.size) {
      localChanged = getLocalHash(local) !== baseline.hash;
    }

    if (baseline && remote && baseline.size === remote.size) {
      remoteChanged = (await getRemoteHash(remote)) !== baseline.hash;
    }

    if (!baseline) {
      if (local && !remote) {
        planned.push({
          path: pathKey,
          kind: mode === "pull-only" ? "skip" : "upload",
          reason: mode === "pull-only" ? "local-only skipped in pull-only mode" : "local-only file on first run",
          localSize: local.size
        });
        continue;
      }

      if (!local && remote) {
        planned.push({
          path: pathKey,
          kind: mode === "push-only" ? "skip" : "download",
          reason: mode === "push-only" ? "remote-only skipped in push-only mode" : "remote-only file on first run",
          remoteSize: remote.size
        });
        continue;
      }

      if (!local || !remote) {
        continue;
      }

      if (local.size === remote.size) {
        planned.push({
          path: pathKey,
          kind: "skip",
          reason: "same path and same size on first run",
          localSize: local.size,
          remoteSize: remote.size
        });
        continue;
      }

      if (mode === "pull-only") {
        planned.push({
          path: pathKey,
          kind: "download",
          reason: "size differs on first run, prefer remote in pull-only mode",
          localSize: local.size,
          remoteSize: remote.size
        });
        continue;
      }

      if (mode === "push-only") {
        planned.push({
          path: pathKey,
          kind: "upload",
          reason: "size differs on first run, prefer local in push-only mode",
          localSize: local.size,
          remoteSize: remote.size
        });
        continue;
      }

      planned.push({
        path: pathKey,
        kind: "conflict",
        reason: "same path exists on both sides with different size and no trusted baseline yet",
        localSize: local.size,
        remoteSize: remote.size
      });
      continue;
    }

    if (local && !remote) {
      planned.push({
        path: pathKey,
        kind: !localChanged ? "skip" : mode === "pull-only" ? "skip" : "upload",
        reason: !localChanged
          ? "missing remote but local still matches baseline"
          : mode === "pull-only"
            ? "local changed but skipped in pull-only mode"
            : "only local changed since baseline",
        localSize: local.size
      });
      continue;
    }

    if (!local && remote) {
      planned.push({
        path: pathKey,
        kind: !remoteChanged ? "skip" : mode === "push-only" ? "skip" : "download",
        reason: !remoteChanged
          ? "missing local but remote still matches baseline"
          : mode === "push-only"
            ? "remote changed but skipped in push-only mode"
            : "only remote changed since baseline",
        remoteSize: remote.size
      });
      continue;
    }

    if (!local || !remote) {
      continue;
    }

    if (!localChanged && !remoteChanged) {
      planned.push({
        path: pathKey,
        kind: "skip",
        reason: "unchanged on both sides since baseline",
        localSize: local.size,
        remoteSize: remote.size
      });
      continue;
    }

    if (localChanged && !remoteChanged) {
      planned.push({
        path: pathKey,
        kind: mode === "pull-only" ? "skip" : "upload",
        reason: mode === "pull-only" ? "local changed but skipped in pull-only mode" : "only local changed since baseline",
        localSize: local.size,
        remoteSize: remote.size
      });
      continue;
    }

    if (!localChanged && remoteChanged) {
      planned.push({
        path: pathKey,
        kind: mode === "push-only" ? "skip" : "download",
        reason: mode === "push-only" ? "remote changed but skipped in push-only mode" : "only remote changed since baseline",
        localSize: local.size,
        remoteSize: remote.size
      });
      continue;
    }

    if (mode === "pull-only") {
      planned.push({
        path: pathKey,
        kind: "download",
        reason: "both sides changed since baseline, prefer remote in pull-only mode",
        localSize: local.size,
        remoteSize: remote.size
      });
      continue;
    }

    if (mode === "push-only") {
      planned.push({
        path: pathKey,
        kind: "upload",
        reason: "both sides changed since baseline, prefer local in push-only mode",
        localSize: local.size,
        remoteSize: remote.size
      });
      continue;
    }

    planned.push({
      path: pathKey,
      kind: "conflict",
      reason: "both local and remote changed since baseline",
      localSize: local.size,
      remoteSize: remote.size
    });
  }

  return planned;
};

export class SyncEngine {
  private async collectSummary(profile: SyncProfile, baselineEntries: BaselineEntry[]): Promise<SyncRunSummary> {
    const client = new XteinkClient(profile.baseUrl);
    const probe: ProbeResult = await client.probe();
    const localEntries = scanLocalTree(profile.localRoot);
    const remoteEntries = await client.scanTree(profile.remoteRoot);
    const local = summarizeScan(localEntries);
    const remote = summarizeScan(remoteEntries);
    const actions = await planActions(localEntries, remoteEntries, baselineEntries, profile.mode, client, profile.remoteRoot);
    const currentEntries = toBaselineEntries(localEntries);

    const scan: ScanSummary = {
      localFiles: local.files,
      localDirs: local.dirs,
      remoteFiles: remote.files,
      remoteDirs: remote.dirs
    };

    const plan = {
      upload: actions.filter((item) => item.kind === "upload").length,
      download: actions.filter((item) => item.kind === "download").length,
      conflict: actions.filter((item) => item.kind === "conflict").length,
      skip: actions.filter((item) => item.kind === "skip").length,
      sample: actions.slice(0, 12)
    };

    return {
      profileName: profile.name,
      baseUrl: probe.normalizedBaseUrl,
      mode: profile.mode,
      probe,
      scan,
      plan,
      baselineEntryCount: baselineEntries.length,
      currentEntries,
      actions
    };
  }

  async run(profile: SyncProfile, baselineEntries: BaselineEntry[]): Promise<SyncRunSummary> {
    if (!fs.existsSync(profile.localRoot)) {
      throw new Error(`Local root does not exist: ${profile.localRoot}`);
    }

    return this.collectSummary(profile, baselineEntries);
  }

  async execute(profile: SyncProfile, baselineEntries: BaselineEntry[]): Promise<SyncRunSummary> {
    const preview = await this.run(profile, baselineEntries);
    const client = new XteinkClient(profile.baseUrl);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    for (const action of preview.actions) {
      if (action.kind === "upload") {
        const localPath = path.join(profile.localRoot, action.path);
        const remoteDir = toRemoteDir(profile.remoteRoot, action.path);
        await client.uploadFile(localPath, remoteDir);
        continue;
      }

      if (action.kind === "download") {
        const remotePath = toRemotePath(profile.remoteRoot, action.path);
        const localPath = path.join(profile.localRoot, action.path);
        await client.downloadFile(remotePath, localPath);
      }

      if (action.kind === "conflict") {
        const remotePath = toRemotePath(profile.remoteRoot, action.path);
        const remoteDir = toRemoteDir(profile.remoteRoot, action.path);
        const localPath = path.join(profile.localRoot, action.path);
        const localConflictPath = appendConflictSuffix(localPath, `conflict-remote-${timestamp}`);
        const remoteBytes = await client.downloadBytes(remotePath);

        fs.mkdirSync(path.dirname(localConflictPath), { recursive: true });
        fs.writeFileSync(localConflictPath, Buffer.from(remoteBytes));

        await client.uploadFile(localConflictPath, remoteDir);
        await client.uploadFile(localPath, remoteDir);
      }
    }

    return this.collectSummary(profile, preview.currentEntries);
  }
}
