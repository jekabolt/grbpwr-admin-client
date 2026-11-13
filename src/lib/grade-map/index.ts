// Grade map — the drawn elements of a piece traced through its sizes, and the transfer inside the
// piece built from them. Phase 0: nothing in the app imports this module yet.

import type { FusingSourceSize } from 'lib/fusing-dxf/dxf';
import type { GmSizeGeometry } from './types';

export * from './types';
export { BUILDER, buildFileMap, buildPieceMap } from './build';
export { bindNodes, bindPiece, carryArc, liveOf, meshSourceOf, nodesOf, BIND_MM } from './bind';
export { buildMesh, forward, inverse, samplesInside } from './mesh';
export {
  canonicalJson,
  decodeGradeMap,
  encodeGradeMap,
  GRADEMAP_TAG,
  GRADEMAP_FORM,
} from './serialize';

/** The builder's view of one size of a runtime piece (cut = outline, seam = net outline). */
export function fromSourceSize(s: FusingSourceSize): GmSizeGeometry {
  return {
    sizeId: s.sizeId,
    cut: s.outline,
    seam: s.netOutline ?? null,
    lines: (s.internals ?? []).map((l) => ({ layer: l.layer, closed: l.closed, points: l.points })),
  };
}
