import type { DesignBenchSlotRef } from 'api/proto-http/admin';

/**
 * HOW A LIBRARY FILE BECOMES A NEW DETAIL (03.10, owner item 14: «никак нельзя самому добавить
 * деталь в флет слотс ошибка: "design: detail_name_required: a new detail slot needs a name"»).
 *
 * `RegisterDesignUpload` takes a `target` and a `new_detail_name`, but the server (backend beta
 * b63b228) never hands the name to the placement it runs — `DesignBatchRegister` has no field for
 * it — so every mint sent as an upload's target is refused as nameless, whatever was typed. The
 * mint is therefore TWO writes: file the picture with no target, then mint the detail through
 * `SetDesignBenchSlot`, the one door that reads the name. A side or an existing detail still goes
 * in one transaction.
 */
export function isDetailMint(ref: DesignBenchSlotRef): boolean {
  return (ref.viewKey ?? '').trim().toLowerCase() === 'detail' && !(ref.slotId ?? 0);
}

export type UploadPlacement = {
  /** The slot the upload places its picture into, in the same transaction; none for a mint. */
  target?: DesignBenchSlotRef;
  expectedSlotRev: number;
  /** For a mint: the name the follow-up `SetDesignBenchSlot` carries; null otherwise. */
  mintName: string | null;
};

export function uploadPlacement(
  ref: DesignBenchSlotRef,
  expectedSlotRev: number,
  newDetailName?: string,
): UploadPlacement {
  if (isDetailMint(ref)) return { expectedSlotRev: 0, mintName: (newDetailName ?? '').trim() };
  return { target: ref, expectedSlotRev, mintName: null };
}
