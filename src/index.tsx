import { createCliRenderer, TextAttributes } from '@opentui/core';
import { createRoot, useRenderer } from '@opentui/react';
import { TooltipManager } from './components/ui/tooltip/tooltip.component';
import Dialogs from './components/ui/dialog';
import CommandPalette from './components/modules/palette';
import { useProject } from './lib/project';
import { loadConfig as readConfigLayers, useConfig } from './lib/config';
import { useEffect, useMemo } from 'react';
import { useGitSync } from './lib/git';
import Loader from './components/ui/loader';
import AsciiAnimation, {
  frodonLogoAnimation,
} from './components/ui/ascii-animation';
import {
  collectThemes,
  resolveTheme,
  useTheme,
  useThemeStore,
} from './lib/theme';
import Sidebar from './components/modules/sidebar';
import WindowsManager from './components/modules/window';
import GitStatusBar from './components/modules/git-bar';
import GitBranchDialog from './components/modules/git-branch-dialog';
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
  const { colors } = useTheme();
  const renderer = useRenderer();
  useGitSync();

  const logo = useMemo(() => frodonLogoAnimation(colors), [colors]);

  // The renderer paints its own background wherever no renderable covers the
  // screen -- the gaps around the window grid, most visibly. It isn't part of
  // the React tree, so switching themes has to tell it directly or those gaps
  // keep the previous theme's color.
  useEffect(() => {
    renderer.setBackgroundColor(colors.appBg);
  }, [renderer, colors.appBg]);

  // Config resolves first: the project scan filters on `files.exclude`, so
  // reading it afterwards would mean walking `node_modules` anyway. The config
  // layers are keyed to the project root (`.frodon/`), but that root is just
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
        backgroundColor={colors.appBg}
      >
        <box justifyContent="center" alignItems="center" gap={1}>
          <AsciiAnimation animation={logo} />
          <box flexDirection="row" alignItems="center" gap={2}>
            <Loader />
            <text fg={colors.fgMuted} attributes={TextAttributes.DIM}>
              Opening project
            </text>
          </box>
        </box>
      </box>
    );

  if (!loading && isInit) {
    return (
      <>
        <box flexGrow={1}>
          <box flexGrow={1} flexDirection="row" backgroundColor={colors.appBg}>
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

// Resolve the theme before the first frame rather than in a React effect.
// `createCliRenderer` paints its background the moment it's created, and the
// config layers are three small synchronous reads away -- without this, anyone
// not on the default theme watches the default's background for the handful of
// frames it takes the project to load. `App` re-applies the same values once
// config has been read through the usual path; that pass is a no-op.
const startupConfig = readConfigLayers(process.cwd());
const startupThemes = collectThemes(startupConfig.themes);
const startupTheme = resolveTheme(
  startupConfig.preferences.theme,
  startupThemes
);
useThemeStore.setState({ theme: startupTheme, available: startupThemes });

// Ctrl+C must reach the focused embedded terminal (forwarded to the PTY as
// \x03 → SIGINT to the running command), not tear down the whole TUI. The
// renderer's default exitOnCtrlC intercepts the key before any renderable sees
// it, so disable it and quit the app through another binding instead.
const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  backgroundColor: startupTheme.colors.appBg,
});

// Must follow renderer creation: that's when OpenTUI attaches the
// log-and-keep-going error listeners this replaces.
installCrashHandlers(renderer);

createRoot(renderer).render(
  <ErrorBoundary fatal label="Frodon hit an unrecoverable error">
    <App />
  </ErrorBoundary>
);
