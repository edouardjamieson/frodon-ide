import { useEditor } from './editor.hook';

interface EditorProps {
  /** The file on screen, or null when the window has no tab open. */
  path: string | null;
  /** Every tab the window has open — see `useEditor`. */
  openPaths?: string[];
}

/**
 * CodeMirror, mounted.
 *
 * Thin by design: the component hands over a host element and CodeMirror owns
 * everything inside it. It draws no tab bar and no file name — an editor
 * window's chrome belongs to the window frame, so the same editor can be
 * mounted anywhere without bringing a header along.
 */
export default function Editor({ path, openPaths }: EditorProps) {
  const { hostRef, error } = useEditor(path, openPaths);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-editor">
      {error ? (
        <div className="shrink-0 px-3 py-2 font-mono text-[12px] text-fg-danger select-text">
          {error}
        </div>
      ) : null}

      <div
        ref={hostRef}
        className="min-h-0 flex-1 overflow-hidden select-text"
      />
    </div>
  );
}
