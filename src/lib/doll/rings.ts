// RINGS OF IDENTICAL PANELS, from the technologist's order (P2b, bags). An operation that lists
// three or more identical pieces as separate parts («triangle_1 … triangle_8 → triangles top») sews
// them SIDE TO SIDE into a ring: each piece's two SIDE edges (the equal pair whose notches mirror
// each other) meet the next piece's. The seam graph pairs such pieces by length alone — some within
// the ring, some across two rings, some left out; here the ring is completed from the order: the
// graph's pairings inside one ring are kept and chained, its pairings across rings refused, the
// chain closed. A LID (a piece whose edges are all equal, as many as the ring has panels) in an
// operation with a ring goes edge by edge onto the panels' free equal edges (an octagon onto the
// eight tops); two rings in one operation meet base to base, panel for panel. Identical twins read
// this way are panels, never plies — groups.ts is told so.
//
// Universal rules only: shapes, notches, the order's parts. Names play no part.

import type {
  Edge,
  EdgeId,
  PieceGeom,
  SeamCandidate,
  SeamGraph,
} from 'lib/assembly-skeleton/types';

import type { DeclaredJoin, JoinProposal } from './joins';

export type Ring = {
  join: string;
  /** Panels in chain order (piece i's second side meets piece i+1's first side; the last closes). */
  pieces: string[];
  /** The side edges of each panel, by piece key: [first, second] in the chain's sense. */
  sides: Map<string, [EdgeId, EdgeId]>;
  /** Edges of the panels that no ring, lid or base seam took (the free ends). */
  free: Map<string, EdgeId[]>;
  /** The edge of each panel a lid is sewn to (the ring's top), by piece key. */
  top: Map<string, EdgeId>;
  /** The edge of each panel sewn to the partner ring's panel (the ring's base), by piece key. */
  base: Map<string, EdgeId>;
  /** The lid closing this ring: its key and, per panel, the lid edge sewn to that panel. */
  lid?: { key: string; edgeFor: Map<string, EdgeId> };
  /** The ring this one meets base to base, and which of its panels each panel meets. */
  mate?: { ring: Ring; panel: Map<string, string> };
};

export type RingsReading = {
  added: JoinProposal[];
  /** Graph seams the rings contradict (identical panels paired across two rings). */
  refused: { seam: SeamCandidate; note: string }[];
  rings: Ring[];
  /** Pieces that are panels of a ring or lids: identical twins never stacked as plies. */
  panels: Set<string>;
};

const pk = (id: string) => id.slice(0, id.lastIndexOf('#'));
const eq = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol * Math.max(a, b, 1);
/** Notch sets that mirror each other along equal edges (d ↔ len − d). */
const notchesMirror = (a: Edge, b: Edge) => {
  if (a.notchesMm.length !== b.notchesMm.length) return false;
  if (!a.notchesMm.length) return true;
  return a.notchesMm.every((d) => b.notchesMm.some((q) => Math.abs(a.lenMm - q - d) <= 6));
};

/**
 * The side pair of a ring panel: two distinct edges of equal length whose notches mirror each
 * other; among several such pairs the one the graph's pairings inside the ring use most, then the
 * longest. Null when the shape has no such pair.
 */
function sidePair(g: PieceGeom, votes: ReadonlyMap<number, number>): [Edge, Edge] | null {
  const plain = g.edges.filter((e) => e.kind === 'edge');
  let best: { pair: [Edge, Edge]; score: number } | null = null;
  for (let i = 0; i < plain.length; i++)
    for (let j = i + 1; j < plain.length; j++) {
      const a = plain[i];
      const b = plain[j];
      if (!eq(a.lenMm, b.lenMm) || !notchesMirror(a, b)) continue;
      const score = 1000 * ((votes.get(a.k) ?? 0) + (votes.get(b.k) ?? 0)) + a.lenMm;
      if (!best || score > best.score) best = { pair: [a, b], score };
    }
  return best?.pair ?? null;
}

const seamOf = (
  a: Edge,
  b: Edge,
  rule: string,
  /** 'identical' between two panels of one ring; 'none' for a lid or a base onto another ring. */
  twin: 'identical' | 'none' = 'identical',
): SeamCandidate => ({
  a: a.id,
  b: b.id,
  score: 0.8,
  kind: 'edge',
  evidence: {
    dLenMm: Math.abs(a.lenMm - b.lenMm),
    relLen: Math.min(a.lenMm, b.lenMm) / Math.max(a.lenMm, b.lenMm),
    notchScore: null,
    curvature: 'flat',
    hand: 'neutral',
    twin,
    self: false,
    rule,
    aLenMm: a.lenMm,
    bLenMm: b.lenMm,
  },
});

export function ringsFromJoins(
  graph: SeamGraph,
  joins: readonly DeclaredJoin[],
  /** Pieces never sewn (lining at level 0, interfacing, the order's hardware). */
  exclude: ReadonlySet<string> = new Set(),
  /** Surface pieces (pockets, flaps): never a ring's panel. */
  isSurface: (k: string) => boolean = () => false,
): RingsReading {
  const geomOf = new Map(graph.pieces.map((g) => [g.pieceKey, g]));
  const edgeById = new Map<string, Edge>();
  for (const g of graph.pieces) for (const e of g.edges) edgeById.set(e.id, e);
  const identical = (a: string, b: string) =>
    a !== b && !!geomOf.get(a)?.twinOf.some((t) => t.key === b && t.kind === 'identical');
  const added: JoinProposal[] = [];
  const refused: RingsReading['refused'] = [];
  const rings: Ring[] = [];
  const panels = new Set<string>();
  const used = new Set<EdgeId>();
  const take = (e: Edge) => used.add(e.id);
  const free = (e: Edge) => !used.has(e.id);
  // (Two identical twins as separate parts beside a third part are NOT panels by that alone: a
  // yoke and its under-yoke are listed so with the back, and they are plies. Panels are the
  // members of a ring, and lids once a ring takes them.)

  // ── 1. rings: three or more parts led by identical pieces ────────────────────────────────
  const lead = (X: readonly string[]) =>
    X.filter((k) => !exclude.has(k) && !isSurface(k) && geomOf.has(k)).sort(
      (a, b) => Math.abs(geomOf.get(b)!.areaMm2) - Math.abs(geomOf.get(a)!.areaMm2),
    )[0];
  const ringOfPiece = new Map<string, Ring>();
  for (const J of joins) {
    if (J.parts.length < 3) continue;
    const leads = J.parts.map(lead).filter((k): k is string => !!k);
    // Groups of leads that are identical twins of each other, in part order.
    const seen = new Set<string>();
    for (const k0 of leads) {
      if (seen.has(k0) || ringOfPiece.has(k0)) continue;
      const members = leads.filter((k) => k === k0 || identical(k0, k));
      members.forEach((k) => seen.add(k));
      if (members.length < 3) continue;
      const set = new Set(members);
      // Which edge indices the graph pairs inside this set: votes for the side pair.
      const votes = new Map<number, number>();
      for (const s of graph.chosen) {
        if (!set.has(pk(s.a)) || !set.has(pk(s.b)) || s.aParts || s.bParts) continue;
        for (const id of [s.a, s.b]) {
          const e = edgeById.get(id);
          if (e) votes.set(e.k, (votes.get(e.k) ?? 0) + 1);
        }
      }
      const sidesOf = new Map<string, [Edge, Edge]>();
      for (const k of members) {
        const pr = sidePair(geomOf.get(k)!, votes);
        if (!pr) break;
        sidesOf.set(k, pr);
      }
      if (sidesOf.size !== members.length) continue;
      const sideIds = new Set([...sidesOf.values()].flatMap(([a, b]) => [a.id, b.id]));
      // Chains from the graph's pairings on side edges inside the ring (degree ≤ 2, no early cycle).
      const degree = new Map<string, number>(members.map((k) => [k, 0]));
      const parent = new Map<string, string>(members.map((k) => [k, k]));
      const find = (k: string): string => {
        let r = k;
        while (parent.get(r) !== r) r = parent.get(r)!;
        parent.set(k, r);
        return r;
      };
      const chainSeams: SeamCandidate[] = [];
      for (const s of graph.chosen) {
        if (!sideIds.has(s.a) || !sideIds.has(s.b)) continue;
        const a = pk(s.a);
        const b = pk(s.b);
        if (a === b || degree.get(a)! >= 2 || degree.get(b)! >= 2 || find(a) === find(b)) {
          refused.push({
            seam: s,
            note: `not sewn — ${s.a} ↔ ${s.b} pairs two identical panels of the ring «${J.label}» a third time / into a loop that leaves panels out; the ring is read from the order`,
          });
          continue;
        }
        chainSeams.push(s);
        degree.set(a, degree.get(a)! + 1);
        degree.set(b, degree.get(b)! + 1);
        parent.set(find(a), find(b));
        take(edgeById.get(s.a)!);
        take(edgeById.get(s.b)!);
      }
      // Chains in part order: walk each from its first end.
      const adj = new Map<string, string[]>(members.map((k) => [k, []]));
      for (const s of chainSeams) {
        adj.get(pk(s.a))!.push(pk(s.b));
        adj.get(pk(s.b))!.push(pk(s.a));
      }
      const visited = new Set<string>();
      const chains: string[][] = [];
      for (const k of members) {
        if (visited.has(k) || adj.get(k)!.length === 2) continue;
        const chain = [k];
        visited.add(k);
        let prev = '';
        let cur = k;
        for (;;) {
          const next = adj.get(cur)!.find((n) => n !== prev && !visited.has(n));
          if (!next) break;
          chain.push(next);
          visited.add(next);
          prev = cur;
          cur = next;
        }
        chains.push(chain);
      }
      // (a closed loop of all members already: every panel has degree 2)
      if (!chains.length) chains.push([...members]);
      const order = chains.flat();
      const freeSide = (k: string) => sidesOf.get(k)!.find(free);
      const ringSeams: SeamCandidate[] = [...chainSeams];
      const rule = (a: string, b: string) =>
        `ring (from the technologist's order «${J.label}»): identical panels sewn side to side — ${a} meets ${b}`;
      for (let c = 0; c < chains.length; c++) {
        const tail = chains[c][chains[c].length - 1];
        const head = chains[(c + 1) % chains.length][0];
        if (chains.length === 1 && chains[0].length < 2) break;
        const ea = freeSide(tail);
        const eb = freeSide(head);
        if (!ea || !eb || ea.id === eb.id) continue;
        take(ea);
        take(eb);
        const seam = seamOf(ea, eb, rule(tail, head));
        ringSeams.push(seam);
        added.push({
          seam,
          join: J.label,
          note: `proposed (from the technologist's order «${J.label}») · ring of ${members.length} identical panels, side to side: ${ea.id} ↔ ${eb.id} · ${ea.lenMm.toFixed(0)} = ${eb.lenMm.toFixed(0)} mm`,
        });
      }
      const ring: Ring = {
        join: J.label,
        pieces: order,
        sides: new Map([...sidesOf].map(([k, [a, b]]) => [k, [a.id, b.id] as [EdgeId, EdgeId]])),
        free: new Map(),
        top: new Map(),
        base: new Map(),
      };
      for (const k of members) {
        ringOfPiece.set(k, ring);
        panels.add(k);
      }
      rings.push(ring);
    }
  }
  // The graph's side-to-side pairings of identical panels that cross two rings, or pair a ring's
  // panel by a side edge with a piece outside its ring: refused — the order places the panels.
  const sideIdsAll = new Set(rings.flatMap((r) => [...r.sides.values()].flat()));
  const kept = new Set(added.map((x) => x.seam));
  for (const s of graph.chosen) {
    if (refused.some((r) => r.seam === s) || kept.has(s)) continue;
    const ra = ringOfPiece.get(pk(s.a));
    const rb = ringOfPiece.get(pk(s.b));
    if (!ra && !rb) continue;
    const onSide = sideIdsAll.has(s.a) || sideIdsAll.has(s.b);
    if (ra && rb && ra !== rb) {
      refused.push({
        seam: s,
        note: `not sewn — ${s.a} ↔ ${s.b} pairs identical panels of two different rings («${ra.join}», «${rb.join}»); the order sews each ring side to side within itself`,
      });
      continue;
    }
    if (ra && rb && ra === rb && !used.has(s.a) && onSide) {
      refused.push({
        seam: s,
        note: `not sewn — ${s.a} ↔ ${s.b}: the ring «${ra.join}» is read from the order; this pairing is not part of its chain`,
      });
      continue;
    }
    if (onSide && !(ra && rb)) {
      refused.push({
        seam: s,
        note: `not sewn — ${s.a} ↔ ${s.b} takes a side edge of a ring panel («${(ra ?? rb)!.join}») for a piece outside the ring; the sides meet the neighbouring panels`,
      });
    }
  }
  // Every edge the graph still sews is taken (a refused seam frees its edges; a surface placement
  // is not a seam on the edge).
  for (const s of graph.chosen)
    if (s.kind !== 'surface' && !refused.some((r) => r.seam === s))
      for (const id of [...(s.aParts ?? [s.a]), ...(s.bParts ?? [s.b])]) {
        const at = id.lastIndexOf('#');
        for (const k of id.slice(at + 1).split('+')) used.add(`${id.slice(0, at)}#${k}`);
      }

  // ── 3. lids onto rings, rings base to base ───────────────────────────────────────────────
  const ringsIn = (X: readonly string[]) => {
    const out: Ring[] = [];
    for (const k of X) {
      const r = ringOfPiece.get(k);
      if (r && !out.includes(r) && r.pieces.every((p) => X.includes(p))) out.push(r);
    }
    return out;
  };
  /** A lid: every edge equal (within 2 %), five or more of them. */
  const lidOf = (X: readonly string[]) => {
    const k = lead(X);
    const g = k ? geomOf.get(k) : undefined;
    if (!g) return null;
    const plain = g.edges.filter((e) => e.kind === 'edge');
    if (plain.length < 5 || !plain.every((e) => eq(e.lenMm, plain[0].lenMm))) return null;
    if (ringOfPiece.has(k!)) return null;
    return { key: k!, edges: plain };
  };
  /** The free edge of a ring panel of about this length (not a side). */
  const freeOfLen = (k: string, len: number) => {
    const g = geomOf.get(k)!;
    const sides = new Set(rings.find((r) => r.pieces.includes(k))?.sides.get(k) ?? []);
    return g.edges.find(
      (e) => e.kind === 'edge' && !sides.has(e.id) && free(e) && eq(e.lenMm, len),
    );
  };
  for (const J of joins) {
    const parts = J.parts.map((X) => X.filter((k) => !exclude.has(k)));
    const withRings = parts.map((X) => ringsIn(X));
    // Lids: each lid part onto the next ring (in order of appearance) whose panels have a free edge
    // of the lid's edge length, as many panels as the lid has edges.
    const lids = parts.map(lidOf);
    const ringsAll = withRings.flat();
    const takenRing = new Set<Ring>();
    // The graph's own lid ↔ panel pairings (by length alone, any panel of either ring) are re-read
    // in ring order: refused first — for every lid, so no lid's leftover pairing blocks another's
    // ring — their edges free again.
    if (lids.some(Boolean) && ringsAll.length) {
      const ringPanels = new Set(ringsAll.flatMap((r) => r.pieces));
      const lidKeysHere = new Set(lids.filter(Boolean).map((l) => l!.key));
      for (const s of graph.chosen) {
        if (refused.some((r) => r.seam === s)) continue;
        const a = pk(s.a);
        const b = pk(s.b);
        if (
          !((lidKeysHere.has(a) && ringPanels.has(b)) || (lidKeysHere.has(b) && ringPanels.has(a)))
        )
          continue;
        refused.push({
          seam: s,
          note: `not sewn as the graph paired it — ${s.a} ↔ ${s.b}: a lid goes onto one ring's panels edge by edge, in the ring's order (re-read from the order «${J.label}»)`,
        });
        for (const id of [...(s.aParts ?? [s.a]), ...(s.bParts ?? [s.b])]) {
          const at = id.lastIndexOf('#');
          for (const k of id.slice(at + 1).split('+')) used.delete(`${id.slice(0, at)}#${k}`);
        }
      }
    }
    lids.forEach((lid, i) => {
      if (!lid) return;
      const len = lid.edges[0].lenMm;
      const ring = ringsAll.find(
        (r) =>
          !takenRing.has(r) &&
          !withRings[i].includes(r) &&
          r.pieces.length === lid.edges.length &&
          r.pieces.every((p) => freeOfLen(p, len)),
      );
      if (!ring) return;
      takenRing.add(ring);
      panels.add(lid.key);
      ring.lid = { key: lid.key, edgeFor: new Map() };
      ring.pieces.forEach((p, j) => {
        const top = freeOfLen(p, len)!;
        const le = lid.edges[j % lid.edges.length];
        take(top);
        take(le);
        ring.top.set(p, top.id);
        ring.lid!.edgeFor.set(p, le.id);
        const seam = seamOf(
          le,
          top,
          `lid (from the technologist's order «${J.label}»): ${lid.key}'s ${lid.edges.length} equal edges onto the ring's ${ring.pieces.length} panels, edge by edge`,
          'none',
        );
        added.push({
          seam,
          join: J.label,
          note: `proposed (from the technologist's order «${J.label}») · lid ${lid.key} edge ${le.k} onto ring panel ${p}: ${le.lenMm.toFixed(0)} = ${top.lenMm.toFixed(0)} mm`,
        });
      });
    });
    // Two rings of the same count in one operation: base to base, panel for panel.
    for (let i = 0; i < parts.length; i++)
      for (let j = i + 1; j < parts.length; j++)
        for (const A of withRings[i])
          for (const B of withRings[j]) {
            if (A.pieces.length !== B.pieces.length || takenRing.has(A) || takenRing.has(B))
              continue;
            // The common free length: an edge both rings' panels have free.
            const ga = geomOf.get(A.pieces[0])!;
            const cand = ga.edges.filter(
              (e) =>
                e.kind === 'edge' &&
                !A.sides.get(A.pieces[0])!.includes(e.id) &&
                free(e) &&
                A.pieces.every((p) => freeOfLen(p, e.lenMm)) &&
                B.pieces.every((p) => freeOfLen(p, e.lenMm)),
            );
            if (!cand.length) continue;
            const len = cand.sort((x, y) => y.lenMm - x.lenMm)[0].lenMm;
            takenRing.add(A);
            takenRing.add(B);
            A.mate = { ring: B, panel: new Map() };
            B.mate = { ring: A, panel: new Map() };
            A.pieces.forEach((p, k) => {
              const ea = freeOfLen(p, len);
              const eb = freeOfLen(B.pieces[k], len);
              if (!ea || !eb) return;
              take(ea);
              take(eb);
              A.base.set(p, ea.id);
              B.base.set(B.pieces[k], eb.id);
              A.mate!.panel.set(p, B.pieces[k]);
              B.mate!.panel.set(B.pieces[k], p);
              const seam = seamOf(
                ea,
                eb,
                `rings (from the technologist's order «${J.label}»): two rings of ${A.pieces.length} panels joined base to base, panel for panel`,
                'none',
              );
              added.push({
                seam,
                join: J.label,
                note: `proposed (from the technologist's order «${J.label}») · ring «${A.join}» panel ${p} base onto ring «${B.join}» panel ${B.pieces[k]}: ${ea.lenMm.toFixed(0)} = ${eb.lenMm.toFixed(0)} mm`,
              });
            });
          }
  }
  // Two identical lids (each now on its own ring) the graph paired with each other by length: each
  // is sewn onto its ring, never onto its twin.
  const lidKeys = [...panels].filter((k) => !ringOfPiece.has(k));
  for (const s of graph.chosen) {
    if (refused.some((r) => r.seam === s)) continue;
    const a = pk(s.a);
    const b = pk(s.b);
    if (lidKeys.includes(a) && lidKeys.includes(b) && identical(a, b))
      refused.push({
        seam: s,
        note: `not sewn — ${s.a} ↔ ${s.b} pairs two identical lids; each closes its own ring, they never meet`,
      });
  }
  for (const r of rings)
    for (const p of r.pieces)
      r.free.set(
        p,
        geomOf
          .get(p)!
          .edges.filter((e) => e.kind === 'edge' && free(e))
          .map((e) => e.id),
      );
  return { added, refused, rings, panels };
}
