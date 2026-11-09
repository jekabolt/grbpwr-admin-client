import type { common_StyleSizeChart, common_TechCard } from 'api/proto-http/admin';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import type { PrintOrient } from 'components/managers/print/scope';
import { POM_CODES_BY_GARMENT, isGirth } from 'lib/pom/chart-points';
import { iconLineMeasurementId, type SizeChartPictureDraft } from 'lib/pom/size-chart-picture';
import type { GarmentKind, PomCode } from 'lib/pom/types';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { DataTable, EmptyCell, HeaderNote, SectionHeader } from 'ui';

import { SizeChartPictureGraphic } from '../../components/size-chart-picture';
import { SizeChartSchematic } from '../../components/size-chart-schematic';
import {
  deriveMeasurementsPage,
  type MeasurementRow,
  type TechpackMeasurement,
} from '../derive-measurements';
import { own, useT } from '../i18n';
import { chunksOf, continuedTitle, TechpackSheet, useTechpackOverflow } from '../sheet';
import { Missing } from './bits';

type Props = {
  techCard: common_TechCard;
  orient: PrintOrient;
  docline: string;
  n: string;
  measurements: readonly TechpackMeasurement[];
  sizeChart?: common_StyleSizeChart;
  sizeNames?: Readonly<Record<number, string>>;
  /** Main-fabric shrinkage, used when the chart has no override of its own. */
  fabricShrinkage?: number;
  /** A release print: `sizeChart` is the chart frozen with it, absent on an older release. */
  release?: boolean;
};

type ChartRow = {
  id: number;
  position: number;
  name: string;
  pomCode?: PomCode;
  tolerance: string;
  values: ReadonlyMap<number, string>;
};

const POM_CODES = new Set<PomCode>([
  ...POM_CODES_BY_GARMENT.top,
  ...POM_CODES_BY_GARMENT.bottom,
] as PomCode[]);
const TOP_CODES = new Set<PomCode>(POM_CODES_BY_GARMENT.top);

const numberOf = (value: string | undefined): number | null => {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const decimalText = (value: { value?: string } | undefined): string => value?.value?.trim() ?? '';

const oneDecimal = (value: string | number | undefined): string => {
  const parsed = typeof value === 'number' ? value : numberOf(value);
  return parsed == null ? '' : parsed.toFixed(1);
};

const shortNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);

const humanName = (value: string): string => {
  const words = value.replace(/[-_]+/g, ' ').trim().toLowerCase();
  return words ? `${words[0].toUpperCase()}${words.slice(1)}` : '';
};

const pomCodeOf = (value: string | undefined): PomCode | undefined =>
  value && POM_CODES.has(value as PomCode) ? (value as PomCode) : undefined;

function pictureOf(chart: common_StyleSizeChart | undefined): SizeChartPictureDraft | null {
  const stored = chart?.picture;
  if (stored?.source !== 'icon' && stored?.source !== 'sketch' && stored?.source !== 'upload') {
    return null;
  }
  return {
    source: stored.source,
    iconKey: stored.iconKey ?? '',
    mediaId: stored.mediaId ?? 0,
    mediaUrl: stored.mediaUrl ?? '',
    lines: (stored.lines ?? []).map((line, index) => ({
      measurementNameId: line.measurementNameId ?? 0,
      x1: line.x1 ?? 0,
      y1: line.y1 ?? 0,
      x2: line.x2 ?? 0,
      y2: line.y2 ?? 0,
      position: line.position ?? index + 1,
    })),
  };
}

function toleranceOf(
  minus: { value?: string } | undefined,
  plus: { value?: string } | undefined,
): string {
  const low = numberOf(decimalText(minus)) ?? 1;
  const high = numberOf(decimalText(plus)) ?? 1;
  return Math.abs(low - high) < 0.05
    ? oneDecimal(high)
    : `−${oneDecimal(low)} / +${oneDecimal(high)}`;
}

function chartRows(
  chart: common_StyleSizeChart | undefined,
  measurements: readonly TechpackMeasurement[],
  legacyRows: readonly MeasurementRow[],
  sizeIds: readonly number[],
): ChartRow[] {
  const names = new Map(measurements.map((measurement) => [measurement.id, measurement.name]));
  const cells = new Map<string, string>();
  for (const cell of chart?.cells ?? []) {
    if (cell.sizeId == null || cell.measurementNameId == null) continue;
    cells.set(`${cell.sizeId}:${cell.measurementNameId}`, decimalText(cell.value));
  }
  const points = [...(chart?.points ?? [])]
    .filter((point) => point.measurementNameId != null)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  if (points.length) {
    return points.map((point, index) => {
      const id = point.measurementNameId ?? 0;
      return {
        id,
        position: point.position || index + 1,
        name: humanName(names.get(id) ?? ''),
        pomCode: pomCodeOf(point.pomCode),
        tolerance: toleranceOf(point.tolMinusCm, point.tolPlusCm),
        values: new Map(sizeIds.map((sizeId) => [sizeId, cells.get(`${sizeId}:${id}`) ?? ''])),
      };
    });
  }

  // Pre-points cards keep their complete chart while the server migrates them to explicit rows.
  const idsWithCells = new Set(
    (chart?.cells ?? []).flatMap((cell) =>
      cell.measurementNameId == null ? [] : [cell.measurementNameId],
    ),
  );
  const fallback = measurements.filter((measurement) => idsWithCells.has(measurement.id));
  return (fallback.length ? fallback : legacyRows).map((measurement, index) => {
    const id = measurement.id;
    const name = 'name' in measurement ? measurement.name : measurement.method;
    return {
      id,
      position: index + 1,
      name: humanName(name),
      tolerance: oneDecimal(1),
      values: new Map(sizeIds.map((sizeId) => [sizeId, cells.get(`${sizeId}:${id}`) ?? ''])),
    };
  });
}

function ChartMetaText({ shrinkage }: { shrinkage: number }) {
  return (
    <HeaderNote>
      cm · {own('half / full')} · {own('shrink')} {shortNumber(shrinkage)}%
    </HeaderNote>
  );
}

function ChartTable({
  rows,
  sizeIds,
  sizeNames,
  baseSizeId,
}: {
  rows: readonly ChartRow[];
  sizeIds: readonly number[];
  sizeNames?: Readonly<Record<number, string>>;
  baseSizeId: number;
}) {
  const { t } = useT();
  return (
    <DataTable className='text-nano [&_td]:h-auto [&_td]:px-1 [&_td]:py-1 [&_th]:px-1'>
      <thead>
        <tr>
          <th>#</th>
          <th data-align='left'>{t('measurements.point')}</th>
          <th>±</th>
          {sizeIds.map((sizeId) => (
            <th key={sizeId}>
              {own(formatSizeName(sizeNames?.[sizeId] ?? `#${sizeId}`))}
              {sizeId === baseSizeId ? ` ${own('base')}` : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.position}</td>
            <td data-align='left'>{row.name ? own(row.name) : <EmptyCell />}</td>
            <td>{row.tolerance}</td>
            {sizeIds.map((sizeId) => {
              const half = oneDecimal(row.values.get(sizeId));
              return (
                <td key={sizeId}>
                  {half ? (
                    row.pomCode && isGirth(row.pomCode) ? (
                      `${half} / ${oneDecimal((numberOf(half) ?? 0) * 2)}`
                    ) : (
                      half
                    )
                  ) : (
                    <EmptyCell />
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

export function MeasurementsPage({
  techCard,
  orient,
  docline,
  n,
  measurements,
  sizeChart,
  sizeNames,
  fabricShrinkage = 0,
  release = false,
}: Props) {
  const { t } = useT();
  const { dictionary } = useDictionary();
  // A chart row names any dictionary measurement, not only the ones the category suggests.
  const allMeasurements = useMemo<TechpackMeasurement[]>(
    () =>
      (dictionary?.measurements ?? []).flatMap((measurement) =>
        measurement.id && measurement.name ? [{ id: measurement.id, name: measurement.name }] : [],
      ),
    [dictionary?.measurements],
  );
  const measurementNameById = useMemo(
    () => new Map(allMeasurements.map((measurement) => [measurement.id, measurement.name])),
    [allMeasurements],
  );
  const measurementIdByName = useMemo(
    () =>
      new Map(
        allMeasurements.map((measurement) => [measurement.name.toLowerCase(), measurement.id]),
      ),
    [allMeasurements],
  );
  const picture = useMemo(() => pictureOf(sizeChart), [sizeChart]);
  const model = useMemo(
    () => deriveMeasurementsPage({ techCard, measurements, sizeChart, sizeNames, t }),
    [techCard, measurements, sizeChart, sizeNames, t],
  );
  const sizeIds = useMemo(
    () => [...new Set((techCard.techCard?.sizeIds ?? []).filter((id): id is number => !!id))],
    [techCard.techCard?.sizeIds],
  );
  const rows = useMemo(
    () =>
      chartRows(
        sizeChart,
        allMeasurements.length ? allMeasurements : measurements,
        model.rows,
        sizeIds,
      ),
    [allMeasurements, measurements, model.rows, sizeChart, sizeIds],
  );
  const kind: GarmentKind = rows.some((row) => row.pomCode && !TOP_CODES.has(row.pomCode))
    ? 'bottom'
    : 'top';
  const rowIds = new Set(rows.map((row) => row.id));
  const baseSizeId = techCard.techCard?.baseSampleSizeId ?? 0;
  const pictureSizeId = sizeIds.includes(baseSizeId) ? baseSizeId : sizeIds[0] ?? 0;
  const pictureValueFor = (measurementNameId: number) =>
    oneDecimal(rows.find((row) => row.id === measurementNameId)?.values.get(pictureSizeId));
  const rowGaps = model.rows.flatMap((row) => (row.gap ? [row.gap] : []));
  const override = numberOf(sizeChart?.shrinkagePct?.value);
  const title = [
    own('Size chart'),
    own(techCard.techCard?.styleNumber),
    own(techCard.techCard?.name),
  ]
    .filter(Boolean)
    .join(' · ');
  // An older release froze no chart: its page stays empty rather than print today's numbers.
  const notInRevision = release && !sizeChart;
  const paginationKey = `${techCard.id ?? 0}:${orient}:${rows.length}:${sizeIds.join(',')}:${notInRevision}`;
  const { contentRef, overflow } = useTechpackOverflow(paginationKey);

  const sheet = (pageRows: readonly ChartRow[], continued: boolean, probe = false) => (
    <TechpackSheet
      key={`${continued}-${pageRows[0]?.id ?? 'empty'}`}
      orient={orient}
      docline={docline}
    >
      <div ref={probe ? contentRef : undefined} className='contents'>
        <SectionHeader
          title={continuedTitle(n, title, continued, t)}
          action={
            notInRevision ? undefined : (
              <div className='flex items-center gap-1'>
                {model.gaps.measurements && <Missing gap={model.gaps.measurements} />}
                {model.gaps.drawing && <Missing gap={model.gaps.drawing} />}
                {rowGaps.map((gap) => (
                  <span key={`${gap.code}-${gap.refs.join('-')}`}>
                    <Missing gap={gap} />
                  </span>
                ))}
                <ChartMetaText shrinkage={override ?? fabricShrinkage} />
              </div>
            )
          }
        />
        {notInRevision ? (
          <p className='text-nano uppercase text-labelColor'>{t('common.notInRevision')}</p>
        ) : (
          <div className='grid grid-cols-[2fr_3fr] items-start gap-5'>
            {picture ? (
              <SizeChartPictureGraphic
                picture={picture}
                measurementNameById={measurementNameById}
                measurementNameIdOf={(name) =>
                  iconLineMeasurementId(
                    picture.iconKey,
                    name,
                    (candidate) => measurementIdByName.get(candidate.trim().toLowerCase()) ?? 0,
                    rowIds,
                  )
                }
                valueFor={pictureValueFor}
                className='max-h-[35rem]'
              />
            ) : (
              <SizeChartSchematic
                kind={kind}
                points={pageRows}
                label={own('Size chart')}
                className='max-h-[35rem]'
              />
            )}
            <ChartTable
              rows={pageRows}
              sizeIds={sizeIds}
              sizeNames={sizeNames}
              baseSizeId={baseSizeId}
            />
          </div>
        )}
      </div>
    </TechpackSheet>
  );

  if (notInRevision) return sheet([], false);
  if (!overflow) return sheet(rows, false, true);

  const pages = chunksOf(rows, orient === 'land' ? 18 : 20);
  if (!pages.length) return sheet([], false);
  return <>{pages.map((pageRows, index) => sheet(pageRows, index > 0))}</>;
}
