import { spawn } from "node:child_process";
import type { LLMConfig } from "../types.js";
import type { LLMProvider, ToolDefinition, StructuredResponse } from "./types.js";

const TIMEOUT_MS = 90_000;

const RESPONSE_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    response: { type: "string", description: "Your complete response" },
  },
  required: ["response"],
});

function log(msg: string, data?: unknown) {
  const ts = new Date().toISOString().slice(11, 23);
  if (data !== undefined) {
    console.log(`[${ts}] [ClaudeCode] ${msg}`, typeof data === "string" ? data.slice(0, 200) : data);
  } else {
    console.log(`[${ts}] [ClaudeCode] ${msg}`);
  }
}

export class ClaudeCodeProvider implements LLMProvider {
  private model: string;

  constructor(config: LLMConfig) {
    this.model = config.model;
    log(`Initialized with model=${config.model}`);
  }

  async chat(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
  ): Promise<string> {
    const prompt = this.buildPrompt(systemPrompt, messages);

    log(`Calling claude --print (prompt: ${prompt.length} chars, model: ${this.model})`);
    const t0 = Date.now();

    const args = [
      "--print",
      "--model", this.model,
      "--output-format", "json",
      "--json-schema", RESPONSE_SCHEMA,
      "--no-session-persistence",
      prompt,
    ];

    const raw = await this.exec(args);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    log(`Response received in ${elapsed}s (${raw.length} chars)`);

    return this.extractChatResponse(raw);
  }

  async chatWithTools(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    tools: ToolDefinition[],
  ): Promise<StructuredResponse> {
    const tool = tools[0];
    const prompt = this.buildPrompt(systemPrompt, messages);
    const schema = JSON.stringify(tool.parameters);

    log(`Calling claude --print with tool schema for "${tool.name}" (prompt: ${prompt.length} chars)`);
    const t0 = Date.now();

    const args = [
      "--print",
      "--model", this.model,
      "--output-format", "json",
      "--json-schema", schema,
      "--no-session-persistence",
      prompt,
    ];

    const raw = await this.exec(args);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    log(`Tool response received in ${elapsed}s (${raw.length} chars)`);

    try {
      const envelope = JSON.parse(raw);
      if (envelope.total_cost_usd) {
        log(`Cost: $${envelope.total_cost_usd.toFixed(4)}`);
      }

      const output = envelope.structured_output ?? envelope.result;
      if (output && typeof output === "object") {
        log(`Extracted structured tool args`, output);
        return { type: "tool_call", call: { name: tool.name, args: output as Record<string, unknown> } };
      }

      // If structured_output is a string, try to parse it
      if (typeof output === "string") {
        const parsed = JSON.parse(output) as Record<string, unknown>;
        return { type: "tool_call", call: { name: tool.name, args: parsed } };
      }

      log("WARNING: No usable structured output in envelope", Object.keys(envelope));
    } catch (e) {
      log(`WARNING: Failed to parse tool response: ${e}`);
    }

    return { type: "text", text: raw };
  }

  private buildPrompt(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
  ): string {
    const parts: string[] = [`[System]\n${systemPrompt}`];
    for (const msg of messages) {
      const label = msg.role === "user" ? "User" : "Assistant";
      parts.push(`[${label}]\n${msg.content}`);
    }
    return parts.join("\n\n");
  }

  private extractChatResponse(raw: string): string {
    // --output-format json wraps everything in an envelope:
    // { "type": "result", "structured_output": { "response": "..." }, ... }
    try {
      const envelope = JSON.parse(raw);
      if (envelope.structured_output?.response) {
        const result = envelope.structured_output.response;
        log(`Extracted structured_output.response`, result);
        if (envelope.total_cost_usd) {
          log(`Cost: $${envelope.total_cost_usd.toFixed(4)}`);
        }
        return result;
      }
      if (envelope.result) {
        log(`Fell back to .result`, envelope.result);
        return envelope.result;
      }
      log("WARNING: No structured_output or result in envelope", Object.keys(envelope));
    } catch (e) {
      log(`WARNING: Failed to parse JSON envelope: ${e}`);
    }
    log("Returning raw response");
    return raw;
  }

  private exec(args: string[]): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn("claude", args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          CLAUDECODE: "",
        },
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        log(`TIMEOUT after ${TIMEOUT_MS / 1000}s`);
        reject(new Error("Claude Code CLI timed out"));
      }, TIMEOUT_MS);

      child.on("close", (code) => {
        clearTimeout(timer);
        const text = stdout.trim();
        if (code !== 0) {
          log(`CLI exited with code ${code}`, stderr.slice(0, 200));
          reject(new Error(`Claude Code CLI exited ${code}: ${stderr}`));
        } else if (!text) {
          log("CLI returned empty stdout");
          reject(new Error("Empty response from Claude Code CLI"));
        } else {
          resolve(text);
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        log(`Spawn error: ${err.message}`);
        reject(new Error(`Claude Code CLI spawn error: ${err.message}`));
      });
    });
  }
}
