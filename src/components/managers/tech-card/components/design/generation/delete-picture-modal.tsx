import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService, requestHandler } from 'api/api';
import type { common_DesignPicture } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

import { refusalReason } from '../head/use-draft-idea';
import { designKeys } from '../use-design-band';

/**
 * ═══ «DELETE» — A DERIVED PICTURE LEAVES THE CARD AND THE STORAGE FOR GOOD (28.09, O-68, D-74) ═══
 *
 * Only a picture with a parent gets the door: a crop (`derived_from` → a plate or a sheet) or an
 * edit of a crop. A root generation plate (`derived_from` empty — the output of a run) has no door,
 * and the server refuses it anyway (`picture_is_root`). The server deletes the picture and every
 * descendant of it, its edit layer, the media rows nothing else references and their objects in
 * the bucket; a media row something else still cites (the library, another card, a second role on
 * this one) is kept and named in the answer (`keptMediaIds`).
 *
 * Drawn only on the LATEST GENERATION workbench (FLAT and FABRIC RENDER) — not in GENERATION
 * HISTORY, not among the brought plates: the tiles gate the door by their host (`workbench`).
 */

/* ────────────────────────────── the wire ────────────────────────────── */

export type DeleteDesignPictureResponse = {
  deletedPictureIds?: number[];
  deletedMediaIds?: number[];
  keptMediaIds?: number[];
};

/**
 * THE SHIM (T70): the generated client does not carry `DeleteDesignPicture` until the proto mirror
 * is regenerated. Until then the call goes through the same transport the generated client posts
 * with, on the route the server mounts beside `…/picture/{id}/hide`. Once `make proto` has run,
 * this whole function is one line: `adminService.DeleteDesignPicture({ pictureId })`.
 */
export function deleteDesignPicture(pictureId: number): Promise<DeleteDesignPictureResponse> {
  const generated = (adminService as unknown as Record<string, unknown>).DeleteDesignPicture;
  if (typeof generated === 'function') {
    return (
      generated as (request: { pictureId: number }) => Promise<DeleteDesignPictureResponse>
    ).call(adminService, { pictureId });
  }
  return requestHandler({
    path: `api/admin/design/picture/${pictureId}/delete`,
    method: 'POST',
    body: JSON.stringify({ pictureId }),
  }) as Promise<DeleteDesignPictureResponse>;
}

/** The server's reasons for this door, said as what to do — beside its own sentence, never instead. */
export const REASON_TEXT: Record<string, string> = {
  picture_not_found: 'it is already gone — the band is read again',
  picture_is_root: 'a generation plate stays; only a crop, or an edit of one, can be deleted',
};

/* ────────────────────────────── reading ────────────────────────────── */

/** A picture with a parent — a crop or an edit; the only kind the door stands on. */
export function isDerivedPicture(picture: common_DesignPicture): boolean {
  return (picture.derivedFrom ?? 0) > 0;
}

/** How many pictures in `pictures` descend from `rootId` (crops, edits, edits of crops …). */
export function descendantsOf(pictures: readonly common_DesignPicture[], rootId: number): number {
  if (rootId <= 0) return 0;
  const childrenOf = new Map<number, number[]>();
  for (const picture of pictures) {
    const parent = picture.derivedFrom ?? 0;
    const id = picture.id ?? 0;
    if (parent <= 0 || id <= 0) continue;
    const list = childrenOf.get(parent);
    if (list) list.push(id);
    else childrenOf.set(parent, [id]);
  }
  const seen = new Set<number>([rootId]);
  const stack = [rootId];
  let count = 0;
  while (stack.length) {
    const id = stack.pop() ?? 0;
    for (const child of childrenOf.get(id) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      count += 1;
      stack.push(child);
    }
  }
  return count;
}

/** The question's sentence — N is what the band shows under this picture. */
export function deleteQuestion(pieces: number): string {
  if (pieces <= 0) return 'it leaves this card and the storage for good — this cannot be undone';
  return `it and its ${pieces} cut ${pieces === 1 ? 'piece' : 'pieces'} leave this card and the storage for good — this cannot be undone`;
}

/** The one toast after the answer: what left the storage, and what stayed because it is used elsewhere. */
export function deletedSentence(res: DeleteDesignPictureResponse): string {
  const removed = res.deletedMediaIds?.length ?? 0;
  const kept = res.keptMediaIds?.length ?? 0;
  const parts = ['deleted'];
  if (removed > 0 || kept === 0)
    parts.push(`${removed} ${removed === 1 ? 'file' : 'files'} removed from storage`);
  if (kept > 0)
    parts.push(
      kept === 1
        ? '1 file kept — it is used elsewhere'
        : `${kept} files kept — they are used elsewhere`,
    );
  return parts.join(' · ');
}

/** The refusal as the server said it, with the door's own advice after it when the reason has one. */
export function refusalSentence(error: unknown): string {
  const message = (error as Error | null)?.message || 'the picture was not deleted';
  const advice = REASON_TEXT[refusalReason(error)];
  return advice ? `${message} — ${advice}` : message;
}

/* ────────────────────────────── the door ────────────────────────────── */

/**
 * THE QUESTION AND THE WRITE, WITHOUT THE BUTTON (T13). The workbench tile asks from its `slot ▾`
 * menu (`delete…`, the danger row) instead of a door under the frame, so the confirmation and the
 * mutation live here once and both organs open the same modal.
 */
export function useDeletePicture(
  techCardId: number,
  picture: common_DesignPicture,
  siblings?: readonly common_DesignPicture[],
) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const [open, setOpen] = useState(false);
  const pictureId = picture.id ?? 0;
  const pieces = descendantsOf(siblings ?? [], pictureId);

  const remove = useMutation({
    mutationFn: () => deleteDesignPicture(pictureId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: designKeys.band(techCardId) });
      showMessage(deletedSentence(res), 'success');
    },
    onError: (error) => {
      // Already gone: the band is stale, and a re-read takes the tile away by itself.
      if (refusalReason(error) === 'picture_not_found')
        qc.invalidateQueries({ queryKey: designKeys.band(techCardId) });
      showMessage(refusalSentence(error), 'error');
    },
  });

  const modal = open ? (
    <ConfirmationModal
      open
      onOpenChange={setOpen}
      title='delete this picture?'
      confirmLabel='delete for good'
      cancelLabel='keep'
      width='sm'
      onConfirm={() => remove.mutate()}
    >
      <Text size='small' component='p'>
        <span data-delete-question=''>{deleteQuestion(pieces)}</span>
      </Text>
    </ConfirmationModal>
  ) : null;

  return { ask: () => setOpen(true), pending: remove.isPending, pieces, modal };
}

/** The sentence a delete organ carries in its `title`. */
export function deleteTitle(pieces: number): string {
  return `delete this picture for good — it${pieces > 0 ? ` and its ${pieces} cut ${pieces === 1 ? 'piece' : 'pieces'}` : ''} leave this card and the storage; this cannot be undone`;
}

export function DeletePictureDoor({
  techCardId,
  picture,
  siblings,
  disabled,
  className,
}: {
  techCardId: number;
  picture: common_DesignPicture;
  /** The pictures of the row this one stands in — where its descendants are counted. */
  siblings?: readonly common_DesignPicture[];
  disabled?: boolean;
  className?: string;
}) {
  const pictureId = picture.id ?? 0;
  const { ask, pending, pieces, modal } = useDeletePicture(techCardId, picture, siblings);

  return (
    <>
      <Button
        type='button'
        variant='underline'
        size='xs'
        data-delete-picture={pictureId || undefined}
        className={cn('shrink-0', className)}
        disabled={disabled || pending}
        onClick={ask}
        aria-label={`delete picture ${pictureId} for good`}
        title={deleteTitle(pieces)}
      >
        delete
      </Button>
      {modal}
    </>
  );
}
