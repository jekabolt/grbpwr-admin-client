import type { TeamJoinRequest } from 'api/proto-http/admin';
import { useState } from 'react';
import { Button, Close, Select, Text } from 'ui';
import { ROLE_ITEMS, ROLE_SELECT_CASE } from './person-parts';

export function JoinRequestRow({
  request,
  editor,
  error,
  approving,
  onApprove,
  onDecline,
}: {
  request: TeamJoinRequest;
  editor: boolean;
  error?: string;
  approving: boolean;
  onApprove: (role: string) => void;
  onDecline: () => void;
}) {
  const [role, setRole] = useState('member');

  return (
    <div
      className={
        editor
          ? 'grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto_auto_1rem] items-center gap-2.5 border-hairline py-1 max-md:gap-1.5 [&+&]:border-t'
          : 'grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-hairline py-1 [&+&]:border-t'
      }
    >
      <span className='flex min-w-0 items-center gap-2'>
        <span aria-hidden='true' className='w-5 flex-none' />
        <span className='min-w-0 truncate'>{request.email}</span>
      </span>
      <Text
        component='span'
        size='micro'
        variant={error ? 'errorLabel' : 'label'}
        className='whitespace-nowrap'
        role={error ? 'alert' : undefined}
      >
        {error || 'pending'}
      </Text>
      {editor && (
        <>
          <Select
            {...ROLE_SELECT_CASE}
            name={`join-role-${request.email ?? 'pending'}`}
            size='sm'
            aria-label='join role'
            items={ROLE_ITEMS}
            value={role}
            onValueChange={setRole}
            disabled={approving}
            className={`w-auto ${ROLE_SELECT_CASE.className}`}
          />
          <Button
            variant='main'
            size='xs'
            className='h-[1.375rem] whitespace-nowrap'
            disabled={approving}
            onClick={() => onApprove(role)}
          >
            approve
          </Button>
          <Close size='sm' aria-label='decline' disabled={approving} onClick={onDecline} />
        </>
      )}
    </div>
  );
}
