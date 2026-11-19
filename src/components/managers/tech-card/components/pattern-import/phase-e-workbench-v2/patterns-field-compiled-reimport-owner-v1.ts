import { openSavedDraftGeometryFileV1 } from './draft-cad-saved-dart-tip-review-v1';
import {
  takeUnlinkedDraftPieceCopyReviewV1,
  type CopyReview,
} from './draft-cad-unlinked-piece-copy-review-v1';
import { takeCompiledSavedAddPointFileV1 } from './draft-cad-saved-add-point-review-v1';
import { readSavedRankedPointReviewV1 } from './draft-cad-saved-ranked-point-review-v1';
import {
  readCompiledPairedAllowanceReviewV1,
  requiresCurrentPairedAllowanceReviewV1,
  type PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1,
} from './draft-cad-geometry-compile-v1';
import {
  createPatternImportDxfPhaseECadCommandCompiledReimportOwnerV1,
  registerPatternImportDxfPhaseECadCommandCompiledReimportOwnerV1,
} from './cad-command-compiled-reimport-handoff-v1';

export type PatternImportDxfPhaseEPatternsFieldCompiledReimportReviewV1 = Readonly<{
  scopeKey: string;
  files: readonly [File];
  requireManualApply?: true;
  savedCopyFile?: File;
}>;

export type PatternImportDxfPhaseEPatternsFieldCompiledReimportOwnerInputV1 = Readonly<{
  techCardId: number;
  readConfirmedImportGeneration: () => number;
  scopeAvailable: (scopeKey: string) => boolean;
  reviewAlreadyOpen: () => boolean;
  openExistingImportReview: (
    review: PatternImportDxfPhaseEPatternsFieldCompiledReimportReviewV1,
  ) => void;
  openExistingRankedPointReview?: (review: ReturnType<typeof readSavedRankedPointReviewV1>) => void;
}>;

function compiledFileName(
  artifact: PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1,
): string {
  const scope = artifact.scope.scopeKey
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${scope || 'material'}-cad-compiled.dxf`;
}

/**
 * Mounts the card-lifetime Patterns owner for Draft CAD compiled output. The owner only opens the
 * existing import review; that review remains the sole route to an explicit apply and card save.
 */
export function registerPatternImportDxfPhaseEPatternsFieldCompiledReimportOwnerV1(
  input: PatternImportDxfPhaseEPatternsFieldCompiledReimportOwnerInputV1,
): () => void {
  const owner = createPatternImportDxfPhaseECadCommandCompiledReimportOwnerV1({
    techCardId: input.techCardId,
    readConfirmedImportGeneration: input.readConfirmedImportGeneration,
    scopeAvailable: input.scopeAvailable,
    reviewAlreadyOpen: input.reviewAlreadyOpen,
    openExistingImportReview: (artifact) => {
      const addPoint = artifact.compiledFeatures.some((feature) => feature.tool === 'add-point');
      const pairedAllowance = requiresCurrentPairedAllowanceReviewV1(artifact);
      const guardedEdgeLength =
        pairedAllowance &&
        artifact.compiledFeatures.length === 1 &&
        artifact.compiledFeatures[0]?.output === 'edge-length' &&
        !!readCompiledPairedAllowanceReviewV1(artifact)?.fixedEndReplacement;
      const savedGeometry =
        guardedEdgeLength ||
        artifact.compiledFeatures.some(
          ({ output }) =>
            output === 'moved-dart-tip' ||
            output === 'adjusted-dart-intake' ||
            output === 'moved-fish-eye' ||
            output === 'moved-french-curve' ||
            output === 'parallel-spread' ||
            output === 'allowance-offset' ||
            output === 'sharpened-corner' ||
            output === 'rounded-outline-corner' ||
            output === 'moved-saved-vertex',
        );
      const manualApply =
        savedGeometry ||
        addPoint ||
        pairedAllowance ||
        artifact.compiledFeatures.some(
          ({ tool, output }) =>
            tool === 'french-curve' ||
            output === 'piece-create' ||
            output === 'moved-vertex' ||
            output === 'deleted-vertex',
        );
      const file = addPoint
        ? takeCompiledSavedAddPointFileV1(artifact)
        : savedGeometry
          ? openSavedDraftGeometryFileV1(artifact, compiledFileName(artifact))
          : new File([artifact.dxfText], compiledFileName(artifact), { type: 'image/vnd.dxf' });
      input.openExistingImportReview(
        Object.freeze({
          scopeKey: artifact.scope.scopeKey,
          ...(manualApply ? { requireManualApply: true as const } : {}),
          files: Object.freeze([file]) as readonly [File],
        }),
      );
    },
  });
  return registerPatternImportDxfPhaseECadCommandCompiledReimportOwnerV1({
    ...owner,
    async openSavedJoin(review, isCurrent, ownerCurrent) {
      const valid = () =>
        isCurrent() &&
        review.cardId === input.techCardId &&
        review.generation === input.readConfirmedImportGeneration() &&
        input.scopeAvailable(review.scopeKey) &&
        !input.reviewAlreadyOpen();
      if (!valid()) throw new Error('The saved Join or Patterns review changed.');
      const { takeSavedJoinFile } = await import('./draft-cad-saved-join-review');
      const file = await takeSavedJoinFile(
        review,
        valid,
        () =>
          ownerCurrent() &&
          input.reviewAlreadyOpen() &&
          input.scopeAvailable(review.scopeKey) &&
          input.readConfirmedImportGeneration() === review.generation,
      );
      input.openExistingImportReview({
        scopeKey: review.scopeKey,
        files: [file],
        requireManualApply: true,
        savedCopyFile: file,
      });
    },
    openSavedCopy(review: CopyReview) {
      if (
        review.cardId !== input.techCardId ||
        review.generation !== input.readConfirmedImportGeneration() ||
        !input.scopeAvailable(review.scopeKey)
      )
        throw new Error('The saved card, import generation or material scope changed.');
      if (input.reviewAlreadyOpen())
        throw new Error('Close the current Patterns import review first.');
      const { file } = takeUnlinkedDraftPieceCopyReviewV1(review);
      input.openExistingImportReview({
        scopeKey: review.scopeKey,
        files: [file],
        requireManualApply: true,
        savedCopyFile: file,
      });
    },
    openSavedRankedPoint(review) {
      const checked = readSavedRankedPointReviewV1(review);
      if (
        checked.row.techCardId !== input.techCardId ||
        !input.scopeAvailable(checked.row.scopeKey) ||
        input.reviewAlreadyOpen() ||
        !input.openExistingRankedPointReview
      )
        throw new Error('The current saved pattern review is unavailable.');
      input.openExistingRankedPointReview(checked);
    },
  });
}
