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

Implementation and acceptance plan: [automatic gap recovery](../../../docs/pattern-import/automatic-gap-recovery.md).

State only. Experiments live in `docs/pattern-import/open-lines-journal.md` (append, template at the
top). This section stays ≤ ~80 lines: replace, never append.

### Goal and acceptance

- Every piece of every size closes by itself. A line's rank comes from evidence (key sample, pen
  rhythm, a closed outline that needs it, the grade of the closed sizes), never from geometry alone.
- Acceptance (owner, 11 Nov): the DXF on `set40.txt` — every piece × size closed. Metrics:
  `notClosed`, then `emptyRows`, then `litOpenCard`. Do not run the 40 files to check a patch.

### How to verify

- Controls: Leah (MDF349), Cassandra (MDF348), Dyanna, in `~/Downloads/archive 600 pcs/dresses`.
  One file: `dxf-shot.mjs "<dresses>" --files <list> --out <dir> --par 1`, then `dxf-check.mjs`.
  Nothing else heavy running. Upstream changes (chains / sizes / fill) need a fresh shot.
- `gfit-replay.ts` replays `repairSize` on `GFIT_PROBES=1` snapshots. Nest walk:
  `NEST_WALK_DUMP=<dir>` plus `nest-walk-check.ts` / `nest-walk-cover.ts --dump`.
- Unit: `npx vitest run src/lib/pattern-import`. Do not run `yarn lint` / `yarn fix` (they rewrite
  all of `src/`). `yarn build:check` — xlsx / `tasks/sheet.ts` errors predate this branch.

### Env

- Off with `=1`: `DASH_TRAIN_OFF` `ALIKE_NESTS_OFF` `MOOD_MARKS_OFF` `MOOD_WIDE_OFF`
  `TICK_KNIFE_SPREAD_OFF` `GRADE_DRAW_OFF` `NEST_CROSS_OFF` `CONT_ORDER_OFF` `TICK_THROUGH_OFF`
  `TICK_ORDER_OFF` `TICK_THROUGH_NEAREST_OFF` `BORROW_LANDED_OFF` `SPLIT_PEN_OFF`.
- `NEST_CORNER_MM` `GRADEP2_DEBUG` `MOOD_TICKS_DEBUG` `SHOT_STDOUT` `SHOT_ROWS`.
- `GFIT_NEST_WALK` — nest walk after repairSize, **on by default**, only `=0` disables.
  `NEST_WALK_DEBUG=1` logs. `NEST_WALK_DUMP=<dir>` writes `seed<n>.json`.
- Local anchors and the unassigned-line fallback are enabled by default. Disable them independently with `GFIT_LOCAL_OFF=1` and `GRADE_P2_LOOSE_OFF=1`.
- On with `=1` (off in the browser): `GFIT_EDGE_ACCEPT` `GFIT_LOCAL_CORRIDOR`
  `OFFSET_HULL_POCKETS`.

### Where it stands (18 Nov 2026, new agreement measure)

- Nest walk unchanged. Leah `.runs/base-leah`: 110 closed / 16 open. Alignment is offline, not in
  `repair-hook.ts`. Drawn-line loops 3090, 2884, 2915 stay. Pass 2b was not loosened.
- Agreement ignores a tie and a chain that only clips the +80 mm window. A sample counts within
  1 mm of a closed ring. It is a tie when two closed rings are each closer than 0.45 mm and the
  gap between those distances is under 0.45 mm (`corridorMinMm`; the measure adds no threshold
  of its own). A piece with more than half its on-piece length excluded is not measurable.
- On that measure the ring oracle is ≥ 98 % on A, C, D. E is 100 % of what remains and not
  measurable (tie 15.3 m of 28.1). B is 97.3 %, wrong 0. F and G are not measurable and the
  remainder is below 98 % with a wrong size (F 3.4 %, G 19.6 %). The method is below 98 % on
  every measurable piece. Э5 is not GO. Not wired.
- Rays are closed. On the measurable pieces the method agrees 36–75 % with wrong 0.
  The swapped-rank premise (A24/A26, G10/G12/G18/G24, F22/F24) is not confirmed: 0 of 8.

### Dead ends — do not retry

- `adoptDashes`; pass 2b always on; `joinGapMm` 4; geometry-only rank moves; companion-proximity
  "shared edge".
- Raising `drawMaxShare`, dropping `walk:blind`, or cutting loops in `ringCheck`.
- Grade slope only from diverging rays (E stayed 26 %, leave-one-out 6/16).
- A shared edge given to the smallest outline that contains it (E 44 %, wrong 27 %).
- Joint ray alignment does not cover the piece (agreement 36–75 % with 0 wrong). Do not
  retry a ray shape or the cost fixes. The long ray, the first-ring ray and the half-step
  rival rule each lost a piece on leave-one-out; the numbers are in the journal.

### Traps

- The fill reacts far from a moved wall. Rank ids change between runs: compare by position.
- `SegGrid` stores (chain, segment) once; a huge search radius hangs it.
