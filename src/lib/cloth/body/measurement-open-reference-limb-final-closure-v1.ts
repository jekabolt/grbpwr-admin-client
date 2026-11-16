import {
  CANONICAL_MEASUREMENT_PLAUSIBILITY_MM,
  type CanonicalBodyMeasurementsMm,
} from './measurement-adapter';
import type { UniformWaistHipModeV1 } from './makehuman-uniform-waist-hip-modes-v1';
import {
  evaluateMeasurementOpenReferenceDisplayQualityV1,
  type MeasurementOpenReferenceDisplayQualityGateResultV1,
} from './measurement-open-reference-display-quality-gate-v1';
import {
  solveOpenReferenceLimbMeshCircumferencesV1,
  type OpenReferenceLimbMeshCircumferenceModeResultV1,
} from './measurement-open-reference-limb-mesh-circumference-solver-v1';
import { deriveOpenReferenceLimbSectionStationsV1 } from './measurement-open-reference-limb-section-station-v1';
import {
  OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1,
  type OpenReferenceLimbCircumferenceKeyV1,
  type OpenReferenceLimbCircumferenceModeV1,
  type OpenReferenceSparseDeltaFieldV1,
} from './measurement-open-reference-limb-circumference-solver-v1';
import {
  measureMeshPlaneSectionPerimetersV1,
  type MeshPlaneSectionVec3V1,
} from './mesh-plane-section-perimeter-v1';

export const MEASUREMENT_OPEN_REFERENCE_LIMB_FINAL_CLOSURE_V1 =
  'measurement-open-reference-limb-final-closure/v1' as const;
export const MEASUREMENT_OPEN_REFERENCE_LIMB_FINAL_CLOSURE_CONTEXT_V1 =
  'measurement-open-reference-limb-final-closure-context/v1' as const;

export interface OpenReferenceLimbCoefficientEnvelopeV1 {
  readonly decrease: number;
  readonly increase: number;
}

export const MAXIMUM_OPEN_REFERENCE_LIMB_COEFFICIENT_ENVELOPE_V1 = Object.freeze({
  bicepCircumferenceMm: Object.freeze({ decrease: 0.75, increase: 1 }),
  wristCircumferenceMm: Object.freeze({ decrease: 1, increase: 1 }),
  thighCircumferenceMm: Object.freeze({ decrease: 1, increase: 1 }),
  calfCircumferenceMm: Object.freeze({ decrease: 1, increase: 1 }),
  ankleCircumferenceMm: Object.freeze({ decrease: 0.9, increase: 1 }),
} as const satisfies Readonly<
  Record<OpenReferenceLimbCircumferenceKeyV1, OpenReferenceLimbCoefficientEnvelopeV1>
>);

export interface OpenReferenceLimbFinalClosureContextV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_LIMB_FINAL_CLOSURE_CONTEXT_V1;
  readonly sectionPlanStrategy: 'bounded-candidate' | 'full-mesh';
  readonly measurementKeys: readonly OpenReferenceLimbCircumferenceKeyV1[];
  readonly coefficientEnvelope: Readonly<
    Record<OpenReferenceLimbCircumferenceKeyV1, OpenReferenceLimbCoefficientEnvelopeV1 | null>
  >;
  readonly contentRevision: string;
  readonly claims: {
    readonly conservativeAllDirectionCoefficientEnvelope: true;
    readonly callerGeometryIdentityBound: false;
    readonly callerGeometryContentBound: true;
    readonly privateTypedArraySnapshots: true;
  };
}

export type OpenReferenceLimbFinalClosureDropReasonV1 =
  | 'closure-measurement-failed'
  | 'coefficient-envelope-exceeded'
  | 'combined-quality-unsafe'
  | 'final-limb-cross-talk-exceeded'
  | 'final-residual-exceeded'
  | 'final-torso-cross-talk-exceeded'
  | 'target-implausible'
  | 'underlying-solver-rejected';

export interface OpenReferenceLimbFinalClosureDropV1 {
  readonly measurementKey: OpenReferenceLimbCircumferenceKeyV1;
  readonly reasons: readonly OpenReferenceLimbFinalClosureDropReasonV1[];
}

export interface OpenReferenceLimbFinalClosureModeResultV1 {
  readonly measurementKey: OpenReferenceLimbCircumferenceKeyV1;
  readonly direction: OpenReferenceLimbMeshCircumferenceModeResultV1['direction'];
  readonly coefficient: number;
  readonly targetMm: number;
  readonly achievedMm: number;
  readonly residualMm: number;
  readonly maximumLimbCrossTalkMm: number;
  readonly maximumTorsoCrossTalkMm: number;
}

export interface OpenReferenceLimbFinalClosureAttemptV1 {
  readonly activeMeasurements: readonly OpenReferenceLimbCircumferenceKeyV1[];
  readonly representedMeasurements: readonly OpenReferenceLimbCircumferenceKeyV1[];
  readonly droppedMeasurements: readonly OpenReferenceLimbFinalClosureDropV1[];
}

export interface OpenReferenceLimbFinalClosureResultV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_LIMB_FINAL_CLOSURE_V1;
  readonly role: 'CC0_OPEN_REFERENCE_RESEARCH_CANDIDATE';
  readonly positionsM: Float32Array;
  readonly representedMeasurements: readonly OpenReferenceLimbCircumferenceKeyV1[];
  readonly modeResults: readonly OpenReferenceLimbFinalClosureModeResultV1[];
  readonly droppedMeasurements: readonly OpenReferenceLimbFinalClosureDropV1[];
  readonly attempts: readonly OpenReferenceLimbFinalClosureAttemptV1[];
  readonly qualityGate: MeasurementOpenReferenceDisplayQualityGateResultV1;
  readonly claims: {
    readonly visualReferenceOnly: true;
    readonly geometricPlaneLoopOnly: true;
    readonly canonicalMeasurementSemanticMatchClaimed: false;
    readonly anatomicalTapePathEquivalent: false;
    readonly measurementProtocolEquivalent: false;
    readonly populationRepresentativenessClaimed: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
    readonly selfIntersection: 'requires-external-delta-audit';
  };
}

interface FixedStationV1 {
  readonly originM: MeshPlaneSectionVec3V1;
  readonly normal: MeshPlaneSectionVec3V1;
}

interface FixedSectionPlanV1 {
  readonly station: FixedStationV1;
  readonly sourceVertexIndices: Uint32Array | null;
  readonly triangleIndices: Uint16Array | Uint32Array;
}

interface CompiledClosureDataV1 {
  readonly waistHipPositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly limbModes: readonly OpenReferenceLimbCircumferenceModeV1[];
  readonly torsoModes: readonly UniformWaistHipModeV1[];
  readonly measurementKeys: readonly OpenReferenceLimbCircumferenceKeyV1[];
  readonly coefficientEnvelope: ReadonlyMap<
    OpenReferenceLimbCircumferenceKeyV1,
    OpenReferenceLimbCoefficientEnvelopeV1
  >;
  readonly contentRevision: string;
  readonly modeByKey: ReadonlyMap<
    OpenReferenceLimbCircumferenceKeyV1,
    OpenReferenceLimbCircumferenceModeV1
  >;
  readonly planByKey: ReadonlyMap<
    OpenReferenceLimbCircumferenceKeyV1,
    readonly [FixedSectionPlanV1, FixedSectionPlanV1]
  >;
  readonly torsoPlans: readonly FixedSectionPlanV1[];
}

const compiledClosureData = new WeakMap<
  OpenReferenceLimbFinalClosureContextV1,
  CompiledClosureDataV1
>();

const CLAIMS = Object.freeze({
  visualReferenceOnly: true as const,
  geometricPlaneLoopOnly: true as const,
  canonicalMeasurementSemanticMatchClaimed: false as const,
  anatomicalTapePathEquivalent: false as const,
  measurementProtocolEquivalent: false as const,
  populationRepresentativenessClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
  selfIntersection: 'requires-external-delta-audit' as const,
});

function snapshotField(field: OpenReferenceSparseDeltaFieldV1): OpenReferenceSparseDeltaFieldV1 {
  return Object.freeze({
    vertexIndices: field.vertexIndices.slice(),
    deltasM: field.deltasM.slice(),
  });
}

function snapshotLimbModes(
  modes: readonly OpenReferenceLimbCircumferenceModeV1[],
): readonly OpenReferenceLimbCircumferenceModeV1[] {
  return Object.freeze(
    modes.map((mode) =>
      Object.freeze({
        measurementKey: mode.measurementKey,
        decrease: snapshotField(mode.decrease),
        increase: snapshotField(mode.increase),
      }),
    ),
  );
}

function snapshotTorsoModes(
  modes: readonly UniformWaistHipModeV1[],
): readonly UniformWaistHipModeV1[] {
  return Object.freeze(
    modes.map((mode) =>
      Object.freeze({
        measurementKey: mode.measurementKey,
        sourceChannel: mode.sourceChannel,
        stationOriginM: Object.freeze([...mode.stationOriginM]) as readonly [
          number,
          number,
          number,
        ],
        decrease: snapshotField(mode.decrease),
        increase: snapshotField(mode.increase),
      }),
    ),
  );
}

function typedArrayEquals(
  left: Uint16Array | Uint32Array | Float32Array,
  right: Uint16Array | Uint32Array | Float32Array,
): boolean {
  if (left.constructor !== right.constructor || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!Object.is(left[index], right[index])) return false;
  }
  return true;
}

function fieldEquals(
  left: OpenReferenceSparseDeltaFieldV1,
  right: OpenReferenceSparseDeltaFieldV1,
): boolean {
  return (
    typedArrayEquals(left.vertexIndices, right.vertexIndices) &&
    typedArrayEquals(left.deltasM, right.deltasM)
  );
}

function limbModesEqual(
  left: readonly OpenReferenceLimbCircumferenceModeV1[],
  right: readonly OpenReferenceLimbCircumferenceModeV1[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (mode, index) =>
        mode.measurementKey === right[index]?.measurementKey &&
        fieldEquals(mode.decrease, right[index]!.decrease) &&
        fieldEquals(mode.increase, right[index]!.increase),
    )
  );
}

function torsoModesEqual(
  left: readonly UniformWaistHipModeV1[],
  right: readonly UniformWaistHipModeV1[],
): boolean {
  return (
    left.length === right.length &&
    left.every((mode, index) => {
      const other = right[index];
      return (
        mode.measurementKey === other?.measurementKey &&
        mode.sourceChannel === other.sourceChannel &&
        mode.stationOriginM.every((value, axis) => Object.is(value, other.stationOriginM[axis])) &&
        fieldEquals(mode.decrease, other.decrease) &&
        fieldEquals(mode.increase, other.increase)
      );
    })
  );
}

function updateFingerprint(state: readonly [number, number], bytes: Uint8Array): [number, number] {
  let first = state[0];
  let second = state[1];
  for (const value of bytes) {
    first = Math.imul(first ^ value, 0x01000193) >>> 0;
    second = Math.imul(second + value + 0x9e3779b9, 0x85ebca6b) >>> 0;
    second ^= second >>> 13;
  }
  return [first, second];
}

function contentRevisionV1(options: {
  readonly waistHipPositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly limbModes: readonly OpenReferenceLimbCircumferenceModeV1[];
  readonly torsoModes: readonly UniformWaistHipModeV1[];
  readonly coefficientEnvelope: ReadonlyMap<
    OpenReferenceLimbCircumferenceKeyV1,
    OpenReferenceLimbCoefficientEnvelopeV1
  >;
}): string {
  let state: [number, number] = [0x811c9dc5, 0x243f6a88];
  const addTyped = (value: Uint16Array | Uint32Array | Float32Array) => {
    state = updateFingerprint(
      state,
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    );
  };
  const addText = (value: string) => {
    state = updateFingerprint(state, new TextEncoder().encode(value));
  };
  addTyped(options.waistHipPositionsM);
  addTyped(options.triangleIndices);
  for (const mode of options.limbModes) {
    addText(mode.measurementKey);
    addTyped(mode.decrease.vertexIndices);
    addTyped(mode.decrease.deltasM);
    addTyped(mode.increase.vertexIndices);
    addTyped(mode.increase.deltasM);
    const envelope = options.coefficientEnvelope.get(mode.measurementKey)!;
    addTyped(Float32Array.of(envelope.decrease, envelope.increase));
  }
  for (const mode of options.torsoModes) {
    addText(`${mode.measurementKey}:${mode.sourceChannel}`);
    addTyped(Float32Array.from(mode.stationOriginM));
    addTyped(mode.decrease.vertexIndices);
    addTyped(mode.decrease.deltasM);
    addTyped(mode.increase.vertexIndices);
    addTyped(mode.increase.deltasM);
  }
  return `limb-final-closure-snapshot/v1:${state[0].toString(16).padStart(8, '0')}${state[1]
    .toString(16)
    .padStart(8, '0')}`;
}

function addScaledField(
  source: Float32Array,
  field: OpenReferenceSparseDeltaFieldV1,
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

function fieldPlaneDistances(
  field: OpenReferenceSparseDeltaFieldV1,
  vertexCount: number,
  normal: MeshPlaneSectionVec3V1,
  coefficient: number,
): Float64Array {
  const result = new Float64Array(vertexCount);
  field.vertexIndices.forEach((vertex, index) => {
    const offset = index * 3;
    result[vertex] =
      (field.deltasM[offset] * normal[0] +
        field.deltasM[offset + 1] * normal[1] +
        field.deltasM[offset + 2] * normal[2]) *
      coefficient;
  });
  return result;
}

/**
 * Every limb vertex follows the sum of at most one bounded field per channel. Summing each
 * channel's minimum/maximum signed-distance contribution therefore encloses every coefficient and
 * direction combination. A triangle excluded by this plan cannot cross the fixed section plane.
 */
function buildFixedSectionPlanV1(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly station: FixedStationV1;
  readonly modes: readonly OpenReferenceLimbCircumferenceModeV1[];
  readonly coefficientEnvelope: ReadonlyMap<
    OpenReferenceLimbCircumferenceKeyV1,
    OpenReferenceLimbCoefficientEnvelopeV1
  >;
  readonly strategy: 'bounded-candidate' | 'full-mesh';
}): FixedSectionPlanV1 {
  if (options.strategy === 'full-mesh') {
    return Object.freeze({
      station: options.station,
      sourceVertexIndices: null,
      triangleIndices: options.triangleIndices,
    });
  }
  const vertexCount = options.positionsM.length / 3;
  const minimumDistance = new Float64Array(vertexCount);
  const maximumDistance = new Float64Array(vertexCount);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const baseline =
      (options.positionsM[offset] - options.station.originM[0]) * options.station.normal[0] +
      (options.positionsM[offset + 1] - options.station.originM[1]) * options.station.normal[1] +
      (options.positionsM[offset + 2] - options.station.originM[2]) * options.station.normal[2];
    minimumDistance[vertex] = baseline;
    maximumDistance[vertex] = baseline;
  }
  for (const mode of options.modes) {
    const envelope = options.coefficientEnvelope.get(mode.measurementKey)!;
    const decrease = fieldPlaneDistances(
      mode.decrease,
      vertexCount,
      options.station.normal,
      envelope.decrease,
    );
    const increase = fieldPlaneDistances(
      mode.increase,
      vertexCount,
      options.station.normal,
      envelope.increase,
    );
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      minimumDistance[vertex] += Math.min(0, decrease[vertex], increase[vertex]);
      maximumDistance[vertex] += Math.max(0, decrease[vertex], increase[vertex]);
    }
  }

  const toleranceM = 1e-8;
  const candidates: number[] = [];
  for (let offset = 0; offset < options.triangleIndices.length; offset += 3) {
    const a = options.triangleIndices[offset];
    const b = options.triangleIndices[offset + 1];
    const c = options.triangleIndices[offset + 2];
    const minimum = Math.min(minimumDistance[a], minimumDistance[b], minimumDistance[c]);
    const maximum = Math.max(maximumDistance[a], maximumDistance[b], maximumDistance[c]);
    if (minimum > toleranceM || maximum < -toleranceM) continue;
    candidates.push(a, b, c);
  }
  if (candidates.length === 0) throw new Error('Fixed section plan has no candidate triangles.');
  const sourceVertexIndices = Uint32Array.from(
    [...new Set(candidates)].sort((left, right) => left - right),
  );
  const localVertexBySource = new Map<number, number>();
  sourceVertexIndices.forEach((sourceVertex, localVertex) => {
    localVertexBySource.set(sourceVertex, localVertex);
  });
  const triangleIndices = Uint32Array.from(candidates, (sourceVertex) => {
    const localVertex = localVertexBySource.get(sourceVertex);
    if (localVertex == null) throw new Error('Fixed section plan remap is incomplete.');
    return localVertex;
  });
  return Object.freeze({ station: options.station, sourceVertexIndices, triangleIndices });
}

function compactPositions(
  positionsM: Float32Array,
  sourceVertexIndices: Uint32Array | null,
): Float32Array {
  if (sourceVertexIndices === null) return positionsM;
  const compact = new Float32Array(sourceVertexIndices.length * 3);
  sourceVertexIndices.forEach((sourceVertex, localVertex) => {
    compact.set(positionsM.subarray(sourceVertex * 3, sourceVertex * 3 + 3), localVertex * 3);
  });
  return compact;
}

function measureAtPlanMm(positionsM: Float32Array, plan: FixedSectionPlanV1): number {
  const result = measureMeshPlaneSectionPerimetersV1({
    positionsM: compactPositions(positionsM, plan.sourceVertexIndices),
    triangleIndices: plan.triangleIndices,
    planeOriginM: plan.station.originM,
    planeNormal: plan.station.normal,
    selection: { kind: 'nearest-seed', seedM: plan.station.originM },
  });
  if (!result.ok || !result.selectedLoop) {
    throw new Error(result.ok ? 'Fixed section loop selection failed.' : result.errors.join('; '));
  }
  const perimeterMm = result.selectedLoop.perimeterM * 1000;
  if (!Number.isFinite(perimeterMm) || perimeterMm <= 0) {
    throw new Error('Fixed section perimeter is invalid.');
  }
  return perimeterMm;
}

function measureLimbMm(
  positionsM: Float32Array,
  plans: readonly [FixedSectionPlanV1, FixedSectionPlanV1],
): number {
  return (measureAtPlanMm(positionsM, plans[0]) + measureAtPlanMm(positionsM, plans[1])) / 2;
}

function fieldAffectsPlan(
  field: OpenReferenceSparseDeltaFieldV1,
  plan: FixedSectionPlanV1,
): boolean {
  if (plan.sourceVertexIndices === null) return true;
  let fieldIndex = 0;
  let planIndex = 0;
  while (fieldIndex < field.vertexIndices.length && planIndex < plan.sourceVertexIndices.length) {
    const fieldVertex = field.vertexIndices[fieldIndex];
    const planVertex = plan.sourceVertexIndices[planIndex];
    if (fieldVertex === planVertex) return true;
    if (fieldVertex < planVertex) fieldIndex += 1;
    else planIndex += 1;
  }
  return false;
}

function fieldAffectsAnyPlan(
  field: OpenReferenceSparseDeltaFieldV1,
  plans: readonly FixedSectionPlanV1[],
): boolean {
  return plans.some((plan) => fieldAffectsPlan(field, plan));
}

function frozenDrop(
  measurementKey: OpenReferenceLimbCircumferenceKeyV1,
  reasons: ReadonlySet<OpenReferenceLimbFinalClosureDropReasonV1>,
): OpenReferenceLimbFinalClosureDropV1 {
  return Object.freeze({ measurementKey, reasons: Object.freeze([...reasons].sort()) });
}

function freezeResult(options: {
  readonly positionsM: Float32Array;
  readonly representedMeasurements: readonly OpenReferenceLimbCircumferenceKeyV1[];
  readonly modeResults: readonly OpenReferenceLimbFinalClosureModeResultV1[];
  readonly droppedMeasurements: readonly OpenReferenceLimbFinalClosureDropV1[];
  readonly attempts: readonly OpenReferenceLimbFinalClosureAttemptV1[];
  readonly qualityGate: MeasurementOpenReferenceDisplayQualityGateResultV1;
}): OpenReferenceLimbFinalClosureResultV1 {
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_LIMB_FINAL_CLOSURE_V1,
    role: 'CC0_OPEN_REFERENCE_RESEARCH_CANDIDATE' as const,
    positionsM: options.positionsM,
    representedMeasurements: Object.freeze([...options.representedMeasurements]),
    modeResults: Object.freeze(options.modeResults.map((value) => Object.freeze({ ...value }))),
    droppedMeasurements: Object.freeze([...options.droppedMeasurements]),
    attempts: Object.freeze([...options.attempts]),
    qualityGate: options.qualityGate,
    claims: CLAIMS,
  });
}

function sectionPlanStrategy(
  value: 'bounded-candidate' | 'full-mesh' | undefined,
): 'bounded-candidate' | 'full-mesh' {
  const strategy = value ?? 'bounded-candidate';
  if (strategy !== 'bounded-candidate' && strategy !== 'full-mesh') {
    throw new RangeError('sectionPlanStrategy must be bounded-candidate or full-mesh.');
  }
  return strategy;
}

export function compileOpenReferenceLimbFinalClosureContextV1(options: {
  readonly waistHipPositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly limbModes: readonly OpenReferenceLimbCircumferenceModeV1[];
  readonly torsoModes: readonly UniformWaistHipModeV1[];
  readonly measurementKeys?: readonly OpenReferenceLimbCircumferenceKeyV1[];
  readonly coefficientEnvelope?: Partial<
    Record<OpenReferenceLimbCircumferenceKeyV1, OpenReferenceLimbCoefficientEnvelopeV1>
  >;
  readonly sectionPlanStrategy?: 'bounded-candidate' | 'full-mesh';
}): OpenReferenceLimbFinalClosureContextV1 {
  const strategy = sectionPlanStrategy(options.sectionPlanStrategy);
  const measurementKeys = Object.freeze(
    options.measurementKeys
      ? OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1.filter((key) =>
          options.measurementKeys!.includes(key),
        )
      : [...OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1],
  );
  if (
    measurementKeys.length === 0 ||
    measurementKeys.length !== (options.measurementKeys?.length ?? measurementKeys.length)
  ) {
    throw new Error('measurementKeys must be a non-empty unique set of known limb channels.');
  }
  const coefficientEnvelope = new Map(
    measurementKeys.map((key) => {
      const maximum = MAXIMUM_OPEN_REFERENCE_LIMB_COEFFICIENT_ENVELOPE_V1[key];
      const value = options.coefficientEnvelope?.[key] ?? maximum;
      if (
        !Number.isFinite(value.decrease) ||
        value.decrease <= 0 ||
        value.decrease > maximum.decrease ||
        !Number.isFinite(value.increase) ||
        value.increase <= 0 ||
        value.increase > maximum.increase
      ) {
        throw new RangeError(`${key} coefficient envelope must stay within the admitted maximum.`);
      }
      return [key, Object.freeze({ decrease: value.decrease, increase: value.increase })] as const;
    }),
  );
  const waistHipPositionsM = options.waistHipPositionsM.slice();
  const triangleIndices = options.triangleIndices.slice() as Uint16Array | Uint32Array;
  const limbModes = snapshotLimbModes(options.limbModes);
  const suppliedTorsoModes = snapshotTorsoModes(options.torsoModes);
  const modeByKey = new Map(
    measurementKeys.map((key) => {
      const matches = limbModes.filter((mode) => mode.measurementKey === key);
      if (matches.length !== 1) throw new Error(`Expected exactly one ${key} limb mode.`);
      return [key, matches[0]!] as const;
    }),
  );
  if (
    limbModes.length !== measurementKeys.length ||
    limbModes.some((mode) => !modeByKey.has(mode.measurementKey))
  ) {
    throw new Error('limbModes must exactly match the compiled measurementKeys.');
  }
  const torsoModes = Object.freeze(
    (['waistCircumferenceMm', 'hipCircumferenceMm'] as const).map((key) => {
      const matches = suppliedTorsoModes.filter((mode) => mode.measurementKey === key);
      if (matches.length !== 1) throw new Error(`Expected exactly one ${key} torso mode.`);
      return matches[0]!;
    }),
  );
  const planByKey = new Map(
    measurementKeys.map((key) => {
      const mode = modeByKey.get(key)!;
      const stations = deriveOpenReferenceLimbSectionStationsV1({
        positionsM: waistHipPositionsM,
        mode,
      });
      return [
        key,
        Object.freeze(
          stations.map((station) =>
            buildFixedSectionPlanV1({
              positionsM: waistHipPositionsM,
              triangleIndices,
              station,
              modes: limbModes,
              coefficientEnvelope,
              strategy,
            }),
          ),
        ) as unknown as readonly [FixedSectionPlanV1, FixedSectionPlanV1],
      ] as const;
    }),
  );
  const torsoPlans = Object.freeze(
    torsoModes.map((torsoMode) =>
      buildFixedSectionPlanV1({
        positionsM: waistHipPositionsM,
        triangleIndices,
        station: { originM: torsoMode.stationOriginM, normal: [0, 1, 0] },
        modes: limbModes,
        coefficientEnvelope,
        strategy,
      }),
    ),
  );
  const contentRevision = contentRevisionV1({
    waistHipPositionsM,
    triangleIndices,
    limbModes,
    torsoModes,
    coefficientEnvelope,
  });
  const publicEnvelope = Object.freeze(
    Object.fromEntries(
      OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1.map((key) => [
        key,
        coefficientEnvelope.get(key) ?? null,
      ]),
    ) as Record<OpenReferenceLimbCircumferenceKeyV1, OpenReferenceLimbCoefficientEnvelopeV1 | null>,
  );
  const context = Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_LIMB_FINAL_CLOSURE_CONTEXT_V1,
    sectionPlanStrategy: strategy,
    measurementKeys,
    coefficientEnvelope: publicEnvelope,
    contentRevision,
    claims: Object.freeze({
      conservativeAllDirectionCoefficientEnvelope: true as const,
      callerGeometryIdentityBound: false as const,
      callerGeometryContentBound: true as const,
      privateTypedArraySnapshots: true as const,
    }),
  });
  compiledClosureData.set(context, {
    waistHipPositionsM,
    triangleIndices,
    limbModes,
    torsoModes,
    measurementKeys,
    coefficientEnvelope,
    contentRevision,
    modeByKey,
    planByKey,
    torsoPlans,
  });
  return context;
}

/**
 * Research-only closure wrapper for optional limb proxies. Every accepted limb uses stations frozen
 * on the admitted waist/hip input. Violating sparse source fields are subtracted exactly in
 * canonical key order and closure is repeated over the retained set. A combined quality failure
 * rolls the entire limb set back.
 */
export function solveOpenReferenceLimbFinalClosureV1(options: {
  readonly uniformPositionsM: Float32Array;
  readonly waistHipPositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly limbModes: readonly OpenReferenceLimbCircumferenceModeV1[];
  readonly torsoModes: readonly UniformWaistHipModeV1[];
  readonly maximumResidualMm?: number;
  readonly maximumCrossTalkMm?: number;
  readonly binarySearchIterations?: number;
  readonly sectionPlanStrategy?: 'bounded-candidate' | 'full-mesh';
  readonly compiledContext?: OpenReferenceLimbFinalClosureContextV1;
}): OpenReferenceLimbFinalClosureResultV1 {
  const maximumResidualMm = options.maximumResidualMm ?? 0.1;
  const maximumCrossTalkMm = options.maximumCrossTalkMm ?? 0.1;
  if (!Number.isFinite(maximumResidualMm) || maximumResidualMm <= 0) {
    throw new RangeError('maximumResidualMm must be finite and positive.');
  }
  if (!Number.isFinite(maximumCrossTalkMm) || maximumCrossTalkMm <= 0) {
    throw new RangeError('maximumCrossTalkMm must be finite and positive.');
  }
  if (
    options.binarySearchIterations != null &&
    (!Number.isSafeInteger(options.binarySearchIterations) ||
      options.binarySearchIterations < 1 ||
      options.binarySearchIterations > 32)
  ) {
    throw new RangeError('binarySearchIterations must be an integer within 1..32.');
  }
  const requestedStrategy = sectionPlanStrategy(options.sectionPlanStrategy);
  let compiled: CompiledClosureDataV1;
  if (options.compiledContext) {
    const stored = compiledClosureData.get(options.compiledContext);
    if (!stored) throw new TypeError('compiledContext is not a genuine compiled closure context.');
    if (
      !typedArrayEquals(stored.waistHipPositionsM, options.waistHipPositionsM) ||
      !typedArrayEquals(stored.triangleIndices, options.triangleIndices) ||
      !limbModesEqual(stored.limbModes, options.limbModes) ||
      !torsoModesEqual(stored.torsoModes, options.torsoModes)
    ) {
      throw new Error('compiledContext content does not match the supplied geometry and modes.');
    }
    if (
      options.compiledContext.contentRevision !== stored.contentRevision ||
      options.compiledContext.measurementKeys.length !== stored.measurementKeys.length ||
      !options.compiledContext.measurementKeys.every(
        (key, index) => key === stored.measurementKeys[index],
      )
    ) {
      throw new Error('compiledContext metadata does not match its private snapshot.');
    }
    if (
      options.sectionPlanStrategy &&
      options.compiledContext.sectionPlanStrategy !== requestedStrategy
    ) {
      throw new Error('compiledContext section plan strategy does not match the solve request.');
    }
    compiled = stored;
  } else {
    const context = compileOpenReferenceLimbFinalClosureContextV1({
      waistHipPositionsM: options.waistHipPositionsM,
      triangleIndices: options.triangleIndices,
      limbModes: options.limbModes,
      torsoModes: options.torsoModes,
      sectionPlanStrategy: requestedStrategy,
    });
    compiled = compiledClosureData.get(context)!;
  }
  const {
    modeByKey,
    planByKey,
    torsoPlans,
    coefficientEnvelope,
    waistHipPositionsM,
    triangleIndices,
    limbModes,
  } = compiled;
  const requestedKeys = OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1.filter(
    (key) => options.measurements[key] != null,
  );
  const dropReasons = new Map<
    OpenReferenceLimbCircumferenceKeyV1,
    Set<OpenReferenceLimbFinalClosureDropReasonV1>
  >();
  const attempts: OpenReferenceLimbFinalClosureAttemptV1[] = [];

  const rememberDrop = (
    key: OpenReferenceLimbCircumferenceKeyV1,
    reason: OpenReferenceLimbFinalClosureDropReasonV1,
  ) => {
    const reasons = dropReasons.get(key) ?? new Set<OpenReferenceLimbFinalClosureDropReasonV1>();
    reasons.add(reason);
    dropReasons.set(key, reasons);
  };

  const validatedMeasurements: {
    -readonly [Key in keyof CanonicalBodyMeasurementsMm]: CanonicalBodyMeasurementsMm[Key];
  } = { ...options.measurements };
  const unsupported = requestedKeys.filter((key) => !modeByKey.has(key));
  unsupported.forEach((key) => {
    rememberDrop(key, 'underlying-solver-rejected');
    delete validatedMeasurements[key];
  });
  const implausible = requestedKeys.filter((key) => {
    if (unsupported.includes(key)) return false;
    const value = validatedMeasurements[key]!;
    const [minimum, maximum] = CANONICAL_MEASUREMENT_PLAUSIBILITY_MM[key];
    return !Number.isFinite(value) || value < minimum || value > maximum;
  });
  implausible.forEach((key) => {
    rememberDrop(key, 'target-implausible');
    delete validatedMeasurements[key];
  });

  const solved = solveOpenReferenceLimbMeshCircumferencesV1({
    positionsM: waistHipPositionsM,
    triangleIndices,
    measurements: validatedMeasurements,
    modes: limbModes,
    policy: {
      maximumResidualMm,
      ...(options.binarySearchIterations == null
        ? {}
        : { binarySearchIterations: options.binarySearchIterations }),
    },
  });
  const initiallyRepresented = new Set(solved.representedMeasurements);
  const rejected = requestedKeys.filter(
    (key) =>
      !unsupported.includes(key) && !implausible.includes(key) && !initiallyRepresented.has(key),
  );
  rejected.forEach((key) => rememberDrop(key, 'underlying-solver-rejected'));
  let positionsM: Float32Array = solved.positionsM.slice();
  const coefficientResolution = 1 / 2 ** (options.binarySearchIterations ?? 16);
  let activeResults = solved.modeResults.map((result) => {
    if (result.direction === 'none') return result;
    const maximumCoefficient = coefficientEnvelope.get(result.measurementKey)![result.direction];
    if (
      result.coefficient <= maximumCoefficient ||
      result.coefficient > maximumCoefficient + coefficientResolution
    ) {
      return result;
    }
    const field = modeByKey.get(result.measurementKey)![result.direction];
    positionsM = addScaledField(positionsM, field, maximumCoefficient - result.coefficient);
    return Object.freeze({ ...result, coefficient: maximumCoefficient });
  });

  for (
    let iteration = 0;
    iteration <= OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1.length;
    iteration += 1
  ) {
    const activeKeys = activeResults.map(({ measurementKey }) => measurementKey);
    if (activeKeys.length === 0) break;

    const violationReasons = new Map<
      OpenReferenceLimbCircumferenceKeyV1,
      Set<OpenReferenceLimbFinalClosureDropReasonV1>
    >();
    const modeResults: OpenReferenceLimbFinalClosureModeResultV1[] = [];
    const finalLimbPerimeterByKey = new Map<OpenReferenceLimbCircumferenceKeyV1, number>();
    const finalLimbPerimeter = (key: OpenReferenceLimbCircumferenceKeyV1): number => {
      const cached = finalLimbPerimeterByKey.get(key);
      if (cached != null) return cached;
      const measured = measureLimbMm(positionsM, planByKey.get(key)!);
      finalLimbPerimeterByKey.set(key, measured);
      return measured;
    };
    let finalTorsoPerimeters: readonly number[] | undefined;
    const finalTorsoPerimeter = (index: number): number => {
      finalTorsoPerimeters ??= torsoPlans.map((plan) => measureAtPlanMm(positionsM, plan));
      return finalTorsoPerimeters[index]!;
    };
    const markViolation = (
      key: OpenReferenceLimbCircumferenceKeyV1,
      reason: OpenReferenceLimbFinalClosureDropReasonV1,
    ) => {
      const reasons = violationReasons.get(key) ?? new Set();
      reasons.add(reason);
      violationReasons.set(key, reasons);
    };

    for (const result of activeResults) {
      try {
        if (result.direction !== 'none') {
          const maximumCoefficient = coefficientEnvelope.get(result.measurementKey)![
            result.direction
          ];
          if (result.coefficient > maximumCoefficient + 1e-9) {
            markViolation(result.measurementKey, 'coefficient-envelope-exceeded');
          }
        }
        const achievedMm = finalLimbPerimeter(result.measurementKey);
        const residualMm = Math.abs(achievedMm - result.targetMm);
        if (residualMm > maximumResidualMm) {
          markViolation(result.measurementKey, 'final-residual-exceeded');
        }

        const selectedMode = modeByKey.get(result.measurementKey)!;
        const field =
          result.direction === 'decrease' ? selectedMode.decrease : selectedMode.increase;
        const withoutOwnMode =
          result.direction === 'none'
            ? positionsM
            : addScaledField(positionsM, field, -result.coefficient);
        let maximumLimbCrossTalkMm = 0;
        for (const otherKey of activeKeys) {
          if (otherKey === result.measurementKey) continue;
          const otherPlans = planByKey.get(otherKey)!;
          if (!fieldAffectsAnyPlan(field, otherPlans)) continue;
          maximumLimbCrossTalkMm = Math.max(
            maximumLimbCrossTalkMm,
            Math.abs(finalLimbPerimeter(otherKey) - measureLimbMm(withoutOwnMode, otherPlans)),
          );
        }
        if (maximumLimbCrossTalkMm > maximumCrossTalkMm) {
          markViolation(result.measurementKey, 'final-limb-cross-talk-exceeded');
        }

        let maximumTorsoCrossTalkMm = 0;
        for (const [torsoIndex, torsoPlan] of torsoPlans.entries()) {
          if (!fieldAffectsPlan(field, torsoPlan)) continue;
          maximumTorsoCrossTalkMm = Math.max(
            maximumTorsoCrossTalkMm,
            Math.abs(finalTorsoPerimeter(torsoIndex) - measureAtPlanMm(withoutOwnMode, torsoPlan)),
          );
        }
        if (maximumTorsoCrossTalkMm > maximumCrossTalkMm) {
          markViolation(result.measurementKey, 'final-torso-cross-talk-exceeded');
        }
        modeResults.push({
          measurementKey: result.measurementKey,
          direction: result.direction,
          coefficient: result.coefficient,
          targetMm: result.targetMm,
          achievedMm,
          residualMm,
          maximumLimbCrossTalkMm,
          maximumTorsoCrossTalkMm,
        });
      } catch {
        markViolation(result.measurementKey, 'closure-measurement-failed');
      }
    }

    const droppedThisAttempt = [
      ...(iteration === 0
        ? [...unsupported, ...implausible, ...rejected].map((key) =>
            frozenDrop(key, dropReasons.get(key)!),
          )
        : []),
      ...[...violationReasons].map(([key, reasons]) => frozenDrop(key, reasons)),
    ];
    attempts.push(
      Object.freeze({
        activeMeasurements: Object.freeze(iteration === 0 ? requestedKeys : activeKeys),
        representedMeasurements: Object.freeze(activeKeys),
        droppedMeasurements: Object.freeze(droppedThisAttempt),
      }),
    );
    for (const [key, reasons] of violationReasons) {
      reasons.forEach((reason) => rememberDrop(key, reason));
      const result = activeResults.find(({ measurementKey }) => measurementKey === key);
      if (result && result.direction !== 'none') {
        const mode = modeByKey.get(key)!;
        const field = result.direction === 'decrease' ? mode.decrease : mode.increase;
        positionsM = addScaledField(positionsM, field, -result.coefficient);
      }
    }
    if (violationReasons.size > 0) {
      activeResults = activeResults.filter(
        ({ measurementKey }) => !violationReasons.has(measurementKey),
      );
      continue;
    }

    const qualityGate = evaluateMeasurementOpenReferenceDisplayQualityV1({
      uniformPositionsM: options.uniformPositionsM,
      personalizedPositionsM: positionsM,
      triangleIndices,
    });
    if (!qualityGate.safe) {
      activeKeys.forEach((key) => rememberDrop(key, 'combined-quality-unsafe'));
      return freezeResult({
        positionsM: waistHipPositionsM.slice(),
        representedMeasurements: [],
        modeResults: [],
        droppedMeasurements: OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1.filter((key) =>
          dropReasons.has(key),
        ).map((key) => frozenDrop(key, dropReasons.get(key)!)),
        attempts,
        qualityGate,
      });
    }
    return freezeResult({
      positionsM,
      representedMeasurements: activeKeys,
      modeResults,
      droppedMeasurements: OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1.filter((key) =>
        dropReasons.has(key),
      ).map((key) => frozenDrop(key, dropReasons.get(key)!)),
      attempts,
      qualityGate,
    });
  }

  const rollbackQuality = evaluateMeasurementOpenReferenceDisplayQualityV1({
    uniformPositionsM: options.uniformPositionsM,
    personalizedPositionsM: waistHipPositionsM,
    triangleIndices,
  });
  return freezeResult({
    positionsM: waistHipPositionsM.slice(),
    representedMeasurements: [],
    modeResults: [],
    droppedMeasurements: OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1.filter((key) =>
      dropReasons.has(key),
    ).map((key) => frozenDrop(key, dropReasons.get(key)!)),
    attempts,
    qualityGate: rollbackQuality,
  });
}
