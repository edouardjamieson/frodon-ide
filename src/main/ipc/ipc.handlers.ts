/**
 * Every channel's implementation, registered once at startup.
 *
 * Keeping the registrations in one file is deliberate: the set of channels is
 * the entire attack surface the renderer can reach, and it should be readable
 * top to bottom without hunting through feature folders for a stray `handle`
 * call.
 */
import { basename } from 'node:path';
import { arch, homedir, release } from 'node:os';
import { app, dialog, BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { handle } from './ipc.service';
import { getFiles } from '@main/project';
import {
  attachWindow,
  rootOf,
  sessionOf,
  setIdentityRoot,
  setProjectExcludes,
  windowForRoot,
} from '@main/session';
import { initialRootOf, openProjectWindow } from '@main/app';
import { refreshAppIcon } from '@main/icon';
import {
  forgetRecentProject,
  listRecentProjects,
  recordRecentProject,
} from '@main/recents';
import { readProjectLayout, writeProjectLayout } from '@main/layout';
import {
  readProjectConfig,
  readUserConfig,
  writeProjectConfig,
  writeUserConfig,
} from '@main/config';
import type { GitRepo } from '@main/git';
import {
  checkout,
  commit,
  createBranch,
  discardChange,
  discardKind,
  fetchRemote,
  getStatus,
  listBranches,
  pull,
  push,
  readBranches,
  readCommitDetail,
  readDiff,
  readLog,
  stage,
  unstage,
} from '@main/git';
import {
  createBoard,
  deleteBoard,
  listBoards,
  readBoard,
  renameBoard,
  writeBoard,
} from '@main/board';
import { listBookmarks, writeBookmarks } from '@main/bookmark';
import { readFavicon } from '@main/browser';
import {
  createDirectory,
  createFile,
  deleteEntry,
  readFileText,
  readFileBytes,
  renameEntry,
  writeFileText,
} from '@main/fs';
import { replaceInProject, searchProject } from '@main/search';
import {
  createWorktree,
  listWorktrees,
  primaryWorktree,
  removeWorktree,
} from '@main/worktree';
import { watchFiles } from '@main/watch';
import { RELEASE_REPO, getUpdateState, installUpdate } from '@main/update';
import {
  createSession,
  killSession,
  resizeSession,
  writeSession,
} from '@main/terminal';
import { reportIssue } from '@main/feedback';
import {
  agentAvailability,
  interruptConversation,
  setConversationModel,
  respondTo,
  sendMessage,
  startConversation,
  stopConversation,
} from '@main/agent';
import { excludesOf, sanitizeProjectConfig } from '@shared/config.def';
import type { Platform } from '@shared/ipc.def';

/**
 * Asks before something is thrown away.
 *
 * Modal to the window that asked, so it cannot be clicked past or lost behind
 * the app, and worded to say where the thing is going — "deleted" and "moved
 * to the Trash" are different promises, and this one keeps the second.
 */
async function confirmDelete(
  target: string,
  event: IpcMainInvokeEvent
): Promise<boolean> {
  const window = BrowserWindow.fromWebContents(event.sender);
  const options = {
    type: 'warning' as const,
    buttons: ['Move to Trash', 'Cancel'],
    defaultId: 0,
    // Escape and the window's close affordance both land on Cancel.
    cancelId: 1,
    message: `Delete "${basename(target)}"?`,
    detail: 'It will be moved to the Trash, and can be restored from there.',
  };

  const { response } = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);

  return response === 0;
}

/**
 * Asks before uncommitted work is thrown away.
 *
 * A second dialog rather than a flag on `confirmDelete`, because the promise
 * is different and the wording is the whole point. Discarding a tracked
 * file's changes is the one unrecoverable thing this app does — the Trash
 * does not get a copy and neither does git — so that sentence says so
 * plainly, while an untracked file gets the same "moved to the Trash"
 * assurance the explorer gives.
 *
 * The verb on the button matches the outcome too. "Discard" and "Move to
 * Trash" are both honest; "OK" would not be.
 */
async function confirmDiscard(
  target: string,
  kind: 'restore' | 'trash',
  event: IpcMainInvokeEvent
): Promise<boolean> {
  const window = BrowserWindow.fromWebContents(event.sender);
  const options = {
    type: 'warning' as const,
    buttons: [kind === 'trash' ? 'Move to Trash' : 'Discard changes', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    message:
      kind === 'trash'
        ? `Discard "${basename(target)}"?`
        : `Discard changes to "${basename(target)}"?`,
    detail:
      kind === 'trash'
        ? 'Git has never seen this file, so there is nothing to restore it to. It will be moved to the Trash, and can be recovered from there.'
        : 'The file goes back to its last staged or committed state. Nothing else has a copy of these changes, so this cannot be undone.',
  };

  const { response } = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);

  return response === 0;
}

/**
 * Asks before a worktree and everything in it goes.
 *
 * A third dialog rather than a flag on the other two, for the same reason
 * there are two already: the sentence is the point. Removing a worktree
 * deletes a whole checkout, and — because git deletes ignored files without
 * complaint — the `node_modules` and `.env` Frodon carried into it as well.
 * Nothing about clicking a row in a list reveals that, so it is said here.
 *
 * What it does *not* promise is the Trash. A worktree is hundreds of
 * megabytes of carried dependencies; `shell.trashItem` would move all of it
 * and leave the person to empty it by hand. The honest version is that the
 * directory goes and the branch, with every commit on it, stays — which is
 * the thing that actually makes this safe.
 */
async function confirmRemoveWorktree(
  target: string,
  branch: string,
  event: IpcMainInvokeEvent
): Promise<boolean> {
  const window = BrowserWindow.fromWebContents(event.sender);
  const options = {
    type: 'warning' as const,
    buttons: ['Remove worktree', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    message: `Remove the worktree for "${branch}"?`,
    detail:
      `${target}\n\n` +
      'The directory is deleted, and so is everything git ignores that was ' +
      'copied into it — dependencies, build output, local environment ' +
      'files. The branch and its commits are not touched: they are in the ' +
      'repository, not in this directory. Git refuses if anything in it is ' +
      'uncommitted.',
  };

  const { response } = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);

  return response === 0;
}

/**
 * Takes the window from launcher-sized to workbench-sized, once.
 *
 * The window opens small and fixed because the launcher is a logo and a
 * button; a workbench needs room and needs to be resizable. Guarded on
 * `isResizable` so that it happens on the first project opened and never
 * again — a second open in the same window must not throw away a size the
 * user has since chosen.
 */
function growToWorkbench(event: IpcMainInvokeEvent): void {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isResizable()) return;

  window.setSize(1400, 900, true);
  window.setResizable(true);
}

/* -------------------------------------------------------------------------
 * Which project is asking
 *
 * The channels below take no root, and that is the security property rather
 * than a convenience: a directory named by the renderer is a directory main
 * then reads and writes files in. Main derives it instead — from *which
 * window asked*, which the invoke event carries and the page cannot forge.
 *
 * This used to be one module-level root, which answered the same question as
 * long as the app held one project. These two helpers are what that became.
 * ---------------------------------------------------------------------- */

/** The project the asking window has open, or null if it is on the launcher. */
function askingRoot(event: IpcMainInvokeEvent): string | null {
  return rootOf(event.sender);
}

/** That project's repository, for the git channels. */
function askingRepo(event: IpcMainInvokeEvent): GitRepo | null {
  return sessionOf(event.sender)?.repo ?? null;
}

export function registerIpcHandlers(): void {
  handle('project:pick', async (_req, event) => {
    // The window that asked, not the focused one: with several windows open
    // those can differ, and a sheet belongs to the window whose button was
    // clicked.
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] });

    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0] ?? null;
  });

  // Opening a project arms three things, because they are the same event: the
  // tree watcher, the git poller, and the recents list. Git is never told a
  // root by the renderer — it follows the project, which main already knows
  // about.
  //
  // `attachWindow` is where all of that now happens, and it is also what makes
  // this the moment a window *becomes* a window on a project: every no-root
  // channel below resolves against the answer it records. A window opening a
  // second project detaches from the first here, which releases the first
  // project's watcher and poller if nothing else was looking at it.
  //
  // The window grows here too, rather than in `project:pick` where it used to
  // live. Picking a folder and opening a project stopped being the same event
  // the moment the launcher could open one from its own list, and the window
  // belongs to the second of them.
  handle('project:tree', async ({ root }, event) => {
    const session = attachWindow(event.sender, root);
    growToWorkbench(event);

    // One question answering two: whether this checkout is a worktree, and
    // which checkout owns it. Neither can be read off the git snapshot,
    // because this runs before the poller's first tick — the session was
    // created microseconds ago and has observed nothing.
    const owner = await primaryWorktree(session.repo);

    // A worktree is the same project as the repository it was cut from, and
    // has to look like it. Its directory is named after a branch, so deriving
    // an identity from it gives a project called "web-browser" beside a window
    // calling the same project "frodon" — with a hue hashed from the wrong
    // string and an icon to match.
    if (owner) setIdentityRoot(root, owner);

    // A worktree is not a project you opened — it is a second view of one you
    // already have, and the Worktrees panel is how you get back to it.
    // Spending one of the launcher's five slots on a checkout that is a click
    // away from its parent would push out a project nothing else can reach.
    if (!owner) await recordRecentProject(root);

    // The Dock follows the project, when the generated icon is the one
    // chosen — and only for the window you are actually looking at, since
    // macOS has one tile for the whole app. A project opening in a background
    // window leaves the tile alone. Not awaited: the tree is what the
    // renderer is waiting on, and painting a tile has no business holding it
    // up.
    void refreshAppIcon();
    return { files: getFiles(session.watch), identityRoot: owner ?? root };
  });

  // Read right after `project:tree`, never beside it: pruning a layout's
  // board tabs means listing the open project's boards, and `openProject`
  // above is what makes that question answerable.
  handle('project:layout', ({ root }) => readProjectLayout(root));

  handle('project:save-layout', ({ root, layout }) =>
    writeProjectLayout(root, layout)
  );

  handle('project:recents', () => listRecentProjects());

  handle('project:forget-recent', ({ path }) => forgetRecentProject(path));

  // Nothing is read or written here, so unlike every other channel that could
  // name a directory this one is allowed to take one: the root is handed to
  // the new window, which opens it through `project:tree` like any other
  // open. See the channel's own note.
  handle('window:open', ({ root }) => openProjectWindow(root));

  // Read right after `project:tree` for the same reason the layout is: this
  // answers for whichever project the asking window has open, and
  // `attachWindow` above is what decides which one that is. The pair of
  // writes take no root either — a renderer-supplied directory is a directory
  // a renderer could have main write a file into.
  handle('config:project', (_req, event) =>
    readProjectConfig(askingRoot(event))
  );

  // Both writes refresh the icon, for the two different reasons it can go
  // stale: a project's `hue` is what the generated one is painted from, and a
  // user's `appIcon` is which of the nine is showing at all.
  //
  // A project write also reaches the watcher, because `exclude` is the one
  // field main acts on rather than only stores. Applied only once the file is
  // down: a list that failed to save must not be the one the tree is showing,
  // or the explorer and the file would disagree about what this project hides.
  handle('config:save-project', async ({ config }, event) => {
    const root = askingRoot(event);
    const result = await writeProjectConfig(root, config);
    if (result.ok && root) {
      setProjectExcludes(root, excludesOf(sanitizeProjectConfig(config)));
    }
    void refreshAppIcon();
    return result;
  });

  // The one config channel that answers before a project is open: the
  // launcher is a screen too, and it is already wearing the theme.
  handle('config:user', () => readUserConfig());

  handle('config:save-user', async ({ config }) => {
    const result = await writeUserConfig(config);
    void refreshAppIcon();
    return result;
  });

  handle('file:read', ({ path }) => readFileText(path));

  handle('file:read-bytes', ({ path }) => readFileBytes(path));

  handle('file:write', ({ path, content }) => writeFileText(path, content));

  // The project root is handed over here rather than read inside `fs/`, which
  // would have to import the module that imports it. Main owns the root; the
  // renderer names a parent and a name, and never a path these two then make.
  handle('file:create', ({ parent, name }, event) =>
    createFile(askingRoot(event), parent, name)
  );

  handle('file:create-dir', ({ parent, name }, event) =>
    createDirectory(askingRoot(event), parent, name)
  );

  handle('file:rename', ({ path, name }, event) =>
    renameEntry(askingRoot(event), path, name)
  );

  // The one handler that asks before it acts, and the only reason the dialog
  // is here rather than in `fs/`: `project:pick` already established that a
  // native modal belongs beside the handler that needs one, and the service
  // stays a function that deletes a thing.
  handle('file:delete', async ({ path }, event) => {
    if (!(await confirmDelete(path, event))) {
      return { ok: true, deleted: false };
    }

    const result = await deleteEntry(askingRoot(event), path);

    // Reported here too, because the renderer has nowhere to put it: the row
    // is gone from the menu by now, and a delete that quietly did nothing is
    // worse than one that says why.
    if (!result.ok && result.error) {
      dialog.showErrorBox('Could not delete', result.error);
    }

    return result;
  });

  // The sender is what the subscription belongs to, the way it is for a
  // terminal: a change to a file is sent back to the windows that said they
  // were showing it and to no others.
  handle('file:watch', ({ paths }, event) => watchFiles(event.sender, paths));

  // Reads the snapshot main already holds; the poller is what keeps it
  // current. Returning a stale-by-at-most-one-tick answer instantly is worth
  // more here than a fresh one that costs a subprocess per window.
  handle('git:status', (_req, event) => getStatus(askingRepo(event)));

  handle('git:branches', (_req, event) => listBranches(askingRepo(event)));

  handle('git:fetch', (_req, event) => fetchRemote(askingRepo(event)));

  handle('git:pull', (_req, event) => pull(askingRepo(event)));

  handle('git:push', (_req, event) => push(askingRepo(event)));

  handle('git:checkout', ({ branch }, event) =>
    checkout(askingRepo(event), branch)
  );

  handle('git:create-branch', ({ branch }, event) =>
    createBranch(askingRepo(event), branch)
  );

  // The git window's three tabs. None of them is polled: main pushes
  // `git:changed` when the repository moves and the window re-reads what it
  // is showing, so a history nobody has open costs nothing.
  handle('git:branch-details', (_req, event) =>
    readBranches(askingRepo(event))
  );

  handle('git:log', (request, event) => readLog(askingRepo(event), request));

  // Read on a click rather than on a tick, which is the whole shape of it: a
  // commit cannot change, so nothing here is ever re-read for staleness.
  handle('git:commit-detail', ({ sha }, event) =>
    readCommitDetail(askingRepo(event), sha)
  );

  handle('git:diff', (request, event) => readDiff(askingRepo(event), request));

  handle('git:stage', ({ paths }, event) => stage(askingRepo(event), paths));

  handle('git:unstage', ({ paths }, event) =>
    unstage(askingRepo(event), paths)
  );

  // The second handler that asks before it acts, and the harsher of the two:
  // `file:delete` fills the Trash, this throws away an edit that nothing
  // anywhere has a copy of. `discardKind` is consulted here only to pick the
  // wording — the service works it out again before acting, so the sentence
  // and the act cannot disagree.
  handle('git:discard', async ({ path }, event) => {
    const repo = askingRepo(event);
    const kind = discardKind(repo, path);
    // Already clean, or conflicted — which this deliberately does not
    // handle. Nothing to ask about and nothing to do.
    if (!kind) return { ok: true };

    if (!(await confirmDiscard(path, kind, event))) return { ok: true };

    return discardChange(repo, path);
  });

  handle('git:commit', (request, event) => commit(askingRepo(event), request));

  // Both of these walk the tree main already holds for the asking window's
  // project, so neither takes a root. A query that is superseded while it
  // runs comes back saying so rather than empty — see `searchProject`.
  handle('search:query', (request, event) =>
    searchProject(event.sender, request)
  );

  handle('search:replace', (request, event) =>
    replaceInProject(event.sender, request)
  );

  // Worktrees. One repository checked out in more than one place, which is
  // what the per-window project model in `main/session/` was built for.
  handle('worktree:list', (_req, event) => listWorktrees(askingRepo(event)));

  // Opens the window itself rather than answering and letting the renderer
  // do it, because the two are one act: a worktree you have to go and find
  // afterwards is a directory, not a place to work. `openProjectWindow`
  // focuses an existing window if that path somehow already has one.
  handle('worktree:create', async (request, event) => {
    const result = await createWorktree(askingRepo(event), request);
    if (result.ok && result.path) openProjectWindow(result.path);
    return result;
  });

  // The third handler that asks before it acts. Two checks come before the
  // dialog, because neither is a question worth putting to someone: a
  // worktree open in a window must not have its directory deleted out from
  // under it, and a path the listing does not know is not ours to remove.
  handle('worktree:remove', async ({ path: target }, event) => {
    const repo = askingRepo(event);
    const worktrees = await listWorktrees(repo);
    const entry = worktrees.find((w) => w.path === target);

    if (!entry) {
      return { ok: false, error: 'That worktree is not in this repository.' };
    }

    if (windowForRoot(target)) {
      return {
        ok: false,
        error: 'It is open in another window. Close that window first.',
      };
    }

    // A prunable worktree's directory is already gone, so there is nothing to
    // warn about losing and nothing to confirm.
    if (!entry.prunable) {
      const branch = entry.branch || entry.head.slice(0, 7);
      if (!(await confirmRemoveWorktree(target, branch, event))) {
        return { ok: true };
      }
    }

    return removeWorktree(repo, target);
  });

  // The sender is what ties a shell to a window: its output is sent back to
  // the window that asked for it and to no other, and its process tree dies
  // when that window closes rather than when the app quits.
  handle('terminal:create', (options, event) =>
    createSession(options, event.sender.id)
  );

  handle('terminal:write', ({ id, data }) => writeSession(id, data));

  handle('terminal:resize', ({ id, cols, rows }) =>
    resizeSession(id, cols, rows)
  );

  handle('terminal:kill', ({ id }) => killSession(id));

  // Agents. Owned by the window that started them, like shells — and unlike
  // a shell, started in a directory main chooses: the asking window's
  // project. An agent edits files where it runs, so this is the one channel
  // where taking a directory from the renderer would matter most.
  handle('agent:availability', ({ kind }) => agentAvailability(kind));

  handle('agent:start', ({ id, kind }, event) =>
    startConversation(id, kind, askingRoot(event), event.sender.id)
  );

  handle('agent:send', ({ id, text }) => sendMessage(id, text));

  handle('agent:respond', ({ id, requestId, allow }) =>
    respondTo(id, requestId, allow)
  );

  handle('agent:interrupt', ({ id }) => interruptConversation(id));

  handle('agent:set-model', ({ id, model }) => setConversationModel(id, model));

  handle('agent:stop', ({ id }) => stopConversation(id));

  // Boards. The only channels in the app that take a *name* from the
  // renderer rather than a path main produced itself, which is why the
  // service validates every one of them before it builds a path — see
  // `resolveBoardPath`.
  handle('board:list', (_req, event) => listBoards(askingRoot(event)));

  handle('board:read', (ref, event) => readBoard(askingRoot(event), ref));

  handle('board:write', ({ ref, document }, event) =>
    writeBoard(askingRoot(event), ref, document)
  );

  handle('board:create', ({ scope, name }, event) =>
    createBoard(askingRoot(event), scope, name)
  );

  handle('board:rename', ({ ref, name }, event) =>
    renameBoard(askingRoot(event), ref, name)
  );

  handle('board:delete', (ref, event) => deleteBoard(askingRoot(event), ref));

  // Bookmarks. The browser's only channels, and the only ones it needs: a
  // `<webview>` is a DOM element, so navigation never crosses — but a page
  // saved last week has to come back from a file. Neither takes a path or a
  // name, so unlike the board channels there is nothing here to resolve.
  handle('bookmark:list', (_req, event) => listBookmarks(askingRoot(event)));

  handle('bookmark:save', ({ scope, bookmarks }, event) =>
    writeBookmarks(askingRoot(event), scope, bookmarks)
  );

  // The browser's third channel, and the only one that reaches the network.
  // The renderer cannot fetch an icon itself — `img-src 'self' data:` — and
  // should not: the request belongs on the guest's session, not the IDE's.
  handle('browser:favicon', ({ url }) => readFavicon(url));

  // `initialRoot` is the one per-window field here, and the reason this
  // handler takes the event: it is how a window opened by `window:open`
  // learns which project it was opened for.
  handle('app:info', (_req, event) => ({
    platform: process.platform as Platform,
    home: homedir(),
    version: app.getVersion(),
    initialRoot: initialRootOf(event.sender),
    versions: {
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node ?? '',
    },
    osRelease: release(),
    arch: arch(),
    repository: `https://github.com/${RELEASE_REPO}`,
  }));

  handle('app:report-issue', (report) => reportIssue(report));

  handle('update:state', () => getUpdateState());
  handle('update:install', () => installUpdate());
}
