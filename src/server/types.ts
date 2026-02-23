// ============================================================
// negotiAItor — Shared Server Types
// This file is the contract between ALL components.
// ============================================================

// --- Chat Messages ---

export interface ChatMessage {
  sender: "rep" | "agent" | "system";
  text: string;
  timestamp: number;
}

// --- Negotiation State Machine ---

export type NegotiationState =
  | "idle"
  | "connecting"
  | "reaching_human"
  | "negotiating"
  | "awaiting_approval"
  | "paused"
  | "done";

// --- Approval Requests (commitment detection) ---

export interface ApprovalRequest {
  id: string;
  description: string;
  repOffer: string;
  agentRecommendation: "accept" | "reject" | "counter";
  reasoning: string;
  counterSuggestion?: string;
}

// --- LLM Configuration ---

export type LLMProviderType = "anthropic" | "openai" | "ollama" | "claude-code";

export interface LLMConfig {
  provider: LLMProviderType;
  apiKey: string;
  model: string;
  baseUrl?: string;
  temperature: number;
  maxTokens: number;
}

// --- Negotiation Configuration ---

export interface NegotiationConfig {
  sessionName: string;
  goal: string;
  bottomLine: string;
  tone: "polite" | "firm" | "friendly" | "stern";
  context: string;
  serviceProvider: string;
}

// --- Browser Connection ---

export interface BrowserConfig {
  mode: "launch" | "cdp";
  cdpEndpoint?: string;
  headless?: boolean;
}

// --- Saved Sessions (persistence) ---

export interface SavedLLMConfig {
  provider: LLMProviderType;
  model: string;
  baseUrl?: string;
  temperature: number;
  maxTokens: number;
}

export interface SavedSession {
  id: string;
  name: string;
  url: string;
  config: NegotiationConfig;
  llmConfig: SavedLLMConfig;
  browserConfig: BrowserConfig;
  messages: ChatMessage[];
  summary: string | null;
  finalState: NegotiationState;
  startedAt: number;
  endedAt: number;
}

export interface SavedSessionSummary {
  id: string;
  name: string;
  url: string;
  serviceProvider: string;
  messageCount: number;
  summary: string | null;
  finalState: NegotiationState;
  startedAt: number;
  endedAt: number;
}

// --- WebSocket Messages (Server ↔ UI) ---

// Server → UI
export type ServerMessage =
  | { type: "chat_update"; messages: ChatMessage[] }
  | { type: "approval_required"; request: ApprovalRequest }
  | { type: "agent_thinking"; thinking: string }
  | { type: "agent_unsure"; question: string; context: string }
  | { type: "status_update"; state: NegotiationState }
  | { type: "research_result"; query: string; findings: string }
  | { type: "screenshot"; data: string }
  | { type: "session_summary"; summary: string }
  | { type: "sessions_list"; sessions: SavedSessionSummary[] }
  | { type: "session_loaded"; session: SavedSession }
  | { type: "session_deleted"; sessionId: string }
  | { type: "session_renamed"; sessionId: string; name: string }
  | { type: "message_refined"; text: string }
  | { type: "settings_loaded"; settings: Record<string, string> }
  | { type: "error"; message: string };

// UI → Server
export type ClientMessage =
  | { type: "start_negotiation"; config: NegotiationConfig; llm: LLMConfig; browser: BrowserConfig; url: string }
  | { type: "stop_negotiation" }
  | { type: "approve_commitment"; requestId: string }
  | { type: "reject_commitment"; requestId: string; directive?: string }
  | { type: "user_directive"; text: string }
  | { type: "user_override"; text: string }
  | { type: "pause_negotiation" }
  | { type: "resume_negotiation" }
  | { type: "config_update"; llm?: Partial<LLMConfig>; negotiation?: Partial<NegotiationConfig> }
  | { type: "list_sessions" }
  | { type: "load_session"; sessionId: string }
  | { type: "delete_session"; sessionId: string }
  | { type: "rename_session"; sessionId: string; name: string }
  | { type: "update_session_name"; name: string }
  | { type: "continue_session"; sessionId: string; config: NegotiationConfig; llm: LLMConfig; browser: BrowserConfig }
  | { type: "refine_message"; text: string; llm: LLMConfig; negotiation: NegotiationConfig }
  | { type: "get_settings" }
  | { type: "save_setting"; key: string; value: string };

// Union for parsing
export type WsMessage = ServerMessage | ClientMessage;
