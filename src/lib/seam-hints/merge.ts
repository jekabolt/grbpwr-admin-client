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

/** The typed value the owner screen draws and the seam signal reads. */
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
 * `off` remains as a tombstone (keeping the AI's words when the owner sent none) so the owner view
 * can show it, but consumers must not vote with it. An off row with nothing under it is dropped.
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
      const under = roles.get(row.hint_key);
      if (row.value)
        roles.set(row.hint_key, {
          piece: row.hint_key,
          role: row.value.role,
          hand: row.value.hand ?? null,
          conf: 'high',
          state: row.state,
        });
      else if (under) roles.set(row.hint_key, { ...under, state: row.state });
    } else {
      const under = joins.get(row.hint_key);
      if (row.value)
        joins.set(row.hint_key, {
          op: Number(row.hint_key),
          ...row.value,
          conf: 'high',
          state: row.state,
        });
      else if (under) joins.set(row.hint_key, { ...under, state: row.state });
    }
  }

  return {
    schema_version: 1,
    roles: [...roles.values()],
    joins: [...joins.values()].sort((x, y) => x.op - y.op),
    not_inferred: [...(ai?.not_inferred ?? [])],
  };
}
