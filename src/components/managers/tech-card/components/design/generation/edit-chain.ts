import type { common_DesignPicture } from 'api/proto-http/admin';

/**
 * ═══ AN EDIT CHAIN, ITS CURRENT VERSION, UNDO AND REDO (04.10, owner item 28, T28 v2) ═══════════
 *
 * Owner, verbatim: «если в LATEST GENERATION или в FLAT SLOTS мы делаем эдит то картинка после эдита
 * должна пропагейтится … в LATEST GENERATION не должно показываться две картинки новая и старая а
 * только новая но на ховер должна быть кнопка undo redo».
 *
 * THE CHAIN IS THE SERVER'S: every edit made on the bench or in a slot takes its original's place
 * (`FlattenDesignEditLayer` with `replacePictureId`), which stamps the original `replaced_by` and
 * moves the slot holding it onto the edit. All links live in one run (or batch) row.
 *
 * UNDONE IS ITS OWN FACT, `undone_at` — not `hidden_at`, which undo and redo never touch. The
 * current version of a chain = walk `replaced_by` from the root and stop before the first undone
 * link; that is what the bench draws (`outputPlan` with `heads`) and what a slot holds.
 *
 * UNDO AND REDO ARE ONE SERVER WRITE EACH (`UndoDesignEdit` / `RedoDesignEdit`): the server locks
 * the chain, compares the current version with the one this screen saw, marks or clears
 * `undone_at` and moves the slot, in one transaction. WHETHER they are offered is the server's
 * answer too — `can_undo` / `can_redo` on the current version, computed from the whole chain, so a
 * slotted plate from a paged-out run keeps its corners. An edit made after an undo takes the
 * current version's place over the undone branch (the server allows it over an UNDONE successor
 * only), so the branch stays filed in the history, dimmed, and nowhere else.
 *
 * Pure readers only; the write is `useEditChainDoors` (`edit-chain-doors.ts`).
 */

/** An undone edit (`undone_at` set). It stands nowhere on the bench and in no slot. */
export function isUndoneEdit(picture: common_DesignPicture): boolean {
  return !!picture.undoneAt;
}

/**
 * AN EDIT STANDS IN THIS PICTURE'S PLACE: it has a successor and the successor is not undone. The
 * server's `can_redo` says «my successor is undone» for a successor this row does not hold; one
 * the row holds is read directly. A successor neither tells about is taken as standing.
 */
export function successorStands(
  picture: common_DesignPicture,
  row: readonly common_DesignPicture[],
): boolean {
  const next = picture.replacedBy ?? 0;
  if (next <= 0) return false;
  if (picture.canRedo) return false;
  const successor = row.find((p) => (p.id ?? 0) === next);
  return !successor || !isUndoneEdit(successor);
}

/**
 * WHICH CORNERS THE PICTURE SHOWS — the server's word, nothing recomputed from the page — and the
 * version each step makes current (`expected_target_id`, T28 v2 C1): undo's is `undo_to_id`, redo's
 * is `replaced_by`. A step whose target the server did not name is not offered.
 */
export type ChainSteps = { undo: boolean; redo: boolean; undoTo: number; redoTo: number };

export function chainSteps(picture: common_DesignPicture | null): ChainSteps {
  const none = { undo: false, redo: false, undoTo: 0, redoTo: 0 };
  if (!picture || (picture.id ?? 0) <= 0) return none;
  const undoTo = picture.undoToId ?? 0;
  const redoTo = picture.replacedBy ?? 0;
  return {
    undo: !!picture.canUndo && undoTo > 0,
    redo: !!picture.canRedo && redoTo > 0,
    undoTo,
    redoTo,
  };
}
