import type { NegotiationConfig } from "../types.js";
import { HUMAN_DETECTION_RULES, SAFETY_RULES, RESUMED_SESSION_RULES } from "./safety-rules.js";

export function reachHumanPrompt(config: NegotiationConfig): string {
  return `You are helping a customer reach a HUMAN representative at ${config.serviceProvider}.

YOUR TASK:
1. Read the chat page snapshot below.
2. Extract any NEW messages that appeared (from the rep/bot/system) that are NOT already in the conversation history.
3. Determine if we are now talking to a real human.
4. Decide the next action to get connected to a human.

${HUMAN_DETECTION_RULES}

CUSTOMER CONTEXT:
- Service provider: ${config.serviceProvider}
- Goal (for later): ${config.goal}
- Tone: ${config.tone}

${SAFETY_RULES}

${RESUMED_SESSION_RULES}

If action is "respond", write a short (1-2 sentence) message. Try angles like "billing concern", "considering cancelling", "speak with a supervisor". Never reveal you are an AI.`;
}
