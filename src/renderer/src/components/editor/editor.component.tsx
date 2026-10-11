import { useProjectStore } from '~/lib/project';
import { useEditor } from './editor.hook';

/**
 * The editor pane. Thin by design — the component mounts a host element and
 * CodeMirror owns everything inside it.
 */
export default function Editor() {
  const activePath = useProjectStore((state) => state.activePath);
  const { hostRef, error } = useEditor(activePath);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-editor">
      <div className="flex h-9 shrink-0 items-center border-b border-border bg-tab-bar px-3">
        {activePath ? (
          <span className="truncate font-mono text-[12px] text-fg-muted">
            {activePath.split('/').pop()}
          </span>
        ) : (
          <span className="text-[12px] text-fg-subtle">No file open</span>
        )}
      </div>

      {error ? (
        <div className="p-4 font-mono text-[12px] text-fg-danger select-text">
          {error}
        </div>
      ) : null}

      <div ref={hostRef} className="min-h-0 flex-1 select-text" />
    </div>
  );
}
