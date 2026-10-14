import { useEffect, useRef, useState } from 'react';
import { cn } from 'cn';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '~/components/ui';
import FileIcon from '~/components/utils/file-icon';
import {
  highlightRuns,
  splitPositions,
  useFilePicker,
  type PickerResult,
} from '~/lib/file-picker';

/**
 * Open a file by typing a bit of its name.
 *
 * An overlay rather than a sidebar panel, because the point is to be gone
 * again in a second: it covers the workbench, takes one line of input, and
 * leaves. Nothing about it crosses to main — the project tree is already in
 * the renderer, pushed by the watcher and already filtered — so a keystroke
 * costs a scan of an array that is in memory, not a round trip.
 *
 * Mounted once, at the app root, and drawn only when it is open.
 */
export default function FilePicker() {
  const { open, query, setQuery, close, results, choose } = useFilePicker();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        // Near the top rather than centered: the list grows downward, and a
        // box that is vertically centered jumps as results arrive. Padding is
        // dropped so the field and the rows can span the full width.
        className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
      >
        {/* Radix requires both for screen readers; neither belongs on screen,
            since the field's own placeholder says all of this already. */}
        <DialogTitle className="sr-only">Open a file</DialogTitle>
        <DialogDescription className="sr-only">
          Type part of a file name to open it.
        </DialogDescription>

        <Picker
          query={query}
          setQuery={setQuery}
          results={results}
          choose={choose}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The field and the list, as a child of the dialog rather than its body.
 *
 * Separate so that it mounts fresh each time the dialog opens — which is what
 * resets the highlighted row to the top without an effect watching for it.
 */
function Picker({
  query,
  setQuery,
  results,
  choose,
}: {
  query: string;
  setQuery: (query: string) => void;
  results: PickerResult[];
  choose: (path: string) => void;
}) {
  const [selected, setSelected] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  // Clamped rather than reset: typing another character usually narrows the
  // list under the cursor, and sending it back to the top on every keystroke
  // would make the arrow keys unusable while still typing.
  const index = Math.min(selected, Math.max(results.length - 1, 0));

  useEffect(() => {
    list.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [index, results]);

  const move = (delta: number) => {
    if (results.length === 0) return;
    // Wraps, because a list this short is faster to reach from either end.
    setSelected((current) => {
      const from = Math.min(current, results.length - 1);
      return (from + delta + results.length) % results.length;
    });
  };

  return (
    <div className="flex max-h-[60vh] flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        <Search className="size-4 shrink-0 text-fg-subtle" />
        <input
          autoFocus
          spellCheck={false}
          autoComplete="off"
          value={query}
          placeholder="Go to file"
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
              if (hit) choose(hit.file.path);
            }
            // Escape is left to the dialog, which already closes on it.
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
        />
      </div>

      {results.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-fg-subtle">
          {query.trim() ? 'No file matches that.' : 'No files are open.'}
        </p>
      ) : (
        <div ref={list} className="flex flex-col overflow-y-auto p-1">
          {results.map((result, position) => (
            <Row
              key={result.file.path}
              result={result}
              selected={position === index}
              // Hovering moves the highlight, so the mouse and the arrow keys
              // never disagree about which row Enter would open.
              onHover={() => setSelected(position)}
              onClick={() => choose(result.file.path)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  result,
  selected,
  onHover,
  onClick,
}: {
  result: PickerResult;
  selected: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const { file, positions } = result;
  const split = splitPositions(file, positions);

  return (
    <button
      data-selected={selected}
      onMouseMove={onHover}
      onClick={onClick}
      className={cn(
        'flex w-full shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left',
        selected ? 'bg-row-selected text-fg' : 'text-fg-muted'
      )}
    >
      <FileIcon file={{ name: file.name, path: file.path, isDir: false }} />
      {/* Capped rather than unshrinkable: the name should win the room it
          needs, but a very long one must not push the row past its own edge. */}
      <span className="max-w-[65%] shrink-0 truncate text-[13px]">
        <Highlighted text={file.name} positions={split.name} />
      </span>
      {/* The directory is context, not the answer: dimmed, and the first thing
          to be cut when the row runs out of room. */}
      {file.dir ? (
        <span className="min-w-0 flex-1 truncate text-[11px] text-fg-subtle">
          <Highlighted text={file.dir} positions={split.dir} />
        </span>
      ) : null}
    </button>
  );
}

/** The characters the query landed on, in the same ink search results use. */
function Highlighted({
  text,
  positions,
}: {
  text: string;
  positions: number[];
}) {
  return (
    <>
      {highlightRuns(text, positions).map((run, index) =>
        run.hit ? (
          <mark
            key={index}
            className="rounded-[2px] bg-search-match px-0 text-fg"
          >
            {run.text}
          </mark>
        ) : (
          <span key={index}>{run.text}</span>
        )
      )}
    </>
  );
}
