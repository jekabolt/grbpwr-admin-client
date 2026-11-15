# Archive: PLAN and Pivot of the open-lines journal (10–11 Nov 2026)

Moved word for word from `open-lines-journal.md` on 12 Nov 2026 (lines 118–1042 of that file); nothing
below is paraphrased. Numbers, scratchpad names and bisect flags are exactly as written then. The main
journal keeps a short summary of each section and the entries from 12 Nov on. Append-only; new work goes
to the end of the main journal, not here.

## PLAN: no unclosed pieces, no "close the gap" by hand (10 Nov 2026)

Goal (owner): every piece of every size comes out closed by itself; the operator's "close the gap" click on the pieces step is gone. The sizes step shows the lines of a size meeting, with nothing to close.

Scope, stated so it cannot be argued away later. In: every piece the fill finds that closes on at least one size (the 69 pieces of the 30-file sample; seeds that close on no size, `junkSeeds`, are not pieces). Out, and named: files with no piece at all (`proposeSeeds` finds none: 9 of 30), the refusals and `later` classes above. "Zero unclosed" is measured as `notClosed = 0` over the in-scope pieces, on the full corpus with `--fill`.

Where we are (numbers, 181 files): 134 files read with every legend size drawn; 42 have size rows with no line (23 rows left); 28 % of pieces × sizes not closed (533 of 1895, 30 files); only 8 of 94 pieces close on every size; 68 % of the leaks are "the rank has no own line there" — mostly a local hole in a line that was split (hairline dashes, a stretch in `ignore`), not a size that is not drawn.

Principle that governs every step: a line gets its rank by EVIDENCE (the key's sample, the pen's rhythm, a closed outline that needs it, the grade of the sizes that do close), never by geometry alone — `adoptDashes` (geometry) made 12 files worse, the rhythm rule (evidence) did not. Every change is accepted only by the full `yarn patimport:regress` with no file in WORSE. Control files are Leah, Dyanna, Cassandra; they are one series (MDF) and prove nothing alone.

Steps, in order:

0. Baseline with fill. `yarn patimport:regress "<dresses>" --fill --par 2 --update` once (hours, nothing else running). Today `regress-baseline.json` has no fill fields, so a change to the fill cannot be judged as WORSE. Without this step no later step can be accepted.
1. Dash trains (`sizes/dash-train.ts`, in progress): full run without fill, then with fill; accept or drop. Fixes the narrow class "dashed line with a 3–5 mm gap". Small gain (Leah 23 → 22 of 126), kept because the principle is proven.
2. Identity upstream, one change per regress:
   a. Unmatched near-threshold groups: Leah `6.00/4.25/0/1.50/0/0.75`, 2.2 m, best key 18 at 0.832 (threshold 0.86) is the same pen at another tile scale. Evidence to rank it: the key is short of line (< half the median), no other key claims the group, the margin over the second key is enough.
   b. Beads drawn as fills with a period (Cassandra 0, 2, 6: pills, dots, chevrons, period 12.5 mm, `DDdtt`): chain them by the period the KEY's sample states (the dropped `chainBeads` attempt did not use it).
   c. The 23 rows `rankAlikeNests` leaves.
3. Auto-grade from the sizes that do close (the way to a piece with no line at all, and the second evidence — a closed outline that needs the stroke):
   a. Measure first, no code in the pipeline: leave-one-out on the closed sizes (predict one size from the other 2, or 3, and measure the error). That gives the tolerance and tells where grading is not linear (neckline, sleeve head, waist). Size steps come from the numeric label, not the rank index (00–32 has unequal steps).
   b. Needs ≥ 2 closed sizes (3 preferred: the third checks the linearity; a residual over the tolerance = no grade, no guess).
   c. Use the predicted outline twice: (i) as evidence — unranked chains / dashes of the pen lying on the predicted line within tolerance take the rank; (ii) as the last resort for the stretch that still has no line: the predicted segment, FLAGGED as inferred in the data.
   d. Built on `repairPass` (pieces/repair.ts), which today refuses with `no-model:inconsistent` and over holes of 40–80 mm laid on fragments with no rank; steps 1–2 remove the second reason.
4. Automatic closure inside the fill. The leftover: ends that continue one stroke (`facingBridges`, 12 mm), ends short of a wall (`wallBridges`, 3 mm), and the inferred segments of step 3. The "close the gap" click is removed only when the full run shows zero unclosed in scope; until then it stays as the fallback, not the way.
5. Honesty in the UI: an inferred segment is drawn differently on the sizes and pieces steps and listed in the result (how many, how long, from which sizes). It does not need a click to be accepted, but it can be reviewed and rejected; a rejected one reopens the gap and says so.
6. Acceptance: full regress with fill, no WORSE, `notClosed = 0` in scope; update the baseline; one test per rule; this file updated with every step, including the ones that fail.

Risks: grading is not linear everywhere (the leave-one-out in 3a decides, not an assumption); vertex correspondence between sizes of one piece; the fill reacts to any move of a wall end (that is why every step goes through the full run, not through three files); inferred geometry is not read geometry (the flag in step 5).

Open decision, answered by the goal: the inferred segments are applied inside the fill as well as shown on the sizes step (the owner wants no hand closing). The risk of that is carried by the flag and by the acceptance numbers above.

Goal widened (owner, 10 Nov 2026): not only the pieces step's "close the gap" — NO manual correction of the pattern at all: no hand-assigned lines on the sizes step, no hand-closed pieces. The import must either read the file by itself or say that it cannot (refusal), never hand work to the operator. Consequences for the plan: the operator actions that exist today (assigning a line to a size, closing a leak, ignoring a chain, answering the legend questions) are the list of things the automatic path has to make unnecessary; step 6 of the plan gets a second number — how many files still ask the operator anything — measured next to `notClosed`. Order of the next runs: (1) baseline WITH fill and the dash-train rule OFF (`DASH_TRAIN_OFF=1 … --fill --update`), (2) the same with the rule ON, compared against (1).

### Plan step 3 re-scoped after reading `pieces/gfit` (10 Nov 2026) — Leah, rule off

`pieces/gfit` (GRADE P0/P2) is already the leave-one-out grade model the plan asked to "measure first": `fitFamily` (anchors matched pairwise, corners as grade points, each point moves linearly with RANK between the neighbouring anchors, robust fit drops up to a third of the anchors) and `repairSize` (E1–E4, hook A in `fill.ts`, `repair-hook.ts`). Tolerances are calibrated: CAD DXF point 0.55 mm / edge p95 0.36 mm; PDF (kombinezon) `GFIT_TOL_P0` point 1.2 mm / edge 0.9 mm, ×2.5 when extrapolating. So step 3a is NOT "build a measurement": it is "find out why this machinery refuses on our files". `GRADEP2_DEBUG=1` prints the families and each refusal.

Leah (7 pieces, 126 cells, 23 not closed; `repairPass` tried 24, repaired 1):
- Refusals: `no-model:inconsistent` 19, `E2-hole-end` 3 (+1 `E2-end-offset`), `not-bracketed` 1. So the prediction does not exist for 19 of 23 leaks: the model is the bottleneck, not the holes.
- Pieces 0 and 2 are nearly done: E2-hole-end with holes of 6.6–12 mm. The condition ("both ends of a hole are ENDS of a wall") refuses what the prediction could close. Directly attackable.
- Pieces 1 and 4 have 13–14 anchors and are `inconsistent`; 5 and 6 have only 5–6 real anchors (the rest closed by `innerPlug` / `continuity`, which are not anchors).
- Verdicts of the anchors that "disagree" (`fitFamily` on the anchors, `GFIT_TOL_P0`): scores 1.05–11 × tolerance, cause `other` (not notch, not a neighbour's line), off-tolerance runs of 120–550 mm — whole edges, not local bumps. Piece 0: sizes 12, 15, 16 at 11.3 / 9.7 / 4.7 ×; piece 4: sizes 5 and 17 at 5.0 / 9.1 ×. Piece 3 (14 anchors) is fully consistent: the model works where the anchors are right.
- Reading: part of the "closed" cells are NOT right — a ring closed on a wrong line, or an extreme size (extrapolated, ×2.5) — and `notClosed` never sees them: it counts leaks, not wrong closures. The goal "no manual correction" needs a second number: closed AND consistent with the grade. Until we have it, closing more cells may add wrong anchors and make more families `inconsistent`.
- Not looked at yet (read-only, cheap): whether the disagreeing sizes are the extremes (extrapolated) or interior; whether the linear-in-RANK step is the cause (sizes 00, 0, 2 are not equal steps; the label value is no help: "00" and "0" are both 0); whether `frame: 'stacked'` is right for the sheet.

Consequences for the plan: step 3a becomes "audit the anchors": per family, which closed cells disagree with the grade of the others and why (wrong ring / extreme / unequal step), as a count over the corpus next to `notClosed`; step 3c uses `gradeHint.pred` (the prediction is kept on a refused cell) as the evidence for ranking dashes and for closing short holes — E2-hole-end is the first rule to look at (pieces 0 and 2 of Leah).

### Step 3a measured twice — leave-one-out (Cursor run) and the real model on Leah (10 Nov 2026)

Two independent measurements of the same question (is grading from the closed sizes usable, and with what tolerance). The first is the owner's run (`docs/pattern-import/grade-loo-report.md`, `grade-loo-results.json`; 3 control MDF files, own correspondence code, not read by me beyond its summary). The second is mine: the pipeline's own `fitFamily` on Leah's anchors (`GFIT_TOL_P0`).

Owner's run (19 families closed on ≥ 3 sizes: Leah 7/7, Dyanna 10/10, Cassandra 2/2): size value from the label (affine in the rank on these rows, so weights by label = by rank); each closed size predicted from the 2 nearest surrounding ones. Per size (189 interpolations): median p95 1.13 mm; ≤ 1 mm 44 %, ≤ 2 mm 73 %, ≤ 5 mm 90 %. Per piece, worst size: median 4.16 mm, p90 21.7 mm (one or two sizes per piece). A third size (least squares) does not help (median −0.07 mm; better in 17, worse in 32): a linearity check only. A straight line through the ends of the row (00 → 32) does not hold the middle (median 7 mm, up to 27.9 mm). Local failures are shaped parts, not the grade: armhole (Leah B, sizes 4 and 6: 27.8 / 22.5 mm), sleeve cap (Dyanna E, up to 14 mm), neckline facing (Leah G, 10.6 / 6.8 mm), waist edge (Leah E, 21.7 / 12.7 mm, area almost equal). Wedges Dyanna H, I, J: not monotone, not graded. Proposed 3b: tolerance 2 mm p95; < 3 closed sizes → do not grade; hold out one, predict from the two surrounding it, residual > 2 mm → no hole of that piece is graded; no extrapolation; inferred stretches flagged in the data.

Mine (Leah, `fitFamily`, anchors = `gradeAnchor`, the model that `repairPass` uses):
- Of 34 disagreeing sizes 28 are predicted by EXTRAPOLATION (the trusted set after the robust drop no longer brackets them) and 6 by interpolation. Interpolation passes 77 % (20 of 26), extrapolation 33 % (14 of 42). Agrees with the owner's "extrapolation cannot be confirmed".
- The tolerance is the cause of `inconsistent`, not a wrong frame: `registered` instead of `stacked` changes almost nothing (29 vs 34 disagreeing). Tolerance × 1 (1.2 / 0.9 mm): 3 of 7 families consistent; × 2 (2.4 / 1.8): 4 of 7; × 3 (3.6 / 2.7): 7 of 7, 74 sizes ok, 7 disagree. `GFIT_TOL_P0` was calibrated on CAD-graded kombinezon; these hand-graded PDFs are lumpier, in line with the owner's median p95 of 1.13 mm per size.
- Warning on loosening it: a looser tolerance also admits wrong anchors (closed on a wrong line) and lets `repairSize` accept wrong repairs. The honesty probe `yarn patimport:gradep2` (exit 1 on an accepted repair beyond tolerance) is the guard, and the full regress with fill.

What the two agree on, so it is the design of 3b: (1) interpolation only, bracketed by two closed sizes, never extrapolation; (2) the third size is a check, not a term; (3) the tolerance for PDFs is ~2 mm (p95), not 1.2 mm point / 0.9 mm edge; (4) wedges and other non-monotone pieces are out; (5) neckline, armhole, sleeve cap and waist edge are where a piece-wide residual fails — and the failure is LOCAL (the report shows it per edge), so a per-EDGE test (grade a hole only on an edge whose own leave-one-out residual passes) is the open design question against the owner's per-piece one (refuse the whole piece when any size > 2 mm).

Not done, and why: no code of the pipeline was changed (the chain of full runs is in progress and builds from the working tree).

### Step 3b, per-piece variant — first cut in a sandbox (10 Nov 2026)

Owner's decision: per PIECE (not per edge) first. Built in a copy of the tree (`scratchpad/sandbox`, rsync without node_modules/.git; the chain of full runs builds from the real tree, so it is not touched until they end).

Change (sandbox only): `GFIT_TOL_PDF` in `pieces/gfit/fit.ts` (grade point 2.4 mm, edge p95 2.0 mm, extrapolation × 2.5) and `repairPass` uses it (`repairTol()` in `repair-hook.ts`; `GRADE_TOL_P0=1` brings back 1.2 / 0.9). Interpolation only stays as it was: `repairSize` refuses `not-bracketed`.

Leah, dash trains off, fill (P0 → PDF): not closed 23 → 22 of 126; `no-model:inconsistent` 19 → 10; repaired 1 → 2 (new: seed 5 / rank 16, cover 0.992, holes 2.0 + 5.8 mm). Families 4 and 6 stay inconsistent (as the × 2 test said). The refusals move to the holes: E1-cover, E2-hole, E2-holes-sum, G15-holes-mm — holes of 38–124 mm in pieces 1 and 5, and `not-bracketed` 1 → 4 (the robust fit drops the anchors on one side: 15 / 17 in pieces 1 and 2). The repair, by design, does not bridge a hole longer than 15 mm with the prediction.

What lies along the PREDICTED outline (`gradeHint.pred`, kept on a refused cell) of the 12 refused cells: per mm of the prediction, the nearest chain within 1.5 mm, by its row: own size 7.1 m (44 %), another size 3.5 m (21 %), `ignore` 1.65 m, `internal` 1.44 m, `notch` 0.56 m, unclassed 0.44 m, common 0.32 m, NOTHING 1.36 m (8 %). So a hole the repair refuses is mostly DRAWN — by lines that sit in no size row (ignore / internal / notch / unclassed: 4.1 m, 25 %) — and only 8 % of the predicted outline has no line at all. Caution: 1.5 mm is wider than the repair's corridor (0.6 mm + 0.25 · step, never past half a step); "another size" there is partly just the neighbouring size one step away, so that 21 % is not evidence of anything. The share must be measured again in the repair's own corridor before it is used.

Next (3c, in the sandbox): the prediction as EVIDENCE — chains of no size row (ignore / internal / notch / unclassed) that run inside the repair's corridor along a stretch become walls of the size for the repair (a fourth wall kind beside own / common / overlay), so the hole shrinks to what is really not drawn; then only that part is a candidate for an inferred segment. Accepted only via the full regress with fill and `yarn patimport:gradep2` (honesty).

### Step 3c — the prediction's evidence re-measured in the repair's OWN corridor (sandbox, Leah, PDF tolerance)

The 1.5 mm census above over-counted. Re-measured with the corridor `repairSize` uses per sample
(0.6 + 0.25·step, ≥ 0.45, ≤ half step; mean 0.64–2.1 mm over the 15 refused cells), nearest
chain per mm of the unsimplified prediction: own 46 %, another size 34 %, nothing 7 %, `ignore`
7 %, common 3 %, notch / internal / unclassed 2 %.

- **"Unranked lines as a fourth wall kind" — tried, dropped (by measurement, no code).** Lines of
  no size row are ≈ 9 % of the prediction in the real corridor, and `overlay` walls already admit
  an unranked line wherever both bracketing anchors run on it. Not worth a wall kind.
- Where the prediction does NOT lie on the size's own line, the own line is > 6 mm away (or not
  drawn) on 87 % of that length: the size simply has no line of its own there. And on 68 % of it
  BOTH bracketing anchors' outlines run on the same line within 0.5 mm — the drawing draws the
  edge once. That is the `overlay` case, so the cover exists; the refusals come from the hole rules.
- Hole ends (wall at each side of each hole, 15 cells): own-end 28, common-end 8, **common-MID
  26, overlay-MID 20, own-MID 8**. E2-hole-end ("both ends are ENDS of a wall") is the blocker:
  a hole whose side is a common/overlay line that runs on fails, though the size really leaves
  that line there.
- Four cells are refused by E2-hole-end ALONE, each by short holes (seed 0 r13/r14 6.6 mm overlay
  → common; seed 2 r10 11.8 mm common → own; seed 4 r8 1.2–2.2 mm). The stories differ: seed 0 r14
  the overlay line ENDS on the common line (a drawn T-junction, 0 mm) but overlay cover stops
  21 mm earlier, where an anchor leaves that line; seed 4 r8 the two end walls CROSS 1.2–1.4 mm
  from the prediction (a corner the prediction rounds); seed 2 r10 the walls do not meet (13 mm
  apart). The other 11 cells are refused by long holes (38–124 mm) as well — not reachable by an
  end rule.
- Probe instrumentation lives only in the sandbox (`probe` on `GfitRepairHole`, `predFull`/`cor`
  /`probeHoles` on `gradeHint` behind `HOLES=1`); nothing of it is meant for `src/`.

### Step 3d — the long holes (38–124 mm) are size dashes the dash-train rule refused (10 Nov 2026)

Leah, every long hole looked at (seeds 1, 4; row of size 18, r10) is a train of 6 mm dashes of
that size (#196–206, #371–376, #3567) left in the `ignore` row as "fragment < 8 mm". In the
repair's corridor they show up as `nowall` (1177 samples on Leah, the dominant cause). The dash-train
rule (`sizes/dash-train.ts`) refused them. Traced with `DT_DEBUG=x0,y0,x1,y1` (sandbox only):

- Almost every host end was `LANDED`. The test was "any line within `landedMm` 3 mm of the end".
  In a nested drawing neighbouring sizes run 1–3 mm apart, so that radius always finds one. The
  lines that blocked: a neighbour size parallel beside the end (size 13, 2.9 mm, ~0°); oblique
  neighbours near a corner (sizes 8/9/11, 1.0–2.9 mm, ~41°); a perpendicular line 2.3 mm off.
- One end got further and failed `owns`: dash #209 is 5.29 mm, rhythm 6 (±6 % + 0.15 → 5.49).
  It is the first dash after the line's end, probably clipped where the line resumes. Not handled.
- Sandbox variant (probe only, not in `src/`):
  - "beside along": a line whose direction is within `cosMin` of the end's and which sits more
    than `lateralMm` across it is a nest neighbour, not a landing or a joint;
  - "landed" means the line touches the end (≤ 1 mm) or crosses its forward extension within 3 mm;
  - `nearOtherRank` likewise, but a beside line whose END is within 3 mm still blocks (Reims kept:
    #3177 is still refused, 6924 size 2, end 1.87 mm).
  Dashes taken: Leah 4 → 16, Dyanna 2 → 24, Reims 10 → 19, Cassandra 0 → 0.
- Still blocked on Leah r10: two trains stop at NEAR-OTHER on a beside neighbour whose end is
  1.6 / 2.9 mm away (the Reims condition). A nest end beside a dash and the Reims joint look alike
  by distance; separating them is not done.
- Open ends / closed sizes not yet measured for the variant: waiting for the step-0 chain (no
  parallel load).

### Step 3e — Leah seed 5 (piece at 718,209; sizes 22–26 open): a far rival steals the dashes (10 Nov 2026)

Sizes 22, 24, 26 (r12–r14) are refused, with the brackets [9, 15]. The corridor is 0.64 mm: the
nest step is ≈ 1.3 mm here. 100–210 mm per cell has no line in the corridor at all. On this piece
each size has only 200–650 mm of ranked line. The rest are its own pen's dashes in `ignore`: 145
chains, 1364 mm in the box. Style 1508 is size 18's pen, style 1524 is size 24's.

- r13 (size 24, rhythm 3.75 / 3.5,1,1,1.5) and r14 (size 26, 1.5 / 2,3.75,2.25): the dashes fit,
  but `owns` refuses them because a RIVAL has the same dash and gap. The rival is r6 (size 10, pen
  3.75,3,1.75 / 1.75,1.5,4) in both cases, and its lines are nowhere near. The rival test is global
  over all ranks of the sheet.
- Sandbox variant: a rank is a rival only if a line of that rank lies within `DT_RIVAL_MM` of the
  dash. Dashes taken on Leah (with the step-3d landing rule): 16 → 30 (12 mm), 31 (6 mm). Not yet
  measured on open ends or the corpus.
- Still blocked after it: NEAR-OTHER, where a line of size 28 (r15) ENDS 2 mm from the dash,
  perpendicular. That is the Reims-joint condition in a tight nest (step 1.3 mm). Also r12 (size
  22, pen 12.96 + 2.31 + 2.31): the next pieces are 5.64 / 6.73 mm. These are long dashes cut short,
  not a draw of the rhythm, so `owns` refuses them (the same "clipped dash" as Leah #209).

### Dash trains v2 with the fill, the 53 files where they take dashes (10 Nov 2026)

`regress --fill`, rule ON, against the step-0 baseline (fill, rule OFF): 53 files, errors 0. Sizes
not closed 1131 of 5013. 4 better: Leah 23 → 22, Corella 7 → 6, Silverstone 17 → 16 not closed;
Opal 22 → 21 open ends. **1 WORSE: Pickleball (MDF453) not closed 40 → 41**, not yet looked at.
So v2 alone moves almost nothing and is not acceptable as is. The full run with the step-3d landing
rule (`landed` = touch ≤ 1 mm or crossing ahead; a beside neighbour is the nest) started at 22:45.

### Local rival — designed, owner agreed R = 12 mm, not coded yet (11 Nov 2026)

Rule: a rank k is a rival of a dash only when a RANKED line of k lies within 12 mm of the dash
(`rivalMm`). Reason: a dash is a piece of a line; a dash of k lies on k's outline, and that outline
has ranked line nearby. A rank whose lines are nowhere near cannot have drawn it, however its pen
matches (Leah seed 5: r6 / size 10 blocks sizes 24 and 26 from across the sheet). Cassandra 10 / 30
(same 6.0 mm dash, gaps decide) is the case the global test was for; there the gap still decides
when the rival is near.
- 12 mm, not 6: in a nest of step 1.3 mm a size 7 steps away lies ~9 mm off and stays a rival.
  Sandbox, Leah, with the step-3d landing: dashes taken 16 → 30 (12 mm), 31 (6 mm).
- Known blind spot: a rival whose nearby line is ALL dashes (in `ignore`, nothing ranked) is not
  seen. The other conditions (continue r's free end, cross no line, run up to no other size's end)
  still hold.
- Order: only after the landing rule's full run is judged (one change per regress). Then Leah /
  Dyanna / Cassandra (Cassandra must stay at 0 taken), then the full run with fill. Test: a far
  rival with the same pen → adopted; the same rival 3 mm off → the gap still decides.
- Not solved by it (seed 5): the size-28 end 2 mm from a dash (Reims condition, tight nest) and the
  clipped long dashes of size 22.
- Code ready, not applied: `scratchpad/patch-rival.py` (on top of the landing patch; rewrites the
  Cassandra test so the rival is DRAWN 3 mm beside — a rival that is only a rhythm with no line on
  the sheet is no rival under this rule — and adds the far / near rival test). `scratchpad/chain4.sh`
  applies it, runs the unit test and the three controls, and stops before the full run.

### Clipped dashes — design on paper, no code (11 Nov 2026)

Two cases `owns` refuses because the draw is not a draw of the rhythm:
- the FIRST dash after a line's end is short (Leah #209: 5.29 mm, rhythm 6, limit 5.49). The line
  ends where the pen's cycle was cut, so the first piece is a remainder of a draw, not a draw;
- a long draw split in two (Leah seed 5, size 22: 5.64 + 6.73 mm against a 12.96 mm draw; sum
  12.37 mm, so the split ate ~0.6 mm). Probably where another line crosses and the linker cuts.

Proposed rule, evidence still the rhythm, never geometry alone:
1. A short first dash (≥ `loneMinMm`, ≤ the longest draw) is taken only as the head of a train: the
   dashes after it must be full draws of the rhythm at one of its gaps. It is never taken alone, and
   never as the last dash (a short last piece is the same doubt from the other side; allowed only
   when it meets another end of the rank, like the lone-dash rule).
2. Two neighbouring pieces whose lengths plus the gap between them make one draw (±`lenTolRel`,
   with the gap under the rhythm's shortest gap) count as one draw of the train. Not chained further
   (three pieces of one draw is a dotted line, not a clipped dash).
Unknown before code: whether #209 is followed by full draws (if not, rule 1 does not reach it), and
where the 0.6 mm of size 22 went (a crossing line, or the pen). Both are read with `DT_DEBUG` in the
sandbox, one file each, after the full runs.

### E2-hole-end (Cursor run, copy `grbpwr-admin-client-e2`) — parked, not applied (11 Nov 2026)

Rule: a hole end is also legal where the hole's two walls meet (crossing or T within 2.5 mm, the
meeting ≤ 2.2 mm from the prediction and ≤ 8 mm from the hole), or where a common/overlay line is
left at ≥ 20° and meets the other wall within 25 mm. Six unit tests. On Leah: 22 → 22 of 126. Seed 0
r13 / r14 stop failing on the end and fail E3 instead (r13 outside the family spread, r14 off the
grade); seed 2 r10 honest refusal; seed 4 r8 never reaches the end check (`no-model:inconsistent`).
No gain, and the 20°/25 mm branch does not check that the meeting is on the prediction — a risk of
closing the wrong corner elsewhere. Parked until the E3 refusals of r13 / r14 are taken on; then it
is measured together with them. Measured with `GFIT_TOL_P0`, not the PDF tolerance of step 3c.
Patch `e2-hole-end.patch` in the copy (applies cleanly to this tree; `meetingsOf` made lazy).

### Status (11 Nov 2026, night)

Solved and in the tree (pending the full run): dash trains v2; landing = runs into, not beside.
Designed, code ready, waits for its run: local rival (R 12 mm). Designed on paper: clipped dashes.
Parked: E2-hole-end. Open: Pickleball WORSE under v2 (40 → 41, not looked at); the Reims joint
vs a nest end in a tight nest; `GFIT_TOL_PDF` (sandbox only); E3 refusals; the second number
"files that still ask the operator anything" (inventory done, see below; metric not coded yet).

### Operator actions — inventory and the second metric (11 Nov 2026, read only)

The goal is no manual correction at all, so the regress needs a second number besides
`notClosed`: per file, how many reading fixes it still asks for. Inventory (`PI` =
`src/components/managers/tech-card/components/pattern-import/`):

- **Reading fixes — to drive to zero.** files: set-aside kind, page role. scale: candidate /
  measured mm. sheet: remove page, missing pages blank, residual, manual grid. sizes: legend row
  confirm / role / split / merge, line assign (`line-assign`), drawn-size count, size map. pieces:
  model, seed / reseed, **close the gap** (`bridge`), use-as-wall, ignore line, merge / split,
  not-a-piece, this-is-a-piece, cross-sheet answer. meaning: grain, fold, grade answers. check:
  shape fix / drop size.
- **Data entry — not a reading fix, out of the metric.** names / codes, quantities, fabrics,
  storage. Outline meaning (cut / seam mm) borders on a fix.
- **Already taken by the autopilot** (`autopilot/policy.ts`, `stopAt(...)` is the full list of
  its human stops): clean accept, pages, scale, residuals ≤ 3×, proven-blank pages, legend rows,
  drawn sizes, size map, model, click seeds, grain proposals, folds with two pieces of evidence.
  It **never** closes a gap (policy.ts ~1400) and refuses not-a-piece as a silencer.
- **Headless counting** without new UI: `scripts/pattern-import/e2e-entry.ts` already records
  simulated actions per file (`rec.ops`, weights in `CLICKS`); `autopilot-entry.ts` gives the
  first remaining stop. From library outputs: `notClosed`, `litOpenCard`, legend classes with
  confidence < 0.6, `guessedSizes`, `weakAsides`, `sheet.missing / refused`, `semantics.blocked`.
  The free-form tools (ignore, set-wall, merge, split, reseed) have no library flag; they are
  seen only as `PieceEdit`s in the e2e simulation.

Proposed metric `asks` = the autopilot's stop step and reason per file (0 when it reaches
`check`), plus the e2e `rec.ops` count as the cost. Not coded: it runs the full hook per file,
i.e. a second load on top of regress — to be added only after the dash-train runs.

### Dash trains v2 + landing rule, full run with fill — NOT ACCEPTED yet (11 Nov 2026)
Hypothesis: an end is landed only when a line touches it (≤ 1 mm) or crosses its ray within 3 mm;
a parallel nest neighbour does not land it — so trains continue through nests (step 3d).
Change: `sizes/dash-train.ts` (+ test) in the tree, via scratchpad `patch-landed.py`.
Run: `regress.mjs <dresses> --fill --par 2 --limit 1200 --out scratchpad/full-landed.json`,
22:45 → 02:27, load ~5, nothing else running. Triage: `scratchpad/worse-triage.mjs`.
Numbers vs baseline: 5 better (Leah 23 → 22, Corella 7 → 6, Soho 24 → 23, Glinda 38 → 37 not
closed; Opal 22 → 21 open ends). 13 WORSE: Memoir A 81 → 82 (landing; 33 dashes taken), Pickleball
40 → 41 (already in v2), and 11 TIMEOUTS at 1200 s — Seraphina, Olympia, Lanai, Tundra, Paris,
London, Axel, Ophelia, Asheville, Taos, Jolie — all of which finish with the rule off. Totals
(181 files, timeouts count 0): not closed 1302 of 7674, empty rows 22.
Verdict: not accepted. The timeouts are the first thing: load was low, so the rule likely makes
these files slow (a timing of Tundra alone, rule off / on, is the check).
Follow-up, same day: the 11 timeouts are LOAD, not the rule. They sit in two consecutive blocks of
the run order (files 19–24 and 37–41), i.e. the first hours, when a parallel Cursor run held load
at ~73. Tundra alone: 82 s rule off, 75 s rule on, same numbers. Re-run of the 11 on an idle machine
(`--par 2 --limit 1200`, scratchpad `redo-timeouts.json`, 1005 s): all equal to the baseline.
Merged result `full-landed-merged.json`: 5 better, **2 WORSE** — Memoir A 81 → 82 (landing),
Pickleball 40 → 41 (v2). Totals not closed 1626 → 1624. Next: per-cell diff of both (probe FILLOUT).

### Diagnosis of the 2 WORSE of the landing run: a lone dash turns a corner into a T (11 Nov 2026)
Hypothesis: the +1 leak in Memoir A (cell 9@362,1156|r16) and Pickleball (cell 11@723,1774|r6) is
one dash adopted by the rule, not a far-away fill effect.
Change: none in `src/`. Sandbox copy got `say` lines at ADOPT and at the lone-dash `closes` test;
probe `probe-sb.mjs` with `DT_DEBUG=<box>` (logs `scratchpad/pk-dbg.log`, `mm-dbg.log`).
Numbers / what the probe shows — both are the same corner:
- Pickleball: host 2883 (rank 6) ends at (617.2,1847.9) heading left. Lone dash 971 (3.4 mm, gap
  4.1 mm) runs it on to (610.1,1849.9). The `closes` test accepts partner 2886's end
  (612.0,1844.5) at 5.7 mm — but 2886 comes DOWN onto the host line, perpendicular, and its end
  is beside the new host end, not ahead of it (cos(t, q − p) ≈ −0.47).
- Memoir A: host 5554 (rank 16) ends at (261.1,1036.8) heading left. Lone dash 3069 (3.1 mm, gap
  1.0 mm) runs it on to (257.1,1036.5). Partner 5555 comes UP and ends at (256.9,1041.5), 4.95 mm,
  again perpendicular (cos ≈ −0.06).
- Before the dash the two ends faced each other diagonally (host cos ≈ 0.6, partner ≈ 0.8) and the
  fill's facing bridge closed the corner. After it the host end points past the partner, the pair
  no longer faces, and the 5 mm left is over `wallBridges`' 3 mm: the corner leaks.
Verdict: cause found. `closes` measures only distance; a partner end that meets the host's SIDE
passes it. Proposed fix (to be agreed before code): the lone dash proves itself only when the
partner end lies AHEAD of the train's new end, cos(t, q − p) ≥ `cosMin`.

### Lone dash: the hole must be ahead, cos(t, q − p) ≥ 0.95 — 5 files (11 Nov 2026)
Hypothesis: refusing a lone dash whose partner end is beside it (a corner) removes both WORSE.
Change: `sizes/dash-train.ts` lone-dash `closes` (partner within `closeMm` AND ahead by `cosMin`,
or within `touchMm`); test "refuses one dash whose hole is a line coming onto the host's side".
Run: `regress.mjs --fill --only <f> --par 1 --limit 1200`, Memoir A, Pickleball, Leah, Dyanna,
Cassandra (scratchpad `ahead-<f>.json`).
Numbers (empty/notClosed/litOpen, baseline → landing run → now; dashes taken):
Memoir A 0/81/38 → 0/82/38 → 0/81/38 (33 → 17); Pickleball 0/40/28 → 0/41/28 → 0/40/28 (10 → 7);
Leah 0/23/7 → 0/22/7 → **0/23/7** (16 → 12); Dyanna 0/43/28 equal (24 → 20); Cassandra equal (0).
Verdict: both WORSE gone, but Leah's gain went with them. Leah had 4 lone dashes accepted by a
side partner, all cos < 0 (hosts 3320, 3368, 3497, 3524). In 3524 the dash runs a vertical host
1.2 mm past the corner and the partner's end is then 2.5 mm from it (inside `wallBridges`' 3 mm);
in 3368 / 3497 — like Memoir — the host stops at the corner with the partner 4.9 mm above.
Next: which of the four gave the gain (sandbox `sb2`, `DT_LONE_ANY=1 DT_LONE_SKIP=<host>`).
Follow-up: which lone dash gave Leah's gain (sandbox `sb2`, rule off by `DT_LONE_ANY=1`, one host
skipped at a time, `scratchpad/lone-<host>.log`): none skipped 22; skip 3320 → **23**; skip 3368,
3497, 3524 → 22. Only host 3320 matters. Its geometry (`DT_SHOW=3320`, `scratchpad/show.log`):
host runs up to (621.0,736.7); lone dash 1462 (3.3 mm) goes (619.9,733.0) → (619.5,729.8). Partner
3321 (same rank) comes from the right to (620.5,732.0) and then doubles back to its end
(623.5,731.7) — a pen overdraw. So the "partner end" is 4.5 mm behind-beside, but the dash itself
passes 0.7 mm from the partner's LINE: the dash reaches the line, the corner is a real T-join.
Memoir / Pickleball: the dash stops ~5 mm short of the partner's line. Rule to propose: a lone
dash also proves itself when it touches (≤ `touchMm`) the body of another line of its rank.

### Lone dash: ahead OR touching the rank's other line (T-join) — 5 files (11 Nov 2026)
Hypothesis: adding "the dash itself passes within `touchMm` of the body of another line of its
rank" (`touchesRank`) brings back Leah's gain and keeps the corners of Memoir / Pickleball refused.
Change: `sizes/dash-train.ts` lone-dash test = ahead (cos ≥ 0.95) OR touches; test "takes one dash
that reaches the rank's other line itself, a T-join (Leah)". vitest 55/55, eslint, prettier,
build:check clean (beyond the old xlsx / tasks errors).
Run: same 5 files (scratchpad `tee-<f>.json`).
Numbers (empty/notClosed/litOpen; dashes taken): Memoir A 0/81/38 (17), Pickleball 0/40/28 (7),
Leah **0/22/7** (13), Dyanna 0/43/28 (20), Cassandra 4/12/6 (0) — WORSE gone, Leah's gain back.
Verdict: candidate. Next: the full run, judged against the baseline (0 WORSE to accept).

### Wall lookups read shifted points after a host grows at its start — found, patch ready (11 Nov 2026)
Hypothesis (code reading, during the full run): `walls` (SegGrid) indexes each chain's segments
once, by the points it had. A host that runs over a train at its START (`end = 0`) gets the dash
points in front (`add.reverse().concat(hc.pts)`), so later lookups `chains[o].pts[si]` in
`landed`, `nearOtherRank`, `crosses` (and the new `touchesRank`) read a segment shifted by the
train's point count: a line that grew at its start is invisible near its old geometry.
Change (NOT in the tree; scratchpad `patch-wallpts.py`, tried in the copy `sb3`): `wallPts` =
the points `walls` was built from; every wall lookup reads it. Test "reads a line extended at its
start by its own geometry": A takes a train before its start, B comes down onto A at x = 90 and
stops 0.5 mm above it; dashes continue below A.
Numbers: without the fix B ran through A and took the 3 dashes below (got 1,2,3,4,6,7,8; expected
1,2,3,4). With it: 56/56. prettier / eslint clean.
Verdict: bug confirmed by test; to run as its own change after `full-tee.json` is judged
(`scratchpad/chain5-wallpts.sh`: patch, vitest, 5 files; then the full run vs `full-tee.json`).
Every earlier train run had it, so the numbers so far include its effect.
Also open, not fixed: the dash points a host took are not in `walls` (dashes are never walls), so
an end that lands on a host's new stretch is not seen as landed.

### Local rival patch v2 — tests were vacuous in v1 (11 Nov 2026)
Dry-run of `patch-rival.py` on top of the wall fix (copy `sb3`): its two tests threw — they ranked
the rival line as chain 9, which is index 4 in the array, so in v1 the rival was NEVER ranked and
the tests passed without testing the rule (exposed now because the lone-dash code walks `rankOf`).
v2 (v1 kept as `patch-rival.v1.py`): the rival is ranked by its real index; `ranksNear` reads
`wallPts`. 57/57. Mutation check: with `rivalMm: 0` both rival tests fail, as they should
(`rivalMm: 1e6` makes the grid walk the whole plane — do not use it as a check, it hangs).
Order of runs: lone-dash (running) → wall fix (chain5) → rival (chain4, needs chain5 applied).

### Metric `asks` — script written, not run (11 Nov 2026)
`scripts/pattern-import/asks.mjs <folder> [--only] [--limit 1200] [--out] [--base <earlier>]` with
`asks-entry.ts`: per PDF, the card is the sizes the file's own legend reads (`detectSizeRun`;
none → one size `M`), then the autopilot's `runCase` (the real wizard hook, `react-hook-shim`)
until apply or the first stop. Out: verdict apply / stopped / crashed / timeout, the stop (step:
reason), and the summary "ask nothing" + first stops by step and by reason. `--base`: a file whose
run now stops at an EARLIER step than before is WORSE (exit 1). One file at a time.
Not in it yet: the e2e `rec.ops` cost (a second full simulation per file). Not bundled or run:
the full regress is on; first run after it, `--only Leah` first, then the folder → the baseline
of `asks` for the dash-train changes.

### Clipped dashes — owner's decision (11 Nov 2026)
Owner: a short head is taken only when at least TWO full draws of the rhythm follow it. The split
draw (two pieces, `a + gap + b` within the draw tolerance, gap under the rhythm's shortest gap; never
three) stands as designed. Code after the rival's run (queue order), with the five tests listed in
the design; #209 and size 22 read with `DT_DEBUG` first.

### Glyph pens moved up the queue (owner, 11 Nov 2026)
A size key (sizes step, "in the file" column) shows pens that are rows of marks, not dashes:
XS triangles, S triangles + dots, L dots + triangles, 4XL dots; XXS and XL render as a solid black
smear. The dash-train rule reads only draws ≥ 1 mm, so these sizes are invisible to it. Owner:
look at them right after the running full run, before the wall-index / rival / clipped-dash work.
First read only (how a mark is encoded, how many sizes are mark pens, what the XXS / XL samples
hold), then propose a rule: shape + step from the key sample, marks of that shape in a row become
one line of that size. Differs from the dead end "rows of short strokes" (geometry alone, no key).
Also (owner): the corpus drops MDF374 Seraphina (44 MB, over the 40 MB slot limit) after this run,
moved to `dresses-excluded`, not deleted.

### Full run — dash trains v2 + landing + lone-dash rule ACCEPTED (11 Nov 2026)
Run 03:31–04:41, `--fill --par 2 --limit 1200`, 181 files, scratchpad `full-tee.json`.
`worse-triage.mjs full-tee.json`: 0 WORSE; better: Soho Maxi Slip 24 → 23, Glinda 38 → 37,
Leah 23 → 22 (not-closed sizes). Totals: notClosed 1626 → 1623, empty rows 23 → 23, open ends
5033 → 5033. The 3 errors are the known refusals of > 18 MP embedded rasters (Biel Bodice, Biel
Skirt, St. Patrick's). The earlier WORSE pair (Memoir A, Pickleball) is gone: the lone-dash rule
fixed it. Accepted; `full-tee.json` is the reference for the next run (`regress-baseline.json`
not touched).
Corpus: MDF374 Seraphina (46.6 MB, over the 40 MB slot) moved to
`archive 600 pcs/dresses-excluded` (owner) — the corpus is 180 files from the next run on.

### PDF read check — nothing lost (11 Nov 2026, read only)
Question (owner): is a gap made by our reader rather than by the file? Census with raw pdfjs
operator lists (scratchpad `raw-ops.mjs`, `caps-fonts.mjs`, `type3.mjs`) over all 180 files vs
the operators `adapters/pdf/walk.ts` handles. Every paint operator (stroke, fill, eoFill,
fillStroke, closeStroke …), `constructPath`, `setDash`, `setLineWidth`, colours, gstate, form
XObjects and marked content are handled. Not handled: text state (font, spacing, rise, scale,
rendering mode), line cap / join / miter, `dependency`, and `shadingFill` (3 files: Olympia,
Harper, Glinda — gradient fills, not lines). Leah: 60 594 paint ops (21 072 stroke, 39 516 fill)
vs 60 914 extracted paths; the dash arrays seen by pdfjs are the ones in the IR.
Line cap: 102 files draw dots as zero-length dashes with a round cap. The cap is not read, but
`motif.ts` already treats zero-length draws as dots, so no line is lost. Type3 fonts: 32 files,
2 glyphs each, emoji in the instructions — not on the sheet.
Verdict: the reader loses nothing a size line is made of; the gaps are in the file or in our
reading of it, not in extraction.

### Glyph pens — the corners are the gap, not the marks (11 Nov 2026, read only)
Valentina (MDF422, XXS–4XL), per size before this step: closed/open XXS 5/1, XS 6/0, S 5/1, M 6/0,
L 3/3, XL 6/0, 2XL 1/5, 3XL 6/0, 4XL 2/4. Pre-dashed pens: Valentina draws each size line as
separate paths (9-pt closed circles for dots, 2-pt segments for dashes, width 0.353 or 0.49,
rgb 32/29/30). The same-pen chains ignored on L/2XL/4XL (#1603, #1467, #1604, #1475, #1487,
#1596) are all "joined into chain N" — benign. #1453 (rank L) is 91 % L-pen pieces; only its
~70 mm head is in S's pen, with no S line there.
The leaks cluster at the hem corners (y ≈ 1243–1290). The 2XL corner: hem #1608 ends at
(568.5, 1287.8), seam #1469 at (574.4, 1283.9); in the PDF both run on past each other as a
crossing, drawn in other graphic states (style ids 58–61, same rgb, width 0.49 where the seam is
0.353) — chains #212 (2.6 mm) and #213 (2.9 mm), ignored as "fragment < 8 mm", each ≤ 0.2 mm from
the vertex (571.6, 1288.8). EXTEND refused it: `F2T r6 … nb -1:586.3,1272.2 1:558.2,1292.9` —
0.2 mm beyond the 6.1 mm trend tolerance, and the r5 neighbour vertex is the wrong corner (XL's
hem corner is open too). Raising the tolerance would accept a wrong neighbour; the crossing
drawn at the vertex is itself the evidence.

### CROSS — a corner inked as a crossing is its own second evidence — ACCEPTED (11 Nov 2026)
Rule (`sizes/corners.ts`, EXTEND): the trend check is waived when BOTH edges run on through the
vertex in a short solid piece (≤ 15 mm, not a ramp, not ranked): same ink (rgb ≤ 30), a width the
rank's own lines are drawn in (±0.03 mm — a pre-dashed pen uses two), chord ≤ 15° off the edge's
tangent, every point ≤ 0.4 mm off the edge's line, passing ≤ 0.5 mm from the vertex; the two
witnesses are different pieces. Kept: the convention gate (≥ 10 stubs + ramps) and "crosses its
rank". New counter `diag.corners.crossed`.
First try matched the width of the edge itself: 6 crossed, 0 new corners (the 2XL witnesses are
0.49 on a 0.353 seam). With the rank's widths: Valentina extended 50 → 53, crossed 11, off the
trend 26 → 23, corner walls 186 → 189; 2XL closed 1 → 2. Other sizes unchanged.
Tests `sizes/corners.test.ts` (4): no evidence → off the trend; witnesses on both edges → closed;
one edge only → open; a second width counts only when a line of the size uses it, a foreign width
never. vitest 59/59 (pattern-import), eslint clean, tsc clean except the known `tasks/sheet.ts`.
Run: `regress.mjs <dresses> --fill --par 2 --limit 1200 --out scratchpad/full-cross.json` vs
`full-tee.json`: 0 WORSE, 17 better, ACCEPTED. notClosed 1586 → 1564 over the 177 files without
errors (Rosalina 11 → 8, Reef 16 → 13, Riverside 12 → 10, Leah 22 → 21, Valentina 14 → 13, and
12 more by one); empty rows 23 → 23, open ends 4992 → 4992; the 3 errors are the known > 18 MP
rasters. `full-cross.json` is the reference for the next run (`regress-baseline.json` untouched).

### Valentina after CROSS — the L corners are inked in marks (11 Nov 2026, read only)
23 "extend: off the trend" left (r0 2, r2 8, r4 5, r5 2, r6 3, r8 3). L hem corner at
(440.9, 1254.8), box 425,1235–490,1280 (scratchpad `box3.svg.png`): L's side seam #1591 ends at
y ≈ 1251, L's hem #1606 starts at y = 1255; between them the corner is drawn in L's own marks
(circles + chevrons) along both edges up to the vertex — no solid piece, so CROSS does not
apply, and the trend fails because the grading steps L → XL (~16 mm) unlike XXS → L (~5 mm).
Proposed (owner to decide, glyph pens need the "yes"): MARKS — the same waiver as CROSS when the
gap from each own end to the vertex holds marks of the rank's own pen lying on that edge's line.
Wall-index fix (`chain5-wallpts.sh`) started meanwhile, controls first.

### Wall-index fix — ACCEPTED, neutral on the corpus (11 Nov 2026)
`chain5-wallpts.sh` (06:59–07:05): `patch-wallpts.py` applied to `sizes/dash-train.ts` (3 ×
`pts[si]`, 3 × `pts[si + 1]` → `wallPts`) + test "wall index"; vitest 60/60. Controls vs
`full-cross.json`, sizes not closed: Memoir A 81 → 81, Pickleball 39 → 39, Leah 21 → 21,
Dyanna 43 → 43, Cassandra 12 → 12. Full run → `scratchpad/full-wallpts.json` vs
`full-cross.json`: identical on every file (empty 23, notClosed 1564, open ends 4992; the same 3
raster errors), 0 WORSE. Accepted as a correctness fix; `full-wallpts.json` is the reference.

### Local rival v2 applied — controls clean, full run started (11 Nov 2026)
`chain4.sh` (08:11–08:14): `patch-rival.py` v2 on top of the wall-index fix; dash-train tests
18/18. Controls vs `full-wallpts.json` (empty / not closed / trains taken): Leah 0/21/13 →
0/21/22, Dyanna 0/43/20 → 0/43/27, Cassandra 4/12/0 → 4/12/0 (stays at 0, as required). More
trains, no size closed or lost on these three. Full run → `scratchpad/full-rival.json` vs
`full-wallpts.json` — see the next entry.

### Local rival v2 — NOT ACCEPTED: Glinda size 12 loses a piece (11 Nov 2026)
Full run `full-rival.json` vs `full-wallpts.json`: better Memoir A (open 38 → 37), Lumiere
(18 → 17); WORSE MDF463 Glinda, notClosed 37 → 38 (dash trains 11 → 24). Totals: notClosed
1564 → 1564, open ends 4992 → 4991, empty 23 → 23. A solo rerun of Glinda gives 38 again
(deterministic, not load). Fails the 0-WORSE rule.

Why (per-size probe, rival on vs a temporary `DT_RIVAL_OFF` toggle, same build): only size 12
(rank 7) changes, 9 closed → 8. Its own lines are identical in both runs (29 chains, 13192 mm), so
the rival took nothing from size 12. The new leak is at (663.8, 1190.4): size 12's own seam
(chain 2650, motif `5,1`) ends 3.39 mm short. Within 3.6 mm sit two NEW trains in size 10's pen
(motif `3.75,1.75,3,1.5,1.75,4`, 282.7 and 84.9 mm) that stay UNRANKED: the local rival let the
dashes join into a train, but no rank adopted it. The unranked train moves the walls next to
size 12's open end, and the fill no longer closes that piece. This is the trap "the fill reacts to
any move of a wall": a train joined in the linker shapes the fill even when nobody owns it.

Lesson for a retry: a train that the local rival allows must also be ranked (adopted by the rank
that owns it), or it must not be joined at all. Joining dashes that stay unranked is pure risk:
nothing gains a line, and the walls move. Reverted to the wall-index state (backup
`dt-wallpts.ts.bak` / `.test.bak`, identical to the accepted state except the rival); vitest
60/60. The rival code is kept in `scratchpad/dash-train.rival.ts` and `patch-rival.py`.

Probe note: `persize.mjs` printed `FAIL … 0 null` on Glinda although the child printed
`@@PERSIZE` (the child run directly writes it). Run the child directly
(`PS_CHILD=<bundle> node --max-old-space-size=8192 persize.mjs <pdf>`) and parse the file.

### MARKS applied — Valentina +3, full run started (11 Nov 2026)
Owner approved the rule ("правило по маркс да"). `sizes/corners.ts`: EXTEND waives the trend when
each edge has a CROSS piece OR is MARKED — its gap to the vertex is filled with glyphs (small sheet
paths, bbox longer side 0.3–2.5 mm, `glyphMarks` in `sizes/recover.ts`) of the shape the rank's
own chains are made of (same closed flag, size ±10 % + 0.05 mm, read from the own chains'
`ranges`), the end's ink (≤ 30), taken by no other rank's chain, ≤ 0.4 mm off the edge's line,
≤ 2.5 mm apart from the end to within 0.5 mm of the vertex, at least 2. Counter `marked` (both
edges CROSS → `crossed`, else `marked`); it counts every corner closed with marks evidence, also
ones the trend would have passed. Off-switch `MOOD_MARKS_OFF=1` (debug). Unit tests: 6 MARKS cases
in `corners.test.ts` (both edges / one edge / open or larger glyph / glyph of another size, with
a control / CROSS + MARKS); vitest 65/65, tsc clean (only the old xlsx errors).

Valentina, MARKS off vs on, same bundle: extended 53 → 70, marked 37, "extend: off the trend"
23 → 6. 17 new corners (r2 ×7, r4 ×5, r8 ×3, r6 ×2), none in rank 1. Sizes closed: L 3 → 5,
4XL 2 → 4, XS 6 → 5. XS loses a piece with no new corner of its own: the new leak is at
(367.3, 970), the end of its own 862 mm seam (chain 1432) with an unranked parallel (1433) 1.5 mm
off; the nearest new corner is 82 mm away. Chains are identical in both runs — this is the
"fill reacts to a far wall" trap again, so the full run decides. File total: 3 more pieces closed.
Full run → `scratchpad/full-marks.json` vs `full-wallpts.json` — see the next entry.

### Valentina after MARKS — the 6 corners still "off the trend" (read only, 11 Nov 2026)
Read from the `MOOD_F2_DEBUG` lines of the MARKS probe (no new run; the full run was busy).
`inTrend` takes one corner of each side, or two of one side, and wants the corner within
max(0.5 mm, 0.35 × step) of their grading line. Three groups:
- Too few neighbours (3): r0 at (1063.6, 1181.5) has r1 only; r5 at (1271.7, 595.2) has r3 only,
  44 mm away; r6 at (77.9, 880.2) has none. No trend can be read; only CROSS / MARKS can close
  them, and they have neither. Next: look at the raw paths in those boxes (`PS_BOX`) — is the
  corner inked in a third way, or is it not a corner of this size?
- Noise of an extrapolation (1): r0 at (475.0, 875.2) — r1 and r2 sit on the same point (step
  0.28 mm); extrapolating two ranks out (f = 2) puts the prediction 0.57 mm away against a 0.5 mm
  floor. The floor ignores that extrapolation multiplies the noise of the two corners it is read
  from. Candidate (owner's choice): floor 0.5 mm × max(1, |f|), or treat a zero step as "the
  sizes share this corner" and test against the nearest one.
- Grade not linear (2): r2 at (908.2, 1257.9) is 3.05 mm off the r0–r3 line (tol 2.42); r3, r4
  step 7 → 9.4 mm, so r2 fits a growing step. r5 at (90.6, 16.7) is on the same point as r3 while
  r6, r7 jump 12.7 mm — and y = 16.7 is the top of the sheet: read the box before any rule.

### GFIT_TOL_PDF — clean patch prepared, not applied (11 Nov 2026)
`scratchpad/gfitpdf/gfit-tol-pdf.patch` (51 lines, `git apply --check` passes): `GFIT_TOL_PDF`
(grade point 2.4 mm, edge p95 2.0 mm, extrapolation × 2.5) in `pieces/gfit/fit.ts` and
`repairTol()` in `repair-hook.ts` (`GRADE_TOL_P0=1` brings back the CAD one). The sandbox's probe
hooks (`HOLES`, `probeWhy`, crossing probe in `repair.ts`) are left out. Held back: one change per
full run — it goes in after MARKS is judged.

### Queue reordered by the owner (11 Nov 2026)
Corner rules (CROSS, MARKS, shared corner) only finish a size line that is already drawn; 68 % of
leaks are `no-own-line` (the line split into < 8 mm pieces). Steps so far are ~1–1.5 % of
notClosed each (1586 → 1564). New order after MARKS is judged: clipped dashes, then
`GFIT_TOL_PDF`, then the shared corner (owner chose variant (b); WIP patch
`scratchpad/shared/shared-corner.wip.patch`, its "two ranks out" unit test still fails — `src`
kept at the MARKS state, vitest 65/65).

### Faster loop: screening set + net acceptance (owner, 11 Nov 2026)
Why: one change per 9–10 h run with "no file WORSE" gave ~2 tries a day, and the fill's far-wall
noise (Glinda under rival, Valentina XS under MARKS) can reject a net-positive change on one file.
- A: `scripts/pattern-import/fast-set.txt` — 30 files: the 23 whose numbers moved between full
  runs (fill-off, landed, landed-merged, tee, cross, wallpts, rival; moves caused only by a
  timeout excluded), Dyanna and Cassandra, and the 5 stable files with most not closed (Kalla,
  Paris, Reims, Verona, Emma). 826 of the 1564 not closed. `regress.mjs` got `--files <list>`,
  `--ref <json>` (compare with any earlier `--out`, prints the net) and `ms` per file.
- B: acceptance by the net of the full run vs the reference; each WORSE file is read — noise
  does not block, a real loss rejects (CLAUDE.md, "Goal and acceptance").
- C (in progress): find why a wall far from a piece changes whether it closes, and make the fill
  local, so per-file numbers stop moving by noise.
MARKS (started before the change) is judged under B.

### C — where the far wall comes from (11 Nov 2026)
Read in the code (an Explore pass, every citation checked): corner walls are per rank
(`cornerItems` filters `c.rank === r`), so a new wall cannot reach another size directly. It
reaches it through four family-wide or sheet-wide statistics:
1. `continuityVerdicts` growth band = `[0.5·min g, 1.5·max g + 0.003]` over EVERY anchor pair of
   the family, and pass 2 judges against live neighbours "worst first" — a new anchor anywhere
   moves the band of every continuity closure;
2. `bridgePass` `expectedArea` — a regression over all closed unbridged ranks of the family;
3. GRADE P2 `wantB` — (B) and `silentRead` run for the whole sheet only when (A) repaired any
   size anywhere, so one repair on one family changes which sizes G26 holds on all of them;
4. `excl` — frames found at rank r are excluded for every later rank.
Step 1 of making it local: `MOOD_LOCAL_BAND` (probe switch, default off) — the band from the
pair around the rank plus pairs with an anchor ≤ 2 sizes away. New
`pieces/continuity-band.test.ts` reproduces the trap with today's code (a far 20 % pair flips a
near refusal into kept) and pins that the switch removes it; vitest 68/68. Not applied by
default: which of the four fired in Valentina XS is unknown. After the MARKS run: Valentina with
`GRADEP2_DEBUG=1`, MARKS off/on and `MOOD_LOCAL_BAND` off/on — the `GRADEP2 fam` lines show each
size's `rankFrom`; only the mechanism that fired gets the local form.

### MARKS judged by the net (11 Nov 2026)
Full run `full-marks.json` vs `full-wallpts.json`, 176 comparable files: notClosed −74,
emptyRows 0, litOpenCard 0; 33 better, 2 WORSE, 2 timeouts. Read each:
- Tropea, Madison timeouts — load, not MARKS: alone (`--par 1`) they take 43 s and 131 s
  (limit 1200 s at `--par 2`); Tropea 12 → 11, Madison unchanged. Net −75.
- Emberly 12 → 16 — not a loss: a seed that was junk is now a 7th piece, closed in L–4XL and
  open in XXS–M; closed sizes 42 → 47.
- Ambrosia 28 → 29 — a real loss, and MARKS's own: size 26's dash-dot line (#2666, 981 mm) runs
  2 mm back over its head; its own dots "marked" end 0 to end 1, the self-link cut a pocket and
  the piece went `tiny` (`GRADEP2 fam 4`: `14c*` → `14t`).
- Fix, third form. (1) "a glyph ANY chain is made of is not a mark" and (2) "a glyph of either
  joined line is not a mark" both screened at fast set +9 notClosed vs `full-marks.json`, 7 WORSE,
  identical file for file — so the loss was the part they share: refusing the joined line's own
  glyph also refused the one AT its end, where every run of marks starts, leaving < 2 marks.
  (3) "a joined line's glyph only AHEAD of the end (> 0.5 mm)" screened +9 again, file for
  file. My Estoril probe had been read against MARKS-off, not against MARKS without the fix —
  against the right reference (a temporary switch) 3XL still lost 2 pieces: three real corners
  (r6, two different lines, ~3 mm gaps). Cause: the glyph → line link goes through the PDF
  path, and one path carries many glyphs; a line made of part of a path "owned" the glyphs of
  the rest, lying in the gap where no line is drawn.
- (4), kept: judged by geometry — a glyph ahead of the end is refused when one of the two joined
  lines runs through it (≤ 0.4 mm, `drawnBy`), i.e. the line really is drawn there. Probes:
  Estoril = MARKS without the fix in every size (marked 46 → 43, no row moves), Ambrosia = off
  (marked 14 → 13: only the self-link goes). Tests: "a glyph the joined line itself runs
  through" (fails with the rule off) and "a glyph in the joined line's PDF path, off its
  geometry, still marks"; vitest 70/70.
Next: fast set (4) vs `full-marks.json`, then a full run of MARKS + fix as the new reference.
- Fast set (4) vs `full-marks.json`: net +1 — Mendocino S loses 3 corners that MARKS had closed
  by a self-link (X:0 ↔ X:1), Ambrosia −1 (the pocket is gone). The same signal (a line's own
  glyphs joining its two ends) is the pocket in one file and a real corner in the other: no local
  rule tells them apart. Kept (it guards the pocket), MARKS closed. No full run (owner):
  `full-marks.json` stays the reference.

## Pivot: big changes first, UI is the judge (owner, 11 Nov 2026)

Rules per evidence (dash trains, CROSS, MARKS, rival…) gave ~1–1.5 % of notClosed each. Owner:
make the large structural change, then find where it needs targeted fixes. 40 files, not 180
(`scripts/pattern-import/set40.txt`: the 30 of `fast-set.txt` + the 10 worst by notClosed in
`full-marks.json`). Regress only when a specific question needs it. Acceptance is the OUTPUT
(owner, corrected): the DXF written from the PDF — every piece in every size present, every
outline closed, no gap, no line left undrawn. Not the wizard's steps (my first reading).

### Design: drawing by the grade (11 Nov 2026, not coded)

What already exists (read in code): `repairPass` (`pieces/gfit/repair-hook.ts`, hook A in
`fill.ts`) predicts a leaking size from its two bracketing anchors, snaps the outline to the
size's own / common / overlay lines inside the corridor, fills holes from the prediction as
derived `grade-fill` edges, and the manifest already writes `geometryOrigin: 'repaired'`. So
"draw by the grade" is not a new module — it is this repair with the caps that stop it lifted
and an honest guard in their place. What stops it today (Leah, measured in 3a–3e): the model
(`no-model:inconsistent`, the CAD tolerance), the hole caps (E2: ≤ 15 mm each, ≤ 4 % of the
perimeter; G15: ≤ 6 holes, ≤ 60 mm), E2-hole-end, and extrapolation (`not-bracketed`).

1. **Model.** `GFIT_TOL_PDF` (patch ready, 2.4 / 2.0 mm). Interpolation only, as 3a decided.
   Piece-level leave-one-out residual ≤ 2 mm p95 or the piece is not graded at all (owner's
   per-piece variant).
2. **Snap, then draw.** Snap as today. What stays unsnapped is DRAWN from the prediction — the
   hole caps go. In their place one guard per size: drawn length ≤ `maxDrawnShare` of the
   perimeter, and every drawn stretch must (a) cross no line of that size nor a common line (a
   crossing = the prediction is in the wrong place), (b) lie where both bracketing anchors are
   drawn and run parallel within the tolerance (the grade is linear there; the armhole / neckline
   failures of 3a are exactly where it is not).
3. **Hole ends.** E2-hole-end is replaced by the snap itself: a hole starts where the outline
   leaves the corridor's wall, wherever that is (end, T or mid-line). Guarded by 2(a).
4. **Flag.** New derived kind `grade-draw` (long, drawn) beside `grade-fill` (short); G15 audits
   both against the prediction instead of capping them. Repaired sizes are not anchors (today).
5. **UI (needs a mockup first).** Today derived edges are not drawn differently anywhere in the
   wizard (checked: no reader of `derived` / `repair` under `pattern-import/steps`). Sizes and
   pieces steps: a drawn-by-grade stretch in its own style, and the result lists them (how many,
   mm, from which sizes). Can be rejected, which reopens the gap.
6. **Acceptance.** The DXF of the 40 files (`dxf-shot` + `dxf-check`, below): every piece × size
   written and closed; the pictures read; numbers (cells closed, drawn mm) second. The flag rides
   into the DXF too (a layer or colour per drawn stretch — to settle with the owner).

Open choices (owner): `maxDrawnShare`; whether the extreme sizes (no anchor on one side) are
ever drawn; per-piece vs per-edge residual.

### DXF shot — the acceptance tool (11 Nov 2026)

- `scripts/pattern-import/dxf-shot-entry.ts` + `dxf-shot.mjs`: a PDF through the REAL wizard hook
  (`runCase` of the autopilot, React shimmed), one process per PDF. Pass 1 reads the legend, pass 2
  runs with a card of those sizes and keeps the written DXF (`AUTOPILOT_DXF_OUT`). Questions that are
  not geometry are answered as an operator (`AUTOPILOT_ORACLE_PAGES=1`, `GOLDEN_ANSWERS` pages /
  asides / outline seam) — first try on Leah stopped at the files step on a page-role question,
  which says nothing about lines.
- `autopilot-entry.ts`: `rec.families` = every region × exported size with outcome, `rankFrom`,
  repair, refusal, derived mm; outlines / leak point / grade prediction under `AUTOPILOT_OUTLINES=1`.
  Needed because a region that does not close is a pieces-step STOP (policy, Codex #3): the product
  writes no DXF then, so the matrix is the measure for those files.
- `scripts/pattern-import/dxf-check.mjs <dir> [--png]`: matrix vs written blocks (layer-1 cut line:
  closed, ≥ 3 pts, ≥ 1 cm², no self-crossing), `complete` = wrote + all cells closed + blocks ==
  cells + nothing bad; `shot.png` per file (sizes overlaid per piece, leaks red, prediction dashed).
- Leah: stops at pieces, 105/126 cells closed, no DXF. On the picture the grade prediction lies
  where the refused sizes of SKIRT FRONT and SLEEVES should run — the case for drawing by the grade.

### Drawing by the grade — implemented (11 Nov 2026)

Owner: "do it by your recommendations; fix if problems come up". Choices: `maxDrawnShare` 15 %;
extreme sizes (no anchor on one side) never drawn; the model judged per piece (fitFamily), not per
edge.

- `pieces/gfit/fit.ts`: `GFIT_TOL_PDF` (pt 2.4, edge 2.0, extrap × 2.5) — the repair's tolerance
  now (`repairTol()` in repair-hook; `GRADE_TOL_P0=1` brings back the CAD one).
- `pieces/gfit/repair.ts`: `RepairOpts.draw = { maxShare }`. E1 cover ≥ 1 − share; the per-hole
  E2 rules (≤ 15 mm, ≤ 4 %, ends = wall ends) give way to `D-share` (holes ≤ share) and `D-cross`:
  a hole end that is not a wall end must sit on a wall running ALONG the prediction (≤ 30°), and
  no filled stretch may cross an own / common wall away from its ends. E2-end-offset, E3, E4 stay.
  Found by the unit test: a line ACROSS the gap captured the prediction and split the hole into
  two with mid-wall ends — without the "along" rule a common line there would have passed.
- `pieces/gfit/repair-hook.ts`: strict first; on refusal (with a model) a draw retry, G15 count /
  mm caps lifted for it. Holes > 15 mm are derived `'grade-draw'`, shorter ones stay `'grade-fill'`;
  `RepairRecord.drawnMm`. `GRADE_DRAW_OFF=1` turns the retry off.
- `types.ts` `DerivedEdgeKind` + `'grade-draw'`; manifest kinds list; `ManifestGrade.drawnMm`
  (written by manifest-build, validated) — the DXF-side flag (the manifest rides in the DXF). A
  visible layer / colour for drawn stretches is NOT added (CLO layer set; owner to decide).
- Gate G15: `'grade-draw'` per-edge bounds ∞, per block ≤ `DERIVED_DRAWN_MAX_SHARE` (=
  `GFIT_REPAIR.drawMaxShare`) of the line; not counted in the chord count / 5 % / 60 mm.
- Tests: `pieces/gfit/repair-draw.test.ts` (4: strict refuses 40 mm / draw accepts; share; cross;
  extreme size). All pattern-import tests pass (single-fork run: `techpack/labels-sheets.test.ts`
  fails only in single-fork — passes alone, not this work). ESLint 0 errors.
- Not yet: `yarn build:check` (tsc OOM while the 40-file baseline runs), the set40 rerun vs baseline.
- Peer review (session -80) fixed: misplaced JSDoc in sizes/recover.ts and sizes/corners.ts. Open
  risks it raised, to check later: chainBand drops a U-shaped MST component instead of cutting it;
  O(n²) Prim / `q.shift()` BFS on dense clouds; g15 `onOpenEnd` does not check the ends face each
  other; fill.ts `closeGaps` now on for every single-size import; corners.ts convention gate before
  CROSS/MARKS; recover.ts ambiguity cleanup keyed on message text.

### Drawing by the grade — peer review fixes (11 Nov 2026)

A read-only review by the peer session (grbpwr-admin-client-80) of draw mode; verified against the
code, fixed where the hook could accept what the gate or the manifest later refuses:

- Hook vs G15 on short holes: a drawn block skipped the hook's G15-holes / G15-holes-mm caps, yet
  its short holes were written as 'grade-fill' and counted by G15 as chords (≤ 6) and invented mm
  (≤ 60) — a drawn block with 7 short holes would pass the hook and fail the gate. Fixed by
  meaning: a drawn block was accepted under the draw rules as a whole (no hole-end / count / sum
  check), so ALL its holes are 'grade-draw' and `drawnMm` = all its holes. This also closes the
  second finding: a block taken by draw with only short holes was not marked drawn anywhere.
- Share margin: the repair measures holes along the prediction, G15 measures the fill polylines
  against the written line. The hook now draws up to 14 % (`GRADE_DRAW.maxShare` =
  drawMaxShare − 0.01), the gate keeps 15 %.
- Manifest bounds: the grade record allows holes ≤ 16, holesMm ≤ 1000; draw mode had no count
  cap. New draw refusals `D-holes` / `D-holes-mm` at those bounds.
- E1-cover in draw mode repeated D-share (cover and holeShare share each hole's first segment):
  dropped in draw mode; test asserts it.
- `along()`: stepped over a zero-length segment (closed walls repeat their first point) — a fill
  along a wall could get a false D-cross there.
- `GRADE_DRAW_OFF` now only `=1` (was: any non-empty value, "0" included).

Recorded, not fixed (edge cases; revisit only if the set40 pictures show them): a short cross wall
(≤ ~2·(1 + r) mm) counts as a wall END, so the along test is not applied to it; `along()` uses a
two-sample prediction tangent, which can reject a legit wall at a sharp corner; overlay walls are
left to E3-topology, not D-cross; a draw refusal after a strict one is only in the DEBUG log.
Missing tests listed by the peer: G15 share (pass at 14 %, fail above 15 %), manifest `drawnMm`
parse / round-trip, `tryRepair` record consistency, crossesWalls distance cases.

### Glinda: an unlabelled pattern tile stops the sheet (11 Nov 2026)

Baseline set40: MDF463 Glinda stops on the SHEET step (the only one of 30 so far): "page 59 prints
no tile label while 84 tiles of this sheet do (A1 … J9)". `assemble/group.ts` (step 1b) puts it in
`leftOut` / `refused`; `autopilot/policy.ts` sheetStep stops on any `refused`; dxf-shot never
reaches the legend, so 0 pieces (regress, which calls assembleSheetDetailed and ignores `refused`,
sees 37–38 notClosed there — the two measures differ for this file). Rendered page 59: it IS
pattern — the size lines of G8 run on into it; the publisher left the "G9" label off. Setting it
aside would cut every size's line ends.

Owner's decision (11 Nov 2026): option 1, AFTER drawing by the grade is measured — an unlabelled
page is placed by page order when exactly one grid cell is free between its labelled neighbours
(G8 → ? → H1 ⇒ G9), and only if the lines meet across the seam with the neighbour; otherwise the
stop stays. Diagnosis by the peer session (grbpwr-admin-client-80).

### set40 DXF baseline — old code, before drawing by the grade (11 Nov 2026)

`scratchpad/shot-base` (dxf-shot, two passes, par 2), table `scratchpad/shot-base-check.txt`.
40 / 40 files stopped, 0 DXF: 39 on the pieces step (regions leak / sizes held back), 1 on the
sheet (Glinda, unlabelled tile — previous entry). The measure is therefore the piece × size matrix:

- cells 4752: closed 3498 (73.6 %), leak 1107, refused 54, merged 66, tiny 27; the old strict
  grade repair took 7 cells in all.
- open 1254: 860 leaks are bracketed (a closed size on both sides in the piece) — the ceiling of
  drawing by the grade; 106 are an extreme size (never drawn); 288 are other (merged / tiny /
  refused, or a leak with no closed size on one side).
- pieces 329: 44 closed in every size; 188 more would be if every bracketed leak were drawn.
- files: only 4 of 40 have every open cell a bracketed leak — the extremes and merged pieces hold
  the rest at the pieces step even if drawing takes all it may.

### Leah alone: what stops drawing by the grade (11 Nov 2026)

The set40 draw run was stopped after its first file (MDF349 Leah: 105 → 106 closed) to see why
the rest is refused. Leah alone, `SHOT_STDOUT=1 GRADEP2_DEBUG=1` (dxf-shot now keeps the child's
stdout as `stdout.txt` beside `run.json`), the strict refusal and the draw refusal both logged
(`draw:<why>`). 20 leaks; the draw refusals: not-bracketed ×5 (closed sizes above, but not
trusted by the model), D-share ×3 (the small neckline facing), D-cross ×5, E2-end-offset ×2,
E4 / E3 ×2; one facing's leaks are never tried.

D-cross was split first: `D-cross-wall` is now its own refusal (a drawn stretch crossing a wall
away from its ends); every Leah D-cross was the other branch — a hole end that is not a wall end
sits on a wall the code judged ACROSS the prediction. The debug line now prints, per such end, the
wall's kind, length, arc position and angle. Three kinds:

1. notch ticks — common walls 6 mm long at 85–89°: the cut line runs through a notch by design.
   Fixed: a wall no longer than a notch's depth (8 mm) does not block (test: a tick in the hole).
2. corners — 36–42° on the own wall at a corner: the centred tangent there is the bisector.
   Fixed: the best of the centred and both one-sided directions, against the wall segment and its
   neighbours; a line across is across on both sides and still fails.
3. still refused — 33–61°, a few mm (4–8) short of a common line's end, end offset 0.6–1.7 mm:
   where the size's line meets a common line near its end. Left as is (owner's call, see below).

Result on Leah: no cell gained — behind D-cross the next checks refuse the same cells (TOP FRONT 14
now E4-off-corridor + E3-topology; the facing D-share). On Leah the ceiling is not-bracketed and
D-share, not the crossing test.

### Peer review of the along() change: a neighbour segment by index (11 Nov 2026)

The peer session (grbpwr-admin-client-80) found a real bug in the corner fix: `alongCos` took
the wall segments j−1, j, j+1 by index, however far the snap is from their shared vertex — a line
across the prediction whose next segment (20 mm on) runs parallel to it passed as "along" and the
fill went through it. Fixed: a neighbour counts only within 3 mm of the shared vertex; test "a
crossing line that turns along the prediction further on is still across" (fails without it).
The set40 draw run in progress (`scratchpad/shot-draw`) was bundled BEFORE this fix: its drawn
cells are re-checked by rerunning only the files whose cells changed.

Open from the same review: the notch exemption (wall ≤ 8 mm) applies to the end test only;
`crossesWalls` (D-cross-wall) has none, so a short tick crossing the drawn chord away from the
ends still refuses — left as is (refusing is the safe side).

### Owner's goal and decision: draw and mark (11 Nov 2026)

Goal, restated by the owner: when a PDF is parsed into DXF there are no gaps and no undrawn lines
in ANY parsed file — every piece, every size, closed. The measure is files fully closed in DXF
(set40: 0 / 40 at baseline), not cells.

Decision: lines the drawing cannot prove are DRAWN AND MARKED — the DXF is always written and
closed; drawn stretches go to their own layer / colour and the import step asks the operator to
check them; risk is bounded by thresholds (share, distance from the anchors), not by stopping.
Consequences for the queue: (1) the pieces step must pass a file whose open cells are all drawn
(today it stops on any leak); (2) drawing widens beyond the bracketed leak — the nearest closed
untrusted size as a partner, one grade step past the last closed size for an extreme; (3) the DXF
layer and the UI mark (mockup first); (4) the classes drawing cannot reach — merged / not
distinguished sizes, pieces with no closed size — are reading problems, worked file by file.

### Seam gaps on Leah: the source draws the break, not the tiling (11 Nov 2026)

Question (owner): do gaps come from lines sitting on page seams? Leah tile grid: page
209.55×279.4, pitch 196.85 × 266.7, overlap 12.7 mm. Statistics: holes in a seam band 4/38 (11%),
leaks 3/20 (15%), uniform placement would give 17% — no clustering overall.

Line ends dumped at the in-band holes (`AUTOPILOT_SEAM_PTS` in autopilot-entry, `PLACE_DEBUG` in
`assemble/place.ts`, both env-gated):
- (209,1233) and (211,114): every size line there is a WHOLE path present identically on two to
  five pages (placePages keeps one copy, "whole-dup"); nothing is clipped or deduped away. The
  PDF itself draws each size line as consecutive separate paths with a slightly different dash
  scale (e.g. 9.59/1.03 ending at x 197.8, then 9.36/1.00 starting at 205.5), broken by 3–9 mm
  where a notch tick sits. The gap is in the source drawing; the seam band is a coincidence of
  where the drafter broke the line.
- (600,721) and (784,268): the segments on adjacent pages OVERLAP across the band — no source
  gap; those holes have another cause (rank / link), not checked yet.

Consequence: no fix in sheet assembly. The candidate is the linker: join consecutive
same-size segments across a notch-sized break (≤ ~9 mm, dash scale within a few %). Open: the
CB/CF line missing for a whole page row (owner's screenshot) — not yet checked.

### Drawing by the grade — set40 measured (11 Nov 2026)

`scratchpad/shot-draw` (bundle BEFORE the along() 3 mm fix) vs `scratchpad/shot-base`:
- files complete 0 / 40 both sides (every file stops on the pieces step: any leak stops it);
- cells closed 3498 → 3575 of 4752, open 1254 → 1177; 77 leak → closed, 0 closed → open;
- 69 cells are drawn. The peer counts 22 of them as crossing another size's outline transversally
  (≥ 20°; collinear crossings on shared stretches are noise). Paris: 8 crossing, 14 clean.
- Thresholds: the distance to the anchor says nothing (every drawn cell is 1 rank from both
  anchors). The share of the perimeter is weak: dropping cells above 12.2 % catches 8 of 22 and
  loses 1 of 47. Geometry separates: 16 of 22 cross the outline of the ADJACENT bracketing
  anchor (lo / hi).
- Why E3-topology lets them through: `canonTopology([oLo, o, oHi])` checks that strong corners
  survive and keep their order, not that the rings do not cross.

Next: rerun the 14 files with crossing fills on the along()-fixed bundle (`shot-draw2`); if
crossings survive, add D-cross-nest (the drawn stretch must not cross oLo / oHi at ≥ 20°, more
than 2 mm from the fill ends).

### Seam gaps on Leah are corners; the trend lacks neighbours (11 Nov 2026)

Correction to "Seam gaps on Leah": the breaks at (209,1233) and (211,114) are not straight
breaks at a notch — each is a corner (turn ≈ 40°) cut by "align dashes to corners" into
main path + L-stub + main path. A straight join does not apply.

PDF layers (optional content): 176 of 180 files have none; one each has 1, 3, 5, 6 groups; Leah
none. The pen (dash / width / colour) stays the only size label.

`MOOD_F2_DEBUG=1` on Leah (`SHOT_STDOUT=1` writes `<file>/stdout.txt`), corner (193,1235):
- ranks 7, 9, 11, 12, 15, 17 close by stub / extend; their vertices step ≈ 1.55 mm per rank.
- r5 (size 8): EXTEND 36→156, vertex 193.8,1234.9, refused "off the trend". The grade through
  the closed corners puts r5 at ≈ 193.9 — it IS on the trend. `inTrend` refused because it
  needs one neighbour on each side or two on one side within 3 ranks; below r5 nothing is
  closed, above it only r7 (r6, r8 open). 
- r3 (size 4): 33 → stub 34 (classed `common`, 3.2 / 3.6 mm off both ends) → 154; the ends are
  9 mm apart > `extendMaxMm` 8, so no candidate at all.
- r0: vertex 2.5 mm off the trend — a real refusal or another corner, not checked.
Across Leah's 36 distinct "off the trend" refusals: 29 have too few closed neighbours
(debug window ±2 ranks), 7 have neighbours on both sides and are really off.

Rerun of the 14 crossing files with the along() fix (`shot-draw2` vs `shot-draw14`): 59 drawn
cells, 21 cross transversally (≥ 20°), 38 clean; one cell closed → leak, none new. The along()
fix did not remove the crossings; D-cross-nest stays the candidate.

### Corners: trend over the whole run + wide extend (12 Nov 2026, owner chose (a)+(b))

Change in `sizes/corners.ts`:
- `trendSupport` (was `inTrend`): the nearest closed corner on each side at ANY distance in the
  run (reach 25 mm × min(d, 3)), not only within 3 ranks. It returns the support: how many
  ranks' corners lie on the grading line. Continuing a step from > 3 ranks away needs support
  ≥ `wideSupport` (3).
- WIDE extend: ends or vertex past `extendMaxMm` 8, up to `wideMaxMm` 15, close by the trend
  alone with support ≥ 3. A wide candidate is not trend support until accepted.
- Passes repeat until nothing new closes. An accepted wide corner joins the trend vertices.
- New refusal key `extend: wide, trend too thin`; `CornerOut.wide` counts them.
- Unit tests: `sizes/corners.test.ts`, "by the trend of the whole run" and "WIDE extend".

Leah (`scratchpad/shot-leah-f3` vs `shot-leah-f2`): extends 190 → 266, unique "off the trend"
19 (was 36). At corner (193,1235) sizes 00, 4, 8 close: vertices 185.6 / 190.5 / 193.8 on the
grade of 12…32 (step ≈ 1.65 mm). Size 00's earlier "2.5 mm off" was the same missing-neighbour
effect, not a real refusal. Cells: 3 leak → closed (C SLEEVES 30, B TOP FRONT 14, F FRONT
NECKLINE FACING 2), 0 worse. Leah still stops on the pieces step (6 regions).

set40 run: `scratchpad/shot-corners` vs `scratchpad/shot-draw` (note: shot-draw predates the
along() fix, which moved 1 cell on the 14 crossing files).

### set40 result — corners (trend over the whole run + wide extend) (12 Nov 2026)

Hypothesis: the corner change closes corners the old trend left open for want of neighbours,
without closing a wrong corner.
Change: "Corners: trend over the whole run + wide extend" above. D-cross-nest NOT applied.
Run: dxf-shot set40 `--par 2` → `scratchpad/shot-corners`; reference `scratchpad/shot-draw`
(before the along() fix). Compare: `peer-tests/shot-compare.cjs <base> <new> --changed`.
Numbers:
- files complete: 0 / 40 (unchanged; every file but Glinda stops on the pieces step, Glinda on
  the sheet — the unlabelled tile, queue 2a);
- cells closed 3575 → 3641, leak 1030 → 964 (open 1177 → 1111); leak → closed 68, closed →
  leak 2; 70 changed cells, 27 of 40 files better, none net worse;
- WORSE 1: Harper (MDF404) C SLEEVES · 18 — NOT the corners: it is already leak in `shot-draw2`
  (the along() fix). Base closed it by a 209 mm drawn stretch; now refused `draw:D-cross`, i.e.
  the old close crossed a line — the refusal is right.
- WORSE 2: Memoir A (MDF363) H CENTER FRONT LOWER · 0, closed → leak (`not-bracketed`), leak
  at (830, 1347) on the old outline's bottom edge. Bisect: `MOOD_WIDE_OFF=1` (new debug switch,
  skips wide candidates) → Memoir 0 changed cells, so the wide extend causes it AND the file's 6
  gains. The only wide extend of rank 1 inside H's box: chains 4863:0 + 4892:1 at the piece's
  top (vertex 792.5, 1094.0) — far from the leak, the fill's far-wall effect. Not yet proven
  that this is the one.
Verdict: KEPT (68 : 1 on corners). Open: the Memoir wide extend (which link, why the bottom).
Lesson: a size that closes by itself can lose its close to an extra link at another corner of the
same piece — a new link is not free even when it is right.
