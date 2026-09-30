import Logger from '~/lib/logger/logger.service';

/**
 * Tracks the shell spawned for each terminal window so its *entire* process
 * tree can be torn down — both when the window/tab closes and when Frodon
 * itself quits.
 *
 * Killing only the shell isn't enough: long-running commands it launched (a
 * `npm run dev`, a file watcher) survive as orphans. The shell is spawned
 * attached to a PTY, which makes it a session/process-group leader (pgid ===
 * pid), and in practice everything it runs stays in that group — so signalling
 * the *group* (`process.kill(-pid)`) reaches the shell, npm, next-server and
 * their children in one syscall. That matters most on app teardown: it needs no
 * subprocess, so it works from an 'exit' handler where spawning `pgrep` is
 * unreliable. As a fallback (e.g. should job control ever split a job into its
 * own group) we also walk the real parent→child tree with `pgrep`.
 */

const shellPids = new Set<number>();

/** Collect a pid's descendants (deepest first) by walking `pgrep -P`. */
function descendants(pid: number): number[] {
  const found: number[] = [];
  const walk = (parent: number) => {
    let out = '';
    try {
      out = Bun.spawnSync(['pgrep', '-P', String(parent)]).stdout.toString();
    } catch {
      return; // pgrep unavailable / not spawnable (e.g. during exit).
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

/** `process.kill`, tolerating a target that has already exited. */
function signal(pid: number, sig: NodeJS.Signals) {
  try {
    process.kill(pid, sig);
  } catch (error) {
    // ESRCH just means the process/group already exited; anything else we log
    // but swallow so one stuck pid can't block teardown of the rest.
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ESRCH') Logger.log(`terminal: kill ${pid} failed: ${error}`);
  }
}

/** Signal a shell and everything it spawned. */
function killTree(pid: number, sig: NodeJS.Signals) {
  // Primary path: signal the shell's whole process group in one syscall. Works
  // even during process exit, where spawning `pgrep` below may not.
  signal(-pid, sig);
  // Fallback: walk the real tree in case anything escaped the group. Only
  // effective while the event loop is alive (tab/window close).
  for (const child of descendants(pid)) signal(child, sig);
  signal(pid, sig);
}

export function registerTerminalProcess(pid: number) {
  shellPids.add(pid);
  installTeardownHooks();
}

/** Gracefully tear down one terminal's process tree (window/tab closed). */
export function killTerminalProcess(pid: number) {
  shellPids.delete(pid);
  killTree(pid, 'SIGTERM');
}

/**
 * Force-kill every remaining terminal. Exported so the Quit action can call it
 * while the event loop is still alive (before `process.exit`), which is more
 * reliable than leaning on the 'exit' handler alone. SIGKILL because teardown
 * can't wait out a graceful SIGTERM.
 */
export function killAllTerminalProcesses() {
  for (const pid of shellPids) killTree(pid, 'SIGKILL');
  shellPids.clear();
}

// Installed once, the first time a terminal spawns.
let hooksInstalled = false;
function installTeardownHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;

  // Last-resort net for exit paths that don't route through the Quit action:
  // 'exit' still fires on `process.exit()`, and the signals cover the app being
  // closed or terminated from the outside (the host terminal window closing
  // sends SIGHUP). The group-kill in killTree is a bare syscall, so it holds up
  // even here where spawning `pgrep` would not.
  process.on('exit', killAllTerminalProcesses);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => {
      killAllTerminalProcesses();
      process.exit(0);
    });
  }
}
