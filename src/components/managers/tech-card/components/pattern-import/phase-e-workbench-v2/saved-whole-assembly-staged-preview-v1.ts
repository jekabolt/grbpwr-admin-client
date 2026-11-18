import {
  projectCurrentModelDisplayedTriangleBodyInputV1,
  type ModelDisplayedTriangleBodyOwnedInputV1,
  type ModelDisplayedTriangleBodyInputProjectionV1,
} from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import type {
  continueStagedSourceCutFramesV1,
  runStagedSourceCutFramesV1,
} from 'components/cloth-simulation-spike/run-staged-source-cut-frames-v1';
import type { MeasurementSurfaceAcceptedClothV1 } from 'components/shared/measurement-watertight-surface-v1-stage';
import { inspectOwnedActiveXpbdDeviceLeaseV1 } from 'lib/cloth/runtime/webgpu/xpbd-device-session';
import type { SavedCompleteAssemblyNativeStitchAnchorsV1 } from './saved-complete-assembly-native-stitch-anchors-v1';
import type { RestoredWholeSourceCutPlacementV1 } from 'components/cloth-simulation-spike/prepare-saved-complete-whole-source-cut-v1';
import { DEFAULT_MEASUREMENT_PARTITIONED_SURFACE_CONTACT_BUDGET_V1 } from 'lib/cloth/body/measurement-surface-self-intersection-v1';
import type { SavedWholeAssemblyPlacementLayoutV10 } from './saved-whole-assembly-placement-document-v10';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical } from './saved-assembly-topology-hash-v1';

type Run = Parameters<typeof runStagedSourceCutFramesV1>[0];
type Command = Parameters<typeof continueStagedSourceCutFramesV1>[1];
type Receipt = Awaited<ReturnType<typeof runStagedSourceCutFramesV1>>;
type ActiveSeams = Receipt['validated'][number]['activeSeams'];
type Source = SavedCompleteAssemblyNativeStitchAnchorsV1;
type DisplayedBody = ModelDisplayedTriangleBodyInputProjectionV1;

export type SavedWholeAssemblyStagePlanV1 = Readonly<{
  source: Source;
  observedBody: DisplayedBody['hashes'];
  layout?: SavedWholeAssemblyPlacementLayoutV10;
  frame: Omit<Run['frame'], 'bodyPositionsM' | 'bodyTriangles' | 'intent'>;
  commands: readonly [Command, ...Command[]];
  options: Pick<
    Run,
    | 'maxCopyBytes'
    | 'maximumStepDisplacementM'
    | 'enableLocalClothContactResponse'
    | 'capDisplacementPerParticle'
  >;
  maxSurfaceTriangles: number;
  pieceColors: ReadonlyMap<string, number>;
}>;

export type PrepareSavedWholeAssemblyPreviewV1 = (
  source: Source,
  body: DisplayedBody,
  signal: AbortSignal,
  assertCurrentSource: () => boolean,
  savedPlacement?: RestoredWholeSourceCutPlacementV1,
) => Promise<SavedWholeAssemblyStagePlanV1>;

export type SavedWholeAssemblyPreviewProgressV1 = Readonly<{
  cloth: MeasurementSurfaceAcceptedClothV1;
  action: Command['action'];
  activeSeams: ActiveSeams;
  maximumGapMm: number;
  totalStages: number;
  stopped?: Readonly<{ operationNumber: number; detail: string }>;
}>;

type PrepareInput = Readonly<{
  source: Source;
  body: ModelDisplayedTriangleBodyOwnedInputV1;
  prepare: PrepareSavedWholeAssemblyPreviewV1;
  isCurrent: () => boolean;
  savedPlacement?: RestoredWholeSourceCutPlacementV1;
}>;

async function prepareCurrent(input: PrepareInput, signal: AbortSignal) {
  const { source, body, prepare, savedPlacement } = input;
  const isCurrent = () => !signal.aborted && input.isCurrent() && body.isCurrent();
  const requireCurrent = () => {
    signal.throwIfAborted();
    if (!isCurrent()) throw new Error('The saved assembly or displayed mannequin changed.');
  };
  requireCurrent();
  const displayed = projectCurrentModelDisplayedTriangleBodyInputV1(body);
  if (!displayed || source.unavailable.length > 0)
    throw new Error('The whole assembly requires current mannequin and native sewing inputs.');
  const plan = await prepare(source, displayed, signal, isCurrent, savedPlacement);
  requireCurrent();
  if (
    plan.source !== source ||
    plan.observedBody.bodyPositionsFloat32LeSha256 !==
      displayed.hashes.bodyPositionsFloat32LeSha256 ||
    plan.observedBody.bodyTrianglesUint32LeSha256 !== displayed.hashes.bodyTrianglesUint32LeSha256
  )
    throw new Error('The planned assembly differs from the current source or displayed body.');
  if (savedPlacement) {
    const saved = savedPlacement.layout;
    const layout = plan.layout;
    if (
      !layout ||
      layout.sizeId !== saved.sizeId ||
      layout.sizeToken !== saved.sizeToken ||
      layout.runtimeCandidateSha256 !== saved.runtimeCandidateSha256 ||
      layout.cutGraphSha256 !== saved.cutGraphSha256 ||
      canonical(layout.pieceRanges) !== canonical(saved.pieceRanges) ||
      layout.positionsM.length !== saved.positionsM.length ||
      layout.positionsM.some((coordinate, index) => coordinate !== saved.positionsM[index])
    )
      throw new Error('The current compiler did not restore the saved full-placement coordinates.');
  }
  return { plan, displayed, isCurrent, requireCurrent };
}

/** Captures only the current compiled initial placement, before any simulation has run. */
export async function readCurrentWholeAssemblyInitialPlacementV1(
  input: PrepareInput,
  signal: AbortSignal,
) {
  const { plan, displayed, requireCurrent } = await prepareCurrent(input, signal);
  const { layout } = plan;
  if (!layout)
    throw new Error('The current assembly compiler does not provide a saveable placement.');
  const [
    { snapshotGarmentStagedSourceCutCoreV1 },
    { prepareSourceCutContactMeshV1 },
    { prepareActualBodySourceCutContactV1 },
  ] = await Promise.all([
    import('lib/cloth/runtime/webgpu/garment-staged-source-cut-core-v1'),
    import('lib/cloth/runtime/cpu/source-cut-contact-mesh-v1'),
    import('components/cloth-simulation-spike/actual-body-source-cut-contact-v1'),
  ]);
  requireCurrent();
  const snapshot = snapshotGarmentStagedSourceCutCoreV1(plan.frame.material);
  const world = snapshot.uploads.positions;
  if (
    layout.positionsM.length !== (world.length / 4) * 3 ||
    layout.positionsM.some(
      (coordinate, index) => coordinate !== world[4 * Math.floor(index / 3) + (index % 3)],
    )
  )
    throw new Error('The full placement differs from the compiler’s initial coordinates.');

  const garment = prepareSourceCutContactMeshV1(snapshot.cut, plan.maxSurfaceTriangles);
  const body = prepareActualBodySourceCutContactV1(
    displayed.bodyPositionsM,
    displayed.bodyTriangles,
    130_000_000,
  );
  const signedVolume = body.bodyAudit.topology.signedVolumeM3;
  const triangleCount = garment.topology.reduce((sum, part) => sum + part.triangleCount, 0);
  const layeredBudget =
    triangleCount >= 30_000
      ? {
          ...DEFAULT_MEASUREMENT_PARTITIONED_SURFACE_CONTACT_BUDGET_V1,
          maxCandidatePairs: 1_200_000,
          maxPairVisits: 4_000_000,
        }
      : undefined;
  if (
    Math.abs(signedVolume) <= 1e-12 ||
    Math.sign(signedVolume) !== plan.frame.bodyOutwardSign ||
    !body.validateFrame(garment, world).passed ||
    !garment.validateSelfIntersection(world, layeredBudget).passed
  )
    throw new Error(
      'The initial arrangement did not pass exact cloth and mannequin contact checks.',
    );
  requireCurrent();
  return layout;
}

/** Hands the current saved source and rendered mannequin to the existing staged runtime. */
export async function runSavedWholeAssemblyStagedPreviewV1(
  input: PrepareInput &
    Readonly<{
      ownedLease: Run['ownedLease'];
      verifySource: (source: Source, signal: AbortSignal) => Promise<void>;
      onAccepted: (progress: SavedWholeAssemblyPreviewProgressV1) => void;
    }>,
  signal: AbortSignal,
): Promise<SavedWholeAssemblyPreviewProgressV1> {
  const { source, body, ownedLease, verifySource } = input;
  const { plan, isCurrent, requireCurrent } = await prepareCurrent(input, signal);

  const commands = plan.commands.map((command) => ({ ...command }));
  const [first, ...following] = commands;
  if (!first || first.action !== 'activate')
    throw new Error('The staged assembly has no first activation.');
  const [
    { runStagedSourceCutFramesV1: start, continueStagedSourceCutFramesV1: advance },
    { snapshotGarmentStagedSourceCutCoreV1 },
    { prepareSourceCutSurfaceProjectionV1 },
  ] = await Promise.all([
    import('components/cloth-simulation-spike/run-staged-source-cut-frames-v1'),
    import('lib/cloth/runtime/webgpu/garment-staged-source-cut-core-v1'),
    import('lib/cloth/runtime/cpu/source-cut-surface-projection-v1'),
  ]);
  const cut = snapshotGarmentStagedSourceCutCoreV1(plan.frame.material).cut;
  const surface = prepareSourceCutSurfaceProjectionV1(cut, plan.maxSurfaceTriangles);
  const ranges = Object.freeze(
    surface.drawRanges.map(({ pieceId, triangleOffset, triangleCount }) => {
      const color = plan.pieceColors.get(pieceId);
      if (color === undefined || !Number.isInteger(color) || color < 0 || color > 0xffffff)
        throw new Error(`The saved cloth surface has no display color for ${pieceId}.`);
      return Object.freeze({ triangleOffset, triangleCount, color });
    }),
  );

  await verifySource(source, signal);
  requireCurrent();
  const renderBody = projectCurrentModelDisplayedTriangleBodyInputV1(body);
  if (!renderBody) throw new Error('The displayed mannequin is no longer available.');
  let receipt = await start(
    {
      ...plan.options,
      ownedLease,
      assertCurrentSource: isCurrent,
      frame: {
        ...plan.frame,
        bodyPositionsM: renderBody.bodyPositionsM,
        bodyTriangles: renderBody.bodyTriangles,
        intent: first,
      },
    },
    signal,
  );
  async function publish(
    frameReceipt: Receipt,
    action: Command['action'],
  ): Promise<SavedWholeAssemblyPreviewProgressV1> {
    const frame = frameReceipt.validated.at(-1);
    if (!frame) throw new Error('The whole-assembly run did not accept a display frame.');
    const positionsM = surface.project(frameReceipt.positionsMInvMass);
    await verifySource(source, signal);
    requireCurrent();
    const progress = Object.freeze({
      cloth: Object.freeze({ positionsM, frameNumber: frame.frame, ranges, isCurrent }),
      action,
      activeSeams: frame.activeSeams,
      maximumGapMm: frame.activeSeams.reduce(
        (maximum, seam) => Math.max(maximum, seam.maximumGapM * 1000),
        0,
      ),
      totalStages: plan.frame.seams.stages.length,
    });
    input.onAccepted(progress);
    return progress;
  }

  let last = await publish(receipt, first.action);
  for (const command of following) {
    try {
      receipt = await advance(receipt, command, signal);
    } catch (error) {
      requireCurrent();
      const live = inspectOwnedActiveXpbdDeviceLeaseV1(ownedLease);
      if (!live.ok) throw error;
      live.assertActive();
      await verifySource(source, signal);
      requireCurrent();
      const stopped = {
        operationNumber: command.operationOrder,
        detail: error instanceof Error ? error.message : 'The next stage was refused.',
      };
      return Object.freeze({ ...last, stopped });
    }
    last = await publish(receipt, command.action);
  }
  return last;
}
