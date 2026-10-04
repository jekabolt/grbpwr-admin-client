import type { common_DesignPicture } from 'api/proto-http/admin';

import { isPictureHidden } from '../visibility';
import { isCutOut } from './composite';

/**
 * ═══ AN EDIT CHAIN, ITS CURRENT VERSION, UNDO AND REDO (04.10, owner item 28, T28) ══════════════
 *
 * Owner, verbatim: «если в LATEST GENERATION или в FLAT SLOTS мы делаем эдит то картинка после эдита
 * должна пропагейтится … в LATEST GENERATION не должно показываться две картинки новая и старая а
 * только новая но на ховер должна быть кнопка undo redo».
 *
 * THE CHAIN IS THE SERVER'S: every edit made on the bench or in a slot takes its original's place
 * (`FlattenDesignEditLayer` with `replacePictureId`), which stamps the original `replaced_by` and
 * moves the slot holding it onto the edit. All links live in one run (or batch) row.
 *
 * THE CURRENT VERSION IS THE SERVER'S TOO, and it costs no new column: a HIDDEN link is an UNDONE
 * edit. Walk `replaced_by` from the root and stop before the first hidden link — that is what the
 * bench draws (`outputPlan` with `heads`) and what a slot holds. Undo hides the current version
 * (after its slot moved back to the one before it — the server refuses to hide a picture in a
 * slot); redo shows the undone one again and moves the slot onto it. An edit made after an undo
 * takes the current version's place over the undone branch (backend T28: a hidden successor frees
 * the place), so the branch stays filed in the history, dimmed, and nowhere else.
 *
 * Pure readers only; the writes are `useEditChainDoors` (`edit-chain-doors.ts`).
 */

/** The picture `replaced_by` names, in this row; undefined — none, or not on this page. */
function successorIn(
  picture: common_DesignPicture,
  row: readonly common_DesignPicture[],
): common_DesignPicture | undefined {
  const next = picture.replacedBy ?? 0;
  if (next <= 0 || next === picture.id) return undefined;
  return row.find((p) => (p.id ?? 0) === next);
}

/**
 * AN EDIT STANDS IN THIS PICTURE'S PLACE — its successor is visible. A successor this row does not
 * hold is taken as standing (the server's word `replaced_by` is all there is to go by); an undone
 * (hidden) one is not: the place is this picture's again.
 */
export function successorStands(
  picture: common_DesignPicture,
  row: readonly common_DesignPicture[],
): boolean {
  if ((picture.replacedBy ?? 0) <= 0) return false;
  const next = successorIn(picture, row);
  return !next || !isPictureHidden(next);
}

/** An undone edit: an edit (a flatten, not a cut) that is hidden. It stands nowhere on the bench. */
export function isUndoneEdit(picture: common_DesignPicture): boolean {
  return isPictureHidden(picture) && picture.derivation === 'flatten';
}

export type ChainSteps = {
  /** The version undo goes back to — the visible picture this one replaced; null — no undo. */
  undoTo: common_DesignPicture | null;
  /** The undone edit redo brings back; null — no redo. */
  redoTo: common_DesignPicture | null;
};

const NO_STEPS: ChainSteps = { undoTo: null, redoTo: null };

/**
 * WHERE UNDO AND REDO GO FROM `picture`, the current version of its chain, judged on its `row`.
 *   · UNDO — some visible picture of the row was replaced by this one, and nothing visible has grown
 *     out of this one (a cut, an edit beside): the server refuses to hide a picture with a visible
 *     child (`live_crop_parent`), and those children would be left hanging off a hidden version.
 *   · REDO — this picture's successor is an undone edit, and nothing visible was cut out of this
 *     picture since the undo: those pieces would stay cut from the version redo leaves.
 */
export function chainSteps(
  picture: common_DesignPicture,
  row: readonly common_DesignPicture[],
): ChainSteps {
  const id = picture.id ?? 0;
  if (id <= 0 || isPictureHidden(picture)) return NO_STEPS;
  const grownVisible = (cutOnly: boolean) =>
    row.some(
      (p) =>
        (p.derivedFrom ?? 0) === id &&
        (p.id ?? 0) !== id &&
        !isPictureHidden(p) &&
        (!cutOnly || isCutOut(p)),
    );
  const before = row.find(
    (p) => (p.replacedBy ?? 0) === id && (p.id ?? 0) !== id && !isPictureHidden(p),
  );
  const next = successorIn(picture, row);
  return {
    undoTo: before && !grownVisible(false) ? before : null,
    redoTo: next && isUndoneEdit(next) && !grownVisible(true) ? next : null,
  };
}
