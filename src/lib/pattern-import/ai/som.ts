// SET-OF-MARK RENDER (F10) — the picture the model names pieces from.
//
// One overview of the assembled sheet: every source path in grey (filled paths filled, so labels
// drawn as CURVES — reef, blazer, r4454, wm — stay readable to the model), sheet text, each piece
// candidate outlined in its own colour with a light tint, and a BIG red numbered disc at a point
// well inside the piece (pole of inaccessibility, never a centroid that falls outside an L). Plus up
// to 12 close-ups of the pieces that read worst on the overview (smallest first).
//
// Worker-safe: OffscreenCanvas only (injectable for probes). Size-capped: overview long side ≤ 1568
// px (what the vision model actually looks at), crops ≤ 768 px, each file ≤ `maxBytes` — PNG first
// (line art), JPEG 0.85 / 0.7 when the PNG is too big, then a smaller redraw.
import type { BoxMm, IRPath, PieceFamily, PtMm, Seed, SeedId, Sheet, StageIO } from '../types';
import { buildMarks, markSources, type MarkSource } from './evidence';
import { bboxOf, distToOutline, inside, labelPoint } from './geom';

export type SomOptions = {
  overviewMaxPx: number;
  cropMaxPx: number;
  /** F9: ≤ 12 crops per call. */
  maxCrops: number;
  /** Per encoded picture. */
  maxBytes: number;
  /** A piece whose long side is below this on the overview gets a close-up. */
  cropBelowPx: number;
  /** Close-ups never magnify past this (≈ 250 dpi). */
  cropMaxPxPerMm: number;
  canvas: (w: number, h: number) => OffscreenCanvas;
};

export const SOM_DEFAULTS: Omit<SomOptions, 'canvas'> = {
  overviewMaxPx: 1568,
  cropMaxPx: 768,
  maxCrops: 12,
  maxBytes: 1_500_000,
  cropBelowPx: 260,
  cropMaxPxPerMm: 10,
};

const PALETTE = [
  '#1f6feb',
  '#2da44e',
  '#bf3989',
  '#9a6700',
  '#8250df',
  '#0a7f8a',
  '#cf222e',
  '#57606a',
];
const MARK_FILL = '#e00000';
/** Smallest disc that still carries a legible two-digit number. */
const MIN_DISC_PX = 9;

export type SomView = { boxMm: BoxMm; pxPerMm: number; widthPx: number; heightPx: number };

export type SomPlan = {
  overview: SomView;
  /** Where each mark's disc sits (sheet mm), in mark order. */
  markAt: PtMm[];
  /**
   * Disc radius per mark on the overview, px: the full size where the piece has room, down to the
   * piece's own inscribed radius (a waistband strip), and shrunk further where two discs would
   * touch — a number hidden under its neighbour is a piece the model never sees.
   */
  markRadiusPx: number[];
  crops: { mark: number; seed: SeedId; view: SomView }[];
};

const pad = (b: BoxMm, r: number, minMm: number): BoxMm => {
  const d = Math.max(minMm, Math.max(b.maxX - b.minX, b.maxY - b.minY) * r);
  return { minX: b.minX - d, minY: b.minY - d, maxX: b.maxX + d, maxY: b.maxY + d };
};

const viewOf = (box: BoxMm, pxPerMm: number): SomView => ({
  boxMm: box,
  pxPerMm,
  widthPx: Math.max(1, Math.round((box.maxX - box.minX) * pxPerMm)),
  heightPx: Math.max(1, Math.round((box.maxY - box.minY) * pxPerMm)),
});

/** Layout only — no pixels. Exported for the probe (sizes, caps, mark placement, crop choice). */
export function planSom(
  sources: readonly MarkSource[],
  dpi: number,
  opts: Omit<SomOptions, 'canvas'> = SOM_DEFAULTS,
): SomPlan {
  const boxes = sources.map((s) => bboxOf(s.outline));
  const all = boxes.reduce<BoxMm>(
    (u, b) => ({
      minX: Math.min(u.minX, b.minX),
      minY: Math.min(u.minY, b.minY),
      maxX: Math.max(u.maxX, b.maxX),
      maxY: Math.max(u.maxY, b.maxY),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const box = boxes.length ? pad(all, 0.03, 10) : { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const longMm = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  const k = Math.min(Math.max(dpi, 1) / 25.4, opts.overviewMaxPx / longMm);
  const overview = viewOf(box, k);
  const full = Math.max(13, Math.round(Math.max(overview.widthPx, overview.heightPx) / 70));
  const markAt = sources.map((s) => labelPoint(s.outline));
  const markRadiusPx = markAt.map((c, i) =>
    Math.max(MIN_DISC_PX, Math.min(full, distToOutline(c, sources[i].outline) * k * 1.15)),
  );
  // De-overlap in mark order: a disc that touches an earlier one first moves to the interior point
  // farthest from the discs already placed (stacked pieces — a lining square drawn exactly over its
  // shell square — share one label point), and only then shrinks.
  const gap = (p: PtMm, j: number) => {
    let g = Infinity;
    for (let i = 0; i < j; i++)
      g = Math.min(g, Math.hypot(p.x - markAt[i].x, p.y - markAt[i].y) * k - markRadiusPx[i]);
    return g;
  };
  for (let j = 1; j < markAt.length; j++) {
    if (gap(markAt[j], j) >= markRadiusPx[j] + 1) continue;
    const poly = sources[j].outline;
    const b = boxes[j];
    let best = markAt[j];
    let bestScore = Math.min(gap(best, j), distToOutline(best, poly) * k);
    const n = 24;
    for (let a = 1; a < n; a++)
      for (let c = 1; c < n; c++) {
        const p = {
          x: b.minX + ((b.maxX - b.minX) * a) / n,
          y: b.minY + ((b.maxY - b.minY) * c) / n,
        };
        if (!inside(p, poly)) continue;
        const score = Math.min(gap(p, j), distToOutline(p, poly) * k * 1.15);
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
    markAt[j] = best;
    markRadiusPx[j] = Math.max(MIN_DISC_PX, Math.min(full, bestScore - 1));
  }
  const small = sources
    .map((s, i) => ({
      i,
      longPx: Math.max(boxes[i].maxX - boxes[i].minX, boxes[i].maxY - boxes[i].minY) * k,
    }))
    .filter((x) => x.longPx < opts.cropBelowPx)
    .sort((a, b) => a.longPx - b.longPx)
    .slice(0, opts.maxCrops)
    .sort((a, b) => a.i - b.i);
  const crops = small.map(({ i }) => {
    const cb = pad(boxes[i], 0.06, 10);
    const long = Math.max(cb.maxX - cb.minX, cb.maxY - cb.minY);
    return {
      mark: i + 1,
      seed: sources[i].seed,
      view: viewOf(cb, Math.min(opts.cropMaxPx / long, opts.cropMaxPxPerMm)),
    };
  });
  return { overview, markAt, markRadiusPx, crops };
}

type Ctx = OffscreenCanvasRenderingContext2D;

function pathBox(p: IRPath): BoxMm {
  return bboxOf(p.pts);
}

const meets = (a: BoxMm, b: BoxMm) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

function drawView(
  ctx: Ctx,
  v: SomView,
  scale: number,
  sheet: Pick<Sheet, 'paths' | 'texts' | 'styles'>,
  pathBoxes: BoxMm[],
  sources: readonly MarkSource[],
  plan: SomPlan,
  focus: number | null,
) {
  const k = v.pxPerMm * scale;
  const X = (x: number) => (x - v.boxMm.minX) * k;
  const Y = (y: number) => (v.boxMm.maxY - y) * k;
  const W = Math.round(v.widthPx * scale);
  const H = Math.round(v.heightPx * scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 1 · the source drawing, grey. Filled paths are letters/arrows drawn as curves: fill them.
  const fills = new Map(sheet.styles.map((s) => [s.id, s.fill]));
  ctx.strokeStyle = '#a0a0a0';
  ctx.fillStyle = '#7a7a7a';
  ctx.lineWidth = 1;
  sheet.paths.forEach((p, i) => {
    if (p.pts.length < 2 || !meets(pathBoxes[i], v.boxMm)) return;
    ctx.beginPath();
    ctx.moveTo(X(p.pts[0].x), Y(p.pts[0].y));
    for (let j = 1; j < p.pts.length; j++) ctx.lineTo(X(p.pts[j].x), Y(p.pts[j].y));
    if (p.closed) ctx.closePath();
    if (fills.get(p.style) && p.closed) ctx.fill();
    else ctx.stroke();
  });

  // 2 · sheet text, where it is legible at this scale.
  ctx.fillStyle = '#333333';
  ctx.textBaseline = 'alphabetic';
  for (const t of sheet.texts) {
    const px = t.fontSizeMm * k;
    if (px < 5 || !meets(t.bbox, v.boxMm)) continue;
    ctx.save();
    ctx.translate(X(t.anchor.x), Y(t.anchor.y));
    if (t.rotationDeg) ctx.rotate((-t.rotationDeg * Math.PI) / 180);
    ctx.font = `${Math.round(px)}px sans-serif`;
    ctx.fillText(t.text, 0, 0);
    ctx.restore();
  }

  // 3 · the candidates: own colour + tint (the focused one only, in a crop).
  sources.forEach((s, i) => {
    const mine = focus === null || focus === i;
    const col = mine ? PALETTE[i % PALETTE.length] : '#b0b0b0';
    ctx.beginPath();
    s.outline.forEach((p, j) => (j ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.closePath();
    if (mine) {
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = col;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = col;
    ctx.lineWidth = mine ? (focus === null ? 2.5 : 3) : 1.5;
    ctx.stroke();
  });

  // 4 · the marks: big red discs, white numbers.
  sources.forEach((_, i) => {
    if (focus !== null && focus !== i) return;
    const r =
      (focus === null ? plan.markRadiusPx[i] : Math.max(16, Math.round(Math.max(W, H) / 22))) *
      scale;
    const c = plan.markAt[i];
    const x = X(c.x);
    const y = Y(c.y);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = MARK_FILL;
    ctx.fill();
    ctx.lineWidth = Math.max(2, r / 7);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(r * (i + 1 >= 10 ? 1.05 : 1.3))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x, y + r * 0.05);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  });
}

/** PNG, then JPEG 0.85 / 0.7, then a 0.75× redraw — whichever first fits `maxBytes`. */
async function encodeCapped(
  draw: (scale: number) => OffscreenCanvas,
  maxBytes: number,
): Promise<Blob> {
  let smallest: Blob | null = null;
  for (const scale of [1, 0.75, 0.56]) {
    const cv = draw(scale);
    for (const o of [
      { type: 'image/png' },
      { type: 'image/jpeg', quality: 0.85 },
      { type: 'image/jpeg', quality: 0.7 },
    ]) {
      const b = await cv.convertToBlob(o);
      if (b.size <= maxBytes) return b;
      if (!smallest || b.size < smallest.size) smallest = b;
    }
  }
  return smallest!;
}

/**
 * The `render-som` stage body (08-CONTRACT §2 `ai/`): marks + evidence + overview + crops. `dpi` is
 * the wanted resolution; the overview cap wins over it.
 */
export async function renderSom(
  sheet: Pick<Sheet, 'paths' | 'texts' | 'styles'>,
  families: readonly PieceFamily[],
  seeds: readonly Seed[],
  dpi: number,
  options: Partial<SomOptions> & { only?: readonly SeedId[] } = {},
): Promise<StageIO['render-som']['out']> {
  const opts: SomOptions = {
    ...SOM_DEFAULTS,
    canvas: (w, h) => new OffscreenCanvas(w, h),
    ...options,
  };
  const sources = markSources(families, seeds, options.only);
  const built = buildMarks(sheet, sources);
  const plan = planSom(sources, dpi, opts);
  const pathBoxes = sheet.paths.map(pathBox);
  const drawer = (v: SomView, focus: number | null) => (scale: number) => {
    const cv = opts.canvas(
      Math.max(1, Math.round(v.widthPx * scale)),
      Math.max(1, Math.round(v.heightPx * scale)),
    );
    const ctx = cv.getContext('2d') as Ctx | null;
    if (!ctx) throw new Error('render-som: no 2d context');
    drawView(ctx, v, scale, sheet, pathBoxes, sources, plan, focus);
    return cv;
  };
  const sheetPng = await encodeCapped(drawer(plan.overview, null), opts.maxBytes);
  const crops: StageIO['render-som']['out']['crops'] = [];
  for (const c of plan.crops)
    crops.push({
      seed: c.seed,
      mark: c.mark,
      png: await encodeCapped(drawer(c.view, c.mark - 1), opts.maxBytes),
    });
  return { sheetPng, crops, marks: built.marks, context: built.context };
}
