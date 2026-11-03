import { describe, expect, it } from 'vitest';
import { WorkerLoadError } from 'lib/worker-load';
import { geometryFailureLabel, NO_DXF_DOWNLOADED } from './dxf-warnings';

describe('geometryFailureLabel', () => {
  it('«parse error» only when a file was really read and failed', () => {
    expect(geometryFailureLabel(new Error('couldn’t parse DXF: bad group code'))).toBe(
      'parse error',
    );
  });

  it('an older page version and a file that never arrived were not parsed at all', () => {
    expect(geometryFailureLabel(new WorkerLoadError())).toBe('not loaded');
    expect(geometryFailureLabel(new Error(NO_DXF_DOWNLOADED))).toBe('not loaded');
  });
});
