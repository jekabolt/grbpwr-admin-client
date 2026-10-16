// Probe entry — bundled by scripts/plt-roundtrip-probe.mjs and run in node.
//
// DXF → (the app's DXF reader) → PieceDTO → plotFromPattern / plotFromMarker → dxfToHpgl →
// (the IMPORT's HP-GL reader, a separate implementation) → compare with the framed drawing.
// The comparison code is deliberately local: it must not call the writer's helpers.
import type { NestResult, PieceDTO, Placement } from '../src/lib/nesting/types';
import { NEST_DEFAULTS } from '../src/lib/nesting/types';
import { parseSheets } from '../src/lib/nesting/worker/parse-files';
import { extractHpgl } from '../src/lib/pattern-import/adapters/hpgl';
import {
  dxfToHpgl,
  frameDrawing,
  HPGL_DEFAULTS,
  type HpglOptions,
  type PlotDrawing,
} from '../src/lib/pattern-export/hpgl';
import { plotFromMarker, plotFromPattern } from '../src/lib/pattern-export/plot-drawing';
import { pltToPdf } from '../src/lib/pattern-export/plt-pdf';

export { pltToPdf, dxfToHpgl };
export { readPltSheet, drawingFromPltSheet } from '../src/lib/pattern-export/plt-pdf';
export { planPdf } from '../src/lib/pattern-export/dxf-pdf';

type P = { x: number; y: number };

export async function parseDxf(name: string, bytes: ArrayBuffer): Promise<PieceDTO[]> {
  const res = await parseSheets([{ name, open: async () => bytes }], {
    unit: 'auto',
    tol: NEST_DEFAULTS.tol,
    tolChain: NEST_DEFAULTS.tolChain,
  });
  return res.pieces;
}

function segDist(p: P, a: P, b: P): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function toPolyline(p: P, pl: P[]): number {
  let m = Infinity;
  for (let i = 0; i + 1 < pl.length; i++) m = Math.min(m, segDist(p, pl[i], pl[i + 1]));
  if (pl.length === 1) m = Math.hypot(p.x - pl[0].x, p.y - pl[0].y);
  return m;
}
function hausdorff(a: P[], b: P[]): number {
  let m = 0;
  for (const p of a) m = Math.max(m, toPolyline(p, b));
  for (const p of b) m = Math.max(m, toPolyline(p, a));
  return m;
}

export type RoundTrip = {
  label: string;
  bytes: number;
  pens: Record<string, { expected: number; got: number }>;
  cutPieces: { expected: number; got: number };
  texts: { expected: number; got: number };
  maxDevMm: number;
  meanDevMm: number;
  sizeMm: { expected: [number, number]; got: [number, number] };
  warnings: string[];
  plt: string;
};

export async function roundTrip(
  label: string,
  drawing: PlotDrawing,
  opts: HpglOptions = {},
): Promise<RoundTrip> {
  const plt = dxfToHpgl(drawing, opts);
  const framed = frameDrawing(drawing, opts);
  const pens = { ...HPGL_DEFAULTS.pens, ...(opts.pens ?? {}) };
  const enc = new TextEncoder().encode(plt);
  const doc = await extractHpgl(
    { id: 'rt', name: `${label}.plt`, bytes: enc.buffer as ArrayBuffer },
    { sagittaMm: 0.05, keepFills: true },
  );
  const page = doc.pages[0];
  const styleLayer = new Map(page.styles.map((s) => [s.id, s.layer]));
  const gotByPen = new Map<number, P[][]>();
  for (const p of page.paths) {
    const pen = Number((styleLayer.get(p.style) ?? 'pen 1').replace('pen ', ''));
    const l = gotByPen.get(pen) ?? [];
    l.push(p.pts);
    gotByPen.set(pen, l);
  }
  const expByPen = new Map<number, P[][]>();
  const roleOrder = ['draw', 'notch', 'cut'];
  const sorted = [...framed.polylines].sort(
    (a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role),
  );
  for (const pl of sorted) {
    const pen = pens[pl.role];
    const l = expByPen.get(pen) ?? [];
    const pts = pl.closed ? [...pl.pts, pl.pts[0]] : pl.pts;
    l.push(pts);
    expByPen.set(pen, l);
  }
  let maxDev = 0;
  let sum = 0;
  let n = 0;
  const penReport: Record<string, { expected: number; got: number }> = {};
  for (const pen of new Set([...expByPen.keys(), ...gotByPen.keys()])) {
    const e = expByPen.get(pen) ?? [];
    const g = gotByPen.get(pen) ?? [];
    penReport[`SP${pen}`] = { expected: e.length, got: g.length };
    for (let i = 0; i < Math.min(e.length, g.length); i++) {
      const d = hausdorff(e[i], g[i]);
      maxDev = Math.max(maxDev, d);
      sum += d;
      n++;
    }
  }
  const cutExp = framed.polylines.filter((p) => p.role === 'cut').length;
  // The reader shifts the page only for negative coordinates; the default anchor keeps all ≥ 0.
  let gx0 = Infinity;
  let gy0 = Infinity;
  let gx1 = -Infinity;
  let gy1 = -Infinity;
  for (const p of page.paths)
    for (const q of p.pts) {
      gx0 = Math.min(gx0, q.x);
      gy0 = Math.min(gy0, q.y);
      gx1 = Math.max(gx1, q.x);
      gy1 = Math.max(gy1, q.y);
    }
  let ex0 = Infinity;
  let ey0 = Infinity;
  let ex1 = -Infinity;
  let ey1 = -Infinity;
  for (const pl of framed.polylines)
    for (const q of pl.pts) {
      ex0 = Math.min(ex0, q.x);
      ey0 = Math.min(ey0, q.y);
      ex1 = Math.max(ex1, q.x);
      ey1 = Math.max(ey1, q.y);
    }
  return {
    label,
    bytes: enc.length,
    pens: penReport,
    cutPieces: { expected: cutExp, got: (gotByPen.get(pens.cut) ?? []).length },
    texts: { expected: framed.texts.length, got: page.texts.length },
    maxDevMm: maxDev,
    meanDevMm: n ? sum / n : 0,
    sizeMm: { expected: [ex1 - ex0, ey1 - ey0], got: [gx1 - gx0, gy1 - gy0] },
    warnings: [...framed.warnings, ...doc.warnings],
    plt,
  };
}

export { plotFromPattern, plotFromMarker };

/** A hand-made marker: pieces in a row, alternating rotation, every third mirrored. */
export function rowMarker(pieces: PieceDTO[]): { result: NestResult; widthCm: number } {
  const placements: Placement[] = [];
  let x = 0;
  let widthCm = 0;
  pieces.forEach((p, i) => {
    const rot = (i % 2 ? 90 : 0) as 0 | 90;
    const flipped = i % 3 === 2;
    // Local bbox of the variant to place it at x ≥ current.
    const v = p.poly.map((q) => {
      const m = flipped ? { x: -q.x, y: q.y } : q;
      return rot === 90 ? { x: -m.y, y: m.x } : m;
    });
    const minX = Math.min(...v.map((q) => q.x));
    const maxX = Math.max(...v.map((q) => q.x));
    const minY = Math.min(...v.map((q) => q.y));
    const maxY = Math.max(...v.map((q) => q.y));
    placements.push({ pieceId: p.id, instance: 0, rot, flipped, x: x - minX, y: -minY });
    x += maxX - minX + 1;
    widthCm = Math.max(widthCm, maxY - minY);
  });
  return {
    result: {
      placements,
      usedLengthCm: x,
      efficiency: 0,
      placedCount: placements.length,
      totalCount: placements.length,
      unplaced: [],
      generation: 0,
      elapsedMs: 0,
      cancelled: false,
      warnings: [],
    },
    widthCm: Math.ceil(widthCm + 1),
  };
}
