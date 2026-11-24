# Fit the size family — what the reference set says before any solver code

Sections 1–2 measured 23 Nov 2026 on round 1 of `scripts/pattern-import/reference.json` (16 pieces,
174 ok sizes, 17 bad); section 3 adds round 2 (34 pieces, 369 ok, 46 bad), 24 Nov. Scripts are in
`scripts/pattern-import/family-research/`:

```bash
npx vite-node scripts/pattern-import/family-research/grade.ts  scripts/pattern-import/reference.json
npx vite-node scripts/pattern-import/family-research/detect.ts scripts/pattern-import/reference.json
npx vite-node scripts/pattern-import/family-research/r2.ts     scripts/pattern-import/reference.json <exported pieces.json>
```

`r2.ts` needs the sheet lines that `reference-export.ts` writes. They are not committed.

## 1. Grading is regular between neighbouring sizes, not across the range

The test predicts each ok size from two other drawn sizes. Points correspond corner to corner, and
by share of arc length between corners. A size passes when it lies closer to the prediction than
half the gap to its nearest neighbour.

| Prediction                         | Error                  | Pass                   |
| ---------------------------------- | ---------------------- | ---------------------- |
| between the two neighbours         | p95 median **~0.5 mm** | **138 / 142** (by p95) |
| one step past the edge (extrap)    | max median 2.7 mm      | 94 / 146 (by max)      |
| from the two end sizes (00 and 32) | max median 10 mm       | 16 / 85 (by max)       |

- **The grade has breaks.** On leah-D the step between sizes is 6 mm at the small sizes, 10 mm in
  the middle and 15 mm at the large ones. One line through all sizes does not hold, so the model
  has to be piecewise.
- **The worst point is mostly a correspondence miss, not the grade.** Single darts and notches on
  opal-B/C/E break the max distance. The same pieces pass on p95.
- **Nearest-point correspondence is wrong for grading.** It was tried first and failed: leah-D
  grows mostly downward, so the hem of a small size maps onto the side seam of a large one. The
  error reached 20 cm. Corners must correspond to corners.
- Corner counts differ between sizes by ±1 (a notch shows on some sizes and not on others).
  Matching is mutual-nearest within 40 mm, and a pair is dropped when it breaks cyclic order.

## 2. On the owner's bad sizes (leah-G) the prediction finds the wrong spans, not the right line

- **The prediction parts from the current outline where the owner saw the error:** 8 on 124 mm of
  outline, 14 on 74 mm (top left), 28–32 on 320–370 mm (bottom left).
- **On size 6 it parts on only 15 mm,** scattered. It does not single out the top-left corner the
  owner marked.
- **It cannot choose the printed line by itself.** On leah-G the printed lines run 1.5–3 mm apart.
  A copy of the prediction shifted by 1 mm lies on printed lines as often as the unshifted one. So
  the solver must choose whole printed runs, each owned by one size, and use the prediction only to
  say where to look. It must not snap point by point.
- **madison-B (all 11 sizes bad) cannot be checked this way.** It has no ok size to predict from.

## 3. Jump detector — retired as an error finder

**Rule tested.** A size is flagged when it breaks the grade of its drawn neighbours: the p95
distance from the interpolation of the two neighbours is more than half the gap to the nearer one.
At the ends of the range it extrapolates from the two nearest sizes. The rule never sees the
verdicts.

**Round 1 (the pieces it was built on):** 10 of 17 bad sizes caught, 7 of 168 ok sizes flagged.

**Round 2 (34 unseen pieces, 46 bad and 369 ok sizes):**

- 11 bad sizes caught, 37 ok sizes flagged.
- 10 of those false flags are harrington-C, whose 34–52 scale the size order did not know (a
  script bug, not the rule). Without it: 27 false flags.
- sedona-B and sedona-E were judged on missing sizes, not on drawn outlines. Without them:
  **3 of 32 bad sizes caught.**
- **Why it misses.** The round-2 errors are short jumps at a corner: the line leaves for a
  neighbour's stroke for a few millimetres and comes back (kalla-D 0/3 caught, cher-I 0/5,
  ventura-E 0/2, axel-B 1/11). A p95 over the whole outline does not see a few millimetres.
- **Why it flags ok sizes.** Unevenly drawn sizes break the grade without being wrong (cher-B 5
  flags, olympia-J 3, reims-C 3).

**Stacked pieces.** On some pieces all sizes lie almost on top of each other. The largest gap
between neighbouring outlines per size step:

| piece                     | median    | min        |
| ------------------------- | --------- | ---------- |
| leah-G                    | 3.6 mm    | 0.7 mm     |
| leah-F                    | 4.0 mm    | 2.5 mm     |
| other 12 reference pieces | 5.8–18 mm | 3.2–9.8 mm |

There a jump to a neighbour moves the line 1–4 mm. The figure still looks right, and the
threshold (half the gap) is about 1 mm, the level of drawing noise. So the round-1 result on
leah-G (all 6 bad sizes flagged) proves little, and the false flags on leah-F 10/12/18/20 come
from the same cause.

**Corner count against the template** was tried as a second signal: a size whose corner count
differs from the template size is suspect. It does not work yet. On leah-F the fifth corner of
sizes 4/8/10/12 is the real form (owner: ok). Only 229 of 389 sizes share the corner count of
their piece's largest size, because notches and darts count as corners. It needs corner vs notch
first (see the solver order).

**Conclusion.** Whole-outline deviation is not an error finder. The check has to be local: find
a short span that leaves the size's own printed line for a neighbour's and returns.

**Next hypothesis — the line's rank.** Size lines run side by side in size order. On a cross
section the k-th line belongs to the k-th size. A jump shows as a span where the outline's rank
in that row changes. This needs no millimetre threshold, and stacked pieces are where it should
work best. To be built on the `tune` pieces and checked on `confirm`, labelled by the owner's
round-2 notes.

## 4. Shared lines — the main direction (owner, 24 Nov)

**The finding.** A printed line often belongs to several sizes at once. Where sizes coincide (a
fold, a centre line, a hem that differs only in length) the publisher draws one line for all of
them. The chain model gives each `size` chain exactly one owner, so the other sizes have no line
there.

**Evidence (two independent measurements):**

- **Open cells** (75 files, 1151 open, read from the pieces snapshots). 847 cells have a prediction.
  Only 21 of them miss ≤ 12 mm of their own chain; 675 miss ≥ 200 mm. The median longest miss is
  400–500 mm. These are missing sides, not gaps, and bridges and corner rules cannot close them.
  In 62 % of the cells the size has no line of its own, and lines of 5+ other sizes lie within 5 mm.
- **Reference set.** 10 % of `tune` ok sizes cover less than half of their outline with their own
  chain. On leah-D (all 18 ok) every other size rides foreign or non-size chains for 25–50 % of
  its perimeter. So a correct outline on someone else's line is normal. For the same reason,
  "rides a foreign line" cannot tell bad sizes from ok ones: the best such detector catches 20 of
  25 bad sizes on `confirm` but flags 65 of 210 ok ones.

**Why it is the main direction.** Point rules raised closed cells 6390 → 6633 while accepted DXF
stayed at 10 for three snapshots ([corpus](material-corpus-80.md)). The branch's success is now
measured in files reaching DXF across the corpus; closed counts are secondary.

**Model.** A line is owned by a block of sizes, not by one size. Every size in the block may
use it in its outline. The rule may not name a product or a piece.

**Next measurements (on the reference set, reading only):**

1. For every span of an ok outline that is not on its own chain, record:
   - the chain's role;
   - the sizes whose ok outlines run along the same chain (within 0.5 mm).
2. Check that the sizes form a consecutive block. Check how often the shared line is a non-size
   chain (ignore, marks, common) rather than another size's chain.
3. Derive the ownership rule on `tune`. On `confirm`, count the ok spans it explains and the bad
   spans it would allow. Building the rule is worth it only when it explains most ok spans and
   allows few bad ones.
4. Then replay the pieces snapshots with the rule and count open cells and files that pass Pieces,
   as a measurement only, before any change to the product path.

## Order for the solver

1. Template size: the clearest closed size of the piece — prefer an end of the range, where an
   outline has a neighbour on one side only (bench: the largest size closes 88.7 %, the smallest
   91.5 %, the middle sizes 82.4 %). It fixes the piece's form: its corners, their order, its
   notches. It never gives coordinates to another size (scaling one outline: 6 mm median, up to
   10 cm off; two end sizes as anchors: 10 mm median).
2. Corner vs notch: a corner is kept when the neighbouring sizes have it too; a notch or a
   one-size kink is not part of the form.
3. Correspondence: every size's corners matched to the template's, arc share between them;
   per-piece grade breaks.
4. Local check (line rank): flag the spans where a size leaves its own line. Sizes without a
   flagged span are anchors.
5. For flagged spans: choose whole printed runs (ownership by block of sizes, section 4), using the piecewise prediction only to
   say where to look. A run belongs to one size or to a consecutive block of sizes: where sizes
   coincide (a fold, a shared seam) the sheet draws one stroke for all of them, so "one owner per
   run" would make them fight over it.
6. Local check again; a span still flagged becomes a marked line: own DXF layer, a question to
   the operator on the pieces step (decision of 11 Nov).
7. Hold on the reference set: no MOVED/LOST. Tune on `tune` pieces, confirm on `confirm` pieces.
