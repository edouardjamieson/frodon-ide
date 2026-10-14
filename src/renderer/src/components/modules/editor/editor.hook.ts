/**
 * The editor, which is now about two hundred lines instead of eight hundred.
 *
 * The TUI's editor hand-rolled everything a text buffer needs: cursor offsets,
 * selection anchors, column-preserving vertical movement, undo, search match
 * projection, clipboard bridging. CodeMirror does all of it, correctly, plus
 * multi-cursor, bracket matching, folding and a real undo history. The only
 * idea worth carrying over was that the *theme* decides the colors — see
 * `editor.theme.ts`.
 *
 * What remains here is lifecycle, and one thing tabs made necessary: a view
 * can only show one document, but an editor window has as many open as it has
 * tabs. So the view is built once and each tab's `EditorState` is kept beside
 * it — switching tabs swaps the whole state in, which restores the cursor, the
 * selection, the scroll position and the undo history exactly as they were.
 * Re-reading the file from disk instead would silently discard every unsaved
 * edit the moment someone clicked another tab.
 *
 * Holding documents that way is also what makes a file changing on disk a
 * question rather than a refresh. A tab is not a view of the file; it is a
 * document that *came* from the file and has been diverging from it ever
 * since. So when main says the bytes moved — an agent, a `git pull`, the same
 * project open in another editor — this reads them back and compares three
 * texts, not two: what is on disk now, what was on disk when the tab was
 * opened, and what is in the document. A tab nobody has typed into adopts the
 * change in place, keeping its cursor and its scroll. A tab that has been
 * edited keeps what is in it and says so, because what is in it is the only
 * copy of it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Compartment,
  EditorState,
  Transaction,
  type Extension,
} from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  rectangularSelection,
  dropCursor,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {
  bracketMatching,
  indentOnInput,
  foldGutter,
  foldKeymap,
  LanguageDescription,
  type LanguageSupport,
} from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { useTheme } from '~/lib/theme';
import type { Theme } from '~/lib/theme';
import { useWindowStore } from '~/lib/window';
import { useIsMissing } from '~/lib/file-watch';
import { minimalChange } from './editor.service';
import { codeMirrorTheme } from './editor.theme';

/**
 * Everything that changes without rebuilding a document lives in one
 * compartment. CodeMirror can only reconfigure a compartment that was present
 * when the state was created, so it is installed in every state built below
 * and merely swapped thereafter — which is what lets a theme change keep the
 * scroll position and the undo history.
 *
 * One compartment instance is shared by every state in every editor window.
 * That is correct: a compartment is a key, not storage. What it holds is per
 * state.
 */
const appearance = new Compartment();

/**
 * Grammars that have been fetched, by language name.
 *
 * Module-level, so it is shared by every editor window: the second window to
 * open a `.rs` file pays nothing, and neither does the second tab.
 */
const grammars = new Map<string, LanguageSupport>();

/**
 * Which of CodeMirror's languages a file is written in, or null.
 *
 * `matchFilename` rather than an extension table, because an extension is not
 * always what names a language: `Dockerfile`, `CMakeLists.txt` and `.babelrc`
 * have none, and the registry carries a filename pattern for each of them.
 *
 * This is what the migration note in `docs/migration.md` wanted, arrived at
 * from the other end. Porting the TUI's 556-entry map would have meant
 * hand-mapping every value from a refractor id to a CodeMirror package and
 * then maintaining the result; `@codemirror/language-data` is that table,
 * written by the people who ship the grammars, with the lazy import already
 * in it.
 */
function descriptionFor(path: string | null): LanguageDescription | null {
  if (!path) return null;
  const filename = path.split(/[/\\]/).pop() ?? '';
  return LanguageDescription.matchFilename(languages, filename);
}

/** The grammar for a path, if it is already in hand. Never fetches. */
function languageFor(path: string | null): Extension[] {
  const description = descriptionFor(path);
  if (!description) return [];

  const grammar = grammars.get(description.name);
  return grammar ? [grammar] : [];
}

/**
 * Fetches the grammar for a path, if there is one and it is not already here.
 *
 * Every language is a separate chunk — CodeMirror ships a package per grammar
 * rather than one bundle — so this is a dynamic import, and opening a `.ts`
 * file costs the TypeScript grammar and not the other hundred and forty.
 *
 * Awaited beside the file read rather than after it, so a document is built
 * once, already highlighted. Reconfiguring a compartment a moment later would
 * work too, and would show every file unhighlighted for a frame first.
 *
 * Never rejects: a grammar that will not load is a file without colors, which
 * is worth a line in the console and nothing else.
 */
async function loadLanguage(path: string | null): Promise<void> {
  const description = descriptionFor(path);
  if (!description || grammars.has(description.name)) return;

  try {
    grammars.set(description.name, await description.load());
  } catch (cause) {
    console.error(`could not load the ${description.name} grammar`, cause);
  }
}

/** What the compartment holds for a given file: its colors and its grammar. */
function appearanceFor(theme: Theme, path: string | null): Extension[] {
  return [codeMirrorTheme(theme), ...languageFor(path)];
}

function createState(doc: string, theme: Theme, path: string | null) {
  return EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      foldGutter({
        markerDOM: (open) => {
          const arrow = document.createElement('div');
          arrow.innerHTML = open ? '▾' : '▸';
          arrow.style.fontSize = '16px';
          arrow.style.marginLeft = '8px';
          arrow.style.marginRight = '8px';
          arrow.style.lineHeight = '1.2';
          arrow.style.cursor = 'pointer';
          return arrow;
        },
      }),
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      history(),
      bracketMatching(),
      indentOnInput(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        indentWithTab,
      ]),
      appearance.of(appearanceFor(theme, path)),
    ],
  });
}

/**
 * Performs the parked jump, if there is one and it is for this document.
 *
 * Reading the store here rather than taking the reveal as an argument is what
 * makes it one-shot across the two places that call this: the effect that
 * handles a jump into a file already on screen, and the one that handles a
 * jump into a file that had to be read first. Whichever gets there first
 * clears it, and every other editor window mounted on the same file finds
 * nothing to do.
 */
function applyReveal(view: EditorView, path: string | null): void {
  const { pendingReveal, clearReveal } = useWindowStore.getState();
  if (!pendingReveal || pendingReveal.path !== path) return;

  const { doc } = view.state;
  // Clamped at every step: the file may have been edited since the search
  // walked it, and a line number past the end of the document is a thrown
  // RangeError rather than a missed jump.
  const line = doc.line(Math.min(Math.max(pendingReveal.line, 1), doc.lines));
  const from = Math.min(
    line.from + Math.max(pendingReveal.column - 1, 0),
    line.to
  );
  const to = Math.min(from + pendingReveal.length, line.to);

  view.dispatch({
    // Selected rather than merely scrolled to: the match is what was clicked,
    // so it is what should be ready to be typed over.
    selection: { anchor: from, head: to },
    effects: EditorView.scrollIntoView(from, { y: 'center' }),
  });
  view.focus();

  clearReveal();
}

/**
 * Nothing has diverged from disk yet, which is the state of every editor
 * window almost all of the time. Shared so that the first render of each one
 * does not allocate a Set to say so.
 */
const NO_PATHS: ReadonlySet<string> = new Set<string>();

/**
 * The same set with a path added or removed — or the *identical* set when
 * there was nothing to do.
 *
 * Returning the original is the point: React bails out of a state update whose
 * value is unchanged, so the event that arrives for a file already marked
 * stale re-renders nothing.
 */
function including(
  paths: ReadonlySet<string>,
  value: string
): ReadonlySet<string> {
  if (paths.has(value)) return paths;
  return new Set(paths).add(value);
}

function excluding(
  paths: ReadonlySet<string>,
  value: string
): ReadonlySet<string> {
  if (!paths.has(value)) return paths;
  const next = new Set(paths);
  next.delete(value);
  return next;
}

/**
 * @param path    the tab on screen, or null when the window has none open
 * @param openPaths  every tab the window has open, so documents belonging to
 *                   closed tabs can be dropped instead of held forever
 */
export function useEditor(path: string | null, openPaths: string[] = []) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  /** One document per open tab, keyed by absolute path. */
  const docsRef = useRef(new Map<string, EditorState>());
  /** Which path `view.state` currently belongs to, so it can be put back. */
  const shownRef = useRef<string | null>(null);
  /**
   * The text each open file last had *on disk*, as this window saw it.
   *
   * The third of the three texts an external change is judged against, and the
   * only one that has to be remembered rather than asked for. Without it there
   * is no way to tell a document that was typed into from one that was never
   * touched, and every change on disk would be either a silent clobber or a
   * question nobody can answer.
   */
  const diskRef = useRef(new Map<string, string>());
  const theme = useTheme();
  /**
   * The same theme, readable from effects that must not re-run when it
   * changes — building a document is not a reason to rebuild the view, and
   * listing `theme` as a dependency of the effects below would do exactly
   * that. Kept current by the appearance effect at the bottom, which is the
   * one place a theme change is meant to be handled.
   */
  const themeRef = useRef(theme);
  /** A jump waiting to be honored — see `applyReveal`. */
  const reveal = useWindowStore((state) => state.pendingReveal);
  const [error, setError] = useState<string | null>(null);
  /**
   * Tabs whose document and whose file have both moved since the tab was
   * opened, and which are therefore waiting for someone to choose.
   *
   * Local to the window rather than in a store, because the answer is local:
   * the same file open in the pane next door has its own document, its own
   * unsaved text and its own right to decide differently.
   */
  const [diverged, setDiverged] = useState<ReadonlySet<string>>(NO_PATHS);
  const missing = useIsMissing(path);

  // Built once for the component's lifetime, with an empty document: the path
  // effect below fills it on the same commit, so nothing is painted twice.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      parent: host,
      state: createState('', themeRef.current, null),
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Swap documents when the active tab changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // Park the outgoing document before anything replaces it. Everything the
    // tab had — edits, undo history, cursor, scroll — rides along in its state.
    if (shownRef.current) docsRef.current.set(shownRef.current, view.state);

    if (!path) {
      view.setState(createState('', themeRef.current, null));
      shownRef.current = null;
      return;
    }

    const known = docsRef.current.get(path);
    if (known) {
      view.setState(known);
      shownRef.current = path;
      setError(null);
      applyReveal(view, path);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        // In parallel: the grammar is a network-free dynamic import and the
        // read is a round trip to main, and neither needs the other.
        const [content] = await Promise.all([
          window.frodon.file.read(path),
          loadLanguage(path),
        ]);
        // Another tab may have been clicked while this read was in flight;
        // dropping a stale result keeps the editor on the newer one.
        if (cancelled) return;
        view.setState(createState(content, themeRef.current, path));
        shownRef.current = path;
        diskRef.current.set(path, content);
        setError(null);
        // Freshly read, so by definition it agrees with disk. This is also
        // what clears a conflict belonging to a tab that was closed and
        // reopened — the document it was about is gone.
        setDiverged((paths) => excluding(paths, path));
        // The jump that opened this tab has been waiting on the read; the
        // effect below fired long before the document existed.
        applyReveal(view, path);
      } catch (cause) {
        if (!cancelled) setError(String(cause));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  // Jump into a document that is already on screen — clicking a second match
  // in the file being looked at. A jump into a file that still has to be read
  // is honored by the effect above, once there is something to jump into.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !reveal || shownRef.current !== path) return;

    applyReveal(view, path);
  }, [reveal, path]);

  // Forget documents whose tabs have been closed. Without this a window that
  // has had a hundred files through it holds a hundred documents, and
  // reopening a closed file would show the version from before it was closed
  // rather than what is on disk.
  useEffect(() => {
    const open = new Set(openPaths);
    for (const known of docsRef.current.keys()) {
      if (!open.has(known)) docsRef.current.delete(known);
    }
    for (const known of diskRef.current.keys()) {
      if (!open.has(known)) diskRef.current.delete(known);
    }
  }, [openPaths]);

  /**
   * Puts the text now on disk into whichever of this window's documents holds
   * `changed` — the visible one or a parked one — and clears its conflict.
   *
   * The whole document is not replaced. `minimalChange` reduces the rewrite to
   * the region that actually moved, and CodeMirror maps the selection and the
   * scroll through it, so a change at the bottom of a file leaves the cursor
   * where it was at the top. Replacing the text outright would work and would
   * yank every reader to line one.
   */
  const adopt = useCallback((changed: string, next: string): void => {
    const view = viewRef.current;
    if (!view) return;

    const shown = shownRef.current === changed;
    const state = shown ? view.state : docsRef.current.get(changed);
    if (!state) return;

    const change = minimalChange(state.doc.toString(), next);
    diskRef.current.set(changed, next);

    if (change) {
      const spec = {
        changes: change,
        // Kept out of the undo history deliberately. This is not a step this
        // editor took, and CodeMirror rebases the local history over changes
        // marked this way — so undo still walks back through what was typed
        // here, rather than reverting what an agent wrote.
        annotations: Transaction.addToHistory.of(false),
      };

      if (shown) view.dispatch(spec);
      else docsRef.current.set(changed, state.update(spec).state);
    }

    setDiverged((paths) => excluding(paths, changed));
  }, []);

  /**
   * Main says a file this window may be showing was rewritten by something
   * else.
   *
   * Registered once and driven by refs rather than by `path`, because it has
   * to answer for parked tabs too: a file edited while you are looking at
   * another one must be current when you click back to it, not still showing
   * what it said an hour ago.
   */
  useEffect(() => {
    return window.frodon.file.onChanged(({ path: changed, deleted }) => {
      // Nothing to read, and nothing to decide. The tab says it is gone —
      // see `useFileWatchSync` — and what is on screen is now the only copy.
      if (deleted) return;
      // Open in some window, but not in this one.
      if (shownRef.current !== changed && !docsRef.current.has(changed)) return;

      void (async () => {
        let next: string;
        try {
          next = await window.frodon.file.read(changed);
        } catch {
          // Rewritten and then removed between the event and the read. The
          // delete that follows is what reports it.
          return;
        }

        // Re-resolved after the await: the tab may have been switched away
        // from, or closed outright, while the read was in flight.
        const shown = shownRef.current === changed;
        const state = shown
          ? viewRef.current?.state
          : docsRef.current.get(changed);
        if (!state) return;

        const local = state.doc.toString();
        // Already showing exactly these bytes — which is what a save made
        // from this app looks like coming back. Nothing to adopt; only a new
        // baseline to measure the next change against.
        if (local === next) {
          diskRef.current.set(changed, next);
          return;
        }

        // Edited here *and* there. What is on screen stays, and the bar lets
        // the person decide; see `reload`.
        const baseline = diskRef.current.get(changed);
        if (baseline !== undefined && local !== baseline) {
          setDiverged((paths) => including(paths, changed));
          return;
        }

        adopt(changed, next);
      })();
    });
  }, [adopt]);

  // Swap colors and grammar in place, on the visible document and on every
  // parked one — a tab switched back to after a theme change must not come
  // back wearing the old theme.
  useEffect(() => {
    themeRef.current = theme;

    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: appearance.reconfigure(appearanceFor(theme, shownRef.current)),
    });

    for (const [known, state] of docsRef.current) {
      docsRef.current.set(
        known,
        state.update({
          effects: appearance.reconfigure(appearanceFor(theme, known)),
        }).state
      );
    }
  }, [theme]);

  /** Takes what is on disk, dropping what was typed here. The bar's button. */
  const reload = useCallback(async () => {
    const changed = shownRef.current;
    if (!changed) return;

    try {
      adopt(changed, await window.frodon.file.read(changed));
    } catch (cause) {
      setError(String(cause));
    }
  }, [adopt]);

  /**
   * Keeps what is here and puts the bar away.
   *
   * The baseline is left alone on purpose: this document is still diverged
   * from its file, so the *next* change on disk is still a collision and still
   * worth asking about.
   */
  const dismiss = useCallback(() => {
    const changed = shownRef.current;
    if (!changed) return;
    setDiverged((paths) => excluding(paths, changed));
  }, []);

  return {
    hostRef,
    error,
    /** This tab's file was rewritten under edits made here. */
    diverged: path !== null && diverged.has(path),
    /** This tab's file is no longer on disk. */
    missing,
    reload,
    dismiss,
  };
}
