import { useShortcut } from '~/lib/utils';
import { usePaletteStore } from './palette.store';
import { useKeyboard, useRenderer } from '@opentui/react';
import { useMemo } from 'react';
import type { PaletteGroup, PaletteItem } from './palette.def';
import { useSidebarStore } from '../sidebar/sidebar.store';
import { useWindowManagerStore } from '~/lib/window/window.store';
import {
  useGetFirstAvailableCoords,
  useSpawnWindow,
} from '~/lib/window/window.hook';
import { ConfigScope, useConfig } from '~/lib/config';
import { killAllTerminalProcesses } from '../terminal/terminal.registry';
import { useGitStore } from '~/lib/git';

export const usePalette = () => {
  const { open, setOpen, activeModule, setActiveModule, setSearch } =
    usePaletteStore();

  const { items } = usePaletteItems();
  const itemsFlat = useMemo(
    () => items.flatMap((group) => group.items),
    [items]
  );

  const getItem = (id: string) => itemsFlat.find((item) => item.id === id);

  const allShortcuts = useMemo(() => {
    return itemsFlat.reduce(
      (acc, item) => {
        if (item.shortcut) acc[item.shortcut] = item.id;
        return acc;
      },
      {} as Record<string, string>
    );
  }, [itemsFlat]);

  const activeItem = useMemo(
    () => getItem(activeModule),
    [activeModule, getItem]
  );

  useShortcut('ctrl+k', () => {
    if (!open) {
      setActiveModule('home');
      setOpen(true);
    }
  });

  // Handle shortcuts. A shortcut like `ctrl+shift+f` is matched by its
  // modifiers plus its final key, so `ctrl+f` and `ctrl+shift+f` stay distinct.
  useKeyboard((key) => {
    for (const [shortcut, id] of Object.entries(allShortcuts)) {
      const parts = shortcut.split('+');
      const keyName = parts[parts.length - 1];
      const needsShift = parts.includes('shift');

      if (key.ctrl && key.shift === needsShift && key.name === keyName) {
        const item = getItem(id);
        if (!item) return;

        if (item.type === 'MODULE') {
          setOpen(true);
          setActiveModule(item.id);
          setSearch('');
        } else if (item.type === 'ACTION' && item.execute) {
          setOpen(false);
          item.execute();
        }
        return;
      }
    }
  });

  return {
    items,
    activeItem,
  };
};

export const usePaletteItems = () => {
  const { setOpen } = usePaletteStore();
  const {
    setExpanded,
    expanded,
    setShowIcons,
    setShowToolbar,
    showIcons,
    showToolbar,
  } = useSidebarStore();
  const { getLayout, focusedWindowId, windows, destroy } =
    useWindowManagerStore();
  const { spawn } = useSpawnWindow();
  const { getCoords } = useGetFirstAvailableCoords();
  const { update } = useConfig();

  const gitBarExpanded = useGitStore((s) => s.expanded);
  const setGitBarExpanded = useGitStore((s) => s.setExpanded);

  const focusedWindow = windows.find((window) => window.id === focusedWindowId);
  const layout = getLayout(windows);
  const coords = getCoords(layout);

  const renderer = useRenderer();

  const items: PaletteGroup[] = [
    {
      name: 'Windows',
      items: [
        {
          type: 'ACTION',
          id: 'new-window',
          title: 'New window',
          description: 'Create a new window',
          shortcut: 'ctrl+shift+n',
          execute: () => {
            spawn(coords.row, coords.col);
          },
        },
        {
          type: 'ACTION',
          id: 'split-horizontal',
          title: 'New horizontal window',
          description: 'Split focused window horizontally',
          icon: '][',
          shortcut: 'ctrl+shift+right',
          execute: () => {
            if (!focusedWindow) {
              spawn(coords.row, coords.col);
              return;
            }

            const spawned = spawn(
              focusedWindow.rowIndex,
              layout[focusedWindow.rowIndex]!
            );
            if (!spawned) {
              spawn(coords.row, coords.col);
            }
          },
        },
        {
          type: 'ACTION',
          id: 'split-vertical',
          title: 'New vertical window',
          description: 'Split focused window vertically',
          shortcut: 'ctrl+shift+down',
          icon: '=',
          execute: () => {
            if (!focusedWindow) {
              spawn(coords.row, coords.col);
              return;
            }

            const spawned = spawn(layout.length, 0);
            if (!spawned) {
              spawn(coords.row, coords.col);
            }
          },
        },
        {
          type: 'ACTION',
          id: 'close-all-windows',
          title: 'Close all windows',
          description: 'Close all windows',
          shortcut: 'ctrl+shift+x',
          execute: () => {
            windows.forEach((window) => {
              destroy(window.id);
            });
          },
        },
      ],
    },
    {
      name: 'Editor',
      items: [
        {
          type: 'MODULE',
          id: 'open-file',
          icon: '📄',
          title: 'Open a file',
          shortcut: 'ctrl+p',
          description: 'Open a file from your project in the focused window',
        },
        {
          type: 'MODULE',
          id: 'search',
          icon: '🔍',
          title: 'Search',
          shortcut: 'ctrl+shift+f',
          description:
            'Search through files and directories for a string or pattern',
        },
      ],
    },
    {
      name: 'Git',
      items: [
        {
          id: 'git-pull',
          type: 'ACTION',
          title: 'Git pull',
          execute: () => {
            console.log('Git pull');
          },
          icon: '⏬️',
        },
        {
          id: 'git-push',
          type: 'ACTION',
          title: 'Git push',
          execute: () => {
            console.log('Git push');
          },
          icon: '⏫️',
        },
        {
          id: 'git-change-branch',
          type: 'MODULE',
          title: 'Switch branch',
          execute: () => {
            console.log('Git change branch');
          },
          icon: '🪾',
        },
      ],
    },
    {
      name: 'Preferences',
      items: [
        {
          id: 'toggle-explorer',
          shortcut: 'ctrl+b',
          type: 'ACTION',
          title: 'Toggle explorer',
          description: 'Expands or hides the explorer sidebar',
          execute: () => {
            setExpanded(!expanded);
          },
        },
        {
          id: 'toggle-explorer-icons',
          type: 'ACTION',
          title: 'Toggle explorer icons',
          description: 'Display or not the icons in the file explorer',
          execute: () => {
            setShowIcons(!showIcons);
            update(ConfigScope.USER, {
              preferences: { displayIcons: !showIcons },
            });
          },
        },
        {
          id: 'toggle-explorer-toolbar',
          type: 'ACTION',
          title: 'Toggle sidebar toolbar',
          description: 'Display or not the toolbar in the explorer sidebar',
          execute: () => {
            setShowToolbar(!showToolbar);
            update(ConfigScope.USER, {
              preferences: { displayToolbar: !showToolbar },
            });
          },
        },
        {
          id: 'toggle-expanded-git-bar',
          type: 'ACTION',
          title: 'Expand git bar',
          description: 'Shows more information in the git bar',
          execute: () => {
            setGitBarExpanded(!gitBarExpanded);
            update(ConfigScope.USER, {
              preferences: { expandedGitbar: !gitBarExpanded },
            });
          },
        },
      ],
    },
    {
      name: 'Other',
      items: [
        {
          id: 'quit',
          type: 'ACTION',
          title: 'Quit Exodia',
          shortcut: 'ctrl+shift+q',
          execute: () => {
            // Tear down terminal process trees while the event loop is still
            // alive; process.exit() alone would orphan running dev servers.
            killAllTerminalProcesses();
            renderer.destroy();
            process.exit(0);
          },
        },
      ],
    },
  ];

  const executeAction = (item: PaletteItem) => {
    item.execute?.();
    setOpen(false);
  };

  return { items, executeAction };
};
