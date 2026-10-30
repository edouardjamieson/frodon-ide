/**
 * The workbench layout each project was last left in.
 *
 * Main owns it for the usual reason — it is a file on disk — and the renderer
 * holds nothing but a snapshot it hands over when the arrangement changes.
 * The division is the same one the tree and the recents list keep, and the
 * payoff is the same: a layout that outlives the page it was made in.
 *
 * Two things this does beyond reading and writing JSON, both of them the
 * reason it is a service and not a `readFile`:
 *
 * **It is forgiving.** A layouts file that is missing, truncated, hand-edited
 * or written by a future version is "no saved layout" — never an error, and
 * never a workbench that fails to draw. Nothing here is worth failing to open
 * a project over.
 *
 * **It prunes what has gone, and refuses what should not be there.** A layout
 * saved in March can name files that were deleted in April. Restoring those
 * is worse than restoring nothing: the tab opens, fails to read, and shows an
 * error about a file the person already decided they were finished with. So
 * the paths are checked before they cross, which is the same argument
 * `closeFileTabs` makes in the renderer and the same thing
 * `listRecentProjects` does to folders that moved. Browser tabs are the other
 * half of that: this file sits in a home directory and can be hand-edited, so
 * a url on it is input, and one that is not a scheme a tab may be pointed at
 * never reaches the renderer.
 */
import fsp from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createLogger } from '@main/logger';
import { FRODON_DIRNAME, listBoards } from '@main/board';
import { boardKey } from '@shared/board.def';
import { isAllowedBrowserUrl } from '@shared/browser.def';
import {
  LAYOUTS_FILENAME,
  LAYOUT_VERSION,
  MAX_REMEMBERED_LAYOUTS,
} from './layout.constant';
import type {
  BrowserTabLayout,
  LayoutSnapshot,
  LayoutWindow,
  ProjectLayout,
} from '@shared/layout.def';

const log = createLogger('layout');

/** The file is a map from project root to that project's layout. */
type LayoutFile = Record<string, ProjectLayout>;

function layoutsFile(): string {
  return path.join(homedir(), FRODON_DIRNAME, LAYOUTS_FILENAME);
}

/* -------------------------------------------------------------------------
 * Validation
 *
 * Shallow on purpose, in the same register as `parseDocument` in `board/`: it
 * rejects the shapes the renderer would choke on and lets everything else
 * through. A window whose `type` is a string nobody recognises is dropped, not
 * fatal — the rest of the layout is still worth restoring.
 * ---------------------------------------------------------------------- */

function isSlot(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** An array of strings, or null when it is anything else. */
function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((entry) => typeof entry === 'string')
    ? (value as string[])
    : null;
}

/** A saved page: a url, and a device size or nothing. */
function isBrowserTab(value: unknown): value is BrowserTabLayout {
  if (typeof value !== 'object' || value === null) return false;
  const tab = value as Partial<BrowserTabLayout>;

  if (typeof tab.url !== 'string') return false;
  if (tab.viewport === null || tab.viewport === undefined) return true;

  return (
    typeof tab.viewport === 'object' &&
    typeof tab.viewport.width === 'number' &&
    typeof tab.viewport.height === 'number' &&
    Number.isFinite(tab.viewport.width) &&
    Number.isFinite(tab.viewport.height)
  );
}

function isLayoutWindow(value: unknown): value is LayoutWindow {
  if (typeof value !== 'object' || value === null) return false;
  const window = value as Partial<LayoutWindow> & Record<string, unknown>;

  if (!isSlot(window.row) || !isSlot(window.col)) return false;

  switch (window.type) {
    case 'editor':
      return (
        stringList(window.files) !== null &&
        (window.activeFile === null || typeof window.activeFile === 'string')
      );
    case 'board':
      return (
        stringList(window.boards) !== null &&
        (window.activeBoard === null || typeof window.activeBoard === 'string')
      );
    case 'git':
      return (
        window.tab === 'history' ||
        window.tab === 'branches' ||
        window.tab === 'commit'
      );
    case 'browser':
      return (
        Array.isArray(window.tabs) &&
        window.tabs.every(isBrowserTab) &&
        typeof window.activeTab === 'number' &&
        Number.isInteger(window.activeTab)
      );
    case 'terminal':
    case 'agent':
    case null:
      return true;
    default:
      return false;
  }
}

function isProjectLayout(value: unknown): value is ProjectLayout {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<ProjectLayout>;

  return (
    entry.version === LAYOUT_VERSION &&
    typeof entry.savedAt === 'number' &&
    Number.isFinite(entry.savedAt) &&
    Array.isArray(entry.windows) &&
    typeof entry.focused === 'number' &&
    Number.isInteger(entry.focused)
  );
}

/* -------------------------------------------------------------------------
 * The file
 * ---------------------------------------------------------------------- */

async function read(): Promise<LayoutFile> {
  let raw: string;
  try {
    raw = await fsp.readFile(layoutsFile(), 'utf8');
  } catch {
    // No project has ever been arranged on this machine, or the directory is
    // not there yet. Both are an empty map, and neither is worth a log line.
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};

    const file: LayoutFile = {};
    for (const [root, entry] of Object.entries(parsed)) {
      // An absolute path is the only thing that can be a key here. Anything
      // else came from a hand edit and names no project we could open.
      if (!path.isAbsolute(root) || !isProjectLayout(entry)) continue;
      file[root] = {
        ...entry,
        // Windows that did not survive validation are dropped individually,
        // so one bad tile does not cost the whole arrangement.
        windows: entry.windows.filter(isLayoutWindow),
      };
    }

    return file;
  } catch {
    log.warn('layouts.json is not readable JSON; starting without layouts');
    return {};
  }
}

/**
 * Writes the map back, keeping only the most recently saved projects.
 *
 * The cap is applied here rather than on read, so the file on disk never
 * grows past it either — the same discipline `recents.json` keeps.
 */
async function write(file: LayoutFile): Promise<void> {
  const kept = Object.entries(file)
    .sort(([, a], [, b]) => b.savedAt - a.savedAt)
    .slice(0, MAX_REMEMBERED_LAYOUTS);

  const target = layoutsFile();
  try {
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(
      target,
      `${JSON.stringify(Object.fromEntries(kept), null, 2)}\n`,
      'utf8'
    );
  } catch (error) {
    // A home directory that cannot be written to is a real problem, but not
    // this feature's to raise: the project is open and working, and the only
    // cost is that its arrangement will not come back.
    log.error('could not write the layouts file', error);
  }
}

/* -------------------------------------------------------------------------
 * Pruning
 * ---------------------------------------------------------------------- */

/** Paths that are still files on disk, in the order they were given. */
async function presentFiles(paths: string[]): Promise<string[]> {
  const checks = await Promise.all(
    paths.map(async (file) => {
      try {
        return (await fsp.stat(file)).isFile();
      } catch {
        return false;
      }
    })
  );

  return paths.filter((_file, index) => checks[index]);
}

/**
 * The same layout with everything that has since gone taken out.
 *
 * Three kinds of contents, three ways of asking. Editor tabs are paths, so
 * they are stat'd. Board keys are checked against the listing rather than by
 * stat, because a key is a scope and a name and main is the only side that
 * knows where either scope lives — see `resolveBoardPath`; that listing
 * covers the boards of the project this layout belongs to, which is why the
 * root is threaded down here rather than read from whatever is open — a
 * second window restoring its own layout must not be pruned against the
 * first window's boards. A browser tab's url cannot "go" at all — a page being
 * down is not a reason to forget it — so the only question asked of one is
 * whether it is a scheme a tab may be pointed at.
 *
 * A window whose contents all vanished keeps its place as an empty one of its
 * kind. The tile is the part worth restoring; the tabs were only ever the
 * bonus.
 */
async function prune(
  root: string,
  snapshot: LayoutSnapshot
): Promise<LayoutSnapshot> {
  const needsBoards = snapshot.windows.some(
    (window) => window.type === 'board' && window.boards.length > 0
  );
  const known = needsBoards
    ? new Set((await listBoards(root)).map(boardKey))
    : new Set<string>();

  const windows = await Promise.all(
    snapshot.windows.map(async (window): Promise<LayoutWindow> => {
      if (window.type === 'editor') {
        const files = await presentFiles(window.files);
        return {
          ...window,
          files,
          activeFile:
            window.activeFile && files.includes(window.activeFile)
              ? window.activeFile
              : (files[0] ?? null),
        };
      }

      if (window.type === 'browser') {
        // The scheme list, applied to a file a person can hand-edit. Main
        // refuses the same thing again in `will-attach-webview`, but a url
        // dropped here is a tab that never existed, where one dropped there
        // is a tab whose guest failed to attach.
        const active = window.tabs[window.activeTab];
        const tabs = window.tabs.filter((tab) => isAllowedBrowserUrl(tab.url));

        return {
          ...window,
          tabs,
          // Re-indexed against what survived, because the tab that was on
          // screen may not be among it. Nothing survived is -1, the same
          // thing a window with no active tab writes.
          activeTab:
            active && tabs.includes(active)
              ? tabs.indexOf(active)
              : tabs.length > 0
                ? 0
                : -1,
        };
      }

      if (window.type === 'board') {
        const boards = window.boards.filter((key) => known.has(key));
        return {
          ...window,
          boards,
          activeBoard:
            window.activeBoard && boards.includes(window.activeBoard)
              ? window.activeBoard
              : (boards[0] ?? null),
        };
      }

      return window;
    })
  );

  return { ...snapshot, windows };
}

/* -------------------------------------------------------------------------
 * What the handlers call
 * ---------------------------------------------------------------------- */

/**
 * The layout this project was last left in, or null if it has none.
 *
 * Null covers every way this can fail to produce one — never opened, file
 * missing, entry from an older version, nothing left after validation — and
 * that is the whole of the renderer's interest in the difference. All of them
 * mean the same thing on screen: the workbench opens the way it always did.
 */
export async function readProjectLayout(
  root: string
): Promise<LayoutSnapshot | null> {
  const entry = (await read())[root];
  if (!entry || entry.windows.length === 0) return null;

  const { windows, focused } = await prune(root, entry);

  return { windows, focused };
}

/** Records a project's arrangement, replacing whatever was saved before. */
export async function writeProjectLayout(
  root: string,
  snapshot: LayoutSnapshot
): Promise<void> {
  const file = await read();

  file[root] = {
    ...snapshot,
    version: LAYOUT_VERSION,
    savedAt: Date.now(),
  };

  await write(file);
}
