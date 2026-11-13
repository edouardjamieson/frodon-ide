import { ChevronRight, Replace } from 'lucide-react';
import { cn } from 'cn';
import FileIcon from '~/components/utils/file-icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui';
import {
  splitPreview,
  useOpenMatch,
  useReplace,
  useSearchResults,
} from '~/lib/search';
import type { SearchFileResult, SearchMatch } from '@shared/search.def';

interface FileRowProps {
  file: SearchFileResult;
  collapsed: boolean;
  onToggle: () => void;
  /** Set only on the Find & Replace tab — see `SearchResults`. */
  onReplace?: () => void;
  replacing: boolean;
}

/**
 * One file and its matches, drawn as the explorer draws a directory.
 *
 * Deliberately the same row: the same disclosure arrow, the same icon, the
 * same twelve pixels of indent per level, the same hover. A result list that
 * looked like a different kind of thing from the tree would be a second way to
 * read the same project.
 */
function FileRow({
  file,
  collapsed,
  onToggle,
  onReplace,
  replacing,
}: FileRowProps) {
  const openMatch = useOpenMatch();

  return (
    <>
      <div className="group/file flex w-full items-center rounded-md pr-1 hover:bg-row-hover">
        <button
          onClick={onToggle}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-[3px] pl-2 text-left text-[12px]"
        >
          <ChevronRight
            className={cn(
              'size-3 shrink-0 text-neutral-500 transition-transform',
              { 'rotate-90': !collapsed }
            )}
          />
          <FileIcon file={{ name: file.name, path: file.path, isDir: false }} />
          <span className="shrink-0 text-explorer-file">{file.name}</span>
          {/* The directory shrinks before the name does: two files called
              `index.ts` are told apart by their folder, but a folder with no
              name beside it tells you nothing at all. */}
          {file.dir ? (
            <span className="truncate text-[11px] text-fg-subtle">
              {file.dir}
            </span>
          ) : null}
        </button>

        {onReplace ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onReplace}
                disabled={replacing}
                aria-label={`Replace in ${file.name}`}
                className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded opacity-0 transition-opacity group-hover/file:opacity-60 hover:bg-project/25 hover:opacity-100 disabled:cursor-default"
              >
                <Replace className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Replace in this file</TooltipContent>
          </Tooltip>
        ) : null}

        <span className="shrink-0 px-1 text-[10px] text-fg-subtle tabular-nums">
          {file.matches.length}
          {/* A file that hit the per-file cap holds more than it is showing,
              and a bare number there would be a lie. */}
          {file.truncated ? '+' : ''}
        </span>
      </div>

      {collapsed
        ? null
        : file.matches.map((match, index) => (
            <MatchRow
              // Two matches can share a line, so the line number alone is not
              // an identity. The index is, within one result set.
              key={`${match.line}:${match.column}:${index}`}
              match={match}
              onClick={() => openMatch(file, match)}
            />
          ))}
    </>
  );
}

function MatchRow({
  match,
  onClick,
}: {
  match: SearchMatch;
  onClick: () => void;
}) {
  const [before, hit, after] = splitPreview(match);

  return (
    <button
      onClick={onClick}
      title={match.preview}
      className="flex w-full cursor-pointer items-baseline gap-2 rounded-md py-[2px] pr-2 pl-[26px] text-left hover:bg-row-hover"
    >
      <span className="w-7 shrink-0 text-right text-[10px] text-fg-subtle tabular-nums">
        {match.line}
      </span>
      {/* Truncated rather than scrolled sideways: main already windowed the
          preview around the match, so what is cut off here is context, and the
          file itself is one click away. */}
      <span className="truncate font-mono text-[11px] whitespace-pre text-fg-muted">
        {before}
        <mark className="rounded-[2px] bg-search-match px-[1px] text-fg">
          {hit}
        </mark>
        {after}
      </span>
    </button>
  );
}

/**
 * The result list.
 *
 * Scrolls vertically only. The explorer scrolls both ways because a deep tree
 * is genuinely wider than the panel and a truncated file name is useless;
 * here the wide thing is a line of someone else's code, which is context
 * rather than content.
 */
export default function SearchResults({
  replaceable = false,
}: {
  replaceable?: boolean;
}) {
  const { result, status, collapsed, toggleCollapsed } = useSearchResults();
  const { replace, replacing } = useReplace();

  if (!result || result.error) return null;

  if (result.files.length === 0) {
    // Only once the walk is over: saying "no results" while still searching is
    // wrong roughly as often as it is right.
    if (status !== 'done') return null;

    return (
      <div className="px-2 py-6 text-center text-[11px] text-fg-subtle">
        No matches in this project.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pt-1">
      {result.files.map((file) => (
        <FileRow
          key={file.path}
          file={file}
          collapsed={collapsed.has(file.path)}
          onToggle={() => toggleCollapsed(file.path)}
          onReplace={replaceable ? () => void replace([file.path]) : undefined}
          replacing={replacing}
        />
      ))}
    </div>
  );
}
