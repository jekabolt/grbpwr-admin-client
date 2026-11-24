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

## Graph walk instead of the fill (experiment, 24 Nov)

An outline of one size is walked, not filled: the size's own chains, the chains of role `common`,
and stretches where the chains of six or more size classes coincide within 0.3 mm. Ends are joined;
where two sides meet at an angle the vertex is the intersection of the two sides (the ends are
extended to it or cut back to it). No walls, no flood. Script: `walk-carry.mjs`.

On the reference set (six pieces of Leah and Kalla, snapshots taken with `ROW_KEEP=1`), 82 ok sizes,
by the largest deviation from the owner's outline:

| Largest deviation | Before corners | With corners |
| --- | ---: | ---: |
| up to 1 mm | 23 | 49 |
| 1–3 mm | 14 | 12 |
| over 3 mm | 36 | 12 |
| no closed walk | 9 | 9 |

"Same outline" by "97 % of the perimeter within 0.6 mm" gave 65 of 82 before corners. That measure
hides a local miss of several millimetres at a corner; use the largest deviation.

Of the 16 sizes the owner marked bad, the walk (before corners) fixed 8 by eye, went wrong at a
corner on 4 and did not close 4. Pictures: `walk-leah-g.png`, `walk-kalla-f.png`, `walk-kalla-d.png`.

### Open cells of the 75 files

Lower bound: the 75 snapshots were taken WITHOUT `ROW_KEEP`, so the rows of marks the decoration
filter drops are not in them. On the two files that have both kinds of snapshot the clean closures
are 6 without it and 10 with it.

| Outcome, 1151 open cells in 52 files | Cells |
| --- | ---: |
| Closed from printed lines and built corners only, nests between its neighbours | 155 |
| The same, nesting broken | 14 |
| Closed with a smooth stretch carried from a neighbour | 95 |
| Closed with a corner carried from a neighbour | 76 |
| No closed walk | 505 |
| No closed size in the piece | 175 |
| No line of the size near the piece | 131 |

One file closes whole (Spokane, one open cell). Four more are left with two or three cells
(Asheville, Valentina, Alassio, Corella). The 155 are checked by nesting only; on the reference set
about one walked outline in five is more than 1 mm off somewhere. `walk-open-kalla.png` shows nine
of them.

### Pieces with no closed size

175 open cells sit in 13 pieces of 8 files where the fill closes no size at all, so there is no
neighbour to lean on. `walk-carry.mjs lone` walks every size round the piece label (the label
position comes from the bench output), draws nothing, and among the walks that go round the label
takes the one with the largest share of own line.

Checked first on the 82 verified sizes, without any neighbour: 49 within 1 mm, 9 within 1–3 mm,
4 over 3 mm, 20 not closed. Taking the smallest enclosing walk instead gave 24 within 1 mm: it
picks an inner line.

| File (snapshots without `ROW_KEEP`) | Pieces | Cells | Closed | Area grows with the size |
| --- | ---: | ---: | ---: | ---: |
| Kalla MDF346 | 1 | 18 | 12 | 12 |
| Memoir B MDF364 | 2 | 36 | 9 | 9 |
| Georgina MDF354 | 1 | 18 | 8 | 8 |
| Sedona MDF549 | 1 | 9 | 2 | 0 |
| Venice, Selenite, Lita, Clark | 8 | 94 | 0 | — |
| All | 13 | 175 | 31 | 29 |

On the Kalla snapshot taken with `ROW_KEEP` the back yoke closes 16 of 18 sizes, all in order of
area (`walk-kalla-back-yoke.png`); one of them carries a rectangular mark of the left edge in its
outline.

What the pieces that close nothing are (looked at one by one):

- **Venice J POCKETS** is drawn once for every size: one outline, half of it in role `common` and
  half in `internal`, no size line (`walk-venice-pockets.png`). A walk over the lines that carry no
  size closes it round the label: 669 mm, 302 cm². That is 18 cells with one outline.
- **Selenite J, K, L, M** are not pieces on the sheet. Their four labels stand in a column beside a
  small cutting diagram of rectangles and a quarter circle (`walk-selenite-diagram.png`). 36 cells
  are open for a drawing that is not there at full size.
- **Clark H POCKET LINING, I POCKET WELT** look drawn once too, in a `common` line
  (`walk-clark-pocket-lining.png`); the walk does not close them yet, cause not found. 32 cells.
- **Lita (no label), Sedona**: not explained. A wider straight join (6 or 10 mm instead of 3) does
  not help any of these and does not change the accuracy on the verified outlines.

Across all 75 files (`by-measure.mjs`, `walk-carry.mjs plainscan`):

- Pieces cut by measurements: only the four of Selenite. The text beside their labels says "Cut a
  rectangle / a strip of fabric with the following dimensions", one side given in inches (4, 8, 10)
  and the other as "Your waist circumference x 2" or "Petticoat hem measurement x 2.5"; the fourth
  is a spoken alteration of another piece. 36 open cells that have no outline to close.
- Pieces drawn once for every size, among the pieces with open cells: Venice J POCKETS only (18
  cells); Clark's two pocket pieces are the likely others (32). The scan also returned the tile
  frame as an "outline" in three files (978 mm, 585 cm², the same in each): a size-less loop the
  size of a page is the frame, not a piece.

So 36 open cells are not missing lines at all and 18 to 50 more need one shared outline: 5–7 % of
the 1151.

### Completion from a neighbour size (hold-out)

`complete-holdout.mjs`: on 544 ok sizes of 47 pieces a stretch of 30, 60 or 90 mm is hidden at
eight places and redrawn, 13 056 trials. Share of stretches redrawn within 0.5 mm:

| Stretch | Straight bridge | One neighbour | Two neighbours |
| --- | ---: | ---: | ---: |
| 30 mm | 76 % | 87 % | 87 % |
| 60 mm | 52 % | 78 % | 80 % |
| 90 mm | 39 % | 68 % | 71 % |
| smooth (turn under 20°) | 69 % | 89 % | 89 % |
| with a corner (turn 45° or more) | 0.3 % | 29 % | 34 % |

The median error from a neighbour is 0.1 mm. One closed neighbour is nearly as good as two. Inside
the walk the carried stretch is not yet reliable (2 of 10 verified sizes within 1 mm): the walk
picks the wrong pair of ends to connect. The 95 and 76 cells above are therefore not counted as
closed.

Three ways of combining the walk with the completion were tried. Binning the lines by the
neighbour's arc length cuts corners by 2–5 mm; keep whole printed edges.

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
| `walk-material.mjs`, `walk-missing.mjs` | Is the material for a verified outline in the raw paths; what lies where it is missing |
| `walk-size.mjs`, `walk-open.mjs` | The walk without corners, on the reference set and on open cells |
| `walk-carry.mjs` | The walk with built corners and neighbour-carried joins (`ref` and `open` modes) |
| `complete-holdout.mjs` | Hide a stretch of a verified outline, redraw it from neighbours, measure |
| `by-measure.mjs` | Pieces cut by measurements, found by the text beside the label |
| `walk-viz.mjs`, `walk-open-viz.mjs` | Pictures: reference against the walk; open cells the walk closed |
