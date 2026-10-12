import { CaseSensitive, LoaderCircle, Regex, WholeWord } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from 'cn';
import {
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui';
import { summarize, useSearch } from '~/lib/search';
import type { SearchOptions } from '@shared/search.def';

interface OptionButton {
  option: keyof SearchOptions;
  icon: ReactNode;
  label: string;
}

/**
 * The three toggles, in the order every editor has put them for twenty years.
 * Muscle memory is the only argument that matters here.
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
 * The query box, its toggles, and the one line that says what came back.
 *
 * It holds no state of its own — the store does, so that switching the sidebar
 * to the explorer and back finds the same query with the same results, rather
 * than an empty field. The toggles sit *inside* the input rather than in a row
 * under it because the sidebar is 300px wide by default and a second row is a
 * row of results.
 */
export default function SearchField() {
  const { query, setQuery, options, toggleOption, result, refresh } =
    useSearch();

  return (
    <div className="flex shrink-0 flex-col gap-1">
      <div className="relative">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // The debounce has usually fired by now, so this is for the other
            // case: asking the same question again after the files changed.
            if (event.key === 'Enter') refresh();
            if (event.key === 'Escape') setQuery('');
          }}
          placeholder="Search in files..."
          spellCheck={false}
          autoComplete="off"
          // Autofocused because the module is only ever on screen by an
          // explicit act — clicking the magnifier means wanting to type.
          autoFocus
          aria-invalid={result?.error ? true : undefined}
          className="pr-[70px] font-mono text-xs!"
        />

        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
          {OPTIONS.map(({ option, icon, label }) => (
            <Tooltip key={option}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  // Named as well as described: the button is an icon, and the
                  // tooltip it carries is not something a screen reader — or a
                  // test driving the panel — can be asked for.
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

      <SearchSummary />
    </div>
  );
}

/**
 * What the walk found, or why it didn't.
 *
 * The spinner is the whole feedback for a long search, so it covers the
 * debounce too: from here the wait is one wait, and a spinner that blinked off
 * between the two would read as a finished search with no results.
 */
function SearchSummary() {
  const { query, status, result, hasProject } = useSearch();

  if (!hasProject) {
    return <Line>Open a folder to search it.</Line>;
  }

  if (!query) {
    return <Line>Type to search the whole project.</Line>;
  }

  if (result?.error) {
    return <Line className="text-fg-danger">{result.error}</Line>;
  }

  return (
    <Line>
      {status === 'searching' ? (
        <>
          <LoaderCircle className="size-3 animate-spin" />
          Searching...
        </>
      ) : (
        (result && summarize(result)) || ''
      )}
    </Line>
  );
}

function Line({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-5 items-center gap-1.5 px-1 text-[11px] text-fg-subtle',
        className
      )}
    >
      {children}
    </div>
  );
}
