import { InputRenderable, RGBA, TextAttributes } from '@opentui/core';
import { theme } from '~/lib/theme';
import type { PaletteItem, PaletteModuleProps } from './palette.def';
import { usePaletteStore } from './palette.store';
import { usePalette } from './palette.hook';
import { useKeyboard } from '@opentui/react';
import { useEffect, useMemo, useRef } from 'react';
import { useProject } from '~/lib/project';
import type { File } from '~/lib/fs/fs.def';
import { useUpDownActions } from '~/lib/utils';
import { useWindowManagerStore } from '~/lib/window/window.store';
import { WindowType } from '~/lib/window';
import Logger from '~/lib/logger/logger.service';
import {
  PaletteModuleHome,
  PaletteModuleOpenFile,
  PaletteModuleSearch,
} from './modules';

export default function CommandPalette() {
  const { open, close } = usePaletteStore();
  const { activeItem } = usePalette();
  const searchRef = useRef<InputRenderable>(null);

  useKeyboard((key) => {
    if (key.name === 'escape') close();
  });

  const onCancel = () => {
    close();
  };

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const ActiveModule = useMemo(() => {
    if (!activeItem) return <PaletteModuleHome />;

    switch (activeItem.id) {
      case 'open-file':
        return <PaletteModuleOpenFile />;
      case 'search':
        return <PaletteModuleSearch />;
      default:
        break;
    }
  }, [activeItem]);

  if (!open) return null;

  return (
    <box
      width={'100%'}
      height={'100%'}
      justifyContent="center"
      alignItems="center"
      position="absolute"
      top={0}
      left={0}
      zIndex={1000}
    >
      {/* Back drop */}
      <box
        width={'100%'}
        height={'100%'}
        backgroundColor={RGBA.fromValues(0, 0, 0, 0.5)}
        position="absolute"
        top={0}
        left={0}
        onMouseDown={onCancel}
      />

      {/* Body */}
      <box
        backgroundColor={theme.colors.neutral[900]}
        border
        borderColor={theme.colors.neutral[700]}
        width={100}
      >
        {ActiveModule}
      </box>
    </box>
  );
}

// function ModuleMenu(props: PaletteModuleProps) {
//   const { setActiveModule } = usePaletteStore();
//   const { index } = useUpDownActions({
//     maxIndex: props.item.children?.length ?? 0,
//     onEnter: (index) => {
//       const child = props.item.children?.[index];
//       if (child?.type === 'MENU' || child?.type === 'MODULE') {
//         setActiveModule(child.id);
//       }
//       // TODO : invoke action
//     },
//   });

//   return (
//     <>
//       {props.item.children?.map((item, i) => (
//         <CommandPaletteMenuItem item={item} selected={index === i} />
//       ))}
//     </>
//   );
// }
