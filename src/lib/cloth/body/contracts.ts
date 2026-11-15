export type Vec3M = readonly [x: number, y: number, z: number];

export type StableBodyId = string;

export type BodyPoseKind = 'A' | 'T';

export interface BodyInput {
  readonly requestedPose?: BodyPoseKind;
  readonly sourceRevision?: string;
  readonly measurementsMm?: Readonly<Record<string, number>>;
}

export interface AxisAlignedBoundingBoxM {
  readonly min: Vec3M;
  readonly max: Vec3M;
}

export interface BodyLandmark {
  readonly id: StableBodyId;
  readonly positionM: Vec3M;
}

export interface LandmarkSet {
  readonly revision: string;
  readonly landmarks: readonly BodyLandmark[];
}

export interface PoseDescriptor {
  readonly kind: BodyPoseKind;
  /** Changes whenever the landmark or collider interpretation of this pose changes. */
  readonly revision: string;
  readonly coordinateSystem: {
    readonly handedness: 'right';
    readonly up: '+Y';
    readonly front: '+Z';
    readonly subjectLeft: '+X';
    readonly origin: 'ground-projection-between-ankles';
  };
  /** Angle below the horizontal shoulder line. T pose is zero. */
  readonly armDownAngleDeg: number;
}

export interface CapsuleCollider {
  readonly id: StableBodyId;
  readonly kind: 'capsule';
  readonly aM: Vec3M;
  readonly bM: Vec3M;
  readonly radiusM: number;
}

export interface SphereCollider {
  readonly id: StableBodyId;
  readonly kind: 'sphere';
  readonly centerM: Vec3M;
  readonly radiusM: number;
}

export interface CollisionLod {
  readonly id: StableBodyId;
  /** Zero is the cheapest representation; increasing levels add detail. */
  readonly level: number;
  readonly maxSurfaceDeviationM: number;
  readonly capsules: readonly CapsuleCollider[];
  readonly spheres: readonly SphereCollider[];
}

export interface WatertightMeshData {
  readonly id: StableBodyId;
  readonly revision: string;
  readonly positionsM: Float32Array;
  readonly triangles: Uint32Array;
}

export interface DisplayMeshData {
  readonly id: StableBodyId;
  readonly revision: string;
  readonly positionsM: Float32Array;
  readonly triangles: Uint32Array;
}

export interface ProvenanceSource {
  readonly id: StableBodyId;
  readonly kind: 'generated' | 'measurement-record' | 'external';
  readonly source: string;
  readonly licenseId: string;
  readonly commercialUse: 'cleared' | 'blocked';
  readonly redistribution: 'cleared' | 'blocked';
  /** Required for external bytes; generated analytical geometry has no source blob. */
  readonly sha256?: string;
  readonly attribution?: string;
}

export interface ProvenanceManifest {
  /** `estimated` means geometry accuracy is estimated, not that usage rights are unknown. */
  readonly status: 'cleared' | 'estimated' | 'blocked';
  readonly sources: readonly ProvenanceSource[];
}

export interface BodyArtifact {
  readonly id: StableBodyId;
  readonly revision: string;
  readonly units: 'm';
  readonly boundingBoxM: AxisAlignedBoundingBoxM;
  readonly landmarks: LandmarkSet;
  readonly pose: PoseDescriptor;
  readonly collisionLods: readonly CollisionLod[];
  readonly defaultCollisionLodId: StableBodyId;
  readonly provenance: ProvenanceManifest;
  readonly displayMesh?: DisplayMeshData;
  readonly collisionMesh?: WatertightMeshData;
}

export interface BodyProvider {
  readonly id: StableBodyId;
  readonly revision: string;
  reconstruct(input?: BodyInput): Promise<BodyArtifact>;
}
