import type { TeamJoinRequest } from 'api/proto-http/admin';
import { useState } from 'react';
import { GroupLabel, Text, UndoRow } from 'ui';
import { isOwnerOnly, memberRefusal } from './model';
import { JoinRequestRow } from './join-request-row';
import type { PeopleActions } from './use-people';

export function JoinRequests({
  requests,
  editor,
  actions,
}: {
  requests: TeamJoinRequest[];
  editor: boolean;
  actions: Pick<PeopleActions, 'approveJoinRequest' | 'declineJoinRequest'>;
}) {
  const [declining, setDeclining] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!requests.length) return null;

  const markDeclining = (ref: string, on: boolean) =>
    setDeclining((current) => {
      const next = new Set(current);
      if (on) next.add(ref);
      else next.delete(ref);
      return next;
    });

  const setError = (ref: string, error?: string) =>
    setErrors((current) => {
      const next = { ...current };
      if (error) next[ref] = error;
      else delete next[ref];
      return next;
    });

  return (
    <>
      <GroupLabel className='[&>span]:normal-case'>
        pending{' '}
        <Text component='span' variant='label' size='micro' className='font-normal'>
          {requests.length}
        </Text>
      </GroupLabel>
      <div className='flex flex-col'>
        {requests.map((request) => {
          const ref = request.requestRef ?? '';
          if (declining.has(ref))
            return (
              <UndoRow
                key={ref || request.email}
                name={request.email}
                onUndo={() => markDeclining(ref, false)}
                onCommit={() =>
                  actions.declineJoinRequest.mutate(ref, {
                    onError: (error) =>
                      !isOwnerOnly(error) && setError(ref, memberRefusal(error, 'not declined')),
                    onSettled: () => markDeclining(ref, false),
                  })
                }
              />
            );
          return (
            <JoinRequestRow
              key={ref || request.email}
              request={request}
              editor={editor}
              error={errors[ref]}
              approving={
                actions.approveJoinRequest.isPending &&
                actions.approveJoinRequest.variables?.requestRef === ref
              }
              onApprove={(role) => {
                setError(ref);
                actions.approveJoinRequest.mutate(
                  { requestRef: ref, role },
                  {
                    onError: (error) =>
                      !isOwnerOnly(error) && setError(ref, memberRefusal(error, 'not approved')),
                  },
                );
              }}
              onDecline={() => {
                setError(ref);
                markDeclining(ref, true);
              }}
            />
          );
        })}
      </div>
    </>
  );
}
