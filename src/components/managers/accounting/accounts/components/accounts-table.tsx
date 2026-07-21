import { AcctAccount } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import Text from 'ui/components/text';
import Tooltip from 'ui/components/tooltip';
import { Pill } from '../../components/kit';

type Props = {
  accounts: AcctAccount[];
  canWrite: boolean;
  isLoading: boolean;
  onRename: (account: AcctAccount) => void;
  onArchiveToggle: (account: AcctAccount) => void;
};

// Picker table header cell — 10px bold uppercase in labelColor over hairline rules.
const TH = 'px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-labelColor';

// Chart of accounts roster (03 §3.1) — a plain <table> like members-table.tsx (no virtualization:
// the chart is ~34 rows, 08.8), restyled to the picker's hairline look. Rows arrive pre-sorted by
// code from the backend; section renders as a muted Pill. Actions are gated by canWrite; for
// is_system accounts they are hidden entirely and replaced by a tooltip, because the backend
// rejects rename/archive on them (FailedPrecondition) — the posting rules own those rows.
export function AccountsTable({ accounts, canWrite, isLoading, onRename, onArchiveToggle }: Props) {
  return (
    <div className='w-full overflow-x-auto'>
      <table className='w-full min-w-max border-collapse border border-textInactiveColor'>
        <thead className='bg-bgColor'>
          <tr className='border-b border-textInactiveColor'>
            <th className={TH}>code</th>
            <th className={TH}>name</th>
            <th className={TH}>section</th>
            <th className={TH}>statement</th>
            <th className={TH}>system</th>
            <th className={TH}>archived</th>
            <th className={`${TH} text-right`}>actions</th>
          </tr>
        </thead>
        <tbody>
          {accounts.length === 0 ? (
            <tr>
              <td colSpan={7} className='py-8 text-center'>
                <Text variant='uppercase'>{isLoading ? 'loading…' : 'no accounts'}</Text>
              </td>
            </tr>
          ) : (
            accounts.map((a) => (
              <tr
                key={a.code}
                className={cn(
                  'h-10 border-b border-textInactiveColor last:border-b-0',
                  a.archived && 'opacity-50',
                )}
              >
                <td className='whitespace-nowrap px-2 tabular-nums'>{a.code}</td>
                <td className='px-2'>{a.name}</td>
                <td className='px-2'>
                  <Pill tone='muted'>{a.section}</Pill>
                </td>
                <td className='px-2 uppercase'>{a.statement}</td>
                <td className='px-2'>
                  <Text variant='inactive'>{a.isSystem ? 'system' : '—'}</Text>
                </td>
                <td className='px-2'>
                  <Text variant='inactive'>{a.archived ? 'archived' : '—'}</Text>
                </td>
                <td className='px-2 text-right'>
                  {a.isSystem ? (
                    <Tooltip
                      trigger={
                        <button type='button' className='cursor-help text-textInactiveColor'>
                          <Text variant='inactive'>managed</Text>
                        </button>
                      }
                    >
                      <span className='block max-w-56 text-textBaseSize'>
                        system account — managed by posting rules
                      </span>
                    </Tooltip>
                  ) : canWrite ? (
                    <div className='flex items-center justify-end gap-3'>
                      <button
                        type='button'
                        onClick={() => onRename(a)}
                        className='underline underline-offset-2 hover:opacity-70'
                      >
                        <Text>rename</Text>
                      </button>
                      <button
                        type='button'
                        onClick={() => onArchiveToggle(a)}
                        className='underline underline-offset-2 hover:opacity-70'
                      >
                        <Text>{a.archived ? 'unarchive' : 'archive'}</Text>
                      </button>
                    </div>
                  ) : (
                    <Text variant='inactive'>—</Text>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
