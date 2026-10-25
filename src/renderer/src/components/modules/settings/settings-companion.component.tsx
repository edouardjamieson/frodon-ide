import { cn } from 'cn';
import { Check } from 'lucide-react';
import {
  COMPANIONS,
  DEFAULT_COMPANION,
  type CompanionKind,
} from '@shared/config.def';
import { Switch } from '~/components/ui';
import { useUserConfig } from '~/lib/config';
import { COMPANION_SPRITES, CompanionFigure } from '../companion';
import { Field, FieldGroup } from './settings-field.component';

/**
 * Choosing who sits in the corner of the sidebar, or sending them away.
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
              It sits in the bottom corner of the sidebar, falls asleep when you
              leave, and is pleased when you click it.
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
    </div>
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
