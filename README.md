# negotiAItor

An AI-powered autonomous negotiation agent that conducts live chat negotiations with service providers (cable, phone, insurance companies, etc.) on your behalf. Point it at a customer service chat, define your goal and bottom line, and let the agent handle the conversation — escalating to you only when a commitment point is reached.

## How It Works

```
┌──────────────────────────────────────────────────────────────────────┐
│                            Browser                                   │
│  ┌────────────────────┐         ┌──────────────────────────────┐    │
│  │    React UI         │  WS    │        Node Server           │    │
│  │                     │◄──────►│                              │    │
│  │  ConfigPanel        │        │  NegotiationAgent            │    │
│  │  StrategyPanel      │        │    ├── State Machine         │    │
│  │  NegotiationFeed    │        │    ├── StallManager          │    │
│  │  ApprovalBanner     │        │    └── WebResearcher         │    │
│  │  MessageInput       │        │                              │    │
│  │  SessionBrowser     │        │  LLM Router                  │    │
│  │                     │        │    ├── Anthropic              │    │
│  └────────────────────┘        │    ├── OpenAI                 │    │
│                                 │    ├── Ollama                 │    │
│                                 │    └── Claude Code            │    │
│                                 │                              │    │
│                                 │  SessionStore (SQLite)       │    │
│                                 └──────────┬───────────────────┘    │
│                                            │ MCP                    │
│                                 ┌──────────▼───────────────────┐    │
│                                 │  Playwright MCP Server       │    │
│                                 │  (browser automation)        │    │
│                                 └──────────┬───────────────────┘    │
│                                            │                        │
│                                 ┌──────────▼───────────────────┐    │
│                                 │  Service Provider Chat Page  │    │
│                                 │  (any provider chat page)    │    │
│                                 └──────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

### Core Loop

1. **ChatObserver** polls the service provider's chat page every 5 seconds via Playwright MCP, hashing the accessibility snapshot to detect changes
2. When a change is detected, a 2-second debounce fires before passing the snapshot to the **NegotiationAgent**
3. The agent sends the snapshot + conversation history to the configured **LLM**, which extracts new messages and decides on an action (respond, research, escalate, or flag a commitment point)
4. Actions are executed through Playwright — finding the chat input, typing a response, clicking send
5. When the LLM detects a commitment point (an offer, contract change, price lock), it pauses and asks the **human** for approval before accepting or declining

### State Machine

```
idle → connecting → reaching_human → negotiating → done
                                         │
                                         ├── awaiting_approval → negotiating
                                         │
                                         └── paused → negotiating
```

- **idle**: No active negotiation
- **connecting**: Launching browser, navigating to chat URL
- **reaching_human**: Navigating automated menus/bots to reach a live agent
- **negotiating**: Actively negotiating with the service rep
- **awaiting_approval**: Commitment point detected, waiting for human decision (agent sends stalling messages to keep the rep engaged)
- **paused**: Human paused the negotiation
- **done**: Negotiation complete, summary generated

## Features

- **Multi-provider LLM support**: Anthropic, OpenAI, Ollama (local), or Claude Code (free via CLI)
- **Human-in-the-loop approval**: The agent never commits to anything without your explicit approval. Two-step confirm/decline flow with optional counter-directive
- **Session persistence**: All negotiations are saved to SQLite with full message history, config, and summaries. Resume interrupted sessions
- **Per-session browser profiles**: Each session gets isolated browser state under `~/.negotiaitor/browser-data/<sessionId>/`
- **Stall management**: While you review an offer, the agent sends natural delay messages to keep the rep waiting
- **Manual override**: Send messages directly to the rep, steer the agent with AI Advise, or AI Refine your messages before sending
- **Web research**: Agent can research competitor pricing mid-negotiation
- **Dark/light theme**: Toggle via UI

## Project Structure

```
src/
├── server/
│   ├── index.ts                 # Express + WebSocket server
│   ├── negotiation-agent.ts     # Core agent (state machine, LLM orchestration)
│   ├── chat-observer.ts         # Polls page snapshots for changes
│   ├── mcp-client.ts            # Playwright MCP connection
│   ├── session-store.ts         # SQLite persistence
│   ├── stall-manager.ts         # Timed stalling messages during approval
│   ├── web-researcher.ts        # Google search for competitive intel
│   ├── types.ts                 # Shared type definitions
│   ├── prompts/
│   │   └── safety-rules.ts      # Shared LLM prompt constants
│   └── llm/
│       ├── router.ts            # Provider factory
│       ├── types.ts             # LLMProvider interface
│       ├── tools.ts             # LLM tool definitions
│       ├── utils.ts             # Response parsing
│       ├── anthropic.ts         # Anthropic Claude provider
│       ├── openai.ts            # OpenAI provider
│       ├── ollama.ts            # Ollama (local) provider
│       └── claude-code.ts       # Claude Code CLI provider
├── ui/
│   ├── App.tsx                  # Main app shell
│   ├── main.tsx                 # Entry point
│   ├── theme.css                # CSS variables for theming
│   ├── types.ts                 # UI type definitions
│   ├── hooks/
│   │   └── useWebSocket.ts      # WebSocket connection hook
│   ├── components/
│   │   ├── ConfigPanel.tsx      # LLM + session config sidebar
│   │   ├── StrategyPanel.tsx    # Goal, bottom line, tone, context
│   │   ├── NegotiationFeed.tsx  # Chat message display
│   │   ├── MessageInput.tsx     # Send / AI Refine / AI Advise
│   │   ├── ApprovalBanner.tsx   # Two-step approve/decline flow
│   │   ├── SessionBrowser.tsx   # Session history sidebar
│   │   ├── Controls.tsx         # Start/stop/pause buttons
│   │   ├── ThemeToggle.tsx      # Dark/light toggle
│   │   └── Logo.tsx             # App logo
│   ├── constants/
│   │   ├── defaults.ts          # Default configs and provider lists
│   │   └── stateDisplay.ts      # State badge colors and labels
│   ├── styles/
│   │   └── shared.ts            # Shared form input styles
│   └── utils/
│       └── formatDate.ts        # Date/time formatting
└── data/                        # SQLite database (auto-created)
```

## Getting Started

### Prerequisites

- Node.js 20+
- One of: Anthropic API key, OpenAI API key, Ollama running locally, or Claude Code CLI installed

### Install & Run

```bash
npm install
npm run dev
```

This starts both the Vite dev server (UI) and the Node.js backend concurrently. Open `http://localhost:5173` in your browser.

### Configuration

1. Select your LLM provider and enter your API key in the config panel
2. Set your negotiation strategy (goal, bottom line, tone)
3. Paste the URL of the service provider's chat page
4. Click **Start**

The agent will launch a Playwright-controlled browser, navigate to the chat page, and begin negotiating.

## Tech Stack

- **Frontend**: React 19, Vite, CSS variables (no framework)
- **Backend**: Node.js, Express 5, WebSocket (ws)
- **Browser Automation**: Playwright via MCP (Model Context Protocol)
- **Database**: SQLite (better-sqlite3)
- **LLM Integration**: Direct API calls to Anthropic/OpenAI/Ollama with tool use
- **Language**: TypeScript throughout
