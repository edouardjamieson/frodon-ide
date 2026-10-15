/**
 * One `<webview>`, bound to one tab.
 *
 * The shape is the terminal's — a host element, an instance created
 * imperatively on mount, and a React component that never touches the thing
 * inside. That is not consistency for its own sake. A `<webview>` reloads its
 * page when it is moved in the DOM or when some of its attributes are
 * rewritten, so letting React own it as JSX would mean a re-render of an
 * unrelated prop could throw away a page, a scroll position and a form someone
 * was halfway through filling in. Created once and mutated by hand, it cannot.
 *
 * It also sidesteps a smaller problem: `webview` is not a known element to
 * React's JSX typings, and the alternative to `document.createElement` is
 * augmenting `IntrinsicElements` to describe an element we would then still be
 * driving through refs.
 *
 * The geometry is the other way round: the *frame* the guest fills is a plain
 * div that React sizes, and the guest is pinned to 100% of it. So pinning a
 * tab to a device size is a React render, and the guest just finds itself in a
 * differently shaped box — which is exactly what a real device would be.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BROWSER_PARTITION } from '@shared/browser.def';
import {
  BLANK_URL,
  fitScale,
  normalizeUrl,
  useBrowserStore,
  type FailLoadEvent,
  type NavigateEvent,
  type TitleEvent,
  type Viewport,
  type WebviewElement,
} from '~/lib/browser';

interface UseWebviewOptions {
  /** The tab id. Changing it is a different page. */
  tabId: string;
  /**
   * Called when the guest takes keyboard focus.
   *
   * A click inside a web page does not bubble out of it — the guest is another
   * process — so the window frame's `onMouseDownCapture` never sees it, and
   * clicking into a page would otherwise leave the focus ring on whichever
   * tile had it before. The element itself does receive DOM focus, which is
   * the one signal that crosses.
   */
  onFocus: () => void;
}

export function useWebview({ tabId, onFocus }: UseWebviewOptions) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<WebviewElement | null>(null);

  const openTab = useBrowserStore((state) => state.openTab);
  const dropTab = useBrowserStore((state) => state.dropTab);
  const report = useBrowserStore((state) => state.report);

  // The callback the effect needs but must not re-run for: re-running it would
  // destroy the guest and reload the page because its parent re-rendered.
  const latest = useRef({ onFocus });
  useEffect(() => {
    latest.current = { onFocus };
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    openTab(tabId);

    // Where this guest starts. `openTab` has just put the tab in the store,
    // with whatever page a restored layout said it opens on — see `restored`
    // in `browser.store.ts` — so the answer is read back from there rather
    // than subscribed to: this effect must not re-run when a page navigates,
    // and the url is about to stop being the one in hand anyway.
    //
    // As the attribute rather than a `loadURL` after attach, because a
    // restored tab should not show a blank page on its way to the right one,
    // and because an extra navigation is an extra entry in a back stack that
    // ought to start empty.
    const start = useBrowserStore.getState().tabs[tabId]?.url ?? BLANK_URL;

    const view = document.createElement('webview') as WebviewElement;
    // Attributes rather than properties, and all of them set before the
    // element is in the document: a `<webview>` reads its configuration once,
    // when it attaches, and a partition assigned afterwards is ignored.
    //
    // Main overwrites all of this in `will-attach-webview` — see
    // `main/browser/`. It is written here anyway because the element is also
    // the documentation of what the guest is supposed to be, and because a
    // defence that exists in one place is a defence that moves when that place
    // is refactored. `src` is the one that is not merely restated: main vets
    // it against the scheme list and cancels the attach if it does not pass,
    // which is what makes a hand-edited layouts file safe to read.
    view.setAttribute('src', start);
    view.setAttribute('partition', BROWSER_PARTITION);
    // `allowpopups` is deliberately *absent* rather than set to 'false'. It is
    // an HTML boolean attribute, so presence is what counts and
    // `allowpopups="false"` grants exactly what it looks like it refuses —
    // Electron's own security warning is what pointed this out.
    view.setAttribute(
      'webpreferences',
      'contextIsolation=yes,sandbox=yes,nodeIntegration=no,javascript=yes'
    );
    view.style.width = '100%';
    view.style.height = '100%';
    // A `<webview>` is `display: flex` by default and collapses to nothing
    // inside a flex parent without this.
    view.style.flex = '1 1 auto';

    host.appendChild(view);
    viewRef.current = view;

    /** Whatever the guest can be asked about its own history, in one go. */
    const navState = () => ({
      url: view.getURL(),
      canGoBack: view.canGoBack(),
      canGoForward: view.canGoForward(),
    });

    const onStart = () => report(tabId, { loading: true, error: null });
    const onStop = () =>
      report(tabId, {
        loading: false,
        title: view.getTitle(),
        ...navState(),
      });
    const onNavigate = (event: Event) => {
      const { url } = event as NavigateEvent;
      report(tabId, {
        url,
        canGoBack: view.canGoBack(),
        canGoForward: view.canGoForward(),
        error: null,
      });
    };
    const onTitle = (event: Event) =>
      report(tabId, { title: (event as TitleEvent).title });
    const onFail = (event: Event) => {
      const fail = event as FailLoadEvent;
      // Sub-frames fail constantly on a normal page — a blocked tracker is a
      // failed load — and -3 is ERR_ABORTED, which is what a navigation that
      // was superseded by the next one reports. Neither is a broken page.
      if (!fail.isMainFrame || fail.errorCode === -3) return;
      report(tabId, {
        loading: false,
        error: `${fail.errorDescription || 'Load failed'} — ${fail.validatedURL}`,
      });
    };
    const onGone = () =>
      report(tabId, { loading: false, error: 'The page stopped responding.' });
    const onGuestFocus = () => latest.current.onFocus();

    view.addEventListener('did-start-loading', onStart);
    view.addEventListener('did-stop-loading', onStop);
    view.addEventListener('did-navigate', onNavigate);
    view.addEventListener('did-navigate-in-page', onNavigate);
    view.addEventListener('page-title-updated', onTitle);
    view.addEventListener('did-fail-load', onFail);
    view.addEventListener('render-process-gone', onGone);
    view.addEventListener('focus', onGuestFocus);

    return () => {
      view.removeEventListener('did-start-loading', onStart);
      view.removeEventListener('did-stop-loading', onStop);
      view.removeEventListener('did-navigate', onNavigate);
      view.removeEventListener('did-navigate-in-page', onNavigate);
      view.removeEventListener('page-title-updated', onTitle);
      view.removeEventListener('did-fail-load', onFail);
      view.removeEventListener('render-process-gone', onGone);
      view.removeEventListener('focus', onGuestFocus);

      view.remove();
      viewRef.current = null;
      // Removing the element is what kills the guest process. The tab's state
      // goes with it: nothing in this module outlives its view, which is the
      // difference between a browser tab and a shell.
      dropTab(tabId);
    };
  }, [tabId, openTab, dropTab, report]);

  /**
   * Loads whatever was typed, once it has been decided what that means — see
   * `normalizeUrl`. An empty line navigates nowhere.
   */
  const navigate = useCallback(
    (input: string) => {
      const view = viewRef.current;
      const url = normalizeUrl(input);
      if (!view || !url) return;

      report(tabId, { error: null });
      // `loadURL` rejects when a navigation is superseded or refused, which
      // `did-fail-load` has already reported properly. Swallowing it here is
      // what keeps an unhandled rejection out of the console on every
      // redirect.
      void view.loadURL(url).catch(() => undefined);
    },
    [report, tabId]
  );

  const reload = useCallback(() => viewRef.current?.reload(), []);
  const stop = useCallback(() => viewRef.current?.stop(), []);
  const back = useCallback(() => viewRef.current?.goBack(), []);
  const forward = useCallback(() => viewRef.current?.goForward(), []);

  /** The guest's own DevTools — the reason to preview in here at all. */
  const toggleDevTools = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.isDevToolsOpened()) view.closeDevTools();
    else view.openDevTools();
  }, []);

  return { hostRef, navigate, reload, stop, back, forward, toggleDevTools };
}

/**
 * How much of a pinned viewport fits, measured rather than assumed.
 *
 * A `ResizeObserver` and not a window resize listener: a tile changes size
 * when a splitter is dragged, when a window is split, and when the sidebar
 * opens — none of which resize the OS window, and all of which change how much
 * of a 1440-wide page we can show.
 */
export function useStageFit(viewport: Viewport | null) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      // `contentRect` rather than `getBoundingClientRect`, so the stage's own
      // padding is not counted as room the page could use.
      const { width, height } = entry.contentRect;
      setAvailable((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height }
      );
    });

    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  return { stageRef, scale: fitScale(viewport, available) };
}
