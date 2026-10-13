/**
 * Creating the application window.
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
 */
import { join } from 'node:path';
import { shell, BrowserWindow } from 'electron';
import { is } from '@electron-toolkit/utils';
import { hardenWebviews } from '@main/browser';

export function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 700,
    height: 700,
    minWidth: 720,
    minHeight: 480,
    show: false,
    resizable: false,
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

  // Showing on `ready-to-show` rather than immediately avoids the white flash
  // of an empty BrowserWindow before the renderer has painted anything.
  window.on('ready-to-show', () => window.show());

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
