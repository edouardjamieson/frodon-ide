/**
 * The window system: what the workbench shows next to the sidebar.
 *
 * A *window* here is a tile, not an OS window — the thing `main/app/` creates
 * is a `BrowserWindow` and lives in the other process. Inside this one,
 * windows are panes on a small grid, each holding exactly one module: an
 * editor with its own tabs, a terminal with its own sessions, or nothing yet.
 *
 * The model is carried over from the TUI (`lib/window/` in `frodon-tui`) and
 * is the part of it that survived the port intact: windows are a flat list
 * carrying their own `row`/`col`, and the layout is *derived* from those
 * coordinates rather than stored. What did not survive is
 * `useCalculateLayout`, which turned the coordinates into percentage
 * left/top/width/height by hand because a terminal has no layout engine. Here
 * the rows are nested resizable panel groups, so sizing — and dragging a
 * splitter — is the browser's problem.
 *
 * The TUI kept each window's contents in parallel arrays keyed by window id
 * (`editorFiles`, `terminalSessions`, `dirtyFiles`). That is reversed here:
 * contents live *on* the window as a discriminated union, so a window's state
 * is reachable in one lookup instead of three filtered scans per render, and
 * closing a window drops its contents with it rather than leaking rows that
 * no longer belong to anything.
 */

/**
 * What a window hosts. Adding a kind means adding a member here, a state
 * interface below, and a case to the two switches in `window.component.tsx` —
 * TypeScript will point at both of them.
 */
export type WindowType =
  'editor' | 'terminal' | 'git' | 'board' | 'browser' | 'agent';

/**
 * Named `WindowState` and not `Window` on purpose: the renderer is a browser
 * page, `Window` is the DOM's own global interface, and a module-level
 * `interface Window` would shadow it everywhere this type is imported.
 */
export type WindowState =
  | EditorWindow
  | TerminalWindow
  | GitWindow
  | BoardWindow
  | BrowserWindow
  | AgentWindow
  | EmptyWindow;

interface WindowBase {
  id: string;
  /** Grid row, top to bottom. Rows are full width and stack vertically. */
  row: number;
  /** Position within the row, left to right. Rows are packed: no gaps. */
  col: number;
}

export interface EditorWindow extends WindowBase {
  type: 'editor';
  /** Absolute paths of the open tabs, in tab order. */
  files: string[];
  /** The tab on screen, or null when every tab has been closed. */
  activeFile: string | null;
}

export interface TerminalWindow extends WindowBase {
  type: 'terminal';
  /**
   * Session ids, in tab order. Each one names a live shell in main, which is
   * the authority on it — these are the renderer's handles, nothing more.
   */
  sessions: string[];
  /** The session on screen. The others stay mounted and keep running. */
  activeSession: string | null;
}

/**
 * Which view of the repository a git window is showing.
 *
 * On the window rather than in the git store, for the same reason an editor's
 * tabs are: it is where you are looking, not a fact about the repository, and
 * two git windows should be able to show the history and the staging area at
 * once.
 */
export type GitTab = 'history' | 'branches' | 'commit';

export interface GitWindow extends WindowBase {
  type: 'git';
  tab: GitTab;
}

/**
 * A window holding boards, tabbed the way an editor holds files.
 *
 * Tabs are board *keys* (`scope:name`), not `BoardRef` objects, for the same
 * reason the editor's are paths: a tab bar compares, de-duplicates and
 * indexes by identity on every render, and a string does all three without a
 * comparison function. The ref is recovered with `parseBoardKey` where one is
 * actually needed.
 *
 * Unlike a git window there may be several, and unlike an editor the contents
 * are shared: two windows on the same board show the same drawing, because
 * the session is keyed by board. See `BoardSession`.
 */
export interface BoardWindow extends WindowBase {
  type: 'board';
  /** Board keys, in tab order. */
  boards: string[];
  /** The board on screen, or null when every tab has been closed. */
  activeBoard: string | null;
}

/**
 * A window holding web pages, tabbed the way a terminal holds shells.
 *
 * The name is the one unfortunate thing in this file: Electron's own
 * `BrowserWindow` is an OS window, and this is a tile. They can never be
 * confused by the compiler — `electron` is a main-process import and the
 * renderer has no typings for it — but a reader coming from `main/app/` will
 * do a double take, so: this is the browser *module*, the thing with an
 * address bar in it. The OS window that contains it is created in
 * `main/app/window.service.ts` and is not reachable from here.
 *
 * Tabs are ids, not urls. A url is not an identity — two tabs can be on the
 * same page, and a tab's url changes under it every time a link is clicked,
 * which would re-key the tab bar on every navigation. The url lives on the
 * tab's state in `lib/browser/`, where the guest reports it.
 *
 * Unlike a board, nothing is shared: two tabs on the same site are two pages
 * with two scroll positions and two histories, which is what a window manager
 * is for. Unlike a terminal, nothing survives the view — closing the tab
 * closes the page, and there is no process in main to outlive it.
 */
export interface BrowserWindow extends WindowBase {
  type: 'browser';
  /** Tab ids, in tab order. */
  tabs: string[];
  /** The tab on screen. The others stay mounted and keep their pages alive. */
  activeTab: string | null;
}

/**
 * A window holding conversations with coding agents, tabbed the way a
 * terminal holds shells.
 *
 * The ids name live conversations in main's registry, as session ids name
 * shells — and like a shell, a conversation is a process: closing its tab
 * ends it, and nothing about it survives a quit. Which agent each one talks
 * to, and everything it has said, lives in `lib/agent/`; the window only
 * knows which tabs it has.
 */
export interface AgentWindow extends WindowBase {
  type: 'agent';
  /** Conversation ids, in tab order. */
  conversations: string[];
  /** The conversation on screen. The others stay mounted and keep working. */
  activeConversation: string | null;
}

/** A window that has been spawned but not yet told what it is. */
export interface EmptyWindow extends WindowBase {
  type: null;
}

/** Where a split puts the new window relative to the one being split. */
export type SplitDirection = 'right' | 'down';

/** A way across the grid, for moving a window by keyboard. */
export type Direction = 'left' | 'right' | 'up' | 'down';

/**
 * Where on another window a dragged one was let go.
 *
 * The middle trades places with it; an edge puts the dragged window beside
 * it, or on a row of its own above or below. `moveWindow` is the arithmetic.
 */
export type DropZone = 'center' | 'left' | 'right' | 'top' | 'bottom';

/** A position in a file, as a search result reports one. */
export interface RevealTarget {
  /** 1-based, counted the way every editor and every error message counts. */
  line: number;
  /** 1-based column of the first character to select. */
  column: number;
  /** How much to select from there — the matched text, for a search hit. */
  length: number;
}

/**
 * A jump waiting to be honored, consumed by whichever editor ends up showing
 * the file.
 *
 * It lives here rather than in the editor because the editor is not what
 * decides where a file opens — `openFile` is, and by the time it has routed a
 * path to a window, the component that will mount it does not exist yet. So
 * the request is parked and the editor picks it up once its document is
 * loaded, which may be a read later.
 */
export interface PendingReveal extends RevealTarget {
  path: string;
}

export interface WindowStore {
  windows: WindowState[];
  /** The window that owns keyboard intent, and the only one drawn focused. */
  focusedId: string;

  focus: (id: string) => void;
  /**
   * Gives an untyped window its module. A window's type is fixed once set —
   * changing it would mean deciding what happens to the contents, and closing
   * the window says that unambiguously.
   */
  setType: (id: string, type: WindowType) => void;

  /**
   * Splits a window, focusing the new one. A no-op when the grid is full in
   * that direction, so callers can stay unconditional; `canSplit` is what the
   * UI asks before drawing the button.
   */
  split: (id: string, direction: SplitDirection, type?: WindowType) => void;
  /**
   * Closes a window and repacks the grid around the hole. Closing the last
   * window leaves a fresh empty one: the workbench is never blank.
   */
  close: (id: string) => void;

  /**
   * Moves a window to where it was dropped on another one, and focuses it —
   * the window you just carried somewhere is the one you are looking at. A
   * no-op when the drop would not fit or would change nothing; `canMove` is
   * what the drop target asks before it lights up.
   */
  move: (id: string, targetId: string, zone: DropZone) => void;
  /**
   * Trades places with the neighbouring window in a direction, or does
   * nothing at the edge of the grid. The keyboard's way of moving a window,
   * and a swap rather than a move because an arrow key has no way to say
   * "beside" from "instead of".
   */
  swap: (id: string, direction: Direction) => void;

  /**
   * Replaces the whole workbench — every window and the focus — in one go.
   *
   * The one action that does not grow the grid from what is already there,
   * and it exists for exactly one caller: restoring the arrangement a project
   * was last left in. The windows arrive already built, because the thing
   * that builds them is reading a file format and knows what a saved terminal
   * turns into; this just commits them.
   *
   * An empty list is ignored rather than honored. A workbench with nothing in
   * it has no surface left to spawn from, which is the same reason `close`
   * seeds a fresh window when the last one goes.
   */
  restore: (windows: WindowState[], focusedId: string) => void;

  /**
   * Where the editor should land once the file is on screen, or null.
   *
   * One-shot: the editor that honors it clears it. Parking it on the store is
   * what lets a click in the search panel land on line 412 of a file that was
   * not open a moment ago.
   */
  pendingReveal: PendingReveal | null;
  /** Drops the parked jump. Called by the editor that has just performed it. */
  clearReveal: () => void;

  /**
   * Opens a file in an editor window, routing to one that can take it — the
   * window asked for, else the focused one, else any editor, else a newly
   * spawned one. Re-opening a file that is already a tab just activates it.
   *
   * `reveal` asks the editor to put the cursor somewhere in particular, which
   * is the difference between the explorer opening a file and the search panel
   * opening a match.
   */
  openFile: (path: string, windowId?: string, reveal?: RevealTarget) => void;
  closeFile: (windowId: string, path: string) => void;
  setActiveFile: (windowId: string, path: string) => void;
  /**
   * Re-keys a file in every window holding it, and everything under it.
   *
   * The file counterpart of `renameBoardTab`, with one extra job: the
   * explorer can rename a *folder*, and every tab for a file inside it is now
   * pointing at a path that no longer exists. A tab is its path here, so the
   * paths have to move with it.
   */
  renameFileTab: (from: string, to: string) => void;
  /**
   * Drops a file, and anything beneath it, from every window holding it.
   *
   * What a delete calls, and the same argument `closeBoardTabs` makes: a tab
   * pointing at a file that is gone is worse than no tab, because it opens,
   * fails to read, and shows an error about something already decided.
   */
  closeFileTabs: (path: string) => void;

  /**
   * Opens a shell, routing the same way `openFile` does — the window asked
   * for, else the focused one, else any terminal, else a newly spawned one.
   * Always a *new* session: a terminal window is a stack of shells.
   */
  openTerminal: (windowId?: string) => void;

  /**
   * Shows the repository, in the one window that does.
   *
   * Unlike `openFile` and `openTerminal` this does not open a second one: an
   * existing git window is focused instead. There is only ever one repository
   * open, every tab in the window is a view of it, and a grid of three
   * identical copies would be a way of running out of room, not a feature.
   */
  openGit: () => void;
  setGitTab: (windowId: string, tab: GitTab) => void;

  /**
   * Opens a board, routing the way `openFile` does — the window asked for,
   * else the focused one, else any board window, else a newly spawned one.
   *
   * A board already open as a tab is activated rather than opened twice, and
   * a board open in *another* window focuses that window instead of taking a
   * second copy: two tiles showing the same drawing is a way to run out of
   * room, and they would share a session anyway.
   */
  openBoard: (key: string, windowId?: string) => void;
  closeBoard: (windowId: string, key: string) => void;
  setActiveBoard: (windowId: string, key: string) => void;
  /**
   * Re-keys a board in every window holding it.
   *
   * A rename changes a board's identity, and the tabs are made of that
   * identity. Without this a renamed board leaves its old name in the tab bar
   * pointing at a file that no longer exists.
   */
  renameBoardTab: (from: string, to: string) => void;
  /**
   * Drops a board from every window holding it.
   *
   * What a delete calls. A tab pointing at a file that is gone is worse than
   * no tab: it opens, fails to read, and shows an error about a board the
   * person has already decided they are finished with.
   */
  closeBoardTabs: (key: string) => void;
  /**
   * Opens a web page, routing the way `openTerminal` does — the window asked
   * for, else the focused one, else any browser window, else a newly spawned
   * one. Always a *new* tab: a browser window is a stack of pages, and where
   * it goes is a question for the address bar, not for this.
   */
  openBrowser: (windowId?: string) => void;
  closeBrowserTab: (windowId: string, tabId: string) => void;
  setActiveBrowserTab: (windowId: string, tabId: string) => void;

  /**
   * Opens a conversation with an agent, routing the way `openTerminal` does
   * — the window asked for, else the focused one, else any agent window,
   * else a newly spawned one. Always a *new* conversation: two tabs on one
   * conversation would be two people typing into the same agent.
   *
   * Returns the new conversation's id, so a caller that came to resume one
   * can say so before the tab mounts — or null when there was nowhere to
   * put it.
   */
  openAgent: (windowId?: string) => string | null;
  closeConversation: (windowId: string, conversationId: string) => void;
  setActiveConversation: (windowId: string, conversationId: string) => void;

  closeSession: (windowId: string, sessionId: string) => void;
  setActiveSession: (windowId: string, sessionId: string) => void;

  /**
   * Closes whatever the window is showing, or the window itself when it is
   * showing nothing. What Cmd+W means.
   *
   * Here rather than in the keybinding that calls it, because "the thing in
   * front" is a statement about this model and nothing else should have to
   * know that an editor calls it a file, a terminal a session, and a board a
   * key. A git window has tabs but they are views of one repository, not
   * things to close, so it closes as a whole.
   */
  closeActiveTab: (windowId: string) => void;
}
