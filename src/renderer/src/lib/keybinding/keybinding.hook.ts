import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAppInfo } from '~/lib/app';
import { useEditorStore } from '~/lib/editor';
import { useFilePickerStore } from '~/lib/file-picker';
import { useSidebarStore, type SidebarModule } from '~/lib/sidebar';
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
  const requestSave = useEditorStore((state) => state.requestSave);
  const requestFind = useEditorStore((state) => state.requestFind);
  const setModule = useSidebarStore((state) => state.setModule);
  const toggleCollapsed = useSidebarStore((state) => state.toggleCollapsed);

  /**
   * Shows a sidebar module, opening the panel if it was hidden. What all three
   * of the `mod+shift` sidebar chords do.
   *
   * It only ever shows. Pressing the chord for the module already on screen
   * leaves it there rather than collapsing the panel, because `mod+b` is how
   * the panel goes away and a key with two meanings is a key you have to look
   * at the screen to use. The rail buttons do toggle — a click on the thing
   * you are already looking at has nothing else it could mean.
   */
  const showModule = useCallback(
    (module: SidebarModule) => {
      setModule(module);
      // Asking for a module while the sidebar is collapsed means asking for
      // the sidebar too. Reading `collapsed` through the store rather than
      // subscribing to it keeps this command out of the re-render path of
      // every drag of the sidebar's edge.
      if (useSidebarStore.getState().collapsed) toggleCollapsed();
    },
    [setModule, toggleCollapsed]
  );

  /**
   * Asks the focused window to write its tab out.
   *
   * Only an editor has anything to write, and the type is read through
   * `getState` rather than subscribed to — a command that re-ran every time a
   * pane changed shape would rebuild this table for nothing. An unaddressed
   * request would also sit on the store forever, since no editor would ever
   * come along to consume it.
   */
  const save = useCallback(() => {
    const { windows } = useWindowStore.getState();
    const focused = windows.find((window) => window.id === focusedId);
    // A window with no tab open has nothing to write, and the request would
    // sit on the store until a file *was* opened there — and then save it the
    // instant it appeared.
    if (focused?.type === 'editor' && focused.activeFile) {
      requestSave(focusedId);
    }
  }, [focusedId, requestSave]);

  /**
   * Asks the focused window to open its find bar.
   *
   * Guarded exactly as `save` is, and for the second of its two reasons: a
   * request addressed to a terminal would sit on the store until an editor
   * came along, and then open a find bar in a window nobody asked about. The
   * chord does nothing in a shell, which is the right answer — there is
   * nothing in one to search.
   */
  const findInFile = useCallback(() => {
    const { windows } = useWindowStore.getState();
    const focused = windows.find((window) => window.id === focusedId);
    if (focused?.type === 'editor' && focused.activeFile) {
      requestFind(focusedId);
    }
  }, [focusedId, requestFind]);

  return useMemo(
    () => ({
      'file.save': save,
      'editor.find': findInFile,
      'tab.close': () => closeActiveTab(focusedId),
      'picker.open': () => openPicker(),
      'sidebar.toggle': () => toggleCollapsed(),
      'sidebar.explorer': () => showModule('EXPLORER'),
      'sidebar.search': () => showModule('SEARCH'),
      'sidebar.boards': () => showModule('BOARDS'),
      'git.open': () => openGit(),
      // A no-op when the grid is full in that direction, which is `split`'s
      // own answer and not something a shortcut should second-guess.
      'window.splitRight': () => split(focusedId, 'right'),
      'window.splitDown': () => split(focusedId, 'down'),
    }),
    [
      save,
      findInFile,
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
