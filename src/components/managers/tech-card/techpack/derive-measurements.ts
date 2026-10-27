import type {
  common_StyleSizeChart,
  common_TechCard,
  common_TechCardCallout,
  common_TechCardMediaFull,
} from 'api/proto-http/admin';
import { decimalNumber, decimalText } from './derive-shared';
import type { Gap, GapSink } from './gaps';

export type TechpackMeasurement = { id: number; name: string };

export type MeasurementLine = {
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type MeasurementView = {
  side: 'front' | 'back';
  mediaId: number;
  src: string;
  caption: string;
  aspectRatio?: string;
  lines: MeasurementLine[];
};

export type MeasurementRow = {
  id: number;
  point?: string;
  method: string;
  required?: string;
  missing: boolean;
  gap?: Gap;
};

export type MeasurementsModel = {
  unit: 'cm' | 'mm';
  sampleSize: string;
  rows: MeasurementRow[];
  views: MeasurementView[];
  missing: string[];
  gaps: { measurements?: Gap; drawing?: Gap };
};

type MeasurementInput = {
  techCard: common_TechCard;
  measurements: readonly TechpackMeasurement[];
  sizeChart?: common_StyleSizeChart;
  sizeNames?: Readonly<Record<number, string>>;
};

type Geometry = {
  callout: common_TechCardCallout;
  mediaId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

const normalized = (value: string | undefined): string =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const mediaUrl = (item: common_TechCardMediaFull): string =>
  item.media?.media?.fullSize?.mediaUrl ||
  item.media?.media?.compressed?.mediaUrl ||
  item.media?.media?.thumbnail?.mediaUrl ||
  '';

function mediaAspect(item: common_TechCardMediaFull): string | undefined {
  const media = item.media?.media;
  const info = media?.fullSize || media?.compressed || media?.thumbnail;
  return info?.width && info.height ? `${info.width} / ${info.height}` : undefined;
}

function calloutGeometry(callout: common_TechCardCallout): Geometry | undefined {
  if (
    callout.kind !== 'TECH_CARD_ANNOTATION_KIND_DIM' &&
    callout.kind !== 'TECH_CARD_ANNOTATION_KIND_BRACKET' &&
    callout.kind !== 'TECH_CARD_ANNOTATION_KIND_ARC'
  ) {
    return undefined;
  }
  const points = callout.points ?? [];
  if (points.length < 2 || !callout.mediaId) return undefined;
  const first = points[0];
  const last = points[points.length - 1];
  const x1 = decimalNumber(first.x);
  const y1 = decimalNumber(first.y);
  const x2 = decimalNumber(last.x);
  const y2 = decimalNumber(last.y);
  if ([x1, y1, x2, y2].some((value) => value == null)) return undefined;
  return {
    callout,
    mediaId: callout.mediaId,
    x1: x1!,
    y1: y1!,
    x2: x2!,
    y2: y2!,
  };
}

function calloutMatchesMeasurement(callout: common_TechCardCallout, measurement: string): boolean {
  const needle = normalized(measurement);
  if (!needle) return false;
  const fields = [callout.description, callout.part, callout.dimensions, ...(callout.parts ?? [])]
    .map(normalized)
    .filter(Boolean);
  return fields.some(
    (field) => field === needle || field.includes(needle) || needle.includes(field),
  );
}

export function deriveMeasurementsPage(input: MeasurementInput, sink?: GapSink): MeasurementsModel {
  const { techCard, measurements, sizeChart } = input;
  const tc = techCard.techCard;
  const sampleSizeId = tc?.baseSampleSizeId ?? 0;
  const add = (code: string, label: string, field: string, refs: string[] = []): Gap => {
    const gap: Gap = {
      code,
      refs: [...refs, `field:${field}`],
      label,
      section: '08',
      target: { tab: 'measurements', field },
    };
    return sink?.add(gap) ?? gap;
  };
  const cells = new Map<string, string>();
  for (const cell of sizeChart?.cells ?? []) {
    if (cell.sizeId == null || cell.measurementNameId == null) continue;
    cells.set(`${cell.sizeId}:${cell.measurementNameId}`, decimalText(cell.value));
  }

  const technical = (techCard.resolvedTechnicalMedia ?? []).filter((item) => !!mediaUrl(item));
  const selected = (['front', 'back'] as const).flatMap((side) => {
    const kind = side === 'front' ? 'TECH_CARD_MEDIA_KIND_FRONT' : 'TECH_CARD_MEDIA_KIND_BACK';
    const item = technical.find((candidate) => candidate.kind === kind);
    return item?.media?.id ? [{ side, item, mediaId: item.media.id }] : [];
  });
  const geometries = (tc?.callouts ?? [])
    .map(calloutGeometry)
    .filter((geometry): geometry is Geometry => !!geometry);
  const used = new Set<common_TechCardCallout>();
  const points = new Map<number, { label: string; geometry: Geometry }>();
  let letterIndex = 0;
  for (const measurement of measurements) {
    const geometry = geometries.find(
      (candidate) =>
        !used.has(candidate.callout) &&
        calloutMatchesMeasurement(candidate.callout, measurement.name),
    );
    if (!geometry) continue;
    const label = String.fromCharCode(65 + (letterIndex % 26));
    letterIndex += 1;
    used.add(geometry.callout);
    points.set(measurement.id, { label, geometry });
  }

  const rows: MeasurementRow[] = measurements.map((measurement) => {
    const required = sampleSizeId ? cells.get(`${sampleSizeId}:${measurement.id}`)?.trim() : '';
    return {
      id: measurement.id,
      point: points.get(measurement.id)?.label,
      method: measurement.name,
      required: required || undefined,
      missing: !required,
      gap: !required
        ? add('pdf_measurement_required_missing', 'required', measurement.name, [
            `field:measurement ${measurement.id}`,
          ])
        : undefined,
    };
  });
  const views: MeasurementView[] = selected.map(({ side, item, mediaId }) => ({
    side,
    mediaId,
    src: mediaUrl(item),
    caption: [
      side,
      ...rows.flatMap((row) => {
        const point = points.get(row.id);
        return point?.geometry.mediaId === mediaId ? [point.label] : [];
      }),
    ].join(' · '),
    aspectRatio: mediaAspect(item),
    lines: rows.flatMap((row) => {
      const point = points.get(row.id);
      if (!point || point.geometry.mediaId !== mediaId) return [];
      return [
        {
          label: point.label,
          x1: point.geometry.x1,
          y1: point.geometry.y1,
          x2: point.geometry.x2,
          y2: point.geometry.y2,
        },
      ];
    }),
  }));
  const missing = [
    ...(measurements.length === 0 ? ['measurements'] : []),
    ...(measurements.length > 0 && rows.some((row) => row.missing) ? ['required'] : []),
    ...(views.length === 0 ? ['drawing'] : []),
  ];
  const gaps = {
    measurements:
      measurements.length === 0
        ? add('pdf_measurements_missing', 'measurements', 'measurements')
        : undefined,
    drawing:
      views.length === 0 ? add('pdf_measurement_drawing_missing', 'drawing', 'drawing') : undefined,
  };
  return {
    unit: tc?.measurementUnit === 'TECH_CARD_MEASUREMENT_UNIT_MM' ? 'mm' : 'cm',
    sampleSize: sampleSizeId ? input.sizeNames?.[sampleSizeId] || `#${sampleSizeId}` : '',
    rows,
    views,
    missing,
    gaps,
  };
}
