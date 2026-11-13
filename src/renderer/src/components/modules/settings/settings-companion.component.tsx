import { cn } from 'cn';
import { Ban, Check } from 'lucide-react';
import type { ComponentType } from 'react';
import {
  COMPANIONS,
  COMPANION_FEATURES,
  DEFAULT_COMPANION,
  DEFAULT_COMPANION_FEATURE,
  type CompanionFeature,
  type CompanionKind,
} from '@shared/config.def';
import { Switch } from '~/components/ui';
import { useUserConfig } from '~/lib/config';
import {
  COMPANION_FEATURE_VIEWS,
  COMPANION_SPRITES,
  CompanionFigure,
} from '../companion';
import { Field, FieldGroup } from './settings-field.component';

/**
 * Choosing who sits in the corner of the sidebar, what a right-click on
 * them opens, or sending them away.
 *
 * Each tile is the real sprite, awake — blinking and moving on the same CSS
 * the sidebar runs — rather than a picture of it, so the theme and the
 * project's color are already on it when you choose.
 */

/**
 * The cats first, then everybody else, split where `COMPANIONS` lists the
 * first non-cat. A list of names rather than a flag on the sprite, because
 * which shelf a companion sits on is the picker's business, not the art's.
 */
const FIRST_CREATURE = COMPANIONS.indexOf('alien');
const SHELVES = [
  { label: 'Cats', kinds: COMPANIONS.slice(0, FIRST_CREATURE) },
  { label: 'Others', kinds: COMPANIONS.slice(FIRST_CREATURE) },
];

export default function SettingsCompanion() {
  const { config, update } = useUserConfig();
  const selected = config.companion ?? DEFAULT_COMPANION;
  const shown = !config.hideCompanion;
  const feature = config.companionFeature ?? DEFAULT_COMPANION_FEATURE;

  return (
    <div className="flex flex-col gap-7">
      <FieldGroup>
        <div className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="settings-companion-show"
              className="text-xs font-medium text-fg select-none"
            >
              Show a companion
            </label>
            <p className="text-[11px] text-fg-subtle">
              It sits at the foot of the sidebar, falls asleep when you leave,
              and is pleased when you click it. Right-click it for the feature
              chosen below.
            </p>
          </div>
          <Switch
            id="settings-companion-show"
            checked={shown}
            // Shown is the absent value, so showing it again removes the key
            // rather than writing `false`.
            onCheckedChange={(checked) =>
              update({ hideCompanion: checked ? undefined : true })
            }
          />
        </div>

        {SHELVES.map((shelf) => (
          <Field key={shelf.label} label={shelf.label}>
            <div
              className={cn('grid grid-cols-4 gap-2', {
                'pointer-events-none opacity-40': !shown,
              })}
            >
              {shelf.kinds.map((kind) => (
                <Tile
                  key={kind}
                  kind={kind}
                  selected={kind === selected}
                  // Clearing the field rather than writing the default:
                  // absent means derived, everywhere in this config.
                  onSelect={() =>
                    update({
                      companion: kind === DEFAULT_COMPANION ? undefined : kind,
                    })
                  }
                />
              ))}
            </div>
          </Field>
        ))}
      </FieldGroup>

      <FieldGroup title="Feature">
        <Field
          label="On right-click"
          hint="One at a time, so a right-click goes straight to it. What a feature holds is kept while another is chosen."
        >
          <div
            className={cn('flex flex-col gap-1.5', {
              'pointer-events-none opacity-40': !shown,
            })}
          >
            {COMPANION_FEATURES.map((name) => (
              <FeatureOption
                key={name}
                {...describe(name)}
                selected={name === feature}
                onSelect={() =>
                  update({
                    companionFeature:
                      name === DEFAULT_COMPANION_FEATURE ? undefined : name,
                  })
                }
              />
            ))}
          </div>
        </Field>
      </FieldGroup>
    </div>
  );
}

/**
 * What the option for a feature says. The features describe themselves, so
 * one added there turns up here; `none` is the one that is not a feature
 * and has to be described by the page.
 */
function describe(name: CompanionFeature): {
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
} {
  if (name === 'none')
    return {
      label: 'Nothing',
      description:
        'Only a companion. A right-click does what it does anywhere.',
      icon: Ban,
    };
  return COMPANION_FEATURE_VIEWS[name];
}

function FeatureOption({
  label,
  description,
  icon: Icon,
  selected,
  onSelect,
}: {
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-project/60 bg-project/10'
          : 'border-border hover:bg-row-hover'
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          selected ? 'text-project' : 'text-fg-subtle'
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs font-medium text-fg">{label}</span>
        <span className="text-[11px] text-fg-subtle">{description}</span>
      </span>
      {selected ? (
        <Check className="mt-0.5 size-3.5 shrink-0 text-project" />
      ) : null}
    </button>
  );
}

function Tile({
  kind,
  selected,
  onSelect,
}: {
  kind: CompanionKind;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex cursor-pointer flex-col items-center gap-2 rounded-lg border px-1 pt-3 pb-2 transition-colors',
        selected
          ? 'border-project/60 bg-project/10'
          : 'border-border hover:bg-row-hover'
      )}
    >
      {/* The eyes and mouths are holes in the panel's color, so the tile
          wears it too or the companion would look painted on. */}
      <span className="rounded-md bg-sidebar p-1.5">
        <CompanionFigure kind={kind} mood="awake" />
      </span>
      <span className="text-[11px] text-fg-subtle">
        {COMPANION_SPRITES[kind].label}
      </span>

      {selected ? (
        <Check className="absolute top-1.5 right-1.5 size-3.5 text-project" />
      ) : null}
    </button>
  );
}
