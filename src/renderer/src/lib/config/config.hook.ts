/**
 * Reading the config files in, and writing them back out after they settle.
 *
 * Two halves mounted differently, exactly as `lib/layout` splits them.
 * Restoring is a step — `useUserConfigEffect` at the shell for the person's
 * settings, `applyProjectConfig` inside `openPath` for the project's.
 * Saving is one subscription, mounted once, because what it watches is a
 * single store that every window on the page shares.
 */
import { useCallback, useEffect } from 'react';
import { useThemeSwitcher } from '~/lib/theme';
import { useConfigStore } from './config.store';
import {
  applyUserConfig,
  configRoot,
  fetchUserConfig,
  lastSaved,
  markSaved,
  sameConfig,
} from './config.service';
import { CONFIG_SAVE_MS } from './config.constant';

/**
 * Reads this machine's settings and puts them on, once. Mount this ONCE near
 * the app root.
 *
 * It applies the theme itself rather than leaving that to whoever renders
 * next, because the theme is the one preference that is visible before
 * anything is clicked: the launcher is already wearing it. Everything else in
 * here is read when a dialog opens.
 */
export const useUserConfigEffect = (): void => {
  const { apply } = useThemeSwitcher();

  useEffect(() => {
    let cancelled = false;

    void fetchUserConfig().then((config) => {
      // The window can close mid-flight, and a stale answer has nothing worth
      // applying.
      if (cancelled) return;

      applyUserConfig(config);
      // An unknown name resolves to the default, so a theme that was
      // uninstalled — or misspelled by hand — costs a default theme and not
      // an unstyled app. The name is left in the file either way: it is the
      // person's choice, and deleting it because we could not honour it
      // today would lose it for the day the theme comes back.
      if (config.theme) apply(config.theme);
    });

    return () => {
      cancelled = true;
    };
  }, [apply]);
};

/**
 * Writes either config down after it stops changing. Mount this ONCE near the
 * app root.
 *
 * One subscription for the two files, with one timer each, because they fail
 * independently: a home directory that cannot be written to must not stop a
 * project from recording its own name. The guards are the layout's —
 * a change is dropped if the project it belonged to is no longer the open
 * one, and a flush that would write what is already on disk writes nothing.
 */
export const useConfigSaveEffect = (): void => {
  useEffect(() => {
    let projectTimer: ReturnType<typeof setTimeout> | null = null;
    let userTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingRoot: string | null = null;

    const { setSaveError } = useConfigStore.getState();

    const report = (result: { ok: boolean; error?: string }) => {
      setSaveError(result.ok ? null : (result.error ?? 'Could not save.'));
    };

    const flushProject = () => {
      projectTimer = null;
      const root = pendingRoot;
      pendingRoot = null;

      // Another project opened while the timer ran. The change belonged to a
      // project that is no longer open, and `config:save-project` writes into
      // whichever one is — so writing now would put one project's name in
      // another project's file.
      if (!root || root !== configRoot()) return;

      const config = useConfigStore.getState().project;
      const saved = lastSaved().project;
      if (saved && sameConfig(saved, config)) return;
      markSaved({ project: config });

      void window.frodon.config
        .saveProject(config)
        .then(report)
        .catch((error: unknown) => {
          console.error('config: saving the project settings failed', error);
          setSaveError('Could not save the project settings.');
        });
    };

    const flushUser = () => {
      userTimer = null;

      const config = useConfigStore.getState().user;
      const saved = lastSaved().user;
      if (saved && sameConfig(saved, config)) return;
      markSaved({ user: config });

      void window.frodon.config
        .saveUser(config)
        .then(report)
        .catch((error: unknown) => {
          console.error('config: saving your settings failed', error);
          setSaveError('Could not save your settings.');
        });
    };

    const unsubscribe = useConfigStore.subscribe((state, previous) => {
      if (state.project !== previous.project) {
        // No project open: the launcher is on screen, and there is nothing a
        // project config would belong to.
        const root = configRoot();
        if (root) {
          pendingRoot = root;
          if (projectTimer) clearTimeout(projectTimer);
          projectTimer = setTimeout(flushProject, CONFIG_SAVE_MS);
        }
      }

      if (state.user !== previous.user) {
        if (userTimer) clearTimeout(userTimer);
        userTimer = setTimeout(flushUser, CONFIG_SAVE_MS);
      }
    });

    return () => {
      unsubscribe();
      if (projectTimer) clearTimeout(projectTimer);
      if (userTimer) clearTimeout(userTimer);
      // A reload during the countdown would otherwise lose the setting that
      // was waiting on it. Whether the call lands before the page goes is not
      // something the renderer can promise — but the alternative is not
      // trying.
      flushProject();
      flushUser();
    };
  }, []);
};

/** The open project's settings, and the way to change one field of them. */
export const useProjectConfig = () => {
  const config = useConfigStore((state) => state.project);
  const update = useConfigStore((state) => state.updateProjectConfig);

  return { config, update };
};

/** This machine's settings, same deal. */
export const useUserConfig = () => {
  const config = useConfigStore((state) => state.user);
  const update = useConfigStore((state) => state.updateUserConfig);

  return { config, update };
};

/** Whatever the last write said, for a dialog to show. */
export const useConfigSaveError = (): string | null =>
  useConfigStore((state) => state.saveError);

/**
 * Choosing a theme, as opposed to applying one.
 *
 * `useThemeSwitcher` deliberately only touches the running session — that is
 * what lets a picker preview themes without leaving a trail of half-chosen
 * ones in a file — so the two steps are joined here, in the module that owns
 * the file. Applying first means the change is on screen before the write is
 * even scheduled.
 */
export const useThemePreference = () => {
  const { theme, themes, apply } = useThemeSwitcher();
  const update = useConfigStore((state) => state.updateUserConfig);

  const select = useCallback(
    (name: string) => {
      apply(name);
      update({ theme: name });
    },
    [apply, update]
  );

  return { theme, themes, select };
};
