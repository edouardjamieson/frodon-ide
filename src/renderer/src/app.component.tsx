import { useThemeEffect } from '~/lib/theme';
import { useAppInfoEffect } from '~/lib/app';
import {
  useInitialProjectEffect,
  useProject,
  useProjectColorEffect,
  useProjectSync,
} from '~/lib/project';
import { useGitSync } from '~/lib/git';
import { useFileWatchSync } from '~/lib/file-watch';
import { useLayoutSaveEffect } from '~/lib/layout';
import { useBoardAutosaveEffect } from '~/lib/board';
import { useBookmarkSyncEffect } from '~/lib/bookmark';
import { useRecentFilesEffect } from '~/lib/file-picker';
import { useConfigSaveEffect, useUserConfigEffect } from '~/lib/config';
import { useKeybindingEffect } from '~/lib/keybinding';
import { useUpdateSync } from '~/lib/update';
import { Header, Sidebar, Welcome } from '~/components/modules/workbench';
import WindowManager from '~/components/modules/window';
import FilePicker from '~/components/modules/file-picker';
import Settings from '~/components/modules/settings';
import Backdrop from './components/ui/backdrop';

/**
 * The shell. The effects that must be mounted exactly once live here:
 * `useThemeEffect` (writes theme variables to `:root`), `useAppInfoEffect`
 * (fetches the host facts main holds, once), `useProjectSync` and
 * `useGitSync` (subscribe to the tree and the repository main pushes),
 * `useFileWatchSync` (tells main which files are open, and hears back when
 * one of them changes outside Frodon),
 * `useProjectColorEffect` (publishes the project's color as a CSS variable)
 * `useBoardAutosaveEffect` (writes dirty boards after a quiet moment),
 * `useBookmarkSyncEffect` (reads both bookmark files, once for the whole
 * workbench rather than once per browser tile),
 * `useLayoutSaveEffect` (remembers how the workbench is arranged, so the
 * project opens tomorrow the way it was left today),
 * `useRecentFilesEffect` (records what was last looked at, for the picker),
 * `useUserConfigEffect` (reads this machine's settings and puts the chosen
 * theme on, before the launcher draws),
 * `useConfigSaveEffect` (writes a changed setting down once it settles),
 * `useUpdateSync` (hears from main when a new version is ready to restart
 * into) and `useKeybindingEffect` (the one keydown listener the whole app
 * shares).
 * Mounting any of them twice would double the work on every change — and for
 * the autosave in particular, race two writes to the same file.
 */
export default function App() {
  useThemeEffect();
  useAppInfoEffect();
  useProjectSync();
  useInitialProjectEffect();
  useGitSync();
  useFileWatchSync();
  useProjectColorEffect();
  useBoardAutosaveEffect();
  useBookmarkSyncEffect();
  useLayoutSaveEffect();
  useRecentFilesEffect();
  useUserConfigEffect();
  useConfigSaveEffect();
  useUpdateSync();
  useKeybindingEffect();

  const { isOpen, open } = useProject();

  // The launcher gets the dialog too, minus the project half of it: a theme
  // and a bug report are no less real on a screen with no project behind
  // them, and `mod+,` is listened for here either way.
  if (!isOpen) {
    return (
      <>
        <Welcome onOpen={() => void open()} />
      </>
    );
  }

  return (
    <div className="relative isolate flex h-full flex-col bg-app">
      <Backdrop />
      <Header />
      <div className="flex min-h-0 w-full flex-grow gap-2 px-2 pb-2">
        <Sidebar />
        <WindowManager />
      </div>
      {/* Above everything, drawn only when they are open. */}
      <FilePicker />
      <Settings />
    </div>
  );
}
