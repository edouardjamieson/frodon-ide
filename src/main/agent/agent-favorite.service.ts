/**
 * The conversations a person marked as favorites, per project.
 *
 * A list of pointers in one file in the home directory. The transcripts stay
 * where the agent put them; what this file adds is the choice — which of the
 * agent's many conversations were worth a name — and that is the whole of
 * what Frodon stores about a conversation. ADR-0044.
 *
 * Forgiving on the way in, like `layouts.json`: a file that is missing or
 * will not parse is "no favorites", and an entry that fails the check is
 * dropped alone. A write is reported, like a bookmark's, because it records
 * something a person just did.
 */
import fsp from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { BrowserWindow } from 'electron';
import { createLogger } from '@main/logger';
import { FRODON_DIRNAME } from '@main/board';
import {
  AGENT_LABELS,
  FAVORITE_NAME_LIMIT,
  isSessionToken,
  type AgentKind,
  type FavoriteConversation,
} from '@shared/agent.def';
import type { FsResult } from '@shared/fs.def';
import { FAVORITES_FILENAME } from './agent.constant';

const log = createLogger('agent');

type FavoritesFile = Record<string, FavoriteConversation[]>;

function favoritesFile(): string {
  return path.join(homedir(), FRODON_DIRNAME, FAVORITES_FILENAME);
}

export function isAgentKind(value: unknown): value is AgentKind {
  return typeof value === 'string' && Object.hasOwn(AGENT_LABELS, value);
}

function isFavorite(value: unknown): value is FavoriteConversation {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<FavoriteConversation>;
  return (
    isAgentKind(entry.kind) &&
    isSessionToken(entry.session) &&
    typeof entry.name === 'string' &&
    typeof entry.addedAt === 'number' &&
    Number.isFinite(entry.addedAt)
  );
}

async function read(): Promise<FavoritesFile> {
  let raw: string;
  try {
    raw = await fsp.readFile(favoritesFile(), 'utf8');
  } catch {
    // Nothing has been made a favorite on this machine yet. The file is made
    // by the first one, not on startup.
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const file: FavoritesFile = {};
    for (const [root, list] of Object.entries(parsed)) {
      if (!path.isAbsolute(root) || !Array.isArray(list)) continue;
      file[root] = list.filter(isFavorite);
    }
    return file;
  } catch {
    log.warn(`${FAVORITES_FILENAME} is not readable JSON; no favorites`);
    return {};
  }
}

async function write(file: FavoritesFile): Promise<FsResult> {
  const target = favoritesFile();
  // A project with no favorites leaves the file, rather than lingering as an
  // empty list under a path that may not exist any more.
  const entries = Object.entries(file).filter(([, list]) => list.length > 0);
  try {
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(
      target,
      `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`,
      'utf8'
    );
    return { ok: true };
  } catch (error) {
    log.error(`could not write ${FAVORITES_FILENAME}`, error);
    return { ok: false, error: String(error) };
  }
}

/**
 * Changes run one at a time. Each is a read and a write of the whole file,
 * and two windows changing it in the same instant would otherwise each write
 * a list without the other's change.
 *
 * Every window is told afterwards, not only the one that asked: two windows
 * on one project show the same favorites, and a heart that stayed empty on
 * a tab in the other window would be the list disagreeing with itself. Each
 * window re-reads its own project's list, so a window on another project
 * pays one small read for nothing.
 */
let queue: Promise<unknown> = Promise.resolve();
function change(edit: (file: FavoritesFile) => void): Promise<FsResult> {
  const next = queue.then(async () => {
    const file = await read();
    edit(file);
    const result = await write(file);
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('agent:favorites-changed', null);
      }
    }
    return result;
  });
  queue = next.catch(() => {});
  return next;
}

/** A name as it is stored: one line, trimmed, bounded, never empty. */
function cleanName(name: unknown): string {
  return (
    (typeof name === 'string' ? name : '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, FAVORITE_NAME_LIMIT) || 'Untitled conversation'
  );
}

/** A project's favorites, most recently added first. */
export async function readFavorites(
  root: string
): Promise<FavoriteConversation[]> {
  return ((await read())[root] ?? []).sort((a, b) => b.addedAt - a.addedAt);
}

/**
 * Marks a conversation a favorite. One that already is keeps the name it
 * has: the composer's heart offers a name from the first message, and that
 * must not undo a rename made in the sidebar.
 *
 * Nothing here asks the agent whether the session exists: the heart is only
 * offered on a conversation that is running, and the sidebar says so if it
 * later goes.
 */
export function addFavorite(
  root: string | null,
  kind: AgentKind,
  session: string,
  name: string
): Promise<FsResult> {
  if (!root)
    return Promise.resolve({ ok: false, error: 'No project is open.' });
  if (!isAgentKind(kind) || !isSessionToken(session)) {
    return Promise.resolve({ ok: false, error: 'Not a conversation.' });
  }

  return change((file) => {
    const list = file[root] ?? [];
    if (list.some((entry) => entry.kind === kind && entry.session === session))
      return;
    list.push({ kind, session, name: cleanName(name), addedAt: Date.now() });
    file[root] = list;
  });
}

export function renameFavorite(
  root: string | null,
  kind: AgentKind,
  session: string,
  name: string
): Promise<FsResult> {
  if (!root)
    return Promise.resolve({ ok: false, error: 'No project is open.' });
  return change((file) => {
    const entry = file[root]?.find(
      (candidate) => candidate.kind === kind && candidate.session === session
    );
    if (entry) entry.name = cleanName(name);
  });
}

/** Takes a conversation off the favorites. The agent's copy is untouched. */
export function removeFavorite(
  root: string | null,
  kind: AgentKind,
  session: string
): Promise<FsResult> {
  if (!root)
    return Promise.resolve({ ok: false, error: 'No project is open.' });
  return change((file) => {
    const list = file[root];
    if (!list) return;
    file[root] = list.filter(
      (entry) => !(entry.kind === kind && entry.session === session)
    );
  });
}
