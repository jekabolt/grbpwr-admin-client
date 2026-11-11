import {
  assemblySweep,
  classifyAssemblyInputs,
  type AssemblyPiece,
  type AssemblyResult,
  type AssemblyViolation,
} from './assembly-frontier';

export type OperationMembershipRow = {
  inputKeys?: readonly string[];
  outputUnitKey?: string;
  assemblyBlockDetached?: boolean;
};

export type OperationMoveMembership =
  | { accepted: true; assemblyBlockDetached: boolean }
  | { accepted: false; reason: 'join-kept'; outputUnitKey: string }
  | { accepted: false; reason: 'pieces-only' };

/** Pure membership decision shared by the field-array mutator and its focused tests. */
export function operationMoveMembership(
  operation: OperationMembershipRow,
  standalone: boolean,
  pieceKeys: ReadonlySet<string>,
): OperationMoveMembership {
  const outputUnitKey = (operation.outputUnitKey ?? '').trim();
  if (standalone && outputUnitKey) return { accepted: false, reason: 'join-kept', outputUnitKey };
  if (
    standalone &&
    (!operation.inputKeys?.length || operation.inputKeys.some((key) => !pieceKeys.has(key)))
  ) {
    return { accepted: false, reason: 'pieces-only' };
  }
  return { accepted: true, assemblyBlockDetached: standalone };
}

export type MovePlanOperation = OperationMembershipRow & {
  historyKey?: string;
  outputUnitName?: string;
  foldKeys?: readonly string[];
  topstitchLines?: readonly {
    parts?: readonly { piece?: string }[];
  }[];
};

export type MoveFoldRow = {
  foldKey: string;
  pieceKey: string;
  seq: number;
};

export type MovePlanContext = {
  pieces: readonly AssemblyPiece[];
  foldRows?: readonly MoveFoldRow[];
  /** The candidate confirmed by the Pieces dialog. Omit it for the first planning pass. */
  choice?: string;
};

export type OperationMovePlan =
  | { kind: 'move'; inputKeys: string[] }
  | { kind: 'choose'; stepKey: string; options: string[] }
  | { kind: 'refuse'; reason: string };

type IndexedOperation = {
  operation: MovePlanOperation;
  originalIndex: number;
};

/** The same operation projection used by move planning and the remove-ghost refusal gate. */
export function sweepOperationOrder(
  pieces: readonly AssemblyPiece[],
  operations: readonly MovePlanOperation[],
): AssemblyResult {
  const pieceKeys = new Set(pieces.map((piece) => piece.lineKey));
  return assemblySweep(
    [...pieces],
    operations.map((operation) => ({
      inputs: classifyAssemblyInputs(pieceKeys, (operation.inputKeys ?? []).filter(Boolean)),
      outputUnitKey: (operation.outputUnitKey ?? '').trim(),
      outputUnitName: (operation.outputUnitName ?? '').trim(),
      assemblyBlockDetached: !!operation.assemblyBlockDetached,
    })),
  );
}

const moveEntries = (
  operations: readonly MovePlanOperation[],
  from: number,
  to: number,
): { entries: IndexedOperation[]; target: number } | null => {
  if (from < 0 || from >= operations.length || operations.length === 0) return null;
  const target = Math.min(Math.max(to, 0), operations.length - 1);
  const entries = operations.map((operation, originalIndex) => ({ operation, originalIndex }));
  const [moved] = entries.splice(from, 1);
  entries.splice(target, 0, moved);
  return { entries, target };
};

const violationSignature = (violation: AssemblyViolation, entries: readonly IndexedOperation[]) =>
  [
    violation.rule,
    violation.detail,
    violation.step < 0 ? -1 : entries[violation.step]?.originalIndex ?? violation.step,
    violation.input,
    violation.key,
  ].join('|');

const newViolations = (
  before: AssemblyResult,
  beforeEntries: readonly IndexedOperation[],
  after: AssemblyResult,
  afterEntries: readonly IndexedOperation[],
) => {
  const had = new Set(
    before.violations.map((violation) => violationSignature(violation, beforeEntries)),
  );
  return after.violations.filter(
    (violation) => !had.has(violationSignature(violation, afterEntries)),
  );
};

const foldOrderBreaks = (
  entries: readonly IndexedOperation[],
  rows: readonly MoveFoldRow[],
): Set<string> => {
  const stepByFold = new Map<string, number>();
  entries.forEach(({ operation }, index) => {
    for (const foldKey of operation.foldKeys ?? []) {
      if (!stepByFold.has(foldKey)) stepByFold.set(foldKey, index);
    }
  });
  const byPiece = new Map<string, MoveFoldRow[]>();
  for (const row of rows) {
    const key = row.pieceKey.toUpperCase();
    byPiece.set(key, [...(byPiece.get(key) ?? []), row]);
  }
  const broken = new Set<string>();
  for (const pieceRows of byPiece.values()) {
    for (let left = 0; left < pieceRows.length; left++) {
      for (let right = left + 1; right < pieceRows.length; right++) {
        const a = pieceRows[left];
        const b = pieceRows[right];
        if (a.seq === b.seq) continue;
        const earlier = a.seq < b.seq ? a : b;
        const later = a.seq < b.seq ? b : a;
        const earlierStep = stepByFold.get(earlier.foldKey);
        const laterStep = stepByFold.get(later.foldKey);
        if (earlierStep === undefined || laterStep === undefined || earlierStep <= laterStep)
          continue;
        broken.add(`${earlier.foldKey}|${later.foldKey}`);
      }
    }
  }
  return broken;
};

const liveOwnerOf = (
  key: string,
  prefix: AssemblyResult,
  prefixOperations: readonly MovePlanOperation[],
): string | null => {
  let current = key;
  const seen = new Set<string>();
  while (!prefix.frontier.includes(current)) {
    if (seen.has(current)) return null;
    seen.add(current);
    const eater = prefix.consumedBy.get(current);
    if (eater === undefined) return null;
    const output = (prefixOperations[eater]?.outputUnitKey ?? '').trim();
    if (!output || output === current) return null;
    current = output;
  }
  return current;
};

const candidatesAbove = (
  key: string,
  prefix: AssemblyResult,
  operations: readonly MovePlanOperation[],
  target: number,
): string[] => {
  const live = new Set(prefix.frontier);
  const seen = new Set<string>();
  const visit = (candidate: string): string[] => {
    if (live.has(candidate)) return [candidate];
    if (seen.has(candidate)) return [];
    seen.add(candidate);
    const producer = operations.findIndex(
      (operation, index) =>
        index >= target &&
        !operation.assemblyBlockDetached &&
        (operation.outputUnitKey ?? '').trim() === candidate,
    );
    if (producer < 0) return [];
    return (operations[producer].inputKeys ?? []).flatMap(visit);
  };
  return [...new Set(visit(key))];
};

const geometryPieceKeys = (
  operation: MovePlanOperation,
  foldRows: readonly MoveFoldRow[],
): Set<string> => {
  const foldKeys = new Set(operation.foldKeys ?? []);
  const pieces = new Set(
    foldRows.filter((row) => foldKeys.has(row.foldKey)).map((row) => row.pieceKey),
  );
  for (const line of operation.topstitchLines ?? []) {
    for (const part of line.parts ?? []) if (part.piece) pieces.add(part.piece);
  }
  return pieces;
};

const candidateHoldingGeometry = (
  candidates: readonly string[],
  geometryPieces: ReadonlySet<string>,
  prefixOperations: readonly MovePlanOperation[],
): string | null => {
  if (geometryPieces.size === 0) return null;
  const heldGeometry = new Map<string, Set<string>>(
    [...geometryPieces].map((piece) => [piece, new Set([piece])]),
  );
  for (const operation of prefixOperations) {
    if (operation.assemblyBlockDetached) continue;
    const output = (operation.outputUnitKey ?? '').trim();
    if (!output) continue;
    const held = new Set<string>();
    for (const input of operation.inputKeys ?? []) {
      if (geometryPieces.has(input)) held.add(input);
      for (const piece of heldGeometry.get(input) ?? []) held.add(piece);
    }
    heldGeometry.set(output, held);
  }
  const matches = candidates.filter((candidate) => {
    if (geometryPieces.has(candidate)) return true;
    return (heldGeometry.get(candidate)?.size ?? 0) > 0;
  });
  return matches.length === 1 ? matches[0] : null;
};

const replaceInput = (inputKeys: readonly string[], at: number, key: string): string[] => {
  const next = [...inputKeys];
  next[at] = key;
  return next.filter((candidate, index) => candidate && next.indexOf(candidate) === index);
};

/**
 * Plans an atomic row move against the server-compatible frontier sweep.
 *
 * It never expands a unit to its leaves to offer choices. Producer inputs are recursively walked
 * only until they reach entities actually on the table before the moved row.
 */
export function planMove(
  operations: readonly MovePlanOperation[],
  from: number,
  to: number,
  ctx: MovePlanContext,
): OperationMovePlan {
  const movedOrder = moveEntries(operations, from, to);
  if (!movedOrder) return { kind: 'refuse', reason: 'the sequence has changed since' };
  const beforeEntries = operations.map((operation, originalIndex) => ({
    operation,
    originalIndex,
  }));
  const { entries, target } = movedOrder;
  const moved = entries[target];
  const stepKey = moved.operation.historyKey?.trim() || `step:${moved.originalIndex}`;

  const previousFoldBreaks = foldOrderBreaks(beforeEntries, ctx.foldRows ?? []);
  const nextFoldBreaks = foldOrderBreaks(entries, ctx.foldRows ?? []);
  if ([...nextFoldBreaks].some((key) => !previousFoldBreaks.has(key))) {
    return { kind: 'refuse', reason: 'MOVE THE FOLD FIRST' };
  }

  const before = sweepOperationOrder(ctx.pieces, operations);
  const movedOperations = entries.map(({ operation }) => operation);
  const after = sweepOperationOrder(ctx.pieces, movedOperations);
  const broken = newViolations(before, beforeEntries, after, entries);
  if (broken.length === 0) {
    return { kind: 'move', inputKeys: [...(moved.operation.inputKeys ?? [])] };
  }

  const breaksAnotherStep = broken.find((violation) => violation.step !== target);
  if (breaksAnotherStep) return { kind: 'refuse', reason: breaksAnotherStep.message };
  if ((moved.operation.outputUnitKey ?? '').trim()) {
    return { kind: 'refuse', reason: broken[0].message };
  }

  const supported = broken.every(
    (violation) =>
      violation.input >= 0 &&
      (violation.detail === 'produced-later' || violation.detail === 'consumed-earlier'),
  );
  if (!supported) return { kind: 'refuse', reason: broken[0].message };

  const prefixOperations = movedOperations.slice(0, target);
  const prefix = sweepOperationOrder(ctx.pieces, prefixOperations);
  const geometry = geometryPieceKeys(moved.operation, ctx.foldRows ?? []);
  let inputKeys = [...(moved.operation.inputKeys ?? [])];
  const byInput = new Map<number, AssemblyViolation>();
  for (const violation of broken)
    if (!byInput.has(violation.input)) byInput.set(violation.input, violation);

  for (const [inputIndex, violation] of [...byInput].sort(([a], [b]) => a - b)) {
    const candidates =
      violation.detail === 'consumed-earlier'
        ? [liveOwnerOf(violation.key, prefix, prefixOperations)].filter(
            (candidate): candidate is string => !!candidate,
          )
        : candidatesAbove(violation.key, prefix, movedOperations, target);
    if (candidates.length === 0) return { kind: 'refuse', reason: violation.message };

    let selected = candidates.length === 1 ? candidates[0] : null;
    if (!selected) selected = candidateHoldingGeometry(candidates, geometry, prefixOperations);
    if (!selected && ctx.choice && candidates.includes(ctx.choice)) selected = ctx.choice;
    if (!selected) return { kind: 'choose', stepKey, options: candidates };
    inputKeys = replaceInput(inputKeys, inputIndex, selected);
  }

  const repairedEntries = entries.map((entry, index) =>
    index === target ? { ...entry, operation: { ...entry.operation, inputKeys } } : entry,
  );
  const repaired = sweepOperationOrder(
    ctx.pieces,
    repairedEntries.map(({ operation }) => operation),
  );
  const stillBroken = newViolations(before, beforeEntries, repaired, repairedEntries)[0];
  if (stillBroken) return { kind: 'refuse', reason: stillBroken.message };
  return { kind: 'move', inputKeys };
}
