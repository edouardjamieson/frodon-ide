/**
 * Resolution and execution for configured actions. Templates carry
 * `{{variables}}` that are filled from the triggering file, and each run is
 * recorded in the actions store so a results panel can surface its output.
 */

import path from 'node:path';
import Logger from '../logger/logger.service';
import { useActionsStore, type ActionRun } from './actions.store';
import type { Action, ActionContext } from './actions.def';

/** Placeholder pattern: `{{name}}`, tolerant of surrounding whitespace. */
const VARIABLE = /\{\{\s*(\w+)\s*\}\}/g;

/** The values a command template may interpolate, derived from the file. */
function variables(ctx: ActionContext): Record<string, string> {
  return {
    filePath: ctx.path,
    fileName: path.basename(ctx.path),
    fileDir: path.dirname(ctx.path),
    relativePath: path.relative(ctx.projectRoot, ctx.path),
    fileExt: path.extname(ctx.path),
    projectRoot: ctx.projectRoot,
    oldPath: ctx.oldPath ?? '',
  };
}

/**
 * Substitutes every `{{variable}}` in a template. Throws naming the first
 * unknown placeholder so the caller can record a config error instead of
 * shelling out a half-built command.
 */
export function resolveVariables(template: string, ctx: ActionContext): string {
  const vars = variables(ctx);
  return template.replace(VARIABLE, (_, name: string) => {
    if (!(name in vars)) throw new Error(`unknown variable {{${name}}}`);
    return vars[name]!;
  });
}

/**
 * True when `action` should fire for `ctx`: its event matches and, if a `match`
 * glob is set, the file's project-relative path satisfies it. Matching against
 * the relative path lets patterns like `src/**\/*.ts` behave as written.
 */
export function matches(action: Action, ctx: ActionContext): boolean {
  if (action.on !== ctx.event) return false;
  if (!action.match) return true;
  const rel = path.relative(ctx.projectRoot, ctx.path);
  return new Bun.Glob(action.match).match(rel);
}

/** Generates an id unique enough to key one run in the history list. */
function runId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Runs one action, recording its whole lifecycle in the actions store. The
 * returned promise settles when the process exits, so a caller awaiting a
 * `blocking` action can then re-read the file to adopt its output. Every
 * failure — an unresolved variable, a spawn error, a non-zero exit — is
 * captured on the run rather than thrown.
 */
export async function runAction(
  action: Action,
  ctx: ActionContext
): Promise<void> {
  const store = useActionsStore.getState();
  const id = runId();
  const base: ActionRun = {
    id,
    label: action.run,
    command: '',
    event: ctx.event,
    status: 'running',
    startedAt: Date.now(),
  };

  let command: string;
  try {
    command = resolveVariables(action.run, ctx);
  } catch (error) {
    store.addRun({
      ...base,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      finishedAt: Date.now(),
    });
    return;
  }

  store.addRun({ ...base, command });

  try {
    const proc = Bun.spawn(['sh', '-c', command], {
      cwd: ctx.projectRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    store.updateRun(id, {
      status: exitCode === 0 ? 'ok' : 'error',
      exitCode,
      stdout,
      stderr,
      finishedAt: Date.now(),
    });
  } catch (error) {
    Logger.log(`actions: run failed for "${command}": ${error}`);
    store.updateRun(id, {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      finishedAt: Date.now(),
    });
  }
}
