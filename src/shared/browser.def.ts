/**
 * The browser module's half-and-half: the few facts both processes need to
 * agree on before a web page may be shown inside the workbench.
 *
 * Almost all of the browser lives in the renderer — a `<webview>` is a DOM
 * element, so navigation, history and the address bar never cross the
 * boundary and the module adds no IPC channel at all. What *does* have to be
 * shared is the lockdown: the renderer creates the element, main vets it in
 * `will-attach-webview`, and the two have to be looking at the same list.
 *
 * `shared/` compiles into both bundles, so this file stays types and plain
 * functions — no `node:*`, no `electron`, no React.
 */

/**
 * The session every embedded page shares.
 *
 * Named, and persistent, for two reasons. Named, because a guest left on the
 * default session would be sharing cookies and storage with the IDE's own
 * renderer — the one holding the preload bridge. Persistent, because the point
 * of previewing your staging app is to still be logged into it tomorrow.
 *
 * The renderer sets it as an attribute; main overwrites the attribute anyway
 * in `will-attach-webview`, because a partition is a storage boundary and the
 * renderer must not be the side that chooses one.
 */
export const BROWSER_PARTITION = 'persist:frodon-browser';

/**
 * Schemes a browser tab may be pointed at.
 *
 * `javascript:` is the one worth naming out loud: typed into an address bar it
 * executes in whatever page is already loaded, which is how a pasted "fix" for
 * a broken site turns into a session hijack. It is not on this list, and
 * anything not on this list is treated as a search query rather than a URL —
 * see `normalizeUrl`.
 *
 * `file:` is here because previewing a built `index.html` off disk is half the
 * reason this module exists. `about:` covers `about:blank`.
 */
export const BROWSER_SCHEMES = ['http:', 'https:', 'file:', 'about:'];

/**
 * Whether a fully-formed URL may be loaded into a tab.
 *
 * Takes a string rather than a `URL` because both callers have a string and
 * one of them (main, vetting an attribute) must not throw on a malformed one.
 */
export function isAllowedBrowserUrl(url: string): boolean {
  try {
    return BROWSER_SCHEMES.includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
