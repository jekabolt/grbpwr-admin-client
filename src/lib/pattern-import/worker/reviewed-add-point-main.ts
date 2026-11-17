import type {
  PatternImportOpenFile,
  ReviewedAddPointOpen,
  ReviewedAddPointAtWrite,
} from '../types';

type Grant = {
  wire: ReviewedAddPointOpen;
  check: () => void;
  atWrite: () => ReviewedAddPointAtWrite;
  active: boolean;
};
export type ReviewedAddPointLease = {
  wire: ReviewedAddPointOpen;
  check: () => void;
  atWrite: () => ReviewedAddPointAtWrite;
  release: () => void;
};
const candidates = new WeakSet<object>();
const authorized = new WeakMap<object, Promise<Grant>>();
const pending = new WeakMap<PatternImportOpenFile, Grant>();

/** Routing hint only. The review owner's independent File registry authenticates the actual claim. */
export function markReviewedAddPointFile(file: File) {
  candidates.add(file);
}
async function authorize(file: File): Promise<Grant> {
  const owner = await import(
    'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/draft-cad-saved-add-point-review-v1'
  );
  const proof = await owner.claimSavedAddPointReviewFileV1(file);
  const wire = owner.savedAddPointWorkerBindingV1(proof);
  return {
    wire,
    active: false,
    atWrite: () => owner.savedAddPointCurrentWorkerAliasesV1(proof),
    check: () => {
      if (!owner.isCurrentSavedAddPointReviewClaimV1(proof))
        throw new Error('The reviewed Add point selection is stale.');
    },
  };
}

/** Fresh and restarted worker opens go through the same exact File and current host check. */
export async function bindReviewedAddPointWorkerOpen(
  file: Pick<File, 'name' | 'arrayBuffer'>,
  input: PatternImportOpenFile,
  index: number,
) {
  if (!candidates.has(file)) return;
  if (index !== 0 || !(file instanceof File))
    throw new Error('Reviewed Add point requires the original single File.');
  let ready = authorized.get(file);
  if (!ready) {
    ready = authorize(file);
    authorized.set(file, ready);
  }
  const grant = await ready;
  grant.check();
  pending.set(input, grant);
}

export function takeReviewedAddPointWorkerOpen(
  files: readonly PatternImportOpenFile[],
): ReviewedAddPointLease | undefined {
  const matches = files.filter((f) => pending.has(f));
  if (!matches.length) return undefined;
  if (files.length !== 1 || matches.length !== 1)
    throw new Error('Reviewed Add point requires exactly one open file.');
  const input = matches[0]!,
    grant = pending.get(input)!;
  pending.delete(input);
  grant.check();
  if (grant.active)
    throw new Error('The reviewed Add point already belongs to an active worker session.');
  grant.active = true;
  let held = true;
  return {
    wire: structuredClone(grant.wire),
    check: grant.check,
    atWrite: grant.atWrite,
    release: () => {
      if (held) {
        held = false;
        grant.active = false;
      }
    },
  };
}
