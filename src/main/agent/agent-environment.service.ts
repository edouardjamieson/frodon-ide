/**
 * The environment an agent is spawned into, and how an executable is found
 * in it.
 *
 * An agent is a program the person installed — with Homebrew, with npm, with
 * an installer that dropped it in `~/.local/bin` — and it expects to start in
 * the environment their terminal has. Electron's own is not that: a Mac app
 * started from the Dock inherits launchd's, which has a `PATH` of `/usr/bin:
 * /bin:/usr/sbin:/sbin` and none of what the profile exports. The terminal
 * gets around this by spawning the shell with `-il` and letting it build the
 * environment itself; an agent is not a shell, so the shell is asked once
 * what it would have built.
 *
 * All of it, not only `PATH`. An agent runs commands on the person's behalf,
 * and those commands read the profile's exports — a token, `AWS_PROFILE`, a
 * database host, the version manager's variables. With `PATH` alone, the same
 * `psql` that works in a terminal tile fails in an agent's.
 *
 * Electron's own environment is the base, and the shell's is laid over it:
 * Claude Code keeps its login in the Keychain, and with `USER` and its
 * siblings stripped it starts and answers "Not logged in". Verified with
 * `env -i`; see `docs/learned.md`.
 */
import { execFile } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { createLogger } from '@main/logger';
import { SHELL_TIMEOUT_MS } from './agent.constant';

const log = createLogger('agent');

/** Brackets the answer, so a prompt or a banner the profile prints is ignored. */
const MARKER = '__FRODON_ENV__';

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

/**
 * What the shell reports about its own session rather than about the
 * person's setup. Carried over, they would describe the probe's shell — its
 * nesting depth, the directory it started in, the last command it ran — to a
 * process that is none of those.
 */
const SESSION_KEYS = new Set(['_', 'PWD', 'OLDPWD', 'SHLVL']);

let cached: Promise<Record<string, string>> | null = null;

/**
 * The environment to spawn an agent with: Electron's own, with the login
 * shell's laid over it.
 *
 * Asked once per run of the app. A login shell sources the person's whole
 * profile, which can take most of a second on a heavily configured machine,
 * and the answer does not change while Frodon is open — an export added to
 * the profile, or an agent installed into a brand new directory, is the case
 * it misses, and a restart fixes that.
 */
export function loginEnvironment(): Promise<Record<string, string>> {
  cached ??= probe();
  return cached;
}

async function probe(): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }

  const shell = await shellEnvironment();
  for (const [key, value] of Object.entries(shell ?? {})) {
    if (!SESSION_KEYS.has(key)) env[key] = value;
  }

  const dirs = (env['PATH'] ?? '').split(delimiter).filter(Boolean);
  for (const dir of COMMON_DIRS) {
    if (!dirs.includes(dir)) dirs.push(dir);
  }

  return { ...env, PATH: dirs.join(delimiter) };
}

/** The environment the person's login shell builds, or null if it would not say. */
function shellEnvironment(): Promise<Record<string, string> | null> {
  if (process.platform === 'win32') return Promise.resolve(null);

  const shell = process.env['SHELL'] ?? '/bin/zsh';
  // `env -0` rather than `env`: a value may hold a newline — a multi-line
  // prompt, a PEM key exported whole — and only NUL cannot appear in one.
  const script = `printf '\\n${MARKER}'; env -0; printf '${MARKER}\\n'`;

  return new Promise((resolve) => {
    execFile(
      shell,
      // Interactive as well as login, the same flags the terminal uses:
      // plenty of people set `PATH` in `.zshrc`, which a login shell alone
      // does not read.
      ['-ilc', script],
      { timeout: SHELL_TIMEOUT_MS, encoding: 'utf8' },
      (error, stdout) => {
        const match = stdout?.match(
          new RegExp(`${MARKER}([\\s\\S]*)${MARKER}`)
        );
        if (match?.[1]) {
          resolve(parseEnv(match[1]));
          return;
        }
        log.error(`could not read the environment from ${shell}`, error);
        resolve(null);
      }
    );
  });
}

/** `env -0` output, as a record. An entry is split at its first `=`. */
function parseEnv(output: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const entry of output.split('\0')) {
    const equals = entry.indexOf('=');
    if (equals > 0) env[entry.slice(0, equals)] = entry.slice(equals + 1);
  }
  return env;
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
