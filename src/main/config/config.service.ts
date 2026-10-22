/**
 * The two config files: reading them forgivingly, writing them narrowly.
 *
 * Main owns them for the usual reason — they are files on disk — but they
 * differ from everything else in `main/` in one respect that decides how this
 * module is written: **a config file is meant to be edited by hand.** Nothing
 * else here is. A layout file can assume it wrote itself; this one has to
 * assume it did not.
 *
 * So two rules, and everything below follows from them:
 *
 * **A read never fails.** Missing, truncated, hand-mangled, written by a
 * future version — all of them are "nothing has been chosen", which is a
 * config of `{}` and a project that derives its name from its folder. There
 * is no state of this file worth refusing to open a project over.
 *
 * **A write only writes what it understands.** The value arrives from the
 * renderer, is put through the shared sanitizer, and anything that did not
 * survive is dropped rather than persisted. The renderer checks the same
 * grammar in the field the person is typing into — that is what makes the
 * error message good — and this checks it again because the renderer's
 * answer is not evidence.
 *
 * Unlike the layout and recents files, a failed write is *reported* rather
 * than only logged. Those two record something the app noticed; this records
 * something a person just did, in a dialog they are still looking at, and a
 * choice that silently did not take is the worst outcome available.
 */
import fsp from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createLogger } from '@main/logger';
import { FRODON_DIRNAME } from '@main/board';
import { CONFIG_FILENAME } from './config.constant';
import {
  sanitizeProjectConfig,
  sanitizeUserConfig,
  type ProjectConfig,
  type UserConfig,
} from '@shared/config.def';
import type { FsResult } from '@shared/fs.def';

const log = createLogger('config');

function userConfigFile(): string {
  return path.join(homedir(), FRODON_DIRNAME, CONFIG_FILENAME);
}

/**
 * The open project's config file, or null when no project is open.
 *
 * Built from main's own root rather than from a path the renderer sent, which
 * is the same stance `boardsDirectory` takes and for a stronger reason here:
 * this one is written to. A renderer that could name the directory could name
 * any directory.
 */
function projectConfigFile(root: string | null): string | null {
  if (!root) return null;
  return path.join(root, FRODON_DIRNAME, CONFIG_FILENAME);
}

/** Whatever is in a config file, as an unknown. Every failure is `null`. */
async function readJson(file: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await fsp.readFile(file, 'utf8');
  } catch {
    // No config has ever been written here. Not worth a log line: it is the
    // state every project and every machine starts in.
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    log.warn(`${file} is not readable JSON; ignoring it`);
    return null;
  }
}

/**
 * Writes a config file, creating `.frodon/` if it is not there yet.
 *
 * Pretty-printed with a trailing newline, like every other file this app
 * writes, because the project one lands in a repository and shows up in a
 * diff.
 */
async function writeJson(file: string, value: object): Promise<FsResult> {
  try {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    return { ok: true };
  } catch (error) {
    log.error(`could not write ${file}`, error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'Could not save settings.',
    };
  }
}

/* -------------------------------------------------------------------------
 * What the handlers call
 * ---------------------------------------------------------------------- */

/**
 * The open project's settings, or `{}`.
 *
 * `{}` covers no project open, no file, bad JSON, and a file whose every
 * field was refused — see the channel's own note on why those are one answer
 * and not four.
 */
export async function readProjectConfig(
  root: string | null
): Promise<ProjectConfig> {
  const file = projectConfigFile(root);
  if (!file) return {};

  return sanitizeProjectConfig(await readJson(file));
}

export async function writeProjectConfig(
  root: string | null,
  config: ProjectConfig
): Promise<FsResult> {
  const file = projectConfigFile(root);
  if (!file) {
    return { ok: false, error: 'No project is open, so it has no settings.' };
  }

  return writeJson(file, sanitizeProjectConfig(config));
}

export async function readUserConfig(): Promise<UserConfig> {
  return sanitizeUserConfig(await readJson(userConfigFile()));
}

export async function writeUserConfig(config: UserConfig): Promise<FsResult> {
  return writeJson(userConfigFile(), sanitizeUserConfig(config));
}

/**
 * One *other* project's settings, read straight off disk.
 *
 * The launcher is why this exists. It lists projects that are not open, and a
 * project that has named itself should be listed under the name it chose —
 * otherwise renaming one looks broken from the one screen that shows them
 * all. Reading five small files that are already being `stat`ed costs
 * nothing, and it is a fact only main can fetch, so it travels with the
 * recents entry rather than being derived on the other side.
 *
 * It takes a path, and is the one function here that does. That path comes
 * from main's own recents list, never from the renderer, and nothing is
 * written through it.
 */
export async function readConfigOfProject(
  root: string
): Promise<ProjectConfig> {
  return sanitizeProjectConfig(
    await readJson(path.join(root, FRODON_DIRNAME, CONFIG_FILENAME))
  );
}
