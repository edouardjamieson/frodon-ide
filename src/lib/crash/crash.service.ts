/**
 * Fatal-error handling for a process that owns the terminal.
 *
 * Frodon runs on the alternate screen with stdin in raw mode, so a crash that
 * skips teardown doesn't just lose the session — it hands the user back a shell
 * with no echo, no prompt, and no cursor. `exitOnCtrlC` is off too, so there
 * isn't even an escape hatch short of killing the process from another window.
 *
 * OpenTUI installs its own `uncaughtException`/`unhandledRejection` listeners,
 * but they only `console.error` and let the process continue. That's worse than
 * Node's default: registering any listener suppresses the default crash-and-
 * exit, so the app stays up in an unknown state and the message goes to the
 * captured console where nothing renders it. We take those listeners over.
 */
import type { CliRenderer } from '@opentui/core';
import Logger from '../logger/logger.service';
import { killAllTerminalProcesses } from '~/components/modules/terminal/terminal.registry';

/** Teardown must not run twice — `destroy()` on a dead renderer can throw. */
let restored = false;

/**
 * Puts the terminal back the way we found it and stops every child process.
 *
 * Safe to call more than once and from inside a crash: each step is guarded, so
 * a failure in one doesn't strand the rest. Mirrors the Quit action, which does
 * the same teardown while the event loop is still alive so that running dev
 * servers aren't orphaned.
 */
export function restoreTerminal(renderer: CliRenderer): void {
  if (restored) return;
  restored = true;

  try {
    killAllTerminalProcesses();
  } catch (error) {
    Logger.log(`crash: killing terminals failed: ${error}`);
  }

  try {
    // Leaves the alternate screen, restores the cursor and stdin, and resets
    // the terminal background.
    renderer.destroy();
  } catch (error) {
    Logger.log(`crash: renderer teardown failed: ${error}`);
  }
}

/** Renders an error the way a CLI would, once the TUI is out of the way. */
function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  return String(error);
}

/**
 * Tears the UI down, reports the error on the restored terminal, and exits
 * non-zero. Writing only after `restoreTerminal` matters: anything printed
 * while the alternate screen is still up disappears with it.
 */
export function reportFatal(renderer: CliRenderer, origin: string, error: unknown): never {
  Logger.log(`crash: ${origin}: ${describe(error)}`);
  restoreTerminal(renderer);

  process.stderr.write(
    `\nFrodon crashed (${origin}).\n\n${describe(error)}\n\n` +
      `The full log is in ./test.log.\n`
  );
  process.exit(1);
}

/**
 * Takes over fatal error handling for the process.
 *
 * `uncaughtException` is fatal: it can fire mid-render, so the renderer's state
 * is no longer trustworthy and continuing risks painting garbage over a session
 * the user can't exit.
 *
 * `unhandledRejection` is deliberately *not* fatal. A rejected promise hasn't
 * touched the render loop, and this is an editor — exiting on a stray rejection
 * would throw away unsaved buffers to fix nothing. It's logged instead, so the
 * bug is visible in ./test.log without costing the user their work.
 */
export function installCrashHandlers(renderer: CliRenderer): void {
  // OpenTUI registered its log-and-continue handlers when the renderer was
  // created. Drop them: leaving them attached means a crash is swallowed before
  // ours can restore the terminal.
  process.removeAllListeners('uncaughtException');
  process.removeAllListeners('unhandledRejection');

  process.on('uncaughtException', (error) => {
    reportFatal(renderer, 'uncaught exception', error);
  });

  process.on('unhandledRejection', (reason) => {
    Logger.log(`crash: unhandled rejection: ${describe(reason)}`);
  });
}
