import { useConfigStore } from './config.store';
import { useProjectStore } from '../project';
import {
  loadConfig,
  localConfigPath,
  projectConfigPath,
  userConfigPath,
  writeConfig,
} from './config.service';
import { ConfigScope, type Config, type PartialConfig } from './config.def';
import { useSidebarStore } from '~/components/modules/sidebar/sidebar.store';
import { useCallback } from 'react';
import { useGitStore } from '../git';
import { useThemeSwitcher } from '../theme';

export const useConfig = () => {
  const store = useConfigStore();
  const { load: loadStore } = useConfigStoreUpdater();

  /**
   * Re-reads every layer for the current project and stores the merged result.
   * Reads the project path lazily so it's safe to call the moment the project
   * finishes loading; falls back to `cwd` before then.
   */
  const load = () => {
    const projectPath = useProjectStore.getState().path || process.cwd();
    store.setConfig(loadConfig(projectPath));
    store.setLoaded(true);
  };

  const applyDefaultsToStores = useCallback(() => {
    loadStore(store.config);
  }, [store.config, loadStore]);

  /** Absolute file backing a writable scope, or `null` for `DEFAULT`. */
  const pathForScope = (scope: ConfigScope): string | null => {
    const projectPath = useProjectStore.getState().path || process.cwd();
    switch (scope) {
      case ConfigScope.USER:
        return userConfigPath();
      case ConfigScope.PROJECT:
        return projectConfigPath(projectPath);
      case ConfigScope.LOCAL:
        return localConfigPath(projectPath);
      default:
        return null;
    }
  };

  /**
   * Persists a patch to one layer then reloads so the merged view reflects it.
   * Writing to `ConfigScope.DEFAULT` is rejected — it's the built-in baseline.
   */
  const update = (scope: ConfigScope, patch: PartialConfig) => {
    const filePath = pathForScope(scope);
    if (!filePath) return { ok: false, error: 'That scope is read-only' };

    const result = writeConfig(filePath, patch);
    if (result.ok) load();
    return result;
  };

  return {
    config: store.config,
    loaded: store.loaded,
    load,
    update,
    applyDefaultsToStores,
  };
};

export const useConfigStoreUpdater = () => {
  const { load: loadSidebar } = useConfigSidebarStoreUpdater();
  const { load: loadGitBar } = useConfigGitBarStoreUpdater();
  const { load: loadTheme } = useConfigThemeStoreUpdater();

  const load = useCallback(
    (config: Config) => {
      loadSidebar(config);
      loadGitBar(config);
      loadTheme(config);
    },
    [loadSidebar, loadGitBar, loadTheme]
  );

  return { load };
};

/**
 * Hands the theme store both halves of the picture at once: the definitions
 * config contributes on top of the built-ins, and which name to resolve. They
 * have to arrive together — resolving a name against a theme list that hasn't
 * landed yet would fall back to the default and then flash.
 */
const useConfigThemeStoreUpdater = () => {
  const { load: loadTheme } = useThemeSwitcher();

  const load = (config: Config) => {
    loadTheme(config.themes, config.preferences.theme);
  };

  return { load };
};

const useConfigSidebarStoreUpdater = () => {
  const { setShowIcons, setShowToolbar } = useSidebarStore();

  const load = (config: Config) => {
    setShowIcons(config.preferences.displayIcons);
    setShowToolbar(config.preferences.displayToolbar);
  };

  return { load };
};

const useConfigGitBarStoreUpdater = () => {
  const { expanded, setExpanded } = useGitStore();

  const load = (config: Config) => {
    setExpanded(config.preferences.expandedGitbar);
  };

  return { load };
};
