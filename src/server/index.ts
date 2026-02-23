import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { MCPClient } from "./mcp-client.js";
import { ChatObserver } from "./chat-observer.js";
import { NegotiationAgent } from "./negotiation-agent.js";
import { createProvider } from "./llm/router.js";
import { SessionStore } from "./session-store.js";
import { refineMessagePrompt } from "./prompts/refine-message.js";
import type {
  ClientMessage,
  ServerMessage,
  NegotiationConfig,
  LLMConfig,
  BrowserConfig,
  SavedLLMConfig,
  SavedSession,
} from "./types.js";

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

// --- Session store ---
const sessionStore = new SessionStore();

// --- Active session state ---
let mcpClient: MCPClient | null = null;
let observer: ChatObserver | null = null;
let agent: NegotiationAgent | null = null;
const clients = new Set<WebSocket>();

// --- Active session metadata (for persistence) ---
let activeSessionId: string | null = null;
let activeSessionStartedAt: number | null = null;
let activeSessionUrl: string | null = null;
let activeSessionConfig: NegotiationConfig | null = null;
let activeLLMConfig: SavedLLMConfig | null = null;
let activeBrowserConfig: BrowserConfig | null = null;

// --- Auto-save debounce ---
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
const AUTO_SAVE_DEBOUNCE_MS = 5000;

// --- Broadcast to all connected UI clients ---
function broadcast(msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }

  // Auto-save draft on chat updates
  if (msg.type === "chat_update" && activeSessionId && agent) {
    scheduleAutoSave();
  }
}

function scheduleAutoSave(): void {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    if (!agent || !activeSessionId) return;
    try {
      const draft: SavedSession = {
        id: activeSessionId!,
        name: activeSessionConfig!.sessionName,
        url: activeSessionUrl!,
        config: agent.getConfig(),
        llmConfig: activeLLMConfig!,
        browserConfig: activeBrowserConfig!,
        messages: agent.getConversation(),
        summary: null,
        finalState: "idle",
        startedAt: activeSessionStartedAt!,
        endedAt: Date.now(),
      };
      await sessionStore.save(draft);
      console.log(`[Session] Auto-saved draft ${activeSessionId}`);
    } catch (err) {
      console.error("[Session] Auto-save failed:", err);
    }
  }, AUTO_SAVE_DEBOUNCE_MS);
}

function stripApiKey(llm: LLMConfig): SavedLLMConfig {
  return {
    provider: llm.provider,
    model: llm.model,
    baseUrl: llm.baseUrl,
    temperature: llm.temperature,
    maxTokens: llm.maxTokens,
  };
}

function setActiveMetadata(
  url: string,
  config: NegotiationConfig,
  llm: LLMConfig,
  browser: BrowserConfig,
): void {
  activeSessionId = randomUUID();
  activeSessionStartedAt = Date.now();
  activeSessionUrl = url;
  activeSessionConfig = config;
  activeLLMConfig = stripApiKey(llm);
  activeBrowserConfig = browser;
}

function clearActiveMetadata(): void {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = null;
  activeSessionId = null;
  activeSessionStartedAt = null;
  activeSessionUrl = null;
  activeSessionConfig = null;
  activeLLMConfig = null;
  activeBrowserConfig = null;
}

// --- WebSocket handling ---
wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected (${clients.size} total)`);

  // Send current state on connect
  if (agent) {
    ws.send(JSON.stringify({ type: "status_update", state: "negotiating" } satisfies ServerMessage));
  } else {
    ws.send(JSON.stringify({ type: "status_update", state: "idle" } satisfies ServerMessage));
  }

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as ClientMessage;
      await handleClientMessage(msg);
    } catch (err) {
      console.error("[WS] Error handling message:", err);
      ws.send(JSON.stringify({ type: "error", message: String(err) } satisfies ServerMessage));
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected (${clients.size} total)`);
  });
});

// --- Client message handler ---
async function handleClientMessage(msg: ClientMessage): Promise<void> {
  switch (msg.type) {
    case "start_negotiation": {
      if (agent) {
        broadcast({ type: "error", message: "Negotiation already in progress" });
        return;
      }

      try {
        // Track metadata for persistence
        setActiveMetadata(msg.url, msg.config, msg.llm, msg.browser);

        // Create MCP client and connect to browser
        mcpClient = new MCPClient();
        await mcpClient.connect(msg.browser, activeSessionId!);

        // Create LLM provider
        const llm = createProvider(msg.llm);

        // Create observer (heuristic extraction — no LLM, runs every 3s)
        observer = new ChatObserver(mcpClient);

        // Create negotiation agent
        agent = new NegotiationAgent(mcpClient, observer, llm, msg.config, broadcast);

        // Start negotiation
        await agent.start(msg.url);
        console.log(`[Agent] Negotiation started at ${msg.url}`);
      } catch (err) {
        broadcast({ type: "error", message: `Failed to start: ${String(err)}` });
        await cleanup();
      }
      break;
    }

    case "stop_negotiation": {
      if (agent) {
        const summary = await agent.stop();
        console.log("[Agent] Negotiation stopped by user");

        // Save completed session
        if (activeSessionId) {
          const saved: SavedSession = {
            id: activeSessionId,
            name: activeSessionConfig!.sessionName,
            url: activeSessionUrl!,
            config: agent.getConfig(),
            llmConfig: activeLLMConfig!,
            browserConfig: activeBrowserConfig!,
            messages: agent.getConversation(),
            summary,
            finalState: "done",
            startedAt: activeSessionStartedAt!,
            endedAt: Date.now(),
          };
          await sessionStore.save(saved);
          console.log(`[Session] Saved completed session ${activeSessionId}`);
        }
      }
      await cleanup();
      break;
    }

    case "pause_negotiation": {
      if (agent) {
        agent.pause();
        console.log("[Agent] Negotiation paused by user");
      }
      break;
    }

    case "resume_negotiation": {
      if (agent) {
        await agent.resume();
        console.log("[Agent] Negotiation resumed by user");
      }
      break;
    }

    case "approve_commitment": {
      if (agent) {
        agent.handleApproval(msg.requestId);
      }
      break;
    }

    case "reject_commitment": {
      if (agent) {
        agent.handleRejection(msg.requestId, msg.directive);
      }
      break;
    }

    case "user_directive": {
      if (agent) {
        agent.handleUserDirective(msg.text);
      }
      break;
    }

    case "user_override": {
      if (agent) {
        await agent.handleUserOverride(msg.text);
      }
      break;
    }

    case "user_typing": {
      if (agent) {
        agent.handleUserTyping();
      }
      break;
    }

    case "config_update": {
      // Config updates during an active session are stored for next session
      console.log("[Config] Update received:", msg);
      break;
    }

    case "list_sessions": {
      const sessions = await sessionStore.list();
      broadcast({ type: "sessions_list", sessions });
      break;
    }

    case "load_session": {
      const session = await sessionStore.load(msg.sessionId);
      if (session) {
        broadcast({ type: "session_loaded", session });
      } else {
        broadcast({ type: "error", message: "Session not found" });
      }
      break;
    }

    case "delete_session": {
      const removed = await sessionStore.remove(msg.sessionId);
      if (removed) {
        broadcast({ type: "session_deleted", sessionId: msg.sessionId });
      } else {
        broadcast({ type: "error", message: "Failed to delete session" });
      }
      break;
    }

    case "rename_session": {
      const renamed = await sessionStore.rename(msg.sessionId, msg.name);
      if (renamed) {
        broadcast({ type: "session_renamed", sessionId: msg.sessionId, name: msg.name });
      } else {
        broadcast({ type: "error", message: "Failed to rename session" });
      }
      break;
    }

    case "update_session_name": {
      if (activeSessionConfig) {
        activeSessionConfig.sessionName = msg.name;
      }
      if (activeSessionId) {
        await sessionStore.rename(activeSessionId, msg.name);
        broadcast({ type: "session_renamed", sessionId: activeSessionId, name: msg.name });
      }
      break;
    }

    case "refine_message": {
      try {
        const llm = createProvider(msg.llm);
        const refined = await llm.chat(
          refineMessagePrompt(msg.negotiation),
          [{ role: "user", content: msg.text }],
        );
        broadcast({ type: "message_refined", text: refined.trim() });
      } catch (err) {
        broadcast({ type: "error", message: `Refine failed: ${String(err)}` });
      }
      break;
    }

    case "continue_session": {
      if (agent) {
        broadcast({ type: "error", message: "Negotiation already in progress" });
        return;
      }

      const prevSession = await sessionStore.load(msg.sessionId);
      if (!prevSession) {
        broadcast({ type: "error", message: "Session not found" });
        return;
      }

      try {
        // Reuse the existing session ID and start time instead of creating a new entry
        activeSessionId = prevSession.id;
        activeSessionStartedAt = prevSession.startedAt;
        activeSessionUrl = prevSession.url;
        activeSessionConfig = {
          ...msg.config,
          sessionName: msg.config.sessionName || prevSession.name,
        };
        activeLLMConfig = stripApiKey(msg.llm);
        activeBrowserConfig = msg.browser;

        mcpClient = new MCPClient();
        await mcpClient.connect(msg.browser, activeSessionId!);

        const llm = createProvider(msg.llm);
        observer = new ChatObserver(mcpClient);

        // Create agent with prior conversation history (strip summary messages)
        const priorMessages = prevSession.messages.filter(
          (m) => !(m.sender === "system" && m.text.startsWith("__SUMMARY__\n")),
        );
        agent = new NegotiationAgent(
          mcpClient,
          observer,
          llm,
          msg.config,
          broadcast,
          priorMessages,
        );

        await agent.start(prevSession.url);
        // Start in paused mode so the user can review before the agent acts
        agent.startPaused("negotiating");
        console.log(`[Agent] Continued session ${msg.sessionId} at ${prevSession.url} (paused)`);
      } catch (err) {
        broadcast({ type: "error", message: `Failed to continue: ${String(err)}` });
        await cleanup();
      }
      break;
    }

    case "get_settings": {
      const settings = sessionStore.getAllSettings();
      broadcast({ type: "settings_loaded", settings });
      break;
    }

    case "save_setting": {
      sessionStore.setSetting(msg.key, msg.value);
      break;
    }
  }
}

// --- Cleanup ---
async function cleanup(): Promise<void> {
  if (observer) {
    observer.stop();
    observer.removeAllListeners();
    observer = null;
  }
  if (mcpClient) {
    try {
      await mcpClient.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    mcpClient = null;
  }
  agent = null;
  clearActiveMetadata();
  broadcast({ type: "status_update", state: "idle" });
}

// --- REST fallback endpoints ---
app.get("/api/status", (_req, res) => {
  res.json({ state: agent ? "negotiating" : "idle" });
});

app.post("/api/stop", async (_req, res) => {
  if (agent) await agent.stop();
  await cleanup();
  res.json({ ok: true });
});

// --- Serve built UI (production) ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiDist = path.resolve(__dirname, "../ui");
app.use(express.static(uiDist));
app.get("{*path}", (_req, res) => {
  res.sendFile(path.join(uiDist, "index.html"));
});

// --- Start server ---
async function main(): Promise<void> {
  await sessionStore.init();
  server.listen(PORT, () => {
    console.log(`[negotiAItor] Server running on http://localhost:${PORT}`);
    console.log(`[negotiAItor] WebSocket available at ws://localhost:${PORT}/ws`);
  });
}

main().catch((err) => {
  console.error("[negotiAItor] Fatal:", err);
  process.exit(1);
});
