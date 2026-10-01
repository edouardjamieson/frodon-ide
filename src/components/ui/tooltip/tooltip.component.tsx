import type { TooltipProps } from './tooltip.def';
import { useEffect, useRef } from 'react';
import { useTooltipStore } from './tooltip.store';
import { TextAttributes, type BoxRenderable } from '@opentui/core';
import { useTheme } from '~/lib/theme';

export default function Tooltip(props: TooltipProps) {
  const { title, children, align, shortcut, disabled } = props;
  const { setTooltip, destroy } = useTooltipStore();
  const boxRef = useRef<BoxRenderable>(null);

  const getTooltipPosition = () => {
    if (!boxRef.current) return;

    const bw = boxRef.current.width;
    const bh = boxRef.current.height;

    const bx = boxRef.current.x;
    const by = boxRef.current.y;

    const ttW = (title?.length ?? 0) + (shortcut ? shortcut.length + 1 : 0) + 2;

    let x: number;
    let y: number;

    const _align = align ?? 'bottom';

    switch (_align) {
      case 'top':
        y = by - 3;
        x = bx + bw / 2 - ttW / 2;
        break;
      case 'bottom':
        y = by + bh;
        x = bx + bw / 2 - ttW / 2;
        break;
      case 'right':
        x = bx + bw;
        y = by + bh / 2 - 2;
        break;
      case 'left':
        x = bx - ttW;
        y = by + bh / 2 - 1;
        break;
    }

    return { x, y };
  };

  const onMouseOver = () => {
    const position = getTooltipPosition();
    if (!position || disabled) return;
    setTooltip({
      x: position.x,
      y: position.y,
      title,
      align: align ?? 'bottom',
      shortcut,
    });
  };

  const onMouseOut = () => {
    destroy();
  };

  useEffect(() => {
    return () => destroy();
  }, []);

  return (
    <box ref={boxRef} onMouseOver={onMouseOver} onMouseOut={onMouseOut}>
      {children}
    </box>
  );
}

export function TooltipManager() {
  const { tooltip } = useTooltipStore();
  const { colors } = useTheme();

  if (!tooltip) return null;
  const { x, y, title, shortcut } = tooltip;

  return (
    <box
      position="absolute"
      left={x}
      top={y}
      zIndex={10}
      focusable={false}
      backgroundColor={colors.tooltipBg}
      border
      borderColor={colors.tooltipBorder}
      flexDirection="row"
      gap={1}
    >
      <text fg={colors.fg}>{title}</text>
      {shortcut && (
        <text fg={colors.fgSubtle} attributes={TextAttributes.DIM}>
          {shortcut}
        </text>
      )}
    </box>
  );
}
