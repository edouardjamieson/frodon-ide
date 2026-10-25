/**
 * Reading the two config files into the store, and the rule for when one is
 * worth writing back.
 *
 * The project half is shaped exactly like `lib/layout`'s, and for the same
 * reason: it is a per-project file that has to be in place before the first
 * frame of that project is drawn. So it is fetched and applied inside
 * `openPath` — a step of opening a project, not an effect reacting to one —
 * which is what keeps the header from showing a folder name for a moment on
 * its way to the chosen one.
 *
 * The user half is simpler and lands earlier: it is read once at the app
 * shell, before any project, because the launcher is already wearing the
 * theme it names.
 */
import { useConfigStore } from './config.store';
import type { ProjectConfig, UserConfig } from '@shared/config.def';

/**
 * Whether two configs say the same thing.
 *
 * Key-wise over the union, which is all these shapes ever are: a handful of
 * optional primitives, and one list of strings. Written generically so that
 * adding a field does not quietly stop being compared — a comparison that
 * lists its fields by hand is a comparison that goes out of date in silence,
 * and the cost of that here is a setting that never reaches the disk.
 *
 * Arrays are compared by their contents, one level deep. `exclude` is
 * rebuilt as a new array on every edit, so comparing it by identity would
 * call every save a change; and nothing here nests deeper than that.
 */
export function sameConfig<T extends object>(a: T, b: T): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of keys) {
    const left: unknown = a[key as keyof T];
    const right: unknown = b[key as keyof T];
    if (left === right) continue;
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    if (left.some((value, index) => value !== right[index])) return false;
  }

  return true;
}

/**
 * The open project's settings, as main holds them.
 *
 * Fetched rather than applied, because the caller commits it in the same tick
 * as the tree. A failure is `{}` — the same answer as a project that has
 * chosen nothing — since a window that cannot read a config file still has a
 * project to draw.
 */
export async function fetchProjectConfig(): Promise<ProjectConfig> {
  try {
    return await window.frodon.config.project();
  } catch (error) {
    console.error('config: could not read the project settings', error);
    return {};
  }
}

export async function fetchUserConfig(): Promise<UserConfig> {
  try {
    return await window.frodon.config.user();
  } catch (error) {
    console.error('config: could not read your settings', error);
    return {};
  }
}

/* -------------------------------------------------------------------------
 * What the save subscription needs to know
 *
 * Module-level for the three reasons `lib/layout` gives: a restore is not a
 * change worth writing back, the project a pending write belongs to can stop
 * being the open one, and both have to survive the double mount React does in
 * development.
 * ---------------------------------------------------------------------- */

let openRoot: string | null = null;
let savedProject: ProjectConfig | null = null;
let savedUser: UserConfig | null = null;

/**
 * Puts a project's settings in the store and marks that project as the one
 * the dialog is now editing.
 *
 * Until this has been called nothing about a project is saved at all, which
 * is what stops the launcher — a page with an empty config store and no
 * project behind it — from writing a config file for a project nobody opened.
 */
export function applyProjectConfig(root: string, config: ProjectConfig): void {
  openRoot = root;
  savedProject = config;
  useConfigStore.getState().setProjectConfig(config);
}

export function applyUserConfig(config: UserConfig): void {
  savedUser = config;
  useConfigStore.getState().setUserConfig(config);
}

/** Which project a pending write would belong to, if any. */
export function configRoot(): string | null {
  return openRoot;
}

/**
 * Hands the two "last written" snapshots to the save subscription, and takes
 * the new one back when a write goes out.
 *
 * Exported as a pair of accessors rather than as the variables themselves,
 * because a module export is a binding and a consumer that imported
 * `savedProject` directly would be reading whatever it was at import time.
 */
export function lastSaved(): {
  project: ProjectConfig | null;
  user: UserConfig | null;
} {
  return { project: savedProject, user: savedUser };
}

export function markSaved(config: {
  project?: ProjectConfig;
  user?: UserConfig;
}): void {
  if (config.project) savedProject = config.project;
  if (config.user) savedUser = config.user;
}
