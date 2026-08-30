import { urlToDataUrl } from 'lib/features/getCropped';

import { DEFAULT_RATIO, strokeGeometry, type VectorStroke } from './vector-strokes';

/**
 * THE ONE RASTERISER — «base picture + strokes» into a PNG data URL, and there is deliberately no
 * second one.
 *
 * It was born as a private callback inside `vector-modal.tsx`, whose only exit was minting a NEW
 * picture (`edit ▸ → save as picture`). W-10 gave it a second caller: a FIX run wants each marked
 * plate handed to the model ALREADY MARKED UP, so `fix-markup.tsx` rasterises «plate + layer» at
 * launch and sends the result as extra input media. The function moved OUT rather than being
 * copied, because two places drawing the same strokes with two canvases drift silently — a line
 * weight nudged in one of them and the model would receive marks the editor never showed.
 *
 * THE BASE IS RE-FETCHED THROUGH THE CORS PROXY rather than reused from any `<img>` on screen: a
 * media-server image painted onto a canvas TAINTS it, and `toDataURL` on a tainted canvas throws a
 * SecurityError. That is the same dance the cropper and the zoom viewer already do.
 */

/** The widest raster this produces. Past it a line drawing gains no readable detail. */
export const RASTER_MAX_W = 1600;

/**
 * The width of a raster with NO base picture underneath, and the box the SVG download opens at.
 * One number on purpose: a drawing from nothing should come back the same size it exports at.
 */
export const RASTER_FALLBACK_W = 800;

/** Paint base + strokes into one canvas and hand back a PNG data URL. */
export async function rasteriseStrokesOverBase({
  baseSrc,
  strokes,
  ratio,
}: {
  /** The picture underneath, or '' — a drawing from nothing rasterises onto white alone. */
  baseSrc?: string;
  strokes: readonly VectorStroke[];
  /** The frame's width/height ratio; only consulted when there is no base to measure. */
  ratio?: number;
}): Promise<string> {
  let image: HTMLImageElement | null = null;
  if (baseSrc) {
    const dataUrl = await urlToDataUrl(baseSrc);
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    image = img;
  }
  const naturalW = image?.naturalWidth ?? 0;
  const naturalH = image?.naturalHeight ?? 0;
  const w = Math.min(RASTER_MAX_W, naturalW > 0 ? naturalW : RASTER_FALLBACK_W);
  const h = Math.max(
    1,
    Math.round(
      naturalW > 0 && naturalH > 0 ? (w * naturalH) / naturalW : w / (ratio || DEFAULT_RATIO),
    ),
  );

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('this browser refused a drawing canvas');

  // A FLAT IS INK ON PAPER. Flattening onto transparency gives a file that reads as an empty
  // rectangle wherever it is shown on a dark ground, so the ground is painted first — the same
  // white the editor stages the drawing on.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  if (image) ctx.drawImage(image, 0, 0, w, h);

  ctx.strokeStyle = '#000000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    const g = strokeGeometry(stroke, w, h);
    if (!g.d) continue;
    const path = new Path2D(g.d);
    ctx.lineWidth = g.strokeWidth;
    ctx.setLineDash(g.dash ? g.dash.split(' ').map(Number) : []);
    for (const dy of g.offsets) {
      ctx.save();
      ctx.translate(0, dy);
      ctx.stroke(path);
      ctx.restore();
    }
  }
  ctx.setLineDash([]);
  return canvas.toDataURL('image/png');
}
