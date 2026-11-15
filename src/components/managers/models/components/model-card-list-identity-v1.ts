import type { common_Model } from 'api/proto-http/admin';

export type ModelCardListIdentityStatusV1 = 'duplicate' | 'invalid' | 'valid';

export interface ModelCardListIdentityV1 {
  readonly key: string;
  readonly id: number | null;
  readonly rawId: number | undefined;
  readonly status: ModelCardListIdentityStatusV1;
}

function isValidStoredModelId(id: number | undefined): id is number {
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0;
}

/**
 * Resolves the card-list identity before any navigation, mutation or WebGL activation is exposed.
 * Invalid and duplicate ids deliberately remain non-actionable.
 */
export function resolveModelCardListIdentitiesV1(
  models: readonly Pick<common_Model, 'id'>[],
): readonly ModelCardListIdentityV1[] {
  const counts = new Map<number, number>();
  for (const model of models) {
    if (!isValidStoredModelId(model.id)) continue;
    counts.set(model.id, (counts.get(model.id) ?? 0) + 1);
  }

  return Object.freeze(
    models.map((model, index) => {
      const rawId = model.id;
      if (!isValidStoredModelId(rawId)) {
        return Object.freeze({
          key: `invalid:${rawId ?? 'missing'}:${index}`,
          id: null,
          rawId,
          status: 'invalid' as const,
        });
      }
      if (counts.get(rawId) !== 1) {
        return Object.freeze({
          key: `duplicate:${rawId}:${index}`,
          id: null,
          rawId,
          status: 'duplicate' as const,
        });
      }
      return Object.freeze({
        key: `model:${rawId}`,
        id: rawId,
        rawId,
        status: 'valid' as const,
      });
    }),
  );
}
