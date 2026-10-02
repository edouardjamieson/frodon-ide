/**
 * Bundles the CLI into `dist/` for publishing: `index.js` (the app) and
 * `frodon` (the launcher that gates it on a usable Bun).
 *
 * Only our own source (the `~/*` aliased tree) is bundled; every third-party
 * dependency is left external so it resolves from the consumer's installed
 * node_modules — critically, this lets `@opentui/core` pick the right native
 * `libopentui` from its per-platform optional deps at runtime.
 *
 * We can't use `bun build --packages=external`: it treats the `~/*` tsconfig
 * path alias as a bare (external) specifier and leaves it unresolved. Listing
 * the real dependencies as externals instead means unmatched `~/*` imports
 * fall through to the alias resolver and get bundled.
 *
 * Run with: `bun scripts/build.ts`
 */
import { chmodSync, rmSync } from 'node:fs';
import pkg from '../package.json';
import { MINIMUM_BUN } from '../src/lib/preflight/preflight.constant';

// The Bun floor is stated in three places that must agree: this constant, the
// `engines` field npm checks at install time, and the launcher's own check for
// a Bun too old to reach the constant. The launcher is generated from the
// constant below; `engines` is only asserted, because it's what a consumer's
// package manager reads and changing it silently at build time would hide a
// drift the publisher should see.
const declared = `>=${MINIMUM_BUN}`;
if (pkg.engines?.bun !== declared) {
  console.error(
    `engines.bun is "${pkg.engines?.bun}" but MINIMUM_BUN is "${MINIMUM_BUN}" ` +
      `(expected "${declared}"). Update package.json or preflight.constant.ts.`
  );
  process.exit(1);
}

const external = Object.keys(pkg.dependencies ?? {});

// Wipe the previous build first. `splitting` names chunks by content hash, so
// a rebuild writes new ones and leaves the old ones behind -- and `files`
// publishes the whole directory, dead chunks included. Nothing reaches them at
// runtime, so the only symptom is a tarball that grows with every build.
rmSync('dist', { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ['src/index.tsx'],
  target: 'bun',
  outdir: 'dist',
  naming: 'index.js',
  external,
  // The entry is only the runtime gate; the app is behind a dynamic import so
  // it loads *after* the gate has run. Without splitting, Bun inlines that
  // import into the entry and every external `import` — @opentui/core among
  // them — is hoisted above the check, which is the one thing the split entry
  // exists to prevent.
  splitting: true,
  // Directly runnable too, for anyone who skips the launcher. The launcher
  // execs `bun` by name, so it doesn't depend on this.
  banner: '#!/usr/bin/env bun',
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// The banner gives index.js a shebang; the mode is what makes it mean
// something to the kernel.
chmodSync('dist/index.js', 0o755);

const launcher = await Bun.file('scripts/frodon.sh').text();
await Bun.write('dist/frodon', launcher.replaceAll('__MINIMUM_BUN__', MINIMUM_BUN));
// npm preserves the mode from the tarball; without this the published bin isn't
// executable and `frodon` is a permission error.
chmodSync('dist/frodon', 0o755);

console.log(
  `Built dist/index.js + dist/frodon (Bun >=${MINIMUM_BUN}, external: ${external.join(', ')})`
);
