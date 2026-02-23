import type { LLMConfig } from "../types.js";
import type { LLMProvider, ToolDefinition, StructuredResponse } from "./types.js";
import { textFallbackChatWithTools } from "./utils.js";

export class OllamaProvider implements LLMProvider {
  private model: string;
  private baseUrl: string;
  private temperature: number;

  constructor(config: LLMConfig) {
    this.model = config.model;
    this.baseUrl = config.baseUrl ?? "http://localhost:11434";
    this.temperature = config.temperature;
  }

  async chat(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        options: {
          temperature: this.temperature,
        },
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Ollama API error ${response.status}: ${errorBody}`
      );
    }

    const data = (await response.json()) as {
      message?: { content?: string };
    };
    if (!data.message?.content) {
      throw new Error("No content in Ollama response");
    }
    return data.message.content;
  }

  async chatWithTools(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    tools: ToolDefinition[],
  ): Promise<StructuredResponse> {
    return textFallbackChatWithTools(this, systemPrompt, messages, tools);
  }
}
