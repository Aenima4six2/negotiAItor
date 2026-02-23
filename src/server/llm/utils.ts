import type { LLMProvider, ToolDefinition, StructuredResponse } from "./types.js";

/** Extract JSON from an LLM response that may include markdown fences or prose. */
export function extractJSON(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1].trim();

  const jsonMatch = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) return jsonMatch[1].trim();

  return raw.trim();
}

/**
 * Fallback implementation of chatWithTools for providers that don't have
 * native tool-calling support. Augments the prompt with the tool's JSON
 * schema and tries to parse the response.
 */
export async function textFallbackChatWithTools(
  provider: LLMProvider,
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  tools: ToolDefinition[],
): Promise<StructuredResponse> {
  const tool = tools[0]; // We always pass exactly one tool per call site
  const schemaHint = `\n\nRespond with ONLY valid JSON matching this schema (no markdown, no code fences):\n${JSON.stringify(tool.parameters, null, 2)}`;

  const raw = await provider.chat(systemPrompt + schemaHint, messages);

  try {
    const args = JSON.parse(extractJSON(raw));
    return { type: "tool_call", call: { name: tool.name, args } };
  } catch {
    return { type: "text", text: raw };
  }
}
