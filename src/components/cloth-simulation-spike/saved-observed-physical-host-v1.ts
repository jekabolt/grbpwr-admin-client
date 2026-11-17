import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { PatternImportDxfPhaseEMultiseamSavedDownstreamV2 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/assembly-order-entry';
import { createPatternImportDxfProductSavedPlacementProductionContextV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-placement-context-v1';
import { createPatternImportDxfProductCompositeObservedPlacementProductionSaverV3 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-placement-save-v1';
import { createPatternImportDxfProductCompositePlacementProductionReaderV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-placement-read-v1';
import { PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V3 } from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-read-v3';
import {
  buildCurrentSavedModelObservedPlacementRuntimeSourceV1,
  issueCurrentSavedModelObservedPlacementV3,
  type SavedModelDisplayedTriangleBodySessionV2,
} from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2';
import {
  createPatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1,
  type PatternImportDxfProductSavedAnnularObservedPlacementGarmentConsumeResultV1,
} from './pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1';
import {
  disposeBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1,
  type BetaSkirtSavedAnnularObservedPlacementRuntimeSourceOwnerV1,
  type BetaSkirtSavedAnnularObservedPlacementRuntimeSourceReportV1,
} from './beta-skirt-saved-annular-observed-placement-runtime-source-v1';
import {
  disposeBetaSkirtSavedAnnularObservedPlacement16FrameContactV1,
  projectBetaSkirtSavedAnnularObservedPlacement16FrameContactV1,
  runBetaSkirtSavedAnnularObservedPlacement16FrameContactV1,
  type BetaSkirtSavedAnnularObservedPlacement16FrameContactOwnerV1,
  type BetaSkirtSavedAnnularObservedPlacement16FrameContactReportV1,
} from './beta-skirt-saved-annular-observed-placement-16-frame-contact-v1';
import type { QualifiedTwoPanelObservedPlacementIntentV1 } from './qualified-two-panel-observed-placement-authoring-v1';
import { disposeObservedPlacementSidecarIssuedV3 } from './observed-placement-sidecar-issuer-v3';
import {
  disposeBetaSkirtSavedAnnularObservedPlacement32FrameContactV1,
  runBetaSkirtSavedAnnularObservedPlacement32FrameContactV1,
  type BetaSkirtSavedAnnularObservedPlacement32FrameContactOwnerV1,
  type BetaSkirtSavedAnnularObservedPlacement32FrameContactReportV1,
} from './beta-skirt-saved-annular-observed-placement-32-frame-contact-v1';
import { createSavedObservedStrainHeatmapPreviewV1 } from './beta-skirt-saved-annular-observed-placement-strain-heatmap-preview-v1';
type Preview = Awaited<ReturnType<typeof createSavedObservedStrainHeatmapPreviewV1>>;

type Compiled = Extract<
  PatternImportDxfProductSavedAnnularObservedPlacementGarmentConsumeResultV1,
  { ok: true }
>['compile'];
type Context = ReturnType<typeof createPatternImportDxfProductSavedPlacementProductionContextV1>;
export type SavedObservedPhysicalHostSnapshotV1 = Readonly<{
  status:
    | 'idle'
    | 'compiling'
    | 'local-frame-ready'
    | 'authoring'
    | 'saving'
    | 'placement-ready'
    | 'placement-missing'
    | 'building-runtime'
    | 'runtime-ready'
    | 'running'
    | 'frame16-ready'
    | 'preview-ready'
    | 'blocked'
    | 'disposed';
  generation: number;
  detail: string | null;
  runtimeReport: BetaSkirtSavedAnnularObservedPlacementRuntimeSourceReportV1 | null;
  frame16Report: BetaSkirtSavedAnnularObservedPlacement16FrameContactReportV1 | null;
  frame32Report: BetaSkirtSavedAnnularObservedPlacement32FrameContactReportV1 | null;
  heatmapReceipt: Preview['receipt'] | null;
  writeOutcome: 'not-attempted' | 'unknown' | 'acknowledged-unverified' | 'verified';
  requiresReload: boolean;
}>;
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const nativeAdd = EventTarget.prototype.addEventListener;
const nativeRemove = EventTarget.prototype.removeEventListener;
const aborted = (signal: AbortSignal) => nativeAborted.call(signal) as boolean;
const cancelled = () =>
  new DOMException('The saved garment or displayed body changed.', 'AbortError');

/** Select this fixed profile BEFORE the table's one-shot source handoff. This host owns its
 * source/context/runtime children; the app's current displayed-body session is borrowed. */
export function createSavedObservedPhysicalHostV1(
  input: Readonly<{
    row: DxfProductSavedRowIdentityV1;
    bodySession: SavedModelDisplayedTriangleBodySessionV2;
  }>,
) {
  const row = structuredClone(input.row);
  const body = input.bodySession;
  const source = createPatternImportDxfProductSavedAnnularObservedPlacementGarmentSessionV1();
  const listeners = new Set<() => void>();
  let disposed = false;
  let consumed = false;
  let requiresReload = false;
  let compiled: Compiled | null = null;
  let context: Context | null = null;
  let runtime: BetaSkirtSavedAnnularObservedPlacementRuntimeSourceOwnerV1 | null = null;
  let frame16: BetaSkirtSavedAnnularObservedPlacement16FrameContactOwnerV1 | null = null;
  let frame32: BetaSkirtSavedAnnularObservedPlacement32FrameContactOwnerV1 | null = null;
  let preview: Preview | null = null;
  let bodyEpoch = 0;
  let lastBody = body.getSnapshot();
  let operation: {
    controller: AbortController;
    usesBody: boolean;
    finished: Promise<void>;
    kind: 'compile' | 'preview';
  } | null = null;
  let state: SavedObservedPhysicalHostSnapshotV1 = Object.freeze({
    status: 'idle',
    generation: 0,
    detail: null,
    runtimeReport: null,
    frame16Report: null,
    frame32Report: null,
    heatmapReceipt: null,
    writeOutcome: 'not-attempted',
    requiresReload: false,
  });
  const publish = (next: Partial<SavedObservedPhysicalHostSnapshotV1>) => {
    state = Object.freeze({ ...state, ...next });
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* One view cannot prevent lifecycle cleanup. */
      }
    }
  };
  const releaseRuntime = () => {
    const ownedPreview = preview,
      owned32 = frame32,
      owned16 = frame16,
      ownedSource = runtime;
    preview = null;
    frame32 = null;
    frame16 = null;
    runtime = null;
    for (const dispose of [
      () => ownedPreview?.dispose(),
      () => owned32 && disposeBetaSkirtSavedAnnularObservedPlacement32FrameContactV1(owned32),
      () => owned16 && disposeBetaSkirtSavedAnnularObservedPlacement16FrameContactV1(owned16),
      () =>
        ownedSource && disposeBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1(ownedSource),
    ]) {
      try {
        dispose();
      } catch {
        /* Continue through every child owned by this host. */
      }
    }
    state = Object.freeze({
      ...state,
      runtimeReport: null,
      frame16Report: null,
      frame32Report: null,
      heatmapReceipt: null,
    });
  };
  const current = (signal?: AbortSignal, expectedBodyEpoch?: number) => {
    if (disposed || (signal && aborted(signal))) throw cancelled();
    const sourceState = source.snapshot();
    if (disposed || (signal && aborted(signal)) || sourceState.disposed) throw cancelled();
    if (
      compiled &&
      (sourceState.generation !== compiled.generation ||
        sourceState.composerCanonicalSha256 !== compiled.composerSnapshot.seal.canonicalSha256)
    )
      throw cancelled();
    if (
      expectedBodyEpoch !== undefined &&
      (bodyEpoch !== expectedBodyEpoch || body.getSnapshot().status !== 'observed-body-bound')
    )
      throw cancelled();
    if (disposed || (signal && aborted(signal))) throw cancelled();
  };
  const unsubscribeBody = body.subscribe(() => {
    const next = body.getSnapshot();
    if (next === lastBody) return;
    lastBody = next;
    bodyEpoch += 1;
    if (operation?.usesBody) operation.controller.abort();
    releaseRuntime();
    if (!disposed) publish({ runtimeReport: null, frame16Report: null });
    if (!disposed && consumed && !operation)
      publish({
        status: 'local-frame-ready',
        detail: 'Review placement for the current displayed body.',
        runtimeReport: null,
        frame16Report: null,
      });
  });
  async function work<T>(
    usesBody: boolean,
    signal: AbortSignal | undefined,
    action: (signal: AbortSignal, check: () => void) => Promise<T>,
    kind: 'compile' | 'preview' = 'preview',
  ): Promise<T> {
    current(signal);
    if (operation) throw new Error('The saved cloth operation is already running.');
    const controller = new AbortController();
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const scope = { controller, usesBody, finished, kind };
    const expectedBodyEpoch = usesBody ? bodyEpoch : undefined;
    const cancel = () => controller.abort();
    if (signal) nativeAdd.call(signal, 'abort', cancel, { once: true });
    operation = scope;
    const check = () => current(controller.signal, expectedBodyEpoch);
    try {
      if (signal && aborted(signal)) cancel();
      check();
      const result = await action(controller.signal, check);
      check();
      return result;
    } catch (error) {
      releaseRuntime();
      if (!disposed)
        publish({
          status: 'blocked',
          detail: error instanceof Error ? error.message : 'Saved cloth operation failed.',
          runtimeReport: null,
          frame16Report: null,
          requiresReload,
        });
      throw error;
    } finally {
      if (signal) nativeRemove.call(signal, 'abort', cancel);
      if (operation === scope) operation = null;
      finish();
    }
  }
  const requireCompiled = () => {
    if (!compiled || !context)
      throw new Error('Confirm and compile the current saved assembly first.');
    return { compiled, context };
  };
  const readSavedPlacement = async (signal: AbortSignal, check: () => void) => {
    const { context } = requireCompiled();
    const bound = await context.bindExistingObservedPlacement(signal);
    check();
    if (!bound) return null;
    const result = await createPatternImportDxfProductCompositePlacementProductionReaderV1(
      context.readPlacementCurrent,
    ).readObserved(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V3,
        expectedRow: bound.authority.row,
        expectedBindings: bound.placementBindings,
      },
      bound.authority.serverAssemblyRevision,
      signal,
    );
    check();
    if (!result.ok) throw new Error(result.blockers.map((item) => item.detail).join(' '));
    return result.owner;
  };
  const prepareRuntime = async (signal: AbortSignal, check: () => void) => {
    const { compiled } = requireCompiled();
    releaseRuntime();
    publish({ status: 'building-runtime', detail: null, runtimeReport: null, frame16Report: null });
    const readCurrentPlacement = async (childSignal?: AbortSignal) => {
      check();
      const owner = await readSavedPlacement(childSignal ?? signal, check);
      if (!owner) throw new Error('No confirmed placement is saved for this assembly.');
      return owner;
    };
    const garment = await source.advanceSavedGarment(
      {
        expectedGeneration: compiled.generation,
        readCurrentPlacement,
      },
      signal,
    );
    check();
    if (!garment.ok) throw new Error(garment.detail);
    const result = await buildCurrentSavedModelObservedPlacementRuntimeSourceV1(
      body,
      source,
      compiled.generation,
      signal,
    );
    // A late child belongs to this host, even when the caller/body changed during the await.
    if (result.ok) runtime = result.owner;
    check();
    if (!result.ok) {
      publish({ status: 'blocked', detail: result.detail, runtimeReport: result.report ?? null });
      return result;
    }
    publish({ status: 'runtime-ready', detail: null, runtimeReport: result.report });
    return result;
  };
  const downstream: PatternImportDxfPhaseEMultiseamSavedDownstreamV2 = Object.freeze({
    targetEdgeMm: 12.5,
    ready: async (signal) => {
      current(signal);
    },
    consume: (request, signal) =>
      work(
        false,
        signal,
        async (local, check) => {
          if (consumed)
            throw new Error(
              'Reconfirm the assembly with a new cloth source before compiling again.',
            );
          consumed = true;
          publish({ status: 'compiling', detail: null });
          const result = await source.consume(request, local);
          check();
          if (!result.ok) throw new Error(`${result.stage}: ${result.detail}`);
          compiled = result.compile;
          context = createPatternImportDxfProductSavedPlacementProductionContextV1({
            row,
            compiled,
            readCurrentSession: source.snapshot,
          });
          check();
          publish({ status: 'local-frame-ready', generation: compiled.generation, detail: null });
          // The table receives its actual inner compile result. The one-shot source is never replayed.
          return result.compile;
        },
        'compile',
      ),
    physicalStage: () => ({
      stage: source.snapshot().blocker?.stage ?? 'actual-body',
      blockers: source.snapshot().blocker
        ? [{ code: source.snapshot().blocker!.code, detail: source.snapshot().blocker!.detail }]
        : [],
    }),
  });
  return Object.freeze({
    profile: 'observed-saved-model' as const,
    downstream,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    latestCompile: () => (compiled ? structuredClone(compiled) : null),
    onDisplayedBodyInputV1: body.onDisplayedBodyInputV1,
    async waitUntilIdle(signal: AbortSignal) {
      // View effect replay can overlap the tail of its own cancelled read. Wait locally,
      // without aborting a shared body read or consuming the saved source a second time.
      while (operation) {
        current(signal);
        const pending = operation.finished;
        await new Promise<void>((resolve, reject) => {
          const cancel = () => {
            cleanup();
            reject(cancelled());
          };
          const cleanup = () => nativeRemove.call(signal, 'abort', cancel);
          nativeAdd.call(signal, 'abort', cancel, { once: true });
          if (aborted(signal)) cancel();
          void pending.then(() => {
            cleanup();
            resolve();
          });
        });
      }
      current(signal);
    },
    authoring: (signal?: AbortSignal) =>
      work(true, signal, async (local, check) => {
        const { compiled, context } = requireCompiled();
        const metadata = await context.readObserved(local);
        check();
        const mesh = await source.projectLatestMesh(compiled.generation, local);
        check();
        const target = await body.projectCurrentPlacementTarget(local);
        check();
        if (!mesh || !target.ok)
          throw new Error('The current garment and displayed body are required.');
        publish({ status: 'authoring', detail: null });
        return { compiled: structuredClone(compiled), mesh: mesh.projection, target, metadata };
      }),
    savePlacement: (intent: QualifiedTwoPanelObservedPlacementIntentV1, signal?: AbortSignal) =>
      work(true, signal, async (local, check) => {
        const { compiled, context } = requireCompiled();
        if (requiresReload)
          throw new Error('Reload saved placement before attempting another save.');
        releaseRuntime();
        publish({ status: 'saving', detail: null, runtimeReport: null, frame16Report: null });
        const issued = await issueCurrentSavedModelObservedPlacementV3(
          body,
          source,
          {
            ...intent,
            confirmed: true,
            expectedGeneration: compiled.generation,
            readCurrentEvidence: context.readCurrentEvidence,
          },
          local,
        );
        if (!issued.ok) {
          check();
          throw new Error(issued.detail);
        }
        try {
          check();
          const bound = await context.bindConfirmedObservedPlacement(issued.owner, local);
          check();
          requiresReload = true;
          publish({ writeOutcome: 'unknown', requiresReload: true });
          const saved =
            await createPatternImportDxfProductCompositeObservedPlacementProductionSaverV3(
              context.readSaveCurrent,
            ).save(
              {
                confirmed: true,
                placementOwner: issued.owner,
                expectedPreviousOuterSha256: bound.expectedPreviousOuterSha256,
                current: {
                  authority: bound.authority,
                  placementBindings: bound.placementBindings,
                  exactNCurrent: bound.exactNCurrent,
                },
              },
              local,
            );
          // Record transport outcome even if the caller/body became stale while awaiting it.
          publish({ writeOutcome: saved.writeOutcome });
          if (saved.writeOutcome === 'not-attempted') requiresReload = false;
          check();
          if (!saved.ok)
            throw new Error(
              'Placement save was not verified. Reload before retrying. ' +
                saved.blockers.map((item) => item.detail).join(' '),
            );
          requiresReload = false;
          publish({ status: 'placement-ready', detail: null, requiresReload: false });
          return saved;
        } finally {
          disposeObservedPlacementSidecarIssuedV3(issued.owner);
        }
      }),
    reloadPlacement: (signal?: AbortSignal) =>
      work(false, signal, async (local, check) => {
        releaseRuntime();
        publish({ runtimeReport: null, frame16Report: null });
        const owner = await readSavedPlacement(local, check);
        requiresReload = false;
        publish({
          status: owner ? 'placement-ready' : 'placement-missing',
          detail: null,
          runtimeReport: null,
          frame16Report: null,
          requiresReload: false,
        });
        return Boolean(owner);
      }),
    buildRuntime: (signal?: AbortSignal) =>
      work(true, signal, async (local, check) => {
        const result = await prepareRuntime(local, check);
        return { ok: result.ok, report: result.report ?? null };
      }),
    run16: (canvas: HTMLCanvasElement, signal?: AbortSignal) =>
      work(true, signal, async (local, check) => {
        const prepared = await prepareRuntime(local, check);
        if (!prepared.ok) return { ok: false, report: null, projection: null };
        publish({ status: 'running', detail: null });
        const result = await runBetaSkirtSavedAnnularObservedPlacement16FrameContactV1(
          canvas,
          prepared.owner,
          { signal: local },
        );
        if ('owner' in result && result.owner) frame16 = result.owner;
        check();
        if (!result.ok) releaseRuntime();
        publish({
          status: result.ok ? 'frame16-ready' : 'blocked',
          detail: result.ok ? null : result.detail,
          frame16Report: frame16?.report ?? null,
        });
        // Only detached results leave the host; private runtime and renderer lifetimes stay here.
        return {
          ok: result.ok,
          report: state.frame16Report,
          projection: frame16
            ? projectBetaSkirtSavedAnnularObservedPlacement16FrameContactV1(frame16)
            : null,
        };
      }),
    run32: (
      computeCanvas: HTMLCanvasElement,
      displayCanvas: HTMLCanvasElement,
      signal?: AbortSignal,
    ) =>
      work(true, signal, async (local, check) => {
        if (!runtime || !frame16) throw new Error('Run the current 16-frame checkpoint first.');
        const previousPreview = preview;
        preview = null;
        previousPreview?.dispose();
        if (frame32) disposeBetaSkirtSavedAnnularObservedPlacement32FrameContactV1(frame32);
        frame32 = null;
        publish({ status: 'running', detail: null, frame32Report: null, heatmapReceipt: null });
        const result = await runBetaSkirtSavedAnnularObservedPlacement32FrameContactV1(
          computeCanvas,
          runtime,
          frame16,
          { signal: local },
        );
        if ('owner' in result && result.owner) frame32 = result.owner;
        check();
        if (!result.ok || !frame32) {
          releaseRuntime();
          publish({
            status: 'blocked',
            detail: result.ok ? 'The 32-frame owner is unavailable.' : result.detail,
          });
          return { ok: false, receipt: null };
        }
        preview = await createSavedObservedStrainHeatmapPreviewV1(
          displayCanvas,
          runtime,
          frame32,
          local,
        );
        const displayed = preview;
        nativeAdd.call(
          displayed.lifetime,
          'abort',
          () => {
            if (preview !== displayed) return;
            releaseRuntime();
            if (!disposed)
              publish({
                status: 'blocked',
                detail: 'The preview canvas was lost. Run the preview again.',
              });
          },
          { once: true },
        );
        if (aborted(displayed.lifetime)) {
          releaseRuntime();
          throw new Error('The preview canvas is unavailable.');
        }
        check();
        publish({
          status: 'preview-ready',
          detail: null,
          frame32Report: frame32.report,
          heatmapReceipt: preview.receipt,
        });
        return { ok: true, receipt: preview.receipt };
      }),
    stop() {
      // The table caller owns compilation; its signal and dispose() retain cancellation authority.
      // A newly mounted preview may replay cleanup before that handoff has fully settled.
      if (operation?.kind === 'compile') return;
      operation?.controller.abort();
      releaseRuntime();
      if (!disposed)
        publish({
          status: compiled ? 'local-frame-ready' : 'idle',
          detail: null,
          runtimeReport: null,
          frame16Report: null,
        });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      operation?.controller.abort();
      releaseRuntime();
      unsubscribeBody();
      context?.dispose();
      context = null;
      compiled = null;
      source.dispose();
      publish({ status: 'disposed', detail: null, runtimeReport: null, frame16Report: null });
      listeners.clear();
    },
  });
}
export type SavedObservedPhysicalHostV1 = ReturnType<typeof createSavedObservedPhysicalHostV1>;
