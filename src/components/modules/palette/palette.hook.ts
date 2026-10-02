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
import { useGit, useGitStore } from '~/lib/git';
import { useGitBranchDialog } from '../git-branch-dialog';

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
  const { getLayout, focusedWindowId, windows, destroy, openTerminal } =
    useWindowManagerStore();
  const { spawn } = useSpawnWindow();
  const { getCoords } = useGetFirstAvailableCoords();
  const { update } = useConfig();

  const gitBarExpanded = useGitStore((s) => s.expanded);
  const setGitBarExpanded = useGitStore((s) => s.setExpanded);
  const { pull, push } = useGit();
  const { openBranchDialog } = useGitBranchDialog();

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
          description: 'Open an empty window in the first free slot',
          shortcut: 'ctrl+shift+n',
          execute: () => {
            spawn(coords.row, coords.col);
          },
        },
        {
          type: 'ACTION',
          id: 'split-horizontal',
          title: 'Split right',
          description: 'Open a new window beside the focused one',
          icon: 'splitHorizontal',
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
          title: 'Split down',
          description: 'Open a new window below the focused one',
          shortcut: 'ctrl+shift+down',
          icon: 'splitVertical',
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
          id: 'new-terminal',
          title: 'New terminal',
          description:
            'Open a shell in a terminal window, spawning one if needed',
          icon: 'terminal',
          shortcut: 'ctrl+t',
          execute: () => {
            openTerminal(focusedWindowId ?? '');
          },
        },
        {
          type: 'ACTION',
          id: 'close-all-windows',
          title: 'Close all windows',
          description: 'Close every editor and terminal at once',
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
          icon: 'document',
          title: 'Open file',
          shortcut: 'ctrl+p',
          description: 'Pick a project file and open it in the focused window',
        },
        {
          type: 'MODULE',
          id: 'search',
          icon: 'search',
          title: 'Search in files',
          shortcut: 'ctrl+shift+f',
          description: 'Find a string or pattern across the project',
        },
      ],
    },
    {
      name: 'Git',
      items: [
        {
          id: 'git-pull',
          type: 'ACTION',
          title: 'Pull',
          description: 'Fetch and merge commits from the remote branch',
          execute: () => {
            pull();
          },
          icon: 'gitPull',
        },
        {
          id: 'git-push',
          type: 'ACTION',
          title: 'Push',
          description: 'Send local commits to the remote branch',
          execute: () => {
            push();
          },
          icon: 'gitPush',
        },
        {
          id: 'git-change-branch',
          type: 'ACTION',
          title: 'Switch branch',
          description: 'Check out another branch in this repository',
          execute: () => {
            openBranchDialog();
          },
          icon: 'gitBranch',
        },
      ],
    },
    {
      name: 'Preferences',
      items: [
        {
          id: 'switch-theme',
          type: 'MODULE',
          icon: 'palette',
          title: 'Switch theme',
          description: 'Preview and pick a color theme',
        },
        {
          id: 'toggle-explorer',
          shortcut: 'ctrl+b',
          type: 'ACTION',
          title: 'Toggle explorer',
          description: 'Show or hide the file tree sidebar',
          execute: () => {
            setExpanded(!expanded);
          },
        },
        {
          id: 'toggle-explorer-icons',
          type: 'ACTION',
          title: 'Toggle explorer icons',
          description: 'Show or hide file type icons in the file tree',
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
          title: 'Toggle explorer toolbar',
          description: 'Show or hide the toolbar above the file tree',
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
          title: 'Toggle git bar details',
          description: 'Spell out the project path and the file counts',
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
          title: 'Quit Frodon',
          description: 'Stop running terminals and leave the IDE',
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
