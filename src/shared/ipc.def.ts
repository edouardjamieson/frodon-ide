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
import type { ProjectConfig, UserConfig } from './config.def';
import type {
  BoardDocument,
  BoardRef,
  BoardResult,
  BoardScope,
  BoardSummary,
} from './board.def';
import type { Bookmark, BookmarkEntry, BookmarkScope } from './bookmark.def';
import type {
  File,
  FileChange,
  FsDeleteResult,
  FsPathResult,
  FsResult,
} from './fs.def';
import type {
  GitBranches,
  GitCommitDetail,
  GitCommitRequest,
  GitDiff,
  GitDiffRequest,
  GitLogCommit,
  GitLogRequest,
  GitResult,
  GitStatus,
} from './git.def';
import type { LayoutSnapshot } from './layout.def';
import type { ProjectTree, RecentProject } from './project.def';
import type {
  ReplaceRequest,
  ReplaceResult,
  SearchRequest,
  SearchResult,
} from './search.def';
import type { TerminalData, TerminalExit, TerminalInfo } from './terminal.def';
import type { UpdateState } from './update.def';
import type { FeedbackReport } from './feedback.def';
import type {
  Worktree,
  WorktreeCreateRequest,
  WorktreeResult,
} from './worktree.def';

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
  /**
   * Recursive scan of a project root into a nested tree, respecting excludes.
   *
   * Answers with the tree **and** the directory this project takes its
   * identity from, which differ only in a worktree — see `ProjectTree`. Both
   * come back from the one call because they are one answer about one project,
   * and a second round trip for the identity would let the header draw a
   * branch slug for a frame before correcting itself.
   */
  'project:tree': { req: { root: string }; res: ProjectTree };
  /**
   * The projects opened before, newest first and at most five.
   *
   * Read by the launcher, which is the one screen in the app with no project
   * behind it — so unlike every other list here, it cannot be derived from
   * one. Main prunes the folders that have since gone away before answering;
   * see `listRecentProjects`.
   */
  'project:recents': { req: void; res: RecentProject[] };
  /**
   * Drops a project from that list. Answers with the list that is left, so
   * the row disappears on one round trip rather than two.
   *
   * It forgets, and nothing more: the folder is not touched. The destructive
   * channel in this app is `file:delete`, and it asks first.
   */
  'project:forget-recent': { req: { path: string }; res: RecentProject[] };
  /**
   * The workbench arrangement this project was last left in, or null.
   *
   * Read once, right after `project:tree`, and in that order on purpose: main
   * prunes board tabs against the boards the *open* project has, so it has to
   * know which project that is before it answers.
   *
   * Null is every way there can fail to be one — never arranged, file gone,
   * written by an older version — because they all mean the same thing on
   * screen, and a renderer that told them apart would do nothing different.
   */
  'project:layout': { req: { root: string }; res: LayoutSnapshot | null };
  /**
   * Records that arrangement. Called on a debounce whenever it changes, and
   * only when it actually did — see `sameSnapshot`.
   *
   * The renderer sends windows and nothing else: the version stamp and the
   * timestamp are the file's business, and main puts them on.
   */
  'project:save-layout': {
    req: { root: string; layout: LayoutSnapshot };
    res: void;
  };

  /**
   * Opens another OS window, on a project or on the launcher.
   *
   * The one channel that takes a root and is not `project:tree`, and it is
   * not an exception to the rule that the renderer never names a directory
   * main reads files in: nothing is read or written here. The root is handed
   * back to the new window as `AppInfo.initialRoot`, which calls
   * `project:tree` with it like any other open — so it goes through the same
   * scan, the same recents entry and the same ordering, and a path that is
   * not a project fails there rather than here.
   *
   * A root that already has a window focuses that window instead of opening a
   * second. Clicking the same project twice is not a request for two copies
   * of it.
   */
  'window:open': { req: { root?: string }; res: void };

  /**
   * The open project's own settings — its name, its color, its icon.
   *
   * Takes no root, for the reason `git:status` and the board channels take
   * none: main already knows which project is open, and a path from the
   * renderer would be a path main then writes a file into. The ordering that
   * follows is the same as `project:layout`'s — this is read *after*
   * `project:tree`, because that is the call that says which project this is
   * about.
   *
   * A project with no config file, an unreadable one, or one whose every
   * field failed its check all answer `{}`. They mean the same thing on
   * screen — nothing has been chosen, so everything is derived — and a
   * renderer that told them apart would do nothing different.
   */
  'config:project': { req: void; res: ProjectConfig };
  /**
   * Writes those settings, replacing the file.
   *
   * The whole config every time rather than a patch: it is three small
   * fields, and a patch channel would put a merge in main that the renderer
   * has already done. Fields the person has not chosen are absent rather than
   * written out — see `ProjectConfig` — so the file stays a list of
   * decisions.
   */
  'config:save-project': { req: { config: ProjectConfig }; res: FsResult };
  /**
   * The person's own settings, which belong to the machine and not to any
   * project. Read once at startup, before a project is open — so unlike the
   * pair above it is answerable from the launcher.
   */
  'config:user': { req: void; res: UserConfig };
  'config:save-user': { req: { config: UserConfig }; res: FsResult };

  /** Reads a file as UTF-8 text. Rejects if unreadable. */
  'file:read': { req: { path: string }; res: string };
  /**
   * Reads a file as its raw bytes. Rejects if unreadable.
   *
   * For the files that are not text — an image tab draws what this returns.
   * A `Uint8Array` clones across the boundary as one copy of the bytes, where
   * a data URL would be a third larger and a string the renderer then has to
   * hold twice.
   */
  'file:read-bytes': { req: { path: string }; res: Uint8Array<ArrayBuffer> };
  /** Writes a file, creating parent directories as needed. */
  'file:write': { req: { path: string; content: string }; res: FsResult };
  /**
   * Creates an empty file, or a directory, inside `parent`.
   *
   * A *parent and a name*, not a path, and the only channels besides the
   * board ones that take something a person typed. Main joins the two itself
   * and checks the result is still inside the open project — see
   * `createFile`. Neither will overwrite what is already there: a name that
   * is taken comes back as an error to show under the field, not as a
   * clobbered file.
   */
  'file:create': { req: { parent: string; name: string }; res: FsPathResult };
  'file:create-dir': {
    req: { parent: string; name: string };
    res: FsPathResult;
  };
  /**
   * Renames an entry within its own directory. Same deal: a name, not a path.
   *
   * It will not rename onto something else. `rename(2)` replaces its target
   * without a word, which would make a mistyped name a way to lose a file, so
   * main checks first — and compares inodes rather than paths, because on a
   * case-insensitive filesystem `Foo.ts` and `foo.ts` are the same entry and
   * changing one into the other is a rename people legitimately want.
   */
  'file:rename': { req: { path: string; name: string }; res: FsPathResult };
  /**
   * Moves an entry to the Trash, after asking.
   *
   * The asking is main's, in a native dialog: this is the one destructive
   * thing the explorer can do, and a modal the window cannot be clicked past
   * is the right register for it. A refusal comes back as `deleted: false`
   * with no error, which is not a failure and must leave the tabs alone.
   *
   * The Trash rather than `unlink` for the same reason — a folder deleted by
   * a slipped click is recoverable, and nothing here is worth making
   * unrecoverable.
   */
  'file:delete': { req: { path: string }; res: FsDeleteResult };

  /**
   * The files this window is showing, so main can say when one of them moves
   * under it.
   *
   * The whole set on every call, replacing whatever was registered before.
   * The renderer derives it from the tabs it has open — which it already
   * holds as a list — and a subscription recomputed from state cannot drift
   * out of step with that state the way a pair of add/remove calls can. An
   * empty list unsubscribes.
   *
   * Only files inside the open project are heard about: the watch this feeds
   * off is the project's own recursive one, and a path it excludes — anything
   * under `node_modules`, say — fires no event however many tabs hold it.
   */
  'file:watch': { req: { paths: string[] }; res: void };

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
   * The same branches with everything the branch view shows: both ahead/behind
   * pairs, and the tip's subject and date.
   *
   * A second channel rather than a richer `git:branches`, because the two have
   * different costs and different readers. The header's menu wants a list of
   * names every time it opens; this runs a `for-each-ref` wide enough to
   * compare every branch against the base, and is read when a window is
   * looking at it.
   */
  'git:branch-details': { req: void; res: GitBranches };
  /**
   * Commits for the history graph, newest first and topologically ordered.
   *
   * Read on demand and on every HEAD move, never polled: a repository that
   * nobody is looking at must not be walking its history every three seconds.
   */
  'git:log': { req: GitLogRequest; res: GitLogCommit[] };
  /**
   * What one commit did: its message body, and the files it touched.
   *
   * Read when a commit is opened in the history and never polled — a commit
   * is immutable, so this is the one git read in the app with no staleness
   * story at all. The subject, author and date are not in it: the row that
   * opened the commit already has them, and this channel is only the part
   * that costs a subprocess.
   */
  'git:commit-detail': { req: { sha: string }; res: GitCommitDetail };
  /**
   * One file's patch, already parsed into numbered lines.
   *
   * Parsing in main is the point — see `GitDiff`. The renderer holds rows, not
   * a patch, the same way the search panel holds previews and not file
   * contents.
   */
  'git:diff': { req: GitDiffRequest; res: GitDiff };
  /**
   * The operations that change something. All of them act on the open
   * project's repository, all of them refresh it on the way out, and all of
   * them report git's own stderr rather than throwing — a failed push is a
   * message to show, not an exception.
   */
  'git:fetch': { req: void; res: GitResult };
  'git:pull': { req: void; res: GitResult };
  'git:push': { req: void; res: GitResult };
  'git:checkout': { req: { branch: string }; res: GitResult };
  'git:create-branch': { req: { branch: string }; res: GitResult };
  /** Stages the given repository-relative paths, or everything when empty. */
  'git:stage': { req: { paths: string[] }; res: GitResult };
  /** The inverse. Same convention: an empty list means all of it. */
  'git:unstage': { req: { paths: string[] }; res: GitResult };
  /**
   * Throws away one file's unstaged changes, after asking.
   *
   * The asking is main's, in a native dialog, for the reason `file:delete`'s
   * is: this destroys work, and a modal the window cannot be clicked past is
   * the right register. It is the harsher of the two — a deleted file is in
   * the Trash, an uncommitted edit discarded here is nowhere — so the dialog
   * says which of the two is about to happen.
   *
   * One path, not an array like `git:stage`. The confirmation names the
   * file, and "discard 14 files?" is a sentence nobody reads before
   * clicking.
   *
   * A cancelled dialog answers `{ ok: true }`, indistinguishable from a
   * discard that found nothing to do. Unlike `file:delete` — which needs
   * `deleted` so the renderer does not close tabs for a file the person kept
   * — nothing here has to react to the difference: the row list comes from
   * the next `git:changed`, and a cancel produces no change to push.
   */
  'git:discard': { req: { path: string }; res: GitResult };
  /** Records what is staged. Fails with git's own message if a hook rejects it. */
  'git:commit': { req: GitCommitRequest; res: GitResult };

  /**
   * Every match of a query in the open project, walked in main.
   *
   * One channel, called per keystroke after a debounce — which is why main
   * abandons a walk the moment a newer one starts rather than running two.
   * Takes no root: the project is already open on the other side.
   */
  /**
   * Every checkout of this repository, the repository's own first.
   *
   * Answered straight from `git worktree list`, which is why there is no
   * worktree file anywhere under `~/.frodon/`: the repository already records
   * which branch is checked out where, and a second copy of that could only
   * ever be the one that is wrong.
   *
   * Takes no root, like every other git channel — the repository is the one
   * the asking window has open.
   */
  'worktree:list': { req: void; res: Worktree[] };
  /**
   * Adds a worktree, carries the ignored files into it, and answers with its
   * path so the caller can open a window on it.
   *
   * Slow by nature: the second half is copying a `node_modules`, which is
   * near-instant on a filesystem with copy-on-write and minutes on one
   * without. There is no progress event — the renderer shows a pending state
   * and waits, because the thing it would report progress on is a single
   * recursive copy with no granularity to report.
   *
   * Whether `branch` is new is decided in main by asking the repository, not
   * by a flag sent from the renderer whose branch list is a render old.
   */
  'worktree:create': {
    req: WorktreeCreateRequest;
    res: WorktreeResult;
  };
  /**
   * Removes one, after main has asked.
   *
   * The path came from `worktree:list`, so this is the round trip closing
   * rather than the renderer naming a directory for main to delete — and main
   * checks it against the listing again anyway before acting.
   *
   * Never forces. Git refuses a worktree holding uncommitted work and the
   * refusal is reported as git wrote it.
   */
  'worktree:remove': { req: { path: string }; res: WorktreeResult };

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

  /**
   * Every board in both scopes, newest first.
   *
   * One channel for the pair rather than one per scope: the sidebar draws
   * both sections at once, and two round trips to fill one panel is two
   * chances to render it half-populated.
   */
  'board:list': { req: void; res: BoardSummary[] };
  /** One board's elements. A board that isn't there reads as an empty one. */
  'board:read': { req: BoardRef; res: BoardDocument };
  /**
   * The whole document, every time.
   *
   * No patch channel, and no per-stroke writes: a board is small, the window
   * debounces, and the alternative — shipping operations across the boundary
   * and replaying them in main — would put a second copy of the element model
   * in the process that has no business knowing what an ellipse is.
   */
  'board:write': {
    req: { ref: BoardRef; document: BoardDocument };
    res: FsResult;
  };
  /** Creates an empty board, uniquifying the name. Answers with the name used. */
  'board:create': {
    req: { scope: BoardScope; name?: string };
    res: BoardResult;
  };
  /** Renames within a scope. Refuses rather than clobbering an existing board. */
  'board:rename': { req: { ref: BoardRef; name: string }; res: BoardResult };
  'board:delete': { req: BoardRef; res: FsResult };

  /**
   * Every bookmark in both scopes, in the order each file lists them.
   *
   * The one pair of channels the browser module has, and the only reason it
   * earns them: a `<webview>` is a DOM element, so nothing else about a tab
   * ever crosses — but a page saved last week has to come back from a file,
   * and the renderer cannot read one. See `shared/bookmark.def.ts`.
   *
   * Takes no root, for the reason the board and config channels take none:
   * main already knows which project is open, and a path from the renderer
   * would be a path main then writes a file into.
   *
   * Unsorted on purpose. A bookmarks list is arranged rather than generated,
   * and an order imposed in main is one the renderer cannot get back.
   */
  'bookmark:list': { req: void; res: BookmarkEntry[] };
  /**
   * Replaces one scope's file.
   *
   * The whole list every time, like `board:write` and for the same reasons:
   * it is small, the renderer holds all of it, and a patch channel would put
   * a merge in main that the renderer has already done.
   *
   * One scope per call, which is what makes moving a bookmark between them
   * two calls. That is the right cost — the project file is committed, and
   * rewriting it because a *local* bookmark was renamed would put noise in
   * somebody's `git status`.
   */
  'bookmark:save': {
    req: { scope: BookmarkScope; bookmarks: Bookmark[] };
    res: FsResult;
  };

  /**
   * A page's own icon, as a `data:` URL, or null when there isn't a usable
   * one.
   *
   * The renderer has the URL — the guest reports it on
   * `page-favicon-updated` — and cannot do anything with it. The IDE's CSP is
   * `img-src 'self' data:`, so the privileged renderer loads nothing from the
   * network by design, and a favicon URL is a string the *page* chose.
   *
   * So main fetches it, on the guest's own session, and hands back bytes the
   * CSP already allows. Null covers every way this fails — not an image, too
   * big, server down, refused scheme — because they all leave the same
   * generic globe on the tab.
   *
   * Answers are cached in main, hits and misses alike: four tabs on one site
   * ask at the same moment, and a site with no favicon would otherwise be
   * re-asked on every navigation.
   */
  'browser:favicon': { req: { url: string }; res: string | null };

  /** Host facts the renderer can't ask the DOM for. */
  'app:info': { req: void; res: AppInfo };

  /**
   * Opens a new GitHub issue in the person's browser, filled in from the
   * feedback form.
   *
   * The renderer hands over the three things a person typed and **main
   * builds the URL** — the repository, the query string, the version block
   * appended to the body. A channel that took a URL would be a channel that
   * opened whatever the page asked it to in the system browser, which is the
   * same widening `ipc.def.ts` refuses for paths.
   *
   * Answers whether the browser was asked. Nothing is posted from here: the
   * issue exists once the person presses Submit on GitHub, or never.
   */
  'app:report-issue': { req: FeedbackReport; res: { ok: boolean } };

  /**
   * Where the updater is, for a window that has just opened.
   *
   * Asked once on mount and then kept current by `update:changed`. A window
   * opened after the download finished has to be told it is ready, and the
   * event alone would leave it waiting half an hour for the next check.
   */
  'update:state': { req: void; res: UpdateState };
  /**
   * Quits, swaps the new bundle in, and opens it again on the projects that
   * were open. Ignored unless the state is `ready`.
   *
   * It takes nothing and answers before anything happens: the app is gone a
   * moment later, so there is nobody left to tell how it went.
   */
  'update:install': { req: void; res: void };
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
   * A file some window is showing was rewritten — or deleted — by something
   * that is not this app: an agent, a `git pull`, another editor.
   *
   * Sent only to the windows that registered that path through `file:watch`,
   * and only when the file's mtime and size actually moved. Carries no
   * contents: see `FileChange`.
   */
  'file:changed': FileChange;

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

  /**
   * The updater moved — a download started, finished, or failed. Sent to
   * every window, and only when the state actually changed.
   */
  'update:changed': UpdateState;
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
  /** Frodon's own version, from package.json. `0.1.0`, no `v`. */
  version: string;
  versions: { electron: string; chrome: string; node: string };
  /** The kernel's release — `25.5.0` on macOS 26 — as `os.release()` says it. */
  osRelease: string;
  /** `arm64`, `x64`. Which build is running, which is not always the machine's. */
  arch: string;
  /**
   * Where this copy comes from and takes reports: `RELEASE_REPO` as a URL.
   *
   * Handed over rather than written into the renderer a second time, so a
   * fork that changes the one line in `main/update/` gets an About page that
   * links to the fork.
   */
  repository: string;
  /**
   * The project this window was opened for, or null for a launcher window.
   *
   * How a window spawned by `window:open` learns what it is for. It rides on
   * the call the renderer already makes first rather than arriving as an
   * event, which is what keeps it free of a race: there is no window between
   * the page loading and a push landing for it to be missed in.
   *
   * Read once and acted on once. It is what main *opened* the window with,
   * not what the window has open now — a window that has since switched
   * projects still reports the root it started on, and nothing reads it
   * again.
   */
  initialRoot: string | null;
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
    recents: () => Promise<Res<'project:recents'>>;
    forgetRecent: (path: string) => Promise<Res<'project:forget-recent'>>;
    layout: (root: string) => Promise<Res<'project:layout'>>;
    saveLayout: (
      root: string,
      layout: LayoutSnapshot
    ) => Promise<Res<'project:save-layout'>>;
    /** Subscribes to tree changes. Returns an unsubscribe function. */
    onChanged: (listener: (files: File[]) => void) => () => void;
  };
  config: {
    project: () => Promise<Res<'config:project'>>;
    saveProject: (config: ProjectConfig) => Promise<Res<'config:save-project'>>;
    user: () => Promise<Res<'config:user'>>;
    saveUser: (config: UserConfig) => Promise<Res<'config:save-user'>>;
  };
  file: {
    read: (path: string) => Promise<Res<'file:read'>>;
    readBytes: (path: string) => Promise<Res<'file:read-bytes'>>;
    write: (path: string, content: string) => Promise<Res<'file:write'>>;
    create: (parent: string, name: string) => Promise<Res<'file:create'>>;
    createDir: (
      parent: string,
      name: string
    ) => Promise<Res<'file:create-dir'>>;
    rename: (path: string, name: string) => Promise<Res<'file:rename'>>;
    /** `remove`, not `delete`: the latter is a reserved word. See `board`. */
    remove: (path: string) => Promise<Res<'file:delete'>>;
    /** Registers the paths this window is showing. See `file:watch`. */
    watch: (paths: string[]) => Promise<Res<'file:watch'>>;
    /**
     * Subscribes to changes made to those files outside Frodon. Returns an
     * unsubscribe function.
     */
    onChanged: (listener: (change: FileChange) => void) => () => void;
  };
  git: {
    status: () => Promise<Res<'git:status'>>;
    branches: () => Promise<Res<'git:branches'>>;
    fetch: () => Promise<Res<'git:fetch'>>;
    pull: () => Promise<Res<'git:pull'>>;
    push: () => Promise<Res<'git:push'>>;
    checkout: (branch: string) => Promise<Res<'git:checkout'>>;
    createBranch: (branch: string) => Promise<Res<'git:create-branch'>>;
    branchDetails: () => Promise<Res<'git:branch-details'>>;
    log: (request: Req<'git:log'>) => Promise<Res<'git:log'>>;
    commitDetail: (sha: string) => Promise<Res<'git:commit-detail'>>;
    diff: (request: Req<'git:diff'>) => Promise<Res<'git:diff'>>;
    stage: (paths: string[]) => Promise<Res<'git:stage'>>;
    unstage: (paths: string[]) => Promise<Res<'git:unstage'>>;
    discard: (path: string) => Promise<Res<'git:discard'>>;
    commit: (request: Req<'git:commit'>) => Promise<Res<'git:commit'>>;
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
  board: {
    list: () => Promise<Res<'board:list'>>;
    read: (ref: BoardRef) => Promise<Res<'board:read'>>;
    write: (
      ref: BoardRef,
      document: BoardDocument
    ) => Promise<Res<'board:write'>>;
    create: (scope: BoardScope, name?: string) => Promise<Res<'board:create'>>;
    rename: (ref: BoardRef, name: string) => Promise<Res<'board:rename'>>;
    remove: (ref: BoardRef) => Promise<Res<'board:delete'>>;
  };
  browser: {
    favicon: (url: string) => Promise<Res<'browser:favicon'>>;
  };
  bookmark: {
    list: () => Promise<Res<'bookmark:list'>>;
    save: (
      scope: BookmarkScope,
      bookmarks: Bookmark[]
    ) => Promise<Res<'bookmark:save'>>;
  };
  worktree: {
    list: () => Promise<Res<'worktree:list'>>;
    create: (
      request: Req<'worktree:create'>
    ) => Promise<Res<'worktree:create'>>;
    remove: (path: string) => Promise<Res<'worktree:remove'>>;
  };
  window: {
    /** Opens another OS window. No root means the launcher. */
    open: (root?: string) => Promise<Res<'window:open'>>;
  };
  app: {
    info: () => Promise<Res<'app:info'>>;
    reportIssue: (report: FeedbackReport) => Promise<Res<'app:report-issue'>>;
  };
  update: {
    state: () => Promise<Res<'update:state'>>;
    install: () => Promise<Res<'update:install'>>;
    /** Subscribes to updater changes. Returns an unsubscribe function. */
    onChanged: (listener: (state: UpdateState) => void) => () => void;
  };
}
