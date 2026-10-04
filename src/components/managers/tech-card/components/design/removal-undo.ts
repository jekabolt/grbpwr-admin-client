import { useCallback, useSyncExternalStore } from 'react';
import type { DesignBenchSlotRef } from 'api/proto-http/admin';

/**
 * ═══ UNDO OF A REMOVAL — FLAT SLOTS AND RENDER SIDES (owner item 49, T49) ═══════════════════════
 *
 * Owner: «в FLAT SLOTS и в SIDES если мы удалили медиа то у нас до рефреша должна быть возможность
 * сделать undo». The ✕ on a slot plate is `SetDesignBenchSlot` with `picture_id 0`: the picture
 * stays on the card, only the slot lets go of it. So undo is the same write the menu uses, with the
 * remembered picture, at the slot's CURRENT revision.
 *
 * ⚠ MODULE MEMORY ONLY, BY DESIGN: a reload forgets every undo — that is the owner's «до рефреша».
 * No storage, no server row. One entry per slot (keyed by card + `slotRefKey`), so several removals
 * each keep their own undo; a second removal from the same slot replaces the first.
 */
export interface Removal {
  card: number;
  /** `slotRefKey(ref)` — the slot's identity on the screen. */
  key: string;
  kind: 'flat' | 'render';
  ref: DesignBenchSlotRef;
  /** The side (`front`, …) or the detail name — for speech only. */
  side: string;
  colorwayId: number;
  pictureId: number;
}

const entries = new Map<string, Removal>();
const listeners = new Set<() => void>();
let version = 0;

const id = (card: number, key: string) => `${card}|${key}`;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

export function rememberRemoval(r: Removal): void {
  if (r.card <= 0 || r.pictureId <= 0) return;
  entries.set(id(r.card, r.key), r);
  emit();
}

export function forgetRemoval(card: number, key: string): void {
  if (entries.delete(id(card, key))) emit();
}

export function removalAt(card: number, key: string): Removal | null {
  return entries.get(id(card, key)) ?? null;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Re-renders the caller whenever any removal is remembered or forgotten. */
export function useRemovals(): (card: number, key: string) => Removal | null {
  const v = useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((card: number, key: string) => removalAt(card, key), [v]);
}
