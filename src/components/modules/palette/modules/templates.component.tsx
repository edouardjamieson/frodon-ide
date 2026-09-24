import {
  ScrollBoxRenderable,
  TextAttributes,
  type InputRenderable,
} from '@opentui/core';
import { useEffect, useRef, type ReactNode, type Ref } from 'react';
import { theme } from '~/lib/theme';
import type { PaletteItem } from '../palette.def';
import { usePaletteStore } from '../palette.store';

export function CommandPaletteHeader({
  icon,
  title,
}: {
  icon?: string;
  title: string;
}) {
  return (
    <box
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      border={['bottom']}
      borderColor={theme.colors.neutral[700]}
    >
      <text>
        {icon} {title}
      </text>
    </box>
  );
}

export function CommandPaletteSearch({
  disableAutofocus,
  placeholder,
}: {
  placeholder?: string;
  disableAutofocus?: boolean;
}) {
  const { search, setSearch } = usePaletteStore();
  const searchRef = useRef<InputRenderable>(null);

  useEffect(() => {
    !disableAutofocus && searchRef.current?.focus();
  }, [disableAutofocus]);

  return (
    <box
      border={['bottom']}
      borderColor={theme.colors.neutral[700]}
      paddingX={2}
    >
      <input
        ref={searchRef}
        value={search}
        onInput={(v) => setSearch(v)}
        placeholder={placeholder ?? 'Search...'}
        backgroundColor={theme.colors.neutral[700]}
      />
    </box>
  );
}

export function CommandPaletteBody({
  children,
  ref,
}: {
  children: ReactNode;
  ref?: Ref<ScrollBoxRenderable>;
}) {
  return (
    <scrollbox scrollY ref={ref} focusable={false} maxHeight={20} paddingX={1}>
      {children}
    </scrollbox>
  );
}

export function CommandPaletteMenuItem({
  item,
  selected,
}: {
  item: PaletteItem;
  selected?: boolean;
}) {
  return (
    <box
      backgroundColor={theme.colors.neutral[selected ? 700 : 800]}
      paddingY={1}
      paddingX={2}
      marginBottom={1}
    >
      <box flexDirection="row" gap={1} alignItems="center">
        {item.icon && <text>{item.icon}</text>}
        <text>{item.title}</text>
        {item.shortcut && (
          <text attributes={TextAttributes.DIM} bg={theme.colors.neutral[700]}>
            {item.shortcut}
          </text>
        )}
      </box>
      {item.description && (
        <text fg={theme.colors.neutral[600]}>{item.description}</text>
      )}
    </box>
  );
}
