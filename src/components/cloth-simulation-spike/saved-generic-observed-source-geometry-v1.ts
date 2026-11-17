import type {
  DxfPatternPieceV1,
  DxfBoundaryVertexV1,
} from 'lib/cloth/domain/dxf-assembly-handoff-v1';
import type { DxfExactAssemblyGraphV1 } from 'lib/cloth/domain/dxf-exact-assembly-graph-v1';
import type { ClothMeshPieceRange } from 'lib/cloth/mesh/cloth-mesh-ir';
import type { GarmentPhase2RefinedVertexProvenanceV1 } from 'lib/cloth/mesh/garment-phase2-interior-refinement-v1';

export const SAVED_GENERIC_OBSERVED_SOURCE_GEOMETRY_V1 =
  'saved-generic-observed-source-geometry/1' as const;
export const SAVED_GENERIC_OBSERVED_SOURCE_GEOMETRY_CONVENTION_V1 = Object.freeze({
  positionMm: 'native-handoff-document-xy-mm-f64',
  positionM: 'compiled-document-xy-metres-f32-z0',
  rounding: 'f32(f32(nativeMm)*0.001)',
  globalVertexIndex: 'ephemeral-compile-index-not-durable-identity',
} as const);
export type SavedGenericObservedSourceGeometryV1 = Readonly<{
  schemaVersion: typeof SAVED_GENERIC_OBSERVED_SOURCE_GEOMETRY_V1;
  convention: typeof SAVED_GENERIC_OBSERVED_SOURCE_GEOMETRY_CONVENTION_V1;
  pieces: readonly Readonly<{
    pieceId: string;
    pieceLineKey: string;
    contours: readonly Readonly<{
      contourId: string;
      vertices: readonly Readonly<{
        vertexId: string;
        positionMm: readonly [number, number];
        positionM: readonly [number, number, number];
        /** This index is never a durable corner identity or an authored default pivot. */
        globalVertexIndex: number;
      }>[];
    }>[];
  }>[];
  claims: Readonly<{
    exactNativeCornerIdentityJoined: true;
    compiledPositionsCopied: true;
    defaultPivotSelected: false;
    sourceAuthority: false;
    durableAuthority: false;
    runtimeAuthority: false;
  }>;
}>;
export type SavedGenericObservedSourceGeometryRequestV1 = Readonly<{
  handoffPieces: readonly DxfPatternPieceV1[];
  pieceBindings: DxfExactAssemblyGraphV1['pieces'];
  pieceRanges: readonly ClothMeshPieceRange[];
  vertexProvenance: readonly GarmentPhase2RefinedVertexProvenanceV1[];
  restPositions2Mm: Float32Array;
  restPositionsInvMass: Float32Array;
}>;
const MAX_VERTICES = 20_000;
const MAX_PIECES = 64;
function reject(detail: string): never {
  throw new TypeError('Source geometry: ' + detail);
}
function fields(value: unknown): Record<string, PropertyDescriptor> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    reject('Plain own data is required.');
  const ds = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(ds).some(
      (key) => typeof key !== 'string' || !ds[key].enumerable || !('value' in ds[key]),
    )
  )
    reject('Accessors, symbols and hidden properties are unsupported.');
  return ds;
}
function metadata<T>(value: T): T {
  let nodes = 0,
    chars = 0;
  const active = new Set<object>();
  function clone(v: unknown, depth: number): unknown {
    if (++nodes > 500_000 || depth > 24) reject('Metadata bounds exceeded.');
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      chars += v.length;
      if (v.length > 1024 || chars > 16 * 1024 * 1024) reject('Text bounds exceeded.');
      return v;
    }
    if (!v || typeof v !== 'object' || active.has(v)) reject('Finite acyclic metadata required.');
    const array = Array.isArray(v);
    if (Object.getPrototypeOf(v) !== (array ? Array.prototype : Object.prototype))
      reject('Opaque metadata refused.');
    const ds = Object.getOwnPropertyDescriptors(v);
    if (
      array &&
      (ds.length.value > MAX_VERTICES || Reflect.ownKeys(ds).length !== ds.length.value + 1)
    )
      reject('Dense bounded arrays required.');
    active.add(v);
    const result: Record<string, unknown> | unknown[] = array ? [] : {};
    for (const key of Reflect.ownKeys(ds)) {
      if (array && key === 'length') continue;
      if (
        typeof key !== 'string' ||
        key === '__proto__' ||
        !ds[key].enumerable ||
        !('value' in ds[key]) ||
        (array && !/^(0|[1-9][0-9]*)$/.test(key))
      )
        reject('Metadata getters/extras refused.');
      Object.defineProperty(result, key, {
        value: clone(ds[key].value, depth + 1),
        enumerable: true,
      });
    }
    active.delete(v);
    return result;
  }
  return clone(value, 0) as T;
}
const typedPrototype = Object.getPrototypeOf(Float32Array.prototype);
const typedLength = Object.getOwnPropertyDescriptor(typedPrototype, 'length')!.get!;
const typedBuffer = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer')!.get!;
function floats(value: unknown, maxLength: number): Float32Array {
  // Native accessors brand-check without invoking caller getters/iterators/species.
  const length = typedLength.call(value) as number;
  const buffer = typedBuffer.call(value) as ArrayBuffer;
  if (
    Object.getPrototypeOf(value) !== Float32Array.prototype ||
    Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype ||
    length < 1 ||
    length > maxLength
  )
    reject('Bounded nonshared Float32 buffers required.');
  const copy = new Float32Array(length);
  Float32Array.prototype.set.call(copy, value as Float32Array);
  for (const n of copy) if (!Number.isFinite(n)) reject('Nonfinite compiled coordinates refused.');
  return copy;
}
const id = (s: unknown): string => {
  if (typeof s !== 'string' || !s.length || s.length > 1024) reject('Exact nonempty ID required.');
  return s;
};
const integer = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
const key = (pieceId: string, contourId: string, vertexId: string) =>
  JSON.stringify([pieceId, contourId, vertexId]);

/** Content-only deterministic projection. Genuine source authentication belongs to the fixed
 * host dispatcher. Native IDs select the corner; coordinates only verify that exact selection. */
export function projectSavedGenericObservedSourceGeometryV1(
  input: SavedGenericObservedSourceGeometryRequestV1,
): SavedGenericObservedSourceGeometryV1 {
  const ds = fields(input);
  const keys = [
    'handoffPieces',
    'pieceBindings',
    'pieceRanges',
    'vertexProvenance',
    'restPositions2Mm',
    'restPositionsInvMass',
  ];
  if (Object.keys(ds).length !== keys.length || keys.some((k) => !ds[k]))
    reject('Exact request required.');
  const mm = floats(ds.restPositions2Mm.value, MAX_VERTICES * 2);
  const physical = floats(ds.restPositionsInvMass.value, MAX_VERTICES * 4);
  const captured = metadata({
    handoffPieces: ds.handoffPieces.value,
    pieceBindings: ds.pieceBindings.value,
    pieceRanges: ds.pieceRanges.value,
    vertexProvenance: ds.vertexProvenance.value,
  }) as Pick<
    SavedGenericObservedSourceGeometryRequestV1,
    'handoffPieces' | 'pieceBindings' | 'pieceRanges' | 'vertexProvenance'
  >;
  const { handoffPieces, pieceBindings, pieceRanges, vertexProvenance } = captured;
  if (
    ![handoffPieces, pieceBindings, pieceRanges, vertexProvenance].every(Array.isArray) ||
    !handoffPieces.length ||
    handoffPieces.length > MAX_PIECES ||
    pieceBindings.length !== handoffPieces.length ||
    pieceRanges.length !== handoffPieces.length ||
    mm.length % 2 ||
    physical.length !== mm.length * 2 ||
    vertexProvenance.length !== mm.length / 2
  )
    reject('Piece/vertex extents differ.');
  const count = mm.length / 2;
  for (let i = 0; i < count; i++) {
    if (
      !Object.is(physical[i * 4], Math.fround(mm[i * 2] * 0.001)) ||
      !Object.is(physical[i * 4 + 1], Math.fround(mm[i * 2 + 1] * 0.001)) ||
      physical[i * 4 + 2] !== 0 ||
      physical[i * 4 + 3] < 0
    )
      reject('Compiled document XY conversion drifted.');
  }
  const bindings = new Map<string, string>(),
    lines = new Set<string>();
  for (const b of pieceBindings) {
    id(b.pieceId);
    id(b.pieceLineKey);
    if (bindings.has(b.pieceId) || lines.has(b.pieceLineKey) || b.cutCount !== 1)
      reject('Ambiguous piece binding or unsupported cut count.');
    bindings.set(b.pieceId, b.pieceLineKey);
    lines.add(b.pieceLineKey);
  }
  const ranges = new Map<string, ClothMeshPieceRange>(),
    occupied = new Uint8Array(count);
  for (const r of pieceRanges) {
    id(r.pieceId);
    if (
      ranges.has(r.pieceId) ||
      !bindings.has(r.pieceId) ||
      !integer(r.vertexOffset) ||
      !integer(r.vertexCount) ||
      r.vertexCount < 1 ||
      r.vertexOffset + r.vertexCount > count
    )
      reject('Piece range is missing, ambiguous or out of bounds.');
    ranges.set(r.pieceId, r);
    for (let i = r.vertexOffset; i < r.vertexOffset + r.vertexCount; i++) {
      if (occupied[i]) reject('Overlapping piece ranges.');
      occupied[i] = 1;
    }
  }
  if (occupied.some((x) => x !== 1)) reject('Piece ranges do not cover the compile.');
  const native = new Map<
    string,
    {
      globalVertexIndex: number;
      source: Extract<
        GarmentPhase2RefinedVertexProvenanceV1['source'],
        { kind: 'boundary-recovery' }
      >;
    }
  >();
  const indices = new Set<number>();
  for (const v of vertexProvenance) {
    const range = ranges.get(v.pieceId);
    if (
      !range ||
      !integer(v.globalVertexIndex) ||
      !integer(v.localVertexIndex) ||
      v.localVertexIndex >= range.vertexCount ||
      v.globalVertexIndex !== range.vertexOffset + v.localVertexIndex ||
      indices.has(v.globalVertexIndex)
    )
      reject('Provenance index/piece is missing or ambiguous.');
    indices.add(v.globalVertexIndex);
    if (v.source.kind === 'interior') continue;
    if (v.source.kind !== 'boundary-recovery') reject('Unsupported vertex lineage.');
    const recovery = v.source.boundaryRecoverySource;
    if (recovery.kind === 'recovered-boundary-sample') continue;
    if (recovery.kind !== 'phase2-boundary') reject('Unsupported boundary lineage.');
    if (
      recovery.phase2Source.kind === 'boundary-sample' ||
      recovery.phase2Source.kind === 'interior'
    )
      continue;
    if (recovery.phase2Source.kind !== 'boundary') reject('Unsupported phase2 lineage.');
    const corner = recovery.phase2Source;
    const k = key(v.pieceId, id(corner.provenance.contourId), id(corner.boundaryVertexId));
    if (native.has(k) || v.source.boundaryVertexId !== corner.boundaryVertexId)
      reject('Duplicate/drifted native corner provenance.');
    native.set(k, { globalVertexIndex: v.globalVertexIndex, source: v.source });
  }
  const used = new Set<string>(),
    pieceIds = new Set<string>();
  const pieces = handoffPieces.map((piece) => {
    id(piece.id);
    if (
      pieceIds.has(piece.id) ||
      !bindings.has(piece.id) ||
      piece.cutCount !== 1 ||
      !Array.isArray(piece.contours) ||
      !piece.contours.length ||
      piece.contours.length > 64
    )
      reject('Handoff piece binding/contours invalid.');
    pieceIds.add(piece.id);
    const contourIds = new Set<string>();
    const contours = piece.contours.map((contour) => {
      id(contour.id);
      if (
        contourIds.has(contour.id) ||
        !Array.isArray(contour.vertices) ||
        contour.vertices.length < 3 ||
        contour.vertices.length > MAX_VERTICES
      )
        reject('Handoff contour missing or duplicated.');
      contourIds.add(contour.id);
      const vertices = contour.vertices.map((vertex: DxfBoundaryVertexV1) => {
        const k = key(piece.id, contour.id, id(vertex.id)),
          matched = native.get(k);
        if (!matched || used.has(k)) reject('Exact native corner missing or duplicated.');
        used.add(k);
        const source = matched.source.boundaryRecoverySource;
        if (source.kind !== 'phase2-boundary' || source.phase2Source.kind !== 'boundary')
          reject('Native corner lineage lost.');
        const provenance = source.phase2Source.provenance;
        if (
          provenance.sourceCurveId !== vertex.source.sourceCurveId ||
          provenance.sourceCurveParameterSpace !== vertex.source.parameterSpace ||
          !Object.is(provenance.sourceCurveT, vertex.source.sourceCurveT) ||
          !Object.is(provenance.normalizedArc, vertex.source.normalizedArc)
        )
          reject('Exact native curve provenance drifted.');
        const n = matched.globalVertexIndex;
        if (
          !Array.isArray(vertex.positionMm) ||
          vertex.positionMm.length !== 2 ||
          !vertex.positionMm.every(Number.isFinite) ||
          !Object.is(mm[n * 2], Math.fround(vertex.positionMm[0])) ||
          !Object.is(mm[n * 2 + 1], Math.fround(vertex.positionMm[1]))
        )
          reject('Exact native corner coordinate drifted.');
        return {
          vertexId: vertex.id,
          positionMm: [vertex.positionMm[0], vertex.positionMm[1]] as const,
          positionM: [physical[n * 4], physical[n * 4 + 1], physical[n * 4 + 2]] as const,
          globalVertexIndex: n,
        };
      });
      return { contourId: contour.id, vertices };
    });
    return { pieceId: piece.id, pieceLineKey: bindings.get(piece.id)!, contours };
  });
  if (used.size !== native.size) reject('Unmatched native provenance remains.');
  return {
    schemaVersion: SAVED_GENERIC_OBSERVED_SOURCE_GEOMETRY_V1,
    convention: { ...SAVED_GENERIC_OBSERVED_SOURCE_GEOMETRY_CONVENTION_V1 },
    pieces,
    claims: {
      exactNativeCornerIdentityJoined: true,
      compiledPositionsCopied: true,
      defaultPivotSelected: false,
      sourceAuthority: false,
      durableAuthority: false,
      runtimeAuthority: false,
    },
  };
}
