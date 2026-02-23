import type { LLMConfig } from "../types.js";
import type { LLMProvider } from "./types.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { OllamaProvider } from "./ollama.js";
import { ClaudeCodeProvider } from "./claude-code.js";

export function createProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicProvider(config);
    case "openai":
      return new OpenAIProvider(config);
    case "ollama":
      return new OllamaProvider(config);
    case "claude-code":
      return new ClaudeCodeProvider(config);
    default:
      throw new Error(`Unknown LLM provider: ${(config as LLMConfig).provider}`);
  }
}
