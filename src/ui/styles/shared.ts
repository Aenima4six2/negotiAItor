export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: "6px",
  border: "1px solid var(--border-input)",
  background: "var(--bg-input)",
  color: "var(--text-primary)",
  fontSize: "13px",
  boxSizing: "border-box",
};

export const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: "48px",
};

export const fieldStyle: React.CSSProperties = {
  marginBottom: "12px",
};

export const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--text-tertiary)",
  marginBottom: "4px",
};
