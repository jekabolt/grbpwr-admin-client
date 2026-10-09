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

/**
 * ═══ «REMOVE FROM PROMPT» ON THE FLAT INPUT — kind `input` (M15, 109 §4.2) ═════════════════════
 *
 * A picture taken out of the prompt stays on the board with its label (`label_state = held`); undo
 * is the opposite write (`SetDesignReferenceHeld(false)`). Same rule as above: module memory, until
 * the reload. One entry per input group (`views`, `d:<slot>`), the pictures in the order they went —
 * the row under the group says «N removed from the prompt · undo» and undo puts them all back.
 */
export interface InputRemoval {
  card: number;
  group: string;
  mediaIds: number[];
}

const inputs = new Map<string, InputRemoval>();

export function rememberInputRemoval(card: number, group: string, mediaId: number): void {
  if (card <= 0 || mediaId <= 0) return;
  const at = inputs.get(id(card, `input:${group}`));
  const mediaIds = [...(at?.mediaIds ?? []).filter((m) => m !== mediaId), mediaId];
  inputs.set(id(card, `input:${group}`), { card, group, mediaIds });
  emit();
}

/** Forgets the named pictures of a group (all of them when `mediaIds` is absent). */
export function forgetInputRemoval(card: number, group: string, mediaIds?: number[]): void {
  const key = id(card, `input:${group}`);
  const at = inputs.get(key);
  if (!at) return;
  const left = mediaIds ? at.mediaIds.filter((m) => !mediaIds.includes(m)) : [];
  if (left.length) inputs.set(key, { ...at, mediaIds: left });
  else inputs.delete(key);
  emit();
}

/** Re-renders the caller whenever an input removal is remembered or forgotten. */
export function useInputRemovals(): (card: number, group: string) => InputRemoval | null {
  const v = useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
  return useCallback(
    (card: number, group: string) => inputs.get(id(card, `input:${group}`)) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v],
  );
}

/** Every input removal of a card (render-time read; `useInputRemovals` re-renders on change). */
export function listInputRemovals(card: number): InputRemoval[] {
  return [...inputs.values()].filter((r) => r.card === card);
}

/** A picture put back from anywhere (the modal, the board, a second `+ picture`) leaves every group. */
export function forgetInputRemovalOf(card: number, mediaId: number): void {
  for (const r of listInputRemovals(card))
    if (r.mediaIds.includes(mediaId)) forgetInputRemoval(card, r.group, [mediaId]);
}
