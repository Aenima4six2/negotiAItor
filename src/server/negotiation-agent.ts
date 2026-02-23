import type { MCPClient } from "./mcp-client.js";
import type { ChatObserver } from "./chat-observer.js";
import type { LLMProvider } from "./llm/types.js";
import type {
  ChatMessage,
  NegotiationConfig,
  NegotiationState,
  ApprovalRequest,
  ServerMessage,
} from "./types.js";
import { PAGE_ACTION_TOOL, REACH_HUMAN_TURN_TOOL, NEGOTIATION_TURN_TOOL } from "./llm/tools.js";
import { WebResearcher } from "./web-researcher.js";
import { StallManager } from "./stall-manager.js";
import { kickoffPrompt } from "./prompts/kickoff.js";
import { reachHumanPrompt } from "./prompts/reach-human.js";
import { negotiationTurnPrompt } from "./prompts/negotiation.js";
import { SUMMARY_PROMPT } from "./prompts/summary.js";
import { EXTRACT_MESSAGES_PROMPT } from "./prompts/extract-messages.js";
import { generateResponsePrompt } from "./prompts/generate-response.js";
import { randomUUID } from "node:crypto";

type SendToUI = (msg: ServerMessage) => void;

function log(area: string, msg: string, data?: unknown) {
  const ts = new Date().toISOString().slice(11, 23);
  const prefix = `[${ts}] [Agent:${area}]`;
  if (data !== undefined) {
    console.log(prefix, msg, typeof data === "string" ? data.slice(0, 200) : data);
  } else {
    console.log(prefix, msg);
  }
}


export class NegotiationAgent {
  private mcp: MCPClient;
  private observer: ChatObserver;
  private llm: LLMProvider;
  private config: NegotiationConfig;
  private sendToUI: SendToUI;
  private researcher: WebResearcher;

  private conversation: ChatMessage[] = [];
  private state: NegotiationState = "idle";
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingApproval: ApprovalRequest | null = null;
  private approvalResolve: ((approved: boolean) => void) | null = null;
  private approvalDirective: string | undefined;
  private waitingForLLM = false;
  private pausedFromState: NegotiationState | null = null;
  private stallManager: StallManager;
  private userTypingTimer: ReturnType<typeof setTimeout> | null = null;
  private userTyping = false;

  constructor(
    mcp: MCPClient,
    observer: ChatObserver,
    llm: LLMProvider,
    config: NegotiationConfig,
    sendToUI: SendToUI,
    priorConversation?: ChatMessage[],
  ) {
    this.mcp = mcp;
    this.observer = observer;
    this.llm = llm;
    this.config = config;
    this.sendToUI = sendToUI;
    this.researcher = new WebResearcher(mcp);
    this.stallManager = new StallManager(async (text) => {
      log("stall", `Sending stall message: "${text}"`);
      await this.sendChatMessage(text);
      this.addMessage({ sender: "agent", text, timestamp: Date.now() });
    });
    if (priorConversation?.length) {
      this.conversation = [...priorConversation];
      this.sendToUI({ type: "chat_update", messages: [...this.conversation] });
    }
  }

  getConversation(): ChatMessage[] {
    return [...this.conversation];
  }

  getConfig(): NegotiationConfig {
    return { ...this.config };
  }

  async start(url: string): Promise<void> {
    log("start", `Navigating to ${url}`);
    this.setState("connecting");
    await this.mcp.navigate(url);

    log("start", "Waiting 3s for page load...");
    await new Promise((r) => setTimeout(r, 3000));

    this.setState("reaching_human");

    this.observer.on("snapshot_changed", (snapshot: string) => {
      this.handleSnapshotChanged(snapshot);
    });
    this.observer.start();
    log("start", "Observer started, beginning kickoff to reach a human");

    await this.kickoff();
  }

  /**
   * Initial page analysis — figure out how to interact with the page.
   * Used at startup and when the page changes without a chat input visible.
   */
  private async kickoff(): Promise<void> {
    if (this.waitingForLLM) {
      log("kickoff", "Skipping — already waiting for LLM");
      return;
    }

    this.waitingForLLM = true;
    this.sendToUI({ type: "agent_thinking", thinking: "Analyzing chat page — looking for a way to reach a human..." });

    try {
      log("kickoff", "Taking snapshot...");
      const snapshot = await this.mcp.snapshot();
      log("kickoff", `Snapshot: ${snapshot.length} chars`);

      const systemPrompt = kickoffPrompt(this.config);

      log("kickoff", "Calling LLM for page analysis...");
      const result = await this.llm.chatWithTools(systemPrompt, [
        { role: "user", content: `Accessibility tree:\n${snapshot}` },
      ], [PAGE_ACTION_TOOL]);
      log("kickoff", "LLM result", result);

      let action: { action: string; ref?: string; text?: string; reason?: string };
      if (result.type === "tool_call") {
        action = result.call.args as typeof action;
      } else {
        log("kickoff", "LLM returned text instead of tool call");
        this.addMessage({ sender: "system", text: "Agent needs help: I couldn't determine how to start the chat. What should I do?", timestamp: Date.now() });
        this.sendToUI({ type: "agent_unsure", question: "I couldn't determine how to start the chat. What should I do?", context: "Initial page analysis failed" });
        return;
      }

      log("kickoff", "Parsed action", action);
      await this.executeAction(action);
      this.resetInactivityTimer();
    } catch (err) {
      log("kickoff", "ERROR", String(err));
      this.sendToUI({ type: "error", message: `Failed to analyze page: ${String(err)}` });
    } finally {
      this.waitingForLLM = false;
    }
  }

  pause(): void {
    if (this.state === "paused" || this.state === "idle" || this.state === "done") {
      log("pause", `Cannot pause — state=${this.state}`);
      return;
    }
    log("pause", `Pausing from state=${this.state}`);
    this.pausedFromState = this.state;
    this.setState("paused");
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null; }
    if (this.inactivityTimer) { clearTimeout(this.inactivityTimer); this.inactivityTimer = null; }
  }

  async resume(): Promise<void> {
    if (this.state !== "paused" || !this.pausedFromState) {
      log("resume", `Cannot resume — state=${this.state}`);
      return;
    }
    const restoreState = this.pausedFromState;
    this.pausedFromState = null;
    log("resume", `Resuming to state=${restoreState}`);
    this.setState(restoreState);
    this.resetInactivityTimer();

    // Take a fresh snapshot and process turn so LLM catches up
    try {
      const snapshot = await this.mcp.snapshot();
      await this.processTurn(snapshot);
    } catch (err) {
      log("resume", "Error processing turn after resume", String(err));
    }
  }

  /**
   * Start the agent but immediately enter paused state.
   * Used for continue_session so the user can review before the agent acts.
   */
  startPaused(restoreState: NegotiationState = "negotiating"): void {
    log("startPaused", `Starting in paused mode (underlying state=${restoreState})`);
    this.pausedFromState = restoreState;
    this.setState("paused");
  }

  async stop(): Promise<string | null> {
    log("stop", "Stopping agent");

    // Stop everything immediately so the UI is responsive
    this.stallManager.stop();
    this.observer.stop();
    this.observer.removeAllListeners("snapshot_changed");
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    if (this.userTypingTimer) clearTimeout(this.userTypingTimer);
    this.userTyping = false;
    if (this.approvalResolve) {
      this.approvalResolve(false);
      this.approvalResolve = null;
      this.pendingApproval = null;
    }
    this.pausedFromState = null;
    this.setState("done");

    // Generate summary after stopping (non-blocking for the UI)
    let summary: string | null = null;
    try {
      if (this.conversation.length > 0) {
        summary = await this.summarize();
        this.addMessage({ sender: "system", text: `__SUMMARY__\n${summary}`, timestamp: Date.now() });
      }
    } catch (err) {
      log("stop", "Summary generation failed (non-blocking)", String(err));
    }

    return summary;
  }

  handleApproval(requestId: string): void {
    log("approval", `Approved: ${requestId}`);
    if (this.pendingApproval?.id === requestId && this.approvalResolve) {
      this.approvalDirective = undefined;
      this.approvalResolve(true);
    }
  }

  handleRejection(requestId: string, directive?: string): void {
    log("approval", `Rejected: ${requestId}${directive ? ` — directive: "${directive}"` : ""}`);
    if (this.pendingApproval?.id === requestId && this.approvalResolve) {
      this.approvalDirective = directive;
      this.approvalResolve(false);
    }
  }

  handleUserDirective(text: string): void {
    this.clearUserTypingDelay();
    log("directive", text);
    this.addMessage({ sender: "system", text: `User directive: ${text}`, timestamp: Date.now() });
  }

  handleUserTyping(): void {
    this.userTyping = true;
    log("typing", "User typing — resetting 20s delay");

    // Clear pending debounce and inactivity timers to suppress agent action
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null; }
    if (this.inactivityTimer) { clearTimeout(this.inactivityTimer); this.inactivityTimer = null; }

    // Reset the typing delay timer
    if (this.userTypingTimer) clearTimeout(this.userTypingTimer);
    this.userTypingTimer = setTimeout(() => {
      log("typing", "User typing delay expired — resuming normal operation");
      this.userTyping = false;
      this.userTypingTimer = null;
      this.resetInactivityTimer();
      // Trigger a fresh turn so the agent catches up
      this.mcp.snapshot().then((snapshot) => {
        this.processTurn(snapshot);
      }).catch((err) => {
        log("typing", "Error triggering post-typing turn", String(err));
      });
    }, NegotiationAgent.USER_TYPING_DELAY_MS);
  }

  private clearUserTypingDelay(): void {
    if (this.userTypingTimer) { clearTimeout(this.userTypingTimer); this.userTypingTimer = null; }
    this.userTyping = false;
  }

  async handleUserOverride(text: string): Promise<void> {
    this.clearUserTypingDelay();
    log("override", `User sending message: "${text}"`);
    await this.sendChatMessage(text);
    this.addMessage({ sender: "agent", text, timestamp: Date.now() });

    // Reset timers and trigger a fresh turn so the LLM sees the human's message
    this.resetInactivityTimer();
    if (this.state === "reaching_human" || this.state === "negotiating") {
      setTimeout(async () => {
        try {
          const snapshot = await this.mcp.snapshot();
          await this.processTurn(snapshot);
        } catch (err) {
          log("override", "Error processing post-override turn", String(err));
        }
      }, 3000);
    }
  }

  // ─── Snapshot-driven turn loop ─────────────────────────────────────

  private handleSnapshotChanged(snapshot: string): void {
    log("snapshot", `Page changed (${snapshot.length} chars), state=${this.state}`);

    if (this.state === "paused" || this.state === "idle" || this.state === "done") {
      log("snapshot", `Ignoring — state=${this.state}`);
      return;
    }

    if (this.userTyping) {
      log("snapshot", "Ignoring — user is typing");
      return;
    }

    // Debounce — pages update multiple times per render cycle
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.processTurn(snapshot);
    }, 2000);

    // If someone is typing, give them up to 5 min; otherwise 15s
    if (this.detectTypingIndicator(snapshot)) {
      log("snapshot", "Typing indicator detected — extending inactivity to 5min");
      this.resetInactivityTimer(5 * 60_000);
    } else {
      this.resetInactivityTimer();
    }
  }

  private async processTurn(snapshot: string): Promise<void> {
    if (this.state === "paused") {
      log("turn", "Skipping — paused");
      return;
    }
    if (this.userTyping) {
      log("turn", "Skipping — user is typing");
      return;
    }
    if (this.state === "reaching_human") {
      await this.reachHumanTurn(snapshot);
    } else if (this.state === "negotiating") {
      await this.negotiationTurn(snapshot);
    } else if (this.state === "awaiting_approval") {
      // Still extract new messages so the feed stays current
      await this.extractMessagesOnly(snapshot);
    } else {
      log("turn", `Ignoring snapshot change — state=${this.state}`);
    }
  }

  // ─── Phase 1: Reach a human ───────────────────────────────────────

  private async reachHumanTurn(snapshot: string): Promise<void> {
    if (this.waitingForLLM) {
      log("reach", "Skipping — already waiting for LLM");
      return;
    }

    this.waitingForLLM = true;
    this.sendToUI({ type: "agent_thinking", thinking: "Reading page and checking for a human..." });

    try {
      const conversationText = this.formatConversation();

      const systemPrompt = reachHumanPrompt(this.config);

      const messages = [
        {
          role: "user" as const,
          content: `CONVERSATION SO FAR:\n${conversationText || "(none yet)"}\n\nCURRENT PAGE SNAPSHOT:\n${snapshot}`,
        },
      ];

      const result = await this.llm.chatWithTools(systemPrompt, messages, [REACH_HUMAN_TURN_TOOL]);
      log("reach", "LLM result", result);

      if (this.state === "paused" || this.userTyping) {
        log("reach", "Paused or user typing during LLM call — discarding result");
        return;
      }

      if (result.type !== "tool_call") {
        log("reach", "LLM returned text — cannot process");
        return;
      }

      const turn = result.call.args as {
        newMessages: Array<{ sender: "rep" | "system"; text: string }>;
        humanDetected: boolean;
        humanEvidence: string;
        action: string;
        response?: string;
        ref?: string;
        reason?: string;
      };

      // Deduplicate and add new messages with spaced timestamps
      const dedupedMessages = this.deduplicateMessages(turn.newMessages);
      const baseTs = Date.now();
      for (let j = 0; j < dedupedMessages.length; j++) {
        const msg = dedupedMessages[j];
        this.addMessage({ sender: msg.sender, text: msg.text, timestamp: baseTs + j });
      }

      log("reach", `Human: ${turn.humanDetected} — ${turn.humanEvidence}`);
      log("reach", `New messages: ${dedupedMessages.length} (${turn.newMessages.length} raw), action: ${turn.action}`);

      if (turn.humanDetected) {
        log("reach", ">>> HUMAN CONFIRMED — transitioning to negotiation");
        this.sendToUI({ type: "agent_thinking", thinking: "Human representative confirmed! Starting negotiation..." });
        this.setState("negotiating");

        // Send the opening negotiation message — detect if this is a resumed conversation
        const repMessages = this.conversation.filter((m) => m.sender === "rep");
        const isResumed = repMessages.length > 1; // More than just a greeting means we're mid-conversation
        const instruction = isResumed
          ? "A human representative is already in the conversation (this is a resumed session). Apologize briefly for being disconnected and pick up where the conversation left off. State your concern naturally."
          : "A human representative just connected. Introduce yourself as the customer and state your concern. Be conversational and natural — this is the start of the real negotiation.";
        const openingMsg = await this.generateResponse(snapshot, instruction);
        await this.sendChatMessage(openingMsg);
        this.addMessage({ sender: "agent", text: openingMsg, timestamp: Date.now() });
        log("reach", "Opening negotiation message sent");
      } else {
        // Still not a human — execute the action
        await this.executeAction(turn);
      }
    } catch (err) {
      log("reach", "ERROR", String(err));
      this.sendToUI({ type: "error", message: `Error in reach-human turn: ${String(err)}` });
    } finally {
      this.waitingForLLM = false;
      this.resetInactivityTimer();
    }
  }

  // ─── Phase 2: Negotiate ───────────────────────────────────────────

  private async negotiationTurn(snapshot: string): Promise<void> {
    if (this.waitingForLLM) {
      log("negotiate", "Skipping — already waiting for LLM");
      return;
    }

    this.waitingForLLM = true;
    this.sendToUI({ type: "agent_thinking", thinking: "Reading page and analyzing..." });

    try {
      const conversationText = this.formatConversation();

      const systemPrompt = negotiationTurnPrompt(this.config);

      const messages = [
        {
          role: "user" as const,
          content: `CONVERSATION SO FAR:\n${conversationText || "(none yet)"}\n\nCURRENT PAGE SNAPSHOT:\n${snapshot}`,
        },
      ];

      const result = await this.llm.chatWithTools(systemPrompt, messages, [NEGOTIATION_TURN_TOOL]);
      log("negotiate", "LLM result", result);

      if (this.state === "paused" || this.userTyping) {
        log("negotiate", "Paused or user typing during LLM call — discarding result");
        return;
      }

      if (result.type !== "tool_call") {
        log("negotiate", "LLM returned text — cannot process");
        return;
      }

      const turn = result.call.args as {
        newMessages: Array<{ sender: "rep" | "system"; text: string }>;
        isCommitment: boolean;
        offerDescription?: string;
        recommendation?: string;
        reasoning?: string;
        counterSuggestion?: string;
        action: string;
        response?: string;
        ref?: string;
        reason?: string;
      };

      // Deduplicate and add new messages with spaced timestamps
      const dedupedMessages = this.deduplicateMessages(turn.newMessages);
      const baseTs = Date.now();
      for (let j = 0; j < dedupedMessages.length; j++) {
        const msg = dedupedMessages[j];
        this.addMessage({ sender: msg.sender, text: msg.text, timestamp: baseTs + j });
      }

      log("negotiate", `New messages: ${dedupedMessages.length} (${turn.newMessages.length} raw), commitment: ${turn.isCommitment}, action: ${turn.action}`);

      if (dedupedMessages.length === 0) {
        log("negotiate", "No new messages after dedup — skipping response");
        return;
      }

      // Check for research triggers
      const lastRepMsg = dedupedMessages.filter(m => m.sender === "rep").pop();
      if (lastRepMsg && this.shouldResearch(lastRepMsg.text)) {
        log("negotiate", "Trigger word detected — researching competitor pricing");
        this.sendToUI({ type: "agent_thinking", thinking: "Researching competitor pricing..." });
        const findings = await this.researcher.research(
          `${this.config.serviceProvider} competitor pricing ${this.config.goal}`,
        );
        if (findings) {
          log("negotiate", "Research findings", findings);
          this.sendToUI({ type: "research_result", query: this.config.serviceProvider, findings });
        }
      }

      if (turn.isCommitment) {
        log("negotiate", ">>> COMMITMENT DETECTED — requesting user approval");
        await this.handleCommitmentPoint(turn);
      } else {
        // Normal conversation — execute the action
        await this.executeAction(turn);
      }
    } catch (err) {
      log("negotiate", "ERROR", String(err));
      this.sendToUI({ type: "error", message: `Agent error: ${String(err)}` });
    } finally {
      this.waitingForLLM = false;
      this.resetInactivityTimer();
    }
  }

  // ─── Commitment / approval flow ───────────────────────────────────

  private async handleCommitmentPoint(
    turn: {
      offerDescription?: string;
      recommendation?: string;
      reasoning?: string;
      counterSuggestion?: string;
    },
  ): Promise<void> {
    // Find the last rep message — don't grab agent/system messages by mistake
    const lastRepMessage = [...this.conversation].reverse().find((m) => m.sender === "rep");

    const approvalRequest: ApprovalRequest = {
      id: randomUUID(),
      description: turn.offerDescription ?? "Service rep made an offer",
      repOffer: lastRepMessage?.text ?? "",
      agentRecommendation: (turn.recommendation ?? "reject") as ApprovalRequest["agentRecommendation"],
      reasoning: turn.reasoning ?? "Unable to evaluate — asking user to decide.",
      counterSuggestion: turn.counterSuggestion,
    };

    this.pendingApproval = approvalRequest;
    this.setState("awaiting_approval");
    this.sendToUI({ type: "approval_required", request: approvalRequest });
    log("commitment", "Waiting for user approval — starting stall messages");

    // Keep the rep busy while the human decides
    this.stallManager.start();

    const approved = await new Promise<boolean>((resolve) => {
      this.approvalResolve = resolve;
    });

    this.stallManager.stop();
    this.pendingApproval = null;
    this.approvalResolve = null;

    if (this.state === "done") {
      log("commitment", "Agent was stopped during approval — aborting");
      return;
    }

    this.setState("negotiating");

    // Take a fresh snapshot — the page has likely changed during the approval wait
    const freshSnapshot = await this.mcp.snapshot();

    if (approved) {
      log("commitment", "User APPROVED — accepting deal");
      const acceptMsg = await this.generateResponse(freshSnapshot, "The user has approved this offer. Confirm and accept it politely.");
      await this.sendChatMessage(acceptMsg);
      this.addMessage({ sender: "agent", text: acceptMsg, timestamp: Date.now() });
    } else {
      const directive = this.approvalDirective;
      this.approvalDirective = undefined;
      log("commitment", `User REJECTED${directive ? ` — directive: "${directive}"` : ""}`);
      const instruction = directive
        ? `The user rejected this offer and says: "${directive}". Follow their direction.`
        : "The user rejected this offer. Push back and continue negotiating for a better deal.";
      const rejectMsg = await this.generateResponse(freshSnapshot, instruction);
      await this.sendChatMessage(rejectMsg);
      this.addMessage({ sender: "agent", text: rejectMsg, timestamp: Date.now() });
    }
  }

  // ─── Post-session summary ────────────────────────────────────────

  private async summarize(): Promise<string> {
    log("summary", `Generating summary for ${this.conversation.length} messages`);
    const conversationText = this.conversation
      .map((m) => `${m.sender}: ${m.text}`)
      .join("\n");

    const systemPrompt = SUMMARY_PROMPT;

    const result = await this.llm.chat(systemPrompt, [
      { role: "user", content: `Full conversation:\n${conversationText}` },
    ]);
    log("summary", "Summary generated", result);
    return result;
  }

  // ─── Message extraction during approval wait ────────────────────

/**
   * Lightweight turn that only extracts new messages from the page
   * without generating a response. Used during awaiting_approval so
   * the chat feed stays current.
   */
  private async extractMessagesOnly(snapshot: string): Promise<void> {
    if (this.waitingForLLM) return;

    this.waitingForLLM = true;
    try {
      const conversationText = this.formatConversation();

      const systemPrompt = EXTRACT_MESSAGES_PROMPT;

      const result = await this.llm.chatWithTools(systemPrompt, [
        { role: "user" as const, content: `CONVERSATION SO FAR:\n${conversationText || "(none yet)"}\n\nCURRENT PAGE SNAPSHOT:\n${snapshot}` },
      ], [NEGOTIATION_TURN_TOOL]);

      if (this.userTyping) {
        log("extract", "User typing during extraction — discarding result");
        return;
      }

      if (result.type === "tool_call") {
        const turn = result.call.args as {
          newMessages: Array<{ sender: "rep" | "system"; text: string }>;
        };
        const dedupedMessages = this.deduplicateMessages(turn.newMessages);
        const baseTs = Date.now();
        for (let j = 0; j < dedupedMessages.length; j++) {
          const msg = dedupedMessages[j];
          this.addMessage({ sender: msg.sender, text: msg.text, timestamp: baseTs + j });
        }
        if (dedupedMessages.length > 0) {
          log("extract", `Extracted ${dedupedMessages.length} new messages during approval wait`);
        }
      }
    } catch (err) {
      log("extract", "ERROR", String(err));
    } finally {
      this.waitingForLLM = false;
    }
  }

  // ─── Shared helpers ───────────────────────────────────────────────

  /**
   * Execute an action returned by the LLM (respond, click, wait, needs_user).
   */
  private async executeAction(action: { action: string; response?: string; ref?: string; text?: string; reason?: string }): Promise<void> {
    if (action.action === "respond" && action.response) {
      log("action", `Sending: "${action.response.slice(0, 80)}..."`);
      await this.sendChatMessage(action.response);
      this.addMessage({ sender: "agent", text: action.response, timestamp: Date.now() });
    } else if (action.action === "type" && action.ref && action.text) {
      // From PAGE_ACTION_TOOL
      log("action", `Typing into ${action.ref}: "${action.text}"`);
      await this.mcp.click(action.ref);
      await this.mcp.type(action.ref, action.text);
      await this.mcp.pressKey("Enter");
      this.addMessage({ sender: "agent", text: action.text, timestamp: Date.now() });
    } else if (action.action === "click" && action.ref) {
      log("action", `Clicking ${action.ref} — ${action.reason}`);
      await this.mcp.click(action.ref);
      this.addMessage({ sender: "system", text: `Agent clicked: ${action.reason ?? action.ref}`, timestamp: Date.now() });
    } else if (action.action === "needs_user") {
      this.addMessage({ sender: "system", text: `Agent needs help: ${action.reason ?? "I need your help to proceed."}`, timestamp: Date.now() });
      this.sendToUI({
        type: "agent_unsure",
        question: action.reason ?? "I need your help to proceed.",
        context: "The page may require sign-in or other user action.",
      });
    } else if (action.action === "wait") {
      log("action", `Waiting — ${action.reason ?? "nothing to do yet"}`);
      this.sendToUI({ type: "agent_thinking", thinking: action.reason ?? "Waiting..." });
    }
  }

  private shouldResearch(repMessage: string): boolean {
    const triggers = ["best we can do", "that's our current", "standard rate", "can't go lower", "our pricing"];
    return triggers.some((t) => repMessage.toLowerCase().includes(t));
  }

  /**
   * Plain text response generation — used only for post-approval messages
   * and inactivity follow-ups where we need a standalone chat message.
   */
  private async generateResponse(snapshot: string, additionalInstruction?: string): Promise<string> {
    const conversationText = this.formatConversation();

    log("llm", `Generating response (convo: ${this.conversation.length} msgs, instruction: ${additionalInstruction ? "yes" : "none"})`);

    const systemPrompt = generateResponsePrompt(this.config, additionalInstruction);

    const messages = [
      { role: "user" as const, content: `Conversation so far:\n${conversationText}\n\nPage context:\n${snapshot.slice(0, 2000)}\n\nOutput ONLY the next chat message. No commentary.` },
    ];

    const t0 = Date.now();
    const raw = await this.llm.chat(systemPrompt, messages);
    log("llm", `LLM responded in ${((Date.now() - t0) / 1000).toFixed(1)}s`, raw);
    return raw;
  }

  private async sendChatMessage(text: string): Promise<void> {
    log("send", `Finding chat input to send: "${text.slice(0, 80)}..."`);
    const snapshot = await this.mcp.snapshot();
    const inputRef = this.findChatInput(snapshot);
    if (inputRef) {
      log("send", `Typing into ${inputRef}`);
      await this.mcp.click(inputRef);
      await this.mcp.type(inputRef, text);
      await this.mcp.pressKey("Enter");
      log("send", "Message sent (Enter pressed)");
    } else {
      log("send", "WARNING: No chat input found in snapshot!");
    }
  }

  private findChatInput(snapshot: string): string | null {
    const lines = snapshot.split("\n");
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (
        (lower.includes("textbox") || lower.includes("text input") || lower.includes("type a message") || lower.includes("type your message") || lower.includes("write a reply")) &&
        !lower.includes("search")
      ) {
        const refMatch = line.match(/\[ref=([\w-]+)\]/);
        if (refMatch) {
          log("input", `Found chat input: ${refMatch[1]} (matched: ${lower.trim().slice(0, 60)})`);
          return refMatch[1];
        }
      }
    }
    for (const line of lines) {
      if (line.toLowerCase().includes("contenteditable") || line.toLowerCase().includes("textarea")) {
        const refMatch = line.match(/\[ref=([\w-]+)\]/);
        if (refMatch) {
          log("input", `Found fallback input: ${refMatch[1]}`);
          return refMatch[1];
        }
      }
    }
    log("input", "No chat input found");
    return null;
  }

  private formatConversation(): string {
    return this.conversation
      .slice(-20)
      .map((m) => `${m.sender}: ${m.text}`)
      .join("\n");
  }

  /**
   * Filter out messages the LLM extracted that we already have in conversation.
   * The LLM sometimes re-extracts old messages despite being told not to.
   */
  private deduplicateMessages(
    newMessages: Array<{ sender: string; text: string }>,
  ): Array<{ sender: "rep" | "system"; text: string }> {
    const known = new Set(
      this.conversation.map((m) => `${m.sender}:${m.text}`),
    );
    return newMessages.filter(
      (m) => !known.has(`${m.sender}:${m.text}`),
    ) as Array<{ sender: "rep" | "system"; text: string }>;
  }

  private addMessage(msg: ChatMessage): void {
    this.conversation.push(msg);
    this.sendToUI({ type: "chat_update", messages: [...this.conversation] });
  }

  private setState(state: NegotiationState): void {
    log("state", `${this.state} → ${state}`);
    this.state = state;
    this.sendToUI({ type: "status_update", state });
  }

  private static readonly INACTIVITY_MS = 15_000;
  private static readonly TYPING_INACTIVITY_MS = 5 * 60_000;
  private static readonly USER_TYPING_DELAY_MS = 20_000;

  private resetInactivityTimer(ms = NegotiationAgent.INACTIVITY_MS): void {
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(() => {
      this.handleInactivity();
    }, ms);
  }

  /**
   * Check the snapshot for common typing indicators.
   * Chat UIs typically surface these as text nodes like "is typing",
   * "typing...", or accessibility labels on animation elements.
   */
  private detectTypingIndicator(snapshot: string): boolean {
    const lower = snapshot.toLowerCase();
    return /is typing|is writing|typing\.\.\.|typing…|composing/.test(lower);
  }

  private async handleInactivity(): Promise<void> {
    if (this.state === "paused") {
      log("inactivity", "Skipping — paused");
      return;
    }

    if (this.userTyping) {
      log("inactivity", "Skipping — user is typing");
      return;
    }

    if (this.waitingForLLM) {
      log("inactivity", "Skipping — already waiting for LLM");
      return;
    }

    if (this.state === "reaching_human") {
      log("inactivity", "Timed out with no change — taking fresh snapshot and retrying");
      const snapshot = await this.mcp.snapshot();
      await this.reachHumanTurn(snapshot);
      return;
    }

    if (this.state !== "negotiating") {
      log("inactivity", `Skipping — state=${this.state}`);
      return;
    }

    log("inactivity", "Timed out with no new messages — sending follow-up");
    this.sendToUI({ type: "agent_thinking", thinking: "No response yet, sending follow-up..." });

    try {
      const snapshot = await this.mcp.snapshot();
      const followUp = await this.generateResponse(
        snapshot,
        "It's been a while with no response. Send a brief, polite follow-up to check if the agent is still there. Keep it short — one sentence.",
      );
      await this.sendChatMessage(followUp);
      this.addMessage({ sender: "agent", text: followUp, timestamp: Date.now() });
      this.resetInactivityTimer();
    } catch (err) {
      log("inactivity", "Error sending follow-up", String(err));
      this.resetInactivityTimer();
    }
  }
}
