import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { FolderGit2, HardDrive, Trash2 } from 'lucide-react';
import { cn } from 'cn';
import { Input } from '~/components/ui';
import {
  isValidBookmarkTitle,
  isValidBookmarkUrl,
  type BookmarkScope,
} from '@shared/bookmark.def';
import { useBookmarkError, useBookmarkGroupNames } from '~/lib/bookmark';
import type { BookmarkDraft } from '~/lib/bookmark';

/**
 * The form behind both ways of saving a page: the star in the toolbar, and
 * Edit on a start-page tile.
 *
 * One component for the two because they ask the same four questions, and a
 * second copy of them is a second place for the group field to stop offering
 * the groups that exist. The surfaces differ only in what they are mounted
 * inside — a dropdown for the star, a dialog for the tile — which is why
 * nothing here opens or closes anything: it takes a draft, hands one back,
 * and lets the caller decide what that means.
 *
 * It seeds its own state from `initial` and is expected to be **keyed** by
 * the bookmark it is editing, the way `CustomSize` is keyed by its viewport.
 * The alternative — an effect writing props into state — is the pattern React
 * asks you not to use, and it would fight whatever is being typed.
 *
 * Every field stops its own keystrokes on the way up, which inside a dropdown
 * is not optional: Radix uses them for typeahead on its items and closes the
 * menu on Enter, so an unguarded field loses half of what you type and the
 * menu shuts on the other half. `CustomSize` in the viewport picker does the
 * same thing for the same reason.
 *
 * On the *bubble* phase and on each input, not in capture on the wrapper. A
 * capture handler on an ancestor runs before the event has reached the field
 * it was typed into, so stopping there stops it reaching the field's own
 * listeners — and the only thing that still works is the browser's default
 * action, which is not a thing to be relying on.
 */
export default function BookmarkEditor({
  initial,
  saveLabel,
  onSave,
  onRemove,
  onCancel,
}: {
  initial: BookmarkDraft;
  /** "Add" the first time, "Save" after. The button is the only difference. */
  saveLabel: string;
  onSave: (draft: BookmarkDraft) => void;
  /** Absent for a page that is not saved yet — there is nothing to remove. */
  onRemove?: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const groups = useBookmarkGroupNames();
  const error = useBookmarkError();

  const patch = (change: Partial<BookmarkDraft>) =>
    setDraft((current) => ({ ...current, ...change }));

  // The url is the one field that cannot be reconstructed, so it is the one
  // field that can block a save. An empty title is fine — the menu falls back
  // to the host, which is what an untitled tab shows anyway — and a title too
  // long to store is not, because it would be silently truncated on read.
  const valid =
    isValidBookmarkUrl(draft.url) &&
    (draft.title.trim() === '' || isValidBookmarkTitle(draft.title));

  const submit = () => {
    if (valid) onSave(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter') submit();
    if (event.key === 'Escape') onCancel();
  };

  return (
    <div className="flex w-full flex-col gap-2.5 p-2">
      <Field label="Name">
        <Input
          autoFocus
          value={draft.title}
          onChange={(event) => patch({ title: event.target.value })}
          onKeyDown={onKeyDown}
          onFocus={(event) => event.target.select()}
          placeholder="Untitled"
          spellCheck={false}
          className="h-7 text-[12px]"
        />
      </Field>

      <Field label="Address">
        <Input
          value={draft.url}
          onChange={(event) => patch({ url: event.target.value })}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          className={cn(
            'h-7 text-[12px]',
            isValidBookmarkUrl(draft.url) ? '' : 'border-error-border'
          )}
        />
      </Field>

      <Field label="Group">
        <Input
          value={draft.group}
          onChange={(event) => patch({ group: event.target.value })}
          onKeyDown={onKeyDown}
          placeholder="None"
          spellCheck={false}
          className="h-7 text-[12px]"
        />
        {/*
         * The groups that already exist, as chips.
         *
         * A group is a free string — there is no table of them, so nothing
         * stops a second "Deploys" with a capital letter in the wrong place.
         * Offering the existing ones to click is the whole defence against
         * that, and it is a better one than a dropdown would be: a dropdown
         * makes the first group of a project a two-step act.
         */}
        {groups.length > 0 ? (
          <div className="flex flex-wrap gap-1 pt-1.5">
            {groups.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() =>
                  patch({ group: draft.group === name ? '' : name })
                }
                className={cn(
                  'max-w-full cursor-pointer truncate rounded-full border px-2 py-0.5 text-[10px] transition-colors',
                  draft.group === name
                    ? 'border-project bg-project/20 text-fg'
                    : 'border-pane-border text-fg-muted hover:border-pane-border-focused hover:text-fg'
                )}
              >
                {name}
              </button>
            ))}
          </div>
        ) : null}
      </Field>

      <Field label="Saved in">
        {/*
         * Two buttons rather than a select, because there are two answers and
         * the difference between them is worth reading rather than opening.
         * The icons are the ones the boards panel already uses for the same
         * pair, so the vocabulary is one vocabulary.
         */}
        <div className="flex gap-1">
          <ScopeButton
            scope="project"
            active={draft.scope === 'project'}
            onClick={() => patch({ scope: 'project' })}
          />
          <ScopeButton
            scope="local"
            active={draft.scope === 'local'}
            onClick={() => patch({ scope: 'local' })}
          />
        </div>
      </Field>

      {error ? (
        <p className="text-[11px] text-fg-danger select-text">{error}</p>
      ) : null}

      <div className="flex items-center gap-1 pt-0.5">
        {onRemove ? (
          <button
            type="button"
            aria-label="Remove bookmark"
            title="Remove bookmark"
            onClick={onRemove}
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-destructive/15 hover:text-fg-danger"
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}

        <div className="flex-1" />

        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-md px-2 py-1 text-[11px] text-fg-muted transition-colors hover:text-fg"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!valid}
          onClick={submit}
          className={cn(
            'rounded-md bg-project/20 px-2.5 py-1 text-[11px] text-fg transition-colors',
            valid ? 'cursor-pointer hover:bg-project/35' : 'opacity-40'
          )}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] tracking-wide text-fg-subtle uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

const SCOPE_LABEL: Record<BookmarkScope, string> = {
  project: 'Project',
  local: 'Local',
};

/**
 * One of the two places a bookmark can live, with what that means underneath
 * it. The hint is there because the choice is invisible afterwards and its
 * consequence — a line in somebody's pull request — is not.
 */
function ScopeButton({
  scope,
  active,
  onClick,
}: {
  scope: BookmarkScope;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = scope === 'project' ? FolderGit2 : HardDrive;

  return (
    <button
      type="button"
      onClick={onClick}
      title={
        scope === 'project'
          ? 'Committed with the project, in .frodon/bookmarks.json'
          : 'Yours, on this machine only'
      }
      className={cn(
        'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors',
        active
          ? 'border-project bg-project/20 text-fg'
          : 'border-pane-border text-fg-muted hover:border-pane-border-focused hover:text-fg'
      )}
    >
      <Icon className="size-3" />
      {SCOPE_LABEL[scope]}
    </button>
  );
}
