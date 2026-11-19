import {
  validateDxfExactAssemblyGraphV1,
  projectDxfExactAssemblyGraphCompileRequestV1,
  type DxfExactAssemblyGraphV1,
  type DxfExactAssemblyGraphAoSnapshotV1,
} from './dxf-exact-assembly-graph-v1';
import {
  buildDxfGarmentAssemblyExplicitPlacementStageV1,
  DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
  type DxfGarmentExplicitPiecePlacementV1,
  type DxfGarmentAssemblyExplicitPlacementStageRequestV1,
} from './dxf-garment-assembly-explicit-placement-stage-v1';
import {
  validateSavedModelObservedPlacementTargetV1,
  type SavedModelObservedPlacementTargetV1,
} from './saved-model-observed-placement-target-codec-v1';

/** Pure metadata contract, not a registered Composite component or persistence capability. */
export const DXF_GARMENT_PHYSICAL_INITIALIZATION_V1 =
  'dxf-garment-physical-initialization/1' as const;
export const DXF_EXACT_ASSEMBLY_GRAPH_FINGERPRINT_V1 =
  'dxf-exact-assembly-graph-fingerprint/1' as const;
export const DXF_GARMENT_PHYSICAL_INITIALIZATION_CONVENTION_V1 = Object.freeze({
  sourceUnits: 'mm',
  sourceScaleToMetres: 0.001,
  sourcePlane: 'XY',
  sourcePositiveNormal: '+Z',
  compiledUnits: 'm',
  transform: 'world=R*(sourceMetres-sourceOriginM)+translationM',
  worldUnits: 'm',
  worldCoordinateSystem: Object.freeze({
    handedness: 'right',
    up: '+Y',
    front: '+Z',
    subjectLeft: '+X',
    origin: 'ground-projection-between-ankles',
  }),
} as const);
export const DXF_GARMENT_PHYSICAL_INITIALIZATION_CLAIMS_V1 = Object.freeze({
  contentConsistencyOnly: true,
  sourcePersistenceAuthenticated: false,
  durableGraphVerified: false,
  physicalIntentUserAuthorizationAuthenticated: false,
  observedTargetAuthenticatesBody: false,
  bodyPlacementQualified: false,
  runtimeAuthority: false,
  presentationArrangementUsed: false,
} as const);
export type DxfGarmentPhysicalInitializationV1 = Readonly<{
  schemaVersion: typeof DXF_GARMENT_PHYSICAL_INITIALIZATION_V1;
  /** Domain-separated graph fingerprint, NOT a Composite component/outer byte digest. */
  graphCanonicalSha256: string;
  compileInputSha256: string;
  convention: typeof DXF_GARMENT_PHYSICAL_INITIALIZATION_CONVENTION_V1;
  placements: readonly DxfGarmentExplicitPiecePlacementV1[];
  observedTarget: Readonly<{
    target: SavedModelObservedPlacementTargetV1;
    canonicalSha256: string;
  }>;
  support: 'none';
  replayProfile: 'garment-material-contact-replay/1';
}>;
export type DxfGarmentPhysicalInitializationContextV1 = Readonly<{
  graph: DxfExactAssemblyGraphV1;
  assemblySnapshot: DxfExactAssemblyGraphAoSnapshotV1;
}>;
export type DxfGarmentPhysicalInitializationValidationRequestV1 =
  DxfGarmentPhysicalInitializationContextV1 &
    Readonly<{ document: DxfGarmentPhysicalInitializationV1 }>;
export type DxfGarmentPhysicalInitializationProjectionRequestV1 =
  DxfGarmentPhysicalInitializationValidationRequestV1 &
    Pick<DxfGarmentAssemblyExplicitPlacementStageRequestV1, 'sourceRequest' | 'sourceArtifact'>;

const MAX_DOCUMENT_BYTES = 256 * 1024;
const MAX_GRAPH_BYTES = 16 * 1024 * 1024;
const SHA = /^[0-9a-f]{64}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const abLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const tp = Object.getPrototypeOf(Float32Array.prototype);
const bufferOf = Object.getOwnPropertyDescriptor(tp, 'buffer')!.get!;
const offsetOf = Object.getOwnPropertyDescriptor(tp, 'byteOffset')!.get!;
const lengthOf = Object.getOwnPropertyDescriptor(tp, 'byteLength')!.get!;
export class DxfGarmentPhysicalInitializationErrorV1 extends Error {
  constructor(
    readonly code: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'DxfGarmentPhysicalInitializationErrorV1';
  }
}
function fail(code: string, detail: string): never {
  throw new DxfGarmentPhysicalInitializationErrorV1(code, detail);
}
function check(signal?: AbortSignal): void {
  if (signal !== undefined && aborted.call(signal))
    fail('cancelled', 'Physical initialization cancelled.');
}
function raw(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  const ab = Object.getPrototypeOf(value) === ArrayBuffer.prototype;
  const buffer = ab ? value : bufferOf.call(value);
  if (Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype)
    fail('invalid-data', 'Shared buffers are unsupported.');
  return new Uint8Array(
    buffer,
    ab ? 0 : offsetOf.call(value),
    ab ? abLength.call(value) : lengthOf.call(value),
  );
}
/** Bounded detached data before the first await. No callbacks, owners, getters or binary aliases. */
function capture<T>(value: T, binary = false): T {
  let nodes = 0,
    binaryBytes = 0,
    textBytes = 0;
  const active = new Set<object>();
  const copy = (v: unknown, depth: number): unknown => {
    if (++nodes > 3_000_000 || depth > 48) fail('bounds', 'Input tree exceeds its bound.');
    if (v === null || v === undefined || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      if (v.length > 65_536) fail('bounds', 'Input text exceeds its bound.');
      textBytes += encoder.encode(v).byteLength;
      if (textBytes > MAX_GRAPH_BYTES) fail('bounds', 'Input text exceeds its bound.');
      return v;
    }
    if (!v || typeof v !== 'object' || active.has(v))
      fail('invalid-data', 'Expected finite acyclic data.');
    const proto = Object.getPrototypeOf(v);
    if (
      binary &&
      [ArrayBuffer.prototype, Float32Array.prototype, Uint32Array.prototype].includes(proto)
    ) {
      const bytes = raw(v as ArrayBuffer);
      binaryBytes += bytes.byteLength;
      if (bytes.byteLength > 32 * 1024 * 1024 || binaryBytes > 128 * 1024 * 1024)
        fail('bounds', 'Binary input exceeds its bound.');
      const keys = Reflect.ownKeys(v);
      if (
        proto === ArrayBuffer.prototype
          ? keys.length !== 0
          : keys.length !== bytes.byteLength / 4 || keys.some((k, i) => k !== String(i))
      )
        fail('invalid-data', 'Decorated binary data is unsupported.');
      const out = Uint8Array.from(bytes).buffer;
      return proto === ArrayBuffer.prototype
        ? out
        : proto === Float32Array.prototype
          ? new Float32Array(out)
          : new Uint32Array(out);
    }
    const array = Array.isArray(v);
    if (proto !== (array ? Array.prototype : Object.prototype))
      fail('invalid-data', 'Expected plain own data.');
    const ds = Object.getOwnPropertyDescriptors(v);
    const keys = Reflect.ownKeys(ds);
    if (array && (ds.length.value > 500_000 || keys.length !== ds.length.value + 1))
      fail('bounds', 'Arrays must be dense and bounded.');
    active.add(v);
    const out: Record<string, unknown> | unknown[] = array ? [] : {};
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string') fail('invalid-data', 'Symbol fields are unsupported.');
      const d = ds[key];
      if (
        !('value' in d) ||
        !d.enumerable ||
        key === '__proto__' ||
        (array && !/^(0|[1-9][0-9]*)$/.test(key))
      )
        fail('invalid-data', 'Accessors, hidden fields and array extras are unsupported.');
      Object.defineProperty(out, key, { value: copy(d.value, depth + 1), enumerable: true });
    }
    active.delete(v);
    return out;
  };
  return copy(value, 0) as T;
}
function exact(value: unknown, keys: readonly string[]): void {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== keys.length ||
    keys.some((key) => {
      const d = Object.getOwnPropertyDescriptor(value, key);
      return !d || !('value' in d) || !d.enumerable;
    })
  )
    fail('invalid-shape', 'Fields differ from the exact physical initialization contract.');
}
/** Sorted object keys; array order is significant. Undefined object fields follow the graph codec. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.entries(v)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`)
      .join(',')}}`;
  return JSON.stringify(v);
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object' && !(v instanceof ArrayBuffer) && !ArrayBuffer.isView(v)) {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
async function digest(bytes: Uint8Array, signal?: AbortSignal): Promise<string> {
  check(signal);
  const result = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  check(signal);
  return Array.from(new Uint8Array(result), (v) => v.toString(16).padStart(2, '0')).join('');
}
function same(a: unknown, b: unknown): boolean {
  if (a instanceof ArrayBuffer || ArrayBuffer.isView(a)) {
    if (!b || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
    const x = raw(a),
      y = raw(b as ArrayBuffer);
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return Object.is(a, b);
  const x = Object.keys(a).sort(),
    y = Object.keys(b).sort();
  return (
    Array.isArray(a) === Array.isArray(b) &&
    x.length === y.length &&
    x.every(
      (k, i) =>
        k === y[i] && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    )
  );
}

/** The ONLY graph fingerprint rule exported for the container integration. Full AO validation is
 * required every time; the resulting identity proves content consistency, not a fresh server read. */
export async function fingerprintDxfExactAssemblyGraphV1(
  input: DxfGarmentPhysicalInitializationContextV1,
  signal?: AbortSignal,
) {
  check(signal);
  const checked = validateDxfExactAssemblyGraphV1(input);
  const canonicalJson = canonical(checked.graph);
  if (encoder.encode(canonicalJson).byteLength > MAX_GRAPH_BYTES)
    fail('bounds', 'Canonical graph is too large.');
  const canonicalSha256 = await digest(
    encoder.encode(`${DXF_EXACT_ASSEMBLY_GRAPH_FINGERPRINT_V1}\0${canonicalJson}`),
    signal,
  );
  check(signal);
  return freeze({
    graph: checked.graph,
    canonicalSha256,
    claims: DXF_GARMENT_PHYSICAL_INITIALIZATION_CLAIMS_V1,
  });
}
export function assertDxfGarmentExplicitRigidPlacementV1(
  p: DxfGarmentExplicitPiecePlacementV1,
): void {
  exact(p, ['pieceId', 'sourceOriginM', 'rotationRowMajor', 'translationM']);
  const vector = (v: readonly number[], n: number, bound: number) =>
    Array.isArray(v) &&
    v.length === n &&
    v.every(
      (x) =>
        typeof x === 'number' && Number.isFinite(x) && !Object.is(x, -0) && Math.abs(x) <= bound,
    );
  // Source handoff coordinate bound is 1e7 mm. The metadata permits the same 1e4 m extent;
  // the real placement replay independently rejects Float32 collapse or changed local metrics.
  if (
    typeof p.pieceId !== 'string' ||
    !p.pieceId ||
    !vector(p.sourceOriginM, 3, 10000) ||
    !vector(p.translationM, 3, 10000) ||
    !vector(p.rotationRowMajor, 9, 1 + 1e-12)
  )
    fail('invalid-placement', 'Finite bounded exact rigid placement fields are required.');
  const r = p.rotationRowMajor;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let dot = 0;
      for (let k = 0; k < 3; k++) dot += r[i * 3 + k] * r[j * 3 + k];
      if (Math.abs(dot - (i === j ? 1 : 0)) > 1e-12)
        fail('non-rigid-transform', 'Scale, shear and rotation normalization are unsupported.');
    }
  const det =
    r[0] * (r[4] * r[8] - r[5] * r[7]) -
    r[1] * (r[3] * r[8] - r[5] * r[6]) +
    r[2] * (r[3] * r[7] - r[4] * r[6]);
  if (Math.abs(det - 1) > 1e-12) fail('non-rigid-transform', 'Rotation must have determinant +1.');
}
async function validateCaptured(
  input: DxfGarmentPhysicalInitializationValidationRequestV1,
  signal?: AbortSignal,
) {
  const { document, graph, assemblySnapshot } = input;
  exact(document, [
    'schemaVersion',
    'graphCanonicalSha256',
    'compileInputSha256',
    'convention',
    'placements',
    'observedTarget',
    'support',
    'replayProfile',
  ]);
  if (
    document.schemaVersion !== DXF_GARMENT_PHYSICAL_INITIALIZATION_V1 ||
    document.support !== 'none' ||
    document.replayProfile !== 'garment-material-contact-replay/1' ||
    !same(document.convention, DXF_GARMENT_PHYSICAL_INITIALIZATION_CONVENTION_V1) ||
    typeof document.graphCanonicalSha256 !== 'string' ||
    !SHA.test(document.graphCanonicalSha256) ||
    typeof document.compileInputSha256 !== 'string' ||
    !SHA.test(document.compileInputSha256)
  )
    fail(
      'invalid-policy',
      'Exact initialization, units, support, profile and source identities are required.',
    );
  const identity = await fingerprintDxfExactAssemblyGraphV1({ graph, assemblySnapshot }, signal);
  check(signal);
  if (identity.canonicalSha256 !== document.graphCanonicalSha256)
    fail('graph-mismatch', 'Complete graph fingerprint differs.');
  if (
    !Array.isArray(document.placements) ||
    document.placements.length !== identity.graph.pieces.length ||
    document.placements.length > 64 ||
    new Set(document.placements.map((p) => p.pieceId)).size !== document.placements.length
  )
    fail('piece-coverage', 'One explicit placement per exact cutCount1 piece is required.');
  document.placements.forEach(assertDxfGarmentExplicitRigidPlacementV1);
  if (
    identity.graph.pieces.some(
      (p) => p.cutCount !== 1 || !document.placements.some((x) => x.pieceId === p.pieceId),
    )
  )
    fail('piece-coverage', 'Exact graph piece instances differ.');
  exact(document.observedTarget, ['target', 'canonicalSha256']);
  const target = await validateSavedModelObservedPlacementTargetV1(
    document.observedTarget.target,
    document.observedTarget.canonicalSha256,
    signal,
  );
  check(signal);
  if (!target.ok) fail('target-invalid', target.detail);
  // Strict metadata is not silently normalized by an upstream target compatibility codec.
  if (!same(target.target, document.observedTarget.target))
    fail('target-invalid', 'Exact current observed target metadata is required.');
  const bytes = encoder.encode(canonical(document));
  if (bytes.byteLength > MAX_DOCUMENT_BYTES)
    fail('bounds', 'Physical initialization exceeds its byte bound.');
  const canonicalSha256 = await digest(bytes, signal);
  check(signal);
  return freeze({
    document,
    canonicalSha256,
    claims: DXF_GARMENT_PHYSICAL_INITIALIZATION_CLAIMS_V1,
  });
}
export async function validateDxfGarmentPhysicalInitializationV1(
  input: DxfGarmentPhysicalInitializationValidationRequestV1,
  signal?: AbortSignal,
) {
  check(signal);
  const captured = capture(input);
  exact(captured, ['document', 'graph', 'assemblySnapshot']);
  const result = await validateCaptured(captured, signal);
  check(signal);
  return result;
}
export async function encodeDxfGarmentPhysicalInitializationV1(
  input: DxfGarmentPhysicalInitializationValidationRequestV1,
  signal?: AbortSignal,
) {
  const validated = await validateDxfGarmentPhysicalInitializationV1(input, signal);
  check(signal);
  return Object.freeze({ ...validated, bytes: encoder.encode(canonical(validated.document)) });
}
export async function decodeDxfGarmentPhysicalInitializationV1(
  input: DxfGarmentPhysicalInitializationContextV1 & Readonly<{ bytes: Uint8Array }>,
  signal?: AbortSignal,
) {
  check(signal);
  exact(input, ['bytes', 'graph', 'assemblySnapshot']);
  // Descriptor capture precedes even reading the byte array; do not invoke a caller accessor.
  const ds = Object.getOwnPropertyDescriptors(input);
  if (Object.values(ds).some((d) => !('value' in d) || !d.enumerable))
    fail('invalid-data', 'Decoder accessors are unsupported.');
  const value = ds.bytes.value;
  if (!value || Object.getPrototypeOf(value) !== Uint8Array.prototype)
    fail('invalid-data', 'Exact native Uint8Array required.');
  const source = raw(value);
  if (!source.byteLength || source.byteLength > MAX_DOCUMENT_BYTES)
    fail('bounds', 'Canonical bytes exceed bounds.');
  if (Reflect.ownKeys(value).length !== source.byteLength)
    fail('invalid-data', 'Decorated bytes are unsupported.');
  const bytes = Uint8Array.from(source);
  const context = capture<DxfGarmentPhysicalInitializationContextV1>({
    graph: ds.graph.value!,
    assemblySnapshot: ds.assemblySnapshot.value!,
  });
  const text = decoder.decode(bytes);
  const document = capture(JSON.parse(text)) as DxfGarmentPhysicalInitializationV1;
  // TextDecoder may remove a UTF8 BOM. Canonicality binds the original captured bytes,
  // not only the decoded string, so no alternate encoding can share a reported byte digest.
  const canonicalBytes = encoder.encode(canonical(document));
  if (
    canonicalBytes.byteLength !== bytes.byteLength ||
    canonicalBytes.some((v, i) => v !== bytes[i])
  )
    fail('noncanonical-bytes', 'Canonical UTF8 bytes are required exactly.');
  const result = await validateCaptured({ ...context, document }, signal);
  check(signal);
  return result;
}
/** Actual independent source and rigid placement replay; returns its blocked artifact unchanged.
 * No graph/body/session capability is accepted, exposed, or synthesized by this pure adapter. */
export async function projectDxfGarmentPhysicalInitializationV1(
  input: DxfGarmentPhysicalInitializationProjectionRequestV1,
  signal?: AbortSignal,
) {
  check(signal);
  const captured = capture(input, true);
  exact(captured, ['document', 'graph', 'assemblySnapshot', 'sourceRequest', 'sourceArtifact']);
  const validated = await validateCaptured(captured, signal);
  check(signal);
  const graphRequest = await projectDxfExactAssemblyGraphCompileRequestV1(
    {
      graph: captured.graph,
      assemblySnapshot: captured.assemblySnapshot,
      sourceHandoff: captured.sourceRequest.handoff,
      sourceSampling: captured.sourceRequest.samplingRequest,
    },
    signal,
  );
  check(signal);
  if (!same(graphRequest.request, captured.sourceRequest))
    fail(
      'source-request-mismatch',
      'Actual compile request differs from exact full graph projection.',
    );
  const simulation = captured.sourceArtifact.compiledSimulation;
  if (
    simulation.manifest.pinnedParticleCount !== 0 ||
    simulation.mesh.supportAttachments.mode !== 'none' ||
    captured.sourceArtifact.sourceEvidence.inputSha256 !== captured.document.compileInputSha256
  )
    fail('source-artifact-mismatch', 'Exact compile input and explicit none support are required.');
  const placementRequest: DxfGarmentAssemblyExplicitPlacementStageRequestV1 = freeze({
    schemaVersion: DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
    sourceRequest: captured.sourceRequest,
    sourceArtifact: captured.sourceArtifact,
    expectedSourceInputSha256: captured.document.compileInputSha256,
    placements: captured.document.placements,
  });
  const placementResult = await buildDxfGarmentAssemblyExplicitPlacementStageV1(
    placementRequest,
    signal,
  );
  check(signal);
  return freeze({ ...validated, placementRequest, placementResult });
}
export type DxfGarmentPhysicalInitializationProjectionResultV1 = Awaited<
  ReturnType<typeof projectDxfGarmentPhysicalInitializationV1>
>;
