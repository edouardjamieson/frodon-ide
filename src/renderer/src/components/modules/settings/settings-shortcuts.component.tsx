import { KeyboardKeys } from '~/components/ui';
import { COMMAND_LABELS, DEFAULT_KEYBINDINGS } from '~/lib/keybinding';
import { FieldGroup } from './settings-field.component';

/**
 * Every chord the app listens for, read off the one table that decides them.
 *
 * `DEFAULT_KEYBINDINGS` is already written the way a config file will hand
 * bindings over — a chord string and a command name — so this page is a
 * rendering of the live registry and not a list maintained alongside it. A
 * binding added there appears here; one that is removed stops appearing. That
 * is the whole reason it can be read-only and still be true.
 *
 * Rebinding waits on the config layer (`docs/migration.md`), which is also
 * what will make `~/.frodon/config.json` the file this page writes rather
 * than the one it reads around.
 */
export default function SettingsShortcuts() {
  return (
    <FieldGroup>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
        {DEFAULT_KEYBINDINGS.map((binding) => (
          <div
            key={binding.chord}
            className="flex items-center justify-between gap-4 px-3 py-2"
          >
            <span className="min-w-0 truncate text-[13px] text-fg-muted">
              {COMMAND_LABELS[binding.command]}
            </span>
            <KeyboardKeys
              vals={binding.chord
                .split('+')
                .map((key) => ({ val: key, isMod: key === 'mod' }))}
            />
          </div>
        ))}
      </div>

      <p className="text-[11px] text-fg-subtle">
        These cannot be changed yet. The registry already reads chords as
        strings so that a config file can replace this table — until it lands,
        the table is the only source. One chord is missing on purpose:
        Electron&apos;s menu owns an accelerator before the page sees it, so
        anything the menu binds has to be given up there first.
      </p>
    </FieldGroup>
  );
}
