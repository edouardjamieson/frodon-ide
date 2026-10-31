import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from 'cn';
import { Search, X } from 'lucide-react';
import type { AgentAttachment } from '@shared/agent.def';
import FileIcon from '~/components/utils/file-icon';
import { imageSource } from '~/lib/agent';
import {
  rankFiles,
  useFilePickerStore,
  useProjectEntries,
  type PickerFile,
} from '~/lib/file-picker';

/** The most rows the picker draws. It is for finding one thing, not browsing. */
const PICKER_ROWS = 30;

/** What a path attachment is called on its chip: its last segment. */
function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1) || path;
}

/**
 * One attachment, as a chip: a file's icon and name, a folder's, or the
 * image itself, small.
 *
 * Used twice — in the composer, with a ×, and on a sent message, where a
 * file's chip opens it. A folder has nowhere to open, and an image is
 * already all there is of it, so neither is a link.
 */
export function AttachmentChip({
  attachment,
  onRemove,
  onOpen,
}: {
  attachment: AgentAttachment;
  onRemove?: () => void;
  onOpen?: (path: string) => void;
}) {
  if (attachment.kind === 'image') {
    return (
      <span className="group/chip relative shrink-0" title={attachment.name}>
        <img
          src={imageSource(attachment)}
          alt={attachment.name}
          className="h-14 max-w-32 rounded-md border border-pane-border object-cover"
        />
        {onRemove ? (
          <button
            aria-label={`Remove ${attachment.name}`}
            onClick={onRemove}
            className="absolute -top-1.5 -right-1.5 flex size-4 cursor-pointer items-center justify-center rounded-full border border-pane-border bg-input text-fg-muted opacity-0 transition-opacity group-hover/chip:opacity-100 hover:text-fg"
          >
            <X className="size-2.5" />
          </button>
        ) : null}
      </span>
    );
  }

  const name = nameOf(attachment.path);
  const openable = onOpen && !attachment.isDir;
  return (
    <span
      title={attachment.path}
      onClick={openable ? () => onOpen(attachment.path) : undefined}
      className={cn(
        'flex max-w-56 shrink-0 items-center gap-1.5 rounded-md border border-pane-border bg-input py-0.5 pr-1 pl-1.5 text-[12px] text-fg-muted',
        { 'cursor-pointer hover:text-fg': openable }
      )}
    >
      <FileIcon
        file={{ name, path: attachment.path, isDir: attachment.isDir }}
        className="size-3.5 text-current"
      />
      <span className="truncate">{name}</span>
      {onRemove ? (
        <button
          aria-label={`Remove ${name}`}
          onClick={onRemove}
          className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded hover:text-fg"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

/**
 * Finding a file or folder in the project to attach.
 *
 * The project's tree and nothing else: the agent works in the project, and a
 * file from elsewhere on the machine is either already reachable by path or
 * an image, which is pasted or dropped instead. The tree is already in the
 * renderer, so a keystroke is a scan of memory, ranked the way go-to-file
 * ranks — with folders among the files, because "look at everything in
 * `src/main/agent`" is as common an ask as one file.
 *
 * With nothing typed it offers the files most recently looked at, which is
 * usually what a message is about.
 */
export function AttachPicker({
  attached,
  onPick,
  onClose,
}: {
  /** Paths already attached, drawn as such rather than offered twice. */
  attached: Set<string>;
  onPick: (file: PickerFile) => void;
  onClose: () => void;
}) {
  const entries = useProjectEntries();
  const recent = useFilePickerStore((state) => state.recent);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const results = useMemo((): PickerFile[] => {
    if (query.trim())
      return rankFiles(entries, query, PICKER_ROWS).map(({ file }) => file);
    const byPath = new Map(entries.map((entry) => [entry.path, entry]));
    return recent.flatMap((path) => byPath.get(path) ?? []).slice(0, 8);
  }, [entries, query, recent]);

  const index = Math.min(selected, Math.max(results.length - 1, 0));

  useEffect(() => {
    list.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [index, results]);

  const move = (delta: number) => {
    if (results.length === 0) return;
    setSelected(
      (current) =>
        (Math.min(current, results.length - 1) + delta + results.length) %
        results.length
    );
  };

  return (
    <>
      {/* Catches the click outside, so the picker closes the way a menu
          does without a document listener to keep in sync. */}
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div className="absolute right-0 bottom-full z-50 mb-2 flex max-h-80 w-96 max-w-full flex-col overflow-hidden rounded-lg border border-pane-border bg-input shadow-lg">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-2.5 py-2">
          <Search className="size-3.5 shrink-0 text-fg-subtle" />
          <input
            autoFocus
            spellCheck={false}
            autoComplete="off"
            value={query}
            placeholder="Attach a file or folder from the project"
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                move(1);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                move(-1);
              } else if (event.key === 'Enter') {
                event.preventDefault();
                const hit = results[index];
                if (hit) onPick(hit);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-subtle"
          />
        </div>

        {results.length === 0 ? (
          <p className="px-3 py-4 text-center text-[12px] text-fg-subtle">
            {query.trim()
              ? 'Nothing in the project matches that.'
              : 'Type part of a file or folder name.'}
          </p>
        ) : (
          <div ref={list} className="flex flex-col overflow-y-auto p-1">
            {results.map((file, position) => {
              const done = attached.has(file.path);
              return (
                <button
                  key={file.path}
                  data-selected={position === index}
                  onMouseMove={() => setSelected(position)}
                  onClick={() => onPick(file)}
                  className={cn(
                    'flex w-full shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left',
                    position === index
                      ? 'bg-row-selected text-fg'
                      : 'text-fg-muted',
                    { 'opacity-50': done }
                  )}
                >
                  <FileIcon
                    file={{
                      name: file.name,
                      path: file.path,
                      isDir: file.isDir,
                    }}
                    className="size-3.5"
                  />
                  <span className="max-w-[60%] shrink-0 truncate text-[12px]">
                    {file.name}
                    {file.isDir ? '/' : ''}
                  </span>
                  {file.dir ? (
                    <span className="min-w-0 flex-1 truncate text-[11px] text-fg-subtle">
                      {file.dir}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
