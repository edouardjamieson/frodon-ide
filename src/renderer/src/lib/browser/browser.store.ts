import { create } from 'zustand';
import { BLANK_URL } from './browser.constant';
import type { BrowserStore, BrowserTab } from './browser.def';

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
 * Nothing in here is persisted and nothing crosses IPC. A tab lives from the
 * mount of the view that holds its page to its unmount, which is the same
 * lifetime as the guest process behind it.
 */
export const useBrowserStore = create<BrowserStore>((set, get) => ({
  tabs: {},

  openTab: (id) => {
    // Idempotent: this is called from a mount effect, and React mounts twice
    // in development. Re-seeding would throw away a page that is already open.
    if (get().tabs[id]) return;

    set((state) => ({ tabs: { ...state.tabs, [id]: blankTab(id) } }));
  },

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

/** A tab that has been opened and pointed nowhere. */
function blankTab(id: string): BrowserTab {
  return {
    id,
    url: BLANK_URL,
    draft: null,
    title: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    viewport: null,
    error: null,
  };
}
