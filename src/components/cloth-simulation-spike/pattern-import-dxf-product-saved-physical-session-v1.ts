import type { PatternImportDxfProductSavedGarmentMeshIngressRequestV1 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-ingress-v1';
import type { PatternImportDxfProductSavedActualBodyInputV2 } from './pattern-import-dxf-product-saved-canonical-medium-actual-body-bridge-v2';
import {
  isBetaSkirtCanonicalMediumDisplayedBodyCurrentV2,
  type BetaSkirtCanonicalMediumDisplayedBodyOwnerV2,
} from './beta-skirt-canonical-medium-displayed-body-admission-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_REQUEST_V2,
  type PatternImportDxfProductSavedConfirmedPlacementRequestV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-compile-session-v1';
import type { PatternImportDxfProductSavedAnnularWriterFrameReceiptV2 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-local-frame-preflight-v2';
import {
  disposeBetaSkirtCanonicalMediumSavedRuntimeSourceV1,
  type BetaSkirtCanonicalMediumSavedRuntimeSourceOwnerV1,
} from './beta-skirt-canonical-medium-saved-runtime-source-v1';
import {
  runPatternImportDxfProductSavedPhysicalBetaPreviewV1,
  type PatternImportDxfProductSavedPhysicalBetaPreviewResultV1,
} from './pattern-import-dxf-product-saved-physical-beta-preview-v1';

import {
  createPatternImportDxfProductSavedCanonicalMediumActualBodySessionV2,
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_RUNTIME_SOURCE_SESSION_REQUEST_V2,
  PATTERN_IMPORT_DXF_PRODUCT_SAVED_VERIFIED_PLACEMENT_ACTUAL_BODY_REQUEST_V1,
  type PatternImportDxfProductSavedVerifiedPlacementActualBodyRequestV1,
} from './pattern-import-dxf-product-saved-canonical-medium-actual-body-session-v2';

export type PatternImportDxfProductSavedPhysicalStageV1 = Readonly<{
  status:
    | 'idle'
    | 'compiling'
    | 'local-frame-ready'
    | 'actual-body-ready'
    | 'runtime-source-ready'
    | 'preview-ready'
    | 'blocked'
    | 'disposed';
  generation: number;
  stage:
    | 'compile'
    | 'saved-local-frame-refinement'
    | 'actual-body'
    | 'runtime-source'
    | 'runtime-preview';
  blockers: readonly Readonly<{ code: string; detail: string }>[];
  runtimeAuthority: false;
  productionAuthority: false;
}>;

export type PatternImportDxfProductSavedPhysicalBodyInputV1 = Pick<
  PatternImportDxfProductSavedVerifiedPlacementActualBodyRequestV1,
  'expectedGeneration' | 'placementReadOwner'
> &
  PatternImportDxfProductSavedActualBodyInputV2;

export type PatternImportDxfProductSavedPhysicalRunResultV1 =
  | Readonly<{
      ok: true;
      receipts: Extract<
        PatternImportDxfProductSavedPhysicalBetaPreviewResultV1,
        { ok: true }
      >['receipts'];
      rendererOwnedByPhysicalSession: true;
    }>
  | Extract<PatternImportDxfProductSavedPhysicalBetaPreviewResultV1, { ok: false }>;

/**
 * Loaded only after verified sidecar persistence. The same private session compiles the saved
 * source, authenticates its durable writer frame, and consumes the resulting local geometry.
 * Body placement still requires explicit garment roles and the actual displayed body.
 */
export function createPatternImportDxfProductSavedPhysicalSessionV1() {
  const session = createPatternImportDxfProductSavedCanonicalMediumActualBodySessionV2();
  let disposed = false;
  let running = false;
  let runtimeOwner: BetaSkirtCanonicalMediumSavedRuntimeSourceOwnerV1 | null = null;
  let renderer:
    | Extract<PatternImportDxfProductSavedPhysicalBetaPreviewResultV1, { ok: true }>['session']
    | null = null;
  let previewAbort: AbortController | null = null;
  let receipt: PatternImportDxfProductSavedAnnularWriterFrameReceiptV2 | null = null;
  let composition:
    | PatternImportDxfProductSavedGarmentMeshIngressRequestV1['compositionRequest']
    | null = null;
  let displayedBodyOwner: BetaSkirtCanonicalMediumDisplayedBodyOwnerV2 | null = null;
  let physicalStage: PatternImportDxfProductSavedPhysicalStageV1 = Object.freeze({
    status: 'idle',
    generation: 0,
    stage: 'compile',
    blockers: [],
    runtimeAuthority: false,
    productionAuthority: false,
  });
  let observedStage: PatternImportDxfProductSavedPhysicalStageV1 | null = null;
  let publicStage: Readonly<
    PatternImportDxfProductSavedPhysicalStageV1 & { runtimeSourceConsumed: boolean }
  > | null = null;
  const readPhysicalStage = () => {
    const runtimeSourceConsumed = session.runtimeSourceConsumed();
    if (
      observedStage !== physicalStage ||
      publicStage?.runtimeSourceConsumed !== runtimeSourceConsumed
    ) {
      observedStage = physicalStage;
      publicStage = Object.freeze({ ...physicalStage, runtimeSourceConsumed });
    }
    return publicStage!;
  };

  const publish = (
    status: PatternImportDxfProductSavedPhysicalStageV1['status'],
    stage: PatternImportDxfProductSavedPhysicalStageV1['stage'],
    blockers: PatternImportDxfProductSavedPhysicalStageV1['blockers'] = [],
  ) => {
    if (disposed) return;
    physicalStage = Object.freeze({
      status,
      generation: session.snapshot().generation,
      stage,
      blockers: Object.freeze(blockers.map((blocker) => Object.freeze({ ...blocker }))),
      runtimeAuthority: false,
      productionAuthority: false,
    });
  };

  const enter = (signal?: AbortSignal) => {
    if (disposed) throw new Error('The saved physical session is disposed.');
    if (running) throw new Error('The saved physical session is busy.');
    if (signal?.aborted) throw new DOMException('Saved physical session cancelled.', 'AbortError');
    running = true;
  };

  const releasePreview = () => {
    previewAbort?.abort();
    previewAbort = null;
    renderer?.dispose();
    renderer = null;
    if (runtimeOwner) disposeBetaSkirtCanonicalMediumSavedRuntimeSourceV1(runtimeOwner);
    runtimeOwner = null;
  };

  const requireCurrentDisplayedBody = () => {
    if (
      displayedBodyOwner &&
      !isBetaSkirtCanonicalMediumDisplayedBodyCurrentV2(displayedBodyOwner)
    ) {
      releasePreview();
      throw new Error('The displayed canonical body changed; rebuild placement before running.');
    }
  };

  const consume = async (
    request: PatternImportDxfProductSavedGarmentMeshIngressRequestV1,
    signal?: AbortSignal,
  ) => {
    enter(signal);
    releasePreview();
    receipt = null;
    composition = null;
    displayedBodyOwner = null;
    publish('compiling', 'compile');
    let sourceHandoffStarted = false;
    try {
      // Retain detached source data; the underlying session authenticates it against the owner.
      const candidateComposition = structuredClone(request.compositionRequest);
      sourceHandoffStarted = true;
      const compiled = await session.consume(request, signal);
      if (!compiled.ok) {
        publish('blocked', 'compile', compiled.blockers);
        return compiled;
      }
      const writerFrame = await session.deriveLatestSavedWriterFrameReceipt(
        compiled.generation,
        signal,
      );
      if (!writerFrame.ok) {
        publish('blocked', 'saved-local-frame-refinement', [writerFrame.blocker]);
        return compiled;
      }
      const refined = await session.advanceCanonicalMediumLocalFrameRefinement(
        {
          schemaVersion:
            PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_LOCAL_FRAME_REFINEMENT_REQUEST_V2,
          expectedGeneration: compiled.generation,
          writerFrameReceipt: writerFrame.receipt,
        },
        signal,
      );
      if (!refined.ok) {
        publish('blocked', 'saved-local-frame-refinement', refined.blockers);
        return compiled;
      }
      if (disposed || signal?.aborted || session.snapshot().generation !== compiled.generation)
        throw new DOMException('Saved physical session changed during refinement.', 'AbortError');
      receipt = writerFrame.receipt;
      composition = candidateComposition;
      publish('local-frame-ready', 'actual-body', [
        {
          code: 'authored-garment-and-actual-body-input-required',
          detail:
            'Supply exact garment boundary roles and the selected actual body to place this saved mesh.',
        },
      ]);
      return compiled;
    } catch (error) {
      receipt = null;
      composition = null;
      if (!sourceHandoffStarted) {
        // An invalid replacement must never leave the preceding garment available to Run.
        session.dispose();
        publish('disposed', 'compile', [
          {
            code: 'invalid-replacement-source',
            detail:
              'The replacement source could not be detached; the previous garment was revoked.',
          },
        ]);
        disposed = true;
        throw error;
      }
      publish('blocked', physicalStage.stage, [
        {
          code: signal?.aborted ? 'session-cancelled' : 'saved-physical-session-failed',
          detail: error instanceof Error ? error.message : 'Saved physical session failed.',
        },
      ]);
      throw error;
    } finally {
      running = false;
    }
  };

  const buildLatestConfirmedPlacementSidecar = async (
    input: PatternImportDxfProductSavedConfirmedPlacementRequestV1,
    signal?: AbortSignal,
  ) => {
    enter(signal);
    try {
      return await session.buildLatestConfirmedPlacementSidecar(input, signal);
    } finally {
      running = false;
    }
  };

  const advanceActualBody = async (
    input: PatternImportDxfProductSavedPhysicalBodyInputV1,
    signal?: AbortSignal,
  ) => {
    enter(signal);
    try {
      const observed = Object.getOwnPropertyDescriptor(input, 'canonicalDisplayedBodyOwner');
      const legacy = Object.getOwnPropertyDescriptor(input, 'mannequin');
      if (Boolean(observed) === Boolean(legacy))
        throw new TypeError('Exactly one current body input is required.');
      const descriptor = observed ?? legacy;
      if (!descriptor?.enumerable || !('value' in descriptor) || !descriptor.value)
        throw new TypeError('The current body input must be an own data property.');
      const bodyInput: PatternImportDxfProductSavedActualBodyInputV2 = observed
        ? { canonicalDisplayedBodyOwner: descriptor.value }
        : { mannequin: descriptor.value };
      if (!receipt || !composition)
        throw new Error('The saved physical session has no authenticated local-frame result.');
      const result = await session.advanceCanonicalMediumActualBody(
        {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_VERIFIED_PLACEMENT_ACTUAL_BODY_REQUEST_V1,
          placementReadOwner: input.placementReadOwner,
          expectedGeneration: input.expectedGeneration,
          compositionRequest: composition,
          writerFrameReceipt: receipt,
          ...bodyInput,
        },
        signal,
      );
      if (input.expectedGeneration === session.snapshot().generation) {
        if (result.ok) {
          displayedBodyOwner = observed ? descriptor.value : null;
          publish('actual-body-ready', 'runtime-source');
        } else publish('blocked', 'actual-body', result.blockers);
      }
      return result;
    } finally {
      running = false;
    }
  };

  const buildLatestRuntimeSource = async (expectedGeneration: number, signal?: AbortSignal) => {
    enter(signal);
    try {
      requireCurrentDisplayedBody();
      const result = await session.buildLatestRuntimeSource(
        {
          schemaVersion:
            PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_RUNTIME_SOURCE_SESSION_REQUEST_V2,
          expectedGeneration,
        },
        signal,
      );
      try {
        requireCurrentDisplayedBody();
      } catch (error) {
        if (result.ok) disposeBetaSkirtCanonicalMediumSavedRuntimeSourceV1(result.owner);
        throw error;
      }
      if (expectedGeneration === session.snapshot().generation) {
        if (result.ok) publish('runtime-source-ready', 'runtime-source');
        else publish('blocked', 'runtime-source', result.blockers);
      }
      // The existing one-shot handoff transfers runtime ownership to the explicit caller.
      return result;
    } catch (error) {
      if (expectedGeneration === session.snapshot().generation)
        publish('blocked', 'runtime-source', [
          {
            code: signal?.aborted ? 'session-cancelled' : 'runtime-source-handoff-failed',
            detail: error instanceof Error ? error.message : 'Runtime source handoff failed.',
          },
        ]);
      throw error;
    } finally {
      running = false;
    }
  };

  const runBetaPreview = async (
    expectedGeneration: number,
    computeCanvas: HTMLCanvasElement,
    displayCanvas: HTMLCanvasElement,
    signal?: AbortSignal,
  ): Promise<PatternImportDxfProductSavedPhysicalRunResultV1> => {
    enter(signal);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    previewAbort = controller;
    let acquiredRuntime = false;
    try {
      requireCurrentDisplayedBody();
      const runtime = await session.buildLatestRuntimeSource(
        {
          schemaVersion:
            PATTERN_IMPORT_DXF_PRODUCT_SAVED_CANONICAL_MEDIUM_ACTUAL_BODY_RUNTIME_SOURCE_SESSION_REQUEST_V2,
          expectedGeneration,
        },
        controller.signal,
      );
      if (!runtime.ok) throw new Error(JSON.stringify(runtime.blockers));
      if (disposed || controller.signal.aborted) {
        disposeBetaSkirtCanonicalMediumSavedRuntimeSourceV1(runtime.owner);
        throw new DOMException('Saved physical preview cancelled.', 'AbortError');
      }
      runtimeOwner = runtime.owner;
      acquiredRuntime = true;
      requireCurrentDisplayedBody();
      const preview = await runPatternImportDxfProductSavedPhysicalBetaPreviewV1(
        runtime.owner,
        computeCanvas,
        displayCanvas,
        controller.signal,
      );
      if (disposed || controller.signal.aborted) {
        if (preview.ok) preview.session.dispose();
        throw new DOMException('Saved physical preview cancelled.', 'AbortError');
      }
      if (!preview.ok) {
        releasePreview();
        publish('blocked', 'runtime-preview', [{ code: preview.code, detail: preview.detail }]);
        return preview;
      }
      renderer = preview.session;
      requireCurrentDisplayedBody();
      publish('preview-ready', 'runtime-preview');
      return Object.freeze({
        ok: true,
        receipts: preview.receipts,
        rendererOwnedByPhysicalSession: true,
      });
    } catch (error) {
      const wasCancelled = controller.signal.aborted;
      if (acquiredRuntime) releasePreview();
      if (
        expectedGeneration === session.snapshot().generation &&
        !(renderer && physicalStage.status === 'preview-ready' && !acquiredRuntime)
      )
        publish('blocked', 'runtime-preview', [
          {
            code: wasCancelled ? 'session-cancelled' : 'runtime-preview-failed',
            detail: error instanceof Error ? error.message : 'Saved physical preview failed.',
          },
        ]);
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
      if (previewAbort === controller) previewAbort = null;
      running = false;
    }
  };

  return Object.freeze({
    consume,
    buildLatestConfirmedPlacementSidecar,
    advanceActualBody,
    invalidateActualBody(expectedGeneration: number) {
      if (disposed || session.snapshot().generation !== expectedGeneration) return false;
      const changed = session.invalidateActualBody(expectedGeneration);
      const hadBodyOrPreview = Boolean(
        displayedBodyOwner || renderer || runtimeOwner || previewAbort,
      );
      releasePreview();
      displayedBodyOwner = null;
      if (changed || hadBodyOrPreview)
        publish('local-frame-ready', 'actual-body', [
          {
            code: 'placement-or-body-changed',
            detail: 'Placement or body changed. Verify the saved placement before running again.',
          },
        ]);
      return changed || hadBodyOrPreview;
    },
    buildLatestRuntimeSource,
    runBetaPreview,
    stopBetaPreview() {
      if (disposed) return false;
      const hadPreview = Boolean(renderer || runtimeOwner || previewAbort);
      releasePreview();
      if (hadPreview)
        publish('blocked', 'runtime-preview', [
          {
            code: 'preview-stopped',
            detail: 'Preview stopped. Reconfirm the saved assembly to start a fresh simulation.',
          },
        ]);
      return hadPreview;
    },
    projectLatest: session.projectLatest,
    projectLatestRefined: session.projectLatestRefined,
    projectLatestActualBody: session.projectLatestActualBody,
    snapshot: session.snapshot,
    physicalStage: readPhysicalStage,
    dispose() {
      if (disposed) return;
      disposed = true;
      releasePreview();
      receipt = null;
      composition = null;
      displayedBodyOwner = null;
      session.dispose();
      physicalStage = Object.freeze({ ...physicalStage, status: 'disposed', blockers: [] });
    },
  });
}

// Compatibility with the existing lazy compile-owner injection point; no second source consumer.
export const createPatternImportDxfProductSavedGarmentMeshCompileSessionV1 =
  createPatternImportDxfProductSavedPhysicalSessionV1;
