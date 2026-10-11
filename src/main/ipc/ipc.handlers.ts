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
import { readFileText, writeFileText } from '@main/fs';
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

  handle('project:tree', ({ root }) => openProject(root));

  handle('file:read', ({ path }) => readFileText(path));

  handle('file:write', ({ path, content }) => writeFileText(path, content));

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
