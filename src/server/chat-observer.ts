import { EventEmitter } from "node:events";
import type { MCPClient } from "./mcp-client.js";

function log(msg: string, data?: unknown) {
  const ts = new Date().toISOString().slice(11, 23);
  if (data !== undefined) {
    console.log(`[${ts}] [Observer] ${msg}`, typeof data === "string" ? data.slice(0, 150) : data);
  } else {
    console.log(`[${ts}] [Observer] ${msg}`);
  }
}

/**
 * Polls the browser accessibility snapshot and emits a "snapshot_changed"
 * event whenever the page content changes. No message extraction — the
 * LLM handles that.
 */
export class ChatObserver extends EventEmitter {
  private mcp: MCPClient;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pollIntervalMs: number;
  private lastSnapshotHash = "";
  private polling = false;

  constructor(mcp: MCPClient, pollIntervalMs = 5000) {
    super();
    this.mcp = mcp;
    this.pollIntervalMs = pollIntervalMs;
  }

  start(): void {
    if (this.timer) return;
    log("Started polling");
    this.poll();
    this.timer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      log("Stopped polling");
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;

    try {
      const snapshot = await this.mcp.snapshot();

      const hash = simpleHash(snapshot);
      if (hash === this.lastSnapshotHash) return;
      this.lastSnapshotHash = hash;

      log(`Snapshot changed (${snapshot.length} chars)`);
      this.emit("snapshot_changed", snapshot);
    } catch (err) {
      log("Poll error", String(err));
      this.emit("error", err);
    } finally {
      this.polling = false;
    }
  }
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return String(hash);
}
