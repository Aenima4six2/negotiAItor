import { useCallback, useEffect, useState } from "react";
import { useWebSocket } from "./hooks/useWebSocket.js";
import { NegotiationFeed } from "./components/NegotiationFeed.js";
import { ApprovalBanner } from "./components/ApprovalBanner.js";
import { StrategyPanel } from "./components/StrategyPanel.js";
import { Controls } from "./components/Controls.js";
import { ConfigPanel } from "./components/ConfigPanel.js";
import { SessionBrowser } from "./components/SessionBrowser.js";
import { MessageInput } from "./components/MessageInput.js";
import { Logo } from "./components/Logo.js";
import { defaultLLMConfig, defaultNegotiationConfig } from "./constants/defaults.js";
import { formatDate } from "./utils/formatDate.js";
import type {
  LLMConfig,
  NegotiationConfig,
  BrowserConfig,
} from "./types.js";

const layoutStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  overflow: "hidden",
};

const topBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "12px 16px",
  borderBottom: "1px solid var(--border-primary)",
  gap: "10px",
  flexShrink: 0,
};

const bodyStyle: React.CSSProperties = {
  display: "flex",
  flex: 1,
  overflow: "hidden",
};

const sidebarStyle: React.CSSProperties = {
  width: "400px",
  minWidth: "400px",
  borderRight: "1px solid var(--border-primary)",
  background: "var(--bg-primary)",
  display: "flex",
  flexDirection: "column",
};

const sidebarScrollStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
};

const sidebarFooterStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderTop: "1px solid var(--border-primary)",
  background: "var(--bg-primary)",
  flexShrink: 0,
};

const mainStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  position: "relative",
};

const viewingBannerStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "var(--accent-blue-muted)",
  borderBottom: "1px solid var(--accent-blue-border)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: "13px",
};

export function App() {
  const {
    connected,
    messages,
    negotiationState,
    approvalRequest,
    agentThinking,
    researchResult,
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
  } = useWebSocket();

  const [llmConfig, setLLMConfig] = useState<LLMConfig>(defaultLLMConfig);
  const [negotiationConfig, setNegotiationConfig] = useState<NegotiationConfig>(defaultNegotiationConfig);
  const [url, setUrl] = useState("");
  const [browserMode, setBrowserMode] = useState<"launch" | "cdp">("launch");
  const [cdpEndpoint, setCdpEndpoint] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Hydrate state from DB settings on first load
  useEffect(() => {
    if (settingsLoaded) return;
    const keys = Object.keys(settings);
    if (keys.length === 0 && connected) {
      // Settings came back empty — that's fine, use defaults
      // But only mark loaded once we've actually received settings (connected + empty = first run)
      setSettingsLoaded(true);
      return;
    }
    if (keys.length === 0) return;

    if (settings.llmConfig) {
      try {
        const saved = JSON.parse(settings.llmConfig) as Partial<LLMConfig>;
        setLLMConfig((prev) => ({ ...prev, ...saved }));
      } catch { /* ignore */ }
    }
    if (settings.negotiationConfig) {
      try {
        const saved = JSON.parse(settings.negotiationConfig) as Partial<NegotiationConfig>;
        setNegotiationConfig((prev) => ({ ...prev, ...saved }));
      } catch { /* ignore */ }
    }
    if (settings.url) setUrl(settings.url);
    if (settings.browserMode) setBrowserMode(settings.browserMode as "launch" | "cdp");
    if (settings.cdpEndpoint) setCdpEndpoint(settings.cdpEndpoint);
    setSettingsLoaded(true);
  }, [settings, connected, settingsLoaded]);

  // Persist LLM config changes to DB
  const handleLLMConfigChange = useCallback((config: LLMConfig) => {
    setLLMConfig(config);
    if (settingsLoaded) saveSetting("llmConfig", JSON.stringify(config));
  }, [saveSetting, settingsLoaded]);

  // Persist browser config changes to DB
  const handleBrowserModeChange = useCallback((mode: "launch" | "cdp") => {
    setBrowserMode(mode);
    if (settingsLoaded) saveSetting("browserMode", mode);
  }, [saveSetting, settingsLoaded]);

  const handleCdpEndpointChange = useCallback((endpoint: string) => {
    setCdpEndpoint(endpoint);
    if (settingsLoaded) saveSetting("cdpEndpoint", endpoint);
  }, [saveSetting, settingsLoaded]);

  const handleNegotiationConfigChange = useCallback((config: NegotiationConfig) => {
    setNegotiationConfig(config);
    if (settingsLoaded) saveSetting("negotiationConfig", JSON.stringify(config));
  }, [saveSetting, settingsLoaded]);

  const handleUrlChange = useCallback((newUrl: string) => {
    setUrl(newUrl);
    if (settingsLoaded) saveSetting("url", newUrl);
  }, [saveSetting, settingsLoaded]);

  const handleSessionNameChange = useCallback((name: string) => {
    setNegotiationConfig((prev) => ({ ...prev, sessionName: name }));
    if (settingsLoaded) saveSetting("negotiationConfig", JSON.stringify({ ...negotiationConfig, sessionName: name }));
    // Update the active session in the DB
    send({ type: "update_session_name", name });
    // If viewing a past session, rename that too
    if (viewingSession) {
      renameSession(viewingSession.id, name);
    }
  }, [saveSetting, settingsLoaded, negotiationConfig, send, viewingSession, renameSession]);

  // Fetch sessions when sidebar opens
  useEffect(() => {
    if (historyOpen) {
      listSessions();
    }
  }, [historyOpen, listSessions]);

  // When a session is loaded for viewing, populate config panels
  useEffect(() => {
    if (viewingSession) {
      setUrl(viewingSession.url);
      setNegotiationConfig({
        ...viewingSession.config,
        sessionName: viewingSession.name ?? viewingSession.config.sessionName ?? "",
      });
      // Restore LLM config (without apiKey — keep user's current key)
      setLLMConfig((prev) => ({
        ...prev,
        provider: viewingSession.llmConfig.provider,
        model: viewingSession.llmConfig.model,
        baseUrl: viewingSession.llmConfig.baseUrl,
        temperature: viewingSession.llmConfig.temperature,
        maxTokens: viewingSession.llmConfig.maxTokens,
      }));
    }
  }, [viewingSession]);

  const getBrowserConfig = useCallback((): BrowserConfig => ({
    mode: browserMode,
    ...(browserMode === "cdp" ? { cdpEndpoint } : {}),
  }), [browserMode, cdpEndpoint]);

  const handleStart = useCallback(
    () => {
      send({
        type: "start_negotiation",
        config: negotiationConfig,
        llm: llmConfig,
        browser: getBrowserConfig(),
        url,
      });
    },
    [send, negotiationConfig, llmConfig, url, getBrowserConfig],
  );

  const handleStop = useCallback(() => {
    send({ type: "stop_negotiation" });
  }, [send]);

  const handlePause = useCallback(() => {
    send({ type: "pause_negotiation" });
  }, [send]);

  const handleResume = useCallback(() => {
    send({ type: "resume_negotiation" });
  }, [send]);

  const handleNewSession = useCallback(() => {
    send({ type: "stop_negotiation" });
    reset();
    handleUrlChange("");
    handleNegotiationConfigChange({ ...defaultNegotiationConfig });
  }, [send, reset, handleUrlChange, handleNegotiationConfigChange]);

  const handleOverride = useCallback(
    (text: string) => {
      send({ type: "user_override", text });
    },
    [send],
  );

  const handleRefine = useCallback(
    (text: string) => {
      send({ type: "refine_message", text, llm: llmConfig, negotiation: negotiationConfig });
    },
    [send, llmConfig, negotiationConfig],
  );

  const handleAdvise = useCallback(
    (text: string) => {
      send({ type: "user_directive", text });
    },
    [send],
  );

  const handleApprove = useCallback(
    (requestId: string) => {
      send({ type: "approve_commitment", requestId });
    },
    [send],
  );

  const handleReject = useCallback(
    (requestId: string, directive?: string) => {
      send({ type: "reject_commitment", requestId, directive });
    },
    [send],
  );

  const handleContinue = useCallback(() => {
    if (!viewingSession) return;
    continueSession(viewingSession.id, negotiationConfig, llmConfig, getBrowserConfig());
    clearViewingSession();
  }, [viewingSession, negotiationConfig, llmConfig, getBrowserConfig, continueSession, clearViewingSession]);

  const handleToggleHistory = useCallback(() => {
    setHistoryOpen((prev) => !prev);
  }, []);

  const handleLoadSession = useCallback((id: string) => {
    loadSession(id);
    setHistoryOpen(false);
  }, [loadSession]);

  const handleDeleteSession = useCallback((id: string) => {
    deleteSession(id);
  }, [deleteSession]);

  const handleRenameSession = useCallback((id: string, name: string) => {
    renameSession(id, name);
  }, [renameSession]);

  const isActive =
    negotiationState === "connecting" ||
    negotiationState === "reaching_human" ||
    negotiationState === "negotiating" ||
    negotiationState === "awaiting_approval" ||
    negotiationState === "paused";

  // Determine what to show in the feed
  const feedMessages = viewingSession ? viewingSession.messages : messages;
  const feedThinking = viewingSession ? null : agentThinking;
  const feedResearch = viewingSession ? null : researchResult;

  return (
    <div style={layoutStyle}>
      <div className="top-bar" style={topBarStyle}>
        <Logo />
        <span style={{ fontWeight: 700, fontSize: "18px" }}>negoti<span style={{
          background: "linear-gradient(135deg, #7c3aed, #2563eb, #06b6d4)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          textShadow: "0 0 20px rgba(99, 102, 241, 0.4), 0 0 40px rgba(99, 102, 241, 0.2)",
          filter: "drop-shadow(0 0 6px rgba(99, 102, 241, 0.5))",
        }}>AI</span>tor</span>
        <Controls connected={connected} />
      </div>
      <div style={bodyStyle}>
      <div style={sidebarStyle}>
        <div style={sidebarScrollStyle}>
          <ConfigPanel
            config={llmConfig}
            onChange={handleLLMConfigChange}
            sessionName={negotiationConfig.sessionName}
            onSessionNameChange={handleSessionNameChange}
            onNewSession={handleNewSession}
            onToggleHistory={handleToggleHistory}
            historyOpen={historyOpen}
          />
          <StrategyPanel
            config={negotiationConfig}
            onChange={handleNegotiationConfigChange}
            url={url}
            onUrlChange={handleUrlChange}
          />
        </div>
        <div style={sidebarFooterStyle}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-tertiary)", marginBottom: "6px" }} title="How to connect to the browser: launch a new one or connect to an existing Chrome instance via CDP">Browser</label>
          {browserMode === "cdp" && (
            <input
              type="text"
              value={cdpEndpoint}
              onChange={(e) => handleCdpEndpointChange(e.target.value)}
              placeholder="ws://localhost:9222/devtools/browser/..."
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "6px",
                border: "1px solid var(--border-input)",
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                fontSize: "13px",
                boxSizing: "border-box" as const,
                marginBottom: "8px",
              }}
              disabled={isActive}
            />
          )}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <select
              value={browserMode}
              onChange={(e) => handleBrowserModeChange(e.target.value as "launch" | "cdp")}
              style={{
                padding: "8px 10px",
                borderRadius: "6px",
                border: "1px solid var(--border-input)",
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                fontSize: "13px",
                cursor: "pointer",
              }}
              disabled={isActive}
            >
              <option value="launch">Launch new</option>
              <option value="cdp">Connect (CDP)</option>
            </select>

            {!isActive ? (
              <button
                onClick={handleStart}
                style={{
                  padding: "8px 20px",
                  borderRadius: "6px",
                  border: "none",
                  background: "var(--accent-green)",
                  color: "var(--text-on-accent)",
                  fontWeight: 700,
                  fontSize: "14px",
                  cursor: "pointer",
                  marginLeft: "auto",
                }}
              >
                Start
              </button>
            ) : (
              <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
                <button
                  onClick={negotiationState === "paused" ? handleResume : handlePause}
                  disabled={negotiationState === "connecting" || negotiationState === "awaiting_approval"}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "6px",
                    border: "none",
                    background: negotiationState === "paused" ? "var(--accent-green)" : "var(--accent-purple)",
                    color: "var(--text-on-accent)",
                    fontWeight: 700,
                    fontSize: "14px",
                    cursor: negotiationState === "connecting" || negotiationState === "awaiting_approval" ? "default" : "pointer",
                    opacity: negotiationState === "connecting" || negotiationState === "awaiting_approval" ? 0.5 : 1,
                  }}
                >
                  {negotiationState === "paused" ? "Resume" : "Pause"}
                </button>
                <button
                  onClick={handleStop}
                  style={{
                    padding: "8px 20px",
                    borderRadius: "6px",
                    border: "none",
                    background: "var(--accent-red)",
                    color: "var(--text-on-accent)",
                    fontWeight: 700,
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  Stop
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={mainStyle}>
        {error && (
          <div
            style={{
              padding: "8px 16px",
              background: "var(--accent-red-muted)",
              color: "var(--accent-red)",
              fontSize: "13px",
              borderBottom: "1px solid var(--accent-red-border)",
            }}
          >
            {error}
          </div>
        )}
        {viewingSession && (
          <div style={viewingBannerStyle}>
            <div>
              <span style={{ fontWeight: 600 }}>
                Viewing: {viewingSession.name || viewingSession.config.serviceProvider || "Unknown"}
              </span>
              <span style={{ color: "var(--text-muted)", marginLeft: "8px" }}>
                {formatDate(viewingSession.startedAt)}
              </span>
              {viewingSession.finalState === "idle" && (
                <span style={{
                  marginLeft: "8px",
                  padding: "1px 5px",
                  borderRadius: "3px",
                  background: "var(--accent-amber-muted)",
                  color: "var(--accent-amber-text)",
                  fontSize: "11px",
                  fontWeight: 600,
                }}>
                  interrupted
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={handleContinue}
                disabled={isActive}
                style={{
                  padding: "5px 14px",
                  borderRadius: "5px",
                  border: "none",
                  background: isActive ? "var(--bg-disabled)" : "var(--accent-green)",
                  color: "var(--text-on-accent)",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: isActive ? "default" : "pointer",
                }}
              >
                Continue
              </button>
              <button
                onClick={clearViewingSession}
                style={{
                  padding: "5px 14px",
                  borderRadius: "5px",
                  border: "1px solid var(--border-input)",
                  background: "var(--bg-primary)",
                  color: "var(--text-secondary)",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
        <NegotiationFeed
          messages={feedMessages}
          agentThinking={feedThinking}
          researchResult={feedResearch}
          onClearChat={clearMessages}
        />
        <MessageInput
          negotiationState={negotiationState}
          onOverride={handleOverride}
          onRefine={handleRefine}
          onAdvise={handleAdvise}
          refinedMessage={refinedMessage}
          onRefinedConsumed={clearRefinedMessage}
        />
        <SessionBrowser
          isOpen={historyOpen}
          sessions={sessions}
          activeSessionId={viewingSession?.id ?? null}
          onLoad={handleLoadSession}
          onDelete={handleDeleteSession}
          onRename={handleRenameSession}
        />
      </div>
      </div>

      <ApprovalBanner
        approvalRequest={approvalRequest}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  );
}
