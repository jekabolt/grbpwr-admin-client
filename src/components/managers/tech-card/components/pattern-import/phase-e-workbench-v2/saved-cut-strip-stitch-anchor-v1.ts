import { stripDrawingsOf } from 'components/managers/tech-card/components/cut-strips/strip-pieces';
import { buildAssemblyPiecesFromInput } from 'components/managers/tech-card/techpack/assembly-geometry-build';
import { anchorOf } from 'lib/seams/anchor';
import { runById } from 'lib/seams/frame';
import type { TechCardSeamAnchorWire } from 'lib/seams/types';
import { anchorFromWire, anchorToWire } from 'lib/seams/wire';
import type { SavedAssemblyCutStripSourceV1 } from './saved-assembly-complete-source-rpc-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical } from './saved-assembly-topology-hash-v1';

/** Exact generated edge from the saved trim dimensions and the same geometry used by Assembly Order. */
export function readSavedCutStripStitchAnchorV1(
  binding: SavedAssemblyCutStripSourceV1,
  anchor: TechCardSeamAnchorWire,
  sizeId: number,
  sizeToken: string,
) {
  const strip = binding.strip;
  const stored = anchorFromWire(anchor);
  const sizes = strip?.sizes?.filter((entry) => entry.sizeId === sizeId);
  if (
    !strip?.lineKey ||
    strip.lineKey !== stored.piece ||
    stored.placement ||
    sizes?.length !== 1 ||
    !sizes[0].sewnMm?.value ||
    !Number.isFinite(Number(sizes[0].sewnMm.value)) ||
    Number(sizes[0].sewnMm.value) <= 0 ||
    !Number.isFinite(stored.range[0]) ||
    !Number.isFinite(stored.range[1]) ||
    stored.range[0] < 0 ||
    stored.range[1] > 1 ||
    stored.range[0] >= stored.range[1]
  )
    return null;
  const [drawing] = stripDrawingsOf([strip], [], { sizeToken, baseSizeId: sizeId });
  if (
    !drawing ||
    drawing.key !== stored.piece ||
    drawing.mark.sewnMm !== Number(sizes[0].sewnMm.value)
  )
    return null;
  const key = drawing.key;
  const pieces = buildAssemblyPiecesFromInput(
    {
      pieces: [{ lineKey: key, name: drawing.mark.label, materials: [], cutStrip: drawing.mark }],
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
        ...anchorOf(shape, edge, pieces.grainDeg.get(key)),
        range: stored.range,
        layer: stored.layer,
      }),
    ) !== canonical(anchorToWire(stored))
  )
    return null;
  const points = (value: typeof edge.pts) =>
    Object.freeze(value.map(([x, y]) => Object.freeze([x, y] as const)));
  return Object.freeze({
    lineKey: key,
    widthMm: drawing.mark.widthMm,
    sewnMm: drawing.mark.sewnMm,
    outlineMm: points(shape.rs),
    edgeMm: points(edge.pts),
    edgeHint: edge.id,
    fraction: Object.freeze([...stored.range] as const),
  });
}
