import type {
  SeamHintOverride,
  SeamHintOverrideState,
  SeamHintsJson,
  SeamJoinHint,
  SeamRoleHint,
} from './schema';

export type SeamHintRowState = 'ai' | SeamHintOverrideState;
export type EffectiveRoleHint = SeamRoleHint & { state: SeamHintRowState };
export type EffectiveJoinHint = SeamJoinHint & { state: SeamHintRowState };

/** The typed value a future fetch hook hands to the seam signal. */
export type SeamHints = {
  schema_version: 1;
  roles: EffectiveRoleHint[];
  joins: EffectiveJoinHint[];
  not_inferred: string[];
};

export const EMPTY_SEAM_HINTS: SeamHints = {
  schema_version: 1,
  roles: [],
  joins: [],
  not_inferred: [],
};

/**
 * Merge the immutable AI run with the owner's rows. Owner rows replace rows with the same key;
 * `off` remains as a tombstone so the owner view can show it, but consumers must not vote with it.
 */
export function mergeSeamHints(
  ai: SeamHintsJson | null | undefined,
  overrides: readonly SeamHintOverride[],
): SeamHints {
  const roles = new Map<string, EffectiveRoleHint>();
  const joins = new Map<string, EffectiveJoinHint>();

  for (const row of ai?.roles ?? []) roles.set(row.piece, { ...row, state: 'ai' });
  for (const row of ai?.joins ?? []) joins.set(String(row.op), { ...row, state: 'ai' });

  for (const row of overrides) {
    if (row.kind === 'role') {
      roles.set(row.hint_key, {
        piece: row.hint_key,
        ...row.value_json,
        state: row.state,
      });
    } else {
      joins.set(row.hint_key, {
        op: Number(row.hint_key),
        ...row.value_json,
        state: row.state,
      });
    }
  }

  return {
    schema_version: 1,
    roles: [...roles.values()],
    joins: [...joins.values()],
    not_inferred: [...(ai?.not_inferred ?? [])],
  };
}
