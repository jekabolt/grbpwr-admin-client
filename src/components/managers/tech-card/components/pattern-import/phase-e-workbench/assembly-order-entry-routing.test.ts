import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isPatternImportDxfPhaseEExactSavedEmptyOperationV1,
  resolvePatternImportDxfPhaseEWorkbenchRequestedV1,
  routePatternImportDxfPhaseEAssemblyOrderEntryV2,
  shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1,
} from './assembly-order-entry';

const assemblyOrderEntrySource = readFileSync(
  new URL('./assembly-order-entry.tsx', import.meta.url),
  'utf8',
);

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
        exactSavedEmptyOperation: false,
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
        exactSavedEmptyOperation: false,
      }),
    ).toBe(false);
  });

  it('opens zero-connect only for a separately proven linked one-physical-seam target', () => {
    expect(
      shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
        workbenchOpen: true,
        exactNSessionAvailable: false,
        savedProjectionBlockerCode: 'saved-operation-not-two-seam',
        selectedSeamKeys: ['existing-edge', 'existing-pose'],
        savedOrderedSeamKeys: null,
        exactSavedEmptyOperation: false,
        exactSavedLinkedN1Target: true,
      }),
    ).toBe(true);
    expect(
      shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
        workbenchOpen: true,
        exactNSessionAvailable: true,
        savedProjectionBlockerCode: 'saved-operation-not-two-seam',
        selectedSeamKeys: ['existing-edge', 'existing-pose'],
        savedOrderedSeamKeys: null,
        exactSavedEmptyOperation: false,
        exactSavedLinkedN1Target: true,
      }),
    ).toBe(false);
  });

  it('uses native sewing for the proven linked target and explicitly opted-in empty operation', () => {
    expect(assemblyOrderEntrySource).toContain(
      "sourceSurface={useSavedSewingEdges ? 'explicit-native-drawn-sewing' : undefined}",
    );
    expect(assemblyOrderEntrySource).toContain(
      '(savedEmptyOperation || savedLinkedN1) && zeroConnectAuthoringHandoff',
    );
    expect(assemblyOrderEntrySource).toContain('savedLinkedN1 || emptyOperationSewingSource');
    expect(assemblyOrderEntrySource).toContain(
      'savedEmptyOperation && emptyOperationSewingSourceKey === emptyOperationKey',
    );
    expect(assemblyOrderEntrySource).toContain('disabled={emptyOperationConnectionPending}');
    expect(assemblyOrderEntrySource).toContain(
      'resolvePatternImportDxfPhaseEZeroConnectExistingLinkedN1TargetV1',
    );
  });

  it.each([
    {
      label: 'zero seams',
      seamKeys: [],
      savedSeamKeys: null,
      entryRoute: 'v2',
      blocker: 'saved-operation-not-two-seam',
      exactSavedEmptyOperation: true,
      fallback: true,
    },
    {
      label: 'one seam',
      seamKeys: ['seam-a'],
      savedSeamKeys: ['seam-a'],
      entryRoute: 'v1',
      blocker: null,
      exactSavedEmptyOperation: false,
      fallback: true,
    },
    {
      label: 'two seams',
      seamKeys: ['seam-a', 'seam-b'],
      savedSeamKeys: ['seam-a', 'seam-b'],
      entryRoute: 'v2',
      blocker: null,
      exactSavedEmptyOperation: false,
      fallback: false,
    },
    {
      label: 'more than two seams',
      seamKeys: ['seam-a', 'seam-b', 'seam-c'],
      savedSeamKeys: ['seam-a', 'seam-b', 'seam-c'],
      entryRoute: 'v2',
      blocker: null,
      exactSavedEmptyOperation: false,
      fallback: false,
    },
  ])(
    'routes $label without exposing the legacy exactly-two-seam blocker',
    ({ seamKeys, savedSeamKeys, entryRoute, blocker, exactSavedEmptyOperation, fallback }) => {
      expect(routePatternImportDxfPhaseEAssemblyOrderEntryV2(seamKeys)).toBe(entryRoute);
      expect(
        shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
          workbenchOpen: true,
          exactNSessionAvailable: false,
          savedProjectionBlockerCode: blocker,
          selectedSeamKeys: seamKeys,
          savedOrderedSeamKeys: savedSeamKeys,
          exactSavedEmptyOperation,
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
        exactSavedEmptyOperation: false,
      }),
    ).toBe(false);
    expect(
      shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
        workbenchOpen: true,
        exactNSessionAvailable: false,
        savedProjectionBlockerCode: 'saved-operation-not-two-seam',
        selectedSeamKeys: ['stale-live-a'],
        savedOrderedSeamKeys: null,
        exactSavedEmptyOperation: true,
      }),
    ).toBe(false);
    expect(
      shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
        workbenchOpen: true,
        exactNSessionAvailable: false,
        savedProjectionBlockerCode: 'saved-operation-ambiguous',
        selectedSeamKeys: ['seam-a'],
        savedOrderedSeamKeys: null,
        exactSavedEmptyOperation: false,
      }),
    ).toBe(false);
    expect(
      shouldUsePatternImportDxfPhaseESavedCardBrowseFallbackV1({
        workbenchOpen: true,
        exactNSessionAvailable: false,
        savedProjectionBlockerCode: 'saved-seam-not-exact',
        selectedSeamKeys: ['seam-a'],
        savedOrderedSeamKeys: null,
        exactSavedEmptyOperation: false,
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
        exactSavedEmptyOperation: false,
      }),
    ).toBe(false);
  });

  it('admits only a raw-empty live operation matching one raw-empty saved operation', () => {
    const savedOperations = [{ operationNumber: 41, seamKeys: [] }];
    expect(
      isPatternImportDxfPhaseEExactSavedEmptyOperationV1({
        liveOperationNumber: 41,
        liveSeamKeys: [],
        savedOperations,
      }),
    ).toBe(true);
    expect(
      isPatternImportDxfPhaseEExactSavedEmptyOperationV1({
        liveOperationNumber: 41,
        liveSeamKeys: [' '],
        savedOperations,
      }),
    ).toBe(false);
    expect(
      isPatternImportDxfPhaseEExactSavedEmptyOperationV1({
        liveOperationNumber: 41,
        liveSeamKeys: [],
        savedOperations: [...savedOperations, ...savedOperations],
      }),
    ).toBe(false);
    expect(
      isPatternImportDxfPhaseEExactSavedEmptyOperationV1({
        liveOperationNumber: 42,
        liveSeamKeys: [],
        savedOperations,
      }),
    ).toBe(false);
  });
});
