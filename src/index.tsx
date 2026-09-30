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
import ErrorBoundary from './components/ui/error-boundary';
import { installCrashHandlers } from './lib/crash';

function App() {
  const { load, loading, isInit } = useProject();
  const {
    load: loadConfig,
    config,
    loaded,
    applyDefaultsToStores,
  } = useConfig();
  useGitSync();

  // Config resolves first: the project scan filters on `files.exclude`, so
  // reading it afterwards would mean walking `node_modules` anyway. The config
  // layers are keyed to the project root (`.exodia/`), but that root is just
  // `cwd` — finding it doesn't need the tree, only the scan does.
  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    applyDefaultsToStores();
    load();
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

// Must follow renderer creation: that's when OpenTUI attaches the
// log-and-keep-going error listeners this replaces.
installCrashHandlers(renderer);

createRoot(renderer).render(
  <ErrorBoundary fatal label="Exodia hit an unrecoverable error">
    <App />
  </ErrorBoundary>
);
