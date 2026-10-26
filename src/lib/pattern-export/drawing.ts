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
import {
  grainArrowGeometry,
  grainDisplaySegment,
  labelBesideGrain,
  type GrainSegment,
} from 'lib/nesting/geom/grain-display';
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
  /** Closed vector shape filled by the PDF renderer (grain arrowheads). */
  fill?: boolean;
  /** Non-rendered source identity, used by geometry probes to keep piece strokes grouped. */
  pieceKey?: string;
};
/**
 * A text of the drawing. Without `sizeMm`: a piece name, centred on (x, y) at the renderer's own
 * label size. With `sizeMm`: a text placed by its source (a PLT `LB`) — (x, y) is the baseline
 * start, `sizeMm` the font size, `angle` degrees CCW as seen on paper.
 */
export type DrawingLabel = {
  x: number;
  y: number;
  s: string;
  sizeMm?: number;
  angle?: number;
  /** Non-rendered source identity, parallel to `DrawingStroke.pieceKey`. */
  pieceKey?: string;
};

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

type Seg = { kind: StrokeKind; closed: boolean; pts: Pt[]; fill?: boolean };

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
      ...(s.fill ? { fill: true } : {}),
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

function grainLayerOf(pieces: readonly ReturnType<typeof groupToPieces>[number][]): string {
  const perBlock = new Map<string, ReturnType<typeof groupToPieces>[number]['grain']>();
  for (const piece of pieces) {
    if (!piece.blockName || perBlock.has(piece.blockName)) continue;
    perBlock.set(piece.blockName, piece.grain);
  }
  const stats = new Map<string, { one: number; seen: number; lengths: number[] }>();
  for (const grains of perBlock.values()) {
    const byLayer = new Map<string, typeof grains>();
    for (const grain of grains)
      byLayer.set(grain.layer, [...(byLayer.get(grain.layer) ?? []), grain]);
    for (const [layer, hits] of byLayer) {
      const stat = stats.get(layer) ?? { one: 0, seen: 0, lengths: [] };
      stat.seen++;
      if (hits.length === 1) {
        stat.one++;
        stat.lengths.push(hits[0].lengthCm);
      }
      stats.set(layer, stat);
    }
  }
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  };
  const best = [...stats.entries()].sort(
    (a, b) =>
      b[1].one - a[1].one || median(b[1].lengths) - median(a[1].lengths) || b[1].seen - a[1].seen,
  )[0];
  return best && best[1].one > 0 && best[1].one * 2 >= best[1].seen ? best[0] : '';
}

function pushGrain(segs: Seg[], segment: GrainSegment, headLengthCm = 0.3) {
  const arrow = grainArrowGeometry(segment, headLengthCm);
  if (!arrow) return;
  segs.push({ kind: 'line', closed: false, pts: [arrow.shaft.a, arrow.shaft.b] });
  for (const head of arrow.heads) segs.push({ kind: 'line', closed: true, pts: head, fill: true });
}

// The default label is 9 pt (3.175 mm), centred, horizontal; its width is estimated per glyph.
const LABEL_EM_CM = 0.3175;

function labelAt(poly: readonly Pt[], s: string, grain: GrainSegment | null): Pt {
  const at = centroid(poly);
  if (!grain) return at;
  const box = { dir: { x: 1, y: 0 }, halfW: s.length * 0.3 * LABEL_EM_CM, halfH: LABEL_EM_CM / 2 };
  return labelBesideGrain(at, grain, box, 0.2, poly);
}

function samePoint(a: Pt, b: Pt): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= 1e-6;
}

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
  const prepared = groups.map((group) => ({
    group,
    raws: groupToPieces(group, NEST_DEFAULTS.tolChain, warnings),
  }));
  const grainLayer = grainLayerOf(prepared.flatMap((entry) => entry.raws));
  const segs: Seg[] = [];
  const labels: { at: Pt; s: string }[] = [];
  for (const { group: g, raws } of prepared) {
    let cut: (typeof raws)[number] | null = null;
    let best = -1;
    for (const r of raws) {
      const a = Math.abs(area(r.poly));
      if (a > best) {
        best = a;
        cut = r;
      }
    }
    const grains = cut?.grain.filter((grain) => grain.layer === grainLayer) ?? [];
    const grain = g.blockName != null && grains.length === 1 ? grains[0] : null;
    for (const c of g.chains) {
      const isGrain =
        grain &&
        c.layer === grainLayer &&
        !c.closed &&
        c.pts.length >= 2 &&
        samePoint(c.pts[0], grain.a) &&
        samePoint(c.pts[1], grain.b);
      if (!isGrain) segs.push({ kind: c.notch ? 'notch' : 'line', closed: c.closed, pts: c.pts });
    }
    if (!cut) continue;
    segs.push({ kind: 'cut', closed: true, pts: cut.poly });
    const segment = grain ? grainDisplaySegment([cut.poly], grain) : null;
    if (segment) pushGrain(segs, segment);
    const label = (g.blockName ?? '').trim();
    if (label) labels.push({ at: labelAt(cut.poly, label, segment), s: label });
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
      if (c.pts.length >= 2 && c.layer !== dto.displayGrain?.layer)
        segs.push({ kind: 'line', closed: c.closed, pts: placedPoly(c.pts, pl) });
    const local = dto.displayGrain ? grainDisplaySegment([dto.poly], dto.displayGrain) : null;
    const placed = local
      ? { a: placedPoly([local.a], pl)[0], b: placedPoly([local.b], pl)[0] }
      : null;
    if (placed) pushGrain(segs, placed);
    labels.push({ at: labelAt(poly, dto.name, placed), s: dto.name });
  }
  return normalize(segs, labels, false, title, []);
}
