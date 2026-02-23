// --- Tool Calling Types ---

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

export type StructuredResponse =
  | { type: "tool_call"; call: { name: string; args: Record<string, unknown> } }
  | { type: "text"; text: string };

// --- Provider Interface ---

export interface LLMProvider {
  chat(systemPrompt: string, messages: Array<{ role: "user" | "assistant"; content: string }>): Promise<string>;

  chatWithTools(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    tools: ToolDefinition[],
  ): Promise<StructuredResponse>;
}
