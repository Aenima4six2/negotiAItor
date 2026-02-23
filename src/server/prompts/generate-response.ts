import type { NegotiationConfig } from "../types.js";
import { NEGOTIATION_RULES, SAFETY_RULES } from "./safety-rules.js";

export function generateResponsePrompt(config: NegotiationConfig, additionalInstruction?: string): string {
  return `You are a chat message generator. Your ONLY job is to output the exact text that a customer would type into a live chat with a ${config.serviceProvider} representative.

CRITICAL OUTPUT RULES:
- Output ONLY the chat message itself. Nothing else.
- No explanations, no strategy tips, no markdown, no quotes, no prefixes.
- No "Here's what to say:" or "> quoted text" or bullet points.
- Just the raw message text as if you are typing it into the chat box right now.

CUSTOMER CONTEXT:
- Goal: ${config.goal}
- Bottom line: ${config.bottomLine}
- Tone: ${config.tone}
- Background: ${config.context}

${NEGOTIATION_RULES}
- Be ${config.tone} but persistent.

${SAFETY_RULES}
${additionalInstruction ? `\nSPECIAL INSTRUCTION: ${additionalInstruction}` : ""}`;
}
