import { useThemeEffect } from '~/lib/theme';
import { useAppInfoEffect } from '~/lib/app';
import {
  useProject,
  useProjectColorEffect,
  useProjectSync,
} from '~/lib/project';
import { useGitSync } from '~/lib/git';
import { useBoardAutosaveEffect } from '~/lib/board';
import { Header, Sidebar, Welcome } from '~/components/modules/workbench';
import WindowManager from '~/components/modules/window';
import Backdrop from './components/ui/backdrop';

/**
 * The shell. The effects that must be mounted exactly once live here:
 * `useThemeEffect` (writes theme variables to `:root`), `useAppInfoEffect`
 * (fetches the host facts main holds, once), `useProjectSync` and
 * `useGitSync` (subscribe to the tree and the repository main pushes),
 * `useProjectColorEffect` (publishes the project's color as a CSS variable)
 * and `useBoardAutosaveEffect` (writes dirty boards after a quiet moment).
 * Mounting any of them twice would double the work on every change — and for
 * the autosave in particular, race two writes to the same file.
 */
export default function App() {
  useThemeEffect();
  useAppInfoEffect();
  useProjectSync();
  useGitSync();
  useProjectColorEffect();
  useBoardAutosaveEffect();

  const { isOpen, open } = useProject();

  if (!isOpen) return <Welcome onOpen={() => void open()} />;

  return (
    <div className="relative isolate flex h-full flex-col bg-app">
      <Backdrop />
      <Header />
      <div className="flex min-h-0 w-full flex-grow gap-2 px-2 pb-2">
        <Sidebar />
        <WindowManager />
      </div>
    </div>
  );
}
