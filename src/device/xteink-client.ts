import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import type { TreeEntry } from "../types.js";

const LEGACY_REMOTE_TRASH_DIR_NAME = "xteink-trash";

type RemoteItem = {
  name: string;
  size: number;
  isDirectory: boolean;
};

const normalizeBaseUrl = (raw: string): string => {
  const withProtocol = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `http://${raw}`;
  const url = new URL(withProtocol);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
};

const joinRemotePath = (base: string, name: string): string => {
  if (base === "/") {
    return `/${name}`;
  }

  return `${base}/${name}`;
};

const isTrashRelativePath = (relativePath: string): boolean =>
  relativePath === LEGACY_REMOTE_TRASH_DIR_NAME || relativePath.startsWith(`${LEGACY_REMOTE_TRASH_DIR_NAME}/`);

export class XteinkClient {
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  private async fetchText(pathname: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}${pathname}`);
    if (!response.ok) {
      throw new Error(`Request failed: ${pathname} -> ${response.status}`);
    }

    return response.text();
  }

  private async fetchJson<T>(pathname: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${pathname}`);
    if (!response.ok) {
      throw new Error(`Request failed: ${pathname} -> ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  async probe(): Promise<{ normalizedBaseUrl: string; pageTitle: string; rootEntryCount: number }> {
    const filesHtml = await this.fetchText("/files");
    if (!filesHtml.includes("CrossPoint Reader")) {
      throw new Error("The /files page does not look like the CrossPoint Reader file manager.");
    }

    const rootItems = await this.listDir("/");
    return {
      normalizedBaseUrl: this.baseUrl,
      pageTitle: "CrossPoint Reader - Files",
      rootEntryCount: rootItems.length
    };
  }

  async listDir(path: string): Promise<RemoteItem[]> {
    return this.fetchJson<RemoteItem[]>(`/api/files?path=${encodeURIComponent(path)}`);
  }

  async mkdir(parentPath: string, name: string): Promise<void> {
    const form = new FormData();
    form.append("name", name);
    form.append("path", parentPath === "/" ? "" : parentPath);

    const response = await fetch(`${this.baseUrl}/mkdir`, {
      method: "POST",
      body: form
    });

    if (!response.ok) {
      const targetPath = parentPath === "/" ? `/${name}` : `${parentPath}/${name}`;
      throw new Error(`mkdir failed for ${targetPath}: ${response.status}`);
    }
  }

  async ensureRemoteDir(remoteDir: string): Promise<void> {
    if (remoteDir === "/" || remoteDir === "") {
      return;
    }

    const segments = remoteDir.split("/").filter(Boolean);
    let current = "/";

    for (const segment of segments) {
      const siblings = await this.listDir(current);
      const exists = siblings.some((item) => item.isDirectory && item.name === segment);
      if (!exists) {
        await this.mkdir(current, segment);
      }
      current = joinRemotePath(current, segment);
    }
  }

  async uploadFile(localPath: string, remoteDir: string): Promise<void> {
    await this.ensureRemoteDir(remoteDir);
    const form = new FormData();
    const file = Bun.file(localPath);
    form.append("file", file, path.basename(localPath));

    const response = await fetch(`${this.baseUrl}/upload?path=${encodeURIComponent(remoteDir)}`, {
      method: "POST",
      body: form
    });

    if (!response.ok) {
      throw new Error(`upload failed for ${localPath} -> ${remoteDir}: ${response.status}`);
    }
  }

  async renamePath(remotePath: string, newName: string): Promise<void> {
    const form = new FormData();
    form.append("path", remotePath);
    form.append("name", newName);

    const response = await fetch(`${this.baseUrl}/rename`, {
      method: "POST",
      body: form
    });

    if (!response.ok) {
      throw new Error(`rename failed for ${remotePath} -> ${newName}: ${response.status}`);
    }
  }

  async movePath(remotePath: string, destinationDir: string): Promise<void> {
    await this.ensureRemoteDir(destinationDir);
    const form = new FormData();
    form.append("path", remotePath);
    form.append("dest", destinationDir);

    const response = await fetch(`${this.baseUrl}/move`, {
      method: "POST",
      body: form
    });

    if (!response.ok) {
      throw new Error(`move failed for ${remotePath} -> ${destinationDir}: ${response.status}`);
    }
  }

  async deletePath(remotePath: string): Promise<void> {
    const normalizedPath = remotePath.startsWith("/") ? remotePath : `/${remotePath}`;
    const body = new URLSearchParams({
      paths: JSON.stringify([normalizedPath])
    });

    const response = await fetch(`${this.baseUrl}/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });

    if (!response.ok) {
      throw new Error(`delete failed for ${remotePath}: ${response.status}`);
    }
  }

  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    const response = await fetch(`${this.baseUrl}/download?path=${encodeURIComponent(remotePath)}`);
    if (!response.ok) {
      throw new Error(`download failed for ${remotePath}: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(localPath, Buffer.from(arrayBuffer));
  }

  async downloadBytes(remotePath: string): Promise<Uint8Array> {
    const response = await fetch(`${this.baseUrl}/download?path=${encodeURIComponent(remotePath)}`);
    if (!response.ok) {
      throw new Error(`download failed for ${remotePath}: ${response.status}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  async scanTree(rootPath: string): Promise<TreeEntry[]> {
    const entries: TreeEntry[] = [];
    const queue = [rootPath];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      const items = await this.listDir(current);
      for (const item of items) {
        const fullPath = joinRemotePath(current, item.name);
        const relativePath = fullPath.slice(rootPath.length).replace(/^\/+/, "");
        if (isTrashRelativePath(relativePath)) {
          continue;
        }

        if (item.isDirectory) {
          entries.push({
            path: fullPath,
            relativePath,
            isDirectory: true,
            size: item.size
          });
          queue.push(fullPath);
        } else {
          entries.push({
            path: fullPath,
            relativePath,
            isDirectory: false,
            size: item.size
          });
        }
      }
    }

    return entries;
  }
}
