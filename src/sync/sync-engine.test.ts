import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "bun:test";
import { planActions } from "./sync-engine.js";
import type { BaselineEntry, TombstoneEntry, TreeEntry } from "../types.js";

const sha256 = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");

const tempRoots: string[] = [];

const makeTempRoot = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "xteink-sync-test-"));
  tempRoots.push(root);
  return root;
};

const makeLocalFile = (root: string, relativePath: string, content: string): TreeEntry => {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  return {
    path: fullPath,
    relativePath,
    isDirectory: false,
    size: Buffer.byteLength(content)
  };
};

const makeRemoteFile = (relativePath: string, size: number): TreeEntry => ({
  path: `/${relativePath}`,
  relativePath,
  isDirectory: false,
  size
});

const makeBaseline = (relativePath: string, content: string): BaselineEntry => ({
  relativePath,
  size: Buffer.byteLength(content),
  hash: sha256(content)
});

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("planActions delete policy", () => {
  it("does not infer delete on first run", async () => {
    const actions = await planActions([], [makeRemoteFile("book.epub", 10)], [], [], "bidirectional", {
      downloadBytes: async () => new Uint8Array()
    }, "/");

    expect(actions).toEqual([
      {
        path: "book.epub",
        kind: "download",
        reason: "remote-only file on first run",
        remoteSize: 10
      }
    ]);
  });

  it("propagates a trusted local delete to remote in bidirectional mode", async () => {
    const baseline = [makeBaseline("book.epub", "baseline")];
    const actions = await planActions([], [makeRemoteFile("book.epub", baseline[0].size)], baseline, [], "bidirectional", {
      downloadBytes: async () => new Uint8Array(Buffer.from("baseline"))
    }, "/");

    expect(actions).toEqual([
      {
        path: "book.epub",
        kind: "remote-soft-delete",
        reason: "propagate local delete to remote from trusted baseline",
        remoteSize: baseline[0].size,
        tombstoneSide: "local"
      }
    ]);
  });

  it("treats delete-vs-modify as conflict in bidirectional mode", async () => {
    const baseline = [makeBaseline("book.epub", "old-text")];
    const actions = await planActions([], [makeRemoteFile("book.epub", 99)], baseline, [], "bidirectional", {
      downloadBytes: async () => new Uint8Array(Buffer.from("new-text"))
    }, "/");

    expect(actions).toEqual([
      {
        path: "book.epub",
        kind: "conflict",
        reason: "delete vs modify conflict: local missing but remote changed since baseline",
        remoteSize: 99
      }
    ]);
  });

  it("restores remote drift instead of deleting in push-only mode", async () => {
    const root = makeTempRoot();
    const localEntry = makeLocalFile(root, "book.epub", "baseline");
    const baseline = [makeBaseline("book.epub", "baseline")];
    const actions = await planActions([localEntry], [], baseline, [], "push-only", {
      downloadBytes: async () => new Uint8Array()
    }, "/");

    expect(actions).toEqual([
      {
        path: "book.epub",
        kind: "upload",
        reason: "restore remote file from local baseline in push-only mode",
        localSize: baseline[0].size
      }
    ]);
  });

  it("replays pending tombstones on the next run", async () => {
    const tombstones: TombstoneEntry[] = [
      {
        profileName: "default",
        relativePath: "book.epub",
        deletedOn: "local",
        status: "pending",
        createdAt: new Date().toISOString(),
        resolvedAt: null
      }
    ];

    const baseline = [makeBaseline("book.epub", "baseline")];
    const actions = await planActions([], [makeRemoteFile("book.epub", baseline[0].size)], baseline, tombstones, "bidirectional", {
      downloadBytes: async () => new Uint8Array(Buffer.from("baseline"))
    }, "/");

    expect(actions[0]?.kind).toBe("remote-soft-delete");
    expect(actions[0]?.reason).toBe("pending tombstone from local delete");
  });
});
