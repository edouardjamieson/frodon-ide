import { useMemo } from 'react';
import { usePaletteStore } from '../palette/palette.store';
import { useSidebarStore } from './sidebar.store';
import type { IconName } from '~/lib/theme';

export const useSidebar = () => {
  const SIDEBAR_CONTEXT_SWITCHER_WIDTH = 5;
  const SIDEBAR_CONTEXT_VIEW_WIDTH = 30;

  const { setOpen, setActiveModule } = usePaletteStore();
  const {
    expanded,
    setExpanded,
    setShowIcons,
    setShowToolbar,
    showIcons,
    showToolbar,
  } = useSidebarStore();

  const SIDEBAR_WIDTH = useMemo(() => {
    let w = 0;

    if (expanded) w += SIDEBAR_CONTEXT_VIEW_WIDTH;
    if (showToolbar) w += SIDEBAR_CONTEXT_SWITCHER_WIDTH;
    return w;
  }, [expanded, showToolbar]);

  const contextSidebarItems: {
    icon: IconName;
    id: string;
    name: string;
    shortcut: string;
    onClick: () => void;
  }[] = [
    {
      icon: 'commands',
      id: 'commands',
      name: 'Command palette',
      shortcut: 'CTRL + k',
      onClick: () => {
        setOpen(true);
      },
    },
    {
      icon: 'search',
      id: 'search',
      name: 'Search',
      shortcut: 'CTRL + f',
      onClick: () => {
        setOpen(true, 'search');
      },
    },
    {
      icon: 'document',
      id: 'open-file',
      name: 'Open file',
      shortcut: 'CTRL + p',
      onClick: () => {
        setOpen(true, 'open-file');
      },
    },
  ];

  return {
    SIDEBAR_WIDTH,
    SIDEBAR_CONTEXT_SWITCHER_WIDTH,
    SIDEBAR_CONTEXT_VIEW_WIDTH,
    contextSidebarItems,
    expanded,
    setExpanded,
    showIcons,
    setShowIcons,
    showToolbar,
    setShowToolbar,
  };
};
