/**
 * The environment an agent is spawned into, and how an executable is found
 * in it.
 *
 * An agent is a program the person installed — with Homebrew, with npm, with
 * an installer that dropped it in `~/.local/bin` — and the `PATH` that knows
 * where is the one their login shell builds. Electron's own does not: a Mac
 * app started from the Dock inherits launchd's `/usr/bin:/bin:/usr/sbin:
 * /sbin` and nothing more. The terminal gets around this by spawning the
 * shell with `-il` and letting it build the `PATH` itself; an agent is not a
 * shell, so the shell is asked once what it would have built.
 *
 * The rest of the environment is passed through untouched, and that matters
 * more than it looks: Claude Code keeps its login in the Keychain, and with
 * `USER` and its siblings stripped it starts and answers "Not logged in".
 * Verified with `env -i`; see `docs/learned.md`.
 */
import { execFile } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { createLogger } from '@main/logger';
import { SHELL_TIMEOUT_MS } from './agent.constant';

const log = createLogger('agent');

/** Brackets the answer, so a prompt or a banner the profile prints is ignored. */
const MARKER = '__FRODON_PATH__';

/**
 * Where agents are commonly installed, for when the shell will not answer.
 *
 * A fallback and not the rule: the shell knows about nvm, asdf, a custom
 * prefix, and this list knows about none of them. It covers the installers
 * people actually use, so a broken profile degrades to "found it anyway"
 * rather than to "not installed".
 */
const COMMON_DIRS = [
  join(homedir(), '.local', 'bin'),
  join(homedir(), '.claude', 'local'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
];

let cached: Promise<Record<string, string>> | null = null;

/**
 * The environment to spawn an agent with: Electron's own, with the login
 * shell's `PATH`.
 *
 * Asked once per run of the app. A login shell sources the person's whole
 * profile, which can take most of a second on a heavily configured machine,
 * and the answer does not change while Frodon is open — installing an agent
 * into a brand new directory is the one case it misses, and a restart fixes
 * that.
 */
export function loginEnvironment(): Promise<Record<string, string>> {
  cached ??= probe();
  return cached;
}

async function probe(): Promise<Record<string, string>> {
  const base: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') base[key] = value;
  }

  const path = await shellPath();
  const dirs = (path ?? base['PATH'] ?? '').split(delimiter).filter(Boolean);
  for (const dir of COMMON_DIRS) {
    if (!dirs.includes(dir)) dirs.push(dir);
  }

  return { ...base, PATH: dirs.join(delimiter) };
}

/** The `PATH` the person's login shell builds, or null if it would not say. */
function shellPath(): Promise<string | null> {
  if (process.platform === 'win32') return Promise.resolve(null);

  const shell = process.env['SHELL'] ?? '/bin/zsh';
  const script = `printf '\\n${MARKER}%s${MARKER}\\n' "$PATH"`;

  return new Promise((resolve) => {
    execFile(
      shell,
      // Interactive as well as login, the same flags the terminal uses:
      // plenty of people set `PATH` in `.zshrc`, which a login shell alone
      // does not read.
      ['-ilc', script],
      { timeout: SHELL_TIMEOUT_MS, encoding: 'utf8' },
      (error, stdout) => {
        const match = stdout?.match(new RegExp(`${MARKER}(.*)${MARKER}`));
        if (match?.[1]) {
          resolve(match[1]);
          return;
        }
        log.error(`could not read PATH from ${shell}`, error);
        resolve(null);
      }
    );
  });
}

/** The first executable called `name` on `PATH`, or null. */
export async function findExecutable(
  name: string,
  env: Record<string, string>
): Promise<string | null> {
  const dirs = (env['PATH'] ?? '').split(delimiter).filter(Boolean);

  for (const dir of dirs) {
    const candidate = join(dir, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not here, or not executable. Keep looking.
    }
  }
  return null;
}
