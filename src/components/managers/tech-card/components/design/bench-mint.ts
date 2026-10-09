import type { DesignBenchSlotRef } from 'api/proto-http/admin';

/**
 * HOW A LIBRARY FILE BECOMES A NEW DETAIL (03.10, owner item 14: «никак нельзя самому добавить
 * деталь в флет слотс ошибка: "design: detail_name_required: a new detail slot needs a name"»).
 *
 * ONE ATOMIC CALL. `RegisterDesignUpload` files the picture AND places it, with `target` = the new
 * detail and `new_detail_name` = the typed name, in one transaction (backend beta 143b5aa carries
 * the name through to the slot mint). The interim two-write shape (file without a target, then mint
 * through `SetDesignBenchSlot`) is gone (hotfix HX6): a failure between the two writes left a filed
 * picture with no detail, and a retry filed a second one.
 *
 * A side and an existing detail take the same call; only a mint carries a name, and a mint's slot
 * rev is 0 (the slot does not exist yet).
 */
export function isDetailMint(ref: DesignBenchSlotRef): boolean {
  return (ref.viewKey ?? '').trim().toLowerCase() === 'detail' && !(ref.slotId ?? 0);
}

export type UploadPlacement = {
  /** The slot the upload places its picture into, in the same transaction. Always set. */
  target: DesignBenchSlotRef;
  expectedSlotRev: number;
  /** For a mint: the typed name, trimmed; absent otherwise. */
  newDetailName?: string;
};

export function uploadPlacement(
  ref: DesignBenchSlotRef,
  expectedSlotRev: number,
  newDetailName?: string,
): UploadPlacement {
  if (isDetailMint(ref)) {
    return { target: ref, expectedSlotRev: 0, newDetailName: (newDetailName ?? '').trim() };
  }
  return { target: ref, expectedSlotRev };
}
