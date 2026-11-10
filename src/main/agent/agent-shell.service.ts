/**
 * A command the person runs from the composer with `!`, in the project.
 *
 * The terminal's bash mode: the command runs in the person's own shell — not
 * as one of the agent's tool calls, which would cost a turn and an approval
 * for something the person typed themselves — and what it printed goes into
 * the conversation for the agent to read next time it is asked something.
 *
 * Run with `-lc` in the login environment the agent itself gets, so `npm`,
 * `pnpm` and whatever the profile puts on `PATH` are there; not `-i`, whose
 * prompt and job-control chatter would end up in the output.
 */
import { spawn } from 'node:child_process';
import { SHELL_COMMAND_TIMEOUT_MS } from './agent.constant';

export interface ShellResult {
  /** The exit code, or null when it was killed for taking too long. */
  code: number | null;
  /** stdout and stderr, as they interleaved. */
  output: string;
}

export function runShell(
  command: string,
  cwd: string,
  env: Record<string, string>
): Promise<ShellResult> {
  const shell = env['SHELL'] ?? process.env['SHELL'] ?? '/bin/zsh';

  return new Promise((done) => {
    const child = spawn(shell, ['-lc', command], {
      cwd,
      env,
      // Its own process group, so a timeout takes down what it started — a
      // dev server, a watcher — and not only the shell in front of it.
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const take = (chunk: Buffer) => {
      output += chunk.toString('utf8');
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);

    const timer = setTimeout(() => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGTERM');
        else child.kill('SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
      output += `\n[Stopped after ${SHELL_COMMAND_TIMEOUT_MS / 1000}s.]`;
    }, SHELL_COMMAND_TIMEOUT_MS);

    child.on('error', (error) => {
      clearTimeout(timer);
      done({ code: null, output: `${output}${error.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code, output });
    });
  });
}
