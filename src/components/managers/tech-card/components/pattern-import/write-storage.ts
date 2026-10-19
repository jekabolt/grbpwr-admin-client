// RULHOOK (RUL-SPEC.md §6): the operator's storage choice for the write — per-size DXF only
// ('blocks', the default) or also base DXF + .rul ('rul'). Persisted in `Inputs.writeStorage` so
// every write of the run carries it (the operator's, the drive's, the autopilot's); set only by
// the `write-storage` event — it answers no question, the autopilot never sets it.
import type { StageIO, WriteStorage } from 'lib/pattern-import/types';

/** The event / input normalised: a known storage, a trimmed base only with 'rul'; else null. */
export function normWriteStorage(x: { storage?: unknown; rulBase?: unknown }): WriteStorage | null {
  if (x.storage !== 'blocks' && x.storage !== 'rul') return null;
  const base = typeof x.rulBase === 'string' ? x.rulBase.trim() : '';
  return x.storage === 'rul' && base ? { storage: 'rul', rulBase: base } : { storage: x.storage };
}

/** The card size tokens the write stage receives (the mapped sizes), in written order. */
export function writtenTokens(sizes: StageIO['sizes']['out'] | null | undefined): string[] {
  return (sizes?.map.entries ?? []).flatMap((e) => (e.card ? [e.card.token] : []));
}

export type WriteStorageNow = {
  storage: 'blocks' | 'rul';
  /** The base the write asks for (a card token of the run); absent = the middle size. */
  rulBase?: string;
  /** Why the asked base is not used (not one of the run's sizes); null = nothing ignored. */
  ignored: string | null;
};

/**
 * What the write stage gets from the choice, against the sizes it writes. A `rulBase` that is
 * not one of them (another card, a typo) is dropped — the writer takes the middle size — and the
 * reason says so; never a refusal or a crash. No sizes yet = the base cannot be judged, kept.
 */
export function writeStorageFor(
  ws: WriteStorage | null | undefined,
  tokens: readonly string[],
): WriteStorageNow {
  const w = ws ? normWriteStorage(ws) : null;
  if (!w || w.storage !== 'rul') return { storage: 'blocks', ignored: null };
  if (w.rulBase == null || !tokens.length)
    return { storage: 'rul', ...(w.rulBase != null ? { rulBase: w.rulBase } : {}), ignored: null };
  const exact = tokens.find((t) => t === w.rulBase);
  const loose = tokens.filter((t) => t.trim().toLowerCase() === w.rulBase!.toLowerCase());
  const hit = exact ?? (loose.length === 1 ? loose[0] : undefined);
  if (hit != null) return { storage: 'rul', rulBase: hit, ignored: null };
  return {
    storage: 'rul',
    ignored: `base size "${w.rulBase}" is not one of the sizes written (${tokens.join(' ')}) — the middle size is the base`,
  };
}

/** The write stage input fields of the choice ('blocks' adds nothing: today's write). */
export const writeStorageInput = (
  now: WriteStorageNow,
): Pick<StageIO['write']['in'], 'storage' | 'rulBase'> =>
  now.storage === 'rul' ? { storage: 'rul', ...(now.rulBase ? { rulBase: now.rulBase } : {}) } : {};
