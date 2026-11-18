import { prepareActualBodySourceCutContactV1 } from 'components/cloth-simulation-spike/actual-body-source-cut-contact-v1';
import {
  projectCurrentModelDisplayedTriangleBodyInputV1,
  type ModelDisplayedTriangleBodyOwnedInputV1,
} from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import { prepareDirectedSourceCutPreviewV1 } from 'components/cloth-simulation-spike/run-directed-source-cut-preview-v1';
import { prepareSourceCutContactMeshV1 } from 'lib/cloth/runtime/cpu/source-cut-contact-mesh-v1';
import { snapshotGarmentStagedSourceCutCoreV1 } from 'lib/cloth/runtime/webgpu/garment-staged-source-cut-core-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical } from './saved-assembly-topology-hash-v1';
import { buildSavedCrossMaterialDiagnosticInputsV1 } from './saved-complete-assembly-native-preview-v8';
import type { readSavedCompleteAssemblyNativePhysicalSourceV8 } from './saved-complete-assembly-native-stitch-review-v8';
import { buildSavedCrossMaterialPlacementDocumentV9 } from './saved-cross-material-placement-document-v9';
import { readCurrentSavedNeutralPlacementModelV1 } from './saved-cross-material-placement-model-binding-v1';

/** Prepares initial placement on the currently displayed body without requesting a device. */
export async function prepareCurrentSavedCrossMaterialPlacementV9(
  input: Readonly<{
    loadReview: (
      signal: AbortSignal,
    ) => ReturnType<typeof readSavedCompleteAssemblyNativePhysicalSourceV8>;
    body: ModelDisplayedTriangleBodyOwnedInputV1;
    centerMm: readonly [number, number, number];
    isCurrent: () => boolean;
  }>,
  signal: AbortSignal,
) {
  const { loadReview, body, isCurrent } = input;
  const [x, y, z] = input.centerMm;
  const current = () => !signal.aborted && isCurrent() && body.isCurrent();
  if (
    !current() ||
    ![x, y, z].every((coordinate) => Number.isFinite(coordinate) && Math.abs(coordinate) <= 10_000)
  )
    throw new Error(
      'Confirm the active saved seam, displayed mannequin and initial XYZ placement.',
    );
  const [review, binding] = await Promise.all([
    loadReview(signal),
    readCurrentSavedNeutralPlacementModelV1(body, signal),
  ]);
  const observed = projectCurrentModelDisplayedTriangleBodyInputV1(body);
  if (
    !observed ||
    !current() ||
    observed.hashes.bodyPositionsFloat32LeSha256 !==
      binding.observed.bodyPositionsFloat32LeSha256 ||
    observed.hashes.bodyTrianglesUint32LeSha256 !== binding.observed.bodyTrianglesUint32LeSha256
  )
    throw new Error('The displayed mannequin changed while preparing placement.');

  const compiled = await prepareDirectedSourceCutPreviewV1(
    buildSavedCrossMaterialDiagnosticInputsV1(
      review,
      { centerM: [x / 1000, y / 1000, z / 1000], depthOffsetsM: [0.004, 0] },
      current,
    ),
    signal,
  );
  const snapshot = snapshotGarmentStagedSourceCutCoreV1(compiled.material);
  const cloth = prepareSourceCutContactMeshV1(snapshot.cut, 35_000);
  const displayedBody = prepareActualBodySourceCutContactV1(
    observed.bodyPositionsM,
    observed.bodyTriangles,
    130_000_000,
  );
  const initial = snapshot.uploads.positions;
  if (
    Math.sign(displayedBody.bodyAudit.topology.signedVolumeM3) !== 1 ||
    !displayedBody.validateFrame(cloth, initial).passed ||
    !cloth.validateSelfIntersection(initial).passed
  )
    throw new Error('The proposed world placement fails initial body or cloth clearance.');
  if (!current()) throw new Error('The source or displayed mannequin changed during placement.');

  return buildSavedCrossMaterialPlacementDocumentV9(
    {
      review: { ...review, bytes: new TextEncoder().encode(canonical(review.document)) },
      body: binding,
      authoredCenterMm: [x, y, z],
      placement: compiled.placement,
    },
    signal,
  );
}
