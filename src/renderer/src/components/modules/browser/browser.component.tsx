import { cn } from 'cn';
import { Globe, TriangleAlert } from 'lucide-react';
import { isBlank, useBrowserTab } from '~/lib/browser';
import { useStageFit, useWebview } from './browser.hook';
import BrowserToolbar from './browser-toolbar.component';

/**
 * One tab: an address bar, and a page under it.
 *
 * Every tab in a window is mounted at once and only the active one is
 * visible — the same arrangement the terminal module uses, and for a related
 * reason. Unmounting a `<webview>` destroys the guest process, so a tab you
 * clicked away from would come back as a reload: the form half-filled in, the
 * scroll position, the single-page app's entire state, all gone because you
 * looked at something else for a moment.
 *
 * Hidden with `visibility`, not `display`. A `<webview>` that is laid out at
 * zero size does not keep its viewport, and a page that was 1280 wide when you
 * left it would be re-laid-out at nothing and then back again — which is
 * exactly the reflow a device preview exists to avoid. `invisible` keeps the
 * box, so the guest keeps its size, and a `visibility: hidden` element is not
 * hit-testable so it cannot take a click meant for the tab on top of it.
 */
export default function Browser({
  tabId,
  active,
  onFocus,
}: {
  tabId: string;
  active: boolean;
  onFocus: () => void;
}) {
  const tab = useBrowserTab(tabId);
  const { hostRef, navigate, reload, stop, back, forward, toggleDevTools } =
    useWebview({ tabId, onFocus });
  const { stageRef, scale } = useStageFit(tab?.viewport ?? null);

  const viewport = tab?.viewport ?? null;

  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col',
        active ? '' : 'invisible pointer-events-none'
      )}
    >
      {/* Absent only for the single frame between this component mounting and
          its effect seeding the tab. */}
      {tab ? (
        <BrowserToolbar
          tab={tab}
          scale={scale}
          onNavigate={navigate}
          onBack={back}
          onForward={forward}
          onReload={reload}
          onStop={stop}
          onToggleDevTools={toggleDevTools}
        />
      ) : null}

      <div
        ref={stageRef}
        className={cn(
          'relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-browser-stage',
          viewport ? 'p-4' : ''
        )}
      >
        {/*
         * The frame the guest fills. React owns its size; the hook owns what
         * is inside it and never touches its geometry.
         *
         * A pinned viewport is laid out at its true pixel size and *drawn*
         * smaller, so the page's media queries answer for the device while the
         * eye gets the whole of it. Scaling up is not allowed — see
         * `fitScale`.
         */}
        <div
          ref={hostRef}
          style={
            viewport
              ? {
                  width: viewport.width,
                  height: viewport.height,
                  flex: 'none',
                  transform: `scale(${scale})`,
                  transformOrigin: 'center center',
                }
              : { width: '100%', height: '100%' }
          }
          className={cn('flex overflow-hidden', viewport ? 'rounded-sm' : '')}
        />

        {tab && isBlank(tab.url) && !tab.loading ? <StartPage /> : null}
        {tab?.error ? <LoadError message={tab.error} onRetry={reload} /> : null}
      </div>
    </div>
  );
}

/** What a tab shows before it has been pointed anywhere. */
function StartPage() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-browser-stage">
      <Globe className="size-6 text-fg-subtle" strokeWidth={1.5} />
      <p className="text-[12px] text-fg-subtle">
        Type an address above — or a port, like{' '}
        <span className="text-fg-muted">localhost:5173</span>.
      </p>
    </div>
  );
}

/**
 * A failed load, in our own chrome rather than Chromium's.
 *
 * The guest draws its own error page for most failures, but a connection
 * refused in a tile the size of a postcard is Chromium's full-page dinosaur,
 * which says nothing useful at that size. This says the one thing that
 * matters — what the network said — and offers the one thing worth doing
 * about it, which when you are previewing a dev server is usually "it is up
 * now, try again".
 */
function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-start gap-2 border-t border-error-border bg-overlay px-3 py-2">
      <TriangleAlert className="mt-px size-3.5 shrink-0 text-fg-danger" />
      <p className="min-w-0 flex-1 text-[11px] break-words text-fg-muted select-text">
        {message}
      </p>
      <button
        onClick={onRetry}
        className="shrink-0 cursor-pointer rounded border border-pane-border px-2 py-0.5 text-[11px] text-fg-muted transition-colors hover:border-pane-border-focused hover:text-fg"
      >
        Retry
      </button>
    </div>
  );
}
