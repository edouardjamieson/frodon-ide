/**
 * The Claude Code driver.
 *
 * The only file in the app that imports the Agent SDK, and the only one that
 * knows Claude's tools by name. Everything it reports is translated into
 * `shared/agent.def.ts` on the way out — see ADR-0042 for why that boundary
 * exists before there is a second driver to need it.
 *
 * The SDK is Claude Code itself, driven over its stream-json protocol, so the
 * conversation behaves the way `claude` in a terminal tile does: same tools,
 * same `CLAUDE.md`, same settings, same login. What it does *not* use is the
 * binary the SDK would bring along. That is 276 MB per architecture; the copy
 * the person already installed is passed as `pathToClaudeCodeExecutable`
 * instead, and the SDK itself is bundled into main as plain JavaScript.
 * ADR-0043.
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  createSdkMcpServer,
  getSessionInfo,
  getSessionMessages,
  query,
  tool,
  type PermissionMode,
  type PermissionUpdate,
  type SDKMessage,
  type SessionMessage,
  type SDKUserMessage,
  type SlashCommand,
} from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { createLogger } from '@main/logger';
import type {
  AgentAction,
  AgentAttachment,
  AgentChange,
  AgentChoice,
  AgentCommand,
  AgentEvent,
  AgentQuestion,
  AgentTask,
  AgentTaskStep,
  AgentWorkbench,
} from '@shared/agent.def';
import {
  CLAUDE_DEFAULT_KEEP_DAYS,
  OUTPUT_LIMIT,
  VERSION_TIMEOUT_MS,
} from './agent.constant';
import type {
  AgentDriver,
  AgentHost,
  AgentRun,
  StartOptions,
} from './agent.def';
import { findExecutable, isExecutable } from './agent-environment.service';

const log = createLogger('agent');

export const claudeDriver: AgentDriver = {
  async locate(env, configured) {
    const about = {
      kind: 'claude' as const,
      configured: configured !== null,
      modes: MODES.map(({ id, label, description }) => ({
        id,
        label,
        description,
      })),
    };

    // A path in the settings is taken at its word or not at all: falling
    // back to `PATH` when it is wrong would run a copy the person did not
    // choose, and say nothing about the one they did.
    const path = configured
      ? (await isExecutable(configured))
        ? configured
        : null
      : await findExecutable('claude', env);
    if (!path) {
      return {
        ...about,
        status: 'missing',
        reason: configured
          ? `${configured}, set in Settings → Agents, is not an executable file.`
          : 'No `claude` on your PATH. Install Claude Code, or set its path in Settings → Agents.',
      };
    }

    const version = await versionOf(path, env);
    if (!version) {
      return {
        ...about,
        status: 'missing',
        reason: `Found ${path}, but it did not answer \`--version\`.`,
      };
    }

    return { ...about, status: 'ready', path, version };
  },

  start(options) {
    return startClaude(options);
  },

  async lastActive(cwd, session) {
    if (!SESSION_ID.test(session)) return null;
    try {
      // Looked for in `cwd` only. Claude files a session under the folder
      // it was had in, and one from elsewhere — a worktree, another project
      // — would not be found by `--resume` from here either.
      const info = await getSessionInfo(session, { dir: cwd });
      return info ? info.lastModified : null;
    } catch (error) {
      log.error(`could not look up claude session ${session}`, error);
      return null;
    }
  },

  async keepsFor(cwd) {
    // Every settings file Claude reads, lowest precedence first, so the last
    // one that says anything wins — the order Claude itself applies them in.
    // A managed file is an administrator's and outranks the rest.
    const configDir =
      process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude');
    const files = [
      join(configDir, 'settings.json'),
      join(cwd, '.claude', 'settings.json'),
      join(cwd, '.claude', 'settings.local.json'),
      MANAGED_SETTINGS[process.platform] ?? null,
    ];
    let days: number | null = CLAUDE_DEFAULT_KEEP_DAYS;
    for (const file of files) {
      if (!file) continue;
      const value = await cleanupPeriodIn(file);
      if (value !== undefined) days = value;
    }
    return days;
  },

  async history(cwd, session) {
    if (!SESSION_ID.test(session)) return null;
    try {
      // Asked first, because a session that is not there reads back as no
      // messages — the same answer as one that is there and empty.
      if (!(await getSessionInfo(session, { dir: cwd }))) return null;
      return replay(await getSessionMessages(session, { dir: cwd }));
    } catch (error) {
      log.error(`could not read claude session ${session}`, error);
      return null;
    }
  },
};

/** Where an administrator's Claude settings live, by platform. */
const MANAGED_SETTINGS: Partial<Record<NodeJS.Platform, string>> = {
  darwin: '/Library/Application Support/ClaudeCode/managed-settings.json',
  linux: '/etc/claude-code/managed-settings.json',
  win32: 'C:\\Program Files\\ClaudeCode\\managed-settings.json',
};

/**
 * `cleanupPeriodDays` in one settings file: the number of days, null for a
 * value that means Claude keeps nothing past a session or that Frodon cannot
 * read as a period, and undefined when the file does not say — missing,
 * unreadable, or silent on it.
 */
async function cleanupPeriodIn(
  file: string
): Promise<number | null | undefined> {
  try {
    const value = (
      JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
    )['cleanupPeriodDays'];
    if (value === undefined) return undefined;
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : null;
  } catch {
    return undefined;
  }
}

/**
 * What a Claude session id looks like. Narrower than `isSessionToken`,
 * because this driver knows its own format and nothing else should reach
 * `--resume`.
 */
const SESSION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `2.1.308 (Claude Code)` → `2.1.308`, or null if it would not say. */
function versionOf(
  path: string,
  env: Record<string, string>
): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      path,
      ['--version'],
      { env, timeout: VERSION_TIMEOUT_MS, encoding: 'utf8' },
      (error, stdout) => {
        const version = stdout?.trim().split(/\s+/)[0];
        if (error || !version) {
          log.error(`${path} --version failed`, error);
          resolve(null);
          return;
        }
        resolve(version);
      }
    );
  });
}

/**
 * The permission modes the picker offers, in Claude's own ids.
 *
 * Fixed here rather than asked for: the SDK lists models but not modes. Two
 * of Claude's are left out. `bypassPermissions` never asks about anything,
 * which is a choice to make in a settings file, not by a slip of the mouse
 * in a status line; `dontAsk` refuses whatever is not already allowed,
 * which in a tile built to answer questions reads as the agent being
 * broken. Either one set in the person's settings is still honoured, and
 * shown by its id.
 */
const MODES: (AgentChoice & { id: PermissionMode })[] = [
  {
    id: 'default',
    label: 'Ask',
    description: 'Asks before editing files or running commands',
  },
  {
    id: 'acceptEdits',
    label: 'Accept edits',
    description: 'Edits files without asking; still asks for commands',
  },
  {
    id: 'auto',
    label: 'Auto',
    description: 'Decides for itself, and asks only about risky actions',
  },
  {
    id: 'plan',
    label: 'Plan',
    description: 'Reads and plans, and changes nothing',
  },
];

function startClaude({
  cwd,
  path,
  env,
  host,
  resume,
  permissionMode,
}: StartOptions): AgentRun {
  // Checked against the modes this driver offers: the id is shape-checked
  // by the config sanitizer, not known to be one of Claude's.
  const startMode = MODES.find(({ id }) => id === permissionMode)?.id;

  const inbox = new Inbox<SDKUserMessage>();
  const abort = new AbortController();

  // Picked here rather than learnt from Claude's `init`, which only arrives
  // with the first reply: a conversation that knows its own id from the
  // start can be kept, and found again, without waiting on the agent. A
  // resumed conversation carries on under the id it already had.
  const session = resume && SESSION_ID.test(resume) ? resume : randomUUID();

  const conversation = query({
    // A stream rather than a string: one process for the whole conversation,
    // fed a message at a time, instead of a process per turn that has to
    // reload the session from disk before it can answer.
    prompt: inbox,
    options: {
      cwd,
      env,
      pathToClaudeCodeExecutable: path,
      ...(session === resume ? { resume: session } : { sessionId: session }),
      abortController: abort,
      // Claude Code's own system prompt. Left out, the SDK does not fall back
      // to it: it sends an empty custom prompt, and the agent introduces
      // itself as "a Claude agent, built on Anthropic's Claude Agent SDK" —
      // `CLAUDE.md` still arrives as context, but nothing tells it how to
      // work in a repository, when to reach for a skill, or that it keeps a
      // memory. The SDK records the prompt into the session on the first
      // request, so a conversation started without it keeps that empty prompt
      // on resume until it is compacted. `docs/learned.md`.
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      // Named rather than left to the default. Omitted means "all of them" in
      // this version, but it meant "none" in an earlier one, and without
      // `project` there is no `CLAUDE.md`, no project skills and no
      // `.claude/settings.json` — a quiet loss a dependency bump could bring
      // back.
      settingSources: ['user', 'project', 'local'],
      // Frodon's own tools, in process: no socket, no second program, and
      // gone with the conversation. ADR-0047.
      mcpServers: { [WORKBENCH_SERVER]: workbenchServer(host) },
      // Deltas, so the reply is drawn as it is written rather than appearing
      // whole once the turn is over.
      includePartialMessages: true,
      // A mode only when Frodon's settings name one. Otherwise none, so the
      // person's own Claude settings choose it, exactly as they would for
      // `claude` in a terminal. Whatever that mode decides to ask about
      // arrives here.
      ...(startMode ? { permissionMode: startMode } : {}),
      canUseTool: async (
        toolName,
        input,
        { signal, toolUseID, suggestions, suppressAlwaysAllowRule }
      ) => {
        // Frodon's own tools go ahead without a card: neither changes a
        // file — one reads what the person already has on screen, the other
        // puts a file on it. Allowed here rather than through
        // `allowedTools`, which would approve them before this callback is
        // consulted and has the SDK warn, on every start, that it did.
        if (WORKBENCH_TOOL_NAMES.has(toolName))
          return { behavior: 'allow', updatedInput: input };

        // Claude's own "don't ask again": the rules its terminal would save
        // if that option were picked there. Withheld when Claude says the
        // rule would grant more than this one action, and for a question,
        // which is answered rather than allowed.
        const standing =
          suppressAlwaysAllowRule || toolName === 'AskUserQuestion'
            ? []
            : (suggestions ?? []);
        const reply = await host.ask(
          actionOf(toolUseID, toolName, input),
          signal,
          standingLabel(standing, cwd)
        );
        if (!reply.allow) {
          return {
            behavior: 'deny',
            message:
              toolName === 'AskUserQuestion'
                ? 'The user dismissed the question without answering.'
                : 'Declined in Frodon.',
          };
        }
        const always = reply.always === true && standing.length > 0;
        // A mode granted for the rest of the conversation is a switch the
        // picker should show now; Claude would only say so with the next
        // turn's `init`.
        const mode = always
          ? standing.find((update) => update.type === 'setMode')
          : undefined;
        if (mode?.type === 'setMode')
          host.emit({ type: 'mode', mode: mode.mode });
        return {
          behavior: 'allow',
          updatedInput:
            toolName === 'AskUserQuestion'
              ? withAnswers(input, reply.answers ?? [])
              : input,
          // Handed back as Claude wrote them, so the rule lands where
          // Claude's terminal would have put it — the project's
          // `.claude/settings.local.json` for a command, this session for
          // a mode — and reads the same in `/permissions`.
          ...(always ? { updatedPermissions: standing } : {}),
        };
      },
      stderr: (data) => log.info(`claude: ${data.trimEnd()}`),
    },
  });

  void pump(conversation, host, abort.signal);

  host.emit({
    type: 'modes',
    modes: MODES.map(({ id, label, description }) => ({
      id,
      label,
      description,
    })),
  });

  // The models and the commands are answered by the handshake the SDK makes
  // on its own, so they arrive in a fraction of a second — before the first
  // message, which is what lets a model be chosen, or a command typed, before
  // anything has been said. Everything else Claude reports waits until it is
  // spoken to.
  conversation
    .initializationResult()
    .then(({ models, commands }) => {
      host.emit({
        type: 'models',
        models: models.map((model) => ({
          id: model.value,
          label: model.displayName,
          description: model.description,
        })),
      });
      host.emit({ type: 'commands', commands: commandsOf(commands) });
    })
    .catch((error: unknown) => {
      // A process that died on start says so through `pump`; this is only
      // the picker going missing, and is not worth a second notice.
      if (!abort.signal.aborted) log.error('claude models unavailable', error);
    });

  return {
    session,
    send(text, attachments) {
      inbox.push({
        type: 'user',
        message: { role: 'user', content: contentOf(text, attachments, cwd) },
        parent_tool_use_id: null,
      });
    },
    async interrupt() {
      await conversation.interrupt();
    },
    async setModel(model) {
      // `default` is a row in Claude's list, but the SDK's documented way to
      // say "whatever the settings say" is no model at all — so the row is
      // sent as that, rather than trusting the alias to round-trip.
      await conversation.setModel(model === 'default' ? undefined : model);
    },
    async setMode(mode) {
      // Checked against the list, because the id came from the renderer and
      // the SDK's own type is the only thing that would otherwise vouch for
      // it.
      const known = MODES.find((offered) => offered.id === mode);
      if (known) await conversation.setPermissionMode(known.id);
    },
    close() {
      inbox.close();
      abort.abort();
    },
  };
}

/**
 * A message and what is attached to it, as Claude reads a user turn.
 *
 * Files and folders are listed under the text by their path from the
 * project root, for Claude to open with its own tools — that is how it
 * reads the project already, and a list it can act on beats a file pasted
 * whole into the turn. Images go as image blocks after the text, so Claude
 * sees them without a tool call. A message with neither stays a string,
 * which is what it was before attachments existed.
 */
function contentOf(
  text: string,
  attachments: AgentAttachment[],
  cwd: string
): SDKUserMessage['message']['content'] {
  if (attachments.length === 0) return text;

  const paths = attachments.flatMap((attachment) => {
    if (attachment.kind !== 'path') return [];
    const relative = relativePath(cwd, attachment.path);
    return [attachment.isDir ? `- ${relative}/ (folder)` : `- ${relative}`];
  });
  const images = attachments.flatMap((attachment) =>
    attachment.kind === 'image'
      ? [
          {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: attachment.mediaType,
              data: attachment.data,
            },
          },
        ]
      : []
  );

  const written = [
    text,
    paths.length > 0
      ? `Attached from the project — read these:\n${paths.join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return [
    ...(written ? [{ type: 'text' as const, text: written }] : []),
    ...images,
  ];
}

/** `path` from `root`, or `.` for the root itself. */
function relativePath(root: string, path: string): string {
  if (path === root) return '.';
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

/** Reads the conversation to its end, translating as it goes. */
async function pump(
  conversation: AsyncIterable<SDKMessage>,
  host: AgentHost,
  closing: AbortSignal
): Promise<void> {
  const translator = new Translator(host);
  try {
    for await (const message of conversation) translator.read(message);
    host.emit({ type: 'exited', error: null });
  } catch (error) {
    // An abort is how `close` ends it, and is not an error worth showing.
    // Asked of our own signal rather than of the error: the SDK throws its
    // own class for it, minified, so neither its name nor `instanceof` can be
    // relied on to say "aborted".
    if (closing.aborted) {
      host.emit({ type: 'exited', error: null });
      return;
    }
    log.error('claude conversation failed', error);
    host.emit({
      type: 'exited',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Claude's stream, in Frodon's words.
 *
 * Stateful only to tie deltas to the message they belong to: a text delta
 * carries no message id, so the id from the `message_start` before it is
 * remembered. And it remembers which messages streamed at all, because some
 * do not — an API error or "Not logged in" arrives as a whole assistant
 * message with no deltas ahead of it, and would otherwise never be shown.
 *
 * Subagent traffic (`parent_tool_use_id` set) is not drawn as conversation.
 * Its tool calls and what it says between them become the steps of a task,
 * shown under the call that started it, because the conversation inside it
 * is the subagent's, and drawing it inline would bury the one the person is
 * having. What it concluded arrives as the task's summary.
 *
 * Tasks are kept here, whole, because Claude reports them in pieces — a
 * start, progress, a patch, a notification — and the tile should not have to
 * know how to put them back together.
 */
class Translator {
  private current: string | null = null;
  private readonly streamed = new Set<string>();
  private readonly tasks = new Map<string, AgentTask>();

  // Only `emit`: a translator reports, and never asks or reaches into the
  // workbench — which is what lets `replay` run one with nothing behind it.
  constructor(private readonly host: Pick<AgentHost, 'emit'>) {}

  read(message: SDKMessage): void {
    switch (message.type) {
      case 'system':
        if (message.subtype === 'init') {
          this.host.emit({
            type: 'started',
            version: message.claude_code_version,
            model: message.model ?? null,
            // Reported at the start of every turn, so a switch made in the
            // picker is confirmed by the next one.
            mode: message.permissionMode ?? null,
            session: message.session_id,
          });
        } else if (message.subtype === 'commands_changed') {
          // A skill found partway through — the agent went into a folder
          // with skills of its own, or `/reload-skills` was run.
          this.host.emit({
            type: 'commands',
            commands: commandsOf(message.commands),
          });
        } else if (message.subtype === 'task_started') {
          // Steps heard before the start were kept under the parent call's
          // id; they move to the real task, and the stand-in goes.
          const early = message.tool_use_id
            ? this.tasks.get(message.tool_use_id)
            : undefined;
          if (early) this.tasks.delete(early.id);
          this.task(message.task_id, {
            actionId: message.tool_use_id ?? null,
            description: message.description,
            status: 'running',
            steps: early?.steps ?? [],
          });
        } else if (message.subtype === 'task_progress') {
          this.task(message.task_id, { activity: message.description });
        } else if (message.subtype === 'task_updated') {
          const { status, description, error } = message.patch;
          this.task(message.task_id, {
            ...(status ? { status: TASK_STATUS[status] } : {}),
            ...(description ? { description } : {}),
            ...(error ? { summary: error } : {}),
          });
        } else if (message.subtype === 'task_notification') {
          this.task(message.task_id, {
            status: TASK_STATUS[message.status],
            summary: message.summary || null,
          });
        }
        return;

      case 'stream_event': {
        if (message.parent_tool_use_id) return;
        const event = message.event;
        if (event.type === 'message_start') {
          this.current = event.message.id;
        } else if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta' &&
          this.current
        ) {
          this.streamed.add(this.current);
          this.host.emit({
            type: 'text',
            messageId: this.current,
            text: event.delta.text,
          });
        }
        return;
      }

      case 'assistant': {
        if (message.parent_tool_use_id) {
          this.steps(message.parent_tool_use_id, message.message.content);
          return;
        }
        const { id, content } = message.message;
        for (const block of content) {
          if (block.type === 'text' && !this.streamed.has(id)) {
            this.host.emit({ type: 'text', messageId: id, text: block.text });
          } else if (block.type === 'tool_use') {
            this.host.emit({
              type: 'action',
              action: actionOf(
                block.id,
                block.name,
                block.input as Record<string, unknown>
              ),
            });
          }
        }
        return;
      }

      case 'user': {
        if (message.parent_tool_use_id) return;
        const { content } = message.message;
        if (typeof content === 'string') return;
        for (const block of content) {
          if (block.type !== 'tool_result') continue;
          this.host.emit({
            type: 'action-result',
            actionId: block.tool_use_id,
            ok: !block.is_error,
            output: trimmed(textOf(block.content)),
          });
        }
        return;
      }

      case 'result':
        this.host.emit({
          type: 'turn-ended',
          ok: message.subtype === 'success' && !message.is_error,
          error:
            message.subtype === 'success'
              ? message.is_error
                ? message.result
                : null
              : message.subtype.replaceAll('_', ' '),
          costUsd: message.total_cost_usd ?? null,
        });
        return;

      default:
        // Rate limits, hooks, status pings: Claude's business, with nowhere
        // on the tile to go yet. See the note on `AgentEvent`.
        return;
    }
  }

  /** Applies a change to a task, creating it if this is the first word. */
  private task(id: string, change: Partial<AgentTask>): void {
    const current = this.tasks.get(id) ?? {
      id,
      actionId: null,
      description: '',
      status: 'running',
      activity: null,
      steps: [],
      summary: null,
    };
    const next: AgentTask = { ...current, ...change };
    // What it was doing stops being true once it has stopped.
    if (next.status !== 'running') next.activity = null;
    this.tasks.set(id, next);
    this.host.emit({ type: 'task', task: next });
  }

  /**
   * A subagent's tool calls, added to the task its parent call started.
   *
   * Found by the parent call's id, which is what Claude tags the subagent's
   * messages with. A subagent heard from before its `task_started` — or one
   * run in the foreground by a version of Claude that sends none — gets a
   * task of its own under that id, so its steps are not lost.
   */
  private steps(parent: string, content: unknown): void {
    if (!Array.isArray(content)) return;
    const added = content.flatMap(
      (block: Record<string, unknown>): AgentTaskStep[] => {
        if (
          block['type'] === 'tool_use' &&
          typeof block['id'] === 'string' &&
          typeof block['name'] === 'string'
        ) {
          const input = (block['input'] ?? {}) as Record<string, unknown>;
          return [
            {
              kind: 'call',
              text: actionOf(block['id'], block['name'], input).title,
            },
          ];
        }
        // What it says between calls — "the handler is in two places, checking
        // both" — is what tells a subagent making progress from one lost.
        if (block['type'] === 'text' && typeof block['text'] === 'string') {
          const text = block['text'].trim();
          return text ? [{ kind: 'message', text }] : [];
        }
        return [];
      }
    );
    if (added.length === 0) return;

    const existing = [...this.tasks.values()].find(
      (task) => task.actionId === parent
    );
    const id = existing?.id ?? parent;
    this.task(id, {
      actionId: parent,
      description: existing?.description || 'Subagent',
      steps: [...(existing?.steps ?? []), ...added],
    });
  }
}

/** Claude's task states, in the four the tile draws. */
const TASK_STATUS: Record<
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'killed'
  | 'paused'
  | 'stopped',
  AgentTask['status']
> = {
  pending: 'running',
  running: 'running',
  paused: 'running',
  completed: 'done',
  failed: 'failed',
  killed: 'stopped',
  stopped: 'stopped',
};

/**
 * A stored session, as the events a live one would have sent.
 *
 * Claude stores the same messages it streams, less the deltas, so the live
 * `Translator` reads them unchanged — the assistant's text then arrives
 * whole, the way a message that never streamed does. What it does not
 * handle is the person's own words, which live never come back from the
 * agent: those are picked out here and sent as `prompt`.
 *
 * Some of what Claude stores as the person speaking is Claude talking to
 * itself — the output of a slash command, a reminder it injected — and is
 * left out, by the markers it wraps those in.
 *
 * A call with no result is one the conversation was stopped in the middle
 * of. Live, its card would wait for a result; here, nothing is coming, so
 * it is closed as not finished rather than left spinning.
 */
function replay(messages: SessionMessage[]): AgentEvent[] {
  const events: AgentEvent[] = [];
  // A stored conversation asks nothing. The question it asked, if it was
  // left open, is answered no by the agent itself when it resumes.
  const translator = new Translator({ emit: (event) => events.push(event) });

  for (const stored of messages) {
    if (stored.parent_tool_use_id) continue;
    if (stored.type === 'user') {
      const text = promptOf(stored.message);
      if (text) events.push({ type: 'prompt', text });
    }
    if (stored.type === 'user' || stored.type === 'assistant') {
      translator.read({
        type: stored.type,
        message: stored.message,
        parent_tool_use_id: null,
      } as unknown as SDKMessage);
    }
  }

  const finished = new Set(
    events.flatMap((event) =>
      event.type === 'action-result' ? [event.actionId] : []
    )
  );
  for (const event of [...events]) {
    if (event.type === 'action' && !finished.has(event.action.id)) {
      events.push({
        type: 'action-result',
        actionId: event.action.id,
        ok: false,
        output: 'Did not finish.',
      });
    }
  }
  return events;
}

/** The name Claude knows Frodon's tools under: `mcp__frodon__…`. */
const WORKBENCH_SERVER = 'frodon';
const WORKBENCH_TOOLS = ['editor_state', 'open_file'] as const;
/** The same tools by the names Claude calls them. */
const WORKBENCH_TOOL_NAMES: ReadonlySet<string> = new Set(
  WORKBENCH_TOOLS.map((name) => `mcp__${WORKBENCH_SERVER}__${name}`)
);

/**
 * The tools that let an agent see and point at the workbench it runs in.
 *
 * One server per conversation, because the server is the conversation's
 * window: what `editor_state` reads and where `open_file` opens are that
 * window's editors and nobody else's. Both are worded for the model —
 * when to call them matters as much as what they return — and loaded up
 * front rather than behind tool search, so "this file" is understood
 * without the agent having to go looking for a way to see it.
 */
function workbenchServer(host: AgentHost) {
  return createSdkMcpServer({
    name: WORKBENCH_SERVER,
    alwaysLoad: true,
    instructions:
      'You are running inside Frodon, a desktop IDE. The person can see an ' +
      'editor beside this conversation. When they say "this", "here", "the ' +
      'selected code" or "this file" without naming one, call editor_state ' +
      'to see what they mean. To show them a place in the code, call ' +
      'open_file rather than only naming it.',
    tools: [
      tool(
        'editor_state',
        "What the person has open in Frodon's editor right now: each editor " +
          'pane with its tabs, which tab is showing, which pane has the focus, ' +
          'and the text they have selected (or the line the caret is on). ' +
          'Paths are relative to the project.',
        {},
        async () => {
          const workbench = await host.workbench.read();
          return {
            content: [
              {
                type: 'text',
                text: workbench
                  ? describeWorkbench(workbench)
                  : 'The editor could not be read.',
              },
            ],
          };
        }
      ),
      tool(
        'open_file',
        "Opens a file of the project in Frodon's editor so the person can " +
          'see it, scrolled to a line. For showing them something — not for ' +
          'reading a file yourself; use Read for that.',
        {
          path: z
            .string()
            .describe('Relative to the project root, or absolute inside it.'),
          line: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('1-based line to scroll to.'),
        },
        async ({ path, line }) => {
          const refused = await host.workbench.open(path, line ?? null);
          return {
            content: [
              {
                type: 'text',
                text:
                  refused ?? `Opened ${path}${line ? ` at line ${line}` : ''}.`,
              },
            ],
            ...(refused ? { isError: true } : {}),
          };
        }
      ),
    ],
  });
}

/** `editor_state`'s answer, as text a model reads well. */
function describeWorkbench(workbench: AgentWorkbench): string {
  if (workbench.editors.length === 0) return 'No editor is open.';

  return workbench.editors
    .map((editor, index) => {
      const lines = [
        `Editor ${index + 1}${editor.focused ? ' (focused)' : ''}: ` +
          (editor.active ? `showing ${editor.active}` : 'no file showing'),
      ];
      const others = editor.files.filter((file) => file !== editor.active);
      if (others.length > 0) lines.push(`Other tabs: ${others.join(', ')}`);

      const { selection } = editor;
      if (selection) {
        const range =
          selection.fromLine === selection.toLine
            ? `line ${selection.fromLine}`
            : `lines ${selection.fromLine}-${selection.toLine}`;
        lines.push(
          selection.text
            ? `Selected in ${selection.path}, ${range}:\n\`\`\`\n${selection.text}\n\`\`\``
            : `Caret in ${selection.path} at ${range}, nothing selected.`
        );
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * What taking Claude's suggested rules would mean, as the approval card's
 * button says it, or null when there are none.
 *
 * Worded from the one update that matters most to a person: a rule for a
 * command or a tool, then a mode, then a folder. The others ride along —
 * a `mkdir` comes with a rule for the command and access to the folder it
 * makes — and are granted with it, as Claude's terminal grants them.
 */
function standingLabel(
  updates: PermissionUpdate[],
  cwd: string
): string | null {
  const rules = updates.find(
    (update) => update.type === 'addRules' && update.behavior === 'allow'
  );
  if (rules?.type === 'addRules' && rules.rules.length > 0) {
    const what = rules.rules
      .map(({ toolName, ruleContent }) =>
        !ruleContent
          ? toolName
          : toolName === 'Bash'
            ? `\`${ruleContent}\``
            : `${toolName}(${ruleContent})`
      )
      .join(', ');
    return `Always allow ${what}${WHERE[rules.destination]}`;
  }

  const mode = updates.find((update) => update.type === 'setMode');
  if (mode?.type === 'setMode') {
    const label = MODES.find((offered) => offered.id === mode.mode)?.label;
    return mode.mode === 'acceptEdits'
      ? `Allow every edit${WHERE[mode.destination]}`
      : `Switch to ${label ?? mode.mode}${WHERE[mode.destination]}`;
  }

  const folders = updates.find((update) => update.type === 'addDirectories');
  if (folders?.type === 'addDirectories' && folders.directories.length > 0) {
    const names = folders.directories
      .map((dir) => relativePath(cwd, dir))
      .join(', ');
    return `Allow access to ${names}${WHERE[folders.destination]}`;
  }

  return null;
}

/** Where a granted rule is kept, as the end of the button's sentence. */
const WHERE: Record<PermissionUpdate['destination'], string> = {
  localSettings: ' in this project',
  projectSettings: ' in this project, for everyone',
  userSettings: ' in every project',
  session: ' in this conversation',
  cliArg: ' in this conversation',
};

/**
 * Claude's command list, as the composer offers it.
 *
 * Taken as Claude reports it rather than trimmed to a list of what works
 * outside a terminal: the list is already the one for this mode — no
 * `/login`, no `/resume` — and `/context` or `/compact` answer as ordinary
 * assistant text. Two things are dropped. A name starting `__` is Claude's
 * plumbing, run by Claude itself and never by a person. And a name can
 * appear twice, Claude's own and a skill of the same name; Claude runs its
 * own, so that is the row kept.
 */
function commandsOf(commands: SlashCommand[]): AgentCommand[] {
  const byName = new Map<string, SlashCommand>();
  for (const command of commands) {
    if (command.name.startsWith('__')) continue;
    const existing = byName.get(command.name);
    if (!existing || (command.builtin && !existing.builtin))
      byName.set(command.name, command);
  }
  return [...byName.values()].map((command) => ({
    name: command.name,
    description: command.description,
    hint: command.argumentHint || null,
  }));
}

/** What Claude wraps its own words in when it stores them as the person's. */
const INJECTED = [
  '<command-',
  '<local-command-',
  '<system-reminder>',
  '<user-prompt-submit-hook>',
  'Caveat: ',
];

/** The person's words in a stored user message, or '' when it has none. */
function promptOf(message: unknown): string {
  const content = (message as { content?: unknown } | null)?.content;
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .flatMap((part) => {
              const block = part as { type?: string; text?: unknown };
              return block.type === 'text' && typeof block.text === 'string'
                ? [block.text]
                : [];
            })
            .join('\n')
        : '';
  const trimmed = text.trim();
  if (INJECTED.some((marker) => trimmed.startsWith(marker))) return '';
  return trimmed;
}

/**
 * One of Claude's tool calls, as an action the tile can draw.
 *
 * The one place Claude's tool names are spelled. A tool not listed here is
 * still shown — as `other`, with its name — so a tool added to Claude Code
 * tomorrow appears in the transcript rather than vanishing from it.
 */
function actionOf(
  id: string,
  name: string,
  input: Record<string, unknown>
): AgentAction {
  const str = (key: string): string | undefined =>
    typeof input[key] === 'string' ? (input[key] as string) : undefined;
  const path = str('file_path') ?? str('notebook_path');

  switch (name) {
    case 'Edit':
      return {
        id,
        kind: 'change',
        title: `Edit ${path ?? 'a file'}`,
        path,
        changes: path
          ? [
              {
                path,
                before: str('old_string') ?? '',
                after: str('new_string') ?? '',
              },
            ]
          : [],
      };
    case 'MultiEdit': {
      const edits = Array.isArray(input['edits']) ? input['edits'] : [];
      const changes: AgentChange[] = path
        ? edits.map((edit) => {
            const e = edit as Record<string, unknown>;
            return {
              path,
              before:
                typeof e['old_string'] === 'string' ? e['old_string'] : '',
              after: typeof e['new_string'] === 'string' ? e['new_string'] : '',
            };
          })
        : [];
      return {
        id,
        kind: 'change',
        title: `Edit ${path ?? 'a file'}`,
        path,
        changes,
      };
    }
    case 'Write':
      // `before` is empty even when the file existed: `Write` reports what it
      // will write, not what it replaces, and reading the file here to fill
      // it in would be a second source of truth racing the first.
      return {
        id,
        kind: 'change',
        title: `Write ${path ?? 'a file'}`,
        path,
        changes: path
          ? [{ path, before: '', after: str('content') ?? '' }]
          : [],
      };
    case 'Bash':
      return {
        id,
        kind: 'command',
        title: str('description') ?? 'Run a command',
        command: str('command') ?? '',
      };
    case 'Read':
      return { id, kind: 'read', title: `Read ${path ?? 'a file'}`, path };
    case 'Grep':
    case 'Glob':
      return {
        id,
        kind: 'search',
        title: `${name} ${str('pattern') ?? ''}`.trim(),
        path: str('path'),
      };
    case 'AskUserQuestion': {
      const questions = questionsOf(input);
      return {
        id,
        kind: 'question',
        title:
          questions.length === 1
            ? (questions[0] as AgentQuestion).question
            : `${questions.length} questions`,
        questions,
      };
    }
    case `mcp__${WORKBENCH_SERVER}__editor_state`:
      return { id, kind: 'read', title: 'Look at the editor' };
    case `mcp__${WORKBENCH_SERVER}__open_file`: {
      const line = input['line'];
      const shown = str('path');
      return {
        id,
        kind: 'other',
        title: `Show ${shown ?? 'a file'}${typeof line === 'number' ? `:${line}` : ''} in the editor`,
        path: shown,
      };
    }
    case 'Agent':
    case 'Task':
      // `Task` is the name older versions of Claude Code gave it.
      return {
        id,
        kind: 'other',
        title: `${str('subagent_type') ?? 'Subagent'}: ${
          str('description') ?? 'a task'
        }`,
      };
    case 'WebFetch':
      return { id, kind: 'other', title: `Fetch ${str('url') ?? 'a page'}` };
    case 'WebSearch':
      return {
        id,
        kind: 'other',
        title: `Search the web for ${str('query') ?? '…'}`,
      };
    default:
      return { id, kind: 'other', title: name, path };
  }
}

/** `AskUserQuestion`'s input, as questions. Anything malformed is skipped. */
function questionsOf(input: Record<string, unknown>): AgentQuestion[] {
  const raw = Array.isArray(input['questions']) ? input['questions'] : [];
  return raw.flatMap((item): AgentQuestion[] => {
    const q = item as Record<string, unknown>;
    if (typeof q['question'] !== 'string') return [];
    const options = Array.isArray(q['options']) ? q['options'] : [];
    return [
      {
        question: q['question'],
        header: typeof q['header'] === 'string' ? q['header'] : '',
        multiple: q['multiSelect'] === true,
        options: options.flatMap((option) => {
          const o = option as Record<string, unknown>;
          return typeof o['label'] === 'string'
            ? [
                {
                  label: o['label'],
                  description:
                    typeof o['description'] === 'string'
                      ? o['description']
                      : '',
                },
              ]
            : [];
        }),
      },
    ];
  });
}

/**
 * The answers, put where Claude reads them.
 *
 * Allowing `AskUserQuestion` is not enough: the tool answers with whatever
 * it finds in `answers` on its own input, keyed by question text, and with
 * none it reports "The user did not answer the questions" — which is what a
 * bare Allow produced. The tile answers in order; the keys are added here,
 * from the same input the questions were read from.
 */
function withAnswers(
  input: Record<string, unknown>,
  answers: string[]
): Record<string, unknown> {
  const keyed: Record<string, string> = {};
  questionsOf(input).forEach(({ question }, index) => {
    const answer = answers[index]?.trim();
    if (answer) keyed[question] = answer;
  });
  return { ...input, answers: keyed };
}

/** A tool result's content, flattened to text. Images are named, not sent. */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      const block = part as { type?: string; text?: string };
      if (block.type === 'text') return block.text ?? '';
      return block.type ? `[${block.type}]` : '';
    })
    .join('\n');
}

function trimmed(text: string): string {
  if (text.length <= OUTPUT_LIMIT) return text;
  return `${text.slice(0, OUTPUT_LIMIT)}\n… ${text.length - OUTPUT_LIMIT} more characters`;
}

/**
 * The conversation's input: an async iterable fed from outside.
 *
 * The SDK pulls the next message when it is ready for one, and a person types
 * when they are ready to — so messages wait here until pulled, and a pull
 * waits here until something is typed.
 */
class Inbox<T> implements AsyncIterable<T> {
  private readonly queue: T[] = [];
  private waiting: ((result: IteratorResult<T>) => void) | null = null;
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve({ value: item, done: false });
    } else {
      this.queue.push(item);
    }
  }

  close(): void {
    this.closed = true;
    this.waiting?.({ value: undefined, done: true });
    this.waiting = null;
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const item = this.queue.shift();
        if (item !== undefined)
          return Promise.resolve({ value: item, done: false });
        if (this.closed)
          return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => {
          this.waiting = resolve;
        });
      },
    };
  }
}
