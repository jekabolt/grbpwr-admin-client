import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { completeSavedAssemblyRowIdentityV1 } from './saved-assembly-complete-source-rpc-v1';
import type { SavedNativePointClosureMarkV1 } from './saved-native-point-closure-mark-v1';
import type { savedPointClosures } from './saved-point-closure-authoring-v1';

type SavedBinding = ReturnType<typeof savedPointClosures>[number];
type ResolvedMark = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  mark: SavedNativePointClosureMarkV1;
}>;

export type SavedNativePointFasteningV1 = Readonly<{
  seamKey: string;
  intent: SavedBinding['intent'];
  buttonholeOperationNumber: number;
  buttonOperationNumber: number;
  size: Readonly<{ sizeId: number; sizeToken: string }>;
  hole: Readonly<{
    row: DxfProductSavedRowIdentityV1;
    mark: SavedNativePointClosureMarkV1 &
      Readonly<{
        role: 'BUTTONHOLE_MIDPOINT';
        markedSegmentMm: NonNullable<SavedNativePointClosureMarkV1['markedSegmentMm']>;
      }>;
  }>;
  mount: Readonly<{
    row: DxfProductSavedRowIdentityV1;
    mark: SavedNativePointClosureMarkV1 & Readonly<{ role: 'BUTTON_MARK_CENTER' }>;
  }>;
}>;

/** Pairs independently resolved, current marks without interpreting fastening intent as geometry. */
export function bindSavedNativePointFasteningV1(
  binding: SavedBinding,
  size: SavedNativePointFasteningV1['size'],
  hole: ResolvedMark | undefined,
  mount: ResolvedMark | undefined,
): SavedNativePointFasteningV1 {
  const matches = ({ row, mark }: ResolvedMark, request: SavedBinding['hole']) =>
    row.patternLineKey === request.patternLineKey &&
    row.revision === request.savedRowRevision &&
    row.sha256 === request.dxfSha256 &&
    request.sizeId === size.sizeId &&
    mark.sizeId === size.sizeId &&
    mark.role === request.role &&
    mark.pieceLineKey === request.pieceLineKey &&
    mark.patternLineKey === request.patternLineKey &&
    mark.dxfSha256 === request.dxfSha256 &&
    mark.aliasBlockName === request.aliasBlockName &&
    mark.nativeBlockName === request.nativeBlockName &&
    mark.sourceEntityOp === request.sourceEntityOp &&
    mark.sourceInstancePath.length === request.sourceInstancePath.length &&
    mark.sourceInstancePath.every((part, index) => part === request.sourceInstancePath[index]);

  const markedSegmentMm = hole?.mark.markedSegmentMm;
  if (
    binding.stale ||
    !hole ||
    !mount ||
    hole.mark.role !== 'BUTTONHOLE_MIDPOINT' ||
    mount.mark.role !== 'BUTTON_MARK_CENTER' ||
    !markedSegmentMm ||
    !matches(hole, binding.hole) ||
    !matches(mount, binding.button) ||
    (hole.mark.sourceFileId === mount.mark.sourceFileId &&
      hole.mark.nativePathId === mount.mark.nativePathId)
  )
    throw new Error('An active fastening needs one exact current hole and button mount.');

  return Object.freeze({
    seamKey: binding.key,
    intent: binding.intent,
    buttonholeOperationNumber: binding.buttonholeOperation,
    buttonOperationNumber: binding.buttonOperation,
    size: Object.freeze({ ...size }),
    hole: Object.freeze({
      row: Object.freeze(completeSavedAssemblyRowIdentityV1(hole.row)),
      mark: Object.freeze({ ...hole.mark, role: hole.mark.role, markedSegmentMm }),
    }),
    mount: Object.freeze({
      row: Object.freeze(completeSavedAssemblyRowIdentityV1(mount.row)),
      mark: Object.freeze({ ...mount.mark, role: mount.mark.role }),
    }),
  });
}

/** The material cut at the buttonhole is independent of whether the button is engaged. */
export function savedNativeFasteningApertureV1({ seamKey, hole }: SavedNativePointFasteningV1) {
  const { pieceLineKey, markedSegmentMm } = hole.mark;
  return Object.freeze({
    seamKey,
    pieceLineKey,
    markedStartMm: markedSegmentMm[0],
    markedEndMm: markedSegmentMm[1],
  });
}
