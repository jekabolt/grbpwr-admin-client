import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { updateMeasurementSurfaceLivePositionsV1 } from './measurement-surface-live-positions-v1';

describe('measurement surface live positions v1', () => {
  it('updates one retained position buffer and refreshes geometry bounds', () => {
    const geometry = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3);
    geometry.setAttribute('position', attribute);
    geometry.setIndex([0, 1, 2]);
    geometry.computeVertexNormals();
    const originalAttribute = geometry.getAttribute('position');

    expect(
      updateMeasurementSurfaceLivePositionsV1({
        geometry,
        positions: new Float32Array([0, 0, 0, 2, 0, 0, 0, 3, 0]),
        updateNormals: true,
      }),
    ).toEqual({ status: 'updated', vertexCount: 3 });
    expect(geometry.getAttribute('position')).toBe(originalAttribute);
    expect(Array.from(attribute.array)).toEqual([0, 0, 0, 2, 0, 0, 0, 3, 0]);
    expect(geometry.boundingBox?.max.toArray()).toEqual([2, 3, 0]);
    expect(geometry.boundingSphere?.radius).toBeGreaterThan(1);
  });

  it('rejects a topology mismatch without mutating the retained buffer', () => {
    const geometry = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0]), 3);
    geometry.setAttribute('position', attribute);
    const before = Array.from(attribute.array);

    expect(
      updateMeasurementSurfaceLivePositionsV1({
        geometry,
        positions: new Float32Array([0, 0, 0]),
        updateNormals: false,
      }),
    ).toEqual({
      status: 'rejected',
      reason: 'Live positions do not match the retained finite topology.',
    });
    expect(Array.from(attribute.array)).toEqual(before);
  });
});
