/**
 * The main process entry point.
 *
 * This is the Node half: it owns the filesystem, git and the PTYs, and is the
 * only place in the app allowed to touch any of them. It creates windows; it
 * does not know what they draw.
 *
 * **One process, several windows.** Each window holds its own project, and
 * `main/session/` is what remembers which — including the fact that two
 * windows on the same project share one watcher and one git poller. Several
 * *processes* would have been the other way to get two projects on screen,
 * and it is the wrong one: two Dock tiles, two pollers against the same
 * object store, and two writers racing on the files under `~/.frodon/`.
 */
import { app, BrowserWindow } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import {
  createDockMenu,
  createMenu,
  createWindow,
  focusAnyWindow,
} from '@main/app';
import { registerIpcHandlers } from '@main/ipc';
import { disposeSessions } from '@main/session';
import { disposeWatchedFiles } from '@main/watch';
import { disposeTerminals } from '@main/terminal';
import { refreshAppIcon } from '@main/icon';
import { createLogger } from '@main/logger';

const log = createLogger('main');

/**
 * One Frodon per machine.
 *
 * Without this, opening the app again — from Spotlight, from `open -a`, from
 * a second click on the Dock tile — starts a whole second process, and
 * everything this app keeps per *app* immediately has two owners: the Dock
 * tile, the git pollers, and `recents.json` and `layouts.json` under
 * `~/.frodon/`, which two processes would write over each other.
 *
 * The right answer to "open it again" is a window, not a copy, and a window
 * is what the second instance gets told to make before it exits.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => focusAnyWindow());

  void app.whenReady().then(() => {
    // Sets the AppUserModelId so Windows groups our windows under one taskbar
    // entry and notifications attribute correctly. A no-op elsewhere.
    electronApp.setAppUserModelId('io.volume7.frodon');

    // F12 toggles DevTools in development and is ignored in production, so a
    // shipped build can't be poked open by a stray keypress.
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    // The Dock wears the focused window's project. macOS has one tile per app
    // and no per-window icon, so with two projects open there is no
    // arrangement that shows both — the window you are looking at is the
    // honest answer. See ADR-0033, and `icon.service.ts` for why repeating
    // this on every alt-tab costs nothing.
    app.on('browser-window-focus', () => void refreshAppIcon());

    // Handlers must exist before the first window loads: the renderer invokes
    // `app:info` during its initial render, and an unregistered channel
    // rejects rather than queuing.
    registerIpcHandlers();
    // Before the window, so the first one opens under the menu it will keep —
    // and so Cmd+W is already the renderer's to handle. See `menu.service.ts`.
    createMenu();
    // The Dock tile's own menu, so another window can be asked for without
    // first bringing one to the front. A no-op off macOS.
    createDockMenu();
    // Also before the window, and deliberately not awaited. `setIcon` is
    // process state rather than anything stored in the bundle, so the chosen
    // icon has to be put back on every launch — but it is a tile in the Dock,
    // and nothing about the first window should wait on it.
    void refreshAppIcon();
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
}

// Every platform but macOS treats closing the last window as quitting.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Release every project's watcher and poller, and kill every shell, before
// teardown. A window closing already does its own share of this — see
// `createWindow` — so what is left here is the case that skips it: quitting
// with windows still open. A PTY holds a whole process tree, a dev server, a
// watcher, and nothing else is going to reap it: see `terminal.registry.ts`.
app.on('will-quit', () => {
  disposeSessions();
  disposeWatchedFiles();
  disposeTerminals();
});
