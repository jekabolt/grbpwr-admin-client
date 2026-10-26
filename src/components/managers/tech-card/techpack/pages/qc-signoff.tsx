import type { common_TechCard } from 'api/proto-http/admin';
import type { PrintOrient } from 'components/managers/print/scope';
import { DataTable, EmptyCell, GroupLabel, HeaderNote, Pill, SectionHeader } from 'ui';
import { cardStatus } from '../derive-cover';
import type { MeasurementRow } from '../derive-measurements';
import { deriveQcSignoffPage, type QcCheck, type QcSeamDelta } from '../derive-qc';
import { chunksOf, continuedTitle, TechpackSheet, useTechpackOverflow } from '../sheet';
import { statusTone } from './bits';
import { Gap } from '../gaps';

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
  const qc = (checks: readonly QcCheck[]) => (
    <div>
      <GroupLabel flush action={<HeaderNote>{checks.length} checks</HeaderNote>}>
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
          {checks.map((check) => (
            <tr key={check.key}>
              <td data-align='left'>{check.gap ? <Gap gap={check.gap} /> : check.what}</td>
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
  const signoff = (signoffs = model.signoffs, showRevision = true) => (
    <div className='flex min-h-0 flex-1 flex-col justify-between gap-6'>
      <div>
        <GroupLabel flush>sign-off</GroupLabel>
        {signoffs.length > 0 ? (
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
              {signoffs.map((row) => (
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
      {showRevision && hasRevisions ? (
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
      ) : showRevision ? (
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
      ) : null}
    </div>
  );

  const header = (continued = false) => (
    <SectionHeader
      title={continuedTitle(n, 'qc & sign-off', continued)}
      action={
        model.sampleSize ? <HeaderNote>{`sample ${model.sampleSize}`}</HeaderNote> : undefined
      }
    />
  );
  const paginationKey = `${techCard.id ?? 0}:${orient}:${model.checks.length}:${model.signoffs.length}:${model.revisions.length}`;
  const { contentRef, overflow } = useTechpackOverflow(paginationKey);

  if (!overflow) {
    return (
      <TechpackSheet orient={orient} docline={docline}>
        <div ref={contentRef} className='contents'>
          {header()}
          <div
            className={
              land
                ? 'grid min-h-0 flex-1 grid-cols-2 gap-x-8'
                : 'flex min-h-0 flex-1 flex-col justify-between gap-6'
            }
          >
            {qc(model.checks)}
            {signoff()}
          </div>
        </div>
      </TechpackSheet>
    );
  }

  const checkPages = chunksOf(model.checks, land ? 18 : 24);
  const signoffPages = model.signoffs.length
    ? chunksOf(model.signoffs, land ? 6 : 8)
    : [[] as typeof model.signoffs];
  return (
    <>
      {checkPages.map((checks, index) => (
        <TechpackSheet key={`checks-${index}`} orient={orient} docline={docline}>
          {header(index > 0)}
          {qc(checks)}
        </TechpackSheet>
      ))}
      {signoffPages.map((signoffs, index) => {
        const pageIndex = checkPages.length + index;
        return (
          <TechpackSheet key={`signoff-${index}`} orient={orient} docline={docline}>
            {header(pageIndex > 0)}
            {signoff(signoffs, index === signoffPages.length - 1)}
          </TechpackSheet>
        );
      })}
    </>
  );
}
