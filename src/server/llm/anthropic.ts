import type { LLMConfig } from "../types.js";
import type { LLMProvider, ToolDefinition, StructuredResponse } from "./types.js";

export class AnthropicProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(config: LLMConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
  }

  async chat(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<string> {
    const response = await this.callAPI(systemPrompt, messages);
    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const textBlock = data.content?.find((block) => block.type === "text");
    if (!textBlock?.text) {
      throw new Error("No text content in Anthropic response");
    }
    return textBlock.text;
  }

  async chatWithTools(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    tools: ToolDefinition[],
  ): Promise<StructuredResponse> {
    const anthropicTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    const response = await this.callAPI(systemPrompt, messages, {
      tools: anthropicTools,
      tool_choice: { type: "tool" as const, name: tools[0].name },
    });

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
    };

    const toolBlock = data.content?.find((block) => block.type === "tool_use");
    if (toolBlock?.name && toolBlock.input) {
      return { type: "tool_call", call: { name: toolBlock.name, args: toolBlock.input } };
    }

    const textBlock = data.content?.find((block) => block.type === "text");
    return { type: "text", text: textBlock?.text ?? "" };
  }

  private async callAPI(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    extra?: { tools?: unknown[]; tool_choice?: unknown },
  ): Promise<Response> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (extra?.tools) body.tools = extra.tools;
    if (extra?.tool_choice) body.tool_choice = extra.tool_choice;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
    }

    return response;
  }
}
