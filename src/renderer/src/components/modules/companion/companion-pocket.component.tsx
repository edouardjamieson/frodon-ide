import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Check, File as FileIcon, X } from 'lucide-react';
import { cn } from 'cn';
import {
  POCKET_DRAG_TYPE,
  pocketFiles,
  shellQuote,
  usePocketStore,
  type PocketFile,
} from '~/lib/pocket';
import type { CompanionFeatureView } from './companion.def';

/**
 * The pocket, as the companion shows it: what it holds beside it, and a
 * popover with a note to type in and the files set down in it.
 *
 * A note and files, rather than the stack of snippets it began as. A snippet
 * is a line of the note; a file is the thing a stack of snippets could not
 * hold, and the one most worth setting down — a screenshot on its way into
 * an agent's prompt, a log to attach to an issue. The pocket keeps a file's
 * path and never its bytes, so what it holds is where to find it.
 */

/** Files from Finder, or text, but never something on its way out of here. */
function accepts(data: DataTransfer): boolean {
  const { types } = data;
  if (types.includes(POCKET_DRAG_TYPE)) return false;
  return types.includes('Files') || types.includes('text/plain');
}

/**
 * Files go on the shelf; text goes at the end of the note. A drop is one or
 * the other — a Finder drag carries no text, and a selection dragged out of
 * an editor carries no files.
 */
function take(data: DataTransfer) {
  const { putFiles, append } = usePocketStore.getState();
  const files = pocketFiles(data.files);
  if (files.length > 0) putFiles(files);
  else append(data.getData('text/plain'));
}

export const POCKET_DROP: NonNullable<CompanionFeatureView['drop']> = {
  accepts,
  take,
};

/**
 * Beside the companion while the pocket holds anything: the first line of
 * the note, and the files as thumbnails or a count. Clicking it opens the
 * pocket.
 */
export function PocketStatus({ openPanel }: { openPanel: () => void }) {
  const note = usePocketStore((state) => state.note);
  const files = usePocketStore((state) => state.files);

  const line = note.split('\n').find((text) => text.trim() !== '');
  if (!line && files.length === 0) return null;

  const images = files.filter((file) => file.preview !== null).slice(0, 3);

  return (
    <button
      type="button"
      onClick={openPanel}
      className="flex w-full min-w-0 cursor-pointer flex-col items-start gap-1 text-left"
    >
      <span className="text-[11px] text-fg-subtle">Pocket</span>
      {line ? (
        <span className="w-full truncate font-mono text-[11px] text-fg">
          {line.trim()}
        </span>
      ) : null}
      {files.length > 0 ? (
        <span className="flex items-center gap-1">
          {images.map((file) => (
            <img
              key={file.id}
              src={file.preview ?? undefined}
              alt=""
              className="size-4 rounded-sm object-cover"
            />
          ))}
          <span className="text-[10px] text-fg-subtle">
            {files.length} {files.length === 1 ? 'file' : 'files'}
          </span>
        </span>
      ) : null}
    </button>
  );
}

/**
 * The note, and under it the files. The whole popover takes a drop of
 * files, as the companion does, so a second file can be added where the
 * first one is already showing.
 */
export function PocketPanel() {
  const note = usePocketStore((state) => state.note);
  const setNote = usePocketStore((state) => state.setNote);
  const files = usePocketStore((state) => state.files);
  const putFiles = usePocketStore((state) => state.putFiles);
  const empty = usePocketStore((state) => state.empty);
  // Only while files are held over it — gone the moment the drag is.
  const [eager, setEager] = useState(false);

  // Text dropped on the note is the textarea's own business, and it puts it
  // where the cursor lands; only files are taken here.
  const holdsFiles = (event: DragEvent) =>
    event.dataTransfer.types.includes('Files') &&
    !event.dataTransfer.types.includes(POCKET_DRAG_TYPE);

  return (
    <div
      className={cn('flex flex-col gap-2 rounded-sm', {
        'outline outline-1 outline-project/50': eager,
      })}
      onDragOver={(event) => {
        if (!holdsFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setEager(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setEager(false);
      }}
      onDrop={(event) => {
        setEager(false);
        if (!holdsFiles(event)) return;
        event.preventDefault();
        putFiles(pocketFiles(event.dataTransfer.files));
      }}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-medium text-fg-subtle select-none">
          Pocket
        </span>
        <button
          type="button"
          onClick={empty}
          disabled={note === '' && files.length === 0}
          className="cursor-pointer text-[11px] text-fg-subtle hover:text-fg disabled:cursor-default disabled:opacity-50"
        >
          Empty
        </button>
      </div>

      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="A note for later…"
        rows={5}
        spellCheck={false}
        className="w-full resize-none rounded-md border border-border bg-transparent px-2 py-1.5 font-mono text-[11px] text-fg outline-none placeholder:text-fg-subtle focus:border-project/60"
      />

      {files.length === 0 ? (
        <p className="px-1 text-[11px] text-fg-subtle">
          Drop files here or on the companion to keep them for later.
        </p>
      ) : (
        <ul className="flex max-h-56 flex-col overflow-y-auto">
          {files.map((file) => (
            <PocketRow key={file.id} file={file} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** How long a row says it was copied. */
const COPIED_MS = 1_200;

/**
 * One file. Drag it into a terminal and the shell, or the agent, gets its
 * path; drag it into an editor and the editor does. Click it and the path is
 * on the clipboard. It stays after either, since the point of setting
 * something down is picking it up more than once.
 */
function PocketRow({ file }: { file: PocketFile }) {
  const remove = usePocketStore((state) => state.remove);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const copy = () => {
    void navigator.clipboard.writeText(file.path).then(() => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    });
  };

  // The folder it sits in, by name: enough to tell two `screenshot.png`s
  // apart, and the full path is one hover away in the title.
  const folder = file.path.split('/').slice(-2, -1)[0] ?? '';

  return (
    <li
      draggable
      onDragStart={(event) => {
        // Quoted for a shell, since a terminal is where a path dragged out of
        // here most often lands; the URI list is for anything that would
        // rather have the file than its name.
        event.dataTransfer.setData('text/plain', shellQuote(file.path));
        event.dataTransfer.setData(
          'text/uri-list',
          `file://${encodeURI(file.path)}`
        );
        event.dataTransfer.setData(POCKET_DRAG_TYPE, file.id);
        event.dataTransfer.effectAllowed = 'copy';
      }}
      className="group flex cursor-grab items-center gap-2 rounded-sm px-1 py-1 hover:bg-row-hover active:cursor-grabbing"
    >
      <button
        type="button"
        onClick={copy}
        title={`Copy ${file.path}`}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
      >
        {file.preview ? (
          <img
            src={file.preview}
            alt=""
            draggable={false}
            className="size-7 shrink-0 rounded-sm object-cover"
          />
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-row-hover">
            <FileIcon className="size-3.5 text-fg-subtle" />
          </span>
        )}
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[11px] text-fg">{file.name}</span>
          <span className="truncate text-[10px] text-fg-subtle">{folder}</span>
        </span>
      </button>
      {copied ? (
        <Check className="size-3.5 shrink-0 text-project" />
      ) : (
        <button
          type="button"
          onClick={() => remove(file.id)}
          aria-label="Remove from pocket"
          className="shrink-0 cursor-pointer text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      )}
    </li>
  );
}
