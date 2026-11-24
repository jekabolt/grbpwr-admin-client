import type { Chain, IRPath, Sheet } from 'lib/pattern-import/types';
import { bboxOf, pointInPoly } from '../pieces/geom';
import { selfIntersects } from '../pieces/gfit/checks';
import { textSeeds } from '../pieces/seeds';
import { fullyVisibleSourcePath } from '../pieces/source-visibility';

/** A solid pen in a graded legend may also draw a separate piece once for all sizes.
 * The source must show a single cut around a named piece, its cut instruction and grainline.
 * Any graded or unresolved ink in the piece's box leaves the previous classification intact.
 */
export function sharedCutOutlines(
  sheet: Sheet,
  chains: Chain[],
  internal: readonly number[],
  sizeLines: ReadonlySet<number>,
  labels: readonly string[],
): Set<number> {
  const shared = new Set<number>();
  if (sheet.holes?.length || sheet.missing?.length || sheet.refused?.length || !internal.length)
    return shared;
  const paths = new Map(sheet.paths.map((p) => [p.id, p]));
  const styles = new Map(sheet.styles.map((s) => [s.id, s]));
  const outlines: { id: number; path: IRPath }[] = [];
  for (const id of internal) {
    const c = chains[id];
    if (!c.closed || c.ranges.length !== 1 || c.motif?.length) continue;
    const r = c.ranges[0];
    const p = paths.get(r.path);
    const st = styles.get(c.style);
    if (
      p?.closed &&
      !p.background &&
      r.from === 0 &&
      r.to === p.pts.length &&
      st?.strokeRgb &&
      !st.fill &&
      !st.dash?.some((x) => x > 0) &&
      fullyVisibleSourcePath(p)
    )
      outlines.push({ id, path: p });
  }
  if (!outlines.length) return shared;
  const seeds = textSeeds(sheet, new Set(labels));
  const sizeBoxes = [...sizeLines].map((id) => bboxOf(chains[id].pts));
  const closed = chains.filter((c) => c.closed);
  for (const { id, path } of outlines) {
    const box = bboxOf(path.pts);
    if (
      sizeBoxes.some(
        (b) => b.minX <= box.maxX && b.maxX >= box.minX && b.minY <= box.maxY && b.maxY >= box.minY,
      )
    )
      continue;
    const contained = seeds.filter((s) => pointInPoly(s.at, path.pts));
    if (contained.length !== 1 || !contained[0].name || selfIntersects(path.pts)) continue;
    if (closed.some((c) => c.id !== id && pointInPoly(contained[0].at, c.pts))) continue;
    const notes = sheet.texts.filter((t) => pointInPoly(t.anchor, path.pts));
    if (
      notes.some(
        (t) =>
          /\b(?:placement|template|sizes?|views?)\b/i.test(t.text) ||
          labels.includes(t.text.trim()),
      )
    )
      continue;
    if (!notes.some((t) => /^\s*fabric\s*:\s*cut\s+\d+(?:\s+or\s+\d+)?\s*$/i.test(t.text)))
      continue;
    if (notes.some((t) => /^\s*grain\s*line\s*$/i.test(t.text))) shared.add(id);
  }
  return shared;
}
