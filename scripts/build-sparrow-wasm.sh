#!/usr/bin/env bash
# Rebuild src/lib/nesting/sparrow/pkg from tools/sparrow-wasm (sparrow + jagua-rs -> wasm).
# Only needed when the Rust wrapper or the pinned sparrow commit changes; `yarn build` uses the
# committed pkg and never needs Rust.
#
# Needs: rustup toolchain from tools/sparrow-wasm/rust-toolchain.toml (>= 1.90, wasm32 target)
# and wasm-bindgen-cli exactly matching the crate (cargo install wasm-bindgen-cli --version 0.2.130).
# RUSTUP_HOME / CARGO_HOME are honored, so an isolated toolchain works:
#   RUSTUP_HOME=/path/rustup CARGO_HOME=/path/cargo scripts/build-sparrow-wasm.sh
# Pass --clean to wipe tools/sparrow-wasm/target first.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CRATE="$ROOT/tools/sparrow-wasm"
OUT="$ROOT/src/lib/nesting/sparrow/pkg"
BINDGEN_VERSION="0.2.130"
MIN_RUST_MINOR=90

if [ -n "${CARGO_HOME:-}" ]; then
  PATH="$CARGO_HOME/bin:$PATH"
  export PATH
fi

die() { echo "build-sparrow-wasm: $*" >&2; exit 1; }

command -v cargo >/dev/null 2>&1 || die "cargo not found (set CARGO_HOME or install rustup)"
command -v wasm-bindgen >/dev/null 2>&1 ||
  die "wasm-bindgen not found: cargo install wasm-bindgen-cli --version $BINDGEN_VERSION --locked"

cd "$CRATE"

# rustc as resolved by rust-toolchain.toml inside the crate dir.
RUSTC_VERSION="$(rustc --version)" || die "rustc failed (is the toolchain from rust-toolchain.toml installed?)"
RUST_MINOR="$(echo "$RUSTC_VERSION" | sed -E 's/^rustc 1\.([0-9]+)\..*/\1/')"
case "$RUST_MINOR" in
  '' | *[!0-9]*) die "cannot parse rustc version: $RUSTC_VERSION" ;;
esac
[ "$RUST_MINOR" -ge "$MIN_RUST_MINOR" ] || die "need rustc >= 1.$MIN_RUST_MINOR, got: $RUSTC_VERSION"
rustc --print target-list >/dev/null
if command -v rustup >/dev/null 2>&1; then
  INSTALLED_TARGETS="$(rustup target list --installed)"
  case "$INSTALLED_TARGETS" in
    *wasm32-unknown-unknown*) ;;
    *) die "target missing: rustup target add wasm32-unknown-unknown" ;;
  esac
fi

BINDGEN_GOT="$(wasm-bindgen --version)"
[ "$BINDGEN_GOT" = "wasm-bindgen $BINDGEN_VERSION" ] ||
  die "need wasm-bindgen $BINDGEN_VERSION, got: $BINDGEN_GOT"

if [ "${1:-}" = "--clean" ]; then
  rm -rf "$CRATE/target"
fi

echo "build-sparrow-wasm: $RUSTC_VERSION, $BINDGEN_GOT"
# Panic messages embed source paths; remap the machine-specific ones (cargo registry / git
# checkouts, this crate) so the .wasm carries no local paths and is the same on every machine.
# CARGO_ENCODED_RUSTFLAGS (0x1f-separated) keeps paths with spaces intact.
CARGO_DIR="${CARGO_HOME:-$HOME/.cargo}"
SEP="$(printf '\037')"
unset RUSTFLAGS
CARGO_ENCODED_RUSTFLAGS="-Ctarget-feature=+simd128${SEP}--cfg${SEP}getrandom_backend=\"wasm_js\"${SEP}--remap-path-prefix=$CARGO_DIR=/cargo${SEP}--remap-path-prefix=$CRATE=/sparrow-wasm"
export CARGO_ENCODED_RUSTFLAGS
cargo build --release --locked --target wasm32-unknown-unknown

mkdir -p "$OUT"
wasm-bindgen --target web --out-dir "$OUT" \
  "$CRATE/target/wasm32-unknown-unknown/release/sparrow_wasm.wasm"
rm -f "$OUT/package.json" "$OUT/.gitignore"

ls -l "$OUT"
shasum -a 256 "$OUT/sparrow_wasm_bg.wasm"
