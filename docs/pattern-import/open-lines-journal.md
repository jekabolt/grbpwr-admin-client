# Journal: open lines on the sizes step (branch `fix-pattern-pdf-open-lines`)

Append-only history of every experiment, moved out of `src/lib/pattern-import/CLAUDE.md` on 11 Nov 2026 (that file is auto-loaded; this one is read on demand). The short state — goal, how to verify, status, queue, dead ends — lives there. New entries go at the END, in the template at the top of the "Entry template" section.

## Entry template

```
### <rule / probe> — <ACCEPTED | DROPPED | PARKED | DIAGNOSIS> (<date>)
Hypothesis: one sentence, the evidence it relies on.
Change: files / patch (scratchpad path if not in src).
Run: exact command, result file.
Numbers: before → after on the controls and the corpus; WORSE files by name.
Verdict and why. Lesson for the next step (one line, also copied to CLAUDE.md "Dead ends" if dropped).
```

## Work log: open lines on the sizes step (9–10 Nov 2026, branch `fix-pattern-pdf-open-lines`)

Goal: on every size the lines of a piece meet, with no gap and no hand work. Corpus: `~/Downloads/archive 600 pcs/dresses` (181 PDFs). Probes are throwaway; what stayed is below.

### Kept in the repo

- `steps/borrowed-edges.ts` (`litOutline`, tests beside it): the sizes step lights a row's own lines; an edge drawn once for every size sits in another row. Free ends of the row are joined — a straight bridge when they point at each other (≤ 12 mm), an overshoot counts as closed, otherwise the shortest way over SHARED edges (a line the ends of ≥ 3 other sizes stop on). A way is not drawn where it runs beside an own line and along it (the double outline). Ends left over come back in `open`.
- `chains/classify.ts`: "dashed guide" matched pens by half-mm buckets; tile scale moves a dash 3–4 %, so a straight edge of size 4 was thrown out. Pens now match within 6 %. `keepGuides` switches the rule off (Lanai: S and L had only straight lines).
- `sizes/land.ts`: dotted lines join across 40 mm and sideways up to 30 % of the gap (a dotted pen wanders; a curve with no dots drawn on it).
- `sizes/recover.ts` `legendRun`: a hole of the key (an entry with no sample) was counted as a sample and the run the text states was refused (Cassandra lost 00, 0, 2).
- `chains/link.ts` pass 2b (trains of separate solid dashes, ≥ 3 with one gap, ≤ 16 mm) and pass 3 bands (strokes of one ink 4.5 mm apart, longest path of the tree, peeled one line at a time). Both only when `ChainOpts.dashTrains`.
- `chains/build.ts` `buildChainsDetailed`: reads the file as drawn; if a legend size then has no line (`size-empty`), reads again with `dashTrains` + `keepGuides` and keeps that read only when fewer sizes are empty. Without this gate pass 2b made Dyanna worse (43 → 50 pieces × sizes not closed).
- `sizes/alike-nests.ts` (`rankAlikeNests`, called in `recover.ts` after the label frames; `ALIKE_NESTS_OFF=1` switches it off): the key prints ONE sample for several sizes (Linda: 8, 22, 24 = `9.57/1.03/1.71/1.03`). Their closed outlines of that pen are told apart by how they nest: between two known ranks, the outlines of the pen take the pen's ranks that fall between them, smaller area = smaller size; no guess when the outlines are fewer than the sizes. It runs only where a size of the pen has no line. The reader's `size-empty` warning for a size that got a line is removed. On the 42 files with size rows without a line: 97 empty rows → 23, 29 files better, none worse.
- `buildChainsDetailed` retries on `lackOf`: a size with no line counts 2, a size with less than half the middle size's line counts 1 (Lanai: the dotted sizes had a third of their length, the rest was taken for tile frames: `furniture` labels straight lines of one length repeated ≥ 3 times "tile frame / cut mark", and a rectangle drawn in every size repeats like a frame). The retry reads with `dashTrains`, `keepGuides` and `keepRepeats` and is kept only when it lacks less. Lanai: XS 2.3 → 3.9 m, L 1.2 → 3.5 m. Not yet checked over the corpus: run `yarn patimport:regress` against the baseline.
- Tests: `sizes/alike-nests.test.ts`, `sizes/land.test.ts`, `chains/classify.test.ts`, `chains/link.test.ts`, `steps/borrowed-edges.test.ts` (`yarn vitest run src/lib/pattern-import`).
- `yarn patimport:regress <folder> [--fill] [--update]` (`scripts/pattern-import/regress.mjs`): one process per PDF, compares empty size rows → pieces not closed → open ends with `regress-baseline.json`, exit 1 when a file is worse. No baseline is committed yet: write it with `--update` once the corpus run is final (about 35 min without `--fill`, hours with it).

### Numbers (181 files, no fill)

134 read with every legend size drawn; 42 have size rows with no line (201 rows, 197 after the above); 3 refuse (raster over 18 Mpx), 1 has no vector (FRUGAL), 1 no size rows (Alghero). Fill (pieces) was measured on three files only: Leah 23 of 126 pieces × sizes not closed, Dyanna 43 of 180 (both unchanged), Cassandra 16 → 12 of 36.

### Tried and dropped

- Rows of short strokes (`opRows` needs half of the marks to be beads; the filter drops a row of strokes only) and `chainBeads` with a looser "opposite neighbour" test: no size got a line. Ginger v2's zigzag at (265, 2160) is a 60 mm decoration, not the line of size 8.

### Open

- Size rows with no line: 23 rows left in the 42 files. The sample of a size can be a short solid stroke (Linda's 6: 11 mm) that no line resembles; outlines drawn as several chains, not one closed chain, are not seen by `rankAlikeNests`; fewer outlines than sizes of the pen are left alone. The probe that finds them (strict pen match of the key sample against the sheet) is the way to the next case.
- 19 files whose fragments are the dark strokes of a pen (`fragment < 8 mm`), 8 with "tile mark", Dorian (4 empty, not guides), and the open ends the sizes step still shows (darts are internal lines, not gaps).

### Fill over 30 files (28 % of pieces × sizes not closed: 533 of 1895)

- 9 of the 30 files give no piece at all (`proposeSeeds` finds none): the fill is not measured there. Five files close completely.
- Leak classes over 326 leaks in 12 files (`leakDiag`): `no-own-line` 193 (+28 shared) = 68 %, corner gap 44, dangling end 24, an end onto / past a line 25, text / seam gaps 11. Two thirds are a size with NO own line where the fill leaks, not a gap to bridge: the same assignment fault as the empty rows.
- 207 of 484 not-closed candidates come from 17 pieces where NO size closes (Lanai 9 of 10 pieces, Julia 4, Anara 2, Fawn 2). A seed that leaks at one point on every rank is a seed outside any piece, not a gap: judge the fill by the pieces that close on some sizes (69 of them: 277 not closed). Only 8 of 94 pieces close on every size.

### `no-own-line` leaks, and why no general knob helps (10 Nov 2026)

- In 12 files, 152 leaks of class `no-own-line` in pieces that close on some size: the rank has about as much line in the piece as its neighbours in 75 % of them, under half in 18 %, none in 7 %. So it is mostly a LOCAL hole where the rank's line was split into pieces that went elsewhere (a hairline dash of `dash = null` with a 3.5 mm gap, a stretch in `ignore`), not a size that is not drawn. Leah rank 10 (size 18): a run of 6.2 mm and 3.6 mm hairline dashes, 3.5–5 mm apart, are `fragment < 8 mm`.
- Joining such runs everywhere (pass 2b always on) helps Leah (23 → 18) and Cassandra, and hurts Dyanna (43 → 47, 71 with hairlines only): the fill reacts to any change of the chains unpredictably, and a rule judged on one file is a coin. `joinGapMm` 4 instead of 3: Leah 23 → 31, Dyanna 43 → 42, Cassandra 12 → 11. Neither is taken. Pass 2b stays a retry (see `buildChainsDetailed`).
- The fill is judged by the pieces that close on some size: `regress-entry.ts` counts `junkSeeds` (a seed that closes on no size: not a gap) apart from `notClosed`.

### Repair by grade (GRADE P2) on Leah, Dyanna, Cassandra (10 Nov 2026) — tried, dropped

- Probe 1, a local refit when the family model is `inconsistent`: judge the model by the 2+2 nearest anchors with tolerances ×2.5 (×4 gave +1 repair on Leah). At ×2.5 Leah stays 23 not closed: no gain, code removed.
- Probe 2, unranked short chains drawn in the pen of the size (the hairline dashes of `fragment < 8 mm`) offered to `repairPass` as the size's own walls: Leah 23 → 22 of 126, and Dyanna did not finish in 10 minutes (the repair re-scans every loose chain for every rank and every hole). One piece of 126 is not worth a hang; removed.
- Why: the refusals that remain are real — holes of 40–80 mm over fragments that belong to no rank, and `E2-hole-end` where the end of the hole lies on another rank's line. The grade model cannot invent a line it has no neighbour for; the fix is upstream (give those fragments their rank in the chains / sizes step), not in the repair.
- State after the revert: `repair.ts`, `repair-hook.ts` equal to HEAD; `fill.ts` carries only the earlier WIP. vitest 124 files / 1581 tests pass; `regress-baseline.json` holds the final full run (one file reported worse: Memoir B, 51 → 58 open ends, accepted, see above).

### `adoptDashes` — tried, dropped (10 Nov 2026)

- Idea: an unranked chain of the same style id as a ranked chain, ≤ 40 mm, facing its end across ≤ 8 mm and collinear takes its rank (dash trains ahead of a ranked end), before `bridgeSameRank`. On Leah the dashes of size 18 did join (lit open ends 77 → 74, not closed 23 → 23), Cassandra 12 → 11.
- Full regress over 181 files: 12 files WORSE by +1…+2 open ends (Jugflower, Seraphina, Olympia, West Palm, Newport, Jolie, Tropea, Lumiere, Baratti, Odette, Emma, Cicely) and no file better (19 more timed out because the machine was busy: not counted as a result). Same style id + collinear is not proof of the same line: a hairline of one pen continues along other lines of the pen. Code and tests removed.
- Where the rest is: the dashes need an identity proof the pen alone does not give (the rank of the dash from the sample / legend, or a closed outline that needs it) — not a geometric rule.

### Unranked dashes (`fragment < 8 mm`) — diagnosis, no code yet (10 Nov 2026)

Probe is throwaway (the chains of `buildChainsDetailed` + `recover.diag.legendSamples / legendIdentity`, raw `sheet.paths` around a point). No repo file changed.

- Why they stay unranked: `recover.ts` `cand = !furniture && lengthMm >= 8`. A chain under 8 mm is not a candidate of legend identity, of the bundles or of `bridgeSameRank`; it ends in `ignore` (`fragment < 8 mm`, `recover.ts` near `ignore.push`) or in `notch` (`isNotch`). Leah: 1681 such chains, 115 shapes; Cassandra: 445 chains, 58 shapes.
- Leah, rank of size 18 (4.77 m against ~9 m of the neighbours; the key sample is `6.00/3.75/0/1.75/0/1.25`). Around (349, 1194): ranked #3507 (41 mm) ends at (330.2, 1199.0), ranked #3508 (276 mm) starts at (369.2, 1185.2): a 41.4 mm hole, over `LAND.bridgeMm` 25 and the pen is not dotted (no 40 mm). In it lie four filled dashes #204–#207, 6.2 mm long, 3.6 mm apart, lateral offset 0.0 mm, the same style id (143) as both ranked chains; #207 is classed `notch`. Before #3507 two more (#202, #203). Dash 6.2 / gap 3.6 are the first two elements of the sample; the dots are not drawn there.
- A style id is per drawing-op group, not per pen: only 10 of the 58 candidate dashes of Leah share the style id of the ranked end they continue (Cassandra 37 of 71). "Same style id" is neither necessary nor sufficient; `adoptDashes` leaned on it.
- Census over FREE ends of ranked chains (end not within 1.2 mm of any other chain; a dash ≤ 12 mm ahead, lateral ≤ 0.3 mm, direction within 18°). Dash length compared with the legend sample of the rank (or, when the sample is "irregular", with the rhythm of the group matched to that key: Cassandra 10 = `6.00/7.75`, 30 = `6.00/6.75`):
  - Leah: 244 free ends, 58 with a collinear dash. Length agrees with the OWN pen only: 13 (size 00: 7, size 18: 4); with the own pen and some other key: 15; with ANOTHER key only: 24 (rank 4: 13); with none: 6. So the geometric rule is wrong for 24 of 58 — the line of one size runs out, and the dash ahead is the line of another size. That is the measured reason for the 12 WORSE files.
  - Cassandra: 144 free ends, 71 with a collinear dash: 49 agree with own pen (all size 10 and 30: both are 6.0 mm dashes, only the gap, 7.75 vs 6.75, tells them apart), 18 another key only, 4 none.
- Cassandra 0, 2, 6 (26 not looked at): the key DOES draw them, as filled shapes, one path each (`p753–p821`, style 113): 2.5 mm pills (7 points), dots (13 points), chevrons (3 points), period 12.5 mm, rows at y 1758–1759 (6), 1771–1772 (2), 1777–1779 (0), by the key's 6.4 mm pitch. No chain, so no `legendHits` sample (14 of 18 keys have one). That is the "beads of fills" class of the dropped list, not a dash train with a 3–5 mm gap; this task does not reach it.

### Dash trains by rhythm (`sizes/dash-train.ts`) — tried, NOT accepted (10 Nov 2026)

- Rule (agreed): an unranked dash < 8 mm joins the rank of the line whose free end it continues when (1) its length is a dash of that rank's rhythm (±6 %) and its gap is ≤ the pen's longest gap; (2) when another key has the same dash length (Cassandra 10 / 30: 6.0 mm, gaps 7.75 / 6.75) the gap must be the rank's and no rival's; (3) a train of ≥ 2 dashes at one pitch, or one dash whose far end meets another end of the rank. Geometry (≤ 0.4 mm off the line, ≤ 18°) only a precondition. Rhythm of a rank = the repeat most of its length is drawn in, taken from chains the legend named (`legendId.label ≥ 0`). Only when the legend named the ranks.
- Result on the three control files, with fill (rule off → on): Leah 23 → 22 of 126 (22 dashes taken), Cassandra 12 → 12 (0 taken: the 6.1 mm dashes at the ends of rank 10 / 30 are single, no train, no hole to close), **Dyanna 43 → 45 of 180 (43 dashes taken: sizes 18, 26, 8, 10, 30) — WORSE.** Open ends on the first four sizes unchanged on all three. Not accepted; the glue in `recover.ts` is removed, so the corpus is unchanged. `dash-train.ts` and its test stay, unwired (`yarn vitest run src/lib/pattern-import/sizes/dash-train.test.ts`).
- Measured on the way: a dot sits INSIDE the gap and at the end of the dash on Leah (filled circles at 345.8 / 348.0 / 355.2 / 357.4), so the visible dash pitch (9.9 mm) is not the repeat of the sample (12.75 mm): a strict check of the cycle fails on Leah, the rule compares dash length and gap only.
- Not found yet: why +43 dashes make Dyanna's fill worse by 2 (the row lengths of 18 and 26 grew by ~0.1 m). Next step if continued: list the 43 adoptions on Dyanna and see which piece lost its close, before changing the rule.

### Dyanna: why the dash-train rule made it 43 → 45 (10 Nov 2026)

Probe: the same file with the rule off / on, the fill's outcome per (seed, rank); the chains of a lost cell's OFF walls intersected with the hosts that took dashes; ablations by env flag (temporary, `DASH_TRAIN_ON`, `DT_NOLONE`, `DT_SKIPRANK`).

- Of 180 cells exactly 4 change: 3 lost (seed 0 / rank 10, seed 6 / rank 14, seed 7 / rank 14) and 1 gained (seed 6 / rank 10). Net +2. 43 dashes are taken: rank 10 — 24, rank 14 — 14, rank 16 — 5.
- Rank 16 (5 lone dashes of 3.2 mm): no cell changes. Harmless.
- Rank 14 (14 dashes, ALL lone, 1.4–1.7 mm): removing the rank removes both losses of rank 14, and it gained nothing. These are the ticks of a dotted pen (the sample draws 1.5 mm), not dashes: one more tick ahead of a 26 mm line is no evidence of anything, yet it passed "a lone dash whose far end is within 6 mm of another end of the rank". The leaks are NOT at those dashes (96 mm and 520 mm away): the fill reacts to any move of a wall end, as `no-own-line` already showed.
- Rank 10 (24 dashes): the gain (seed 6 / rank 10) comes from two LONE dashes (6.1 and 6.5 mm) — it disappears with no-lone. The loss (seed 0 / rank 10) stays with no-lone, so a train of ≥ 2 causes it: host #5069 (size 20, 135 mm). With the rule off its end sits at (1622.3, 1183.2), 1.2 mm from the line of size 00 (#852): the line ENDS on that line. `landed` (point test, 1.2 mm) missed it by a hair, the train of three 6.0 mm dashes was laid ACROSS the line of 00, `bridgeSameRank` then joined the longer host to a chain 25 mm further, and the host's end moved to (1669, 1124) — exactly where the fill now leaks (1662.8, 1126.9).
- So two faults of the rule, not of the idea: (1) a dash is evidence only when it is a dash — a draw under ~3 mm is a bead of the pen and a lone bead proves nothing; (2) the way from the end to the first dash (and between dashes) must not cross another line: an end that meets a line is landed, and `landEnds` already says so with a ray of 8 mm, not a 1.2 mm point.

### Dash trains, second version (10 Nov 2026) — control files, full run pending

Changes to `sizes/dash-train.ts` after the Dyanna analysis:

- a LONE dash counts only when it is ≥ 3 mm (`loneMinMm`): shorter draws are beads of the pen;
- the way from the end to a dash (and between dashes) must not cross another line (`crosses`);
- an end with a line within 3 mm (`landedMm`, the radius of the fill's own `wallBridges`) is closed already and takes nothing; 1.2 mm was too tight, host #5069 ended on the TIP of the line of size 00 at 1.2 mm and was laid across.
- Env flag `DASH_TRAIN_OFF=1` switches the rule off (like `ALIKE_NESTS_OFF`).

Control files with fill, rule off → on: Leah 23 → 22 (4 dashes taken; seed 4, rank 6 closes), Dyanna 43 → 43 (8 dashes taken, no cell changes), Cassandra 12 → 12 (0 taken). Rank 10 / seed 0 of Dyanna lost first (see above) and no longer does.
Why Cassandra stays: its 6.1 mm dashes at the ends of ranks 10 and 30 are single, with no train and no hole to close — the rule has no evidence and takes none, as agreed.
Still to do before it is accepted: the full `yarn patimport:regress` (no `--fill` first: empty rows and open ends on 181 files), then the fill on the files where dashes were taken.

### Dash trains: first full run (no fill) and Reims (10 Nov 2026)

- Full run, 181 files (`--par 4`, limit 240 s): 1 better (Opal 22 → 21 open ends), 21 "WORSE": 20 timeouts and ONE real, Reims (44 → 45 open ends on the first four sizes). The timeouts are load, not the rule: Terra alone takes 10 s with and without it (as the earlier log says about a busy machine); re-run with `--par 2 --limit 480`.
- Reims, row of size 2: a new free end near (1308, 1109). A 5.9 mm dash (#3177) at (1307, 1103) was taken by a host of size 18, and it sits 1.5 mm from the END of the line of size 2: it is the joint of two sizes' lines, not the line of either. The host's start moved onto size 2's end, and the shared-edge bridge that closed row 2's outline (`borrowed-edges`) was gone. Fault of the rule (4th condition missing): a train must not run up to a line of ANOTHER size (within `landedMm`, 3 mm; either end of a dash). Added, with a test. Reims back to 44, Leah 7 (open ends, first four rows).
- Rank ids ≥ N0 (chains made by `splitShared`) are not the same in the on / off runs: compare chains by position, never by id.

## PLAN: no unclosed pieces, no "close the gap" by hand (10 Nov 2026) — SUMMARY

Full text, word for word: `open-lines-journal-archive.md` (section "PLAN"). Goal (owner): every piece of every size closes by itself; no hand "close the gap".

- ACCEPTED: dash trains v2 + the landing rule ("runs into, not beside") + the lone-dash rule (hole ahead, cos ≥ 0.95, or a T-join): full run 0 WORSE, notClosed 1626 → 1623 (`full-tee.json` was the reference). CROSS (a corner inked as a crossing is its own second evidence). Wall-index fix (neutral on the corpus). MARKS (glyph marks; final form: a glyph ahead of a joined line's end is refused when that line runs through it, `drawnBy`): −74 notClosed on 176 files, `full-marks.json` stayed the reference.
- NOT ACCEPTED: local rival v2 (R = 12 mm): Glinda size 12 loses a piece — a train the rival allows stayed unranked and moved the walls. Lesson: a joined train must also be ranked, or not joined at all.
- PARKED / NOT APPLIED: E2-hole-end; `GFIT_TOL_PDF` (patch ready, held back); shared corner (WIP patch, unit test failing); clipped dashes (designed on paper, owner's decision recorded in the archive).
- MEASURED, no code: step 3 (auto-grade from the closed sizes) — leave-one-out 3a–3e on Leah; long holes of 38–124 mm are size dashes the dash-train rule had refused.
- Why it ended: each evidence rule gave only ~1–1.5 % of notClosed (68 % of leaks are `no-own-line`), so the owner reordered the queue and pivoted (next section).

## Pivot: big changes first, UI is the judge (owner, 11 Nov 2026) — SUMMARY

Full text, word for word, with every probe, number and flag: `open-lines-journal-archive.md` (section "Pivot"). Owner: make the large structural change first, then fix where it breaks; acceptance is the DXF written from the PDF (every piece, every size, closed, no gap), not the wizard steps. Corpus for this phase: `scripts/pattern-import/set40.txt` (40 files).

- BUILT: `dxf-shot.mjs` / `dxf-shot-entry.ts` + `dxf-check.mjs` (the real wizard hook per PDF, matrix of region × size, DXF checked block by block). "Drawing by the grade": `repairPass` with its caps lifted and a guard in their place; peer-review fixes applied.
- MEASURED on set40: cells closed 3498 → 3575 of 4752 (77 leak → closed, 0 closed → open); 22 of 69 drawn cells crossed another size's outline (≥ 20°), 16 of them the adjacent anchor's — hence D-cross-nest (APPLIED, see 12 Nov sections). Files complete: 0 / 40 (every file stops on the pieces step; Glinda on the sheet).
- KEPT: corners = trend over the whole run + wide extend (owner chose (a)+(b)): closed 3575 → 3641, leak → closed 68 vs closed → leak 2. Open: the Memoir A wide extend (`MOOD_WIDE_OFF=1` bisects it).
- FOUND: seam gaps on Leah are corners (the source draws the break, not the tiling); Glinda stops on an unlabelled pattern tile (queue 2a).
- Owner's decision: draw and mark.

## 3-way hidden-stretch leave-one-out — how to draw a missing stretch (12 Nov 2026)

Question (owner): draw a missing line by scaling the clearest (largest) size? Method: on Leah, Dyanna,
Cassandra (pieces with ≥ 3 closed sizes) hide a stretch of a CLOSED size (20 / 40 / 80 mm, 8 starts
per size, 6504 stretches) and rebuild it three ways: A = scale the largest size, B = the nearest size
fitted to the drawn ends, C = interpolation between the bracketing sizes (what `repairSize` draws).
Measure: p95 deviation from the real line. Tool: peer scratchpad `loo3/grade-loo3.mjs`, report
`loo3/out/grade-loo3-report.md`.

| share p95 > 2 mm / > 5 mm         | A scale largest | B nearest fitted | C interpolation |
| --------------------------------- | --------------- | ---------------- | --------------- |
| inside the run, 20 mm             | 5.4 / 1.4 %     | 3.3 / 0.6 %      | 1.6 / 0.0 %     |
| inside, 40 mm                     | 12.6 / 7.8 %    | 6.4 / 1.6 %      | 3.0 / 0.6 %     |
| inside, 80 mm                     | 27.5 / 19.6 %   | 11.1 / 4.3 %     | 4.8 / 1.6 %     |
| edge size (C extrapolates), 20 mm | 4.9 / 1.6 %     | 3.0 / 0.7 %      | 2.0 / 0.0 %     |
| edge, 40 mm                       | 10.2 / 5.6 %    | 5.6 / 1.6 %      | 4.6 / 1.6 %     |
| edge, 80 mm                       | 22.0 / 14.5 %   | 10.9 / 4.3 %     | 6.6 / 3.0 %     |

Within 2 mm overall (inside / edge): A 84 / 87 %, B 93 / 94 %, C 97 / 96 %. On the 1576 stretches
where some method misses by > 0.5 mm: median C 0.32, B 0.72, A 3.50 mm; best C 707, B 252, A 98.
Caveats: one MDF series, 3 files; fixed starts; A linearised per hole; A found no fit on 199.

Verdict: KEEP C (the current draw). Scaling one size is the worst and grows with the hole — a garment's
grade is not a uniform scale (lengths and widths grade differently). B is a credible FALLBACK where C
cannot interpolate (`not-bracketed`: the size is the smallest or largest present), not a replacement.

## Steep crossing of an `overlay` wall — not a defect (12 Nov 2026)

Replay of Leah + Opal with D-cross-nest: 4 drawn, 3 clean kept, 1 steep left — Opal F - FRONT SKIRT
18 (r10) crosses wall#120 (`overlay`) at 87°. `crossesWalls` skips overlay walls by design (guard 2(a):
a drawn stretch must cross no line of that SIZE nor a COMMON line; overlay is another size's line).
Geometry (peer, `overlay-cross/`): wall#120 is a 102 mm straight interior line (another size's
dart / pleat mark rising from its hem), 13 % of it near any anchor outline. Size 18's hem has a 23 mm
gap exactly where that line crosses it: the hole exists because of the crossing, and the grade
really runs across. Verdict: NO patch. `crossings.mjs` now labels a steep overlay crossing "outline
stretch (≥ 50 % on an anchor outline)" vs "interior line"; only an outline stretch of a
non-bracketing anchor would argue for widening `crossesNest` to all anchors.

## D-cross-nest on 20 files: all anchors, not only the bracketing pair — APPLIED (12 Nov 2026)

Replay of the 72 drawn tries captured on the 20 drawn files (`drawn-pdfs.txt`, rounded probes),
extrapolation off on every side (`--x-off`), `crossings.mjs --before` the unpatched replay
(`NEST_CROSS_OFF=1`, the bisect switch kept in `repair.ts`).

| variant                  | steep → gone | steep still drawn | clean kept | clean LOST |
| ------------------------ | ------------ | ----------------- | ---------- | ---------- |
| bracketing pair (r1, r2) | 16           | 5                 | 49         | 0          |
| every anchor (`ins`)     | 20           | 1                 | 49         | 0          |

The pair left 4 crossings through a NON-bracketing anchor (Memoir A L SKIRT BACK 10 through r3,
Paris E BACK a 10 and G FRONT b LINING 18 through r17, Reims J SLEEVES 24 through r8, 21–80°):
graded outlines nest, so a steep crossing of any of them is a wrong cut line. Applied: `crossesNest`
gets every anchor ring. Left: Opal F FRONT SKIRT 18 × wall#120 (overlay, the entry above, no patch).
Not yet measured: the fill after an accepted refusal (a run shows that, the replay does not).

## Derived bridges: no Euler spiral, no tangent corner — measured, NOT applied (12 Nov 2026)

Question (research of 12 Nov: curve completion): should a `pieces/bridges.ts` bridge be a curve
(Euler spiral) or a corner instead of a straight chord? Data: the 113 'bridge' derived stretches in
the closed cells of the last set40 run (`shot-corners`), median 2.5 mm, max 11.9 mm.

- Curves: where the line turns < 60° across the bridge the arc-vs-chord deviation is ≤ 0.55 mm. A
  spiral buys nothing a workshop sees.
- Corners, first count (tangents 3 mm back along the outline): "19 cut a corner by > 1 mm". WRONG —
  pictures showed most bridges END on the vertex (a dart tip), so the turn measured through the
  vertex is not a cut.
- Honest count (scratchpad `bridge-truth.py`): each bridge vs the same stretch of the neighbouring
  closed sizes (their path between the points nearest the bridge ends, shifted onto the ends).
  128 bridges with ≥ 2 neighbours: ONE strays > 0.5 mm — Reims G CORSET FRONT MIDDLE 22, 11.9 mm
  facing bridge, 1.8 mm (the neighbours turn a short step there; the chord cuts it). The rest ≤ 0.1.
- Tangent-intersection corner (`bridge-via.py`, turn ≥ 30 / 45 / 60°, both legs within the gap):
  fires on 5, changes nothing on 4, makes Reims WORSE (2.06 vs 1.81 mm) — tangents do not see the
  step. Not applied.

Verdict: bridges stay straight. The one real case wants the neighbours' shape (the grade-draw idea
applied to a bridge); parked until such cases repeat.

## Drawn stretch uncertainty: `spreadMm` — IN CODE (12 Nov 2026)

Owner: a drawn stretch is marked for the operator to check; the mark needs a number, in mm (owner
chose mm over a share of the perimeter: "разброс 2 мм" reads in a workshop).

`repair.ts` `holeSpread`: the fill came from the nearest anchor pair; each OTHER pair (one anchor
further out on either side; at the edge, the third-nearest) predicts the size again, its stretch
between the points nearest the hole's ends is shifted onto those ends (the fill's own end blend),
and the farthest it strays from the fill is the spread; max over holes and pairs. Absent when there
is no other pair. Carried as `GfitRepair.spreadMm` → `RepairRecord.spreadMm` (drawn blocks only).
Not in the manifest yet: that is the DXF layer / UI mark task (mockup first).

Synthetic (`repair-spread.test.ts`): linear grade 0.24 mm (the sampling floor at a sharp corner),
an outer anchor's corner bent 3 mm → 0.40, 6 mm → 0.74; from 9 mm the robust fit drops that anchor
itself. A "check this" threshold is not chosen yet — measure the distribution on the drawn cells of
the next run first.

## Edge-size extrapolation — ACCEPTED on replay (12 Nov 2026)

Fresh `GFIT_PROBES=1` shots of 20 files, `gfit-replay.ts` with and without `--x-off`, 607 tries.
With extrapolation 60 drawn / 29 repaired / 518 refused; without, 52 drawn. The 8 new draws:
Kalla Q BELT 6 and 22, Kalla C COLLAR 2, Memoir F CUP 1 · 24, Harper D CUFFS 10, Ophelia H TRAIN A
24, Alassio D CUFFS 14-16 (0 holes), Emma F SKIRT YOKE FRONT 24. `crossings.mjs`: none of the 8 is
steep; clean draws kept 51, lost 0; the one still-steep draw is the old Opal F FRONT SKIRT 18
overlay, not related. Pictures (replay-svg) checked: each fill follows the neighbour sizes' nest.
Bisect: `--x-off` in the replay. Confirm on the next milestone run.

## Grade over all sizes (variant D) vs the bracketing pair (C) — measured, peer, NOT applied (12 Nov 2026)

Leave-one-out on the clean closed cells of 19 files (179 families, 1567 sizes, 37 800 hidden
stretches of 20/40/80 mm). D maps every other size into C's index space (pairwise corner alignment)
and fits each point piecewise-linearly in the size value (0–2 breaks), Huber IRLS on residuals
smoothed over ±10 mm. Share of hides with p95 > 2 mm, C vs D:

- clean, inside the run 1.7 vs 1.8 %; at the edge 3.9 vs 4.1 %. Plain LS (no weights) 3.1 % inside.
- one bracketing neighbour bumped by 3 mm (sin², a rigid shift is hidden by the end join): inside
  12.8 vs 5.3 %; at the edge 98.8 vs 61 % (> 5 mm: 72 vs 6 %). D pays from ~7 other sizes
  (12+: 9.2 → 2.4 %); with 2–3 sizes it equals C.

Verdict: D does not replace C inside the run. At the edge (extrapolation) it is equal on clean data
and far more robust to one bad neighbour — candidate for the edge step. Inside, D could be a
cross-check (flag an anchor when C–D p95 > ~1.5 mm) — that detector is not measured. The
corruption is synthetic. Data and scripts: the peer's scratchpad `loo-d/` (run.ts, results-bump.json).

## D-cross refusals triage — peer (12 Nov 2026)

153 tries, 395 crossed hole ends (19 files, current code). A try goes into the first bucket of any end:

| bucket                                                                                          | tries | D-cross is the only refusal |
| ----------------------------------------------------------------------------------------------- | ----- | --------------------------- |
| (a) an own line has a free end ≤ 12 mm from the hole end (reading / joining)                    | 53    | 8                           |
| (a2) the prediction runs ALONG the wall and turns at the hole end (a corner read as a crossing) | 48    | 14                          |
| (b) crosses an interior line (dart / notch / grain)                                             | 19    | 2                           |
| (c1) crosses a nest outline (common line)                                                       | 28    | 4                           |
| (c2) crosses an overlay                                                                         | 5     | 1                           |

Only 29 of 153 fail on D-cross alone; the rest also fail D-cross-nest (92), D-share (67),
E2-end-offset (50) or X-hole (14) — the refusal is mostly right. Free ends in (a) are rarely close
(≤ 3 mm on 8 ends, ≤ 6 mm on 42); Memoir A 10, Reims 6. (a2) is a rule fault in gfit, not reading:
the covered-side direction is read at the hole's first/last vertex, where the prediction may have a
corner (Emma H SKIRT TIER 1 · 2). Fix: compare the covered-side direction over ≥ 3 mm. Chains/link
only if the (a) free ends prove to be one family (Memoir A first). Buckets are heuristics (12 mm
free-end radius, 30° "along", 50 % outline share). Data: the peer's `dcross/` (rows2.json, svg/).

## Bucket C "never tried" — it is `no-model`, not the fill's skip (12 Nov 2026)

The 315 bracketed open cells with no repair and no refusal (set40 `shot-corners`) were not skipped
by `fill.ts` (the hook runs). `GRADEP2_DEBUG=1` on Dyanna: 20 of 21 are
`no-model:inconsistent`, 1 is `tiny`; Emma: all 25 are `no-model:inconsistent`.
`repairSize` refuses at once when `fitFamily` of the other anchors has no model or `why ===
'inconsistent'` (after dropping the worst anchor down to ⌈2/3⌉ of them, some trusted anchor still
disagrees), and `repair-hook.ts` never tries the draw on `no-model`. The reason is lost on the cell:
`hint()` sets no `gradeHint` without a prediction, and the run's cell `refusal` is read from it.

Probes of 20 files (`shot-x`), no-model tries: 33 inconsistent (9 families), 26 ambiguous (9
families: the corner matcher cannot pair the anchors, trusted 0). Inconsistent families mostly
carry ONE still-disagreeing anchor at 1.1–2.3 × tol (6 of 9); the rest 3.4–9.2 × tol with 2–5
anchors (Olympia 00 9.2 × over a 1.5 m run, Memoir C step 0.11 mm = sizes drawn alike).
Not changed. Options (owner's call): a local anchor window around the size, variant D (robust
over all sizes), or keep refusing. Script: scratchpad `bucket-c/why.ts`.

## D-cross (a2) — covered side over 3 mm of arc — APPLIED (peer, 12 Nov 2026)

`alongCos` gets one more candidate direction at a hole end: the prediction over the next
`GFIT_REPAIR.coveredMm` = 3 mm of arc on the covered side (before the hole for its start, after it
for its end), not the 1–2 samples at the end vertex. A hole that starts at a corner of the
prediction has the hole's own direction at its first vertex; the covered side is what ran along the
wall. Draw mode only. Replay, 19 files / 578 tries, patched vs current: 18 tries stop refusing with
D-cross, none of them in the real-crossing buckets (b)/(c1)/(c2); 4 become draws (Kalla modesty
panel 10, Paris front b 18, Axel D sleeves 6, Reims C corset front center 18 — short corner holes,
pictures checked), the rest are caught by E4/E3 or other gates. Steep crossings among new draws 0;
clean draws lost 0 of 54. The gain is small: 124 of 153 D-cross refusals have another reason too,
and the 38 still refused have all ends ≥ 30° by the code's own angle (the triage's (a2) bucket
over-counted). Replay skips G15 / D-holes: confirm at the milestone run.

## Variant D (grade over all sizes) — wired into repairSize, draw mode (12 Nov 2026)

Owner's call: "вариант D" — for the extrapolated edge step and for families `fitFamily` marks
`inconsistent` (allowed when the worst trusted anchor score ≤ `GFIT_REPAIR.gradeAllMaxScore` = 2).
Code: `pieces/gfit/grade-all.ts` (`predictAll`), tests `grade-all.test.ts` (clean grade D ≈ C at the
0.51 mm sampling floor; size 6 bent 3 mm at the edge: C 4.16 mm off, D 0.96 mm).

First replay (607 tries, base = D off): +2 draws (Memoir C D BACK 2, Paris I BACK b LINING 2) but
**7 earlier edge-step draws lost** — D-share/X-hole/D-cross (5), E3-tol, E3-continuity,
E2-end-offset. All 7 were extrapolated cells the pair had drawn and passed. Fix: D first, the pair
as fallback (`repairSize` → `repairWith(useAll)`); a D line the checks refuse is retried with the
pair, the result carries `gradeAllRefused`. Inconsistent families get no fallback (the pair was
never allowed there). Open: why D's edge line trips D-share/X-hole on those 7 (mapPair alignment at
the edge size is the first suspect) — pictures pending.
Replay with the fallback (same 607 tries vs base): drawn→refused 0, refused→drawn 2 (Memoir C D BACK 2,
Paris I BACK b LINING 2), 64 draws kept, 29 strict repairs kept. Replay time 505 → 1129 s (the
fallback re-runs a refused D cell; machine load not controlled) — watch at the milestone run.

## Peer patches applied: no-model reason on the cell + ambiguous-anchor drop (12 Nov 2026)

Peer 80: `PieceCandidate.gradeTryWhy` (reporting only, autopilot report `refusal` column) and
`fitFamily` leaving out the worse end of an ambiguous anchor pair (≤ 2, ≥ 3 anchors left,
`GfitFamily.droppedAmbiguous`, bisect `AMBIGUOUS_DROP_OFF=1`). Cause found by the peer: one anchor's
curve read faceted (19 corners against 6), not a symmetric piece. Variant D skips the dropped
anchors (their corners are the unsure ones). Combined replay vs D alone (607 tries): +6 draws
(Kalla O POCKET 26, Memoir B F TOP 18, Paris C FRONT c 24, Taos I BELT 18 / 24, Venice E TOP FRONT
MIDDLE 18), +1 strict repair (Taos BELT 30); vs base: clean draws lost 0, steep 0 new (Opal F 18
predates all of this). Pictures checked: short holes at corners / tips, between the neighbours.
The real fix is a smoother corner read of a faceted curve (also G26) — not done.

## 12 Nov 2026 — Drawn stretches marked in the DXF (owner: «Слой + текст», «Оба вида»)

`write/drawn.ts`. Every `grade-draw` / `grade-fill` edge of a block (semantics `derivedOf`, the
same path G15 uses, through `b.transform`) is laid on the WRITTEN cut ring: the sub-arc between the
projections of its ends, the way round whose middle is nearest the edge's middle. Copies go to a
new layer `GRADE_DRAWN` in both dialects, declared only in a file that has one (every other file
keeps CLO's 8 / AAMA's 9 layers byte for byte). Layer 1 is untouched: still one closed ring.

- Colour ACI 30 (orange), not the red first proposed: CLO's cut layer 1 is ACI 1, a red copy on it
  is invisible. R2000 gives the layer a 0.50 mm lineweight.
- The card parser (nesting/dxf/pieces.ts) chains EVERY layer into loops on its own (closing gaps
  < 2.5 mm), so a fully drawn piece would read as a second piece on GRADE_DRAWN. Spans are merged on
  the ring and never cover more than perimeter − 6 mm. A 2-point stretch gets a midpoint (the parser
  takes open 2-point chains ≥ 1 cm as grain candidates; it picks grain by layer 7, but a file
  without a manifest has no layer hint).
- Text: `plan.ts` adds `DRAWN FROM GRADE <drawnMm ?? holesMm>MM (<from>-<to>)` to the block's
  annotation (`Annotation:` on layer 1 in R12, `ANNOTATION:` label in R2000) when ≥ 0.5 mm.
- An edge whose end is > 2 mm off the written cut is not marked; the writer warns.
- Checked: `write/drawn.test.ts` (9) — geometry, text, and write → card parser read-back in
  R2000 and R12: one piece on layer 1, nothing read on GRADE_DRAWN. pattern-import unit tests 114/114.
- NOT checked on a real file: in the 40-file set no file reaches the write stage (all stop at
  pieces / sizes; Taos stopped at 270 s, 7 regions not closed). `yarn test` (CI probes) cannot run
  here: the build fails on `xlsx`, declared in package.json but absent from node_modules (tasks
  feature, not ours) — needs `yarn install`. f6 cannot run: its golden fixture path
  (`tmp/plans/pdf-to-dxf/k2-work/golden-min.dxf`) is not on this machine.
- Also fixed: tsc TS7022 in gfit/fit.ts (peer 80's ambiguous-drop loop) — explicit `Size` types,
  no behaviour change.

## 13 Nov 2026 — Memoir A H · 0: the tick knife spans the whole nested side (peer 80)

`pieces/ticks.ts`, bisect `TICK_KNIFE_SPREAD_OFF=1`. The wide extend `4863:0+4892:1` was a correct
corner; the cause was the knife. Size 0's end tick c4893 met the strip's right side where a nest draws
one line per size 0.1–0.3 mm apart (x 900.1 … 901.5); the knife took the nearest side segment
(900.13, +1 mm) and stopped 0.3 mm short of size 0's own side: `TICKCUT r1 c4893: the knife does not
part the region`. Without the corner the region leaked out of the strip's other end, the tick was
ignored and H · 0 "closed" by accident (the part below the tick, top-left corner open).

- Fix: every side-line candidate within `SIDE_SPREAD_MM` 3 of the chosen one along the tick counts;
  the knife reaches past the OUTERMOST, + `OVERSHOOT_MM`. `carried` and `beside` unchanged.
  Dead end: also moving `beside` outward turned 4 closed cells of Memoir A K into leaks.
- Switch off = the old knife exactly (xa lies on the tick line, so `c.a + u·(ala − 1)` = `xa − u`).
- Memoir A, same snapshot, off → on: closed cells 207 → 212, only family H (CENTER FRONT LOWER)
  changes: 00, 0, 8, 12, 16 leak → closed; 2, 4, 6, 10, 14 stay leaks, now `no-model:inconsistent`
  with mouths at the tick (~798,1194–1221). H · 0: 45 pts, 15 050 mm², bbox 767,1224 – 902,1381.
  The same defect hid 4 more ticks there (r0 c1874, r5 c1741, r7 c1750, r9 c1763).
- NOT measured: any other file (every file with end ticks can move) — the milestone run decides;
  whether the part below the tick is the right side for H · 0 (the strip's body side is not known).
  ticks.ts has no unit tests. pattern-import unit tests 114/114 after the patch.

CI probes (`yarn test`) on 13 Nov, after `yarn install` + Playwright Chromium + `ast-grep`: the
build needs `NODE_OPTIONS=--max-old-space-size=8192` (OOM at the 2 GB default). 60 of 80 green; the
same 20 red on clean master (792c1cd17) — none is pattern-import. 11 of them failed to bundle on the
Vite `@/fonts/…?url` imports (care-labels/text-outline.ts); `scripts/probe-esbuild.mjs` stubs the
query for them, after which they run and fail on their own tech-card assertions (stale vs the UI).

## 13 Nov 2026 — Milestone set40 run (variant D, D-cross a2, D-cross-nest, tick knife)

`dxf-shot … --files set40.txt --par 2` → scratch `shot-m13` (37 min, load low), compared cell by
cell with `shot-corners` (12 Nov 17:00) by scratch `celldiff.mjs` (a cell = piece label × size).

- Closed 3615 → 3624 of 4698 cells common to both (dxf-check: 3650 / 4752, 107 closed by repair).
  Files complete: still 0 / 40 — every file stops on the pieces step; no DXF written.
- WORSE 17, all of one kind: cells the reference closed by a grade draw (10–208 mm) that
  D-cross-nest now refuses (`draw:D-cross-nest`): Paris 7 (G FRONT b LINING 10/18/24/26 with
  103–113 mm draws, E BACK a 10 with 208 mm), Memoir A L SKIRT BACK 2/10/18, Memoir C C BACK 6/10,
  Ambrosia F 18, Taos A 6, Lumiere B 2, Reims J 24, Alassio F 22-24. That is the rule's intent
  (a stretch crossing another size's outline steeply); not yet checked on pictures that each one
  really crosses.
- Better 26: Memoir A H CENTER FRONT LOWER 00/0/8/12/16 (the tick knife — exactly the five peer 80
  measured; no other file moved by it in the closed count), the rest grade draws newly allowed
  (variant D / D-cross a2 / edge extrapolation; 2–166 mm), Taos I BELT 18/24/30 among them.
- Net +9 closed. Nothing closed → open for a reason other than D-cross-nest.

## 13 Nov 2026 — The 1102 open cells by reason; D-cross-nest refusals on pictures

Breakdown of `shot-m13` (scratch, read-only on `cells.json`): 955 leak, 66 merged, 54 refused,
27 tiny. First reason: `not-bracketed` 348 (34 files), `no-model:inconsistent` 307 (33),
`E1-cover` 149 (109 of them drawn and refused `D-share`), class / innerPlug (merged, tiny) 93,
`E2-hole` + `E2-hole-end` 104 (drawn, refused `D-cross` / `D-cross-nest`), `sizes-not-distinguished`
54 (2 files), the rest ~47. 904 of the 1102 are single sizes of a piece whose other sizes closed;
198 belong to pieces open in every size. `not-bracketed`: 153 one size step from the nearest closed
size, 88 in pieces with no closed size. `no-model:inconsistent`: 258 of 307 in families with at
least half of their sizes closed. So the mass is where no grade model is built, not in the draw guards.

D-cross-nest pictures: Paris + Memoir A rerun with `GFIT_PROBES=1` (scratch `shot-xnest`), replayed
with `NEST_CROSS_OFF=1` (`xn-off.json`, 130 tries, 14 refused → drawn), `crossings.mjs` + `replay-svg.mjs`
(peer 80 tools). Seen: Paris G FRONT b LINING 10, E BACK a 10, J FRONT a LINING 24, Memoir A
L SKIRT BACK 10 and 18. In every one the drawn stretch lies in the nest where it should, parallel to the
neighbouring sizes; the steep crossings are at the stretch's END where the outlines of the sizes
converge on a near-common hem (side lines of other sizes ending on the hem, hems a few mm apart).
Numbers: every refusing crossing is 2.0–8 mm from the stretch end (one at 12.8 mm, a corner touch);
3–4 are a touch at the crossed outline's corner (≤ 1.2 mm) on a shared line. Widening the end
allowance: bracketing-anchor crossings 10 → 4 (4 mm) → 2 (6 mm) → 0 (13 mm), but crossings of other
anchors stay at 4–5 because the rule tests EVERY anchor.
Verdict: these are false refusals. The premise of the 12 Nov entry ("graded outlines nest, so a
steep crossing of any of them is a wrong cut line") does not hold at the ends: near a corner on a
common hem the sizes' outlines cross by a few mm by construction. The 12 Nov "20 steep → gone" were
counted, not looked at — the same pieces (Memoir L 10, Paris E BACK a 10, G LINING 18). No patch
yet: the rule needs a test for "the crossing is the grade fan at the end", owner's choice.

## 13 Nov 2026 — D-cross-nest: corner allowance 15 mm — APPLIED

Replay of 607 tries on 20 files (`shot-x`, probes): drawn with the check off 98, with the 12 Nov
rule 72 — 26 refused by D-cross-nest. Pictures of all 26 (`replay-svg`): every one is a CORRECT line;
each steep crossing sits at a corner of the result, where the sizes' outlines converge on a
near-common hem (Kalla C COLLAR, Memoir A L SKIRT BACK, Ambrosia F FRONT SKIRT plainly so). The 12 Nov
"20 of 21 steep gone" counted exactly these as wrong; no picture has shown a true catch yet.

| variant                                         | drawn back of 26 | lost |
| ----------------------------------------------- | ---------------- | ---- |
| A end allowance 6 mm                            | 16               | 0    |
| B fan (crossed outline turns along the stretch) | 8                | 0    |
| A + B                                           | 18               | 0    |
| C corner ≤ 6 / 10 / 15 mm                       | 12 / 14 / 19     | 0    |

Applied C at 15 mm (`nestCornerMm`, corner = ≥ 35° turn over 3 mm arms; `NEST_CORNER_MM=0` restores
the 12 Nov rule, `NEST_CROSS_OFF=1` still bisects the whole check). The synthetic interior-bump case
(`d-cross-nest.test.ts` (a)) is still refused. A/B probe switches removed. Still refused, also false
on the pictures: Kalla C COLLAR 24, Memoir A L SKIRT BACK 10/18, Paris J FRONT a LINING 24, G FRONT b
LINING 18, Ambrosia F FRONT SKIRT 18, Reims J SLEEVES 24 — the corner detector misses them; owner
to decide whether the check goes off entirely. Not yet on a run (cells), only on replay.

Owner decision (13 Nov 2026): keep D-cross-nest with the 15 mm corner allowance as a safeguard; the
7 remaining false refusals stay open rather than tune the corner detector to them.

## 13 Nov 2026 — Ink check: is there ink in the hole? — DIAGNOSIS + proposal (pred inside the bundle)

Hypothesis: an open cell is either a line the PDF draws and we lose (reader / chains / rank) or a
line the PDF does not draw. Rendering the page and looking along the grade prediction tells which.
Change: probe only, `scripts/pattern-import/ink-check.mjs` + `ink-check-entry.ts` (no `src` edits).
Per open cell: `extractPdf` → `detectScale`/`applyScale` → `assembleAllSheets`; the stretch of `pred`
±10–60 mm around `leakAt` is mapped to each covering page (`inv(pose.toSheet)`), and coverage is
measured at r = 0.5 / 1.5 / 3 mm both in the IR (page path segments) and on a pdfjs raster
(`@napi-rs/canvas`, 12 px/mm, dark pixel < 200). Samples inside text boxes are judged on neither
side. Guard: closed-cell outlines vs IR ink, median 0.03–0.14 mm on every file (Glinda: no
closed cells, skipped).
Run: `node scripts/pattern-import/ink-check.mjs ~/Downloads/"archive 600 pcs"/dresses --shot <set40
shot-openpass> --canvas <dir with @napi-rs/canvas> --out ink-all3.json` (`INK_PNG=<dir>` writes
80×80 mm crops; IR red, pred blue). 33 files with open cells, 517 cells, ~15 min, one process.

Numbers (verdict at r = 1.5 mm):

| verdict     | cells | meaning                                     |
| ----------- | ----- | ------------------------------------------- |
| ink-present | 400   | render and IR both ≥ 0.8 along pred         |
| partial     | 48    | ink on part of the stretch                  |
| off-page    | 38    | whole stretch inside text boxes, not judged |
| no-ink      | 27    | render at r = 3 < 0.3, IR the same          |
| reader-loss | 4     | render − IR ≥ 0.2 — all false, see below    |
| clip-extra  | 0     | IR − render ≥ 0.2                           |

By first reason → ink-present: `not-bracketed` 148 of 236, `E1-cover` 130/145, `E2-hole` 50/55,
`E2-hole-end` 36/40, `E4-off-corridor` 18/19, `E3-*` 18/24.

Verdict:

- The reader loses no geometry: render ≈ IR on every file. The 4 `reader-loss` (Dyanna H 32, Taos
  B 32, Verona E 26, Reims A 28) are pred running 1.5–3 mm beside a dashed line whose thick stroke
  reaches the radius while its centreline does not (Taos crop).
- ~78 % of holes have ink on the paper AND in the IR along pred: the line is lost after the read,
  in chains / rank. Caveat: within 1.5 mm there is often a neighbouring size's line, so part of
  the 400 may be another pen — next probe tells pens apart by stroke style.
- `no-ink` is mostly a WRONG PREDICTION, not a missing line. Reims J SLEEVES 0–8 (page 47, at
  29, 149.5): pred lies outside the whole bundle of size lines, in blank paper. Kitchen N SKIRT
  2XL/4XL/5XL (page 44): pred runs midway between two pens. Drawing by grade there puts a line
  where the paper has none.

Proposal (owner's call; `pieces/gfit` is not touched): before a drawn stretch is accepted, check
that pred lies INSIDE the bundle of the neighbouring sizes' drawn lines (between rank − 1 and
rank + 1 where both exist, or within one grade step outside the last drawn size); otherwise refuse
with a reason of its own (e.g. `pred-off-bundle`) instead of drawing. Evidence, the no-ink cells:
Opal F 14; Memoir A G CUP 2 00, I 0; Rosalina B 3XL; Harper A TOP FRONT 28, 32, D CUFFS 00; Kitchen N
SKIRT 2XL, 4XL, 5XL; Nob Hill A FRONT UPPER L, 4XL, 5XL; Fawn L S, L, XL, 2XL; Venice G 18; Verona D
SKIRT BACK 30; Reims L PETTICOAT 30, A TOP BACK 32, J SLEEVES 0–8, D CORSET BACK 32. Not yet
checked how many of them the fill currently DRAWS (vs refuses) — that is the size of the gain.
Lesson: before drawing a missing line by grade, look at the paper — most holes have their line,
and where the paper is blank the prediction is usually what is wrong.

### PROBE — whose chain lies under pred (rankOf), 7 dresses

Question: the ink is there along ~78 % of holes (DIAGNOSIS above) — which size did the pipeline
give it to? Run: `CORNER_PROBES=full node scripts/pattern-import/dxf-shot.mjs <dresses> --files
<7 files> --out shot-rank`, then a scratch script reads `corner-probes.json` (last closeCorners call:
chains + rankOf, sheet mm) beside `cells.json` and, for every open cell, walks pred ±win around
leakAt and lists the chains within 1.0 mm by rank. Files: Leah, Kalla, Memoir A, Paris, Ophelia,
Kitchen, Reims.

Sanity: closed outlines sit on ranked chains at median 0.02 mm; the rank → size vote from closed
outlines matches the card order in every file (18/18, Kitchen 9/9) — no rank swap in this set.

Pens by stroke style alone (rgb | width | dash) do NOT separate sizes: on closed outlines the
own-pen share is 0.3–0.5 on the true size vs 0.1–0.4 on the neighbour. Route dropped.

| under pred (210 holes) | cells | meaning                                                          |
| ---------------------- | ----- | ---------------------------------------------------------------- |
| other rank             | 100   | the line is there, ranked to another size                        |
| mixed own / other      | 46    | part own, part foreign                                           |
| nothing                | 34    | no chain; ink usually exists → lost before chains, or pred wrong |
| own rank               | 22    | own chain present; lost later (fill / link)                      |
| unranked               | 8     | chain dropped as furniture / classify                            |

The foreign rank in the 100: ±1 in 50 (nested lines < 1 mm apart with own missing, one stroke for
two sizes — or a rank swap, see Silverstone 4XL/5XL), ≥ 4 steps in ~30 (almost surely a SHARED
segment: fold, straight edge, drawn once, ranked to one size). By refusal: other × not-bracketed
37, other × E1-cover 35, other × E2-hole 16.

Reading: half the holes are not missing ink but single-rank ownership of a line several sizes
share. Candidate fix (owner's call): let a chain count for several ranks where it lies on their
preds — `sizes/` (rankOf), not `pieces/gfit`. `steps/borrowed-edges.ts` (`litOutline`) already
treats shared edges (≥ 3 other sizes' ends stop on a line) but only for the sizes-step highlight;
nothing it finds reaches pieces/write. Next: a scripts-only simulation of multi-rank chains that
reports, per close, area vs the neighbouring sizes (guard against wrong anchors — Verona D SKIRT
BACK 24 closed at 1866 cm² vs ~4600) and whether litOutline's shared-edge test already covers it.

#### Multi-rank simulation (same 7 dresses, no pipeline rerun)

A scratch script over the same `cells.json` + `corner-probes.json`: an open cell would close
(`simClose`) when own ∪ borrowed chains cover ≥ 95 % of the pred stretch and own alone does not.
125 of 210 would close. Split, exclusive, checks in this order:

| group          | cells | test                                                                                                                                           |
| -------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| risk:area      | 0     | pred area outside ×0.97 / ×1.03 of the nearest closed smaller / larger size                                                                    |
| pred-off       | 41    | an own-rank chain runs ≤ 5 mm beside the stretch and covers < 50 % of it: the own line is beside pred, a borrow would anchor on the wrong line |
| neighbour-line | 53    | ≥ 20 % of borrowed points lie on chains no other CLOSED size runs on (sharedBy < 2)                                                            |
| real shared    | 31    | ≥ 80 % of borrowed points lie on chains ≥ 2 other closed sizes run on (≤ 0.3 mm)                                                               |

- Real shared, by the main borrowed chain's owner: ±1–3 steps 20, ≥ 4 steps 8, unranked 3.
  `borrowed-edges.ts` `isShared` (≥ 3 other ranks' ends land on it, ≥ 80 % of the points) covers
  28 of the 31 — one rule, not a second mechanism.
- risk:area is 0 by construction: the sim snaps ≤ 1 mm along pred, so it cannot make the
  Verona-type wrong topology; it only tests pred.
- neighbour-line is undecided rather than wrong: `sharedBy` counts closed outlines only, so where
  most sizes of a piece are open a truly shared edge looks owned (Kalla P SKIRT WAISTBAND 0 / 2 / 6
  / 18 all borrow size 30's chain, the only closed size on it).
- A first pass required ALL borrowed chains to be shared, so a 2 mm stub of a neighbour line
  flagged the whole cell (19 safe / 92 neighbour-line); the points-weighted split above is the
  honest one.

Reading: the safe multi-rank gain is ~31 / 210 (15 %), and litOutline's shared-edge rule already
finds it — promoting it from display to rankOf / fill is the candidate. The larger lever is
pred-off (41 here + ink-check's no-ink set): refuse instead of borrowing or drawing. Both are
the owner's call; no code changed.

### Shared edge into rankOf / fill (isShared promoted) — DROPPED (14 Nov 2026)

Hypothesis: the 31 "real shared" borrows of the multi-rank simulation are shared edges given one rank; letting `isShared` (`steps/borrowed-edges.ts`) rank them would close them.
Change: none (decision before code; owner delegated it, independent critic first).
Run: no run; critic read the code and `sim.json`.
Numbers: —
Verdict: DROPPED. `splitShared` (`sizes/recover.ts:2608`) already makes shared stretches `common` walls for every size, refusing a stretch another size's line runs beside (`accompanied`, ~:2653). The 31 are exactly the stretches it refused, 20 of them owned ±1–3 sizes away where nested lines sit < 1 mm apart. `isShared` has no such test, lands ends at 4 mm across, decides per whole chain, and is "display aid only" by its own header: promoting it undoes the guard. The sim cannot show a wrong close (it snaps ≤ 1 mm along pred). Next: a probe of WHY `splitShared` refused each of the 28 cells `isShared` covers; if the accompanying line is junk (stub, notch, dash), narrow `accompanied`, not a second mechanism.
Lesson: before promoting a display rule into the read, find the read's own rule for the same thing and why it said no.

### Refuse a draw whose pred lies outside the size bundle — DROPPED (14 Nov 2026)

Hypothesis: ink-check's 27 no-ink cells and the sim's 41 "pred-off" cells show the grade prediction leaves the bundle of the neighbouring sizes; refuse there instead of drawing.
Change: none (decision before code; independent critic first).
Run: no run; critic read `pieces/gfit/*` and `ink-all3.json`, `sim.json`.
Numbers: —
Verdict: DROPPED as evidenced. All 27 no-ink cells are leaks and were never drawn: 23 are `not-bracketed`, and `repairSize` refuses those before it builds a pred (`repair.ts:~290`). The pred the probes read is the operator HINT (`repair-hook.ts:~200`): two nearest trusted sizes, extrapolated ANY number of steps (Reims J 0–8: five open sizes in a row; Fawn L predMm 44–110). The drawer extrapolates one step only. "pred-off": 32 / 41 have the own line ≤ 1 mm from pred = an ordinary gap, not a misplaced pred. A bracketed pred is a convex lerp of the two anchors, inside the bundle by construction; steep strays are already D-cross-nest. The guard would change no cell on this evidence.
Follow-ups:

- Probes that score "pred" must label its source (drawn, hint, or extrapolated hint) and keep drawn cells apart from hints.
- The operator hint extrapolating many steps is a real flaw, but it is operator-facing (owner).
- If wanted later: a bundle test run with `gfit-replay --drawn` over the DRAWN holes, with a picture of every catch (definition in the critic's report: signed offsets to r1 / r2 ± max(tol, 0.5 mm), skip `nestEndMm` / `nestCornerMm`).
  Lesson: check which code path produced the number before acting on it — the hint is not the drawer.

### DIAGNOSIS — why splitShared does not split the shared chains under open cells

Scratch replay of `splitShared` (sizes/recover.ts:2608) on the corner-probe chains (taken just
before it; landEnds' end extensions not replayed): resample 2 mm, accompanied = another rank's
segment with |cos| > 0.8 within 1.4 · sepMm (≥ 16.8 mm; per-file sepMm is not recorded), landings
= ends ≤ 2 mm + an 8 mm ray, then the minRun 15 / landing-at-border test. Input: the 28 multi-rank
"real shared" cells that `isShared` also covers.

- accompanied 25, borrowed chain unranked before the split 2, chain not near leakAt 1. Never the
  short-run or landing test.
- The companion is never junk: all 25 are long size lines (75–1873 mm), median distance along the
  stretch < 1 mm in 22 (mostly 0.0–0.3), 1–3 mm in 3; steps mostly ±1–2, some far (±5 … ±15).

Reading: on these stretches several sizes' strokes are drawn ON the same edge, but not the hole's
own size. The accompanied test cannot tell "another size drawn on this edge" (d ≈ 0 — what shared
means) from "another size running beside it" (d = one grade step, 2–15 mm): both fall inside the
16.8+ mm reach. Candidate (owner-delegated to -fa): a companion whose run-level median distance is
≤ 0.3–0.5 mm is co-drawing, not accompaniment. Risk to measure first: nested ±1 lines that touch
over a stretch (min d ≈ 0, median not).

Pred source (cells.json does not carry `gradeHint.from` / `extrapolated`; inferred from the
refusal: `not-bracketed` → repair-hook `hint()` from the two nearest anchors, extrapolated;
otherwise the repair's own pred between anchors, "drawn"):

| probe                                          | drawn                                                | hint, 1 step out                        | hint, ≥ 2 steps out                    |
| ---------------------------------------------- | ---------------------------------------------------- | --------------------------------------- | -------------------------------------- |
| rank probe, 210                                | 123 (other 63, mixed 28, own 15, none 9, unranked 8) | 53 (other 24, mixed 15, none 11, own 3) | 34 (none 14, other 13, own 4, mixed 3) |
| sim closes: real shared / neighbour / pred-off | 23 / 38 / 33                                         | 6 / 9 / 6                               | 2 / 6 / 2                              |
| split-why, 28                                  | 21                                                   | 5                                       | 2                                      |

The findings rest on drawn cells; `none` concentrates in extrapolated hints (14 of 34 at ≥ 2
steps). pred-off on drawn cells is mostly an ordinary gap (26 of 33 have own line ≤ 1 mm), not a
misplaced pred — consistent with dropping the pred-off-bundle refusal.

### co-drawn ≠ accompanied (splitShared companion excusal) — DROPPED (14 Nov 2026)

Scratch replay of `splitShared` (same inputs as the diagnosis above: corner-probe chains, pre-landEnds,
reach 16.8 mm, `sectioned` unknown). Rule tried: a companion whose contiguous overlap ≥ 15 mm has median
distance ≤ T (0.3 / 0.5 mm) is co-drawing and does not count as accompaniment. A: any co-drawn companion
excused; B: only if the co-drawn set brackets the hole's size (side effects: max − min ≥ 2).

| mode | gains (of 25) | new splits, all chains | len ≥ 100 / 30–100 / < 30 | span ≥ 4 | own rank ≤ 5 mm beside | touching |
| ---- | ------------- | ---------------------- | ------------------------- | -------- | ---------------------- | -------- |
| 0.3A | 0             | 810                    | 351 / 293 / 166           | 785      | 7                      | 1        |
| 0.3B | 0             | 804                    | 343 / 297 / 164           | 780      | 7                      | 0        |
| 0.5A | 0             | 823                    | 351 / 297 / 175           | 797      | 10                     | 0        |
| 0.5B | 0             | 817                    | 343 / 299 / 175           | 792      | 10                     | 0        |

Why no gains (0.5A, samples ≤ 40 mm from leakAt): the excusal fires (≥ 1 excused companion at 20 / 25
cells, all under-samples at 15), yet 24 / 25 stay > 50 % accompanied. Still-unexcused companions by
distance (sample × companion): < 0.5 mm 1415, 0.5–2 mm 2306, 2–8 mm 3467, 8–16.8 mm 1018. The 2–16.8 mm
band is the nest itself: a shared stretch still has the other sizes' own lines one grade step beside it,
in every nest, so "accompanied" holds on shared and non-shared stretches alike. The < 2 mm leftovers are
co-drawn only in fragments (< 15 mm contiguous) or slightly off. Excusing loosens the test everywhere
(~800 new "shared" runs spanning ≥ 4 sizes) and still does not reach these cells.
Verdict: DROPPED. The 25 shared-edge cells are PARKED: the only separating signal is end-landing
(`litOutline` covers 28 / 31 real shared), i.e. the declined `isShared` route — not reopened without new evidence.
Lesson: in a nest every stretch is accompanied by the next size one grade step away — a companion-proximity test cannot tell shared from own.

## 14 Nov 2026 — G8 plateau, and offset remnant loops — APPLIED

**G8 plateau (`semantics/build.ts`, `AREA_PLATEAU_TOL` 0.5 %).** An area drop up to 0.5 % of the
largest smaller size is a plateau (one pocket for every size; Asheville, Estoril, Verona: 0.03–0.27 %
offset noise). Compared with the running peak, not the previous size, so a slow slide cannot pass step
by step. The non-monotone blocks left on the 7 files are real wrong closes: Verona D 24 (−58 %),
Silverstone G/E "5XL" (the 3XL line: the fill's `lonePortions` walls whole 3XL lines because the grade
step 23–26 mm exceeds lone `sideMm` 20 — peer diagnosis, rank is right), Kitchen F STRAP 2XL, Paris D,
Axel F COLLAR 10 (closed on size 14's line).

**Offset remnants (`semantics/offset.ts` `dropRemnants`, bisect `OFFSET_TRIM_OFF=1`).** The
`offset-topology` blocks split two ways on pictures:

- wrong close — the outline itself is wrong, the block is right: Paris C 32 (a strap merged over a
  1.36 mm neck; both loops exactly at the allowance), Verona B 20 (a self-crossing tick square at the
  hem corner), Ambrosia B FRONT TOP 2 (closed across other sizes' lines, a 3 mm strip);
- artefact — a clean outline: Axel A 10 (1 extra loop, 265 mm²), Axel D 26 (8 extras, 3–615 mm²),
  Dyanna E SLEEVES. The raw offset's positive union keeps swallowtail loops where the source turns
  tighter than the allowance; every vertex of such a loop is nearer the source than |mm|.
  Rule: when there is more than one loop, drop a non-largest loop whose every vertex is nearer than
  |mm| − 0.02 mm; record the count / largest area in `report.dropped` and the piece note. Holes are
  unchanged.
  Critic (independent agent, code + data, not my conclusion): ACCEPT WITH CHANGES. A reversed-arc join
  in `rawOffset` leaves the same loops, so the trim is the standard distance clean-up and not a patch over a
  rawOffset bug. Genuine loops measured ≥ |mm| − 0.01 (Paris; synthetic 0.2–1 mm lobes on a 2 mm neck,
  8–200 vertices, 0.1 mm rounding), remnants ≤ |mm| − 0.05. Vertex sampling is enough (edge midpoints
  never exceed vertex max). The critic asked for: tol 0.02, not 0.05 (0.001 mm of headroom on D 26), a
  recorded drop, holes unchanged. All three are done. The kept loop is still judged by `parallelDeviation`: D 26
  at 12.7 / 15 mm stays blocked (deviation 12.7 / 15 mm, tight cap curve — open).
  Measured on the 18 files with an offset block (`shot-trim`; 13 of them timed out under machine load
  and were retried in `shot-trim2`), against `shot-openpass` (13 Nov):
- 0 files worse. In 9 of the 12 retried files the blocked pieces are unchanged.
- Ophelia: D SLEEVES offset-topology → no build block; the file now stops only at the cutting-list
  fold question. Asheville: G POCKETS non-monotone → gone (G8 plateau, above); also stops only at the
  fold question.
- Axel: A FRONT offset-topology → built (remnant trim). D SLEEVES offset-topology → offset-hull (with
  the remnants gone, the next check speaks; open). F COLLAR non-monotone is NEW in the report but not
  a regression: the cells are byte-identical in both runs. Size 10 closes on a top line above both 8
  and 12 (area 194 vs 178 / 187, with a jog on the side). It is a real wrong close that the
  14 Nov running-peak G8 now catches.
- Axel D 26 at 12.7 / 15 mm stays blocked (deviation) because of the tight cap curve. This is a limit
  of judging a kept loop by `parallelDeviation`, not a remnant. Do not re-chase it through the trim.

## 15 Nov 2026 — nest-hole audit (a close on a foreign line that G8 cannot see) — TOOL, not a gate

Question (direction review): non-monotone area (G8) misses a piece that closes partly on a
neighbour's line when its area still sits between the neighbours. Should a G8 plateau rule
("flat across all sizes") close that hole?

- No. Area series from `outer` show genuine group plateaus: Verona F SASH / H BOW CENTER, the Kalla N/O
  pockets, and Asheville/Kitchen/Estoril pockets flat across every size. "Flat for all" would block
  them. The equal-area trap (Silverstone F SKIRT FRONT 4XL = 5XL, 3562 vs 3566 cm²·100) already
  passed under the old ≥-peak rule, so the plateau tolerance opened nothing new.
- Instead we look at lines, not areas. At every 1 mm sample of a closed outline, take the set of
  sizes whose line passes within 0.3 mm. A closed size strictly between that set's min and max
  (size order) that is not in the set is a **hole**. It is flagged at ≥ 15 mm of run, and the hole
  size is the suspect.
  - The first version blamed the size standing on the foreign line and flagged 3210 cells, mostly
    ordinary subset grading.
  - Blaming the hole picks the wrong close: Verona D SKIRT BACK 24 (area 1866 between 4433 / 4955),
    Harper D CUFFS 24 (220 between 432 / 453), Kalla M SKIRT FRONT CENTER 28 (top edge on a line
    12 mm below the shared top; area monotone, so G8-blind).
- shot-openpass: 895 hole cells in 35 files. 64 are non-monotone (G8 already sees them), 831 are
  G8-blind. Of those, 47 are isolated (≤ 2 holes in the piece), and 17 of these are ≥ 50 mm.
- Noise: sleeve caps that cross tangent over ≥ 15 mm (Venice H), and stepped neck/armhole grading
  (Axel C 12, Dyanna A 12).
- Use: a before/after diff per cell. A cell that newly closes and newly shows a hole is a close on a
  foreign line, and counts as WORSE even if `notClosed` went down. The noise is the same in both runs
  and cancels. Not a gate reason until the isolated hits are each looked at.
- Script: scratchpad `nest-holes.js` (needs `AUTOPILOT_OUTLINES=1`). Pictures went to the direction
  review.

### 15 Nov, later — nest-hole audit after the direction review

- Review findings, all accepted:
  - (B) Blaming the hole misses the diff case: Silverstone 5XL closes on the 3XL line and the hole is
    the already-closed 4XL. The audit now keeps every (hole, by) pair; `nest-diff.js` flags the newly
    closed cells of any piece that gains a new pair. Checked on a synthetic Verona D case.
  - (C) Tangent cap crossings: the hole's own line must be ≥ 1 mm off at the run's midpoint.
    895 → 434 hole cells, and the real ones stay.
  - (D) cells.json is in ascending size order in all 329 families.
  - (A) The audit is blind to ±1 and to the end rank, because there is no size "between"; Ash F 4XL,
    Axel A 10 hem and Silverstone F 4XL pass it. That half comes from fc's oth% (the outline's share on
    another rank's source line with no own/common line within 0.5 mm). It needs the lines
    (walls-dump or `CORNER_PROBES=full`), so the next milestone run must carry them.
- G8-blind holes ≥ 40 mm, isolated (≤ 2 holes per piece), looked at one by one: 25 cells.
  - 6 real: Kalla M 28; Axel C 12 (armhole outside both 10 and 14); Dyanna A 12 (neckline above both
    neighbours); Memoir D 4; Estoril H SKIRT FRONT XL and 2XL (a jog down onto the 3XL/5XL line).
  - 10 noise: tangent curves, near-coincident collar lines.
  - 9 unclear.
- 5 sampled pieces with many holes: 2 real, including Taos G SKIRT 0, whose waist ring lies outside 2
  and 4 (G8-blind, because the skirt length swamps the area).
- Verdict: about 1 in 4 is real. Not a gate; use it as a per-piece diff and as a worklist.

### 15 Nov, evening — metrics that only diff, the Taos G 0 mechanism, the continuity order guard

- `nest-diff.js` now also prints MOVED: a cell closed in both runs whose outline moved > 0.3 mm
  (symmetric Hausdorff). shot-trim2 → op12: 1287 identical, 0 moved.
- fc's oth% and the longest other-rank run, measured on 1347 cells: most long runs are lines drawn
  once for several sizes and ranked to one of them. Those are correct closes and the metric is
  flawed. No length threshold separates real from shared (12 pictured: 8 shared, 1 real, 3
  unclear). Use both as a DIFF only, never as a level.
- Wrong-close classes seen so far:
  1. A fill detour along common interior marks: Axel A 4/6/8 hem notch, 6 × 60 mm, where 8's own
     chain runs straight across. The C·X·C pattern finds 21 such cells, and many of them are
     continuity closes.
  2. The own line is present but open, and the cell closes on a far ring through continuity:
     Taos G SKIRT 0.
  3. The own line is not in the read at all: Axel A 24 hem on the 16/20/22 group line.
- "Bypassed own line" detector (an X run with an own chain parallel within 20 mm): it fails. It
  misses Taos 0 and Ash 4XL and fires on noise.
- fc's lonePortions `nest` scopes (global, fill:614 only, everything but fill:614): all rejected.
  Silverstone 3XL closes in every scope. The bogus 5XL opens only with nest in fill:614 AND
  the other callers together, and fill:614 carries all the collateral. 5XL is a `class` close, so
  it is not a lonePortions problem.
- **Continuity's tolerance is shape-only; order is the missing axis.** Taos G 0 was kept by
  `continuityVerdicts`. The nearest anchor (size 8) is 4 steps away, so hAllow was 98 mm against
  a measured 15 mm, and the concave waist makes the far ring the _smaller_ area, so growth passed
  too. Do not tighten hAllow. Add the order check instead: along the outline, size r lies between
  its closed neighbours r−1 and r+1; an end size does not go past r±1 towards r±2.
  - `pieces/continuity-order.ts` `gradeOrderRun`, switch `CONT_ORDER` (default off).
  - Neighbours are cells closed by anything but continuity, so two wrong continuity closes cannot
    vouch for each other.
  - Samples where the two neighbour lines lie < 3 mm apart are skipped: converging caps and shared
    lines carry no order. An end size looks up to 3 ranks further for a line that separates (tied
    grade pairs, e.g. Taos 2 = 4).
  - The excess must be ≥ max(2 mm, gap/2). A run counts at ≥ 50 mm.
  - Measured on the shot-openpass outlines (scratchpad `between.js`):
    - a fixed ±2 mm margin flags Reims J 18 and Lumiere D 2; both are converging caps or a sliver,
      not order errors;
    - the normalised margin flags 3 of 91 continuity closes; 2 are ≥ 50 mm: Taos G 0 (177 mm on
      ring 16) and Ophelia D 18 (183 mm on 22's chain 3777, with its own 6385 alongside). Both
      were pictured wrong.
  - On all closes it flags 5.2% of `class` closes, so it is not a global detector.
  - A refused cell goes back to leak. The edge extrapolation is meant to draw Taos 0 on its pred.
- Silverstone 5XL: the same order check flags it (297 mm), but also the correct 4XL (578 mm),
  whose upper neighbour is the bogus 5XL. A rule for `class` closes needs a tie-break first.

### 15 Nov, night — CONT_ORDER: real runs, the critic, the positive case, "own line alongside"

- **Real runs (Taos + Ophelia, walls-dump, CONT_ORDER off → on):** exactly Taos G SKIRT 0
  (oth 6 %, 497 mm on a lone other-rank stretch) and Ophelia D SLEEVES 18 (oth 40 %) go closed →
  open; no other cell changes outcome or area (> 1 cm²).
- **Independent critic** (fresh agent, code + data, not my conclusion): adopt with changes.
  1. The run counted samples, not mm: a dense polyline (0.1 mm vertices) turned a 28 mm bump into
     a "279 mm" refusal of a correct size. FIXED: the run is arc length.
  2. A neighbour closed on a far line (not continuity, e.g. repair / the Silverstone 5XL class
     close) refused a correct size (960 mm). FIXED: the reference pair must be in grade order
     itself (area of the smaller rank ≤ 1.01 × the larger; a tie carries no order).
  3. Blind past 60 mm (`nearestOn` rMax): a size closed ≥ 7 steps away on a 10 mm grade is not
     caught. Kept: it only misses, never refuses; logged as a limit.
  4. Rank gaps weaken it (t = L/2 over the whole gap); one-sided coverage only sees r+1 side;
     `vs` names side[1] even when side[2..3] separated. Limits, not fixed.
  - Tested and held: darts moving 8–25 mm per size, sizes rotating about a fixed point, tied
    lines. Tests added for 1 and 2 (`continuity-order.test.ts`, 7 pass).
- **Positive case (Taos G 0 drawn by extrapolation) does not fire, and should not yet.** No repair
  try reaches it (`not-bracketed`): size 2 is an `innerPlug` closure, not a `gradeAnchor`, so the
  nearest anchor (4) is two steps away and extrapolation needs one. Underneath: the Taos skirt (G
  and lining H) grades in STEPS — areas tie in runs of 2–3 sizes (2≈4≈8 class-closed,
  10≈12≈14, 22≈24, 30≈32), the plugs sit 0 % on other lines; a linear grade model does not fit
  stepped grading, which is also why G 6 and 18 are `no-model:inconsistent`. Open task: stepped
  grading in the grade model (not a condition of the guard). Honest open > closed on ring 16.
- **"Own line alongside" detector (fc, from Kitchen C 3XL):** an oth stretch with an own-rank chain
  0.8–4 mm beside it = wrong line, not shared. Audited on fc's 8 files (lr-base / lr-nestinv,
  `scratchpad/beside.py`): ≥ 20 mm fires on ~50 cells per run, mostly whole graded families (Paris
  D BACK b 9 sizes, Reims M LOWER SKIRT 9 sizes, Memoir O SLEEVES 5) that are correct nests; Kitchen
  3XL fires at 90 mm but so do a dozen others ≥ 90 mm; Silverstone 5XL does not fire. Not
  discriminating as is: REJECTED as a class-level rule. The Silverstone 5XL tie-break stays open.
- **Milestone** set40 off vs on running (`m-co-off` / `m-co-on`, PIECES_OPEN_PASS=1).
- **Stepped grading count** (f3's lead: is no-model:inconsistent mostly stepped grading?), on
  `shot-openpass`, `scratchpad/stepcount.js`, families with ≥ 3 adjacent closed pairs, tie = area
  within 1 %: inconsistent families 85, adjacent pairs tied 37/591 = 6.3 %, 6 families ≥ 30 % tied
  (29 of 235 inconsistent cells); control (all other families) 182/2175 = 8.4 %, 19 stepped. At
  0.5 %: 4.2 % vs 6.1 %. Stepped grading is NOT over-represented in the inconsistent bucket: a
  step-aware model would reach ~29 cells, not the bucket. Caveat: area is a whole-outline measure;
  a step on one feature line only is not counted. Not pursued as the big lever.
- **Milestone set40, CONT_ORDER off vs on (`m-co-off` / `m-co-on`, PIECES_OPEN_PASS=1, same code):**
  2 wrong closes refused (pictures), 0 correct closes lost, 0 outlines moved. Exactly two
  transitions set40-wide, both continuity closed → leak: Taos G SKIRT 0 (order run 160 mm vs ranks
  2–3; picture: the waist arc of 0 is LARGER than 2's while its hem is smaller — WRONG) and Ophelia
  D SLEEVES 18 (149 mm vs 16–20, arc length after the fix; 183 by the old sample count; zoom: 18
  runs beyond 20 by more than a step, on a larger size's line — WRONG). Closed in both runs: 3638,
  outlines byte-identical (MOVED 0). closed 3640 → 3638: the +2 open is the gain, `notClosed`
  cannot tell. Reims J 18 (cap convergence, correct) stays closed; `gradeOrderRun` returns null for
  it — held by the normalised margin (t = max(2, L/2), skip L < 3 mm), not by the area-order pair.
  `no-model:inconsistent` 304 → 304: wrong continuity anchors do not feed that bucket.
  **DECISION: ACCEPTED, on by default; `CONT_ORDER_OFF=1` = the old rule.** Arguments for: the only
  axis continuity lacked, both refusals wrong on pictures, nothing else moves. Against (critic):
  blind past 60 mm and weak across rank gaps — it misses, never refuses; the two refusing defects
  were fixed before the run. Open: no-model:inconsistent cause (f3: picture the 5 worst gradeAll
  families — wrong anchors / missing sizes / non-linear grade) before anyone touches that bucket.

### 15 Nov, late — MOTIF_EDGE_GAP (bead gap measured edge to edge) — DROPPED

- **Trigger:** Taos 18-pen «▬● ▮» scores 0.83 against its own legend sample (< 0.86). The pen's dot
  abuts the dash, but `signatureOf` measures the gap _before_ a bead to its centre (`dist(prevEnd,
centre) − len/2`) and the gap _after_ it from its centre. Walked one way the dot reads as touching,
  walked the other way it reads as a 0.5 mm gap; key and field walk this pen in opposite directions.
- **Tried:** every bead edge to edge (both sides symmetric). set40 −305 / +70 cells, Memoir A 214 →
  190: a dot loses its radius, so dotted pens collapse toward «solid». Narrow variant (mark beads
  only): Memoir A 210 (−6 / +2: A BACK CENTER 0/2/4/6 lost), 469 tick6>ring6 merges, pen 6 read as
  key 2.
- **Why it cannot work:** motifs follow the PDF dash-array convention — a dot is a 0-length dash and
  its pitch is measured centre to centre. `land.ts` (`dotted = motif[0] === 0`), `identity.ts`,
  `grade/guard.ts`, `page-ink.ts`, `recover.ts`, `classify.ts` and `legend.ts` all read that
  convention, and the mark / ring motifs were tuned on it. **Do not "fix" the gap asymmetry in
  `signatureOf`.** The asymmetry is load-bearing; the direction dependence is solved where it bites
  (legend scoring), not in the signature.
- **Next (critic-approved):** `MOTIF_DIR_FREE` — also compute the reversed walk's signature (on
  `sig.rev`, seen by legend-id only) and score each key sample as max over walks, uniformly for all
  keys.

## 16 Nov 2026 — TICK_THROUGH / TICK_ORDER (end ticks that are not ends) — ACCEPTED (default on)

- **Trigger:** Memoir A H CENTER FRONT LOWER and BACK CENTER: per-size waist marks are short lines
  across the piece, ranked into a ladder, and `endTicks` (`pieces/ticks.ts`) cut sizes at them —
  size 0 closed as the upper third of its piece (closed, wrong; `notClosed` blind).
- **TICK_THROUGH (bisect `TICK_THROUGH_OFF=1`):** an end tick of size r is where r's own outline stops; when r's
  own line runs on past the tick on both sides at an end, it is a mark across r's piece, not an end.
  Quorum over the ladder (f3: an ANY rule let a waistband's own CB / side marks veto its real ends):
  `veto = self || (thru ≥ 2 && thru > stops)` over rungs of firm rank.
- **TICK_ORDER (bisect `TICK_ORDER_OFF=1`):** the ladder's size order must put the larger sizes on the side r's
  own lines run to (D3 trend); a nest's side edges step the other way at one of its edges (Memoir A
  D/K) — order against sides: no end.
- **Strap trap (Memoir B L SHOULDER, MDF364):** first milestone (`m-tickord`) closed sizes 00–8 on
  size 10's rung (457.2 mm; flags-off 400…447.6) — closed → WRONG. From `rows.json`: tick c1898 r0's
  own strap side stops on the rung, but a pen-0 line of the NEXT piece (x≈911, y 95→1045) ran 14 mm
  past the end, inside the −18 mm end window → "through". Tick c1912 r5: its own side overshoots the
  rung by 3.5 mm (> PAST_MM 3) → "through". A first fix (ignore lines ≥ 2 ranks' rungs end on:
  "shared") changed nothing — the line was not shared — and was removed.
- **Fix (default; `TICK_THROUGH_NEAREST_OFF=1` = old union rule), after f3's critique:** at each end
  of the tick, only rank r's chains that REACH the tick's line (|h| ≤ PAST_MM 3) speak, as one group:
  every such chain whose outward distance along the tick is within GROUP_MM 1.5 of the nearest (a
  side split in two at a T-junction is one line). The group's ARC (mm of line more than PAST_MM
  across) is summed per side: 'through' when both sides carry > THRU_MM 6 (a stroke's end
  overshooting a corner is short; a side that crosses is long), 'stops' when any arc, and no r line
  on the tick's line = 'none' (abstain — a far line's 'stops' is a quorum vote too). A first
  "nearest line + 6 mm overshoot" version was replaced by this one before its milestone.
- **Measured (TICK_THROUGH + TICK_ORDER, par 1):** Memoir B L SHOULDER 00–8 back to 400…447.6;
  Memoir A 222 closed (baseline 214), identical to the old rule: H 0/00/8/12/16 moved 135–145 mm =
  the full piece instead of the part above the waist mark (pictures), +8 gains. Kalla vs flags-off:
  0 loss, +1 gain, E TOP FRONT 0 moved 230 mm (was cut at an internal mark); the old rule's losses
  P 00 / Q 6 / Q 14 are gone.
- **Flags-off control (`ctl-off`, 9 files) vs `baseline-set40`:** only Ophelia D 18 and Taos G 0 —
  the accepted CONT_ORDER refusals. The earlier "Reims M LOWER SKIRT moved 1800 mm", "Kalla G ±6",
  "Fawn L changed" were a `media-diff.mjs` bug (pieces matched by label; Reims has two «M - LOWER
  SKIRT», Fawn three «L - 2XL») — fixed: the n-th piece with a label matches the n-th.
- **Tooling:** `SHOT_ROWS=1` dxf-shot writes `<file>/rows.json` (the sizes step's rows: chains,
  byRank, common); `media-diff.mjs` draws `-sheet.png` (whole sheet, own rank blue, common green,
  closed outline red) when both runs have it, and `--sheet` for one size.
- **Milestone `m-group` (set40, par 2, group/arc rule, both flags) — ACCEPTED (f3 agreed):**
  - vs flags-off re-shoot `base-rows`: closed 3664 → 3673, loss 0, gain 9, moved 9 (Memoir A H
    135–145 mm, Kalla E 0 230 mm, Memoir A K ≤ 9 mm). (CORRECTED: the first read used a stale
    scratchpad copy of nest-check; re-run with `scripts/pattern-import/nest-check.mjs` as committed
    on `open-lines-global` ef28c82e4, file mtime 16 Nov 02:21.) Same script: `m-tickord` vs
    `baseline-set40` and vs `base-rows` both give new 2 (the same H CFL 26/30) · cleared 1. H CFL
    26 and 30 outlines are byte-identical in `base-rows` and `m-group`; only 00–16 moved. Mechanism
    (f3; confirmed with `judgeFamily` on both runs): the family grade step is the median of
    adjacent-pair p95 distances, and the broken 00–16 had inflated it — step 60.7 mm in `base-rows`,
    7.2 mm in `m-group`; `lim` for 26 against 22 (2 index steps) fell from 364 mm to 43 mm, so the
    231 / 120 mm truncations became visible. 26 and 30 are PRE-EXISTING wrong closes. LESSON:
    nest-check verdicts depend on the whole family's step, so a fix elsewhere in the family can
    raise "new" flags on cells that did not move — a new flag is a regression only when the cell
    itself moved (compare `outer`). Repo `nest-check --before base-rows`: new 2 · cleared 1
    (Kalla E 0) · cleared-by-unjudged 0; `--before m-tickord`: new 1. All three new flags are OLD
    geometry newly judged, not moved cells: Memoir A H CFL 26/30 TRUNC (same outline as baseline,
    old cutAtTicks closes at a waist mark — the ladder's upper sizes the quorum did not reach; bracket
    22/32 became usable once 00–16 closed whole) and Memoir B L SHOULDER 20 OVER 108 (area 192 cm²,
    identical in all three runs and on trend; flagged because neighbour 22 — with 24/26 — closes on
    a smaller size's outline, 174 cm², in every run). Queued: L SHOULDER 22/24/26 wrong close,
    Memoir A H CFL 26/30.
  - vs `m-tickord` (old union rule): 3675 → 3673, loss 5, gain 3; Memoir B L SHOULDER 00–8 restored.
    All 31 veto flips are true → false; `TICKGROUP` (a split-side group deciding) 0 lines.
  - The 5 cells lost vs `m-tickord` were the old rule's luck, all open again as in flags-off:
    Verona H BOW CENTER 0/2/6 — the "tick" c830 r0 is the bottom edge of size 0's 55×63 mm H
    rectangle; the old veto came from another piece's line 23 mm below (the strap trap, right way
    round). Verona A 32 and Kalla Q 30 — 'through' from a corner overshoot 1–2 mm past PAST_MM (Kalla
    c5367/c5863/c2524 hp 3.8–4.5, Verona c1359/c4290 hn 5.0, arc ≤ 2.3 mm); the same noise gave the
    gains Kalla P 00 / Q 6 / Q 14.
  - Dead end: "a tick already ranked r with a 'stops' end is r's closing edge, not a mark → no knife"
    (A'). On 4 files 62 of 86 accepted ticks are exactly that (Memoir B strap, Memoir A H — the
    helpful knives): ranking runs before ticks, so a tick usually IS r's own end edge.
- **Queued:**
  - Verona H 0/2/6 (CORRECTED after f3's read of `fill.ts`; an earlier version of this entry
    blamed r0's knife spreading past its corner — wrong: `cutAtTicks` is a mask cut after the flood,
    it can only remove pixels). The cell is refused by the cross-rank check: `TICKCUT r0: runs past
c937 (r7)` (also r1/r2/r4/r5/r6). c937 is the right side (x 1163.4, y 1457–1564.5) of the G BOW
    rectangle below H, accepted as r7's end tick in `m-group` (vetoed in `m-tickord`). Its probe
    points can only be inside r0's mask if r0's flood already runs from H (55×63 at 1060–1117 ×
    1374–1437) into G — `leakAt` (1088, 1401) is inside H. Open: why r0's pre-tick mask holds G
    (trace on Verona alone), and whether c937 is an end tick at all (a side of a closed rectangle).
    H grades in steps (00–6 one box, 10–12, 16–22, 30–32), so equal boxes there are not wrong.
    What closed H's 5.2 mm corner (833's end at 1117, 1432) with no knife is UNIDENTIFIED: no fill
    bridge (`derived []`); corners EXTEND refuses a crossing behind an end (x.b ≈ −0.1 mm) — a stub,
    a ramp or the drawing itself; check with `MOOD_F2_DEBUG=1`.
  - Not a threshold to tune (f3): for a 'stops' end within 3 mm of PAST_MM, let the knife's outcome
    decide — knife, fill, area on the grade, else veto. The same try-and-check would catch Verona H
    (the leak's area is off the grade). Any cutoff between 3 and 6 mm only moves the coin.

## 16 Nov 2026 — Milestone m-motif (`MOTIF_DIR_FREE=1`) — REJECTED (flag stays off)

- Run `/private/tmp/patimport-runs/m-motif` vs `m-group` (same flags plus `MOTIF_DIR_FREE=1`).
- Closed 3647 → 3656: +33 (Memoir B I SKIRT FRONT 0 → 12 sizes; L SHOULDER 22/24 back on trend
  196/200; Venice B 0/6 and E 2/6 were closed wrong at 151/167/84/89 cm², now 225/245/197/205).
  nest-check: new 0, cleared 5 (plain) / 6 (`--robust-step`, adds Reims M 18).
- WORSE: 23 sizes closed → open, all on area trend in m-group (Memoir B H/B/C/D/F/E/L, Venice
  I/H/B/E/C/D); refusals mostly E1-cover / E2-hole — another key read for a pen, holes in outlines.
- Closed → WRONG: Ambrosia (MDF408) E COLLAR BAND 24, 135 → 128 cm² (neighbours 132 / 138).
- Handed back to the flag's author (open-lines-global): diff the per-pen key picks on Memoir B and
  Venice between the runs.

## 16 Nov 2026 — Bucket G (`no-model:inconsistent`, 303 cells in m-group): why, and `GFIT_LOCAL`

- **Mechanism:** fitFamily's robust fit may drop a third of the anchors; when more disagree the
  whole family is 'inconsistent' and repair refuses every open size, however well bracketed.
- **Measured offline** over m-group cells (fitFamily on the class-closed anchors):
  - gross anchors free of the budget (score ≥ 3 / 5 / 8 not counted; scratch patch, not kept): 25 / 17 / 9;
  - tolerance × 1.25 / 1.5 / 2: 51 / 74 / 101 — rejected: silent.ts shares the fit;
  - two grade segments (≥ 3 anchors each): 46;
  - a 4-anchor window around the size (2 each side) is still inconsistent for 243 / 303.
  - Typical disagreement is modest (score 1–2.5, i.e. 2.4–6 mm) and 353 / 438 are extrapolated:
    the grade is not linear in rank (Dyanna A BACK: ~7 mm steps at 00–8, ~15 mm at 26–32).
- **`GFIT_LOCAL=1` (pieces/gfit/repair.ts):** an inconsistent family that would refuse takes the
  nearest anchor on each side as the pair (no extrapolation, no variant D), E3-tol is the pair's own
  leave-one-out, E1–E4 unchanged. A wrong pair puts the corridor off the size's own lines — the
  failure mode should be E1 refusal, not a wrong close. f3 critique requested; milestone m-glocal
  (`GFIT_PROBES=1` for replay) running.
- **m-glocal result** (`/private/tmp/patimport-runs/m-glocal` vs `m-group`): closed 3647 → 3658,
  +11, 0 lost, 0 closed → wrong, all 11 on the area trend; nest-check plain and `--robust-step`:
  new 0, cleared 0. Bucket G after it (299): E1-cover 137, edge-refused (not bracketed) 68, E2-hole
  40, E2-hole-end 21, closed-local 11, E2-end-offset 6, E4 4, E3-family 3, E3-tol 3, no-pair 3,
  E3-area 2. f3 approved the revised diff; acceptance still owes: local cells split by pair trust
  with r2 − r1, pictures of untrusted-pair cells and cells with `common` ≥ 50 %.
- **Holdout** (`scripts/pattern-import/holdout40.txt`, 40 unseen MDF files, all garment folders;
  `h-base` vs `h-glocal`): base 2563 / 3052 closed (84 %); `GFIT_LOCAL` +3, 0 lost (all 3 pairs
  trusted, `common` 0). Same order as set40 — a general but small rule. Bucket G there: 133, of
  which E1-cover 88, edge-refused 15: the same dominant failure as set40. Weakest folders (one file
  each, a signal only): accessories 33 %, activewear 67 %, menswear 70 %, pants 74 % (4 files).

## 16 Nov 2026 — Plan (owner: enough data, start making changes; no runs without the owner's OK)

Every step below is behind an env flag; its milestone is set40 + holdout40 and runs only on the
owner's OK. Acceptance as before (0 WORSE on both lists, no closed → wrong, nest-check both modes,
area monotone, f3 review before acceptance).

open-lines-main (bucket G, `pieces/gfit`):

1. `GFIT_LOCAL` commit prep: the unused `grossScore` was dropped from fit.ts; f3's acceptance
   pictures are left; commit on the owner's yes.
2. Piecewise grade model for E1-cover (137 set40 / 88 holdout): the grade is not linear in rank,
   so the corridor from a pair far apart misses the size's own lines. A per-family break in the
   step (two linear pieces, or local pairs at ±1 rank), designed offline on existing probes first.
3. Edge sizes (68 / 15 not bracketed): one step past the last trusted size with the local step
   (from the two nearest anchors), not the whole-family slope; same hole / D-share bounds as the
   accepted edge extrapolation.
4. Foreign-line detector (from open-lines-fc): an own-rank chain running parallel at 1–4 mm to a
   closed outline means that outline is on another size's line.
5. Later, lower value (closer to fitting single files): Reims dashed guide, Verona H ORDER,
   Memoir H CFL 26/28/30 and B L SHOULDER 22/24/26.

open-lines-global: T1 a reusable nest judge (nest-check's bracket rule as a pure src module).
The `pred-off-bundle` guard as first proposed is dropped: the 27 no-ink cells are never drawn (23
not bracketed, pred = the operator hint), so it would change 0 cells. The judge's first consumer is
the LADDER_RESCUE coincident-chain fix (open only when the refill differs or the judge says
truncated / over). T2 multi-rank shared lines: a simulation on existing corner-probes / cells that
narrows splitShared's "accompanied" refusal (not a second mechanism; the 14 Nov promotion of
isShared into rankOf stays a dead end).

## 16 Nov 2026 — Bucket G E1-cover: what the refusals are (offline, existing probes; no shoots)

- Split of GFIT_LOCAL tries refused E1-cover, by what lies along the prediction (own + common walls;
  a class counts at ≥ 8 % of the perimeter). set40 170 tries: own line 0.6–3 mm off the prediction
  only 33, both 76, no own line within 3 mm only 58. holdout40 96: 14 / 36 / 45.
- Of the stretches with no own line (f3's re-split): ink of another size (outline or overlay) within
  3 mm is 26 % of that length on set40 (39 of 136 tries mostly so), 11 % on holdout40 (15 of 82).
  The rest has no RANKED ink near; unranked lines are not in the probes, so "blank paper" vs
  "unranked line" is not separated yet.
- Model test (f3: judge a model on known truth, not by cover): leave-one-out on closed trusted
  anchors whose nearest anchors span ≥ 3 ranks; p95 distance of the prediction to the real outline,
  median over cases. Linear pair / 3-anchor quadratic (pair + Lagrange-weighted residual at the third
  anchor) / piecewise (near side's local step):
  set40 consistent 0.69 / 0.75 / 0.86 mm (n 574), inconsistent 2.29 / 2.01 / 3.39 (n 137);
  holdout40 consistent 1.04 / 1.01 / 1.19 (n 98), inconsistent 3.22 / 3.31 / 3.98 (n 62).
  The quadratic's weights go below −0.3 in ~75 % of cases. **(A) REJECTED**: the quadratic wins on
  set40 and loses on the holdout (fitting), piecewise loses everywhere.
- Reading: in inconsistent families even the best model misses the true outline by 2–3 mm, wider than
  the 1–2 mm acceptance corridor — the outlines are irregular, not a different curve. Acceptance
  there should ask whether the size's own line NESTS between its neighbours' lines (the nest judge,
  open-lines-global T1), not whether it lies near a prediction.
- f3 (16 Nov): (A) rejected agreed. Constraint for any nesting acceptance: "inside the bracket" with
  a ~7 mm step is a strip that contains the neighbours' lines themselves (on-neighbour verdict 2/9),
  so a stretch must lie STRICTLY between — ≥ 0.25·step from both rank−1 and rank+1 lines over its
  length, except where they converge — or the judge reopens the closed-on-a-neighbour trap.
- open-lines-global objects, with data: strict-between was their first `onNeighbour` and flooded
  Memoir B. In stepped grading one line is drawn for a PAIR of sizes and ranked to one of them, so
  the other size honestly lies on its "neighbour" over 168–390 mm (SKIRT BACK 12/20/22/26/28, TOP
  A/B/C, J). The distinguisher they and f3 agreed earlier is pile-up (≥ 3 ranks on one line, or the
  family not paired elsewhere), not distance. OPEN between f3 and open-lines-global; on-neighbour
  stays diag only. `judgeNest` (pieces/nest-judge.ts) already takes whole closed outlines; its lim
  max(10, 3·step·gap) cannot see a 2–3 mm miss — a fine `lim` option is being added (pure, tested).

## 16 Nov 2026 — Failure map (offline: m-glocal = set40, h-glocal = holdout40; no shoots)

Open cells by first reason (set40 1068 of 4752 / holdout40 486 of 3052):

| mechanism                                                                | set40 | holdout40 | ink on paper along pred (ink-check 13 Nov, set40) |
| ------------------------------------------------------------------------ | ----- | --------- | ------------------------------------------------- |
| A edge size, no neighbour on one side (`not-bracketed`)                  | 375   | 167       | 63 %                                              |
| D own line not along the prediction (`E1-cover`)                         | 312   | 131       | 90 %                                              |
| E own line with holes (`E2-*`)                                           | 174   | 41        | ~90 %                                             |
| F drawn stretch refused (`E3`/`E4`)                                      | 41    | 9         | 75–95 %                                           |
| B sizes not told apart (`merged` 66/56, `sizes-not-distinguished` 54/45) | 120   | 101       | —                                                 |
| C no model / tiny                                                        | 46    | 37        | —                                                 |

- Blank paper is rare: ink-check `no-ink` 27 of 517 (5 %), and those were mostly wrong predictions.
  The probe re-split (ranked ink only) found other-rank ink on 26 % / 11 % of the missing length,
  so the rest is ink that is on the paper but ranked to NO size (unranked or lost to chains).
- The reader is lossless (render ≈ IR on every file, 13 Nov); nothing to fix there.
- Wrong closes the counter does not see: 145 candidates on set40, 41 confirmed.
- Pieces with every size closed: set40 62 of 329, holdout40 170 of 276.
- Files: DXF written set40 2 / 40, holdout40 6 / 40. Of the stopped files, set40: 15 stop on other hard
  reasons (offset-hull, duplicate identity, fold list, …), 11 only on operator questions (grain,
  fold), 7 on lines, 5 with no piece blocked (sheet/sizes/check step); holdout40: 4 / 7 / 7 / 16.
  Closing every line does not by itself produce DXF files; the other stops are a separate track.

### C1–C3 — PARKED (16 Nov 2026)

Hypothesis: the three open-line mechanisms in the failure map can be accepted without widening the corridor or closing on a neighbour — an edge size one step past its anchor, a family whose own scatter sets the corridor, and a chain no size owns.
Change: each behind its own flag, off by default (`GFIT_EDGE_ACCEPT`, `GFIT_LOCAL_CORRIDOR` on top of `GFIT_LOCAL`, `GRADE_P2_LOOSE`). `pieces/gfit/repair.ts`, `repair-hook.ts`, `pieces/fill.ts` (`looseWallIds`), `types.ts` (`RepairRecord.local.scatterMm`). Tests: `pieces/gfit/repair-flags.test.ts`. Flag off leaves the old result; the edge still refuses two steps out and with fewer than three anchors; the corridor never reaches the neighbour (`E5-nest`, and `E5-on-anchor` when the edge close is the neighbour's line); a loose chain counts only inside the corridor and at least a quarter step from both anchors.
Run: `npx vitest run src/lib/pattern-import`, `yarn build:check`, `npx eslint` and `npx prettier --check` on the changed files, `yarn test`. No archive run from this change.
Numbers: not re-measured here. The wdall dump already in `cursor-tasks.md` puts C3 first (set40: 244 open sizes at 1.5 mm, 330 at 3 mm, whose pred is covered by own + unranked ink but not by own ink alone).
Verdict: PARKED. Code for all three is in, flags off, behaviour unchanged until one is set. Not accepted — the flags have not been turned on over the corpus.

## 16 Nov 2026 — wdall: unranked ink along the open sizes (owner's OK, one run, both lists)

- Run: `walls-dump.mjs` with `WD_ALL=1 GFIT_LOCAL=1` over set40 + holdout40.
  - Output: `/private/tmp/patimport-runs/wdall-{m,h}`.
  - Analysis script: scratchpad `wdall-map.py`. Along each open size's pred (1 mm samples), it takes
    the nearest ink within R and classes it as own/common, another size's, unranked (no size and not
    common), or none.
  - Caveat: Cursor edits to `pieces/fill.ts` landed in the working tree during the run. They are
    flag-gated and off, but the run is not on a clean tree.
- Length share, set40 at R 1.5 mm (own / unranked / other / none):

  | bucket   | own | unranked | other | none |
  | -------- | --- | -------- | ----- | ---- |
  | edge     | 47  | 18       | 6     | 28   |
  | E1-cover | 55  | 21       | 2     | 23   |
  | E2 holes | 80  | 13       | 1     | 7    |

  Holdout40 is close: E1-cover 55 / 20 / 4 / 22.

- Sizes closable once unranked ink counts:
  - Definition: own + unranked ≥ 95 % of pred, while own alone < 95 %.
  - set40: 244 at R 1.5 mm, 330 at R 3 mm (1068 open).
  - holdout40: 72 at R 1.5 mm, 114 at R 3 mm (486 open).
- Own ink alone already ≥ 95 % but still refused (E2/E4 details): set40 80–130, holdout40 17–37.
- Remaining "none" (E1-cover 13–23 %, edge 18–28 %): ink-check found ink on the paper there. So this
  is mostly prediction error (2–3 mm in inconsistent families) or chains dropped before the walls,
  not blank paper.
- Priority set: C3 (unranked lines) first, then C2, then C1 (`cursor-tasks.md`).

### R2 + O1 — PARKED (16 Nov 2026)

Hypothesis: loose ink is safe only where the prediction is trusted to a step, and a hull collapse is a real block only when it bridges a bay wider than two allowances.
Change: `GRADE_P2_LOOSE` skips loose walls on an extrapolation or a `GFIT_LOCAL` pair, snaps them only inside the base corridor, and drops a used loose wall that leaves the corridor for more than 10 mm. `GFIT_LOCAL_CORRIDOR` also refuses a 20 mm run of the result on an anchor. `OFFSET_HULL_POCKETS` (off by default) demotes a hull collapse whose bridged pockets are narrower than `2·(allowance + 0.2)` mm; `offsetContour`, the fold offset and G6 call the same helper. Readouts: `looseSkipped`, `looseShare`, `looseDropped`, `local.scatterGap`.
Run: `npx vitest run src/lib/pattern-import`. No archive run.
Numbers: none.
Verdict: PARKED. C2 cannot change anything where s ≤ 3 mm and adds at most 0.2s − 0.6 above that, so a small set40 delta is expected, not a bug. How many sizes R2.1 costs is `looseSkipped` on the next owner-gated run.

### Nest walk from one etalon size (`pieces/gfit/nest-walk.ts`) — PARKED, acceptance (a) fails on every Leah piece (17 Nov 2026)

Hypothesis: one clean, fully-own size (the etalon) plus a walk of its landmarks outward through the size nest, onto own/common lines only, rebuilds every size; the holes are interpolated between measured neighbours.
Change: new `src/lib/pattern-import/pieces/gfit/nest-walk.ts` (etalon pick, landmarks, walk, outline), `nest-walk.test.ts` (7 synthetic tests, green), offline check `scripts/pattern-import/nest-walk-check.ts`. Pipeline hook: see the "Wired after all" bullet below. Debug: `NEST_WALK_DEBUG=1` prints `NW corner` / `NW side`. Scratch tools in `/private/tmp/nw/` (`dbg.ts` SVG of one size, `floor.ts`, `report.txt`).
Run: `npx vite-node scripts/pattern-import/nest-walk-check.ts /private/tmp/patimport-runs/leah-pen/2-A4-MDF-349-The-Leah-Shift-Dress-00-32-` (single file, `SHOT_ROWS=1` shot). `npx vitest run src/lib/pattern-import/pieces/gfit/nest-walk.test.ts`.
Numbers (Leah, (a) leave-one-out p95-of-p95 / max mm; worst landmark):

| piece               | etalon | (a) p95 / max | worst at        | (b)  | (c)               |
| ------------------- | ------ | ------------- | --------------- | ---- | ----------------- |
| E skirt front       | 8      | 152 / 152     | 32, #308 arc    | FAIL | pass              |
| A top back          | 20     | 27.2 / 59.8   | 00, #33 arc     | FAIL | pass              |
| D skirt back        | 12     | 8.29 / 14.6   | 00, #99 arc     | —    | pass              |
| F front neck facing | 12     | 5.16 / 16.8   | 16, #54 corner  | FAIL | pass              |
| C sleeves           | 16     | 2.66 / 12.8   | 00, #255 arc    | FAIL | pass              |
| G back neck facing  | 0      | 2.05 / 3.28   | 20, #111 corner | FAIL | FAIL (10, 12, 24) |
| B top front         | 16     | 1.63 / 8.98   | 12, #149 arc    | FAIL | pass              |

Open cells built: 13 of 17 get a ring; 7 of those are refused self-crossing; derived share 2–73 % (F/G facings 30–73 %).

- Interpolation floor, measured as distance to the hidden size's own outline (`/private/tmp/nw/floor3.ts` … `floor9.ts`): Leah's steps are even on average (chord fraction 0.50 for every size) but change by size range per landmark (D, one landmark: 6.3 mm for 0–8, 9.5 for 10–14, 12.7 for 16–24, 14.5 for 26–32). The even split misses by half the jump at a range boundary: p95 E 3.16, G 1.97, B 1.36, A 1.16, D 1.02, F 0.76, C 0.68 mm. The walk's own measured points sit on their outlines (p95 0.22–0.25 mm), so this is the interpolation, not the walk.
- Owner, 17 Nov: interpolate along the neighbours' step pattern, keep the 0.5 / 1.5 mm bar. `regrade()` in `nest-walk.ts`: for a skipped r with r−2, r−1, r+1, r+2 measured, the chord T = s*r + s*{r+1} is 2·s*{r−1}, 2·s*{r+2} or s*{r−1} + s*{r+2}; the case that fits within `breakFitMm` 0.5 and beats the next by `breakMarginMm` 0.6 wins, else the even split. Arcs are graded on the normal only (they slide along the line); corners as vectors. Floor after: E 0.24, D 0.24, F 0.73, C 0.76, G 0.85, A 0.95, B 1.03. Oracle (best of the four predictions, picked after the fact): A 0.49, B 0.52, C 0.46, F 0.61, G 0.54 — so on A/B/C/F/G the steps are irregular size to size (C ±0.5 mm sawtooth, B 1–2 mm) and no neighbour-step rule reaches 0.5 there. Taken from: tried without the normal projection (C, B worse), without the fit gate (C 0.68 → 1.2), and with a vote over ±W landmarks on the edge (no change).
- With `regrade` in the walk (`only` now runs two sizes past the target so r+2 exists): D leave-one-out size 8 1.56 → 0.25 p95; C open size 18 (b) 0.51 (0.47 with arcs-only). Per-piece (a) unchanged — it is set by walk failures at the card ends (00, 28–32) and D 20, not by interpolation. New unit test: a missing size at a range break (1.77 mm without `regrade`, < 0.3 with).
- References are dirty: 36 of 74 Leah "common" chains are also ranked to one size; unranked common chains are sometimes one size's line (D c3194 = size 18 hem); some closed cells run on other sizes' lines (B 00 shoulder on c299/c3085/c304 instead of c292). Leave-one-out skips cells with own+pure-common share < 98 %.
- E: per-size lines are labelled common, so the own-preferred snap rides the wrong size at 28–32 (152 mm).
- Wired after all: `repair-hook.ts` `nestWalkPass` runs at the end of `repairPass` on the leaks the repair left (on by default, `GFIT_NEST_WALK=0` off; always on in the browser). Written as a closed cell, `rankFrom: 'repair'`, `repair.walk.etalon`, derived stretches as flagged `'grade-draw'` edges, refused over 15 % derived. Leah single run (`dxf-shot.mjs --files leah.txt`): closed 3 more cells (A 24, B 24, G 12), no closed cell changed.
- Those 3 cells were wrong: the walk with own lines visible traces them, so the outline looks fine; blind to them it misses by p95 2.46 / 1.78 / 2.75 mm (max ≥ 3, the search radius), and G 12 is smaller than G 10. Gate added before writing: the cell is rebuilt with its own lines hidden and must land on them within `NEST_WALK.blindP95Mm` 0.5 / `blindMaxMm` 1.5 (`linesToRing`, 3 mm), and its area must lie between its closed neighbours' (`walk:blind`, `walk:area-order`). Leah after the gate: all 3 refused, the import is the same as with `GFIT_NEST_WALK=0`. UI check on SS26-050 (card S–XL): the card takes file sizes 00–4 only, which had no open cell, so nothing differs on screen either way. Note: the fill does not know the card, so "the etalon is a card size only" is not enforced in the pipeline yet (`outOfCard` is never set) — Leah's etalons 8–20 are outside an S–XL card.
- Owner correction (17 Nov): the walk is the MAIN build, not a fallback. `nestWalkPass` now runs first in `repairPass`, on every seed: etalon over every file size, every size built; a closed size is 'confirmed' (walk within `NEST_WALK.confirmP95Mm` 0.5 of its own outline, kept) or 'disagree' (kept, flagged on `PieceCandidate.nest` + a piece note in semantics/build.ts with the landmark nearest the worst point); a leak gets the walk's outline under the gates above. repairSize runs only on seeds with no etalon (and stays as G26's neighbour path); a walk-built size G26 holds is undone (`walk:g26-held`). The card mapping is applied after, as before (semantics only exports card sizes). `cells.json` carries `nest`. `repair-flags.test.ts` pins `GFIT_NEST_WALK=0` (it tests repairSize).
- Leah single run (`/private/tmp/nw/shot-main`), per piece — etalon · confirmed / disagree / unchecked (built ring refused) · open with walk off → on:
  E 8 · 2 / 4 / 9 · 1 → 2 (12 `walk:blind` — repairSize had closed it, 26 self-crossing);
  A 20 · 0 / 3 / 11 · 3 → 3 (18, 26 self-crossing, 24 blind 2.46);
  C 16 · 11 / 2 / 3 · 1 → 1 (18 self-crossing);
  D 12 · 6 / 7 / 4 · 0 → 0;
  B 16 · 0 / 4 / 11 · 2 → 2 (18 self-crossing, 24 blind 1.78);
  F 12 · 6 / 4 / 3 · 3 → 4 (22, 26, 30 derived-share — repairSize had closed 30, 24 self-crossing);
  G 0 · 2 / 4 / 5 · 6 → 6 (12 blind 2.75, rest self-crossing). Open 16 → 18, built 0.
- Read: the walk's full-nest ring self-crosses on most sizes (A, B 11 of 17), so it cannot check them, and its disagreements match the leave-one-out failures (D 00 26 mm, E 22–24 51–58 mm, B/A 28–32) — walk errors, not wrong closures; they cannot be told apart until the walk holds at the card ends. Owner's E 16–20 example: 16, 18 unchecked (self-crossing), so not caught.
- Owner decision (17 Nov, second): the walk may only ADD closures — repairSize tries every leak the walk refused (`nest.why` kept); a walk-built size G26 holds is undone and handed to repairSize. 'disagree' stays in `cells.json` only (piece note removed). Leah single run: open 16 → 16, E 12 and F 30 closed by repairSize after `walk:blind` / `walk:derived-share`.
- Self-crossing, hypothesis "independent per-landmark snapping breaks the ring order". `NestSizeOut.src` (per point: span j, path/guide, line). Dumped on the pipeline's own inputs (`ctx.own`/`ctx.common` differ from `rows.json`: offline A 18 and B 18 do not cross at all). `/private/tmp/nw/xing.ts` (SVG), `xall.ts` (every size). A 18: corner #359 'replaced' (settled from its edges' arcs) sits 1 mm short of where the hem's own line ends; the hem span runs past it and the ring touches back — CONFIRMED. B 18: guide span #322 → #323, each 0.5 mm sample snapped to the nearest line, hops between two lines 0.3–0.7 mm apart — CONFIRMED (sample-wise). G 10: all 3 (8 on pipeline inputs) crossings lie on the size's own drawn chains c3058 / c2997, which cross themselves (seg i × seg i+2: a dash run joined out of order) — REFUTED, the walk traces the drawing. Every self-crossing size on Leah (56): corner not measured 26, guide snap 36 (hops lines 22, one line 14), path along a line past its neighbour 15, paths on two lines 8, the drawn line itself 7 (one size can have several).
- Drawn-line self-crossings (owner, 17 Nov): `cutLoops` on the edge path — loop ≤ `loopKeepMm` 10 kept as read geometry, > 10 the edge is a gap (derived). ringCheck still refuses a crossed built ring. The 7 sizes of the previous dump, re-read after edge correspondence on the pipeline inputs (`/private/tmp/nw/dump`), with chain ids matched to `rows.json`:

  | piece        | size               | at (mm)                                          | loop mm          | action          | chains at crossing                 |
  | ------------ | ------------------ | ------------------------------------------------ | ---------------- | --------------- | ---------------------------------- |
  | A top back   | 10                 | 187.22,1222.84 … 80.39,1167.00 (6 pts)           | 4.0–4.5          | cut             | c2981                              |
  | A top back   | 26                 | 26.08,1056.61                                    | 0.2              | cut             | c562 + common400                   |
  | A top back   | 26                 | 204.89,1221.21 … 63.32,1147.53 (13 pts)          | 3.0–4.0          | cut             | c2983                              |
  | B top front  | 10                 | 619.59,731.89                                    | 0.2              | cut             | own1 (unmatched) + c2930           |
  | B top front  | 26                 | 808.58,1198.36 … 732.43,1274.50 (12 pts)         | 3.0–3.8          | cut             | c3090                              |
  | B top front  | 0                  | 894.98,1072.31                                   | 0.4              | cut             | common526 + c384 + common358       |
  | C sleeves    | 0                  | 143.37,472.10                                    | 1.1              | cut             | c2947                              |
  | C sleeves    | 20                 | 87.75,472.25                                     | 0.4              | cut             | c1511 + common455                  |
  | F front neck | 14/16/18/20        | 731.58,322.59                                    | 0.4              | cut             | c1814 + c1764                      |
  | F front neck | 22/24              | 724.82,320.59                                    | 0.5              | cut             | c1754 + c1763                      |
  | F front neck | 26                 | 646.63,128.33 / 634.05,120.07                    | 4.0 / 3.0        | cut             | c3043                              |
  | G back neck  | 10 (pre-edge dump) | 1306.54,316.63 / 1311.40,309.33 / 1326.47,279.30 | 6.9 / 11.8 / 9.4 | cut / gap / cut | dump own[14] (= c2997 by geom)     |
  | G back neck  | 10 (pre-edge dump) | 1273.53,159.93 … 1273.59,233.84 (5 pts)          | 6.8–13.7         | cut/gap         | dump own[18] (= c3058) ± common384 |

  After edge correspondence G's built sizes report 0 drawn-line loops (those edges went to gap or a different line). No loop > 10 mm survived into a kept path. Upstream: c2981, c2983, c3090, c3043, c2997, c3058 look like dash runs joined out of order (seg i × seg i+2).

- Edge correspondence (owner point 3): search corners / darts / notches only; edge = `traceEdge` along own/common; arcs by arc-length fraction; no path → interpolate neighbours' same edge else deform etalon (derived). `searched` stub flipped on. Synthetic test threshold 0.2 → 0.25 (resampling). Offline gate after point 3 on pipeline dumps vs `report2.json` baseline: **STOP** — built-ring self-crossing still 12 sizes (A 4; C 4,18,28,30,32; B 00,30; F 00,0,4,18); leave-one-out p95 worse on almost every closed size (E 4 0.35→25, A 00 27→78, C 00 2.2→17, D 4 0.21→20, B 12 1.0→16.5, …). Remaining crossings are not drawn-line loops: corner/arc of adjacent edges meet at u≈0/1 on the simplified ring, or an extrapolated arc path zig-zags (C 30). Point 4 (anchors) not started.
  - Point 4 (anchors): closed sizes → corners from `nestCorners` + `matchCorners` to the etalon (ring-order rotation); open/hidden → lerp by `parseSizeToken` step between nearest anchors; one size past the last anchors extrapolated, further refused. Edges: `traceEdge` when the line exists, else blend the bracketing anchors' same edge (bulge about this size's chord — regrade on corners still moves the outline); deform the etalon only with one side. `NestSizeIn.step` added. On E every closed size matches 4 corners (anchors); 12 and 26 stay open. Offline gate (`/private/tmp/nw/gate4.json`): **STOP** — E hidden 4–20 still has sizes above 1 mm (6: 1.02, 14: 4.24, 20: 12.71). E 4: 0.22 and E 16: 0.16 are fixed (built≠etalon: built-vs-etalon p95 82 mm, built-vs-real 0.16). SVG `/private/tmp/nw/E16-anchor.svg`. Self-crossing 2–15 per piece. E 14/20 are not the old etalon-stick; matching or the blend across the open 12 (for 14) / a bad neighbour is likelier.
Verdict: PARKED at the stop after point 4. Anchors fix E 4/16; E 14/20 and self-crossings remain. Owner decisions (17 Nov): derived stretches are written flagged, no operator confirmation; a cell with derived > 15 % of its perimeter is refused; the etalon is a card size only. Next: the walk's failures at the card ends (A 00, E 28–32, C 00) and D 20, before any pipeline hook.
  Lesson: grade by size range is per landmark; interpolate by the neighbours' steps on the normal, and expect ~0.5 mm p95 as the floor where steps are irregular.

- Post-point-4 (owner, 17 Nov): stepped interp (`breakFitMm` 0.5 / `breakMarginMm` 0.6 — outside-interval steps, one break in the gap) + anchor validation (demote wrong closures) + A/B provenance dump + self-crossing classification. No pipeline change, no commit.
  - Stepped: E14 LOO hem lands on 1075.7 exactly (even split was 1080).
  - Demotion: leave-one-out + both-sides agree ≤1 mm & err >2; stuck/duplicate outline corner (E22 hem = E20) with looErr >10; one worst per round ≤3. Demoted ranks excluded from gate LOO truth.
  - Leah gate5 (`/private/tmp/nw/gate5.json`): **STOP — GATE FAIL**
    - Demoted: **E22** (corner #0, err 30.75, predLo/predHi disagree 10.5 — stuck on E20 hem). Also A10/A4/A22 (2.5–3.5, both-sides agree — match noise?), B12/B20/B22, G16. E30 not demoted (one-sided preds disagree; suspected, LOO 21.7).
    - E20 LOO after E22 demotion: **0.22** (was 12.71).
    - A/B dump 00/4/8: with both anchors, corners interpolated and edges traced/blended — **no etalon-with-both-anchors bug**. 00 (and B4) are below the anchor run → extrapolated + etalon edges (allowed).
    - Self-crossing sizes (no fix): E2 A16 C12 D6 B12 F7 G14. Classes (crossing counts): mostly `traced-edge`, then `near-corner` / `blended-edge`; few `extrapolated`.
    - LOO p95 still worse than report2 on many sizes (E24/28/30/32, A/B card ends, …). Self-crossing ≠ 0.

- Post-gate5 (owner, 18 Nov): blend gap double-emit was the self-crossing root cause.
  - `buildSizeEdges` blend now fills only (s0,s1): f=(s0+u·(s1−s0))/G.total on both anchors, chord ends p0/p1, etalon-style shift. Head/tail overlap dump on A2/B12/G16: **no** s0≥s1−1 on those sizes (overlaps exist elsewhere: A9/14/16, B3/10/16, G3/16) — trim not applied.
  - Demotion per corner; whole size only if fails≥2 or ≥25% (4-corner piece → 1 counts as whole). Report failCorners.
  - Gate6: **STOP — FAIL**. traced×blended-same and traced×traced-same → **0**. Remaining crossings are near-corner. Self-crossing sizes: E1 A4 C6 D3 B3 F2 G2 (was E2 A16 C12 D6 B12 F7 G14). Demoted: E22 WHOLE (fails 1); A10/4/22 and B12/20 corner-only; B22 9.8 mm not demoted (agree 0, not both-sides). LOO worse than report2 still on many sizes — not investigated (E24/28/30/32, A/B ends deferred).

- Post-gate6 (owner, 18 Nov): full-edge blend B(u)+emit u0..u1; near-corner cut; demotion ≥2 OR stuck≤1; B/D4 dumps.
  - Blend: gate5 B(u)=Ar→Br+bulge; project p0/p1 → u0..u1; emit only that. Endpoint shift only if both ends already ≤0.5 mm from B (free shift warped C +2 mm). C4/24/28 back to gate5 ±0.1; traced×blended stays 0.
  - Near-corner cut: snaps A2 C1 B1 G1; remaining xings still near-corner; nearCornerLong empty (wrap i×i+2 not always caught).
  - Demotion: E22 WHOLE stuckDist 0; G16 corner-only stuckDist 3.29; A10 WHOLE stuckDist 0.11.
  - B non-anchors: corner-count ≠ etalon 5 (00:8, 0–4:7, 26:6, 30–32:7). D4: corners ≤0.42; worst edge 102→158 blended p95 2.13; ring p95 2.12.
  - Gate7: **STOP — FAIL**.

- Post-gate7 → Done (owner, 18 Nov): etalon transfer by per-point normal / interior ring blend; K1–K5.
  - Method shift: interior open/hidden sizes built as a weighted blend of the two bracketing
    anchor rings (paired lerp @0.5 when corner counts match + nest gap >20 + area OK; else
    insert/primary by corner match; size-step weight for insert). Own/common lines only in
    corridor; etalon deform only one-sided. Demoted ranks never anchors (LOO or build).
  - Demotion: whole size if ≥2 failing corners, or one failing corner stuck ≤1 mm on a neighbour
    with err ≥ max(5 mm, half local step). E22 WHOLE (hem stuck on E20, err 30.75, stuckDist 0)
    dropped from anchors — E24 LOO anchors read `20…28`, not `22…28`.
  - Gate K1 (`/private/tmp/nw/gate-d1.json`, leah-v4 dumps): **PASS** — interiorFails 0 on every
    piece (A–G). Self-crossing rings refused (counts: A3 C4 D3 B6 F1; E/G 0). Unconfirmed ≤2/piece
    not counted as fails. Floor mid(adj) sets the bar; walk ≤ floor+0.2.
  - Pipeline K2 Leah (`k2-off` vs `k2-on`, `GFIT_NEST_WALK=0` vs default on): open **16→16**,
    0 regressions (every =0 closed cell stays closed with the same contour). Walk tried every
    interior leak and refused all: derived-share 8 (E26 A18/24/26 C18 B24 G22/24/26),
    self-crossing 2 (B18 G12), crosses-own-line 5 (F22/24/26 G10/18). Closures by walk: **0/16
    (0%)**. Stop rule: after K1, walk closes <50% of Leah interior opens — no further K2 tuning.
  - K3 Cassandra/Dyanna: not run (early stop). K4: unit tests in `nest-walk.test.ts` (shift,
    neighbour-fill, demotion, no double edge, subset matchCorners, wrap-around crossing,
    blend). `repair-flags.test.ts` keeps `GFIT_NEST_WALK=0`. K5: this entry; env list in
    `src/lib/pattern-import/CLAUDE.md` (`GFIT_NEST_WALK`, `NEST_WALK_DEBUG`).
  - Dead end: offline LOO/blend hits floor, but the pipeline gates (derived-share ≤ drawMaxShare,
    blind, self-crossing, crosses-own-line) refuse every Leah open cell the walk builds. Raising
    those thresholds is outside the allowed set.
  - Missing etalon corner (not hidden): B, ~(740, 1298), sizes 26/30/32.
