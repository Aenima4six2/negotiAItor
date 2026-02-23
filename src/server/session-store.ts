import Database from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import type {
  SavedSession,
  SavedSessionSummary,
  NegotiationConfig,
  NegotiationState,
  ChatMessage,
} from "./types.js";

const DB_PATH = join(process.cwd(), "data", "negotiaitor.db");

export class SessionStore {
  private db!: Database.Database;

  async init(): Promise<void> {
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        config TEXT NOT NULL,
        llm_config TEXT NOT NULL,
        browser_config TEXT NOT NULL,
        messages TEXT NOT NULL,
        summary TEXT,
        final_state TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER NOT NULL
      )
    `);

    // Migration: add name column for existing databases
    try {
      this.db.exec(`ALTER TABLE sessions ADD COLUMN name TEXT NOT NULL DEFAULT ''`);
    } catch {
      // Column already exists — ignore
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  getAllSettings(): Record<string, string> {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
  }

  async save(session: SavedSession): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO sessions
         (id, name, url, config, llm_config, browser_config, messages, summary, final_state, started_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        session.id,
        session.name,
        session.url,
        JSON.stringify(session.config),
        JSON.stringify(session.llmConfig),
        JSON.stringify(session.browserConfig),
        JSON.stringify(session.messages),
        session.summary,
        session.finalState,
        session.startedAt,
        session.endedAt,
      );
  }

  async list(): Promise<SavedSessionSummary[]> {
    const rows = this.db
      .prepare(
        `SELECT id, name, url, config, messages, summary, final_state, started_at, ended_at
         FROM sessions ORDER BY started_at DESC`,
      )
      .all() as Array<{
      id: string;
      name: string;
      url: string;
      config: string;
      messages: string;
      summary: string | null;
      final_state: string;
      started_at: number;
      ended_at: number;
    }>;

    return rows.map((row) => {
      const config = JSON.parse(row.config) as NegotiationConfig;
      const messages = JSON.parse(row.messages) as ChatMessage[];
      return {
        id: row.id,
        name: row.name,
        url: row.url,
        serviceProvider: config.serviceProvider,
        messageCount: messages.length,
        summary: row.summary,
        finalState: row.final_state as NegotiationState,
        startedAt: row.started_at,
        endedAt: row.ended_at,
      };
    });
  }

  async load(id: string): Promise<SavedSession | null> {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
      | {
          id: string;
          name: string;
          url: string;
          config: string;
          llm_config: string;
          browser_config: string;
          messages: string;
          summary: string | null;
          final_state: string;
          started_at: number;
          ended_at: number;
        }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      url: row.url,
      config: JSON.parse(row.config),
      llmConfig: JSON.parse(row.llm_config),
      browserConfig: JSON.parse(row.browser_config),
      messages: JSON.parse(row.messages),
      summary: row.summary,
      finalState: row.final_state as NegotiationState,
      startedAt: row.started_at,
      endedAt: row.ended_at,
    };
  }

  async rename(id: string, name: string): Promise<boolean> {
    const result = this.db.prepare("UPDATE sessions SET name = ? WHERE id = ?").run(name, id);
    return result.changes > 0;
  }

  async remove(id: string): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return result.changes > 0;
  }
}
