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
type SafeguardedStep = Receipt['safeguardedSteps'][number];
type FrameWork = Readonly<{
  safeguard?: Readonly<
    Pick<
      SafeguardedStep,
      'scale' | 'trialCount' | 'proposedDisplacementM' | 'acceptedDisplacementM'
    > & {
      heldParticleCount: number;
      repairedCutPairCount: number;
      firstCappedTrial?: Readonly<
        Pick<
          NonNullable<SafeguardedStep['firstCappedTrialContact']>,
          'bodyIntersections' | 'bodyPairsWithoutClearance' | 'clothIntersections'
        >
      >;
    }
  >;
  bodyQuery?: Readonly<NonNullable<Receipt['bodyQueryWork']>[number]>;
}>;
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

export type SavedWholeAssemblyResumeV1 = Readonly<{ lastAcceptedFrame: number }>;

export type SavedWholeAssemblyPreviewProgressV1 = Readonly<{
  cloth: MeasurementSurfaceAcceptedClothV1;
  action: Command['action'];
  activeSeams: ActiveSeams;
  maximumGapMm: number;
  totalStages: number;
  frameWork: FrameWork;
  paused?: SavedWholeAssemblyResumeV1;
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

type SurfaceProjection = ReturnType<
  typeof import('lib/cloth/runtime/cpu/source-cut-surface-projection-v1').prepareSourceCutSurfaceProjectionV1
>;
type PausedRun = Readonly<{
  source: Source;
  body: ModelDisplayedTriangleBodyOwnedInputV1;
  observedBody: DisplayedBody['hashes'];
  commands: readonly Command[];
  totalStages: number;
  receipt: Receipt;
  nextCommand: number;
  surface: SurfaceProjection;
  ranges: MeasurementSurfaceAcceptedClothV1['ranges'];
  last: SavedWholeAssemblyPreviewProgressV1;
}>;
const suspended = new WeakMap<SavedWholeAssemblyResumeV1, PausedRun>();

/** Begins or continues the same accepted whole-assembly material and render program. */
export async function runSavedWholeAssemblyStagedPreviewV1(
  input: Omit<PrepareInput, 'source'> &
    (
      | Readonly<{ source: Source; resume?: SavedWholeAssemblyResumeV1 }>
      | Readonly<{ source?: never; resume: SavedWholeAssemblyResumeV1 }>
    ) &
    Readonly<{
      ownedLease: Run['ownedLease'];
      verifySource: (source: Source, signal: AbortSignal) => Promise<void>;
      onAccepted: (progress: SavedWholeAssemblyPreviewProgressV1) => void;
      pauseAfterAccepted?: () => boolean;
    }>,
  signal: AbortSignal,
): Promise<SavedWholeAssemblyPreviewProgressV1> {
  const { body, ownedLease, verifySource, resume } = input;
  // A paused display and the ROOT program outlive the abort signal of the released device.
  const isCurrent = () => input.isCurrent() && body.isCurrent();
  const requireCurrent = () => {
    signal.throwIfAborted();
    if (!isCurrent()) throw new Error('The saved assembly or displayed mannequin changed.');
  };
  requireCurrent();
  const prior = resume ? suspended.get(resume) : undefined;
  if (resume && !prior)
    throw new Error('The accepted whole-assembly frame is no longer resumable.');
  const source = input.source ?? prior?.source;
  if (!source) throw new Error('The current native assembly is unavailable.');
  const renderBody = projectCurrentModelDisplayedTriangleBodyInputV1(body);
  if (!renderBody) throw new Error('The displayed mannequin is no longer available.');
  if (
    prior &&
    (prior.body !== body ||
      prior.observedBody.bodyPositionsFloat32LeSha256 !==
        renderBody.hashes.bodyPositionsFloat32LeSha256 ||
      prior.observedBody.bodyTrianglesUint32LeSha256 !==
        renderBody.hashes.bodyTrianglesUint32LeSha256 ||
      prior.source.sourceSha256 !== source.sourceSha256 ||
      prior.source.serverAssemblyRevision !== source.serverAssemblyRevision ||
      prior.source.sizeId !== source.sizeId ||
      prior.source.savedCarrier?.mediaType !== source.savedCarrier?.mediaType ||
      prior.source.savedCarrier?.sidecarSha256 !== source.savedCarrier?.sidecarSha256 ||
      source.unavailable.length > 0)
  ) {
    suspended.delete(resume!);
    throw new Error('The accepted assembly belongs to a different source or mannequin.');
  }

  const {
    runStagedSourceCutFramesV1: start,
    continueStagedSourceCutFramesV1: advance,
    resumeStagedSourceCutFramesV1: resumeOnLease,
  } = await import('components/cloth-simulation-spike/run-staged-source-cut-frames-v1');

  async function initialize(source: Source) {
    const { plan } = await prepareCurrent({ ...input, source }, signal);
    const commands = plan.commands.map((command) => ({ ...command }));
    if (commands[0]?.action !== 'activate')
      throw new Error('The staged assembly has no first activation.');
    const [{ snapshotGarmentStagedSourceCutCoreV1 }, { prepareSourceCutSurfaceProjectionV1 }] =
      await Promise.all([
        import('lib/cloth/runtime/webgpu/garment-staged-source-cut-core-v1'),
        import('lib/cloth/runtime/cpu/source-cut-surface-projection-v1'),
      ]);
    const cut = snapshotGarmentStagedSourceCutCoreV1(plan.frame.material).cut;
    const surface = prepareSourceCutSurfaceProjectionV1(cut, plan.maxSurfaceTriangles);
    const uniqueCuts = new Map<string, Source['sourceCuts'][number] | null>();
    for (const cut of source.sourceCuts) {
      uniqueCuts.set(cut.pieceLineKey, uniqueCuts.has(cut.pieceLineKey) ? null : cut);
    }
    const ranges = Object.freeze(
      surface.drawRanges.map(({ pieceId, triangleOffset, triangleCount }) => {
        const color = plan.pieceColors.get(pieceId);
        if (color === undefined || !Number.isInteger(color) || color < 0 || color > 0xffffff)
          throw new Error(`The saved cloth surface has no display color for ${pieceId}.`);
        const cut =
          surface.drawRanges.filter((range) => range.pieceId === pieceId).length === 1
            ? uniqueCuts.get(pieceId)
            : null;
        const sourcePiece =
          cut && cut.sizeToken === source.sizeToken
            ? Object.freeze({
                row: cut.row,
                sizeToken: cut.sizeToken,
                pieceId: cut.pieceId,
                pieceLineKey: cut.pieceLineKey,
                sourceInstancePath: cut.sourceInstancePath,
              })
            : undefined;
        return Object.freeze({
          triangleOffset,
          triangleCount,
          color,
          ...(sourcePiece && { sourcePiece }),
        });
      }),
    );
    return {
      plan,
      commands,
      surface,
      ranges,
      observedBody: plan.observedBody,
      totalStages: plan.frame.seams.stages.length,
    };
  }
  const initial = prior ? undefined : await initialize(source);
  const { commands, surface, ranges, observedBody, totalStages } = prior ?? initial!;

  await verifySource(source, signal);
  requireCurrent();
  let receipt = prior?.receipt;
  let last = prior?.last;
  const begin = prior?.nextCommand ?? 0;
  for (let index = begin; index < commands.length; index++) {
    const command = commands[index]!;
    try {
      if (!receipt) {
        receipt = await start(
          {
            ...initial!.plan.options,
            ownedLease,
            assertCurrentSource: isCurrent,
            frame: {
              ...initial!.plan.frame,
              bodyPositionsM: renderBody.bodyPositionsM,
              bodyTriangles: renderBody.bodyTriangles,
              intent: command,
            },
          },
          signal,
        );
      } else if (prior && index === begin) {
        receipt = await resumeOnLease(receipt, command, ownedLease, signal);
        suspended.delete(resume!);
      } else {
        receipt = await advance(receipt, command, signal);
      }
    } catch (error) {
      if (!last) throw error;
      requireCurrent();
      const live = inspectOwnedActiveXpbdDeviceLeaseV1(ownedLease);
      if (!live.ok) throw error;
      live.assertActive();
      await verifySource(source, signal);
      requireCurrent();
      if (resume) suspended.delete(resume);
      return Object.freeze({
        ...last,
        stopped: {
          operationNumber: command.operationOrder,
          detail: error instanceof Error ? error.message : 'The next stage was refused.',
        },
      });
    }

    const frame = receipt.validated.at(-1);
    if (!frame) throw new Error('The whole-assembly run did not accept a display frame.');
    const positionsM = surface.project(receipt.positionsMInvMass);
    await verifySource(source, signal);
    requireCurrent();
    const step = receipt.safeguardedSteps.at(-1);
    const bodyQuery = receipt.bodyQueryWork?.at(-1);
    const first = step?.firstCappedTrialContact;
    const frameWork: FrameWork = Object.freeze({
      safeguard:
        step?.frame === frame.frame
          ? Object.freeze({
              scale: step.scale,
              trialCount: step.trialCount,
              proposedDisplacementM: step.proposedDisplacementM,
              acceptedDisplacementM: step.acceptedDisplacementM,
              heldParticleCount: step.heldParticleCount ?? 0,
              repairedCutPairCount: step.repairedCutPairs?.length ?? 0,
              firstCappedTrial:
                first &&
                Object.freeze({
                  bodyIntersections: first.bodyIntersections,
                  bodyPairsWithoutClearance: first.bodyPairsWithoutClearance,
                  clothIntersections: first.clothIntersections,
                }),
            })
          : undefined,
      bodyQuery: bodyQuery?.frame === frame.frame ? Object.freeze({ ...bodyQuery }) : undefined,
    });
    last = Object.freeze({
      cloth: Object.freeze({ positionsM, frameNumber: frame.frame, ranges, isCurrent }),
      frameWork,
      action: command.action,
      activeSeams: frame.activeSeams,
      maximumGapMm: frame.activeSeams.reduce(
        (maximum, seam) => Math.max(maximum, seam.maximumGapM * 1000),
        0,
      ),
      totalStages,
    });
    input.onAccepted(last);
    if (index + 1 < commands.length && input.pauseAfterAccepted) {
      // Let the accepted frame and any pending controls update before starting another command.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      requireCurrent();
      if (!input.pauseAfterAccepted()) continue;
      const paused = Object.freeze({ lastAcceptedFrame: frame.frame });
      suspended.set(paused, {
        source,
        body,
        observedBody,
        totalStages,
        receipt,
        commands,
        nextCommand: index + 1,
        surface,
        ranges,
        last,
      });
      return Object.freeze({ ...last, paused });
    }
  }
  if (!last) throw new Error('The whole-assembly run did not accept a display frame.');
  return last;
}
