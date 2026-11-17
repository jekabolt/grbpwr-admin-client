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

  it('routes a saved legacy N1 operation with no durable session to zero-connect authoring', () => {
    expect(
      shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
        workbenchOpen: true,
        exactNSessionAvailable: false,
        savedProjectionBlockerCode: null,
        selectedSeamKeys: ['seam-a'],
        savedOrderedSeamKeys: ['seam-a'],
      }),
    ).toBe(true);
  });

  it('fails closed when the local operation is missing from the authoritative saved read', () => {
    expect(
      shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
        workbenchOpen: true,
        exactNSessionAvailable: false,
        savedProjectionBlockerCode: 'saved-operation-missing',
        selectedSeamKeys: ['seam-a'],
        savedOrderedSeamKeys: null,
      }),
    ).toBe(false);
  });

  it.each([
    {
      label: 'zero seams',
      seamKeys: [],
      savedSeamKeys: null,
      entryRoute: 'v2',
      blocker: 'saved-operation-not-two-seam',
      fallback: false,
    },
    {
      label: 'one seam',
      seamKeys: ['seam-a'],
      savedSeamKeys: ['seam-a'],
      entryRoute: 'v1',
      blocker: null,
      fallback: true,
    },
    {
      label: 'two seams',
      seamKeys: ['seam-a', 'seam-b'],
      savedSeamKeys: ['seam-a', 'seam-b'],
      entryRoute: 'v2',
      blocker: null,
      fallback: false,
    },
    {
      label: 'more than two seams',
      seamKeys: ['seam-a', 'seam-b', 'seam-c'],
      savedSeamKeys: ['seam-a', 'seam-b', 'seam-c'],
      entryRoute: 'v2',
      blocker: null,
      fallback: false,
    },
  ])(
    'routes $label without exposing the legacy exactly-two-seam blocker',
    ({ seamKeys, savedSeamKeys, entryRoute, blocker, fallback }) => {
      expect(routePatternImportDxfPhaseEAssemblyOrderEntryV2(seamKeys)).toBe(entryRoute);
      expect(
        shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
          workbenchOpen: true,
          exactNSessionAvailable: false,
          savedProjectionBlockerCode: blocker,
          selectedSeamKeys: seamKeys,
          savedOrderedSeamKeys: savedSeamKeys,
        }),
      ).toBe(fallback);
    },
  );

  it('does not replace an exact-N owner or a genuine saved projection failure', () => {
    expect(
      shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
        workbenchOpen: true,
        exactNSessionAvailable: true,
        savedProjectionBlockerCode: null,
        selectedSeamKeys: ['seam-a'],
        savedOrderedSeamKeys: ['seam-a'],
      }),
    ).toBe(false);
    expect(
      shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
        workbenchOpen: true,
        exactNSessionAvailable: false,
        savedProjectionBlockerCode: 'saved-operation-ambiguous',
        selectedSeamKeys: ['seam-a'],
        savedOrderedSeamKeys: null,
      }),
    ).toBe(false);
    expect(
      shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
        workbenchOpen: true,
        exactNSessionAvailable: false,
        savedProjectionBlockerCode: 'saved-seam-not-exact',
        selectedSeamKeys: ['seam-a'],
        savedOrderedSeamKeys: null,
      }),
    ).toBe(false);
  });

  it.each([
    ['saved N2', ['saved-a', 'saved-b']],
    ['saved N3', ['saved-a', 'saved-b', 'saved-c']],
  ])('does not route stale live N1 over %s into zero-connect', (_label, savedOrderedSeamKeys) => {
    expect(
      shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
        workbenchOpen: true,
        exactNSessionAvailable: false,
        savedProjectionBlockerCode: null,
        selectedSeamKeys: ['stale-live-a'],
        savedOrderedSeamKeys,
      }),
    ).toBe(false);
  });
});
