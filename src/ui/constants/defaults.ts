import type { LLMConfig, NegotiationConfig, LLMProviderType } from "../types.js";

export const defaultLLMConfig: LLMConfig = {
  provider: "anthropic",
  apiKey: "",
  model: "claude-opus-4-6",
  temperature: 0.7,
  maxTokens: 4096,
};

export const defaultNegotiationConfig: NegotiationConfig = {
  sessionName: "",
  serviceProvider: "",
  goal: "",
  bottomLine: "",
  tone: "polite",
  context: "",
};

export const providers: LLMProviderType[] = [
  "anthropic",
  "openai",
  "ollama",
  "claude-code",
];

export const defaultModels: Record<LLMProviderType, string> = {
  anthropic: "claude-opus-4-6",
  openai: "gpt-4o",
  ollama: "llama3",
  "claude-code": "claude-opus-4-6",
};
