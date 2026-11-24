import type {
  ChainSet,
  Feature,
  InternalFeature,
  IRPath,
  IRText,
  PieceCandidate,
  Sheet,
} from '../types';

import { bboxOf, dist, pointInPolygon } from './geom';

type Stroke = { path: IRPath; x: number; y: number; length: number; pen: string };
type Cross = Stroke & { vertical: Stroke };
type Row = { crosses: Cross[]; printed: (number | null)[] };
const near = 0.25;

/** The note may be split into a line of PDF text per baseline. Restrict the read to adjacent
 * lines in the same block. Placement words in another label do not describe a plus sign. */
function buttonInstructionFiles(texts: IRText[]): Set<string> {
  const notes = texts.filter((t) => {
    if (!/^\+\s*mark/i.test(t.text.trim())) return false;
    const lines = texts
      .filter(
        (q) =>
          q.src.file === t.src.file &&
          q.src.page === t.src.page &&
          Math.abs(q.anchor.x - t.anchor.x) < t.fontSizeMm &&
          q.anchor.y <= t.anchor.y + 0.1 &&
          q.anchor.y >= t.anchor.y - 6 * t.fontSizeMm &&
          Math.abs(q.rotationDeg) < 3,
      )
      .sort((a, b) => b.anchor.y - a.anchor.y);
    return /\+\s*markings? indicate button placement and cent(?:er|re) of vertical buttonholes/i.test(
      lines.map((q) => q.text.trim()).join(' '),
    );
  });
  return new Set(notes.map((t) => t.src.file));
}

function readRows(crosses: Cross[], sizes: string[], texts: IRText[]): Row[] {
  const rows: Row[] = [];
  const name = new Map(sizes.map((s, i) => [s.trim().toUpperCase(), i]));
  const labels = texts.filter(
    (t) => name.has(t.text.trim().toUpperCase()) && Math.abs(t.rotationDeg) < 3,
  );
  const sorted = [...crosses].sort((a, b) => a.y - b.y);
  for (let i = 0; i + sizes.length <= sorted.length; i++) {
    const row = sorted.slice(i, i + sizes.length);
    const gaps = row.slice(1).map((q, k) => q.y - row[k].y);
    const spacing = Math.min(...gaps);
    if (spacing < 1 || Math.max(...gaps) > spacing * 1.1) continue;
    const printed = row.map((q) => {
      const possible = labels.filter((t) => {
        const offset = (t.bbox.minY + t.bbox.maxY) / 2 - q.y;
        const gap = Math.min(
          Math.abs(t.bbox.maxX - (q.x - q.length / 2)),
          Math.abs(t.bbox.minX - (q.x + q.length / 2)),
        );
        return (
          t.src.file === q.path.src.file &&
          Math.abs(offset) < spacing / 2 &&
          gap < 1.5 * t.fontSizeMm
        );
      });
      return possible.length === 1
        ? name.get(possible[0].text.trim().toUpperCase())!
        : possible.length
          ? -1
          : null;
    });
    if (printed.filter((n) => n === null).length > 1) continue;
    for (const reverse of [false, true]) {
      if (!printed.every((n, k) => n === null || n === (reverse ? sizes.length - 1 - k : k)))
        continue;
      rows.push({
        crosses: reverse ? [...row].reverse() : row,
        printed: reverse ? [...printed].reverse() : printed,
      });
    }
  }
  return rows;
}

/** The printed "+" is one internal mark with two source strokes. Neighbouring sizes' marks
 * can lie entirely inside this cut. Keep this size's two arms when their complete labelled
 * series and a second row on the same front independently identify the pens. */
export function sizeLabelledButtons(
  candidates: readonly Pick<PieceCandidate, 'rank' | 'outer' | 'textsInside'>[],
  sizes: string[],
  sheet: Pick<Sheet, 'paths' | 'styles' | 'texts'>,
  set: Pick<ChainSet, 'assigned' | 'chains'>,
): ((features: Feature[], rank: number) => Feature[]) | null {
  if (sizes.length < 3 || candidates.length !== sizes.length) return null;
  const inside = new Set(candidates.flatMap((c) => c.textsInside));
  const texts = sheet.texts.filter((t) => inside.has(t.id));
  const files = buttonInstructionFiles(texts);
  if (!files.size) return null;
  const assigned = new Set(set.assigned?.map((a) => a.chain));
  const reserved = new Set(
    assigned.size
      ? set.chains.filter((c) => assigned.has(c.id)).flatMap((c) => c.ranges.map((r) => r.path))
      : [],
  );
  const box = bboxOf(candidates.flatMap((c) => c.outer));
  const horizontal: Stroke[] = [];
  const vertical = new Map<number, Stroke[]>();
  const yBin = (y: number) => Math.floor(y / near);
  for (const path of sheet.paths) {
    if (
      !files.has(path.src.file) ||
      reserved.has(path.id) ||
      path.closed ||
      path.pts.length !== 2 ||
      (path.background && path.background !== 'tile-label')
    )
      continue;
    const [a, b] = path.pts,
      x = (a.x + b.x) / 2,
      y = (a.y + b.y) / 2,
      length = dist(a, b);
    if (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY || length < 2 || length > 15)
      continue;
    const st = sheet.styles[path.style];
    if (!st || st.fill || !st.strokeRgb || st.widthMm <= 0) continue;
    if (st.clip) {
      const bounds = st.clip.split(':')[1]?.split(',').map(Number);
      if (
        !bounds ||
        bounds.length !== 4 ||
        !bounds.every(Number.isFinite) ||
        !path.pts.every(
          (p) => p.x >= bounds[0] && p.y >= bounds[1] && p.x <= bounds[2] && p.y <= bounds[3],
        )
      )
        continue;
    }
    const stroke = {
      path,
      x,
      y,
      length,
      pen: JSON.stringify([st.strokeRgb, st.widthMm, st.layer, st.dash]),
    };
    if (Math.abs(a.y - b.y) < near) horizontal.push(stroke);
    else if (Math.abs(a.x - b.x) < near) {
      const bin = yBin(y);
      const group = vertical.get(bin) ?? [];
      group.push(stroke);
      vertical.set(bin, group);
    }
  }
  const crosses: Cross[] = [];
  for (const h of horizontal) {
    const bin = yBin(h.y);
    const hits = [bin - 1, bin, bin + 1]
      .flatMap((k) => vertical.get(k) ?? [])
      .filter(
        (v) =>
          h.pen === v.pen &&
          h.path.src.file === v.path.src.file &&
          Math.abs(v.length - h.length) < near &&
          Math.hypot(v.x - h.x, v.y - h.y) < near,
      );
    // Equal-pen sizes may be literally overprinted. The original stroke order identifies
    // each pair on a tile. Across two registered tiles a unique mate is required.
    const next = hits
      .filter((v) => v.path.src.page === h.path.src.page && v.path.src.op > h.path.src.op)
      .sort((a, b) => a.path.src.op - b.path.src.op)[0];
    if (
      hits.length === 1 ||
      (next && hits.every((v) => v.path.pts.every((p, i) => dist(p, next.path.pts[i]) < near)))
    )
      crosses.push({ ...h, vertical: next ?? hits[0] });
  }
  const columns: Cross[][] = [];
  for (const c of crosses) {
    const col = columns.find(
      (g) =>
        c.path.src.file === g[0].path.src.file &&
        Math.abs(c.x - g[0].x) < near &&
        Math.abs(c.length - g[0].length) < near,
    );
    if (col) col.push(c);
    else columns.push([c]);
  }
  const owned = new Map<number, InternalFeature[]>();
  const paths = new Set<number>();
  const save = (row: Cross[]) => {
    if (
      !row.every((q, k) =>
        candidates.some(
          (c) =>
            c.rank === k &&
            [...q.path.pts, ...q.vertical.path.pts].every((p) => pointInPolygon(p, c.outer)),
        ),
      )
    )
      return;
    row.forEach((cross, rank) => {
      const marks = owned.get(rank) ?? [];
      for (const p of [cross.path, cross.vertical.path]) {
        paths.add(p.id);
        marks.push({
          kind: 'internal',
          pts: p.pts,
          closed: false,
          origin: 'detected',
          ranges: [{ path: p.id, from: 0, to: 1 }],
          confidence: 1,
          label: 'button placement',
        });
      }
      owned.set(rank, marks);
    });
  };
  for (const column of columns) {
    const rows = readRows(column, sizes, texts);
    if (rows.length < 2) continue;
    // A cropped number is accepted only if another directly numbered row shows that pen
    // at this rank. The same pen must occur at this rank throughout the series.
    const pens = rows[0].crosses.map((q) => q.pen);
    if (
      !pens.every(
        (pen, k) =>
          rows.every((r) => r.crosses[k].pen === pen) && rows.some((r) => r.printed[k] === k),
      )
    )
      continue;
    const numbered = rows.flatMap((r) => r.crosses);
    if (new Set(numbered).size !== numbered.length) continue;
    rows.forEach((r) => save(r.crosses));
    const remaining = column.filter((c) => !numbered.includes(c));
    // A shared location is printed once per size in the same pens. Equal-pen copies
    // must be identical; every size gets the one mark at its printed coordinates.
    for (const sample of remaining) {
      if (paths.has(sample.path.id)) continue;
      const group = remaining.filter((c) => Math.abs(c.y - sample.y) < near);
      if (
        group.length !== sizes.length ||
        new Set(group.map((q) => q.vertical.path.id)).size !== sizes.length
      )
        continue;
      const coincident = (a: IRPath, b: IRPath) =>
        [b.pts, [...b.pts].reverse()].some((points) =>
          a.pts.every((p, i) => dist(p, points[i]) < 0.01),
        );
      if (
        !group.every(
          (q) =>
            coincident(q.path, sample.path) && coincident(q.vertical.path, sample.vertical.path),
        )
      )
        continue;
      const pool = [...group],
        ordered: Cross[] = [];
      for (const pen of pens) {
        const i = pool.findIndex((q) => q.pen === pen);
        if (i < 0) break;
        ordered.push(pool.splice(i, 1)[0]);
      }
      if (ordered.length === sizes.length) save(ordered);
    }
  }
  if (!paths.size) return null;
  return (features, rank) => [
    ...features.filter(
      (f) =>
        !(
          f.origin === 'detected' &&
          f.ranges.length &&
          f.ranges.every((r) => paths.has(r.path)) &&
          (f.kind === 'internal' || f.kind === 'notch' || f.kind === 'drill')
        ),
    ),
    ...(owned.get(rank) ?? []),
  ];
}
