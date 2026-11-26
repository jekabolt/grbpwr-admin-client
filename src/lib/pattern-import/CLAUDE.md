# Pattern upload

Read this when a pattern file is dropped on a tech-card material slot and the import stops, or a cut line has a gap after the read. What counts as an etalon PDF is `docs/pattern-pdf-etalon.md`. The sentence on the plaque for a format refusal is `refusalMessage` in `adapters/sniff/errors.ts`.

A file is added when the wizard applies its pieces to the card. A stop belongs to one class. Close **meet**. Leave **refusal** and **later** until a new sample is the task, then add that sample under its class.

## Meet

Ends that continue one stroke meet during the fill, before the pieces step. The operator does not close that gap. `facingBridges` in `pieces/bridges.ts` draws the segment when both dangling ends point at each other and sit within 12 mm. A dangling end that stops short of another wall still meets that wall within 3 mm (`wallBridges`). One size is closed on the first fill. A graded sheet keeps the close only when the area still matches the other sizes.

A cut line and its stitch line stay two contours: they do not point at each other, so the facing close does not pair them. Welding ends is not the etalon pair check. A checker that required every closed loop to be a constant-offset pair rejected `Kombinezon.pdf` and was removed. Leave it removed.

The loop test that treats a chain as closed is 0.5 mm (`itemsOf` in `pieces/walls.ts`). A gap the fill did not take is still a leak on the pieces step; the operator closes it with the `bridge` tool until that step is retired (see "Close the gap" below).

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

## Open lines work (branch `fix-pattern-pdf-open-lines`) — read before touching chains / sizes / pieces

The plan is [open-lines-plan.md](../../../docs/pattern-import/open-lines-plan.md); what it rests on
is [open-cells-diagnosis.md](../../../docs/pattern-import/open-cells-diagnosis.md). Everything else
written before 24 Nov 2026 (per-file source checks, the gap-recovery plan, the journal, Cursor
tasks) was deleted on 25 Nov because it described goals that are no longer the goal; git history
has it. This section holds state and rules only: replace, never append, stay about this long.

### Goal

The program draws each size's outline on that size's own printed lines:

- **No jump onto another stroke.** The typical error is short: the outline leaves its own line for
  a neighbour size's line at a corner for a few millimetres and comes back. A check over the whole
  outline does not see it (`docs/pattern-import/family-fit.md` §3); the check must be local.
- **Corners are built** as the intersection of the two sides, not rounded, cut or bridged.
- **Missing lines are drawn in** from evidence (the same stretch of a closed neighbour size, the
  walk), never from the grade prediction alone, and on their own DXF layer (owner, 11 Nov).
- **Means:** the graph walk over the size's own lines, the common lines and the stretches where
  four or more sizes coincide (`scripts/pattern-import/diag/walk-carry.mjs`, plan stages 3–5); the
  fill where it is the better tool. Which tool applies is chosen by a feature the program can see
  on the piece (two nested closed paths of one pen, a size drawn as a row of marks, a piece with
  no closed size), never by the file or piece name.

A closed cell is not progress by itself: a cell can close on other sizes' lines (Kalla and Leah
sizes 0/6/14 closed with 20–30 % of the outline on foreign strokes). Measures, in this order:

1. verified-ok outlines of the reference set (`scripts/pattern-import/reference.json`) moved by
   more than 1 mm — must stay 0;
2. share of each outline within 0.5 mm of its own size line (`diag/own-share.mjs`) — must not fall;
3. cells opened on the control files (Leah, Cassandra, Dyanna, Kalla) — must stay 0;
4. files that pass the pieces step; files that reach DXF.

### The operator

The operator is called when the program holds evidence for more than one answer, and then
**chooses between finished variants**; the operator does not draw and does not click ends on the
sheet. The program does the rest itself: a gap between two printed ends of one line, a corner, a
shared edge, a row of marks.

Disputed cases (first definition, 25 Nov; the owner will refine it):

1. **Two outlines.** For one size two whole outlines both lie on printed lines, differ by more than
   1 mm over 12 mm or more, and nothing (pen, mark rhythm, nesting order, the neighbours' grade)
   picks one. Show both; the operator picks.
2. **Drawn-in line with weak support.** A stretch with no printed line under it, where the size is
   the first or last of the range, or its neighbours were themselves drawn in, or the piece has no
   closed size. Show the drawn stretch; the operator accepts or rejects it.
3. **What kind of piece.** No size closed and the program cannot tell "drawn once for all sizes"
   (`pieces/one-outline.ts`) from "given by measurements" (`byMeasureSeeds` in `pieces/seeds.ts`)
   from a missing drawing.
4. **Rank.** A line whose pen and position match two sizes equally.

Form: a choice on the pieces step between the variants, drawn over the sheet (the November mock-up:
flagged sizes, the predicted outline, a frame on the place in question).

### "Close the gap" — to be retired

Today an open cell is closed by the operator on the pieces step: click both ends of the gap (the
`bridge` tool in `steps/pieces.tsx`). `recoverAutomaticGaps` (`worker/session.ts`) runs
only in node (`AUTO_GAP_OFF=1` turns it off) and in the browser only with
`VITE_PATTERN_IMPORT_AUTO_GAP=1`. Both join ends geometrically and are inaccurate. Gap closing moves
into line drawing (plan stages 3–5). Retire the step only in this order: the walk closes inside the
step → count what stays open on the corpus → the variant choice covers the rest → remove. Add no
new behaviour to it meanwhile.

### How to verify

- Pieces bench: `npx vite-node scripts/pattern-import/pieces-bench.ts <shot> …` replays the pieces
  step from saved snapshots in minutes (header of the file: capture, `--ref`, `--env`, `--par`).
  Use it for every patch; a full `dxf-shot.mjs` corpus run only at a milestone.
- Reference set (`scripts/pattern-import/reference.json`): pieces the owner judged by eye, per size
  ok / bad, kept as outline points. `reference-check.ts reference.json --base <clone with .runs>`
  finds each size again by geometry: ok → held / MOVED / LOST, bad → RETURNED / changed. Exit 1 on
  MOVED or LOST only. Tolerance per size: min(1 mm, half the distance to the neighbouring size);
  noise on unchanged code ≤ 0.4 mm. Pieces of set `confirm` (holdout40) never tune a rule. To grow
  it: `reference-export.ts` → review page → `reference-build.ts`. One piece:
  `single-reference-check.ts`.
  A size with a `note` was re-judged: on 25 Nov the owner took the walk's outline for penelope-B 16
  and matrix-B XS, L, 2XL (the fill stepped onto the neighbouring row of circles). Code without
  the leak repair (`applyLeakRepairs`, branch `open-lines-walk`) shows exactly these four as MOVED.
  On 26 Nov the owner judged the ok sizes whose outline makes a step from one printed line onto
  the next (`diag/ref-jogs.ts`, branch `open-lines-walk`): a step is an error. memoirA-O 12,
  emma-A 14, taos-B 14 took the walk's outline (MOVED on code that keeps the step); 25 sizes went
  to bad (12 seen, 13 not seen and judged by the same rule). Now 523 ok / 88 bad.
- Unit: `npx vitest run src/lib/pattern-import`. Do not run `yarn lint` / `yarn fix` (they rewrite
  all of `src/`). `yarn build:check` — xlsx / `tasks/sheet.ts` errors predate this branch.

### Env

Research switches, all `=1` to turn a rule off unless noted. The product has none (plan rule 3).
The ablation of 25 Nov (each switch alone, 10–20 most-changed files, log `.runs/ablate/queue.log`)
found `MOOD_F2_OFF` the main wall of the fill (1245 cells opened) and 14 switches that change
nothing or almost nothing there: `P3_NOFACE` `F4_NOLABEL` `F4_NOBANDS` `ONE_BLOCK_OFF`
`LADDER_JUDGE_OFF` `LADDER_RESCUE_OFF` `SILENT_OFF` `KINKS_LOOPS_OFF` `M_TAIL_OFF` `CONT_ORDER_OFF`
`GFIT_NEST_WALK=0` `NEST_CROSS_OFF` `GRADE_P2_LOOSE_OFF` `AMBIGUOUS_DROP_OFF`. A sample is not
proof, and it ran on code before the rows merge. Removal waits for plan stage 8 (fill or walk):
then one full-set run with all 14 off together, diff 0 → delete them in one commit, else halve.
"Active" means "changes something", not "good".

- `DASH_TRAIN_OFF` `ALIKE_NESTS_OFF` `MOOD_MARKS_OFF` `MOOD_WIDE_OFF` `TICK_KNIFE_SPREAD_OFF`
  `GRADE_DRAW_OFF` `NEST_CROSS_OFF` `CONT_ORDER_OFF` `TICK_THROUGH_OFF` `TICK_ORDER_OFF`
  `TICK_THROUGH_NEAREST_OFF` `BORROW_LANDED_OFF` `SPLIT_PEN_OFF` `TILE_TEXT_JOIN_OFF`
  `ONE_BLOCK_OFF` `GFIT_LOCAL_OFF` `GRADE_P2_LOOSE_OFF` `AUTO_GAP_OFF`.
- `GFIT_NEST_WALK` and `OFFSET_HULL_POCKETS` are on by default; only `=0` disables them.
- On with `=1` (off in the browser): `GFIT_EDGE_ACCEPT` `GFIT_LOCAL_CORRIDOR`.

### Dead ends — do not retry

- `adoptDashes`; pass 2b always on; `joinGapMm` 4; geometry-only rank moves; companion-proximity
  "shared edge".
- Raising `drawMaxShare`, dropping `walk:blind`, or cutting loops in `ringCheck`.
- Grade slope only from diverging rays; a shared edge given to the smallest outline that contains
  it; joint ray alignment of nests (closed 18 Nov: 0 wrong, but covers 36–75 % of a piece).
- A whole-outline jump detector (p95 off the neighbours' grade): 3 of 32 bad sizes caught on unseen
  pieces. Local checks by sheet strokes or own-chain cover as a stop-gate: 20 of 25 bad caught, 65
  of 210 ok flagged — a correct outline on another size's line is normal.
- Shared-line ownership as a consecutive block of sizes: holds on 94 % of `tune`, 60 % of `confirm`.
- More point rules in the fill (bridges, lone stretches, plugging with smaller sizes): they raised
  closed cells 6390 → 6633 while files reaching DXF stayed at 10.
- PDF layers as the size signal: 4 of 692 archive PDFs keep per-size layers.

### Traps

- The fill reacts far from a moved wall. Rank ids change between runs: compare by position.
- `SegGrid` stores (chain, segment) once; a huge search radius hangs it.
- A mark circle is split into a varying number of points by the reader: compare mark shapes by
  type, perimeter and area, never by point count.
- The files a change touches most are the heaviest to replay: sample by base time too.
