import type { AppInfo } from '@shared/ipc.def';

export interface AppStore {
  /**
   * Host facts fetched from main, or null until that first call resolves.
   *
   * Null rather than a guessed default: a component that shortens a path
   * before `home` has arrived should show the full path for one frame, not a
   * path shortened against the wrong prefix.
   */
  info: AppInfo | null;
  setInfo: (info: AppInfo) => void;
}
