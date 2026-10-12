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
 */
import { useEffect, useRef, useState } from 'react';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
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
} from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { useTheme } from '~/lib/theme';
import type { Theme } from '~/lib/theme';
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
 * Language support for a path.
 *
 * Only JS/TS for now. The TUI's 556-entry extension map in
 * `lib/language/language.constant.ts` is the thing to port here, retargeted
 * from refractor ids to CodeMirror language packages — see docs/migration.md.
 */
function languageFor(path: string | null): Extension[] {
  if (!path) return [];
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
    return [
      javascript({ typescript: ext.startsWith('ts'), jsx: ext.endsWith('x') }),
    ];
  }
  return [];
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
      foldGutter(),
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
  const theme = useTheme();
  /**
   * The same theme, readable from effects that must not re-run when it
   * changes — building a document is not a reason to rebuild the view, and
   * listing `theme` as a dependency of the effects below would do exactly
   * that. Kept current by the appearance effect at the bottom, which is the
   * one place a theme change is meant to be handled.
   */
  const themeRef = useRef(theme);
  const [error, setError] = useState<string | null>(null);

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
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const content = await window.frodon.file.read(path);
        // Another tab may have been clicked while this read was in flight;
        // dropping a stale result keeps the editor on the newer one.
        if (cancelled) return;
        view.setState(createState(content, themeRef.current, path));
        shownRef.current = path;
        setError(null);
      } catch (cause) {
        if (!cancelled) setError(String(cause));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  // Forget documents whose tabs have been closed. Without this a window that
  // has had a hundred files through it holds a hundred documents, and
  // reopening a closed file would show the version from before it was closed
  // rather than what is on disk.
  useEffect(() => {
    const open = new Set(openPaths);
    for (const known of docsRef.current.keys()) {
      if (!open.has(known)) docsRef.current.delete(known);
    }
  }, [openPaths]);

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

  return { hostRef, error };
}
