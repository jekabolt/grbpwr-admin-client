# Care symbols

39 laundry symbols, one per care code, drawn as a single family: 24×24 viewBox,
2px stroke, round caps and joins, `#000`. Filenames are the care CODE, which is
also the key in `care-artwork.ts` and the value that prints on the sewn tag.

The codes themselves are not defined here or in `care-artwork.ts` — they are
backend data (`care_symbol`, served in `GetDictionary().careSymbols`). This
directory only answers "what does that code look like".

They replaced a set assembled from four different sources, which had five
coordinate systems (375, 120, 122, 20157 and 512 units), seven stroke weights,
mostly no `viewBox`, and one symbol filled `#58595b` instead of black. At the
24px they are actually used at, that read as a different icon set per category.

## Source

[Tabler Icons](https://tabler.io/icons) 3.46.0, MIT licensed, outline set.
30 of the 39 are Tabler icons unchanged:

| care code | tabler icon | | care code | tabler icon |
| --- | --- | --- | --- | --- |
| MWN | `wash` | | TDN | `wash-tumble-dry` |
| MW30 | `wash-temperature-1` | | TDL | `wash-dry-1` |
| MW40 | `wash-temperature-2` | | TDM | `wash-dry-2` |
| MW50 | `wash-temperature-3` | | TDH | `wash-dry-3` |
| MW60 | `wash-temperature-4` | | DNTD | `wash-tumble-off` |
| VGW | `wash-gentle` | | LD | `wash-dry-hang` |
| HW | `wash-hand` | | DF | `wash-dry-flat` |
| DNW | `wash-off` | | DD | `wash-dry-dip` |
| BA | `bleach` | | IL | `ironing-1` |
| NCB | `bleach-no-chlorine` | | IM | `ironing-2` |
| DNB | `bleach-off` | | IH | `ironing-3` |
| DCAS | `wash-dry-a` | | DNI | `ironing-off` |
| DCPS | `wash-dry-f` | | DNS | `ironing-steam-off` |
| DCASE | `wash-dry-p` | | DNDC | `wash-dryclean-off` |
| PWC | `wash-dry-w` | | | |

## Derived

Tabler has no icon for the remaining 9. Each is composed from Tabler's own
paths, on the same grid, so they stay part of the family:

- **GW** — `wash-gentle` with the second bar dropped. Tabler's `wash-gentle`
  carries two bars, which is ISO *very* gentle; gentle is the same tub with one.
- **DIS, LDS, DFS, DDS** — the base drying symbol plus one diagonal tick in the
  **bottom-left** corner. ISO puts the "in the shade" diagonal top-left, but
  Tabler's line-dry arc runs the full width of the top edge, so the two cannot
  share that corner. Bottom-left is free under every drying mark. `DIS` uses the
  same tick rather than Tabler's `wash-dry-shade` (two long diagonals) so all
  four read as one family instead of three plus an exception. `DDS`'s three
  strokes are shortened from `v10` to `v8` to clear the tick.
- **GDC, VGDC, GPWC, VGPWC** — the letter circle over one or two bars. The
  circle is scaled to `0.77` to make room; the group carries `stroke-width`
  `2 ÷ 0.77` so the *rendered* stroke stays 2. Every professional-care symbol is
  scaled by the same amount, including the ones with no bars — sizing the
  bar-less ones differently is the inconsistency this set exists to remove.
- **DNWC** — `wash-dryclean-off` plus the W from `wash-dry-w`. Without the
  letter, "do not wet clean" and "do not dry clean" would be the same picture.

## Not label artwork

These are UI affordances for picking a code, not the artwork that goes to the
label printer. They are Tabler's stylisation, not the literal ISO 3758 / GINETEX
glyphs — the arc for line-dry and the wavy water line in the tub are Tabler's,
and the GINETEX symbols are trademarked and separately licensed. What is stored
and what the factory prints is the CODE.
