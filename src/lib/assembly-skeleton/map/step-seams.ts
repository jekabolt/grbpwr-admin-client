// ASSEMBLY MAP — which seams of the graph a step sews (04-ASSEMBLY-MAP-DESIGN §2, §4 «Data»).
//
// A step's seams = its own `seams` (a proposal step carries them) ∪ every chosen seam of the graph
// whose two edges lie in two DIFFERENT inputs of the step. Inputs are resolved to leaf pieces AS OF
// THAT STEP: a unit that is added to later («Back» + yoke → «Back») holds fewer pieces at the step
// that first makes it, and resolving it with its final contents would put both ends of the seam
// being sewn into one input — the seam would vanish from the very step that sews it.
//
// Pure: the graph the card already read (the pictograms' graph), no second geometry pass.

import type { EdgeId, PieceGeom, SeamCandidate, SeamGraph } from '../types';
import { pieceKeyOf } from '../union/layout';
import { unitLeaves } from '../union/unit-pictures';

/** A step as the map reads it — a card row or a proposal step, reduced to what joins what. */
export type MapStep = {
  /** Piece keys or earlier steps' unit keys, in order. */
  inputs: readonly string[];
  outputUnitKey: string;
  /** A MACHINE step: only these own sewn edges and get numbers on PIECES. */
  sews: boolean;
  /** Seams the step carries itself (a proposal step); a card row has none. */
  seams?: readonly SeamCandidate[];
};

export type MapRead = {
  graph: SeamGraph;
  geoms: ReadonlyMap<string, PieceGeom>;
  steps: readonly MapStep[];
  /** Per step, per input: the leaf piece keys that input holds at that step. */
  inputLeaves: string[][][];
  /** Per step: the seams it sews (own first, then cross-input), each once. */
  seams: SeamCandidate[][];
  /** Edge id → indexes of the SEWING steps that sew it, ascending. */
  edgeSteps: Map<EdgeId, number[]>;
};

const seamKey = (c: SeamCandidate) => (c.a < c.b ? `${c.a}~${c.b}` : `${c.b}~${c.a}`);

/** Every edge id a seam touches: the composite runs' parts, or the two sides. */
export function seamEdgeIds(c: SeamCandidate): EdgeId[] {
  return [...(c.aParts?.length ? c.aParts : [c.a]), ...(c.bParts?.length ? c.bParts : [c.b])];
}

/**
 * Leaf pieces of every input of every step, resolved in step order. A unit consumed before any
 * step makes it (a broken order) falls back to its whole-card leaves; an unknown key that no step
 * makes is a piece (a card piece without a contour is still a leaf — it just has no seams).
 */
export function stepInputLeaves(steps: readonly MapStep[]): string[][][] {
  const made = new Set(steps.map((s) => s.outputUnitKey.trim()).filter(Boolean));
  const whole = unitLeaves(
    steps.map((s) => ({ inputs: s.inputs, outputUnitKey: s.outputUnitKey })),
    (k) => !made.has(k),
  );
  const now = new Map<string, string[]>();
  return steps.map((s) => {
    const per = s.inputs.map((raw) => {
      const k = raw.trim();
      if (!k) return [];
      const hit = now.get(k);
      if (hit) return hit;
      if (made.has(k)) return whole.get(k) ?? [];
      return [k];
    });
    const out = s.outputUnitKey.trim();
    if (out) now.set(out, [...new Set([...(now.get(out) ?? []), ...per.flat()])]);
    return per;
  });
}

/** The seams step `leaves` (its inputs' leaf sets) joins: own ∪ cross-input chosen seams. */
export function stepSeams(
  graph: SeamGraph,
  leaves: readonly (readonly string[])[],
  own: readonly SeamCandidate[] = [],
): SeamCandidate[] {
  const where = new Map<string, number>();
  leaves.forEach((set, i) => {
    for (const k of set) if (!where.has(k)) where.set(k, i);
  });
  const out: SeamCandidate[] = [];
  const seen = new Set<string>();
  for (const c of own) {
    const key = seamKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  if (leaves.length < 2) return out;
  for (const c of graph.chosen) {
    if (c.kind === 'closure-not-seam') continue;
    const ia = where.get(pieceKeyOf(c.a));
    const ib = where.get(pieceKeyOf(c.b));
    if (ia == null || ib == null || ia === ib) continue;
    const key = seamKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Edge id → the sewing steps that sew it (indexes, ascending, each once). */
export function edgeSteps(
  steps: readonly MapStep[],
  seams: readonly (readonly SeamCandidate[])[],
): Map<EdgeId, number[]> {
  const out = new Map<EdgeId, number[]>();
  steps.forEach((s, i) => {
    if (!s.sews) return;
    for (const c of seams[i] ?? [])
      for (const id of seamEdgeIds(c)) {
        const list = out.get(id) ?? [];
        if (!list.includes(i)) list.push(i);
        out.set(id, list);
      }
  });
  for (const list of out.values()) list.sort((a, b) => a - b);
  return out;
}

/** Everything the map draws, read once per (graph, steps). */
export function readMap(graph: SeamGraph, steps: readonly MapStep[]): MapRead {
  const geoms = new Map(graph.pieces.map((p) => [p.pieceKey, p]));
  const inputLeaves = stepInputLeaves(steps);
  const seams = steps.map((s, i) => stepSeams(graph, inputLeaves[i], s.seams ?? []));
  return { graph, geoms, steps, inputLeaves, seams, edgeSteps: edgeSteps(steps, seams) };
}

/** A join: two or more inputs. A one-input step (topstitch, hem, press) sews nothing to anything. */
export const isJoin = (read: MapRead, i: number) =>
  (read.steps[i]?.inputs.filter((k) => k.trim()).length ?? 0) >= 2;
