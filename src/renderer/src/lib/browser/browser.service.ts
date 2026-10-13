/**
 * The browser's pure parts: turning what someone typed into a URL, and
 * working out how much of a device fits in a tile.
 *
 * Kept out of both the store and the view for the usual reason — this is the
 * fiddly half, and it is the half worth being able to reason about without a
 * React tree or a guest process in the picture.
 */
import { isAllowedBrowserUrl } from '@shared/browser.def';
import {
  BLANK_URL,
  MAX_VIEWPORT,
  MIN_VIEWPORT,
  SEARCH_URL,
} from './browser.constant';
import type { Viewport } from './browser.def';

/**
 * What the address bar should load for a given line of typing.
 *
 * Three outcomes: a URL as given, a URL with a scheme put on the front, or a
 * search. The rules below are the ones every browser converged on, and the
 * order they are applied in is the whole trick.
 *
 * `javascript:` is the case the allow-list exists for. Typed — or, far more
 * likely, pasted from a forum post promising to fix a stuck page — it runs in
 * whatever is already loaded, with that site's cookies. Here it fails the
 * scheme check and is searched for instead, which is both safe and roughly
 * what the person deserves to find out.
 *
 * Returns null for an empty line, so the caller can tell "navigate nowhere"
 * from "navigate to something".
 */
export function normalizeUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;

  // `localhost:3000` is indistinguishable from a scheme by shape alone, and
  // it is the single most typed string in this entire module, so the port
  // case is settled before the scheme list is ever consulted.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text);
  const hasPort = /^[a-z0-9.-]+:\d+([/?#]|$)/i.test(text);

  if (hasScheme && !hasPort) {
    return isAllowedBrowserUrl(text) ? text : searchFor(text);
  }

  const host = text.split(/[/?#]/)[0] ?? '';
  if (!isHostLike(host)) return searchFor(text);

  // Loopback and bare IPs are a dev server nine times in ten, and a dev server
  // speaking https nine times in ten is a connection refused. Named hosts get
  // https, which is what the web is.
  return `${isLocal(host) ? 'http' : 'https'}://${text}`;
}

/** Whether the first segment of a typed line could be a host at all. */
function isHostLike(host: string): boolean {
  if (!host || /[\s@]/.test(host)) return false;

  const bare = host.replace(/:\d+$/, '');
  const ported = bare !== host;

  if (isLocal(bare)) return true;
  // A dotted name — `example.com`, `staging.app.dev`. A trailing all-numeric
  // label would be an IPv4 address, which `isLocal` has already taken.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(bare)) return true;
  // A single label is only a host if it was given a port: `router:8080` is a
  // host, `router` is a search.
  return ported && /^[a-z0-9-]+$/i.test(bare);
}

function isLocal(host: string): boolean {
  const bare = host.replace(/:\d+$/, '');
  return (
    bare === 'localhost' ||
    bare.endsWith('.localhost') ||
    bare === '[::1]' ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(bare)
  );
}

function searchFor(text: string): string {
  return SEARCH_URL + encodeURIComponent(text);
}

/**
 * How much of a pinned viewport fits in the space available.
 *
 * Never above 1: a 375-wide phone blown up to fill a 1200-wide pane would be a
 * lie about what the layout does, and the whole reason to pin a size is to see
 * the truth about it. Below 1 the page is still *laid out* at its full size
 * and only drawn smaller — the media queries see the device, the eye sees the
 * whole of it.
 */
export function fitScale(
  viewport: Viewport | null,
  available: { width: number; height: number }
): number {
  if (!viewport) return 1;
  if (available.width <= 0 || available.height <= 0) return 1;

  return Math.min(
    1,
    available.width / viewport.width,
    available.height / viewport.height
  );
}

/** A width or height from a text field, clamped into the allowed range. */
export function clampViewport(value: number): number {
  if (!Number.isFinite(value)) return MIN_VIEWPORT;
  return Math.min(MAX_VIEWPORT, Math.max(MIN_VIEWPORT, Math.round(value)));
}

/**
 * What a tab is called when it has no title yet: the host, else nothing.
 *
 * The host rather than the whole URL, because a tab is 180 pixels wide and
 * `github.com` identifies a tab where `https://github.com/...` identifies a
 * truncation.
 */
export function hostOf(url: string): string {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol === 'file:') return 'Local file';
    return hostname;
  } catch {
    return '';
  }
}

/**
 * Whether a tab is still showing nothing.
 *
 * A guest that has not been pointed anywhere sits on `about:blank`, which is a
 * real URL and reports itself as one — so "empty" is a question about the url,
 * not about whether one exists. This is what puts the start page on screen.
 */
export function isBlank(url: string): boolean {
  return url === '' || url === BLANK_URL;
}
