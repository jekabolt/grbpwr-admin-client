import { describe, expect, it } from 'vitest';
import {
  projectSavedObservedStrainHeatmapV1,
  createSavedObservedStrainHeatmapPreviewV1,
} from './beta-skirt-saved-annular-observed-placement-strain-heatmap-preview-v1';

describe('observed heatmap genuine-owner entry', () => {
  it('rejects caller-shaped completed reports before touching any canvas or GPU', async () => {
    let touched = false;
    const forged = Object.freeze({
      report: { status: 'diagnostic-completed', reportSha256: 'a'.repeat(64) },
    });
    const canvas = new Proxy(
      {},
      {
        get() {
          touched = true;
          throw new Error('Canvas accessed before admission.');
        },
      },
    );
    await expect(projectSavedObservedStrainHeatmapV1(forged, forged)).rejects.toThrow(
      'owners are required',
    );
    await expect(
      createSavedObservedStrainHeatmapPreviewV1(canvas as HTMLCanvasElement, forged, forged),
    ).rejects.toThrow('genuine observed result');
    expect(touched).toBe(false);
  });
});
