import {
  takeUnlinkedDraftPieceCopyReviewV1,
  type CopyReview,
} from './draft-cad-unlinked-piece-copy-review-v1';
import { takeCompiledSavedAddPointFileV1 } from './draft-cad-saved-add-point-review-v1';
import type { PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1 } from './draft-cad-geometry-compile-v1';
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
      const manualApply =
        addPoint || artifact.compiledFeatures.some(({ output }) => output === 'piece-create');
      const file = addPoint
        ? takeCompiledSavedAddPointFileV1(artifact)
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
  });
}
