import { useEffect } from 'react';
import { useAppStore } from './app.store';
import type { AppInfo } from '@shared/ipc.def';

/** Host facts, or null until `useAppInfoEffect` has fetched them. */
export const useAppInfo = (): AppInfo | null =>
  useAppStore((state) => state.info);

/**
 * The user's home directory, or `''` before it has arrived.
 *
 * Empty string rather than null because every caller wants to compare a path
 * prefix against it, and `''` is a prefix of everything — so the guard has to
 * be written once, in `shortenPath`, instead of at each call site.
 */
export const useHome = (): string =>
  useAppStore((state) => state.info?.home ?? '');

/**
 * Fetches the host facts main holds — platform, versions, home directory.
 * These never change for the life of the process, so this runs once. Mount it
 * ONCE near the app root.
 */
export const useAppInfoEffect = (): void => {
  const setInfo = useAppStore((state) => state.setInfo);

  useEffect(() => {
    let cancelled = false;
    void window.frodon.app
      .info()
      .then((info) => {
        if (!cancelled) setInfo(info);
      })
      .catch((error: unknown) => console.error('app: info failed', error));

    // The window can close mid-flight; React would warn about the set either
    // way, and a stale response has nothing worth storing.
    return () => {
      cancelled = true;
    };
  }, [setInfo]);
};
