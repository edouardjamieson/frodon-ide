/**
 * What an agent may know about, and do to, the workbench it is running in.
 *
 * Two things, both addressed to the window a conversation lives in: read
 * what its editors are showing, and show the person a file. The first is a
 * question main cannot answer itself — the editor's tabs and selection are
 * the renderer's, and main holds none of it — so it is asked across, once,
 * and the answer comes back on `agent:workbench`. The second is a push.
 *
 * Everything that comes back is the renderer's word, and the paths in it go
 * to an agent; everything that goes out is the agent's word, and the path in
 * it goes to the editor. Both are checked here, against the conversation's
 * project, because this is the one place both are seen.
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { webContents } from 'electron';
import type { BoardElement, BoardRef } from '@shared/board.def';
import type {
  AgentEditorTile,
  AgentSelection,
  AgentTerminal,
  AgentWorkbench,
  AgentWorkbenchAsk,
} from '@shared/agent.def';
import {
  MAX_TERMINALS,
  SELECTION_LIMIT,
  TERMINAL_OUTPUT_LIMIT,
  WORKBENCH_TIMEOUT_MS,
} from './agent.constant';

interface Pending {
  senderId: number;
  /** Rebuilds the window's answer by the rule for what was asked. */
  resolve: (raw: unknown) => void;
}

/** Questions asked of a window and not yet answered, by request id. */
const pending = new Map<string, Pending>();

/**
 * Asks a window one of the questions it can answer, and cleans the answer.
 *
 * Resolves null when the window is gone or does not answer in time — an
 * agent waiting on a window that has closed should hear "nothing", not hang.
 */
function askWindow<T>(
  senderId: number,
  ask: AgentWorkbenchAsk,
  clean: (raw: unknown) => T
): Promise<T | null> {
  const target = webContents.fromId(senderId);
  if (!target || target.isDestroyed()) return Promise.resolve(null);

  const requestId = randomUUID();
  return new Promise((done) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      done(null);
    }, WORKBENCH_TIMEOUT_MS);
    pending.set(requestId, {
      senderId,
      resolve: (raw) => {
        clearTimeout(timer);
        pending.delete(requestId);
        done(clean(raw));
      },
    });
    target.send('agent:workbench-request', { requestId, ask });
  });
}

/** What a window's editors show, with paths relative to `root`. */
export function readWorkbench(
  senderId: number,
  root: string
): Promise<AgentWorkbench | null> {
  return askWindow(senderId, { kind: 'editors' }, (raw) =>
    cleanWorkbench(raw, root)
  );
}

/** The recent output of each terminal tab in a window. */
export function readTerminals(
  senderId: number
): Promise<AgentTerminal[] | null> {
  return askWindow(senderId, { kind: 'terminals' }, cleanTerminals);
}

/**
 * A window's answer. Ignored unless it is the window that was asked, and
 * rebuilt field by field by the question's own rule: it came from the
 * renderer, and it is going to an agent.
 */
export function answerWorkbench(
  senderId: number,
  requestId: string,
  raw: unknown
): void {
  const question = pending.get(requestId);
  if (!question || question.senderId !== senderId) return;
  question.resolve(raw);
}

function cleanTerminals(raw: unknown): AgentTerminal[] {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_TERMINALS) : [];
  return list.flatMap((entry): AgentTerminal[] => {
    const t = entry as Record<string, unknown> | null;
    if (!t || typeof t['output'] !== 'string') return [];
    const output = t['output'];
    return [
      {
        focused: t['focused'] === true,
        showing: t['showing'] === true,
        // The end, where the last command and what it said are.
        output:
          output.length > TERMINAL_OUTPUT_LIMIT
            ? output.slice(output.length - TERMINAL_OUTPUT_LIMIT)
            : output,
      },
    ];
  });
}

/**
 * Shows the person a file in the conversation's window, at a line.
 *
 * Answers why not, or null when it was sent. The path is the agent's: it may
 * be relative to the project or absolute, and it must land on a file inside
 * the project — an agent can read anywhere its own tools let it, but what it
 * puts in front of the person is the project's.
 */
export async function showFile(
  senderId: number,
  root: string,
  path: string,
  line: number | null
): Promise<string | null> {
  const absolute = resolve(root, path);
  if (!inside(root, absolute)) return `${path} is not inside the project.`;
  try {
    if (!(await stat(absolute)).isFile()) return `${path} is not a file.`;
  } catch {
    return `${path} does not exist.`;
  }

  const target = webContents.fromId(senderId);
  if (!target || target.isDestroyed()) return 'The window has closed.';
  target.send('agent:open-file', {
    path: absolute,
    line: line && line > 0 ? Math.floor(line) : null,
  });
  return null;
}

/** Whether `path` is `root` or under it. */
function inside(root: string, path: string): boolean {
  const base = resolve(root);
  return path === base || path.startsWith(base + sep);
}

/**
 * A path from the renderer, as the agent should see it: relative to the
 * project, or null for anything outside it — a file opened from elsewhere is
 * the person's business, not the agent's.
 */
function shown(root: string, path: unknown): string | null {
  if (typeof path !== 'string' || !isAbsolute(path)) return null;
  const absolute = resolve(path);
  return inside(root, absolute) ? relative(root, absolute) || '.' : null;
}

function cleanWorkbench(raw: unknown, root: string): AgentWorkbench {
  const editors = Array.isArray((raw as { editors?: unknown })?.editors)
    ? ((raw as { editors: unknown[] }).editors as unknown[])
    : [];
  return {
    editors: editors.flatMap((tile): AgentEditorTile[] => {
      const t = tile as Record<string, unknown>;
      const files = Array.isArray(t['files'])
        ? t['files'].flatMap((file) => shown(root, file) ?? [])
        : [];
      return [
        {
          files,
          active: shown(root, t['active']),
          focused: t['focused'] === true,
          selection: cleanSelection(t['selection'], root),
        },
      ];
    }),
  };
}

function cleanSelection(raw: unknown, root: string): AgentSelection | null {
  const s = raw as Record<string, unknown> | null;
  if (!s) return null;
  const path = shown(root, s['path']);
  const from = s['fromLine'];
  const to = s['toLine'];
  if (!path || typeof from !== 'number' || typeof to !== 'number') return null;
  const text = typeof s['text'] === 'string' ? s['text'] : '';
  return {
    path,
    fromLine: Math.max(1, Math.floor(from)),
    toLine: Math.max(1, Math.floor(to)),
    // A selection can be a whole file. The agent can read the file itself;
    // what it needs from here is what the person is pointing at.
    text: text.length > SELECTION_LIMIT ? text.slice(0, SELECTION_LIMIT) : text,
  };
}

/**
 * Shows the person a commit in the git window, or the uncommitted changes
 * when `commit` is null. Answers why not, or null when it was sent.
 *
 * The sha is the agent's, so it is checked twice: for the shape of one,
 * since it becomes an argument to `git`, and by `git` itself, which says
 * whether it names a commit here — an agent that misremembers a hash should
 * be told, not shown an empty pane.
 */
export async function showGit(
  senderId: number,
  root: string,
  commit: string | null
): Promise<string | null> {
  let sha: string | null = null;
  if (commit !== null) {
    if (!/^[0-9a-f]{4,64}$/i.test(commit))
      return `${commit} is not a commit hash.`;
    sha = await resolveCommit(root, commit);
    if (!sha) return `${commit} is not a commit in this repository.`;
  }
  const target = webContents.fromId(senderId);
  if (!target || target.isDestroyed()) return 'The window has closed.';
  target.send('agent:show-git', { commit: sha });
  return null;
}

/** The full sha a short or long one names, or null when it names no commit. */
function resolveCommit(root: string, commit: string): Promise<string | null> {
  return new Promise((done) => {
    execFile(
      'git',
      ['rev-parse', '--verify', '--quiet', `${commit}^{commit}`],
      { cwd: root, encoding: 'utf8', timeout: WORKBENCH_TIMEOUT_MS },
      (error, stdout) => done(error ? null : stdout.trim() || null)
    );
  });
}

/** A board's elements as the window has them, or why not. */
export async function readBoardElements(
  senderId: number,
  ref: BoardRef
): Promise<BoardElement[] | string> {
  const answer = await askWindow(senderId, { kind: 'board', ref }, (raw) => {
    const r = raw as { elements?: unknown; error?: unknown } | null;
    if (typeof r?.error === 'string') return r.error;
    // Elements went from main's file through the renderer and back, so
    // the shape is trusted only as far as describing them needs.
    return Array.isArray(r?.elements)
      ? (r.elements.filter(
          (element) => typeof element === 'object' && element !== null
        ) as BoardElement[])
      : 'The board could not be read.';
  });
  return answer ?? 'The window did not answer.';
}

/** Adds elements to a board through the window. Why not, or null. */
export async function drawOnBoard(
  senderId: number,
  ref: BoardRef,
  elements: BoardElement[]
): Promise<string | null> {
  const answer = await askWindow(
    senderId,
    { kind: 'draw', ref, elements },
    (raw) => {
      const r = raw as { ok?: unknown; error?: unknown } | null;
      if (r?.ok === true) return null;
      return typeof r?.error === 'string'
        ? r.error
        : 'The board was not changed.';
    }
  );
  return answer === null ? null : answer;
}
