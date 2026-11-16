# Pattern import — code tasks for Cursor (16 Nov 2026)

Code-only tasks that come out of the failure map (`open-lines-journal.md`, 16 Nov, "Failure map").
Each one is self-contained: write the code, cover it with unit tests, stop. **No runs.** Do not run
`dxf-shot`, `walls-dump`, `nest-check`, or any script over the PDF archive. The measurement on
set40 + holdout40 is done separately, after the code, and only with the owner's OK.

## Rules for every task

- Read `src/lib/pattern-import/CLAUDE.md` first, then the header comments of the files named in the task.
- **Every change goes behind its own env flag and is off by default.** With the flag off, behaviour
  must be byte-identical: every existing test passes unchanged.
- Read flags the way the code already does: `typeof process !== 'undefined' && !!process.env?.FLAG`
  (see `GFIT_LOCAL` in `pieces/gfit/repair.ts`).
- Tests use the synthetic families in `pieces/gfit/repair-extrapolate.test.ts` and
  `repair-draw.test.ts`: a bodice that widens 6 mm and lengthens 8 mm per size. Copy that pattern.
  Each task needs at least one test for each of these:
  - the flag accepts what it should;
  - it refuses the trap named in the task;
  - flag off leaves the old result.
- Done when all of these pass:
  - `npx vitest run src/lib/pattern-import`
  - `yarn build:check` (two old type errors, in `scripts/pattern-import/autopilot-entry.ts` and
    `ink-check-entry.ts`, are not yours)
  - `npx eslint <the files you changed>` and `npx prettier --check <the files you changed>`
  - `yarn test`
- **Never run `yarn lint`, `yarn format` or `yarn fix`.** They rewrite the whole of `src/`, generated
  proto clients and JSON fixtures included. `git status` must list only the files of your task.
- Add a short entry to `docs/pattern-import/open-lines-journal.md` covering what changed, the flag,
  and the tests. Write it in English, using the entry template at the top of the file.
- Do not commit; the owner decides. Do not touch `src/api/proto-http/*` or `src/ui`.
- Branch `fix-pattern-pdf-open-lines` already has uncommitted work in `pieces/gfit/repair.ts`
  (`GFIT_LOCAL`). Keep it, and build on top of it.

## Glossary

- **rank**: a size's index in the size order. **anchor**: a size of the piece that closed and is
  trusted.
- **pred**: the outline the grade predicts for the open size. It interpolates the two anchors
  around it (`predictPair` in `pieces/gfit/checks.ts`).
- **corridor**: how far a line may lie from pred and still count. The per-sample formula is
  `min(0.6 + 0.25·s, max(0.45, 0.5·s))`, where `s` is the local size step in mm (`repair.ts`, search
  `const cor =`). It never reaches half a step, because the neighbour's line lies one step away.
- **E1-cover**: refused because less than 92 % of pred is covered by the size's own or common lines
  inside the corridor.
- **not-bracketed**: refused because there is no anchor on one side; this is the edge size.

---

## C1. Edge sizes: accept the size's own line one step past the last anchor

**Why.** This is the largest bucket: `not-bracketed` is 375 of 1068 open sizes on set40 and 167 of
486 on holdout40. In 48 % of that length the size's own line already lies along a one-step
extrapolation of the grade. Today only draw mode extrapolates. Plain acceptance of the size's
existing own line refuses `not-bracketed` before it ever looks.

**Where.**

- `pieces/gfit/repair.ts`, `repairSize`, the `else` branch after `if (lo.length && hi.length)`
  (search `refuse('not-bracketed')`).
- `pieces/gfit/repair-hook.ts`, the try, around the `const edge = lo ?? hi;` block. It only passes an
  edge size on when `GRADE_DRAW.extrapolate`.

**What.** Flag `GFIT_EDGE_ACCEPT`.

1. With the flag on, outside draw mode, and not `local`, extrapolate pred from the two nearest
   anchors, the same way draw mode does: `res.extrapolated = true`, `w` outside [0, 1]. Conditions:
   - `trusted.length >= extrapolateMinTrusted`;
   - `|rank − edge| === 1`.
2. Keep every existing check (E1–E4) as it is. Do NOT widen the corridor.
3. New trap guard `E5-on-anchor`. Refuse when ≥ 50 % of the accepted outline's samples lie within
   0.25·step of the edge anchor's outline. Such a close is the neighbour's line, not the size's own.
4. The hook must let the edge try through when the flag is on, even when draw is off.

**Tests** (synthetic bodice, sizes 0–6, size 6 open):

- own line of size 6 present → repaired, `extrapolated: true`;
- own line absent → still refused (E1-cover);
- the only line there is size 5's → `E5-on-anchor`;
- flag off → `not-bracketed` exactly as before.

---

## C2. Irregular grading: a family-measured corridor, plus a nesting check

**Why.** We left one closed size out at a time and predicted it from its neighbours. In
inconsistent families even the best model misses the real outline by 2–3 mm (median p95).

- set40: 2.3 mm;
- holdout40: 3.2 mm.

The corridor is narrower than that, so a correct own line 2–3 mm off pred is refused (E1-cover). The
fix is not a better model (a quadratic was tested and rejected). The fix is to judge by the family's
own measured scatter, and to check that the result nests between its neighbours.

**Where.** `pieces/gfit/repair.ts`, `repairSize`: the `local` path (`GFIT_LOCAL`) and the
`const cor =` line. Helpers are in `pieces/gfit/checks.ts`: `predictPair`, `outlineOf`,
`ringDistance`, `insideWithin`.

**What.** Flag `GFIT_LOCAL_CORRIDOR`. It only acts when `local` is set (which already needs
`GFIT_LOCAL`).

1. **Family scatter.** Take every trusted anchor `k` that has a trusted anchor on both sides in this
   family.
   - Predict `k` from those two neighbours with `predictPair`.
   - Measure p95 of `ringDistance(k.outer)` over the predicted points.
   - `scatter` = the median of those values. Fewer than 2 such anchors → no change (old corridor).
2. **Corridor per sample:** `max(cor_i, min(scatter, 0.45·s_i))`. It grows to the measured scatter,
   never reaches the neighbour's line, and never drops below the design corridor. The other
   parenthesisation shrinks the corridor wherever the step is under ~3.5 mm.
3. **Nesting check** on the accepted outline (new refusal `E5-nest`):

   - the smaller bracketing anchor lies inside it;
   - it lies inside the larger one;
   - use `insideWithin` with tol 0.5 mm.

   Work out from the outlines which anchor is smaller (area); do not assume rank order.

4. Record `scatter` on the result (for example `res.local.scatterMm`) so probes and logs show it.

**Tests** (a family with ±2 mm noise on the anchors):

- own line 2 mm off pred → accepted with the flag, E1-cover without it;
- own line on the neighbour's outline → refused (`E5-nest` or the 0.45·s cap);
- consistent family → nothing changes;
- fewer than 2 measurable anchors → nothing changes.

---

## C3. Lines that no size owns: use them when they lie in the size's place

**Why.** On the paper, the ink is almost always there:

- the reader loses nothing;
- only ~5 % of holes are blank paper;
- yet most missing length has no line of the size.

The rest is ink that the line-to-size step left without a size. Today `repairPass` sees only:

- the size's own lines;
- common, lone and rescued lines;
- the anchors' overlay.

A chain that no rank took is invisible to it.

**Where.**

- `pieces/fill.ts`, the `repairPass(` call (search `GRADE P2 (hook A)`), where the `RepairCtx` is
  built.
- `pieces/gfit/repair-hook.ts`: `RepairCtx`, and the walls loop (`ws.push(`).
- `pieces/gfit/repair.ts`: `GfitWallKind` and the cover count.

**What.** Flag `GRADE_P2_LOOSE`.

1. In `fill.ts`, build `loose: RepairWallIn[]` with `itemsOf(set, ids)`. A chain goes in when:

   - it is in none of `model.byRank`, `model.common`, `rescued`, `lone`;
   - it is not in `excl`;
   - its `role` is not in `NOT_EDGE_ROLES` (`pieces/walls.ts`).

   Add it to `RepairCtx` as an optional field.

2. In the hook, push the loose walls that meet the box as `kind: 'loose'` (a new value of
   `GfitWallKind`).
3. In `repairSize`, a loose wall counts toward cover and toward closing holes, but only on samples
   that:

   - lie inside the corridor (as now);
   - are ≥ 0.25·s from both bracketing anchors' outlines.

   Only the cover rules change. E2–E4 judge the repaired outline as they do now.

4. Probes (`RepairProbe.walls`) must carry the loose walls with their kind, so an offline replay can
   judge them later.

**Tests:**

- a hole whose only ink is an unranked chain in the size's place → repaired;
- the same chain lying on the neighbour's line → not counted, still refused;
- a `notch` / `internal` chain → never used;
- flag off → nothing changes.

**Ceiling (wdall run, 16 Nov).** Every chain was dumped on set40 + holdout40. Count the open sizes
whose pred is ≥ 95 % covered by own + unranked ink, but < 95 % by own ink alone:

- set40: 244 at 1.5 mm, 330 at 3 mm, out of 1068 open;
- holdout40: 72 at 1.5 mm, 114 at 3 mm, out of 486 open.

**This is the largest lever: do C3 first.** C1 alone (own ink only) reaches 15–26 edge sizes on set40.
With C3, edge sizes reach 60–89.

---

## Not for Cursor yet

- Files that stop for reasons other than lines (offset-hull, duplicate identity, the fold list): 15
  of 40 on set40. These need a failure map of their own first.
- The pile-up rule (≥ 3 sizes on one line) for wrong closes: it is being designed in the
  `open-lines-global` worktree (`pieces/nest-judge.ts`), not on this branch.

---

## R2. C1–C3 review round 2 (f3 critique, 16 Nov) — code only, no runs

The first review's three fixes are in (C2 formula, guard on the snapped point, `withBox` once). The
independent critique found that each flag is safe alone but **C1+C3 and C2+C3 are not**. Fix these
before anything is measured. Same rules as above: flags stay off by default, flag-off results are
byte-identical, unit tests only.

Background arithmetic: a bracketed pred lies ~1·s from each neighbour's line, and the base corridor
is ≤ 0.6+0.25s. So ink that passes the corridor is already ≥ 0.75s−0.6 from the neighbour, and the
0.25s guards only bite where s < 1.2 mm. With an accurate pred and the base corridor, **the corridor
is the protection**. The guards matter only when pred is wrong (C1 extrapolation, C2) or the corridor
is wider (C2).

### R2.1 C1+C3 and GFIT_LOCAL+C3: no loose cover where pred is not trusted to a step

In `repairSize`, loose walls are ignored entirely (skipped in `snapAt`) when `res.extrapolated` is
true **or** when `local` is set.

- An edge size has no bracket, so loose ink has no own-line evidence to lean on.
- Under `GFIT_LOCAL`, pred misses by 2–3 mm (p95). Once it is off toward r by more than 0.75s − 0.6
  (2.4 mm at s = 4), the open size r's own unranked line enters r+1's base corridor. r is open, so no
  anchor guard sees it, and r+1 closes on r's line.

Count in the readout (`res.looseSkipped: 'extrapolated' | 'local'`) how many sizes this costs, so
the rule can be reopened with per-chain exclusivity if the number is large.
Test: edge size 6, whose only ink is an unranked chain on the extrapolated pred → refused with
`GFIT_EDGE_ACCEPT` + `GRADE_P2_LOOSE`, and the same chain as `own` → repaired.

### R2.2 C3: loose ink only inside the base corridor

Keep `corBase[i]` (the formula without the C2 widening) next to `cor[i]`. A loose wall snaps only
when `sn.d <= corBase[i]`; own/common/overlay keep `cor[i]`. Then C2+C3 carries exactly C3's own risk.
Test: C2 family with scatter widening the corridor, and a loose chain at a distance between
`corBase` and `cor` → not used.

### R2.3 C3: attribution audit for used loose walls (the sew-line trap)

A sew line of size r+k lies at cut(r) + k·s − SA. Where the normal step ≈ SA/k, it lies ON pred(r)
for a stretch, ≥ 0.25s from both anchors, so the guard passes it. It coincides only on stretches,
because a sew line is a uniform offset and the grade is not.

The fix: run the E4 off-corridor-run audit (`repair.ts`, the loop with `if (w.kind !== 'own') continue`)
on every **used** loose wall too:

- A used loose wall with an off-corridor run > 10 mm is **dropped from the cover**, not refused.
- End stubs ≤ `notchPathMm` are excepted, as for own walls.
- Then the snaps are recomputed without the dropped walls, once.
- The size's own unranked line runs along pred for its whole length and passes. A sew line, or
  another piece's line that only crosses or merges into the corridor, fails.

Tests:

- a loose chain that is size 6's sew line: on pred over 40 mm, off it elsewhere → dropped, and the
  size is refused;
- the size's own unranked line → kept, size repaired.

### R2.4 C2: E5-nest also refuses a partial close on an anchor

`neighbourShare(...) >= 0.5` lets through a close with up to 49 % of the outline on an anchor, e.g. a
hem. Add a run rule next to it (keep the share rule):

- refuse `E5-nest` on any contiguous run ≥ 20 mm of the accepted outline that lies within 0.5 mm of
  an anchor ring;
- only where pred is separated from that ring by ≥ `max(0.5·s, 0.5)` (same shape as nest-judge's
  on-neighbour rule).

Test: a family whose pred is wrong only at the hem, with the accepted outline running on the larger
anchor for 25 mm there → `E5-nest`.

### R2.5 Tests that prove what they claim

- `repair-flags.test.ts:67` (C1, close on the neighbour): assert
  `expect(r.refusals).toEqual(['E5-on-anchor'])`. If no case can be built where E1 passes and E5
  alone refuses, keep E5 as a backstop. Write that in its comment and rename the test to what
  actually refuses it.
- `repair-flags.test.ts:318` (C3, chain on the neighbour): it is refused by the corridor, not by the
  0.25s guard. Add a case with s < 1.2 mm where only the guard excludes the chain. If that cannot be
  built, change the comment to say the corridor is the protection.

### R2.6 Readouts (for the owner-gated measurement)

- `res.looseShare`: the fraction of covered pred length whose snap is a loose wall. Carry it into
  `RepairProbe`.
- `res.local.scatterGap`: the largest bracket gap used when measuring scatter, next to `scatterMm`.
- `res.looseDropped`: count of loose walls dropped by R2.3.
- Confirm that samples filled from pred between two loose snaps are not counted as drawn in
  `drawnMm`/holes readouts. If they are, count them as derived.

Not in this round: exclusive use of a loose chain by two sizes. With R2.1 and R2.2, an accurate
(bracketed, non-local) pred can share a loose chain only where the base corridors overlap
(s < ~0.9 mm), and there a shared line is the right line.

Journal: one entry. Say that C2 cannot change anything where s ≤ 3 mm and adds at most 0.2s−0.6
above that, so a small set40 delta is expected, not a bug.

---

## O1. Offset "collapsed to the convex hull" is a false block when the bridged bays are narrow

**Why.** `offset-hull` stops 13 set40 files, and in 7 it is the only hard reason. Of the 23 blocked
pieces, 18 carry only "collapsed to the convex hull (≈1.0000 vs source 0.965–0.99)". The block
detail is the full joined reason string (`semantics/build.ts`, `detail: ${card.token}:
${r.report.reason}`), so in those 18 the parallel-deviation check in `offsetContour` passed.

A true outward parallel fills every bay narrower than twice the allowance; notch cuts are such bays.
The hull test reads that as a collapse. The `HULL_SOURCE_CONCAVE_MAX = 0.99` floor was an
approximation of "only narrow bays", and it is too tight. (Note: `blockOffset` also labels
deviation failures `offset-hull`; those must keep blocking.)

**Where.** `semantics/offset.ts`: `offsetContour` (the `hull` reason) and the fold variant (the
same test, ~line 956). `gate/checks.ts`: G6, the hull block on `hrDerived || r.hullRatio`.

**What.** Flag `OFFSET_HULL_POCKETS`.

1. **Pocket list.** List the source outline's hull pockets: each hull edge whose source path
   departs from it.
   - mouth = the hull edge's length;
   - depth = the source path's max distance from it.
2. **Rule.** With the flag on, a hull collapse refuses only when the result bridges a pocket with
   mouth ≥ 2·(d + 0.2) mm **and** depth ≥ 0.5 mm, where d is the allowance.
   - Measure the pockets on the source exactly as `offsetContour` receives it, notch cuts
     included. Otherwise the notch bays show up as unexplained hull deficit, and the rule falls back
     to a floor constant.
   - "Bridged" is defined from the geometry, not from the hull: the result never comes within
     d + 0.5 mm of the pocket's deepest source point. A true parallel dips toward that point; a
     bridge stays at the mouth.
   - Every other hull collapse becomes a note in the report, not a reason.
   - Do this independently of the deviation check. G6 calls `parallelDeviation` with
     `lenient: true`, whose mitre wedges at a bay's convex lips can excuse a bridge across a
     V-bay up to ~2·limit·d wide.
3. **Both places in step.** `offset.ts` and G6 use the same helper (put it in `semantics/offset.ts`,
   export it, and import it in G6). Either both demote, or neither does. Otherwise the gate re-blocks
   what semantics let through.
4. Flag off → byte-identical.

**Tests:**

- a near-rectangle at hull ratio ≈ 0.97 whose only bays are notch cuts with mouth < 2d → ok with
  the flag, `offset-hull` without it;
- a V-bay with mouth 3d and sharp lips, bridged → refused by the pocket rule. Assert that this case
  passes `parallelDeviation` with `lenient: true`, so the test proves the pocket rule and not the
  deviation check;
- a keyhole pocket (mouth < 2d, wider inside) → ok: the true parallel fills its mouth too;
- a bodice whose armhole is bridged → still refused;
- a half on fold whose neck meets the fold, offset bridged along the fold axis → still refused;
- a deviation failure (e.g. a 12 mm deviation) → still `offset-hull`, flag on or off.

Acceptance (owner, after the code): picture 2–3 of the 18 unblocked pieces, derived line over its
source, before the flag is trusted.

Expected effect: up to 7 set40 files lose their only hard reason (they may stop later, at the gate).
holdout40 has 2 files with `offset-hull`.
