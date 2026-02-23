import { useCallback } from "react";
import type { LLMConfig, LLMProviderType } from "../types.js";
import { providers, defaultModels } from "../constants/defaults.js";
import { inputStyle, fieldStyle, labelStyle } from "../styles/shared.js";

interface ConfigPanelProps {
  config: LLMConfig;
  onChange: (config: LLMConfig) => void;
  sessionName: string;
  onSessionNameChange: (name: string) => void;
  onNewSession: () => void;
  onToggleHistory: () => void;
  historyOpen: boolean;
}

const panelStyle: React.CSSProperties = {
  padding: "16px",
};

export function ConfigPanel({ config, onChange, sessionName, onSessionNameChange, onNewSession, onToggleHistory, historyOpen }: ConfigPanelProps) {
  const update = useCallback(
    (partial: Partial<LLMConfig>) => {
      onChange({ ...config, ...partial });
    },
    [config, onChange],
  );

  const showApiKey =
    config.provider !== "ollama" && config.provider !== "claude-code";
  const showBaseUrl = config.provider === "ollama";

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", margin: "0 0 12px" }}>
        <h3 style={{ margin: 0, fontSize: "14px", color: "var(--text-secondary)" }}>
          Session Configuration
        </h3>
        <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
          <button
            onClick={onNewSession}
            style={{
              padding: "3px 8px",
              borderRadius: "4px",
              border: "1px solid var(--border-input)",
              background: "var(--bg-primary)",
              color: "var(--text-secondary)",
              fontWeight: 600,
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            New
          </button>
          <button
            onClick={onToggleHistory}
            style={{
              padding: "3px 8px",
              borderRadius: "4px",
              border: "1px solid var(--border-input)",
              background: historyOpen ? "var(--accent-blue-muted)" : "var(--bg-primary)",
              color: historyOpen ? "var(--accent-blue)" : "var(--text-secondary)",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            History
          </button>
        </div>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} title="A friendly name to identify this session in your history">Session Name</label>
        <input
          type="text"
          value={sessionName}
          onChange={(e) => onSessionNameChange(e.target.value)}
          placeholder="e.g., Feb bill reduction"
          style={inputStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} title="The AI provider whose model will power the negotiation agent">Provider</label>
        <select
          value={config.provider}
          onChange={(e) => {
            const provider = e.target.value as LLMProviderType;
            update({
              provider,
              model: defaultModels[provider],
            });
          }}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          {providers.map((p) => (
            <option key={p} value={p}>
              {p === "claude-code"
                ? "Claude Code"
                : p.charAt(0).toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {showApiKey && (
        <div style={fieldStyle}>
          <label style={labelStyle} title="Your API key for the selected provider. Stored locally, never sent to our servers.">API Key</label>
          <input
            type="password"
            value={config.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
            placeholder="sk-..."
            style={inputStyle}
          />
        </div>
      )}

      <div style={fieldStyle}>
        <label style={labelStyle} title="The specific model to use (e.g., claude-opus-4-6, gpt-4o)">Model</label>
        <input
          type="text"
          value={config.model}
          onChange={(e) => update({ model: e.target.value })}
          style={inputStyle}
        />
      </div>

      {showBaseUrl && (
        <div style={fieldStyle}>
          <label style={labelStyle} title="The URL where your Ollama instance is running">Base URL</label>
          <input
            type="text"
            value={config.baseUrl ?? ""}
            onChange={(e) => update({ baseUrl: e.target.value })}
            placeholder="http://localhost:11434"
            style={inputStyle}
          />
        </div>
      )}

      <div style={fieldStyle}>
        <label style={labelStyle} title="Controls how creative vs predictable the AI responses are. Lower = more focused, higher = more varied.">Creativity</label>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "11px", color: "var(--text-faint)", flexShrink: 0 }}>Precise</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.temperature}
            onChange={(e) => update({ temperature: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: "11px", color: "var(--text-faint)", flexShrink: 0 }}>Creative</span>
        </div>
      </div>
    </div>
  );
}
