/**
 * The find bar's state, and the three ways it reaches the document.
 *
 * Called from `useEditor` rather than from the component, because what it
 * drives is the `EditorView` — and the component is deliberately the thin end
 * of this module: it hands over a host element and never touches what
 * CodeMirror puts in it.
 *
 * None of this lives in a store. The question is local in the way `diverged`
 * is local: two panes showing the same file are two documents, and a search
 * running in one of them is nobody else's business. The one thing that does
 * cross is the *request* to open — a chord names a window, and a window is not
 * something a key can reach into — so that goes through `useEditorStore` the
 * way a save request already does.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { useEditorStore } from '~/lib/editor';
import {
  countMatches,
  nextMatch,
  previousMatch,
  queryOf,
  seedFrom,
  setFindQuery,
  NO_FIND_OPTIONS,
  NO_MATCHES,
  type FindCount,
  type FindOptions,
  type Match,
} from './editor-find.service';

export interface EditorFind {
  open: boolean;
  search: string;
  setSearch: (search: string) => void;
  options: FindOptions;
  toggleOption: (option: keyof FindOptions) => void;
  count: FindCount;
  /** A regular expression that does not compile. The field says so. */
  invalid: boolean;
  next: () => void;
  previous: () => void;
  close: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function useEditorFind(
  viewRef: React.RefObject<EditorView | null>,
  windowId: string,
  path: string | null
) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<FindOptions>(NO_FIND_OPTIONS);
  const [count, setCount] = useState<FindCount>(NO_MATCHES);
  const inputRef = useRef<HTMLInputElement>(null);

  const pendingFind = useEditorStore((state) => state.pendingFind);
  const clearFind = useEditorStore((state) => state.clearFind);

  const query = useMemo(() => queryOf(search, options), [search, options]);

  /**
   * Whether the bar is on screen.
   *
   * `open` and a document to search, because there is no searching an editor
   * with no file in it. Today the window draws a placeholder instead of
   * mounting one at all, so the second half never fires — but `path` is
   * `string | null` on the way in, and a bar left up over an empty document,
   * still holding the last file's highlights, is what that null would mean.
   *
   * Derived rather than closed by an effect: an effect would be a second
   * source of truth for the same fact, and a render spent agreeing with the
   * first.
   */
  const visible = open && path !== null;

  /**
   * What the document should currently be searched for: the query while the
   * bar is up, and nothing once it closes.
   *
   * Kept in a ref because the callbacks below are read long after the render
   * that made them — `applyTo` from the effect that swaps documents, which
   * must not re-run on every keystroke, and `recount` from the view's own
   * dispatch. Written from an effect declared before every other effect in
   * this hook, so that anything dispatched later in the same commit sees the
   * query that commit was about.
   */
  const activeRef = useRef<ReturnType<typeof queryOf> | null>(null);
  useEffect(() => {
    activeRef.current = visible ? query : null;
  }, [visible, query]);

  /**
   * Re-reads the match tally from whatever is on screen.
   *
   * Called by the view's own dispatch on every change to the document or the
   * selection — see `useEditor` — because both move the answer: typing adds
   * and removes matches, and clicking somewhere else means the cursor is no
   * longer standing on the third of seventeen.
   */
  const recount = useCallback(() => {
    const view = viewRef.current;
    const active = activeRef.current;

    if (!view || !active) {
      // Guarded rather than set unconditionally: this runs on every keystroke
      // in every editor, and the overwhelming majority of them happen with no
      // find bar open at all.
      setCount((current) => (current === NO_MATCHES ? current : NO_MATCHES));
      return;
    }

    setCount(countMatches(view.state, active));
  }, [viewRef]);

  /**
   * Puts the current query into a document that has just been swapped in.
   *
   * A tab switch replaces the whole `EditorState`, and the query is a field on
   * it — so without this, searching a file and clicking to the tab beside it
   * would show a bar full of text over a document with nothing highlighted.
   * Called from each of the places `useEditor` calls `view.setState`.
   */
  const applyTo = useCallback((view: EditorView) => {
    view.dispatch({ effects: setFindQuery.of(activeRef.current) });
  }, []);

  /** Moves the selection onto a match and scrolls it into the middle. */
  const goTo = useCallback(
    (match: Match | null) => {
      const view = viewRef.current;
      if (!view || !match) return;

      view.dispatch({
        // Selected rather than merely scrolled to, which is what makes Enter
        // then typing a replacement work, and what `applyReveal` already does
        // for a match clicked in the project-wide search.
        selection: { anchor: match.from, head: match.to },
        effects: EditorView.scrollIntoView(match.from, { y: 'center' }),
      });
      recount();
    },
    [viewRef, recount]
  );

  const next = useCallback(() => {
    const view = viewRef.current;
    const active = activeRef.current;
    if (!view || !active) return;

    // From the end of the selection, so a match already under the cursor is
    // stepped off rather than found again.
    goTo(nextMatch(view.state, active, view.state.selection.main.to));
  }, [viewRef, goTo]);

  const previous = useCallback(() => {
    const view = viewRef.current;
    const active = activeRef.current;
    if (!view || !active) return;

    goTo(previousMatch(view.state, active, view.state.selection.main.from));
  }, [viewRef, goTo]);

  /**
   * Puts the bar away and hands the keyboard back to the document.
   *
   * The query is kept. Reopening with Cmd+F and finding the last thing
   * searched for still in the field is what every editor does, and it is the
   * difference between a find bar and a prompt.
   */
  const close = useCallback(() => {
    setOpen(false);
    viewRef.current?.focus();
  }, [viewRef]);

  const toggleOption = useCallback((option: keyof FindOptions) => {
    setOptions((current) => ({ ...current, [option]: !current[option] }));
  }, []);

  // The query the document is searched for follows the field, the toggles and
  // the bar being open at all — and the tally follows the query.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({ effects: setFindQuery.of(visible ? query : null) });
    setCount(
      visible && query.valid ? countMatches(view.state, query) : NO_MATCHES
    );
  }, [visible, query, viewRef]);

  /**
   * Honors an open asked for by a key, if it was asked of this window.
   *
   * Cleared before anything else happens, exactly as a save request is: it is
   * a message and not a lock, and a second Cmd+F has to be able to arrive.
   * Pressing it again while the bar is already open re-selects the field —
   * which is what makes the chord a way to start a new search rather than a
   * toggle that puts away the one you are reading.
   */
  useEffect(() => {
    if (pendingFind !== windowId) return;
    clearFind();

    const view = viewRef.current;
    const seed = view ? seedFrom(view.state) : null;
    if (seed) setSearch(seed);

    setOpen(true);
    // After the commit that opens it, so the input exists to be focused.
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [pendingFind, windowId, clearFind, viewRef]);

  const find: EditorFind = {
    open: visible,
    search,
    setSearch,
    options,
    toggleOption,
    count,
    invalid: search !== '' && !query.valid,
    next,
    previous,
    close,
    inputRef,
  };

  return { find, applyTo, recount };
}
