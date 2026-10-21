import type { common_TechCard } from 'api/proto-http/admin';
import type { PrintOrient } from 'components/managers/print/scope';
import { DataTable, EmptyCell, GroupLabel, HeaderNote, Pill, SectionHeader } from 'ui';
import { cardStatus } from '../derive-cover';
import type { MeasurementRow } from '../derive-measurements';
import { deriveQcSignoffPage, type QcSeamDelta } from '../derive-qc';
import { TechpackSheet } from '../sheet';
import { statusTone } from './bits';

type Props = {
  techCard: common_TechCard;
  orient: PrintOrient;
  docline: string;
  n: string;
  measurementRows?: readonly MeasurementRow[];
  sizeNames?: Readonly<Record<number, string>>;
  seamDeltas?: readonly QcSeamDelta[];
  labelPlacement?: string;
  revisionLabel?: string;
};

/** Who signs a sample off, when the card holds no sign-offs yet: a blank form. */
const ROLES = ['designer', 'pattern maker', 'technologist', 'sample'];

const CheckBox = () => (
  <span className='inline-block size-3 border border-textColor align-middle' />
);

const signoffTone = (state: string): 'ok' | 'warn' | 'attention' | 'gap' => {
  if (state === 'approved') return 'ok';
  if (state === 'rejected') return 'warn';
  if (state === 'pending') return 'gap';
  return 'attention';
};

export function QcSignoffPage({
  techCard,
  orient,
  docline,
  n,
  measurementRows,
  sizeNames,
  seamDeltas,
  labelPlacement,
  revisionLabel,
}: Props) {
  const land = orient === 'land';
  const model = deriveQcSignoffPage({
    techCard,
    measurementRows,
    sizeNames,
    seamDeltas,
    labelPlacement,
  });
  const hasRevisions = model.revisions.length > 0;
  const status = cardStatus(techCard);
  const qc = (
    <div>
      <GroupLabel flush action={<HeaderNote>{model.checks.length} checks</HeaderNote>}>
        qc checklist
      </GroupLabel>
      <DataTable>
        <thead>
          <tr>
            <th data-align='left' className='w-1/3'>
              check
            </th>
            <th>op</th>
            <th>pass</th>
            <th>fail</th>
            <th data-align='left'>note</th>
          </tr>
        </thead>
        <tbody>
          {model.checks.map((check) => (
            <tr key={check.key}>
              <td
                data-align='left'
                className={check.missing ? 'font-bold text-error' : undefined}
                data-missing={check.missing ? '' : undefined}
              >
                {check.missing && '! '}
                {check.what}
              </td>
              <td className='tabular-nums text-labelColor'>{check.op || <EmptyCell />}</td>
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
        {model.signoffs.length > 0 ? (
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
              {model.signoffs.map((row) => (
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
              ))}
            </tbody>
          </DataTable>
        ) : (
          <DataTable variant='grid'>
            <thead>
              <tr>
                <th>role</th>
                <th>name</th>
                <th>date</th>
                <th>signature</th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map((role) => (
                <tr key={role}>
                  <td className='uppercase text-labelColor' style={{ height: land ? 102 : 88 }}>
                    {role}
                  </td>
                  <td style={{ width: '28%' }} />
                  <td style={{ width: '18%' }} />
                  <td style={{ width: '30%' }} />
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
      {hasRevisions ? (
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
      ) : (
        (revisionLabel || status) && (
          <div>
            <GroupLabel flush>revision</GroupLabel>
            <DataTable>
              <thead>
                <tr>
                  <th>rev</th>
                  <th data-align='left'>state</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className='font-bold' style={{ height: 54 }}>
                    {revisionLabel}
                  </td>
                  <td data-align='left'>
                    {status && <Pill tone={statusTone(status)}>{status}</Pill>}
                  </td>
                </tr>
              </tbody>
            </DataTable>
          </div>
        )
      )}
    </div>
  );

  return (
    <TechpackSheet orient={orient} docline={docline}>
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
    </TechpackSheet>
  );
}
