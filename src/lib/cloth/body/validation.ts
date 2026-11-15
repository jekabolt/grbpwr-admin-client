import type {
  AxisAlignedBoundingBoxM,
  BodyArtifact,
  CollisionLod,
  ProvenanceManifest,
  Vec3M,
} from './contracts';

const STABLE_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SHA256 = /^[a-f0-9]{64}$/;

function finiteVec3(value: Vec3M): boolean {
  return value.length === 3 && value.every(Number.isFinite);
}

function contains(box: AxisAlignedBoundingBoxM, point: Vec3M, margin = 0): boolean {
  return point.every(
    (value, axis) => value - margin >= box.min[axis] && value + margin <= box.max[axis],
  );
}

function validateId(id: string, path: string, errors: string[]): void {
  if (!STABLE_ID.test(id)) errors.push(`${path} must be a stable lowercase id.`);
}

function validateProvenance(manifest: ProvenanceManifest, errors: string[]): void {
  if (manifest.status === 'blocked') {
    errors.push(
      'provenance.status must not be blocked before a body artifact can enter collision.',
    );
  }
  if (manifest.sources.length === 0) errors.push('provenance.sources must not be empty.');
  const ids = new Set<string>();
  manifest.sources.forEach((source, index) => {
    const path = `provenance.sources[${index}]`;
    validateId(source.id, `${path}.id`, errors);
    if (ids.has(source.id)) errors.push(`${path}.id is duplicated.`);
    ids.add(source.id);
    if (!source.source.trim()) errors.push(`${path}.source is required.`);
    if (!source.licenseId.trim()) errors.push(`${path}.licenseId is required.`);
    if (source.commercialUse !== 'cleared') errors.push(`${path}.commercialUse is not cleared.`);
    if (source.redistribution !== 'cleared') errors.push(`${path}.redistribution is not cleared.`);
    if (source.kind === 'external' && (!source.sha256 || !SHA256.test(source.sha256))) {
      errors.push(`${path}.sha256 is required for external assets.`);
    }
  });
}

function validateLod(
  lod: CollisionLod,
  box: AxisAlignedBoundingBoxM,
  colliderIds: Set<string>,
  errors: string[],
): void {
  validateId(lod.id, `collisionLod ${lod.id}`, errors);
  if (!Number.isInteger(lod.level) || lod.level < 0) {
    errors.push(`${lod.id}.level must be a non-negative integer.`);
  }
  if (!Number.isFinite(lod.maxSurfaceDeviationM) || lod.maxSurfaceDeviationM <= 0) {
    errors.push(`${lod.id}.maxSurfaceDeviationM must be finite and positive.`);
  }
  if (lod.capsules.length + lod.spheres.length === 0) {
    errors.push(`${lod.id} must contain at least one collider.`);
  }
  for (const capsule of lod.capsules) {
    validateId(capsule.id, `${lod.id} capsule id`, errors);
    if (colliderIds.has(capsule.id)) errors.push(`collider id ${capsule.id} is duplicated.`);
    colliderIds.add(capsule.id);
    if (!finiteVec3(capsule.aM) || !finiteVec3(capsule.bM)) {
      errors.push(`${capsule.id} endpoints must be finite.`);
    }
    if (!Number.isFinite(capsule.radiusM) || capsule.radiusM <= 0) {
      errors.push(`${capsule.id}.radiusM must be finite and positive.`);
    } else if (
      !contains(box, capsule.aM, capsule.radiusM) ||
      !contains(box, capsule.bM, capsule.radiusM)
    ) {
      errors.push(`${capsule.id} is outside boundingBoxM.`);
    }
  }
  for (const sphere of lod.spheres) {
    validateId(sphere.id, `${lod.id} sphere id`, errors);
    if (colliderIds.has(sphere.id)) errors.push(`collider id ${sphere.id} is duplicated.`);
    colliderIds.add(sphere.id);
    if (!finiteVec3(sphere.centerM)) errors.push(`${sphere.id}.centerM must be finite.`);
    if (!Number.isFinite(sphere.radiusM) || sphere.radiusM <= 0) {
      errors.push(`${sphere.id}.radiusM must be finite and positive.`);
    } else if (!contains(box, sphere.centerM, sphere.radiusM)) {
      errors.push(`${sphere.id} is outside boundingBoxM.`);
    }
  }
}

export function validateBodyArtifact(artifact: BodyArtifact): string[] {
  const errors: string[] = [];
  validateId(artifact.id, 'artifact.id', errors);
  if (!artifact.revision.trim()) errors.push('artifact.revision is required.');
  if (artifact.units !== 'm') errors.push('artifact.units must be m.');

  const box = artifact.boundingBoxM;
  if (!finiteVec3(box.min) || !finiteVec3(box.max)) {
    errors.push('boundingBoxM values must be finite.');
  } else if (box.min.some((value, axis) => value >= box.max[axis])) {
    errors.push('boundingBoxM must have positive extent on every axis.');
  }

  if (artifact.pose.kind !== 'A' && artifact.pose.kind !== 'T') {
    errors.push('pose.kind must be A or T.');
  }
  if (!artifact.pose.revision.trim()) errors.push('pose.revision is required.');
  const coordinates = artifact.pose.coordinateSystem;
  if (
    coordinates.handedness !== 'right' ||
    coordinates.up !== '+Y' ||
    coordinates.front !== '+Z' ||
    coordinates.subjectLeft !== '+X' ||
    coordinates.origin !== 'ground-projection-between-ankles'
  ) {
    errors.push('pose.coordinateSystem must match the body contract.');
  }
  if (!Number.isFinite(artifact.pose.armDownAngleDeg)) {
    errors.push('pose.armDownAngleDeg must be finite.');
  }
  if (artifact.pose.kind === 'T' && artifact.pose.armDownAngleDeg !== 0) {
    errors.push('T pose armDownAngleDeg must be zero.');
  }
  if (artifact.pose.kind === 'A' && artifact.pose.armDownAngleDeg <= 0) {
    errors.push('A pose armDownAngleDeg must be positive.');
  }

  if (!artifact.landmarks.revision.trim()) errors.push('landmarks.revision is required.');
  if (artifact.landmarks.landmarks.length === 0) errors.push('landmarks must not be empty.');
  const landmarkIds = new Set<string>();
  for (const landmark of artifact.landmarks.landmarks) {
    validateId(landmark.id, 'landmark id', errors);
    if (landmarkIds.has(landmark.id)) errors.push(`landmark id ${landmark.id} is duplicated.`);
    landmarkIds.add(landmark.id);
    if (!finiteVec3(landmark.positionM)) errors.push(`${landmark.id}.positionM must be finite.`);
    else if (finiteVec3(box.min) && finiteVec3(box.max) && !contains(box, landmark.positionM)) {
      errors.push(`${landmark.id} is outside boundingBoxM.`);
    }
  }

  if (artifact.collisionLods.length === 0) errors.push('collisionLods must not be empty.');
  const lodIds = new Set<string>();
  const lodLevels = new Set<number>();
  const colliderIds = new Set<string>();
  for (const lod of artifact.collisionLods) {
    if (lodIds.has(lod.id)) errors.push(`collision LOD id ${lod.id} is duplicated.`);
    if (lodLevels.has(lod.level)) errors.push(`collision LOD level ${lod.level} is duplicated.`);
    lodIds.add(lod.id);
    lodLevels.add(lod.level);
    validateLod(lod, box, colliderIds, errors);
  }
  if (!lodIds.has(artifact.defaultCollisionLodId)) {
    errors.push('defaultCollisionLodId must reference a collision LOD.');
  }

  validateProvenance(artifact.provenance, errors);
  return errors;
}

export function assertValidBodyArtifact(artifact: BodyArtifact): void {
  const errors = validateBodyArtifact(artifact);
  if (errors.length > 0) throw new Error(`BodyArtifact validation failed: ${errors.join(' ')}`);
}
