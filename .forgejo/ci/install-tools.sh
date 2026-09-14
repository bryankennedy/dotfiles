#!/bin/sh
# The pinned toolchain this repo's Forgejo Actions jobs need, installed into a
# node:22-trixie job container (root, Debian 13). See docs/claude-review.md.
#
#   sh .forgejo/ci/install-tools.sh test     bun (bun test tests/)
#   sh .forgejo/ci/install-tools.sh review   bun, Claude Code (the PR reviewer)
#
# Shell rather than Node because this is the script that puts bun on the box.
#
# Every downloaded binary is checked against a LITERAL digest: a checksum
# fetched from the same release as the artefact is not an independent check.
# To bump one, download the artefact on your own machine, hash it, compare that
# with the release's published sums, and paste the digest here with the
# version. tests/invariants/forgejo-ci.test.js refuses a digest that is not 64
# lowercase hex, and any download that skips fetch().
#
# Claude Code comes from npm pinned by version, not by hash: hash-pinning would
# mean pinning every transitive dependency too.
set -eu

BUN_VERSION=1.3.13
BUN_SHA256=79c0771fa8b92c33aae41e15a0e0d307ea99d0e2f00317c71c6c53237a78e25a
CLAUDE_CODE_VERSION=2.1.267

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# fetch <url> <sha256> <dest> — the only way this script downloads anything.
fetch() {
  curl -fsSL --retry 3 -o "$3" "$1"
  echo "$2  $3" | sha256sum -c --quiet -
}

apt_install() {
  DEBIAN_FRONTEND=noninteractive apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "$@" >/dev/null
}

install_bun() {
  fetch "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64.zip" \
    "$BUN_SHA256" "$tmp/bun.zip"
  unzip -q -o "$tmp/bun.zip" -d "$tmp"
  install -m 0755 "$tmp/bun-linux-x64/bun" /usr/local/bin/bun
  bun --version
}

# npm, not bun: the package's postinstall picks the platform's native binary,
# and bun does not run lifecycle scripts for dependencies it has not been told
# to trust.
install_claude() {
  npm install --global --no-fund --no-audit --loglevel=error "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"
  claude --version
}

case "${1:-}" in
  test)
    apt_install unzip
    install_bun
    ;;
  review)
    apt_install unzip
    install_bun
    install_claude
    ;;
  *)
    echo "usage: $0 test|review" >&2
    exit 2
    ;;
esac
