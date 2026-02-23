import { useCallback } from "react";
import type { NegotiationConfig } from "../types.js";
import { inputStyle, textareaStyle, fieldStyle, labelStyle } from "../styles/shared.js";

interface StrategyPanelProps {
  config: NegotiationConfig;
  onChange: (config: NegotiationConfig) => void;
  url: string;
  onUrlChange: (url: string) => void;
}

const tones = ["polite", "firm", "friendly", "stern"] as const;

const panelStyle: React.CSSProperties = {
  padding: "0 16px 16px",
};

export function StrategyPanel({
  config,
  onChange,
  url,
  onUrlChange,
}: StrategyPanelProps) {
  const update = useCallback(
    (partial: Partial<NegotiationConfig>) => {
      onChange({ ...config, ...partial });
    },
    [config, onChange],
  );

  return (
    <div style={panelStyle}>
      <div style={fieldStyle}>
        <label style={labelStyle} title="Direct URL to the service provider's live chat page">Chat Page URL</label>
        <input
          type="text"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://provider.com/support/chat"
          style={inputStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} title="The company you're negotiating with">Service Provider</label>
        <input
          type="text"
          value={config.serviceProvider}
          onChange={(e) => update({ serviceProvider: e.target.value })}
          placeholder="e.g., Your Cable Co"
          style={inputStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} title="What you want to achieve from this negotiation">Goal</label>
        <textarea
          value={config.goal}
          onChange={(e) => update({ goal: e.target.value })}
          placeholder="e.g., Reduce monthly bill"
          style={textareaStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} title="The minimum acceptable outcome. The agent will not agree to anything worse than this.">Bottom Line</label>
        <textarea
          value={config.bottomLine}
          onChange={(e) => update({ bottomLine: e.target.value })}
          placeholder="e.g., Won't accept more than $59/mo"
          style={textareaStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} title="The communication style the agent will use during the negotiation">Tone</label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {tones.map((tone) => (
            <label
              key={tone}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="tone"
                checked={config.tone === tone}
                onChange={() => update({ tone })}
              />
              {tone.charAt(0).toUpperCase() + tone.slice(1)}
            </label>
          ))}
        </div>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} title="Background info that strengthens your position: loyalty, competitor offers, account details">Context</label>
        <textarea
          value={config.context}
          onChange={(e) => update({ context: e.target.value })}
          placeholder="e.g., 5-year customer, paying $89/mo, competitor offers $49/mo"
          style={{ ...textareaStyle, minHeight: "64px" }}
        />
      </div>

    </div>
  );
}
