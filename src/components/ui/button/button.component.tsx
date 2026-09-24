import { BoxRenderable, TextAttributes } from '@opentui/core';
import { useState, type FC } from 'react';
import { theme } from '~/lib/theme';
import type { ButtonProps } from './button.def';
import type { BoxProps } from '@opentui/react';

export default function Button(props: ButtonProps) {
  const { text, onClick, size = 'md', boxProps, color } = props;

  const [isHovered, setIsHovered] = useState(false);

  const getXPadding = () => {
    switch (size) {
      case 'lg':
        return 4;
      case 'md':
        return 2;
      case 'sm':
        return 1;
    }
  };

  const getYPadding = () => {
    switch (size) {
      case 'lg':
        return 1;
      case 'md':
      case 'sm':
        return 0;
    }
  };

  const getBgColor = () => {
    const _col = color || 'grey';
    const defaultColor =
      _col === 'lime' ? theme.colors.lime.main : theme.colors.neutral[800];

    const hoverColor =
      _col === 'lime' ? theme.colors.lime.darker : theme.colors.neutral[700];

    return isHovered ? hoverColor : defaultColor;
  };

  return (
    <box
      paddingX={getXPadding()}
      paddingY={getYPadding()}
      backgroundColor={getBgColor()}
      onMouseOver={() => setIsHovered(true)}
      onMouseOut={() => setIsHovered(false)}
      onMouseDown={onClick}
      {...boxProps}
    >
      <text attributes={TextAttributes.BOLD}>{text}</text>
    </box>
  );
}
