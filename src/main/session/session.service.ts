/**
 * Which project each window has open, and the services that project runs.
 *
 * Main used to hold one root. That was true for as long as the app showed one
 * project, and it stopped being true the moment a second window could exist —
 * so the one `let root` became this: a registry that answers two questions and
 * owns the lifetime of everything that hangs off them.
 *
 *   - **Which project is this window on?** `rootOf(event.sender)`. This is
 *     what the no-root channels resolve against now. The renderer still never
 *     names a path main then reads or writes files in; main derives it from
 *     *which window asked* instead of from a global, which is strictly more
 *     of the guarantee ADR-0015 is about, not less.
 *   - **Which windows are on this project?** So a tree or a git snapshot
 *     reaches the windows showing that project and no others.
 *
 * **Keyed by root, ref-counted by window.** Two windows on the same project
 * share one filesystem watcher and one git poller — opening nine windows onto
 * one project still does not run `git status` nine times — and the services
 * are released when the *last* of those windows goes, not the first.
 *
 * The `WebContents` is the key rather than its id, the way `main/watch/` does
 * it: a closed window's entry drops by identity and there is no id left to go
 * stale and collide with a later window's.
 */
import { BrowserWindow, type WebContents } from 'electron';
import { createLogger } from '@main/logger';
import { closeProject, openProject, type ProjectWatch } from '@main/project';
import { closeRepo, openRepo, type GitRepo } from '@main/git';
import type { EventChannel, EventPayload } from '@shared/ipc.def';

const log = createLogger('session');

/** One open project, and every window looking at it. */
export interface ProjectSession {
  readonly root: string;
  /**
   * The directory this project takes its name, hue and icon from.
   *
   * The root, except in a worktree, where it is the repository's own working
   * tree — see `ProjectTree` in `@shared/project.def`. Resolved by
   * `project:tree` rather than here, because answering it costs a `rev-parse`
   * and `attachWindow` is synchronous; until then it is the root, which is
   * the right answer for every project that is not a worktree.
   */
  identityRoot: string;
  readonly watch: ProjectWatch;
  readonly repo: GitRepo;
  readonly windows: Set<WebContents>;
  /**
   * The search generation, per window.
   *
   * On the session rather than in `main/search/` because that module is a
   * walk and a comparison with no state of its own — and per window rather
   * than per root because two windows on one project each have their own
   * search panel, and one typing must not cancel the other's walk.
   */
  readonly searchGenerations: Map<WebContents, number>;
}

const byRoot = new Map<string, ProjectSession>();
const byWindow = new Map<WebContents, ProjectSession>();

/**
 * The windows whose teardown is already hooked.
 *
 * Separate from `byWindow`, which a window leaves and rejoins every time it
 * opens a different project — hanging the listener off that would add one per
 * switch, and an afternoon of opening projects in one window would end with a
 * stack of them.
 */
const hooked = new WeakSet<WebContents>();

/**
 * Sends to the windows on one project, and to no others.
 *
 * The reason `project/` and `git/` no longer loop over
 * `BrowserWindow.getAllWindows()` themselves: they emit a fact about a
 * repository, and which windows that means is a question only this file can
 * answer.
 */
function sendToProject<E extends EventChannel>(
  root: string,
  channel: E,
  payload: EventPayload<E>
): void {
  const session = byRoot.get(root);
  if (!session) return;

  for (const contents of session.windows) {
    if (contents.isDestroyed()) continue;
    contents.send(channel, payload);
  }
}

/** Starts the watcher and the poller for a root nobody had open yet. */
function createSession(root: string): ProjectSession {
  const session: ProjectSession = {
    root,
    identityRoot: root,
    watch: openProject(root, (files) =>
      sendToProject(root, 'project:changed', files)
    ),
    repo: openRepo(root, (status) =>
      sendToProject(root, 'git:changed', status)
    ),
    windows: new Set(),
    searchGenerations: new Map(),
  };

  byRoot.set(root, session);
  return session;
}

/** Stops them, when the last window on a project has gone. */
function destroySession(session: ProjectSession): void {
  closeProject(session.watch);
  closeRepo(session.repo);
  byRoot.delete(session.root);
  log.info(`released ${session.root}`);
}

/**
 * Puts a window on a project, taking it off whatever it was on before.
 *
 * Called from `project:tree`, which is the channel that establishes what a
 * window is showing — the same event that arms the watcher, the poller and
 * the recents list. A window that opens a second project detaches from the
 * first here, which is what releases the first project's services when that
 * window was the only one on it.
 */
export function attachWindow(
  contents: WebContents,
  root: string
): ProjectSession {
  const current = byWindow.get(contents);
  if (current?.root === root) return current;
  if (current) detachWindow(contents);

  const session = byRoot.get(root) ?? createSession(root);
  session.windows.add(contents);
  byWindow.set(contents, session);

  // Dropped when the window goes, the way `main/watch/` registers its own
  // cleanup: a window that is destroyed without anything calling `detach` —
  // a crashed renderer — must not leave a poller running for a project
  // nobody can see. Registered once per window rather than once per attach.
  if (!hooked.has(contents)) {
    hooked.add(contents);
    contents.once('destroyed', () => detachWindow(contents));
  }

  log.info(`window ${contents.id} -> ${root} (${session.windows.size} on it)`);
  return session;
}

/** Takes a window off its project, releasing the project if it was the last. */
export function detachWindow(contents: WebContents): void {
  const session = byWindow.get(contents);
  if (!session) return;

  byWindow.delete(contents);
  session.windows.delete(contents);
  session.searchGenerations.delete(contents);

  if (session.windows.size === 0) destroySession(session);
}

/** The project a window has open, or null for one still on the launcher. */
export function sessionOf(contents: WebContents): ProjectSession | null {
  return byWindow.get(contents) ?? null;
}

/** That project's root. The answer the no-root channels resolve against. */
export function rootOf(contents: WebContents | null): string | null {
  if (!contents) return null;
  return byWindow.get(contents)?.root ?? null;
}

/**
 * The directory that project is named, coloured and iconed after.
 *
 * Separate from `rootOf` because a worktree is the same project as the
 * repository it came from: the Dock tile for a worktree window has to be the
 * colour of the project, not of a directory named after a branch.
 */
export function identityRootOf(contents: WebContents | null): string | null {
  if (!contents) return null;
  return byWindow.get(contents)?.identityRoot ?? null;
}

/** Records where a project's identity comes from, once `project:tree` knows. */
export function setIdentityRoot(root: string, identityRoot: string): void {
  const session = byRoot.get(root);
  if (session) session.identityRoot = identityRoot;
}

/** The window showing `root`, if one already is. */
export function windowForRoot(root: string): BrowserWindow | null {
  const session = byRoot.get(root);
  if (!session) return null;

  for (const contents of session.windows) {
    if (contents.isDestroyed()) continue;
    const window = BrowserWindow.fromWebContents(contents);
    if (window && !window.isDestroyed()) return window;
  }

  return null;
}

/** Releases every project. Called on the way out. */
export function disposeSessions(): void {
  for (const session of [...byRoot.values()]) destroySession(session);
  byWindow.clear();
}
