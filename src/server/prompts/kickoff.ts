import type { NegotiationConfig } from "../types.js";

export function kickoffPrompt(config: NegotiationConfig): string {
  return `You are helping a customer reach a HUMAN representative at ${config.serviceProvider}. Your goal right now is NOT to negotiate — it is to get connected to a real person.

The customer's goal (for later): ${config.goal}
Context: ${config.context}

Look at the accessibility tree and determine the best action to get closer to a human agent:
1. Is there a sign-in button or form? If so, we may need the user's help.
2. Is there a text input where we can ask for a human?
3. Are there clickable options/buttons (like "Chat with us", "Talk to an agent", etc.)?
4. Is there a menu or bot flow we need to navigate?`;
}
