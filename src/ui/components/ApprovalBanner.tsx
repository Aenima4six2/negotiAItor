import { useCallback, useState } from "react";
import type { ApprovalRequest } from "../types.js";

interface ApprovalBannerProps {
  approvalRequest: ApprovalRequest | null;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string, directive?: string) => void;
}

type Step = "choose" | "confirm_accept" | "decline_input";

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--bg-overlay)",
  zIndex: 999,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
};

const bannerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "800px",
  background: "var(--bg-primary)",
  border: "3px solid var(--accent-red)",
  borderBottom: "none",
  borderRadius: "16px 16px 0 0",
  padding: "24px",
  boxShadow: "var(--shadow-lg)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginBottom: "16px",
};

const sectionStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  borderRadius: "8px",
  padding: "12px",
  marginBottom: "12px",
};

const labelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  textTransform: "uppercase" as const,
  color: "var(--text-muted)",
  marginBottom: "4px",
  letterSpacing: "0.5px",
};

const btnBase: React.CSSProperties = {
  padding: "12px 32px",
  border: "none",
  borderRadius: "8px",
  fontSize: "16px",
  fontWeight: 700,
  cursor: "pointer",
  transition: "opacity 0.15s",
};

const backBtn: React.CSSProperties = {
  ...btnBase,
  background: "var(--bg-surface)",
  color: "var(--text-secondary)",
  border: "1px solid var(--border-input)",
};

function recommendationBadge(rec: ApprovalRequest["agentRecommendation"]) {
  const map = {
    accept: { label: "Recommend Accept", bg: "var(--accent-green)", color: "var(--text-on-accent)" },
    reject: { label: "Recommend Reject", bg: "var(--accent-red)", color: "var(--text-on-accent)" },
    counter: { label: "Recommend Counter", bg: "var(--accent-amber)", color: "var(--text-on-accent)" },
  };
  const { label, bg, color } = map[rec];
  return (
    <span
      style={{
        background: bg,
        color,
        padding: "4px 12px",
        borderRadius: "12px",
        fontSize: "13px",
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}

export function ApprovalBanner({
  approvalRequest,
  onApprove,
  onReject,
}: ApprovalBannerProps) {
  const [directive, setDirective] = useState("");
  const [step, setStep] = useState<Step>("choose");

  const handleConfirmAccept = useCallback(() => {
    if (!approvalRequest) return;
    onApprove(approvalRequest.id);
    setDirective("");
    setStep("choose");
  }, [approvalRequest, onApprove]);

  const handleConfirmDecline = useCallback(() => {
    if (!approvalRequest) return;
    onReject(approvalRequest.id, directive || undefined);
    setDirective("");
    setStep("choose");
  }, [approvalRequest, onReject, directive]);

  const handleBack = useCallback(() => {
    setStep("choose");
  }, []);

  if (!approvalRequest) return null;

  return (
    <div style={overlayStyle}>
      <div style={bannerStyle}>
        <div style={headerStyle}>
          <span style={{ fontSize: "24px" }}>!</span>
          <span style={{ fontSize: "18px", fontWeight: 700 }}>
            Approval Required
          </span>
          {recommendationBadge(approvalRequest.agentRecommendation)}
        </div>

        <div style={sectionStyle}>
          <div style={labelStyle}>What the rep offered</div>
          <div style={{ lineHeight: 1.4 }}>{approvalRequest.repOffer}</div>
        </div>

        <div style={sectionStyle}>
          <div style={labelStyle}>Agent's reasoning</div>
          <div style={{ lineHeight: 1.4 }}>{approvalRequest.reasoning}</div>
        </div>

        {approvalRequest.agentRecommendation === "counter" &&
          approvalRequest.counterSuggestion && (
            <div style={{ ...sectionStyle, border: "1px solid var(--accent-amber)" }}>
              <div style={labelStyle}>Suggested counter</div>
              <div style={{ lineHeight: 1.4 }}>
                {approvalRequest.counterSuggestion}
              </div>
            </div>
          )}

        {step === "choose" && (
          <>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button
                onClick={() => setStep("confirm_accept")}
                style={{ ...btnBase, background: "var(--accent-green)", color: "var(--text-on-accent)" }}
              >
                Accept Offer
              </button>
              <button
                onClick={() => setStep("decline_input")}
                style={{ ...btnBase, background: "var(--accent-red)", color: "var(--text-on-accent)" }}
              >
                Decline & Counter
              </button>
            </div>
            <div style={{ textAlign: "center", fontSize: "11px", color: "var(--text-faint)", marginTop: "8px" }}>
              The agent is stalling the rep while you decide. Take your time.
            </div>
          </>
        )}

        {step === "confirm_accept" && (
          <>
            <div style={{
              textAlign: "center",
              fontSize: "14px",
              color: "var(--text-secondary)",
              marginBottom: "16px",
            }}>
              The agent will confirm and accept this offer with the rep.
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button onClick={handleBack} style={backBtn}>
                Back
              </button>
              <button
                onClick={handleConfirmAccept}
                style={{ ...btnBase, background: "var(--accent-green)", color: "var(--text-on-accent)" }}
              >
                Confirm Accept
              </button>
            </div>
          </>
        )}

        {step === "decline_input" && (
          <>
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>
                Instructions for the agent
              </label>
              <input
                type="text"
                value={directive}
                onChange={(e) => setDirective(e.target.value)}
                placeholder='e.g., "Counter with $49/mo" or "Ask about contract length"'
                autoFocus
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-input)",
                  background: "var(--bg-input)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  boxSizing: "border-box",
                  marginTop: "4px",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirmDecline();
                }}
              />
              <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "4px" }}>
                Optional — leave blank to let the agent push back on its own.
              </div>
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button onClick={handleBack} style={backBtn}>
                Back
              </button>
              <button
                onClick={handleConfirmDecline}
                style={{ ...btnBase, background: "var(--accent-red)", color: "var(--text-on-accent)" }}
              >
                Confirm Decline
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
