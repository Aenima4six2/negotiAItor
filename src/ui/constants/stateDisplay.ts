import type { NegotiationState } from "../types.js";

export const stateBadgeColors: Record<NegotiationState, string> = {
  idle: "var(--state-idle)",
  connecting: "var(--accent-amber)",
  reaching_human: "var(--accent-orange)",
  negotiating: "var(--accent-blue)",
  awaiting_approval: "var(--accent-red)",
  paused: "var(--accent-purple)",
  done: "var(--accent-green)",
};

export const stateLabels: Record<NegotiationState, string> = {
  idle: "Idle",
  connecting: "Connecting",
  reaching_human: "Reaching Human",
  negotiating: "Negotiating",
  awaiting_approval: "Awaiting Approval",
  paused: "Paused",
  done: "Done",
};
