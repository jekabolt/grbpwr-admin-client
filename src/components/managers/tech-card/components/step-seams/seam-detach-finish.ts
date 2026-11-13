import { removeBindingStripsForSeam, type BindingOperation } from '../binding-step';
import type { CutStrip } from '../cut-strip-editor/use-cut-strip';

export type SeamDetachFormIo = {
  operation: (at: number) => (BindingOperation & { seamKeys?: string[] }) | undefined;
  strips: () => CutStrip[];
  setSeamKeys: (at: number, keys: string[]) => void;
  setStrips: (strips: CutStrip[]) => void;
  setInputs: (at: number, inputKeys: string[], bomLineKeys: string[]) => void;
  /** The card's undo history: cut once the server deleted the row. */
  cutHistory: () => void;
};

/**
 * The form side of a panel seam removal, after the server answered. When the server deleted the
 * row (U1 #1), the card history is cut first: an earlier entry may hold the key on a binding strip,
 * and a card UNDO would put the wiped seam back on it; the teardown below is then no entry either.
 */
export function finishStepSeamDetach(
  io: SeamDetachFormIo,
  at: number,
  seamKey: string,
  deletedKeys: readonly string[],
): void {
  const deleted = deletedKeys.includes(seamKey);
  if (deleted) io.cutHistory();
  const current = io.operation(at)?.seamKeys ?? [];
  if (current.includes(seamKey))
    io.setSeamKeys(
      at,
      current.filter((key) => key !== seamKey),
    );
  // A shared row still belongs to its other step; only the row's deletion owns the strip teardown.
  if (!deleted) return;
  const stripped = removeBindingStripsForSeam(io.operation(at), io.strips(), seamKey);
  if (!stripped) return;
  io.setStrips(stripped.strips);
  io.setInputs(at, stripped.inputKeys, stripped.bomLineKeys);
}
