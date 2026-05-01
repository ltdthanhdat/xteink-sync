import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { planActions } from "./sync-engine.js";
import type { BaselineEntry, TombstoneEntry, TreeEntry } from "../types.js";

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
  relativePath
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
    const actions = await planActions([], [makeRemoteFile("book.epub", Buffer.byteLength("baseline"))], baseline, [], "bidirectional", {
      downloadBytes: async () => new Uint8Array(Buffer.from("baseline"))
    }, "/");

    expect(actions).toEqual([
      {
        path: "book.epub",
        kind: "remote-delete",
        reason: "propagate local delete to remote from trusted baseline",
        remoteSize: Buffer.byteLength("baseline"),
        tombstoneSide: "local"
      }
    ]);
  });

  it("propagates delete in bidirectional mode when only the path is tracked", async () => {
    const baseline = [makeBaseline("book.epub", "old-text")];
    const actions = await planActions([], [makeRemoteFile("book.epub", 99)], baseline, [], "bidirectional", {
      downloadBytes: async () => new Uint8Array(Buffer.from("new-text"))
    }, "/");

    expect(actions).toEqual([
      {
        path: "book.epub",
        kind: "remote-delete",
        reason: "propagate local delete to remote from trusted baseline",
        remoteSize: 99,
        tombstoneSide: "local"
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
        localSize: Buffer.byteLength("baseline")
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
    const actions = await planActions([], [makeRemoteFile("book.epub", Buffer.byteLength("baseline"))], baseline, tombstones, "bidirectional", {
      downloadBytes: async () => new Uint8Array(Buffer.from("baseline"))
    }, "/");

    expect(actions[0]?.kind).toBe("remote-delete");
    expect(actions[0]?.reason).toBe("pending tombstone from local delete");
  });

  it("treats same-path files as unchanged once they exist in baseline", async () => {
    const root = makeTempRoot();
    const localEntry = makeLocalFile(root, "book.epub", "local-text");
    const baseline = [makeBaseline("book.epub", "other-text")];

    const actions = await planActions([localEntry], [makeRemoteFile("book.epub", 999)], baseline, [], "bidirectional", {
      downloadBytes: async () => {
        throw new Error("planner should not fetch remote file contents");
      }
    }, "/");

    expect(actions[0]?.kind).toBe("skip");
    expect(actions[0]?.reason).toBe("same path still exists on both sides since baseline");
  });
});
