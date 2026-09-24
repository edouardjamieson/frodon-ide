import { useKeyboard } from '@opentui/react';
import { useEffect, useRef, useState, type Ref } from 'react';
import Logger from '../logger/logger.service';
import type { BoxRenderable, ScrollBoxRenderable } from '@opentui/core';

export const useShortcut = (shortcut: `ctrl+${string}`, cb: () => void) => {
  const triggerKey = shortcut.split('+')[1];

  useKeyboard((key) => {
    if (!triggerKey) return;
    if (key.ctrl && key.name === triggerKey) cb();
  });
};

export const useUpDownActions = ({
  maxIndex,
  onEnter,
}: {
  onEnter?: (index: number) => void;
  maxIndex?: number;
}) => {
  const [index, setIndex] = useState<number | null>(null);

  useKeyboard((key) => {
    if (key.name === 'down') {
      setIndex((prev) => {
        if (prev === null) return 0;
        if (maxIndex && prev < maxIndex - 1) {
          return prev + 1;
        }
        return prev;
      });
    }
    if (key.name === 'up') {
      setIndex((prev) => {
        if (prev === null) return 0;
        if (prev > 0) return prev - 1;
        return prev;
      });
    }
    if (key.name === 'return') {
      onEnter?.(index ?? 0);
    }
  });

  return {
    index,
  };
};

export const useAutoScroll = (
  cursorY: number,
  ref: ScrollBoxRenderable | null
) => {
  useEffect(() => {
    if (!ref) return;

    const viewportH = ref.viewport.height;
    if (viewportH > 0) {
      if (cursorY < ref.scrollTop) {
        ref.scrollTop = cursorY;
      } else if (cursorY >= ref.scrollTop + viewportH)
        ref.scrollTop = cursorY - viewportH + 1;
    }
  }, [cursorY]);
};
