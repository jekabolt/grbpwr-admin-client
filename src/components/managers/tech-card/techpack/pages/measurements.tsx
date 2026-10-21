import type { common_StyleSizeChart, common_TechCard } from 'api/proto-http/admin';
import type { PrintOrient } from 'components/managers/print/scope';
import { DataTable, HeaderNote, SectionHeader } from 'ui';
import {
  deriveMeasurementsPage,
  type MeasurementRow,
  type TechpackMeasurement,
} from '../derive-measurements';
import { TechnicalDrawing } from './figures';
import { Paper } from './paper';

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
            <td>
              {row.required ? (
                `${row.required} ${unit}`
              ) : (
                <span className='font-bold text-error'>! required</span>
              )}
            </td>
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
  const figureHeight = land ? 340 : 480;
  const split = Math.ceil(model.rows.length / 2);
  return (
    <Paper orient={orient} docline={docline}>
      <SectionHeader
        title={`${n} measurements`}
        action={
          <HeaderNote tone={model.missing.length > 0 ? 'warn' : 'mut'}>
            {model.missing.length > 0 && `! ${model.missing.join(' · ! ')} · `}
            {model.unit}
            {model.sampleSize ? ` · sample ${model.sampleSize}` : ''}
          </HeaderNote>
        }
      />
      <div
        className='flex items-center justify-center gap-6 border border-borderColor'
        style={{ height: figureHeight }}
      >
        {model.views.length > 0 ? (
          model.views.map((view) => (
            <TechnicalDrawing key={view.side} view={view} height={figureHeight - 20} />
          ))
        ) : (
          <span className='font-bold uppercase text-error'>! drawing</span>
        )}
      </div>
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
    </Paper>
  );
}
