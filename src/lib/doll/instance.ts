// Mirrored ×2 blocks (P2b §5): a card piece cut twice mirrored (piecesPerGarment 2, MIRRORED) is
// ONE block in the pattern but two panels on the garment. The doll instances the second one: the
// block mirrored (x → −x about its own centre, contour reversed so it stays CCW, edge numbers
// kept), the other hand, and the block's seams re-read for it:
//  · seam to another ×2 block → the same seam between the two copies;
//  · seam to a single piece → onto that piece's mirror edge (same length, mirrored position about
//    the piece's centre), when it has one; a piece without one (a yoke's centre-back edge, a collar)
//    gets no second seam and the copy's edge stays free (the report says so).

import { isMirroredPair } from 'lib/assembly-skeleton/cut';
import type {
  Edge,
  EdgeId,
  PieceGeom,
  Pt2,
  SeamCandidate,
  SeamGraph,
  SkeletonFacts,
} from 'lib/assembly-skeleton/types';

const pk = (id: string) => id.slice(0, id.lastIndexOf('#'));
const ids = (id: string) => {
  const at = id.lastIndexOf('#');
  return id
    .slice(at + 1)
    .split('+')
    .map((k) => `${id.slice(0, at)}#${k}`);
};

export const MIRROR_SUFFIX = '·2';

function mirrorGeom(g: PieceGeom, key: string): PieceGeom {
  const n = g.rs.length;
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const [x] of g.rs) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
  }
  const c = (x0 + x1) / 2;
  const m = (p: Pt2): Pt2 => [2 * c - p[0], p[1]];
  // New index of old sample i: reversed order keeps the contour CCW after the flip.
  const ni = (i: number) => (((n - 1 - i) % n) + n) % n;
  const rs = g.rs.map((_, j) => m(g.rs[ni(j)]));
  const edges: Edge[] = g.edges.map((e) => ({
    ...e,
    id: `${key}#${e.id.slice(e.id.lastIndexOf('#') + 1)}`,
    pieceKey: key,
    // The edge runs from old e (now ni(e)) to old s (now ni(s)).
    s: ni(((e.e % n) + n) % n),
    e: ni(((e.s % n) + n) % n) + (ni(((e.s % n) + n) % n) < ni(((e.e % n) + n) % n) ? n : 0),
    pts: [...e.pts].reverse().map(m),
    notchesMm: e.notchesMm.map((x) => e.lenMm - x).sort((a, b) => a - b),
  }));
  const other = g.hand === 'L' ? 'R' : g.hand === 'R' ? 'L' : null;
  return {
    ...g,
    pieceKey: key,
    hand: other,
    rs,
    corners: g.corners.map(ni).sort((a, b) => a - b),
    notchIdx: g.notchIdx.map(ni).sort((a, b) => a - b),
    edges,
    twinOf: [{ key: g.pieceKey, kind: 'mirror' }],
  };
}

/** The piece's edge mirrored about its own vertical centre line (same length), or null. */
function mirrorEdge(g: PieceGeom, id: EdgeId): Edge | null {
  const e = g.edges.find((x) => x.id === id);
  if (!e) return null;
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const [x] of g.rs) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
  }
  const c = (x0 + x1) / 2;
  const mid = (ed: Edge) => ed.pts[Math.floor(ed.pts.length / 2)];
  const me = mid(e);
  if (Math.abs(me[0] - c) < 15) return null; // on the centre line: no mirror
  return (
    g.edges.find(
      (x) =>
        x.id !== e.id &&
        x.kind === e.kind &&
        Math.abs(x.lenMm - e.lenMm) < Math.max(4, 0.03 * e.lenMm) &&
        Math.abs(mid(x)[0] + me[0] - 2 * c) < 25 &&
        Math.abs(mid(x)[1] - me[1]) < 25,
    ) ?? null
  );
}

export type Instanced = {
  graph: SeamGraph;
  facts: SkeletonFacts;
  /** In words, per instanced block. */
  notes: string[];
};

export function instanceMirrored(graph: SeamGraph, facts: SkeletonFacts): Instanced {
  const factOf = new Map(facts.pieces.map((p) => [p.pieceKey, p]));
  const geomOf = new Map(graph.pieces.map((g) => [g.pieceKey, g]));
  const blocks = graph.pieces.filter((g) => {
    const f = factOf.get(g.pieceKey);
    // A block whose mirror is already drawn as its own piece is not instanced again.
    return (
      !!f && isMirroredPair(f) && !g.twinOf.some((t) => t.kind === 'mirror' && geomOf.has(t.key))
    );
  });
  if (!blocks.length) return { graph, facts, notes: [] };
  const copyKey = (k: string) => `${k}${MIRROR_SUFFIX}`;
  const isBlock = new Set(blocks.map((g) => g.pieceKey));
  const copies = blocks.map((g) => mirrorGeom(g, copyKey(g.pieceKey)));
  const notes: string[] = [];
  const mapSide = (id: string, toCopy: boolean): string | null => {
    const parts = ids(id);
    const out: string[] = [];
    for (const one of parts) {
      const k = pk(one);
      if (toCopy) out.push(`${copyKey(k)}#${one.slice(one.lastIndexOf('#') + 1)}`);
      else {
        const g = geomOf.get(k);
        const me = g ? mirrorEdge(g, one) : null;
        if (!me) return null;
        out.push(me.id);
      }
    }
    if (out.length === 1) return out[0];
    const k = pk(out[0]);
    return `${k}#${out.map((x) => x.slice(x.lastIndexOf('#') + 1)).join('+')}`;
  };
  const added: SeamCandidate[] = [];
  for (const s of graph.chosen) {
    const ka = pk(s.a);
    const kb = pk(s.b);
    const ba = isBlock.has(ka);
    const bb = isBlock.has(kb);
    if (!ba && !bb) continue;
    if (ka === kb) {
      // A dart or tuck inside the block: the copy has it too.
      added.push({
        ...s,
        a: mapSide(s.a, true)!,
        b: mapSide(s.b, true)!,
        aParts: undefined,
        bParts: undefined,
      });
      continue;
    }
    const a = mapSide(s.a, ba);
    const b = mapSide(s.b, bb);
    if (!a || !b) {
      notes.push(
        `${ba ? ka : kb} ×2 mirrored: the copy's seam to ${ba ? kb : ka} has no mirror edge on ${ba ? kb : ka} — left free`,
      );
      continue;
    }
    added.push({ ...s, a, b, aParts: undefined, bParts: undefined });
  }
  for (const g of blocks)
    notes.push(
      `${g.pieceKey} is one block cut ×2 mirrored — drawn twice: ${g.pieceKey} and its mirror ${copyKey(g.pieceKey)}`,
    );
  return {
    graph: {
      ...graph,
      pieces: [...graph.pieces, ...copies],
      chosen: [...graph.chosen, ...added],
      components: graph.components.map((c) =>
        c.some((k) => isBlock.has(k)) ? [...c, ...c.filter((k) => isBlock.has(k)).map(copyKey)] : c,
      ),
    },
    facts: {
      ...facts,
      pieces: [
        ...facts.pieces.map((p) => (isBlock.has(p.pieceKey) ? { ...p, piecesPerGarment: 1 } : p)),
        ...facts.pieces
          .filter((p) => isBlock.has(p.pieceKey))
          .map((p) => ({ ...p, pieceKey: copyKey(p.pieceKey), piecesPerGarment: 1 })),
      ],
    },
    notes,
  };
}
