import { describe, expect, it } from 'vitest';

import {
  createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1,
  isPatternImportDxfPhaseECadTableZeroOperationGenerationTicketCurrentV1,
} from './cad-table-zero-operation-generation-owner-v1';

describe('zero-operation preparation generation owner', () => {
  it('issues monotonic saved preparation generations and never defaults them to one', () => {
    const owner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
    const first = owner.beginSaved('saved:6:13:main:M');
    const second = owner.beginSaved('saved:6:14:main:M');

    expect(first).toMatchObject({ preparationGeneration: 1, importGeneration: 1 });
    expect(second).toMatchObject({ preparationGeneration: 2, importGeneration: 2 });
    expect(isPatternImportDxfPhaseECadTableZeroOperationGenerationTicketCurrentV1(first)).toBe(
      false,
    );
    expect(isPatternImportDxfPhaseECadTableZeroOperationGenerationTicketCurrentV1(second)).toBe(
      true,
    );
  });

  it('keeps the genuine CardSession import generation across local preparation generations', () => {
    const owner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
    const initial = owner.beginFresh('fresh:6:37:main:M', 37);
    const refreshed = owner.beginFresh('fresh:6:37:main:M:refresh:14', 37);

    expect(initial).toMatchObject({ preparationGeneration: 1, importGeneration: 37 });
    expect(refreshed).toMatchObject({ preparationGeneration: 2, importGeneration: 37 });
    expect(isPatternImportDxfPhaseECadTableZeroOperationGenerationTicketCurrentV1(initial)).toBe(
      false,
    );
    expect(isPatternImportDxfPhaseECadTableZeroOperationGenerationTicketCurrentV1(refreshed)).toBe(
      true,
    );
  });

  it('rejects invalid fresh epochs and disposed tickets', () => {
    const owner = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
    expect(() => owner.beginFresh('fresh:6:0:main:M', 0)).toThrow(/genuine positive/i);
    const current = owner.beginFresh('fresh:6:9:main:M', 9);
    owner.dispose();
    expect(isPatternImportDxfPhaseECadTableZeroOperationGenerationTicketCurrentV1(current)).toBe(
      false,
    );
  });
});
