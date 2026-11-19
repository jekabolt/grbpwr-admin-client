import type { CardDraft, ConversionManifest } from 'lib/pattern-import/types';
import type { SavedFixedEndReplacementV1 } from './saved-fixed-end-outline-authority-v1';

type Scope = CardDraft['scopes'][number];
type Verify = (draft: CardDraft, scope: Scope, isCurrent: () => boolean) => Promise<void>;
const files = new WeakMap<File, Verify | null>();
const scopes = new WeakMap<Scope, { file: File; text: string }>();
type SavedPieceHeading = Readonly<{ scopeKey: string; manifest: ConversionManifest }>;
const pieceHeadings = new WeakMap<File, SavedPieceHeading>();
const fixedEndReplacements = new WeakMap<File, SavedFixedEndReplacementV1>();

type SavedGeometryReviewLabel =
  | 'saved dart'
  | 'parallel opening'
  | 'saved French curve'
  | 'saved corner'
  | 'saved outline points'
  | 'saved shared outline'
  | 'saved allowance offset';
const labels = new WeakMap<File, SavedGeometryReviewLabel>();
export const savedReviewLabelV1 = (file: File) => labels.get(file) ?? 'saved geometry';
export function registerSavedDartTipFileV1(
  file: File,
  verify: Verify,
  label: SavedGeometryReviewLabel = 'saved dart',
  pieceHeading?: SavedPieceHeading,
  fixedEndReplacement?: SavedFixedEndReplacementV1,
) {
  if (files.has(file)) throw new Error('This dart review File is already bound.');
  labels.set(file, label);
  files.set(file, verify);
  if (fixedEndReplacement) fixedEndReplacements.set(file, fixedEndReplacement);
  if (
    pieceHeading &&
    (label === 'saved allowance offset' ||
      label === 'saved outline points' ||
      label === 'saved shared outline')
  )
    pieceHeadings.set(file, pieceHeading);
}
export const readSavedGeometryPieceHeadingV1 = (file: File) =>
  files.get(file) ? pieceHeadings.get(file) : undefined;
export const isSavedDartTipReviewFileV1 = (file: File) => files.has(file);
export function cancelSavedDartTipReviewV1(file?: File) {
  if (file && files.has(file)) files.set(file, null);
}
export function bindSavedDartTipWizardScopeV1(file: File, scope: Scope) {
  if (files.has(file)) scopes.set(scope, { file, text: scope.dxfText });
}
export async function verifySavedDartTipApplyV1(
  draft: CardDraft,
  inputs: readonly File[],
  automatic: boolean,
  isCurrent: () => boolean,
) {
  if (!draft.scopes.some((s) => scopes.has(s)) && !inputs.some((f) => files.has(f))) return;
  const file = inputs[0],
    scope = draft.scopes[0],
    verify = file && files.get(file);
  if (
    automatic ||
    inputs.length !== 1 ||
    draft.scopes.length !== 1 ||
    !file ||
    !scope ||
    !verify ||
    scopes.get(scope)?.file !== file ||
    scopes.get(scope)?.text !== scope.dxfText
  )
    throw new Error('Confirm the current saved geometry review with Apply.');
  await verify(draft, scope, () => files.get(file) === verify && isCurrent());
  return fixedEndReplacements.get(file);
}
