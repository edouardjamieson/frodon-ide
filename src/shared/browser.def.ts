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

/* -------------------------------------------------------------------------
 * Favicons
 *
 * A page's own icon is the one thing in this module that the renderer cannot
 * just draw. The IDE's CSP is `img-src 'self' data:` — it loads nothing from
 * the network, deliberately, so that a hostile string reaching the DOM has
 * nowhere to send anything. A favicon URL is a hostile string by default: it
 * comes from the page.
 *
 * Relaxing the CSP to `img-src https:` would be the one-line fix and is the
 * wrong one. It would hand every string that reaches an `<img>` in the
 * privileged renderer a way out to the network, which is exactly what that
 * header exists to prevent — and it would put the request on the IDE's own
 * session rather than the guest's.
 *
 * So main fetches the icon on the guest's session and hands back a `data:`
 * URL, which the CSP already allows. See `main/browser/favicon.service.ts`.
 * ---------------------------------------------------------------------- */

/**
 * Schemes a favicon may be fetched from.
 *
 * Narrower than `BROWSER_SCHEMES`, and `file:` is the one deliberately left
 * off. A page declares its own favicon URL, so honouring a `file:` one would
 * let a page choose which local file main reads and hands to the privileged
 * renderer. A local preview gets the generic globe instead, which is a fine
 * price for not having a page steer a filesystem read.
 */
export const FAVICON_SCHEMES = ['http:', 'https:'];

/**
 * How much of an icon is worth carrying.
 *
 * 256KB is far past any real favicon — a 32×32 PNG is under 2KB, and the
 * largest `apple-touch-icon` anyone ships is tens of KB. The limit is not
 * about disk; it is that this crosses the IPC boundary base64-encoded, where
 * a "favicon" that is secretly a 40MB image is a 53MB string in a structured
 * clone.
 */
export const MAX_FAVICON_BYTES = 256 * 1024;

/** Longest favicon URL worth trying. Past this it is not a URL, it is a payload. */
export const MAX_FAVICON_URL_LENGTH = 2048;

/**
 * Whether a favicon URL is one main will go and fetch.
 *
 * `data:` is not here because it is never fetched — see `isDataImageUrl`,
 * which is the other half of the answer.
 */
export function isAllowedFaviconUrl(url: string): boolean {
  if (typeof url !== 'string' || url.length > MAX_FAVICON_URL_LENGTH) {
    return false;
  }
  try {
    return FAVICON_SCHEMES.includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * Whether a string is a `data:` URL holding an image we are willing to draw.
 *
 * Some pages inline their icon rather than serving one, and there is nothing
 * to fetch for those — the bytes are already in the string. It still gets
 * checked rather than passed through: the mediatype decides what the browser
 * does with it, and `data:text/html` in an `<img>` is not an image but is
 * also not nothing.
 *
 * The length bound is on the encoded string, which is the thing that actually
 * crosses, so it is compared against the same ceiling a fetched icon gets
 * after encoding.
 */
export function isDataImageUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  // Base64 is 4 characters per 3 bytes, so the encoded form of the largest
  // icon we would have fetched is the honest ceiling for one we did not.
  if (url.length > Math.ceil(MAX_FAVICON_BYTES / 3) * 4 + 64) return false;

  const match = /^data:([a-z]+\/[a-z0-9.+-]+)[;,]/i.exec(url);
  if (!match) return false;

  return FAVICON_MEDIA_TYPES.includes(match[1]!.toLowerCase());
}

/**
 * The image types a favicon may be, as mediatypes.
 *
 * SVG is on the list and is the one worth a sentence. An SVG can carry script,
 * but an SVG loaded through `<img>` cannot run it — Chromium disables
 * scripting for image-referenced documents — and SVG favicons are common
 * enough now that refusing them would mean a generic globe on a good share of
 * modern sites. It never reaches the DOM as markup, only as an `<img src>`.
 */
export const FAVICON_MEDIA_TYPES = [
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/png',
  'image/gif',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
];
