import { useMemo } from 'react';
import { cn } from 'cn';
import { Check } from 'lucide-react';
import { useThemePreference } from '~/lib/config';
import { resolveTheme, type Theme } from '~/lib/theme';
import { FieldGroup } from './settings-field.component';

/**
 * Picking a theme.
 *
 * Each row is drawn in the theme it offers, which is the only honest way to
 * show one: the swatches are that theme's own background, surface, syntax and
 * foreground, resolved through the same `resolveTheme` the app runs on rather
 * than read off the definition. A theme that says nothing but `extends` still
 * shows the colors it will actually produce.
 *
 * Clicking applies it immediately and writes the choice afterwards — see
 * `useThemePreference`. There is no Apply button because there is nothing to
 * apply: the dialog is already wearing it.
 */
export default function SettingsAppearance() {
  const { theme, themes, select } = useThemePreference();

  // Three definitions today, so this is not about cost — it is about identity.
  // Resolving inside the map would build four new objects per keystroke
  // anywhere else in the dialog.
  const resolved = useMemo(
    () => themes.map((definition) => resolveTheme(definition.name, themes)),
    [themes]
  );

  return (
    <FieldGroup>
      <div className="flex flex-col gap-2">
        {resolved.map((candidate) => (
          <ThemeRow
            key={candidate.name}
            theme={candidate}
            selected={candidate.name === theme.name}
            onSelect={() => select(candidate.name)}
          />
        ))}
      </div>

      <p className="text-[11px] text-fg-subtle">
        Themes reach the whole app as CSS variables — the editor, the terminal
        and the diff colors all come from the one you pick here. A project's own
        color is the exception: it has a hue of its own, and borrows this
        theme's lightness.
      </p>
    </FieldGroup>
  );
}

function ThemeRow({
  theme,
  selected,
  onSelect,
}: {
  theme: Theme;
  selected: boolean;
  onSelect: () => void;
}) {
  // Not the accent: that one is the open project's color now, so it is the
  // same in every row and would say nothing about the theme. What differs
  // between themes is the neutral they sit on and the syntax they paint with.
  const swatches = [
    theme.palette.bgHighlight,
    theme.syntax.keyword,
    theme.syntax.string,
    theme.palette.fg,
  ];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors',
        selected
          ? 'border-project/60 bg-project/10'
          : 'border-border hover:bg-row-hover'
      )}
    >
      {/* Drawn in the candidate's colors, not the active ones — this little
          rectangle is the whole preview. */}
      <span
        aria-hidden
        style={{
          backgroundColor: theme.palette.bg,
          borderColor: theme.palette.border,
        }}
        className="flex size-9 shrink-0 items-center justify-center gap-0.5 rounded-md border"
      >
        {swatches.map((color, index) => (
          <span
            key={index}
            style={{ backgroundColor: color }}
            className="h-4 w-1 rounded-full"
          />
        ))}
      </span>

      <span className="flex min-w-0 flex-col">
        <span className="text-[13px] font-medium text-fg">{theme.name}</span>
        <span className="truncate text-[11px] text-fg-subtle">
          {theme.description}
        </span>
      </span>

      {selected ? (
        <Check className="ml-auto size-4 shrink-0 text-project" />
      ) : null}
    </button>
  );
}
