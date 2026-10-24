/**
 * Updates: a newer Frodon, found, fetched and waiting for a restart.
 *
 * Main does all of it — the check, the download, the swap — and the renderer
 * learns one fact: whether there is a version ready to restart into. Every
 * window shows the same answer, because there is one app bundle on disk and
 * it is replaced for all of them at once.
 */

/**
 * Where the updater is.
 *
 * There is no `checking` state on purpose. A check runs every half hour and
 * almost always finds nothing, and a state the UI never draws would cost a
 * push to every window twice an hour for no pixel.
 */
export type UpdateState =
  /** Up to date, as of the last check — or not checked yet. */
  | { kind: 'idle' }
  /** A newer version exists and its zip is coming down. */
  | { kind: 'downloading'; version: string }
  /** Unpacked beside the app and verified. A restart puts it in place. */
  | { kind: 'ready'; version: string }
  /**
   * This copy cannot replace itself: a development build, a platform with no
   * updater yet, or a bundle macOS is running from a read-only translocated
   * path. `reason` is a sentence for a person, not a code.
   */
  | { kind: 'unsupported'; reason: string }
  /** The last check failed. It is tried again on the next one. */
  | { kind: 'error'; message: string };
