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
import { openProject } from '@main/project';
import {
  checkout,
  createBranch,
  fetchRemote,
  getStatus,
  listBranches,
  openRepo,
  pull,
  push,
} from '@main/git';
import { readFileText, writeFileText } from '@main/fs';
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
    return result.filePaths[0] ?? null;
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
