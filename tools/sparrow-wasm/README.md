# sparrow-wasm

Thin wasm-bindgen wrapper around [sparrow](https://github.com/JeroenGar/sparrow) (MIT, pinned to
commit `67bfaf88f8ff9dca6607c1fa9737bb2006e06517`) and jagua-rs 2.0.0 (MPL-2.0, unmodified).
Its output is committed at `src/lib/nesting/sparrow/pkg/`; `yarn build` never needs Rust.

API (`--target web`, single-threaded):

```ts
solve(instance_json: string, seconds: number, seed: number, on_report: (report_json: string) => void): string
```

- `on_report` gets every feasible solution (`ExplFeas`, `CmprFeas`, `Final`) as
  `{kind, elapsed_sec, strip_width, solution}`; a throwing callback is ignored.
- returns `{solution, elapsed_sec}`; bad input throws a JS `Error`.
- `seconds` is the whole wall-clock budget of the call, instance import included (~1 s for 45
  outlines); `elapsed_sec` counts from the call. Overrun is at most one separator strike (~0.5 s).

Rebuild (Rust per `rust-toolchain.toml` + `wasm32-unknown-unknown`, `wasm-bindgen-cli` 0.2.130):

```sh
scripts/build-sparrow-wasm.sh --clean   # honors RUSTUP_HOME / CARGO_HOME
yarn sparrow:smoke                      # Node check of the committed pkg
```

The build is reproducible: same toolchain + `Cargo.lock` give a byte-identical `.wasm` (local
cargo/crate paths are remapped out of panic messages). Check the printed sha256 against the
committed file before committing a rebuild.
