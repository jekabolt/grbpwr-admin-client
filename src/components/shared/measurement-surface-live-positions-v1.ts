import * as THREE from 'three';

export const MEASUREMENT_SURFACE_LIVE_POSITIONS_V1 =
  'measurement-surface-live-positions/v1' as const;

export type MeasurementSurfaceLivePositionUpdateV1 =
  | Readonly<{ status: 'updated'; vertexCount: number }>
  | Readonly<{ status: 'rejected'; reason: string }>;

/**
 * Updates the retained display geometry without replacing its BufferAttribute or WebGL context.
 * The caller owns render scheduling. Normals may be deferred during drag and refreshed on commit.
 */
export function updateMeasurementSurfaceLivePositionsV1(options: {
  readonly geometry: THREE.BufferGeometry;
  readonly positions: Float32Array;
  readonly updateNormals: boolean;
}): MeasurementSurfaceLivePositionUpdateV1 {
  const attribute = options.geometry.getAttribute('position');
  if (!(attribute instanceof THREE.BufferAttribute) || attribute.itemSize !== 3) {
    return Object.freeze({ status: 'rejected', reason: 'Position attribute is unavailable.' });
  }
  if (
    !(attribute.array instanceof Float32Array) ||
    !(options.positions instanceof Float32Array) ||
    options.positions.length !== attribute.array.length ||
    !options.positions.every(Number.isFinite)
  ) {
    return Object.freeze({
      status: 'rejected',
      reason: 'Live positions do not match the retained finite topology.',
    });
  }

  attribute.array.set(options.positions);
  attribute.needsUpdate = true;
  if (options.updateNormals) {
    options.geometry.computeVertexNormals();
    const normals = options.geometry.getAttribute('normal');
    if (normals instanceof THREE.BufferAttribute) normals.needsUpdate = true;
  }
  options.geometry.computeBoundingBox();
  options.geometry.computeBoundingSphere();
  return Object.freeze({ status: 'updated', vertexCount: attribute.count });
}
