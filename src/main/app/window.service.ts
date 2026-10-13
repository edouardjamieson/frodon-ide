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
    },
  });

  // Showing on `ready-to-show` rather than immediately avoids the white flash
  // of an empty BrowserWindow before the renderer has painted anything.
  window.on('ready-to-show', () => window.show());

  // Anything that would open a new window — a docs link, an http(s) href —
  // goes to the user's real browser instead. An IDE should never be a browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}
