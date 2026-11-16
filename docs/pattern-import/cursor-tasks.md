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
  - `yarn build:check`
  - `yarn lint`
  - `yarn test`
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
2. **Corridor per sample:** `min(max(cor_i, scatter), 0.45·s_i)`. It grows to the measured scatter
   but never reaches the neighbour's line.
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

**Note.** The run now in progress (`wdall`, every chain dumped on set40 + holdout40) will say how
much this task can win. Write the code now; the priority among C1–C3 is set from those numbers.

---

## Not for Cursor yet

- Files that stop for reasons other than lines (offset-hull, duplicate identity, the fold list): 15
  of 40 on set40. These need a failure map of their own first.
- The pile-up rule (≥ 3 sizes on one line) for wrong closes: it is being designed in the
  `open-lines-global` worktree (`pieces/nest-judge.ts`), not on this branch.
