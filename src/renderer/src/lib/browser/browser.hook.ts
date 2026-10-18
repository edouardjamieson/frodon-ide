/**
 * The renderer's view of a tab.
 *
 * Narrow selectors, like every other store in the app: a tab chip in a window
 * header subscribes to its own tab and nothing else, so a page loading in one
 * tile does not re-render the tab strip of another.
 */
import { useBrowserStore } from './browser.store';
import type { BrowserTab } from './browser.def';

/**
 * One tab's state, or undefined in the frame before its view has mounted and
 * seeded it. The header renders a chip for a tab the window knows about; the
 * body is what creates it.
 */
export const useBrowserTab = (id: string): BrowserTab | undefined =>
  useBrowserStore((state) => state.tabs[id]);

/** What a tab chip shows: enough to label it, and no more. */
export const useBrowserTabLabel = (
  id: string
): {
  title: string;
  url: string;
  loading: boolean;
  favicon: string | null;
} => {
  const title = useBrowserStore((state) => state.tabs[id]?.title ?? '');
  const url = useBrowserStore((state) => state.tabs[id]?.url ?? '');
  const loading = useBrowserStore((state) => state.tabs[id]?.loading ?? false);
  const favicon = useBrowserStore((state) => state.tabs[id]?.favicon ?? null);

  return { title, url, loading, favicon };
};

/** The address bar, mid-edit. */
export const useSetDraft = () => useBrowserStore((state) => state.setDraft);

/** The size picker. */
export const useSetViewport = () =>
  useBrowserStore((state) => state.setViewport);
