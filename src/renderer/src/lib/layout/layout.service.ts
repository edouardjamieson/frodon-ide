/**
 * Turning the workbench into something a file can hold, and back.
 *
 * The two conversions are the whole of this module's thinking, and they are
 * not mirror images of each other — which is the part worth reading before
 * changing anything.
 *
 * **Out** (`snapshotOf`) is lossy on purpose. A window's id is a counter that
 * means nothing in the next run; a terminal's session id names a process that
 * will be gone; a browser tab's id names a DOM element. Those are dropped
 * rather than written, so the file never promises something the restore
 * cannot keep.
 *
 * **In** (`windowsFrom`) is therefore generative. A saved terminal comes back
 * as a terminal with one *new* shell, because the old one was a process and
 * is gone. A saved browser is the case that goes the other way: a page is a
 * url, so its tabs come back pointed where they were — with new ids, and with
 * the pages handed to `lib/browser/` as seeds, because that store is what
 * owns them and the window only ever held the ids.
 *
 * `snapshotOf` switches exhaustively over the window type with no default,
 * which is deliberate and is what keeps `shared/layout.def.ts` from drifting
 * away from the live model: a new `WindowType` fails to compile here until
 * someone has decided what, if anything, is worth remembering about it.
 */
import {
  nextConversationId,
  nextSessionId,
  nextTabId,
  nextWindowId,
  type WindowState,
} from '~/lib/window';
import { BLANK_URL, type BrowserTab, type BrowserTabSeed } from '~/lib/browser';
import type { AgentKind } from '@shared/agent.def';
import type {
  AgentTabLayout,
  LayoutSnapshot,
  LayoutWindow,
} from '@shared/layout.def';

/**
 * One window, reduced to what survives a quit.
 *
 * `tabs` is the browser store's, passed in rather than read: this stays a
 * pure function of its arguments, and the one caller that has a window store
 * in hand has the other one too.
 */
function windowSnapshot(
  window: WindowState,
  tabs: Record<string, BrowserTab>,
  kept: Record<string, AgentTabLayout>
): LayoutWindow {
  const { row, col } = window;

  switch (window.type) {
    case 'editor':
      return {
        type: 'editor',
        row,
        col,
        files: window.files,
        activeFile: window.activeFile,
      };
    case 'board':
      return {
        type: 'board',
        row,
        col,
        boards: window.boards,
        activeBoard: window.activeBoard,
      };
    case 'git':
      return { type: 'git', row, col, tab: window.tab };
    // A shell is a process and nothing else; there is nothing about one to
    // write down. See `TerminalLayout` for the argument.
    case 'terminal':
      return { type: 'terminal', row, col };
    // A conversation is a process, like a shell, unless it is a favorite.
    // See `AgentLayout`.
    case 'agent': {
      const ids = window.conversations.filter((id) => kept[id]);
      return {
        type: 'agent',
        row,
        col,
        conversations: ids.flatMap((id) => kept[id] ?? []),
        activeConversation: window.activeConversation
          ? ids.indexOf(window.activeConversation)
          : -1,
      };
    }
    case 'browser':
      return {
        type: 'browser',
        row,
        col,
        // Every tab, including any whose view has not mounted yet and so has
        // no entry in the browser store. A blank placeholder keeps the tab
        // count — and therefore the active index below — honest.
        tabs: window.tabs.map((id) => ({
          url: tabs[id]?.url ?? BLANK_URL,
          viewport: tabs[id]?.viewport ?? null,
        })),
        activeTab: window.activeTab
          ? window.tabs.indexOf(window.activeTab)
          : -1,
      };
    case null:
      return { type: null, row, col };
  }
}

/** The whole workbench, as it would be written down. */
export function snapshotOf(
  windows: WindowState[],
  focusedId: string,
  tabs: Record<string, BrowserTab>,
  kept: Record<string, AgentTabLayout>
): LayoutSnapshot {
  return {
    windows: windows.map((window) => windowSnapshot(window, tabs, kept)),
    focused: windows.findIndex((window) => window.id === focusedId),
  };
}

/**
 * One saved window, as a live one.
 *
 * `seeds` is written into rather than returned, because a browser window is
 * the one kind whose restore produces something that does not belong on the
 * window: the pages its tabs open on, which `lib/browser/` owns. Collecting
 * them in one pass is what lets the caller seed that store and the window
 * store in the same breath.
 */
function windowFrom(
  layout: LayoutWindow,
  seeds: Record<string, BrowserTabSeed>,
  resumes: Record<string, AgentTabLayout>
): WindowState {
  const base = { id: nextWindowId(), row: layout.row, col: layout.col };

  switch (layout.type) {
    case 'editor':
      return {
        ...base,
        type: 'editor',
        files: layout.files,
        activeFile: layout.activeFile,
      };
    case 'board':
      return {
        ...base,
        type: 'board',
        boards: layout.boards,
        activeBoard: layout.activeBoard,
      };
    case 'git':
      return { ...base, type: 'git', tab: layout.tab };
    case 'terminal': {
      const session = nextSessionId();
      return {
        ...base,
        type: 'terminal',
        sessions: [session],
        activeSession: session,
      };
    }
    case 'agent': {
      // Each favorite comes back as a tab that resumes it. A window that held
      // none is an empty tile now: its conversations ended with the app, and
      // a fresh one nobody asked for would only be something to close.
      const saved = layout.conversations ?? [];
      if (saved.length === 0) return { ...base, type: null };
      const conversations = saved.map((tab) => {
        const id = nextConversationId();
        resumes[id] = tab;
        return id;
      });
      return {
        ...base,
        type: 'agent',
        conversations,
        activeConversation:
          conversations[layout.activeConversation ?? 0] ??
          conversations[0] ??
          null,
      };
    }
    case 'browser': {
      // Fresh ids for the saved pages — a tab id names a DOM element and was
      // never written down. A window whose every url was dropped on read
      // comes back the way a new one would: one blank tab, address bar
      // waiting.
      const tabs = layout.tabs.map((saved) => {
        const id = nextTabId();
        seeds[id] = { url: saved.url, viewport: saved.viewport };
        return id;
      });

      if (tabs.length === 0) tabs.push(nextTabId());

      const active = tabs[layout.activeTab] ?? tabs[0] ?? null;
      return { ...base, type: 'browser', tabs, activeTab: active };
    }
    case null:
      return { ...base, type: null };
  }
}

/**
 * The saved arrangement, as windows the store can take — and the pages the
 * browser store should open its tabs on.
 *
 * The coordinates are not touched here — `restore` runs them through
 * `packWindows`, which is where the grid's invariants are kept and where the
 * caps are known. Which means `seeds` can name a tab in a window that packing
 * then drops; the entries cost a string each and are replaced by the next
 * restore, so nothing is gained by reconciling them.
 */
export function windowsFrom(snapshot: LayoutSnapshot): {
  windows: WindowState[];
  focusedId: string;
  seeds: Record<string, BrowserTabSeed>;
  resumes: Record<string, AgentTabLayout>;
} {
  const seeds: Record<string, BrowserTabSeed> = {};
  const resumes: Record<string, AgentTabLayout> = {};
  const windows = snapshot.windows.map((window) =>
    windowFrom(window, seeds, resumes)
  );
  const focused = windows[snapshot.focused];

  return {
    windows,
    // A focus index that names nothing — a layout from before a window was
    // dropped, or a -1 written when nothing had focus — lands on the first
    // window, which is the top-left one and the only defensible default.
    focusedId: focused?.id ?? windows[0]?.id ?? '',
    seeds,
    resumes,
  };
}

/**
 * Whether two snapshots say the same thing.
 *
 * The window store notifies on changes that are not layout at all — focus
 * moving on every click, a reveal being parked and consumed — and each one
 * would otherwise cost a clone across the boundary and a write to a file in a
 * home directory. This is the renderer's half of the rule main keeps with
 * `sameTree` and `sameStatus`: compare before you store.
 *
 * `JSON.stringify` rather than a field-by-field walk, because both sides are
 * built by `snapshotOf` one line above — same key order, same shapes, no
 * prototypes — and a hand-written comparison would be one more thing to
 * forget to extend when a window type gains a field.
 */
export function sameSnapshot(a: LayoutSnapshot, b: LayoutSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The conversations a layout should keep, by conversation id: those whose
 * session is one of the project's favorites.
 */
export function keptConversations(
  conversations: Record<string, { kind: AgentKind; session: string | null }>,
  favorites: { kind: AgentKind; session: string }[] | null
): Record<string, AgentTabLayout> {
  const kept: Record<string, AgentTabLayout> = {};
  if (!favorites) return kept;
  const marked = new Set(favorites.map((f) => `${f.kind}:${f.session}`));
  for (const [id, { kind, session }] of Object.entries(conversations)) {
    if (session && marked.has(`${kind}:${session}`))
      kept[id] = { kind, session };
  }
  return kept;
}
