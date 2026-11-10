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
| `main/agent/agent-environment.service.ts` | the login shell's environment, and finding an executable on its `PATH` |
| `main/agent/agent-favorite.service.ts` | the favorites, `~/.frodon/agent-favorites.json` |
| `main/agent/agent-workbench.service.ts` | what an agent may read from, and show in, its window's editors |
| `main/agent/agent-attachment.service.ts` | `cleanAttachments`: what a message carries, checked before a driver sees it |
| `main/agent/agent.constant.ts` | `FLUSH_MS`, `OUTPUT_LIMIT`, the probe timeouts, how many sessions are listed |
| `renderer/src/lib/agent/` | the transcript store, `reduce`, and `useConversationLifetime` |
| `components/modules/agent/` | the transcript and composer, one row per entry, the pickers for model and permission mode, the `/` menu, a reply drawn as markdown, the favorite button, attachment chips and the project picker, and each agent's logo |
| `components/modules/window/window-agent.component.tsx` | the tab bar and the tile body |
| `components/modules/workbench/sidebar/favorites/` | the Favorites view: open, rename, remove |
| `renderer/src/lib/window/window.hook.ts` | `useOpenFavorite` and `useConversationRevealEffect`: the tab already on a favorite, in any window, or a new one |

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
exited — and, once each, which models and which permission modes it can be
switched to. An `AgentAction` is
described by what it *does* — `change`, `command`, `read`, `search`,
`question`, `other` — because those are the six things the tile draws
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

**The version is checked, and only warned about.** The SDK names the Claude
Code it was released against (`claudeCodeVersion` in its `package.json`),
which the build writes into main as `__CLAUDE_CODE_VERSION__`. `locate`
compares the installed version with it: the same, a patch apart — which in
practice works, and Settings → Agents says so — or a different major or
minor, where the protocol may have moved, and the agent tile's warning strip
says so before anything fails. It never refuses to start: a newer CLI
usually still speaks an older SDK's protocol, and a check that blocked
would block the update that fixes it.

The agent runs in the **login shell's environment**, asked once per run by
`loginEnvironment`. A Mac app started from the Dock inherits launchd's, whose
`PATH` holds nothing a developer installed and which has none of what the
profile exports — so the executable would not be found, and the commands the
agent runs would miss the tokens, `AWS_PROFILE` and database hosts the same
commands see in a terminal tile. The shell is run with `-ilc 'env -0'`, and
what it reports is laid over Electron's own environment rather than replacing
it: Claude Code keeps its login in the Keychain, and without `USER` and its
siblings it answers "Not logged in". The shell's own bookkeeping — `PWD`,
`OLDPWD`, `SHLVL`, `_` — is left behind. An export added to the profile
reaches a new agent after a restart, not before.

### The status line says how full the context is

After every turn the driver asks Claude how full its context window is —
`getContextUsage` with `detail: 'summary'`, which answers from the last
response's usage in a few milliseconds — and the status line shows it beside
the cost: "Context 34%", in red from 80%, with the token counts in its
tooltip. That is the number the terminal's footer warns with as a
conversation nears compaction.

The terminal's custom status line — a command named in Claude's
`statusLine` setting, handed the session as JSON — is not run. Its input
format is Claude Code's and undocumented in the SDK, and a status line
built on a guessed format would be worse than none.

### A `!` command runs in your shell, and the agent reads it

A message that starts with `!` is not sent to the agent: main runs it with
`$SHELL -lc` in the project, in the login environment the agent gets
(`agent-shell.service.ts`), draws it as a command card titled "Ran in your
shell", and hands the command and its output to the driver. Claude's driver
appends that to the session as the terminal's bash mode does —
`<bash-input>`, `<bash-stdout>` — with `shouldQuery: false`, so no turn
starts and Claude reads it with the next message that asks something. The
card shows the end of the output, which is where a build says what broke;
the agent gets up to 30,000 characters of it. A command still running after
two minutes is stopped with its process group. Replayed, the stored command
becomes its card again.

Running one is not an approval, because it is not the agent's action: it
is what the person would have typed into a terminal tile.

### Rewinding is a new process on the same session

A message the person sends carries an id minted in the renderer, which
Claude stores as the message's own; one replayed from history carries the
id Claude stored. Those ids are what a rewind names, and the tile offers one
on any message that has an id, between turns.

Code goes back first, while the Claude process that took the backups is
still running: every conversation starts with `enableFileCheckpointing`, so
`rewindFiles` can put the files the agent changed since that message back
as they were. It is asked once as a dry run, because only the preview says
which files it touches, then for real. The conversation goes back by
replacing the process: the driver closes it and resumes the same session
with `resumeSessionAt` set to whatever Claude stored just before the
message, so Claude has no memory of anything after it. The session id stays
the same, so a favorite still points at it. Rewinding to the first message
is starting over, in a fresh session `started` reports. The old process's
end is marked as replaced, so it does not end the conversation.

### Settings, per agent

`~/.frodon/config.json` holds an `agents` entry per kind — user scope,
because an install path and how much you like to be asked are facts about
your machine, and per kind because Claude's permission modes mean nothing
to any other agent. Two fields, each absent unless chosen:

| Field | Written | Absent |
| --- | --- | --- |
| `path` | an absolute path to the executable | the first one on the login shell's `PATH` |
| `permissionMode` | one of the driver's mode ids | the agent's own settings decide |

Main reads them fresh for every `locate` and every start, so a change applies
to the next tab without a restart. A configured path is taken at its word or
not at all: when it is not an executable file, the tile says so, rather than
quietly running whichever copy `PATH` finds. A mode is checked against the
driver's `MODES` before it is passed. A resumed conversation starts from
them too — it is a new process carrying on a stored session. The renderer
seeds a new tab's mode picker from the same file, so it shows the default
before the agent has said anything.

An agent tile asks for the agent's availability when it mounts and again
whenever that agent's path in the settings changes, and shows a strip above
its conversations when the agent cannot be started — the reason, and a
button to Settings → Agents. Above them rather than in one, because it is
about the next tab: a conversation already running keeps the agent it
started with.

The settings page has no conversation to ask, so `agent:availability`
carries the driver's modes and whether the path came from the settings.

**There is no default model.** Claude's models are Claude's list, known to
Frodon only from the handshake a running conversation makes, so a settings
field could be a dropdown only by starting `claude` to ask, and otherwise
had to be free text unlike the field beside it. It was taken out rather
than kept as the odd one. Claude's own `model` setting still decides what a
new conversation runs, and the picker changes it per conversation.

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

A driver that wants permission calls `host.ask(action, signal, always)` and
awaits it.
The registry mints a request id, emits `approval`, and keeps the resolver
until one of four things settles it: `agent:respond`, an interrupt, the agent
withdrawing the question (its `signal` aborts), or the conversation stopping.
All four go through one `settle`, which also emits `approval-closed` — so a
card never outlives its question and a driver never awaits a promise nobody
will resolve.

The question is drawn on the action card it is about, not in a dialog. Claude
asks *before* it reports the call, so `reduce` adds the action to the
transcript when the approval arrives if it is not there yet.

**A question is an approval with something to say.** An agent asking the
person something — Claude's `AskUserQuestion` — comes through the same
`ask`, as a `question` action carrying its options, and is answered with an
`AgentReply` rather than a yes: `answers`, one string per question, in the
order asked. Order and not keys, because how an agent keys its answers is
its own business; the Claude driver puts them back under the question texts
in `withAnswers`. A bare yes is not an answer — Claude then reports that the
person did not answer. The reply crosses from the renderer, so `respondTo`
rebuilds it from a boolean and strings before any driver sees it.

**A yes can stand.** With each request Claude sends the rules its own
terminal would save under "Yes, and don't ask again" — `Bash(npm pkg *)` for
the project, "accept edits" for the session, a folder it may write to. The
driver words the most important one as a sentence, "Always allow `npm pkg *`
in this project", and that sentence is the `always` on the approval and the
label of the card's third button. Taking it replies `always: true`, and the
driver hands Claude's rules back unchanged as `updatedPermissions`, so they
land where the terminal would have put them — `.claude/settings.local.json`
for a project rule, the session for a mode — and `/permissions` lists them
the same way. Nothing on this side writes a settings file. When Claude marks
a request `suppressAlwaysAllowRule` — the rule would grant more than the
action asked about — there is no third button. A mode granted this way is
reported as a `mode` event at once, so the picker shows it before the next
turn would.

Which actions are asked about is the agent's own business. A conversation
starts with no `permissionMode`, so Claude Code begins in whatever the
person's settings say, exactly as it would in a terminal; the mode picker
changes it from there, for that conversation only.

### Models and modes are choices the tile cannot read

Both pickers are one `ChoicePicker` over a list of `AgentChoice` — an id, a
label, a description — that the driver offers and gets ids back from. The
tile never asks whether a mode is the one that edits without asking or a
model the expensive one: that knowledge would be Claude's, and an agent
that draws its lines elsewhere — Codex's sandbox levels and approval
policies — would need a second tile. A driver that offers no list gets no
picker.

Claude's models come from the SDK's handshake; its modes do not, so
`MODES` in the driver lists them. Two are left out on purpose:
`bypassPermissions`, which never asks about anything and is a choice for a
settings file rather than a status line, and `dontAsk`, which refuses
whatever is not already allowed and in this tile would read as the agent
being broken. Either one set in the person's settings is still honoured and
shown by its id.

A model and a mode are tracked differently for one reason. Claude reports
its model under another name than the menu's (`claude-sonnet-5-5` for
`sonnet`), so the pick is kept beside the report in `chosenModel`. It
reports its mode in the same ids it offers, so a pick stands in for the
report in `mode` until the next turn confirms it.

### Commands are offered, and sent as typed

A message that starts with `/` opens a menu of what the agent can run: its
own commands and every skill it found — the user's, the project's, a
plugin's. The list is a `commands` event, sent from the same handshake as
the models, so it is there before the first message, and again whenever
Claude reports `commands_changed`. The tile ranks it and helps the name get
typed — `rankCommands` puts a name that starts with the query ahead of one
that contains it, and both ahead of a description that does — and that is
all it does: the message goes to the agent as the text in the box, and
Claude decides what `/audit-pr 412` means.

This is the only way to reach most of a project's skills. A skill whose
frontmatter says `disable-model-invocation: true` is left out of the listing
Claude shows the model, so the agent will not reach for it and will not
count it when asked what it has; it runs only when a person types it. In a
terminal the `/` menu is how anyone finds those. See
[learned.md](../learned.md).

The list is taken as Claude gives it, not trimmed to what makes sense in a
tile: it is already the list for this mode, and commands like `/context`
and `/compact` answer as assistant text, which the tile draws like any
reply. `/clear` is the one with a consequence: Claude starts a new session
under the same tab and reports it on the next `init`. The renderer and the
registry both follow the new id, so a favorite marked afterwards keeps what
came after the clear, and "open in another tab" guards the session the tab
is actually on.

### Attachments are project paths, or images handed over

A message can carry files and folders from the project, and images. They
reach the agent two ways, because they are two different things to it. A
**path** goes as a list under the text — "Attached from the project — read
these" — for the agent to open with its own tools: it reads the project
that way already, and a folder cannot be pasted into a message anyway. An
**image** goes as the image, an image block after the text, because the
point of a screenshot is that the agent sees it, and a screenshot has no
path to read.

**Nothing outside the project is named.** The picker behind **Add** is the
project's tree, ranked the way go-to-file ranks it (`collectFiles` with
folders, `rankFiles`), not the system's open dialog — which also offered the
whole disk and looked unfinished beside everything else. Images arrive as
bytes from a paste or a drop, so a file elsewhere on the machine reaches the
agent only by somebody handing it over. `cleanAttachments` in main checks
both again: a path must resolve inside the asking window's project and
exist, and whether it is a folder is asked of the disk; an image must be
PNG, JPEG, GIF or WebP and at most 5 MB, the API's own limit.

The list's wording is load-bearing. With a bare "Attached:", a message
holding a screenshot and a file had the agent take "the attached file" to
mean the image, and never read the file.

### Favorites are a choice; the agent already stores everything

Claude Code writes every conversation to `~/.claude/projects/` whether or not
anything asks it to, so Frodon stores no transcript. What it stores is the
choice: a conversation the person marked a **favorite**, under a name, as a
pointer — the agent's kind and its `session` token — in
`~/.frodon/agent-favorites.json`, filed by project root. In the home
directory and not the project, because the token points into this
machine's `~/.claude` and would point a teammate at nothing. ADR-0044.

Nothing is a favorite until somebody says so, and nothing else is offered.
The agent's own list of past conversations was tried as a "Recent" half of
the menu and dropped: it is long and mostly throwaway — every terminal
`claude` in the project is on it — and listing it is the clutter favorites
exist to avoid. A conversation never marked can still be reached with
`claude --resume` in a terminal.

The token is the driver's and opaque to everyone else. Claude's driver
**picks it before spawning** — `sessionId` on a new conversation, `resume` on
an old one — so `AgentRun.session` is known when `start` returns and main
puts it on its own `started`. Waiting for Claude's `init` would mean waiting
for the first reply. A resumed conversation carries on under the id it had,
so a favorite stays valid however many times it is reopened.

Each listing asks the driver when the agent last wrote to each favorite
(`lastActive`), because the agent deletes conversations on its own schedule
and a favorite that has gone should say so. Every change is broadcast as
`agent:favorites-changed` to every window, which re-reads its own project's
list — so a heart clicked in one window shows on the tab and in the sidebar
of another.

### Reopening, and never twice

Reopening is `agent:start` with `resume`. Main asks the driver for the
conversation's `history` *in the asking window's project* — a token from
another project finds nothing — and refuses the start if there is none.
Otherwise the history is emitted as ordinary events ahead of `started`, and
the tile draws it through the same `reduce` as a live turn. Claude's
`replay` runs stored messages through the live `Translator`, adds the
person's own words as `prompt` events — which are never sent live, since
the renderer draws a typed message itself — skips what Claude stored as the
person but wrote itself (slash-command output, injected reminders), and
closes any call that never got a result as not finished.

**One session, one tab, across every window.** Two tabs on one session
would be two agents writing one conversation, each overwriting what the
other said next. Only main sees every window's conversations, so the
sidebar asks it first: `agent:reveal` finds the live conversation holding
the session, sends `agent:reveal` to the window that has it — whose
`useConversationRevealEffect` shows the tab and focuses its tile — and
raises that window. Only when nobody has it does the sidebar open a tab.
`startConversation` refuses a resume whose session is already held, which
covers the race between the question and the start.

A token crosses from the renderer, so it is checked three times: by
`isSessionToken` in `shared/` (short, letters, digits, `-` and `_`), by
`startConversation`, and by the driver against its own format — a Claude
id is a UUID or it never reaches `--resume`.

### The transcript is a view

Main keeps no copy of what was said; the agent keeps its own. The renderer's
store holds each conversation's entries, its open approvals, its status and
what it has cost, and `reduce` in `lib/agent/agent.service.ts` is the only
thing that turns events into entries. Text arrives as deltas keyed by message
id and is appended; a message that never streamed — an API error, "Not logged
in" — arrives whole and is shown whole.

### The agent can see the editor, and point at it

Each conversation brings two tools of Frodon's own, served in process by the
driver (ADR-0047). `editor_state` tells the agent what its window's editors
show: every editor tile with its tabs, which one is focused, and the
selection in the tab on screen — or the caret's line, since "here" is a
reference too. `open_file` shows the person a project file at a line. Both
are allowed without a card: neither changes anything. They are allowed in
`canUseTool` rather than listed in `allowedTools`, which would approve them
before the callback is consulted and makes the SDK warn about it on every
start. The server also tells
the agent it is running in an IDE beside an editor, so "what does this do?"
with a block selected is answered about the block.

Nothing is pushed. When the agent calls `editor_state`, main asks the
conversation's window (`agent:workbench-request`), which answers from the
window store and from each editor tile's own CodeMirror state, read through
`selectionOf`; main accepts the answer only from that window, makes every
path relative to the project, drops any outside it, and trims a selection
past 20,000 characters. `open_file` is checked the other way: the agent's
path must land on a file inside the project, or the agent is told why not.
The window then opens it through `openFile`, which routes it to an editor
the way any other open does.

### The agent can read the terminals

`terminal_output` gives the agent the last 200 lines of each terminal tab in
its window, which is showing and which has the focus — for "why did that
fail?" about a command run in a terminal tile, or what a server is logging.
It is the same question-and-answer as `editor_state`, now one kind among
several (`AgentWorkbenchAsk`): each terminal tab registers a reader of its
own xterm buffer with `provideTerminalOutput`, nothing is copied until the
agent asks, and main keeps at most twelve tabs and the last 16,000
characters of each.

### The agent can show a commit

`show_in_git` opens the git window for the person — at a commit's detail
when the agent gives a hash, or at the uncommitted changes when it gives
none. The hash is the agent's, so main checks it twice before anything
opens: its shape, since it becomes an argument to `git`, and with
`git rev-parse --verify` in the project, so a misremembered hash is
answered with "not a commit in this repository" rather than an empty pane.
The window then opens or focuses the git window, picks the history or the
commit tab, and opens the commit's detail through `openCommitDetail`.

### The agent can read a board and draw on it

`list_boards`, `read_board` and `draw_on_board` let the agent sketch a
diagram for the person. A board's own format is geometry for a canvas, so
the agent is shown each element as one line — `rectangle at (100, 100), 160×80`, `text at (147, 125): "main"` — and draws in the same terms: text
and boxes by their corner and size, arrows from one point to another.
`agent-board.service.ts` turns those into elements, in the canvas's default
brush and with an arrow seated the way `normalizeElement` seats a drawn
one, and refuses the whole drawing if one shape is wrong. Main checks the
board exists first, since a missing board reads as an empty one and a
drawing would quietly create it.

Reading and drawing go through the window, not the file: a board open in a
tile has strokes not yet saved, and its next autosave would overwrite
anything written behind it. So the window reads the open session, and adds
the agent's shapes to it in one `commit` — one undo takes the drawing back
out. A board not open in the window is read and written as a file.

### Work handed off is drawn under the call that started it

A subagent, or a command left running in the background, is a **task**:
Claude reports it in pieces — `task_started`, `task_progress`,
`task_updated`, `task_notification` — and tags the subagent's own messages
with the id of the call that launched it. The driver's `Translator` puts
those back together into one `AgentTask` and sends it whole on every change;
the renderer keeps tasks by that call's id, and the call's card draws its
task: what it is doing now and its latest three steps while it runs, then
"Done" with the steps and its report folded away. A step is the subagent's
tool call run through `actionOf`, so it reads like any card's title, or
something the subagent said between calls — "the handler is in two places,
checking both" — in italics, one line while it runs and whole once folded
open. The step count counts only the calls.

A task no card on screen started — a hook's, or one whose call never
arrived — has nowhere to be drawn under, so while it runs it is a line in a
strip above the composer, with what it is doing; when it stops, the strip
loses it and the transcript gains one line saying how it ended, with its
summary (`isBackground`, `runningBackground`).

In Claude Code 2.1.309 a subagent can run in the background: the `Agent`
call returns at once with "Async agent launched", the turn ends, and the
work happens after. So the card's own tick waits for the task, not for the
call's result, and when the task finishes Claude starts a turn by itself to
read it. That turn is marked `working` by `reduce` as soon as it says
something, so it streams with a stop button like a turn that was sent. See
[learned.md](../learned.md).

### A reply is drawn as markdown, from a tree and never from HTML

A reply goes through `@lezer/markdown`, the parser behind the editor's `.md`
mode, and `Markdown` turns the tree into elements: headings, lists and task
lists, quotes, tables with their columns aligned as the `|:-:|` row says,
inline code and fenced blocks. A `[text][ref]` link — or `[text][]`, or
`[text]` — points where the reply's `[ref]: url` says, wherever in the
reply that is defined, and the definitions themselves are not drawn. Nothing on the way is
an HTML string, so a reply that contains `<script>` shows the text
`<script>`. ADR-0046.

A fenced block is highlighted in the language its fence names, with the
editor's grammars and the editor's colors: both read `SYNTAX_TAGS`, and the
block's classes point at the theme's `--fd-syntax-*` properties, so a theme
switch reaches it without a render. A grammar not yet fetched leaves the
block plain for the moment the fetch takes. Hovering a block shows a copy
button in its corner, which copies the code without its fence.

A link never navigates the window it is in. A web address opens in the
person's browser; a path opens in the editor at the line it names. An image
is drawn as a link to it rather than fetched.

**A path in backticks is a link too**, when it is a file in the project —
`src/main/index.ts:42` opens the file scrolled to line 42. Agents name
files that way far more often than with link syntax. `fileReference` reads
the line from `:42`, `:42:7`, `:42-60`, `#L42` and `#L42-L60`, takes a
relative, `./` or absolute-inside-the-project path, and checks the result
against the project's files: `config.json` in a sentence about some other
program stays text. The set it checks against is built once per tree and
shared by every reply (`useFindFile`), so a path the agent has just created
becomes a link when the watcher sees the file.

`Markdown` is memoized on its text. Every delta re-renders the transcript,
and without the memo each one would parse every earlier reply again; with
it, only the reply being written is parsed. A reply half-written is half a
document, and is drawn as one: an open fence runs to the end until its close
arrives.

## User flows

### Starting a conversation

1. Pick **Agent** on an empty tile, or press `mod+shift+i` anywhere. The
   shortcut adds a tab the way opening a file does: to the focused agent
   tile, else to any agent tile, else to an empty tile, else to a new one.
   The permission picker starts on the default from Settings → Agents,
   when there is one.
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
4. Type `/` to see the commands and skills the agent can run. Typing
   narrows the list; the arrows move through it; Tab or Enter puts the name
   in the box with a space after it, ready for arguments; Escape closes it
   until the text changes. Nothing is sent until Shift+Enter.
5. While a turn runs, a line at the foot of the transcript says so: the
   agent's logo, pulsing, with **Thinking…**, **Writing…**, **Working…**
   while one of its calls runs, or "waiting for you" on an approval — and
   how long the turn has taken, so a long think does not read as a hang.
6. While a turn runs, the send button becomes a stop button, which interrupts
   the turn and answers every open question no.

### Running a command yourself

1. Start the message with `!` — `!pnpm test`. The box turns the project's
   color and says the command runs in your shell.
2. Shift+Enter runs it. It appears as a command card with its output, and
   nothing is sent to the agent yet — so the tile stays idle: the card's
   event is marked `byPerson`, and the rule that wakes an idle conversation
   when an action arrives (a turn Claude began by itself) skips it. Without
   that the tile showed a stop button for a turn nobody would ever end.
3. The next message you send is read with that output in front of the agent
   — "why did that fail?" needs nothing else.

### Rewinding

1. Between turns, hover a message you sent and click the arrow beside it.
2. Pick **Rewind conversation and code**, **Rewind conversation only**, or
   **Restore code only**.
3. For the first two, the message and everything after it leave the
   transcript, the agent forgets them, and the message comes back into the
   box with its attachments, ready to be asked another way. A line says
   how many files were put back. **Restore code only** leaves the
   conversation as it is and says what it restored.

### Allowing an action

1. The card being asked about takes the accent and shows **Allow** and
   **Deny**. The tab's logo gets an accent dot, so a question in a tab
   behind another is visible from the tab bar.
2. When the agent offers a standing permission, a third button says what it
   grants — "Always allow `npm pkg *` in this project", "Allow every edit in
   this conversation". Clicking it allows this action and saves the rule, so
   the next one goes ahead without a card.
3. Any answer goes to main, the card's buttons go away, and the agent
   carries on — or is told it was declined.

### Answering the agent

1. When the agent asks something, its card shows the question, a chip
   naming it, the options it suggests as buttons — a hover shows what each
   means — and a line to write an answer of one's own.
2. One question with one answer to pick is answered by clicking the
   option. Several questions, several picks, or a written answer wait for
   **Answer**, or Enter in the line.
3. **Skip** declines; the agent is told the question was dismissed and
   carries on without it. The answer it was given shows under the card's
   Output.

### Choosing how much it asks

1. The shield in the status line is the permission mode: **Ask**, **Accept
   edits**, **Auto** or **Plan**, each described in the menu.
2. It reads "Permissions" until the first turn: the starting mode comes
   from the person's Claude Code settings, and Claude says which only once
   spoken to. A pick made before then applies to the first message.
3. A switch applies from the agent's next action, and the next turn
   confirms it.

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

### Attaching files and screenshots

1. **Add**, beside Send, opens a search over the project's files and
   folders — with nothing typed, the files most recently looked at. Arrows
   and Enter, or a click, attach one; it appears as a chip above the
   message.
2. Paste a screenshot into the message, or drop images onto the composer,
   and each appears as a thumbnail. Anything that is not an image, or is
   over 5 MB, is refused with a line saying why.
3. Type `@` in the message and the same search opens over the composer,
   narrowing as the name is typed. Tab or Enter puts the file's path in the
   sentence and attaches the file — both, so "compare `a.ts` with `b.ts`"
   still reads and the agent is still told to read them. An `@` only counts
   at the start of a word, so an email address opens nothing.
4. Drag a file or folder from the explorer onto the composer to attach it.
5. A chip's × takes it off. A message can be only attachments.
6. On the sent message, the chips stay: a file's opens it in the editor.

### Marking a favorite

1. Once something has been said, **Add to favorites** appears under the
   message box, beside Send. Before that it is disabled, and its tooltip
   says why.
2. One click marks it, named after the first message — usually what the
   conversation is about. The heart fills, and the tab shows the name with
   a heart in place of "Agent 2".
3. Clicking the filled heart takes it off the favorites. The agent's copy
   is untouched either way.

### Reopening one

1. The heart in the sidebar's rail, or `mod+shift+h`, opens **Favorites**:
   each conversation by name, with when it was last active and when Claude
   Code will delete it — "deleted in 27 days", in red for the last week.
   The tooltip gives the date and names the setting that decides it.
2. Clicking one brings forward the tab already on it — in this window or
   another, which is raised — or opens a new tab that draws the
   conversation as it was and carries on from there.
3. Double-click, or the row's `…` menu, renames it. **Remove from
   favorites** takes it off the list.
4. A favorite the agent no longer has is greyed and says "No longer
   available"; it cannot be opened, only removed.
5. A favorite left open in a tab is open again after a restart: the layout
   remembers the favorite tabs of each agent tile and which was in front,
   and each comes back drawn but **asleep**: its history is read from
   Claude's record (`agent:history`), and no agent starts until the box is
   clicked into or a message is sent — so a launch with five favorites open
   starts nothing. A tab that was not a favorite is not brought back,
   and a tile left with none comes back as an empty tile in the same place —
   a conversation nobody marked is one nobody said was worth returning to.

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
- **A standing permission is the agent's own rule, handed back.** The
  driver never writes `.claude/settings*.json` and never builds a rule of its
  own; it returns what Claude suggested, or nothing.
- **Every approval settles through `settle`.** A path that resolves the
  driver's promise without emitting `approval-closed` leaves a card on screen
  asking about something already decided.
- **A deliberate close is not an error.** `pump` asks its own abort signal,
  not the thrown error — the SDK's abort error is a minified class of its own.
- **Never bundle an agent's binary.** The SDK stays a devDependency; moving it
  to `dependencies` would package 276 MB per architecture.
- **Frodon stores no transcript.** A favorite is a token; a copy of what was
  said would be a second store disagreeing with the agent's.
- **Ask main before opening a favorite.** `useOpenFavorite` reveals first;
  a tab opened without asking can put a second agent on a session another
  window is using.
- **A session token is the driver's to read.** The renderer compares it and
  hands it back; only the driver that issued it knows its format.
- **An attached path is checked in main, not trusted.** It must resolve
  inside the asking window's project; an image is checked against the
  formats and size the API takes, so a bad paste fails in the composer and
  not as a failed turn.
- **Claude starts as Claude Code.** `systemPrompt` is the `claude_code`
  preset and `settingSources` names all three; dropping either leaves an
  agent that has the project's rules in context but not the prompt that makes
  it follow them. See [learned.md](../learned.md).
- **`prompt` is for replay only.** A driver that echoed live messages as
  `prompt` would draw every message twice.

## Not there yet

- **A second driver.** Codex is the obvious one; its SDK has the same shape
  (a thin JS layer over a native binary). Its approvals are a policy rather
  than a callback per call, which the `ask` contract may have to bend for.
- **A download.** The rest of the plan in ADR-0043, now that the explicit
  path in user settings exists: `PATH` only if the version is compatible,
  then a copy Frodon fetches into
  `~/.frodon/agents/<kind>/<version>/` from the npm platform package, checked
  against its sha512 and pinned to the SDK's version.
- **A favorite surviving the agent's cleanup.** It does not: Claude deletes
  sessions after 30 days by default (`cleanupPeriodDays`), and a favorite
  then reads as gone. The row says when that will be — the driver's
  `keepsFor` reads `cleanupPeriodDays` from Claude's settings files in
  their order of precedence, managed last — but cannot stop it. Preventing that means copying transcripts, which is
  the storage this design set out not to own.
- **The name in Claude's own list.** `renameSession` could write a
  favorite's name where `claude --resume` shows it. Left out: it writes into the
  agent's store, and nothing here needs it yet.
- **Attachments in a reopened conversation.** A replayed message shows its
  text, with the attached paths as the list the agent was sent; its images
  are not drawn.
- **An approval open when the app quit.** It comes back as a card without
  buttons, closed as not finished; the agent asks again if it still needs
  to.
- **More markdown.** Most HTML entities show as written, and a table's
  columns line up by its cells as the parser found them, so a row with an
  empty cell can shift its alignment by one.
- **A board open in another window.** A drawing goes into the board open in
  the conversation's own window, or to the file; the same board open in a
  second window does not see it until reopened, and could save over it.
- **A subagent's approvals in its own card.** What a subagent asks to do is
  asked on an ordinary card in the transcript, not under the task it
  belongs to.
- **Choosing the agent.** One driver, so `DEFAULT_AGENT` is a constant. With
  two, the `+` becomes a choice and the default a user setting.
- **A pick that becomes the default.** The pickers change one conversation;
  making a mode the default means opening Settings → Agents, and a model
  has no default of Frodon's at all — see "Settings, per agent".

## See also

[terminal.md](terminal.md) · [workbench.md](workbench.md) ·
[decisions.md](../decisions.md) (ADR-0042, ADR-0043, ADR-0044, ADR-0045) ·
[ipc.md](../ipc.md)
