import { useState } from 'react';
import { ReplaceAll } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui';
import { useReplace, useSearch } from '~/lib/search';

/**
 * The replacement field and the button that commits it everywhere.
 *
 * Behind the confirmation is the reason this is a dialog and the per-file
 * button is not: replacing across a project rewrites files nobody has looked
 * at, in one click, and Frodon has no undo that spans files. One file is a
 * deliberate, visible act; four hundred is a sentence that should be read
 * before it is agreed to.
 */
export default function SearchReplace() {
  const { replacement, setReplacement, replace, replacing, error } =
    useReplace();
  const { query, result } = useSearch();
  const [confirming, setConfirming] = useState(false);

  const matches = result?.matchCount ?? 0;
  const files = result?.fileCount ?? 0;
  /**
   * The walk stopped counting at its caps, but the replace does not: it
   * rewrites every match in every file, including the ones the list never
   * showed. The dialog has to say so, or it understates what it is asking for.
   */
  const capped = result?.truncated ?? false;
  const disabled =
    !query || matches === 0 || replacing || Boolean(result?.error);

  return (
    <div className="flex shrink-0 flex-col gap-1">
      <div className="flex items-center gap-1">
        <Input
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
          placeholder="Replace with..."
          spellCheck={false}
          autoComplete="off"
          className="font-mono text-xs!"
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="secondary"
              disabled={disabled}
              onClick={() => setConfirming(true)}
              aria-label="Replace all"
              className="shrink-0 cursor-pointer"
            >
              <ReplaceAll className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Replace all</TooltipContent>
        </Tooltip>
      </div>

      {error ? (
        <div className="px-1 text-[11px] text-fg-danger">{error}</div>
      ) : null}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-base">
              Replace {capped ? 'more than ' : ''}
              {matches} {matches === 1 ? 'match' : 'matches'}?
            </DialogTitle>
            <DialogDescription>
              {capped
                ? 'Every match in every file that matched is rewritten on disk, including the files and matches the list was too long to show.'
                : `Every match in ${files} ${
                    files === 1 ? 'file' : 'files'
                  } is rewritten on disk, including files that are not open.`}{' '}
              Nothing here can undo it.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              className="cursor-pointer"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="cursor-pointer"
              onClick={() => {
                setConfirming(false);
                // Empty paths: every file that matches — see `useReplace`.
                void replace();
              }}
            >
              Replace all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
