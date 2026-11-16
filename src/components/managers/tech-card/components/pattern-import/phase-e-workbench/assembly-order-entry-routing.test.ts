import { describe, expect, it } from 'vitest';
import {
  resolvePatternImportDxfPhaseEWorkbenchRequestedV1,
  shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1,
} from './assembly-order-entry';

describe('saved Assembly Order workbench routing', () => {
  it('treats the visible Assembly Table tab as an open request on the first render', () => {
    expect(resolvePatternImportDxfPhaseEWorkbenchRequestedV1(false, true)).toBe(true);
    expect(resolvePatternImportDxfPhaseEWorkbenchRequestedV1(false, false)).toBe(false);
  });

  it('keeps non-two-seam operations on the shared CAD table instead of showing a blocker', () => {
    expect(
      shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
        workbenchOpen: true,
        exactNSessionAvailable: false,
        savedProjectionBlockerCode: 'saved-operation-not-two-seam',
      }),
    ).toBe(true);
  });

  it('does not replace an exact-N owner or a genuine saved projection failure', () => {
    expect(
      shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
        workbenchOpen: true,
        exactNSessionAvailable: true,
        savedProjectionBlockerCode: 'saved-operation-not-two-seam',
      }),
    ).toBe(false);
    expect(
      shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
        workbenchOpen: true,
        exactNSessionAvailable: false,
        savedProjectionBlockerCode: 'saved-seam-not-exact',
      }),
    ).toBe(false);
  });
});
