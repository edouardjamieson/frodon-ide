import { FileX, RotateCw, TriangleAlert, X } from 'lucide-react';
import { useEditor } from './editor.hook';
import EditorFind from './editor-find.component';

interface EditorProps {
  /** The pane this editor belongs to — see `useEditor`. */
  windowId: string;
  /** The file on screen, or null when the window has no tab open. */
  path: string | null;
  /** Every tab the window has open — see `useEditor`. */
  openPaths?: string[];
}

/**
 * Something the document cannot say for itself, in a strip above it.
 *
 * A strip rather than a dialog, and above the document rather than over it:
 * every one of these is something that happened *while you were looking
 * elsewhere*, and none of them is urgent enough to take the keyboard away from
 * whatever you were typing. The editor stays usable with the bar up.
 */
function Notice({
  icon,
  children,
  action,
  onAction,
  onDismiss,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-editor-gutter px-3 py-1.5 text-[12px]">
      {icon}
      <span className="min-w-0 flex-1 truncate text-fg-muted">{children}</span>

      {action && onAction ? (
        <button
          onClick={onAction}
          className="flex shrink-0 cursor-pointer items-center gap-1 rounded bg-button px-2 py-0.5 text-fg transition-colors hover:bg-button-hover"
        >
          <RotateCw className="size-3" />
          {action}
        </button>
      ) : null}

      {onDismiss ? (
        <button
          aria-label="Dismiss"
          onClick={onDismiss}
          className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded text-fg-muted opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * CodeMirror, mounted.
 *
 * Thin by design: the component hands over a host element and CodeMirror owns
 * everything inside it. It draws no tab bar and no file name — an editor
 * window's chrome belongs to the window frame, so the same editor can be
 * mounted anywhere without bringing a header along.
 */
export default function Editor({ windowId, path, openPaths }: EditorProps) {
  const { hostRef, error, diverged, missing, reload, dismiss, find } =
    useEditor(windowId, path, openPaths);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-editor">
      {/* Above the notices, because it is the one strip here that was asked
          for: a bar that appears under a warning you did not ask about reads
          as part of the warning. */}
      {find.open ? <EditorFind {...find} /> : null}

      {error ? (
        <div className="shrink-0 px-3 py-2 font-mono text-[12px] text-fg-danger select-text">
          {error}
        </div>
      ) : null}

      {/* A deleted file is a fact with nothing to decide about, so it has no
          buttons: it clears itself the moment the file comes back, which is
          what a branch switch usually does a second later. */}
      {missing ? (
        <Notice icon={<FileX className="size-3.5 shrink-0 text-fg-danger" />}>
          Deleted on disk. What is open here is the only copy.
        </Notice>
      ) : diverged ? (
        <Notice
          icon={<TriangleAlert className="size-3.5 shrink-0 text-fg-warning" />}
          action="Reload"
          onAction={() => void reload()}
          onDismiss={dismiss}
        >
          Changed on disk since you edited it here.
        </Notice>
      ) : null}

      <div
        ref={hostRef}
        className="min-h-0 flex-1 overflow-hidden select-text"
      />
    </div>
  );
}
