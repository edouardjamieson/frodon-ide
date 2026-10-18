/**
 * A page's own icon, fetched on the guest's session and handed over as a
 * `data:` URL.
 *
 * This is the one thing in `main/browser/` that is not refusal, and it only
 * exists because of the CSP. The IDE's renderer is `img-src 'self' data:` —
 * it loads nothing from the network so that a hostile string reaching the DOM
 * has nowhere to send anything, and a favicon URL is a hostile string by
 * definition: the page picked it. Relaxing the CSP would be one line and
 * would give away the thing the header is for.
 *
 * So the request happens here, and three properties fall out of that:
 *
 * **It goes out on the guest's session,** not the IDE's. The icon for an
 * intranet page behind a login is fetched with that login's cookies, and the
 * privileged renderer never touches the network. `persist:frodon-browser` is
 * the session the page itself is already on.
 *
 * **The server's content type is ignored.** It is sniffed from the bytes
 * instead — see `sniffImageType`. That is not paranoia for its own sake: a
 * great many servers send `favicon.ico` as `application/octet-stream` or
 * `text/plain`, so trusting the header means refusing icons that are fine,
 * while a server that lies in the other direction could otherwise get
 * something that is not an image labelled as one. Sniffing is both more
 * permissive and stricter, which is rare enough to be worth the code.
 *
 * **Nothing is fetched twice.** A tab strip with four tabs on one site asks
 * four times within a second of each other, and a reload asks again.
 */
import { session } from 'electron';
import { createLogger } from '@main/logger';
import {
  BROWSER_PARTITION,
  isAllowedFaviconUrl,
  isDataImageUrl,
  MAX_FAVICON_BYTES,
} from '@shared/browser.def';

const log = createLogger('favicon');

/** A favicon that has not arrived in this long is not worth a tab icon. */
const FETCH_TIMEOUT_MS = 5_000;

/**
 * How many answers to remember.
 *
 * Answers, not icons — a `null` is cached as hard as a hit, because the
 * common failure is a site with no favicon at all and re-asking that site on
 * every navigation is the thing this is here to stop.
 *
 * 256 at the 256KB ceiling is a 64MB worst case that no real browsing
 * reaches; a realistic cache of a few hundred icons is a couple of megabytes.
 */
const CACHE_LIMIT = 256;

/**
 * Resolved icons by their source URL.
 *
 * A plain `Map` used as an LRU: `Map` iterates in insertion order, so the
 * oldest key is the first one, and a hit is re-inserted to move it to the
 * end. That is the whole eviction policy and it needs no second structure.
 */
const cache = new Map<string, string | null>();

/**
 * Fetches in flight, so four tabs on one site make one request.
 *
 * Separate from `cache` on purpose: a key being here means "the answer is
 * coming", which is a different state from "the answer is null".
 */
const inFlight = new Map<string, Promise<string | null>>();

/**
 * One page icon as a `data:` URL, or null when there isn't a usable one.
 *
 * Null is every way this can fail to produce an icon — not an image, too big,
 * refused scheme, server down, timed out — because they all mean the same
 * thing on screen: the tab keeps the generic globe. A renderer that told them
 * apart would do nothing different.
 */
export async function readFavicon(url: string): Promise<string | null> {
  // A page that inlines its icon has already handed over the bytes. Nothing
  // to fetch, and nothing to cache either — the string *is* the icon, and
  // caching a key that is as large as its value is a map that stores itself.
  if (isDataImageUrl(url)) return url;

  if (!isAllowedFaviconUrl(url)) return null;

  const hit = cache.get(url);
  if (hit !== undefined) {
    // Re-inserted to the end, which is what makes the Map an LRU rather than
    // a queue — a site you keep visiting should not age out behind one you
    // visited once.
    cache.delete(url);
    cache.set(url, hit);
    return hit;
  }

  const pending = inFlight.get(url);
  if (pending) return pending;

  const request = fetchFavicon(url)
    .catch((error: unknown) => {
      // A favicon is a decoration. A site that is down, a DNS failure, a
      // certificate nobody renewed — none of them is worth more than a debug
      // line, and all of them are normal while browsing.
      log.debug(`no icon for ${url}: ${String(error)}`);
      return null;
    })
    .then((icon) => {
      remember(url, icon);
      inFlight.delete(url);
      return icon;
    });

  inFlight.set(url, request);
  return request;
}

function remember(url: string, icon: string | null): void {
  cache.set(url, icon);
  if (cache.size <= CACHE_LIMIT) return;

  // The first key is the least recently used, because every hit re-inserts.
  const oldest = cache.keys().next();
  if (!oldest.done) cache.delete(oldest.value);
}

async function fetchFavicon(url: string): Promise<string | null> {
  // `guest.fetch`, not `net.fetch`. They have the same signature and read the
  // same, and the difference is the entire point of doing this in main:
  // `net.fetch` always issues from the **default** session, and a request
  // from a session is only available as a method on that session. Getting
  // this wrong fetches the icon with the IDE's own cookies instead of the
  // page's — which quietly fails for anything behind a login, and quietly
  // puts the privileged session on the wire for everything else.
  const guest = session.fromPartition(BROWSER_PARTITION);

  const response = await guest.fetch(url, {
    // One hop to a CDN is completely normal for an icon. Chromium caps the
    // chain itself, so this only says not to treat a 302 as a failure.
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) return null;

  // Checked before reading the body as well as after. `content-length` is a
  // claim rather than a fact, so it is worth nothing on its own — but when it
  // is present and absurd it saves downloading the absurdity.
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_FAVICON_BYTES) return null;

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_FAVICON_BYTES) return null;

  const type = sniffImageType(bytes);
  if (!type) return null;

  return `data:${type};base64,${bytes.toString('base64')}`;
}

/**
 * What an image actually is, from its first bytes.
 *
 * Every format here is identified by a fixed signature except SVG, which is
 * text and has no magic number — so it is matched on the only thing an SVG
 * document reliably starts with once whitespace and a BOM are out of the way.
 * Anything unrecognised is refused rather than guessed at: an unknown byte
 * string is not an image, whatever the server called it.
 */
function sniffImageType(bytes: Buffer): string | null {
  // ICO and CUR share a header; the third byte is the one that differs, and
  // 1 is an icon. This is the format most of the web still serves.
  if (bytes.length >= 4 && bytes.readUInt32LE(0) === 0x00010000) {
    return 'image/x-icon';
  }
  if (bytes.subarray(0, 8).equals(PNG_MAGIC)) return 'image/png';
  if (bytes.subarray(0, 3).toString('latin1') === 'GIF') return 'image/gif';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }

  // SVG. Only the head is decoded — a megabyte of markup does not need to
  // become a megabyte of string to answer a question about its first tag.
  const head = bytes
    .subarray(0, 256)
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart();
  if (head.startsWith('<svg') || head.startsWith('<?xml')) {
    // An `<?xml` prologue could introduce any XML at all, so the tag has to
    // actually be there. `image/svg+xml` in an `<img>` cannot run script —
    // Chromium disables scripting for image-referenced documents — which is
    // what makes this safe to hand to the privileged renderer.
    if (head.includes('<svg')) return 'image/svg+xml';
  }

  return null;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
