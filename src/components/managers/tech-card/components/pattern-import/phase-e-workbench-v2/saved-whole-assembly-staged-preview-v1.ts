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
import type { SavedCompleteAssemblyNativeStitchAnchorsV1 } from './saved-complete-assembly-native-stitch-anchors-v1';

type Run = Parameters<typeof runStagedSourceCutFramesV1>[0];
type Command = Parameters<typeof continueStagedSourceCutFramesV1>[1];
type Source = SavedCompleteAssemblyNativeStitchAnchorsV1;
type DisplayedBody = ModelDisplayedTriangleBodyInputProjectionV1;

export type SavedWholeAssemblyStagePlanV1 = Readonly<{
  source: Source;
  observedBody: DisplayedBody['hashes'];
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
) => Promise<SavedWholeAssemblyStagePlanV1>;

/** Hands the current saved source and rendered mannequin to the existing staged runtime. */
export async function runSavedWholeAssemblyStagedPreviewV1(
  input: Readonly<{
    source: Source;
    body: ModelDisplayedTriangleBodyOwnedInputV1;
    ownedLease: Run['ownedLease'];
    prepare: PrepareSavedWholeAssemblyPreviewV1;
    isCurrent: () => boolean;
    verifySource: (source: Source, signal: AbortSignal) => Promise<void>;
  }>,
  signal: AbortSignal,
): Promise<MeasurementSurfaceAcceptedClothV1> {
  const { source, body, ownedLease, prepare, verifySource } = input;
  const isCurrent = () => !signal.aborted && input.isCurrent() && body.isCurrent();
  const requireCurrent = () => {
    signal.throwIfAborted();
    if (!isCurrent()) throw new Error('The saved assembly or displayed mannequin changed.');
  };
  requireCurrent();
  const displayed = projectCurrentModelDisplayedTriangleBodyInputV1(body);
  if (!displayed || source.unavailable.length > 0)
    throw new Error('The whole assembly requires current mannequin and native sewing inputs.');

  const plan = await prepare(source, displayed, signal, isCurrent);
  requireCurrent();
  if (
    plan.source !== source ||
    plan.observedBody.bodyPositionsFloat32LeSha256 !==
      displayed.hashes.bodyPositionsFloat32LeSha256 ||
    plan.observedBody.bodyTrianglesUint32LeSha256 !== displayed.hashes.bodyTrianglesUint32LeSha256
  )
    throw new Error('The planned assembly differs from the current source or displayed body.');

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
  for (const command of following) receipt = await advance(receipt, command, signal);
  const frame = receipt.validated.at(-1);
  if (!frame) throw new Error('The whole-assembly run did not accept a display frame.');
  const positionsM = surface.project(receipt.positionsMInvMass);
  await verifySource(source, signal);
  requireCurrent();
  return Object.freeze({ positionsM, frameNumber: frame.frame, ranges, isCurrent });
}
