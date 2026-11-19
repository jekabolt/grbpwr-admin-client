import type { DxfNativeSewingReplayStageOutputV1 } from 'lib/pattern-import/dxf-native-sewing-replay-v1';
import type { CardDraft } from 'lib/pattern-import/types';

/** Content-only view: never replace the original draft held by the saved source capability. */
export function createPatternImportNativeSewingAuthoringViewV1(
  original: CardDraft,
  native: DxfNativeSewingReplayStageOutputV1 | undefined,
  sourceSha256: string,
): CardDraft {
  if (
    !native?.replayReady ||
    !sourceSha256 ||
    native.pipeline.contentBinding?.sourceSha256 !== sourceSha256 ||
    original.dxfProvenance?.contentBinding?.sourceSha256 !== sourceSha256
  )
    throw new Error(
      'Exact native sewing paths for this DXF are unavailable; cut contours cannot replace them.',
    );
  return {
    ...structuredClone(original),
    dxfProvenance: structuredClone(native.pipeline),
    dxfPhaseDReplay: structuredClone(native.replay),
  };
}
