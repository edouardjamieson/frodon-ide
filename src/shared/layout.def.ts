/**
 * A project's workbench layout, as it is written to disk and read back.
 *
 * This is deliberately *not* `WindowState`. The live model lives in the
 * renderer (`lib/window/window.def.ts`) where it belongs — it carries ids
 * that mean nothing outside this page, sessions that name live PTYs in main,
 * and tab ids that name DOM elements. None of that survives a quit, and none
 * of it should be written to a file.
 *
 * So this is the *wire and file* format: the shape of a layout that is still
 * true tomorrow. It holds what each window is and the tree it sits in, plus the
 * contents that are nothing but strings — paths, board keys, urls — because
 * those are the half of a layout that can be restored. A terminal's shell
 * cannot be: it is a process, it is gone, and saying so in the type is better
 * than pretending with a field that always comes back empty.
 *
 * The discriminants below shadow the renderer's `WindowType`, and
 * `LayoutGitTab` shadows its `GitTab`, rather than importing either —
 * `shared/` compiles into both bundles and must not reach into the renderer.
 * The duplication is caught rather than trusted: `snapshotOf` in
 * `lib/layout/layout.service.ts` converts in this direction through an
 * exhaustive switch, so a new window type — or a fourth git tab — fails to
 * compile until someone has decided what gets persisted for it.
 */

import type { AgentKind } from './agent.def';

/** Mirrors `GitTab` in the renderer. */
export type LayoutGitTab = 'history' | 'branches' | 'commit';

export interface EditorLayout {
  type: 'editor';
  /** Absolute paths, in tab order. Files that have gone are pruned on read. */
  files: string[];
  activeFile: string | null;
}

/**
 * A terminal window, and nothing about its shells.
 *
 * A session id names a live process in main's registry; the process is gone
 * by the time this file is read again, and the scrollback with it. What can
 * honestly be restored is the tile — so a saved terminal comes back as one
 * fresh shell in the same place, which is what the window would have been
 * opened as anyway.
 */
export interface TerminalLayout {
  type: 'terminal';
}

export interface GitLayout {
  type: 'git';
  tab: LayoutGitTab;
}

export interface BoardLayout {
  type: 'board';
  /** Board keys (`scope:name`), in tab order. Missing ones are pruned. */
  boards: string[];
  activeBoard: string | null;
}

/** Mirrors `Viewport` in `lib/browser/`: a device size in CSS pixels. */
export interface LayoutViewport {
  width: number;
  height: number;
}

/**
 * One saved page: where it was, and what size it was being previewed at.
 *
 * A url and not a tab id — ids name DOM elements and mean nothing in the next
 * run. Which is also why the active tab below is an index rather than an id,
 * for the same reason `LayoutSnapshot.focused` is.
 *
 * The viewport comes along because it is a decision the person made about the
 * tab, not a fact the page reported: pinning a preview to 393 × 852 and
 * getting it back unpinned tomorrow would be losing the half of the setup
 * that took a click.
 *
 * What is *not* here is history. A tab's back stack lives in the guest
 * process and dies with it; restoring the page it was on is the honest half.
 */
export interface BrowserTabLayout {
  url: string;
  viewport: LayoutViewport | null;
}

/**
 * A browser window, and the pages its tabs were on.
 *
 * Unlike a terminal — whose shell is a process that is simply gone — a page
 * is a url, and a url is a string that still means something tomorrow. So
 * these do come back, seeded into `lib/browser/` before the views mount and
 * loaded as each guest's first navigation rather than as a second one, so a
 * restored tab never shows a blank page on its way to the right one.
 *
 * A url that is not a scheme a tab may be pointed at is dropped on read; see
 * `isAllowedBrowserUrl`, and `main/browser/`, which refuses the same thing
 * again at attach time. This file lives in a home directory and can be
 * hand-edited, which makes it input.
 */
export interface BrowserLayout {
  type: 'browser';
  tabs: BrowserTabLayout[];
  /** Index into `tabs` of the one on screen, or -1. */
  activeTab: number;
}

/**
 * An agent window, and the favorite conversations among its tabs.
 *
 * Only the favorites. A conversation is a process in main, and one that was
 * never marked is one nobody said was worth coming back to: it is closed with
 * the app, like a shell. A favorite is the opposite statement, and its token
 * is already written down in the favorites file, so putting it here as well
 * costs no new kind of secret. A window with none comes back as an empty
 * tile, keeping its place in the layout.
 *
 * Optional, because a layout written before this field existed has none, and
 * reads as a tile with no favorites.
 */
export interface AgentLayout {
  type: 'agent';
  conversations?: AgentTabLayout[];
  /** Index into `conversations` of the tab on screen, or -1. */
  activeConversation?: number;
}

/** A favorite conversation open as a tab, by the agent's own token. */
export interface AgentTabLayout {
  kind: AgentKind;
  session: string;
}

/** A tile that was spawned but never told what it is. */
export interface EmptyLayout {
  type: null;
}

export type LayoutWindow =
  | EditorLayout
  | TerminalLayout
  | GitLayout
  | BoardLayout
  | BrowserLayout
  | AgentLayout
  | EmptyLayout;

/** Mirrors `SplitAxis` in the renderer: `horizontal` is side by side. */
export type LayoutAxis = 'horizontal' | 'vertical';

/**
 * Where the windows sat: the renderer's `WindowTree`, with each leaf holding
 * the saved window itself rather than an id.
 *
 * In the leaves rather than in a list beside the tree with indexes into it,
 * because there is then nothing to keep consistent — a hand-edited file
 * cannot name window 7 of 6, and a window cannot be in the list and missing
 * from the tree. The live model keeps them apart for a reason that does not
 * apply here: the order its tiles are drawn in, which means nothing in the
 * next run.
 */
export type LayoutNode =
  | { kind: 'window'; window: LayoutWindow }
  | { kind: 'split'; axis: LayoutAxis; children: LayoutNode[] };

/**
 * What the renderer hands over, and what it gets back.
 *
 * No timestamp and no version: those are the file's business, stamped by main
 * on write and stripped on read. The renderer only ever deals in the windows
 * themselves.
 */
export interface LayoutSnapshot {
  tree: LayoutNode;
  /**
   * Which window had focus, as its index counting the tree's windows left to
   * right and top to bottom — or -1.
   *
   * An index rather than an id, because ids are a per-page counter — `w7`
   * means nothing in the next run of the app, and a saved id would restore
   * focus onto whichever window happened to be seventh.
   */
  focused: number;
}

/** Every window in a saved tree, in the order `focused` counts them. */
export function layoutWindowsOf(node: LayoutNode): LayoutWindow[] {
  return node.kind === 'window'
    ? [node.window]
    : node.children.flatMap(layoutWindowsOf);
}

/** One entry in the layouts file: a snapshot, plus what the file needs. */
export interface ProjectLayout extends LayoutSnapshot {
  /** Bumped when the shape above changes. An older entry is ignored. */
  version: number;
  /** Epoch milliseconds of the last write. Sorts the pruning. */
  savedAt: number;
}
