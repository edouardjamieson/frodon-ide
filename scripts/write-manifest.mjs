/**
 * Writes `dist/latest.json`, the one file a running Frodon reads to learn
 * that a newer one exists.
 *
 * electron-builder has a manifest of its own, `latest-mac.yml`, but it only
 * writes it when it is the one publishing — and it is not, here: CI hands the
 * artifacts to `gh release create`, which needs no publish token threaded
 * through a config file. Writing our own also means the app parses JSON, with
 * no YAML reader in the main bundle for the sake of six fields.
 *
 * Only the zips are listed. They are what the updater downloads; the dmg is
 * for a person installing by hand, who is not going to check a hash.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

// `Frodon-1.2.3-arm64.zip`, as `artifactName` in electron-builder.yml spells
// it. Anything else in dist/ — a dmg, a blockmap, an older build — is skipped.
const ZIP = new RegExp(`^Frodon-${version.replaceAll('.', '\\.')}-(\\w+)\\.zip$`);

const files = readdirSync(DIST).flatMap((name) => {
  const match = ZIP.exec(name);
  if (!match) return [];

  const path = join(DIST, name);
  return [
    {
      arch: match[1],
      name,
      size: statSync(path).size,
      sha512: createHash('sha512').update(readFileSync(path)).digest('hex'),
    },
  ];
});

if (files.length === 0) {
  console.error(`write-manifest: no zip for ${version} in ${DIST}/`);
  process.exit(1);
}

writeFileSync(
  join(DIST, 'latest.json'),
  JSON.stringify({ version, files }, null, 2) + '\n'
);
console.log(
  `write-manifest: ${version} for ${files.map((file) => file.arch).join(', ')}`
);
