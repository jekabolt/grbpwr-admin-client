import type { common_StyleSizeChart, common_TechCard } from 'api/proto-http/admin';
import type { PrintOrient } from 'components/managers/print/scope';
import { DataTable, EmptyCell, HeaderNote, SectionHeader } from 'ui';
import {
  deriveMeasurementsPage,
  type MeasurementRow,
  type TechpackMeasurement,
} from '../derive-measurements';
import { TechnicalDrawing } from './figures';
import { chunksOf, continuedTitle, TechpackSheet, useTechpackOverflow } from '../sheet';

type Props = {
  techCard: common_TechCard;
  orient: PrintOrient;
  docline: string;
  n: string;
  measurements: readonly TechpackMeasurement[];
  sizeChart?: common_StyleSizeChart;
  sizeNames?: Readonly<Record<number, string>>;
  /** The chart RPC is live because release snapshots do not contain it. */
  release?: boolean;
};

function MeasurementsTable({ rows, unit }: { rows: readonly MeasurementRow[]; unit: string }) {
  return (
    <DataTable>
      <thead>
        <tr>
          <th>point</th>
          <th data-align='left'>method</th>
          <th>required</th>
          <th>tol ±</th>
          <th>measured</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td className='font-bold'>{row.point}</td>
            <td data-align='left'>{row.method}</td>
            <td>{row.required ? `${row.required} ${unit}` : <EmptyCell />}</td>
            <td />
            <td />
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
  release = false,
}: Props) {
  const model = deriveMeasurementsPage({ techCard, measurements, sizeChart, sizeNames });
  const land = orient === 'land';
  // port: two flats side by side are ~340px wide each, so the panel need not be taller
  const figureHeight = land ? 340 : 400;
  const gaps = model.rows.filter((row) => row.missing).length;
  const flag = model.rows.length === 0 ? 'measurements' : gaps ? String(gaps) : '';
  const paginationKey = `${techCard.id ?? 0}:${orient}:${model.rows.length}:${release}`;
  const { contentRef, overflow } = useTechpackOverflow(paginationKey);

  const sheet = (rows: readonly MeasurementRow[], continued: boolean, probe = false) => {
    const split = Math.ceil(rows.length / 2);
    return (
      <TechpackSheet
        key={`${continued}-${rows[0]?.id ?? 'empty'}`}
        orient={orient}
        docline={docline}
      >
        <div ref={probe ? contentRef : undefined} className='contents'>
          <SectionHeader
            title={continuedTitle(n, 'measurements', continued)}
            action={
              <HeaderNote>
                {flag && (
                  <span className='font-bold text-error' data-missing={gaps ? String(gaps) : ''}>
                    ! {flag} ·{' '}
                  </span>
                )}
                {model.unit}
                {model.sampleSize ? ` · sample ${model.sampleSize}` : ''}
              </HeaderNote>
            }
          />
          {release && <p className='mb-1 text-nano uppercase text-labelColor'>live · not in rev</p>}
          <div
            className='flex items-center justify-center gap-6 border border-borderColor px-4'
            style={{ height: figureHeight }}
          >
            {model.views.length > 0 ? (
              model.views.map((view) => (
                <TechnicalDrawing key={view.side} view={view} height={figureHeight - 28} />
              ))
            ) : (
              <span className='font-bold uppercase text-error' data-missing=''>
                ! drawing
              </span>
            )}
          </div>
          {rows.length > 0 && (
            <div className={land ? 'mt-4 grid grid-cols-2 gap-x-8' : 'mt-4'}>
              {land ? (
                <>
                  <MeasurementsTable rows={rows.slice(0, split)} unit={model.unit} />
                  <MeasurementsTable rows={rows.slice(split)} unit={model.unit} />
                </>
              ) : (
                <MeasurementsTable rows={rows} unit={model.unit} />
              )}
            </div>
          )}
        </div>
      </TechpackSheet>
    );
  };

  if (!overflow) return sheet(model.rows, false, true);

  const pages = chunksOf(model.rows, land ? 18 : 20);
  if (!pages.length) return sheet([], false);
  return <>{pages.map((rows, index) => sheet(rows, index > 0, false))}</>;
}
