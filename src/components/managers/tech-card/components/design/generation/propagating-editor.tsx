import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignPicture,
} from 'api/proto-http/admin';
import { useCallback, useRef } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import type { TechCardFormData } from '../../schema';
import { VectorModal } from '../modals';
import type { VectorReplace } from '../modals/vector-modal';
import { isPictureHidden } from '../visibility';
import { isCutOut } from './composite';
import { isUndoneEdit, successorStands } from './edit-chain';

/**
 * ═══ THE EDITOR WHOSE SAVE TAKES THE PICTURE'S PLACE — TWO HOSTS (04.10, owner item 28, T28) ════
 *
 * Moved out of `run-tile.tsx` unchanged but for `direct` and `slot`: the LATEST GENERATION tile and
 * the FLAT SLOTS cell (`bench-slot.tsx`) open the same editor, and in both the edit propagates —
 * «save» overwrites (`VectorReplace.direct`), the slot holding the picture moves onto the edit on
 * the server, and `undo` on the tile walks back (`edit-chain.ts`).
 */

/* ─────────────────────── «overwrite» — when it is closed (O-53 phase 2) ─────────────────────── */

/**
 * HOW MANY PIECES CUT STRAIGHT OUT OF `sheetId` STILL STAND — the server's `cut_sheet` guard, read
 * off the row (`DesignStandingPieces`, entity/design_replace.go): a piece stands while anything
 * grown from it is visible — the piece itself, an edit that took its place (`replaced_by`, followed
 * to the end), a piece cut from any of those, and so on down the branch. Crops and edits inherit
 * their parent's run, so the row IS the whole branch.
 */
function standingPieces(pictures: readonly common_DesignPicture[], sheetId: number): number {
  const byId = new Map<number, common_DesignPicture>();
  const cutsOf = new Map<number, number[]>();
  for (const picture of pictures) {
    const id = picture.id ?? 0;
    if (id <= 0) continue;
    byId.set(id, picture);
    const parent = picture.derivedFrom ?? 0;
    if (!isCutOut(picture) || parent <= 0) continue;
    const list = cutsOf.get(parent);
    if (list) list.push(id);
    else cutsOf.set(parent, [id]);
  }
  let standing = 0;
  for (const piece of cutsOf.get(sheetId) ?? []) {
    const stack = [piece];
    const seen = new Set<number>([sheetId]);
    let stands = false;
    while (stack.length && !stands) {
      const id = stack.pop() ?? 0;
      if (seen.has(id)) continue;
      seen.add(id);
      const node = byId.get(id);
      if (!node) continue;
      if (!isPictureHidden(node)) stands = true;
      stack.push(...(cutsOf.get(id) ?? []));
      if ((node.replacedBy ?? 0) > 0) stack.push(node.replacedBy ?? 0);
    }
    if (stands) standing += 1;
  }
  return standing;
}

/**
 * WHY «OVERWRITE» IS CLOSED FOR THIS PICTURE, as the end of «overwrite is closed: …» — or null.
 * 07-FLAT-WORKBENCH.md §3c/3d, in this order:
 *   · the server predates the verb — `replaced_by` ABSENT (not 0) on the read; the gateway emits
 *     the field on every picture of a server that has it (proto: DesignPicture.replaced_by);
 *   · an edit already took its place (only a picture held under an open editor is still drawn so on
 *     the workbench — `outputPlan`'s `keep`);
 *   · the picture carries the old hidden stamp (27.09, review r2): a stamp from before per-picture
 *     hiding was removed (T-14), which nothing on this screen can lift — the edit goes beside;
 *   · a sheet with pieces standing: they would stay cut from the original (`cut_sheet`);
 *   · the original is on the card's technical sheet (`technicalMedia`): `documentPlates` lists the
 *     card's media first and the bench plate after it, so the edit taking the slot would print a
 *     SECOND front beside the original — and its callouts would stay pinned to the original. The
 *     server refuses the same (`technical_sheet`, D-55); this reading only spares the save and the
 *     upload that its refusal would come after.
 * Every fact here can change while the editor is open — a poll brings another tab's edit or cut,
 * the card form takes a callout — so the open workbench editor re-renders the reason
 * (`WorkbenchEditor`: `useWatch`, the band) and asks for it again right before it writes
 * (`VectorReplace.closedNow`).
 */
export function overwriteClosed(
  picture: common_DesignPicture,
  siblings: readonly common_DesignPicture[],
  form: { technicalMedia?: { mediaId?: number }[]; callouts?: { mediaId?: number }[] } | null,
): string | null {
  if (picture.replacedBy === undefined) return 'this server cannot replace a picture yet';
  // An UNDONE successor frees the place again (T28 v2, `undone_at`): the edit goes over the undone
  // branch. A merely hidden one still holds it, as the server says (`already_replaced`).
  if (successorStands(picture, siblings))
    return 'an edit has already taken this picture’s place — edit that one instead';
  if (isUndoneEdit(picture)) return 'this edit was undone — redo it first, or save the edit as new';
  if (isPictureHidden(picture))
    return 'this picture is hidden — an old stamp nothing here can lift, so save the edit as new';
  const pieces = standingPieces(siblings, picture.id ?? 0);
  if (pieces > 0)
    return pieces === 1
      ? 'this sheet is already cut into 1 piece and it stays cut from the original — edit the piece instead'
      : `this sheet is already cut into ${pieces} pieces and they stay cut from the original — edit a piece instead`;
  const mediaId = picture.media?.id ?? 0;
  if (mediaId > 0 && (form?.technicalMedia ?? []).some((m) => (m.mediaId ?? 0) === mediaId)) {
    const callouts = (form?.callouts ?? []).filter((c) => (c.mediaId ?? 0) === mediaId).length;
    return callouts > 0
      ? `${callouts} callout${callouts === 1 ? '' : 's'} on the sheet ${callouts === 1 ? 'is' : 'are'} pinned to the original and would stay with it`
      : 'the original is on the card’s technical sheet and would stay there beside the edit';
  }
  return null;
}

/** The card fields `overwriteClosed` reads — one array for the life of the page (`useWatch` keys on it). */
const SHEET_FIELDS = ['technicalMedia', 'callouts'] as const;

/**
 * ═══ THE WORKBENCH'S EDITOR OVER ONE TILE — AND THE ONLY WATCHER OF THE CARD FORM (review r3) ═══
 *
 * Overwrite's reasons read the card form — `technicalMedia` and `callouts` — and move with it while
 * the question stands (27.09, review r2, D-55): a snapshot read as the editor opened went stale the
 * moment somebody pinned a callout. Watched by every tile, though, a keystroke in a callout made
 * every picture of the history render again, for a question none of them can ask. Mounted only
 * while a workbench tile's editor is open, this watches for exactly one tile, and only then.
 *
 * `closedNow` is the same reading made at the moment of the call — the editor asks it right before
 * it writes an overwrite, long after the render that drew the question (`VectorReplace.closedNow`).
 */
export function WorkbenchEditor({
  band,
  techCardId,
  picture,
  siblings,
  slot = null,
  slotLabel,
  slotOf,
  disabled,
  onOpenChange,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  picture: common_DesignPicture;
  siblings?: readonly common_DesignPicture[];
  /**
   * FLAT SLOTS' editor (T28): the slot the editor was opened from. An overwrite moves it on the
   * server; where overwrite is closed, the edit saved as new goes into it, as it always did.
   */
  slot?: { ref: DesignBenchSlotRef; label: string; slotRev: number } | null;
  slotLabel: string | null;
  /** Where a picture stands on the bench, in prose — the toast after an overwrite (D-55). */
  slotOf?: (band: GetDesignBandResponse, pictureId: number) => string | null;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useFormContext<TechCardFormData>();
  const [technicalMedia, callouts] = useWatch({ control: form.control, name: SHEET_FIELDS });
  /** The picture and its row as of the last render — what `closedNow` judges. */
  const latest = useRef({ picture, siblings });
  latest.current = { picture, siblings };
  const closedNow = useCallback(() => {
    const { picture: p, siblings: row } = latest.current;
    return overwriteClosed(
      p,
      row ?? [p],
      form.getValues() as Parameters<typeof overwriteClosed>[2],
    );
  }, [form]);
  return (
    <VectorModal
      open
      onOpenChange={onOpenChange}
      techCardId={techCardId}
      band={band}
      base={picture}
      slot={slot}
      replace={
        {
          pictureId: picture.id ?? 0,
          slotLabel,
          closed: overwriteClosed(picture, siblings ?? [picture], { technicalMedia, callouts }),
          closedNow,
          slotOf,
          direct: true,
        } satisfies VectorReplace
      }
      disabled={disabled}
    />
  );
}
