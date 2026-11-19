import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  createMeasurementSurfaceSeamOrdinalBadgeBuilderV1,
  disposeMeasurementSurfaceSeamOrdinalBadgeV1,
} from './measurement-surface-seam-ordinal-badges-v1';

const seam = {
  seamId: 'saved-seam',
  side: 'A',
  operationSeam: { operationNumber: 120, ordinal: 42 },
  ordinalBadgeVisible: true,
} as const;
const exactPoints = [new THREE.Vector3(1, 2, 0.009), new THREE.Vector3(3, 6, 0.009)] as const;

function canvasFixture() {
  const context = { fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), fillStyle: '' };
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) };
  const createCanvas = vi.fn(() => canvas as unknown as HTMLCanvasElement);
  return { canvas, context, createCanvas };
}

describe('measurement surface seam ordinal badges', () => {
  it('attaches the selected high ordinal and side at the verified edge midpoint', () => {
    const { canvas, context, createCanvas } = canvasFixture();
    const add = createMeasurementSurfaceSeamOrdinalBadgeBuilderV1(createCanvas);
    const line = new THREE.Line();
    const badge = add(line, seam, exactPoints, '#2563EB', '#ffffff');

    expect(badge).toBeInstanceOf(THREE.Sprite);
    expect(badge?.parent).toBe(line);
    expect(badge?.position.toArray()).toEqual([2, 4, 0.009]);
    expect(badge?.material.sizeAttenuation).toBe(false);
    expect(badge?.material.depthTest).toBe(true);
    expect(badge?.material.depthWrite).toBe(false);
    expect(badge?.material.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(badge?.userData.operationSeam).toEqual({ operationNumber: 120, ordinal: 42 });
    expect(context.fillStyle).toBe('rgb(37,99,235)');
    expect(context.fillText).toHaveBeenCalledExactlyOnceWith('42 A', 64, 24, 112);
    expect([canvas.width, canvas.height]).toEqual([128, 48]);
  });

  it('admits only one A/B pair for the selected exact seam', () => {
    const { createCanvas } = canvasFixture();
    const add = createMeasurementSurfaceSeamOrdinalBadgeBuilderV1(createCanvas);
    const line = new THREE.Line();
    const render = (input: Parameters<typeof add>[1], points = exactPoints) =>
      add(line, input, points, '#2563EB', '#ffffff');

    expect(render({ ...seam, ordinalBadgeVisible: false })).toBeNull();
    expect(render({ ...seam, operationSeam: undefined })).toBeNull();
    expect(render({ ...seam, operationSeam: { operationNumber: 120, ordinal: 0 } })).toBeNull();
    expect(render(seam)).not.toBeNull();
    expect(render(seam)).toBeNull();
    expect(render({ ...seam, side: 'B', seamId: 'unrelated' })).toBeNull();
    expect(render({ ...seam, side: 'B' })).not.toBeNull();
    expect(render({ ...seam, side: 'B' })).toBeNull();
    expect(createCanvas).toHaveBeenCalledTimes(2);
  });

  it('disposes its texture and material once and keeps the shared Sprite geometry', () => {
    const { createCanvas } = canvasFixture();
    const add = createMeasurementSurfaceSeamOrdinalBadgeBuilderV1(createCanvas);
    const badge = add(new THREE.Line(), seam, exactPoints, '#2563EB', '#ffffff')!;
    const disposeTexture = vi.fn();
    const disposeMaterial = vi.fn();
    const disposeGeometry = vi.fn();
    badge.material.map!.addEventListener('dispose', disposeTexture);
    badge.material.addEventListener('dispose', disposeMaterial);
    badge.geometry.addEventListener('dispose', disposeGeometry);

    disposeMeasurementSurfaceSeamOrdinalBadgeV1(badge);
    disposeMeasurementSurfaceSeamOrdinalBadgeV1(badge);

    expect(disposeTexture).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(disposeGeometry).not.toHaveBeenCalled();
    expect(badge.material.map).toBeNull();
    badge.geometry.removeEventListener('dispose', disposeGeometry);
  });
});
