import type { Chain, IRText, PieceCandidate, PtMm } from '../types';
import { foldEdges, foldWordRole, FOLD_TOL_MM, type FoldEdge, type OtherLines } from './fold';
import { dist } from './geom';

/** Is the printed baseline immediately along the edge, with the whole word over the segment? */
function labelsEdge(t: IRText, e: FoldEdge) {
  const ux = (e.b.x - e.a.x) / e.lenMm;
  const uy = (e.b.y - e.a.y) / e.lenMm;
  const rad = (t.rotationDeg * Math.PI) / 180;
  if (Math.abs(ux * Math.sin(rad) - uy * Math.cos(rad)) > Math.sin(Math.PI / 60)) return false;
  const along = (p: PtMm) => ux * (p.x - e.a.x) + uy * (p.y - e.a.y);
  if (Math.abs(ux * (t.anchor.y - e.a.y) - uy * (t.anchor.x - e.a.x)) > t.fontSizeMm) return false;
  return [t.bbox.minX, t.bbox.maxX].every((x) =>
    [t.bbox.minY, t.bbox.maxY].every((y) => {
      const s = along({ x, y });
      return s >= 0 && s <= e.lenMm;
    }),
  );
}

function sameSegment(a: PtMm, b: PtMm, edge: FoldEdge) {
  return (
    (dist(a, edge.a) <= FOLD_TOL_MM && dist(b, edge.b) <= FOLD_TOL_MM) ||
    (dist(b, edge.a) <= FOLD_TOL_MM && dist(a, edge.b) <= FOLD_TOL_MM)
  );
}

/** A nested piece may print FOLD once and SIZE <label> beside the displaced edge of every
 * size. Bind each edge from its own printed text and closed source chain. The edges must be
 * translated copies at distinct positions, ordered by grade, on the same source tile. */
export function sizeLabelledFold(
  candidates: ReadonlyArray<Pick<PieceCandidate, 'outer' | 'walls' | 'rank' | 'textsInside'>>,
  sizes: ReadonlyArray<{ label: string }>,
  chains: ReadonlyArray<Pick<Chain, 'closed' | 'pts'> | undefined>,
  texts: IRText[],
  lines: OtherLines,
): Map<number, FoldEdge> | null {
  if (candidates.length < 3 || candidates.some((c) => c.walls.length !== 1)) return null;
  if (new Set(candidates.map((c) => c.walls[0])).size !== candidates.length) return null;
  const inside = new Set(candidates.flatMap((c) => c.textsInside));
  const marks = texts.filter(
    (t) => !t.background && inside.has(t.id) && /^fold$/i.test(t.text.trim()),
  );
  if (marks.length !== 1) return null;
  const [mark] = marks;
  const samePage = texts.filter(
    (t) => !t.background && t.src.file === mark.src.file && t.src.page === mark.src.page,
  );
  const byRank = new Map<number, FoldEdge>();
  const selected: { edge: FoldEdge; text: IRText }[] = [];
  let anchorCount = 0;
  let direction = 0;
  let prev: FoldEdge | undefined;
  for (const c of [...candidates].sort((a, b) => a.rank - b.rank)) {
    const wall = chains[c.walls[0]];
    if (!wall?.closed) return null;
    const label = sizes[c.rank]?.label.toUpperCase();
    const labels = samePage.filter(
      (t) => /^SIZE\s+(.+)$/i.exec(t.text.trim())?.[1].toUpperCase() === label,
    );
    if (!label || !labels.length) return null;
    const edges = foldEdges(c.outer);
    const matches = labels.flatMap((text) =>
      edges.filter((edge) => labelsEdge(text, edge)).map((edge) => ({ edge, text })),
    );
    if (matches.length !== 1) return null;
    const [{ edge, text }] = matches;
    selected.push({ edge, text });
    if (!wall.pts.some((p, i) => sameSegment(p, wall.pts[(i + 1) % wall.pts.length], edge)))
      return null;
    if (labelsEdge(mark, edge)) {
      const word = {
        text: mark.text,
        at: mark.anchor,
        dirDeg: mark.rotationDeg,
        sizeMm: mark.fontSizeMm,
      };
      const role = foldWordRole(word, edges, c.outer, lines);
      if (role.kind !== 'edge' || role.edge !== edge) return null;
      anchorCount++;
    }
    if (prev) {
      const ux = (prev.b.x - prev.a.x) / prev.lenMm;
      const uy = (prev.b.y - prev.a.y) / prev.lenMm;
      const dx = edge.a.x - prev.a.x,
        dy = edge.a.y - prev.a.y;
      const shift = ux * dy - uy * dx;
      if (
        Math.abs(dx * ux + dy * uy) > FOLD_TOL_MM ||
        Math.hypot(edge.b.x - prev.b.x - dx, edge.b.y - prev.b.y - dy) > FOLD_TOL_MM ||
        Math.abs(shift) <= FOLD_TOL_MM ||
        (direction && direction !== Math.sign(shift))
      )
        return null;
      direction = Math.sign(shift);
    }
    byRank.set(c.rank, edge);
    prev = edge;
  }
  if (
    anchorCount !== 1 ||
    selected.some(({ text }) => selected.filter(({ edge }) => labelsEdge(text, edge)).length !== 1)
  )
    return null;
  return byRank;
}
