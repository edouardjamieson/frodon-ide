# Agent

A conversation with a coding agent, in a tile. Claude Code today, through a
driver that any other agent can sit beside.

## Goal

`claude` already runs in a terminal tile, and that works. What a terminal
cannot do is draw what the agent *did*: an edit is a wall of text rather than
a diff, a file it names is not a link, a question is a prompt you answer by
typing, and three agents in three shells give no sign which one is waiting
for you. The chat tile is that rendering, and nothing more — the agent is the
same program, with the same login, settings and `CLAUDE.md`.

It is model-agnostic by design, not by accident. The tile never learns which
agent it is talking to; adding Codex, or anything else, is a driver in main
and a member on `AgentKind`. ADR-0042.

## Where it lives

| Path | What it holds |
| --- | --- |
| `shared/agent.def.ts` | `AgentKind`, `AgentEvent`, `AgentAction` — the vocabulary every driver translates into |
| `main/agent/agent.def.ts` | `AgentDriver`, `AgentHost`, `AgentRun` — the contract a driver implements |
| `main/agent/agent.service.ts` | the registry: who owns which conversation, batching, approvals waiting on a click |
| `main/agent/agent-claude.service.ts` | the Claude driver — the only file that imports the Agent SDK or spells a Claude tool name |
| `main/agent/agent-environment.service.ts` | the login shell's `PATH`, and finding an executable on it |
| `main/agent/agent.constant.ts` | `FLUSH_MS`, `OUTPUT_LIMIT`, the probe timeouts |
| `renderer/src/lib/agent/` | the transcript store, `reduce`, and `useConversationLifetime` |
| `components/modules/agent/` | the transcript and composer, one row per entry, the model picker, and each agent's logo |
| `components/modules/window/window-agent.component.tsx` | the tab bar and the tile body |

## How it works

```
renderer                    main                         agent
───────                     ────                         ─────
agent:start {id, kind} ──>  startConversation
                            locate → driver.start ──>    claude (stream-json)
agent:send {id, text}  ──>  run.send ──────────────>     next user message
                            host.emit ◀── translated ◀── SDK messages
agent:events ◀── pooled 16ms ──┘
agent:respond {requestId}─> pending approval resolves ─> canUseTool answers
```

### One vocabulary, one driver per agent

Every agent speaks its own protocol, and the tile speaks none of them. A
driver's whole job is translation into `AgentEvent`: text arrived, an action
started, an action finished, an approval is open, a turn ended, the agent
exited — and, once, which models it can be switched to. An `AgentAction` is described by what it *does* — `change`, `command`,
`read`, `search`, `other` — because those are the five things the tile draws
differently. Claude's `Edit` and a Codex patch both become a `change` with a
before and an after.

The vocabulary is the size of the UI, not of any protocol. A protocol event
with no place on screen is dropped by its driver rather than carried "in
case", because a field nothing reads is a field every future driver has to
fill in.

Everything that is the same for every agent lives once, in
`agent.service.ts`: the registry keyed by the renderer's conversation id,
the window that owns each one, a frame of batching before events cross, and
approvals held open until a click. `DRIVERS` is a `Record<AgentKind, …>`, so a
new kind fails to compile until it has a driver.

### Found, not shipped

The Agent SDK is Claude Code driven over its stream-json protocol, and it
brings a 276 MB native binary per architecture with it. Frodon uses neither
the binary nor a copy of its own: `locate` finds the `claude` the person
already installed, and the SDK is pointed at it with
`pathToClaudeCodeExecutable`. The SDK itself is a devDependency, bundled into
main by Vite as plain JavaScript — its runtime imports are Node built-ins
only — so electron-builder never packages the optional binary. ADR-0043.

The executable is found on the **login shell's `PATH`**, asked once per run
by `loginEnvironment`. A Mac app started from the Dock inherits launchd's
`PATH`, which holds nothing a developer installed. The rest of the
environment is passed through untouched: Claude Code keeps its login in the
Keychain, and without `USER` and its siblings it answers "Not logged in".

### The conversation is a process, like a shell

The same ownership as the terminal, for the same reasons. The renderer names
the conversation (`nextConversationId`), main keys its registry by that name,
events go back to the window that asked and to no other, and a conversation
dies when its tab unmounts, when its window closes (`stopConversationsOf`),
or when the app quits (`disposeAgents`). Every conversation in a window stays
mounted and the inactive ones are hidden, so an agent halfway through a
change in the tab you clicked away from keeps going.

One difference matters: **no directory crosses.** `agent:start` takes an id
and a kind, and main starts the agent in the asking window's project,
resolved from the sender. A shell's `cwd` comes from the renderer; an agent
edits files where it runs, which makes its directory the most consequential
thing the channel could have been told.

### Approvals are a promise held in main

A driver that wants permission calls `host.ask(action, signal)` and awaits it.
The registry mints a request id, emits `approval`, and keeps the resolver
until one of four things settles it: `agent:respond`, an interrupt, the agent
withdrawing the question (its `signal` aborts), or the conversation stopping.
All four go through one `settle`, which also emits `approval-closed` — so a
card never outlives its question and a driver never awaits a promise nobody
will resolve.

The question is drawn on the action card it is about, not in a dialog. Claude
asks *before* it reports the call, so `reduce` adds the action to the
transcript when the approval arrives if it is not there yet.

Which actions are asked about is the agent's own business. No
`permissionMode` is passed, so Claude Code applies the person's settings
exactly as it would in a terminal.

### The transcript is a view

Main keeps no copy of what was said; the agent keeps its own. The renderer's
store holds each conversation's entries, its open approvals, its status and
what it has cost, and `reduce` in `lib/agent/agent.service.ts` is the only
thing that turns events into entries. Text arrives as deltas keyed by message
id and is appended; a message that never streamed — an API error, "Not logged
in" — arrives whole and is shown whole.

## User flows

### Starting a conversation

1. Pick **Agent** on an empty tile.
2. The tile mounts a conversation, which asks main to start it. Main finds
   `claude`, starts it in the project root, and says the conversation is
   ready — the status line shows the version. Which model is running
   appears after the first message: Claude says nothing, not even that,
   until it is spoken to.
3. If `claude` cannot be found, or no project is open, the reason is shown in
   the transcript and the composer is disabled.

### Talking to it

1. Type, and press Shift+Enter — the send button's tooltip says so. Enter
   breaks the line: a message to an agent is a list of steps more often than
   a line, and an Enter that sends cuts it off halfway.
2. The reply streams in. Tool calls appear as cards: a diff for a change, the
   command line for a command, a one-line receipt for a read or a search.
3. A card's file is a link: clicking it opens the file through `openFile`.
4. While a turn runs, the send button becomes a stop button, which interrupts
   the turn and answers every open question no.

### Answering a question

1. The card being asked about takes the accent and shows **Allow** and
   **Deny**. The tab's logo gets an accent dot, so a question in a tab
   behind another is visible from the tab bar.
2. Either answer goes to main, the card's buttons go away, and the agent
   carries on — or is told it was declined.

### Choosing a model

1. The model's name in the status line is a menu. It lists what the agent
   offers, which a driver asks for as soon as the agent starts — Claude
   answers in a fifth of a second, so the menu is there before anything has
   been typed.
2. Picking one applies to the replies that follow; a turn already running
   finishes on the model it started with. The menu stays open during a turn.
3. The status line shows the pick at once. Claude reports the model it runs
   again at the start of every turn, so the reported name catches up on the
   next one.
4. The choice belongs to the conversation: each tab can run on a different
   model, and a new conversation starts on the agent's own default.

### Several at once

1. `+` in the tab bar starts another conversation in the same tile. Splitting
   and picking **Agent** again puts one beside it.
2. A tab shows a spinner until its agent is up, then the agent's logo. The
   logo turns while the agent works, carries an accent dot while it waits
   for you, and fades once the conversation has ended.

## Rules

- **A logo keeps its own color.** `MARKS` in `agent-icon.component.tsx` is
  the one place a component writes a color instead of using a theme role: a
  mark recolored by the theme is no longer the mark. That is also why a
  waiting tab gets a dot rather than an accent-colored logo. A new
  `AgentKind` fails to compile until it has a mark.
- **Nothing outside `main/agent/agent-<name>.service.ts` knows an agent's
  names.** Not its tools, not its message types, not its SDK — otherwise the
  second driver needs a second tile.
- **No directory crosses on `agent:start`.** The root comes from
  `askingRoot(event)`; see the IPC rules in [ipc.md](../ipc.md).
- **Every approval settles through `settle`.** A path that resolves the
  driver's promise without emitting `approval-closed` leaves a card on screen
  asking about something already decided.
- **A deliberate close is not an error.** `pump` asks its own abort signal,
  not the thrown error — the SDK's abort error is a minified class of its own.
- **Never bundle an agent's binary.** The SDK stays a devDependency; moving it
  to `dependencies` would package 276 MB per architecture.

## Not there yet

- **A second driver.** Codex is the obvious one; its SDK has the same shape
  (a thin JS layer over a native binary). Its approvals are a policy rather
  than a callback per call, which the `ask` contract may have to bend for.
- **A download.** The plan in ADR-0043: an explicit path in user settings,
  then `PATH` if the version is compatible, then a copy Frodon fetches into
  `~/.frodon/agents/<kind>/<version>/` from the npm platform package, checked
  against its sha512 and pinned to the SDK's version.
- **Resuming a conversation after a restart.** Claude Code keeps sessions on
  disk and the SDK takes `resume`, but restoring means a driver-specific id in
  the layout file and replaying the transcript from the agent's storage. A
  saved agent tile comes back as one fresh conversation, like a terminal.
- **Markdown.** Replies are drawn as pre-wrapped text. A renderer is a new
  dependency and gets its own decision.
- **Workbench context.** An in-process MCP server in the driver could give the
  agent `open_file`, the selection and boards without the socket ADR-0027
  parked — the cost that made it not worth building is gone on this path.
- **Subagents.** Their traffic is dropped; the `Task` call and its result
  are shown, the conversation inside is not.
- **Choosing the agent.** One driver, so `DEFAULT_AGENT` is a constant. With
  two, the `+` becomes a choice and the default a user setting.
- **A keyboard shortcut** to open one.
- **A default model.** A pick lasts as long as its conversation. Remembering
  it means a user setting, and a model id from one agent is meaningless to
  another, so it would have to be kept per kind.

## See also

[terminal.md](terminal.md) · [workbench.md](workbench.md) ·
[decisions.md](../decisions.md) (ADR-0042, ADR-0043) · [ipc.md](../ipc.md)
