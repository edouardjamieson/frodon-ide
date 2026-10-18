import { cn } from 'cn';
import { Check } from 'lucide-react';
import { APP_ICONS, DEFAULT_APP_ICON, type AppIcon } from '@shared/config.def';
import { iconGradientCss } from '@shared/icon.def';
import { useUserConfig } from '~/lib/config';
import { useProjectIdentity, useProject } from '~/lib/project';
import { Field } from './settings-field.component';

/**
 * Picking the icon the app wears in the Dock.
 *
 * Nine tiles: eight that were drawn, and one that is generated from the open
 * project's hue — so the app sitting in the Dock is the color of the project
 * you are in, and changes when you open another.
 *
 * The eight are shown as small copies written by `scripts/build-icons.mjs`
 * into `public/assets/icons/`. The ninth cannot be, because it does not exist
 * until there is a project: it is drawn here as CSS from the same two OKLCH
 * stops main paints the real tile with, which is why those stops live in
 * `@shared/icon.def` rather than in main.
 *
 * The `./` on those image paths is load-bearing. The production renderer is
 * opened with `loadFile`, so an absolute `/assets/…` resolves against the
 * filesystem root — and the swatches would be missing in a packaged build
 * only, which is the worst place to find out.
 */

/** What each one is called on screen. Exhaustive, so a new key must be named. */
const LABELS: Record<AppIcon, string> = {
  auto: 'Project',
  silk: 'Silk',
  ember: 'Ember',
  holo: 'Holo',
  acid: 'Acid',
  dune: 'Dune',
  mint: 'Mint',
  matrix: 'Matrix',
  orchid: 'Orchid',
};

export function AppIconField() {
  const { config, update } = useUserConfig();
  const { hue } = useProjectIdentity();
  const { isOpen } = useProject();

  const selected = config.appIcon ?? DEFAULT_APP_ICON;

  return (
    <Field
      label="App icon"
      hint={
        <>
          Changes the icon in the Dock. The one in Finder is fixed when the app
          is built and cannot follow this.
        </>
      }
    >
      <div className="grid grid-cols-5 gap-2">
        {APP_ICONS.map((icon) => (
          <button
            key={icon}
            type="button"
            // Clearing the field rather than writing `auto` into it: absent
            // means derived, everywhere in this config, and a default written
            // out is a default that can never change.
            onClick={() =>
              update({ appIcon: icon === DEFAULT_APP_ICON ? undefined : icon })
            }
            className={cn(
              'group flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors',
              icon === selected
                ? 'border-project/60 bg-project/10'
                : 'border-border hover:bg-row-hover'
            )}
          >
            <span className="relative block size-10">
              {icon === 'auto' ? (
                // The same two layers main composites, in the same order: the
                // sweep, clipped to the silhouette, with the mark over it. The
                // insets are Apple's icon grid as fractions — 100 of padding
                // and a 22.5% corner, on a 1024 canvas — so this tile lines up
                // with the eight beside it, which carry that padding in their
                // pixels.
                <>
                  <span
                    aria-hidden
                    style={{
                      // No project open is a grey tile, not an invented hue —
                      // the same answer the accent family gives on the launcher.
                      backgroundImage: iconGradientCss(isOpen ? hue : null),
                    }}
                    className="absolute inset-[9.8%] rounded-[22.5%]"
                  />
                  <img
                    src="./assets/icons/mark.png"
                    alt=""
                    className="absolute inset-0 size-full"
                  />
                </>
              ) : (
                <img
                  src={`./assets/icons/${icon}.png`}
                  alt=""
                  className="block size-full"
                />
              )}

              {icon === selected ? (
                <Check className="absolute -right-1 -bottom-1 size-4 rounded-full bg-bg text-project" />
              ) : null}
            </span>

            <span className="text-[11px] text-fg-subtle">{LABELS[icon]}</span>
          </button>
        ))}
      </div>
    </Field>
  );
}
