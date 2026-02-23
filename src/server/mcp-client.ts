import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import type { BrowserConfig } from "./types.js";

const BROWSER_DATA_DIR = join(homedir(), ".negotiaitor", "browser-data");

function findMcpBin(): { command: string; baseArgs: string[] } {
  // Prefer the locally installed binary over npx to avoid version mismatches and download delays
  const localBin = resolve("node_modules", ".bin", "playwright-mcp");
  if (existsSync(localBin)) {
    return { command: localBin, baseArgs: [] };
  }
  return { command: "npx", baseArgs: ["@playwright/mcp"] };
}

export class MCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async connect(config: BrowserConfig, sessionId: string): Promise<void> {
    const { command, baseArgs } = findMcpBin();
    const args: string[] = [...baseArgs];

    if (config.mode === "cdp" && config.cdpEndpoint) {
      args.push("--cdp-endpoint", config.cdpEndpoint);
    }
    // Launch mode: per-session profile separate from personal Chrome
    if (config.mode === "launch") {
      const sessionDir = join(BROWSER_DATA_DIR, sessionId);
      mkdirSync(sessionDir, { recursive: true });
      args.push("--user-data-dir", sessionDir);
      if (config.headless) {
        args.push("--headless");
      }
    }

    console.log(`[MCP] Spawning: ${command} ${args.join(" ")}`);

    this.transport = new StdioClientTransport({
      command,
      args,
      stderr: "inherit",
      env: {
        ...process.env,
        // Ensure headed mode works on Linux
        DISPLAY: process.env.DISPLAY || ":0",
      },
    });

    this.client = new Client(
      { name: "negotiAItor", version: "0.1.0" },
    );

    await this.client.connect(this.transport);
    console.log("[MCP] Connected successfully");
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.transport = null;
    }
  }

  private ensureConnected(): Client {
    if (!this.client) {
      throw new Error("MCP client is not connected");
    }
    return this.client;
  }

  async navigate(url: string): Promise<void> {
    const client = this.ensureConnected();
    await client.callTool({ name: "browser_navigate", arguments: { url } });
  }

  async snapshot(): Promise<string> {
    const client = this.ensureConnected();
    const result = await client.callTool({ name: "browser_snapshot", arguments: {} });
    const textContent = result.content;
    if (Array.isArray(textContent)) {
      const text = textContent
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      return text;
    }
    return String(textContent);
  }

  async click(ref: string): Promise<void> {
    const client = this.ensureConnected();
    await client.callTool({ name: "browser_click", arguments: { ref } });
  }

  async type(ref: string, text: string): Promise<void> {
    const client = this.ensureConnected();
    await client.callTool({ name: "browser_type", arguments: { ref, text } });
  }

  async pressKey(key: string): Promise<void> {
    const client = this.ensureConnected();
    await client.callTool({ name: "browser_press_key", arguments: { key } });
  }

  async screenshot(): Promise<string> {
    const client = this.ensureConnected();
    const result = await client.callTool({ name: "browser_screenshot", arguments: {} });
    const imageContent = result.content;
    if (Array.isArray(imageContent)) {
      const img = imageContent.find(
        (block): block is { type: "image"; data: string; mimeType: string } =>
          block.type === "image"
      );
      if (img) return img.data;
    }
    return "";
  }
}
