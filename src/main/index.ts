/**
 * The main process entry point.
 *
 * This is the Node half: it owns the filesystem, will own git and the PTYs,
 * and is the only place in the app allowed to touch either. It creates
 * windows; it does not know what they draw.
 */
import { app, BrowserWindow } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { createMenu, createWindow } from '@main/app';
import { registerIpcHandlers } from '@main/ipc';
import { disposeProject } from '@main/project';
import { disposeGit } from '@main/git';
import { disposeTerminals } from '@main/terminal';
import { createLogger } from '@main/logger';

const log = createLogger('main');

void app.whenReady().then(() => {
  // Sets the AppUserModelId so Windows groups our windows under one taskbar
  // entry and notifications attribute correctly. A no-op elsewhere.
  electronApp.setAppUserModelId('io.volume7.frodon');

  // F12 toggles DevTools in development and is ignored in production, so a
  // shipped build can't be poked open by a stray keypress.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Handlers must exist before the first window loads: the renderer invokes
  // `app:info` during its initial render, and an unregistered channel rejects
  // rather than queuing.
  registerIpcHandlers();
  // Before the window, so the first one opens under the menu it will keep —
  // and so Cmd+W is already the renderer's to handle. See `menu.service.ts`.
  createMenu();
  createWindow();

  // macOS keeps the app alive with no windows; clicking the dock icon is
  // expected to bring one back.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  log.info(
    `ready on ${process.platform} (electron ${process.versions.electron})`
  );
});

// Every platform but macOS treats closing the last window as quitting.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Release the filesystem watcher and kill every shell before teardown. A PTY
// holds a whole process tree — a dev server, a watcher — and nothing else is
// going to reap it: see `terminal.registry.ts`.
app.on('will-quit', () => {
  disposeProject();
  disposeGit();
  disposeTerminals();
});
