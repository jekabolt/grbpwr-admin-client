// DERIVED TURNED SEAMS — a two-ply unit sewn round part of its perimeter, turned, then attached.
// This module only annotates owner candidates. The solver never reads the annotation; doll.ts uses
// it after solving to draw the skipped follower as an inward copy of the solved leader.

import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import type { EdgeId, PieceGeom, SeamCandidate } from 'lib/assembly-skeleton/types';

import { sameShape } from './groups';
import type { DollLayerRelation, DollOwnerCandidate } from './types';

export type TurnedOperation = {
  inputKeys?: readonly string[];
  outputUnitKey?: string;
  operationNumber?: number;
  operationType?: string;
  seamKeys?: readonly string[];
  seamKind?: string;
  seamClass?: string;
  work?: string;
  trimAction?: string;
  topstitchMode?: string;
  topstitchRows?: number;
};

const pieceOf = (id: string) => {
  const at = id.lastIndexOf('#');
  return at < 0 ? id : id.slice(0, at);
};
const sideEdges = (candidate: SeamCandidate, side: 'a' | 'b'): EdgeId[] =>
  (side === 'a'
    ? candidate.aParts ?? edgeIdsOf(candidate.a)
    : candidate.bParts ?? edgeIdsOf(candidate.b)
  ).flatMap((id) => edgeIdsOf(id));
const low = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase();
const stepOf = (op: TurnedOperation, index: number) => op.operationNumber || index + 1;

const isMachine = (op: TurnedOperation) => /(^|_)machine$/.test(low(op.operationType));
const isFusing = (op: TurnedOperation) =>
  /fus(?:e|ing)|bond|interlin/.test(`${low(op.work)} ${low(op.seamKind)}`);
const isSewing = (op: TurnedOperation) => isMachine(op) && !isFusing(op);
const hasTopstitch = (op: TurnedOperation) => {
  const mode = low(op.topstitchMode);
  return (
    (!!mode && !mode.endsWith('_unknown') && mode !== 'unknown') ||
    (op.topstitchRows ?? 0) > 0 ||
    /topstitch/.test(`${low(op.work)} ${low(op.seamClass)}`)
  );
};
const turnsAndShapes = (op: TurnedOperation) => low(op.trimAction).endsWith('turn_and_shape');
const explicitKind = (op: TurnedOperation) => {
  const kind = low(op.seamKind);
  return kind === 'faced_split' || kind === 'faced_kant';
};
const biasKind = (op: TurnedOperation) => low(op.seamKind).startsWith('faced_bias_');

const runLength = (geom: PieceGeom, run: readonly EdgeId[]) =>
  run.reduce((sum, id) => sum + (geom.edges.find((edge) => edge.id === id)?.lenMm ?? 0), 0);

/** `sameShape` with the same tolerances when congruent contours start at different corners. */
const sameShapeFromAnotherCorner = (
  x: string,
  y: string,
  geomOf: ReadonlyMap<string, PieceGeom>,
) => {
  if (sameShape(x, y, geomOf)) return true;
  const gx = geomOf.get(x);
  const gy = geomOf.get(y);
  if (!gx || !gy || gx.edges.length !== gy.edges.length) return false;
  const dims = (geom: PieceGeom) => {
    const xs = geom.rs.map((point) => point[0]);
    const ys = geom.rs.map((point) => point[1]);
    return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  };
  const [wx, hx] = dims(gx);
  const [wy, hy] = dims(gy);
  if (Math.abs(wx - wy) > 0.02 * Math.max(wx, wy) || Math.abs(hx - hy) > 0.02 * Math.max(hx, hy))
    return false;
  const a = [...gx.edges].sort((left, right) => left.k - right.k);
  const b = [...gy.edges].sort((left, right) => left.k - right.k);
  const matches = (offset: number, reverse: boolean) =>
    a.every((edge, index) => {
      const at = reverse ? (offset - index + b.length) % b.length : (offset + index) % b.length;
      return Math.abs(b[at].lenMm - edge.lenMm) <= Math.max(3, 0.02 * edge.lenMm);
    });
  return b.some((_, offset) => matches(offset, false) || matches(offset, true));
};

/** True when `under` reaches `over` through the owner's explicit layer order. */
const under = (underKey: string, overKey: string, layers: readonly DollLayerRelation[]) => {
  const next = new Map<string, string[]>();
  for (const [a, b] of layers) next.set(a, [...(next.get(a) ?? []), b]);
  const todo = [underKey];
  const seen = new Set(todo);
  while (todo.length) {
    const key = todo.shift()!;
    for (const candidate of next.get(key) ?? []) {
      if (candidate === overKey) return true;
      if (!seen.has(candidate)) {
        seen.add(candidate);
        todo.push(candidate);
      }
    }
  }
  return false;
};

/**
 * Mark qualifying owner rows without changing their seam candidate. A structural turn is the same
 * evidence on old cards that explicit faced/turn fields provide on newer ones: two congruent cut
 * pieces are bagged round part of their outline, their unit is worked, then attached by another edge.
 */
export function turnedSeamsOf(args: {
  operations: readonly TurnedOperation[];
  candidates: readonly DollOwnerCandidate[];
  geoms: ReadonlyMap<string, PieceGeom>;
  layers?: readonly DollLayerRelation[];
}): DollOwnerCandidate[] {
  const pieceKeys = new Set(args.geoms.keys());
  const layers = args.layers ?? [];

  // Unit membership before every step. A press/topstitch may rename the unit, so descendants keep
  // the original leaves; a cut piece is never mistaken for a unit input.
  const units = new Map<string, string[]>();
  const before: Map<string, string[]>[] = [];
  for (const op of args.operations) {
    before.push(new Map([...units].map(([key, leaves]) => [key, [...leaves]])));
    const leaves = (op.inputKeys ?? []).flatMap((key) =>
      pieceKeys.has(key) ? [key] : units.get(key) ?? [],
    );
    if (op.outputUnitKey)
      units.set(op.outputUnitKey, [
        ...new Set([...(units.get(op.outputUnitKey) ?? []), ...leaves]),
      ]);
  }
  const leavesAt = (index: number, key: string) =>
    pieceKeys.has(key) ? [key] : before[index].get(key) ?? [];
  const candidatesAt = (index: number) => {
    const op = args.operations[index];
    const keys = new Set(op.seamKeys ?? []);
    const step = stepOf(op, index);
    return args.candidates.filter(
      (candidate) => keys.has(candidate.seamKey) || candidate.guess?.step === step,
    );
  };

  const mark = new Map<string, NonNullable<DollOwnerCandidate['turned']>>();
  for (let index = 0; index < args.operations.length; index++) {
    const op = args.operations[index];
    const inputs = op.inputKeys ?? [];
    if (
      !isSewing(op) ||
      biasKind(op) ||
      inputs.length !== 2 ||
      !inputs.every((key) => pieceKeys.has(key)) ||
      !op.outputUnitKey
    )
      continue;
    const [first, second] = inputs;
    if (!sameShapeFromAnotherCorner(first, second, args.geoms)) continue;

    for (const owned of candidatesAt(index)) {
      const candidate = owned.candidate;
      if (owned.guess || candidate.kind !== 'edge' || candidate.surface) continue;
      const a = sideEdges(candidate, 'a');
      const b = sideEdges(candidate, 'b');
      const aPieces = new Set(a.map(pieceOf));
      const bPieces = new Set(b.map(pieceOf));
      if (
        aPieces.size !== 1 ||
        bPieces.size !== 1 ||
        (!aPieces.has(first) && !aPieces.has(second)) ||
        (!bPieces.has(first) && !bPieces.has(second)) ||
        [...aPieces][0] === [...bPieces][0]
      )
        continue;
      const ga = args.geoms.get([...aPieces][0]);
      const gb = args.geoms.get([...bPieces][0]);
      if (!ga || !gb) continue;
      const shareA = runLength(ga, a) / Math.max(1, ga.perimMm);
      const shareB = runLength(gb, b) / Math.max(1, gb.perimMm);
      if (shareA < 0.2 || shareA > 0.85 || shareB < 0.2 || shareB > 0.85) continue;

      const pair = new Set([first, second]);
      const runByPiece = new Map<string, Set<EdgeId>>([
        [[...aPieces][0], new Set(a)],
        [[...bPieces][0], new Set(b)],
      ]);
      let attachment: { step: number } | null = null;
      let topstitch = hasTopstitch(op) ? stepOf(op, index) : null;
      let shaped = false;
      for (let later = index + 1; later < args.operations.length; later++) {
        const next = args.operations[later];
        const inputLeaves = (next.inputKeys ?? []).map((key) => leavesAt(later, key));
        const carriesPair = inputLeaves.some((leaves) =>
          [...pair].every((key) => leaves.includes(key)),
        );
        if (!carriesPair) continue;
        if (topstitch == null && hasTopstitch(next)) topstitch = stepOf(next, later);
        if (!attachment && turnsAndShapes(next)) shaped = true;
        const joinsOutside =
          isSewing(next) &&
          inputLeaves.some((leaves) => [...pair].every((key) => leaves.includes(key))) &&
          inputLeaves.some((leaves) => leaves.some((key) => !pair.has(key))) &&
          candidatesAt(later).some(({ candidate: laterCandidate }) =>
            (
              [...sideEdges(laterCandidate, 'a'), ...sideEdges(laterCandidate, 'b')] as EdgeId[]
            ).some((id) => pair.has(pieceOf(id)) && !runByPiece.get(pieceOf(id))?.has(id)),
          );
        if (!attachment && joinsOutside) attachment = { step: stepOf(next, later) };
      }
      if (!attachment) continue;

      const aKey = [...aPieces][0];
      const bKey = [...bPieces][0];
      const leader = under(aKey, bKey, layers)
        ? bKey
        : under(bKey, aKey, layers)
          ? aKey
          : Math.abs(ga.areaMm2 ?? 0) >= Math.abs(gb.areaMm2 ?? 0)
            ? aKey
            : bKey;
      const explicit = explicitKind(op) || shaped;
      mark.set(owned.seamKey, {
        step: stepOf(op, index),
        run: leader === aKey ? a : b,
        by: explicit ? 'kind' : 'structure',
        heldBy:
          topstitch != null
            ? { step: topstitch, topstitch: true }
            : { step: attachment.step, topstitch: false },
      });
    }
  }
  return args.candidates.map((candidate) => {
    const turned = mark.get(candidate.seamKey);
    return turned ? { ...candidate, turned } : candidate;
  });
}
