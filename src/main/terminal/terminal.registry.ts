/**
 * Killing a shell and everything it started.
 *
 * Ported from the TUI's `terminal.registry.ts`, because the lesson it encodes
 * survives the move to node-pty unchanged: `IPty.kill()` is
 * `process.kill(pid, 'SIGHUP')` on the shell alone. The `npm run dev` it
 * launched, the watcher that launched, the dev server that launched — none of
 * them are signalled, and all of them keep running after the tab is gone.
 *
 * The shell is spawned through `forkpty`, which makes it a session leader, so
 * its process *group* is its own pid, and signalling the negative pid reaches
 * the shell plus anything running in the foreground — in one syscall, with no
 * subprocess, which is what makes it usable from a teardown handler.
 *
 * It is not enough on its own, though, and this is where the TUI's version of
 * this file was quietly wrong. Its shells had no controlling terminal, so job
 * control was off and *everything* stayed in the shell's group. Here the
 * shell gets a real tty, turns job control on, and puts every background job
 * in a process group of its own — so `sleep 600 &` survives a kill aimed at
 * the shell's group. Walking the real parent→child tree with `pgrep` is what
 * actually reaches it. Verified by leaking one.
 */
import { execFileSync } from 'node:child_process';
import { createLogger } from '@main/logger';

const log = createLogger('terminal');

/** Windows has no process groups and no `pgrep`; `kill()` is all there is. */
const POSIX = process.platform !== 'win32';

/** `process.kill`, tolerating a target that has already exited. */
function signal(pid: number, sig: NodeJS.Signals): void {
  try {
    process.kill(pid, sig);
  } catch (error) {
    // ESRCH only means it is already gone. Anything else is logged and
    // swallowed, so one stuck pid can't block the teardown of the rest.
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ESRCH') log.error(`kill ${pid} failed`, error);
  }
}

/** Children of `pid`, deepest first, by walking `pgrep -P`. */
function descendants(pid: number): number[] {
  const found: number[] = [];

  const walk = (parent: number): void => {
    let out: string;
    try {
      out = execFileSync('pgrep', ['-P', String(parent)], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      // `pgrep` exits non-zero when there are no children, and may not be
      // spawnable at all during teardown. Both mean: stop walking.
      return;
    }

    for (const line of out.split('\n')) {
      const child = Number(line.trim());
      if (Number.isInteger(child) && child > 0) {
        walk(child);
        found.push(child);
      }
    }
  };

  walk(pid);
  return found;
}

/**
 * Signals a shell and everything it spawned.
 *
 * @param walkTree whether to also walk the real parent→child tree. Off during
 *   app teardown, where spawning `pgrep` is not dependable and the group kill
 *   above has already done the work.
 */
export function killTree(
  pid: number,
  sig: NodeJS.Signals,
  walkTree = true
): void {
  if (!POSIX) {
    signal(pid, sig);
    return;
  }

  // Collected *before* anything is signalled. Kill the shell first and its
  // children are reparented to init within the same breath, so `pgrep -P
  // <shell>` comes back empty and a backgrounded job outlives the app. This
  // ordering is the whole fix; the first version had it the other way round
  // and leaked a `sleep` on every quit.
  const children = walkTree ? descendants(pid) : [];

  signal(-pid, sig);
  for (const child of children) signal(child, sig);
  signal(pid, sig);
}
