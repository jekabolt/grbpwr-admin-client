import type { common_TechCard } from 'api/proto-http/admin';
import type { PrintOrient } from 'components/managers/print/scope';
import { DataTable, GroupLabel, HeaderNote, Pill, SectionHeader } from 'ui';
import type { MeasurementRow } from '../derive-measurements';
import { deriveQcSignoffPage } from '../derive-qc';
import { Paper } from './paper';

type Props = {
  techCard: common_TechCard;
  orient: PrintOrient;
  docline: string;
  n: string;
  measurementRows?: readonly MeasurementRow[];
  sizeNames?: Readonly<Record<number, string>>;
};

const CheckBox = () => (
  <span className='inline-block size-3 border border-textColor align-middle' />
);

const signoffTone = (state: string): 'ok' | 'warn' | 'attention' | 'gap' => {
  if (state === 'approved') return 'ok';
  if (state === 'rejected') return 'warn';
  if (state === 'pending') return 'gap';
  return 'attention';
};

export function QcSignoffPage({ techCard, orient, docline, n, measurementRows, sizeNames }: Props) {
  const land = orient === 'land';
  const model = deriveQcSignoffPage({ techCard, measurementRows, sizeNames });
  const hasRevisions = model.revisions.length > 0;
  const qc = (
    <div>
      <GroupLabel flush action={<HeaderNote>{model.checks.length} checks</HeaderNote>}>
        qc checklist
      </GroupLabel>
      <DataTable>
        <thead>
          <tr>
            <th data-align='left'>check</th>
            <th>op</th>
            <th>pass</th>
            <th>fail</th>
            <th data-align='left'>note</th>
          </tr>
        </thead>
        <tbody>
          {model.checks.map((check) => (
            <tr key={check.key}>
              <td data-align='left' className={check.missing ? 'font-bold text-error' : undefined}>
                {check.missing && '! '}
                {check.what}
              </td>
              <td className='tabular-nums text-labelColor'>{check.op}</td>
              <td>
                <CheckBox />
              </td>
              <td>
                <CheckBox />
              </td>
              <td data-align='left' className='text-labelColor'>
                {check.note}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
  const signoff = (
    <div className='flex min-h-0 flex-1 flex-col justify-between gap-6'>
      <div>
        <GroupLabel flush>sign-off</GroupLabel>
        <DataTable variant='grid'>
          <thead>
            <tr>
              <th>role</th>
              <th>state</th>
              <th>name</th>
              <th>date</th>
              <th>note</th>
            </tr>
          </thead>
          <tbody>
            {model.signoffs.length > 0 ? (
              model.signoffs.map((row) => (
                <tr key={row.key}>
                  <td
                    className='uppercase text-labelColor'
                    style={{ height: land ? (hasRevisions ? 64 : 88) : hasRevisions ? 58 : 72 }}
                  >
                    {row.role}
                  </td>
                  <td>
                    <Pill tone={row.stale ? 'warn' : signoffTone(row.state)}>
                      {row.stale ? 'stale' : row.state}
                    </Pill>
                  </td>
                  <td>{row.signedBy}</td>
                  <td>{row.signedAt}</td>
                  <td>{row.note}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className='font-bold uppercase text-error' style={{ height: land ? 88 : 72 }}>
                  ! sign-off
                </td>
                <td />
                <td />
                <td />
                <td />
              </tr>
            )}
          </tbody>
        </DataTable>
      </div>
      {hasRevisions && (
        <div>
          <GroupLabel flush>revision</GroupLabel>
          <DataTable>
            <thead>
              <tr>
                <th>date</th>
                <th data-align='left'>action</th>
                <th data-align='left'>section</th>
                <th data-align='left'>by</th>
              </tr>
            </thead>
            <tbody>
              {model.revisions.slice(0, 3).map((row) => (
                <tr key={row.key}>
                  <td>{row.date}</td>
                  <td data-align='left'>{row.action}</td>
                  <td data-align='left'>{row.section}</td>
                  <td data-align='left'>{[row.author, row.note].filter(Boolean).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}
    </div>
  );

  return (
    <Paper orient={orient} docline={docline}>
      <SectionHeader
        title={`${n} qc & sign-off`}
        action={
          model.sampleSize ? <HeaderNote>{`sample ${model.sampleSize}`}</HeaderNote> : undefined
        }
      />
      <div
        className={
          land
            ? 'grid min-h-0 flex-1 grid-cols-2 gap-x-8'
            : 'flex min-h-0 flex-1 flex-col justify-between gap-6'
        }
      >
        {qc}
        {signoff}
      </div>
    </Paper>
  );
}
