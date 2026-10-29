import { createElement } from 'react';

import type {
  common_StyleSizeChart,
  common_TechCard,
  common_TechCardMarker,
} from 'api/proto-http/admin';

import { deriveAssembly, type AsmPiece } from './derive-assembly';
import { deriveColourways } from './derive-colourways';
import { deriveCover } from './derive-cover';
import { deriveLabels } from './derive-labels';
import { deriveMaterials } from './derive-materials';
import { deriveMeasurementsPage, type TechpackMeasurement } from './derive-measurements';
import { derivePatternsMarkerPage } from './derive-patterns';
import { derivePieces, type TechpackPieceGeometry } from './derive-pieces';
import { deriveQcSignoffPage, type QcSeamDelta } from './derive-qc';
import { englishT, type PdfT } from './i18n';

export type GapTab =
  | 'construction'
  | 'materials'
  | 'labels'
  | 'colourways'
  | 'measurements'
  | 'patterns'
  | 'pieces'
  | 'cover'
  | 'signoff';

export type GapTarget = {
  tab: GapTab;
  op?: number;
  seamKey?: string;
  piece?: string;
  bomLine?: string;
  field?: string;
};

export type Gap = {
  code: string;
  refs: string[];
  label: string;
  section: string;
  target: GapTarget;
};

export function gapKey(g: Pick<Gap, 'code' | 'refs'>): string {
  return `${g.code}:${[...g.refs].sort().join(',')}`;
}

export class GapSink {
  private readonly gaps = new Map<string, Gap>();

  add(gap: Gap): Gap {
    const key = gapKey(gap);
    const existing = this.gaps.get(key);
    if (existing) return existing;
    this.gaps.set(key, gap);
    return gap;
  }

  list(): Gap[] {
    return [...this.gaps.values()];
  }
}

/** The only missing-data mark used by the PDF. */
function PdfGap({ gap }: { gap: Gap }) {
  return createElement(
    'span',
    {
      className:
        'inline-block whitespace-nowrap border border-dashed border-error px-1.5 py-0.5 text-micro font-normal normal-case leading-none text-textColor',
      'data-missing': '',
      'data-gap': gapKey(gap),
    },
    gap.label,
  );
}

export { PdfGap as Gap };

export type CollectPdfGapsInput = {
  techCard: common_TechCard;
  sampleSizeName?: string;
  revisionLabel?: string;
  pieces?: ReadonlyMap<string, AsmPiece>;
  grainDeg?: ReadonlyMap<string, number>;
  pieceGeometry?: TechpackPieceGeometry;
  measurements?: readonly TechpackMeasurement[];
  sizeChart?: common_StyleSizeChart;
  sizeNames?: Readonly<Record<number, string>>;
  markerLayouts?: readonly common_TechCardMarker[];
  patternViewerToken?: string;
  patternOrigin?: string;
  markerOrigin?: string;
  netM2ByLine?: Readonly<Record<string, number>>;
  includeMarkerLayouts?: boolean;
  labelPlacement?: string;
  t?: PdfT;
};

/** Run the same pure derivations as the document without rendering it. */
export function collectPdfGaps(input: CollectPdfGapsInput): Gap[] {
  const t = input.t ?? englishT;
  const sink = new GapSink();
  const pieces = input.pieces ?? new Map<string, AsmPiece>();
  const grainDeg = input.grainDeg ?? new Map<string, number>();
  const assembly = deriveAssembly({ techCard: input.techCard, pieces, grainDeg, t }, sink);
  deriveCover(
    input.techCard,
    { sampleSizeName: input.sampleSizeName, revisionLabel: input.revisionLabel },
    sink,
    t,
  );
  deriveMaterials(input.techCard, sink, t);
  derivePieces(input.techCard, input.pieceGeometry, sink, t);
  deriveColourways(input.techCard, sink, t);
  const labels = deriveLabels(input.techCard, { sampleSizeName: input.sampleSizeName }, sink, t);
  derivePatternsMarkerPage(
    {
      techCard: input.techCard,
      markerLayouts: input.markerLayouts,
      patternViewerToken: input.patternViewerToken,
      patternOrigin: input.patternOrigin,
      markerOrigin: input.markerOrigin,
      sizeNames: input.sizeNames,
      netM2ByLine: input.netM2ByLine,
      includeLayouts: input.includeMarkerLayouts,
      t,
    },
    sink,
  );
  const measurements = deriveMeasurementsPage(
    {
      techCard: input.techCard,
      measurements: input.measurements ?? [],
      sizeChart: input.sizeChart,
      sizeNames: input.sizeNames,
      t,
    },
    sink,
  );
  const seamDeltas: QcSeamDelta[] = [...assembly.cards.values()]
    .filter((card) => card.metrics.some((metric) => metric.bad))
    .map((card) => ({ op: card.n, delta: card.metrics.find((metric) => metric.bad)?.delta ?? 0 }));
  deriveQcSignoffPage(
    {
      techCard: input.techCard,
      measurementRows: measurements.rows,
      sizeNames: input.sizeNames,
      seamDeltas,
      labelPlacement: input.labelPlacement ?? labels.placement.name,
      t,
    },
    sink,
  );
  return sink.list();
}
