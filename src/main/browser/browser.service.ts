/**
 * Embedded web pages, from main's side of the fence.
 *
 * The browser module is the one feature in the app where the renderer shows
 * something it did not produce and main did not vet: a real web page, from a
 * real server, in a process that sits inside our own window. So the module
 * adds no IPC channel and almost no main-process code — and what little there
 * is, is all refusal.
 *
 * Three things happen here, in the order Electron offers them:
 *
 * 1. `will-attach-webview` fires before a guest exists, with the preferences
 *    and attributes the renderer asked for, both mutable. This is where they
 *    stop being the renderer's choice. Nothing is trusted and nothing is
 *    merged — every flag that matters is overwritten, so a `<webview>` built
 *    with the wrong attributes becomes a safe one rather than a rejected one.
 * 2. The `src` is checked against the shared scheme list, and an attach with
 *    anything else on it is cancelled outright.
 * 3. `did-attach-webview` hands over the guest's `WebContents`, which is where
 *    popups are dealt with — see below.
 *
 * Why this cannot be left to the renderer: the attributes on the element are
 * written by renderer code, and renderer code is the thing being defended
 * against. `webpreferences="contextIsolation=yes"` on the tag is worth
 * writing, but it is a comment until main says the same thing here.
 */
import { shell, type BrowserWindow, type WebContents } from 'electron';
import { BROWSER_PARTITION, isAllowedBrowserUrl } from '@shared/browser.def';
import { createLogger } from '@main/logger';

const log = createLogger('browser');

/**
 * Clamps every `<webview>` this window will ever attach, and routes what the
 * guests try to open.
 *
 * Called once per `BrowserWindow`, beside the window-open handler it mirrors.
 */
export function hardenWebviews(window: BrowserWindow): void {
  window.webContents.on('will-attach-webview', (event, preferences, params) => {
    // Overwritten, not defaulted. `preload` especially: the only preload in
    // this app is the one holding the bridge to main, and handing that to a
    // page from the internet would hand it the filesystem.
    delete preferences.preload;
    preferences.nodeIntegration = false;
    preferences.nodeIntegrationInSubFrames = false;
    preferences.contextIsolation = true;
    preferences.sandbox = true;
    preferences.webSecurity = true;
    preferences.allowRunningInsecureContent = false;
    preferences.experimentalFeatures = false;

    // A partition is a storage boundary, so which one a guest lands in is not
    // the renderer's call. Pinning it here also keeps every tab on one
    // session, which is what makes a login survive a tab being closed.
    params['partition'] = BROWSER_PARTITION;
    // Removed, not set to 'false'. `allowpopups` is an HTML boolean
    // attribute: it is read by presence, so writing 'false' into it is how
    // you grant popups while believing you refused them. Taking the key away
    // is the only spelling that means no.
    delete params['allowpopups'];

    const src = params['src'];
    if (src && !isAllowedBrowserUrl(src)) {
      log.warn(`refused to attach a webview on ${src}`);
      event.preventDefault();
    }
  });

  window.webContents.on('did-attach-webview', (_event, guest) => {
    routePopups(guest);
  });
}

/**
 * What happens when a page asks for a second window — `target="_blank"`, or
 * `window.open`.
 *
 * It goes to the user's real browser, the same way a link in the IDE's own
 * chrome does. Opening it as a new tab here would read better, but the guest
 * is in another process and nothing yet carries "this guest wants a tab" back
 * to the window that owns it; inventing a channel for it would mean main
 * learning which tile holds which `WebContents`, which is a lot of coupling
 * for a link that is going to a different site anyway.
 */
function routePopups(guest: WebContents): void {
  guest.setWindowOpenHandler(({ url }) => {
    if (isAllowedBrowserUrl(url) && !url.startsWith('file:')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}
