import { describe, expect, it } from 'vitest';
import {
  resolvePatternImportDxfPhaseEWorkbenchRequestedV1,
  routePatternImportDxfPhaseEAssemblyOrderEntryV2,
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

  it('keeps a local operation missing from the latest saved read on the shared CAD table', () => {
    expect(
      shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
        workbenchOpen: true,
        exactNSessionAvailable: false,
        savedProjectionBlockerCode: 'saved-operation-missing',
      }),
    ).toBe(true);
  });

  it.each([
    {
      label: 'zero seams',
      seamKeys: [],
      entryRoute: 'v2',
      blocker: 'saved-operation-not-two-seam',
      fallback: true,
    },
    {
      label: 'one seam',
      seamKeys: ['seam-a'],
      entryRoute: 'v1',
      blocker: 'saved-operation-not-two-seam',
      fallback: true,
    },
    {
      label: 'two seams',
      seamKeys: ['seam-a', 'seam-b'],
      entryRoute: 'v2',
      blocker: null,
      fallback: false,
    },
    {
      label: 'more than two seams',
      seamKeys: ['seam-a', 'seam-b', 'seam-c'],
      entryRoute: 'v2',
      blocker: 'saved-operation-not-two-seam',
      fallback: true,
    },
  ])(
    'routes $label without exposing the legacy exactly-two-seam blocker',
    ({ seamKeys, entryRoute, blocker, fallback }) => {
      expect(routePatternImportDxfPhaseEAssemblyOrderEntryV2(seamKeys)).toBe(entryRoute);
      expect(
        shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
          workbenchOpen: true,
          exactNSessionAvailable: false,
          savedProjectionBlockerCode: blocker,
        }),
      ).toBe(fallback);
    },
  );

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
        savedProjectionBlockerCode: 'saved-operation-ambiguous',
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
