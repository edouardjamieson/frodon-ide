import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAppInfo } from '~/lib/app';
import { useFilePickerStore } from '~/lib/file-picker';
import { useSidebarStore } from '~/lib/sidebar';
import { useWindowStore } from '~/lib/window';
import { chordOfEvent, commandFor } from './keybinding.service';
import type { CommandId } from './keybinding.def';

/**
 * What each command actually does.
 *
 * One table, built from the stores, so that the thing a key runs and the thing
 * a palette will run are the same thing. Nothing here reaches into a
 * component: every command is a call into a store, which is what makes them
 * runnable from a key, a menu item, or a search field without caring which.
 */
export function useCommands(): Record<CommandId, () => void> {
  const focusedId = useWindowStore((state) => state.focusedId);
  const closeActiveTab = useWindowStore((state) => state.closeActiveTab);
  const split = useWindowStore((state) => state.split);
  const openGit = useWindowStore((state) => state.openGit);
  const openPicker = useFilePickerStore((state) => state.openPicker);
  const setModule = useSidebarStore((state) => state.setModule);
  const toggleCollapsed = useSidebarStore((state) => state.toggleCollapsed);

  /** Shows a sidebar module, opening the panel if it was hidden. */
  const showModule = useCallback(
    (module: 'EXPLORER' | 'SEARCH' | 'BOARDS') => {
      setModule(module);
      // Asking for search while the sidebar is collapsed means asking for the
      // sidebar too. Reading `collapsed` through the store rather than
      // subscribing to it keeps this command out of the re-render path of
      // every drag of the sidebar's edge.
      if (useSidebarStore.getState().collapsed) toggleCollapsed();
    },
    [setModule, toggleCollapsed]
  );

  return useMemo(
    () => ({
      'tab.close': () => closeActiveTab(focusedId),
      'picker.open': () => openPicker(),
      'sidebar.toggle': () => toggleCollapsed(),
      'sidebar.search': () => showModule('SEARCH'),
      'git.open': () => openGit(),
      // A no-op when the grid is full in that direction, which is `split`'s
      // own answer and not something a shortcut should second-guess.
      'window.splitRight': () => split(focusedId, 'right'),
      'window.splitDown': () => split(focusedId, 'down'),
    }),
    [
      closeActiveTab,
      focusedId,
      openPicker,
      toggleCollapsed,
      showModule,
      openGit,
      split,
    ]
  );
}

/**
 * Listens for chords and runs what they are bound to. Mount this ONCE near the
 * app root.
 *
 * On `window`, in the **capture** phase, which is the only placement that
 * works: a global binding has to be seen before anything in the page can
 * swallow it, and two things in this app swallow keys for a living — xterm,
 * which forwards them to a shell, and CodeMirror, which has a keymap of its
 * own. Capture means the registry decides first and the page sees the key only
 * when nothing claimed it.
 *
 * Nothing is listened for in main. A global shortcut registered there fires
 * even when the app is in the background, which is right for a media key and
 * wrong for "close tab". The one chord main *had* to give up is Cmd+W, and it
 * gave it up by not putting it in the menu — see `main/app/menu.service.ts`.
 */
export const useKeybindingEffect = (): void => {
  const commands = useCommands();
  const platform = useAppInfo()?.platform;
  const mac = platform === 'darwin';

  // The listener is attached once per platform rather than once per command
  // table, which changes identity whenever a window is focused or opened.
  // Reading the current table through a ref keeps the two apart.
  const commandsRef = useRef(commands);
  useEffect(() => {
    commandsRef.current = commands;
  }, [commands]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Holding a chord down should not run it forty times. Every command
      // here is discrete — nothing is bound to a key worth repeating.
      if (event.repeat) return;

      const chord = chordOfEvent(event, mac);
      if (!chord) return;

      const command = commandFor(chord);
      if (!command) return;

      // Only once something has claimed the chord: an unclaimed key must
      // reach the editor underneath untouched.
      event.preventDefault();
      event.stopPropagation();
      commandsRef.current[command]();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [mac]);
};
