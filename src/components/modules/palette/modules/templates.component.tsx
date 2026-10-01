import {
  ScrollBoxRenderable,
  TextAttributes,
  type InputRenderable,
} from '@opentui/core';
import { useEffect, useRef, type ReactNode, type Ref } from 'react';
import { useTheme, useScrollbarOptions, type IconName } from '~/lib/theme';
import Icon from '~/components/ui/icon';
import type { PaletteItem } from '../palette.def';
import { usePaletteStore } from '../palette.store';

export function CommandPaletteHeader({
  icon,
  title,
}: {
  icon?: IconName;
  title: string;
}) {
  const { colors } = useTheme();

  return (
    <box
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      border={['bottom']}
      borderColor={colors.border}
    >
      {/*
        Centring is applied to this inner row as a whole rather than to the icon
        and the title separately. Two centred siblings each land on their own
        fractional offset, and flooring them independently swallows the gap
        whenever the combined width is odd -- which is how a title one character
        shorter ends up with its icon glued to it.
      */}
      <box flexDirection="row" alignItems="center" gap={1}>
        {icon && <Icon name={icon} color={colors.fgAccent} />}
        <text fg={colors.fg}>{title}</text>
      </box>
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
  const { colors } = useTheme();
  const searchRef = useRef<InputRenderable>(null);

  useEffect(() => {
    !disableAutofocus && searchRef.current?.focus();
  }, [disableAutofocus]);

  return (
    <box border={['bottom']} borderColor={colors.border} paddingX={2}>
      <input
        ref={searchRef}
        value={search}
        onInput={(v) => setSearch(v)}
        placeholder={placeholder ?? 'Search...'}
        backgroundColor={colors.inputBg}
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
  const scrollbarOptions = useScrollbarOptions();

  return (
    <scrollbox
      scrollY
      ref={ref}
      focusable={false}
      maxHeight={20}
      paddingX={1}
      scrollbarOptions={scrollbarOptions}
    >
      {children}
    </scrollbox>
  );
}

export function CommandPaletteMenuItem({
  item,
  selected,
  onClick,
}: {
  item: PaletteItem;
  selected?: boolean;
  onClick?: () => void;
}) {
  const { colors } = useTheme();

  return (
    <box
      backgroundColor={selected ? colors.menuItemSelectedBg : colors.menuItemBg}
      paddingY={1}
      paddingX={2}
      marginBottom={1}
      onMouseDown={() => onClick?.()}
    >
      <box flexDirection="row" gap={1} alignItems="center">
        {item.icon && (
          <Icon
            name={item.icon}
            color={selected ? colors.fgAccent : colors.fgMuted}
          />
        )}
        <text fg={colors.fg}>{item.title}</text>
        {item.shortcut && (
          <text
            fg={colors.fgMuted}
            attributes={TextAttributes.DIM}
            bg={colors.inputBg}
          >
            {item.shortcut}
          </text>
        )}
      </box>
      {item.description && <text fg={colors.fgSubtle}>{item.description}</text>}
    </box>
  );
}
