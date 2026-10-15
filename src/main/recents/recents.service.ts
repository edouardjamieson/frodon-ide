/**
 * The projects this machine has opened, newest first.
 *
 * Main owns it for the usual reason — it is a file on disk — but also for one
 * specific to it: the renderer that would otherwise hold this is the launcher,
 * the one page in the app with no project behind it, and a list that outlives
 * every window cannot live in any of them. `localStorage` would have been the
 * shortcut, and it would have tied the list to a renderer origin rather than
 * to the user.
 *
 * Reads are forgiving by design. A recents file that is missing, truncated,
 * hand-edited, or written by a future version is a list of zero or a list of
 * the entries that still parse — never an error the launcher has to render.
 * Nothing here is worth failing to open the app over.
 */
import fsp from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createLogger } from '@main/logger';
// The `.frodon` directory is an app-wide convention that boards happened to
// need first; it is imported rather than spelled a second time, so there
// stays exactly one answer to where Frodon keeps things in a home directory.
import { FRODON_DIRNAME } from '@main/board';
import { MAX_RECENT_PROJECTS, RECENTS_FILENAME } from './recents.constant';
import type { RecentProject } from '@shared/project.def';

const log = createLogger('recents');

function recentsFile(): string {
  return path.join(homedir(), FRODON_DIRNAME, RECENTS_FILENAME);
}

/** Whether a parsed entry is one we are willing to hand to the renderer. */
function isRecent(value: unknown): value is RecentProject {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<RecentProject>;
  return (
    typeof entry.path === 'string' &&
    path.isAbsolute(entry.path) &&
    typeof entry.openedAt === 'number' &&
    Number.isFinite(entry.openedAt)
  );
}

/**
 * Whatever is on disk, normalised: valid entries only, newest first, one per
 * path, no longer than the cap.
 *
 * Applied on the way in as well as on the way out, so a file that grew a
 * duplicate or an extra row — by a hand edit, or by two windows writing at
 * once — is repaired by the next read instead of being carried forward.
 */
function normalize(entries: RecentProject[]): RecentProject[] {
  const byPath = new Map<string, RecentProject>();

  for (const entry of entries) {
    const existing = byPath.get(entry.path);
    if (!existing || existing.openedAt < entry.openedAt) {
      byPath.set(entry.path, { path: entry.path, openedAt: entry.openedAt });
    }
  }

  return [...byPath.values()]
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, MAX_RECENT_PROJECTS);
}

async function read(): Promise<RecentProject[]> {
  let raw: string;
  try {
    raw = await fsp.readFile(recentsFile(), 'utf8');
  } catch {
    // Nothing has ever been opened on this machine, or the directory is not
    // there yet. Both are an empty list, and neither is worth a log line.
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalize(parsed.filter(isRecent));
  } catch {
    log.warn('recents.json is not readable JSON; starting from an empty list');
    return [];
  }
}

async function write(entries: RecentProject[]): Promise<void> {
  const file = recentsFile();
  try {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  } catch (error) {
    // A home directory that cannot be written to is a real problem, but not
    // this feature's to raise: the project still opens, and the only cost is
    // that it will not be remembered.
    log.error('could not write the recents list', error);
  }
}

/** Entries whose directory is still there, in order. */
async function present(entries: RecentProject[]): Promise<RecentProject[]> {
  const checks = await Promise.all(
    entries.map(async (entry) => {
      try {
        return (await fsp.stat(entry.path)).isDirectory();
      } catch {
        return false;
      }
    })
  );

  return entries.filter((_entry, index) => checks[index]);
}

/**
 * The list, with projects that have since been moved or deleted dropped.
 *
 * The pruning happens on read rather than on a timer because this is read
 * exactly when it matters — the launcher is on screen — and five `stat` calls
 * are cheaper than the alternative: a row that offers to open a folder that
 * is not there, and fails when it is clicked.
 *
 * A prune that found something is written back, so the entry is gone for good
 * rather than re-checked on every launch.
 */
export async function listRecentProjects(): Promise<RecentProject[]> {
  const entries = await read();
  const alive = await present(entries);

  if (alive.length !== entries.length) await write(alive);

  return alive;
}

/**
 * Records a project as the most recently opened one.
 *
 * Called from `project:tree` rather than from `project:pick`, because the two
 * are different events and only one of them is "a project was opened": a
 * folder can be picked and the open can still fail, and a project opened from
 * the launcher's own list never goes near the picker.
 */
export async function recordRecentProject(root: string): Promise<void> {
  const entries = await read();
  await write(normalize([{ path: root, openedAt: Date.now() }, ...entries]));
}

/** Drops one project from the list, and answers with what is left. */
export async function forgetRecentProject(
  root: string
): Promise<RecentProject[]> {
  const entries = await read();
  const remaining = entries.filter((entry) => entry.path !== root);

  // Forgetting something that was not there changes nothing and writes
  // nothing — the same discipline the tree and the git poller keep.
  if (remaining.length !== entries.length) await write(remaining);

  return remaining;
}
