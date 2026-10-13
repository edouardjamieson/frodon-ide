/**
 * The browser module: what a tab is, and what a `<webview>` looks like from
 * here.
 *
 * Two things are worth reading before the types.
 *
 * **Why the state is a store and not component state.** A tab's facts — its
 * title, whether it is loading — are drawn in the window's header, and the
 * page itself is drawn in the window's body. Those are two components with a
 * window frame between them, so the facts have to live somewhere both can
 * reach. Keeping them on the window (the way an editor's `files` live there)
 * was the other option and is the wrong one: a page load rewrites the title,
 * the url and three flags, and doing that on the window store would hand a new
 * `windows` array to `useWindowRows` — re-rendering every pane in the
 * workbench because one page finished loading.
 *
 * **Why the element is typed here rather than imported.** The renderer has no
 * Electron typings and is not getting any: `tsconfig.web.json` lists
 * `vite/client` and nothing else, and an `import type { WebviewTag } from
 * 'electron'` in a renderer file is a line away from an import that isn't a
 * type. So the slice of the tag this module actually touches is written out
 * below. It is a shorter list than it looks like it should be, which is the
 * point — anything not on it is a capability the browser module does not have.
 */

/**
 * A fixed size to render a page at, in CSS pixels.
 *
 * `null` anywhere a `Viewport` is optional means "fill the tile", which is the
 * normal case and the one a tab starts in. A fixed viewport is the device
 * preview: the page is laid out at exactly this width, so its media queries
 * see the device it is pretending to be and not the pane it is sitting in.
 */
export interface Viewport {
  width: number;
  height: number;
}

/** A named size in the picker. The sizes are CSS pixels, not device pixels. */
export interface ViewportPreset extends Viewport {
  id: string;
  label: string;
}

/**
 * One tab's state.
 *
 * Split in two halves by who writes it. `draft` and `viewport` are the
 * person's: they come from the address bar and the size picker. Everything
 * else is the guest's, reported by the page as it loads and navigates — the
 * renderer never guesses at them, because a page can redirect, and an address
 * bar that shows where you *asked* to go rather than where you *are* is how a
 * phishing page gets to keep a bank's URL on screen.
 */
export interface BrowserTab {
  id: string;
  /** Where the guest actually is. `about:blank` until something is loaded. */
  url: string;
  /**
   * What the address bar is showing while it is being typed in, or null when
   * it should just show `url`. Cleared when a navigation commits, so the bar
   * snaps back to the truth the moment the page moves.
   */
  draft: string | null;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** null fills the tile; a size pins the page to a device. */
  viewport: Viewport | null;
  /** The last load failure, as the guest described it. Cleared on success. */
  error: string | null;
}

/** The fields the guest reports. Everything a page is allowed to tell us. */
export type BrowserReport = Partial<
  Pick<
    BrowserTab,
    'url' | 'title' | 'loading' | 'canGoBack' | 'canGoForward' | 'error'
  >
>;

export interface BrowserStore {
  /** Keyed by tab id. A tab exists here from mount to unmount, and no longer. */
  tabs: Record<string, BrowserTab>;

  /**
   * Seeds a tab. Idempotent, because it is called from the view's mount
   * effect and React may mount twice in development.
   */
  openTab: (id: string) => void;
  /** Forgets a tab. Called when the view holding its page unmounts. */
  dropTab: (id: string) => void;

  /** The address bar, mid-edit. Null hands the bar back to `url`. */
  setDraft: (id: string, draft: string | null) => void;
  /** Pins a tab to a device size, or hands it back to the tile with null. */
  setViewport: (id: string, viewport: Viewport | null) => void;

  /**
   * Guest facts, in one write.
   *
   * One action rather than a setter per field: a single `did-navigate` moves
   * the url, the title, both history flags and the error at once, and five
   * `set` calls would be five renders of the same tab.
   */
  report: (id: string, patch: BrowserReport) => void;
}

/**
 * The part of Electron's `<webview>` this module uses.
 *
 * Structural, so the element can be created with `document.createElement` and
 * cast once, at the one place it is made — see `browser.hook.ts`.
 */
export interface WebviewElement extends HTMLElement {
  src: string;
  partition: string;
  allowpopups: boolean;
  webpreferences: string;

  loadURL(url: string): Promise<void>;
  getURL(): string;
  getTitle(): string;
  reload(): void;
  stop(): void;
  goBack(): void;
  goForward(): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  openDevTools(): void;
  closeDevTools(): void;
  isDevToolsOpened(): boolean;
}

/** `page-title-updated`. */
export interface TitleEvent extends Event {
  title: string;
}

/** `did-navigate` and `did-navigate-in-page`. */
export interface NavigateEvent extends Event {
  url: string;
  isMainFrame?: boolean;
}

/**
 * `did-fail-load`. Sub-frames fail constantly on a normal page — a blocked
 * tracker is a failed load — so `isMainFrame` is what separates a broken page
 * from a page that is fine.
 */
export interface FailLoadEvent extends Event {
  errorCode: number;
  errorDescription: string;
  validatedURL: string;
  isMainFrame: boolean;
}
