/**
 * Making windows, and the few questions about them that are not about the
 * tree — that arithmetic is `window-tree.service.ts`.
 *
 * Everything here is pure, so the store can call it from outside React.
 */
import { WINDOW_BREAKPOINTS } from './window.constant';
import type {
  Direction,
  TileRect,
  WindowBreakpoint,
  WindowState,
  WindowType,
} from './window.def';

/**
 * Ids are a counter, not a UUID.
 *
 * They never leave the renderer, never reach disk, and never cross IPC — they
 * only have to be unique within this page's lifetime. `crypto.randomUUID()`
 * would work too, but `w3` is a great deal easier to read in a React DevTools
 * tree than a 36-character hex string.
 */
let lastId = 0;
export function nextWindowId(): string {
  lastId += 1;
  return `w${lastId}`;
}

/**
 * Session ids, on the same terms — except that these *do* leave the renderer:
 * main keys its PTY registry by them. They still only have to be unique
 * within this page, because a session belongs to the window that made it.
 */
let lastSessionId = 0;
export function nextSessionId(): string {
  lastSessionId += 1;
  return `s${lastSessionId}`;
}

/**
 * Browser tab ids, on the same terms as session ids — except that these never
 * leave the renderer at all. A `<webview>` is a DOM element, so there is no
 * registry in main to key by them; they only have to tell one tab from
 * another inside this page.
 */
let lastTabId = 0;
export function nextTabId(): string {
  lastTabId += 1;
  return `b${lastTabId}`;
}

/**
 * Conversation ids, on the same terms as session ids: they leave the
 * renderer, because main keys its agent registry by them, and only have to be
 * unique within this page, because a conversation belongs to the window that
 * started it.
 */
let lastConversationId = 0;
export function nextConversationId(): string {
  lastConversationId += 1;
  return `c${lastConversationId}`;
}

/**
 * A window of the requested kind. Where it sits is the tree's business, so
 * the caller puts it there.
 */
export function createWindow(type: WindowType | null = null): WindowState {
  const base = { id: nextWindowId() };

  switch (type) {
    case 'editor':
      return { ...base, type, files: [], activeFile: null };
    case 'terminal': {
      // A terminal window with no shell in it would be an empty box with a
      // button, so it arrives with its first session already named.
      const session = nextSessionId();
      return { ...base, type, sessions: [session], activeSession: session };
    }
    // The history is what you want to see first after clicking "source
    // control": the branch you are on and how far it has come.
    case 'git':
      return { ...base, type, tab: 'history' };
    case 'browser': {
      // Like a terminal, and unlike a board: a browser window with no tab in
      // it would be a box with a button, and where the first tab *goes* is a
      // question its own address bar asks.
      const tab = nextTabId();
      return { ...base, type, tabs: [tab], activeTab: tab };
    }
    // Like a terminal: an agent window with nothing to talk to would be a
    // box with a button, so it arrives with its first conversation named.
    case 'agent': {
      const conversation = nextConversationId();
      return {
        ...base,
        type,
        conversations: [conversation],
        activeConversation: conversation,
      };
    }
    default:
      return { ...base, type: null };
  }
}

/**
 * The window next to this one in a direction, for moving by keyboard, or
 * null at the edge of the workbench.
 *
 * Asked of the tiles' boxes rather than of the tree, because "the window
 * above" is a question about the screen: in a tree, the window above the
 * right half of a full-width row is reached by climbing out of one split and
 * down another, and which child to descend into is a geometric question
 * anyway. So: the windows lying wholly that way and overlapping this one
 * across it, nearest first, and the one sharing the longest edge among
 * equally near ones.
 */
export function windowBeside(
  rects: ReadonlyMap<string, TileRect>,
  id: string,
  direction: Direction
): string | null {
  const from = rects.get(id);
  if (!from) return null;

  let best: { id: string; gap: number; overlap: number } | null = null;

  for (const [other, rect] of rects) {
    if (other === id) continue;

    const horizontal = direction === 'left' || direction === 'right';
    const gap = Math.round(
      direction === 'left'
        ? from.left - (rect.left + rect.width)
        : direction === 'right'
          ? rect.left - (from.left + from.width)
          : direction === 'up'
            ? from.top - (rect.top + rect.height)
            : rect.top - (from.top + from.height)
    );
    const overlap = horizontal
      ? Math.min(from.top + from.height, rect.top + rect.height) -
        Math.max(from.top, rect.top)
      : Math.min(from.left + from.width, rect.left + rect.width) -
        Math.max(from.left, rect.left);

    // Behind, or beside without sharing any edge: not that way.
    if (gap < 0 || overlap <= 0) continue;

    if (
      !best ||
      gap < best.gap ||
      (gap === best.gap && overlap > best.overlap)
    ) {
      best = { id: other, gap, overlap };
    }
  }

  return best?.id ?? null;
}

/** `/Users/eddy/dev/frodon/src/main.ts` -> `main.ts`. */
export function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

const BREAKPOINT_ORDER = Object.keys(WINDOW_BREAKPOINTS) as WindowBreakpoint[];

/** The largest breakpoint a length in pixels reaches. */
export function breakpointOf(pixels: number): WindowBreakpoint {
  let found: WindowBreakpoint = 'xs';
  for (const name of BREAKPOINT_ORDER) {
    if (pixels >= WINDOW_BREAKPOINTS[name]) found = name;
  }
  return found;
}

/** Whether `size` is `min` or bigger — the `min-width` of a media query. */
export function atLeast(
  size: WindowBreakpoint,
  min: WindowBreakpoint
): boolean {
  return BREAKPOINT_ORDER.indexOf(size) >= BREAKPOINT_ORDER.indexOf(min);
}
