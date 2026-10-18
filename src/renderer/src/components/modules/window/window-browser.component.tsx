import { useCallback, useState } from 'react';
import { cn } from 'cn';
import { Globe, LoaderCircle, Plus, X } from 'lucide-react';
import { hostOf, isBlank, useBrowserTabLabel } from '~/lib/browser';
import {
  useBrowserWindow,
  useWindowStore,
  type BrowserWindow,
} from '~/lib/window';
import Browser from '~/components/modules/browser';

/**
 * The browser module: a tab per page in the window's header, and every one of
 * those pages mounted in its body at once.
 *
 * The same arrangement as the terminal, for a different reason: a shell stays
 * mounted because unmounting kills the process, a page stays mounted because
 * unmounting throws away everything the page had got to. See `browser.
 * component.tsx` for why they are hidden rather than unmounted.
 */
export function BrowserWindowHeader({
  window: win,
}: {
  window: BrowserWindow;
}) {
  const { tabs, activeTab, activate, close, open } = useBrowserWindow(win);

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto px-1.5 [scrollbar-width:none]">
      {tabs.map((tabId, index) => (
        <BrowserTab
          key={tabId}
          tabId={tabId}
          index={index}
          active={tabId === activeTab}
          onActivate={() => activate(tabId)}
          onClose={() => close(tabId)}
        />
      ))}

      <button
        aria-label="New tab"
        onClick={open}
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-project/20 hover:text-fg"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * One tab chip.
 *
 * Its own component so that it subscribes to its own tab and nothing else: a
 * page loading in tab three must not re-render tabs one and two, and a title
 * arriving must not re-render the window.
 */
function BrowserTab({
  tabId,
  index,
  active,
  onActivate,
  onClose,
}: {
  tabId: string;
  index: number;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const { title, url, loading, favicon } = useBrowserTabLabel(tabId);

  // The title if the page has one, the host if it has not got that far, and a
  // number if it has not been pointed anywhere — numbered by position so
  // closing the first of three does not leave "2" and "3" behind.
  const label = title || (isBlank(url) ? `New tab ${index + 1}` : hostOf(url));

  return (
    <div
      onMouseDown={onActivate}
      title={isBlank(url) ? undefined : url}
      className={cn(
        'group/tab flex h-7 max-w-[180px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md pr-1 pl-2 text-[12px] transition-colors',
        active ? 'bg-tab-active text-fg' : 'text-fg-muted hover:bg-tab-inactive'
      )}
    >
      {/* Keyed by the icon, so a tab that navigates to a site with a good
          icon is not stuck on the globe because the previous site's icon
          would not decode — see `broken` in `TabIcon`. */}
      <TabIcon key={favicon ?? 'none'} loading={loading} favicon={favicon} />
      <span className="truncate">{label}</span>

      <button
        aria-label={`Close ${label}`}
        onMouseDown={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className={cn(
          'flex size-4 shrink-0 cursor-pointer items-center justify-center rounded transition-opacity hover:bg-project/25',
          active ? 'opacity-60' : 'opacity-0 group-hover/tab:opacity-60'
        )}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

/**
 * The 14px square at the head of a tab chip.
 *
 * Three states in priority order, and the order is the whole of it: a
 * spinner while the page is loading, the site's own icon once it has
 * reported one, and the globe otherwise. Loading wins over the favicon
 * deliberately — the icon of the page you are leaving is the most confusing
 * thing to show while the next one is on its way.
 *
 * `src` is always a `data:` URL. The renderer cannot load a remote one and
 * is not going to start: main fetches the icon on the guest's session and
 * hands over the bytes, so nothing here touches the network. See
 * `main/browser/favicon.service.ts`.
 */
function TabIcon({
  loading,
  favicon,
}: {
  loading: boolean;
  favicon: string | null;
}) {
  // Reset by remounting rather than by an effect: the caller keys this on
  // the icon, so a new icon is a new component and starts untried.
  const [broken, setBroken] = useState(false);

  if (loading) {
    return <LoaderCircle className="size-3.5 shrink-0 animate-spin" />;
  }

  if (favicon && !broken) {
    return (
      <img
        src={favicon}
        alt=""
        // Decorative: the tab is already labelled by its title beside this,
        // so a screen reader reading the icon as well would say the site
        // twice.
        aria-hidden
        // Main sniffed the bytes before sending them, so this is an image.
        // It can still fail to *decode* — a truncated PNG, an ICO in a
        // variant Chromium will not read — and an `<img>` that cannot decode
        // draws a broken-image glyph, which looks worse than the globe it
        // replaced. One strike and the fallback comes back.
        onError={() => setBroken(true)}
        className="size-3.5 shrink-0 rounded-[2px] object-contain"
      />
    );
  }

  return <Globe className="size-3.5 shrink-0" />;
}

export function BrowserWindowBody({ window: win }: { window: BrowserWindow }) {
  const { tabs, activeTab, open } = useBrowserWindow(win);
  const focusWindow = useWindowStore((state) => state.focus);

  // A click inside a page is the one pointer event the window frame cannot
  // see — the guest is another process and nothing bubbles out of it. The
  // element's own focus is what crosses, and this is where it lands.
  const focus = useCallback(() => focusWindow(win.id), [focusWindow, win.id]);

  if (tabs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-[12px] text-fg-subtle">No page open here.</p>
        <button
          onClick={open}
          className="cursor-pointer rounded-lg border border-pane-border bg-button px-3 py-1.5 text-[12px] text-button-fg transition-colors hover:border-pane-border-focused hover:bg-button-hover"
        >
          New tab
        </button>
      </div>
    );
  }

  return (
    // `relative`, so each tab can be absolutely positioned over the pane: that
    // is how the hidden ones stay mounted without taking part in layout, and
    // how the visible one gets the full height to lay a page out against.
    <div className="relative h-full w-full">
      {tabs.map((tabId) => (
        <Browser
          key={tabId}
          tabId={tabId}
          active={tabId === activeTab}
          onFocus={focus}
        />
      ))}
    </div>
  );
}
