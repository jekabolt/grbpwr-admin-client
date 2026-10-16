// Adapters: the app's parsed DXF geometry (lib/nesting PieceDTO, cm) → the neutral PlotDrawing
// (mm) that hpgl.ts writes. Two shapes of input:
//
//   plotFromPattern  ONE pattern file as drawn: every piece at its place in the file
//                    (originX/originY), cut contour + the piece's internal geometry.
//   plotFromMarker   a marker: placed pieces with their transforms (rotation, mirror,
//                    translation) — through `placedPoly`, the ONE placement transform every
//                    marker output must share (lib/nesting/types.ts), never a local copy.
//
// Roles. The cut line is the piece contour on the cut layer; everything in `inner` is drawn
// (seam line, internal lines, grainline, drills) except the AAMA notch layer "4", which is a notch.
// `grain` is NOT emitted separately: the grainline is a chain of the block and already sits in
// `inner` (dxf/pieces.ts puts every chain not on the contour's own layer there).
import type { NestResult, PieceDTO, Pt } from 'lib/nesting/types';
import { placedPoly } from 'lib/nesting/types';
import type { PlotDrawing, PlotPolyline, PlotRole, PlotText } from './hpgl';

/** AAMA/ASTM notch layer (lib/nesting/dxf/notch.ts NOTCH_LAYER; not imported: worker-only module). */
const NOTCH_LAYER = '4';
/** AAMA/ASTM cut (boundary) layer. */
const AAMA_CUT_LAYER = '1';

const CM = 10; // mm per cm

export type PatternPlotOptions = {
  /**
   * Layer whose piece contours are the CUT line. Default: the converter manifest's cut layer,
   * else AAMA "1" when present, else the most common contour layer. Callers that already know it
   * (contour-layer.ts `defaultContourLayer(layerOptions(...))`) should pass it.
   */
  cutLayer?: string;
  /** Piece-name labels (default true). */
  labels?: boolean;
  /** Label cap height, mm; shrunk to fit small pieces (default 6). */
  labelHeightMm?: number;
};

export function pickCutLayer(pieces: readonly PieceDTO[]): string | undefined {
  const declared = pieces.find((p) => p.manifest?.cutLayer)?.manifest?.cutLayer;
  if (declared) return declared;
  const counts = new Map<string, number>();
  for (const p of pieces) if (p.layer != null) counts.set(p.layer, (counts.get(p.layer) ?? 0) + 1);
  if (counts.has(AAMA_CUT_LAYER)) return AAMA_CUT_LAYER;
  let best: string | undefined;
  let n = 0;
  for (const [l, c] of counts) if (c > n) [best, n] = [l, c];
  return best;
}

const roleOfLayer = (layer: string): PlotRole => (layer === NOTCH_LAYER ? 'notch' : 'draw');

/**
 * Identity of a polyline at 0.01 mm: role, layer, closure and EVERY vertex. The loose pool repeats
 * one `inner` on every piece, and an ungraded cut layer repeats one outline in every size block —
 * those are dropped. A key built from a sample of vertices could equate two different lines (same
 * ends, same middle, different shape) and silently drop a real one; this key cannot.
 */
function sig(pl: PlotPolyline): string {
  const r = (v: number) => Math.round(v * 100);
  let k = `${pl.role}|${pl.layer ?? ''}|${pl.closed ? 1 : 0}|`;
  for (const p of pl.pts) k += `${r(p.x)},${r(p.y)};`;
  return k;
}

function labelFor(name: string, pts: readonly Pt[], maxH: number): PlotText | null {
  const text = name.trim();
  if (!text || pts.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  // Along the longer side, sized to fit: ~1.15 cap heights per character (HP-GL advance).
  const vertical = h > w * 1.2;
  const along = vertical ? h : w;
  const across = vertical ? w : h;
  const size = Math.min(maxH, (along * 0.8) / Math.max(1, text.length * 1.15), across / 4);
  if (!(size >= 1.5)) return null;
  return {
    text,
    at: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    heightMm: Math.round(size * 10) / 10,
    rotationDeg: vertical ? 90 : 0,
    align: 'center',
  };
}

const toMm = (pts: readonly Pt[], dx = 0, dy = 0): Pt[] =>
  pts.map((p) => ({ x: (p.x + dx) * CM, y: (p.y + dy) * CM }));

/** One pattern file, pieces where the file put them. */
export function plotFromPattern(
  pieces: readonly PieceDTO[],
  opts: PatternPlotOptions = {},
): PlotDrawing {
  const cutLayer = opts.cutLayer ?? pickCutLayer(pieces);
  const labels = opts.labels ?? true;
  const maxH = opts.labelHeightMm ?? 6;
  const warnings: string[] = [];

  // One contour per block: the one on the cut layer, else the largest. Loose (block-less)
  // contours each stand alone, filtered to the cut layer when any lies on it.
  const chosen: PieceDTO[] = [];
  const byBlock = new Map<string, PieceDTO[]>();
  const loose: PieceDTO[] = [];
  for (const p of pieces) {
    if (p.blockName) {
      const k = `${p.fileIndex ?? 0}|${p.blockName}`;
      const l = byBlock.get(k) ?? [];
      l.push(p);
      byBlock.set(k, l);
    } else loose.push(p);
  }
  for (const group of byBlock.values()) {
    const onCut = group.find((p) => p.layer === cutLayer);
    chosen.push(onCut ?? group.reduce((m, p) => (p.areaCm2 > m.areaCm2 ? p : m)));
  }
  const looseOnCut = loose.filter((p) => p.layer === cutLayer);
  chosen.push(...(looseOnCut.length ? looseOnCut : loose));

  // Pieces restored from a saved marker have no file position: laid out in a row to the right.
  let maxRight = 0;
  for (const p of chosen) if (p.originX != null) maxRight = Math.max(maxRight, p.originX + p.bboxW);
  let shelf = maxRight + 5;
  const unplaced: string[] = [];

  const polylines: PlotPolyline[] = [];
  const texts: PlotText[] = [];
  const seen = new Set<string>();
  const add = (pl: PlotPolyline) => {
    if (pl.pts.length < 2) return;
    const k = sig(pl);
    if (seen.has(k)) return;
    seen.add(k);
    polylines.push(pl);
  };
  for (const p of chosen) {
    let ox = p.originX;
    let oy = p.originY;
    if (ox == null || oy == null) {
      unplaced.push(p.name);
      ox = shelf;
      oy = 0;
      shelf += p.bboxW + 5;
    }
    const contour = toMm(p.poly, ox, oy);
    add({ pts: contour, closed: true, role: 'cut', layer: p.layer });
    for (const c of p.inner ?? [])
      add({
        pts: toMm(c.pts, ox, oy),
        closed: c.closed,
        role: roleOfLayer(c.layer),
        layer: c.layer,
      });
    if (labels) {
      const t = labelFor(p.name, contour, maxH);
      if (t) texts.push(t);
    }
  }
  if (unplaced.length)
    warnings.push(
      `${unplaced.length} piece(s) carry no position in the file and were laid out in a row: ${unplaced.slice(0, 6).join(', ')}`,
    );
  return { polylines, texts, warnings };
}

export type MarkerPlotOptions = {
  /** Fabric width, cm: draws the strip rectangle (draw pen) when given and `strip` is not false. */
  fabricWidthCm?: number;
  strip?: boolean;
  labels?: boolean;
  labelHeightMm?: number;
};

/** A marker: every placement through the shared placement transform. */
export function plotFromMarker(
  result: Pick<NestResult, 'placements' | 'usedLengthCm'>,
  pieces: readonly PieceDTO[],
  opts: MarkerPlotOptions = {},
): PlotDrawing {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const labels = opts.labels ?? true;
  const maxH = opts.labelHeightMm ?? 6;
  const polylines: PlotPolyline[] = [];
  const texts: PlotText[] = [];
  const warnings: string[] = [];
  if (opts.fabricWidthCm != null && opts.strip !== false) {
    const L = result.usedLengthCm * CM;
    const W = opts.fabricWidthCm * CM;
    polylines.push({
      pts: [
        { x: 0, y: 0 },
        { x: L, y: 0 },
        { x: L, y: W },
        { x: 0, y: W },
      ],
      closed: true,
      role: 'draw',
      layer: 'STRIP',
    });
  }
  let missing = 0;
  for (const pl of result.placements) {
    const p = byId.get(pl.pieceId);
    if (!p) {
      missing++;
      continue;
    }
    const contour = toMm(placedPoly(p.poly, pl));
    polylines.push({ pts: contour, closed: true, role: 'cut', layer: p.layer });
    for (const c of p.inner ?? [])
      if (c.pts.length >= 2)
        polylines.push({
          pts: toMm(placedPoly(c.pts, pl)),
          closed: c.closed,
          role: roleOfLayer(c.layer),
          layer: c.layer,
        });
    if (labels) {
      const t = labelFor(p.name, contour, maxH);
      if (t) texts.push(t);
    }
  }
  if (missing) warnings.push(`${missing} placement(s) refer to pieces that are not in the parse`);
  return { polylines, texts, warnings };
}
