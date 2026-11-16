import { describe, expect, it } from 'vitest';
import {
  resolveAssemblyTableWorkbenchOpenV1,
  shouldShowLegacyAssemblyEmptyStateV1,
} from './assembly-table-auto-open-v1';

describe('Assembly Table production entry', () => {
  it('opens the existing operation workbench for a selected real operation', () => {
    expect(resolveAssemblyTableWorkbenchOpenV1(false, true, 0)).toBe(true);
    expect(resolveAssemblyTableWorkbenchOpenV1(false, true, -1)).toBe(false);
  });

  it('does not let the legacy empty-state hide the zero-operation CAD table', () => {
    expect(
      shouldShowLegacyAssemblyEmptyStateV1({
        assemblyTableActive: true,
        operationCount: 0,
        unplacedPieceCount: 0,
        effectiveMode: 'list',
      }),
    ).toBe(false);

    expect(
      shouldShowLegacyAssemblyEmptyStateV1({
        assemblyTableActive: false,
        operationCount: 0,
        unplacedPieceCount: 0,
        effectiveMode: 'list',
      }),
    ).toBe(true);
  });
});
