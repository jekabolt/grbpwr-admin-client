import {
  runBetaSkirtCanonicalMediumSavedRuntime16FrameV1,
  runBetaSkirtCanonicalMediumSavedRuntime32FrameSelfOrientationV1,
  runBetaSkirtCanonicalMediumSavedRuntime32FrameStateRetentionV5,
  runBetaSkirtCanonicalMediumSavedRuntime32FrameStaticResponseStrainHeatmapV1,
  runBetaSkirtCanonicalMediumSavedRuntime32FrameStaticResponseStrainV1,
  runBetaSkirtCanonicalMediumSavedRuntime32FrameStaticResponseV1,
  runBetaSkirtCanonicalMediumSavedRuntime32FrameV4,
} from './beta-skirt-canonical-medium-saved-runtime-source-v1';

type Execution<T extends { ok: boolean }> =
  Extract<T, { ok: true }> extends {
    execution: infer E;
  }
    ? E
    : never;
type Frame16 = Execution<
  Awaited<ReturnType<typeof runBetaSkirtCanonicalMediumSavedRuntime16FrameV1>>
>;
type Frame32 = Execution<
  Awaited<ReturnType<typeof runBetaSkirtCanonicalMediumSavedRuntime32FrameV4>>
>;
type SelfOrientation = Execution<
  Awaited<ReturnType<typeof runBetaSkirtCanonicalMediumSavedRuntime32FrameSelfOrientationV1>>
>;
type StateRetention = Execution<
  Awaited<ReturnType<typeof runBetaSkirtCanonicalMediumSavedRuntime32FrameStateRetentionV5>>
>;
type StaticResponse = Execution<
  Awaited<ReturnType<typeof runBetaSkirtCanonicalMediumSavedRuntime32FrameStaticResponseV1>>
>;
type CorrectedStrain = Execution<
  Awaited<ReturnType<typeof runBetaSkirtCanonicalMediumSavedRuntime32FrameStaticResponseStrainV1>>
>;
type Heatmap = Execution<
  Awaited<
    ReturnType<typeof runBetaSkirtCanonicalMediumSavedRuntime32FrameStaticResponseStrainHeatmapV1>
  >
>;

export type PatternImportDxfProductSavedPhysicalBetaPreviewReceiptsV1 = Readonly<{
  frame16: Frame16;
  frame32: Frame32;
  selfOrientation: SelfOrientation;
  stateRetention: StateRetention;
  staticResponse: StaticResponse;
  correctedStrain: CorrectedStrain;
  heatmap: Omit<Heatmap, 'session'>;
}>;
export type PatternImportDxfProductSavedPhysicalBetaPreviewStageV1 =
  keyof PatternImportDxfProductSavedPhysicalBetaPreviewReceiptsV1;
export type PatternImportDxfProductSavedPhysicalBetaPreviewResultV1 =
  | Readonly<{
      ok: true;
      session: Heatmap['session'];
      receipts: PatternImportDxfProductSavedPhysicalBetaPreviewReceiptsV1;
      rendererOwnershipTransferredToCaller: true;
    }>
  | Readonly<{
      ok: false;
      stage: PatternImportDxfProductSavedPhysicalBetaPreviewStageV1;
      code: string;
      detail: string;
      receipts: Readonly<Partial<PatternImportDxfProductSavedPhysicalBetaPreviewReceiptsV1>>;
    }>;

/**
 * Runs the existing saved 16→32F diagnostic and corrected dimensionless strain visualization.
 * Receipts retain their original provisional labels and authority limits. The runtime owner
 * remains caller-owned; the successful renderer session must also be disposed by its caller.
 * No runtime or solver state is changed beyond the existing one-shot wrapper commands.
 */
export async function runPatternImportDxfProductSavedPhysicalBetaPreviewV1(
  owner: unknown,
  computeCanvas: HTMLCanvasElement,
  displayCanvas: HTMLCanvasElement,
  signal?: AbortSignal,
): Promise<PatternImportDxfProductSavedPhysicalBetaPreviewResultV1> {
  const receipts: {
    -readonly [
      K in keyof PatternImportDxfProductSavedPhysicalBetaPreviewReceiptsV1
    ]?: PatternImportDxfProductSavedPhysicalBetaPreviewReceiptsV1[K];
  } = {};
  const fail = (
    stage: PatternImportDxfProductSavedPhysicalBetaPreviewStageV1,
    code: string,
    detail: string,
  ): PatternImportDxfProductSavedPhysicalBetaPreviewResultV1 =>
    Object.freeze({ ok: false, stage, code, detail, receipts: Object.freeze({ ...receipts }) });
  const aborted = (stage: PatternImportDxfProductSavedPhysicalBetaPreviewStageV1) =>
    fail(stage, 'aborted', 'Saved physical beta preview was cancelled.');
  const options = signal ? { signal } : {};

  const frame16 = await runBetaSkirtCanonicalMediumSavedRuntime16FrameV1(
    owner,
    computeCanvas,
    options,
  );
  if (!frame16.ok) return fail('frame16', frame16.code, frame16.detail);
  receipts.frame16 = frame16.execution;
  if (signal?.aborted) return aborted('frame32');
  const frame32 = await runBetaSkirtCanonicalMediumSavedRuntime32FrameV4(
    owner,
    computeCanvas,
    options,
  );
  if (!frame32.ok) return fail('frame32', frame32.code, frame32.detail);
  receipts.frame32 = frame32.execution;
  if (signal?.aborted) return aborted('selfOrientation');
  const selfOrientation =
    await runBetaSkirtCanonicalMediumSavedRuntime32FrameSelfOrientationV1(owner);
  if (!selfOrientation.ok)
    return fail('selfOrientation', selfOrientation.code, selfOrientation.detail);
  receipts.selfOrientation = selfOrientation.execution;
  if (signal?.aborted) return aborted('stateRetention');
  const stateRetention = await runBetaSkirtCanonicalMediumSavedRuntime32FrameStateRetentionV5(
    owner,
    computeCanvas,
    options,
  );
  if (!stateRetention.ok) return fail('stateRetention', stateRetention.code, stateRetention.detail);
  receipts.stateRetention = stateRetention.execution;
  if (signal?.aborted) return aborted('staticResponse');
  const staticResponse =
    await runBetaSkirtCanonicalMediumSavedRuntime32FrameStaticResponseV1(owner);
  if (!staticResponse.ok) return fail('staticResponse', staticResponse.code, staticResponse.detail);
  receipts.staticResponse = staticResponse.execution;
  // The pre-response self diagnostic may be blocked; only the corrected postgates admit rendering.
  if (staticResponse.execution.diagnosticBlocked)
    return fail(
      'staticResponse',
      'diagnostic-blocked',
      'Corrected static-response postgates are blocked.',
    );
  if (signal?.aborted) return aborted('correctedStrain');
  const correctedStrain =
    await runBetaSkirtCanonicalMediumSavedRuntime32FrameStaticResponseStrainV1(
      owner,
      computeCanvas,
      options,
    );
  if (!correctedStrain.ok)
    return fail('correctedStrain', correctedStrain.code, correctedStrain.detail);
  receipts.correctedStrain = correctedStrain.execution;
  if (signal?.aborted) return aborted('heatmap');
  const heatmap = await runBetaSkirtCanonicalMediumSavedRuntime32FrameStaticResponseStrainHeatmapV1(
    owner,
    displayCanvas,
  );
  if (!heatmap.ok) return fail('heatmap', heatmap.code, heatmap.detail);
  if (signal?.aborted) {
    heatmap.execution.session.dispose();
    return aborted('heatmap');
  }
  return Object.freeze({
    ok: true,
    session: heatmap.execution.session,
    rendererOwnershipTransferredToCaller: true,
    receipts: Object.freeze({
      frame16: frame16.execution,
      frame32: frame32.execution,
      selfOrientation: selfOrientation.execution,
      stateRetention: stateRetention.execution,
      staticResponse: staticResponse.execution,
      correctedStrain: correctedStrain.execution,
      heatmap: Object.freeze({
        report: heatmap.execution.report,
        adapterReport: heatmap.execution.adapterReport,
      }),
    }),
  });
}
