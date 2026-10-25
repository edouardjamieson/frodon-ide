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
  type Text,
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
import { isMarkdownPath, useEditorStore } from '~/lib/editor';
import { minimalChange } from './editor.service';
import { markdownGrammar, markdownPage } from './editor-markdown.service';
import { findExtension } from './editor-find.service';
import { useEditorFind } from './editor-find.hook';
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
 * How a document is drawn: as code, with line numbers and folding, or — for
 * markdown that has not been flipped to source — as a page.
 *
 * Its own compartment rather than more of `appearance`, because the two
 * change for different reasons: a theme change touches every document's
 * colors, and `mod+e` touches one window's way of looking at markdown.
 */
const mode = new Compartment();

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
  // GitHub's dialect with each fence highlighted in its own language, rather
  // than the registry's CommonMark — see `markdownGrammar`.
  if (isMarkdownPath(path)) return [markdownGrammar];

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
  if (isMarkdownPath(path)) return;
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

/** Line numbers, the active line and folding: how code is drawn. */
const codeChrome: Extension = [
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
];

/**
 * What a document is drawn with, given whether its window has markdown
 * flipped to source.
 *
 * A page has no gutter and no active-line band: line numbers count lines of
 * the file, and a paragraph is one line however many it wraps to, so the
 * numbers would only say how the file is written, not where you are on the
 * page.
 */
function modeFor(path: string | null, source: boolean): Extension {
  if (isMarkdownPath(path) && !source) return markdownPage(path);
  return codeChrome;
}

function createState(
  doc: string,
  theme: Theme,
  path: string | null,
  source: boolean
) {
  return EditorState.create({
    doc,
    extensions: [
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
      // No `searchKeymap` with it. Mod+F is the registry's — see
      // `lib/keybinding/`, which listens in the capture phase precisely so
      // that CodeMirror's own keymap cannot claim a chord first.
      findExtension(),
      appearance.of(appearanceFor(theme, path)),
      mode.of(modeFor(path, source)),
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
 * @param windowId  the pane this editor belongs to. Dirty state and save
 *                  requests are addressed to a window, not to a file: the
 *                  same file open in the pane next door is a different
 *                  document with different unsaved work.
 * @param path    the tab on screen, or null when the window has none open
 * @param openPaths  every tab the window has open, so documents belonging to
 *                   closed tabs can be dropped instead of held forever
 */
export function useEditor(
  windowId: string,
  path: string | null,
  openPaths: string[] = []
) {
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
   *
   * Held as CodeMirror's `Text` rather than a string, because it is also what
   * "unsaved" is measured against — and that comparison runs on every
   * keystroke. `Text.eq` skips the rope nodes two documents share, and the
   * document being compared is always a descendant of this one, so the common
   * case costs a walk of the edited region rather than of the file. Asking
   * `doc.toString() === saved` would allocate a copy of the whole file per
   * character typed.
   */
  const diskRef = useRef(new Map<string, Text>());
  const theme = useTheme();
  /**
   * The same theme, readable from effects that must not re-run when it
   * changes — building a document is not a reason to rebuild the view, and
   * listing `theme` as a dependency of the effects below would do exactly
   * that. Kept current by the appearance effect at the bottom, which is the
   * one place a theme change is meant to be handled.
   */
  const themeRef = useRef(theme);
  /**
   * Whether this window shows markdown as source — `mod+e`. Read through a
   * ref by the effects that build documents, for the reason `themeRef` is,
   * and kept current by the mode effect near the bottom.
   */
  const source = useEditorStore((state) => state.markdownSource.has(windowId));
  const sourceRef = useRef(source);
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
  const setDirty = useEditorStore((state) => state.setDirty);
  const forgetWindow = useEditorStore((state) => state.forgetWindow);
  const retainDirty = useEditorStore((state) => state.retain);
  const pendingSave = useEditorStore((state) => state.pendingSave);
  const clearSave = useEditorStore((state) => state.clearSave);

  /**
   * The find bar. Driven from here rather than from the component because
   * what it searches is the view, and `applyTo` has to be called wherever a
   * document is swapped into one.
   */
  const { find, applyTo, recount } = useEditorFind(viewRef, windowId, path);

  /**
   * Re-decides whether one of this window's documents differs from its file.
   *
   * Takes a path rather than assuming the visible one, because the two things
   * that change the answer do not always talk about the tab on screen: a file
   * adopted from disk may be parked behind three other tabs, and a save that
   * took a moment may have been switched away from before it landed.
   */
  const settleDirty = useCallback(
    (target: string) => {
      const doc =
        shownRef.current === target
          ? viewRef.current?.state.doc
          : docsRef.current.get(target)?.doc;
      if (!doc) return;

      const saved = diskRef.current.get(target);
      setDirty(windowId, target, saved ? !doc.eq(saved) : false);
    },
    [windowId, setDirty]
  );

  /**
   * The same for whatever is on screen, which is what the view's dispatch
   * calls on every change to it. The store drops everything but the
   * transitions, so typing a hundred characters notifies the tab bar once.
   */
  const refreshDirty = useCallback(() => {
    if (shownRef.current) settleDirty(shownRef.current);
  }, [settleDirty]);

  /**
   * The same, readable from the mount effect, which must not list it as a
   * dependency: rebuilding the view is not something a changed callback is
   * allowed to cause.
   */
  const refreshDirtyRef = useRef(refreshDirty);
  useEffect(() => {
    refreshDirtyRef.current = refreshDirty;
  }, [refreshDirty]);

  /** The same arrangement for the find bar's tally. */
  const recountRef = useRef(recount);
  useEffect(() => {
    recountRef.current = recount;
  }, [recount]);

  // Built once for the component's lifetime, with an empty document: the path
  // effect below fills it on the same commit, so nothing is painted twice.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view: EditorView = new EditorView({
      parent: host,
      state: createState('', themeRef.current, null, sourceRef.current),
      // Taking over dispatch rather than installing an `updateListener` in
      // every state: this belongs to the *view*, which outlives each document
      // swapped into it, so there is one hook here instead of one in every
      // `EditorState` this window ever builds.
      dispatchTransactions: (transactions) => {
        view.update(transactions);
        if (transactions.some((transaction) => transaction.docChanged)) {
          refreshDirtyRef.current();
        }
        // The tally moves for both: typing adds and removes matches, and
        // moving the cursor changes which of them you are standing on. It
        // costs nothing with the bar closed, which is almost always.
        if (
          transactions.some(
            (transaction) => transaction.docChanged || transaction.selection
          )
        ) {
          recountRef.current();
        }
      },
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
      // The documents go with the view — closing the last tab unmounts this
      // component — so nothing is left that could still be unsaved.
      forgetWindow(windowId);
    };
  }, [windowId, forgetWindow]);

  // Swap documents when the active tab changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // Park the outgoing document before anything replaces it. Everything the
    // tab had — edits, undo history, cursor, scroll — rides along in its state.
    if (shownRef.current) docsRef.current.set(shownRef.current, view.state);

    if (!path) {
      view.setState(createState('', themeRef.current, null, sourceRef.current));
      shownRef.current = null;
      return;
    }

    const known = docsRef.current.get(path);
    if (known) {
      view.setState(known);
      shownRef.current = path;
      setError(null);
      // The query is a field on the state that was just replaced, so it has
      // to be put back — otherwise clicking to the next tab leaves a bar full
      // of text over a document with nothing highlighted.
      applyTo(view);
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
        const state = createState(
          content,
          themeRef.current,
          path,
          sourceRef.current
        );
        view.setState(state);
        applyTo(view);
        shownRef.current = path;
        // The state's own `Text`, so the first comparison after this is an
        // identity check rather than a walk.
        diskRef.current.set(path, state.doc);
        setError(null);
        // Freshly read, so by definition it agrees with disk. This is also
        // what clears a conflict, or a star, belonging to a tab that was
        // closed and reopened — the document they were about is gone.
        setDiverged((paths) => excluding(paths, path));
        setDirty(windowId, path, false);
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
  }, [path, windowId, setDirty, applyTo]);

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
    // A closed tab's document is gone, so its star has nothing left to be
    // about. Closing it is how you discard unsaved work today; the dialog
    // that asks first arrives with the rest of `dirtyFiles`.
    retainDirty(windowId, openPaths);
  }, [openPaths, windowId, retainDirty]);

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
  const adopt = useCallback(
    (changed: string, next: string): void => {
      const view = viewRef.current;
      if (!view) return;

      const shown = shownRef.current === changed;
      const state = shown ? view.state : docsRef.current.get(changed);
      if (!state) return;

      const change = minimalChange(state.doc.toString(), next);

      if (change) {
        const spec = {
          changes: change,
          // Kept out of the undo history deliberately. This is not a step this
          // editor took, and CodeMirror rebases the local history over changes
          // marked this way — so undo still walks back through what was typed
          // here, rather than reverting what an agent wrote.
          annotations: Transaction.addToHistory.of(false),
        };

        if (shown) {
          view.dispatch(spec);
          diskRef.current.set(changed, view.state.doc);
        } else {
          const updated = state.update(spec).state;
          docsRef.current.set(changed, updated);
          diskRef.current.set(changed, updated.doc);
        }
      } else {
        diskRef.current.set(changed, state.doc);
      }

      setDiverged((paths) => excluding(paths, changed));
      // The document is the file again, by construction — including for a
      // parked tab, which the view's own dispatch would not have reported.
      settleDirty(changed);
    },
    [settleDirty]
  );

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

        const baseline = diskRef.current.get(changed);

        // The file says exactly what this window already thought it said,
        // which is what a save made from here looks like coming back round:
        // the write moved the mtime, main reported it, and none of it is news.
        // Checked *before* the document is looked at, because by now someone
        // may have typed another character into it — and that is an ordinary
        // unsaved edit, not a collision with anything.
        if (baseline && baseline.toString() === next) return;

        // Both ended up at the same text by different routes. Nothing to
        // adopt; only a new baseline, and a star to drop.
        if (state.doc.toString() === next) {
          diskRef.current.set(changed, state.doc);
          settleDirty(changed);
          return;
        }

        // Edited here *and* there. What is on screen stays, and the bar lets
        // the person decide; see `reload`.
        if (baseline && !state.doc.eq(baseline)) {
          setDiverged((paths) => including(paths, changed));
          return;
        }

        adopt(changed, next);
      })();
    });
  }, [adopt, settleDirty]);

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

  // Flip markdown between a page and its source, on the visible document and
  // on every parked one, so the window's other markdown tabs come back the
  // way the window is now looking at markdown. A code file is reconfigured to
  // what it already had, which CodeMirror notices and does nothing about.
  useEffect(() => {
    if (sourceRef.current === source) return;
    sourceRef.current = source;

    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: mode.reconfigure(modeFor(shownRef.current, source)),
    });

    for (const [known, state] of docsRef.current) {
      docsRef.current.set(
        known,
        state.update({ effects: mode.reconfigure(modeFor(known, source)) })
          .state
      );
    }
  }, [source]);

  /**
   * Writes the tab on screen out to its file.
   *
   * The text is captured *before* the write rather than read back after it,
   * because typing does not stop for a round trip: what lands on disk is this
   * `Text`, so this `Text` is what becomes the baseline. If characters arrived
   * while it was in flight, `settleDirty` puts the star straight back, which
   * is the truth — the file no longer holds everything in the document.
   *
   * Saving also settles a conflict. Whatever the file said a moment ago, it
   * says what this window says now, and there is nothing left to choose
   * between.
   */
  const save = useCallback(async () => {
    const view = viewRef.current;
    const shown = shownRef.current;
    if (!view || !shown) return;

    const written = view.state.doc;
    const result = await window.frodon.file.write(shown, written.toString());

    if (!result.ok) {
      setError(result.error ?? `Could not save ${shown}.`);
      return;
    }

    setError(null);
    diskRef.current.set(shown, written);
    setDiverged((paths) => excluding(paths, shown));
    settleDirty(shown);
  }, [settleDirty]);

  /**
   * Honors a save asked for by a key, if it was asked of this window.
   *
   * The request is cleared before the write rather than after it: it is a
   * one-shot message, not a lock, and holding it across a round trip would
   * make a second Cmd+S during a slow write do nothing at all.
   */
  useEffect(() => {
    if (pendingSave !== windowId) return;
    clearSave();
    void save();
  }, [pendingSave, windowId, clearSave, save]);

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
    save,
    find,
    /** This window shows markdown as source rather than as a page. */
    source,
    /** This tab's file was rewritten under edits made here. */
    diverged: path !== null && diverged.has(path),
    /** This tab's file is no longer on disk. */
    missing,
    reload,
    dismiss,
  };
}
