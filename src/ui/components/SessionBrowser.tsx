import { useState, useRef, useEffect } from "react";
import type { SavedSessionSummary } from "../types.js";
import { formatDate } from "../utils/formatDate.js";

interface SessionBrowserProps {
  isOpen: boolean;
  sessions: SavedSessionSummary[];
  activeSessionId: string | null;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

const sidebarStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  width: "320px",
  borderLeft: "1px solid var(--border-primary)",
  background: "var(--bg-primary)",
  overflowY: "auto",
  overflowX: "hidden",
  display: "flex",
  flexDirection: "column",
  zIndex: 10,
  boxShadow: "-4px 0 12px rgba(0,0,0,0.1)",
};

const headerStyle: React.CSSProperties = {
  padding: "16px",
  borderBottom: "1px solid var(--border-primary)",
  fontWeight: 700,
  fontSize: "14px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const itemStyle = (isActive: boolean): React.CSSProperties => ({
  padding: "12px 16px",
  borderBottom: "1px solid var(--border-secondary)",
  cursor: "pointer",
  background: isActive ? "var(--accent-blue-muted)" : "var(--bg-primary)",
  borderLeft: isActive ? "3px solid var(--accent-blue)" : "3px solid transparent",
});

function SessionItem({
  session,
  isActive,
  onLoad,
  onDelete,
  onRename,
}: {
  session: SavedSessionSummary;
  isActive: boolean;
  onLoad: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const displayName = session.name || session.serviceProvider || "Unknown";

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitRename = () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed !== session.name) {
      onRename(trimmed);
    }
  };

  return (
    <div
      style={itemStyle(isActive)}
      onClick={() => { if (!editing) onLoad(); }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = "var(--bg-surface-hover)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = "var(--bg-primary)";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              fontWeight: 600,
              fontSize: "14px",
              color: "var(--text-primary)",
              background: "var(--bg-input)",
              border: "1px solid var(--accent-blue)",
              borderRadius: "4px",
              padding: "2px 6px",
              outline: "none",
              marginRight: "8px",
            }}
          />
        ) : (
          <div
            style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)", flex: 1 }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setDraft(session.name);
              setEditing(true);
            }}
            title="Double-click to rename"
          >
            {displayName}
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete this session from ${displayName}?`)) {
              onDelete();
            }
          }}
          style={{
            padding: "2px 6px",
            borderRadius: "4px",
            border: "1px solid var(--border-primary)",
            background: "var(--bg-primary)",
            color: "var(--text-faint)",
            fontSize: "11px",
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          x
        </button>
      </div>
      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
        {formatDate(session.startedAt)}
        <span style={{ margin: "0 6px", color: "var(--border-primary)" }}>|</span>
        {session.messageCount} msg{session.messageCount !== 1 ? "s" : ""}
        {session.finalState === "idle" && (
          <span style={{
            marginLeft: "6px",
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
      {session.summary && (
        <div style={{
          fontSize: "12px",
          color: "var(--text-muted)",
          marginTop: "4px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {session.summary.slice(0, 80)}{session.summary.length > 80 ? "..." : ""}
        </div>
      )}
    </div>
  );
}

export function SessionBrowser({
  isOpen,
  sessions,
  activeSessionId,
  onLoad,
  onDelete,
  onRename,
}: SessionBrowserProps) {
  if (!isOpen) return null;

  return (
    <div style={sidebarStyle}>
      <div style={headerStyle}>
        <span>Session History</span>
        <span style={{ fontSize: "12px", color: "var(--text-faint)", fontWeight: 400 }}>
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </span>
      </div>

      {sessions.length === 0 && (
        <div style={{ padding: "24px 16px", color: "var(--text-faint)", fontSize: "13px", textAlign: "center" }}>
          No saved sessions yet.
        </div>
      )}

      {sessions.map((s) => (
        <SessionItem
          key={s.id}
          session={s}
          isActive={s.id === activeSessionId}
          onLoad={() => onLoad(s.id)}
          onDelete={() => onDelete(s.id)}
          onRename={(name) => onRename(s.id, name)}
        />
      ))}
    </div>
  );
}
