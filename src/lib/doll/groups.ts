// Wrap groups (design §3.1): which tube / ring each piece belongs to, read from the piece ROLES of
// roles.json (the skeleton's own name reader) — never from edge roles (lib/pom owns those). Pieces
// without a role join the group of the pieces they are sewn to. Layers of one shape (identical
// collar / yoke / band layers) are drawn ONCE on a leader with «×n».

import { isMirroredPair } from 'lib/assembly-skeleton/cut';
import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import { liningByName } from 'lib/assembly-skeleton/names';
import { readName } from 'lib/assembly-skeleton/skeleton';
import type {
  EdgeId,
  PieceGeom,
  SeamCandidate,
  SeamGraph,
  SkeletonFacts,
} from 'lib/assembly-skeleton/types';

import type { DollGroupId } from './types';

export type GroupedPiece = {
  key: string;
  geom: PieceGeom;
  group: DollGroupId;
  role: string | null;
  /** Followers drawn as layers of this piece. */
  layers: string[];
};

export type GroupedSeam = {
  /** Original candidate. */
  seam: SeamCandidate;
  /** Sides with followers mapped onto leaders (edge ids). */
  a: EdgeId[];
  b: EdgeId[];
};

export type Grouping = {
  pieces: GroupedPiece[];
  /** Seams between drawn pieces (layer seams and duplicates removed). */
  seams: GroupedSeam[];
  closures: GroupedSeam[];
  /** Layer seams (closed by stacking) and duplicates, for the report. */
  layerSeams: SeamCandidate[];
  skipped: { pieceKey: string; reason: string }[];
  warnings: string[];
};

const BODY_ROLES = new Set(['front', 'back', 'side', 'yoke', 'placket', 'facing', 'fly', 'skirt']);
const RING_GROUPS = new Set<DollGroupId>([
  'COLLAR',
  'STAND',
  'CUFF_L',
  'CUFF_R',
  'WAISTBAND',
  'HEMBAND',
]);
const pk = (id: string) => id.slice(0, id.lastIndexOf('#'));

/** Largest piece area per pattern (set by groupPieces / roleOfPiece callers through the graph). */
const maxAreaOf = new WeakMap<object, number>();
/**
 * The piece's role from its name (roles.json), except a «pocket» / «loop» as big as a panel: a name
 * like FL (left front) reads as a flap — a surface piece a third the size of the biggest panel or
 * more is not one, and gets no role (it joins the group it is sewn to).
 */
export function roleOfPiece(g: PieceGeom, graph?: SeamGraph): string | null {
  const r = readName(g.name).role;
  if (r !== 'pocket' && r !== 'loop') return r;
  let max = graph ? maxAreaOf.get(graph) : undefined;
  if (graph && max === undefined) {
    max = Math.max(...graph.pieces.map((p) => Math.abs(p.areaMm2)));
    maxAreaOf.set(graph, max);
  }
  return max !== undefined && Math.abs(g.areaMm2) > 0.33 * max ? null : r;
}
const areaOf = (g: PieceGeom) => Math.abs(g.areaMm2);
const dims = (g: PieceGeom) => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of g.rs) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x1 - x0, y1 - y0];
};

export function groupPieces(
  graph: SeamGraph,
  facts: SkeletonFacts,
  opts: { lining?: boolean; dropSeams?: string[] } = {},
): Grouping {
  const warnings: string[] = [];
  const skipped: Grouping['skipped'] = [];
  const factOf = new Map(facts.pieces.map((p) => [p.pieceKey, p]));
  const geomOf = new Map(graph.pieces.map((g) => [g.pieceKey, g]));
  const legs = facts.category === 'trousers' || facts.category === 'jumpsuit';
  const drop = new Set(opts.dropSeams ?? []);
  const dropped = (s: SeamCandidate) => drop.has(`${s.a}~${s.b}`) || drop.has(`${s.b}~${s.a}`);
  const live = graph.chosen.filter((s) => s.kind !== 'closure-not-seam' && !dropped(s));
  const closuresRaw = graph.rejected.filter((s) => s.kind === 'closure-not-seam' && !dropped(s));

  // ── 1. roles → groups ────────────────────────────────────────────────────────────────────
  const group = new Map<string, DollGroupId | null>();
  const role = new Map<string, string | null>();
  const handOf = (g: PieceGeom) => g.hand ?? readName(g.name).hand;
  let sleeveFlip = 0;
  for (const g of graph.pieces) {
    const f = factOf.get(g.pieceKey);
    const name = f?.name ?? g.name;
    const r = name === g.name ? roleOfPiece(g, graph) : readName(name).role;
    role.set(g.pieceKey, r);
    const cloth = f?.cloth ?? g.cloth ?? (liningByName(name) ? 'lining' : null);
    if (cloth === 'lining' && !opts.lining) {
      skipped.push({
        pieceKey: g.pieceKey,
        reason: 'lining — not drawn (level 0 solves the shell)',
      });
      continue;
    }
    if (cloth === 'interfacing') {
      skipped.push({ pieceKey: g.pieceKey, reason: 'interfacing — never drawn' });
      continue;
    }
    if (g.rs.length < 3) {
      skipped.push({ pieceKey: g.pieceKey, reason: 'no contour' });
      continue;
    }
    if (f && isMirroredPair(f))
      warnings.push(
        `${g.pieceKey} is one block cut ×2 mirrored — drawn once (the second hand is not instanced in level 0)`,
      );
    const hand = handOf(g);
    const side = (h: typeof hand): 'L' | 'R' => {
      if (h) return h;
      sleeveFlip++;
      return sleeveFlip % 2 ? 'L' : 'R';
    };
    let gr: DollGroupId | null = null;
    if (r === 'pocket' || r === 'loop') {
      skipped.push({
        pieceKey: g.pieceKey,
        reason: `${r} — a surface piece; not placed without a placement mark`,
      });
      continue;
    } else if (r && BODY_ROLES.has(r))
      gr = legs && hand ? (hand === 'L' ? 'LEG_L' : 'LEG_R') : 'BODY';
    else if (r === 'sleeve') gr = side(hand) === 'L' ? 'SLEEVE_L' : 'SLEEVE_R';
    else if (r === 'cuff') gr = side(hand) === 'L' ? 'CUFF_L' : 'CUFF_R';
    else if (r === 'collar' || r === 'hood') gr = 'COLLAR';
    else if (r === 'stand' || r === 'rib') gr = 'STAND';
    else if (r === 'waistband') gr = 'WAISTBAND';
    else if (r === 'hemband') gr = 'HEMBAND';
    group.set(g.pieceKey, gr);
  }

  // ── 2. pieces without a role join the group they are sewn to (by seam length) ───────────
  for (let round = 0; round < 6; round++) {
    let changed = false;
    for (const [k, gr] of group) {
      if (gr) continue;
      const votes = new Map<DollGroupId, number>();
      for (const s of live) {
        const a = pk(s.a);
        const b = pk(s.b);
        const other = a === k ? b : b === k ? a : null;
        if (!other || other === k) continue;
        const og = group.get(other);
        if (!og) continue;
        const len = Math.max(s.evidence.aLenMm ?? 0, s.evidence.bLenMm ?? 0, 100);
        votes.set(og, (votes.get(og) ?? 0) + len);
      }
      let best: DollGroupId | null = null;
      let bv = 0;
      for (const [g, v] of votes) if (v > bv) [best, bv] = [g, v];
      if (best) {
        // A roleless piece next to legs keeps its own hand.
        if ((best === 'LEG_L' || best === 'LEG_R') && geomOf.get(k)?.hand)
          best = geomOf.get(k)!.hand === 'L' ? 'LEG_L' : 'LEG_R';
        group.set(k, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Still nothing: the biggest roleless component becomes the body when there is no body at all.
  const hasBody = [...group.values()].some((g) => g === 'BODY' || g === 'LEG_L' || g === 'LEG_R');
  for (const comp of [...graph.components].sort((x, y) => y.length - x.length)) {
    const free = comp.filter((k) => group.has(k) && !group.get(k));
    if (free.length === 0) continue;
    const g: DollGroupId =
      !hasBody && comp === [...graph.components].sort((x, y) => y.length - x.length)[0]
        ? 'BODY'
        : 'FLOAT';
    for (const k of free) group.set(k, g);
  }
  for (const [k, g] of group) if (!g) group.set(k, 'FLOAT');
  if (!hasBody)
    warnings.push(
      'no piece is named as a front or back — the body is the largest group of sewn pieces; up and front are guessed',
    );

  // ── 3. layers: identical twins sewn to each other, same-shape layers of a ring ──────────
  const leaderOf = new Map<string, string>();
  const lead = (k: string) => {
    let x = k;
    while (leaderOf.has(x)) x = leaderOf.get(x)!;
    return x;
  };
  const stackPair = (a: string, b: string) => {
    const la = lead(a);
    const lb = lead(b);
    if (la === lb) return;
    const ga = geomOf.get(la)!;
    const gb = geomOf.get(lb)!;
    const [L, F] = areaOf(ga) >= areaOf(gb) ? [la, lb] : [lb, la];
    leaderOf.set(F, L);
  };
  for (const s of live) {
    const a = pk(s.a);
    const b = pk(s.b);
    if (a === b || group.get(a) !== group.get(b)) continue;
    const ga = geomOf.get(a)!;
    if (
      s.evidence.twin === 'identical' ||
      ga.twinOf.some((t) => t.key === b && t.kind === 'identical')
    )
      stackPair(a, b);
  }
  // Same-shape layers of a ring (top collar / under collar): area and both sizes within 15 %.
  const keys = [...group.keys()];
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i];
      const b = keys[j];
      const g = group.get(a)!;
      if (g !== group.get(b) || !RING_GROUPS.has(g) || role.get(a) !== role.get(b)) continue;
      const [wa, ha] = dims(geomOf.get(a)!);
      const [wb, hb] = dims(geomOf.get(b)!);
      if (Math.abs(wa - wb) / Math.max(wa, wb) < 0.15 && Math.abs(ha - hb) / Math.max(ha, hb) < 0.2)
        stackPair(a, b);
    }

  // Edge of a follower → the leader's edge at the same place (index if lengths agree, else nearest length).
  const mapEdge = (id: EdgeId): EdgeId => {
    const k = pk(id);
    const L = lead(k);
    if (L === k) return id;
    const fg = geomOf.get(k)!;
    const lg = geomOf.get(L)!;
    const e = fg.edges.find((x) => x.id === id);
    if (!e) return id;
    const same = lg.edges.find((x) => x.k === e.k);
    if (same && Math.abs(same.lenMm - e.lenMm) < Math.max(3, 0.02 * e.lenMm)) return same.id;
    let best = lg.edges[0];
    for (const x of lg.edges)
      if (Math.abs(x.lenMm - e.lenMm) < Math.abs(best.lenMm - e.lenMm)) best = x;
    return best.id;
  };
  const sideOf = (s: SeamCandidate, w: 'a' | 'b') =>
    (s[w === 'a' ? 'aParts' : 'bParts'] ?? edgeIdsOf(s[w]))
      .flatMap((id) => edgeIdsOf(id))
      .map(mapEdge);

  const drawn = new Set([...group.keys()].filter((k) => lead(k) === k));
  const seams: GroupedSeam[] = [];
  const layerSeams: SeamCandidate[] = [];
  const seen = new Set<string>();
  for (const s of live) {
    const a = sideOf(s, 'a');
    const b = sideOf(s, 'b');
    if (!a.length || !b.length) continue;
    const ka = pk(a[0]);
    const kb = pk(b[0]);
    if (!drawn.has(ka) || !drawn.has(kb)) continue;
    if (lead(pk(s.a)) === lead(pk(s.b)) && (pk(s.a) !== pk(s.b) || leaderOf.has(pk(s.a)))) {
      layerSeams.push(s);
      continue;
    }
    const sig = [a.join('+'), b.join('+')].sort().join('~');
    if (seen.has(sig)) {
      layerSeams.push(s);
      continue;
    }
    seen.add(sig);
    seams.push({ seam: s, a, b });
  }
  const closures: GroupedSeam[] = [];
  for (const s of closuresRaw) {
    const a = sideOf(s, 'a');
    const b = sideOf(s, 'b');
    if (!drawn.has(pk(a[0])) || !drawn.has(pk(b[0]))) continue;
    closures.push({ seam: s, a, b });
  }
  for (const s of graph.chosen)
    if (dropped(s)) warnings.push(`${s.a} ↔ ${s.b} left out on purpose (negative control)`);

  const pieces: GroupedPiece[] = [];
  for (const g of graph.pieces) {
    if (!group.has(g.pieceKey)) continue;
    if (!drawn.has(g.pieceKey)) {
      skipped.push({
        pieceKey: g.pieceKey,
        reason: `layer of ${lead(g.pieceKey)} — drawn as one with it (×n)`,
      });
      continue;
    }
    pieces.push({
      key: g.pieceKey,
      geom: g,
      group: group.get(g.pieceKey)!,
      role: role.get(g.pieceKey) ?? null,
      layers: [...leaderOf.keys()].filter((f) => lead(f) === g.pieceKey),
    });
  }
  return { pieces, seams, closures, layerSeams, skipped, warnings };
}
