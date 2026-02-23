import { ThemeToggle } from "./ThemeToggle.js";

interface ControlsProps {
  connected: boolean;
}

export function Controls({ connected }: ControlsProps) {
  return (
    <>
      <div style={{ flex: 1 }} />

      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          fontSize: "12px",
          fontWeight: 600,
          color: connected ? "var(--accent-green)" : "var(--accent-red)",
        }}
      >
        <span
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: connected ? "var(--accent-green)" : "var(--accent-red)",
          }}
        />
        {connected ? "Connected" : "Disconnected"}
      </span>
      <ThemeToggle />
    </>
  );
}
