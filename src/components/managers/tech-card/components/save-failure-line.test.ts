import { describe, expect, it } from 'vitest';
import { saveFailureOf } from './save-failure-line';

describe('saveFailureOf: a stopped save promises nothing', () => {
  it('while retries remain it says so', () => {
    const f = saveFailureOf('error', undefined, 'worker error', 'failed', undefined);
    expect(f?.kind).toBe('error');
    expect(f?.sentence).toContain('keeps retrying');
  });

  it('with none left it says the cause, and the line carries the door', () => {
    const f = saveFailureOf('error', undefined, '«fusing DXF»: worker error', 'stopped', undefined);
    expect(f).toEqual({
      kind: 'stopped',
      sentence: 'the last save failed: «fusing DXF»: worker error',
    });
    expect(saveFailureOf('error', undefined, undefined, 'stopped', undefined)?.sentence).toBe(
      'the last save failed',
    );
  });
});
