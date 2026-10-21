import type { common_StyleSizeChart, common_TechCard } from 'api/proto-http/admin';
import type { PrintOrient } from 'components/managers/print/scope';
import { DataTable, EmptyCell, HeaderNote, SectionHeader } from 'ui';
import {
  deriveMeasurementsPage,
  type MeasurementRow,
  type TechpackMeasurement,
} from '../derive-measurements';
import { TechnicalDrawing } from './figures';
import { TechpackSheet } from '../sheet';

type Props = {
  techCard: common_TechCard;
  orient: PrintOrient;
  docline: string;
  n: string;
  measurements: readonly TechpackMeasurement[];
  sizeChart?: common_StyleSizeChart;
  sizeNames?: Readonly<Record<number, string>>;
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
}: Props) {
  const model = deriveMeasurementsPage({ techCard, measurements, sizeChart, sizeNames });
  const land = orient === 'land';
  // port: two flats side by side are ~340px wide each, so the panel need not be taller
  const figureHeight = land ? 340 : 400;
  const split = Math.ceil(model.rows.length / 2);
  const gaps = model.rows.filter((row) => row.missing).length;
  const flag = model.rows.length === 0 ? 'measurements' : gaps ? String(gaps) : '';
  return (
    <TechpackSheet orient={orient} docline={docline}>
      <SectionHeader
        title={`${n} measurements`}
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
      {model.rows.length > 0 && (
        <div className={land ? 'mt-4 grid grid-cols-2 gap-x-8' : 'mt-4'}>
          {land ? (
            <>
              <MeasurementsTable rows={model.rows.slice(0, split)} unit={model.unit} />
              <MeasurementsTable rows={model.rows.slice(split)} unit={model.unit} />
            </>
          ) : (
            <MeasurementsTable rows={model.rows} unit={model.unit} />
          )}
        </div>
      )}
    </TechpackSheet>
  );
}
