import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useEffect } from 'react';
import Text from 'ui/components/text';
import { setLocalActor } from './api/tasksService';
import { useTasks } from './hooks/useTasks';
import { BOARD_LABEL, BOARDS, STATUS_LABEL, STATUSES } from './utils/meta';

// F0 placeholder — proves the adapter + query hooks end to end. Replaced by the
// full drag-and-drop board in F1.
export function Tasks() {
  const { account, canRead } = usePermissions();
  useEffect(() => setLocalActor(account?.username), [account?.username]);

  const { data, isLoading } = useTasks({});
  const tasks = data?.tasks ?? [];

  if (!canRead(SECTION.tasks)) {
    return (
      <div className='mx-auto flex max-w-md flex-col items-center gap-2 border border-textColor p-10 text-center'>
        <Text variant='uppercase' size='large'>
          tasks
        </Text>
        <Text variant='label' size='small'>
          You don’t have access to this section.
        </Text>
      </div>
    );
  }

  return (
    <div className='flex w-full flex-col gap-4 pb-16'>
      <Text variant='uppercase' size='large'>
        tasks {isLoading ? '' : `· ${tasks.length}`}
      </Text>
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-3'>
        {BOARDS.map((board) => (
          <div key={board} className='border border-textColor p-3'>
            <Text variant='uppercase' size='small'>
              {BOARD_LABEL[board]}
            </Text>
            <div className='mt-2 flex flex-col gap-1'>
              {STATUSES.map((status) => {
                const count = tasks.filter(
                  (t) => t.task.board === board && t.task.status === status,
                ).length;
                return (
                  <div key={status} className='flex justify-between text-textBaseSize'>
                    <Text variant='label' size='small'>
                      {STATUS_LABEL[status]}
                    </Text>
                    <span>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
