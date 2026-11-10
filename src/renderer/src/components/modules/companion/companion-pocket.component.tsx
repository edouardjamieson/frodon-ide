import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import {
  POCKET_DRAG_TYPE,
  usePocketStore,
  type PocketItem,
} from '~/lib/pocket';

/**
 * The pocket's contents, in the popover over the companion.
 *
 * Each row is a way out: click it and it is on the clipboard, drag it and it
 * lands wherever it is dropped — an editor takes `text/plain` natively, and
 * a terminal pastes it. A row stays in the pocket after either, because the
 * point of setting something down is being able to pick it up twice.
 */
export default function CompanionPocket() {
  const items = usePocketStore((state) => state.items);
  const empty = usePocketStore((state) => state.empty);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
        <span className="text-[11px] font-medium text-fg-subtle select-none">
          Pocket
        </span>
        <button
          type="button"
          onClick={empty}
          className="cursor-pointer text-[11px] text-fg-subtle hover:text-fg"
        >
          Empty
        </button>
      </div>
      {items.length === 0 ? (
        <p className="px-2 pt-1 pb-2 text-[11px] text-fg-subtle">
          Drop text on the companion to keep it here.
        </p>
      ) : (
        <ul className="flex max-h-72 flex-col overflow-y-auto pb-1">
          {items.map((item) => (
            <PocketRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** How long a row says it was copied. */
const COPIED_MS = 1_200;

function PocketRow({ item }: { item: PocketItem }) {
  const remove = usePocketStore((state) => state.remove);
  // A second of feedback on one row is the row's own business, not state
  // anything else could want.
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const copy = () => {
    void navigator.clipboard.writeText(item.text).then(() => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    });
  };

  const { first, more } = preview(item.text);

  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', item.text);
        event.dataTransfer.setData(POCKET_DRAG_TYPE, item.id);
        event.dataTransfer.effectAllowed = 'copy';
      }}
      className="group relative flex cursor-grab items-start gap-1 rounded-sm px-2 py-1 hover:bg-row-hover active:cursor-grabbing"
    >
      <button
        type="button"
        onClick={copy}
        title="Copy"
        className="flex min-w-0 flex-1 cursor-pointer flex-col items-start text-left"
      >
        <span className="w-full truncate font-mono text-[11px] text-fg">
          {first}
        </span>
        {more > 0 ? (
          <span className="text-[10px] text-fg-subtle">
            +{more} {more === 1 ? 'line' : 'lines'}
          </span>
        ) : null}
      </button>
      {copied ? (
        <Check className="mt-0.5 size-3.5 shrink-0 text-project" />
      ) : (
        <button
          type="button"
          onClick={() => remove(item.id)}
          aria-label="Remove from pocket"
          className="mt-0.5 shrink-0 cursor-pointer text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      )}
    </li>
  );
}

/**
 * The first line with something on it, and how many lines follow. Leading
 * blank lines are what a drag of a selection made from the line above
 * usually starts with, and a row of nothing says nothing.
 */
function preview(text: string): { first: string; more: number } {
  const lines = text.split('\n');
  const index = lines.findIndex((line) => line.trim() !== '');
  return {
    first: (lines[index] ?? '').trim(),
    more: lines.length - index - 1 - trailingBlank(lines),
  };
}

function trailingBlank(lines: readonly string[]): number {
  let count = 0;
  for (let i = lines.length - 1; i >= 0 && lines[i]?.trim() === ''; i--)
    count++;
  return count;
}
