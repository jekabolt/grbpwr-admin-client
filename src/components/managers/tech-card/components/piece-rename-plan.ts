import { clampUtf8Bytes } from 'utils/pattern';
import { calloutPartsOut, type TechCardFormData } from './schema';

type Piece = Pick<TechCardFormData['pieces'][number], 'lineKey' | 'name' | 'calloutNumber'>;
type Callout = Pick<
  NonNullable<TechCardFormData['callouts']>[number],
  'number' | 'mediaId' | 'clientRef' | 'part' | 'parts'
>;
export type PieceRenameFormState = Readonly<{
  pieces: readonly Piece[];
  callouts: readonly Callout[];
  technicalMedia: readonly Pick<
    NonNullable<TechCardFormData['technicalMedia']>[number],
    'mediaId'
  >[];
}>;

type CalloutBinding = Readonly<{
  mediaId: number;
  clientRef: string | null;
  parts: readonly string[];
}>;

export type PieceRenameTarget = Readonly<{
  lineKey: string;
  name: string;
  calloutNumber: number;
  callout: CalloutBinding | null;
}>;

type RenameEdit = Readonly<{ target: PieceRenameTarget | null; name: string }>;
type RenameWrite =
  | Readonly<{ path: `pieces.${number}.name` | `callouts.${number}.part`; value: string }>
  | Readonly<{ path: `callouts.${number}.parts`; value: string[] }>;

type RenamePlan =
  | Readonly<{ ok: true; writes: readonly RenameWrite[] }>
  | Readonly<{ ok: false; detail: string }>;

export function normalizeTechCardPieceRename(value: string): string {
  // The server caps the stored piece name at 255 UTF-8 bytes.
  return clampUtf8Bytes(value.trim(), 255).trimEnd();
}

const normalizedName = (name: string) => name.trim().toLowerCase();

function resolvePiece(state: PieceRenameFormState, lineKey: string) {
  if (!lineKey) return null;
  const pieces = state.pieces.flatMap((piece, index) =>
    piece.lineKey?.trim().toLowerCase() === lineKey.toLowerCase() ? [{ piece, index }] : [],
  );
  if (pieces.length !== 1 || pieces[0].piece.lineKey?.trim() !== lineKey) return null;
  const { piece, index: pieceIndex } = pieces[0];
  const calloutNumber = piece.calloutNumber ?? 0;
  // Piece callout numbers address technical sketches. Moodboard callouts have their own numbering.
  const technicalMedia = new Set(state.technicalMedia.map(({ mediaId }) => mediaId));
  const callouts = calloutNumber
    ? state.callouts.flatMap((callout, index) => {
        const mediaId = callout.mediaId ?? 0;
        return callout.number === calloutNumber && mediaId > 0 && technicalMedia.has(mediaId)
          ? [{ callout, index, mediaId }]
          : [];
      })
    : [];
  if (callouts.length > 1) return null;
  const linked = callouts[0];
  const target: PieceRenameTarget = {
    lineKey,
    name: piece.name ?? '',
    calloutNumber,
    callout: linked
      ? {
          mediaId: linked.mediaId,
          clientRef: linked.callout.clientRef ?? null,
          parts: calloutPartsOut(linked.callout),
        }
      : null,
  };
  return { target, pieceIndex, calloutIndex: linked?.index ?? null };
}

/** Captures the editable fields before typing. Array positions can move while a draft is open. */
export function captureTechCardPieceRenameTarget(
  state: PieceRenameFormState,
  lineKey: string,
): PieceRenameTarget | null {
  return resolvePiece(state, lineKey.trim())?.target ?? null;
}

function sameCallout(left: CalloutBinding | null, right: CalloutBinding | null): boolean {
  if (!left || !right) return left === right;
  return (
    left.mediaId === right.mediaId &&
    left.clientRef === right.clientRef &&
    left.parts.length === right.parts.length &&
    left.parts.every((part, index) => part === right.parts[index])
  );
}

/** Resolves fresh nested RHF paths and validates the entire batch before any leaf is written. */
export function planTechCardPieceRenames(
  state: PieceRenameFormState,
  edits: readonly RenameEdit[],
): RenamePlan {
  const writes: RenameWrite[] = [];
  const finalNames = new Map<number, string>();
  for (const { target, name } of edits) {
    const current = target && resolvePiece(state, target.lineKey);
    if (!current || !target || finalNames.has(current.pieceIndex))
      return { ok: false, detail: 'The selected piece is no longer uniquely present.' };
    if (
      target.name !== current.target.name ||
      target.calloutNumber !== current.target.calloutNumber ||
      !sameCallout(target.callout, current.target.callout)
    )
      return { ok: false, detail: 'The piece name or its sketch callout changed while editing.' };
    const nextName = normalizeTechCardPieceRename(name);
    if (!nextName) return { ok: false, detail: 'Enter a piece name.' };
    finalNames.set(current.pieceIndex, nextName);
    if (nextName === target.name) continue;
    writes.push({ path: `pieces.${current.pieceIndex}.name`, value: nextName });

    if (!target.callout || current.calloutIndex === null) continue;
    const [primary, ...remainingParts] = target.callout.parts;
    // The server derives each linked piece's name from the first callout part. Refuse a rename
    // that would also rename a different piece or replace a different primary name.
    if (
      state.pieces.some(
        (piece, index) =>
          index !== current.pieceIndex && piece.calloutNumber === target.calloutNumber,
      ) ||
      (primary && normalizedName(primary) !== normalizedName(target.name)) ||
      remainingParts.some((part) => normalizedName(part) === normalizedName(nextName))
    )
      return { ok: false, detail: 'Rename this shared sketch callout in the Sketch tab.' };
    writes.push(
      { path: `callouts.${current.calloutIndex}.parts`, value: [nextName, ...remainingParts] },
      { path: `callouts.${current.calloutIndex}.part`, value: nextName },
    );
  }

  for (const [index, name] of finalNames) {
    if (
      state.pieces.some(
        (piece, other) =>
          other !== index &&
          normalizedName(finalNames.get(other) ?? piece.name ?? '') === normalizedName(name),
      )
    )
      return { ok: false, detail: `Another piece is already named “${name}”.` };
  }
  return { ok: true, writes };
}
