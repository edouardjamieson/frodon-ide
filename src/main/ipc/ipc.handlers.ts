/**
 * Every channel's implementation, registered once at startup.
 *
 * Keeping the registrations in one file is deliberate: the set of channels is
 * the entire attack surface the renderer can reach, and it should be readable
 * top to bottom without hunting through feature folders for a stray `handle`
 * call.
 */
import { basename } from 'node:path';
import { homedir } from 'node:os';
import { dialog, BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { handle } from './ipc.service';
import { getRoot, openProject } from '@main/project';
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
import {
  checkout,
  commit,
  createBranch,
  fetchRemote,
  getStatus,
  listBranches,
  openRepo,
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
import {
  createDirectory,
  createFile,
  deleteEntry,
  readFileText,
  renameEntry,
  writeFileText,
} from '@main/fs';
import { replaceInProject, searchProject } from '@main/search';
import { watchFiles } from '@main/watch';
import {
  createSession,
  killSession,
  resizeSession,
  writeSession,
} from '@main/terminal';
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

export function registerIpcHandlers(): void {
  handle('project:pick', async () => {
    const win = BrowserWindow.getFocusedWindow();
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
  // The window grows here too, rather than in `project:pick` where it used to
  // live. Picking a folder and opening a project stopped being the same event
  // the moment the launcher could open one from its own list, and the window
  // belongs to the second of them.
  handle('project:tree', async ({ root }, event) => {
    const files = openProject(root);
    openRepo(root);
    await recordRecentProject(root);
    growToWorkbench(event);
    return files;
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

  // Read right after `project:tree` for the same reason the layout is: this
  // answers for whichever project main has open, and `openProject` above is
  // what decides which one that is. The pair of writes take no root either —
  // a renderer-supplied directory is a directory a renderer could have main
  // write a file into.
  handle('config:project', () => readProjectConfig());

  handle('config:save-project', ({ config }) => writeProjectConfig(config));

  // The one config channel that answers before a project is open: the
  // launcher is a screen too, and it is already wearing the theme.
  handle('config:user', () => readUserConfig());

  handle('config:save-user', ({ config }) => writeUserConfig(config));

  handle('file:read', ({ path }) => readFileText(path));

  handle('file:write', ({ path, content }) => writeFileText(path, content));

  // The project root is handed over here rather than read inside `fs/`, which
  // would have to import the module that imports it. Main owns the root; the
  // renderer names a parent and a name, and never a path these two then make.
  handle('file:create', ({ parent, name }) =>
    createFile(getRoot(), parent, name)
  );

  handle('file:create-dir', ({ parent, name }) =>
    createDirectory(getRoot(), parent, name)
  );

  handle('file:rename', ({ path, name }) => renameEntry(getRoot(), path, name));

  // The one handler that asks before it acts, and the only reason the dialog
  // is here rather than in `fs/`: `project:pick` already established that a
  // native modal belongs beside the handler that needs one, and the service
  // stays a function that deletes a thing.
  handle('file:delete', async ({ path }, event) => {
    if (!(await confirmDelete(path, event))) {
      return { ok: true, deleted: false };
    }

    const result = await deleteEntry(getRoot(), path);

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
  handle('git:status', () => getStatus());

  handle('git:branches', () => listBranches());

  handle('git:fetch', () => fetchRemote());

  handle('git:pull', () => pull());

  handle('git:push', () => push());

  handle('git:checkout', ({ branch }) => checkout(branch));

  handle('git:create-branch', ({ branch }) => createBranch(branch));

  // The git window's three tabs. None of them is polled: main pushes
  // `git:changed` when the repository moves and the window re-reads what it
  // is showing, so a history nobody has open costs nothing.
  handle('git:branch-details', () => readBranches());

  handle('git:log', (request) => readLog(request));

  // Read on a click rather than on a tick, which is the whole shape of it: a
  // commit cannot change, so nothing here is ever re-read for staleness.
  handle('git:commit-detail', ({ sha }) => readCommitDetail(sha));

  handle('git:diff', (request) => readDiff(request));

  handle('git:stage', ({ paths }) => stage(paths));

  handle('git:unstage', ({ paths }) => unstage(paths));

  handle('git:commit', (request) => commit(request));

  // Both of these walk the tree main already holds, so neither takes a root.
  // A query that is superseded while it runs comes back saying so rather than
  // empty — see `searchProject`.
  handle('search:query', (request) => searchProject(request));

  handle('search:replace', (request) => replaceInProject(request));

  // The sender is what ties a shell to a window: its output is sent back to
  // the window that asked for it and to no other.
  handle('terminal:create', (options, event) =>
    createSession(options, event.sender.id)
  );

  handle('terminal:write', ({ id, data }) => writeSession(id, data));

  handle('terminal:resize', ({ id, cols, rows }) =>
    resizeSession(id, cols, rows)
  );

  handle('terminal:kill', ({ id }) => killSession(id));

  // Boards. The only channels in the app that take a *name* from the
  // renderer rather than a path main produced itself, which is why the
  // service validates every one of them before it builds a path — see
  // `resolveBoardPath`.
  handle('board:list', () => listBoards());

  handle('board:read', (ref) => readBoard(ref));

  handle('board:write', ({ ref, document }) => writeBoard(ref, document));

  handle('board:create', ({ scope, name }) => createBoard(scope, name));

  handle('board:rename', ({ ref, name }) => renameBoard(ref, name));

  handle('board:delete', (ref) => deleteBoard(ref));

  handle('app:info', () => ({
    platform: process.platform as Platform,
    home: homedir(),
    versions: {
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node ?? '',
    },
  }));
}
