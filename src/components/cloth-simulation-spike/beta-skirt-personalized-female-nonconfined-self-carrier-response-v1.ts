import type {
  BetaSkirtCanonicalMediumContactFeatureV2,
  BetaSkirtCanonicalMediumContactFeatureRefV2,
  BetaSkirtCanonicalMediumContactPairWitnessV2,
} from './beta-skirt-canonical-medium-confined-ao-seam-contact-witness-v2';

export const BETA_SKIRT_PERSONALIZED_FEMALE_NONCONFINED_SELF_CARRIER_RESPONSE_V1 =
  'beta-skirt-personalized-female-nonconfined-self-carrier-response/1' as const;

const MAX_WITNESS_COUNT = 64;
const MAX_FEATURE_COUNT = 32;
const encoder = new TextEncoder();

type Input = Readonly<{
  currentPositionsInvMass: Float32Array;
  previousPositionsInvMass: Float32Array;
  activeSeamPairs: Uint32Array;
  fixedHandleVertexIndices: Uint32Array;
  epsilonM: number;
  residualWitnesses: readonly BetaSkirtCanonicalMediumContactPairWitnessV2[];
}>;

type Carrier = Readonly<{ endpointA: number; endpointB: number }>;

export type BetaSkirtPersonalizedFemaleNonconfinedSelfCarrierResponseReportV1 = Readonly<{
  version: typeof BETA_SKIRT_PERSONALIZED_FEMALE_NONCONFINED_SELF_CARRIER_RESPONSE_V1;
  status: 'private-carrier-adjacent-self-response-ready-for-exact-rebuild';
  binding: Readonly<{
    sourcePositionsInvMassSha256: string;
    sourcePreviousPositionsInvMassSha256: string;
    witnessSetSha256: string;
    candidatePositionsInvMassSha256: string;
    candidatePreviousPositionsInvMassSha256: string;
  }>;
  source: Readonly<{
    residualWitnessCount: number;
    nonConfinedFeatureCount: number;
    authenticatedDirectCarrierCount: number;
    epsilonM: number;
  }>;
  response: Readonly<{
    correctedVertexCount: number;
    correctedVertexIndices: readonly number[];
    correctedCarrierEndpointCount: number;
    maximumCarrierGapBeforeM: number;
    maximumCarrierGapAfterM: number;
    maximumCorrectionM: number;
    maximumVelocityDeltaDriftM: number;
    changedInverseMassCount: 0;
    fixedHandleOrZeroMassVertexMovedCount: 0;
  }>;
  carriers: readonly Readonly<{
    endpoints: readonly [number, number];
    gapBeforeM: number;
    gapAfterM: number;
    endpointAMoved: boolean;
    endpointBMoved: boolean;
  }>[];
  claims: Readonly<{
    witnessSetConsumedDynamically: true;
    noFrameIndexPairIndexOrStateHashAllowlistUsed: true;
    responseRestrictedToAuthenticatedCarrierAdjacentTouching: true;
    arbitraryNonSeamSelfContactResponseImplemented: false;
    sourceBuffersSnapshottedBeforeAwait: true;
    activeAoEndpointsTreatedAsPhysicalPins: false;
    directCarrierEndpointsClosedByInverseMassWeightedProjection: true;
    velocityDeltaPreserved: true;
    inverseMassPreserved: true;
    exactExternalBodyAndSelfRebuildRequired: true;
    candidateUploadedToGpu: false;
    canonicalAssemblyOrderOwnerMutated: false;
    canonicalTrajectoryMutated: false;
    epsilonChanged: false;
    collisionPolicyChanged: false;
    collisionAuthority: false;
    runtimeAuthority: false;
    productionAuthority: false;
  }>;
}>;

export type BetaSkirtPersonalizedFemaleNonconfinedSelfCarrierResponseV1 = Readonly<{
  report: BetaSkirtPersonalizedFemaleNonconfinedSelfCarrierResponseReportV1;
  candidatePositionsInvMass: Float32Array;
  candidatePreviousPositionsInvMass: Float32Array;
}>;

function bytes(values: ArrayBufferView): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(values.byteLength);
  output.set(new Uint8Array(values.buffer, values.byteOffset, values.byteLength));
  return output;
}

async function sha256(values: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw new Error('Non-confined self response requires native SHA-256.');
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', values));
  return Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
}

function point(values: Float32Array, vertex: number): readonly [number, number, number] {
  return [values[vertex * 4]!, values[vertex * 4 + 1]!, values[vertex * 4 + 2]!];
}

function distance(left: readonly number[], right: readonly number[]): number {
  return Math.hypot(left[0]! - right[0]!, left[1]! - right[1]!, left[2]! - right[2]!);
}

function refVertices(ref: BetaSkirtCanonicalMediumContactFeatureRefV2): readonly number[] {
  if (ref.kind === 'vertex') return [ref.vertex];
  if (ref.kind === 'edge') return ref.vertices;
  return [];
}

function snapshotRef(
  ref: BetaSkirtCanonicalMediumContactFeatureRefV2,
): BetaSkirtCanonicalMediumContactFeatureRefV2 {
  if (ref.kind === 'vertex') return Object.freeze({ kind: 'vertex' as const, vertex: ref.vertex });
  if (ref.kind === 'edge')
    return Object.freeze({
      kind: 'edge' as const,
      vertices: Object.freeze([ref.vertices[0], ref.vertices[1]] as const),
    });
  return Object.freeze({ kind: 'face' as const, triangle: ref.triangle });
}

function carrierKey(endpointA: number, endpointB: number): string {
  return endpointA < endpointB ? `${endpointA}:${endpointB}` : `${endpointB}:${endpointA}`;
}

function snapshot(input: Input): Readonly<{
  currentPositionsInvMass: Float32Array;
  previousPositionsInvMass: Float32Array;
  activeSeamPairs: Uint32Array;
  fixedHandleVertexIndices: Uint32Array;
  epsilonM: number;
  carriers: readonly Carrier[];
  witnessPayload: readonly unknown[];
  nonConfinedFeatureCount: number;
}> {
  if (
    !(input.currentPositionsInvMass instanceof Float32Array) ||
    !(input.previousPositionsInvMass instanceof Float32Array) ||
    !(input.activeSeamPairs instanceof Uint32Array) ||
    !(input.fixedHandleVertexIndices instanceof Uint32Array) ||
    input.currentPositionsInvMass.length === 0 ||
    input.currentPositionsInvMass.length % 4 !== 0 ||
    input.previousPositionsInvMass.length !== input.currentPositionsInvMass.length ||
    input.activeSeamPairs.length % 2 !== 0 ||
    !Number.isFinite(input.epsilonM) ||
    !(input.epsilonM > 0) ||
    !Array.isArray(input.residualWitnesses) ||
    input.residualWitnesses.length === 0 ||
    input.residualWitnesses.length > MAX_WITNESS_COUNT
  )
    throw new TypeError('Non-confined self response input shape is invalid.');
  const vertexCount = input.currentPositionsInvMass.length / 4;
  const activeCarriers = new Set<string>();
  for (let index = 0; index < input.activeSeamPairs.length; index += 2) {
    const endpointA = input.activeSeamPairs[index]!;
    const endpointB = input.activeSeamPairs[index + 1]!;
    if (endpointA >= vertexCount || endpointB >= vertexCount || endpointA === endpointB)
      throw new TypeError('Active seam carrier endpoints are invalid.');
    activeCarriers.add(carrierKey(endpointA, endpointB));
  }
  for (const vertex of input.fixedHandleVertexIndices)
    if (vertex >= vertexCount) throw new TypeError('Fixed handle vertex is out of range.');

  const carriers = new Map<string, Carrier>();
  const witnessPayload: unknown[] = [];
  let nonConfinedFeatureCount = 0;
  for (const witness of input.residualWitnesses) {
    if (
      !witness ||
      witness.oracleKind !== 'touching' ||
      witness.disposition !== 'residual-touching-non-confined-feature' ||
      witness.featureCount !== witness.features.length ||
      witness.features.length === 0 ||
      witness.features.length > MAX_FEATURE_COUNT
    )
      throw new TypeError(
        'Self response accepts only bounded dynamically witnessed non-confined touching pairs.',
      );
    const direct: Carrier[] = [];
    const nonConfined: BetaSkirtCanonicalMediumContactFeatureV2[] = [];
    for (const feature of witness.features) {
      const carrier = feature.confinedCarrier;
      if (carrier?.kind === 'direct-seam-endpoint')
        direct.push({ endpointA: carrier.endpointA, endpointB: carrier.endpointB });
      if (carrier === null) nonConfined.push(feature);
    }
    if (direct.length === 0 || nonConfined.length === 0)
      throw new TypeError(
        'Residual self contact is outside the authenticated carrier-adjacent response scope.',
      );
    if (
      nonConfined.some(
        (feature) =>
          feature.nonConfinedRelation !== 'authenticated-carrier-adjacent-but-not-confined' ||
          feature.nearestIncidentAuthenticatedCarrierDistanceM === null ||
          !Number.isFinite(feature.nearestIncidentAuthenticatedCarrierDistanceM) ||
          feature.nearestIncidentAuthenticatedCarrierDistanceM < 0,
      )
    )
      throw new TypeError(
        'Residual self contact contains a non-authenticated non-confined relation.',
      );
    nonConfinedFeatureCount += nonConfined.length;
    const incidentNonConfinedFeatures = new Set<(typeof nonConfined)[number]>();
    for (const carrier of direct) {
      if (
        carrier.endpointA >= vertexCount ||
        carrier.endpointB >= vertexCount ||
        !activeCarriers.has(carrierKey(carrier.endpointA, carrier.endpointB))
      )
        throw new TypeError('Residual witness references a non-active direct seam carrier.');
      const incident = nonConfined.some((feature) => {
        const verticesA = refVertices(feature.onTriangleA);
        const verticesB = refVertices(feature.onTriangleB);
        return (
          (verticesA.includes(carrier.endpointA) && verticesB.includes(carrier.endpointB)) ||
          (verticesA.includes(carrier.endpointB) && verticesB.includes(carrier.endpointA))
        );
      });
      if (!incident) continue;
      for (const feature of nonConfined) {
        const verticesA = refVertices(feature.onTriangleA);
        const verticesB = refVertices(feature.onTriangleB);
        if (
          (verticesA.includes(carrier.endpointA) && verticesB.includes(carrier.endpointB)) ||
          (verticesA.includes(carrier.endpointB) && verticesB.includes(carrier.endpointA))
        )
          incidentNonConfinedFeatures.add(feature);
      }
      carriers.set(carrierKey(carrier.endpointA, carrier.endpointB), Object.freeze({ ...carrier }));
    }
    if (incidentNonConfinedFeatures.size !== nonConfined.length)
      throw new TypeError(
        'Every non-confined feature must be incident to an authenticated direct carrier.',
      );
    witnessPayload.push(
      Object.freeze({
        triangleA: witness.triangleA,
        triangleB: witness.triangleB,
        oracleKind: witness.oracleKind,
        contactLocusSha256: witness.contactLocusSha256,
        directCarriers: Object.freeze(
          direct.map((carrier) =>
            Object.freeze({ endpointA: carrier.endpointA, endpointB: carrier.endpointB }),
          ),
        ),
        nonConfinedFeatures: Object.freeze(
          nonConfined.map((feature) =>
            Object.freeze({
              kind: feature.kind,
              onTriangleA: snapshotRef(feature.onTriangleA),
              onTriangleB: snapshotRef(feature.onTriangleB),
              nearestIncidentAuthenticatedCarrierDistanceM:
                feature.nearestIncidentAuthenticatedCarrierDistanceM,
            }),
          ),
        ),
      }),
    );
  }
  const endpointOwners = new Map<number, string>();
  for (const [key, carrier] of carriers) {
    for (const endpoint of [carrier.endpointA, carrier.endpointB]) {
      const prior = endpointOwners.get(endpoint);
      if (prior && prior !== key)
        throw new TypeError('Carrier-adjacent response cannot resolve overlapping seam carriers.');
      endpointOwners.set(endpoint, key);
    }
  }
  if (carriers.size === 0)
    throw new TypeError('No authenticated carrier response was derived from the witnesses.');
  return Object.freeze({
    currentPositionsInvMass: new Float32Array(input.currentPositionsInvMass),
    previousPositionsInvMass: new Float32Array(input.previousPositionsInvMass),
    activeSeamPairs: new Uint32Array(input.activeSeamPairs),
    fixedHandleVertexIndices: new Uint32Array(input.fixedHandleVertexIndices),
    epsilonM: input.epsilonM,
    carriers: Object.freeze([...carriers.values()]),
    witnessPayload: Object.freeze(witnessPayload),
    nonConfinedFeatureCount,
  });
}

export async function createBetaSkirtPersonalizedFemaleNonconfinedSelfCarrierResponseV1(
  sourceInput: Input,
): Promise<BetaSkirtPersonalizedFemaleNonconfinedSelfCarrierResponseV1> {
  const input = snapshot(sourceInput);
  const current = new Float32Array(input.currentPositionsInvMass);
  const previous = new Float32Array(input.previousPositionsInvMass);
  const fixedHandles = new Set(input.fixedHandleVertexIndices);
  const sourcePositionsInvMassSha256 = await sha256(bytes(input.currentPositionsInvMass));
  const sourcePreviousPositionsInvMassSha256 = await sha256(bytes(input.previousPositionsInvMass));
  const witnessSetSha256 = await sha256(encoder.encode(JSON.stringify(input.witnessPayload)));
  const audits: {
    endpoints: readonly [number, number];
    gapBeforeM: number;
    gapAfterM: number;
    endpointAMoved: boolean;
    endpointBMoved: boolean;
  }[] = [];
  const corrected = new Set<number>();
  let maximumCarrierGapBeforeM = 0;
  let maximumCarrierGapAfterM = 0;
  let maximumCorrectionM = 0;
  let maximumVelocityDeltaDriftM = 0;
  for (const carrier of input.carriers) {
    const beforeA = point(input.currentPositionsInvMass, carrier.endpointA);
    const beforeB = point(input.currentPositionsInvMass, carrier.endpointB);
    const gapBeforeM = distance(beforeA, beforeB);
    if (gapBeforeM > input.epsilonM)
      throw new RangeError('Carrier-adjacent response gap exceeds the unchanged oracle epsilon.');
    maximumCarrierGapBeforeM = Math.max(maximumCarrierGapBeforeM, gapBeforeM);
    const sourceWA = input.currentPositionsInvMass[carrier.endpointA * 4 + 3]!;
    const sourceWB = input.currentPositionsInvMass[carrier.endpointB * 4 + 3]!;
    if (!Number.isFinite(sourceWA) || !Number.isFinite(sourceWB) || sourceWA < 0 || sourceWB < 0)
      throw new TypeError('Carrier inverse mass is invalid.');
    const effectiveWA = sourceWA > 0 && !fixedHandles.has(carrier.endpointA) ? sourceWA : 0;
    const effectiveWB = sourceWB > 0 && !fixedHandles.has(carrier.endpointB) ? sourceWB : 0;
    const weight = effectiveWA + effectiveWB;
    if (!(weight > 0)) throw new RangeError('Carrier-adjacent response has no movable endpoint.');
    for (let axis = 0; axis < 3; axis += 1) {
      const separation = beforeB[axis]! - beforeA[axis]!;
      const targetA = Math.fround(beforeA[axis]! + (effectiveWA / weight) * separation);
      const targetB = Math.fround(beforeB[axis]! - (effectiveWB / weight) * separation);
      for (const [vertex, target] of [
        [carrier.endpointA, targetA],
        [carrier.endpointB, targetB],
      ] as const) {
        const offset = vertex * 4 + axis;
        const sourceCurrent = input.currentPositionsInvMass[offset]!;
        const sourcePrevious = input.previousPositionsInvMass[offset]!;
        const velocityDelta = sourceCurrent - sourcePrevious;
        current[offset] = target;
        previous[offset] = Math.fround(target - velocityDelta);
        const correction = Math.abs(target - sourceCurrent);
        if (correction > 0) corrected.add(vertex);
      }
    }
    for (const [vertex, before] of [
      [carrier.endpointA, beforeA],
      [carrier.endpointB, beforeB],
    ] as const) {
      maximumCorrectionM = Math.max(maximumCorrectionM, distance(point(current, vertex), before));
      const offset = vertex * 4;
      maximumVelocityDeltaDriftM = Math.max(
        maximumVelocityDeltaDriftM,
        Math.hypot(
          current[offset]! -
            previous[offset]! -
            (input.currentPositionsInvMass[offset]! - input.previousPositionsInvMass[offset]!),
          current[offset + 1]! -
            previous[offset + 1]! -
            (input.currentPositionsInvMass[offset + 1]! -
              input.previousPositionsInvMass[offset + 1]!),
          current[offset + 2]! -
            previous[offset + 2]! -
            (input.currentPositionsInvMass[offset + 2]! -
              input.previousPositionsInvMass[offset + 2]!),
        ),
      );
    }
    const gapAfterM = distance(
      point(current, carrier.endpointA),
      point(current, carrier.endpointB),
    );
    maximumCarrierGapAfterM = Math.max(maximumCarrierGapAfterM, gapAfterM);
    audits.push({
      endpoints: Object.freeze([carrier.endpointA, carrier.endpointB] as const),
      gapBeforeM,
      gapAfterM,
      endpointAMoved: corrected.has(carrier.endpointA),
      endpointBMoved: corrected.has(carrier.endpointB),
    });
  }
  if (maximumCorrectionM > input.epsilonM || maximumCarrierGapAfterM > input.epsilonM * 0.25)
    throw new RangeError('Carrier-adjacent response exceeded its bounded projection policy.');
  let changedInverseMassCount = 0;
  let fixedHandleOrZeroMassVertexMovedCount = 0;
  for (let vertex = 0; vertex < current.length / 4; vertex += 1) {
    const offset = vertex * 4;
    if (
      current[offset + 3] !== input.currentPositionsInvMass[offset + 3] ||
      previous[offset + 3] !== input.previousPositionsInvMass[offset + 3]
    )
      changedInverseMassCount += 1;
    if (
      (input.currentPositionsInvMass[offset + 3] === 0 || fixedHandles.has(vertex)) &&
      [0, 1, 2].some(
        (axis) =>
          current[offset + axis] !== input.currentPositionsInvMass[offset + axis] ||
          previous[offset + axis] !== input.previousPositionsInvMass[offset + axis],
      )
    )
      fixedHandleOrZeroMassVertexMovedCount += 1;
  }
  if (changedInverseMassCount !== 0 || fixedHandleOrZeroMassVertexMovedCount !== 0)
    throw new RangeError('Carrier-adjacent response changed inverse mass or fixed support state.');
  const [candidatePositionsInvMassSha256, candidatePreviousPositionsInvMassSha256] =
    await Promise.all([sha256(bytes(current)), sha256(bytes(previous))]);
  const report = Object.freeze({
    version: BETA_SKIRT_PERSONALIZED_FEMALE_NONCONFINED_SELF_CARRIER_RESPONSE_V1,
    status: 'private-carrier-adjacent-self-response-ready-for-exact-rebuild' as const,
    binding: Object.freeze({
      sourcePositionsInvMassSha256,
      sourcePreviousPositionsInvMassSha256,
      witnessSetSha256,
      candidatePositionsInvMassSha256,
      candidatePreviousPositionsInvMassSha256,
    }),
    source: Object.freeze({
      residualWitnessCount: input.witnessPayload.length,
      nonConfinedFeatureCount: input.nonConfinedFeatureCount,
      authenticatedDirectCarrierCount: input.carriers.length,
      epsilonM: input.epsilonM,
    }),
    response: Object.freeze({
      correctedVertexCount: corrected.size,
      correctedVertexIndices: Object.freeze([...corrected].sort((left, right) => left - right)),
      correctedCarrierEndpointCount: corrected.size,
      maximumCarrierGapBeforeM,
      maximumCarrierGapAfterM,
      maximumCorrectionM,
      maximumVelocityDeltaDriftM,
      changedInverseMassCount: 0 as const,
      fixedHandleOrZeroMassVertexMovedCount: 0 as const,
    }),
    carriers: Object.freeze(audits.map((audit) => Object.freeze(audit))),
    claims: Object.freeze({
      witnessSetConsumedDynamically: true as const,
      noFrameIndexPairIndexOrStateHashAllowlistUsed: true as const,
      responseRestrictedToAuthenticatedCarrierAdjacentTouching: true as const,
      arbitraryNonSeamSelfContactResponseImplemented: false as const,
      sourceBuffersSnapshottedBeforeAwait: true as const,
      activeAoEndpointsTreatedAsPhysicalPins: false as const,
      directCarrierEndpointsClosedByInverseMassWeightedProjection: true as const,
      velocityDeltaPreserved: true as const,
      inverseMassPreserved: true as const,
      exactExternalBodyAndSelfRebuildRequired: true as const,
      candidateUploadedToGpu: false as const,
      canonicalAssemblyOrderOwnerMutated: false as const,
      canonicalTrajectoryMutated: false as const,
      epsilonChanged: false as const,
      collisionPolicyChanged: false as const,
      collisionAuthority: false as const,
      runtimeAuthority: false as const,
      productionAuthority: false as const,
    }),
  }) satisfies BetaSkirtPersonalizedFemaleNonconfinedSelfCarrierResponseReportV1;
  return Object.freeze({
    report,
    candidatePositionsInvMass: current,
    candidatePreviousPositionsInvMass: previous,
  });
}

export async function hashBetaSkirtPersonalizedFemaleNonconfinedSelfCarrierResponsePayloadV1(
  value: unknown,
): Promise<string> {
  return sha256(encoder.encode(JSON.stringify(value)));
}
