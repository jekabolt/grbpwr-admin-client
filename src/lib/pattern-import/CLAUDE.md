# Pattern upload

Read this when a pattern file is dropped on a tech-card material slot and the import stops, or a cut line has a gap after the read. What counts as an etalon PDF is `docs/pattern-pdf-etalon.md`. The sentence on the plaque for a format refusal is `refusalMessage` in `adapters/sniff/errors.ts`.

A file is added when the wizard applies its pieces to the card. A stop belongs to one class. Close **meet**. Leave **refusal** and **later** until a new sample is the task, then add that sample under its class.

## Meet

Ends that continue one stroke meet during the fill, before the pieces step. The operator does not close that gap. `facingBridges` in `pieces/bridges.ts` draws the segment when both dangling ends point at each other and sit within 12 mm. A dangling end that stops short of another wall still meets that wall within 3 mm (`wallBridges`). One size is closed on the first fill. A graded sheet keeps the close only when the area still matches the other sizes.

A cut line and its stitch line stay two contours: they do not point at each other, so the facing close does not pair them. Welding ends is not the etalon pair check. A checker that required every closed loop to be a constant-offset pair rejected `Kombinezon.pdf` and was removed. Leave it removed.

The loop test that treats a chain as closed is 0.5 mm (`itemsOf` in `pieces/walls.ts`). A gap the fill did not take is still a leak on the pieces step, and one click closes that one.

Seen on `FREE-MDF335-The-mood-Exp-Backpack-A4-patterns.pdf` and `MDF339-Expedition-Back-Pack-Free-Sewing-Pattern-A4-Patterns-Mood-Fabrics-Sewciety-Blog.pdf`. Both are 24 pages and 21 tiles on one sheet. After assembly, free ends sit past 0.5 mm from the end they continue: 183 within 0.5–2 mm, 143 within 2–5 mm, 163 within 5–12 mm. The pieces step draws 11 pieces, and piece 1 is one filled region with three closed outlines inside it. Apply is blocked by `front piece +1: line around tile marks` (G19, the cut follows a registration mark) and by a 386 cm² outline inside FP_S (G20).

Seen on `2-A4-MDF-349-The-Leah-Shift-Dress-00-32-.pdf` (18 sizes, pieces closed on sizes 00 and 0 but the sizes step drew them open). Four causes, three closed:

- a shared edge (centre front, a shared hem) is drawn once, in whichever pen, so it sits in another size's row. The sizes step lights the row's own lines only; `steps/borrowed-edges.ts` (`litOutline`) now closes the lit outline over shared edges, which are the lines the ends of at least three other sizes stop on.
- `furniture` in `chains/classify.ts` threw a long straight dashed edge out as a "dashed guide" when its pen drew no curve. Tile scale moves a dash by a few percent (9.4 to 9.75 mm) and the half-mm pen key told one pen apart as two. The pen now matches within 6 %.
- `bridgeSameRank` in `sizes/land.ts` joined a dotted line across at most 25 mm and 1 mm sideways. A dotted pen wanders, and a curve with no dots on it is longer: a dotted pen may now join across 40 mm, sideways 30 % of the gap.
- Open: `F` (the collar) at size 2. Its end edge and the last 55 mm of its outer arc are not drawn in that pen (8–9 mm dashes of another pen sit there, unranked), `repairPass` refuses (`no-model:inconsistent`). The sizes step shows that hole as it is.

Seen on `A4-MDF348-The-Cassandra-Kaftan-Dress-Sizes-00-32.pdf`: 8 of 18 sizes had no line (`size-empty`). Their lines are separate solid dashes (6.1 mm, 7.7 mm apart) and the tracker joins at most 3 mm, so they stayed «fragment < 8 mm». `ChainOpts.dashTrains` (`chains/link.ts` pass 2b) joins regular trains of such dashes; `buildChainsDetailed` turns it on only for a file that leaves a size empty, and keeps it only when fewer are empty, because on Dyanna it made the read worse (43 → 50 not closed). Also `legendRun` in `sizes/recover.ts` counted a key entry with no sample as a sample and refused the run the text states. Still open there: sizes 0, 2, 6, 26 have no line (sizes 18 and 24 have part of theirs in the `internal` row).

Done when those two files assemble with those ends joined, piece 1 is that piece's own outline, and `Kombinezon.pdf` still reads.

## Refusal

The file has no pattern drawing. The plaque is `cannot read the files`. These samples are `pdf-no-curves` (the pages are pictures, including a picture too large to trace):

- `Clove-Slipper-Pattern.pdf` — 4 pages, 6 pictures
- `Felt-Bag-Organizer.pdf` — 6 pages, 6 pictures
- `Leather-Card-Holder-Template.pdf` — 1 page, 1 picture
- `Leather-Fanny-Pack-Pattern.pdf` — 2 pages, 2 pictures
- `LeatherPencilCaseTemplate.pdf` — 1 page, 1 picture
- `FINAL-TIE-PATTERN.pdf` — a 6000×10000 picture; the trace refuses it and the plaque is the same
- `Skirt-Pocket.pdf` — the junk sample named in the etalon doc

The slot refuses before the wizard opens when the card has no size range (`no sizes yet`) or the file is over 40 MB (`too large, 40 MB at most`).

## Later

A vector file whose pages are classed cover or instructions. Assemble then stops with `no pattern tiles — the pages were read as cover / instructions only`.

- `Final-Book-Clutch-Pattern.pdf` — 15 pages, 73 closed paths, 1 picture, no tile.
- `Bucket-Hat-Instructions-1.pdf` — 3 pages, all unsure. Page 1 holds a 272 mm line and 5.16 m of strokes. 185 open strokes, 70 ends within 0.5–2 mm of another end. Those ends are Meet, on a page the wizard set aside.

Any other block on the card step. Its sentence is `CHECK_ASK` in `steps/check-quiz.ts`. A size the host card has and the file does not draw is the card: SS26-029 carries m, l, xl, and these files draw one size.

## A new stop

Add the file, the stage, the sentence on screen, and the class. Ends that continue one stroke and stay apart are Meet.

## Open lines work (branch `fix-pattern-pdf-open-lines`) — read before touching chains / sizes / fill

State only; every experiment, number and patch is in `docs/pattern-import/open-lines-journal.md`
(append there, in its template). Keep this section ≤ ~80 lines: replace, never append.

### Goal and acceptance

- Every piece of every size closes by itself: no hand-assigned line, no "close the gap". The import
  reads the file or refuses it. A line gets its rank by EVIDENCE (key sample, pen rhythm, a closed
  outline that needs it, the grade of the closed sizes), never by geometry alone.
- Acceptance (owner, 11 Nov): the DXF the PDF becomes, on `scripts/pattern-import/set40.txt`: every
  piece in every size present and closed, no gap, nothing undrawn. Metrics: `notClosed`, then
  `emptyRows`, then `litOpenCard`; `asks` (`asks.mjs`) = the autopilot's first stop per file.

### Dev loop (owner, 12 Nov: do the work, not the runs)

- Never run the 40 files to check a patch. For `pieces/gfit`: `GFIT_PROBES=1` dxf-shot writes
  `<out>/<file>/probes.json` (each repair try = `repairSize`'s exact input + the run's verdict);
  `npx vite-node scripts/pattern-import/gfit-replay.ts <out> [--drawn] [--changed] [--out f]`
  replays the CURRENT code on them in seconds. Pictures and the crossing list:
  `replay-svg.mjs` / `crossings.mjs` (peer scratchpad `replay-tools/`, to move into `scripts/pattern-import/` once proven on real probes; D-cross-nest acceptance: `--before` the unpatched replay).
- A change upstream (chains, corners, fill) needs FRESH probes: snapshots go stale.
- The 40-file run is a milestone check, once a day or before accepting a change (the fill reacts
  far from a moved wall; no snapshot shows that). After a milestone look at 2–3 files in the admin
  UI (the wizard on a tech card, in the browser): what the operator sees.

### How to verify

- Corpus `~/Downloads/archive 600 pcs/dresses` (180 PDFs; MDF374 is 44 MB, over the 40 MB slot, in
  `dresses-excluded`). Controls Leah (MDF349), Dyanna, Cassandra (MDF348): one MDF series, they
  prove nothing alone.
- `node scripts/pattern-import/dxf-shot.mjs "<dresses>" --files scripts/pattern-import/set40.txt
--out <dir> --par 2`, then `node scripts/pattern-import/dxf-check.mjs <dir> --png` → per file
  `run.json` (piece × size matrix), `dxf/`, `shot.png`. A pieces-step stop writes no DXF; the
  matrix is then the measure. ≈ 1–2 min per file. Nothing else running: under load files time out.
- `regress.mjs "<dresses>" --fill --par 2 --limit 1200 --out <json> --ref <prev>` (`--files
fast-set.txt` screening, `--only <text> --par 1` one file) answers a specific question only; a full
  run is 9–10 h. Baseline `regress-baseline.json` (fill, dash trains off): never overwrite.
- Unit: `yarn vitest run src/lib/pattern-import` (CI runs none of it); `yarn lint` (it FIXES files:
  not while a peer edits); `yarn build:check` (xlsx / `tasks/sheet.ts` errors predate this branch).
- Env: `DASH_TRAIN_OFF` `ALIKE_NESTS_OFF` `MOOD_MARKS_OFF` `MOOD_WIDE_OFF` `TICK_KNIFE_SPREAD_OFF=1` `GRADE_DRAW_OFF=1` `NEST_CROSS_OFF=1` `NEST_CORNER_MM` `GRADEP2_DEBUG` `CONT_ORDER_OFF=1` `TICK_THROUGH_OFF=1` `TICK_ORDER_OFF=1`
  `TICK_THROUGH_NEAREST_OFF=1` (`MOOD_TICKS_DEBUG=1` + `SHOT_STDOUT=1`: TICK/TICKTHRU/TICKORDER lines; `SHOT_ROWS=1`: `<file>/rows.json`)
  `BORROW_LANDED_OFF=1` (do not borrow another size's line between this size's landings).
  `SPLIT_PEN_OFF=1` (link a settled dash run to a stroke of another pen).
  `GFIT_NEST_WALK` — nest-walk fill after repairSize; **on by default**, only `=0` disables
  (browser has no env, so the flag is always on in the UI). `NEST_WALK_DEBUG=1` — verbose
  walk logs from `pieces/gfit/nest-walk.ts`.
  Off by default, on with `=1`: `GFIT_EDGE_ACCEPT` (one step past the edge, outside draw mode), `GFIT_LOCAL` + `GFIT_LOCAL_CORRIDOR` (corridor from the family's own scatter), `GRADE_P2_LOOSE` (unranked chains), `OFFSET_HULL_POCKETS` (a hull collapse blocks only when it bridges a bay wider than two allowances).
  (`PIECES_OPEN_PASS=1`, `OFFSET_TRIM_OFF=1`: node probes / bisect).

### Status (13 Nov 2026)

- Milestone set40 (13 Nov, `shot-m13`): 3650 / 4752 cells closed, open 1102; files complete 0 / 40
  (every file stops on the pieces step, no DXF written). Open by first reason: `not-bracketed` 348,
  `no-model:inconsistent` 307, `E1-cover` 149, `E2-hole(-end)` 104, merged / tiny 93,
  `sizes-not-distinguished` 54. The corner allowance below is not in that run.
- ACCEPTED, full runs 0 WORSE (details in the journal): dash trains v2 + landing + lone-dash rule
  (`sizes/dash-train.ts`), CROSS and MARKS evidence in `sizes/corners.ts`, the `wallPts` fix.
  References `full-tee.json`, `full-marks.json`. Not accepted, reverted: local rival R = 12 mm.
- IN CODE, measured on set40: drawing by the grade (`repairSize` draw mode, hook draws ≤ 14 %, G15
  holds 15 %, manifest `grade.drawnMm`; tests `pieces/gfit/repair-*.test.ts`).
  D-cross-nest APPLIED (a stretch crossing ANY anchor outline at ≥ 20°, > 2 mm from its ends:
  bisect `NEST_CROSS_OFF=1`). 13 Nov: all 26 refusals on 20 files were FALSE on pictures (corners
  where sizes converge) → corner allowance 15 mm APPLIED (`nestCornerMm`, `NEST_CORNER_MM=0` = old
  rule): +19 drawn, 0 lost, replay only. 7 false refusals left; owner (13 Nov): KEEP the check as a safeguard, do not tune it further. Edge-size extrapolation ACCEPTED on replay (one step past the last trusted
  size, ≥ 3 trusted, holes ≤ 40 mm; 20 files: +8 edge cells drawn, 0 steep, 0 clean lost; bisect `--x-off`).
  `spreadMm` (other anchor pairs vs the drawn stretch, mm) in code, no threshold. Bridges stay straight.
- IN CODE, measured on set40: corners (`sizes/corners.ts`): `trendSupport` over the whole run,
  iterative EXTEND, wide extend ≤ 15 mm with ≥ 3 corners on the line. 68 leak → closed, 2 worse
  (Harper C SLEEVES 18 = the along() fix; Memoir A H · 0: the corner was right, the tick knife fell
  0.3 mm short of a nested side — fixed in `pieces/ticks.ts`, Memoir A 207 → 212 closed, other files
  unmeasured; bisect `TICK_KNIFE_SPREAD_OFF=1`).
- 14 Nov: G8 (`semantics/build.ts`) treats an area drop ≤ 0.5 % of the largest smaller size as a
  plateau (`AREA_PLATEAU_TOL`). The non-monotone blocks left are real: a size closed on another
  size's line (Silverstone G/E "5XL" = 3XL line, fill not rank; Verona D 24; Axel F COLLAR 10).
- 15 Nov: continuity ORDER guard ACCEPTED (`pieces/continuity-order.ts`, bisect `CONT_ORDER_OFF=1`):
  a continuity close whose outline leaves the band of its closed neighbours for ≥ 50 mm is refused.
  set40: 2 wrong closes refused (Taos G 0, Ophelia D 18, pictures), 0 lost, 0 outlines moved —
  `notClosed` +2 is the gain. Stepped grading (areas tie in runs) is NOT the no-model:inconsistent
  cause (6.3 % tied vs 8.4 % control); that cause is unknown — picture the worst families first.
- 16 Nov: end-tick guards ACCEPTED (`pieces/ticks.ts`, journal 16 Nov): a ladder of per-size marks
  that the size's own line runs through is not an end (TICK_THROUGH, quorum, group/arc rule), and a
  ladder whose size order points against the sides is not an end (TICK_ORDER). set40 `m-group`:
  3664 → 3673, 0 lost vs off, nest-check clean. Queued: Verona H knife spreading past an open corner.
- Probe switch, default off: `MOOD_LOCAL_BAND`. Designed, no code: clipped dashes. Parked: E2-hole-end.

### Queue (next first)

1. Bucket C (`no-model`): variant D APPLIED (owner) for `inconsistent` families with worst trusted
   score ≤ `gradeAllMaxScore` and for the edge step, D first / pair fallback (`grade-all.ts`;
   replay +2 draws, 0 lost, 0 new steep). Peer 80: no-model reason onto the cell; `ambiguous`
   matcher. Open: why D's edge line trips D-share/X-hole on 7 cells (mapPair at the edge?). Memoir A H · 0 done (ticks knife).
2. D-cross (a2) APPLIED (covered side over `coveredMm` 3; replay +4 draws, 0 steep, 0 clean lost);
   with variant D confirm both at the milestone run (also replay time 505 → 1129 s).
3. Drawn stretches in the DXF: APPLIED (write/drawn.ts — layer GRADE_DRAWN, ACI 30, on the cut;
   `DRAWN FROM GRADE nMM (a-b)` annotation; drawn.test.ts round-trips both dialects through the card
   parser). Not yet seen in a real file: no set40 file reaches the write stage. Next: the UI style
   for the same stretches (owner; mockup first).
4. (owner) Unlabelled pattern tile (Glinda p. 59 = G9): place it by page order when one grid cell is
   free between labelled neighbours and the lines meet across the seam; else stop.
5. Clipped dashes (head only before ≥ 2 full draws; probe #209, size 22, `DT_DEBUG`). Shared corner
   (patch `scratchpad/shared/shared-corner.v2.patch`; Valentina's 5 "off the trend": read the boxes).
6. Reims joint vs a nest end (step 1.3 mm). First `asks` run (after a full regress) = its baseline.

### Dead ends — do not retry (why in the journal or `open-lines-journal-archive.md`)

- `adoptDashes` (12 files WORSE); pass 2b always on, or `joinGapMm` 4 (Dyanna worse); rows of short
  strokes / looser `chainBeads`; joining a dash train no rank adopts.
- Local refit of an inconsistent family (×2.5); short unranked chains as own walls in `repairPass`;
  unranked lines as a fourth wall kind; the loop-pair checker (rejected `Kombinezon.pdf`); Euler-spiral
  or tangent-corner bridges (1 of 128 bridges strays > 0.5 mm).
- Shared edges (14 Nov): promoting `isShared`/`litOutline` into `rankOf`/fill; refusing a draw whose
  pred leaves the size bundle (the evidence was operator hints, not draws); a "co-drawn" companion
  rule (0/25 gained, ~800 side splits) — in a nest every stretch is accompanied by the next size one
  grade step away, so a companion-proximity test cannot tell shared from own. 25 cells PARKED.

### Traps

- The fill reacts to any move of a wall end, far from it: judge by a milestone run, never by 3 files.
- Rank ids ≥ N0 (from `splitShared`) differ between runs: compare chains by position.
- `notClosed` does not see a piece closed on a WRONG line; closing more can add wrong anchors.
- `SegGrid` stores (chain, segment) once: look a segment up in the points the grid was built from;
  a huge search radius hangs it. A test that ranks a chain index that does not exist tests nothing.
