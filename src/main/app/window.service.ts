/**
 * Creating the application windows.
 *
 * The security flags below are not boilerplate to be loosened when something
 * is awkward to wire up. `contextIsolation` and `sandbox` are what keep the
 * renderer — which runs third-party-ish code in CodeMirror, and will one day
 * render file contents, git output, and language-server responses — from
 * reaching Node. Everything the UI needs from the system goes through the
 * preload bridge instead, which is why that bridge is a written-out list of
 * methods rather than a generic passthrough.
 *
 * `nodeIntegration` stays off forever. If a feature seems to need it, the
 * feature belongs in the main process.
 *
 * There can be several of these now, each on its own project. What a window
 * *is* beyond its pixels — which project it holds, which watcher and poller
 * that means — belongs to `main/session/`, and this file only opens, sizes and
 * reaps them.
 */
import { join } from 'node:path';
import { app, shell, BrowserWindow, type WebContents } from 'electron';
import { is } from '@electron-toolkit/utils';
import { hardenWebviews } from '@main/browser';
import { detachWindow, rootOf, windowForRoot } from '@main/session';
import { killSessionsOf } from '@main/terminal';
import { refreshAppIcon, resetAppIcon } from '@main/icon';

/**
 * The project each window was opened for, before its renderer has asked for
 * anything.
 *
 * Only ever consulted for a window that has not called `project:tree` yet —
 * once it has, the session registry holds the live answer and this one is
 * stale by definition.
 */
const openedFor = new Map<WebContents, string>();

/**
 * What a window should have open when its page loads. `AppInfo.initialRoot`.
 *
 * The session's answer first, because a reload is not a new window: the
 * `WebContents` survives it, so a window that has already attached to a
 * project reopens that project rather than the one it was created with. That
 * is what keeps `pnpm dev`'s hot reload from throwing you back to whichever
 * project the window started on — or, for the first window, to the launcher.
 */
export function initialRootOf(contents: WebContents): string | null {
  return rootOf(contents) ?? openedFor.get(contents) ?? null;
}

/**
 * Opens a window, on a project or on the launcher.
 *
 * A window with a project is created workbench-sized and resizable, because
 * it is going to be a workbench the moment its renderer boots — and that also
 * makes `growToWorkbench` a no-op for it, since the grow is guarded on
 * `isResizable`. A window with none opens small and fixed, because the
 * launcher is a logo and a button.
 */
export function createWindow(root?: string): BrowserWindow {
  const window = new BrowserWindow({
    width: root ? 1400 : 700,
    height: root ? 900 : 700,
    minWidth: 720,
    minHeight: 480,
    show: false,
    resizable: Boolean(root),
    // The traffic lights float over our own chrome; the title bar is ours to
    // draw. `trafficLightPosition` nudges them to sit level with the sidebar
    // header rather than crowding the top-left corner.
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // The browser module's `<webview>` elements. This is the one flag here
      // that widens anything, so it is worth being precise about what it
      // buys: it lets the renderer ask for a guest page, and nothing more.
      // What that guest is allowed to be is decided in `hardenWebviews`,
      // which overwrites every preference the renderer set rather than
      // trusting the element's attributes.
      webviewTag: true,
    },
  });

  // Captured now, not in the `closed` handler: by the time that runs the
  // window is torn down and reading `window.webContents` off it throws.
  const contents = window.webContents;
  const contentsId = contents.id;

  if (root) openedFor.set(contents, root);

  // Showing on `ready-to-show` rather than immediately avoids the white flash
  // of an empty BrowserWindow before the renderer has painted anything.
  window.on('ready-to-show', () => window.show());

  // Off macOS the icon lives on the window rather than on a Dock, so a window
  // that did not exist when the icon was chosen never got one — `show()` in
  // `icon.service.ts` loops the windows that are open at the time, and at
  // startup that is none of them. `resetAppIcon` forgets what is applied so
  // the refresh cannot short-circuit on a key that has not changed.
  //
  // macOS needs none of this: there is one tile for the whole app and it was
  // painted before the first window existed.
  if (process.platform !== 'darwin') {
    window.once('ready-to-show', () => {
      resetAppIcon();
      void refreshAppIcon();
    });
  }

  // Everything a window owns, released when it goes. Two different owners,
  // because they are two different lifetimes:
  //
  //   - the session, which also releases the watcher and the git poller when
  //     this was the *last* window on that project
  //   - the shells, which must die with the window that spawned them and must
  //     survive the ones that didn't — `disposeTerminals` is for quitting
  //
  // `closed` rather than `close`, so a close that something vetoes does not
  // tear down a window that is still open.
  window.on('closed', () => {
    killSessionsOf(contentsId);
    detachWindow(contents);
    openedFor.delete(contents);

    // The Dock belongs to whichever window has focus now, and when another
    // one takes it `browser-window-focus` repaints. Repainting here as well
    // would flash the tile grey in between, because for one moment nothing
    // is focused. The exception is the last window closing, where nothing is
    // going to take focus and grey is the right answer — that is the
    // launcher state.
    if (BrowserWindow.getAllWindows().length === 0) void refreshAppIcon();
  });

  // Anything that would open a new window *from our own UI* — a docs link, an
  // http(s) href in a rendered diff — goes to the user's real browser.
  //
  // Not because an IDE should never show a web page: it has a browser module
  // now, and previewing the thing you are building a window away from the code
  // is the point of it. But a page gets to be shown there, inside a tile, on a
  // locked-down guest session the renderer does not control — never by
  // navigating the window that holds the preload bridge, and never by
  // spawning a `BrowserWindow` with our own preferences on it.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Every guest page this window will ever host, clamped before it exists.
  hardenWebviews(window);

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}

/**
 * Brings a window, and the app, to the front.
 *
 * `window.focus()` is not enough on macOS: it focuses the window *within* the
 * app without making the app active, so a window asked for from the Dock's
 * context menu — which does not activate the app the way clicking the tile
 * does — would be raised behind whatever you were actually looking at.
 * `steal: true` is right here and would be rude anywhere else: every caller
 * is an explicit "give me a window" from the person at the keyboard.
 */
function raise(window: BrowserWindow): void {
  if (window.isMinimized()) window.restore();
  window.focus();
  if (process.platform === 'darwin') app.focus({ steal: true });
}

/**
 * Opens a window on a project, or raises the one that already has it.
 *
 * Two windows on the same project are supported — they share one watcher and
 * one poller — but they are not what clicking a project twice means. The
 * second click is someone looking for the window they already have.
 */
export function openProjectWindow(root?: string): void {
  if (root) {
    const existing = windowForRoot(root);
    if (existing) {
      raise(existing);
      return;
    }
  }

  const window = createWindow(root);
  // A new window shows itself on `ready-to-show`, which raises it inside the
  // app but leaves the app where it was if it was in the background.
  window.once('ready-to-show', () => raise(window));
}

/** Raises some window, for the second instance that was told to go away. */
export function focusAnyWindow(): void {
  const [window] = BrowserWindow.getAllWindows();
  if (!window) {
    openProjectWindow();
    return;
  }

  raise(window);
}
