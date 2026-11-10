import { sidePartEdges, type SidePart, type StoredSeam } from 'lib/seams';

import { rowTargetsOfAnchor, storedSeamSides } from './step-rows';
import { pieceOfTarget, type FormOpLike, type TargetId } from './step-seams-model';

export const NO_SEAM_TEXT = 'no seam';

export type StepHighlight = {
  /** Exact persisted targets to accent in every picture of this operation. */
  targets: TargetId[];
  /** The same targets with a real stored span where one exists. */
  parts: SidePart[];
  /** Rows that supplied those targets, for action-line geometry. */
  rows: StoredSeam[];
  /** True only when an edge-finishing operation reads its line from a producer. */
  inherited: boolean;
};

const uniqueRows = (rows: readonly StoredSeam[]) => [
  ...new Map(rows.map((row) => [row.seamKey, row])).values(),
];

const rowsOf = (op: FormOpLike | undefined, byKey: ReadonlyMap<string, StoredSeam>): StoredSeam[] =>
  (op?.seamKeys ?? []).flatMap((key) => {
    const row = byKey.get(key);
    return row ? [row] : [];
  });

export function highlightTargetsOfRows(
  rows: readonly StoredSeam[],
  hostOnly = false,
  hostPieces: ReadonlySet<string> = new Set(),
): TargetId[] {
  const sides = rows.map((row) => storedSeamSides(row));
  const unique = (targets: readonly TargetId[]) => [...new Set(targets)];
  const a = unique(sides.flatMap((side) => side.a));
  const b = unique(sides.flatMap((side) => side.b));
  if (!hostOnly) return unique([...a, ...b]);
  const namedHost = unique([...a, ...b].filter((target) => hostPieces.has(pieceOfTarget(target))));
  if (namedHost.length) return namedHost;
  // Composite joins repeat a cap/counterpart while the host armhole is persisted as a broader
  // chain. Surface rows retain their explicit contract: A is the host placement line.
  if (rows.some((row) => row.kind === 'surface')) return a;
  return b.length > a.length ? b : a;
}

export function highlightPartsOfRows(
  rows: readonly StoredSeam[],
  hostOnly = false,
  hostPieces: ReadonlySet<string> = new Set(),
): SidePart[] {
  const targetOrder = highlightTargetsOfRows(rows, hostOnly, hostPieces);
  const allowed = new Set(targetOrder);
  const parts = rows.flatMap<SidePart>((row) =>
    [...row.sideA, ...row.sideB].flatMap((anchor) => {
      const targets = rowTargetsOfAnchor(anchor);
      if (!targets.some((target) => allowed.has(target))) return [];
      if (row.kind !== 'partial' && row.kind !== 'composite')
        return targets.map((target): SidePart => ({ target }));
      const length = anchor.lenMm;
      const from = Math.max(0, Math.min(length, anchor.range[0] * length));
      const to = Math.max(from, Math.min(length, anchor.range[1] * length));
      return from > 0.05 || to < length - 0.05
        ? [{ target: anchor.edgeHint, range: [from, to] as const }]
        : targets.map((target): SidePart => ({ target }));
    }),
  );
  const remaining = [
    ...new Map(
      parts.map((part) => [
        `${part.target}:${part.range?.[0] ?? ''}:${part.range?.[1] ?? ''}`,
        part,
      ]),
    ).values(),
  ].filter(
    (part) => allowed.has(part.target) || sidePartEdges(part).some((target) => allowed.has(target)),
  );
  const ordered: SidePart[] = [];
  for (const target of targetOrder) {
    const direct = remaining.filter((part) => part.target === target);
    if (direct.length) {
      ordered.push(...direct);
      direct.forEach((part) => remaining.splice(remaining.indexOf(part), 1));
      continue;
    }
    const chain = remaining.find((part) => sidePartEdges(part).includes(target));
    if (chain) {
      ordered.push(chain);
      remaining.splice(remaining.indexOf(chain), 1);
    }
  }
  return [...ordered, ...remaining];
}

type ProducerSource = { index: number; rows: StoredSeam[] };

function producerSourcesOfStep(
  ops: readonly FormOpLike[],
  index: number,
  byKey: ReadonlyMap<string, StoredSeam>,
): ProducerSource[] {
  const nearest = (unit: string, before: number, seen: Set<string>): ProducerSource[] => {
    const key = unit.trim();
    if (!key) return [];
    const visit = `${key}\u0000${before}`;
    if (seen.has(visit)) return [];
    seen.add(visit);
    let producer = -1;
    for (let candidate = before - 1; candidate >= 0; candidate--)
      if ((ops[candidate]?.outputUnitKey ?? '').trim() === key) {
        producer = candidate;
        break;
      }
    if (producer < 0) return [];
    const direct = rowsOf(ops[producer], byKey);
    if (direct.length) return [{ index: producer, rows: direct }];
    return (ops[producer]?.inputKeys ?? []).flatMap((input) => nearest(input, producer, seen));
  };
  return (ops[index]?.inputKeys ?? []).flatMap((input) => nearest(input, index, new Set()));
}

function unitMembersBefore(ops: readonly FormOpLike[], before: number): Map<string, Set<string>> {
  const units = new Map<string, Set<string>>();
  for (const op of ops.slice(0, before)) {
    const output = (op.outputUnitKey ?? '').trim();
    if (!output) continue;
    const members = new Set<string>();
    for (const raw of op.inputKeys ?? []) {
      const input = raw.trim();
      if (!input) continue;
      const unit = units.get(input);
      if (unit) unit.forEach((piece) => members.add(piece));
      else members.add(input);
    }
    units.set(output, members);
  }
  return units;
}

/** Pieces in the largest input block of each row-producing join: the host garment, not its cap. */
function producerHostPieces(ops: readonly FormOpLike[], sources: readonly ProducerSource[]) {
  const host = new Set<string>();
  for (const source of sources) {
    const units = unitMembersBefore(ops, source.index);
    const groups = (ops[source.index]?.inputKeys ?? []).map((raw) => {
      const key = raw.trim();
      return units.get(key) ?? new Set(key ? [key] : []);
    });
    const largest = groups.reduce<ReadonlySet<string> | null>(
      (best, group) => (!best || group.size > best.size ? group : best),
      null,
    );
    largest?.forEach((piece) => host.add(piece));
  }
  return host;
}

/** The closest persisted rows upstream of this operation, one walk per input-unit branch. */
export function producerRowsOfStep(
  ops: readonly FormOpLike[],
  index: number,
  byKey: ReadonlyMap<string, StoredSeam>,
): StoredSeam[] {
  return uniqueRows(producerSourcesOfStep(ops, index, byKey).flatMap((source) => source.rows));
}

export function isProducerLineOperation(op: FormOpLike | undefined): boolean {
  const kind = `${op?.work ?? ''} ${op?.operationType ?? ''}`.trim().toLowerCase();
  return /(?:^|[ _])(?:bind|binding|tape|hem|topstitch)(?:[ _]|$)/.test(kind);
}

/**
 * One source for the line worked on by a step. Own rows accent both sides. An edge-finishing step
 * with no row may inherit the nearest producer rows, but accents only the host run; the joined
 * counterpart remains an ordinary outline.
 */
export function stepHighlightOf(
  ops: readonly FormOpLike[],
  index: number,
  byKey: ReadonlyMap<string, StoredSeam>,
): StepHighlight {
  const own = rowsOf(ops[index], byKey);
  if (own.length) {
    return {
      rows: own,
      targets: highlightTargetsOfRows(own),
      parts: highlightPartsOfRows(own),
      inherited: false,
    };
  }
  if (!isProducerLineOperation(ops[index]))
    return { rows: [], targets: [], parts: [], inherited: false };
  const sources = producerSourcesOfStep(ops, index, byKey);
  const inherited = uniqueRows(sources.flatMap((source) => source.rows));
  return {
    rows: inherited,
    targets: highlightTargetsOfRows(inherited, true, producerHostPieces(ops, sources)),
    parts: highlightPartsOfRows(inherited, true, producerHostPieces(ops, sources)),
    inherited: inherited.length > 0,
  };
}

// A topstitch step lights none of the edges it inherits: its own lines are the only marks.
export const NO_STEP_EDGES: readonly TargetId[] = [];
export const NO_STEP_PARTS: readonly SidePart[] = [];
