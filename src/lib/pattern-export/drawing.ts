// A pattern drawing ready for a 1:1 output: every line of the source in millimetres, Y pointing
// DOWN, origin at the drawing's top-left corner. One shape for two sources — a DXF sheet as it was
// drawn (the patterns tab), a marker as it was laid out (the marker window) and a plotter file as
// it plots (plt-pdf.ts drawingFromPltSheet) — so the PDF has a single input and never knows where
// the lines came from.
//
// Geometry comes from the nesting parser, not a second DXF reader: the same block expansion, unit
// detection and AAMA notch recovery the marker and the piece table already trust.
import { parseDxf } from 'lib/nesting/dxf/parse';
import { groupToPieces } from 'lib/nesting/dxf/pieces';
import { expandGroups } from 'lib/nesting/dxf/transform';
import { area } from 'lib/nesting/geom/polygon';
import type { NestResult, PieceDTO, Pt, Unit } from 'lib/nesting/types';
import { NEST_DEFAULTS, placedPoly } from 'lib/nesting/types';

/**
 * `cut` — the piece's cutting line (the largest contour of its block), solid and heaviest;
 * `line` — everything else the file draws (sewing line, darts, grainline, drill marks, internals);
 * `notch` — AAMA notches, a touch heavier than internals so they survive a laser printer.
 */
export type StrokeKind = 'cut' | 'line' | 'notch';

export type DrawingStroke = {
  kind: StrokeKind;
  closed: boolean;
  pts: [number, number][];
  /** Dash pattern, mm (on, off, …) — a PLT line type; DXF and marker lines are solid. */
  dash?: number[];
};
/**
 * A text of the drawing. Without `sizeMm`: a piece name, centred on (x, y) at the renderer's own
 * label size. With `sizeMm`: a text placed by its source (a PLT `LB`) — (x, y) is the baseline
 * start, `sizeMm` the font size, `angle` degrees CCW as seen on paper.
 */
export type DrawingLabel = { x: number; y: number; s: string; sizeMm?: number; angle?: number };

export type PatternDrawing = {
  /** Extent of the line work, mm. */
  w: number;
  h: number;
  strokes: DrawingStroke[];
  /** Piece names, anchored at the piece's centre (mm, same frame). */
  labels: DrawingLabel[];
  /** Display name for headers and file names (no extension). */
  title: string;
  warnings: string[];
};

type Seg = { kind: StrokeKind; closed: boolean; pts: Pt[] };

/** Absolute cm (Y up, any origin) → mm frame (Y down, origin top-left). */
function normalize(
  segs: Seg[],
  labels: { at: Pt; s: string }[],
  flipY: boolean,
  title: string,
  warnings: string[],
): PatternDrawing {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of segs)
    for (const p of s.pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  if (!Number.isFinite(minX)) throw new Error('the drawing has no line work');
  const X = (x: number) => (x - minX) * 10;
  const Y = (y: number) => (flipY ? maxY - y : y - minY) * 10;
  return {
    w: (maxX - minX) * 10,
    h: (maxY - minY) * 10,
    strokes: segs.map((s) => ({
      kind: s.kind,
      closed: s.closed,
      pts: s.pts.map((p) => [X(p.x), Y(p.y)] as [number, number]),
    })),
    labels: labels.map((l) => ({ x: X(l.at.x), y: Y(l.at.y), s: l.s })),
    title,
    warnings,
  };
}

function centroid(poly: readonly Pt[]): Pt {
  // Area centroid; falls back to the vertex mean on a degenerate ring.
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j].x * poly[i].y - poly[i].x * poly[j].y;
    a += f;
    cx += (poly[j].x + poly[i].x) * f;
    cy += (poly[j].y + poly[i].y) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = Math.max(1, poly.length);
    return {
      x: poly.reduce((s, p) => s + p.x, 0) / n,
      y: poly.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

const stripExt = (name: string) => name.replace(/\.[^.]+$/, '');

/**
 * A DXF sheet exactly as drawn. Every chain of every expanded block is drawn as a thin line (that
 * is what makes grainlines, drill marks and internals come out «as in the source»); the largest
 * contour of each block is drawn over it as the cutting line and labelled with the block name.
 */
export function drawingFromDxf(
  buf: ArrayBuffer,
  name: string,
  unit: Unit = 'auto',
): PatternDrawing & { unitGuessed: boolean } {
  const warnings: string[] = [];
  const parsed = parseDxf(buf, unit);
  const expandNotes: string[] = [];
  const { groups, skippedBlocks } = expandGroups(
    parsed.dxf.entities ?? [],
    parsed.dxf.blocks ?? {},
    parsed.cmPerUnit,
    NEST_DEFAULTS.tol,
    expandNotes,
  );
  // A 1:1 print with pieces missing is worse than no print: the cutter trusts paper to be the
  // whole pattern. Skipped inserts (missing definition, nesting too deep, instance budget) refuse
  // the export, naming what was skipped, before anything is rendered.
  if (skippedBlocks > 0)
    throw new Error(
      `${skippedBlocks} block insert(s) of the drawing could not be read, so the PDF would be incomplete: ${
        expandNotes.join('; ') || 'blocks skipped'
      }`,
    );
  warnings.push(...expandNotes);
  const segs: Seg[] = [];
  const labels: { at: Pt; s: string }[] = [];
  for (const g of groups) {
    for (const c of g.chains)
      segs.push({ kind: c.notch ? 'notch' : 'line', closed: c.closed, pts: c.pts });
    const raws = groupToPieces(g, NEST_DEFAULTS.tolChain, warnings);
    let cut: (typeof raws)[number] | null = null;
    let best = -1;
    for (const r of raws) {
      const a = Math.abs(area(r.poly));
      if (a > best) {
        best = a;
        cut = r;
      }
    }
    if (!cut) continue;
    segs.push({ kind: 'cut', closed: true, pts: cut.poly });
    const label = (g.blockName ?? '').trim();
    if (label) labels.push({ at: centroid(cut.poly), s: label });
  }
  if (parsed.unitGuessed)
    warnings.push(`the file declares no units — read as ${parsed.unit}; check the test square`);
  return {
    ...normalize(segs, labels, true, stripExt(name), warnings),
    unitGuessed: parsed.unitGuessed,
  };
}

/**
 * A finished marker: placed contours and their internals in strip coordinates (x along the
 * fabric, y across), plus the selvedge lines so the paper shows the cloth it was laid on.
 */
export function drawingFromMarker(
  result: Pick<NestResult, 'placements' | 'usedLengthCm'>,
  pieces: readonly PieceDTO[],
  fabricWidthCm: number,
  title: string,
): PatternDrawing {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const segs: Seg[] = [];
  const labels: { at: Pt; s: string }[] = [];
  const L = Math.max(result.usedLengthCm, 1);
  // Selvedges first: they also fix the extent to the full cloth width.
  segs.push({
    kind: 'line',
    closed: false,
    pts: [
      { x: 0, y: 0 },
      { x: L, y: 0 },
    ],
  });
  segs.push({
    kind: 'line',
    closed: false,
    pts: [
      { x: 0, y: fabricWidthCm },
      { x: L, y: fabricWidthCm },
    ],
  });
  for (const pl of result.placements) {
    const dto = byId.get(pl.pieceId);
    if (!dto) continue;
    const poly = placedPoly(dto.poly, pl);
    segs.push({ kind: 'cut', closed: true, pts: poly });
    for (const c of dto.inner ?? [])
      if (c.pts.length >= 2)
        segs.push({ kind: 'line', closed: c.closed, pts: placedPoly(c.pts, pl) });
    labels.push({ at: centroid(poly), s: dto.name });
  }
  return normalize(segs, labels, false, title, []);
}
