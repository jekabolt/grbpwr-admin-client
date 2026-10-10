// THE ASSEMBLY CHECK STRIP (01-DESIGN-L0 §4, §6): the DollReport as rows — what the doll could not
// close as drawn, worst first, each in words with millimetres and a door into the SEAMS review
// focused on that seam. The doll never writes to the card: fixing happens in SEAMS, and the doll
// is rebuilt from the decisions after the re-read.

import type { DollSeamReport } from 'lib/doll/types';
import { Chip } from 'ui/components/chip';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import type { ReportRow } from './words';

export function DollReportRows({
  rows,
  onFix,
  fixHint,
}: {
  rows: readonly ReportRow[];
  onFix: (seam: DollSeamReport | null) => void;
  /** Why the door opens the review unfocused (another size), or null. */
  fixHint: string | null;
}) {
  if (rows.length === 0)
    return (
      <Text size='micro' variant='label' component='p' className='py-1' data-doll-report-empty=''>
        every seam the pattern gives closed on the doll as drawn
      </Text>
    );
  return (
    <ul className='divide-y divide-hairline' data-doll-report=''>
      {rows.map((r) => (
        <li
          key={r.key}
          className='flex items-baseline gap-3 py-1'
          data-doll-row={r.kind === 'seam' ? r.state : r.label}
        >
          <Text
            component='span'
            size='micro'
            className={
              'w-24 shrink-0 uppercase tracking-label ' +
              (r.kind === 'seam' && (r.state === 'open' || r.state === 'twisted')
                ? 'font-bold text-textColor'
                : 'text-labelColor')
            }
          >
            {r.kind === 'seam' ? r.state : r.label}
          </Text>
          {r.kind === 'seam' ? (
            <>
              <Text component='span' className='min-w-0 flex-1 truncate' title={r.seam.note}>
                {r.who}
              </Text>
              <Text component='span' size='micro' variant='label' className='shrink-0 tabular-nums'>
                {r.gap}
                {r.note ? ` · ${r.note}` : ''}
              </Text>
            </>
          ) : (
            <Text component='span' className='min-w-0 flex-1 truncate' title={r.text}>
              {r.text}
            </Text>
          )}
          {r.check && <Pill tone='attention'>check</Pill>}
          {r.kind === 'seam' && (
            <Chip
              quiet
              onClick={() => onFix(r.seam)}
              title={fixHint ?? 'open the seams review on this seam'}
              data-doll-door='fix'
            >
              fix in seams review
            </Chip>
          )}
        </li>
      ))}
    </ul>
  );
}
