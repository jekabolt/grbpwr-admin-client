import { Member } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useNavigate } from 'react-router-dom';
import Text from 'ui/components/text';
import { formatDateShort } from '../../../orders-catalog/components/utility';
import {
  formatEur,
  formatStatusLabel,
  formatTierLabel,
  getStatusColor,
  getTierColor,
} from '../../utils/tier-utils';

interface MembersTableProps {
  members: Member[];
  isLoading: boolean;
}

interface Column {
  key: string;
  label: string;
  accessor: (m: Member) => React.ReactNode;
}

const COLUMNS: Column[] = [
  { key: 'userId', label: 'ID', accessor: (m) => m.userId },
  { key: 'email', label: 'Email', accessor: (m) => m.email || '-' },
  { key: 'name', label: 'Name', accessor: (m) => m.name || '-' },
  {
    key: 'tier',
    label: 'Tier',
    accessor: (m) => (
      <span className={`inline-block px-1.5 py-0.5 ${getTierColor(m.currentTier)}`}>
        {formatTierLabel(m.currentTier, m.currentTierDisplay)}
      </span>
    ),
  },
  {
    key: 'spend',
    label: 'Spend (12mo)',
    accessor: (m) => formatEur(m.qualifyingSpendEur12mo),
  },
  {
    key: 'upgrade',
    label: 'Tier date',
    accessor: (m) => formatDateShort(m.tierUpgradeDate) || '-',
  },
  {
    key: 'review',
    label: 'Next review',
    accessor: (m) => formatDateShort(m.nextReviewDate) || '-',
  },
  {
    key: 'status',
    label: 'Status',
    accessor: (m) => (
      <span className={`inline-block px-1.5 py-0.5 ${getStatusColor(m.status)}`}>
        {formatStatusLabel(m.status)}
      </span>
    ),
  },
  {
    key: 'lastOrder',
    label: 'Last order',
    accessor: (m) => formatDateShort(m.lastOrderDate) || '-',
  },
];

export function MembersTable({ members, isLoading }: MembersTableProps) {
  const navigate = useNavigate();

  return (
    <div className='overflow-x-auto w-full'>
      <table className='w-full border-collapse border-2 border-textInactiveColor min-w-max'>
        <thead className='bg-textInactiveColor h-10'>
          <tr className='border-b border-textInactiveColor'>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'text-center h-10 min-w-20 border border-r border-textInactiveColor px-2',
                  {
                    'sticky left-0 bg-textInactiveColor z-10': col.key === 'userId',
                  },
                )}
              >
                <Text variant='uppercase'>{col.label}</Text>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length} className='text-center py-8'>
                <Text variant='uppercase'>{isLoading ? 'loading…' : 'no members found'}</Text>
              </td>
            </tr>
          ) : (
            members.map((m) => (
              <tr
                key={m.userId}
                className='group border-b border-text last:border-b-0 h-10 hover:bg-highlightColor/20 cursor-pointer transition-colors'
                onClick={() => navigate(`/members/${m.userId}`)}
              >
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className={cn('border border-r border-textInactiveColor text-center px-2', {
                      'sticky left-0 bg-bgColor group-hover:bg-highlightColor/20 z-10':
                        col.key === 'userId',
                    })}
                  >
                    <Text>{col.accessor(m)}</Text>
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
