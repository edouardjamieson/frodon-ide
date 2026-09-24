import fs from 'node:fs';
import path from 'node:path';
import Logger from '../logger/logger.service';
import type { FsResult } from '../fs';
import type { Config, PartialConfig } from './config.def';
import {
  DEFAULT_CONFIG,
  LOCAL_CONFIG_FILE,
  PROJECT_CONFIG_DIR,
  PROJECT_CONFIG_FILE,
  USER_CONFIG_DIR,
  USER_CONFIG_FILE,
} from './config.constant';

/** Absolute path to the per-user config file. */
export function userConfigPath(): string {
  return path.join(USER_CONFIG_DIR, USER_CONFIG_FILE);
}

/** Absolute path to the git-tracked project config file. */
export function projectConfigPath(projectPath: string): string {
  return path.join(projectPath, PROJECT_CONFIG_DIR, PROJECT_CONFIG_FILE);
}

/** Absolute path to the git-ignored per-machine project override. */
export function localConfigPath(projectPath: string): string {
  return path.join(projectPath, PROJECT_CONFIG_DIR, LOCAL_CONFIG_FILE);
}

/**
 * Reads and parses a single layer. A missing file is normal and returns `{}`;
 * malformed JSON is logged and treated as empty so one bad file can't take the
 * editor down on startup.
 */
function readLayer(filePath: string): PartialConfig {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as PartialConfig;
  } catch (error) {
    Logger.log(`config: ignoring malformed ${filePath}: ${error}`);
    return {};
  }
}

/**
 * Merges layers per-section, key-by-key: a later layer overrides only the keys
 * it sets within a section. Arrays inside a section (e.g. `files.exclude`) are
 * replaced whole rather than concatenated, so a layer can shrink a list, not
 * just grow it. `actions` is the deliberate exception: it accumulates across
 * layers so a personal formatter and a project linter both fire, instead of one
 * layer masking the other.
 */
function mergeLayers(...layers: PartialConfig[]): Config {
  const result = structuredClone(DEFAULT_CONFIG);
  for (const layer of layers) {
    for (const section of Object.keys(layer) as (keyof Config)[]) {
      if (section === 'actions') {
        result.actions = [
          ...result.actions,
          ...((layer.actions as Config['actions'] | undefined) ?? []),
        ];
      } else {
        Object.assign(result[section], layer[section]);
      }
    }
  }
  return result;
}

/**
 * Resolves the effective config for a project by layering the on-disk sources
 * over the built-in defaults, lowest → highest precedence:
 *
 *   defaults < user < project (git) < local (git-ignored)
 *
 * Project settings intentionally win over personal ones so a team can pin
 * shared behaviour in git; the local file is the per-machine escape hatch.
 */
export function loadConfig(projectPath: string): Config {
  return mergeLayers(
    readLayer(userConfigPath()),
    readLayer(projectConfigPath(projectPath)),
    readLayer(localConfigPath(projectPath))
  );
}

/**
 * Patches one layer file: merges `patch` into whatever is already on disk (so
 * unrelated keys survive) and writes it back, creating the parent directory as
 * needed. Section objects are merged; other values are replaced.
 */
export function writeConfig(filePath: string, patch: PartialConfig): FsResult {
  try {
    const current = readLayer(filePath);
    const next: PartialConfig = { ...current };
    for (const section of Object.keys(patch) as (keyof Config)[]) {
      const value = patch[section];
      // Array sections (e.g. `actions`) replace wholesale; object sections
      // merge key-by-key so unrelated settings in the layer survive.
      next[section] = (
        Array.isArray(value)
          ? value
          : { ...(current[section] as object), ...(value as object) }
      ) as never;
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`);
    return { ok: true };
  } catch (error) {
    Logger.log(`config: writeConfig failed for ${filePath}: ${error}`);
    return { ok: false, error: String(error) };
  }
}
