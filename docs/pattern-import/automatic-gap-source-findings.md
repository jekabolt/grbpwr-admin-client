# Source checks for automatic gap recovery

Measured on 19 November 2026. A cell is one piece at one size. A source range can close several cells with the same outline. A garment export has its own checks after pieces.

## Printed ranges in saved wizard runs

Compared the accepted M2 shots with the four saved `live-printed-*` native wizard shots. Matched every cell by PDF, seed, piece label and size. Compared saved vertex arrays for every previously closed cell. The 0.1 mm precision is that of the wizard report.

| PDF | Cells | M2 closed | Native closed | Newly closed |
| --- | ---: | ---: | ---: | ---: |
| Axel | 144 | 118 | 129 | 11 |
| Cher | 288 | 211 | 216 | 5 |
| Verona | 144 | 100 | 124 | 24 |
| Ventura | 234 | 165 | 165 | 0 |

All 810 cells matched identity. All previously closed contours remained closed with identical reported vertices. All four imports stopped at `meaning`. These 40 gains are already attributed to the straight-sided printed-range reader in the [experiment journal](open-lines-journal.md#19-november-2026--printed-size-ranges-on-polygonal-cuts).

## Does the same unassigned stroke recur in several open sizes?

Regrouped the accepted M2 `gap-evidence-check.ts` results by PDF, seed and source chain ID. Each matching chain had a segment covering the measured gap in both directions within 1 mm. Both ends landed within 0.75 mm of that chain. This tests the 608 saved E1/E2 cases and the measured endpoint separations of 1.5–60 mm.

There were 98 distinct seed/chain pairs with an unassigned source match. Four recurred across sizes, affecting six cells. Every recurring chain had competing source strokes at the same gap. Requiring a single source match produced zero recurring chains.

| PDF and seed | Unassigned chains | Sizes | Other evidence |
| --- | --- | --- | --- |
| Memoir A, 8 (G cup 2) | 3055, 5027 | 14, 18 | The same 10 mm stretch also matched nine other-size chains. The cells had nine and twelve gaps. |
| Riverside, 0 | 1266 | XL, 3XL | Both sites also matched assigned ink. The cells had six and five gaps. |
| Penelope, 0 | 159 | 24, 26 | The sites matched six other-size chains. The cells had eight and fourteen gaps. |

This explains why assigning a nearby source chain wholesale is a poor first bet for these three families. In the earlier positive replay on Harper the extra closure used a tile frame. That case remains a negative control. The broader proximity screen counted 316 cells with high aggregate coverage from own and unassigned ink. It measured how much ink was nearby, without identifying a particular cut or all of its endpoints. [Harper original-source check](open-lines-journal.md#19-november-2026--one-reference-local-missing-spans-and-original-pdf-strokes)

## Curved printed ranges on Ventura J pocket

The native reader follows source strokes in paint order and tries joins in the declared dash spaces. Both tangents must point into the join within 5°. It requires a full partition of the size card, a source curve carrying the legend size of the stroke run beside the range label, a simple loop, a single enclosed piece seed and a cut instruction. Placement and template text veto a candidate. Multiple walks at one label must agree pairwise within 0.1 mm along the entire perimeter in assembled sheet coordinates. This is twice the native PDF flattening sagitta. A cycle qualifies when exactly one sampled source stroke exceeds the straight reader’s 12-corner limit and a single legend size owns that entire stroke. It has no garment name, page number, pre-traced operator list or reference DXF in its decision.

| Printed range | Matching source walks | Maximum distance to the independently decoded source, mm |
| --- | ---: | ---: |
| 00–0 | 1 | 0.042 |
| 2–4 | 1 | 0.047 |
| 6–8 | 1 | 0.032 |
| 10–20 | 3 | 0.043 |
| 22–26 | 1 | 0.047 |
| 28–32 | 2 | 0.032 |

The audit read the Bézier commands directly from original PDF pages 79 and 80, independently of the importer's flattening. It checked duplicate curve control geometry across the page overlap and measured both perimeters at spacing ≤0.5 mm in the assembled PDF coordinates. Table maxima are rounded upward to 0.001 mm. For each of the three ranges with open sizes, the program found exactly the ordered path IDs and vertices of the manually audited native-sheet outline. The independent pocket DXF and manual PDF trace are available in [the Ventura worktree](../../../grbpwr-admin-client-wt-ventura/docs/pattern-import/ventura-j-pocket.md).

Of the 80 original PDFs, the prior text screen identified four with the necessary piece, range and cut labels together. Replayed the new search on assembled source dumps for all four. The three other PDFs (Axel, Cher including pocket-placement marks, and Verona) yielded zero extra curved ranges. All polygon outputs were identical to the saved original path IDs and vertex arrays. Seven negative controls in the positive Ventura drawing exercised placement text, template text, a competing enclosed piece, an incomplete card partition, missing curve ownership, an absent source curve and a nearby trace with competing geometry. All seven abstained.

### Paired native wizard results

Bundled the wizard once for the pair. The control used the original polygon reader. The treatment supplied the audited source path sets and contours through the native printed-cut consumer. The three sets and vertex arrays are identical to the six-range reader's results for every range with an open size. The source was the original Ventura PDF, with the same 18-size card in both runs. Both used the diagnostic `PIECES_OPEN_PASS=1` to expose downstream checks.

| Measure | Control | Source assignment |
| --- | ---: | ---: |
| Closed cells in Ventura | 165 / 234 | 173 / 234 |
| J pocket closed | 10 / 18 | 18 / 18 |
| Previously closed cells with changed reported vertices | — | 0 / 165 |
| Whole-garment DXF | 0 | 0 |
| Wall time, minutes:seconds | 19:03 | 12:36 |

All eight recovered pocket outlines matched the independent DXF within 0.092 mm using both directed distances at spacing ≤0.5 mm, including the quantization of reported vertices and translation to piece-local coordinates. Both runs stopped at `meaning` on the non-monotone upper front (A) and split allowance on the left upper sleeve (E).

### Production path

Ran the complete original PDF again with the default reader in the local wizard and `PIECES_OPEN_PASS` unset. The accepted 18-size card and standard page/outline answers matched the paired run. The reader derived its source groups from the original PDF without supplied operator indices or geometry.

All 18 J pocket sizes were closed. Ventura had 173/234 closed cells. The eight newly closed outlines at sizes 10, 12, 14, 18, 24, 26, 28 and 30 matched the independently traced pocket DXF with maximum piece-local error 0.092 mm. The 165 previously closed cells retained their reported vertices. The ordinary wizard stopped at **pieces** on 12 other regions, including back upper, front upper, back lower and right sleeve upper. No whole-garment DXF was written. The run recorded 4,955,181 ms elapsed, including time on a shared workstation. This is a single run.

## Cher patch pocket flap

The [anchor list](reference-anchor-candidates.csv) names Cher K patch pocket flap at 32 as a possible outside anchor. Page 19 has piece identity and a cut instruction. A local search over complete source strokes around the already located flap found unique five-sided figures with native legend support on every side in 00, 4, 12, 16, 20, 28 and 32. Sizes 28 and 32 are both open in the baseline. Their outlines coincide but use different pens. All four long strokes for 28 have dash ratio 1.75:1. All four for 32 have the six-dash ratio 4.67:1.33:1:1.33:1:1.33. The two ratios occur in their own legend entries. The legend-polygon reader uses these independent paint passes as the endpoints of a shared-geometry interval.

On the original MDF383 PDF (SHA-256 `b7f7f5d840e51fe085a883881ff75d92d5a92fb74050675d12b7f2467d83907c`), the source paint operator indices for 28 are 26078 through 26120 in increments of six. The corresponding series for 32 is 28767 through 28833, also in increments of six. Indices are zero-based and refer to the paint following the path construction. The accepted K12 cell differs by up to 3.035 mm from the five-sided polygon supported by its own 4.68:1 pen. Inspect that discrepancy before treating an existing K outline as a reference.

In the saved native `repairSize` probe for K24, supplied the 28 and 32 source outlines as direct anchors while preserving all original target walls. The refusal moved from missing bracketing anchors to insufficient coverage and two unsupported spans. Draw mode still failed its derived-share limit. This probe did not close K24. K24 and K26 are outside the confirmed 28–32 interval.

### Default wizard result, 20 November

With the same PDF, accepted 18-size card and normal Pieces stop, Cher rose from **216 to 219 closed contours out of 288**. The K flap rose from 11 to 14 out of 18. The baseline reported 315,065 ms on the shared machine and the final treatment 236,600 ms. Only K28, K30 and K32 changed outcome. All 216 previously closed contours retained their reported vertices at the 0.1 mm precision of the saved cell report.

| Flap size | Provenance | Geometry check |
| --- | --- | --- |
| 28 | Its own eight source paths, confirmed by size 32 | Full boundary within 0.000282 mm of the decoded PDF |
| 30 | Exact size-28 vertex array, confirmed by size 32 | Its two local size-30 vertical stroke chains agree within 0.073 mm. The remaining sides come from size 28 |
| 32 | Its own twelve source paths, confirmed by size 28 | Full boundary within 0.000173 mm of the decoded PDF |

The recorded `polygonSource` names the reference and the confirming size and lists both original sets of path IDs. The direct cases carry `legend-polygon`, the inherited one `shared-polygon`. For each reference, the verifier registers the decoded source at one endpoint by translation and measures the rest of the boundary in both directions. The withheld-size control hid the closed status of K4. Its own twelve paths, independently confirmed by K00, recovered the source figure to within 0.000285 mm.

A missing intermediate drawing inherits only inside an interval with two independently named pens and matching complete convex polygons around a single piece label and cut instruction. A distinct partial outline from the target size, disagreeing closed intermediate geometry, conflicting ownership, or duplicated source figures blocks the relevant recovery. The native reader returned no additional candidates on the saved Axel, Verona and Ventura source captures. Cher has four open K cells left (0, 6, 24 and 26). The wizard still stops at Pieces with 15 unresolved regions, including back yoke, back center, inseam pockets and front yoke. It wrote no garment DXF. The repository's Cher pocket DXF contains J, a different piece.

## Integrating Colleen and Nob Hill

The integration carries forward the closed-edge overlap handling in sheet assembly, capped legend samples, independently bracketed outlines for sizes sharing a pen, and the single-cycle search for keyed fragments. On Colleen the Pieces resolver keeps independently bracketed source vertices when raster snapping would switch to another line. The DXF identity gate reads that same bracket proof. The source, seed and operator exclusions remain part of the reconstruction.

The ordinary Colleen import read the 18-size card from the original PDF. It closed 144 of 144 piece–size cells and passed all blocking checks for both materials. The main DXF contains 234 blocks and the interlining DXF contains 18. Re-reading their layer-1 outlines found **all 252 vertex arrays exactly equal** to the independently source-checked exports in the sibling worktree. No open, degenerate or self-crossing block was found. The block count includes cut copies and material scopes.

Nob Hill closed 34 of 45 size cells in the ordinary run. A/L and A/5XL have 305 and 206 reported vertices. The wizard stopped at Pieces on upper front, lower front, sleeve and collar. A separate open-size diagnostic run wrote 43 DXF blocks and failed G3, G4, G5, G8, G22 and G24 for the garment. All 43 layer-1 arrays exactly matched the previously checked diagnostic exports from the sibling worktree. A fresh bidirectional comparison to the independently decoded PDF paths measured 0.04845 mm maximum for L and 0.09839 mm maximum for 5XL.

### Savannah D pocket regression in the integration

Reading the correct dashed body of the size-6 legend sample also assigns chain 749 to size 6. The older resolver had borrowed that chain for D32. Two original closed PDF paths for 32 (page 25, paths 1436 and 1454) draw the exact same rectangle. A second named pen independently traces it for 26 (paths 1439 and 1457). At 32, the flood pass had set the rectangle aside as a possible page frame. The Pieces reader now keeps this directly printed boundary when the independently owned complete paths coincide, their geometry matches every closed member of the piece, and none was excluded by the operator. It retains both sets of original paths in the result. Changing either an existing member's shape or an operator exclusion blocks the recovery.

The ordinary 18-size Savannah replay closed all 180 cells and proceeded beyond Pieces. The 179 other outlines retained their reported vertices. The new cell's four physical corners coincide with the rectangular cut previously reported with extra collinear points. On 75 saved corpus sessions the closed-path rule returned only the deliberately withheld Savannah D32. Independent runs disabling only the new wall-seam logic or only the new overlap logic both retained the D32 leak. Restoring the prior size interpretation also restored the old borrowed wall. The source-based repair preserves the corrected legend.

### Ventura on the integrated reader

The eight newly closed J sizes still agree with the independently traced DXF to within 0.092 mm. Three previously closed cells have different vertex arrays after the size-reader integration. J00 now follows the independently checked 00–2 printed range to within 0.066 mm in both directions in sheet coordinates. The earlier J00 differed by up to 0.649 mm. For D2 the largest whole-perimeter difference between the two runs is 0.122 mm. For F26 it is 0.00160 mm.

The changed portions of D2 and F26 were also compared with original PDF paint. The D2 interval spans 150.8 mm and contains 137 marks from its size-2 source chain on pages 16, 25 and 26. Throughout the interval the earlier and integrated cuts are both within 0.178 mm of the line through the printed mark centres. The F26 interval spans 198.5 mm and contains 130 marks from its size-26 chain on pages 57–59. Both cuts are within 0.038 mm. Each PDF page was registered by one translation using a majority of matching original stroke endpoints. One path on page 59 starts differently in the assembled sheet. The other two registration paths agree. The comparison used the original path coordinates for all marks. The two curves are monotone in x on each tested interval, so the maximum vertical difference at the union of their breakpoints bounds both directed distances. This check covers every changed interval. The vertex arrays agree elsewhere.

### Fawn confirms three additional source polygons

The ordinary integrated run went from 50 to 53 closed size cells out of 63. It still stops at Pieces. The page-4 legend has independently distinguishable pens for L and 2XL. Both pens trace each of the two rectangular cuts. The verifier decoded the original legend text, dash arrays and paint coordinates. All four long sides carry the dash signature of their named pen. Each set of 12 source paths contains those four sides and the short segments at each corner. The two independently printed boundaries for each shape agree within 0.000353 mm.

| Size cell | PDF page | Maximum bidirectional difference from its own PDF cut |
| --- | --- | ---: |
| E pocket flap 2XL | 26 | 0.05922 mm |
| F pocket welt L | 22 | 0.04615 mm |
| F pocket welt 2XL | 22 | 0.04633 mm |

All three use their own printed size geometry. E/L and E/2XL occupy source paint operations 4843–4909 and 7779–7845. F/L and F/2XL occupy 4915–4981 and 8024–8090. Consecutive paint indices in each interval differ by six. No garment DXF was written in this run.

## Reproduce

Run from the repository root. `RUNS` is the local archive containing the accepted shot files and the assembled source dumps from the printed-range experiments. The commands below read the two evidence reports, check the four eligible drawings against the independently decoded Ventura PDF, then run the wizard control and treatment on Ventura with the same 18-size card.

```sh
RUNS=/private/tmp/patimport-runs
PDF="$HOME/Downloads/archive 600 pcs/activewear/MDF372-The-Ventura-Sweatsuit-Ensemble-Sizes-00-32-A4-Letter-Patterns.pdf"
DXF=../grbpwr-admin-client-wt-ventura/docs/pattern-import/ventura-j-pocket.dxf
node scripts/pattern-import/automatic-gap-source-repeat.mjs "$RUNS/verified-gap-m.jsonl" "$RUNS/verified-gap-h.jsonl"
node scripts/pattern-import/automatic-gap-source-curve-check.mjs "$PDF" "$RUNS"
node scripts/pattern-import/automatic-gap-source-ventura.mjs "$PDF" "$DXF" "$RUNS/ventura-curve-new"
node scripts/pattern-import/automatic-gap-source-ventura.mjs "$PDF" "$DXF" "$RUNS/ventura-production-new" production "$RUNS/ventura-curve-new/control"
```

Use a new output directory for the paired wizard run. The validator checks the original PDF SHA-256, the native seed, the resulting cell geometry and all previously closed contours. The source-bound ranges belong to this Ventura edition. Ventura is the one verified positive PDF for curves in the 80-file screen. More independent examples are needed to measure transfer beyond this print convention.

To check the Cher result, generate ordinary baseline and treatment shots with the same accepted size card and `AUTOPILOT_OUTLINES=1`. Keep the sibling `cells.json` for each `run.json`. Supply those reports and the assembled source capture to the independent page-19 verifier.

```sh
CHER="$HOME/Downloads/archive 600 pcs/outerwear/MDF383-The-Cher-Jacket-Sizes-00-32-A4-Letter-Patterns.pdf"
node scripts/pattern-import/automatic-gap-source-cher.mjs "$CHER" "$RUNS/cutrange-Cher/source.json" "$RUNS/cher-legend-before-nov20/run.json" "$RUNS/cher-legend-final-nov20/run.json"
```

The Fawn and integrated Ventura source checks use the accepted native session to map the path provenance back to the original PDF paint operations.

```sh
FAWN="$HOME/Downloads/archive 600 pcs/dresses/MDF476-Fawn-Mini-Dress-Free-Sewing-Pattern-A4-Letter-Patterns-Mood-Fabrics-Sewciety-Blog.pdf"
node scripts/pattern-import/automatic-gap-source-fawn.mjs "$FAWN" "$RUNS"/integration-nov20/corpus/*Fawn*/
node scripts/pattern-import/automatic-gap-source-ventura-recheck.mjs "$PDF" "$RUNS"/automatic-gap-shortlist-19/*Ventura*/session.v8.gz "$RUNS/automatic-gap-ventura-production-1/production/cells.json" "$RUNS"/integration-nov20/merged/*Ventura*/cells.json
```

### Taos E upper sleeve, two closures through a borrowed line

The two previous cuts for size 2 differ by up to 12.129 mm. The change in size 26 is smaller, up to 1.741 mm, and occurs at a different part of the sleeve. The original Taos key on page 4 distinguishes the measured pens. The 20 sample is a stroked dash; the 30 sample alternates individually stroked dashes with pairs of filled marks. The 2 and 26 samples consist of filled marks with different outlines. The probe checks the original PDF operations for each sample and its corresponding sleeve line.

The table samples at 0.5 mm along stretches where the two recorded cuts separate by more than 0.5 mm. The distance tolerance to source geometry is 0.3 mm. The column for 30 only counts the individually painted dashes of that pen. Spaces and its other filled marks may also lie on the reconstructed centerline.

| Size | Version | Samples on divergent arc | On assigned size or common chain | On visible original 20 stroke | On visible original 30 dashes |
| --- | --- | ---: | ---: | ---: | ---: |
| 2 | Before integration | 383 | 29 | 353 | 0 |
| 2 | Integrated | 376 | 0 | 0 | 210 |
| 26 | Before integration | 13 | 0 | 11 | 0 |
| 26 | Integrated | 11 | 0 | 0 | 7 |

On page 21 the paper still shows the 26 pen. The reader lost some of its rounded dashes where several sizes and notch marks gather. The center of fill operation 9564 is 2.183 mm from the earlier cut and 0.710 mm from the integrated cut. Six original fills from operations 9549–9624 are fully inside the actual clip and document the separate 26 curve.

When the flood borrows a foreign line and that line ends, the continuation used to take whichever pen was nearest at the endpoint. For size 2, five graded pens arrive within the existing 0.8 mm landing distance, travel forward, and reach distinct points on the target walls. For size 26, twelve do so. A smaller initial offset cannot identify which diverging arc belongs to the size. A repeated transfer now checks whether an independently keyed alternative leads forward to a separate landing. If two different pens each reach a landing outside the other route’s tolerance, the whole ambiguous sequence is withdrawn. A fallback flood that connects the same endpoints must support the disputed part of its cut using the target rank, common edges, or the existing three-pen overlay check.

The final native run held size 26 on Pieces and closed size 2 along its own pen. All 58 visible round marks of the size-2 pen on the disputed arc are within 0.062 mm of the new cut. Areas for 0, 2 and 4 now increase from 76,588 through 77,558 to 78,784 mm². The artifact contains 139 closed cells out of 162, compared with 140 before the check. The other 160 cells retain their statuses and polygon vertices. Taos still stops on Pieces and produces no DXF. The check of recorded families in 15 PDFs containing closed inner-plug candidates identified only Taos E26 for the fallback refusal.

For the two historical cuts, pass the frozen captures from before the transfer and from the integrated version that still accepted the disputed lines. The fourth argument is the final native garment's cells.json. The paper audit rereads the PDF.js painting and clipping operations on those pages and confirms the printed key on page 4.

```sh
node scripts/pattern-import/dxf-shot.mjs "$TAOS_PDF" --cards "$CARDS_DIR" --limit 0 --out "$OUT_DIR"
node scripts/pattern-import/source-check-taos-sleeve.mjs "$TAOS_PDF" "$PRE_TRANSFER/session.v8.gz" "$DISPUTED/session.v8.gz" "$FINAL_TAOS/cells.json"
npx vitest run src/lib/pattern-import/pieces/landing-plugs.test.ts
```

## Biarritz D FRONT PANEL 4XL

The frozen run changed this previously closed cut by over 43 mm. The original MDF435 PDF prints SIZE 4XL and its two-element dash sample on page 4, paint operation 8130. The front uses four matching strokes and four solid turns in this order, with one-based pages and zero-based paint operations: 16/6588, 16/6594, 16/6600, 18/2459, 18/2465, 29/1164, 27/4036, 27/4020. Visible copies under the physical page clips agreed with the original axes to 0.000004 mm. Every intervening gap agreed with the printed full or half gap to 0.000182 mm.

With both contours sampled every 0.15 mm and the saved Pieces coordinates rounded to 0.1 mm, the earlier cut-to-PDF and PDF-to-cut maxima were 43.640443 and 34.583560 mm. The corrected cut gave 0.051783 and 0.051459 mm. Run `node scripts/pattern-import/source-check-printed-fronts.mjs MDF435.pdf session.v8.gz cells.json previous-cells.json` against the frozen integration-final-80 snapshot and integration-nov20 comparison to reproduce this check.
