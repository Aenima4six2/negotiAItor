import type { ToolDefinition } from "./types.js";

/** Initial page analysis — used only at kickoff before any conversation starts. */
export const PAGE_ACTION_TOOL: ToolDefinition = {
  name: "page_action",
  description:
    "Decide the first action to take on a chat page: type a message, click an element, or flag that the user needs to intervene.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["type", "click", "needs_user"],
        description: "The kind of action to take.",
      },
      ref: {
        type: "string",
        description: "Element reference to interact with (required for type/click).",
      },
      text: {
        type: "string",
        description: "Text to type (required when action is 'type').",
      },
      reason: {
        type: "string",
        description: "Why this action was chosen (required for click/needs_user).",
      },
    },
    required: ["action"],
    additionalProperties: false,
  },
};

/**
 * Reaching-human phase: single LLM call that reads the page, extracts
 * new messages, detects whether we've reached a human, and decides what
 * to do next.
 */
export const REACH_HUMAN_TURN_TOOL: ToolDefinition = {
  name: "reach_human_turn",
  description:
    "Read the chat page, extract any new messages, determine if we are talking to a real human, and decide the next action to get connected to one.",
  parameters: {
    type: "object",
    properties: {
      newMessages: {
        type: "array",
        description:
          "New messages visible on the page that are NOT already in the conversation history. Include rep/bot messages AND system messages (e.g. 'connecting you to an agent'). Do NOT include messages we sent.",
        items: {
          type: "object",
          properties: {
            sender: {
              type: "string",
              enum: ["rep", "system"],
              description: "Who sent the message. 'rep' for bot or human agent, 'system' for status/notification messages.",
            },
            text: { type: "string", description: "The message text." },
          },
          required: ["sender", "text"],
        },
      },
      humanDetected: {
        type: "boolean",
        description:
          "True ONLY if you are confident the latest messages are from a real human (introduced by name, references specifics, natural language). False if still a bot, menu, or unclear.",
      },
      humanEvidence: {
        type: "string",
        description: "Brief explanation of why you think this is or isn't a human.",
      },
      action: {
        type: "string",
        enum: ["respond", "click", "wait", "needs_user"],
        description: "What to do next. 'respond' to type a message, 'click' to click an element, 'wait' if we should just wait, 'needs_user' if user intervention is required.",
      },
      response: {
        type: "string",
        description: "The message to type into the chat (when action is 'respond'). Keep it short, direct, natural. Ask for a human agent.",
      },
      ref: {
        type: "string",
        description: "Element ref to click (when action is 'click').",
      },
      reason: {
        type: "string",
        description: "Why this action was chosen (for click/wait/needs_user).",
      },
    },
    required: ["newMessages", "humanDetected", "humanEvidence", "action"],
    additionalProperties: false,
  },
};

/**
 * Negotiation phase: single LLM call that reads the page, extracts new
 * messages, checks for commitment points, and generates the next response.
 */
export const NEGOTIATION_TURN_TOOL: ToolDefinition = {
  name: "negotiation_turn",
  description:
    "Read the chat page, extract any new messages from the rep, check if they made an offer/commitment, and decide what to say next.",
  parameters: {
    type: "object",
    properties: {
      newMessages: {
        type: "array",
        description:
          "New messages visible on the page that are NOT already in the conversation history. Include rep messages AND system messages. Do NOT include messages we sent.",
        items: {
          type: "object",
          properties: {
            sender: {
              type: "string",
              enum: ["rep", "system"],
              description: "Who sent the message.",
            },
            text: { type: "string", description: "The message text." },
          },
          required: ["sender", "text"],
        },
      },
      isCommitment: {
        type: "boolean",
        description:
          "True if the rep is making a concrete offer, proposing a plan/price change, or requesting confirmation for an account modification.",
      },
      offerDescription: {
        type: "string",
        description: "Brief description of the offer (only when isCommitment is true).",
      },
      recommendation: {
        type: "string",
        enum: ["accept", "reject", "counter"],
        description: "What the customer should do about the offer (only when isCommitment is true).",
      },
      reasoning: {
        type: "string",
        description: "Why this recommendation was made (only when isCommitment is true).",
      },
      counterSuggestion: {
        type: "string",
        description: "What counter-offer to propose (only when recommendation is 'counter').",
      },
      action: {
        type: "string",
        enum: ["respond", "click", "wait", "needs_user"],
        description: "What to do next. For commitments, use 'wait' (we'll ask the user first). For normal conversation, use 'respond'.",
      },
      response: {
        type: "string",
        description: "The negotiation message to type (when action is 'respond' and NOT a commitment). Should be conversational, 1-3 sentences, never agree to changes.",
      },
      ref: {
        type: "string",
        description: "Element ref to click (when action is 'click').",
      },
      reason: {
        type: "string",
        description: "Why this action was chosen (for click/wait/needs_user).",
      },
    },
    required: ["newMessages", "isCommitment", "action"],
    additionalProperties: false,
  },
};
