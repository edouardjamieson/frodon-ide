import { InputRenderable } from '@opentui/core';
import { useTheme } from '~/lib/theme';
import { usePaletteStore } from './palette.store';
import { usePalette } from './palette.hook';
import { useKeyboard } from '@opentui/react';
import { useEffect, useMemo, useRef } from 'react';
import {
  PaletteModuleHome,
  PaletteModuleOpenFile,
  PaletteModuleSearch,
  PaletteModuleTheme,
} from './modules';

export default function CommandPalette() {
  const { open, close } = usePaletteStore();
  const { activeItem } = usePalette();
  const { colors } = useTheme();
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
      case 'switch-theme':
        return <PaletteModuleTheme />;
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
        backgroundColor={colors.scrim}
        position="absolute"
        top={0}
        left={0}
        onMouseDown={onCancel}
      />

      {/* Body */}
      <box
        backgroundColor={colors.overlayBg}
        border
        borderColor={colors.border}
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
