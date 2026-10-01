import { TextAttributes } from '@opentui/core';
import { useEffect, useRef } from 'react';
import { useUpDownActions } from '~/lib/utils';
import { useTheme, useThemeSwitcher } from '~/lib/theme';
import { ConfigScope, useConfig } from '~/lib/config';
import { usePaletteStore } from '../palette.store';
import {
  CommandPaletteBody,
  CommandPaletteHeader,
} from './templates.component';

/**
 * The theme picker.
 *
 * Moving through the list applies each theme to the running session, so the
 * whole UI recolors under the palette as you arrow — a theme is the one setting
 * where a description is useless and a glance is conclusive. Only Enter writes
 * the choice to the user config; leaving any other way puts back the theme that
 * was active when the picker opened, so a browse costs nothing.
 */
export default function PaletteModuleTheme() {
  const { name: activeName } = useTheme();
  const { themes, apply } = useThemeSwitcher();
  const { update } = useConfig();
  const { close } = usePaletteStore();

  // The theme to fall back to if this picker closes without a choice. Captured
  // once on mount: `activeName` is already moving by the time a preview lands.
  const committed = useRef(activeName);
  const chose = useRef(false);

  const currentIndex = Math.max(
    0,
    themes.findIndex((theme) => theme.name === activeName)
  );

  const { index } = useUpDownActions({
    maxIndex: themes.length,
    onEnter: (i) => {
      const theme = themes[i];
      if (!theme) return;

      chose.current = true;
      apply(theme.name);
      update(ConfigScope.USER, { preferences: { theme: theme.name } });
      close();
    },
  });

  const selected = index ?? currentIndex;

  // Preview whatever is under the cursor.
  useEffect(() => {
    const theme = themes[selected];
    if (theme && theme.name !== activeName) apply(theme.name);
  }, [selected]);

  // Escape, a click on the backdrop, or anything else that unmounts the picker
  // counts as "no thanks" — only Enter commits.
  useEffect(() => {
    return () => {
      if (!chose.current) apply(committed.current);
    };
  }, []);

  return (
    <>
      <CommandPaletteHeader title="Switch theme" icon="palette" />
      <CommandPaletteBody>
        <box gap={0} paddingY={1}>
          {themes.map((theme, i) => (
            <ThemeRow
              key={theme.name}
              name={theme.name}
              description={theme.description}
              selected={selected === i}
              isCommitted={theme.name === committed.current}
            />
          ))}
        </box>
      </CommandPaletteBody>
    </>
  );
}

function ThemeRow({
  name,
  description,
  selected,
  isCommitted,
}: {
  name: string;
  description?: string;
  selected: boolean;
  isCommitted: boolean;
}) {
  const { colors, icons } = useTheme();

  return (
    <box
      flexDirection="row"
      gap={1}
      paddingX={2}
      backgroundColor={selected ? colors.menuItemSelectedBg : undefined}
    >
      <text fg={isCommitted ? colors.fgAccent : colors.fgSubtle}>
        {isCommitted ? icons.disc : ' '}
      </text>
      <text
        fg={selected ? colors.fg : colors.fgMuted}
        attributes={selected ? TextAttributes.BOLD : undefined}
      >
        {name}
      </text>
      {description && (
        <text fg={colors.fgSubtle} attributes={TextAttributes.DIM}>
          {description}
        </text>
      )}
    </box>
  );
}
