import type { CardDraft } from 'lib/pattern-import/types';

type Scope = CardDraft['scopes'][number];
type Verify = (draft: CardDraft, scope: Scope, isCurrent: () => boolean) => Promise<void>;
const files = new WeakMap<File, Verify | null>();
const scopes = new WeakMap<Scope, { file: File; text: string }>();

export function registerSavedDartTipFileV1(file: File, verify: Verify) {
  if (files.has(file)) throw new Error('This dart review File is already bound.');
  files.set(file, verify);
}
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
    throw new Error('Confirm the current saved dart review with Apply.');
  await verify(draft, scope, () => files.get(file) === verify && isCurrent());
}
