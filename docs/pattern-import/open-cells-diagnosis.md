# Open cells: what the snapshots say (23–24 Nov 2026)

Read-only measurements on the 75 saved pieces snapshots (`.runs/snap-set40`, `.runs/snap-holdout40`)
and on the owner's reference set (`scripts/pattern-import/reference.json`, worktree `reference-set`:
548 ok sizes, 63 bad). Nothing here changes the product. The scripts are in
`scripts/pattern-import/diag/`; each takes snapshot folders and runs in about a minute.

A cell is one piece at one size. "Own line" means a chain of the cell's own size class within the
stated distance.

## Where the 75 files stop

| Stop | Files |
| --- | ---: |
| Pieces: open outlines | 52 |
| Waiting for an operator answer (fold 5, quantity 3, missing pages 3, grainline 1, size map 1) | 13 |
| Reached apply | 7 |
| Check: the gate blocks (G5-features 4, G22-identity 4) | 5 |
| Meaning: a piece cannot be built | 2 |
| Sheet: tile placement refused | 1 |

A file that waits only for an operator answer counts as passing (owner, 16 Nov), so 20 of 75 pass.

## The open cells are missing sides, not gaps

1151 open cells: 1028 leak, 84 refused, 39 tiny. 847 of them carry a grade prediction.

- The longest stretch with no own line within 1.5 mm of the prediction is at most 12 mm in 21 cells
  and at least 200 mm in 675. The median cell lacks its own line on about 55 % of the perimeter.
- Along the prediction: own line 42.2 % of the length, another size 16.8 %, nothing 20.1 %,
  `ignore` 6.6 %, neighbour size 6.2 %, marks 4.0 %, unassigned 2.9 %.
- 64 % of the missing length lies on some chain. Fragments shorter than 8 mm are 7.8 % of it.
- On closed cells the same method finds the own line on 88.9 % of the outline and "nothing" on 0.0 %.

One cause per cell:

| Cause | Cells |
| --- | ---: |
| Own line absent, other lines there, shared-line evidence below 90 % | 469 |
| No prediction (not-bracketed 153, sizes-not-distinguished 81, tiny 39) | 304 |
| More than half of the missing length is on no chain | 265 |
| Shared-line evidence covers at least 90 % of the gap | 88 |
| Own line complete, the fill still leaks | 25 |

No single cause frees more than one file. The best pair frees 8, the best triple 24. 50 of the 52
files hold two or more causes; the median file has 19 open cells on three or more pieces.

## The "no chain" group is a shifted prediction

In those 265 cells, 66 % of the off-chain length runs parallel to a chain 2.4–4.9 mm away (median
3.3 mm), and 63 % of that is the cell's own line. With a prediction interpolated between two closed
neighbours the share is 77 %. The corner-to-corner prediction measured in `family-fit.md` is about
0.5 mm.

## Shared lines

- On verified-ok outlines, 10 % of the sizes have their own line on less than half the perimeter.
  Where an ok outline is not on its own line, about 80 % of that length is a chain given to one
  other size and about 20 % is a non-size chain. 86–98 % of it carries eight or more sizes.
- Two layered files of the same publisher (Cerise MDF290, Heywood MDF289, 18 size layers): each size
  layer has one dash pattern on 96–100 % of its length, 72–76 % of its length coincides with no
  other layer, and 16–25 % coincides with all 17 others. The shared edge is drawn once in every
  size's layer. Each outline is a single closed PDF path.
- In the corpus, the length where the lines of nearly all sizes coincide is 22 % (median) in the 23
  files that do not stop on Pieces and 0 % in the 52 that do. The shortest size line is 0.89 of the
  median size line in the first group and 0.69 in the second.
- "A line with closed outlines of three or more sizes on it serves every size" covers 45.5 % of the
  missing length, 88 cells at 90 % or more, and no whole file.

## Rows of marks

- In the 52 stuck files 48 % of the sizes are told apart by a recovered motif (rows of printed
  shapes) and 51 % by a declared dash; in the other 23 files it is 9 % and 86 %.
- All 123 look-alike pairs differ in the shape of their legend marks. Legend marks match the marks
  on the size's own lines for 354 of 359 sizes.
- Do not compare marks by point count. One circle comes out with 13 points in the legend and 9 on
  the sheet, which made size 6 "vote" for size 18.
- A shape vote on shape-row chains agrees with the assigned size on 97.8 % of the decided chains.
  On the reference set it catches no rank errors.
- About 260 000 small marks in the stuck files are in no size chain and get a size by shape; they
  cover 17.5 % of the missing length (24.9 % in the "own line absent" group).

### Why the row is lost (Leah, piece A, left edge)

`linkItems` in `src/lib/pattern-import/chains/link.ts` builds the right row (118 triangles of size 0,
step 2.27 mm, the legend says 2.25) and then drops it in the filter "a row that hugs other lines all
along is their decoration". On a shared edge a size's row lies on every other size's line by
construction. `docs/pattern-import/leah-a-left-edge-shapes.png` shows the same strip of marks split
by shape; `leah-a-size0-loose-ends.png` shows where the size 0 line stops.

Experiment `ROW_KEEP=1` (worktree `grbpwr-admin-client-wt-shaperows`, not committed): a row of at
least 20 marks over at least 40 mm with an even step is kept.

| | Kalla MDF346 | Leah MDF349 |
| --- | ---: | ---: |
| Marks moved from no chain to a size chain | 24 706 | 5 132 |
| Mean share of a closed outline on its own line | 74.7 → 82.1 % | 79.8 → 85.0 % |
| Cells better by 5 points or more | 40 | 20 |
| Cells worse by 5 points or more | 14 | 4 |
| Closed cells | 261 → 263 | 110 → 111 |

13 of the 18 worse cells moved 0.5–2 mm onto the rebuilt row of size 6. Switching `lonePortions` off
(`LONE_OFF=1`) does not bring them back; the mechanism is not known. No kept row was decoration.
A first attempt that grouped marks by shape before `chainBeads` lost 18 closed cells on Leah.

## Where bad outlines come from (reference set)

| How the cell was closed | ok | bad | bad share |
| --- | ---: | ---: | ---: |
| class | 460 | 45 | 9 % |
| innerPlug | 54 | 14 | 21 % |
| other (continuity, printed motif, repair) | 34 | 4 | 11 % |

Repairs with derived segments: 18 ok, 0 bad. Nest state `confirmed`: 87 ok, 2 bad. For `class`
cells, "a stretch of 12 mm or more off the own line" flags 37 of 45 bad and 114 of 460 ok.

## Tried and dropped

- Geometry-only detectors of a wrong outline on the reference set: at best 20 of 25 bad with 65 of
  210 ok flagged.
- "The users of a line form a contiguous block of sizes": 94 % on tune, 60 % on confirm.
- Snapping the missing stretch to the nearest printed stroke within 1, 2 or 3 mm: 229 → 487 cells
  fully on strokes, but the clean and unambiguous ones fall from 61 to 28.
- "The `ignore` class in a size's pen holds lost size lines": 67 % of its length doubles one size's
  own line.
- Size layers (OCG): present in 4 of 692 PDFs of the archive.

## Scripts (`scripts/pattern-import/diag/`)

| Script | Answers |
| --- | --- |
| `open-cells.mjs` | What lies along the prediction of every open cell |
| `pred-shift.mjs` | Off-chain stretches: shifted prediction, unchained ink, nothing |
| `shared-cover.mjs` | Shared-line evidence on the missing stretches |
| `snap-to-stroke.mjs` | Upper bound of snapping to the nearest printed stroke |
| `ref-own-line.mjs`, `ref-shared-lines.mjs` | The same metrics along the reference outlines |
| `pens.mjs`, `coincide.mjs` | How sizes are told apart; how much size lines coincide |
| `legend-shapes.mjs`, `legend-vs-sheet.mjs`, `shape-vote.mjs`, `loose-marks.mjs` | Mark shapes |
| `ocg-layers.ts` | Line ownership per PDF layer (run with `npx vite-node`) |
| `own-share.mjs`, `outline-shift.mjs`, `outline-why.mjs`, `mark-flow.mjs`, `cells-cmp.py` | Two runs compared |
| `viz-size.mjs`, `strip-shapes.mjs` | Pictures of one size's lines and of a strip of marks |
| `walk-pen.mjs`, `walk-open-ends.mjs` | Closed outlines of one pen from raw sheet paths, judged by layers |
