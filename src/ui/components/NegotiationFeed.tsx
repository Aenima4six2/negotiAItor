import { useEffect, useRef } from "react";
import type { ChatMessage } from "../types.js";
import { formatTime } from "../utils/formatDate.js";

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const fontSize = level === 1 ? "16px" : level === 2 ? "14px" : "13px";
      elements.push(
        <div key={i} style={{ fontWeight: 700, fontSize, marginTop: i > 0 ? "8px" : 0, marginBottom: "4px" }}>
          {renderInline(headingMatch[2])}
        </div>,
      );
      continue;
    }

    // Bullet points
    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    if (bulletMatch) {
      elements.push(
        <div key={i} style={{ display: "flex", gap: "6px", marginLeft: "4px" }}>
          <span style={{ color: "var(--text-faint)", flexShrink: 0 }}>&bull;</span>
          <span>{renderInline(bulletMatch[1])}</span>
        </div>,
      );
      continue;
    }

    // Empty lines
    if (line.trim() === "") {
      elements.push(<div key={i} style={{ height: "6px" }} />);
      continue;
    }

    // Regular text
    elements.push(<div key={i}>{renderInline(line)}</div>);
  }

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={match.index}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : parts;
}

const SUMMARY_PREFIX = "__SUMMARY__\n";

interface NegotiationFeedProps {
  messages: ChatMessage[];
  agentThinking: string | null;
  researchResult: { query: string; findings: string } | null;
  onClearChat: () => void;
}

const containerStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  background: "var(--bg-secondary)",
};

const repBubble: React.CSSProperties = {
  alignSelf: "flex-start",
  background: "var(--bg-rep-bubble)",
  color: "var(--text-rep-bubble)",
  borderRadius: "12px 12px 12px 2px",
  padding: "10px 14px",
  maxWidth: "70%",
};

const agentBubble: React.CSSProperties = {
  alignSelf: "flex-end",
  background: "var(--bg-agent-bubble)",
  color: "var(--text-agent-bubble)",
  borderRadius: "12px 12px 2px 12px",
  padding: "10px 14px",
  maxWidth: "70%",
};

const systemBubble: React.CSSProperties = {
  alignSelf: "center",
  color: "var(--text-muted)",
  fontSize: "13px",
  fontStyle: "italic",
  padding: "4px 12px",
};

const timestampStyle: React.CSSProperties = {
  fontSize: "11px",
  opacity: 0.6,
  marginTop: "4px",
};

const thinkingStyle: React.CSSProperties = {
  alignSelf: "flex-end",
  color: "var(--accent-blue)",
  fontSize: "13px",
  padding: "8px 14px",
  opacity: 0.7,
};

const researchStyle: React.CSSProperties = {
  alignSelf: "center",
  background: "var(--bg-research)",
  border: "1px solid var(--border-research)",
  borderRadius: "8px",
  padding: "10px 14px",
  maxWidth: "85%",
  fontSize: "13px",
};

const summaryStyle: React.CSSProperties = {
  alignSelf: "center",
  background: "var(--bg-summary)",
  border: "1px solid var(--border-summary)",
  borderRadius: "8px",
  padding: "14px 18px",
  maxWidth: "90%",
  width: "100%",
  fontSize: "13px",
  lineHeight: 1.5,
};

export function NegotiationFeed({
  messages,
  agentThinking,
  researchResult,
  onClearChat,
}: NegotiationFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, agentThinking]);

  const hasContent = messages.length > 0 || agentThinking || researchResult;

  return (
    <div style={containerStyle}>
      {hasContent && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "4px" }}>
          <button
            onClick={onClearChat}
            style={{
              padding: "4px 10px",
              borderRadius: "4px",
              border: "1px solid var(--border-input)",
              background: "var(--bg-primary)",
              color: "var(--text-muted)",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            Clear chat
          </button>
        </div>
      )}

      {messages.length === 0 && !agentThinking && (
        <div
          style={{
            textAlign: "center",
            color: "var(--text-faint)",
            marginTop: "40px",
            fontSize: "15px",
          }}
        >
          No messages yet. Start a negotiation to begin.
        </div>
      )}

      {messages.map((msg, i) => {
        const isSummary = msg.sender === "system" && msg.text.startsWith(SUMMARY_PREFIX);

        if (isSummary) {
          const summaryText = msg.text.slice(SUMMARY_PREFIX.length);
          return (
            <div key={i} style={summaryStyle}>
              <div style={{ fontWeight: 700, marginBottom: "6px", color: "var(--accent-green)" }}>
                Session Summary
              </div>
              <SimpleMarkdown text={summaryText} />
            </div>
          );
        }

        const bubbleStyle =
          msg.sender === "rep"
            ? repBubble
            : msg.sender === "agent"
              ? agentBubble
              : systemBubble;

        return (
          <div key={i} style={bubbleStyle}>
            {msg.sender !== "system" && (
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  marginBottom: "2px",
                  opacity: 0.8,
                }}
              >
                {msg.sender === "rep" ? "Rep" : "Agent"}
              </div>
            )}
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
              {msg.text}
            </div>
            <div style={timestampStyle}>{formatTime(msg.timestamp)}</div>
          </div>
        );
      })}

      {researchResult && (
        <div style={researchStyle}>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>
            Research: {researchResult.query}
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>
            {researchResult.findings}
          </div>
        </div>
      )}

      {agentThinking && (
        <div style={thinkingStyle}>
          <span className="thinking-dots">Thinking</span>
          <span style={{ animation: "pulse 1.5s infinite" }}> ...</span>
          <div style={{ fontSize: "12px", marginTop: "2px" }}>
            {agentThinking}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
