#!/bin/sh
#
# Frodon's published `bin`. Copied to dist/frodon by scripts/build.ts, which
# substitutes __MINIMUM_BUN__ — edit this file, never the generated one.
#
# dist/index.js carries a `#!/usr/bin/env bun` shebang, so running it with no
# bun on PATH gets you `env: bun: No such file or directory` and exit 127 —
# nothing naming Frodon, Bun, or what to do about it. That's the likely first
# contact for anyone reaching for `npx frodon`, since npm will happily install a
# package it can't run. This sits in front and says so. It's POSIX sh rather
# than node, because a `bunx` user may have no node and a node shim would break
# an install that works.
set -e

MINIMUM='__MINIMUM_BUN__'

die() {
  printf '\n%s\n' "$1" >&2
  exit 1
}

if ! command -v bun >/dev/null 2>&1; then
  die "Frodon needs Bun $MINIMUM or newer, but \`bun\` isn't on your PATH.

It's compiled for the Bun runtime — its embedded terminals are Bun PTYs —
so npm and npx can install Frodon, but they can't run it.

  Install Bun:  curl -fsSL https://bun.sh/install | bash
  Then run:     frodon"
fi

is_number() {
  case $1 in
    '' | *[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

# Compares the running Bun against MINIMUM, field by field. Anything that
# doesn't parse into three numbers is let through: a version string we can't
# read is likelier to be newer than ours than broken, and the check inside
# src/lib/preflight is the second opinion either way.
version=$(bun --version 2>/dev/null | tr -d '\r\n')
base=${version%%[-+]*}

rest=${base#*.}
major=${base%%.*}
minor=${rest%%.*}
patch=${rest#*.}
patch=${patch%%.*}

min_rest=${MINIMUM#*.}
min_major=${MINIMUM%%.*}
min_minor=${min_rest%%.*}
min_patch=${min_rest#*.}
min_patch=${min_patch%%.*}

if is_number "$major" && is_number "$minor" && is_number "$patch"; then
  outdated=''
  if [ "$major" -lt "$min_major" ]; then
    outdated=yes
  elif [ "$major" -eq "$min_major" ]; then
    if [ "$minor" -lt "$min_minor" ]; then
      outdated=yes
    elif [ "$minor" -eq "$min_minor" ] && [ "$patch" -lt "$min_patch" ]; then
      outdated=yes
    fi
  fi

  if [ -n "$outdated" ]; then
    die "Frodon needs Bun $MINIMUM or newer — this is Bun $version.

Bun $MINIMUM is where the PTY API behind Frodon's terminals landed; on
anything older the terminal windows can't open.

  Upgrade:  bun upgrade"
  fi
fi

# npm and bun both install a bin as a symlink in node_modules/.bin, and \$0 is
# the path used to invoke it — the link, not the file. Walk to the real one so
# index.js is looked up next to the launcher rather than next to the link.
target=$0
while [ -L "$target" ]; do
  link=$(readlink "$target")
  case $link in
    /*) target=$link ;;
    *) target=$(dirname -- "$target")/$link ;;
  esac
done
dir=$(CDPATH='' cd -- "$(dirname -- "$target")" && pwd)

exec bun "$dir/index.js" "$@"
