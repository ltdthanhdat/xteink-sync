import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import type { BaselineEntry, SyncProfile, SyncRunRecord, SyncRunSummary, TombstoneEntry, TombstoneSide } from "../types.js";

const defaultDbPath = path.join(process.cwd(), ".xteink-sync", "state.db");
const normalizeMode = (mode: string): SyncProfile["mode"] => (mode === "dry-run" ? "bidirectional" : (mode as SyncProfile["mode"]));
const normalizeRequiredText = (value: string | undefined, fieldName: string): string => {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Invalid ${fieldName}: expected non-empty text`);
  }

  return normalized;
};

export class SqliteStateStore {
  private readonly db: Database;

  constructor(dbPath = defaultDbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        base_url TEXT NOT NULL,
        local_root TEXT NOT NULL,
        remote_root TEXT NOT NULL,
        mode TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_name TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        status TEXT NOT NULL,
        summary_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_entries (
        profile_name TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        size INTEGER NOT NULL,
        hash TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile_name, relative_path)
      );

      CREATE TABLE IF NOT EXISTS sync_tombstones (
        profile_name TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        deleted_on TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        PRIMARY KEY (profile_name, relative_path)
      );
    `);

    try {
      this.db.exec(`ALTER TABLE sync_entries ADD COLUMN hash TEXT NOT NULL DEFAULT '';`);
    } catch {
      // Column already exists on subsequent runs.
    }
  }

  upsertProfile(profile: SyncProfile): void {
    const now = new Date().toISOString();
    const name = normalizeRequiredText(profile.name, "profile name");
    const baseUrl = normalizeRequiredText(profile.baseUrl, "base URL");
    const localRoot = normalizeRequiredText(profile.localRoot, "local root");
    const remoteRoot = normalizeRequiredText(profile.remoteRoot, "remote root");

    this.db
      .query(`
        INSERT INTO sync_profiles (name, base_url, local_root, remote_root, mode, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          base_url = excluded.base_url,
          local_root = excluded.local_root,
          remote_root = excluded.remote_root,
          mode = excluded.mode,
          updated_at = excluded.updated_at
      `)
      .run(name, baseUrl, localRoot, remoteRoot, normalizeMode(profile.mode), now, now);
  }

  listProfiles(): SyncProfile[] {
    const rows = this.db
      .query(
        `SELECT id, name, base_url, local_root, remote_root, mode, created_at, updated_at
         FROM sync_profiles
         ORDER BY updated_at DESC`
      )
      .all() as Array<{
      id: number;
      name: string;
      base_url: string;
      local_root: string;
      remote_root: string;
      mode: SyncProfile["mode"];
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      localRoot: row.local_root,
      remoteRoot: row.remote_root,
      mode: normalizeMode(row.mode),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  recordRun(profileName: string, status: "success" | "failed", summary: SyncRunSummary, startedAt: string): void {
    this.db
      .query(`
        INSERT INTO sync_runs (profile_name, started_at, finished_at, status, summary_json)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(profileName, startedAt, new Date().toISOString(), status, JSON.stringify(summary));
  }

  listRecentRuns(limit = 10): SyncRunRecord[] {
    const rows = this.db
      .query(
        `SELECT id, profile_name, started_at, finished_at, status, summary_json
         FROM sync_runs
         ORDER BY started_at DESC
         LIMIT ?`
      )
      .all(limit) as Array<{
      id: number;
      profile_name: string;
      started_at: string;
      finished_at: string;
      status: "success" | "failed";
      summary_json: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      profileName: row.profile_name,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      status: row.status,
      summary: JSON.parse(row.summary_json) as SyncRunSummary
    }));
  }

  listBaselineEntries(profileName: string): BaselineEntry[] {
    const rows = this.db
      .query(
        `SELECT relative_path
         FROM sync_entries
         WHERE profile_name = ?
         ORDER BY relative_path`
      )
      .all(profileName) as Array<{ relative_path: string }>;

    return rows.map((row) => ({
      relativePath: row.relative_path
    }));
  }

  listPendingTombstones(profileName: string): TombstoneEntry[] {
    const rows = this.db
      .query(
        `SELECT profile_name, relative_path, deleted_on, status, created_at, resolved_at
         FROM sync_tombstones
         WHERE profile_name = ? AND status = 'pending'
         ORDER BY relative_path`
      )
      .all(profileName) as Array<{
      profile_name: string;
      relative_path: string;
      deleted_on: TombstoneSide;
      status: "pending" | "resolved";
      created_at: string;
      resolved_at: string | null;
    }>;

    return rows.map((row) => ({
      profileName: row.profile_name,
      relativePath: row.relative_path,
      deletedOn: row.deleted_on,
      status: row.status,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at
    }));
  }

  upsertPendingTombstones(profileName: string, tombstones: Array<{ relativePath: string; deletedOn: TombstoneSide }>): void {
    if (tombstones.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const upsertQuery = this.db.query(`
      INSERT INTO sync_tombstones (profile_name, relative_path, deleted_on, status, created_at, resolved_at)
      VALUES (?, ?, ?, 'pending', ?, NULL)
      ON CONFLICT(profile_name, relative_path) DO UPDATE SET
        deleted_on = excluded.deleted_on,
        status = 'pending',
        created_at = excluded.created_at,
        resolved_at = NULL
    `);

    this.db.transaction(() => {
      for (const tombstone of tombstones) {
        upsertQuery.run(profileName, tombstone.relativePath, tombstone.deletedOn, now);
      }
    })();
  }

  resolveTombstones(profileName: string, relativePaths: string[]): void {
    if (relativePaths.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const updateQuery = this.db.query(`
      UPDATE sync_tombstones
      SET status = 'resolved',
          resolved_at = ?
      WHERE profile_name = ? AND relative_path = ?
    `);

    this.db.transaction(() => {
      for (const relativePath of relativePaths) {
        updateQuery.run(now, profileName, relativePath);
      }
    })();
  }

  replaceBaselineEntries(profileName: string, entries: BaselineEntry[]): void {
    const now = new Date().toISOString();
    const deleteQuery = this.db.query(`DELETE FROM sync_entries WHERE profile_name = ?`);
    const insertQuery = this.db.query(`
      INSERT INTO sync_entries (profile_name, relative_path, size, hash, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.db.transaction(() => {
      deleteQuery.run(profileName);
      for (const entry of entries) {
        insertQuery.run(profileName, entry.relativePath, 0, "", now);
      }
    })();
  }

  deleteProfile(profileName: string): void {
    const deleteProfileQuery = this.db.query(`DELETE FROM sync_profiles WHERE name = ?`);
    const deleteBaselineQuery = this.db.query(`DELETE FROM sync_entries WHERE profile_name = ?`);
    const deleteTombstonesQuery = this.db.query(`DELETE FROM sync_tombstones WHERE profile_name = ?`);

    this.db.transaction(() => {
      deleteBaselineQuery.run(profileName);
      deleteTombstonesQuery.run(profileName);
      deleteProfileQuery.run(profileName);
    })();
  }
}
