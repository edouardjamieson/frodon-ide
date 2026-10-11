/**
 * The editor, which is now about a hundred lines instead of eight hundred.
 *
 * The TUI's editor hand-rolled everything a text buffer needs: cursor offsets,
 * selection anchors, column-preserving vertical movement, undo, search match
 * projection, clipboard bridging. CodeMirror does all of it, correctly, plus
 * multi-cursor, bracket matching, folding and a real undo history. The only
 * idea worth carrying over was that the *theme* decides the colors — see
 * `editor.theme.ts`.
 *
 * What remains here is lifecycle: build a view once, swap the document when
 * the active file changes, swap the theme and language when those change, and
 * tear the view down on unmount.
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
import { codeMirrorTheme } from './editor.theme';

/**
 * Everything that changes without rebuilding the view lives in one
 * compartment. CodeMirror can only reconfigure a compartment that was present
 * when the state was created, so it is installed in the initial extensions
 * below and merely swapped thereafter — which is what lets a theme change keep
 * the scroll position and the undo history.
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

export function useEditor(path: string | null) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);

  // Built once for the component's lifetime. The appearance compartment starts
  // empty and is filled by the reconfigure effect below, which runs on the same
  // commit — so the view is themed before the browser paints, without `theme`
  // having to be a dependency here (which would rebuild the whole view, losing
  // scroll position and undo history, on every theme change).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
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
          appearance.of([]),
        ],
      }),
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Load the active file's contents.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (!path) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: '' },
      });
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const content = await window.frodon.file.read(path);
        // The user may have clicked another file while this read was in
        // flight; dropping a stale result keeps the editor on the newer one.
        if (cancelled) return;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: content },
          // Fresh document, so start at the top rather than wherever the
          // previous file's cursor happened to sit.
          selection: { anchor: 0 },
          scrollIntoView: true,
        });
        setError(null);
      } catch (cause) {
        if (!cancelled) setError(String(cause));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  // Swap appearance and language in place.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: appearance.reconfigure([
        codeMirrorTheme(theme),
        ...languageFor(path),
      ]),
    });
  }, [theme, path]);

  return { hostRef, error };
}
