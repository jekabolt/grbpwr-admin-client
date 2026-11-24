import type { ChainSet, IRPath, LineClass, PtMm, Sheet } from '../types';
import { dist, polyLen } from '../chains/geom';

type Stroke = { wall: number; path: IRPath; gap: number };
type Loop = { pts: PtMm[]; walls: number[] };

/** The path order in the PDF carries the dash phase. A solid corner begins half
 * a space after its incoming train and ends one full space before its successor. */
export function dashPanelLoops(
  sheet: Pick<Sheet, 'paths' | 'styles'>,
  set: ChainSet,
  cls: LineClass,
  excluded: ReadonlySet<number>,
): Loop[] {
  const key = cls.evidence.find((e) => e.kind === 'legend-sample');
  if (key?.kind !== 'legend-sample') return [];
  const paths = new Map(sheet.paths.map((p) => [p.id, p]));
  const legend = set.chains[key.chain];
  if (legend?.ranges.length !== 1) return [];
  const sample = paths.get(legend.ranges[0].path);
  if (!sample) return [];
  const ink = sheet.styles[sample.style],
    rhythm = ink.dash;
  if (rhythm?.length !== 2 || !rhythm.every((d) => d > 0)) return [];
  const owned = new Set(cls.chains);
  const body: Stroke[] = [],
    turns: Stroke[] = [];
  for (const ch of set.chains) {
    if (ch.ranges.length !== 1 || ch.id === key.chain || excluded.has(ch.id)) continue;
    const p = paths.get(ch.ranges[0].path);
    if (!p || p.closed || p.background || p.src.file !== sample.src.file || p.pts.length < 2)
      continue;
    const pen = sheet.styles[p.style];
    if (
      pen.fill ||
      pen.widthMm !== ink.widthMm ||
      pen.layer !== ink.layer ||
      String(pen.strokeRgb) !== String(ink.strokeRgb)
    )
      continue;
    const d = pen.dash;
    if (
      owned.has(ch.id) &&
      d?.length === 2 &&
      d.every((v, i) => Math.abs(v / rhythm[i] - 1) < 0.05)
    )
      body.push({ wall: ch.id, path: p, gap: d[1] });
    else if (!d?.length && p.pts.length >= 3 && polyLen(p.pts) <= 1.5 * rhythm[0])
      turns.push({ wall: ch.id, path: p, gap: 0 });
  }
  const start = (s: Stroke) => s.path.pts[0],
    end = (s: Stroke) => s.path.pts.at(-1)!;
  const edges = new Map<Stroke, { turn: Stroke; next: Stroke }>();
  const incoming = new Map<Stroke, number>(),
    use = new Map<Stroke, number>();
  for (const b of body) {
    const options = [];
    for (const t of turns) {
      if (Math.abs(dist(end(b), start(t)) / b.gap - 0.5) > 0.07) continue;
      for (const n of body)
        if (Math.abs(dist(end(t), start(n)) / n.gap - 1) < 0.075) {
          options.push({ turn: t, next: n });
          incoming.set(n, (incoming.get(n) ?? 0) + 1);
          use.set(t, (use.get(t) ?? 0) + 1);
        }
    }
    if (options.length === 1) edges.set(b, options[0]);
  }
  const seen = new Set<Stroke>(),
    loops: Loop[] = [];
  for (const first of body) {
    let b = first;
    const pts: PtMm[] = [],
      walls: number[] = [];
    while (!seen.has(b)) {
      seen.add(b);
      const edge = edges.get(b);
      if (!edge || incoming.get(b) !== 1 || use.get(edge.turn) !== 1) break;
      walls.push(b.wall, edge.turn.wall);
      pts.push(...b.path.pts, ...edge.turn.path.pts);
      b = edge.next;
      if (b === first) {
        if (walls.length >= 6) loops.push({ pts, walls });
        break;
      }
    }
  }
  return loops;
}
