import type { IRPath, PtMm, Sheet, Style } from '../types';
import { dist, pointInPoly } from './geom';

/** At a printed corner a long dashed path can be split into three paint operations:
 * a solid corner, a short sample of the dash suffix, then the full dash again.
 * Reassemble only complete, unique cycles of that pen containing the piece label. */
export function keyedDashLoop(
  sheet: Pick<Sheet, 'paths' | 'styles'>,
  dash: number[],
  pen: Style,
  seed: PtMm,
) {
  if (dash.length < 2 || dash.some((v) => v <= 0)) return null;
  const styles = new Map(sheet.styles.map((s) => [s.id, s]));
  const matches = (a: number[] | null, b: number[]) =>
    a?.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 0.12 * b[i]);
  const paths = sheet.paths.filter((p) => {
    const s = styles.get(p.style);
    return (
      !p.closed &&
      (!p.background ||
        (p.background === 'tile-label' && p.pts.length === 3 && !s?.dash?.length)) &&
      p.pts.length >= 2 &&
      s &&
      !s.fill &&
      s.layer === pen.layer &&
      s.widthMm === pen.widthMm &&
      s.strokeRgb?.join() === pen.strokeRgb?.join()
    );
  });
  const bodies = paths.filter((p) => matches(styles.get(p.style)!.dash, dash));
  const tips = paths.filter((p) => matches(styles.get(p.style)!.dash, dash.slice(2)));
  if (bodies.length < 3 || (dash.length > 2 && !tips.length)) return null;
  const corners = paths.filter((p) => !styles.get(p.style)!.dash?.length && p.pts.length === 3);
  const last = (p: IRPath) => p.pts[p.pts.length - 1];
  // The solid corner ends one gap before the cap, the printed cap ends half a
  // gap before the next patterned path. The previous body ends half a gap back.
  const atGap = (a: IRPath, b: IRPath, gap: number) =>
    a.src.file === b.src.file &&
    Math.abs(dist(last(a), b.pts[0]) - gap) < Math.max(0.08, 0.13 * gap);
  const joins = new Map<number, IRPath[][]>();
  if (dash.length === 2) {
    for (const corner of corners) {
      const from = bodies.filter((p) => atGap(p, corner, styles.get(p.style)!.dash![1] / 2));
      const to = bodies.filter((p) => atGap(corner, p, styles.get(p.style)!.dash![1]));
      if (from.length !== 1 || to.length !== 1 || from[0] === to[0]) continue;
      const links = joins.get(from[0].id) ?? [];
      links.push([corner, to[0]]);
      joins.set(from[0].id, links);
    }
  }
  for (const tip of dash.length > 2 ? tips : []) {
    const gap = styles.get(tip.style)!.dash![1];
    const corner = corners.filter(
      (p) =>
        p.src.page === tip.src.page &&
        p.src.op < tip.src.op &&
        tip.src.op - p.src.op <= 12 &&
        atGap(p, tip, gap),
    );
    if (corner.length !== 1) continue;
    const from = bodies.filter((p) => atGap(p, corner[0], styles.get(p.style)!.dash![1] / 2));
    const to = bodies.filter((p) => atGap(tip, p, gap / 2));
    if (from.length !== 1 || to.length !== 1 || from[0] === to[0]) continue;
    const links = joins.get(from[0].id) ?? [];
    links.push([corner[0], tip, to[0]]);
    joins.set(from[0].id, links);
  }
  const loops = [];
  const checked = new Set<number>();
  for (const start of bodies) {
    if (checked.has(start.id)) continue;
    const seen = new Set<number>();
    const ordered: IRPath[] = [];
    let body = start;
    while (!seen.has(body.id)) {
      const links = joins.get(body.id);
      if (links?.length !== 1) break;
      seen.add(body.id);
      ordered.push(body, ...links[0].slice(0, -1));
      body = links[0].at(-1)!;
    }
    if (body !== start || seen.size < 3) continue;
    for (const id of seen) checked.add(id);
    const pts = ordered.flatMap((p) => p.pts);
    if (pointInPoly(seed, pts)) loops.push({ pts, paths: new Set(ordered.map((p) => p.id)) });
  }
  return loops.length === 1 ? loops[0] : null;
}
