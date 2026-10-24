/**
 * The updater: find a newer release, download it, and swap it in on request.
 *
 * Not `electron-updater`, and not Electron's own `autoUpdater`. Both drive
 * Squirrel.Mac on macOS, and Squirrel.Mac refuses an update unless the new
 * bundle's code signature satisfies the running one's designated requirement
 * — which for an ad-hoc signature is its own hash, so no update can ever
 * satisfy it. An unsigned app cannot update itself through Squirrel at all.
 *
 * What it does instead is the thing Squirrel does underneath, written out:
 * unpack the new bundle beside the old one, and when asked, quit and let a
 * small shell script move it into place and open it. A running bundle cannot
 * be replaced from inside itself, but once the process has exited it is a
 * folder like any other.
 *
 * Two properties of an unsigned app make this work rather than fight it. A
 * file this process downloads carries no quarantine attribute — that is only
 * set by apps that ask for it — so Gatekeeper does not re-examine the new
 * bundle on first launch. And there is no signature to preserve, so a `mv`
 * is the whole installation.
 *
 * What it costs: no deltas — every update is the full zip, around a hundred
 * megabytes — and no Windows or Linux, which would each need an installer
 * story of their own.
 */
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, writeFileSync } from 'node:fs';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { promisify } from 'node:util';
import { app, BrowserWindow, net } from 'electron';
import { rootOf } from '@main/session';
import { createLogger } from '@main/logger';
import type { UpdateState } from '@shared/update.def';
import {
  assetUrl,
  BUNDLE_NAME,
  CHECK_INTERVAL_MS,
  COMPLETE_MARKER,
  MANIFEST_URL,
  REOPEN_FLAG,
  UPDATES_DIR,
} from './update.constant';

const log = createLogger('update');
const run = promisify(execFile);

/** `latest.json`, as `scripts/write-manifest.mjs` writes it. */
interface Manifest {
  version: string;
  files: { arch: string; name: string; size: number; sha512: string }[];
}

let state: UpdateState = { kind: 'idle' };
/** The unpacked bundle `installUpdate` moves into place, once `ready`. */
let staged: string | null = null;
let timer: NodeJS.Timeout | null = null;
let checking = false;

/** The `.app` this process is running from. */
function bundlePath(): string {
  // `Frodon.app/Contents/MacOS/Frodon` — three levels down.
  return path.resolve(app.getPath('exe'), '../../..');
}

/**
 * Why this copy cannot replace itself, or null if it can.
 *
 * App Translocation is the one that is not obvious. A quarantined app opened
 * from where it was downloaded is run from a randomized read-only mount, so
 * the path the process sees is not one anything can be moved to. Moving the
 * app to /Applications — which the install instructions ask for anyway —
 * is what ends it.
 */
function unsupportedReason(): string | null {
  if (!app.isPackaged) return 'Development builds do not update.';
  if (process.platform !== 'darwin') {
    return 'Only the macOS build updates itself, for now.';
  }
  if (bundlePath().includes('/AppTranslocation/')) {
    return 'Move Frodon to Applications to receive updates.';
  }
  return null;
}

export const getUpdateState = (): UpdateState => state;

/**
 * Pushes a new state to every window — if it is new. The same compare-before-
 * push as `sameStatus`: a half-hourly check that finds nothing should cost
 * nothing beyond the request.
 */
function setState(next: UpdateState): void {
  if (JSON.stringify(next) === JSON.stringify(state)) return;
  state = next;
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send('update:changed', next);
    }
  }
}

/** Checks now, and every half hour after. A no-op where it cannot update. */
export function startUpdateChecks(): void {
  const reason = unsupportedReason();
  if (reason) {
    state = { kind: 'unsupported', reason };
    log.info(`not checking: ${reason}`);
    return;
  }

  void check();
  timer = setInterval(() => void check(), CHECK_INTERVAL_MS);
}

export function stopUpdateChecks(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/**
 * Release versions only — `1.2.3`, compared part by part. The release script
 * cannot make anything else, and a prerelease is never served as `latest`.
 */
function isNewer(candidate: string, current: string): boolean {
  const a = candidate.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

async function check(): Promise<void> {
  // Once one is ready, stop looking. A release that lands while the button is
  // already showing is picked up by the first check after the restart, and
  // swapping the staged bundle underneath a button about to install it is a
  // race nobody needs.
  if (checking || state.kind === 'ready') return;
  checking = true;

  try {
    const manifest = await fetchManifest();
    if (!manifest || !isNewer(manifest.version, app.getVersion())) {
      // Whatever is staged is this version or older, so it has been installed
      // already or never will be.
      await rm(UPDATES_DIR, { recursive: true, force: true });
      setState({ kind: 'idle' });
      return;
    }

    const file = manifest.files.find((f) => f.arch === process.arch);
    if (!file) {
      throw new Error(`${manifest.version} has no ${process.arch} build`);
    }

    await assertWritable();
    setState({ kind: 'downloading', version: manifest.version });
    staged = await stage(manifest.version, file);
    log.info(`${manifest.version} is ready at ${staged}`);
    setState({ kind: 'ready', version: manifest.version });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`check failed: ${message}`);
    setState({ kind: 'error', message });
  } finally {
    checking = false;
  }
}

/** The newest release's manifest, or null when there is no release yet. */
async function fetchManifest(): Promise<Manifest | null> {
  const response = await net.fetch(MANIFEST_URL, { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`manifest: HTTP ${response.status}`);

  const body = (await response.json()) as Partial<Manifest>;
  if (typeof body.version !== 'string' || !Array.isArray(body.files)) {
    throw new Error('manifest: not a Frodon release manifest');
  }
  return body as Manifest;
}

/**
 * Fails before the download rather than after it. Replacing the bundle means
 * renaming it, which needs write access to the folder it is in — true of
 * /Applications for an admin account, and not for a standard one.
 */
async function assertWritable(): Promise<void> {
  const bundle = bundlePath();
  try {
    await access(path.dirname(bundle), constants.W_OK);
    await access(bundle, constants.W_OK);
  } catch {
    throw new Error(`cannot write to ${path.dirname(bundle)}`);
  }
}

/**
 * Downloads, verifies and unpacks one version, answering the bundle's path.
 *
 * A version already unpacked by an earlier launch is reused — the marker says
 * it was finished — so quitting without restarting does not cost the next
 * launch a second download.
 */
async function stage(version: string, file: Manifest['files'][number]) {
  const dir = path.join(UPDATES_DIR, version);
  const bundle = path.join(dir, BUNDLE_NAME);
  if (existsSync(path.join(dir, COMPLETE_MARKER))) return bundle;

  // Everything else under updates/ is an older version or a half-finished
  // one. Neither is worth keeping.
  await rm(UPDATES_DIR, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const zip = path.join(dir, file.name);
  const response = await net.fetch(assetUrl(version, file.name));
  if (!response.ok || !response.body) {
    throw new Error(`${file.name}: HTTP ${response.status}`);
  }

  // Hashed as it streams, so a hundred-megabyte zip is read once rather than
  // written and then read back.
  const hash = createHash('sha512');
  await pipeline(
    Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
    async function* (source: AsyncIterable<Buffer>) {
      for await (const chunk of source) {
        hash.update(chunk);
        yield chunk;
      }
    },
    createWriteStream(zip)
  );

  // HTTPS already vouches for where the bytes came from. This is for the bytes
  // themselves — a truncated download unzips into a bundle that fails to
  // launch, and the person finds out after the old one is gone.
  if (hash.digest('hex') !== file.sha512) {
    await rm(dir, { recursive: true, force: true });
    throw new Error(`${file.name} does not match its checksum`);
  }

  // `ditto`, not `unzip`: it is what made the zip, and it is what keeps the
  // symlinks inside Electron's frameworks as symlinks.
  await run('/usr/bin/ditto', ['-x', '-k', zip, dir]);
  await rm(zip);
  if (!existsSync(path.join(bundle, 'Contents/Info.plist'))) {
    throw new Error(`${file.name} did not contain ${BUNDLE_NAME}`);
  }

  await writeFile(path.join(dir, COMPLETE_MARKER), '');
  return bundle;
}

/**
 * Waits for this process to exit, swaps the bundles, and opens the new one.
 *
 * The old bundle is moved aside rather than deleted first, and moved back if
 * the new one cannot take its place — the one outcome worth any amount of
 * care is ending up with no Frodon at all.
 */
const INSTALL_SCRIPT = `#!/bin/sh
pid="$1"; target="$2"; staged="$3"; shift 3
while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done
old="$target.old-$$"
mv "$target" "$old" || exit 1
if mv "$staged" "$target"; then
  rm -rf "$old"
  rm -rf "$(dirname "$staged")"
else
  mv "$old" "$target"
fi
open "$target" --args "$@"
`;

/**
 * Quits into the new version, reopening the projects that were open.
 *
 * The script is detached and outlives us; it is what runs `open` once the
 * swap is done. Each window's project rides along as an argument —
 * `REOPEN_FLAG` — so a restart puts you back where you were rather than on
 * the launcher. Two windows on one project come back as two.
 *
 * Unsaved editor tabs are lost, the same as on any quit: the dialog that
 * should ask first does not exist yet (see docs/migration.md).
 */
export function installUpdate(): void {
  if (state.kind !== 'ready' || !staged) return;

  const roots = BrowserWindow.getAllWindows()
    .map((window) => rootOf(window.webContents))
    .filter((root): root is string => root !== null);

  const script = path.join(UPDATES_DIR, 'install.sh');
  writeFileSync(script, INSTALL_SCRIPT);

  const child = spawn(
    '/bin/sh',
    [
      script,
      String(process.pid),
      bundlePath(),
      staged,
      ...roots.map((root) => `${REOPEN_FLAG}${root}`),
    ],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();

  log.info(`restarting into ${state.version}`);
  app.quit();
}

/** The projects a restart was asked to reopen, from this process's argv. */
export function rootsToReopen(): string[] {
  return process.argv
    .filter((arg) => arg.startsWith(REOPEN_FLAG))
    .map((arg) => arg.slice(REOPEN_FLAG.length))
    .filter((root) => root !== '');
}
