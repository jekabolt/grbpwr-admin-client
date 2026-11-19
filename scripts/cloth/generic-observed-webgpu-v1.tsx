import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { Button } from 'ui';
import {
  PatternImportDxfPhaseECadMannequinModelPickerViewV1,
  usePatternImportDxfPhaseECadMannequinPoseSessionV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-workbench-mannequin-model-picker-v1';
import {
  projectCurrentModelDisplayedTriangleBodyInputV1,
  type ModelDisplayedTriangleBodyOwnedInputV1,
} from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import {
  adoptSavedModelDisplayedTriangleBodyV2,
  createSavedModelDisplayedTriangleBodyOwnerV2,
  disposeSavedModelDisplayedTriangleBodyOwnerV2,
  type SavedModelDisplayedTriangleBodyBindingV2,
  type SavedModelDisplayedTriangleBodyOwnerV2,
} from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import { createThreePanelDxfMaterialCompileFixtureV1 } from 'lib/cloth/domain/dxf-garment-assembly-material-compile-stage-v1.test-fixture';
import { buildDxfAssemblyHandoffV1 } from 'lib/cloth/domain/dxf-assembly-handoff-v1';
import { compileDxfGarmentAssemblyMaterialStageV1 } from 'lib/cloth/domain/dxf-garment-assembly-material-compile-stage-v1';
import {
  buildDxfGarmentAssemblyExplicitPlacementStageV1,
  DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
  type DxfGarmentAssemblyExplicitPlacementStageRequestV1,
} from 'lib/cloth/domain/dxf-garment-assembly-explicit-placement-stage-v1';
import {
  buildGarmentMaterialRunPlanV1,
  GARMENT_MATERIAL_RUN_PLAN_V1,
} from 'lib/cloth/runtime/webgpu/garment-material-run-plan-v1';
import {
  createXpbdDeviceSession,
  inspectOwnedActiveXpbdDeviceLeaseV1,
  type XpbdDeviceLease,
  type XpbdDeviceSession,
} from 'lib/cloth/runtime/webgpu/xpbd-device-session';
import {
  DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_V1,
  DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_PROFILE_V1,
  runDxfGarmentObservedWebgpu16ReplayV1,
  runDxfGarmentObservedWebgpu32ReplayV1,
  projectDxfGarmentObservedWebgpuReplayV1,
  disposeDxfGarmentObservedWebgpuReplayV1,
  type DxfGarmentObservedWebgpuReplayRequestV1,
} from 'components/cloth-simulation-spike/dxf-garment-observed-webgpu-replay-v1';
import { readFixtureObservedModelV1 } from './saved-observed-product-panel-v1.fixture-transport';
import { createDxfGarmentObservedStrainHeatmapPreviewV1 } from 'components/cloth-simulation-spike/dxf-garment-observed-strain-heatmap-preview-v1';
import '../../src/global.css';

/** Browser-only numeric evidence, never an authenticated saved-card or fit preview. */
const model = readFixtureObservedModelV1();
const models = [model];
const parameters = {
  dtS: 1 / 120,
  solverIterations: 8,
  gravityMps2Y: -9.81,
  windAccelerationMps2Z: 0,
  distanceComplianceMPerN: 2e-7,
  seamComplianceMPerN: 1e-8,
};
const coreBudgets = {
  maxParticles: 1000,
  maxTriangles: 2000,
  maxConstraintCount: 10000,
  maxGpuBytes: 8 * 1024 * 1024,
  maxDispatches: 100000,
  maxConstraintInvocations: 10000000,
  maxWorkgroupsPerDispatch: 65535,
};
const executionBudgets = {
  maxGpuBytes: 16 * 1024 * 1024,
  maxCpuBytes: 64 * 1024 * 1024,
  maxDispatches: 100000,
  maxPaddedInvocations: 10000000,
  maxContactTriangleVisits: 500000000,
  maxCopyBytes: 16 * 1024 * 1024,
  maxCopies: 1000,
  maxSubmissions: 33,
};
type Outcome = Awaited<ReturnType<typeof runDxfGarmentObservedWebgpu16ReplayV1>>;
type Projection = Awaited<ReturnType<typeof projectDxfGarmentObservedWebgpuReplayV1>>;
const evidence = {
  status: 'waiting-for-displayed-body' as string,
  phase: 'mount',
  error: null as string | null,
  fixtureModelAndDxfOnly: true,
  actualDisplayedV11Body: true,
  authenticatedSavedCardAcceptance: false,
  fitQualified: false,
  bodyBinding: null as SavedModelDisplayedTriangleBodyBindingV2 | null,
  freshModelReads: 0,
  result16: null as Outcome['report'] | null,
  result32: null as Outcome['report'] | null,
  frame16: null as Projection,
  frame32: null as Projection,
  previewReceipt: null as
    | Awaited<ReturnType<typeof createDxfGarmentObservedStrainHeatmapPreviewV1>>['receipt']
    | null,
  previewClearedOnRelease: false,
  borrowedBodySurvived: false,
  leaseReleasedByHarness: false,
  cleanupWaitingForQueue: false,
  cleanupCompleted: false,
  sessionCleanup: null as Awaited<
    ReturnType<Awaited<ReturnType<typeof createXpbdDeviceSession>>['dispose']>
  > | null,
};
declare global {
  var __GENERIC_OBSERVED_WEBGPU_V1__: typeof evidence | undefined;
}
globalThis.__GENERIC_OBSERVED_WEBGPU_V1__ = evidence;

async function prepareNumericSource() {
  const fixture = await createThreePanelDxfMaterialCompileFixtureV1('separated');
  const ids = new Map(fixture.request.materials.map((m) => [m.id, `browser-isotropic-${m.id}`]));
  const handoff = await buildDxfAssemblyHandoffV1({
    ...fixture.candidate,
    materials: fixture.candidate.materials.map((m) => ({ ...m, id: ids.get(m.id)! })),
  });
  if (!handoff.ok) throw new Error(handoff.errors.join('; '));
  const sourceRequest = {
    ...fixture.request,
    handoff: handoff.value,
    materials: fixture.request.materials.map((m, i) => ({
      ...m,
      id: ids.get(m.id)!,
      label: 'Explicit browser diagnostic isotropic material',
      provenance: {
        ...m.provenance,
        description: 'Uncalibrated numeric fixture; no garment fit or material-failure claim.',
        sourceReference: 'scripts/cloth/generic-observed-webgpu-v1.tsx',
      },
      bendComplianceInvNm: { warp: i ? 0.0011 : 0.0006, weft: i ? 0.0011 : 0.0006 },
    })),
    continuumMaterials: fixture.request.continuumMaterials.map((m) => ({
      ...m,
      materialId: ids.get(m.materialId)!,
      provenance: { ...m.provenance, sourceId: 'explicit-isotropic-browser-diagnostic' },
    })),
  };
  const compiled = await compileDxfGarmentAssemblyMaterialStageV1(sourceRequest);
  if (!compiled.compiled) throw new Error(JSON.stringify(compiled.blockers));
  // The DXF declares three 100mm panels at x=0/200/400mm. These explicit authored rigid
  // placements join A-right/B-left and B-right/C-left. No body-derived positioning or inference.
  const placementRequest: DxfGarmentAssemblyExplicitPlacementStageRequestV1 = {
    schemaVersion: DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
    sourceRequest,
    sourceArtifact: compiled.artifact,
    expectedSourceInputSha256: compiled.artifact.sourceEvidence.inputSha256,
    placements: [0, 1, 2].map((index) => ({
      pieceId: ['panel-a', 'panel-b', 'panel-c'][index],
      sourceOriginM: [index * 0.2, 0, 0],
      rotationRowMajor: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      translationM: [-0.15 + index * 0.1, 1.2, 0.45],
    })),
  };
  const placed = await buildDxfGarmentAssemblyExplicitPlacementStageV1(placementRequest);
  if (!placed.ok || !placed.artifact.sealedSimulation)
    throw new Error(JSON.stringify(placed.blockers));
  const planned = await buildGarmentMaterialRunPlanV1({
    schemaVersion: GARMENT_MATERIAL_RUN_PLAN_V1,
    sealedSimulation: placed.artifact.sealedSimulation,
    expectedPackageSha256: placed.artifact.sealedSimulation.seal.aggregateSha256,
    pieceRanges: compiled.artifact.refinement.mesh.pieceRanges,
    parameters: { ...parameters, frameCount: 16 },
    budgets: coreBudgets,
  });
  if (!planned.ok) throw new Error(JSON.stringify(planned.blockers));
  return {
    placementRequest,
    expected: {
      placementReportSha256: placed.artifact.report.reportSha256,
      prefixPlanSha256: planned.plan.planSha256,
    },
  };
}

function Harness() {
  const pose = usePatternImportDxfPhaseECadMannequinPoseSessionV1(model.id!);
  const bodyRef = useRef<{
    input: ModelDisplayedTriangleBodyOwnedInputV1;
    owner: SavedModelDisplayedTriangleBodyOwnerV2;
    binding: SavedModelDisplayedTriangleBodyBindingV2 | null;
  } | null>(null);
  const active = useRef<AbortController | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const displayCanvas = useRef<HTMLCanvasElement | null>(null);
  const releasePreview = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState(evidence.status);
  const statusTo = (value: string) => {
    evidence.status = value;
    setStatus(value);
  };
  const observe = useCallback((input: ModelDisplayedTriangleBodyOwnedInputV1 | null) => {
    active.current?.abort();
    const old = bodyRef.current;
    bodyRef.current = null;
    if (old) disposeSavedModelDisplayedTriangleBodyOwnerV2(old.owner);
    evidence.bodyBinding = null;
    if (!input) {
      evidence.status = 'waiting-for-displayed-body';
      setStatus(evidence.status);
      return;
    }
    const projected = projectCurrentModelDisplayedTriangleBodyInputV1(input);
    if (!projected) return;
    const owner = createSavedModelDisplayedTriangleBodyOwnerV2();
    const turn = { input, owner, binding: null as SavedModelDisplayedTriangleBodyBindingV2 | null };
    bodyRef.current = turn;
    void adoptSavedModelDisplayedTriangleBodyV2(owner, {
      displayedInput: input,
      expectedDisplayedIdentity: projected.identity,
      expectedPersistedModel: { id: model.id!, updatedAt: model.updatedAt! },
      readCurrentModel: async () => {
        evidence.freshModelReads++;
        return readFixtureObservedModelV1();
      },
    })
      .then((result) => {
        if (bodyRef.current !== turn) return;
        if (result.status === 'blocked') {
          evidence.error = result.detail;
          evidence.status = 'body-blocked';
        } else {
          turn.binding = result.snapshot.binding;
          evidence.bodyBinding = result.snapshot.binding;
          evidence.status = 'ready';
        }
        setStatus(evidence.status);
      })
      .catch((error: unknown) => {
        if (bodyRef.current !== turn) return;
        evidence.error = error instanceof Error ? error.message : String(error);
        evidence.status = 'body-blocked';
        setStatus(evidence.status);
      });
  }, []);
  useEffect(
    () => () => {
      active.current?.abort();
      if (bodyRef.current) disposeSavedModelDisplayedTriangleBodyOwnerV2(bodyRef.current.owner);
      bodyRef.current = null;
    },
    [],
  );
  const run = async () => {
    const body = bodyRef.current;
    if (!body?.binding || !canvas.current || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    let session: XpbdDeviceSession | null = null;
    let lease: XpbdDeviceLease | null = null;
    let preview: Awaited<ReturnType<typeof createDxfGarmentObservedStrainHeatmapPreviewV1>> | null =
      null;
    const owners: NonNullable<Outcome['owner']>[] = [];
    statusTo('running');
    try {
      evidence.phase = 'real-dxf-compile-and-explicit-placement';
      const prepared = await prepareNumericSource();
      if (controller.signal.aborted || bodyRef.current !== body) throw new Error('Body changed.');
      evidence.phase = 'acquire-single-genuine-device';
      session = await createXpbdDeviceSession(canvas.current);
      lease = session.acquireExclusive();
      const request: DxfGarmentObservedWebgpuReplayRequestV1 = {
        schemaVersion: DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_V1,
        profile: DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_PROFILE_V1,
        ...prepared,
        bodyOwner: body.owner,
        bodyBinding: body.binding,
        hostCompileGeneration: 1,
        parameters,
        coreBudgets,
        executionBudgets,
        timeoutMs: 300000,
      };
      evidence.phase = 'actual-webgpu16';
      const sixteen = await runDxfGarmentObservedWebgpu16ReplayV1(
        request,
        lease,
        controller.signal,
      );
      evidence.result16 = sixteen.report;
      if (!sixteen.ok) throw new Error(sixteen.blockers.join('; '));
      owners.push(sixteen.owner);
      evidence.frame16 = await projectDxfGarmentObservedWebgpuReplayV1(sixteen.owner);
      evidence.phase = 'actual-webgpu32-replay';
      const thirtyTwo = await runDxfGarmentObservedWebgpu32ReplayV1(
        request,
        sixteen.owner,
        lease,
        controller.signal,
      );
      evidence.result32 = thirtyTwo.report;
      if (!thirtyTwo.ok) throw new Error(thirtyTwo.blockers.join('; '));
      owners.push(thirtyTwo.owner);
      evidence.frame32 = await projectDxfGarmentObservedWebgpuReplayV1(thirtyTwo.owner);
      if (!evidence.frame16 || !evidence.frame32)
        throw new Error('Fresh replay projection failed.');
      if (!displayCanvas.current) throw new Error('Preview display is missing.');
      evidence.phase = 'render-exact-frame32';
      preview = await createDxfGarmentObservedStrainHeatmapPreviewV1(
        displayCanvas.current,
        thirtyTwo.owner,
        controller.signal,
      );
      evidence.previewReceipt = preview.receipt;
      evidence.borrowedBodySurvived = inputCurrent(body.input);
      // Keep the genuine replay and its lease alive for the browser to capture the visible frame.
      // A bounded fallback and cancellation both release it if the screenshot step fails.
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          controller.signal.removeEventListener('abort', finish);
          releasePreview.current = null;
          resolve();
        };
        const timer = setTimeout(finish, 30000);
        releasePreview.current = finish;
        controller.signal.addEventListener('abort', finish, { once: true });
        statusTo('preview-ready');
        if (controller.signal.aborted) finish();
      });
      if (controller.signal.aborted) throw new Error('Preview source was revoked.');
      evidence.phase = 'completed';
      statusTo('completed');
    } catch (error) {
      evidence.error = error instanceof Error ? error.message : String(error);
      statusTo('blocked');
    } finally {
      preview?.dispose();
      evidence.previewClearedOnRelease = preview ? preview.lifetime.aborted : false;
      for (const owner of owners.reverse()) disposeDxfGarmentObservedWebgpuReplayV1(owner);
      // The harness owns this session. Explicitly drain before release: session.dispose()
      // destroys the device and does not itself wait for pending submitted work.
      if (lease) {
        const inspection = inspectOwnedActiveXpbdDeviceLeaseV1(lease);
        if (inspection.ok) {
          evidence.cleanupWaitingForQueue = true;
          try {
            await inspection.queue.onSubmittedWorkDone();
          } catch (error) {
            evidence.error ??= error instanceof Error ? error.message : String(error);
            statusTo('blocked');
          }
          evidence.cleanupWaitingForQueue = false;
        }
        lease.release();
        evidence.leaseReleasedByHarness = true;
      }
      if (session) evidence.sessionCleanup = await session.dispose();
      controller.abort();
      active.current = null;
      evidence.cleanupCompleted = true;
    }
  };
  return (
    <>
      <p className='mb-4'>
        Numeric WebGPU check: three explicit DXF panels in front of the actual displayed V11 body.
        This is a free patch, not a fitted garment or a saved-card acceptance test.
      </p>
      <div style={{ height: 760 }}>
        <PatternImportDxfPhaseECadMannequinModelPickerViewV1
          models={models}
          modelId={model.id!}
          sizeName={String}
          onModelChange={() => {}}
          poseBinding={pose.binding}
          poseLoading={pose.loading}
          onDisplayedBodyInputV1={observe}
        />
      </div>
      <canvas ref={canvas} width={16} height={16} aria-label='Numeric WebGPU device context' />
      <canvas
        ref={displayCanvas}
        width={640}
        height={720}
        aria-label='Actual generic frame32 strain preview'
      />
      <p>Strain utilization · dimensionless · display range 0–2 · not stress in Pa or fit</p>
      <Button disabled={status !== 'ready'} onClick={() => void run()}>
        Run genuine generic 16 / 32
      </Button>
      <Button disabled={status !== 'preview-ready'} onClick={() => releasePreview.current?.()}>
        Release numeric preview
      </Button>
      <p role='status'>{status}</p>
    </>
  );
}
function inputCurrent(input: ModelDisplayedTriangleBodyOwnedInputV1) {
  return projectCurrentModelDisplayedTriangleBodyInputV1(input) !== null;
}
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const mount = document.querySelector('[data-generic-observed-webgpu]');
if (!mount) throw new Error('Generic browser harness mount missing.');
createRoot(mount).render(
  <QueryClientProvider client={queryClient}>
    <MemoryRouter>
      <DictionaryProvider>
        <Harness />
      </DictionaryProvider>
    </MemoryRouter>
  </QueryClientProvider>,
);
