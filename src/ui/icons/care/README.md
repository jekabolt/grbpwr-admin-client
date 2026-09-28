# Care symbols

39 laundry symbols, one per care code, drawn as a single family:
108×108 viewBox, solid black fill (`LDS` alone is drawn as a 6.39 stroke of the
same weight). Filenames are the care CODE, which is also the key in
`care-artwork.ts` and the value that prints on the sewn tag.

The codes themselves are not defined here or in `care-artwork.ts` — they are
backend data (`care_symbol`, served in `GetDictionary().careSymbols`). This
directory only answers "what does that code look like".

## Source

The brand's own care iconset (`care-iconset`, 2026-09). The delivered files are
named `<CODE>-<description>.svg`; they are stored here under the bare code.
Two things in the delivery are not used:

- `BA-bleach-prohibited` — a second drawing of `DNB`; `BA` is
  `BA-bleach-allowed`.
- `IA-iron-temp-any` — there is no `IA` code in the dictionary. Adding it means
  a `care_symbol` row first, then a file and a map entry here.

`HW` is delivered as `HW-wash-machine-normal`; the drawing is the hand-wash tub,
which is what `HW` means — only the filename is wrong.

It replaced a set derived from Tabler Icons (24×24, 2px stroke).

## Rendering

Every consumer renders these through `<img>` at a fixed size, so the intrinsic
`width`/`height` of 108 never shows. The fill is literal black: there is no
`currentColor`, so a dark surface needs an explicit `invert`, not a text colour.
