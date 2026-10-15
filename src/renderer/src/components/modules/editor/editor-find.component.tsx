import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  Regex,
  WholeWord,
  X,
} from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from 'cn';
import {
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui';
import { MAX_MATCHES } from './editor-find.constant';
import type { EditorFind } from './editor-find.hook';
import type { FindOptions } from './editor-find.service';

interface OptionButton {
  option: keyof FindOptions;
  icon: ReactNode;
  label: string;
}

/**
 * The same three toggles as the project-wide search panel, in the same order
 * and with the same icons — because they are the same three toggles, and a
 * person who has learned where "match case" is in one of them has learned it
 * for both.
 */
const OPTIONS: OptionButton[] = [
  {
    option: 'caseSensitive',
    icon: <CaseSensitive className="size-3.5" />,
    label: 'Match case',
  },
  {
    option: 'wholeWord',
    icon: <WholeWord className="size-3.5" />,
    label: 'Match whole word',
  },
  {
    option: 'regex',
    icon: <Regex className="size-3.5" />,
    label: 'Use regular expression',
  },
];

/**
 * Find, as a strip above the document.
 *
 * A strip and not a floating box over the top-right corner, which is where
 * most editors put one — for the reason the `Notice` beside it gives: nothing
 * here is urgent enough to cover the text. An overlay hides the first lines of
 * the file, which in a 400-pixel-wide tile is a real fraction of what is on
 * screen, and the one place a match is most likely to be is the line the
 * overlay is sitting on.
 *
 * It holds no state. Everything is `useEditorFind`'s, because the thing being
 * searched is a CodeMirror view and this component has never been allowed to
 * touch one.
 */
export default function EditorFind({
  search,
  setSearch,
  options,
  toggleOption,
  count,
  invalid,
  next,
  previous,
  close,
  inputRef,
}: EditorFind) {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== 'Enter') return;

    // Shift+Enter walks back, which is the pairing every editor uses and the
    // reason Previous has no chord of its own.
    event.preventDefault();
    if (event.shiftKey) previous();
    else next();
  };

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border bg-editor-gutter px-2 py-1.5">
      <div className="relative min-w-0 flex-1">
        <Input
          ref={inputRef}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Find in file..."
          spellCheck={false}
          autoComplete="off"
          aria-label="Find in file"
          aria-invalid={invalid || undefined}
          className="pr-[70px] font-mono text-xs!"
        />

        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
          {OPTIONS.map(({ option, icon, label }) => (
            <Tooltip key={option}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  // Named as well as described: the button is an icon, and a
                  // tooltip is not something a screen reader can be asked for.
                  aria-label={label}
                  aria-pressed={options[option]}
                  onClick={() => toggleOption(option)}
                  className={cn(
                    'flex size-5 cursor-pointer items-center justify-center rounded transition-colors',
                    options[option]
                      ? 'bg-project/25 text-fg'
                      : 'text-fg-subtle hover:bg-project/15 hover:text-fg-muted'
                  )}
                >
                  {icon}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      <Tally search={search} count={count} invalid={invalid} />

      <Step label="Previous match" onClick={previous} disabled={!count.total}>
        <ChevronUp className="size-3.5" />
      </Step>
      <Step label="Next match" onClick={next} disabled={!count.total}>
        <ChevronDown className="size-3.5" />
      </Step>
      <Step label="Close" onClick={close}>
        <X className="size-3.5" />
      </Step>
    </div>
  );
}

/**
 * How many, and which one of them.
 *
 * A fixed width, so stepping from "9 of 12" to "10 of 12" does not shuffle the
 * three buttons beside it one pixel to the left — which, at this size and with
 * a key held down, reads as the bar flickering.
 */
function Tally({
  search,
  count,
  invalid,
}: {
  search: string;
  count: EditorFind['count'];
  invalid: boolean;
}) {
  const text = () => {
    if (invalid) return 'Bad pattern';
    if (!search) return '';
    if (count.total === 0) return 'No results';
    // Past the cap the tally stops being a count and becomes a direction, so
    // it stops pretending to be one — see `MAX_MATCHES`.
    if (count.capped) return `${MAX_MATCHES}+`;
    return count.index ? `${count.index} of ${count.total}` : `${count.total}`;
  };

  return (
    <span
      // `polite`, so stepping through matches is announced after the move
      // rather than interrupting it.
      aria-live="polite"
      className={cn(
        'w-[74px] shrink-0 text-right text-[11px] tabular-nums',
        invalid || (search && count.total === 0)
          ? 'text-fg-danger'
          : 'text-fg-subtle'
      )}
    >
      {text()}
    </span>
  );
}

function Step({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-fg-muted transition-colors hover:bg-button-hover hover:text-fg disabled:pointer-events-none disabled:opacity-30"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
