import { create } from 'zustand';
import { BLANK_URL } from './browser.constant';
import type { BrowserStore, BrowserTab, BrowserTabSeed } from './browser.def';

/**
 * Every open tab's state, keyed by tab id.
 *
 * The window store holds the tab *ids* and their order, the way it holds a
 * terminal window's session ids — and for the same reason. A window owns which
 * tabs it has; what is inside one of them belongs to whatever is mounted and
 * showing it. See `browser.def.ts` for why that is not negotiable here: a page
 * load rewrites five fields, and five rewrites of the window store is five
 * re-renders of every pane in the workbench.
 *
 * A tab lives from the mount of the view that holds its page to its unmount,
 * which is the same lifetime as the guest process behind it. `restored` is
 * the one thing here that outlives a view, and the one thing that comes from
 * disk: the page a tab opens on when a project is reopened onto the windows
 * it was left in. Everything else is still the guest's own report, and still
 * crosses nothing.
 */
export const useBrowserStore = create<BrowserStore>((set, get) => ({
  tabs: {},
  restored: {},

  openTab: (id) => {
    // Idempotent: this is called from a mount effect, and React mounts twice
    // in development. Re-seeding would throw away a page that is already open.
    if (get().tabs[id]) return;

    // A restored tab opens on the page it was left on; every other tab opens
    // on nothing, with the address bar waiting.
    const seed = get().restored[id];

    set((state) => ({ tabs: { ...state.tabs, [id]: blankTab(id, seed) } }));
  },

  restoreTabs: (seeds) => set({ restored: seeds }),

  dropTab: (id) => {
    if (!get().tabs[id]) return;

    set((state) => {
      const tabs = { ...state.tabs };
      delete tabs[id];
      return { tabs };
    });
  },

  setDraft: (id, draft) => {
    patch(set, get, id, (tab) => (tab.draft === draft ? null : { draft }));
  },

  setViewport: (id, viewport) => {
    patch(set, get, id, () => ({ viewport }));
  },

  report: (id, incoming) => {
    patch(set, get, id, (tab) => {
      // A guest is talkative: `did-stop-loading` fires with the same flags
      // already on the tab every time a sub-resource settles. Comparing before
      // storing is the renderer-side half of the rule main follows with
      // `sameTree` — a report that found nothing new must notify nobody.
      const changed = (Object.keys(incoming) as (keyof typeof incoming)[]).some(
        (key) => incoming[key] !== tab[key]
      );
      if (!changed) return null;

      // A commit is what hands the address bar back to the truth: whatever was
      // half-typed stops being what the bar shows the moment the page moves.
      const draft = incoming.url !== undefined ? null : tab.draft;
      return { ...incoming, draft };
    });
  },
}));

/**
 * Applies a change to one tab, dropping the update when the producer says
 * there is nothing to change.
 *
 * Written once because all four actions need the same two guards: a tab that
 * has already been dropped (a guest event can arrive after unmount — the
 * listener is removed, but a queued microtask is not) and a no-op write.
 */
function patch(
  set: (fn: (state: BrowserStore) => Partial<BrowserStore>) => void,
  get: () => BrowserStore,
  id: string,
  change: (tab: BrowserTab) => Partial<BrowserTab> | null
): void {
  const tab = get().tabs[id];
  if (!tab) return;

  const next = change(tab);
  if (!next) return;

  set((state) => ({ tabs: { ...state.tabs, [id]: { ...tab, ...next } } }));
}

/**
 * A tab that has been opened and pointed nowhere, or at whatever it was
 * restored onto.
 *
 * `loading` stays false even for a restored tab: the guest has not started
 * yet, and `did-start-loading` is what says it has. Guessing at it here would
 * leave a spinner on a tab whose page failed to attach.
 */
function blankTab(id: string, seed?: BrowserTabSeed): BrowserTab {
  return {
    id,
    url: seed?.url ?? BLANK_URL,
    draft: null,
    title: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    viewport: seed?.viewport ?? null,
    error: null,
    // Not seeded from a restored tab, even though the url is. An icon is a
    // fact the page reports and this one has not loaded yet; it arrives a
    // moment later on `page-favicon-updated`, and caching it in the layout
    // file would be storing a site's artwork in a window arrangement.
    favicon: null,
  };
}
