const STALL_MESSAGES = [
  "Let me review the details of that, one moment please",
  "I want to make sure I understand the offer correctly, give me just a sec",
  "Hmm let me think about that for a moment",
  "I'm looking over the terms, bear with me",
  "Just reviewing this with my partner, one moment",
  "Hold on, I want to double check something before I decide",
  "Give me a minute to consider this",
  "Still reviewing, thanks for your patience",
  "I want to make sure this works for me, almost done thinking it over",
  "Appreciate your patience, still considering",
];

const FIRST_STALL_DELAY_MS = 20_000;
const MIN_STALL_INTERVAL_MS = 45_000;
const MAX_STALL_JITTER_MS = 30_000;

export class StallManager {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private count = 0;
  private onSend: (text: string) => Promise<void>;

  constructor(onSend: (text: string) => Promise<void>) {
    this.onSend = onSend;
  }

  start(): void {
    this.count = 0;
    this.schedule();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.count = 0;
  }

  private schedule(): void {
    const delay = this.count === 0
      ? FIRST_STALL_DELAY_MS
      : MIN_STALL_INTERVAL_MS + Math.random() * MAX_STALL_JITTER_MS;
    this.timer = setTimeout(() => this.fire(), delay);
  }

  private async fire(): Promise<void> {
    const idx = this.count % STALL_MESSAGES.length;
    const msg = STALL_MESSAGES[idx];
    this.count++;

    try {
      await this.onSend(msg);
    } catch {
      // Non-fatal — keep scheduling
    }

    // Schedule next if not stopped between await
    if (this.timer !== null) {
      this.schedule();
    }
  }
}
