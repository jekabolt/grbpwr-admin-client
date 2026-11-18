import { garmentLabelDrawingsOf } from 'components/managers/tech-card/components/garment-label-pieces';
import { buildAssemblyPiecesFromInput } from 'components/managers/tech-card/techpack/assembly-geometry-build';
import { anchorOf } from 'lib/seams/anchor';
import { runById } from 'lib/seams/frame';
import { anchorFromWire, anchorToWire } from 'lib/seams/wire';
import type { SavedAssemblyPhysicalAnchorV1 } from './saved-assembly-operation-anchors-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical } from './saved-assembly-topology-hash-v1';

type Label = Extract<SavedAssemblyPhysicalAnchorV1['source'], { kind: 'garment-label' }>['label'];

/** The ordinary generated label's own seam frame, with its folded visible outline. */
export function readSavedGarmentLabelStitchAnchorV1(
  label: Label,
  anchor: SavedAssemblyPhysicalAnchorV1['anchor'],
  sizeToken: string,
) {
  const [drawing] = garmentLabelDrawingsOf([label], sizeToken);
  const stored = anchorFromWire(anchor);
  if (!drawing || drawing.key !== stored.piece || stored.placement) return null;
  const key = drawing.key;
  const pieces = buildAssemblyPiecesFromInput(
    {
      pieces: [
        { lineKey: key, name: drawing.mark.label, materials: [], garmentLabel: drawing.mark },
      ],
      bomItems: [],
    },
    new Map([[key, drawing.found]]),
  );
  const shape = pieces.pieces.get(key)?.geom;
  const edge = shape && runById(shape, stored.edgeHint);
  if (
    !shape ||
    !edge ||
    canonical(
      anchorToWire({
        ...anchorOf(shape, edge, pieces.grainDeg.get(key), stored.range),
        layer: stored.layer,
      }),
    ) !== canonical(anchorToWire(stored))
  )
    return null;
  const points = (value: typeof edge.pts) =>
    Object.freeze(value.map(([x, y]) => Object.freeze([x, y] as const)));
  return Object.freeze({
    lineKey: key,
    outlineMm: points(shape.rs),
    edgeMm: points(edge.pts),
    edgeHint: edge.id,
    fraction: Object.freeze([...stored.range] as const),
  });
}
