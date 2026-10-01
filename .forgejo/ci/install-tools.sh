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

DOWNLOAD_CACHE_DIR=/root/.cache/ci-downloads

CLAUDE_TGZ_SHA256=010258658ab7a0aa09ea992cb2a314689e25ce42854c57d6993e3136097039d5
CLAUDE_BIN_SHA256=0399c793ff571d5946ef923d80b4f330d05ac4b6842a6b0775468f5d389403c0
CLAUDE_CACHE_DIR=/usr/local/lib/claude-code

BUN_VERSION=1.3.13
BUN_SHA256=79c0771fa8b92c33aae41e15a0e0d307ea99d0e2f00317c71c6c53237a78e25a
CLAUDE_CODE_VERSION=2.1.267

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# fetch <url> <sha256> <dest> — the only way this script downloads anything.
fetch() {
  # Not `cached`: POSIX sh has no locals, and install_claude() keeps its own
  # path in `cached` across its fetch() call (INFRA-192 overwrote it).
  fetched="$DOWNLOAD_CACHE_DIR/$2"
  if [ -f "$fetched" ]; then
    cp "$fetched" "$3"
    if echo "$2  $3" | sha256sum -c --quiet - >/dev/null 2>&1; then
      echo "$(basename "$1"): restored from the runner cache, digest verified"
      return 0
    fi
    echo "cached $(basename "$1") failed its digest check: discarding it and downloading fresh" >&2
    rm -f "$fetched"
  fi
  curl -fsSL --retry 3 -o "$3" "$1"
  echo "$2  $3" | sha256sum -c --quiet -
  mkdir -p "$DOWNLOAD_CACHE_DIR"
  cp "$3" "$fetched"
}

apt_install() {
  DEBIAN_FRONTEND=noninteractive apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "$@" >/dev/null
}

install_bun() {
  fetch "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64.zip" \
    "$BUN_SHA256" "$tmp/bun.zip"
  # node:22-trixie ships unzip, so this costs nothing today; it keeps a
  # slimmer image from failing every job that installs bun (argus, #107).
  command -v unzip >/dev/null || apt_install unzip
  unzip -q -o "$tmp/bun.zip" -d "$tmp"
  install -m 0755 "$tmp/bun-linux-x64/bun" /usr/local/bin/bun
  bun --version
}

# npm, not bun: the package's postinstall picks the platform's native binary,
# and bun does not run lifecycle scripts for dependencies it has not been told
# to trust.
install_claude() {
  cached="$CLAUDE_CACHE_DIR/claude"
  if [ -f "$cached" ] && echo "$CLAUDE_BIN_SHA256  $cached" | sha256sum -c --quiet - 2>/dev/null; then
    echo "claude ${CLAUDE_CODE_VERSION}: restored from the runner cache, digest verified"
  else
    if [ -e "$CLAUDE_CACHE_DIR" ]; then
      echo "restored claude binary failed its digest check: discarding it and downloading fresh" >&2
      rm -rf "$CLAUDE_CACHE_DIR"
    fi
    fetch "https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-${CLAUDE_CODE_VERSION}.tgz" \
      "$CLAUDE_TGZ_SHA256" "$tmp/claude.tgz"
    tar -xzf "$tmp/claude.tgz" -C "$tmp" package/claude
    echo "$CLAUDE_BIN_SHA256  $tmp/package/claude" | sha256sum -c --quiet -
    install -D -m 0755 "$tmp/package/claude" "$cached"
  fi
  install -m 0755 "$cached" /usr/local/bin/claude
  claude --version
}

case "${1:-}" in
  test)
    # No apt up front: install_bun() runs it only if the image lacks unzip.
    install_bun
    ;;
  review)
    # No apt up front: node:22-trixie already has unzip, and the update alone
    # was ~11 s of every review. install_bun() falls back to apt if it is not.
    install_bun
    install_claude
    ;;
  *)
    echo "usage: $0 test|review" >&2
    exit 2
    ;;
esac
