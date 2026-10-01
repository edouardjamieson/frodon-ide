/**
 * The oldest Bun Frodon runs on.
 *
 * 1.3.0 is where `Bun.Terminal` lands — the PTY the embedded terminals are
 * built on — and it's also the floor `@opentui/core` declares. `scripts/build.ts`
 * asserts this matches `engines.bun` in package.json, so the two can't drift.
 */
export const MINIMUM_BUN = '1.3.0';

/** Where to point someone who needs to install or upgrade Bun. */
export const BUN_INSTALL_URL = 'https://bun.sh';
