import { cn } from 'cn';
import { useGitLayouts, useUserConfig } from '~/lib/config';
import { DEFAULT_PANE_LAYOUT, type PaneLayout } from '@shared/config.def';
import { Field, FieldGroup } from './settings-field.component';

/**
 * Which way the git view splits its three panes.
 *
 * Stacked is the default everywhere, because a git window is usually a third
 * of the workbench and two columns at that width leave neither readable. A
 * git window given the whole screen is the opposite case — a graph three
 * hundred pixels tall and two thousand wide — and that is who these are for.
 *
 * Live, like everything else in the dialog: a git tile behind it rearranges
 * as the choice is made.
 */
export default function SettingsGit() {
  const { update } = useUserConfig();
  const layouts = useGitLayouts();

  // The default is the absent value, so choosing it removes the key rather
  // than writing it — the file stays a list of choices, as `wordWrap` does.
  const store = (layout: PaneLayout) =>
    layout === DEFAULT_PANE_LAYOUT ? undefined : layout;

  return (
    <div className="flex flex-col gap-7">
      <FieldGroup title="History">
        <Field
          label="History layout"
          hint="Where a clicked commit opens: below the graph, or beside it."
        >
          <LayoutPicker
            value={layouts.history}
            onChange={(next) => update({ gitHistoryLayout: store(next) })}
          />
        </Field>

        <Field
          label="Commit detail layout"
          hint="The files a commit touched, and the patch of the one selected."
        >
          <LayoutPicker
            value={layouts.commitDetail}
            onChange={(next) => update({ gitCommitDetailLayout: store(next) })}
          />
        </Field>
      </FieldGroup>

      <FieldGroup title="Commit">
        <Field
          label="Commit editor layout"
          hint="The staged and changed files, and the diff of the one selected."
        >
          <LayoutPicker
            value={layouts.commit}
            onChange={(next) => update({ gitCommitLayout: store(next) })}
          />
        </Field>
      </FieldGroup>
    </div>
  );
}

const OPTIONS: { value: PaneLayout; label: string }[] = [
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
];

/**
 * The two directions, each drawn as the split it produces.
 *
 * A drawing rather than the word alone, because "horizontal" is ambiguous on
 * its own — the direction of the split for some people, of the divider for
 * others — and the library's meaning, side by side, is the one followed here.
 * Two blocks and nothing in them: the only thing being chosen is which way
 * the line runs, and the chosen one wears the project color like a selected
 * row does.
 */
function LayoutPicker({
  value,
  onChange,
}: {
  value: PaneLayout;
  onChange: (next: PaneLayout) => void;
}) {
  return (
    <div role="radiogroup" className="flex items-start gap-3">
      {OPTIONS.map((option) => {
        const selected = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className="group/layout flex cursor-pointer flex-col items-center gap-1.5"
          >
            <div
              aria-hidden
              className={cn(
                'flex h-12 w-16 gap-[3px] border border-pane-border p-1 rounded-md',
                option.value === 'vertical' && 'flex-col'
              )}
            >
              {[0, 1].map((half) => (
                <div
                  key={half}
                  className={cn(
                    'flex-1 rounded-[3px] transition-colors',
                    selected
                      ? 'bg-project'
                      : 'bg-fg-subtle/25 group-hover/layout:bg-project/40'
                  )}
                />
              ))}
            </div>
            <span
              className={cn(
                'text-[11px]',
                selected ? 'text-fg' : 'text-fg-muted'
              )}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
