import { useThemeEffect } from '~/lib/theme';
import { useAppInfoEffect } from '~/lib/app';
import {
  useProject,
  useProjectColorEffect,
  useProjectSync,
} from '~/lib/project';
import { Header, Sidebar, Welcome } from '~/components/workbench';
import Backdrop from '~/components/backdrop';

/**
 * The shell. The effects that must be mounted exactly once live here:
 * `useThemeEffect` (writes theme variables to `:root`), `useAppInfoEffect`
 * (fetches the host facts main holds, once), `useProjectSync` (subscribes to
 * tree pushes from main), and `useProjectColorEffect` (publishes the
 * project's color as a CSS variable). Mounting any of them twice would double
 * the work on every change.
 */
export default function App() {
  useThemeEffect();
  useAppInfoEffect();
  useProjectSync();
  useProjectColorEffect();

  const { isOpen, open } = useProject();

  if (!isOpen) return <Welcome onOpen={() => void open()} />;

  return (
    <div className="relative isolate flex h-full flex-col bg-app">
      <Backdrop />
      <Header />
      <div className="w-full flex-grow flex gap-2 px-2 pb-2">
        <Sidebar />
      </div>
      {/* <Editor /> */}
      {/* <StatusBar /> */}
    </div>
  );
}
