# Open lines: the plan

Approved by the owner on 24 Nov 2026. The findings it rests on are in
[open-cells-diagnosis.md](open-cells-diagnosis.md); the scripts are in `scripts/pattern-import/diag/`.

## Goal

To reach a DXF the lines must be drawn right: closed, and drawn in where they are missing, with the
operator called as rarely as possible. A count of closed cells alone is not progress. Judge by
outlines that are right on the owner's reference set and by files that get through.

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
| Stages 1A and 2 | `open-lines-rows`, commit `aacf5976f` | pushed, **to be merged into the PR head** |
| Measurement switches for the bench (`LONE_OFF`, `INNER_PLUG_OFF`, outlines in the bench output) | `open-lines-bench-switches`, commit `deb6b2824` | pushed, not for merging |
| The owner's reference set (`scripts/pattern-import/reference.json`, 50 pieces, 548 ok and 63 bad sizes), `family-fit.md`, `family-research/` | `reference-set`, commit `c2aa54469` | pushed, **not merged into the PR head: the owner decides** |

## Stages

### 0. The owner checks the walk's outlines by eye — open, blocks 3 to 5

Pictures in this folder: `walk-open-kalla.png` (nine open cells the walk closed),
`walk-kalla-back-yoke.png` (a piece with no closed size, 16 of 18 sizes), `walk-leah-g.png` and
`walk-kalla-f.png` (bad outlines against the walk), `one-outline-venice-pockets.png`,
`walk-selenite-diagram.png`, `walk-clark-pocket-lining.png` (what kind of piece it is).
If the owner rejects the walk's outlines, stages 3 to 5 are dropped and 1 and 2 stay.

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

### 2B. A piece drawn once gets one outline — done, one case open

When none of a piece's sizes closed and one closed walk of size-less lines goes round its label,
every size gets that outline (`pieces/one-outline.ts`, called after `applyPrintedCuts` in
`pieces/fill.ts`, `rankFrom: 'one-outline'`). A page-sized walk is the tile frame.
Venice J POCKETS: 18 cells closed. Clark, Spokane, Alassio, Valentina and Leah are unchanged.
Open: Clark H POCKET LINING and I POCKET WELT (32 cells) look drawn once too and do not close.

### Housekeeping — open

- Merge `open-lines-rows` into `fix-pattern-pdf-open-lines`.
- The reference set is pushed on branch `reference-set` (24 Nov). Merging it into the PR head is
  the owner's decision; every acceptance number of this plan depends on it.
- The switches `PDF_LAYERS_OFF` and `SNAPSHOT_STAGE` (read a layered PDF with its layers hidden,
  snapshot at the sizes step) exist only in the `reference-set` worktree, uncommitted.
- Replace the stale "Where it stands" section of `src/lib/pattern-import/CLAUDE.md` (dated 18 Nov).
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

Walk a size's own lines, the common lines and the stretches where six or more sizes coincide;
build each corner as the intersection of its two sides; draw nothing. Port
`diag/walk-carry.mjs` into `src/lib/pattern-import/pieces/` as a pure function with tests from the
reference set. After the fill, where its outline and the walk's differ by more than 1 mm over
12 mm or more and the walk lies on the size's own line, show both outlines to the operator.
Before porting: 12 of 82 verified sizes are still more than 3 mm off, and the walk has been
checked on six reference pieces of fifty.

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

### 6. Decide — open

With the files that reach DXF, the bad outlines caught and the operator calls counted: the fill
stays the main way with the walk as its check, or the other way round.

## Not in the plan

- More rules for the fill (bridges, lone stretches, plugging with smaller sizes).
- Sorting marks by shape before rows are linked: Leah lost 18 closed cells.
- Reading sizes from PDF layers: 4 of 692 files have them.
