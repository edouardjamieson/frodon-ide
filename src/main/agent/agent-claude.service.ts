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
import {
  query,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from '@main/logger';
import type {
  AgentAction,
  AgentChange,
  AgentQuestion,
} from '@shared/agent.def';
import { OUTPUT_LIMIT, VERSION_TIMEOUT_MS } from './agent.constant';
import type {
  AgentDriver,
  AgentHost,
  AgentRun,
  StartOptions,
} from './agent.def';
import { findExecutable } from './agent-environment.service';

const log = createLogger('agent');

export const claudeDriver: AgentDriver = {
  async locate(env) {
    const path = await findExecutable('claude', env);
    if (!path) {
      return {
        kind: 'claude',
        status: 'missing',
        reason:
          'No `claude` on your PATH. Install Claude Code, then reopen Frodon.',
      };
    }

    const version = await versionOf(path, env);
    if (!version) {
      return {
        kind: 'claude',
        status: 'missing',
        reason: `Found ${path}, but it did not answer \`--version\`.`,
      };
    }

    return { kind: 'claude', status: 'ready', path, version };
  },

  start(options) {
    return startClaude(options);
  },
};

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

function startClaude({ cwd, path, env, host }: StartOptions): AgentRun {
  const inbox = new Inbox<SDKUserMessage>();
  const abort = new AbortController();

  const conversation = query({
    // A stream rather than a string: one process for the whole conversation,
    // fed a message at a time, instead of a process per turn that has to
    // reload the session from disk before it can answer.
    prompt: inbox,
    options: {
      cwd,
      env,
      pathToClaudeCodeExecutable: path,
      abortController: abort,
      // Deltas, so the reply is drawn as it is written rather than appearing
      // whole once the turn is over.
      includePartialMessages: true,
      // No `permissionMode`: the person's own settings choose it, exactly as
      // they would for `claude` in a terminal. Whatever that mode decides to
      // ask about arrives here.
      canUseTool: async (toolName, input, { signal, toolUseID }) => {
        const reply = await host.ask(
          actionOf(toolUseID, toolName, input),
          signal
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
        return {
          behavior: 'allow',
          updatedInput:
            toolName === 'AskUserQuestion'
              ? withAnswers(input, reply.answers ?? [])
              : input,
        };
      },
      stderr: (data) => log.info(`claude: ${data.trimEnd()}`),
    },
  });

  void pump(conversation, host, abort.signal);

  // The models are answered by the handshake the SDK makes on its own, so
  // they arrive in a fraction of a second — before the first message, which
  // is what lets a model be chosen before anything has been said. Everything
  // else Claude reports waits until it is spoken to.
  conversation
    .initializationResult()
    .then(({ models }) =>
      host.emit({
        type: 'models',
        models: models.map((model) => ({
          id: model.value,
          label: model.displayName,
          description: model.description,
        })),
      })
    )
    .catch((error: unknown) => {
      // A process that died on start says so through `pump`; this is only
      // the picker going missing, and is not worth a second notice.
      if (!abort.signal.aborted) log.error('claude models unavailable', error);
    });

  return {
    send(text) {
      inbox.push({
        type: 'user',
        message: { role: 'user', content: text },
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
    close() {
      inbox.close();
      abort.abort();
    },
  };
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
 * Subagent traffic (`parent_tool_use_id` set) is dropped. The `Task` call
 * that started it is shown, and so is its result; the conversation inside it
 * is the subagent's, and drawing it inline would bury the one the person is
 * having.
 */
class Translator {
  private current: string | null = null;
  private readonly streamed = new Set<string>();

  constructor(private readonly host: AgentHost) {}

  read(message: SDKMessage): void {
    switch (message.type) {
      case 'system':
        if (message.subtype === 'init') {
          this.host.emit({
            type: 'started',
            version: message.claude_code_version,
            model: message.model ?? null,
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
        if (message.parent_tool_use_id) return;
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
        // Rate limits, hooks, task progress, status pings: Claude's business,
        // with nowhere on the tile to go yet. See the note on `AgentEvent`.
        return;
    }
  }
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
