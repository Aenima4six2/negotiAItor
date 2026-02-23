import { useCallback, useEffect, useRef, useState } from "react";
import type { NegotiationState } from "../types.js";
import { stateBadgeColors, stateLabels } from "../constants/stateDisplay.js";
import { inputStyle } from "../styles/shared.js";

interface MessageInputProps {
  negotiationState: NegotiationState;
  onOverride: (text: string) => void;
  onRefine: (text: string) => void;
  onAdvise: (text: string) => void;
  onTyping: () => void;
  refinedMessage: string | null;
  onRefinedConsumed: () => void;
}

export function MessageInput({
  negotiationState,
  onOverride,
  onRefine,
  onAdvise,
  onTyping,
  refinedMessage,
  onRefinedConsumed,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const lastTypingSentRef = useRef(0);
  const [refining, setRefining] = useState(false);

  const isActive =
    negotiationState === "connecting" ||
    negotiationState === "reaching_human" ||
    negotiationState === "negotiating" ||
    negotiationState === "awaiting_approval" ||
    negotiationState === "paused";

  useEffect(() => {
    if (refinedMessage !== null) {
      setText(refinedMessage);
      setRefining(false);
      onRefinedConsumed();
    }
  }, [refinedMessage, onRefinedConsumed]);

  const handleRefine = useCallback(() => {
    if (!text.trim()) return;
    setRefining(true);
    onRefine(text.trim());
  }, [text, onRefine]);

  const handleAdvise = useCallback(() => {
    if (!text.trim()) return;
    onAdvise(text.trim());
    setText("");
  }, [text, onAdvise]);

  const handleSend = useCallback(() => {
    if (!text.trim()) return;
    onOverride(text.trim());
    setText("");
  }, [text, onOverride]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    const now = Date.now();
    if (now - lastTypingSentRef.current >= 500) {
      lastTypingSentRef.current = now;
      onTyping();
    }
  }, [onTyping]);

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        padding: "12px 16px",
        borderTop: "1px solid var(--border-primary)",
        background: "var(--bg-primary)",
      }}
    >
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
        <input
          type="text"
          value={text}
          onChange={handleChange}
          placeholder="Send a message as yourself..."
          style={{ ...inputStyle, width: "100%", paddingRight: "52px" }}
          disabled={!isActive}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
        />
        <button
          onClick={handleRefine}
          disabled={!isActive || !text.trim() || refining}
          title="Rewrite your message with AI to be more effective for the negotiation"
          style={{
            position: "absolute",
            right: "4px",
            padding: "3px 8px",
            borderRadius: "4px",
            border: "1px solid var(--border-input)",
            background: isActive && text.trim() && !refining ? "var(--bg-surface)" : "transparent",
            color: isActive && text.trim() && !refining ? "var(--accent-purple)" : "var(--text-faint)",
            fontWeight: 600,
            fontSize: "11px",
            cursor: isActive && text.trim() && !refining ? "pointer" : "default",
            opacity: refining ? 0.7 : 1,
            lineHeight: 1,
          }}
        >
          {refining ? "..." : "Rewrite"}
        </button>
      </div>
      <button
        onClick={handleAdvise}
        disabled={!isActive || !text.trim()}
        title="Give the AI agent a direction or strategy hint — nothing is sent to the rep, it just guides the agent's next moves"
        style={{
          padding: "8px 12px",
          borderRadius: "6px",
          border: "1px solid var(--border-input)",
          background: isActive && text.trim() ? "var(--bg-surface)" : "var(--bg-disabled)",
          color: isActive && text.trim() ? "var(--accent-amber)" : "var(--text-faint)",
          fontWeight: 600,
          fontSize: "13px",
          cursor: isActive && text.trim() ? "pointer" : "default",
        }}
      >
        Advise AI
      </button>
      <button
        onClick={handleSend}
        disabled={!isActive || !text.trim()}
        title="Send this message directly to the rep as yourself — bypasses the AI agent"
        style={{
          padding: "8px 16px",
          borderRadius: "6px",
          border: "none",
          background:
            isActive && text.trim() ? "var(--accent-blue)" : "var(--bg-disabled)",
          color: isActive && text.trim() ? "var(--text-on-accent)" : "var(--text-faint)",
          fontWeight: 600,
          fontSize: "13px",
          cursor:
            isActive && text.trim() ? "pointer" : "default",
        }}
      >
        Send
      </button>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13px",
          fontWeight: 600,
          color: stateBadgeColors[negotiationState],
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: stateBadgeColors[negotiationState],
            boxShadow: negotiationState !== "idle" && negotiationState !== "done"
              ? `0 0 8px ${stateBadgeColors[negotiationState]}`
              : "none",
          }}
        />
        {stateLabels[negotiationState]}
      </span>
    </div>
  );
}
