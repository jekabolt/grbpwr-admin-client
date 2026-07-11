import { TierHistoryEntry } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import { formatDateShort } from '../../../orders-catalog/components/utility';
import { formatEur } from '../../utils/tier-utils';

const COLUMNS: {
  key: string;
  label: string;
  accessor: (e: TierHistoryEntry) => React.ReactNode;
}[] = [
  { key: 'created', label: 'Date', accessor: (e) => formatDateShort(e.createdAt, true) || '-' },
  { key: 'old', label: 'From', accessor: (e) => e.oldTier || '-' },
  { key: 'new', label: 'To', accessor: (e) => e.newTier || '-' },
  { key: 'trigger', label: 'Trigger', accessor: (e) => e.triggerType || '-' },
  { key: 'actor', label: 'Actor', accessor: (e) => e.actor || '-' },
  { key: 'spend', label: 'Spend @ change', accessor: (e) => formatEur(e.spendEurAtChange) },
  { key: 'reason', label: 'Reason', accessor: (e) => e.reason || '-' },
];

export function TierHistoryTable({ entries }: { entries: TierHistoryEntry[] }) {
  return (
    <div className='overflow-x-auto w-full'>
      <table className='w-full border-collapse border border-textInactiveColor min-w-max'>
        <thead className='bg-textInactiveColor h-9'>
          <tr className='border-b border-textInactiveColor'>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className='text-center h-9 min-w-20 border border-textInactiveColor px-2'
              >
                <Text variant='uppercase' size='small'>
                  {col.label}
                </Text>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length} className='text-center py-6'>
                <Text variant='inactive'>no tier history</Text>
              </td>
            </tr>
          ) : (
            entries.map((e) => (
              <tr key={e.id} className='border-b border-textInactiveColor last:border-b-0 h-9'>
                {COLUMNS.map((col) => (
                  <td key={col.key} className='border border-textInactiveColor text-center px-2'>
                    <Text size='small'>{col.accessor(e)}</Text>
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
