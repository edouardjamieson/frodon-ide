import { TextAttributes } from '@opentui/core';
import { useState } from 'react';
import { useTheme } from '~/lib/theme';
import type { ButtonProps } from './button.def';

export default function Button(props: ButtonProps) {
  const { text, onClick, size = 'md', boxProps, color } = props;

  const { colors } = useTheme();
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

  // `lime` is the accent variant -- it keeps its historical name in the props
  // so call sites don't have to care that the color itself is now themed.
  const isAccent = color === 'lime';

  const getBgColor = () => {
    if (isAccent)
      return isHovered ? colors.buttonAccentHoverBg : colors.buttonAccentBg;
    return isHovered ? colors.buttonHoverBg : colors.buttonBg;
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
      <text
        fg={isAccent ? colors.buttonAccentFg : colors.buttonFg}
        attributes={TextAttributes.BOLD}
      >
        {text}
      </text>
    </box>
  );
}
