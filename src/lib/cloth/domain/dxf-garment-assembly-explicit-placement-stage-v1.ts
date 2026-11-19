import {
  compileDxfGarmentAssemblyMaterialStageV1,
  type DxfGarmentAssemblyMaterialCompileStageRequestV1,
  type DxfGarmentAssemblyMaterialCompileStageResultV1,
} from './dxf-garment-assembly-material-compile-stage-v1';
import {
  validateSimulationPackageV5,
  type SimulationPackageV5,
} from '../compiler/simulation-package';
import { sealSimulationPackageV5V1 } from '../compiler/simulation-package-v5-integrity';
import { decodeTriangleRestFrameGpuV1 } from '../compiler/material-package';
import {
  evaluateTriangleStrain,
  type TrianglePositions,
} from '../runtime/cpu/triangle-strain-oracle';

export const DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1 =
  'dxf-garment-assembly-explicit-placement-stage/1' as const;
export type DxfGarmentExplicitPiecePlacementV1 = Readonly<{
  pieceId: string;
  /** Explicit source-frame origin in SI metres, never a computed centroid. */
  sourceOriginM: readonly [number, number, number];
  /** Proper orthonormal row-major rotation; no normalization, reflection or scale. */
  rotationRowMajor: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  translationM: readonly [number, number, number];
}>;
type SourceArtifact = NonNullable<DxfGarmentAssemblyMaterialCompileStageResultV1['artifact']>;
export type DxfGarmentAssemblyExplicitPlacementStageRequestV1 = Readonly<{
  schemaVersion: typeof DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1;
  sourceRequest: DxfGarmentAssemblyMaterialCompileStageRequestV1;
  sourceArtifact: SourceArtifact;
  expectedSourceInputSha256: string;
  placements: readonly DxfGarmentExplicitPiecePlacementV1[];
}>;

const CLAIMS = Object.freeze({
  contentConsistencyOnly: true,
  sourceCompileIndependentlyReplayed: true,
  materialRestAndConstraintBytesPreserved: true,
  supportAttachmentPolicy: 'none',
  initialPositionField: 'mesh.restPositionsInvMass.xyz',
  legacyBoundsField: 'restBoundsM is placed XY only',
  sourceOrNativeReaderAuthenticated: false,
  savedRowFreshnessAuthenticated: false,
  placementIntentUserAuthorizationAuthenticated: false,
  automaticSeamClosingUsed: false,
  bodyPlacementQualified: false,
  collisionQualified: false,
  runtimeAuthority: false,
  assemblyOperationScheduleExecuted: false,
  productionReady: false,
} as const);
const ROTATION_TOLERANCE = 1e-12;
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const arrayBufferLength = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'byteLength',
)!.get!;
const typedPrototype = Object.getPrototypeOf(Float32Array.prototype);
const typedLength = Object.getOwnPropertyDescriptor(typedPrototype, 'length')!.get!;
const typedBuffer = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer')!.get!;
const typedOffset = Object.getOwnPropertyDescriptor(typedPrototype, 'byteOffset')!.get!;
const typedBytes = Object.getOwnPropertyDescriptor(typedPrototype, 'byteLength')!.get!;
const nativeSet = Uint8Array.prototype.set;
const clone = globalThis.structuredClone.bind(globalThis);
class PlacementBlocked extends Error {
  constructor(
    readonly code: string,
    detail: string,
  ) {
    super(detail);
  }
}
function fail(code: string, detail: string): never {
  throw new PlacementBlocked(code, detail);
}
function check(signal?: AbortSignal): void {
  if (signal !== undefined && nativeAborted.call(signal))
    fail('aborted', 'Placement was cancelled; no output is published.');
}

/** Snapshot hostile DTOs before any await; no input getter, iterator or shared buffer is read. */
function capture(value: unknown): unknown {
  let nodes = 0,
    byteBudget = 0;
  const active = new Set<object>();
  function copy(item: unknown, depth: number): unknown {
    if (++nodes > 3_000_000 || depth > 48)
      fail('input-bound-exceeded', 'Snapshot exceeds the placement input bound.');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item === 'string' && item.length <= 4096) return item;
    if (!item || typeof item !== 'object' || active.has(item))
      fail('invalid-input', 'Only acyclic finite data is accepted.');
    const proto = Object.getPrototypeOf(item);
    if (
      proto === ArrayBuffer.prototype ||
      proto === Float32Array.prototype ||
      proto === Uint32Array.prototype
    ) {
      const isBuffer = proto === ArrayBuffer.prototype;
      const source = isBuffer ? item : typedBuffer.call(item);
      if (Object.getPrototypeOf(source) !== ArrayBuffer.prototype)
        fail('invalid-input', 'Shared buffers are unsupported.');
      const count = isBuffer ? arrayBufferLength.call(item) : typedBytes.call(item);
      byteBudget += count;
      if (count > 32 * 1024 * 1024 || byteBudget > 128 * 1024 * 1024)
        fail('input-bound-exceeded', 'Buffer snapshot exceeds its byte bound.');
      const length = isBuffer ? 0 : typedLength.call(item);
      const descriptors = Object.getOwnPropertyDescriptors(item);
      for (const key of Reflect.ownKeys(descriptors)) {
        const d = descriptors[key as string];
        if (
          isBuffer ||
          typeof key !== 'string' ||
          !/^(0|[1-9][0-9]*)$/.test(key) ||
          Number(key) >= length ||
          !('value' in d) ||
          !d.enumerable
        )
          fail('invalid-input', 'Buffer accessors or additional properties are unsupported.');
      }
      const result = new ArrayBuffer(count);
      nativeSet.call(
        new Uint8Array(result),
        new Uint8Array(source as ArrayBuffer, isBuffer ? 0 : typedOffset.call(item), count),
      );
      return isBuffer
        ? result
        : proto === Float32Array.prototype
          ? new Float32Array(result)
          : new Uint32Array(result);
    }
    const array = Array.isArray(item);
    if (proto !== (array ? Array.prototype : Object.prototype))
      fail('invalid-input', 'Unsupported object prototype.');
    const length = array ? Object.getOwnPropertyDescriptor(item, 'length')!.value : 0;
    if (array && length > 500_000)
      fail('input-bound-exceeded', 'Array snapshot exceeds its bound.');
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (array && Reflect.ownKeys(descriptors).length !== length + 1)
      fail('invalid-input', 'Arrays must be dense with no additional properties.');
    active.add(item);
    const out: unknown[] | Record<string, unknown> = array ? [] : {};
    for (const key of Reflect.ownKeys(descriptors)) {
      if (array && key === 'length') continue;
      const d = descriptors[key as string];
      if (
        typeof key !== 'string' ||
        key === '__proto__' ||
        !('value' in d) ||
        !d.enumerable ||
        (array && !/^(0|[1-9][0-9]*)$/.test(key))
      )
        fail('invalid-input', 'Accessors, hidden fields and symbols are unsupported.');
      Object.defineProperty(out, key, {
        value: copy(d.value, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    active.delete(item);
    return out;
  }
  return copy(value, 0);
}
function bytes(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  return value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}
function equal(a: unknown, b: unknown): boolean {
  if (a instanceof ArrayBuffer || ArrayBuffer.isView(a)) {
    if (!b || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
    const x = bytes(a),
      y = bytes(b as ArrayBuffer | ArrayBufferView);
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object')
    return Object.is(a, b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const x = Object.keys(a).sort(),
    y = Object.keys(b).sort();
  return (
    x.length === y.length &&
    x.every(
      (key, i) =>
        key === y[i] &&
        equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
}
function exactKeys(value: object, keys: readonly string[]): boolean {
  return equal(Object.keys(value).sort(), [...keys].sort());
}
function freeze<T>(value: T): T {
  if (
    value &&
    typeof value === 'object' &&
    !(value instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(value)
  ) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function canonical(value: unknown): string {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value))
    return JSON.stringify({
      type:
        Object.getPrototypeOf(value) === ArrayBuffer.prototype
          ? 'ArrayBuffer'
          : value instanceof Float32Array
            ? 'Float32Array'
            : 'Uint32Array',
      hex: Array.from(bytes(value), (v) => v.toString(16).padStart(2, '0')).join(''),
    });
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}
async function digest(domain: string, value: unknown): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${domain}\0${canonical(value)}`),
      ),
    ),
    (v) => v.toString(16).padStart(2, '0'),
  ).join('');
}
function vector(value: readonly number[], length: number): boolean {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
}
function rotate(r: readonly number[], v: readonly number[]): [number, number, number] {
  return [
    r[0] * v[0] + r[1] * v[1] + r[2] * v[2],
    r[3] * v[0] + r[4] * v[1] + r[5] * v[2],
    r[6] * v[0] + r[7] * v[1] + r[8] * v[2],
  ];
}
function cross(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function subtract(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function point(p: Float32Array, i: number): [number, number, number] {
  return [p[4 * i], p[4 * i + 1], p[4 * i + 2]];
}
function validatePlacement(p: DxfGarmentExplicitPiecePlacementV1): void {
  if (
    !p ||
    !exactKeys(p, ['pieceId', 'sourceOriginM', 'rotationRowMajor', 'translationM']) ||
    typeof p.pieceId !== 'string' ||
    !vector(p.sourceOriginM, 3) ||
    !vector(p.translationM, 3) ||
    !vector(p.rotationRowMajor, 9)
  )
    fail(
      'invalid-placement',
      'Every piece requires an exact finite explicit origin, rotation and translation.',
    );
  const r = p.rotationRowMajor;
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++) {
      let dot = 0;
      for (let k = 0; k < 3; k++) dot += r[row * 3 + k] * r[col * 3 + k];
      if (Math.abs(dot - (row === col ? 1 : 0)) > ROTATION_TOLERANCE)
        fail(
          'non-rigid-transform',
          'Rotation must be orthonormal; no scale, shear or normalization is accepted.',
        );
    }
  const det =
    r[0] * (r[4] * r[8] - r[5] * r[7]) -
    r[1] * (r[3] * r[8] - r[5] * r[6]) +
    r[2] * (r[3] * r[7] - r[4] * r[6]);
  if (Math.abs(det - 1) > ROTATION_TOLERANCE)
    fail('non-rigid-transform', 'Rotation must have determinant +1; reflections are not accepted.');
}

function place(source: SourceArtifact, placements: readonly DxfGarmentExplicitPiecePlacementV1[]) {
  const local = source.compiledSimulation;
  if (local.manifest.pinnedParticleCount !== 0 || local.mesh.supportAttachments.mode !== 'none')
    fail('unsupported-support', 'This stage requires the existing explicit none support policy.');
  const ranges = source.refinement.mesh.pieceRanges;
  if (
    placements.length !== ranges.length ||
    new Set(placements.map((p) => p.pieceId)).size !== ranges.length
  )
    fail('piece-coverage-mismatch', 'Placement must cover each exact compiled piece once.');
  placements.forEach(validatePlacement);
  const initial = new Float32Array(local.mesh.restPositionsInvMass);
  const vertexPieces = new Int32Array(local.manifest.particleCount).fill(-1);
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let rangeIndex = 0; rangeIndex < ranges.length; rangeIndex++) {
    const range = ranges[rangeIndex];
    const placement = placements.find((p) => p.pieceId === range.pieceId);
    if (!placement) fail('piece-coverage-mismatch', `Missing exact piece ${range.pieceId}.`);
    for (let i = range.vertexOffset; i < range.vertexOffset + range.vertexCount; i++) {
      if (vertexPieces[i] !== -1) fail('piece-range-invalid', 'Compiled particle ranges overlap.');
      vertexPieces[i] = rangeIndex;
      const transformed = rotate(
        placement.rotationRowMajor,
        subtract(point(local.mesh.restPositionsInvMass, i), placement.sourceOriginM),
      );
      for (let k = 0; k < 3; k++) {
        initial[i * 4 + k] = transformed[k] + placement.translationM[k];
        if (!Number.isFinite(initial[i * 4 + k]))
          fail('non-finite-placement', 'Explicit placement is not finite in Float32.');
        min[k] = Math.min(min[k], initial[i * 4 + k]);
        max[k] = Math.max(max[k], initial[i * 4 + k]);
      }
    }
  }
  if (vertexPieces.some((i) => i < 0))
    fail('piece-range-invalid', 'Compiled particle ranges leave gaps.');
  let maximumEdgeLengthDeltaM = 0,
    maximumDistanceRestResidualM = 0;
  const distance = local.constraints.distance;
  for (let i = 0; i < distance.restLengthsM.length; i++) {
    const a = distance.vertexPairs[i * 2],
      b = distance.vertexPairs[i * 2 + 1];
    if (vertexPieces[a] !== vertexPieces[b])
      fail(
        'cross-piece-rest-constraint',
        'Distance rest edges must remain within one rigid piece.',
      );
    const before = Math.hypot(
      ...subtract(
        point(local.mesh.restPositionsInvMass, a),
        point(local.mesh.restPositionsInvMass, b),
      ),
    );
    const after = Math.hypot(...subtract(point(initial, a), point(initial, b)));
    if (!Number.isFinite(after) || after <= 0)
      fail('degenerate-placement', 'Float32 placement collapsed a local edge.');
    maximumEdgeLengthDeltaM = Math.max(maximumEdgeLengthDeltaM, Math.abs(after - before));
    maximumDistanceRestResidualM = Math.max(
      maximumDistanceRestResidualM,
      Math.abs(after - distance.restLengthsM[i]),
    );
  }
  let maximumAbsoluteLocalGreenStrain = 0,
    maximumAbsolutePlacedGreenStrain = 0,
    maximumGreenStrainDelta = 0;
  for (let t = 0; t < local.manifest.triangleCount; t++) {
    const ids = [0, 1, 2].map((k) => local.mesh.triangles[t * 3 + k]);
    if (ids.some((i) => vertexPieces[i] !== vertexPieces[ids[0]]))
      fail('cross-piece-rest-constraint', 'Triangles must remain within one rigid piece.');
    const before = ids.map((i) =>
      point(local.mesh.restPositionsInvMass, i),
    ) as unknown as TrianglePositions;
    const after = ids.map((i) => point(initial, i)) as unknown as TrianglePositions;
    const placement = placements.find((p) => p.pieceId === ranges[vertexPieces[ids[0]]].pieceId)!;
    const expectedNormal = rotate(
      placement.rotationRowMajor,
      cross(subtract(before[1], before[0]), subtract(before[2], before[0])),
    );
    const actualNormal = cross(subtract(after[1], after[0]), subtract(after[2], after[0]));
    const oriented = expectedNormal.reduce((sum, v, k) => sum + v * actualNormal[k], 0);
    if (!Number.isFinite(oriented) || oriented <= 0)
      fail('degenerate-placement', 'Float32 placement collapsed or reversed an authored triangle.');
    const frame = {
      ...decodeTriangleRestFrameGpuV1(local.material.triangleRestFrames, t),
      warpDirectionRest: [1, 0] as const,
      weftDirectionRest: [0, 1] as const,
    };
    const a = evaluateTriangleStrain(before, frame),
      b = evaluateTriangleStrain(after, frame);
    for (const key of ['warp', 'weft', 'shear'] as const) {
      if (!Number.isFinite(a[key]) || !Number.isFinite(b[key]))
        fail('non-finite-placement', 'Material strain diagnostics are not finite.');
      maximumAbsoluteLocalGreenStrain = Math.max(maximumAbsoluteLocalGreenStrain, Math.abs(a[key]));
      maximumAbsolutePlacedGreenStrain = Math.max(
        maximumAbsolutePlacedGreenStrain,
        Math.abs(b[key]),
      );
      maximumGreenStrainDelta = Math.max(maximumGreenStrainDelta, Math.abs(a[key] - b[key]));
    }
  }
  const simulation: SimulationPackageV5 = {
    ...clone(local),
    restBoundsM: { minX: min[0], maxX: max[0], minY: min[1], maxY: max[1] },
  };
  // Historical V5 naming: XYZ is initial geometry; material rest lives in the unchanged
  // distance/bend/material/continuum buffers. W remains the original unit/support marker;
  // physical inverse masses remain separately in material.particleMassRecords.
  (simulation.mesh as { restPositionsInvMass: Float32Array }).restPositionsInvMass = initial;
  const invariant = {
    ...simulation,
    restBoundsM: local.restBoundsM,
    mesh: { ...simulation.mesh, restPositionsInvMass: local.mesh.restPositionsInvMass },
  };
  if (!equal(invariant, local))
    fail('rest-invariant-failed', 'Only initial XYZ and legacy XY bounds may change.');
  const localBits = new Uint32Array(
    local.mesh.restPositionsInvMass.buffer,
    local.mesh.restPositionsInvMass.byteOffset,
    local.mesh.restPositionsInvMass.length,
  );
  const placedBits = new Uint32Array(initial.buffer);
  for (let i = 3; i < placedBits.length; i += 4)
    if (placedBits[i] !== localBits[i])
      fail('mass-invariant-failed', 'Initial W must remain byte-exact.');
  return {
    simulation,
    worldBoundsM: { min, max },
    metrics: {
      maximumEdgeLengthDeltaM,
      maximumDistanceRestResidualM,
      maximumAbsoluteLocalGreenStrain,
      maximumAbsolutePlacedGreenStrain,
      maximumGreenStrainDelta,
    },
  };
}

export async function buildDxfGarmentAssemblyExplicitPlacementStageV1(
  input: unknown,
  signal?: AbortSignal,
) {
  let stage = 'capture';
  try {
    check(signal);
    const request = capture(input) as DxfGarmentAssemblyExplicitPlacementStageRequestV1;
    if (
      !request ||
      !exactKeys(request, [
        'schemaVersion',
        'sourceRequest',
        'sourceArtifact',
        'expectedSourceInputSha256',
        'placements',
      ]) ||
      request.schemaVersion !== DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1 ||
      typeof request.expectedSourceInputSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(request.expectedSourceInputSha256) ||
      !Array.isArray(request.placements)
    )
      fail('invalid-input', 'Exact versioned placement fields and source SHA are required.');
    stage = 'source-replay';
    const replay = await compileDxfGarmentAssemblyMaterialStageV1(request.sourceRequest, signal);
    check(signal);
    if (!replay.compiled) fail('source-compile-blocked', JSON.stringify(replay.blockers));
    if (
      replay.artifact.sourceEvidence.inputSha256 !== request.expectedSourceInputSha256 ||
      !equal(request.sourceArtifact, replay.artifact)
    )
      fail(
        'source-artifact-mismatch',
        'Supplied compile artifact differs from an independent exact source replay.',
      );
    stage = 'placement';
    const placed = place(replay.artifact, request.placements);
    stage = 'validation';
    const validationErrors = validateSimulationPackageV5(placed.simulation);
    const sealed = await sealSimulationPackageV5V1(placed.simulation);
    check(signal);
    const reportPayload = {
      schemaVersion: DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
      sourceInputSha256: request.expectedSourceInputSha256,
      localPackageSha256: await digest(
        'explicit-placement-local-v5/1',
        replay.artifact.compiledSimulation,
      ),
      sourceAssemblyFingerprint:
        replay.artifact.compiledSimulation.manifest.sourceAssemblyFingerprint,
      refinementFingerprint: replay.artifact.refinement.deterministicFingerprint,
      placements: request.placements,
      rotationTolerance: ROTATION_TOLERANCE,
      worldBoundsM: placed.worldBoundsM,
      metrics: placed.metrics,
      validationErrors,
      placedPackageSha256: sealed.ok ? sealed.artifact.seal.aggregateSha256 : null,
      claims: CLAIMS,
    };
    check(signal);
    const report = {
      ...reportPayload,
      reportSha256: await digest(DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1, reportPayload),
    };
    check(signal);
    const artifact = {
      localSourceArtifact: replay.artifact,
      placedSimulation: placed.simulation,
      sealedSimulation: sealed.ok ? sealed.artifact : null,
      report,
    };
    if (!sealed.ok)
      return freeze({
        ok: false as const,
        placed: true as const,
        sealed: false as const,
        artifact,
        blockers: [{ stage, code: `package-${sealed.code}`, detail: sealed.errors.join('; ') }],
      });
    if (validationErrors.length)
      fail('package-validation-mismatch', 'Validator and sealer disagreed.');
    return freeze({
      ok: true as const,
      placed: true as const,
      sealed: true as const,
      artifact,
      blockers: [] as const,
    });
  } catch (error) {
    return freeze({
      ok: false as const,
      placed: false as const,
      sealed: false as const,
      artifact: null,
      blockers: [
        {
          stage,
          code: error instanceof PlacementBlocked ? error.code : 'placement-rejected',
          detail: error instanceof Error ? error.message : 'Placement rejected.',
        },
      ],
    });
  }
}
export type DxfGarmentAssemblyExplicitPlacementStageResultV1 = Awaited<
  ReturnType<typeof buildDxfGarmentAssemblyExplicitPlacementStageV1>
>;
