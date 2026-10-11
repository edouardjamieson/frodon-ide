import { cn } from 'cn';
import { X } from 'lucide-react';
import { useEditorWindow, fileName, type EditorWindow } from '~/lib/window';
import FileIcon from '~/components/file-icon';
import Editor from '~/components/editor';

/**
 * The editor module: a tab bar in the window's header, CodeMirror in its body.
 *
 * Tabs are the window's own — the same file can be open in two windows at
 * once, each with its own cursor and its own undo history, because each window
 * mounts its own editor. That is the whole point of a window manager: two
 * views of the same project that don't fight over one selection.
 */
export function EditorWindowHeader({ window: win }: { window: EditorWindow }) {
  const { files, activeFile, activate, close } = useEditorWindow(win);

  if (files.length === 0) {
    return (
      <span className="self-center pl-3 text-[11px] text-fg-subtle">
        No file open
      </span>
    );
  }

  return (
    // The bar scrolls rather than shrinking tabs to nothing: a pane in a
    // three-column grid is narrow, and a name you can't read is not a tab.
    <div className="flex items-center gap-0.5 overflow-x-auto px-1.5 [scrollbar-width:none]">
      {files.map((path) => {
        const isActive = path === activeFile;

        return (
          <div
            key={path}
            onMouseDown={() => activate(path)}
            className={cn(
              'group/tab flex h-7 max-w-[180px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md pr-1 pl-2 text-[12px] transition-colors',
              isActive
                ? 'bg-tab-active text-fg'
                : 'text-fg-muted hover:bg-tab-inactive'
            )}
          >
            <FileIcon
              file={{ name: fileName(path), path, isDir: false }}
              className="size-3.5"
            />
            <span className="truncate">{fileName(path)}</span>
            <button
              aria-label={`Close ${fileName(path)}`}
              // The tab under it is only a div, so the click has to be stopped
              // by hand or activating the tab would race closing it.
              onMouseDown={(event) => {
                event.stopPropagation();
                close(path);
              }}
              className={cn(
                'flex size-4 shrink-0 cursor-pointer items-center justify-center rounded transition-opacity hover:bg-project/25',
                isActive ? 'opacity-60' : 'opacity-0 group-hover/tab:opacity-60'
              )}
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function EditorWindowBody({ window: win }: { window: EditorWindow }) {
  if (!win.activeFile) {
    return (
      <div className="flex h-full items-center justify-center text-[12px] text-fg-subtle">
        Pick a file in the explorer to open it here.
      </div>
    );
  }

  return <Editor path={win.activeFile} openPaths={win.files} />;
}
