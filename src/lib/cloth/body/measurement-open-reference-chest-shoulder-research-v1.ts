import {
  CANONICAL_MEASUREMENT_PLAUSIBILITY_MM,
  type CanonicalBodyMeasurementsMm,
} from './measurement-adapter';
import type {
  UniformChestShoulderResearchKeyV1,
  UniformChestShoulderResearchModeV1,
  UniformChestShoulderResearchSparseFieldV1,
} from './makehuman-uniform-chest-shoulder-modes-research-v1';
import {
  evaluateMeasurementOpenReferenceDisplayQualityV1,
  type MeasurementOpenReferenceDisplayQualityGateResultV1,
} from './measurement-open-reference-display-quality-gate-v1';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';
import { meshPlaneSectionLoopTapePerimeterMV1 } from './mesh-plane-section-tape-girth-v1';

export const MEASUREMENT_OPEN_REFERENCE_CHEST_SHOULDER_RESEARCH_V1 =
  'measurement-open-reference-chest-shoulder-research/v1' as const;

export interface ChestShoulderResearchModeResultV1 {
  readonly measurementKey: UniformChestShoulderResearchKeyV1;
  readonly direction: 'decrease' | 'increase' | 'none';
  readonly coefficient: number;
  readonly cap: number;
  readonly targetMm: number;
  readonly baselineMm: number;
  readonly achievedMm: number;
  readonly residualMm: number;
  readonly maximumOtherProxyEffectMm: number;
}

export interface ChestShoulderResearchResultV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_CHEST_SHOULDER_RESEARCH_V1;
  readonly role: 'CC0_OPEN_REFERENCE_RESEARCH_ONLY';
  readonly positionsM: Float32Array;
  readonly representedMeasurements: readonly UniformChestShoulderResearchKeyV1[];
  /** Bounded endpoint responses that are visible but are not exact measurement representations. */
  readonly limitedMeasurements: readonly UniformChestShoulderResearchKeyV1[];
  readonly modeResults: readonly ChestShoulderResearchModeResultV1[];
  readonly diagnostics: readonly string[];
  readonly qualityGate: MeasurementOpenReferenceDisplayQualityGateResultV1;
  readonly claims: {
    readonly geometricProxyOnly: true;
    readonly coupledSolveRequired: true;
    readonly canonicalMeasurementSemanticMatchClaimed: false;
    readonly anatomicalTapePathEquivalent: false;
    readonly measurementProtocolEquivalent: false;
    readonly productionRuntimeEligible: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
    readonly selfIntersection: 'research-test-required';
  };
}

const KEYS = Object.freeze([
  'chestCircumferenceMm',
  'shoulderBreadthMm',
] as const satisfies readonly UniformChestShoulderResearchKeyV1[]);
// Shoulder changes the chest section materially, while the admitted chest envelope has negligible
// shoulder-chord effect. Solving the dominant cross-talk source first avoids a false early
// unreachable classification and the repeated passes then close both targets.
const SOLVE_KEYS = Object.freeze([
  'shoulderBreadthMm',
  'chestCircumferenceMm',
] as const satisfies readonly UniformChestShoulderResearchKeyV1[]);
const CLAIMS = Object.freeze({
  geometricProxyOnly: true as const,
  coupledSolveRequired: true as const,
  canonicalMeasurementSemanticMatchClaimed: false as const,
  anatomicalTapePathEquivalent: false as const,
  measurementProtocolEquivalent: false as const,
  productionRuntimeEligible: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
  selfIntersection: 'research-test-required' as const,
});

interface CoefficientState {
  readonly direction: 'decrease' | 'increase' | 'none';
  readonly coefficient: number;
}

interface CoefficientSolveResult {
  readonly state: CoefficientState;
  /**
   * The requested tape value lies beyond the finite CC0 direction asset. The endpoint remains a
   * useful bounded visual response, but it must not be reported as an exact represented measure.
   */
  readonly limited: boolean;
}

function addScaledField(
  source: Float32Array,
  field: UniformChestShoulderResearchSparseFieldV1,
  coefficient: number,
): Float32Array {
  const result = source.slice();
  field.vertexIndices.forEach((vertex, index) => {
    const positionOffset = vertex * 3;
    const deltaOffset = index * 3;
    result[positionOffset] += field.deltasM[deltaOffset] * coefficient;
    result[positionOffset + 1] += field.deltasM[deltaOffset + 1] * coefficient;
    result[positionOffset + 2] += field.deltasM[deltaOffset + 2] * coefficient;
  });
  return result;
}

function modeByKey(
  modes: readonly UniformChestShoulderResearchModeV1[],
  key: UniformChestShoulderResearchKeyV1,
): UniformChestShoulderResearchModeV1 {
  const matches = modes.filter((mode) => mode.measurementKey === key);
  if (matches.length !== 1) throw new Error(`Expected one ${key} research mode.`);
  return matches[0];
}

export function measureChestShoulderResearchProxyMmV1(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly mode: UniformChestShoulderResearchModeV1;
}): number {
  if (options.mode.measurementKey === 'shoulderBreadthMm') {
    if (!options.mode.shoulderVertices) throw new Error('Shoulder vertices are missing.');
    const negative = options.mode.shoulderVertices.negative * 3;
    const positive = options.mode.shoulderVertices.positive * 3;
    return (
      Math.hypot(
        options.positionsM[positive] - options.positionsM[negative],
        options.positionsM[positive + 1] - options.positionsM[negative + 1],
        options.positionsM[positive + 2] - options.positionsM[negative + 2],
      ) * 1000
    );
  }
  if (!options.mode.chestStationOriginM) throw new Error('Chest station is missing.');
  const section = measureMeshPlaneSectionPerimetersV1({
    positionsM: options.positionsM,
    triangleIndices: options.triangleIndices,
    planeOriginM: options.mode.chestStationOriginM,
    planeNormal: [0, 1, 0],
    selection: { kind: 'nearest-seed', seedM: options.mode.chestStationOriginM },
    policy: { weldToleranceM: 0.00002 },
  });
  if (!section.ok || !section.selectedLoop) {
    throw new Error(section.ok ? 'Chest loop selection failed.' : section.errors.join('; '));
  }
  // Typed chest is a tape girth: the hull of the section, not the raw loop.
  return meshPlaneSectionLoopTapePerimeterMV1(section.selectedLoop) * 1000;
}

function applyStates(options: {
  readonly source: Float32Array;
  readonly modes: readonly UniformChestShoulderResearchModeV1[];
  readonly states: Readonly<Record<UniformChestShoulderResearchKeyV1, CoefficientState>>;
  readonly omit?: UniformChestShoulderResearchKeyV1;
}): Float32Array {
  let positions: Float32Array = options.source.slice();
  for (const key of KEYS) {
    if (key === options.omit) continue;
    const state = options.states[key];
    if (state.direction === 'none' || state.coefficient === 0) continue;
    const mode = modeByKey(options.modes, key);
    positions = addScaledField(positions, mode[state.direction], state.coefficient);
  }
  return positions;
}

function solveCoefficient(options: {
  readonly key: UniformChestShoulderResearchKeyV1;
  readonly targetMm: number;
  readonly source: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly modes: readonly UniformChestShoulderResearchModeV1[];
  readonly states: Readonly<Record<UniformChestShoulderResearchKeyV1, CoefficientState>>;
}): CoefficientSolveResult | null {
  const [minimumMm, maximumMm] = CANONICAL_MEASUREMENT_PLAUSIBILITY_MM[options.key];
  if (options.targetMm < minimumMm || options.targetMm > maximumMm) return null;
  const mode = modeByKey(options.modes, options.key);
  const withoutOwn = applyStates({
    source: options.source,
    modes: options.modes,
    states: options.states,
    omit: options.key,
  });
  const baselineMm = measureChestShoulderResearchProxyMmV1({
    positionsM: withoutOwn,
    triangleIndices: options.triangleIndices,
    mode,
  });
  if (Math.abs(baselineMm - options.targetMm) <= 0.1) {
    return Object.freeze({
      state: Object.freeze({ direction: 'none' as const, coefficient: 0 }),
      limited: false,
    });
  }
  const direction = options.targetMm < baselineMm ? 'decrease' : 'increase';
  const cap = mode.coefficientCaps[direction];
  const samples = [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
    const positionsM = addScaledField(withoutOwn, mode[direction], cap * fraction);
    return measureChestShoulderResearchProxyMmV1({
      positionsM,
      triangleIndices: options.triangleIndices,
      mode,
    });
  });
  const sign = direction === 'increase' ? 1 : -1;
  if (samples.slice(1).some((value, index) => (value - samples[index]) * sign < 0.01)) {
    return null;
  }
  const endpointMm = samples.at(-1)!;
  if (
    (direction === 'increase' && options.targetMm > endpointMm) ||
    (direction === 'decrease' && options.targetMm < endpointMm)
  ) {
    return Object.freeze({
      state: Object.freeze({ direction, coefficient: cap }),
      limited: true,
    });
  }
  let lower = 0;
  let upper = cap;
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const coefficient = (lower + upper) / 2;
    const measuredMm = measureChestShoulderResearchProxyMmV1({
      positionsM: addScaledField(withoutOwn, mode[direction], coefficient),
      triangleIndices: options.triangleIndices,
      mode,
    });
    if (direction === 'increase') {
      if (measuredMm < options.targetMm) lower = coefficient;
      else upper = coefficient;
    } else if (measuredMm > options.targetMm) lower = coefficient;
    else upper = coefficient;
  }
  return Object.freeze({
    state: Object.freeze({ direction, coefficient: (lower + upper) / 2 }),
    limited: false,
  });
}

/**
 * Coupled research-only coordinate solve. High shoulder-to-chest cross-talk is compensated only by
 * re-solving both proxies and then remeasuring final closure. Any closure or quality failure rolls
 * back the complete pair.
 */
export function solveOpenReferenceChestShoulderResearchV1(options: {
  readonly sourcePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly measurements: Pick<
    CanonicalBodyMeasurementsMm,
    'chestCircumferenceMm' | 'shoulderBreadthMm'
  >;
  readonly modes: readonly UniformChestShoulderResearchModeV1[];
}): ChestShoulderResearchResultV1 {
  const source = options.sourcePositionsM.slice();
  const baselineByKey = Object.fromEntries(
    KEYS.map((key) => [
      key,
      measureChestShoulderResearchProxyMmV1({
        positionsM: source,
        triangleIndices: options.triangleIndices,
        mode: modeByKey(options.modes, key),
      }),
    ]),
  ) as Record<UniformChestShoulderResearchKeyV1, number>;
  const states: Record<UniformChestShoulderResearchKeyV1, CoefficientState> = {
    chestCircumferenceMm: Object.freeze({ direction: 'none', coefficient: 0 }),
    shoulderBreadthMm: Object.freeze({ direction: 'none', coefficient: 0 }),
  };
  const diagnostics: string[] = [];
  const reachable = new Set<UniformChestShoulderResearchKeyV1>(KEYS);
  const limited = new Set<UniformChestShoulderResearchKeyV1>();

  for (let iteration = 0; iteration < 3; iteration += 1) {
    for (const key of SOLVE_KEYS) {
      if (!reachable.has(key)) continue;
      const solved = solveCoefficient({
        key,
        targetMm: options.measurements[key],
        source,
        triangleIndices: options.triangleIndices,
        modes: options.modes,
        states,
      });
      if (!solved) {
        reachable.delete(key);
        states[key] = Object.freeze({ direction: 'none', coefficient: 0 });
        diagnostics.push(`${key}:target-unreachable-or-direction-nonmonotonic`);
      } else {
        states[key] = solved.state;
        if (solved.limited) {
          reachable.delete(key);
          limited.add(key);
          diagnostics.push(`${key}:target-limited-to-bounded-endpoint`);
        }
      }
    }
  }

  let positionsM = applyStates({ source, modes: options.modes, states });
  const closesAtTarget = (key: UniformChestShoulderResearchKeyV1): boolean => {
    const achievedMm = measureChestShoulderResearchProxyMmV1({
      positionsM,
      triangleIndices: options.triangleIndices,
      mode: modeByKey(options.modes, key),
    });
    return Math.abs(achievedMm - options.measurements[key]) <= 0.1;
  };
  let represented = [...reachable].filter(closesAtTarget);
  let closureRollbackRequired = false;
  if (represented.length !== reachable.size) {
    diagnostics.push('coupled-final-residual-exceeded');
    if (limited.size === 0) {
      closureRollbackRequired = true;
    } else {
      // An exact sibling must never erase an already-safe bounded endpoint. Drop only exact states
      // that no longer close around that endpoint, then remeasure the remaining exact state(s).
      for (const key of reachable) {
        if (!represented.includes(key)) {
          states[key] = Object.freeze({ direction: 'none', coefficient: 0 });
        }
      }
      for (let pass = 0; pass < KEYS.length; pass += 1) {
        positionsM = applyStates({ source, modes: options.modes, states });
        const stillRepresented = represented.filter(closesAtTarget);
        if (stillRepresented.length === represented.length) break;
        for (const key of represented) {
          if (!stillRepresented.includes(key)) {
            states[key] = Object.freeze({ direction: 'none', coefficient: 0 });
          }
        }
        represented = stillRepresented;
      }
      positionsM = applyStates({ source, modes: options.modes, states });
      diagnostics.push('coupled-exact-channel-rollback-bounded-endpoint-retained');
    }
  }

  const evaluateQuality = (candidate: Float32Array) =>
    evaluateMeasurementOpenReferenceDisplayQualityV1({
      uniformPositionsM: source,
      personalizedPositionsM: candidate,
      triangleIndices: options.triangleIndices,
    });
  let qualityGate = evaluateQuality(positionsM);
  if (!qualityGate.safe && limited.size === 0 && represented.length > 0) {
    let isolatedQualityCulprit: UniformChestShoulderResearchKeyV1 | null = null;
    for (const key of represented) {
      const fullState = states[key];
      states[key] = Object.freeze({ direction: fullState.direction, coefficient: 0 });
      const withoutKey = applyStates({ source, modes: options.modes, states });
      states[key] = fullState;
      if (evaluateQuality(withoutKey).safe) {
        isolatedQualityCulprit = key;
        break;
      }
    }
    const qualityLimitedKeys = isolatedQualityCulprit
      ? [isolatedQualityCulprit]
      : represented.filter((key) => states[key].coefficient > 0);
    if (qualityLimitedKeys.length > 0) {
      for (const key of qualityLimitedKeys) {
        limited.add(key);
        diagnostics.push(`${key}:target-limited-to-quality-safe-endpoint`);
      }
      represented = represented.filter((key) => !limited.has(key));
    }
  }
  if (!qualityGate.safe && limited.size > 0) {
    const fullLimitedStates = new Map([...limited].map((key) => [key, states[key]] as const));
    const setLimitedFraction = (fraction: number): void => {
      for (const [key, state] of fullLimitedStates) {
        states[key] = Object.freeze({
          direction: state.direction,
          coefficient: state.coefficient * fraction,
        });
      }
    };
    const findMaximumSafeFraction = () => {
      setLimitedFraction(0);
      let bestPositions = applyStates({ source, modes: options.modes, states });
      let bestQuality = evaluateQuality(bestPositions);
      if (!bestQuality.safe) return null;
      let lower = 0;
      let upper = 1;
      for (let iteration = 0; iteration < 16; iteration += 1) {
        const fraction = (lower + upper) / 2;
        setLimitedFraction(fraction);
        const candidate = applyStates({ source, modes: options.modes, states });
        const candidateQuality = evaluateQuality(candidate);
        if (candidateQuality.safe) {
          lower = fraction;
          bestPositions = candidate;
          bestQuality = candidateQuality;
        } else {
          upper = fraction;
        }
      }
      setLimitedFraction(lower);
      return Object.freeze({
        fraction: lower,
        positionsM: bestPositions,
        qualityGate: bestQuality,
      });
    };

    let bounded = findMaximumSafeFraction();
    if (!bounded && represented.length > 0) {
      for (const key of represented) {
        states[key] = Object.freeze({ direction: 'none', coefficient: 0 });
      }
      represented = [];
      diagnostics.push('coupled-exact-channel-rollback-bounded-endpoint-retained');
      bounded = findMaximumSafeFraction();
    }
    if (bounded && bounded.fraction > 0) {
      positionsM = bounded.positionsM;
      qualityGate = bounded.qualityGate;
      const stillRepresented = represented.filter(closesAtTarget);
      if (stillRepresented.length !== represented.length) {
        for (const key of represented) {
          if (!stillRepresented.includes(key)) {
            states[key] = Object.freeze({ direction: 'none', coefficient: 0 });
          }
        }
        represented = stillRepresented;
        diagnostics.push('coupled-exact-channel-rollback-bounded-endpoint-retained');
        const refined = findMaximumSafeFraction();
        if (refined) {
          bounded = refined;
          positionsM = refined.positionsM;
          qualityGate = refined.qualityGate;
        }
      }
      for (const key of limited) {
        diagnostics.push(`${key}:bounded-endpoint-quality-limited:${bounded.fraction.toFixed(5)}`);
      }
    }
  }
  if (!qualityGate.safe || closureRollbackRequired) {
    positionsM = source.slice();
    represented.length = 0;
    if (!qualityGate.safe && limited.size > 0) {
      diagnostics.push('bounded-endpoint-quality-rollback');
    }
    limited.clear();
    diagnostics.push(qualityGate.safe ? 'coupled-closure-rollback' : 'combined-quality-rollback');
  }

  const modeResults = represented.map((key) => {
    const mode = modeByKey(options.modes, key);
    const state = states[key];
    const achievedMm = measureChestShoulderResearchProxyMmV1({
      positionsM,
      triangleIndices: options.triangleIndices,
      mode,
    });
    const withoutOwn = applyStates({ source, modes: options.modes, states, omit: key });
    const otherKey = key === 'chestCircumferenceMm' ? 'shoulderBreadthMm' : 'chestCircumferenceMm';
    const otherMode = modeByKey(options.modes, otherKey);
    const otherBaselineMm = measureChestShoulderResearchProxyMmV1({
      positionsM: withoutOwn,
      triangleIndices: options.triangleIndices,
      mode: otherMode,
    });
    const otherFinalMm = measureChestShoulderResearchProxyMmV1({
      positionsM,
      triangleIndices: options.triangleIndices,
      mode: otherMode,
    });
    return Object.freeze({
      measurementKey: key,
      direction: state.direction,
      coefficient: state.coefficient,
      cap: state.direction === 'none' ? 0 : mode.coefficientCaps[state.direction],
      targetMm: options.measurements[key],
      baselineMm: baselineByKey[key],
      achievedMm,
      residualMm: Math.abs(achievedMm - options.measurements[key]),
      maximumOtherProxyEffectMm: Math.abs(otherFinalMm - otherBaselineMm),
    });
  });

  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_CHEST_SHOULDER_RESEARCH_V1,
    role: 'CC0_OPEN_REFERENCE_RESEARCH_ONLY' as const,
    positionsM,
    representedMeasurements: Object.freeze(represented),
    limitedMeasurements: Object.freeze([...limited]),
    modeResults: Object.freeze(modeResults),
    diagnostics: Object.freeze(diagnostics),
    qualityGate,
    claims: CLAIMS,
  });
}
