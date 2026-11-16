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

| share p95 > 2 mm / > 5 mm | A scale largest | B nearest fitted | C interpolation |
| --- | --- | --- | --- |
| inside the run, 20 mm | 5.4 / 1.4 % | 3.3 / 0.6 % | 1.6 / 0.0 % |
| inside, 40 mm | 12.6 / 7.8 % | 6.4 / 1.6 % | 3.0 / 0.6 % |
| inside, 80 mm | 27.5 / 19.6 % | 11.1 / 4.3 % | 4.8 / 1.6 % |
| edge size (C extrapolates), 20 mm | 4.9 / 1.6 % | 3.0 / 0.7 % | 2.0 / 0.0 % |
| edge, 40 mm | 10.2 / 5.6 % | 5.6 / 1.6 % | 4.6 / 1.6 % |
| edge, 80 mm | 22.0 / 14.5 % | 10.9 / 4.3 % | 6.6 / 3.0 % |

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

| variant | steep → gone | steep still drawn | clean kept | clean LOST |
| --- | --- | --- | --- | --- |
| bracketing pair (r1, r2) | 16 | 5 | 49 | 0 |
| every anchor (`ins`) | 20 | 1 | 49 | 0 |

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

| bucket | tries | D-cross is the only refusal |
|---|---|---|
| (a) an own line has a free end ≤ 12 mm from the hole end (reading / joining) | 53 | 8 |
| (a2) the prediction runs ALONG the wall and turns at the hole end (a corner read as a crossing) | 48 | 14 |
| (b) crosses an interior line (dart / notch / grain) | 19 | 2 |
| (c1) crosses a nest outline (common line) | 28 | 4 |
| (c2) crosses an overlay | 5 | 1 |

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

| variant | drawn back of 26 | lost |
| --- | --- | --- |
| A end allowance 6 mm | 16 | 0 |
| B fan (crossed outline turns along the stretch) | 8 | 0 |
| A + B | 18 | 0 |
| C corner ≤ 6 / 10 / 15 mm | 12 / 14 / 19 | 0 |

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

| verdict | cells | meaning |
| --- | --- | --- |
| ink-present | 400 | render and IR both ≥ 0.8 along pred |
| partial | 48 | ink on part of the stretch |
| off-page | 38 | whole stretch inside text boxes, not judged |
| no-ink | 27 | render at r = 3 < 0.3, IR the same |
| reader-loss | 4 | render − IR ≥ 0.2 — all false, see below |
| clip-extra | 0 | IR − render ≥ 0.2 |

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

| under pred (210 holes) | cells | meaning |
| --- | --- | --- |
| other rank | 100 | the line is there, ranked to another size |
| mixed own / other | 46 | part own, part foreign |
| nothing | 34 | no chain; ink usually exists → lost before chains, or pred wrong |
| own rank | 22 | own chain present; lost later (fill / link) |
| unranked | 8 | chain dropped as furniture / classify |

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

| group | cells | test |
| --- | --- | --- |
| risk:area | 0 | pred area outside ×0.97 / ×1.03 of the nearest closed smaller / larger size |
| pred-off | 41 | an own-rank chain runs ≤ 5 mm beside the stretch and covers < 50 % of it: the own line is beside pred, a borrow would anchor on the wrong line |
| neighbour-line | 53 | ≥ 20 % of borrowed points lie on chains no other CLOSED size runs on (sharedBy < 2) |
| real shared | 31 | ≥ 80 % of borrowed points lie on chains ≥ 2 other closed sizes run on (≤ 0.3 mm) |

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

| probe | drawn | hint, 1 step out | hint, ≥ 2 steps out |
| --- | --- | --- | --- |
| rank probe, 210 | 123 (other 63, mixed 28, own 15, none 9, unranked 8) | 53 (other 24, mixed 15, none 11, own 3) | 34 (none 14, other 13, own 4, mixed 3) |
| sim closes: real shared / neighbour / pred-off | 23 / 38 / 33 | 6 / 9 / 6 | 2 / 6 / 2 |
| split-why, 28 | 21 | 5 | 2 |

The findings rest on drawn cells; `none` concentrates in extrapolated hints (14 of 34 at ≥ 2
steps). pred-off on drawn cells is mostly an ordinary gap (26 of 33 have own line ≤ 1 mm), not a
misplaced pred — consistent with dropping the pred-off-bundle refusal.

### co-drawn ≠ accompanied (splitShared companion excusal) — DROPPED (14 Nov 2026)

Scratch replay of `splitShared` (same inputs as the diagnosis above: corner-probe chains, pre-landEnds,
reach 16.8 mm, `sectioned` unknown). Rule tried: a companion whose contiguous overlap ≥ 15 mm has median
distance ≤ T (0.3 / 0.5 mm) is co-drawing and does not count as accompaniment. A: any co-drawn companion
excused; B: only if the co-drawn set brackets the hole's size (side effects: max − min ≥ 2).

| mode | gains (of 25) | new splits, all chains | len ≥ 100 / 30–100 / < 30 | span ≥ 4 | own rank ≤ 5 mm beside | touching |
| --- | --- | --- | --- | --- | --- | --- |
| 0.3A | 0 | 810 | 351 / 293 / 166 | 785 | 7 | 1 |
| 0.3B | 0 | 804 | 343 / 297 / 164 | 780 | 7 | 0 |
| 0.5A | 0 | 823 | 351 / 297 / 175 | 797 | 10 | 0 |
| 0.5B | 0 | 817 | 343 / 299 / 175 | 792 | 10 | 0 |

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
  a measured 15 mm, and the concave waist makes the far ring the *smaller* area, so growth passed
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

## 16 Nov 2026 — Triage of the 1086 open cells of `baseline-set40` — DIAGNOSIS (branch `open-lines-global`)

Run: `/private/tmp/patimport-runs/baseline-set40/` (dxf-check 3666 / 4752 closed, 1086 open; Glinda
stops on the sheet — no families, not in the 4752). Read-only on `run.json` / `cells.json`. Scripts
(scratch, to be moved with the tools in task 3): `triage.py` (buckets by outcome, first reason,
draw refusal, the size's place among the closed sizes), `fit-triage.ts` (re-runs `fitFamily` with
`GFIT_TOL_PDF` offline on the closed `class` outlines of every family with an open cell),
`fitprof.py` (profile of those fits). The offline fit reproduces the run: 93 of the 97 families the
run calls `no-model:inconsistent` are `inconsistent` offline too (4 get a model).

| group | bucket (first reason) | cells | files | where |
| --- | --- | --- | --- | --- |
| G | `no-model:inconsistent` | 307 | 33 | Emma 25, Dyanna 22, Madison 22, Memoir A 19 |
| G | `not-bracketed`, closed sizes on BOTH sides (neighbours not trusted by the fit) | 129 | 27 | Verona 13, Memoir A 11, Kalla 12, Ophelia 12 |
| D | `E1-cover`, draw refused `D-share` | 109 | 22 | Paris 13, Reims 11, Dyanna 9, Memoir C 9 |
| D | `E1-cover`, other draw refusal | 36 | 15 | Cassandra 6, Memoir A 6 |
| D | `E2-hole*`, draw refused `D-cross` | 61 | 19 | Opal 6, Paris 6, Kalla 5, Memoir 5 |
| D | `E2-hole*`, other (`E4` 17, end-offset 7, `D-cross-nest` 6, `E3-*` 7, `D-cross-wall` 1) | 38 | — | |
| D | `E4-off-corridor` / `E3-*` first | 37 | 10 | Opal 8, Kalla 9 |
| X | `not-bracketed`, edge size, 1 step past the last closed | 38 | 24 | spread |
| X | `not-bracketed`, edge, 2 steps | 24 | 15 | |
| X | `not-bracketed`, edge, ≥ 3 steps | 66 | 10 | Kalla 16, Verona 9, Reims 8, Fawn 7 |
| P | piece open in EVERY size (leak `not-bracketed`) | 88 | 5 | Selenite J/K/L/M 36, Venice J POCKETS 18, Opal 14, Madison 12, Fawn 8 |
| P | `merged` in a piece open in every size | 56 | 3 | Madison H/I 24, Opal B/IC 22, Fawn "L - 2XL" 10 |
| R | `refused: sizes-not-distinguished` (whole pieces) | 54 | 2 | Memoir B I/K 36, Kalla A BACK YOKE 18 |
| M | `merged` (piece closes elsewhere) / `tiny` | 37 | 19 | Fawn 10, Kitchen 4 |
| — | `no-model:grade-points<2` / `no-match` | 6 | 2 | Ambrosia C CUPS 4, Soho 2 |

Totals: G 436, D 281, P 144, X 128, R 54, M 37, other 6 = 1086. Concentration: 642 open cells sit
in families with ≥ 5 open sizes; 49 are the only open size of their piece.

Group G in detail (offline fit, families with an open G cell):
- `fitFamily` has a model in 173 families, none in 13 (anchors < 2: 92 cells; grade-points < 2: 7).
- Disagreeing anchors per family: ≥ 4 in 67 families (215 cells), 3 in 31 (122), 2 in 43 (106),
  1 in 18 (61), 0 in 14 (49). It is not "one bad anchor": in 88 cells EVERY anchor disagrees with
  the others.
- No disagreement is `how: 'break'` (no grade break detected) and none has `cause: 'neighbour'`.
- Scores of the 568 disagreeing anchors (residual / tolerance): ≤ 1.25: 94, ≤ 1.5: 81, ≤ 2: 79,
  ≤ 3: 103, ≤ 5: 78, ≤ 10: 75, > 10: 58. A third is marginal (≤ 2 × the PDF tolerance), a quarter
  is gross (> 5 ×: a wrong outline, not reader noise).
- Families at the top are small pieces with few anchors: Verona G BOW (3 anchors of 18, all at
  1.07–1.33), Verona F SASH, Axel G POCKETS (6 anchors, 3 at 1.2–1.3), Kalla G ARMHOLE OUTER
  FACING (one at 49.8), Emma I SKIRT TIER 2 (4 of 4, 3–12), Jolie C RUFFLE (6 of 6, up to 15.7).

Which buckets touch legend-id (first chat's zone): R (sizes not told apart is a size-identity
question), part of P (Fawn's piece labelled "L - 2XL" is a size label read as a piece; Opal "IC :
CUT 2" is text) and any G anchor closed on another size's line (its rank is the reader's). The
geometry-side part of G (marginal scores, few anchors, small pieces) and all of D and X are in
`pieces/gfit` / `pieces/fill`, outside legend-id.

Verdict (first draft, REVISED below): G was named the first target, with a "tolerance relative to
piece size" for the marginal half. The critic (f3) refuted that idea before any code was written:
small pieces grade 1–2 mm per size, so a residual over half a step there looks exactly like an
anchor closed on a neighbour's line; a size-relative tolerance is the parked `GFIT_TOL_PDF` raise in
disguise, aimed where it is least safe. Correction to the line above: `GFIT_TOL_PDF` itself is live
(via `repairTol()`); what is parked is a *raise* of it. f3's order: residuals in grade-step units and
a rank-shift test first, then area order, pictures only of what stays unexplained, then decide.

### 16 Nov, later — G in grade-step units: the rank-shift test

Script (scratch): `shift-test.ts`. For every family with an open G cell (652 cells: the 436 of G plus
the `not-bracketed` edge/P cells of the same families), and for each anchor the fit marks as
disagreeing: refit without it, then measure the p95 distance from its outline to the prediction at
its own rank and at ranks ±1, in units of the family's median grade step. "Shift" = a neighbour rank
fits within 0.5 step while its own rank does not (an anchor closed on another size's line). Only
`interp` predictions are compared — a first pass that also compared `extrap` rings reported 268
"shift" cells; with extrapolations excluded that number is 20. The lesson stands for later tests:
an extrapolated ring is not evidence about the anchor.

| family category (first match wins) | G-family cells | families | top |
| --- | --- | --- | --- |
| disagreeing anchor's own rank is extrapolated — untestable | 167 | 64 | Reims 20, Memoir A 13, Ophelia 13, Axel 11 |
| starved: no model, anchors < 2 | 92 | 12 | Selenite 36, Venice 18, Opal 14, Madison 12 |
| model miss: own interp ≥ 1 step, no neighbour within 0.5 | 91 | 20 | Verona 24, Emma 21, Reims 8, Madison 7 |
| closed-size area order inverted (drop > 0.5 %) | 88 | 20 | Kalla 26, D 11, Madison 8, Memoir A 7 |
| noise: disagreeing anchor within 0.5 step of its interp | 71 | 29 | Kitchen 11, Memoir 9, Lynx 8, Paris 7 |
| between 0.5 and 1 step | 65 | 22 | Olympia 9, Ophelia 8, D 7, Verona 6 |
| model, no disagreeing anchor (open for another reason) | 47 | 13 | Memoir A 8, Venice 8, Nob Hill 7 |
| shift: a neighbour rank fits, own rank does not | 20 | 4 | Jolie 12, Kitchen 6 |
| starved: grade-points < 2 / ungraded step < 0.3 mm | 11 | 2 | Fawn 7, Nob Hill 4 |

Pictures (two of the model-miss class): Emma I SKIRT TIER 2 is a set of long rectangles sharing one
end, graded only at the far end — two grade points, the interpolation draws a step where the
outlines slide; the matcher, not a line, misses. Verona G BOW rank 9 lies outside BOTH rank 7 and 11
— not between its neighbours, the shape of an anchor that closed on a foreign line (or a bow whose
sizes are not drawn nested). Memoir A D SIDE FRONT UPPER rank 14 sits outside the extrapolated ring.

Conclusions:
- "G is mostly a wrong-line problem" is NOT supported: a clean neighbour-rank match is 20 cells.
- The largest testable lever is the noise + between class (136 cells, 51 families): anchors within
  one grade step of where the rest of the family puts them, rejected because the absolute 2.4 mm
  tolerance is below half a step on large pieces. This is the opposite end from the refuted idea
  (large steps, not small pieces), but it is still a tolerance change and needs the critic first.
- 167 cells cannot be judged with this test (extrapolated own rank); 92 + 11 are starvation.
- Area inversion (88) and the model-miss class (91) need pictures, family by family, before any code.

### 16 Nov, later — GFIT_STEP_TOL (grade tolerance tied to the point's own step) — DROPPED before a run

Idea: the 136 "noise / between" cells are anchors within one grade step of their interpolated
prediction, rejected by the absolute 2.4 mm on pieces whose step is ~8 mm. Proposed: `ptStep` /
`edgeStep` = 0.3 on top of `GFIT_TOL_PDF` (per point, so non-grading points stay strict), interior
only. Scripts (scratch): `cond2.ts`, `local.ts`. Agreed bar before measuring: ≥ 30 newly closed cells
with 0 wrong, else no run.

Offline, 129 disagreeing anchors within one step:
- What fires: edge 79, point 50. Of these, 23 are ONE strong grade point off while every edge fits:
  the matcher put a grade point on the wrong corner, and no tolerance should absorb it. These are
  the matcher's to-do list.
- At 0.3, 88 more anchors are admitted. The whole-outline discrimination guard (own interp p95 <
  0.5 × the nearest interp neighbour's) keeps 46.
- Median worst-point residual vs that point's own |δ| is 0.9: locally, the typical admitted anchor is
  almost a full step off, where a neighbour size's line runs. The critic's local guard catches this.
  Every outline stretch over the base tolerance must be < 0.5 × as far from its own ring as from
  the r±1 ring. With it, 11–15 anchors survive (longest violating run 0–3 mm), and the
  violating runs of the rest reach 100–800 mm.
- Families that become consistent with every admission surviving both guards: 6, holding 15 open
  cells — before the D guards.

Verdict: DROPPED, 15 cells is half the agreed floor and an upper bound. The lesson: on this corpus,
an anchor that is "close to its own prediction overall" is usually far from it over a long stretch
that follows a neighbour's line. The absolute tolerance was rejecting real segment-scale wrong
lines, not reader noise. Do not reopen as a step-relative or size-relative tolerance.

### 16 Nov, later — closed-but-wrong: a second number next to "open"

The critic's point: the 3666 "closed" include wrong closes, and nothing counts them (notClosed sees
only open cells). Two probes, read-only on `baseline-set40/cells.json`:

1. Long off-model stretches (the 58 anchors with ≥ 50 mm closer to a neighbour's PREDICTED ring than
   to their own) re-checked against the neighbours' ACTUAL closed outlines (share of the stretch within
   0.3 mm of r±1 / r±2). Most coincide with nothing — the inconsistent model's ring is wrong, not the
   close. The 10 with ≥ 0.57 coincidence (Riverside C r2, Corella B r3/r4, Soho C r6, Madison F/G)
   were drawn: the red outline runs on its own graded line between its neighbours; the coincidence
   is a line every size shares (centre front, top edge). Legitimate common lines, no borrowed line.
2. Area outliers: interior closed cells whose area is > 25 % off the linear interpolation of the
   closed neighbours on either side (neighbours within 40 % of each other). 23 cells (list below).
   Drawn: Verona D SKIRT BACK 24 is closed on the upper part only — cut by an internal horizontal line
   while 22 and 28 close full length; Venice E TOP FRONT MIDDLE 2 and 6 are cut the same way while 4
   is whole (the outlier score flags 4 as well, because its neighbours are the truncated ones). Kalla
   E 0 / G 8 / G 18 are the half-area cells reported to the first chat. So the probe finds real wrong
   closes; it is a lower bound (edge sizes, and wrong closes of near-normal area, are invisible to it).

Closed cells with area off their neighbours' interpolation by > 25 % (ratio, file, piece, size, from):

```
0.27	MDF346-Kalla-Ensemble-	L - SKIRT FRONT SIDE	30	innerPlug
0.41	MDF481-Verona-Sheath-G	D - SKIRT BACK	24	class
0.43	MDF477-Venice-V-Waist-	E - TOP FRONT MIDDLE	2	class
0.44	MDF477-Venice-V-Waist-	E - TOP FRONT MIDDLE	6	class
0.49	MDF346-Kalla-Ensemble-	G - ARMHOLE OUTER FACING	8	class
0.5	MDF404-The-Harper-Plis	D - CUFFS	24	class
0.51	MDF346-Kalla-Ensemble-	G - ARMHOLE OUTER FACING	18	class
0.52	MDF363-The-Memoir-Dres	H - CENTER FRONT LOWER	30	class
0.53	MDF363-The-Memoir-Dres	H - CENTER FRONT LOWER	26	class
0.54	MDF346-Kalla-Ensemble-	E - TOP FRONT	0	class
0.57	MDF346-Kalla-Ensemble-	O - SKIRT FRONT POCKET	0	class
0.59	MDF411-The-Ambrosia-Co	B - FRONT TOP	10	class
0.66	MDF477-Venice-V-Waist-	B - TOP BACK MIDDLE	0	class
0.67	MDF439-Mendocino-A-Lin	E - SLEEVES	S	class
0.68	MDF477-Venice-V-Waist-	B - TOP BACK MIDDLE	6	class
0.7	MDF515-Selenite-V-Wais	I - SKIRT	14-16	innerPlug
1.25	MDF411-The-Ambrosia-Co	B - FRONT TOP	2	innerPlug
1.25	MDF411-The-Ambrosia-Co	B - FRONT TOP	8	class
1.27	MDF439-Mendocino-A-Lin	E - SLEEVES	4XL	class
1.45	MDF515-Selenite-V-Wais	I - SKIRT	18-20	class
1.48	MDF477-Venice-V-Waist-	B - TOP BACK MIDDLE	4	class
1.9	MDF363-The-Memoir-Dres	H - CENTER FRONT LOWER	28	class
2.31	MDF477-Venice-V-Waist-	E - TOP FRONT MIDDLE	4	class
```

Two numbers from now on: open (1086) and closed-but-wrong (≥ 6 confirmed by picture; 23 candidates).
The mechanism seen so far is truncation at an internal cross line taken as a wall.

### 16 Nov, later — closed-but-wrong: the nesting probe and whose lane each cut is

**Question.** The area outlier list sees only cells whose area jumps. Does a geometric test (a
smaller size must lie inside the next larger one) find more wrong closes, and which part of the
code takes the cutting line as a wall?

**Probe** (scratchpad `nest3.mjs`, baseline `baseline-set40`, no code change). For each family with
≥ 3 closed cells: `v(a, b)` = mm of `a`'s outline (2 mm samples) outside polygon `b` by > TOL.
`trunc(c)` = min over the two nearest smaller closed sizes of `v(smaller, c)`; two passes, the
second without cells flagged in the first as references. A family whose median adjacent `v` is
≥ 5 mm is skipped as not nested.

| TOL | families skipped | trunc ≥ 20 | ≥ 50 | ≥ 100 |
| --- | --- | --- | --- | --- |
| 0.3 mm | 199 / 312 | 101 | 76 | 43 |
| 3 mm | 120 / 312 | 130 | 107 | 87 |

0.3 mm is too tight: on 4 random flags of 20–94 mm, all 4 were shared edges with sub-mm grade
jitter (pictures). 3 mm covers more families but brings in families that are not nested along
one edge (Jolie B BACK: sizes cross at the waist; Ambrosia C CUPS cross at the apex).
Split at TOL 3, trunc ≥ 50: 31 families with 1–3 flags (56 cells) and 8 families with ≥ 4 flags
(51 cells). ~~The ≥ 4 group is mostly the probe's artefact~~ — WITHDRAWN (critic): a run of
truncated sizes is exactly the systematic case (Memoir A H CENTER FRONT LOWER 00–16, cut at the
waist-mark ladder, fa) and the split would discard it. Superseded by nest9 below.

Pictures of isolated flags (12 looked at): real — Verona D 24, Venice E 2 / 6, Reims M 24, Harper
D CUFFS 24 (half the cuff: closed on the fold line), Mendocino E SLEEVES S (an arc ~60 % of XS),
Riverside C M (180 mm of the side runs 10 mm inside), Taos D PLACKET 18 (shorter than 16);
not real — Ambrosia C 22, Axel B YOKE 28, Valentina A 4XL, Estoril J BELT 5XL (outlines
coincide). nest3 precision about half — superseded by nest9 below.
List: `/private/tmp/patimport-runs/global-closed-wrong-candidates.json` (107 cells; isolated
first; confirmed ones carry the lane).

**Lane of the cutting chain** (`walls-dump.mjs`, PIECES_OPEN_PASS=1 AUTOPILOT_OUTLINES=1, runs
`/private/tmp/patimport-runs/global-wd-*`; script `lane.py`: chains within 1 mm of the part of
the cell outline that lies > 3 mm inside the smaller size):

| cell | cutting chain | tagged | lane |
| --- | --- | --- | --- |
| Verona D SKIRT BACK 24 | 2708, 438 mm horizontal | `common` | rank / common (fa) |
| Venice E TOP FRONT MIDDLE 2 | 2986, 81 mm | own rank 2, `lone` | rank (fa) |
| Venice E TOP FRONT MIDDLE 6 | 2848, 84 mm | own rank 4, `lone` | rank (fa) |
| Mendocino E SLEEVES S | 1428, 1054 mm arc | own rank 1 | rank (fa) |
| Reims M LOWER SKIRT 24 | 5922, 177 mm | unranked, enters rank 13 via `rescued` | fill (this lane) |
| Harper D CUFFS 24 | 505 … 700, the fold line of ranks 0,3,5,7,9,11,12,15,17 | none in rank 13's walls | unexplained |

**Conclusions.**
- 4 of 6 confirmed wrong closes are a line given to the size (common or its own rank) that is
  an interior line: the rank side, not the fill. One (Reims) is the fill's `rescued` source
  taking an unranked line. Harper needs a trace of the close itself (the dump does not show the
  cut line among rank 13's walls).
- Next on this lane: `rescued` on Reims M 24 — what rescue admits a 177 mm unranked line inside a
  closed size bundle. No change before fa has the list.

**Probe v2 → nest9** (scratchpad `nest6.mjs` … `nest9.mjs`, same baseline, no code change).
- nest6 (stretch distance in grade steps + interior chord; or a deep run of c inside the larger
  size): 98 flags, 0 real in 10 random unlabelled pictures. Lower-side fakes have the missing end
  only 3–7 steps out (rectangle strips with offset sizes, honest crossings). The upper-side test
  blames the wrong cell: c sits deep inside its larger neighbour when that NEIGHBOUR is overgrown
  (Memoir C I SLEEVES 2 took a bigger size's lower arc; Dyanna E SLEEVES 24, fuller cap).
- A one-sided pair test cannot say which of two cells is wrong (Ambrosia B 8 > 10 because 10 is
  cut; Reims M 22 > 24 because 24 is cut). nest9 judges by a bracket: c is judged only when its
  neighbours agree (lo inside hi: no ≥ 20 mm run of lo outside hi deeper than lim). TRUNC = lo has
  such a run outside c; OVER = c has one outside hi. lim = max(10 mm, 3 · step · index gap), step =
  median over adjacent pairs of the pair's p95 distance. Pass 2 skips neighbours flagged in pass 1
  (kills the OVER(j) / TRUNC(j+1) twin a single cut cell produces: 39 → 19 flags).
- set40 baseline: 312 families, 3033 cells judged, 4 unjudged, **19 flagged**. Pictured: 11 / 11
  real (Verona D 24, Venice E 2 / 6, Venice B 0, Harper D 24, Mendocino E S, Taos D 18, Kalla G 18,
  Ambrosia B 10 cut, Ambrosia B 2 garbage outline, Kalla I 24 closed on a smaller size's line) +
  Memoir L SHOULDER 20 undecided. The 9 earlier fake pictures: 0 flagged.
- Recall holes, by construction: a run cut alike (Memoir A H — neighbours agree with each other;
  fa's TICK_THROUGH covers it), edge sizes (no bracket), strip ladders (Reims M 24, Riverside C M,
  Memoir C I 2, Dyanna E 24 missed). nest9 is a precision-first queue, not a recall claim.
- The candidates file now has the `nest9` field and Memoir A H 00/0/8/12/16 (confirmed,
  `cutAtTicks`, fa); 118 cells. Proposed to the critic as the acceptance's second number; the owner
  has not decided the metric.


**Decision (owner, 16 Nov).** Acceptance gets a second number next to `notClosed`:
`scripts/pattern-import/nest-check.mjs <after> --before <before>` — read per cell (new / cleared /
cleared-by-unjudged = not a fix), with flags / judged / unjudged stated, the blind spots stated
(runs cut alike, edge sizes, strip ladders) and media-diff `moved` alongside. Fixture:
`nest-check.mjs --fixture` (27 labelled cells, exact verdicts; a RUN 20 → 1000 mutation fails 10).
