/**
 * Every channel's implementation, registered once at startup.
 *
 * Keeping the registrations in one file is deliberate: the set of channels is
 * the entire attack surface the renderer can reach, and it should be readable
 * top to bottom without hunting through feature folders for a stray `handle`
 * call.
 */
import { homedir } from 'node:os';
import { dialog, BrowserWindow } from 'electron';
import { handle } from './ipc.service';
import { getRoot, openProject } from '@main/project';
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
  readFileText,
  writeFileText,
} from '@main/fs';
import { replaceInProject, searchProject } from '@main/search';
import {
  createSession,
  killSession,
  resizeSession,
  writeSession,
} from '@main/terminal';
import type { Platform } from '@shared/ipc.def';

export function registerIpcHandlers(): void {
  handle('project:pick', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] });

    if (result.canceled || result.filePaths.length === 0) return null;
    if (result.filePaths[0]) {
      win?.setSize(1400, 900, true);
      win?.setResizable(true);
      return result.filePaths[0];
    }
    return null;
  });

  // Opening a project arms two things, because they are the same event: the
  // tree watcher and the git poller. Git is never told a root by the
  // renderer — it follows the project, which main already knows about.
  handle('project:tree', ({ root }) => {
    const files = openProject(root);
    openRepo(root);
    return files;
  });

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
