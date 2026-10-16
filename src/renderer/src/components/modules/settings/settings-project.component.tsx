import { useMemo } from 'react';
import { cn } from 'cn';
import { Check } from 'lucide-react';
import { Input } from '~/components/ui';
import { useProjectConfig } from '~/lib/config';
import {
  projectColorFromHue,
  projectName,
  useProjectIdentity,
  useProjectShortPath,
  useProjectStore,
} from '~/lib/project';
import { HUE_SWATCHES, ICON_SUGGESTIONS, SPECTRUM_STOPS } from '~/lib/settings';
import { useTheme } from '~/lib/theme';
import {
  MAX_ICON_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
  isValidProjectIcon,
} from '@shared/config.def';
import { Field, FieldGroup } from './settings-field.component';

/**
 * How the project introduces itself: a name, a color, an icon.
 *
 * Every field here is *optional*, and the page is written to make that read
 * as a feature rather than as an empty form. Each control shows what would be
 * used if it were left alone — the folder's name as a placeholder, the hashed
 * hue under an "Auto" swatch, the first letter in the badge — so clearing a
 * field is visibly a choice to go back to the derivation, not a way to end up
 * with a project called nothing. See `ProjectConfig`.
 *
 * Nothing here is a draft waiting on a Save button. The store is written on
 * every keystroke and the file follows once the typing stops, which is what
 * lets the badge in the header rename itself while you watch — the strongest
 * possible preview, and one no dialog of its own could match.
 */
export default function SettingsProject() {
  const { config, update } = useProjectConfig();
  const { name, hue, color, icon } = useProjectIdentity();
  const shortPath = useProjectShortPath();
  const root = useProjectStore((state) => state.root);
  const dark = useTheme().dark;

  return (
    <div className="flex flex-col gap-7">
      <Preview name={name} color={color} icon={icon} path={shortPath} />

      <FieldGroup>
        <Field
          label="Name"
          htmlFor="settings-project-name"
          // The placeholder already shows the folder name when nothing is
          // chosen, so the hint says what will happen rather than repeating
          // it — and once a name *is* chosen, the folder name is the thing
          // no longer on screen, so that is the branch that spells it out.
          hint={
            config.name
              ? `Clear it to go back to ${projectName(root)}.`
              : 'Leave it empty and the folder names the project.'
          }
        >
          <Input
            id="settings-project-name"
            value={config.name ?? ''}
            spellCheck={false}
            maxLength={MAX_PROJECT_NAME_LENGTH}
            placeholder={name}
            // An empty field is not an empty name: it removes the key, and
            // the folder answers again.
            onChange={(event) =>
              update({
                name: event.target.value.trim()
                  ? event.target.value
                  : undefined,
              })
            }
          />
        </Field>

        <Field
          label="Icon"
          htmlFor="settings-project-icon"
          hint="One emoji, or anything short. Left empty, it is the first letter of the name."
        >
          <div className="flex items-center gap-2">
            <Input
              id="settings-project-icon"
              value={config.icon ?? ''}
              spellCheck={false}
              autoComplete="off"
              placeholder={icon}
              // Code points, not characters: `maxLength` counts UTF-16 units,
              // and a single emoji is routinely two of them — or seven, for a
              // family. The real limit is the shared grammar below.
              maxLength={MAX_ICON_LENGTH * 2}
              className="w-16 text-center"
              onChange={(event) => {
                const next = event.target.value;
                if (!next.trim()) return update({ icon: undefined });
                // A value that fails the grammar is simply not taken — the
                // field keeps what it had, which is a quieter refusal than an
                // error message for a key that should not have been typed.
                if (isValidProjectIcon(next)) update({ icon: next.trim() });
              }}
            />

            <div className="flex flex-wrap gap-1">
              {ICON_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => update({ icon: suggestion })}
                  className={cn(
                    'flex size-7 cursor-pointer items-center justify-center rounded-md text-sm transition-colors hover:bg-project/20',
                    config.icon === suggestion && 'bg-project/25'
                  )}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </Field>

        <Field
          label="Color"
          hint="The accent follows the project, so this is every focus ring and cursor in the window too. Lightness comes from the theme."
        >
          <ColorField
            hue={hue}
            chosen={config.hue}
            dark={dark}
            onPick={(next) => update({ hue: next })}
          />
        </Field>
      </FieldGroup>
    </div>
  );
}

/**
 * Twenty-four presets, and the whole circle behind them.
 *
 * The swatches are for choosing a color; the strip is for choosing *that*
 * color, two degrees over. Both write the same single number, and the readout
 * on the right says which it is — or `auto`, when the hue is still the one
 * the project's name hashes to.
 *
 * Dragging the strip repaints the app on every step rather than on release,
 * which is not free: the accent is the project's color, so each degree
 * re-resolves the theme and rewrites ninety custom properties. It is worth
 * it. The thing being chosen is the color of the whole window, and the only
 * honest preview of that is the whole window.
 */
function ColorField({
  hue,
  chosen,
  dark,
  onPick,
}: {
  /** The hue in force, chosen or derived — where the thumb sits. */
  hue: number;
  /** The hue the config pins, or undefined while it is still derived. */
  chosen: number | undefined;
  dark: boolean;
  onPick: (hue: number | undefined) => void;
}) {
  // Rebuilt only when the background changes: a 25-stop gradient string is
  // cheap, but it is a new string every render otherwise, which would make the
  // strip's style prop a fresh object on every keystroke elsewhere in the page.
  const spectrum = useMemo(() => {
    const stops = Array.from({ length: SPECTRUM_STOPS }, (_, step) =>
      projectColorFromHue((step * 360) / (SPECTRUM_STOPS - 1), dark)
    );
    return `linear-gradient(to right, ${stops.join(', ')})`;
  }, [dark]);

  return (
    <div className="flex flex-col gap-3">
      {/* The presets as a fixed twelve-wide grid rather than a wrap, so the
          two rows line up into a block instead of breaking wherever the Auto
          chip happens to leave off. */}
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onPick(undefined)}
          title="Derived from the name"
          className={cn(
            'h-7 cursor-pointer rounded-md px-2 text-[11px] transition-colors',
            chosen === undefined
              ? 'bg-project/25 text-fg'
              : 'text-fg-subtle hover:bg-project/15 hover:text-fg-muted'
          )}
        >
          Auto
        </button>

        <div className="grid grid-cols-12 gap-1.5">
          {HUE_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`Hue ${swatch}`}
              onClick={() => onPick(swatch)}
              style={{ backgroundColor: projectColorFromHue(swatch, dark) }}
              className={cn(
                'flex size-7 cursor-pointer items-center justify-center rounded-md transition-transform hover:scale-110',
                chosen === swatch &&
                  'ring-2 ring-fg ring-offset-2 ring-offset-overlay'
              )}
            >
              {chosen === swatch ? (
                <Check className="size-3.5 text-black/70" />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={359}
          value={hue}
          aria-label="Hue"
          onChange={(event) => onPick(Number(event.target.value))}
          style={{ background: spectrum }}
          className="h-2 w-full cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-focus-ring/50 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-fg [&::-webkit-slider-thumb]:bg-project [&::-webkit-slider-thumb]:shadow-md"
        />
        <span className="w-9 shrink-0 text-right font-mono text-[10px] text-fg-subtle tabular-nums">
          {chosen === undefined ? 'auto' : `${chosen}°`}
        </span>
      </div>
    </div>
  );
}

/**
 * The three fields as one thing, drawn the way the header draws them.
 *
 * Worth the room it takes: the icon, the color and the name only mean
 * anything together, and a person changing one of them is picturing this.
 */
function Preview({
  name,
  color,
  icon,
  path,
}: {
  name: string;
  color: string;
  icon: string;
  path: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-project/15 bg-overlay-elevated p-3">
      <div
        aria-hidden
        style={{ backgroundColor: color }}
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-base font-bold text-shadow-lg"
      >
        {icon}
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold text-fg">{name}</span>
        <span className="truncate text-[11px] text-fg-subtle">{path}</span>
      </div>
    </div>
  );
}
