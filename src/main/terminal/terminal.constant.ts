/**
 * The shell to spawn, and the arguments that make it behave like one.
 *
 * `-il` — login *and* interactive — is what gets a prompt, a `PATH` built by
 * the user's profile, and their aliases. Without `-l` the shell inherits
 * Electron's environment, which on macOS is the one launchd handed the app
 * bundle: a `PATH` of `/usr/bin:/bin:/usr/sbin:/sbin` and nothing a developer
 * has installed since.
 */
export const DEFAULT_SHELL =
  process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh';

export const SHELL_ARGS = process.platform === 'win32' ? [] : ['-il'];

/**
 * How long output is allowed to pool before it is sent.
 *
 * A PTY emits in small bursts — `ls` of a large directory is hundreds of
 * writes — and each IPC message costs a structured clone and a wake-up on the
 * other side. Eight milliseconds is under half a frame at 60Hz, so nothing is
 * visibly late, and a noisy build log collapses from thousands of messages a
 * second to about a hundred.
 */
export const FLUSH_MS = 8;

/**
 * Flush early once this much has pooled, so a `cat` of something huge streams
 * instead of arriving in one enormous clone.
 */
export const MAX_BATCH = 64 * 1024;

/** Seed size, immediately corrected by the renderer's own measurement. */
export const DEFAULT_COLS = 80;
export const DEFAULT_ROWS = 24;
