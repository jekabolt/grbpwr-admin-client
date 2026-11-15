import type { ClothSeamMap } from '../mesh/cloth-mesh-ir';

export type SeamConstraintDiagnosticCode =
  | 'conflicting-ownership'
  | 'duplicate-pair'
  | 'duplicate-seam-id'
  | 'empty-seam'
  | 'incomplete-pair'
  | 'invalid-particle-count'
  | 'out-of-range-index'
  | 'self-pair'
  | 'unsupported-length-ratio'
  | 'unsupported-mapping';

export type SeamConstraintDiagnostic = {
  readonly severity: 'error';
  readonly code: SeamConstraintDiagnosticCode;
  readonly message: string;
  readonly seamId?: string;
  readonly sourcePairIndex?: number;
};

/**
 * CPU-owned seam buffers prepared for a later SimulationPackage revision. Constraint offsets in
 * every array refer to the graph-color-grouped order in `vertexPairs`.
 */
export type CompiledSeamConstraints = {
  readonly constraintCount: number;
  readonly colorCount: number;
  /** Stable lexical table addressed by `seamIdIndices`. */
  readonly seamIds: readonly string[];
  /** Consecutive [vertexA, vertexB] pairs, grouped by graph color. */
  readonly vertexPairs: Uint32Array;
  /** Zero metres for the equal-seam increment. */
  readonly targetLengthsM: Float32Array;
  /** Index into `seamIds` for each grouped constraint. */
  readonly seamIdIndices: Uint32Array;
  /** Pair offset in the source ClothSeamMap for each grouped constraint. */
  readonly sourcePairIndices: Uint32Array;
  /** Consecutive [offset, count] values, one pair per graph color. */
  readonly colorRanges: Uint32Array;
  /** Grouped constraint offsets ordered by seam id, then source pair index. */
  readonly activationOrder: Uint32Array;
};

export const ALL_AT_ONCE_SEAM_PREACTIVATION_V1 = 'all-at-once-seam-preactivation/v1' as const;

export type SeamPreactivationRejectReason =
  | 'invalid-tolerance'
  | 'invalid-buffer'
  | 'non-finite-rest-position'
  | 'nonzero-target-length'
  | 'incoherent-rest-pair';

export type SeamPreactivationReportV1 = {
  readonly version: typeof ALL_AT_ONCE_SEAM_PREACTIVATION_V1;
  readonly eligible: boolean;
  readonly pairCount: number;
  readonly toleranceM: number;
  readonly maxRestGapM: number;
  readonly rejectReason?: SeamPreactivationRejectReason;
  readonly rejectConstraintIndex?: number;
};

/**
 * All-at-once is safe only for already assembled, zero-target seam pairs. This guard is pure and
 * deliberately independent of runtime activation scheduling.
 */
export function evaluateAllAtOnceSeamPreactivationV1(
  restPositionsInvMass: Float32Array,
  seams: CompiledSeamConstraints,
  toleranceM: number,
): SeamPreactivationReportV1 {
  const reject = (
    rejectReason: SeamPreactivationRejectReason,
    maxRestGapM = 0,
    rejectConstraintIndex?: number,
  ): SeamPreactivationReportV1 => ({
    version: ALL_AT_ONCE_SEAM_PREACTIVATION_V1,
    eligible: false,
    pairCount: seams.constraintCount,
    toleranceM,
    maxRestGapM,
    rejectReason,
    ...(rejectConstraintIndex === undefined ? {} : { rejectConstraintIndex }),
  });

  if (!Number.isFinite(toleranceM) || toleranceM < 0) return reject('invalid-tolerance');
  if (
    restPositionsInvMass.length % 4 !== 0 ||
    seams.vertexPairs.length !== seams.constraintCount * 2 ||
    seams.targetLengthsM.length !== seams.constraintCount
  ) {
    return reject('invalid-buffer');
  }

  const particleCount = restPositionsInvMass.length / 4;
  let maxRestGapM = 0;
  for (let constraintIndex = 0; constraintIndex < seams.constraintCount; constraintIndex += 1) {
    if (seams.targetLengthsM[constraintIndex] !== 0) {
      return reject('nonzero-target-length', maxRestGapM, constraintIndex);
    }
    const first = seams.vertexPairs[constraintIndex * 2];
    const second = seams.vertexPairs[constraintIndex * 2 + 1];
    if (first >= particleCount || second >= particleCount) {
      return reject('invalid-buffer', maxRestGapM, constraintIndex);
    }
    const firstOffset = first * 4;
    const secondOffset = second * 4;
    const values = [
      restPositionsInvMass[firstOffset],
      restPositionsInvMass[firstOffset + 1],
      restPositionsInvMass[firstOffset + 2],
      restPositionsInvMass[secondOffset],
      restPositionsInvMass[secondOffset + 1],
      restPositionsInvMass[secondOffset + 2],
    ];
    if (!values.every(Number.isFinite)) {
      return reject('non-finite-rest-position', maxRestGapM, constraintIndex);
    }
    const restGapM = Math.hypot(
      values[0] - values[3],
      values[1] - values[4],
      values[2] - values[5],
    );
    maxRestGapM = Math.max(maxRestGapM, restGapM);
    if (restGapM > toleranceM) {
      return reject('incoherent-rest-pair', maxRestGapM, constraintIndex);
    }
  }

  return {
    version: ALL_AT_ONCE_SEAM_PREACTIVATION_V1,
    eligible: true,
    pairCount: seams.constraintCount,
    toleranceM,
    maxRestGapM,
  };
}

export type CompileSeamConstraintsResult =
  | {
      readonly ok: true;
      readonly constraints: CompiledSeamConstraints;
      readonly diagnostics: readonly [];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly SeamConstraintDiagnostic[];
    };

type SourceConstraint = {
  readonly first: number;
  readonly second: number;
  readonly seamIdIndex: number;
  readonly sourcePairIndex: number;
  readonly activationRank: number;
};

function pairKey(first: number, second: number): string {
  return Math.min(first, second) + ':' + Math.max(first, second);
}

function diagnostic(
  code: SeamConstraintDiagnosticCode,
  message: string,
  seamId?: string,
  sourcePairIndex?: number,
): SeamConstraintDiagnostic {
  return { severity: 'error', code, message, seamId, sourcePairIndex };
}

/**
 * Compiles ClothMeshIR seam maps without changing SimulationPackage or runtime ownership. The
 * first increment accepts only one-to-one equal seams and fails atomically on unsupported or
 * ambiguous input.
 */
export function compileSeamConstraints(
  seams: readonly ClothSeamMap[],
  particleCount: number,
): CompileSeamConstraintsResult {
  const diagnostics: SeamConstraintDiagnostic[] = [];
  if (!Number.isSafeInteger(particleCount) || particleCount < 0) {
    return {
      ok: false,
      diagnostics: [
        diagnostic('invalid-particle-count', 'particleCount must be a non-negative safe integer.'),
      ],
    };
  }
  if (seams.length === 0) {
    return {
      ok: false,
      diagnostics: [diagnostic('empty-seam', 'No seams were provided for compilation.')],
    };
  }

  const seamIdCounts = new Map<string, number>();
  for (const seam of seams) {
    seamIdCounts.set(seam.seamId, (seamIdCounts.get(seam.seamId) ?? 0) + 1);
  }
  for (const [seamId, count] of [...seamIdCounts].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (count > 1) {
      diagnostics.push(
        diagnostic(
          'duplicate-seam-id',
          'Seam id is not unique, so source ownership is ambiguous.',
          seamId,
        ),
      );
    }
  }

  const orderedSeams = [...seams].sort((left, right) => left.seamId.localeCompare(right.seamId));
  const seamIds = [...seamIdCounts.keys()].sort((left, right) => left.localeCompare(right));
  const seamIdIndices = new Map(seamIds.map((seamId, index) => [seamId, index]));
  const pairOwners = new Map<string, string>();
  const sourceConstraints: SourceConstraint[] = [];

  for (const seam of orderedSeams) {
    if (seam.mapping !== 'equal') {
      diagnostics.push(
        diagnostic(
          'unsupported-mapping',
          seam.mapping + ' seam mapping is unsupported by the equal-seam compiler.',
          seam.seamId,
        ),
      );
    }
    if (!Number.isFinite(seam.lengthRatio) || seam.lengthRatio !== 1) {
      diagnostics.push(
        diagnostic(
          'unsupported-length-ratio',
          'Equal seam compilation requires lengthRatio to be exactly 1.',
          seam.seamId,
        ),
      );
    }
    if (seam.vertexPairs.length === 0) {
      diagnostics.push(diagnostic('empty-seam', 'Seam contains no vertex pairs.', seam.seamId));
      continue;
    }
    if (seam.vertexPairs.length % 2 !== 0) {
      diagnostics.push(
        diagnostic('incomplete-pair', 'Seam vertexPairs must contain complete pairs.', seam.seamId),
      );
    }

    const localPairs = new Set<string>();
    const pairCount = Math.floor(seam.vertexPairs.length / 2);
    for (let sourcePairIndex = 0; sourcePairIndex < pairCount; sourcePairIndex += 1) {
      const first = seam.vertexPairs[sourcePairIndex * 2];
      const second = seam.vertexPairs[sourcePairIndex * 2 + 1];
      if (first >= particleCount || second >= particleCount) {
        diagnostics.push(
          diagnostic(
            'out-of-range-index',
            'Seam pair references a particle outside particleCount.',
            seam.seamId,
            sourcePairIndex,
          ),
        );
        continue;
      }
      if (first === second) {
        diagnostics.push(
          diagnostic(
            'self-pair',
            'Seam pair cannot constrain a particle to itself.',
            seam.seamId,
            sourcePairIndex,
          ),
        );
        continue;
      }

      const key = pairKey(first, second);
      if (localPairs.has(key)) {
        diagnostics.push(
          diagnostic(
            'duplicate-pair',
            'Seam repeats the same undirected vertex pair.',
            seam.seamId,
            sourcePairIndex,
          ),
        );
        continue;
      }
      localPairs.add(key);

      const owner = pairOwners.get(key);
      if (owner !== undefined && owner !== seam.seamId) {
        diagnostics.push(
          diagnostic(
            'conflicting-ownership',
            'Vertex pair is already owned by seam ' + owner + '.',
            seam.seamId,
            sourcePairIndex,
          ),
        );
        continue;
      }
      pairOwners.set(key, seam.seamId);
      sourceConstraints.push({
        first,
        second,
        seamIdIndex: seamIdIndices.get(seam.seamId) ?? 0,
        sourcePairIndex,
        activationRank: sourceConstraints.length,
      });
    }
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const colorsAtVertex = new Map<number, Set<number>>();
  const colorsFor = (vertex: number): Set<number> => {
    const existing = colorsAtVertex.get(vertex);
    if (existing !== undefined) return existing;
    const colors = new Set<number>();
    colorsAtVertex.set(vertex, colors);
    return colors;
  };
  const colors: SourceConstraint[][] = [];
  for (const constraint of sourceConstraints) {
    const firstColors = colorsFor(constraint.first);
    const secondColors = colorsFor(constraint.second);
    let color = 0;
    while (firstColors.has(color) || secondColors.has(color)) {
      color += 1;
    }
    colors[color] ??= [];
    colors[color].push(constraint);
    firstColors.add(color);
    secondColors.add(color);
  }

  const grouped = colors.flat();
  const vertexPairs = new Uint32Array(grouped.length * 2);
  const targetLengthsM = new Float32Array(grouped.length);
  const groupedSeamIds = new Uint32Array(grouped.length);
  const sourcePairIndices = new Uint32Array(grouped.length);
  const activationOrder = new Uint32Array(grouped.length);
  const groupedOffsetsByActivationRank = new Uint32Array(grouped.length);

  grouped.forEach((constraint, groupedOffset) => {
    vertexPairs[groupedOffset * 2] = constraint.first;
    vertexPairs[groupedOffset * 2 + 1] = constraint.second;
    groupedSeamIds[groupedOffset] = constraint.seamIdIndex;
    sourcePairIndices[groupedOffset] = constraint.sourcePairIndex;
    groupedOffsetsByActivationRank[constraint.activationRank] = groupedOffset;
  });
  activationOrder.set(groupedOffsetsByActivationRank);

  const colorRanges = new Uint32Array(colors.length * 2);
  let offset = 0;
  colors.forEach((constraints, color) => {
    colorRanges[color * 2] = offset;
    colorRanges[color * 2 + 1] = constraints.length;
    offset += constraints.length;
  });

  return {
    ok: true,
    diagnostics: [],
    constraints: {
      constraintCount: grouped.length,
      colorCount: colors.length,
      seamIds,
      vertexPairs,
      targetLengthsM,
      seamIdIndices: groupedSeamIds,
      sourcePairIndices,
      colorRanges,
      activationOrder,
    },
  };
}
