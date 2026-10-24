/**
 * Where releases come from, how often to look, and where a download waits.
 */
import { homedir } from 'node:os';
import path from 'node:path';
import { FRODON_DIRNAME } from '@main/board';

/**
 * The repository whose releases this app updates from.
 *
 * A fork that ships its own builds changes this one line. It has to be a
 * **public** repository: the app downloads without credentials, and GitHub
 * answers 404 for any asset of a private one.
 */
export const RELEASE_REPO = 'edouardjamieson/frodon-ide';

/**
 * The newest release's manifest, written by `scripts/write-manifest.mjs`.
 *
 * `releases/latest/download/` rather than the REST API: it is a redirect to
 * the asset, which costs nothing against GitHub's sixty-an-hour limit on
 * unauthenticated API calls — a limit shared by every machine behind the same
 * office NAT. It also skips drafts and prereleases without being asked.
 */
export const MANIFEST_URL = `https://github.com/${RELEASE_REPO}/releases/latest/download/latest.json`;

export const assetUrl = (version: string, name: string): string =>
  `https://github.com/${RELEASE_REPO}/releases/download/v${version}/${name}`;

/**
 * Half an hour between checks. "I push and they have it" is the goal, and the
 * build takes several minutes on its own, so checking more often would mostly
 * find the same release being built. One small JSON request each time.
 */
export const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * `~/.frodon/updates/<version>/Frodon.app`, a downloaded bundle waiting for a
 * restart. Under the one app directory ADR-0023 allows, rather than in the
 * system temp directory: a download that finished yesterday should still be
 * ready today, and macOS clears `$TMPDIR` on its own schedule.
 */
export const UPDATES_DIR = path.join(homedir(), FRODON_DIRNAME, 'updates');

/** What the zip unpacks to — `productName` in electron-builder.yml. */
export const BUNDLE_NAME = 'Frodon.app';

/**
 * Written last, after the bundle is unpacked and checked. A directory without
 * it is a download that was interrupted, and is thrown away rather than
 * trusted.
 */
export const COMPLETE_MARKER = '.complete';

/**
 * The argument a relaunched Frodon finds each project it should reopen in.
 * One per window, so a root with a space in it survives as one argument.
 */
export const REOPEN_FLAG = '--frodon-reopen=';
