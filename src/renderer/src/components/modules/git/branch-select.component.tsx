import { cn } from 'cn';
import { Check, GitBranch, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Input, ScrollArea } from '~/components/ui';
import { useGit, useGitStore } from '~/lib/git';

/**
 * Pick a branch, or name one that does not exist yet.
 *
 * One field doing both jobs, because the thing a person has in mind is a
 * branch name either way and which of the two cases they are in is a fact
 * about the repository rather than a choice to make them express. Typing
 * filters the list; typing something no branch matches offers to create it.
 *
 * **The list is rendered inline rather than in a popover**, which is the one
 * non-obvious thing here. Every other menu in the app is a Radix
 * `DropdownMenu`, and this control's first home is inside a `Dialog` — two
 * modal layers fighting over focus, where the menu steals it on open and
 * hands it back to a trigger the dialog has since moved. A list that is
 * simply part of the form has none of that, and in a form this is what a
 * person expects anyway: the options are the content, not a thing to go and
 * find.
 *
 * It refreshes the branch list when it mounts, the same moment `BranchMenu`
 * does and for the same reason — branches change when someone makes one and
 * essentially never otherwise, so a `git branch` per poll would double the
 * cost of the whole feature for a list nobody is reading.
 */
export default function BranchSelect({
  id,
  value,
  onChange,
  allowNew = false,
  exclude,
  excludeReason,
  placeholder = 'Pick a branch',
  autoFocus = false,
}: {
  id?: string;
  /** The chosen branch, existing or not. `''` when nothing is chosen. */
  value: string;
  onChange: (branch: string) => void;
  /** Whether a name that is not a branch yet is an acceptable answer. */
  allowNew?: boolean;
  /**
   * Branches this field will not offer.
   *
   * For the caller that cannot use them at all rather than the one that
   * would rather not: a worktree cannot be made on a branch that is already
   * checked out somewhere, so listing those is listing errors.
   */
  exclude?: string[];
  /** Said when someone types an excluded branch by name. */
  excludeReason?: (branch: string) => string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const branches = useGitStore((state) => state.branches);
  const current = useGitStore((state) => state.status.branch);
  const { refreshBranches } = useGit();

  /**
   * What is in the field.
   *
   * With `allowNew` it *is* the answer, so it starts as the value. Without,
   * it is only a filter over the list and starts empty — seeding it with the
   * current selection would open the picker showing one branch, which is the
   * opposite of what a picker is for.
   */
  const [query, setQuery] = useState(allowNew ? value : '');

  useEffect(() => {
    void refreshBranches();
  }, [refreshBranches]);

  const needle = query.trim();

  const offered = useMemo(() => {
    const blocked = new Set(exclude ?? []);
    return branches.filter((branch) => !blocked.has(branch));
  }, [branches, exclude]);

  const matches = useMemo(
    () =>
      needle === ''
        ? offered
        : offered.filter((branch) =>
            branch.toLowerCase().includes(needle.toLowerCase())
          ),
    [offered, needle]
  );

  // Offered only when nothing is named that exactly, so typing the full name
  // of a branch that exists never reads as an invitation to make a second
  // one. An exact match is a selection, not a near miss — and an exact match
  // on an *excluded* branch is neither, which is what `blocked` says below.
  const canCreate = allowNew && needle !== '' && !branches.includes(needle);

  // A branch that exists, and that this field will not take. Worth saying
  // out loud: the row is simply absent otherwise, and an empty list in
  // answer to a branch name you know exists reads as a bug.
  const blocked = needle !== '' && (exclude ?? []).includes(needle);

  const choose = (branch: string) => {
    setQuery(branch);
    onChange(branch);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Input
        id={id}
        value={query}
        autoFocus={autoFocus}
        spellCheck={false}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          // Reported on every keystroke, but only where the text is the
          // answer. With `allowNew` a parent that heard about it on Enter
          // would disagree with the field in front of the person typing;
          // without it the text is a filter, and narrowing a list is not a
          // reason to drop what is already chosen.
          if (allowNew) onChange(event.target.value);
        }}
      />

      <ScrollArea className="max-h-40 rounded-md border border-border">
        <div className="flex flex-col p-1">
          {canCreate ? (
            <button
              type="button"
              onClick={() => choose(needle)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-left text-[12px] transition-colors hover:bg-row-hover',
                value === needle ? 'bg-row-open text-fg' : 'text-fg-muted'
              )}
            >
              <Plus className="size-3.5 shrink-0" />
              <span className="truncate">Create “{needle}”</span>
            </button>
          ) : null}

          {matches.map((branch) => (
            <button
              key={branch}
              type="button"
              onClick={() => choose(branch)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-left text-[12px] transition-colors hover:bg-row-hover',
                value === branch ? 'bg-row-open text-fg' : 'text-explorer-file'
              )}
            >
              {value === branch ? (
                <Check className="size-3.5 shrink-0" />
              ) : (
                <GitBranch className="size-3.5 shrink-0 opacity-60" />
              )}
              <span className="min-w-0 flex-1 truncate">{branch}</span>
              {branch === current ? (
                <span className="shrink-0 text-[10px] text-fg-subtle">
                  checked out
                </span>
              ) : null}
            </button>
          ))}

          {blocked ? (
            <p className="px-2 py-3 text-center text-[11px] leading-relaxed text-fg-muted">
              {excludeReason
                ? excludeReason(needle)
                : `“${needle}” is not available here.`}
            </p>
          ) : null}

          {matches.length === 0 && !canCreate && !blocked ? (
            <p className="px-2 py-3 text-center text-[11px] text-fg-subtle">
              {branches.length === 0
                ? 'This repository has no branches yet.'
                : offered.length === 0
                  ? 'Every branch is already checked out somewhere.'
                  : 'No branch matches.'}
            </p>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
