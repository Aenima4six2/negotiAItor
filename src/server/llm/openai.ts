import type { LLMConfig } from "../types.js";
import type { LLMProvider, ToolDefinition, StructuredResponse } from "./types.js";

export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private baseUrl: string;

  constructor(config: LLMConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
    this.baseUrl = config.baseUrl ?? "https://api.openai.com";
  }

  async chat(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<string> {
    const response = await this.callAPI(systemPrompt, messages);
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const choice = data.choices?.[0];
    if (!choice?.message?.content) {
      throw new Error("No content in OpenAI response");
    }
    return choice.message.content;
  }

  async chatWithTools(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    tools: ToolDefinition[],
  ): Promise<StructuredResponse> {
    const openaiTools = tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await this.callAPI(systemPrompt, messages, {
      tools: openaiTools,
      tool_choice: { type: "function" as const, function: { name: tools[0].name } },
    });

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.name && toolCall.function.arguments) {
      const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
      return { type: "tool_call", call: { name: toolCall.function.name, args } };
    }

    return { type: "text", text: data.choices?.[0]?.message?.content ?? "" };
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
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    };
    if (extra?.tools) body.tools = extra.tools;
    if (extra?.tool_choice) body.tool_choice = extra.tool_choice;

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
    }

    return response;
  }
}
