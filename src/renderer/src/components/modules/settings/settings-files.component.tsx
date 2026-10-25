import { useState } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';
import { Button, Input } from '~/components/ui';
import { useProjectConfig } from '~/lib/config';
import {
  ALWAYS_EXCLUDED,
  DEFAULT_EXCLUDE,
  MAX_EXCLUDE_PATTERNS,
  MAX_EXCLUDE_PATTERN_LENGTH,
  excludesOf,
  isValidExcludePattern,
} from '@shared/config.def';
import { Field, FieldGroup } from './settings-field.component';

/**
 * What the project hides: the patterns the explorer, search, the file picker
 * and the watcher all skip.
 *
 * The list on screen is always the list *in force* — the project's own when
 * it has one, the defaults when it does not — so the first edit starts from
 * what the person was already looking at rather than from an empty list that
 * would suddenly show them `dist`. That first edit is also the moment the
 * defaults get written into the file, which is why the page says whose list
 * it is above it, and offers the way back.
 *
 * An edit that lands the list back on exactly the defaults removes the key
 * instead of writing them out. The two hide the same files today, but only
 * the absent one follows the defaults if they change, and a person who added
 * a pattern and then took it away meant "as it was".
 */
export default function SettingsFiles() {
  const { config, update } = useProjectConfig();
  const patterns = excludesOf(config);
  const custom = config.exclude !== undefined;
  const [draft, setDraft] = useState('');

  const commit = (next: readonly string[]) => {
    const same =
      next.length === DEFAULT_EXCLUDE.length &&
      next.every((pattern, index) => pattern === DEFAULT_EXCLUDE[index]);
    update({ exclude: same ? undefined : [...next] });
  };

  const candidate = draft.trim();
  const problem = !candidate
    ? null
    : !isValidExcludePattern(candidate)
      ? 'That cannot be a pattern.'
      : patterns.includes(candidate)
        ? 'Already on the list.'
        : patterns.length >= MAX_EXCLUDE_PATTERNS
          ? `A project can hide behind ${MAX_EXCLUDE_PATTERNS} patterns at most.`
          : null;

  const add = () => {
    if (!candidate || problem) return;
    commit([...patterns, candidate]);
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-7">
      <FieldGroup>
        <Field
          label="Hidden from the project"
          hint={
            <>
              A bare name like <Code>dist</Code> hides it at any depth. Anything
              with a <Code>/</Code> or a glob character —{' '}
              <Code>src/generated</Code>, <Code>**/*.min.js</Code> — is matched
              against the path from the project root.
            </>
          }
        >
          <div className="flex items-center justify-between gap-3 text-[11px] text-fg-subtle">
            <span>
              {custom
                ? 'This project’s own list, saved in .frodon/config.json.'
                : 'The defaults. Change anything and the list is saved into the project.'}
            </span>
            {custom ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => update({ exclude: undefined })}
              >
                <RotateCcw />
                Back to the defaults
              </Button>
            ) : null}
          </div>

          <ul className="flex flex-col overflow-hidden rounded-md border border-border">
            {patterns.length === 0 ? (
              <li className="px-3 py-2 text-[12px] text-fg-subtle">
                Nothing but what is always hidden.
              </li>
            ) : (
              patterns.map((pattern) => (
                <li
                  key={pattern}
                  className="group flex items-center gap-2 border-b border-border px-3 py-1.5 last:border-b-0 hover:bg-row-hover"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">
                    {pattern}
                  </span>
                  <button
                    type="button"
                    aria-label={`Stop hiding ${pattern}`}
                    onClick={() =>
                      commit(patterns.filter((entry) => entry !== pattern))
                    }
                    className="flex size-5 cursor-pointer items-center justify-center rounded text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-project/20 hover:text-fg focus-visible:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))
            )}
          </ul>

          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <Input
              id="settings-files-pattern"
              value={draft}
              spellCheck={false}
              autoComplete="off"
              maxLength={MAX_EXCLUDE_PATTERN_LENGTH}
              placeholder="coverage"
              aria-invalid={problem !== null}
              className="font-mono text-[12px]"
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={!candidate || problem !== null}
            >
              <Plus />
              Hide
            </Button>
          </form>
          {problem ? (
            <p className="text-[11px] text-fg-danger">{problem}</p>
          ) : null}
        </Field>
      </FieldGroup>

      <FieldGroup title="Always hidden">
        <div className="flex flex-wrap gap-1.5">
          {ALWAYS_EXCLUDED.map((pattern) => (
            <span
              key={pattern}
              className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-fg-subtle"
            >
              {pattern}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-fg-subtle">
          Whatever the list above says. None of it is ever worth walking into:
          the repository’s own objects, a dependency tree a watcher would never
          finish with, and the operating system’s notes to itself.
        </p>
      </FieldGroup>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return <code className="font-mono text-fg-muted">{children}</code>;
}
