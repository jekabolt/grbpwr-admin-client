# Open lines: the plan

Approved by the owner on 24 Nov 2026. The findings it rests on are in
[open-cells-diagnosis.md](open-cells-diagnosis.md); the scripts are in `scripts/pattern-import/diag/`.

## Goal

Draw every size's outline on its own printed lines: no jump onto another size's stroke, corners
built where the two sides meet, missing lines drawn in from evidence. The graph walk is the main
means; the fill stays where a feature of the piece says it is the better tool. A count of closed
cells alone is not progress. Judge by outlines that are right on the owner's reference set, by the
share of each outline on its own line, and by files that get through.

The operator is called on disputed cases only and chooses between finished variants; the operator
does not draw. The manual "close the gap" (the `bridge` tool on the pieces step) and the automatic
gap close are to be retired once the walk closes gaps inside line drawing (stages 3–5) and the
variant choice covers what is left. The first definition of a disputed case and the retirement
order are in `src/lib/pattern-import/CLAUDE.md` (owner, 25 Nov).

## Rules

1. Every stage ends in a change the owner can see in the admin on the files he usually checks
   (Leah, Cassandra, Dyanna, Kalla), or in "we drop this". No measurement without a decision that
   depends on it.
2. Every change is accepted on three numbers: zero verified-ok outlines of the reference set moved
   by more than 1 mm; zero cells opened on the four control files; files that reach DXF.
3. No environment switches in product code: the browser has none. A switch is a `ChainOpts`
   parameter with "try, keep only if better", as `dashTrains` in `chains/build.ts`.
4. No new point rules in the fill.
5. Product code is written in a separate worktree and merged into the main checkout when no
   replay is running on it.

## Where the code is

| What | Branch | State |
| --- | --- | --- |
| Diagnosis, scripts, pictures, this plan | `fix-pattern-pdf-open-lines` (PR #470) | pushed |
| Stages 1A and 2 | `open-lines-rows`, commit `aacf5976f` | merged into the PR head 25 Nov on the owner's word |
| Measurement switches for the bench (`LONE_OFF`, `INNER_PLUG_OFF`, outlines in the bench output) | `open-lines-bench-switches`, commit `deb6b2824` | pushed, not for merging |
| The owner's reference set (`scripts/pattern-import/reference.json`, 50 pieces, 548 ok and 63 bad sizes), `family-fit.md`, `family-research/` | `reference-set`, commit `c2aa54469` | merged into the PR head 25 Nov on the owner's word |

## Stages

### 0. The owner checks the walk's outlines by eye — done 25 Nov: the walk stays, with three faults

Pictures in this folder: `walk-open-kalla.png` (nine open cells the walk closed),
`walk-kalla-back-yoke.png` (a piece with no closed size, 16 of 18 sizes), `walk-leah-g.png` and
`walk-kalla-f.png` (bad outlines against the walk), `one-outline-venice-pockets.png`,
`walk-selenite-diagram.png`, `walk-clark-pocket-lining.png` (what kind of piece it is).
If the owner rejects the walk's outlines, stages 3 to 5 are dropped and 1 and 2 stay.

The owner's answer (25 Nov), per picture:

- `walk-open-kalla.png`: the outlines look right.
- `walk-leah-g.png`, `walk-kalla-f.png`: the walk mends what the fill got wrong (it leaked onto
  other lines), but the fill's corners are the right ones and the walk's are not. To mend before
  the walk is ported (stage 3). First look at Kalla F: sizes 2, 6, 10, 14, 18 have no size chain at
  the corner at all — their corner strokes sit in chains of no row; not yet followed to the cause.
- `walk-kalla-back-yoke.png`: two sizes (0 and 26) are not drawn, and on the shared top line the
  sizes are one solid line with nothing to tell them apart. Both to be checked against the sheet.
- `walk-selenite-diagram.png`: nothing of the piece is on the sheet — holding it back is right.

### 1A. The sizes step shows the rows of marks — done

A size drawn as a row of printed shapes loses the stretches where the row runs on other lines:
`linkItems` (`chains/link.ts`) takes such a row for decoration. A second read with
`ChainOpts.keepRows` keeps long even rows, and the marks that no line of the plain read holds are
shown under their size row (`shownOnlyRows` in `chains/build.ts`, sent out by the chains stage in
`worker/session.ts`). The chain set every later stage reads is not touched.

Checked: on Leah and Kalla the chains and classes at the pieces entry are the same as before. Leah
shows 40 rows, 7.7 m, for sizes 0, 6 and 14; on the left edge of piece A size 0 gets 372 mm.
Cost: the lines step reads the sheet twice (Leah +10 s, Kalla +30 s).

### 2A. Pieces cut by measurements are held back — done

A label whose text gives the piece as dimensions ("Cut a rectangle of fabric with the following
dimensions", "Your waist circumference x 2") seeds no piece; it is a set-aside with reason
`by-measure` and the quoted line (`byMeasureSeeds` in `pieces/seeds.ts`). Selenite: 108 cells with
40 open become 72 with 4. One line of wording was added on the pieces step.
Open: how the tech card should show a piece given as a formula is the owner's decision.

### 2B. A piece drawn once gets one outline — done

When none of a piece's sizes closed and one closed walk of size-less lines goes round its label,
every size gets that outline (`pieces/one-outline.ts`, called after `applyPrintedCuts` in
`pieces/fill.ts`, `rankFrom: 'one-outline'`). A page-sized walk is the tile frame.
Venice J POCKETS: 18 cells closed. Clark, Spokane, Alassio, Valentina and Leah are unchanged.
Clark H POCKET LINING and I POCKET WELT (branch `open-lines-lapped`, merged 25 Nov on the owner's
word, who saw both outlines): 92 → 124 of 128
closed. The sheet prints the outline once per size on the same place; the reader joined the 32
copies into one closed line that goes round 32 times (`oneLap`), and the fill had dropped that
line as a frame, so the pass now keeps out only the lines the operator excluded and refuses an
outline that holds another piece's label. Venice J keeps the same outline; Selenite is unchanged.
No other file of the 75 has a piece with no closed size.

### Housekeeping — open

- Done 25 Nov: `open-lines-rows` merged into `fix-pattern-pdf-open-lines` on the owner's word.
  The owner checked the Venice J picture the same day: correct.
- Done 25 Nov: `reference-set` merged into `fix-pattern-pdf-open-lines` on the owner's word; the
  check is `scripts/pattern-import/reference-check.ts` (how to run: `src/lib/pattern-import/CLAUDE.md`).
- The switches `PDF_LAYERS_OFF` and `SNAPSHOT_STAGE` (read a layered PDF with its layers hidden,
  snapshot at the sizes step) exist only in the `reference-set` worktree, uncommitted.
- Done 25 Nov: the stale "Where it stands" section of `src/lib/pattern-import/CLAUDE.md` is replaced,
  and the docs written before this plan are deleted.
- Re-capture the 75 files with snapshots once the rows are in. Every corpus number so far is a
  lower bound, because the saved snapshots were taken without them.

### 1B. The rows as walls of the fill — open

With the rows kept as real chains Kalla got 40 cells better, 14 worse and 10 opened: six sizes
stick to the rebuilt row of size 6. The rule that does it is not `lonePortions`. Next step: replay
the saved snapshot with each candidate's `walls` written out (branch `open-lines-bench-switches`
has the bench changes), find the rule, then let the rows into the fill.
Accepted when no cell opens, no cell's share of outline on its own line falls
(`diag/own-share.mjs`), and no verified outline moves.

### 3. The walk as a check beside the fill — open

Walk a size's own lines, the common lines and the stretches where four or more sizes coincide;
build each corner as the intersection of its two sides; draw nothing. Port
`diag/walk-carry.mjs` into `src/lib/pattern-import/pieces/` as a pure function with tests from the
reference set. After the fill, where its outline and the walk's differ by more than 1 mm over
12 mm or more and the walk lies on the size's own line, show both outlines to the operator.
Before porting: the walk has been checked on six reference pieces of fifty (Leah C, D, F, G,
Kalla D, F: 82 verified sizes). State on 25 Nov, after two changes in `diag/walk-carry.mjs`:
54 within 1 mm (was 46), none of the 46 moved.

- A side that ends ON another side meets it there (`TJOIN`): the other side is cut at that point,
  so the corner stands where the printed line stops. Before, the corner was the crossing of the
  two tangents, millimetres away when the angle is sharp (owner, 25 Nov: "the walk leaves the
  outline by several mm, critical"). Where the cut sides give no closed walk, the sides as printed.
- A stretch is shared from four coinciding sizes, not six (`SHARED_M`): in a file where half the
  sizes are rows of dots the reader did not assemble, six never coincide.
- The sheet prints a size as a thin line with a row of marks on it. The thin line is the outline;
  a line built through the marks (the second read with `keepRows`) cuts each corner by the chord
  between two marks, about 1 mm (`walk-viz.mjs` with `RAW_PATHS=1` shows every printed stroke).
  So the walk goes over the thin lines, and takes the second read's lines only for a size that
  closes on no walk over them (`ROWS_FALLBACK`, from `diag/rows-dump.ts --chains`; such a walk is
  marked `rows`). Kalla A BACK YOKE, no size closed by the fill: 17 of 18 closed (12 before the
  two changes above, 16 with them, 14 and 18 through rows; 26 has no line the reader gave it).
  Kalla D and F: unchanged. Leah C, D, F, G: three sizes that had no walk close (0.05, 1.14 and
  0.57 mm off the reference), none moved — 56 of the 82 within 1 mm. A `rows` outline is a
  candidate for the operator's case 2.
- Kalla F size 6: the walk's corner where the size's thin line meets the vertical is on the
  printed line; the reference outline is smooth there because it rides size 8's line. The owner
  saw it with the printed strokes drawn (25 Nov): correct.
- Kalla A size 26 stays open: its line is a row of dashes the reader put in `ignore` (316 mm of
  it between the outlines of 24 and 28; only the top and the fold edge are the size's). Giving the
  walk the unassigned lines between the two closed neighbours (`BAND=1`) found no walk in 8
  minutes: a hundred dashes with a gap after each is not a job for the walk's search. It is a
  job for the reader (the pen of size 26 is not recognised as a size) or for stage 5B.

Choosing between the two outlines without the operator: tried 25 Nov on all 50 reference pieces
(d8, branch `open-lines-walk`), not switched on. The walk alone: 328 of 548 ok sizes within 1 mm,
102 at 1–3 mm, 40 farther, 78 with no walk; weaker than the fill as a source of the outline. By
whose line the reader says it is (own / nobody's / another size's): 1 of 4 decided on six pieces,
wrongly (Leah F 20: the reader gave the size a neighbour's end line). By the closed neighbours
(`outlineVerdict`): of 39 ok sizes with two outlines, 3 wrong replacements, 24 undecided; of 18
bad, 3 mended; with stricter shares 1 wrong, 0 mended. It stays a mark in the data
(`walk.verdict`); the "two outlines" question goes. On 22 of 52 bad sizes the walk over the size's
own lines gives the same bad outline: the error is which line the reader gave to which size, above
both the fill and the walk. Corners are not the cause (`diag/corner-walls-ref.ts`: where an ok
outline follows both sides of a corner, the wall matches it within 1 mm on 359 of 363).
Next: a map of the reader's owner under every side of the reference outlines, ok and bad (d8).
A wrong silent choice goes to the DXF unseen; a needless question costs one click: any later
silent choice needs 0 MOVED/LOST on all 50 pieces with the choice applied before
`reference-check.ts` collects the outlines.

### 4. The walk closes what the fill leaves open — open

An open cell takes the walk's outline when it is made of printed lines and built corners only and
its area sits between its closed neighbours. As a proposal to the operator first. A piece with no
closed size is walked round its label (`walk-carry.mjs lone`), checked by area growing with the
size. Expected: at least 155 cells of 1151.

### 5. Smooth gaps completed from a neighbour size — open

Carry the same stretch of the nearest closed size between the two printed ends. Smooth stretches
only; a corner is built by intersection or goes to the operator. The drawn stretch is written on
its own DXF layer (owner, 11 Nov). The pairing of ends inside the walk is wrong today: 2 of 10
verified sizes within 1 mm, while the completion by itself has a median error of 0.1 mm.

### 5B. A whole side or a whole size not drawn — open

First tell it from the look-alikes: a row not assembled (stage 1), a line that is common or given
to another size (stages 3 and 4), a gap between two printed ends (stage 5). What is left, about
11 % of the missing length and 131 cells with no line of the size near the piece, is built between
two closed neighbour sizes, corner to corner. Ask the operator instead when the size is the first
or the last, when the piece has no closed size, or when the neighbours were themselves built.
Measured first: hide a whole side and a whole outline in `diag/complete-holdout.mjs`; accepted at
95 % of the bracketed sizes under half the distance to the nearest size.

### 6. The variant choice on the pieces step — open

The operator's screen for the disputed cases in `src/lib/pattern-import/CLAUDE.md` ("The
operator"): the variants drawn over the sheet, the operator picks one; nothing is drawn by hand.
One format for "variants to choose from" in the pieces output, shared by every case. Wired in the
order the data exists: case 3 (what kind of piece: one outline, by measurements, missing) from
stages 2A and 2B first; case 1 (two whole outlines) after stage 3; case 2 (a drawn-in stretch)
after stage 5. The layout is the owner's decision; no new `ui` primitive without the owner's OK.
Accepted when the owner answers each case on Leah, Kalla and Venice by choosing only.

### 7. Retire "close the gap" — open

The manual `bridge` tool on the pieces step and `recoverAutomaticGaps` (`worker/session.ts`). In
this order: the walk closes gaps inside the step (stages 3 to 5) → count the cells still open on
the 75 files → the variant choice (stage 6) covers them → remove both. Until then no new behaviour
is added to either.

### 8. Decide — open

With the files that reach DXF, the bad outlines caught and the operator calls counted: the fill
stays the main way with the walk as its check, or the other way round.

## Not in the plan

- More rules for the fill (bridges, lone stretches, plugging with smaller sizes).
- Sorting marks by shape before rows are linked: Leah lost 18 closed cells.
- Reading sizes from PDF layers: 4 of 692 files have them.
