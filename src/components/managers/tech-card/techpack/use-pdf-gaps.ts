// THE PDF'S GAPS WITHOUT THE PDF (assembly-schema T12): the construction audit lists what the tech
// pack would print red, read from the same saved card and the same inputs as `TechpackDocument`
// (document.tsx) — the DXF geometry, the size chart, the sample size, the revision label. Detail
// marker layouts are left out: the document fetches them only once their section has moved to a
// sheet of its own, which is a layout fact the audit cannot know.

import type { common_TechCard } from 'api/proto-http/admin';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { viewerOrigin } from 'utils/viewer-origin';

import { deriveLabels } from './derive-labels';
import { derivePieces } from './derive-pieces';
import { collectPdfGaps, type Gap } from './gaps';
import { useAssemblyGeometry } from './use-assembly-geometry';
import { useTechpackMeasurements } from './use-l3-data';

const NONE: Gap[] = [];
const EMPTY_CARD = {} as common_TechCard;

/** Null while the pattern geometry is still being read (the list would only shrink later). */
export function usePdfGaps(
  techCard: common_TechCard | undefined,
  o: { patternViewerToken?: string } = {},
): Gap[] | null {
  const card = techCard ?? EMPTY_CARD;
  const ins = card.techCard;
  const { dictionary } = useDictionary();
  const sampleSize = (dictionary?.sizes ?? []).find(
    (s) => s.id != null && s.id === ins?.baseSampleSizeId,
  )?.name;
  const sampleSizeName = sampleSize ? formatSizeName(sampleSize) : '';
  const revisionLabel = card.lockVersion != null ? `rev ${card.lockVersion}` : '';
  const sizing = useTechpackMeasurements(card);
  const geometry = useAssemblyGeometry(card);
  const labelPlacement = useMemo(
    () => deriveLabels(card, { sampleSizeName }).placement.name,
    [card, sampleSizeName],
  );
  const netM2ByLine = useMemo(
    () =>
      Object.fromEntries(
        derivePieces(card, geometry.shapes)
          .groups.filter((group) => group.netAreaM2 > 0)
          .map((group) => [group.key, group.netAreaM2]),
      ),
    [card, geometry.shapes],
  );
  const origin = viewerOrigin();
  const pending = geometry.dep.status === 'pending';
  return useMemo(() => {
    if (!techCard) return NONE;
    if (pending) return null;
    const input = {
      techCard,
      sampleSizeName,
      revisionLabel,
      grainDeg: geometry.grainDeg,
      pieceGeometry: geometry.shapes,
      measurements: sizing.measurements,
      sizeChart: sizing.sizeChart,
      sizeNames: sizing.sizeNames,
      patternViewerToken: o.patternViewerToken,
      patternOrigin: origin,
      markerOrigin: origin,
      netM2ByLine,
      includeMarkerLayouts: false,
      labelPlacement,
    };
    try {
      return collectPdfGaps({ ...input, pieces: geometry.pieces });
    } catch {
      // the document prints without drawings when the engine cannot read the pattern
      return collectPdfGaps({ ...input, pieces: new Map(), grainDeg: new Map() });
    }
  }, [
    techCard,
    pending,
    sampleSizeName,
    revisionLabel,
    geometry.pieces,
    geometry.grainDeg,
    geometry.shapes,
    sizing.measurements,
    sizing.sizeChart,
    sizing.sizeNames,
    o.patternViewerToken,
    origin,
    netM2ByLine,
    labelPlacement,
  ]);
}
