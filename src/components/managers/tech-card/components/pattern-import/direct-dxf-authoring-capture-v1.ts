import {
  isSavedJoinFile,
  bindJoinWizardScope,
} from './phase-e-workbench-v2/draft-cad-saved-join-file';
import {
  isSavedDartTipReviewFileV1,
  bindSavedDartTipWizardScopeV1,
  readSavedGeometryPieceHeadingV1,
  savedReviewLabelV1,
  verifySavedDartTipApplyV1,
} from './phase-e-workbench-v2/draft-cad-saved-dart-tip-file-v1';
import { acceptCurrentFindings } from './steps/accepted-findings';
import type { ApplyDraftFn, DraftBuilder } from './client';
import {
  bindReviewedAddPointWorkerOpen,
  verifyReviewedAddPointAtApply,
} from 'lib/pattern-import/worker/reviewed-add-point-main';
import { sha256Hex } from 'lib/features/sha256';
import type {
  CardDraft,
  ConversionManifest,
  PatternImportOpenFile,
  StageIO,
  StageName,
} from 'lib/pattern-import/types';

/** The same content identity is used on first open and cancelled-worker reconstruction. */
export async function directDxfAuthoringOpenFileV1(
  file: Pick<File, 'name' | 'arrayBuffer'>,
  index: number,
  generatedFusing = false,
): Promise<PatternImportOpenFile> {
  const bytes = await file.arrayBuffer();
  const sha = /\.dxf$/i.test(file.name) ? await sha256Hex(bytes) : '';
  let dxfPathProvenance: PatternImportOpenFile['dxfPathProvenance'];
  if (sha) {
    const digest = Array.from(sha.match(/../g) ?? [], (octet) => parseInt(octet, 16));
    // Curve IDs hex-encode this ID and append the block/insert and entity identities.
    const contentId = btoa(String.fromCharCode(...digest))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    dxfPathProvenance = { sourceFileId: `dxf:${contentId}:${index.toString(36)}` };
  }
  const opened = {
    name: file.name,
    bytes,
    ...(generatedFusing ? { generatedFusing: true } : {}),
    ...(dxfPathProvenance ? { dxfPathProvenance } : {}),
  };
  await bindReviewedAddPointWorkerOpen(file, opened, index);
  return opened;
}

// Routing hint only. The independent saved-copy owner authenticates the original File and exact writer result.
const unlinkedPieceCopyFiles = new WeakSet<File>();
type UnlinkedCopyHeadingReview = Readonly<{ scopeKey: string; manifest: ConversionManifest }>;
const unlinkedCopyHeadings = new WeakMap<File, UnlinkedCopyHeadingReview>();
export function markUnlinkedPieceCopyFileV1(file: File, heading?: UnlinkedCopyHeadingReview) {
  unlinkedPieceCopyFiles.add(file);
  if (heading) unlinkedCopyHeadings.set(file, heading);
}

/** Preserve the verified own-format names through ordinary semantics for the bound review File. */
export async function runOrdinaryDxfReviewSemanticsV1(
  files: readonly File[],
  card: Readonly<{ techCardId: number; scopeKey?: string }>,
  input: StageIO['semantics']['in'],
  run: (input: StageIO['semantics']['in']) => Promise<StageIO['semantics']['out']>,
) {
  const file = files.length === 1 ? files[0] : undefined;
  const savedGeometry = file && readSavedGeometryPieceHeadingV1(file);
  const heading = savedGeometry ?? (file && unlinkedCopyHeadings.get(file));
  if (!heading) return run(input);
  if (heading.scopeKey !== card.scopeKey || heading.manifest.techCardId !== card.techCardId)
    throw new Error(
      savedGeometry
        ? `The reviewed ${savedReviewLabelV1(file)} belongs to another card or material scope.`
        : 'The reviewed unlinked copy belongs to another card or material scope.',
    );
  const {
    buildPatternImportDxfExactManifestPieceOverridesV1,
    buildPatternImportDxfSavedManifestAllowanceV1,
  } = await import('./phase-e-workbench-v2/saved-dxf-reprocess-host-v1');
  const fileAllowance = buildPatternImportDxfSavedManifestAllowanceV1(heading.manifest);
  const initial = await run({ ...input, fileAllowance });
  if (savedGeometry && initial.blocked.length) return initial;
  const exact = buildPatternImportDxfExactManifestPieceOverridesV1(initial, heading.manifest);
  const pieceOverrides = { ...input.pieceOverrides };
  for (const [seed, override] of Object.entries(exact)) {
    pieceOverrides[Number(seed)] = { ...pieceOverrides[Number(seed)], ...override };
  }
  return run({ ...input, fileAllowance, pieceOverrides });
}

const reviewedCopyScopes = new WeakMap<CardDraft['scopes'][number], File>();

/** The output scope has object identity across impact answers; a copied DTO cannot claim the original wizard run. */
export function buildOrdinaryWizardReviewV1(
  files: readonly File[],
  build: DraftBuilder,
  written: Parameters<DraftBuilder>[0],
  context: Parameters<DraftBuilder>[1],
) {
  const accepted = acceptCurrentFindings(
    written.gate,
    build(written, context),
    context.card.existingShapes ?? [],
  );
  if (
    files.length === 1 &&
    unlinkedPieceCopyFiles.has(files[0]!) &&
    accepted.draft.scopes.length === 1
  )
    reviewedCopyScopes.set(accepted.draft.scopes[0]!, files[0]!);
  if (files.length === 1 && accepted.draft.scopes.length === 1)
    bindSavedDartTipWizardScopeV1(files[0]!, accepted.draft.scopes[0]!);
  if (files.length === 1 && accepted.draft.scopes.length === 1)
    bindJoinWizardScope(files[0]!, accepted.draft.scopes[0]!);
  return accepted;
}

export function isOrdinaryWizardCopyScopeV1(file: File, scope: CardDraft['scopes'][number]) {
  return reviewedCopyScopes.get(scope) === file;
}

/** A protected wizard result must be explicitly applied against the same saved row and current review. */
export async function applyDirectDxfReviewedDraftV1(
  draft: CardDraft,
  files: readonly File[],
  autopilotToken: number | undefined,
  isCurrent: () => boolean,
  apply: (options?: Parameters<ApplyDraftFn>[2]) => ReturnType<ApplyDraftFn>,
  pinnedSavedFile?: File,
): ReturnType<ApplyDraftFn> {
  if (
    pinnedSavedFile &&
    (files.length !== 1 ||
      files[0] !== pinnedSavedFile ||
      (!isSavedJoinFile(pinnedSavedFile) &&
        !unlinkedPieceCopyFiles.has(pinnedSavedFile) &&
        !isSavedDartTipReviewFileV1(pinnedSavedFile)))
  )
    throw new Error(
      pinnedSavedFile && isSavedDartTipReviewFileV1(pinnedSavedFile)
        ? `The original ${savedReviewLabelV1(pinnedSavedFile)} review File is no longer available.`
        : 'The original unlinked copy File or its review is no longer available.',
    );
  if (files.some(isSavedJoinFile)) {
    if (
      files.length !== 1 ||
      pinnedSavedFile !== files[0] ||
      autopilotToken != null ||
      !isCurrent()
    )
      throw new Error('Confirm the original Join with the Apply button.');
    const { acknowledgeSavedJoin } = await import(
      './phase-e-workbench-v2/draft-cad-saved-join-review'
    );
    const join = await acknowledgeSavedJoin(draft, files[0]!);
    if (!isCurrent()) throw new Error('The Join review changed before Apply.');
    return apply({ join });
  }
  await verifySavedDartTipApplyV1(draft, files, autopilotToken != null, isCurrent);
  if (draft.scopes.some((scope) => scope.writerReplay?.retainedLineSplit)) {
    if (autopilotToken != null)
      throw new Error('Confirm the saved Add point with the Apply button.');
    await verifyReviewedAddPointAtApply(files);
    if (!isCurrent()) throw new Error('The reviewed Add point source changed before Apply.');
  }
  if (files.some((file) => unlinkedPieceCopyFiles.has(file))) {
    if (files.length !== 1 || autopilotToken != null)
      throw new Error('Confirm the single unlinked piece copy with the Apply button.');
    const { acknowledgeUnlinkedDraftPieceCopyV1 } = await import(
      './phase-e-workbench-v2/draft-cad-unlinked-piece-copy-review-v1'
    );
    const newPieceIntent = await acknowledgeUnlinkedDraftPieceCopyV1(files[0]!, draft);
    if (!isCurrent()) throw new Error('The reviewed unlinked copy changed before Apply.');
    return apply({ newPieceIntent });
  }
  return apply();
}

type Run = <S extends StageName>(stage: S, input: StageIO[S]['in']) => Promise<StageIO[S]['out']>;
/** Runs against the final semantics in the original worker; no derived or inferred sewing view. */
export async function captureDirectDxfAuthoringV1(files: readonly { name: string }[], run: Run) {
  if (
    files.filter((file) => /\.dxf$/i.test(file.name)).length !== 1 ||
    files.some((file) => !/\.(dxf|rul)$/i.test(file.name))
  )
    return {};
  const dxfProvenance = await run('dxf-provenance', {
    schemaVersion: 'dxf-pipeline-provenance-request/1',
  });
  const dxfPhaseDReplay = await run('dxf-phase-d-replay', {
    schemaVersion: 'dxf-product-phase-d-replay-request/1',
  });
  const dxfNativeSewingReplay = await run('dxf-native-sewing-replay', {
    schemaVersion: 'dxf-native-sewing-replay-request/1',
  });
  return { dxfProvenance, dxfPhaseDReplay, dxfNativeSewingReplay };
}
