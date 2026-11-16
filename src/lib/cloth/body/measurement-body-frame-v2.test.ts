import { describe, expect, it } from 'vitest';

import { CANONICAL_BODY_MEASUREMENTS_VERSION } from './measurement-adapter';
import { createMeasurementBodyFrameV2 } from './measurement-body-frame-v2';

describe('measurement body frame v2 optional proxy inputs', () => {
  it('owns high hip and knee values without using them as analytical landmarks', () => {
    const frame = createMeasurementBodyFrameV2({
      measurements: {
        schemaVersion: CANONICAL_BODY_MEASUREMENTS_VERSION,
        heightMm: 1720,
        shoulderBreadthMm: 420,
        chestCircumferenceMm: 920,
        waistCircumferenceMm: 740,
        hipCircumferenceMm: 980,
        highHipCircumferenceMm: 1_601,
        armLengthMm: 600,
        inseamMm: 800,
        kneeCircumferenceMm: 601,
      },
      sourceRevision: 'measurement-body-frame-v2:test-proxy-inputs',
      pose: 'A',
    });

    expect(frame.measurements.highHipCircumferenceMm).toBe(1_601);
    expect(frame.measurements.kneeCircumferenceMm).toBe(601);
    expect(frame.landmarks.find(({ id }) => id === 'knee-left')).toMatchObject({
      source: 'prior',
      confidence: 'low',
    });
  });
});
