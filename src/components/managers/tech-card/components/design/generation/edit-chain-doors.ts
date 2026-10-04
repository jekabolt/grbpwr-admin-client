import type { DesignBenchSlotRef, common_DesignPicture } from 'api/proto-http/admin';
import { useState } from 'react';

import type { PictureTileAction } from '../picture-tile';
import { useDesignWrites } from '../use-design-band';
import { chainSteps } from './edit-chain';

/**
 * ═══ THE `undo` / `redo` CORNERS OF A PICTURE IN AN EDIT CHAIN (04.10, owner item 28, T28) ══════
 *
 * Two writes per step, ordered by the server's guards (`edit-chain.ts` says why the chain needs no
 * new column):
 *   · UNDO — the slot holding this version takes the one before it FIRST (a picture in a slot cannot
 *     be hidden: `in_slot`), then this version is hidden. If the hide is refused, the slot is put
 *     back (its revision moved by exactly one) and the refusal is the toast every band write gives.
 *   · REDO — the undone edit is shown FIRST (a hidden picture cannot stand in a slot:
 *     `hidden_plate`), then the slot holding this version takes it. If the slot write is refused,
 *     the edit is hidden again.
 * Both the bench and the slot redraw from the band the writes re-read, so they cannot disagree.
 */
export function useEditChainDoors({
  techCardId,
  picture,
  row,
  slot,
  handle,
  disabled,
}: {
  techCardId: number;
  picture: common_DesignPicture | null;
  /** Every picture of the row the chain is filed in (its run or batch). */
  row: readonly common_DesignPicture[];
  /** The slot holding `picture`, addressed as a write to it must be; null — none. */
  slot: { ref: DesignBenchSlotRef; rev: number } | null;
  handle: string;
  disabled?: boolean;
}): { onUndo?: PictureTileAction; onRedo?: PictureTileAction } {
  const { setBenchSlot, hidePicture } = useDesignWrites(techCardId);
  const [busy, setBusy] = useState<'undo' | 'redo' | null>(null);
  if (!picture || disabled) return {};
  const steps = chainSteps(picture, row);
  const fromId = picture.id ?? 0;
  const writing = !!busy || setBenchSlot.isPending || hidePicture.isPending;

  const undo = async (to: common_DesignPicture) => {
    if (slot) {
      await setBenchSlot.mutateAsync({
        slot: slot.ref,
        pictureId: to.id ?? 0,
        expectedSlotRev: slot.rev,
      });
    }
    try {
      await hidePicture.mutateAsync({ pictureId: fromId, hidden: true });
    } catch (error) {
      if (slot)
        await setBenchSlot
          .mutateAsync({
            slot: slot.ref,
            pictureId: fromId,
            expectedSlotRev: slot.rev + 1,
            silent: true,
          })
          .catch(() => undefined);
      throw error;
    }
  };

  const redo = async (to: common_DesignPicture) => {
    const toId = to.id ?? 0;
    await hidePicture.mutateAsync({ pictureId: toId, hidden: false });
    if (!slot) return;
    try {
      await setBenchSlot.mutateAsync({
        slot: slot.ref,
        pictureId: toId,
        expectedSlotRev: slot.rev,
      });
    } catch (error) {
      await hidePicture.mutateAsync({ pictureId: toId, hidden: true }).catch(() => undefined);
      throw error;
    }
  };

  const run = (which: 'undo' | 'redo', to: common_DesignPicture) => () => {
    if (writing) return;
    setBusy(which);
    // A refusal is already said by the write's own toast (`useDesignWrites`).
    void (which === 'undo' ? undo(to) : redo(to))
      .catch(() => undefined)
      .finally(() => setBusy(null));
  };

  return {
    onUndo: steps.undoTo
      ? {
          onClick: run('undo', steps.undoTo),
          ariaLabel: `undo the edit of ${handle}`,
          title: 'undo — the version before this edit takes its place',
          disabled: writing && busy !== 'undo',
          pending: busy === 'undo',
        }
      : undefined,
    onRedo: steps.redoTo
      ? {
          onClick: run('redo', steps.redoTo),
          ariaLabel: `redo the edit of ${handle}`,
          title: 'redo — the undone edit takes its place again',
          disabled: writing && busy !== 'redo',
          pending: busy === 'redo',
        }
      : undefined,
  };
}
