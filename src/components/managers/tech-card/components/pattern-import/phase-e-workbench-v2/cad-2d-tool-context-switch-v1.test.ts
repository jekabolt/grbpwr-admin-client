import { describe, expect, it } from 'vitest';

import { resolvePatternImportDxfPhaseECad2dAvailableToolContextV1 } from './cad-2d-tool-context-switch-v1';

describe('Assembly Table 2D tool context availability', () => {
  it('falls back to assembly when the selected operation has no pattern session', () => {
    expect(resolvePatternImportDxfPhaseECad2dAvailableToolContextV1('pattern', false)).toBe(
      'assembly',
    );
  });

  it('preserves the requested context while its source is available', () => {
    expect(resolvePatternImportDxfPhaseECad2dAvailableToolContextV1('pattern', true)).toBe(
      'pattern',
    );
    expect(resolvePatternImportDxfPhaseECad2dAvailableToolContextV1('assembly', true)).toBe(
      'assembly',
    );
  });
});
