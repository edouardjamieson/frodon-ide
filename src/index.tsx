import { createCliRenderer, TextAttributes } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { TooltipManager } from './components/ui/tooltip/tooltip.component';
import Dialogs from './components/ui/dialog';
import CommandPalette from './components/modules/palette';
import { useProject } from './lib/project';
import { useConfig } from './lib/config';
import { useEffect } from 'react';
import { useGitSync } from './lib/git';
import Loader from './components/ui/loader';
import AsciiAnimation, {
  EXODIA_LOGO_ANIMATION,
} from './components/ui/ascii-animation';
import { theme } from './lib/theme';
import Sidebar from './components/modules/sidebar';
import WindowsManager from './components/modules/window';
import GitStatusBar from './components/modules/git-bar';
import GitBranchDialog from './components/modules/git-branch-dialog';
import Logger from './lib/logger/logger.service';

function App() {
  const { load, loading, isInit } = useProject();
  const {
    load: loadConfig,
    config,
    loaded,
    applyDefaultsToStores,
  } = useConfig();
  useGitSync();

  useEffect(() => {
    load();
  }, []);

  // Resolve the layered config once the project path is known — it's keyed to
  // the project root (`.exodia/`), so it has to wait for the project to load.
  useEffect(() => {
    if (isInit) loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInit]);

  useEffect(() => {
    if (loaded) {
      applyDefaultsToStores();
    }
  }, [loaded]);

  if (loading || !isInit)
    return (
      <box
        alignItems="center"
        justifyContent="center"
        flexGrow={1}
        backgroundColor={'#000'}
      >
        <box justifyContent="center" alignItems="center" gap={1}>
          <AsciiAnimation animation={EXODIA_LOGO_ANIMATION} />
          <box flexDirection="row" alignItems="center" gap={2}>
            <Loader />
            <text attributes={TextAttributes.DIM}>Opening project</text>
          </box>
        </box>
      </box>
    );

  if (!loading && isInit) {
    return (
      <>
        <box flexGrow={1}>
          <box
            flexGrow={1}
            flexDirection="row"
            backgroundColor={theme.colors.neutral[900]}
          >
            <Sidebar />
            <WindowsManager />
          </box>
          <GitStatusBar />
        </box>
        <TooltipManager />
        <GitBranchDialog />
        <Dialogs />
        <CommandPalette />
      </>
    );
  }

  return null;
}

// Ctrl+C must reach the focused embedded terminal (forwarded to the PTY as
// \x03 → SIGINT to the running command), not tear down the whole TUI. The
// renderer's default exitOnCtrlC intercepts the key before any renderable sees
// it, so disable it and quit the app through another binding instead.
const renderer = await createCliRenderer({ exitOnCtrlC: false });
createRoot(renderer).render(<App />);
