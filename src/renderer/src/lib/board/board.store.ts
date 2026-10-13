import { create } from 'zustand';
import { boardKey, type BoardElement, type BoardRef } from '@shared/board.def';
import { DEFAULT_STYLE, HISTORY_LIMIT } from './board.constant';
import { measureText } from './board.service';
import type { BoardSession, BoardStore } from './board.def';

/**
 * Sessions are keyed by board rather than by window, so two windows showing
 * the same board show the same drawing. Splitting the workbench to put a board
 * beside the code it describes must not fork the document.
 */
function createSession(ref: BoardRef): BoardSession {
  return {
    ref,
    status: 'loading',
    error: null,
    elements: [],
    selection: [],
    // Zoom 1 at the origin. Where a board opens is a question for whoever
    // first draws on it, and guessing at a fit before the elements have
    // arrived would only move the camera twice.
    camera: { x: 0, y: 0, zoom: 1 },
    editingId: null,
    dirty: false,
    saving: false,
    revision: 0,
    past: [],
    future: [],
  };
}

/** Applies a patch to one session, leaving every other one untouched. */
function patch(
  state: BoardStore,
  key: string,
  update: (session: BoardSession) => BoardSession
): Partial<BoardStore> {
  const session = state.sessions[key];
  // A board closed while a read or a save was in flight. The answer arrives
  // for a session that no longer exists, which is normal, not an error.
  if (!session) return {};

  return { sessions: { ...state.sessions, [key]: update(session) } };
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  boards: [],
  listing: false,
  sessions: {},
  tool: 'select',
  style: DEFAULT_STYLE,

  setBoards: (boards) => set({ boards }),
  setListing: (listing) => set({ listing }),

  setTool: (tool) => {
    const { tool: current, sessions } = get();
    if (current === tool) return;

    // Switching to a tool that draws drops every selection. Leaving the
    // handles on screen under a tool that cannot move them means the next
    // click reads as "resize" to the eye and "draw" to the app, which is the
    // single most confusing thing a canvas editor can do.
    if (tool === 'select') {
      set({ tool });
      return;
    }

    const cleared: Record<string, BoardSession> = {};
    for (const [key, session] of Object.entries(sessions)) {
      if (session.selection.length === 0 && session.editingId === null)
        continue;
      cleared[key] = { ...session, selection: [], editingId: null };
    }

    set({ tool, sessions: { ...sessions, ...cleared } });
  },

  setStyle: (update) => {
    const { style, sessions } = get();
    const next = { ...style, ...update };

    // The same change applied to anything selected — see `setStyle` in the
    // def for why these are one action and not two.
    const patched: Record<string, BoardSession> = {};
    let changed = false;

    for (const [key, session] of Object.entries(sessions)) {
      if (session.selection.length === 0) continue;

      const elements = session.elements.map((element) =>
        session.selection.includes(element.id)
          ? applyStyle(element, update)
          : element
      );

      patched[key] = {
        ...session,
        past: pushHistory(session.past, session.elements),
        future: [],
        elements,
        dirty: true,
        revision: session.revision + 1,
      };
      changed = true;
    }

    set({
      style: next,
      ...(changed ? { sessions: { ...sessions, ...patched } } : {}),
    });
  },

  openSession: (ref) => {
    const key = boardKey(ref);
    // Already open in another window, possibly mid-edit. Re-seeding it would
    // throw away unsaved strokes to show the same board.
    if (get().sessions[key]) return;
    set((state) => ({
      sessions: { ...state.sessions, [key]: createSession(ref) },
    }));
  },

  closeSession: (key) => {
    const { [key]: closing, ...rest } = get().sessions;
    if (!closing) return;
    set({ sessions: rest });
  },

  loaded: (key, document) =>
    set((state) =>
      patch(state, key, (session) => ({
        ...session,
        status: 'ready',
        error: null,
        elements: document.elements,
      }))
    ),

  failed: (key, error) =>
    set((state) =>
      patch(state, key, (session) => ({ ...session, status: 'error', error }))
    ),

  setElements: (key, elements) =>
    set((state) =>
      patch(state, key, (session) => ({
        ...session,
        elements,
        dirty: true,
        revision: session.revision + 1,
      }))
    ),

  commit: (key, elements, before) =>
    set((state) =>
      patch(state, key, (session) => ({
        ...session,
        past: pushHistory(session.past, before ?? session.elements),
        // A new change is a new branch of history, so whatever was undone past
        // this point is no longer reachable.
        future: [],
        elements,
        dirty: true,
        revision: session.revision + 1,
      }))
    ),

  undo: (key) =>
    set((state) =>
      patch(state, key, (session) => {
        const previous = session.past[session.past.length - 1];
        if (!previous) return session;

        return {
          ...session,
          past: session.past.slice(0, -1),
          future: [...session.future, session.elements],
          elements: previous,
          // Selection is filtered rather than cleared: undoing a move should
          // leave the thing you moved selected, and undoing the creation of
          // something should not leave a handle floating over nothing.
          selection: session.selection.filter((id) =>
            previous.some((element) => element.id === id)
          ),
          editingId: null,
          dirty: true,
          revision: session.revision + 1,
        };
      })
    ),

  redo: (key) =>
    set((state) =>
      patch(state, key, (session) => {
        const next = session.future[session.future.length - 1];
        if (!next) return session;

        return {
          ...session,
          past: pushHistory(session.past, session.elements),
          future: session.future.slice(0, -1),
          elements: next,
          selection: session.selection.filter((id) =>
            next.some((element) => element.id === id)
          ),
          editingId: null,
          dirty: true,
          revision: session.revision + 1,
        };
      })
    ),

  setSelection: (key, selection) =>
    set((state) =>
      patch(state, key, (session) =>
        // Guarded, because a click on empty space clears an already-empty
        // selection on every press, and each one would repaint the canvas.
        sameSelection(session.selection, selection)
          ? session
          : { ...session, selection }
      )
    ),

  setCamera: (key, camera) =>
    set((state) => patch(state, key, (session) => ({ ...session, camera }))),

  setEditing: (key, editingId) =>
    set((state) =>
      patch(state, key, (session) =>
        session.editingId === editingId ? session : { ...session, editingId }
      )
    ),

  setSaving: (key, saving) =>
    set((state) => patch(state, key, (session) => ({ ...session, saving }))),

  saved: (key, revision) =>
    set((state) =>
      patch(state, key, (session) => ({
        ...session,
        saving: false,
        // Only the write that carried the current revision makes the board
        // clean. Anything drawn while it was in flight is still unwritten.
        dirty: session.revision !== revision,
      }))
    ),
}));

/** Pushes a snapshot, dropping the oldest once the stack is full. */
function pushHistory(
  past: BoardElement[][],
  elements: BoardElement[]
): BoardElement[][] {
  const next = [...past, elements];
  return next.length > HISTORY_LIMIT
    ? next.slice(next.length - HISTORY_LIMIT)
    : next;
}

function sameSelection(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

/**
 * The brush fields a style change writes onto an element.
 *
 * `fontSize` only reaches text, and `fill` only reaches shapes — a pen stroke
 * with a fill would flood whatever area it happened to enclose, which is never
 * what picking a fill color meant.
 */
function applyStyle(
  element: BoardElement,
  update: Partial<BoardStore['style']>
): BoardElement {
  const next = { ...element } as BoardElement;

  if (update.stroke !== undefined) next.stroke = update.stroke;
  if (update.strokeWidth !== undefined) next.strokeWidth = update.strokeWidth;
  if (update.strokeStyle !== undefined) next.strokeStyle = update.strokeStyle;
  if (update.opacity !== undefined) next.opacity = update.opacity;

  const fillable =
    element.type === 'rectangle' ||
    element.type === 'ellipse' ||
    element.type === 'diamond';

  if (fillable) {
    if (update.fill !== undefined) next.fill = update.fill;
    if (update.fillStyle !== undefined) next.fillStyle = update.fillStyle;
  }

  if (next.type === 'text' && update.fontSize !== undefined) {
    next.fontSize = update.fontSize;
    // The box is a cache of the glyphs, so resizing the type has to resize it
    // too — otherwise the text grows and its hit area stays where it was.
    const measured = measureText(next.text, next.fontSize);
    next.width = measured.width;
    next.height = measured.height;
  }

  return next;
}
