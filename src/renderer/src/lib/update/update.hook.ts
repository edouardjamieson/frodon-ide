import { useEffect } from 'react';
import { useUpdateStore } from './update.store';

/**
 * The version a restart would put in place, or null when there is none.
 *
 * The one fact the UI draws. Downloading and failing are main's business and
 * the log's: a button that appears only when pressing it does something is
 * worth more than a progress bar for a download nobody asked for.
 */
export const useReadyUpdate = (): string | null =>
  useUpdateStore((store) =>
    store.state.kind === 'ready' ? store.state.version : null
  );

/** Quits into the new version. The window is gone a moment later. */
export const installUpdate = (): void => void window.frodon.update.install();

/**
 * Replicates main's updater state: asks once, then listens. Asking matters —
 * a window opened after the download finished would otherwise not learn of it
 * until the next check, half an hour away. Mount it ONCE near the app root.
 */
export const useUpdateSync = (): void => {
  const setState = useUpdateStore((store) => store.setState);

  useEffect(() => window.frodon.update.onChanged(setState), [setState]);

  useEffect(() => {
    let cancelled = false;
    void window.frodon.update
      .state()
      .then((state) => {
        if (!cancelled) setState(state);
      })
      .catch((error: unknown) => console.error('update: state failed', error));

    return () => {
      cancelled = true;
    };
  }, [setState]);
};
