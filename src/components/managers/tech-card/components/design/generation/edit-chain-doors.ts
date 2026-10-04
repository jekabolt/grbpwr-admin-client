import type { common_DesignPicture } from 'api/proto-http/admin';
import { useState } from 'react';

import type { PictureTileAction } from '../picture-tile';
import { newClientRequestId, useDesignWrites } from '../use-design-band';
import { chainSteps } from './edit-chain';

/**
 * ═══ THE `undo` / `redo` CORNERS OF A PICTURE IN AN EDIT CHAIN (04.10, owner item 28, T28 v2) ═══
 *
 * ONE write per step — `UndoDesignEdit` / `RedoDesignEdit` (`stepEditChain`). The server moves the
 * slot holding this version itself, in the same transaction, so the bench and FLAT SLOTS cannot
 * end up half-stepped. `expectedCurrentId` is this picture: a step pressed on a stale screen is
 * refused `stale_chain`, and the write re-reads the band either way. The corners are drawn from
 * the server's `can_undo` / `can_redo` (`edit-chain.ts`); a refusal is the toast every band write
 * gives. Each press mints its own idempotency key.
 */
export function useEditChainDoors({
  techCardId,
  picture,
  handle,
  disabled,
}: {
  techCardId: number;
  picture: common_DesignPicture | null;
  handle: string;
  disabled?: boolean;
}): { onUndo?: PictureTileAction; onRedo?: PictureTileAction } {
  const { stepEditChain } = useDesignWrites(techCardId);
  const [busy, setBusy] = useState<'undo' | 'redo' | null>(null);
  if (!picture || disabled) return {};
  const steps = chainSteps(picture);
  const id = picture.id ?? 0;
  const writing = !!busy || stepEditChain.isPending;

  const run = (step: 'undo' | 'redo') => () => {
    if (writing) return;
    setBusy(step);
    // A refusal is already said by the write's own toast (`useDesignWrites`).
    void stepEditChain
      .mutateAsync({
        step,
        pictureId: id,
        expectedCurrentId: id,
        idempotencyKey: newClientRequestId(),
      })
      .catch(() => undefined)
      .finally(() => setBusy(null));
  };

  return {
    onUndo: steps.undo
      ? {
          onClick: run('undo'),
          ariaLabel: `undo the edit of ${handle}`,
          title: 'undo — the version before this edit takes its place',
          disabled: writing && busy !== 'undo',
          pending: busy === 'undo',
        }
      : undefined,
    onRedo: steps.redo
      ? {
          onClick: run('redo'),
          ariaLabel: `redo the edit of ${handle}`,
          title: 'redo — the undone edit takes its place again',
          disabled: writing && busy !== 'redo',
          pending: busy === 'redo',
        }
      : undefined,
  };
}
