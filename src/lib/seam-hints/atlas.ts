// THE ATLAS (SPEC-F §3): every DXF silhouette of the card on one PNG with its name on it, so the
// model can link the technical sketch to the pieces it is told about. Pieces sit on shelves, in
// their real proportions, one scale for the whole sheet. Sent on a run only, never digested.

import type { Pt2 } from 'lib/assembly-skeleton/types';

export type AtlasPiece = { name: string; outline: readonly Pt2[]; key?: string };
export type AtlasPlaced = {
  name: string;
  key?: string;
  /** The outline in sheet pixels, y down. */
  pts: Pt2[];
  x: number;
  y: number;
  w: number;
  h: number;
};
export type AtlasLayout = { width: number; height: number; placed: AtlasPlaced[] };

const MAX_PNG_BYTES = 2 * 1024 * 1024;
const LABEL_PX = 14;

/** Shelf layout at `pxPerMm`; rows no wider than `width`, a label line under every piece. */
export function atlasLayout(
  pieces: readonly AtlasPiece[],
  width = 1600,
  pxPerMm = 0.5,
): AtlasLayout {
  const gap = 16;
  const boxes = pieces
    .filter((piece) => piece.outline.length >= 3)
    .map((piece) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const [x, y] of piece.outline) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      const w = Math.max(1, (x1 - x0) * pxPerMm);
      const h = Math.max(1, (y1 - y0) * pxPerMm);
      // y up (DXF) → y down (canvas).
      const pts = piece.outline.map(([x, y]): Pt2 => [(x - x0) * pxPerMm, (y1 - y) * pxPerMm]);
      return { name: piece.name, key: piece.key, pts, w, h };
    })
    .sort((a, b) => b.h - a.h);

  const placed: AtlasPlaced[] = [];
  let x = gap;
  let y = gap;
  let rowH = 0;
  for (const box of boxes) {
    const cellW = Math.max(box.w, box.name.length * LABEL_PX * 0.62);
    if (x > gap && x + cellW + gap > width) {
      x = gap;
      y += rowH + LABEL_PX + gap * 2;
      rowH = 0;
    }
    placed.push({
      name: box.name,
      key: box.key,
      x,
      y,
      w: box.w,
      h: box.h,
      pts: box.pts.map(([px, py]): Pt2 => [px + x, py + y]),
    });
    x += cellW + gap;
    rowH = Math.max(rowH, box.h);
  }
  return { width, height: Math.ceil(y + rowH + LABEL_PX + gap * 2), placed };
}

function drawPng(layout: AtlasLayout): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#000';
  ctx.font = `${LABEL_PX}px monospace`;
  ctx.textBaseline = 'top';
  for (const piece of layout.placed) {
    ctx.beginPath();
    piece.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.stroke();
    ctx.fillText(piece.name, piece.x, piece.y + piece.h + 4);
  }
  const url = canvas.toDataURL('image/png');
  const comma = url.indexOf(',');
  return comma < 0 ? null : url.slice(comma + 1);
}

/** The labelled atlas as base64 PNG within 2 MiB (the scale halves until it fits), or null. */
export function atlasPngBase64(pieces: readonly AtlasPiece[]): string | null {
  if (pieces.length === 0) return null;
  for (
    let pxPerMm = 0.5, width = 1600;
    pxPerMm >= 0.06;
    pxPerMm /= 2, width = Math.max(800, width / 1.5)
  ) {
    const png = drawPng(atlasLayout(pieces, width, pxPerMm));
    if (!png) return null;
    // The bound is held on the base64 text itself (the stricter reading of the server's limit).
    if (png.length <= MAX_PNG_BYTES) return png;
  }
  return null;
}
