import {
  DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
  validateMeasurementSurfaceSelfIntersectionV1,
} from 'lib/cloth/body/measurement-surface-self-intersection-v1';
import { sha256Hex } from 'lib/features/sha256';
import { evaluateBetaSkirtCanonicalMediumConfinedContactPairV2 } from './beta-skirt-canonical-medium-confined-ao-seam-contact-witness-v2';
import { betaSkirtSaved32SelfOrientationValidationV1 } from './beta-skirt-canonical-medium-saved-webgpu-32-frame-self-orientation-v1';
import { evaluateBetaSkirtCoherentEnvelopeQualityV1 } from './beta-skirt-coherent-envelope-quality-evidence-v1';
import {
  BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_IDENTITY_V2,
  evaluateBetaSkirtRenderedBodyCollisionDiagnosticV2,
  snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV2,
  type BetaSkirtRenderedBodyCollisionDiagnosticInputV2,
} from './beta-skirt-rendered-body-collision-diagnostic-v2';
import {
  computeBetaSkirtRenderedBodyTerminalCollisionReportSha256V42,
  refreshBetaSkirtRenderedBodySignedVertexContactsV42,
} from './beta-skirt-rendered-body-signed-vertex-contact-refresh-v42';

export const DXF_GARMENT_OBSERVED_FRAME_VALIDATION_V1 =
  'dxf-garment-observed-frame-validation/1' as const;
export type DxfGarmentObservedFrameValidationRequestV1 = Readonly<{
  schemaVersion: typeof DXF_GARMENT_OBSERVED_FRAME_VALIDATION_V1;
  frame: 0 | 16 | 32;
  initialPositions4: Float32Array;
  currentPositions4: Float32Array;
  previousPositions4: Float32Array;
  triangles: Uint32Array;
  seamPairs: Uint32Array;
  pins: Uint32Array;
  collisionInput: BetaSkirtRenderedBodyCollisionDiagnosticInputV2;
}>;
const CLAIMS = Object.freeze({
  contentConsistencyOnly: true,
  productAuthority: false,
  runtimeAuthority: false,
  sourcePersistenceAuthenticated: false,
  viewportAuthorityAuthenticated: false,
  materialFailureThresholdCalibrated: false,
  fitQualified: false,
  continuationQualified: false,
  placementCorrectionApplied: false,
} as const);
const SELF_POLICY = Object.freeze({
  ...DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
  maxVertices: 2000,
  maxTriangles: 5000,
  maxInputBytes: 128 * 1024,
  maxGridCells: 100000,
  maxCellReferences: 500000,
  maxCellPairVisits: 2000000,
  maxCandidatePairs: 500000,
});
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const tp = Object.getPrototypeOf(Float32Array.prototype);
const buffer = Object.getOwnPropertyDescriptor(tp, 'buffer')!.get!;
const offset = Object.getOwnPropertyDescriptor(tp, 'byteOffset')!.get!;
const length = Object.getOwnPropertyDescriptor(tp, 'length')!.get!;
const byteSet = Uint8Array.prototype.set;
function check(signal?: AbortSignal) {
  if (signal !== undefined && aborted.call(signal)) throw new Error('Frame validation cancelled.');
}
function own<T extends Float32Array | Uint32Array>(value: T, prototype: object, max: number): T {
  if (!value || Object.getPrototypeOf(value) !== prototype)
    throw new TypeError('Exact typed array required.');
  const n = length.call(value),
    source = buffer.call(value);
  if (n > max || Object.getPrototypeOf(source) !== ArrayBuffer.prototype)
    throw new TypeError('Array bound/shared storage refused.');
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key)!;
    if (
      typeof key !== 'string' ||
      !/^(0|[1-9][0-9]*)$/.test(key) ||
      Number(key) >= n ||
      !('value' in d)
    )
      throw new TypeError('Decorated typed array refused.');
  }
  const out = new ArrayBuffer(n * 4);
  byteSet.call(new Uint8Array(out), new Uint8Array(source, offset.call(value), n * 4));
  return (prototype === Float32Array.prototype ? new Float32Array(out) : new Uint32Array(out)) as T;
}
function freeze<T>(value: T): T {
  if (
    value &&
    typeof value === 'object' &&
    !ArrayBuffer.isView(value) &&
    !(value instanceof ArrayBuffer)
  ) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function xyz(value: Float32Array) {
  const out = new Float32Array((value.length / 4) * 3);
  for (let i = 0; i < value.length / 4; i++)
    for (let a = 0; a < 3; a++) out[i * 3 + a] = value[i * 4 + a];
  return out;
}
function maxGap(value: Float32Array, seams: Uint32Array) {
  let result = 0;
  for (let i = 0; i < seams.length; i += 2) {
    const a = seams[i] * 4,
      b = seams[i + 1] * 4;
    result = Math.max(
      result,
      Math.hypot(value[a] - value[b], value[a + 1] - value[b + 1], value[a + 2] - value[b + 2]),
    );
  }
  return result;
}

/** Count-generic content diagnostics. No source/body/device owner is issued or authenticated here. */
export async function evaluateDxfGarmentObservedFrameValidationV1(
  input: unknown,
  signal?: AbortSignal,
) {
  let stage = 'capture';
  try {
    check(signal);
    const keys = [
      'schemaVersion',
      'frame',
      'initialPositions4',
      'currentPositions4',
      'previousPositions4',
      'triangles',
      'seamPairs',
      'pins',
      'collisionInput',
    ];
    if (
      !input ||
      Object.getPrototypeOf(input) !== Object.prototype ||
      Reflect.ownKeys(input).length !== keys.length
    )
      throw new TypeError('Exact frame request required.');
    const r = Object.fromEntries(
      keys.map((key) => {
        const d = Object.getOwnPropertyDescriptor(input, key);
        if (!d?.enumerable || !('value' in d))
          throw new TypeError('Frame fields must be own data properties.');
        return [key, d.value];
      }),
    ) as DxfGarmentObservedFrameValidationRequestV1;
    if (
      r.schemaVersion !== DXF_GARMENT_OBSERVED_FRAME_VALIDATION_V1 ||
      ![0, 16, 32].includes(r.frame)
    )
      throw new TypeError('Frame version/count refused.');
    const initial = own(r.initialPositions4, Float32Array.prototype, 8000),
      current = own(r.currentPositions4, Float32Array.prototype, 8000),
      previous = own(r.previousPositions4, Float32Array.prototype, 8000);
    const triangles = own(r.triangles, Uint32Array.prototype, 15000),
      seams = own(r.seamPairs, Uint32Array.prototype, 4000),
      pins = own(r.pins, Uint32Array.prototype, 2000);
    const sourceCollision = snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV2(
      r.collisionInput,
    );
    const p = initial.length / 4;
    if (
      !Number.isInteger(p) ||
      p < 1 ||
      current.length !== initial.length ||
      previous.length !== initial.length ||
      !triangles.length ||
      triangles.length % 3 ||
      seams.length % 2
    )
      throw new RangeError('Frame extents differ.');
    if (
      sourceCollision.garmentUniformScale !== 1 ||
      sourceCollision.garmentTranslationM.some((v) => !Object.is(v, 0))
    )
      throw new TypeError('Exact rendered-world geometry required.');
    if (
      sourceCollision.garmentTriangles.length !== triangles.length ||
      sourceCollision.garmentTriangles.some((v, i) => v !== triangles[i])
    )
      throw new TypeError('Frame topology differs from bound collision input.');
    for (let i = 0; i < triangles.length; i += 3)
      if (
        [triangles[i], triangles[i + 1], triangles[i + 2]].some((v) => v >= p) ||
        new Set(triangles.subarray(i, i + 3)).size !== 3
      )
        throw new TypeError('Invalid triangle indices.');
    const seamVertices = new Set<number>();
    for (const vertex of seams) {
      if (vertex >= p || seamVertices.has(vertex))
        throw new TypeError('Only explicit unique one-to-one seam endpoints are supported.');
      seamVertices.add(vertex);
    }
    const pinSet = new Set(pins);
    if (pinSet.size !== pins.length || pins.some((v) => v >= p))
      throw new TypeError('Pin IDs must be unique and in range.');
    let zeroCount = 0,
      wMismatch = 0,
      pinnedCurrentMismatch = 0,
      pinnedPreviousMismatch = 0;
    const ib = new Uint32Array(initial.buffer),
      cb = new Uint32Array(current.buffer),
      pb = new Uint32Array(previous.buffer);
    for (let i = 0; i < p; i++) {
      const w = initial[4 * i + 3];
      if (!Number.isFinite(w) || w < 0 || w >= Math.fround(1e30) || pinSet.has(i) !== (w === 0))
        throw new TypeError('Pin identity must equal the exact source zero-W mask.');
      if (w === 0) zeroCount++;
      for (const values of [initial, current, previous])
        for (let a = 0; a < 4; a++)
          if (
            !Number.isFinite(values[4 * i + a]) ||
            (a < 3
              ? Math.abs(values[4 * i + a]) >= 100
              : values[4 * i + a] < 0 || values[4 * i + a] >= Math.fround(1e30))
          )
            throw new TypeError('State exceeds the finite physical domain.');
      if (ib[4 * i + 3] !== cb[4 * i + 3] || ib[4 * i + 3] !== pb[4 * i + 3]) wMismatch++;
      if (w === 0) {
        if ([0, 1, 2, 3].some((a) => ib[4 * i + a] !== cb[4 * i + a])) pinnedCurrentMismatch++;
        if ([0, 1, 2, 3].some((a) => ib[4 * i + a] !== pb[4 * i + a])) pinnedPreviousMismatch++;
      }
    }
    const initial3 = xyz(initial),
      current3 = xyz(current),
      initialGap = maxGap(initial, seams),
      currentGap = maxGap(current, seams);
    const expectedInitialBits = new Uint32Array(
        sourceCollision.garmentPositionsM.buffer,
        sourceCollision.garmentPositionsM.byteOffset,
        sourceCollision.garmentPositionsM.length,
      ),
      actualInitialBits = new Uint32Array(initial3.buffer);
    if (
      expectedInitialBits.length !== actualInitialBits.length ||
      expectedInitialBits.some((v, i) => v !== actualInitialBits[i])
    )
      throw new TypeError('Initial world positions differ from source collision binding.');
    const parity = {
      particleCount: p,
      pinnedCount: zeroCount,
      freeCount: p - zeroCount,
      inverseMassBitMismatchCount: wMismatch,
      pinnedCurrentBitMismatchCount: pinnedCurrentMismatch,
      pinnedPreviousBitMismatchCount: pinnedPreviousMismatch,
      initialMaximumSeamGapM: initialGap,
      currentMaximumSeamGapM: currentGap,
      maximumAllowedSeamGapM: r.frame === 0 ? 1e-7 : 0.001,
    };
    const blockers: string[] = [];
    if (wMismatch || pinnedCurrentMismatch || pinnedPreviousMismatch)
      blockers.push('exact-state-parity-failed');
    if (initialGap > 1e-7 || currentGap > parity.maximumAllowedSeamGapM)
      blockers.push('seam-gap-exceeded');
    stage = 'geometry';
    const quality = evaluateBetaSkirtCoherentEnvelopeQualityV1({
      sourcePositionsM: initial3.slice(),
      sourceTriangles: triangles.slice(),
      candidatePositionsM: current3.slice(),
      candidateTriangles: triangles.slice(),
    });
    const orientation = betaSkirtSaved32SelfOrientationValidationV1.orientation(
      initial3,
      current3,
      triangles,
    );
    if (
      quality.blockers.length ||
      orientation.sourceDegenerateTriangleCount ||
      orientation.finalDegenerateTriangleCount ||
      orientation.normalReversalCount
    )
      blockers.push('geometry-or-orientation-blocked');
    const oracle = validateMeasurementSurfaceSelfIntersectionV1(current3, triangles, SELF_POLICY);
    if (oracle.intersectionCount > 2048) throw new RangeError('Self witness budget exceeded.');
    const witnesses = [];
    for (const pair of oracle.intersections) {
      witnesses.push(
        await evaluateBetaSkirtCanonicalMediumConfinedContactPairV2({
          positions: current3,
          triangles,
          seamPairs: seams,
          pair,
          epsilonM: oracle.epsilonM,
          vertexCount: p,
          requireCanonicalSeamCount: false,
        }),
      );
      check(signal);
    }
    const excluded = witnesses.filter(
      (w) => w.disposition === 'excluded-confined-authenticated-ao-seam-touching',
    ).length;
    const residual = oracle.intersectionCount - excluded;
    if (residual) blockers.push('nonconfined-self-contact');
    stage = 'actual-body';
    const positionsSha256 = await sha256Hex(current3.buffer);
    check(signal);
    if (!positionsSha256) throw new Error('Position SHA unavailable.');
    const collisionInput = {
      ...sourceCollision,
      binding: { ...sourceCollision.binding, garmentPositionsSha256: positionsSha256 },
      garmentPositionsM: current3.slice(),
      garmentTriangles: triangles.slice(),
    };
    const collision = await evaluateBetaSkirtRenderedBodyCollisionDiagnosticV2(collisionInput);
    check(signal);
    let signed: Awaited<
      ReturnType<typeof refreshBetaSkirtRenderedBodySignedVertexContactsV42>
    > | null = null;
    if (
      collision.status === 'signed-clearance-measured' &&
      collision.claims.signedClassificationDefensible
    ) {
      const terminalSha =
        await computeBetaSkirtRenderedBodyTerminalCollisionReportSha256V42(collision);
      check(signal);
      signed = await refreshBetaSkirtRenderedBodySignedVertexContactsV42({
        extractionRound: 0,
        collisionInput,
        terminalCollisionReport: collision,
        terminalReceiptBinding: {
          collisionInputSha256: collision.contentFingerprintSha256,
          terminalCollisionReportSha256: terminalSha,
          collisionPolicyContentSha256:
            BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_IDENTITY_V2.policyContentSha256,
        },
      });
      check(signal);
    }
    const bodyClear =
      collision.status === 'signed-clearance-measured' &&
      collision.claims.signedClassificationDefensible &&
      collision.intersections.bodySelfIntersectionCount === 0 &&
      collision.intersections.bodyGarmentTriangleIntersectionCount === 0 &&
      collision.clearance.penetratingVertexCount === 0 &&
      collision.clearance.unsafeVertexCount === 0 &&
      collision.clearance.ambiguousSignVertexCount === 0 &&
      collision.clearance.minimumSignedClearanceM !== null &&
      collision.clearance.minimumSignedClearanceM >= 0.001 &&
      signed !== null &&
      signed.contacts.length === 0;
    if (!bodyClear) blockers.push('actual-body-contact-or-topology-blocked');
    check(signal);
    return freeze({
      ok: blockers.length === 0,
      evaluated: true as const,
      report: {
        schemaVersion: DXF_GARMENT_OBSERVED_FRAME_VALIDATION_V1,
        frame: r.frame,
        positionsSha256,
        parity,
        quality,
        orientation,
        self: {
          oracle,
          witnesses,
          excludedConfinedExplicitSeamCount: excluded,
          residualBlockingCount: residual,
          exactAccounting: witnesses.length === oracle.intersectionCount,
        },
        collision,
        signed,
        bodyClear,
        blockers,
        limitations: [
          'post-frame-distortion-acceptance-not-established',
          'explicit-AO-content-is-not-durable-source-authentication',
        ],
        claims: CLAIMS,
      },
      blockers,
    });
  } catch (error) {
    return freeze({
      ok: false,
      evaluated: false as const,
      report: null,
      blockers: [
        `${stage}: ${error instanceof Error ? error.message : 'Frame validation rejected.'}`,
      ],
      claims: CLAIMS,
    });
  }
}
export type DxfGarmentObservedFrameValidationResultV1 = Awaited<
  ReturnType<typeof evaluateDxfGarmentObservedFrameValidationV1>
>;
