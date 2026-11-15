import type {
  AxisAlignedBoundingBoxM,
  BodyArtifact,
  CapsuleCollider,
  CollisionLod,
  DisplayMeshData,
  PoseDescriptor,
  ProvenanceManifest,
  SphereCollider,
  Vec3M,
} from './contracts';
import { assertValidBodyArtifact } from './validation';

export const ANALYTICAL_DISPLAY_MESH_V1 = 'analytical-display-mesh/v1' as const;
export const ANALYTICAL_DISPLAY_TESSELLATION_V1 = 'analytical-display-tessellation/v1' as const;

export type AnalyticalDisplayTessellationPolicyV1 = {
  readonly version: typeof ANALYTICAL_DISPLAY_TESSELLATION_V1;
  readonly sourceId: string;
  readonly radialSegments: number;
  readonly hemisphereSegments: number;
  readonly maxVertices: number;
  readonly maxTriangles: number;
};

export const DEFAULT_ANALYTICAL_DISPLAY_TESSELLATION_V1: AnalyticalDisplayTessellationPolicyV1 =
  Object.freeze({
    version: ANALYTICAL_DISPLAY_TESSELLATION_V1,
    sourceId: 'analytical-display:beta-v1',
    radialSegments: 16,
    hemisphereSegments: 6,
    maxVertices: 100_000,
    maxTriangles: 200_000,
  });

export type AnalyticalDisplayPrimitiveRangeV1 = {
  readonly primitiveId: string;
  readonly kind: 'capsule' | 'sphere';
  readonly vertexOffset: number;
  readonly vertexCount: number;
  readonly triangleOffset: number;
  readonly triangleCount: number;
};

export type AnalyticalDisplayMeshArtifactV1 = {
  readonly version: typeof ANALYTICAL_DISPLAY_MESH_V1;
  readonly id: string;
  readonly revision: string;
  readonly units: 'm';
  /** Overlapping segmented display proxy; explicitly not a watertight collision surface. */
  readonly topology: 'overlapping-analytical-segments';
  readonly mesh: DisplayMeshData;
  readonly boundingBoxM: AxisAlignedBoundingBoxM;
  readonly provenance: ProvenanceManifest;
  readonly binding: {
    readonly bodyId: string;
    readonly bodyRevision: string;
    readonly poseKind: BodyArtifact['pose']['kind'];
    readonly poseRevision: string;
    readonly coordinateSystem: PoseDescriptor['coordinateSystem'];
    readonly displayLodId: string;
    readonly displayLodLevel: number;
    readonly tessellationVersion: typeof ANALYTICAL_DISPLAY_TESSELLATION_V1;
    readonly tessellationSourceId: string;
    readonly provenanceStatus: ProvenanceManifest['status'];
    readonly provenanceFingerprint: string;
    readonly provenanceSourceIds: readonly string[];
  };
  readonly tessellation: AnalyticalDisplayTessellationPolicyV1;
  readonly primitiveRanges: readonly AnalyticalDisplayPrimitiveRangeV1[];
};

export type BodyWithAnalyticalDisplayMeshV1 = {
  readonly bodyArtifact: BodyArtifact;
  readonly displayArtifact: AnalyticalDisplayMeshArtifactV1;
};

type MutableMesh = {
  readonly positions: number[];
  readonly triangles: number[];
};

const ID = /^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/;

function stableId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new Error(label + ' must be a stable lowercase ID.');
  }
}

function finiteVec3(value: Vec3M): boolean {
  return value.length === 3 && value.every(Number.isFinite);
}

function add(a: Vec3M, b: Vec3M): Vec3M {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: Vec3M, b: Vec3M): Vec3M {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(value: Vec3M, factor: number): Vec3M {
  return [value[0] * factor, value[1] * factor, value[2] * factor];
}

function dot(a: Vec3M, b: Vec3M): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3M, b: Vec3M): Vec3M {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function length(value: Vec3M): number {
  return Math.hypot(...value);
}

function normalize(value: Vec3M, label: string): Vec3M {
  const magnitude = length(value);
  if (!Number.isFinite(magnitude) || magnitude <= 1e-12) {
    throw new RangeError(label + ' must have finite non-zero length.');
  }
  return scale(value, 1 / magnitude);
}

function deterministicPerpendicular(axis: Vec3M): Vec3M {
  const reference: Vec3M =
    Math.abs(axis[0]) <= Math.abs(axis[1]) && Math.abs(axis[0]) <= Math.abs(axis[2])
      ? [1, 0, 0]
      : Math.abs(axis[1]) <= Math.abs(axis[2])
        ? [0, 1, 0]
        : [0, 0, 1];
  return normalize(cross(axis, reference), 'Analytical display perpendicular');
}

function validatePolicy(policy: AnalyticalDisplayTessellationPolicyV1): void {
  if (policy.version !== ANALYTICAL_DISPLAY_TESSELLATION_V1) {
    throw new Error('Unsupported analytical display tessellation version.');
  }
  stableId(policy.sourceId, 'Analytical display tessellation sourceId');
  if (
    !Number.isSafeInteger(policy.radialSegments) ||
    policy.radialSegments < 8 ||
    policy.radialSegments > 128
  ) {
    throw new RangeError('radialSegments must be a safe integer within 8..128.');
  }
  if (
    !Number.isSafeInteger(policy.hemisphereSegments) ||
    policy.hemisphereSegments < 2 ||
    policy.hemisphereSegments > 64
  ) {
    throw new RangeError('hemisphereSegments must be a safe integer within 2..64.');
  }
  for (const [name, value, maximum] of [
    ['maxVertices', policy.maxVertices, 2_000_000],
    ['maxTriangles', policy.maxTriangles, 4_000_000],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
      throw new RangeError(name + ' must be a positive bounded safe integer.');
    }
  }
}

function pointAt(positions: ArrayLike<number>, index: number): Vec3M {
  return [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
}

function pushPoint(mesh: MutableMesh, point: Vec3M): number {
  if (!finiteVec3(point)) throw new RangeError('Analytical display generated a non-finite point.');
  const index = mesh.positions.length / 3;
  mesh.positions.push(point[0], point[1], point[2]);
  return index;
}

function closestAxisPoint(point: Vec3M, capsule: CapsuleCollider): Vec3M {
  const axis = subtract(capsule.bM, capsule.aM);
  const lengthSq = dot(axis, axis);
  const t = Math.max(0, Math.min(1, dot(subtract(point, capsule.aM), axis) / lengthSq));
  return add(capsule.aM, scale(axis, t));
}

function orientTriangleOutward(
  mesh: MutableMesh,
  triangleOffset: number,
  primitive: CapsuleCollider | SphereCollider,
): void {
  const aIndex = mesh.triangles[triangleOffset];
  const bIndex = mesh.triangles[triangleOffset + 1];
  const cIndex = mesh.triangles[triangleOffset + 2];
  const a = pointAt(mesh.positions, aIndex);
  const b = pointAt(mesh.positions, bIndex);
  const c = pointAt(mesh.positions, cIndex);
  const normal = cross(subtract(b, a), subtract(c, a));
  const centroid: Vec3M = [
    (a[0] + b[0] + c[0]) / 3,
    (a[1] + b[1] + c[1]) / 3,
    (a[2] + b[2] + c[2]) / 3,
  ];
  const origin =
    primitive.kind === 'sphere' ? primitive.centerM : closestAxisPoint(centroid, primitive);
  const outward = subtract(centroid, origin);
  const orientation = dot(normal, outward);
  if (!Number.isFinite(orientation) || Math.abs(orientation) <= 1e-16) {
    throw new Error('Analytical display generated a degenerate triangle.');
  }
  if (orientation < 0) {
    mesh.triangles[triangleOffset + 1] = cIndex;
    mesh.triangles[triangleOffset + 2] = bIndex;
  }
}

function pushTriangle(
  mesh: MutableMesh,
  primitive: CapsuleCollider | SphereCollider,
  a: number,
  b: number,
  c: number,
): void {
  if (a === b || b === c || c === a) {
    throw new Error('Analytical display triangle indices must be distinct.');
  }
  const offset = mesh.triangles.length;
  mesh.triangles.push(a, b, c);
  orientTriangleOutward(mesh, offset, primitive);
}

function connectPoleToRing(
  mesh: MutableMesh,
  primitive: CapsuleCollider | SphereCollider,
  pole: number,
  ring: readonly number[],
): void {
  for (let segment = 0; segment < ring.length; segment += 1) {
    pushTriangle(mesh, primitive, pole, ring[segment], ring[(segment + 1) % ring.length]);
  }
}

function connectRings(
  mesh: MutableMesh,
  primitive: CapsuleCollider | SphereCollider,
  lower: readonly number[],
  upper: readonly number[],
): void {
  for (let segment = 0; segment < lower.length; segment += 1) {
    const next = (segment + 1) % lower.length;
    pushTriangle(mesh, primitive, lower[segment], upper[segment], lower[next]);
    pushTriangle(mesh, primitive, lower[next], upper[segment], upper[next]);
  }
}

function addSphere(
  mesh: MutableMesh,
  sphere: SphereCollider,
  policy: AnalyticalDisplayTessellationPolicyV1,
): void {
  const radial = policy.radialSegments;
  const latitude = policy.hemisphereSegments * 2;
  const south = pushPoint(mesh, add(sphere.centerM, [0, -sphere.radiusM, 0]));
  const rings: number[][] = [];
  for (let ringIndex = 1; ringIndex < latitude; ringIndex += 1) {
    const phi = -Math.PI / 2 + (Math.PI * ringIndex) / latitude;
    const ringRadius = sphere.radiusM * Math.cos(phi);
    const y = sphere.radiusM * Math.sin(phi);
    const ring: number[] = [];
    for (let segment = 0; segment < radial; segment += 1) {
      const angle = (Math.PI * 2 * segment) / radial;
      ring.push(
        pushPoint(mesh, [
          sphere.centerM[0] + ringRadius * Math.cos(angle),
          sphere.centerM[1] + y,
          sphere.centerM[2] + ringRadius * Math.sin(angle),
        ]),
      );
    }
    rings.push(ring);
  }
  const north = pushPoint(mesh, add(sphere.centerM, [0, sphere.radiusM, 0]));
  connectPoleToRing(mesh, sphere, south, rings[0]);
  for (let index = 0; index < rings.length - 1; index += 1) {
    connectRings(mesh, sphere, rings[index], rings[index + 1]);
  }
  connectPoleToRing(mesh, sphere, north, rings[rings.length - 1]);
}

function addCapsule(
  mesh: MutableMesh,
  capsule: CapsuleCollider,
  policy: AnalyticalDisplayTessellationPolicyV1,
): void {
  const axis = subtract(capsule.bM, capsule.aM);
  const direction = normalize(axis, 'Analytical display capsule axis');
  const u = deterministicPerpendicular(direction);
  const v = normalize(cross(direction, u), 'Analytical display capsule basis');
  const radial = policy.radialSegments;
  const hemisphere = policy.hemisphereSegments;
  const bottomPole = pushPoint(mesh, add(capsule.aM, scale(direction, -capsule.radiusM)));
  const rings: number[][] = [];
  const appendRing = (center: Vec3M, ringRadius: number) => {
    const ring: number[] = [];
    for (let segment = 0; segment < radial; segment += 1) {
      const angle = (Math.PI * 2 * segment) / radial;
      ring.push(
        pushPoint(
          mesh,
          add(
            center,
            add(scale(u, ringRadius * Math.cos(angle)), scale(v, ringRadius * Math.sin(angle))),
          ),
        ),
      );
    }
    rings.push(ring);
  };
  for (let step = 1; step <= hemisphere; step += 1) {
    const phi = -Math.PI / 2 + ((Math.PI / 2) * step) / hemisphere;
    appendRing(
      add(capsule.aM, scale(direction, capsule.radiusM * Math.sin(phi))),
      capsule.radiusM * Math.cos(phi),
    );
  }
  appendRing(capsule.bM, capsule.radiusM);
  for (let step = 1; step < hemisphere; step += 1) {
    const phi = ((Math.PI / 2) * step) / hemisphere;
    appendRing(
      add(capsule.bM, scale(direction, capsule.radiusM * Math.sin(phi))),
      capsule.radiusM * Math.cos(phi),
    );
  }
  const topPole = pushPoint(mesh, add(capsule.bM, scale(direction, capsule.radiusM)));
  connectPoleToRing(mesh, capsule, bottomPole, rings[0]);
  for (let index = 0; index < rings.length - 1; index += 1) {
    connectRings(mesh, capsule, rings[index], rings[index + 1]);
  }
  connectPoleToRing(mesh, capsule, topPole, rings[rings.length - 1]);
}

function boundingBox(positions: Float32Array): AxisAlignedBoundingBoxM {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[offset + axis]);
      max[axis] = Math.max(max[axis], positions[offset + axis]);
    }
  }
  return { min: min as unknown as Vec3M, max: max as unknown as Vec3M };
}

function assertNondegenerateFloat32Triangles(
  positions: Float32Array,
  triangles: Uint32Array,
): void {
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = pointAt(positions, triangles[offset]);
    const b = pointAt(positions, triangles[offset + 1]);
    const c = pointAt(positions, triangles[offset + 2]);
    const normal = cross(subtract(b, a), subtract(c, a));
    const areaSquaredTimesFour = dot(normal, normal);
    if (!Number.isFinite(areaSquaredTimesFour) || areaSquaredTimesFour <= 0) {
      throw new Error('Analytical display generated a degenerate float32 triangle.');
    }
  }
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function provenanceFingerprint(provenance: ProvenanceManifest): string {
  const sources = [...provenance.sources].sort((left, right) => left.id.localeCompare(right.id));
  return 'fnv1a32-' + fnv1a32(JSON.stringify({ status: provenance.status, sources }));
}

function cloneProvenance(provenance: ProvenanceManifest): ProvenanceManifest {
  return {
    status: provenance.status,
    sources: provenance.sources.map((source) => ({ ...source })),
  };
}

function selectedLod(body: BodyArtifact, lodId: string | undefined): CollisionLod {
  const selectedId = lodId ?? body.defaultCollisionLodId;
  stableId(selectedId, 'Analytical display LOD id');
  const lod = body.collisionLods.find(({ id }) => id === selectedId);
  if (!lod) throw new Error('Analytical display references a missing body LOD.');
  return lod;
}

export function createAnalyticalDisplayMeshV1(
  body: BodyArtifact,
  options: {
    readonly lodId?: string;
    readonly tessellation?: AnalyticalDisplayTessellationPolicyV1;
  } = {},
): AnalyticalDisplayMeshArtifactV1 {
  assertValidBodyArtifact(body);
  const policy = options.tessellation ?? DEFAULT_ANALYTICAL_DISPLAY_TESSELLATION_V1;
  validatePolicy(policy);
  const lod = selectedLod(body, options.lodId);
  const mesh: MutableMesh = { positions: [], triangles: [] };
  const primitiveRanges: AnalyticalDisplayPrimitiveRangeV1[] = [];
  const primitives: readonly (CapsuleCollider | SphereCollider)[] = [
    ...lod.capsules,
    ...lod.spheres,
  ];
  for (const primitive of primitives) {
    const vertexOffset = mesh.positions.length / 3;
    const triangleOffset = mesh.triangles.length / 3;
    if (primitive.kind === 'capsule') addCapsule(mesh, primitive, policy);
    else addSphere(mesh, primitive, policy);
    primitiveRanges.push({
      primitiveId: primitive.id,
      kind: primitive.kind,
      vertexOffset,
      vertexCount: mesh.positions.length / 3 - vertexOffset,
      triangleOffset,
      triangleCount: mesh.triangles.length / 3 - triangleOffset,
    });
  }
  const vertexCount = mesh.positions.length / 3;
  const triangleCount = mesh.triangles.length / 3;
  if (vertexCount > policy.maxVertices || triangleCount > policy.maxTriangles) {
    throw new RangeError('Analytical display mesh exceeds its tessellation budgets.');
  }
  const positionsM = Float32Array.from(mesh.positions);
  const triangles = Uint32Array.from(mesh.triangles);
  if (
    positionsM.length === 0 ||
    positionsM.length % 3 !== 0 ||
    !positionsM.every(Number.isFinite) ||
    triangles.length === 0 ||
    triangles.length % 3 !== 0 ||
    triangles.some((index) => index >= vertexCount)
  ) {
    throw new Error('Analytical display mesh failed finite indexed-triangle validation.');
  }
  assertNondegenerateFloat32Triangles(positionsM, triangles);
  const fingerprint = provenanceFingerprint(body.provenance);
  const revision =
    'analytical-display-v1-' +
    fnv1a32(
      JSON.stringify({
        bodyId: body.id,
        bodyRevision: body.revision,
        poseKind: body.pose.kind,
        poseRevision: body.pose.revision,
        lodId: lod.id,
        policy,
        fingerprint,
      }),
    );
  const id = 'analytical-display-' + body.id + '-' + lod.id;
  const displayMesh: DisplayMeshData = {
    id,
    revision,
    positionsM,
    triangles,
  };
  return {
    version: ANALYTICAL_DISPLAY_MESH_V1,
    id,
    revision,
    units: 'm',
    topology: 'overlapping-analytical-segments',
    mesh: displayMesh,
    boundingBoxM: boundingBox(positionsM),
    provenance: cloneProvenance(body.provenance),
    binding: {
      bodyId: body.id,
      bodyRevision: body.revision,
      poseKind: body.pose.kind,
      poseRevision: body.pose.revision,
      coordinateSystem: { ...body.pose.coordinateSystem },
      displayLodId: lod.id,
      displayLodLevel: lod.level,
      tessellationVersion: ANALYTICAL_DISPLAY_TESSELLATION_V1,
      tessellationSourceId: policy.sourceId,
      provenanceStatus: body.provenance.status,
      provenanceFingerprint: fingerprint,
      provenanceSourceIds: body.provenance.sources.map(({ id: sourceId }) => sourceId).sort(),
    },
    tessellation: Object.freeze({ ...policy }),
    primitiveRanges,
  };
}

/** Opt-in wrapper; the input artifact and display buffers are never mutated or aliased. */
export function withAnalyticalDisplayMeshV1(
  body: BodyArtifact,
  options: Parameters<typeof createAnalyticalDisplayMeshV1>[1] = {},
): BodyWithAnalyticalDisplayMeshV1 {
  const displayArtifact = createAnalyticalDisplayMeshV1(body, options);
  const bodyArtifact: BodyArtifact = {
    ...body,
    displayMesh: {
      ...displayArtifact.mesh,
      positionsM: new Float32Array(displayArtifact.mesh.positionsM),
      triangles: new Uint32Array(displayArtifact.mesh.triangles),
    },
  };
  return { bodyArtifact, displayArtifact };
}
