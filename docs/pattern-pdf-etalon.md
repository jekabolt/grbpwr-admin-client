# Etalon pattern PDF

The contract for which PDF counts as an etalon cutting pattern. The unit of the decision is the whole file of one garment, not a page and not a piece.

The sample that passes these rules: `Kombinezon.pdf` (Phoebe Jumpsuit, 44 sheets of one size). The junk sample: `Skirt-Pocket.pdf` — one page, one picture, no curves.

## Statuses

- **Junk.** The file has no curves. A page that is a picture is junk under any compression, not only JPEG.
- **Not an etalon.** Curves exist, but a check below fails. The cause is a raster on a page, the geometry, or both. There is no fourth status.
- **Etalon.** The whole file passes the check.

The file is not split into several garments. It passes the geometry as a whole — one etalon. It fails — one "not an etalon", or junk.

Only an etalon is processed and visualized. "Not an etalon" stays in the archive with its cause and is not processed. Junk is not processed.

## Check order

1. No curves — junk. Do not look further.
2. The sheets are assembled into one drawing. The check runs on the assembled drawing, not on a page. A piece cut by a sheet edge does not lose its pair.
3. A picture painted on a page — not an etalon. A JPEG in the embedded XMP preview does not change the status.
4. The geometry of every piece passes the rules below — etalon. Otherwise — not an etalon.

Text, a title, `cut x1`, a size in a label, layer numbers, and stroke color do not define a class and do not change the status. `cut x1 pair` does not create a second piece: one pair of contours is drawn — one pair is checked.

## Piece

A piece is a closed pair of contours.

- The outer contour is the cut line. It is what gets cut.
- The inner contour is the stitch line. It is what gets sewn.
- A pair is containment plus a near-constant gap along the whole length. A number of the form "no wider than N mm" is not the definition: an allowance is recognized by a constant offset, a grade by the gap diverging around the perimeter.
- Concentric sizes are not a pair. A size inside a size is not an allowance.
- Ends that meet make the contour closed, even when the PDF has no close-path operator. A hole that means this is no longer a piece contour is a failure.
- Crossing contours are not a pair.
- An unpaired closed curve is not an allowance.

One piece without a pair strips the etalon from the whole file.

## Grainline

Each pair has its own direction inside the stitch line. One arrow on a sheet does not cover the other pieces.

- Several collinear pieces of one arrow are one direction. The number of segments does not matter.
- The arrowhead may touch the contour. The shaft lies inside the stitch line.
- A shaft in the allowance band, or outside it, does not count as a direction.
- No direction, or two non-collinear directions on one piece, is a failure, and the etalon is stripped from the whole file.

## Read, but not decisive

On an etalon these classes are extracted when they are present. Their absence does not stop processing. A failure is possible only on the contour, the allowance, and the grainline.

- **Notch** — a short stroke on the cut line or on the stitch line.
- **Markup** — everything that is not a contour, an allowance, a grainline, or a notch. The amount of markup does not change the status.
- **"Do not transfer"** is not a class of its own. A stroke that cannot be told apart by its shape stays markup. The color of one line in one file does not set a rule for other files.
