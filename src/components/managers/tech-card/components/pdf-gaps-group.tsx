// «PDF GAPS» IN THE CONSTRUCTION AUDIT (assembly-schema T12): every red mark the tech pack would
// print, one row each — section · what is missing · the step it names — and «go to», the door to
// where it is fixed. Seen marks are card-polish's (finding-seen.ts); a seen gap leaves the open
// count here and on paper, and comes back with «seen · N».

import type { TechCardAnalysisFinding } from 'api/proto-http/admin';
import type { ReactNode } from 'react';
import { Chip, GroupLabel, Text } from 'ui';
import type { Gap } from '../techpack/gaps';
import { gapKey } from '../techpack/gaps';
import { gapSection } from '../techpack/gap-findings';
import { isSeen, seenByLine } from './finding-seen';

export type GapRow = { gap: Gap; finding: TechCardAnalysisFinding };

export function PdfGapsGroup({
  rows,
  showSeen,
  onGo,
  onSeen,
  seenBusyKey,
  renderRef,
}: {
  rows: readonly GapRow[];
  showSeen: boolean;
  onGo: (gap: Gap) => void;
  /** Absent for a reader without write access. */
  onSeen?: (f: TechCardAnalysisFinding, seen: boolean) => void;
  seenBusyKey?: string;
  renderRef: (ref: string) => ReactNode;
}) {
  const open = rows.filter((r) => !isSeen(r.finding));
  const shown = showSeen ? rows : open;
  if (!shown.length) return null;
  return (
    <div className='flex flex-col' data-pdf-gaps=''>
      <GroupLabel>{`pdf gaps · ${open.length}`}</GroupLabel>
      {shown.map(({ gap, finding }) => {
        const seen = isSeen(finding);
        const busy = !!seenBusyKey && seenBusyKey === finding.key;
        const markable = !!onSeen && !!(finding.key ?? '').trim();
        return (
          <div
            key={gapKey(gap)}
            className={`flex flex-wrap items-center gap-2 border-b border-hairline py-1.5 last:border-b-0${seen ? ' opacity-60' : ''}`}
            title={seen ? seenByLine(finding) : undefined}
            data-gap-row={gapKey(gap)}
          >
            <Text size='control' className='min-w-0'>
              <span className='text-labelColor'>{gapSection(gap)}</span>
              {` · ${gap.label}`}
            </Text>
            {gap.refs
              .filter((r) => r.startsWith('op:'))
              .map((r) => (
                <span key={r}>{renderRef(r)}</span>
              ))}
            <div className='ml-auto flex shrink-0 items-center gap-2'>
              {markable && (
                <Chip nonForm dashed disabled={busy} onClick={() => onSeen?.(finding, !seen)}>
                  {busy ? '…' : seen ? 'unmark' : 'seen'}
                </Chip>
              )}
              <Chip nonForm dashed onClick={() => onGo(gap)} data-gap-go=''>
                go to
              </Chip>
            </div>
          </div>
        );
      })}
    </div>
  );
}
