/**
 * Puts the executable bit back on node-pty's `spawn-helper`.
 *
 * node-pty ships prebuilt binaries, and spawning a shell runs the little
 * `spawn-helper` next to `pty.node` to hand the child its controlling
 * terminal. It arrives from the package manager as `rw-r--r--`, so the very
 * first terminal fails with `posix_spawnp failed` — a message that names
 * neither node-pty nor a permission, and sends you looking at your shell.
 *
 * Cheap to run, so it runs on every install rather than trying to detect
 * whether this install needs it.
 */
import { chmodSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PREBUILDS = 'node_modules/node-pty/prebuilds';
// Where a from-source build lands instead, if prebuilds were skipped.
const BUILT = 'node_modules/node-pty/build/Release/spawn-helper';

function makeExecutable(path) {
  if (!existsSync(path)) return false;
  // Already executable by someone: leave the mode exactly as it is.
  if (statSync(path).mode & 0o111) return false;
  chmodSync(path, 0o755);
  return true;
}

const fixed = [];

if (existsSync(PREBUILDS)) {
  for (const platform of readdirSync(PREBUILDS)) {
    const helper = join(PREBUILDS, platform, 'spawn-helper');
    if (makeExecutable(helper)) fixed.push(helper);
  }
}
if (makeExecutable(BUILT)) fixed.push(BUILT);

for (const path of fixed) console.log(`fixed permissions on ${path}`);
