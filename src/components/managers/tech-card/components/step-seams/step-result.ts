// ONE OWNER RESULT PER STEP, PURE. No graph choice, proposal, crop, focus, inherited pose pin or
// React state enters this module. The pass is deliberately sequential: every unit input receives
// the layout of the latest earlier operation that produced it through `stepLayout.inputLayouts`.

import type { Affine, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { compose, IDENTITY } from 'lib/assembly-skeleton/union/affine';
import { poseAnchorOf, poseOf, type SeamLayer, type StoredPose, type StoredSeam } from 'lib/seams';

import { cardFoldsOf, foldOnceOf, type CardFolds, type StepFolds } from './step-folds';
import { handsFromSeams } from './step-hand';
import { inputGroups, type FormOpLike, type InputGroup } from './step-seams-model';
import { invert, stepLayout, type StepLayout } from './step-picture';
import { pinPoses, poseBlockGroup, type PosePin } from './step-pose';
import { seamIsLaid, storedRowsOfStep, type StepStoredRow } from './step-rows';

export type StepResultBlock = {
  inputKey: string;
  pieces: readonly string[];
  /** The one affine applied to this input's seeded result in this step. */
  T: Affine;
};

export type LayerRelation = readonly [under: string, over: string];

/** The part of a stored anchor the layer rule reads. */
export type LayerAnchor = { readonly piece: string; readonly layer?: SeamLayer };

/** One input of a step, rigid: its pieces and the order and claims it carries from earlier steps. */
export type LayerBlock = {
  /** The input it is at its step: what the owner's order names. */
  key?: string;
  pieces: readonly string[];
  layers?: readonly string[];
  stacked?: readonly LayerRelation[];
  /** The part of `stacked` an owner's order set at an earlier step. */
  ordered?: readonly LayerRelation[];
};

/** One stored seam or pose row of a step, in the order it is read. */
export type LayerRow = {
  key: string;
  pose?: boolean;
  sideA: readonly LayerAnchor[];
  sideB: readonly LayerAnchor[];
};

export type LayerInput = {
  blocks: readonly LayerBlock[];
  rows: readonly LayerRow[];
  /** The owner's order of the blocks, bottom to top, by block key. */
  order?: readonly string[];
};

/** A stored flag that lost to an earlier one. */
export type LayerConflict = { key: string; piece: string; partner: string; layer: SeamLayer };

export type LayerStacking = {
  /** Bottom → top. Every pair of `stacked` agrees with this order. */
  layers: string[];
  stacked: LayerRelation[];
  lower: string[];
  conflicts: LayerConflict[];
  /** The part of `stacked` an owner's order set, here or carried; absent with none. */
  ordered?: LayerRelation[];
};

export type StepResult = {
  opIndex: number;
  transforms: ReadonlyMap<string, Affine>;
  /** Bottom → top paint order. */
  layers: readonly string[];
  /**
   * The owner's stacking claims in effect at this step, `[under, over]` (the explicit under/over
   * flag only), carried claims included. The only source of under/over.
   */
  stacked: readonly (readonly [string, string])[];
  /** The part of `stacked` the owner's order set, here or at an earlier step; none = no order. */
  ordered?: readonly LayerRelation[];
  /** Pieces some claim puts under another piece; every other piece is not lower. */
  lower: readonly string[];
  /** What `layersOf` read for this result: PLACE recomputes its preview from the same input. */
  layerInput: LayerInput;
  /** Stored flags the first-flag rule did not apply: listed, never rewritten. */
  layerConflicts: readonly LayerConflict[];
  blocks: readonly StepResultBlock[];
  /** Piece-level [input, host] links in this operation's result, for rigid PLACE pickup. */
  hung: readonly (readonly [string, string])[];
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
  /** The card's stored folds; only a step that sees one draws it. */
  folds?: CardFolds;
};

export type StepResultsOptions = {
  /** Use only owner-preserving, translation-only fit for unplaced edge rows. */
  manualFit?: boolean;
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
    const anchor = row ? poseAnchorOf(row) : null;
    const pose = anchor ? { ...anchor, host: anchor.piece } : row ? poseOf(row) : null;
    if (!pose) continue;
    const pieceInput = inputOf.get(pose.piece);
    const hostInput = inputOf.get(pose.host);
    if (!anchor && pieceInput != null && pieceInput === hostInput) {
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
    groupOf: (piece, host) => poseBlockGroup(piece, host, { blocks: inputs, hung: layout.hung }),
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

/**
 * Stable topological order: input order is the tie-breaker, constraints only move layers. Relations
 * come in priority order; one that would close a cycle with those before it is dropped.
 */
export function orderedLayers(
  base: readonly string[],
  relations: readonly LayerRelation[],
): string[] {
  const order = unique(base);
  const present = new Set(order);
  const next = new Map<string, Set<string>>();
  const degree = new Map(order.map((key) => [key, 0]));
  for (const [under, over] of relations) {
    if (under === over || !present.has(under) || !present.has(over)) continue;
    if (next.get(under)?.has(over)) continue;
    if (reachesAny(next, [over], new Set([under]))) continue;
    if (!next.has(under)) next.set(under, new Set());
    next.get(under)!.add(over);
    degree.set(over, (degree.get(over) ?? 0) + 1);
  }
  const left = new Set(order);
  const out: string[] = [];
  while (left.size) {
    const key = order.find((candidate) => left.has(candidate) && degree.get(candidate) === 0)!;
    left.delete(key);
    out.push(key);
    for (const over of next.get(key) ?? []) degree.set(over, (degree.get(over) ?? 0) - 1);
  }
  return out;
}

/** Does any of `from` reach any of `to` along accepted relations? */
function reachesAny(
  next: ReadonlyMap<string, ReadonlySet<string>>,
  from: readonly string[],
  to: ReadonlySet<string>,
): boolean {
  const seen = new Set(from);
  const stack = [...from];
  while (stack.length) {
    const key = stack.pop()!;
    if (to.has(key)) return true;
    for (const over of next.get(key) ?? [])
      if (!seen.has(over)) {
        seen.add(over);
        stack.push(over);
      }
  }
  return false;
}

/**
 * THE LAYER RULE. Bottom→top order and claims of one step, one source for the result, the preview
 * and paper. Claims come only from the owner: an anchor's explicit `layer` on a seam or pose row. A
 * hand place's `inside` is not a claim. A flag says how the two input blocks of its row relate, so
 * it is read as every piece of the lower block under every piece of the upper one; both blocks stay
 * rigid and whole. Rows are read in order and the first flag wins: a flag contrary to what is already
 * read, directly or through another block, is listed in `conflicts` and not applied (the row is not
 * rewritten). A flag between two pieces of one block stays a claim about those two pieces. Claims made
 * at an earlier step ride in the block (`stacked`). With no claim nothing is lower and the later input
 * lies on top: carried order, then input order, a surface part like any other input.
 *
 * THE OWNER'S ORDER (`order`, the LAYERS window, bottom to top, by block key) beats the flags between
 * blocks: they are neither read nor listed. Flags inside a block read as before. A key no longer among
 * the inputs is skipped and a new input lies on top; an order naming no block is no order. Its pairs
 * ride to later steps in `stacked`, and in `ordered`, which is what the fills paint by.
 */
export function layersOf(
  blocks: readonly LayerBlock[],
  rows: readonly LayerRow[],
  order?: readonly string[],
): LayerStacking {
  const blockOf = new Map<string, number>();
  blocks.forEach((block, index) => {
    for (const piece of block.pieces) if (!blockOf.has(piece)) blockOf.set(piece, index);
  });
  const members = blocks.map((block, index) =>
    unique(block.pieces).filter((piece) => blockOf.get(piece) === index),
  );
  const carriedOf = (block: LayerBlock, index: number) =>
    (block.layers ?? []).filter((piece) => members[index].includes(piece));
  const ranking = blockRanking(blocks, members, order);

  const above = new Map<string, Set<string>>();
  const stacked: LayerRelation[] = [];
  const add = (under: string, over: string) => {
    if (!above.has(under)) above.set(under, new Set());
    if (above.get(under)!.has(over)) return;
    above.get(under)!.add(over);
    stacked.push([under, over]);
  };
  blocks.forEach((block, index) => {
    for (const [under, over] of block.stacked ?? [])
      if (members[index].includes(under) && members[index].includes(over)) add(under, over);
  });

  const conflicts: LayerConflict[] = [];
  const read = (key: string, anchor: LayerAnchor, other: readonly LayerAnchor[]) => {
    const own = blockOf.get(anchor.piece);
    if (!anchor.layer || own == null) return;
    for (const partner of unique(other.map((candidate) => candidate.piece))) {
      const theirs = blockOf.get(partner);
      if (partner === anchor.piece || theirs == null) continue;
      if (ranking && own !== theirs) continue;
      const mine = own === theirs ? [anchor.piece] : members[own];
      const yours = own === theirs ? [partner] : members[theirs];
      const [unders, overs] = anchor.layer === 'under' ? [mine, yours] : [yours, mine];
      if (reachesAny(above, overs, new Set(unders))) {
        conflicts.push({ key, piece: anchor.piece, partner, layer: anchor.layer });
        continue;
      }
      for (const under of unders) for (const over of overs) add(under, over);
    }
  };
  for (const row of rows) {
    for (const anchor of row.sideA) read(row.key, anchor, row.sideB);
    for (const anchor of row.sideB) read(row.key, anchor, row.sideA);
  }

  const hints: LayerRelation[] = [];
  blocks.forEach((block, index) => {
    const carried = carriedOf(block, index);
    for (let at = 1; at < carried.length; at++) hints.push([carried[at - 1], carried[at]]);
  });

  const ordered: LayerRelation[] = blocks.flatMap((block, index) =>
    (block.ordered ?? []).filter(
      ([under, over]) => members[index].includes(under) && members[index].includes(over),
    ),
  );
  ranking?.forEach((lower, at) => {
    for (const upper of ranking.slice(at + 1))
      for (const under of members[lower])
        for (const over of members[upper]) {
          add(under, over);
          ordered.push([under, over]);
        }
  });

  const base = (ranking ?? blocks.map((_, index) => index)).flatMap((index) => {
    const carried = carriedOf(blocks[index], index);
    return [...carried, ...members[index].filter((piece) => !carried.includes(piece))];
  });
  return {
    layers: orderedLayers(base, [...stacked, ...hints]),
    stacked,
    lower: unique(stacked.map(([under]) => under)),
    conflicts,
    ...(ordered.length ? { ordered } : {}),
  };
}

/** Block indexes bottom to top by the owner's order; null when it names no block with a piece. */
function blockRanking(
  blocks: readonly LayerBlock[],
  members: readonly (readonly string[])[],
  order: readonly string[] | undefined,
): number[] | null {
  if (!order?.length) return null;
  const named = unique(order).flatMap((key) => {
    const index = blocks.findIndex((block, at) => block.key === key && members[at].length > 0);
    return index < 0 ? [] : [index];
  });
  if (!named.length) return null;
  const known = new Set(named);
  return [...named, ...blocks.map((_, index) => index).filter((index) => !known.has(index))];
}

/**
 * RULE 8'S LINK. Inputs of a step and the pieces of a carried block are linked, so they can cover each
 * other. The exception is two input blocks joined by a seam that does not lie where it is drawn, and
 * by no seam that does: they only collide in the picture, and that holds on later steps, when they
 * are one carried block. Reads the seams' geometry only, no layer flag and no pose.
 */
function collidingOfStep(
  inputs: readonly ResolvedInput[],
  stored: readonly StepStoredRow[],
  transforms: ReadonlyMap<string, Affine>,
  geoms: ReadonlyMap<string, PieceGeom>,
): [string, string][] {
  const blockOf = new Map<string, number>();
  inputs.forEach((group, index) => {
    for (const piece of group.pieces) if (!blockOf.has(piece)) blockOf.set(piece, index);
  });
  const blocksOf = (side: readonly { piece: string }[]) =>
    unique(side.flatMap((anchor) => blockOf.get(anchor.piece) ?? []));
  const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const laid = new Set<string>();
  const notLaid = new Map<string, [number, number]>();
  for (const { row } of stored) {
    const lies = seamIsLaid(row, transforms, geoms);
    for (const a of blocksOf(row.sideA))
      for (const b of blocksOf(row.sideB)) {
        if (a === b) continue;
        if (lies) laid.add(pairKey(a, b));
        else notLaid.set(pairKey(a, b), [a, b]);
      }
  }
  const carried = inputs.flatMap((group) => group.seed?.layout.colliding ?? []);
  const fresh = [...notLaid].flatMap(([key, [a, b]]) =>
    laid.has(key)
      ? []
      : inputs[a].pieces.flatMap((piece) =>
          inputs[b].pieces.map((other): [string, string] => [piece, other]),
        ),
  );
  return [...carried, ...fresh];
}

function neutralLayout(
  pieces: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
): StepLayout {
  return stepLayout([pieces], [], geoms, { explode: 0, bagsAsLayers: false });
}

function computeStep(
  input: StepResultsInput,
  opts: StepResultsOptions,
  index: number,
  latestByOutput: ReadonlyMap<string, ComputedStep>,
  outputAt: ReadonlyMap<string, readonly number[]>,
  folds: StepFolds | null,
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
      manualFit: opts.manualFit === true,
      ...(folds ? { foldOnce: foldOnceOf(folds, input.geoms, input.folds?.grainDeg) } : {}),
    },
  );
  if (folds && layout.T.size) layout.folds = folds;

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
  layout.colliding = collidingOfStep(inputs, stored, transforms, input.geoms);
  const ownRow =
    stored.length > 0 || (op?.poseKeys ?? []).some((key) => input.poses?.has(key) ?? false);
  const ignored = new Set(ignoredPoses);
  const currentPoses = (op?.poseKeys ?? []).flatMap((key) => {
    const row = ignored.has(key) ? undefined : input.poses?.get(key);
    return row ? [row] : [];
  });
  const layerInput: LayerInput = {
    blocks: inputs.map((group) => ({
      key: group.key,
      pieces: group.pieces.filter((piece) => transforms.has(piece)),
      ...(group.seed
        ? { layers: group.seed.result.layers, stacked: group.seed.result.stacked }
        : {}),
      ...(group.seed?.result.ordered ? { ordered: group.seed.result.ordered } : {}),
    })),
    ...(op?.layerOrder?.length ? { order: op.layerOrder } : {}),
    rows: [
      ...stored.map(({ key, row }): LayerRow => ({ key, sideA: row.sideA, sideB: row.sideB })),
      ...currentPoses.map(
        (pose): LayerRow => ({
          key: pose.seamKey,
          pose: true,
          sideA: pose.sideA,
          sideB: pose.sideB,
        }),
      ),
    ],
  };
  const stacking = layersOf(layerInput.blocks, layerInput.rows, layerInput.order);
  const result: StepResult = {
    opIndex: index,
    transforms,
    layers: stacking.layers,
    stacked: stacking.stacked,
    lower: stacking.lower,
    ...(stacking.ordered ? { ordered: stacking.ordered } : {}),
    layerInput,
    layerConflicts: stacking.conflicts,
    blocks: inputs.map((group, groupIndex) => ({
      inputKey: group.key,
      pieces: group.pieces.filter((piece) => transforms.has(piece)),
      T: blockTransforms[groupIndex],
    })),
    hung: layout.hung ?? [],
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
export function stepResultsSignature(
  input: StepResultsInput,
  opts: StepResultsOptions = {},
): string {
  return JSON.stringify({
    ops: input.ops.map((op) => ({
      inputKeys: op.inputKeys,
      outputUnitKey: op.outputUnitKey,
      seamKeys: op.seamKeys,
      poseKeys: op.poseKeys,
      operationNumber: op.operationNumber,
      assemblyBlockDetached: op.assemblyBlockDetached,
      ...(op.foldKeys?.length ? { foldKeys: op.foldKeys } : {}),
      ...(op.layerOrder?.length ? { layerOrder: op.layerOrder } : {}),
    })),
    rows: sortedEntries(input.byKey),
    poses: sortedEntries(input.poses ?? new Map()),
    pieceKeys: [...input.pieceKeys].sort(),
    innerLines: identityOf(input.innerLines as object),
    ...(opts.manualFit ? { manualFit: true } : {}),
    ...(input.folds?.rows.length
      ? { folds: input.folds.rows, grainDeg: sortedEntries(input.folds.grainDeg) }
      : {}),
  });
}

/** Owner-row steps are laid by the owner's hand only — no auto turns or mirrors (E2). Every
 * caller passes this same option: the cache keeps one entry per card. */
export const OWNER_FIT: StepResultsOptions = { manualFit: true };

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
export function stepResults(
  input: StepResultsInput,
  opts: StepResultsOptions = {},
): readonly StepResult[] {
  const signature = stepResultsSignature(input, opts);
  const hit = cache.get(input.geoms as object);
  if (hit?.signature === signature) return hit.results;

  const outputAt = new Map<string, number[]>();
  input.ops.forEach((op, index) => {
    const output = (op.outputUnitKey ?? '').trim();
    if (output) outputAt.set(output, [...(outputAt.get(output) ?? []), index]);
  });
  const latestByOutput = new Map<string, ComputedStep>();
  const computed: ComputedStep[] = [];
  const foldsAt = cardFoldsOf(input.ops, input.folds, input.geoms, input.innerLines);
  input.ops.forEach((op, index) => {
    const step = computeStep(
      input,
      opts,
      index,
      latestByOutput,
      outputAt,
      foldsAt?.(index) ?? null,
    );
    computed.push(step);
    const output = (op.outputUnitKey ?? '').trim();
    if (output) latestByOutput.set(output, step);
  });
  const results = Object.freeze(computed.map(({ result }) => result));
  cache.set(input.geoms as object, { signature, results });
  return results;
}
