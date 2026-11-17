import type { MakeHumanFemaleBustDeltaBundleV1 } from './makehuman-female-bust-delta-bundle-v1';
import type { UniformChestShoulderResearchModeV1 } from './makehuman-uniform-chest-shoulder-modes-research-v1';
import {
  CANONICAL_MEASUREMENT_PLAUSIBILITY_MM,
  type CanonicalBodyMeasurementsMm,
} from './measurement-adapter';
import { measureChestShoulderResearchProxyMmV1 } from './measurement-open-reference-chest-shoulder-research-v1';
import { evaluateMeasurementOpenReferenceDisplayQualityV1 } from './measurement-open-reference-display-quality-gate-v1';
import type { MakeHumanOpenReferenceBasisV1 } from './measurement-open-reference-display-v1';
import {
  findMeasurementOpenReferenceFemaleBustApexPlaneV1,
  solveMeasurementOpenReferenceFemaleBustProxyV1,
  type MeasurementOpenReferenceFemaleBustModeResultV1,
  type MeasurementOpenReferenceFemaleBustProxyStatusV1,
} from './measurement-open-reference-female-bust-proxy-v1';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';

type Vec3 = readonly [number, number, number];

/** Diagnostic summary of the female bust stage; numbers are geometric proxies, never claims. */
export interface MeasurementOpenReferenceFemaleTorsoBustSummaryV1 {
  readonly chestStatus: MeasurementOpenReferenceFemaleBustProxyStatusV1;
  readonly underBustStatus: MeasurementOpenReferenceFemaleBustProxyStatusV1;
  readonly apexStationOriginM: Vec3;
  readonly armpitLineOriginM: Vec3;
  readonly bandCoefficient: number;
  readonly modeResult?: MeasurementOpenReferenceFemaleBustModeResultV1;
  readonly underBustAchievedMm: number | null;
  readonly solveMs: number;
}

export interface MeasurementOpenReferenceFemaleTorsoStageResultV1 {
  readonly positionsM: Float32Array;
  readonly chestStationOriginM: Vec3;
  readonly underBustStationOriginM: Vec3;
  readonly ribcageRepresentedMeasurements: readonly 'underBustCircumferenceMm'[];
  readonly ribcageLimitedMeasurements: readonly 'underBustCircumferenceMm'[];
  readonly ribcageDiagnostics: readonly string[];
  readonly chestShoulderRepresentedMeasurements: readonly (
    | 'chestCircumferenceMm'
    | 'shoulderBreadthMm'
  )[];
  readonly chestShoulderLimitedMeasurements: readonly (
    | 'chestCircumferenceMm'
    | 'shoulderBreadthMm'
  )[];
  readonly chestShoulderDiagnostics: readonly string[];
  readonly femaleBust: MeasurementOpenReferenceFemaleTorsoBustSummaryV1;
}

/** Shoulder tolerance the coupled solver also uses; numerical, not a body claim. */
const SHOULDER_RESIDUAL_MM = 0.1;
/** Shoulder drift after the bust stage that is still reported as typed; numerical, not a claim. */
const SHOULDER_DRIFT_TOLERANCE_MM = 1;

function addScaledField(
  source: Float32Array,
  mode: UniformChestShoulderResearchModeV1,
  direction: 'decrease' | 'increase',
  coefficient: number,
): Float32Array {
  const result = source.slice();
  const field = mode[direction];
  field.vertexIndices.forEach((vertex, index) => {
    const positionOffset = vertex * 3;
    const deltaOffset = index * 3;
    result[positionOffset] += field.deltasM[deltaOffset] * coefficient;
    result[positionOffset + 1] += field.deltasM[deltaOffset + 1] * coefficient;
    result[positionOffset + 2] += field.deltasM[deltaOffset + 2] * coefficient;
  });
  return result;
}

/**
 * Shoulder breadth alone, with the same bounded field, endpoint and quality-fraction rules as the
 * coupled chest/shoulder research solve. On the female basis the anterior chest field is replaced
 * by the bust proxy, so only the shoulder channel of that solve runs here.
 */
function solveShoulderOnly(options: {
  readonly sourcePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly mode: UniformChestShoulderResearchModeV1;
  readonly targetMm: number;
}): {
  readonly positionsM: Float32Array;
  readonly status: 'represented' | 'limited' | 'notApplied';
  readonly diagnostics: readonly string[];
} {
  const source = options.sourcePositionsM;
  const measure = (positionsM: Float32Array) =>
    measureChestShoulderResearchProxyMmV1({
      positionsM,
      triangleIndices: options.triangleIndices,
      mode: options.mode,
    });
  const [minimumMm, maximumMm] = CANONICAL_MEASUREMENT_PLAUSIBILITY_MM.shoulderBreadthMm;
  if (
    !Number.isFinite(options.targetMm) ||
    options.targetMm < minimumMm ||
    options.targetMm > maximumMm
  ) {
    return {
      positionsM: source,
      status: 'notApplied',
      diagnostics: ['shoulderBreadthMm:target-unreachable-or-direction-nonmonotonic'],
    };
  }
  const baselineMm = measure(source);
  if (Math.abs(baselineMm - options.targetMm) <= SHOULDER_RESIDUAL_MM) {
    return { positionsM: source, status: 'represented', diagnostics: [] };
  }
  const direction = options.targetMm < baselineMm ? 'decrease' : 'increase';
  const sign = direction === 'increase' ? 1 : -1;
  const cap = options.mode.coefficientCaps[direction];
  const samples = [0, 0.25, 0.5, 0.75, 1].map((fraction) =>
    measure(addScaledField(source, options.mode, direction, cap * fraction)),
  );
  if (samples.slice(1).some((value, index) => (value - samples[index]) * sign < 0.01)) {
    return {
      positionsM: source,
      status: 'notApplied',
      diagnostics: ['shoulderBreadthMm:target-unreachable-or-direction-nonmonotonic'],
    };
  }
  const diagnostics: string[] = [];
  let coefficient: number;
  let limited = false;
  if ((options.targetMm - samples.at(-1)!) * sign > 0) {
    coefficient = cap;
    limited = true;
    diagnostics.push('shoulderBreadthMm:target-limited-to-bounded-endpoint');
  } else {
    let lower = 0;
    let upper = cap;
    for (let iteration = 0; iteration < 16; iteration += 1) {
      const middle = (lower + upper) / 2;
      const measuredMm = measure(addScaledField(source, options.mode, direction, middle));
      if ((measuredMm - options.targetMm) * sign < 0) lower = middle;
      else upper = middle;
    }
    coefficient = (lower + upper) / 2;
  }
  let positionsM = addScaledField(source, options.mode, direction, coefficient);
  const qualityOf = (candidate: Float32Array) =>
    evaluateMeasurementOpenReferenceDisplayQualityV1({
      uniformPositionsM: source,
      personalizedPositionsM: candidate,
      triangleIndices: options.triangleIndices,
    });
  if (!qualityOf(positionsM).safe) {
    let lower = 0;
    let upper = 1;
    let best: Float32Array | undefined;
    for (let iteration = 0; iteration < 16; iteration += 1) {
      const fraction = (lower + upper) / 2;
      const candidate = addScaledField(source, options.mode, direction, coefficient * fraction);
      if (qualityOf(candidate).safe) {
        lower = fraction;
        best = candidate;
      } else {
        upper = fraction;
      }
    }
    if (!best || lower <= 0) {
      return {
        positionsM: source,
        status: 'notApplied',
        diagnostics: ['shoulderBreadthMm:combined-quality-rollback'],
      };
    }
    positionsM = best;
    limited = true;
    diagnostics.push(
      'shoulderBreadthMm:target-limited-to-quality-safe-endpoint',
      `shoulderBreadthMm:bounded-endpoint-quality-limited:${lower.toFixed(5)}`,
    );
  }
  return { positionsM, status: limited ? 'limited' : 'represented', diagnostics };
}

export function measureFemaleTorsoSectionGirthMmV1(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly originM: Vec3;
}): number {
  const measured = measureMeshPlaneSectionPerimetersV1({
    positionsM: options.positionsM,
    triangleIndices: options.triangleIndices,
    planeOriginM: options.originM,
    planeNormal: [0, 1, 0],
    selection: { kind: 'nearest-seed', seedM: options.originM },
    policy: { weldToleranceM: 0.00002 },
  });
  if (!measured.ok || !measured.selectedLoop) {
    throw new Error(
      measured.ok ? 'Female torso section selection failed.' : measured.errors.join('; '),
    );
  }
  return measured.selectedLoop.perimeterM * 1000;
}

/**
 * Female torso stage (lane-female-bust-rev2 §5, steps 2–3). The bust proxy replaces both the
 * independent under-bust ribcage band and the anterior chest field and solves under bust and chest
 * jointly at the fixed apex plane; the old band never runs before it, so two bands never stack.
 * Shoulder breadth keeps its own bounded field. Every number stays a visual proxy.
 */
export function solveMeasurementOpenReferenceFemaleTorsoStageV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly sourcePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly modes: readonly UniformChestShoulderResearchModeV1[];
  readonly underBustStationOriginM: Vec3;
  readonly armpitLineOriginM: Vec3;
  readonly bustBundle: MakeHumanFemaleBustDeltaBundleV1;
}): MeasurementOpenReferenceFemaleTorsoStageResultV1 {
  const shoulderMode = options.modes.find(
    ({ measurementKey }) => measurementKey === 'shoulderBreadthMm',
  );
  if (!shoulderMode?.shoulderVertices) throw new Error('Shoulder research mode is missing.');
  // The apex plane is a fixed geometric station of the incoming display, found before any torso
  // stage moves the mesh, so the guide ring and the solver share it.
  const apexStation = findMeasurementOpenReferenceFemaleBustApexPlaneV1({
    positionsM: options.sourcePositionsM,
    triangleIndices: options.triangleIndices,
    underBustStationOriginM: options.underBustStationOriginM,
    armpitMergeStationOriginM: options.armpitLineOriginM,
  });
  const apexStationOriginM = Object.freeze([...apexStation.originM]) as unknown as Vec3;

  const shoulder = solveShoulderOnly({
    sourcePositionsM: options.sourcePositionsM,
    triangleIndices: options.triangleIndices,
    mode: shoulderMode,
    targetMm: options.measurements.shoulderBreadthMm,
  });

  const startedAt = globalThis.performance?.now() ?? Date.now();
  const bust = solveMeasurementOpenReferenceFemaleBustProxyV1({
    basis: options.basis,
    sourcePositionsM: shoulder.positionsM,
    triangleIndices: options.triangleIndices,
    deltaBundle: options.bustBundle,
    heightMm: options.measurements.heightMm,
    targetCircumferenceMm: options.measurements.chestCircumferenceMm,
    ...(options.measurements.underBustCircumferenceMm == null
      ? {}
      : { targetUnderBustCircumferenceMm: options.measurements.underBustCircumferenceMm }),
    underBustStationOriginM: options.underBustStationOriginM,
    armpitMergeStationOriginM: options.armpitLineOriginM,
    apexStation,
  });
  const solveMs = (globalThis.performance?.now() ?? Date.now()) - startedAt;

  const bustApplied = bust.status === 'represented' || bust.status === 'limited';
  const positionsM = bustApplied ? bust.positionsM : shoulder.positionsM;
  const chestShoulderRepresented: ('chestCircumferenceMm' | 'shoulderBreadthMm')[] = [];
  const chestShoulderLimited: ('chestCircumferenceMm' | 'shoulderBreadthMm')[] = [];
  const chestShoulderDiagnostics: string[] = [...shoulder.diagnostics];
  const ribcageRepresented: 'underBustCircumferenceMm'[] = [];
  const ribcageLimited: 'underBustCircumferenceMm'[] = [];
  const ribcageDiagnostics: string[] = [];

  for (const { code, measurementKey } of bust.diagnostics) {
    (measurementKey === 'underBustCircumferenceMm'
      ? ribcageDiagnostics
      : chestShoulderDiagnostics
    ).push(`${measurementKey}:female-bust-${code}`);
  }
  if (bust.status === 'represented') chestShoulderRepresented.push('chestCircumferenceMm');
  if (bust.status === 'limited') {
    chestShoulderLimited.push('chestCircumferenceMm');
    // The application status names limits by these two codes; the bust keeps its own codes too.
    chestShoulderDiagnostics.push(
      bust.modeResult && bust.modeResult.safeFraction < 1 - 1e-6
        ? 'chestCircumferenceMm:target-limited-to-quality-safe-endpoint'
        : 'chestCircumferenceMm:target-limited-to-bounded-endpoint',
    );
  }
  if (bustApplied) {
    if (bust.underBust.status === 'represented')
      ribcageRepresented.push('underBustCircumferenceMm');
    else if (bust.underBust.status === 'limited') ribcageLimited.push('underBustCircumferenceMm');
    else if (bust.underBust.status === 'unrequested') {
      ribcageDiagnostics.push('underbust-missing:proportional-ribcage');
    }
  }

  // The ribcage band fades out 80 mm above the armpit line; shoulder breadth is re-measured so a
  // drift there is never reported as the typed value.
  if (shoulder.status !== 'notApplied') {
    const shoulderAfterMm = measureChestShoulderResearchProxyMmV1({
      positionsM,
      triangleIndices: options.triangleIndices,
      mode: shoulderMode,
    });
    const drifted =
      Math.abs(shoulderAfterMm - options.measurements.shoulderBreadthMm) >
      SHOULDER_DRIFT_TOLERANCE_MM;
    if (shoulder.status === 'represented' && !drifted) {
      chestShoulderRepresented.push('shoulderBreadthMm');
    } else {
      chestShoulderLimited.push('shoulderBreadthMm');
      if (drifted && shoulder.status === 'represented') {
        chestShoulderDiagnostics.push('shoulderBreadthMm:female-bust-crosstalk-limited');
      }
    }
  }

  return Object.freeze({
    positionsM,
    chestStationOriginM: apexStationOriginM,
    underBustStationOriginM: options.underBustStationOriginM,
    ribcageRepresentedMeasurements: Object.freeze(ribcageRepresented),
    ribcageLimitedMeasurements: Object.freeze(ribcageLimited),
    ribcageDiagnostics: Object.freeze(ribcageDiagnostics),
    chestShoulderRepresentedMeasurements: Object.freeze(chestShoulderRepresented),
    chestShoulderLimitedMeasurements: Object.freeze(chestShoulderLimited),
    chestShoulderDiagnostics: Object.freeze(chestShoulderDiagnostics),
    femaleBust: Object.freeze({
      chestStatus: bust.status,
      underBustStatus: bust.underBust.status,
      apexStationOriginM,
      armpitLineOriginM: options.armpitLineOriginM,
      bandCoefficient: bust.underBust.coefficient,
      ...(bust.modeResult ? { modeResult: bust.modeResult } : {}),
      underBustAchievedMm: bust.underBust.achievedMm,
      solveMs,
    }),
  });
}
