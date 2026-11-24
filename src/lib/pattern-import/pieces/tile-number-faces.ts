import type { BoxMm, Sheet } from 'lib/pattern-import/types';
import { isLightGrey } from '../chains/classify';
import type { FaceBlob } from './faces';
import { bboxOf, pointInPoly, segIntersect } from './geom';

// Some tiled PDFs print the index as both text and a stroked compound glyph.
// Its counter (the hole in a 4 or 8) can seed a graded family in the raster.
export function markTileNumberFaces(sheet: Sheet, blobs: FaceBlob[]) {
  if (sheet.poses.length < 3 || new Set(sheet.poses.map((p) => p.file)).size !== 1) return;
  const pages = [...sheet.poses].sort((a, b) => a.page - b.page);
  const labels = pages.map((p, i) =>
    sheet.texts.filter(
      (t) =>
        t.src.page === p.page &&
        t.src.file === p.file &&
        t.rotationDeg === 0 &&
        t.text.trim() === String(i + 1) &&
        t.fontSizeMm > 0.15 * p.heightMm,
    ),
  );
  if (labels.some((ts) => ts.length !== 1)) return;
  const base = labels[0][0];
  if (
    labels.some(
      ([t], i) =>
        Math.abs(t.fontSizeMm - base.fontSizeMm) > 0.1 ||
        Math.abs(t.anchor.y - pages[i].toSheet.f - (base.anchor.y - pages[0].toSheet.f)) > 2,
    )
  )
    return;
  for (const blob of blobs) {
    if (blob.junk || blob.textSeed != null) continue;
    const inside = (b: BoxMm, p: { x: number; y: number }) =>
      p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
    const matching = labels.flat().filter((t) => inside(t.bbox, blob.at));
    if (matching.length !== 1) continue;
    const t = matching[0],
      b = blob.box;
    const corners = [
      { x: b.minX, y: b.minY },
      { x: b.maxX, y: b.minY },
      { x: b.maxX, y: b.maxY },
      { x: b.minX, y: b.maxY },
    ];
    const strokes = sheet.paths.filter(
      (p) =>
        p.pts.some((q) => inside(b, q)) ||
        p.pts.some(
          (q, i) =>
            (i > 0 || p.closed) &&
            corners.some((v, k) =>
              segIntersect(
                v,
                corners[(k + 1) % 4],
                q,
                p.pts[(i + p.pts.length - 1) % p.pts.length],
              ),
            ),
        ),
    );
    const outer = strokes.find(
      (p) =>
        p.closed &&
        pointInPoly(blob.at, p.pts) &&
        Object.entries(bboxOf(p.pts)).every(([k, v]) => Math.abs(v - b[k as keyof BoxMm]) <= 3),
    );
    if (
      !outer ||
      strokes.length < 2 ||
      !strokes.every(
        (p) =>
          p.closed &&
          p.src.page === t.src.page &&
          p.src.op === outer.src.op &&
          p.src.file === t.src.file &&
          p.style === outer.style &&
          p.pts.every((q) => inside(t.bbox, q)),
      )
    )
      continue;
    const style = sheet.styles[outer.style];
    if (isLightGrey(style) && !style.fill && !style.dash?.length && style.clip?.startsWith('f'))
      blob.junk = 'background';
  }
}
