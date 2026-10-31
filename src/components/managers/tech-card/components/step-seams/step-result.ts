// ONE OWNER RESULT PER STEP, PURE. No graph choice, proposal, crop, focus, inherited pose pin or
// React state enters this module. The pass is deliberately sequential: every unit input receives
// the layout of the latest earlier operation that produced it through `stepLayout.inputLayouts`.

import type { Affine, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { compose, IDENTITY } from 'lib/assembly-skeleton/union/affine';
import { poseOf, type StoredPose, type StoredSeam } from 'lib/seams';

import { decodeHandPlace, handsFromSeams } from './step-hand';
import { inputGroups, type FormOpLike, type InputGroup } from './step-seams-model';
import { invert, stepLayout, type StepLayout } from './step-picture';
import { pinPoses, type PosePin } from './step-pose';
import { storedRowsOfStep, type StepStoredRow } from './step-rows';

export type StepResultBlock = {
  inputKey: string;
  pieces: readonly string[];
  /** The one affine applied to this input's seeded result in this step. */
  T: Affine;
};

export type StepResult = {
  opIndex: number;
  transforms: ReadonlyMap<string, Affine>;
  /** Bottom → top. */
  layers: readonly string[];
  blocks: readonly StepResultBlock[];
  /** Current-step pose keys ignored because piece and host are already in one rigid input. */
  ignoredPoses: readonly string[];
  /** Stable audit labels (`self:key`, `later:key@index`, or a carried earlier label). */
  cycles: readonly string[];
  /** The full engine layout the views draw through (`T` equals `transforms`, poses applied). */
  layout: StepLayout;
  /** This op or any op it is seeded from (recursively) has an owner seam or pose row. */
  owned: boolean;
};

export type StepResultsInput = {
  ops: readonly FormOpLike[];
  byKey: ReadonlyMap<string, StoredSeam>;
  poses?: ReadonlyMap<string, StoredPose>;
  geoms: ReadonlyMap<string, PieceGeom>;
  innerLines: ReadonlyMap<string, Pt2[][]>;
  pieceKeys: ReadonlySet<string>;
};

type ComputedStep = {
  result: StepResult;
  /** The engine metadata carried with the public transforms to the next unit consumer. */
  layout: StepLayout;
};

type ResolvedInput = InputGroup & {
  seed?: ComputedStep;
  cycles: string[];
};

const EMPTY_HANDS = new Map();

const unique = <T>(items: readonly T[]) => [...new Set(items)];

const operationLabel = (op: FormOpLike | undefined, index: number) =>
  op?.operationNumber == null ? String(index) : String(op.operationNumber);

/** The groups visible at a step, plus unresolved future/self unit references for the audit. */
function resolvedInputs(
  input: StepResultsInput,
  index: number,
  latestByOutput: ReadonlyMap<string, ComputedStep>,
  outputAt: ReadonlyMap<string, readonly number[]>,
): ResolvedInput[] {
  const op = input.ops[index];
  const rawInputs = unique((op?.inputKeys ?? []).map((key) => key.trim()).filter(Boolean));
  const modelGroups = inputGroups(input.ops, index, input.pieceKeys);
  const used = new Set<string>();
  const groups: ResolvedInput[] = [];

  const add = (group: InputGroup, rawKeys: readonly string[]) => {
    if (used.has(group.key)) return;
    used.add(group.key);
    const seed = latestByOutput.get(group.key);
    const cycles = seed ? [...seed.result.cycles] : [];
    const self = rawKeys.find((key) => key === (op?.outputUnitKey ?? '').trim());
    const later = rawKeys.find(
      (key) =>
        !latestByOutput.has(key) &&
        !input.pieceKeys.has(key) &&
        (outputAt.get(key) ?? []).some((producer) => producer >= index),
    );
    if (self) cycles.push(`self:${self}`);
    if (later && later !== self) {
      const producer = (outputAt.get(later) ?? []).find((at) => at >= index)!;
      cycles.push(`later:${later}@${operationLabel(input.ops[producer], producer)}`);
    }
    groups.push({
      ...group,
      // A direct self-reference or a future-only producer is raw/apart, never a recursive seed.
      ...(!self && !later && seed ? { seed } : {}),
      cycles: unique(cycles),
    });
  };

  for (const group of modelGroups) {
    const rawKeys = rawInputs.filter((key) => key === group.key || group.pieces.includes(key));
    add(group, rawKeys);
  }
  for (const raw of rawInputs) {
    const represented = groups.some((group) => group.key === raw || group.pieces.includes(raw));
    if (represented) continue;
    add({ key: raw, pieces: input.pieceKeys.has(raw) ? [raw] : [] }, [raw]);
  }
  return groups;
}

/** Apply this operation's pose rows to whole current input blocks, never to an individual piece. */
function applyCurrentPoses(
  op: FormOpLike | undefined,
  rows: ReadonlyMap<string, StoredPose> | undefined,
  layout: StepLayout,
  inputs: readonly ResolvedInput[],
  geoms: ReadonlyMap<string, PieceGeom>,
  blockTransforms: Affine[],
): string[] {
  if (!rows?.size || !op?.poseKeys?.length) return [];
  const inputOf = new Map<string, number>();
  inputs.forEach((group, groupIndex) => {
    for (const piece of group.pieces) if (!inputOf.has(piece)) inputOf.set(piece, groupIndex);
  });
  const ignored: string[] = [];
  const pins = new Map<string, PosePin>();
  for (const key of op.poseKeys) {
    const row = rows.get(key);
    const pose = row ? poseOf(row) : null;
    if (!pose) continue;
    const pieceInput = inputOf.get(pose.piece);
    const hostInput = inputOf.get(pose.host);
    if (pieceInput != null && pieceInput === hostInput) {
      ignored.push(key);
      continue;
    }
    if (
      pieceInput == null ||
      hostInput == null ||
      !layout.T.has(pose.piece) ||
      !layout.T.has(pose.host) ||
      !geoms.has(pose.piece) ||
      !geoms.has(pose.host)
    )
      continue;
    pins.delete(pose.piece);
    pins.set(pose.piece, { host: pose.host, placement: pose.placement, seamKey: key });
  }

  const before = inputs.map((group) => {
    const first = group.pieces.find((piece) => layout.T.has(piece));
    return first ? { first, T: layout.T.get(first)! } : null;
  });
  pinPoses(layout.T, pins, geoms, [], {
    groupOf: (piece) => inputs[inputOf.get(piece)!]?.pieces ?? [piece],
  });
  before.forEach((snapshot, groupIndex) => {
    if (!snapshot) return;
    const after = layout.T.get(snapshot.first);
    if (!after) return;
    const delta = compose(after, invert(snapshot.T));
    blockTransforms[groupIndex] = compose(delta, blockTransforms[groupIndex]);
  });
  return unique(ignored);
}

type LayerRelation = readonly [under: string, over: string];

/** Stable topological order: input order is the tie-breaker, constraints only move layers. */
function orderedLayers(base: readonly string[], relations: readonly LayerRelation[]): string[] {
  const order = unique(base);
  const present = new Set(order);
  const next = new Map<string, Set<string>>();
  const degree = new Map(order.map((key) => [key, 0]));
  for (const [under, over] of relations) {
    if (under === over || !present.has(under) || !present.has(over)) continue;
    if (!next.has(under)) next.set(under, new Set());
    if (next.get(under)!.has(over)) continue;
    next.get(under)!.add(over);
    degree.set(over, (degree.get(over) ?? 0) + 1);
  }
  const left = new Set(order);
  const out: string[] = [];
  while (left.size) {
    const key = order.find((candidate) => left.has(candidate) && degree.get(candidate) === 0);
    // Contradictory owner relations retain the remaining carried/input order deterministically.
    if (!key) {
      out.push(...order.filter((candidate) => left.has(candidate)));
      break;
    }
    left.delete(key);
    out.push(key);
    for (const over of next.get(key) ?? []) degree.set(over, (degree.get(over) ?? 0) - 1);
  }
  return out;
}

/**
 * Bottom→top rule: each carried block retains its previous total order; otherwise pieces start in
 * operation input order. A current surface part (pocket bag, facing, placket in a slit) is below
 * its host. An edge anchor whose decoded `HandPlace.inside` is true is below its opposite-side
 * partner. Unconstrained pieces keep their stable input order.
 */
function layersOf(
  inputs: readonly ResolvedInput[],
  rows: readonly StepStoredRow[],
  transforms: ReadonlyMap<string, Affine>,
): string[] {
  const base = inputs.flatMap((group) => {
    const carried = group.seed?.result.layers.filter((piece) => group.pieces.includes(piece)) ?? [];
    return [...carried, ...group.pieces.filter((piece) => !carried.includes(piece))];
  });
  const relations: LayerRelation[] = [];
  for (const group of inputs) {
    const carried = group.seed?.result.layers.filter((piece) => group.pieces.includes(piece)) ?? [];
    for (let index = 1; index < carried.length; index++)
      relations.push([carried[index - 1], carried[index]]);
  }
  for (const stored of rows) {
    const surface = stored.candidate.kind === 'surface' ? stored.candidate.surface : undefined;
    if (surface) relations.push([surface.part, surface.host]);
    if (stored.row.kind === 'surface') continue;
    for (const [own, other] of [
      [stored.row.sideA, stored.row.sideB],
      [stored.row.sideB, stored.row.sideA],
    ] as const)
      for (const anchor of own) {
        if (!decodeHandPlace(anchor.placement)?.inside) continue;
        const partner = other.find((candidate) => candidate.piece !== anchor.piece)?.piece;
        if (partner) relations.push([anchor.piece, partner]);
      }
  }
  return orderedLayers(
    base.filter((piece) => transforms.has(piece)),
    relations,
  );
}

function neutralLayout(
  pieces: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
): StepLayout {
  return stepLayout([pieces], [], geoms, { explode: 0, bagsAsLayers: false });
}

function computeStep(
  input: StepResultsInput,
  index: number,
  latestByOutput: ReadonlyMap<string, ComputedStep>,
  outputAt: ReadonlyMap<string, readonly number[]>,
): ComputedStep {
  const op = input.ops[index];
  const inputs = resolvedInputs(input, index, latestByOutput, outputAt);
  const leaves = inputs.map((group) => group.pieces);
  const stored = storedRowsOfStep(op, input.byKey, input.geoms, input.innerLines);
  const ownerRows = stored.map(({ row }) => row);
  // One rigid input has nowhere to move. Its rows may still affect audit/layer metadata, but they
  // must not re-lay pieces inside the block.
  const placeRows = inputs.length > 1 ? stored : [];
  const layout = stepLayout(
    leaves,
    placeRows.map(({ candidate }) => candidate),
    input.geoms,
    {
      explode: 0,
      hand: inputs.length > 1 ? handsFromSeams(ownerRows) : EMPTY_HANDS,
      twinHand: EMPTY_HANDS,
      inputLayouts: inputs.map((group) => group.seed?.layout),
      bagsAsLayers: false,
    },
  );

  const neutral = inputs.map(
    (group) => group.seed?.layout ?? neutralLayout(group.pieces, input.geoms),
  );
  const blockTransforms = inputs.map((group, groupIndex): Affine => {
    const first = group.pieces.find(
      (piece) => layout.T.has(piece) && neutral[groupIndex].T.has(piece),
    );
    return first
      ? compose(layout.T.get(first)!, invert(neutral[groupIndex].T.get(first)!))
      : IDENTITY;
  });
  const ignoredPoses = applyCurrentPoses(
    op,
    input.poses,
    layout,
    inputs,
    input.geoms,
    blockTransforms,
  );
  const transforms = new Map(layout.T);
  const ownRow =
    stored.length > 0 || (op?.poseKeys ?? []).some((key) => input.poses?.has(key) ?? false);
  const result: StepResult = {
    opIndex: index,
    transforms,
    layers: layersOf(inputs, stored, transforms),
    blocks: inputs.map((group, groupIndex) => ({
      inputKey: group.key,
      pieces: group.pieces.filter((piece) => transforms.has(piece)),
      T: blockTransforms[groupIndex],
    })),
    ignoredPoses,
    cycles: unique(inputs.flatMap((group) => group.cycles)),
    layout,
    owned: ownRow || inputs.some((group) => group.seed?.result.owned ?? false),
  };
  return { result, layout };
}

// One entry per geometry identity: the latest card state. Every edit changes the signature, so a
// map of all signatures would grow for the whole session.
const cache = new WeakMap<object, { signature: string; results: readonly StepResult[] }>();
const identity = new WeakMap<object, number>();
let nextIdentity = 1;

const identityOf = (value: object) => {
  let id = identity.get(value);
  if (id == null) {
    id = nextIdentity++;
    identity.set(value, id);
  }
  return id;
};

const sortedEntries = <T>(map: ReadonlyMap<string, T>) =>
  [...map].sort(([left], [right]) => left.localeCompare(right));

/** Content signature; geometry is the outer WeakMap identity and inner-line identity is explicit. */
export function stepResultsSignature(input: StepResultsInput): string {
  return JSON.stringify({
    ops: input.ops.map((op) => ({
      inputKeys: op.inputKeys,
      outputUnitKey: op.outputUnitKey,
      seamKeys: op.seamKeys,
      poseKeys: op.poseKeys,
      operationNumber: op.operationNumber,
      assemblyBlockDetached: op.assemblyBlockDetached,
    })),
    rows: sortedEntries(input.byKey),
    poses: sortedEntries(input.poses ?? new Map()),
    pieceKeys: [...input.pieceKeys].sort(),
    innerLines: identityOf(input.innerLines as object),
  });
}

/**
 * Compute every operation in one forward pass and memoise the complete card result. The surface
 * path is `storedRowsOfStep → candidateOfStoredSeam → seamOfSides/surfaceSeam`; the surface is
 * applied at its own operation by `stepLayout`, then this function carries that operation's full
 * `StepLayout` through `inputLayouts` whenever a later operation consumes its output unit. No
 * later operation re-resolves that old surface row.
 *
 * With no seam or pose rows, multiple inputs are placed by `stepLayout`'s deterministic shelves:
 * input order, left-to-right with its `APART` gap, wrapping onto the next horizontal shelf when
 * needed, and no seam alignment. One input keeps its seeded transforms unchanged. The same rules
 * naturally cover rowless raw pieces.
 */
export function stepResults(input: StepResultsInput): readonly StepResult[] {
  const signature = stepResultsSignature(input);
  const hit = cache.get(input.geoms as object);
  if (hit?.signature === signature) return hit.results;

  const outputAt = new Map<string, number[]>();
  input.ops.forEach((op, index) => {
    const output = (op.outputUnitKey ?? '').trim();
    if (output) outputAt.set(output, [...(outputAt.get(output) ?? []), index]);
  });
  const latestByOutput = new Map<string, ComputedStep>();
  const computed: ComputedStep[] = [];
  input.ops.forEach((op, index) => {
    const step = computeStep(input, index, latestByOutput, outputAt);
    computed.push(step);
    const output = (op.outputUnitKey ?? '').trim();
    if (output) latestByOutput.set(output, step);
  });
  const results = Object.freeze(computed.map(({ result }) => result));
  cache.set(input.geoms as object, { signature, results });
  return results;
}
