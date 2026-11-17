import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry } from 'three';
import { createMeasurementBodyFrameV2 } from 'lib/cloth/body/measurement-body-frame-v2';
import { CANONICAL_MEASUREMENT_SIZE_RECORDS } from 'lib/cloth/body/measurement-body-synthetic-corpus';
import { updateMeasurementSurfaceLivePositionsV1 } from './measurement-surface-live-positions-v1';
import { measurementSurfaceAcceptedGeometryV1 } from './measurement-watertight-surface-v1-stage';

// Actual Three CPU buffers, without a browser renderer or viewport-admission claim.
function fixture() {
  const frame = createMeasurementBodyFrameV2({
    measurements: CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
    sourceRevision: 'stage-buffer-test',
  });
  const mesh = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
    vertexCount: 3,
    triangleCount: 1,
    byteLength: 48,
  };
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions.slice(), 3));
  geometry.setIndex(new BufferAttribute(mesh.indices.slice(), 1));
  return { frame, mesh, geometry };
}

describe('existing Stage accepted buffers', () => {
  it('captures installed geometry, then the actual accepted live update, with detached values', () => {
    const { frame, mesh, geometry } = fixture();
    try {
      const original = measurementSurfaceAcceptedGeometryV1(geometry, frame, mesh, mesh.positions)!;
      expect(original.frame).toBe(frame);
      expect(original.mesh).toBe(mesh);
      expect(original.sourcePositions).toBe(mesh.positions);
      expect(original.positions).not.toBe(geometry.getAttribute('position').array);
      expect(original.indices).not.toBe(geometry.getIndex()!.array);
      const posed = new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1]);
      expect(
        updateMeasurementSurfaceLivePositionsV1({ geometry, positions: posed, updateNormals: true })
          .status,
      ).not.toBe('rejected');
      expect(
        measurementSurfaceAcceptedGeometryV1(geometry, frame, mesh, mesh.positions),
      ).toBeNull();
      const accepted = measurementSurfaceAcceptedGeometryV1(geometry, frame, mesh, posed)!;
      expect(accepted.sourcePositions).toBe(posed);
      expect(accepted.positions).toEqual(posed);
      expect(original.positions).toEqual(mesh.positions);
      accepted.positions.fill(22);
      accepted.indices.fill(2);
      expect(geometry.getAttribute('position').array).toEqual(posed);
      expect(geometry.getIndex()!.array).toEqual(mesh.indices);
      expect(measurementSurfaceAcceptedGeometryV1(geometry, frame, mesh, posed)!.positions).toEqual(
        posed,
      );
    } finally {
      geometry.dispose();
    }
  });

  it('refuses missing, changed, invalid or incorrectly shaped actual buffers', () => {
    const { frame, mesh, geometry } = fixture();
    try {
      expect(measurementSurfaceAcceptedGeometryV1(null, frame, mesh, mesh.positions)).toBeNull();
      geometry.getAttribute('position').array[0] = Number.NaN;
      expect(
        measurementSurfaceAcceptedGeometryV1(geometry, frame, mesh, mesh.positions),
      ).toBeNull();
      geometry.setAttribute('position', new BufferAttribute(mesh.positions.slice(), 3));
      geometry.getIndex()!.array[0] = 2;
      expect(
        measurementSurfaceAcceptedGeometryV1(geometry, frame, mesh, mesh.positions),
      ).toBeNull();
      geometry.setIndex(new BufferAttribute(new Uint32Array([0, 1, 3]), 1));
      expect(
        measurementSurfaceAcceptedGeometryV1(
          geometry,
          frame,
          { ...mesh, indices: new Uint32Array([0, 1, 3]) },
          mesh.positions,
        ),
      ).toBeNull();
      geometry.setIndex(new BufferAttribute(mesh.indices.slice(), 1));
      geometry.setAttribute('position', new BufferAttribute(mesh.positions.slice(), 1));
      expect(
        measurementSurfaceAcceptedGeometryV1(geometry, frame, mesh, mesh.positions),
      ).toBeNull();
    } finally {
      geometry.dispose();
    }
  });
});
