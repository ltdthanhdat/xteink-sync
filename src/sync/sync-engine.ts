import fs from "node:fs";
import path from "node:path";
import { XteinkClient } from "../device/xteink-client.js";
import type {
  BaselineEntry,
  ExecutionProgress,
  PlannedAction,
  PlanSummary,
  ProbeResult,
  RunProgress,
  ScanSummary,
  SyncProfile,
  SyncRunSummary,
  TombstoneEntry,
  TreeEntry
} from "../types.js";

const LEGACY_TRASH_DIR_NAME = ".xteink-trash";
const LOCAL_IGNORE_FILE = ".xteinkignore";
const DEFAULT_IGNORED_RELATIVE_PATHS = [".git", LEGACY_TRASH_DIR_NAME, LOCAL_IGNORE_FILE];

const toPosixPath = (filePath: string): string => filePath.split(path.sep).join("/");

const normalizeIgnorePattern = (pattern: string): string => pattern.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");

const loadLocalIgnorePatterns = (rootPath: string): string[] => {
  const ignoreFilePath = path.join(rootPath, LOCAL_IGNORE_FILE);
  if (!fs.existsSync(ignoreFilePath)) {
    return DEFAULT_IGNORED_RELATIVE_PATHS;
  }

  const configuredPatterns = fs
    .readFileSync(ignoreFilePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map(normalizeIgnorePattern)
    .filter(Boolean);

  return [...new Set([...DEFAULT_IGNORED_RELATIVE_PATHS, ...configuredPatterns])];
};

const matchesIgnoredRelativePath = (relativePath: string, ignoredPatterns: string[]): boolean => {
  const normalizedPath = normalizeIgnorePattern(relativePath);
  return ignoredPatterns.some((pattern) => normalizedPath === pattern || normalizedPath.startsWith(`${pattern}/`));
};

const scanLocalTree = (rootPath: string): TreeEntry[] => {
  const entries: TreeEntry[] = [];
  const ignoredPatterns = loadLocalIgnorePatterns(rootPath);

  const walk = (currentPath: string): void => {
    const dirEntries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of dirEntries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = toPosixPath(path.relative(rootPath, fullPath));
      if (matchesIgnoredRelativePath(relativePath, ignoredPatterns)) {
        continue;
      }

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

const appendFileSuffix = (filePath: string, suffix: string): string => {
  const extension = path.extname(filePath);
  if (!extension) {
    return `${filePath}.${suffix}`;
  }

  return `${filePath.slice(0, -extension.length)}.${suffix}${extension}`;
};

const timestampFragment = (): string => new Date().toISOString().replaceAll(":", "-");
const sleep = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));
const throwIfCancelled = (shouldCancel?: () => boolean): void => {
  if (shouldCancel?.()) {
    throw new Error("SYNC_CANCELLED");
  }
};

const toBaselineEntries = (entries: TreeEntry[]): BaselineEntry[] =>
  entries
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({
      relativePath: entry.relativePath
    }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

const buildPlanSummary = (actions: PlannedAction[]): PlanSummary => ({
  upload: actions.filter((item) => item.kind === "upload").length,
  download: actions.filter((item) => item.kind === "download").length,
  conflict: actions.filter((item) => item.kind === "conflict").length,
  skip: actions.filter((item) => item.kind === "skip").length,
  localDelete: actions.filter((item) => item.kind === "local-delete").length,
  remoteDelete: actions.filter((item) => item.kind === "remote-delete").length,
  deleteCandidate: actions.filter((item) => item.kind === "delete-candidate").length,
  sample: actions.slice(0, 12)
});

type PlanContext = {
  local?: TreeEntry;
  remote?: TreeEntry;
  baseline?: BaselineEntry;
  localChanged: boolean;
  remoteChanged: boolean;
  tombstone?: TombstoneEntry;
  mode: SyncProfile["mode"];
};

const planMissingPath = (pathKey: string, context: PlanContext): PlannedAction => {
  const { local, remote, baseline, localChanged, remoteChanged, tombstone, mode } = context;
  if (!baseline) {
    throw new Error(`planMissingPath called without baseline for ${pathKey}`);
  }

  if (!local && remote) {
    if (tombstone?.deletedOn === "local") {
      return {
        path: pathKey,
        kind: "remote-delete",
        reason: "pending tombstone from local delete",
        remoteSize: remote.size,
        tombstoneSide: "local"
      };
    }

    if (mode === "push-only") {
      return {
        path: pathKey,
        kind: "remote-delete",
        reason: "local is authoritative for delete in push-only mode",
        remoteSize: remote.size
      };
    }

    if (mode === "pull-only") {
      return {
        path: pathKey,
        kind: remoteChanged ? "download" : "download",
        reason: remoteChanged ? "remote changed while local is missing in pull-only mode" : "restore local file from remote baseline in pull-only mode",
        remoteSize: remote.size
      };
    }

    if (remoteChanged) {
      return {
        path: pathKey,
        kind: "conflict",
        reason: "delete vs modify conflict: local missing but remote changed since baseline",
        remoteSize: remote.size
      };
    }

    return {
      path: pathKey,
      kind: "remote-delete",
      reason: "propagate local delete to remote from trusted baseline",
      remoteSize: remote.size,
      tombstoneSide: "local"
    };
  }

  if (local && !remote) {
    if (tombstone?.deletedOn === "remote") {
      return {
        path: pathKey,
        kind: "local-delete",
        reason: "pending tombstone from remote delete",
        localSize: local.size,
        tombstoneSide: "remote"
      };
    }

    if (mode === "pull-only") {
      return {
        path: pathKey,
        kind: "local-delete",
        reason: "remote is authoritative for delete in pull-only mode",
        localSize: local.size
      };
    }

    if (mode === "push-only") {
      return {
        path: pathKey,
        kind: "upload",
        reason: localChanged ? "local changed while remote is missing in push-only mode" : "restore remote file from local baseline in push-only mode",
        localSize: local.size
      };
    }

    if (localChanged) {
      return {
        path: pathKey,
        kind: "conflict",
        reason: "delete vs modify conflict: remote missing but local changed since baseline",
        localSize: local.size
      };
    }

    return {
      path: pathKey,
      kind: "local-delete",
      reason: "propagate remote delete to local from trusted baseline",
      localSize: local.size,
      tombstoneSide: "remote"
    };
  }

  return {
    path: pathKey,
    kind: "delete-candidate",
    reason: "unexpected missing-path state",
    localSize: local?.size,
    remoteSize: remote?.size
  };
};

export const planActions = async (
  localEntries: TreeEntry[],
  remoteEntries: TreeEntry[],
  baselineEntries: BaselineEntry[],
  pendingTombstones: TombstoneEntry[],
  mode: SyncProfile["mode"],
  _client: Pick<XteinkClient, "downloadBytes">,
  _remoteRoot: string
): Promise<PlannedAction[]> => {
  const localFiles = new Map(localEntries.filter((entry) => !entry.isDirectory).map((entry) => [entry.relativePath, entry]));
  const remoteFiles = new Map(remoteEntries.filter((entry) => !entry.isDirectory).map((entry) => [entry.relativePath, entry]));
  const baselineFiles = new Map(baselineEntries.map((entry) => [entry.relativePath, entry]));
  const tombstones = new Map(pendingTombstones.map((entry) => [entry.relativePath, entry]));
  const allPaths = new Set<string>([...localFiles.keys(), ...remoteFiles.keys(), ...baselineFiles.keys(), ...tombstones.keys()]);
  const planned: PlannedAction[] = [];

  for (const pathKey of [...allPaths].sort()) {
    const local = localFiles.get(pathKey);
    const remote = remoteFiles.get(pathKey);
    const baseline = baselineFiles.get(pathKey);
    const tombstone = tombstones.get(pathKey);
    const localChanged = Boolean(local && !baseline);
    const remoteChanged = Boolean(remote && !baseline);

    if (!baseline) {
      if (!local && !remote && tombstone) {
        planned.push({
          path: pathKey,
          kind: "skip",
          reason: "already converged on tombstoned delete",
          tombstoneSide: tombstone.deletedOn
        });
        continue;
      }

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

      planned.push({
        path: pathKey,
        kind: "skip",
        reason: "same path exists on both sides on first run",
        localSize: local.size,
        remoteSize: remote.size
      });
      continue;
    }

    if (!local && !remote) {
      planned.push({
        path: pathKey,
        kind: "skip",
        reason: tombstone ? "already converged on tombstoned delete" : "missing on both sides since baseline",
        tombstoneSide: tombstone?.deletedOn
      });
      continue;
    }

    if (!local || !remote) {
      planned.push(
        planMissingPath(pathKey, {
          local,
          remote,
          baseline,
          localChanged,
          remoteChanged,
          tombstone,
          mode
        })
      );
      continue;
    }

    if (!localChanged && !remoteChanged) {
      planned.push({
        path: pathKey,
        kind: "skip",
        reason: "same path still exists on both sides since baseline",
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
  private async probeWithRetry(
    client: XteinkClient,
    onProgress?: (progress: RunProgress) => void,
    shouldCancel?: () => boolean
  ): Promise<ProbeResult> {
    for (;;) {
      throwIfCancelled(shouldCancel);
      onProgress?.({ phase: "probing-device" });

      try {
        return await client.probe();
      } catch {
        throwIfCancelled(shouldCancel);
        await sleep(1000);
      }
    }
  }

  private async collectSummary(
    profile: SyncProfile,
    baselineEntries: BaselineEntry[],
    pendingTombstones: TombstoneEntry[],
    onProgress?: (progress: RunProgress) => void,
    shouldCancel?: () => boolean
  ): Promise<SyncRunSummary> {
    const client = new XteinkClient(profile.baseUrl);
    const probe = await this.probeWithRetry(client, onProgress, shouldCancel);
    throwIfCancelled(shouldCancel);
    onProgress?.({ phase: "scanning-local" });
    const localEntries = scanLocalTree(profile.localRoot);
    throwIfCancelled(shouldCancel);
    onProgress?.({ phase: "scanning-remote" });
    const remoteEntries = await client.scanTree(profile.remoteRoot);
    throwIfCancelled(shouldCancel);
    const local = summarizeScan(localEntries);
    const remote = summarizeScan(remoteEntries);
    onProgress?.({ phase: "building-plan" });
    const actions = await planActions(localEntries, remoteEntries, baselineEntries, pendingTombstones, profile.mode, client, profile.remoteRoot);
    const currentEntries = toBaselineEntries(localEntries);

    const scan: ScanSummary = {
      localFiles: local.files,
      localDirs: local.dirs,
      remoteFiles: remote.files,
      remoteDirs: remote.dirs
    };

    return {
      profileName: profile.name,
      baseUrl: probe.normalizedBaseUrl,
      mode: profile.mode,
      probe,
      scan,
      plan: buildPlanSummary(actions),
      baselineEntryCount: baselineEntries.length,
      pendingTombstoneCount: pendingTombstones.length,
      currentEntries,
      actions
    };
  }

  async run(
    profile: SyncProfile,
    baselineEntries: BaselineEntry[],
    pendingTombstones: TombstoneEntry[] = [],
    onProgress?: (progress: RunProgress) => void,
    shouldCancel?: () => boolean
  ): Promise<SyncRunSummary> {
    throwIfCancelled(shouldCancel);
    onProgress?.({ phase: "validating-local-root" });
    if (!fs.existsSync(profile.localRoot)) {
      throw new Error(`Local root does not exist: ${profile.localRoot}`);
    }

    const summary = await this.collectSummary(profile, baselineEntries, pendingTombstones, onProgress, shouldCancel);
    throwIfCancelled(shouldCancel);
    onProgress?.({ phase: "completed" });
    return summary;
  }

  async execute(
    profile: SyncProfile,
    baselineEntries: BaselineEntry[],
    pendingTombstones: TombstoneEntry[] = [],
    onProgress?: (progress: ExecutionProgress) => void
  ): Promise<SyncRunSummary> {
    const preview = await this.run(profile, baselineEntries, pendingTombstones);
    const client = new XteinkClient(profile.baseUrl);
    const executableActions = preview.actions.filter((action) => action.kind !== "skip" && action.kind !== "delete-candidate");
    let completedActions = 0;

    onProgress?.({
      phase: "running",
      totalActions: executableActions.length,
      completedActions
    });

    for (const action of preview.actions) {
      if (action.kind === "skip" || action.kind === "delete-candidate") {
        continue;
      }

      onProgress?.({
        phase: "running",
        totalActions: executableActions.length,
        completedActions,
        currentAction: action
      });

      try {
        const localPath = path.join(profile.localRoot, action.path);
        const remotePath = toRemotePath(profile.remoteRoot, action.path);
        if (action.kind === "download") {
          await client.downloadFile(remotePath, localPath);
        } else if (action.kind === "upload") {
          await client.uploadFile(localPath, toRemoteDir(profile.remoteRoot, action.path));
        } else if (action.kind === "local-delete") {
          fs.rmSync(localPath, { force: true });
        } else if (action.kind === "remote-delete") {
          await client.deletePath(remotePath);
        } else {
          const remoteBytes = await client.downloadBytes(remotePath);
          const conflictLocalPath = appendFileSuffix(localPath, `conflict-remote-${timestampFragment()}`);
          const conflictRemoteLocalPath = appendFileSuffix(localPath, `conflict-remote-upload-${timestampFragment()}`);
          fs.mkdirSync(path.dirname(conflictLocalPath), { recursive: true });
          fs.writeFileSync(conflictLocalPath, Buffer.from(remoteBytes));
          fs.copyFileSync(conflictLocalPath, conflictRemoteLocalPath);
          await client.uploadFile(conflictRemoteLocalPath, toRemoteDir(profile.remoteRoot, action.path));
          await client.uploadFile(localPath, toRemoteDir(profile.remoteRoot, action.path));
          fs.rmSync(conflictRemoteLocalPath, { force: true });
        }
      } catch (error) {
        onProgress?.({
          phase: "failed",
          totalActions: executableActions.length,
          completedActions,
          currentAction: action,
          failedAction: action,
          errorMessage: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }

      completedActions += 1;
      onProgress?.({
        phase: "running",
        totalActions: executableActions.length,
        completedActions,
        lastCompletedAction: action
      });
    }

    onProgress?.({
      phase: "completed",
      totalActions: executableActions.length,
      completedActions
    });

    return this.collectSummary(profile, baselineEntries, pendingTombstones);
  }
}
