/**
 * Cuts a release: bumps the version, commits, tags, and pushes.
 *
 *   pnpm release            # 0.1.0 -> 0.1.1
 *   pnpm release minor      # 0.1.0 -> 0.2.0
 *   pnpm release major      # 0.1.0 -> 1.0.0
 *
 * Pushing the tag is the whole of it: `.github/workflows/release.yml` builds
 * on the tag and publishes, and every running copy of Frodon finds the new
 * version on its next check. Nothing is built here, so a release from a
 * laptop costs a push and no waiting.
 *
 * It refuses a dirty tree and any branch but `main`. A release is a tag on a
 * commit, and the commit should be the one everybody else can see — not one
 * that exists only because it was the working copy at the time.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8' }).trim();

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

const part = process.argv[2] ?? 'patch';
if (!['patch', 'minor', 'major'].includes(part)) {
  fail(`expected patch, minor or major, not "${part}"`);
}

if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') {
  fail('releases are cut from main');
}
if (git('status', '--porcelain') !== '') {
  fail('the working tree has uncommitted changes');
}

const raw = readFileSync('package.json', 'utf8');
const manifest = JSON.parse(raw);
const [major, minor, patch] = manifest.version.split('.').map(Number);
const next =
  part === 'major'
    ? `${major + 1}.0.0`
    : part === 'minor'
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;

// A string replace rather than re-serialising the object, so the file keeps
// exactly the formatting it had and the diff is one line.
writeFileSync(
  'package.json',
  raw.replace(`"version": "${manifest.version}"`, `"version": "${next}"`)
);

git('commit', '--quiet', '-m', `Release ${next}`, '--', 'package.json');
// Annotated, because `--follow-tags` pushes only annotated tags.
git('tag', '-a', `v${next}`, '-m', `Frodon ${next}`);
git('push', '--quiet', '--follow-tags', 'origin', 'main');

console.log(`release: pushed v${next}; CI is building it now`);
