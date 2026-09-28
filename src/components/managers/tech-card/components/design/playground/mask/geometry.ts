/**
 * ═══ THE PAINTED ZONE, AS THE SERVER TAKES IT (C-11, D3 phase 2) ══════════════════════════════════
 *
 * A person paints with a round brush; the server takes ONE region per retouch, and a region is a
 * POLYGON of 3..12 points in 0..1 fractions of the picture, at most six decimals, no repeated
 * neighbouring corner, and an area of at least 1e-5 of the frame (`designRefuseMalformedRegion` /
 * `designRefuseDegenerateRegion`, backend `apisrv/admin/design_freeform.go`). So the strokes become
 * the CONVEX HULL of everything the brush touched:
 *
 *   1. every stroke point stands for a disc of the brush's radius, sampled at eight angles, so the
 *      hull covers the paint and not only the line through its centre (a one-click dot is an
 *      octagon, never a point);
 *   2. the hull of all those samples (monotone chain; collinear corners dropped);
 *   3. more than twelve corners → the CIRCUMSCRIBED twelve-gon: the support lines of the hull in
 *      twelve directions, 30° apart, cut each other in at most twelve corners. It ENCLOSES the hull
 *      — dropping corners instead would shave off painted tips, and the zone would lose what the
 *      person painted;
 *   4. clamped into the picture, rounded to four decimals (a tenth of a pixel on a 1000 px frame,
 *      the old playground's rule) and hulled once more, so rounding cannot leave a repeated corner.
 *
 * ⚠ PHASE 2 IS A WINDOW, NOT A MASK (window.go): the server cuts a rectangle around this polygon
 * (padded to ≥ 512 px), has it redrawn and pastes the whole rectangle back. The polygon decides
 * WHERE; it does not protect the pixels around the zone — the editor says so under the brush.
 *
 * ⚠ PHASE 3 (C-14). A real inpaint mask is the SAME strokes rasterised white on black at the
 * picture's own size: `paintStrokes` is the one painter (the overlay on screen and the mask use
 * it), and `maskPng` below draws it; `mask-upload.ts` sends it once per paint where the server
 * lists `inpaint` in `run_kinds`. Elsewhere the polygon above is still the whole request.
 */

/** A point in fractions of the picture: x of its width, y of its height, both 0..1. */
export type MaskPoint = { x: number; y: number };

/**
 * One press-drag-release of the brush. `size` is the brush RADIUS as a fraction of the picture's
 * SHORTER side, so a stroke stays round on a tall or a wide picture.
 */
export type MaskStroke = { size: number; points: readonly MaskPoint[] };

/** The brush radii the toolbar offers, as fractions of the picture's shorter side. */
export const BRUSH_SIZES = { s: 0.015, m: 0.03, l: 0.06 } as const;
export type BrushSize = keyof typeof BRUSH_SIZES;

/** The door's own limits (design_freeform.go): corners per region and the smallest area. */
export const REGION_MIN_POINTS = 3;
export const REGION_MAX_POINTS = 12;
export const REGION_MIN_AREA = 0.00001;

/** Decimals a corner travels with (the door takes up to six). */
const DECIMALS = 4;
const SCALE = 10 ** DECIMALS;
/** Angles a brush disc is sampled at. */
const DISC_SAMPLES = 8;
/** Directions of the circumscribed polygon's support lines. */
const RING = REGION_MAX_POINTS;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const round = (v: number): number => Math.round(clamp01(v) * SCALE) / SCALE;

/**
 * The disc radius of a stroke in each axis' own fraction. `aspect` = width / height of the
 * picture: on a wide picture one unit of x is longer than one unit of y.
 */
function radiiOf(size: number, aspect: number): { rx: number; ry: number } {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  // shorter side = min(W, H); rx = size·min/W, ry = size·min/H.
  return a >= 1 ? { rx: size / a, ry: size } : { rx: size, ry: size * a };
}

/** Every point the brush covered, as disc samples, clamped into the picture. */
export function paintedSamples(strokes: readonly MaskStroke[], aspect: number): MaskPoint[] {
  const out: MaskPoint[] = [];
  for (const stroke of strokes) {
    const { rx, ry } = radiiOf(stroke.size, aspect);
    for (const p of stroke.points) {
      for (let k = 0; k < DISC_SAMPLES; k++) {
        const t = (2 * Math.PI * k) / DISC_SAMPLES;
        out.push({ x: clamp01(p.x + rx * Math.cos(t)), y: clamp01(p.y + ry * Math.sin(t)) });
      }
    }
  }
  return out;
}

const cross = (o: MaskPoint, a: MaskPoint, b: MaskPoint): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/**
 * The convex hull (Andrew's monotone chain): corners in order, no repeat, no collinear corner.
 * Fewer than three distinct points, or all on one line, → the points it has (a degenerate answer
 * the caller refuses).
 */
export function convexHull(points: readonly MaskPoint[]): MaskPoint[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const uniq: MaskPoint[] = [];
  for (const p of pts) {
    const last = uniq[uniq.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) uniq.push(p);
  }
  if (uniq.length < 3) return uniq;
  const lower: MaskPoint[] = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: MaskPoint[] = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/**
 * THE CIRCUMSCRIBED TWELVE-GON of a convex polygon: the support line in each of twelve directions
 * and the corners where neighbouring lines cross. Every point of `hull` is inside it.
 */
export function circumscribed(hull: readonly MaskPoint[]): MaskPoint[] {
  const dirs = Array.from({ length: RING }, (_, k) => {
    const t = (2 * Math.PI * k) / RING;
    return { ux: Math.cos(t), uy: Math.sin(t) };
  });
  const h = dirs.map(({ ux, uy }) => Math.max(...hull.map((p) => p.x * ux + p.y * uy)));
  const out: MaskPoint[] = [];
  for (let k = 0; k < RING; k++) {
    const j = (k + 1) % RING;
    const a = dirs[k];
    const b = dirs[j];
    const det = a.ux * b.uy - a.uy * b.ux;
    out.push({
      x: (h[k] * b.uy - a.uy * h[j]) / det,
      y: (a.ux * h[j] - h[k] * b.ux) / det,
    });
  }
  return out;
}

/** Twice the signed area (shoelace); its absolute half is the area the door measures. */
export function polygonArea(points: readonly MaskPoint[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/**
 * THE ZONE AS IT TRAVELS: 3..12 corners in 0..1, four decimals, convex, area ≥ 1e-5 — or `null`
 * when nothing was painted or what was painted has no area the door would take.
 */
export function zoneOfStrokes(strokes: readonly MaskStroke[], aspect: number): MaskPoint[] | null {
  const samples = paintedSamples(strokes, aspect);
  if (!samples.length) return null;
  let hull = convexHull(samples);
  if (hull.length > REGION_MAX_POINTS) hull = circumscribed(hull);
  const zone = convexHull(hull.map((p) => ({ x: round(p.x), y: round(p.y) })));
  if (zone.length < REGION_MIN_POINTS || zone.length > REGION_MAX_POINTS) return null;
  if (polygonArea(zone) < REGION_MIN_AREA) return null;
  return zone;
}

/** A corner as the decimal string the wire carries («0.4646»), never exponent notation. */
export const cornerText = (v: number): string => round(v).toFixed(DECIMALS);

/* ─────────────────────────── painting (the overlay, and phase 3's mask) ─────────────────────────── */

/**
 * THE ONE PAINTER. Draws the strokes onto a 2D context whose drawing area is `width` × `height`
 * pixels and maps the picture onto it: the editor's overlay calls it at screen size, `maskPng` at
 * the picture's own size. Round caps and joins, so a stroke is the union of the discs the hull
 * reads.
 */
export function paintStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly MaskStroke[],
  width: number,
  height: number,
  colour: string,
): void {
  const shorter = Math.min(width, height);
  ctx.save();
  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    const r = stroke.size * shorter;
    const pts = stroke.points;
    if (!pts.length) continue;
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x * width, pts[0].y * height, r, 0, 2 * Math.PI);
      ctx.fill();
      continue;
    }
    ctx.lineWidth = 2 * r;
    ctx.beginPath();
    ctx.moveTo(pts[0].x * width, pts[0].y * height);
    for (const p of pts.slice(1)) ctx.lineTo(p.x * width, p.y * height);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * THE LARGEST MASK THIS CLIENT DRAWS (G-03 M-1). The server takes sources up to 12000 px a side and
 * 40 MP; a browser does not draw every canvas that size. Safari (iOS, and macOS before 16) refuses a
 * canvas over 16 777 216 pixels (4096²) — `getContext`/`toBlob` answer null — and every browser caps a
 * side (Chromium and Firefox at 32 767). Over this budget the mask is not attempted: the picture takes
 * the phase-2 rectangle path and the editor says so (`retouchRoute`). A null from a canvas under the
 * budget (memory) is caught at the press the same way (`MaskNotDrawn`).
 */
export const MASK_MAX_AREA = 4096 * 4096;
export const MASK_MAX_SIDE = 16384;

/** Whether this client will try to draw a mask at `width` × `height` pixels. */
export const maskDrawable = (width: number, height: number): boolean =>
  width > 0 &&
  height > 0 &&
  width <= MASK_MAX_SIDE &&
  height <= MASK_MAX_SIDE &&
  width * height <= MASK_MAX_AREA;

/**
 * THE INPAINT MASK (C-14): white where painted, black elsewhere, at the picture's own pixel size, as
 * a PNG (white = repaint, the fill route's polarity). Uploaded by `mask-upload.ts`; the dimension
 * check against the source and the composite through the mask are the server's. `null` = this
 * browser cannot draw it (over the budget, no context, or an encoder that answers nothing).
 */
export async function maskPng(
  strokes: readonly MaskStroke[],
  width: number,
  height: number,
): Promise<Blob | null> {
  if (!maskDrawable(width, height)) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    paintStrokes(ctx, strokes, width, height, '#ffffff');
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } catch {
    return null;
  }
}
