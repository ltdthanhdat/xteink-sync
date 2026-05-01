import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import type { BaselineEntry, SyncProfile, SyncRunRecord, SyncRunSummary } from "../types.js";

const defaultDbPath = path.join(process.cwd(), ".xteink-sync", "state.db");
const normalizeMode = (mode: string): SyncProfile["mode"] => (mode === "dry-run" ? "bidirectional" : (mode as SyncProfile["mode"]));

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
    `);

    try {
      this.db.exec(`ALTER TABLE sync_entries ADD COLUMN hash TEXT NOT NULL DEFAULT '';`);
    } catch {
      // Column already exists on subsequent runs.
    }
  }

  upsertProfile(profile: SyncProfile): void {
    const now = new Date().toISOString();
    this.db
      .query(`
        INSERT INTO sync_profiles (name, base_url, local_root, remote_root, mode, created_at, updated_at)
        VALUES (@name, @baseUrl, @localRoot, @remoteRoot, @mode, @now, @now)
        ON CONFLICT(name) DO UPDATE SET
          base_url = excluded.base_url,
          local_root = excluded.local_root,
          remote_root = excluded.remote_root,
          mode = excluded.mode,
          updated_at = excluded.updated_at
      `)
      .run({
        name: profile.name,
        baseUrl: profile.baseUrl,
        localRoot: profile.localRoot,
        remoteRoot: profile.remoteRoot,
        mode: normalizeMode(profile.mode),
        now
      });
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
        `SELECT relative_path, size, hash
         FROM sync_entries
         WHERE profile_name = ?
         ORDER BY relative_path`
      )
      .all(profileName) as Array<{ relative_path: string; size: number; hash: string }>;

    return rows.map((row) => ({
      relativePath: row.relative_path,
      size: row.size,
      hash: row.hash
    }));
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
        insertQuery.run(profileName, entry.relativePath, entry.size, entry.hash, now);
      }
    })();
  }

  deleteProfile(profileName: string): void {
    const deleteProfileQuery = this.db.query(`DELETE FROM sync_profiles WHERE name = ?`);
    const deleteBaselineQuery = this.db.query(`DELETE FROM sync_entries WHERE profile_name = ?`);

    this.db.transaction(() => {
      deleteBaselineQuery.run(profileName);
      deleteProfileQuery.run(profileName);
    })();
  }
}
