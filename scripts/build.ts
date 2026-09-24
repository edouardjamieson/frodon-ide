/**
 * Bundles the CLI into `dist/index.js` for publishing.
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
import pkg from '../package.json';

const external = Object.keys(pkg.dependencies ?? {});

const result = await Bun.build({
  entrypoints: ['src/index.tsx'],
  target: 'bun',
  outdir: 'dist',
  naming: 'index.js',
  external,
  // Executed by `bunx`/`npx`, so mark it runnable and pin the interpreter.
  banner: '#!/usr/bin/env bun',
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`Built dist/index.js (external: ${external.join(', ')})`);
