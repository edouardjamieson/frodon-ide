/**
 * The contract between the two processes, and the only place either one may
 * learn about the other.
 *
 * In the TUI everything shared one process, so a hook could call
 * `readFileSync` on the line that needed it. Electron splits that in half: the
 * renderer is a sandboxed browser page with no Node, and every filesystem,
 * git, or subprocess call has to cross a process boundary. Left unmanaged that
 * boundary becomes dozens of stringly-typed `ipcRenderer.invoke` calls whose
 * payloads drift from their handlers until something fails at runtime in a
 * build you already shipped.
 *
 * So the channels live here, in a table that main, preload, and renderer all
 * import. Adding a feature means adding one line to `IpcContract`; TypeScript
 * then fails the build in the main process until a handler exists, and at
 * every call site until the arguments match. The channel strings are never
 * written by hand anywhere else.
 *
 * `shared/` is compiled into both bundles, so it must stay free of imports
 * from either side — no `electron`, no `node:*`, no React. Types and plain
 * data only.
 */
import type { File, FsResult } from './fs.def';
import type { GitResult, GitStatus } from './git.def';
import type {
  ReplaceRequest,
  ReplaceResult,
  SearchRequest,
  SearchResult,
} from './search.def';
import type { TerminalData, TerminalExit, TerminalInfo } from './terminal.def';

/**
 * Every request/response channel: renderer asks, main answers.
 *
 * `req` is the single argument the renderer passes (`void` for none), `res` is
 * what it gets back. Both cross the boundary by structured clone, so they must
 * hold plain data — no class instances, no functions, no `Map` keyed by
 * anything exotic. A `Map` or `Set` itself clones fine; a zustand store does
 * not.
 */
export interface IpcContract {
  /** Native folder picker. Resolves to null when the user cancels. */
  'project:pick': { req: void; res: string | null };
  /** Recursive scan of a project root into a nested tree, respecting excludes. */
  'project:tree': { req: { root: string }; res: File[] };

  /** Reads a file as UTF-8 text. Rejects if unreadable. */
  'file:read': { req: { path: string }; res: string };
  /** Writes a file, creating parent directories as needed. */
  'file:write': { req: { path: string; content: string }; res: FsResult };

  /**
   * The repository as main last saw it.
   *
   * Takes no root and runs no subprocess: the poller armed by `project:tree`
   * already holds a current snapshot, and this hands back a copy of it. A
   * window asks once — on open, or after a reload replaced its store — and
   * then listens on `git:changed` for everything after that.
   */
  'git:status': { req: void; res: GitStatus };
  /** Local branch names, current one first. Read when the branch menu opens. */
  'git:branches': { req: void; res: string[] };
  /**
   * The five operations that change something. All of them act on the open
   * project's repository, all of them refresh it on the way out, and all of
   * them report git's own stderr rather than throwing — a failed push is a
   * message to show, not an exception.
   */
  'git:fetch': { req: void; res: GitResult };
  'git:pull': { req: void; res: GitResult };
  'git:push': { req: void; res: GitResult };
  'git:checkout': { req: { branch: string }; res: GitResult };
  'git:create-branch': { req: { branch: string }; res: GitResult };

  /**
   * Every match of a query in the open project, walked in main.
   *
   * One channel, called per keystroke after a debounce — which is why main
   * abandons a walk the moment a newer one starts rather than running two.
   * Takes no root: the project is already open on the other side.
   */
  'search:query': { req: SearchRequest; res: SearchResult };
  /**
   * Rewrites every match, either across the project or in named files.
   *
   * Lives beside the query rather than on `file:write` because it must not be
   * a read-modify-write across the boundary: the renderer holds previews, not
   * file contents, and sending a whole file back to be saved would race with
   * anything else editing it.
   */
  'search:replace': { req: ReplaceRequest; res: ReplaceResult };

  /**
   * Spawns a shell on a pseudo-terminal, named by the renderer. Creating a
   * session whose id is already live replaces it — see `createSession`.
   */
  'terminal:create': {
    req: { id: string; cwd: string; cols: number; rows: number };
    res: TerminalInfo;
  };
  /**
   * Keystrokes, on their way to the shell. One call per keypress: the payload
   * is a few bytes, and the alternative — a second, untyped one-way path
   * alongside the contract — buys less than it costs.
   */
  'terminal:write': { req: { id: string; data: string }; res: void };
  /** Tells the PTY its new size, which the kernel turns into a SIGWINCH. */
  'terminal:resize': {
    req: { id: string; cols: number; rows: number };
    res: void;
  };
  /** Ends a session and everything the shell started. */
  'terminal:kill': { req: { id: string }; res: void };

  /** Host facts the renderer can't ask the DOM for. */
  'app:info': { req: void; res: AppInfo };
}

/**
 * Every event channel: main pushes, renderer listens.
 *
 * These are one-way and unacknowledged. A filesystem watcher firing into a
 * window that has since closed is normal, not an error.
 */
export interface IpcEvents {
  /** The watched project tree changed on disk. Payload is the new tree. */
  'project:changed': File[];

  /**
   * The repository moved: a commit, a checkout, a file edited or staged.
   *
   * Polled rather than watched, so this fires on a timer — but only when the
   * tick actually found something different. See `sameStatus` in
   * `main/git/`: an idle repo costs one `git status` every few seconds and no
   * IPC at all.
   */
  'git:changed': GitStatus;

  /**
   * Shell output, batched.
   *
   * The one genuinely high-frequency channel in the app: `yes` or a build log
   * can emit thousands of small writes a second, and one message per write
   * would spend more time in structured clone than in the terminal. Main
   * coalesces them — see `FLUSH_MS` in `main/terminal/`.
   */
  'terminal:data': TerminalData;
  /** The shell exited. The session is gone from main's registry by then. */
  'terminal:exit': TerminalExit;
}

/**
 * `shared/` compiles into the renderer too, which has no Node types, so the
 * platform is spelled out rather than borrowed from `NodeJS.Platform`.
 */
export type Platform = 'darwin' | 'win32' | 'linux';

export interface AppInfo {
  platform: Platform;
  /**
   * The user's home directory, absolute and without a trailing slash.
   *
   * The renderer has no `os.homedir()` and never will, but it is the side that
   * draws paths, and `~/dev/frodon` is what a person recognises. So the prefix
   * crosses once at startup rather than a shortened path crossing per file.
   */
  home: string;
  versions: { electron: string; chrome: string; node: string };
}

export type Channel = keyof IpcContract;
export type Req<C extends Channel> = IpcContract[C]['req'];
export type Res<C extends Channel> = IpcContract[C]['res'];

export type EventChannel = keyof IpcEvents;
export type EventPayload<E extends EventChannel> = IpcEvents[E];

/**
 * The shape `contextBridge` exposes on `window.frodon`.
 *
 * Deliberately a flat list of named methods rather than a generic
 * `invoke(channel, payload)` passthrough. A passthrough would let the renderer
 * reach any channel main ever registers, including ones added later for
 * something else entirely — the exposed surface is the security boundary, so
 * it is written out rather than computed.
 */
export interface FrodonApi {
  project: {
    pick: () => Promise<Res<'project:pick'>>;
    tree: (root: string) => Promise<Res<'project:tree'>>;
    /** Subscribes to tree changes. Returns an unsubscribe function. */
    onChanged: (listener: (files: File[]) => void) => () => void;
  };
  file: {
    read: (path: string) => Promise<Res<'file:read'>>;
    write: (path: string, content: string) => Promise<Res<'file:write'>>;
  };
  git: {
    status: () => Promise<Res<'git:status'>>;
    branches: () => Promise<Res<'git:branches'>>;
    fetch: () => Promise<Res<'git:fetch'>>;
    pull: () => Promise<Res<'git:pull'>>;
    push: () => Promise<Res<'git:push'>>;
    checkout: (branch: string) => Promise<Res<'git:checkout'>>;
    createBranch: (branch: string) => Promise<Res<'git:create-branch'>>;
    /** Subscribes to repository changes. Returns an unsubscribe function. */
    onChanged: (listener: (status: GitStatus) => void) => () => void;
  };
  search: {
    query: (request: Req<'search:query'>) => Promise<Res<'search:query'>>;
    replace: (request: Req<'search:replace'>) => Promise<Res<'search:replace'>>;
  };
  terminal: {
    create: (
      options: Req<'terminal:create'>
    ) => Promise<Res<'terminal:create'>>;
    write: (id: string, data: string) => Promise<void>;
    resize: (id: string, cols: number, rows: number) => Promise<void>;
    kill: (id: string) => Promise<void>;
    /**
     * Subscribes to one session's output. Filtering happens in the preload so
     * that a workbench full of terminals doesn't wake every one of them for
     * every chunk. Returns an unsubscribe function.
     */
    onData: (id: string, listener: (data: string) => void) => () => void;
    onExit: (id: string, listener: (exit: TerminalExit) => void) => () => void;
  };
  app: {
    info: () => Promise<Res<'app:info'>>;
  };
}
