import type { CardDraft, WriteJob } from 'lib/pattern-import/types';

// A routing record only. The save authority separately requires the exact File, original
// native source and reviewed scope held by the Join owner.
type ReviewFile = {
  dialect: WriteJob['dialect'];
  scope?: CardDraft['scopes'][number];
  text?: string;
};
const known = new WeakSet<File>();
const reviews = new WeakMap<File, ReviewFile>();
export function registerSavedJoinFile(file: File, dialect: WriteJob['dialect']) {
  known.add(file);
  reviews.set(file, { dialect });
}
export const isSavedJoinFile = (file: File) => known.has(file);
export const readSavedJoinFile = (file: File | undefined) => (file ? reviews.get(file) : undefined);
export function cancelSavedJoinFile(file: File) {
  reviews.delete(file);
}
export function bindJoinWizardScope(file: File, scope: CardDraft['scopes'][number]) {
  const review = reviews.get(file);
  if (review) {
    review.scope = scope;
    review.text = scope.dxfText;
  }
}
