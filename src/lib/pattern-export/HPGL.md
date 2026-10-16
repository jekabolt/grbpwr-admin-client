# PLT export — the HP-GL dialect we write

> **Status: NOT VERIFIED ON A PLOTTER.** Every file is checked by parsing it back with the
> pattern import's own HP-GL reader (`scripts/plt-roundtrip-probe.mjs`), which proves the
> geometry and the command stream match this document. It does not prove that a given Gerber,
> Lectra or Investronica driver accepts the file. Before the first production use, plot one
> piece with a known size and measure it.

Writer: `dxfToHpgl()` in `hpgl.ts`. Input: the neutral `PlotDrawing` (mm, y-up), built from the
app's parsed DXF by `plotFromPattern()` (one pattern sheet, pieces where the file puts them) or
`plotFromMarker()` (placed pieces, through the shared placement transform `placedPoly`).

## Default dialect

| Item | Value |
| --- | --- |
| Preamble | `IN;` `PA;` `PU;`. No `IP`/`SC` (raw plotter units), no `DF`, no escape sequences, no PJL/HP-GL/2 `ESC%-1B` |
| Units | 40 plotter units per mm (1 plu = 0.025 mm = 1/1016 in), integer coordinates |
| Coordinates | absolute (`PA`) on every `PU`/`PD` |
| Frame | y-up. Origin = bottom-left corner of the drawing's bounding box, plus `originMm` |
| `SP1` | cut lines — piece outlines (the contour on the cut layer, AAMA layer 1 by default) |
| `SP2` | drawn / internal lines: seam line, internal lines, grainline, drill marks, a marker's strip rectangle; also the text pen |
| `SP3` | notches (AAMA layer 4) as short open strokes |
| Pen order | `SP2` (lines, then text) → `SP3` → `SP1`, so the cut comes last and a cutter does not free a piece before it is drawn on |
| Polylines | `PU x,y;` then `PD x,y,…;` (at most 100 pairs per command), closed outlines repeat their first point, then `PU;` |
| Curves | arcs flattened to polylines at a chord sagitta ≤ 0.1 mm (`chordToleranceMm`). The DXF reader already flattens arcs/splines at 0.2 mm (`NEST_DEFAULTS.tol`, cm) |
| Text | `SI w,h;` (cm, w = 0.76·h) `DI cos,sin;` `PU x,y;` `LBtext` + ETX (0x03). Baseline-left anchor (`LO1`, the default — no `LO` is sent). Printable ASCII only: Cyrillic is transliterated, `;` → `,`, other characters → `?` |
| End | `PU;` `SP0;` |
| Line breaks | one command per line (`\n`) — HP-GL ignores whitespace between commands |

Rounding to integer plotter units moves a point by at most 0.0177 mm (half a unit on each axis).

## Options (`HpglOptions`)

| Option | Default | Meaning |
| --- | --- | --- |
| `unitsPerMm` | 40 | plotter units per mm |
| `pens` | `{ cut: 1, draw: 2, notch: 3, text: 2 }` | pen per role; two roles may share a pen |
| `text` | `true` | `false` drops every `LB` |
| `mirror` | `false` | x → −x before everything else (plot face-down) |
| `rotate90` | `false` | rotate 90° CCW after the mirror (long marker along the plotter's long axis) |
| `originMm` | `{0,0}` | offset added after the bottom-left anchor |
| `anchor` | `'bbox'` | `'none'` keeps the source coordinates (may be negative) |
| `chordToleranceMm` | 0.1 | sagitta for arc flattening |
| `maxPairsPerCommand` | 100 | coordinate pairs per `PD` |

Labels are never mirrored (the anchor moves, the letters stay readable); `rotate90` turns them.

## Known vendor variations (to check against the actual machine)

These are the differences we know to look for. None of them is handled automatically; most are
one option away.

**Units**
- HP standard and most cutters/plotters: 40 plu/mm (1016/in). Drivers (Gerber, Investronica,
  generic cutting tables) can be configured for other steps — 1000 plu/in (≈ 39.37/mm) or
  0.1 mm (10/mm) are the usual suspects. Not confirmed for any specific machine here: read the
  driver's setting and set `unitsPerMm` to match — a 1.6 % size error at 39.37 vs 40 is
  invisible on screen and fatal on a garment.
- Some RIPs read `IP`/`SC` and rescale; we send neither, so the file is in raw units.

**Pen meaning**
- Gerber (AccuMark plot output) may use `SP1` for the drawn outline and another pen/tool number
  for the knife on cutters; on a pen plotter every pen draws.
- Lectra (Modaris/Diamino plot output) may keep internal lines and text on other pens and may
  expect notches as a dedicated tool rather than short strokes.
- Investronica and several Chinese cutting tables map pens to tools by a table in the cutter
  software (pen → pen / knife / punch / notcher). Map our roles with `pens`, e.g.
  `{ cut: 3, draw: 1, notch: 4 }`.
- `SP0;` (put the pen away) is ignored or rejected by some cutters; it is harmless on plotters.

**Terminators and separators**
- We end every command with `;`. A few old drivers want a line feed only, or `;` without
  line feeds — the line breaks can be removed without changing meaning.
- Label terminator: ETX (0x03) is the HP-GL default and is what we send without a `DT`.
  Some Gerber/Lectra files use `DT` to set another terminator (e.g. `DT$,1;`, `DT*,1;`) —
  our reader accepts those, our writer does not emit them.
- Commas vs spaces between coordinates: we use commas only.

**Text**
- Some cutters ignore `LB` entirely or plot it with the knife; use `text: false` for them.
- `DI` (absolute direction) is HP-GL/1; a few devices only know `DR`. Labels at 0° are
  unaffected by either.

**HP-GL/2 vs HP-GL/1**
- We write plain HP-GL/1 commands that HP-GL/2 also accepts. No polyline encoding (`PE`), no
  `BP`/`PS`/`NP`, no PCL/PJL wrapper. Large-format printers (HP DesignJet in HP-GL/2 mode) may
  need `ESC%-1B` / `BP;` / `PS` added by the print driver.

## PLT → PDF

`pltToPdf(bytes, format)` (`plt-pdf.ts`) reads any HP-GL/HP-GL/2 file through the import's reader
(`lib/pattern-import/adapters/hpgl`: IP/SC scaling, PE, arcs, line types, labels) into a
`PltSheet` (`readPltSheet`), turns it into the same `PatternDrawing` a DXF or a marker becomes
(`drawingFromPltSheet`: pen 1 → cutting line, 2 → drawn line, 3 → notch, others → drawn line;
dashes and LB texts kept) and prints it with THE 1:1 tiler, `dxf-pdf.ts` — the same one sheet /
A4 / A3 / Letter tiles, marks, page-1 map, test square and limits as every other 1:1 print, and
the same re-import guarantees (`scripts/pattern-export/dxf-pdf-probe.mjs` accepts a `.plt`).
Pen colours exist only in the dialog's preview; the PDF prints by role (line weight).

Reading rules on the PDF side:
- **Source units are the operator's answer.** A PLT never states the size of its plotter unit;
  `pltToPdf(…, { unitsPerMm })` defaults to 40/mm and the dialog offers 40/mm, 1000/in, 0.1 mm or
  a custom value, with the resulting drawing size in mm next to it. The test square on the PDF
  checks the printer only — it prints 100 mm whatever the file's unit was. IP/SC scaling inside the
  file is applied by the reader and reported (`PltSheet.selfScaled`).
- **RO** (plot rotation) is ignored by the import reader, so `plt-pdf.ts` scans the commands: one
  rotation set before anything is drawn is applied to the whole drawing (`PltSheet.rotationDeg`);
  RO changed after drawing started, or a non-right angle, is refused — never printed unrotated.
- **Damaged numbers** are refused (`assertFiniteDoc` after extraction, then finite extents).
- **Size caps** are the tiler's (`dxf-pdf.ts` `assertPrintableSize`, `TILED_MAX_*`), checked
  before anything is allocated: over 20 m on a side is refused (the PLT reader adds the plotter
  units to the message), and more than 500 pages is refused.
