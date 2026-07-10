import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { formatDateShort } from '../../../orders-catalog/components/utility';
import { useHackerAccounts, useRevokeHackerStatus } from '../../utils/hooks';
import { formatEur } from '../../utils/tier-utils';

export function HackerAccounts() {
  const { data, isLoading } = useHackerAccounts();
  const revoke = useRevokeHackerStatus();
  const navigate = useNavigate();
  const { canWrite } = usePermissions();

  const members = data?.members ?? [];

  return (
    <div className='flex flex-col gap-4 border border-textColor p-4'>
      <Text variant='uppercase' size='default'>
        Hacker accounts {members.length > 0 && `(${members.length})`}
      </Text>

      <div className='overflow-x-auto w-full'>
        <table className='w-full border-collapse border border-textColor min-w-max'>
          <thead className='bg-textInactiveColor h-9'>
            <tr>
              {['ID', 'Email', 'Name', 'Spend (12mo)', 'Status', ''].map((h) => (
                <th key={h} className='border border-textColor px-2 h-9'>
                  <Text variant='uppercase' size='small'>
                    {h}
                  </Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={6} className='text-center py-6'>
                  <Text variant='inactive'>{isLoading ? 'loading…' : 'no hacker accounts'}</Text>
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.userId} className='border-b border-textColor last:border-b-0 h-9'>
                  <td className='border border-textColor text-center px-2'>
                    <Text size='small'>{m.userId}</Text>
                  </td>
                  <td className='border border-textColor text-center px-2'>
                    <Text size='small'>{m.email || '-'}</Text>
                  </td>
                  <td className='border border-textColor text-center px-2'>
                    <Text size='small'>{m.name || '-'}</Text>
                  </td>
                  <td className='border border-textColor text-center px-2'>
                    <Text size='small'>{formatEur(m.qualifyingSpendEur12mo)}</Text>
                  </td>
                  <td className='border border-textColor text-center px-2'>
                    <Text size='small'>{m.status || '-'}</Text>
                  </td>
                  <td className='border border-textColor text-center px-2 whitespace-nowrap'>
                    <Button variant='underline' onClick={() => navigate(`/members/${m.userId}`)}>
                      view
                    </Button>
                    {canWrite(SECTION.members) && (
                      <>
                        <span className='px-1'>·</span>
                        <Button
                          variant='underline'
                          onClick={() => revoke.mutate({ userId: m.userId! })}
                        >
                          revoke
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
