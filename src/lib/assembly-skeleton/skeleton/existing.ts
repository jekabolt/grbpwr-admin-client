// APPEND MODE — the order already on the card, replayed: which pieces its joins have consumed,
// which of its units are still on the table, and every unit code it has ever used.
//
// The proposal appended to a card is built over what the card has NOT sewn yet: its consumed
// pieces are out of play, its live units are inputs a template stage may sew on («Set sleeves»
// onto the card's own body), and no new unit takes a code the card already uses. The replay is the
// frontier rule in its simplest form (a join consumes its inputs and puts its unit on the table; a
// processing step consumes nothing); violations in the card's own order are the card's, not ours.

import type { SkeletonExistingOrder } from '../types';

export type ExistingUnit = { key: string; name: string; leaves: string[] };

export type ExistingReplay = {
  /** Units of the card still on the table after its last step, in the order they were made. */
  live: ExistingUnit[];
  /** Pieces some join of the card has sewn into a unit. */
  consumed: Set<string>;
  /** Every unit code the card uses (made, absorbed or referred to). */
  unitKeys: Set<string>;
};

export function replayExisting(
  existing: SkeletonExistingOrder | undefined,
  pieceKeys: ReadonlySet<string>,
): ExistingReplay {
  const live = new Map<string, ExistingUnit>();
  const consumed = new Set<string>();
  const unitKeys = new Set<string>();
  for (const s of existing?.steps ?? []) {
    const out = (s.outputUnitKey ?? '').trim();
    const keys = s.inputs.map((i) => i.key).filter(Boolean);
    for (const k of keys) if (!pieceKeys.has(k)) unitKeys.add(k);
    if (!out) continue;
    unitKeys.add(out);
    const leaves: string[] = [];
    for (const k of keys) {
      if (pieceKeys.has(k)) {
        consumed.add(k);
        leaves.push(k);
      } else {
        leaves.push(...(live.get(k)?.leaves ?? []));
        live.delete(k);
      }
    }
    const before = live.get(out);
    live.delete(out);
    live.set(out, {
      key: out,
      name: (s.outputUnitName ?? '').trim() || before?.name || out,
      leaves: [...new Set([...(before?.leaves ?? []), ...leaves])],
    });
  }
  return { live: [...live.values()], consumed, unitKeys };
}
