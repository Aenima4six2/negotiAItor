import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatMessage,
  ClientMessage,
  NegotiationState,
  NegotiationConfig,
  LLMConfig,
  BrowserConfig,
  ApprovalRequest,
  ServerMessage,
  SavedSession,
  SavedSessionSummary,
} from "../types.js";

const WS_URL = "ws://localhost:3000/ws";
const MAX_BACKOFF = 10000;

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [negotiationState, setNegotiationState] =
    useState<NegotiationState>("idle");
  const [approvalRequest, setApprovalRequest] =
    useState<ApprovalRequest | null>(null);
  const [agentThinking, setAgentThinking] = useState<string | null>(null);
  const [researchResult, setResearchResult] = useState<{
    query: string;
    findings: string;
  } | null>(null);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [refinedMessage, setRefinedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Session persistence state
  const [sessions, setSessions] = useState<SavedSessionSummary[]>([]);
  const [viewingSession, setViewingSession] = useState<SavedSession | null>(null);

  // Settings
  const [settings, setSettings] = useState<Record<string, string>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(500);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      backoffRef.current = 500;
      // Fetch settings on connect
      ws.send(JSON.stringify({ type: "get_settings" }));
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      reconnectTimerRef.current = setTimeout(() => {
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
        connect();
      }, backoffRef.current);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        setLastMessage(msg);

        switch (msg.type) {
          case "chat_update":
            setMessages(msg.messages);
            setAgentThinking(null);
            break;
          case "approval_required":
            setApprovalRequest(msg.request);
            break;
          case "agent_thinking":
            setAgentThinking(msg.thinking);
            break;
          case "agent_unsure":
            setAgentThinking(null);
            // Message is already added server-side via addMessage/chat_update
            break;
          case "status_update":
            setNegotiationState(msg.state);
            if (msg.state !== "awaiting_approval") {
              setApprovalRequest(null);
            }
            break;
          case "research_result":
            setResearchResult({
              query: msg.query,
              findings: msg.findings,
            });
            break;
          case "session_summary":
            setSessionSummary(msg.summary);
            break;
          case "sessions_list":
            setSessions(msg.sessions);
            break;
          case "session_loaded":
            setViewingSession(msg.session);
            break;
          case "session_deleted":
            setSessions((prev) => prev.filter((s) => s.id !== msg.sessionId));
            if (viewingSession?.id === msg.sessionId) {
              setViewingSession(null);
            }
            break;
          case "session_renamed":
            setSessions((prev) =>
              prev.map((s) => s.id === msg.sessionId ? { ...s, name: msg.name } : s),
            );
            if (viewingSession?.id === msg.sessionId) {
              setViewingSession((prev) => prev ? { ...prev, name: msg.name } : prev);
            }
            break;
          case "message_refined":
            setRefinedMessage(msg.text);
            break;
          case "settings_loaded":
            setSettings(msg.settings);
            break;
          case "error":
            setError(msg.message);
            break;
        }
      } catch {
        // Ignore unparseable messages
      }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setLastMessage(null);
    setNegotiationState("idle");
    setApprovalRequest(null);
    setAgentThinking(null);
    setRefinedMessage(null);
    setResearchResult(null);
    setSessionSummary(null);
    setError(null);
    setViewingSession(null);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setAgentThinking(null);
    setResearchResult(null);
    setError(null);
  }, []);

  const clearRefinedMessage = useCallback(() => {
    setRefinedMessage(null);
  }, []);

  // Session persistence methods
  const listSessions = useCallback(() => {
    send({ type: "list_sessions" });
  }, [send]);

  const loadSession = useCallback((id: string) => {
    send({ type: "load_session", sessionId: id });
  }, [send]);

  const deleteSession = useCallback((id: string) => {
    send({ type: "delete_session", sessionId: id });
  }, [send]);

  const renameSession = useCallback((id: string, name: string) => {
    send({ type: "rename_session", sessionId: id, name });
  }, [send]);

  const continueSession = useCallback(
    (id: string, config: NegotiationConfig, llm: LLMConfig, browser: BrowserConfig) => {
      send({ type: "continue_session", sessionId: id, config, llm, browser });
    },
    [send],
  );

  const clearViewingSession = useCallback(() => {
    setViewingSession(null);
  }, []);

  const saveSetting = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    send({ type: "save_setting", key, value });
  }, [send]);

  return {
    connected,
    lastMessage,
    messages,
    negotiationState,
    approvalRequest,
    agentThinking,
    researchResult,
    sessionSummary,
    error,
    send,
    reset,
    clearMessages,
    refinedMessage,
    clearRefinedMessage,
    // Session persistence
    sessions,
    viewingSession,
    listSessions,
    loadSession,
    deleteSession,
    renameSession,
    continueSession,
    clearViewingSession,
    // Settings
    settings,
    saveSetting,
  };
}
