import {
  useOpenFittingChangeRequests,
  useUpdateFittingChangeRequest,
} from 'components/managers/fittings/components/useFittingQuery';
import { notify } from 'lib/stores/store';
import { Button, CheckboxCommon, EmptyCell, GroupLabel, Text } from 'ui';
import { fieldErrorSummary } from 'utils/field-errors';
import { categoryOf } from './edit-rows';
import { EditNumber } from './edit-row';
import { changeRequestInsert, useAddEdit } from './use-add-edit';
import { useFittingWorkspace } from './workspace';

// FITTING-WORKSPACE: the open edits of earlier rounds of the same tech card, inside the Edits
// block — one quiet group per round. ✓ carries the edit into this round (a new numbered edit with
// carried_from_id); the checkbox marks the old one resolved where it is. Either way it leaves.
export function CarryOverRows({ carriedIds }: { carriedIds: Set<number> }) {
  const { fittingId, techCardId, roundNumber, readOnly } = useFittingWorkspace();
  const { data } = useOpenFittingChangeRequests(techCardId, roundNumber, !!techCardId && !readOnly);
  const resolve = useUpdateFittingChangeRequest(fittingId, techCardId);
  const addEdit = useAddEdit();

  // Hide this fitting's own edits (round 0 = not assigned yet → the server lists every open one)
  // and the ones already carried into it.
  const items = (data?.changeRequests ?? []).filter(
    (cr) => cr.id && cr.fittingId !== fittingId && !carriedIds.has(cr.id),
  );
  if (readOnly || items.length === 0) return null;

  const rounds = [...new Set(items.map((cr) => cr.roundNumber ?? 0))].sort((a, b) => a - b);
  return (
    <>
      {rounds.map((r) => (
        <div key={r}>
          <GroupLabel>{r ? `from round ${r}` : 'from earlier'}</GroupLabel>
          <ul>
            {items
              .filter((cr) => (cr.roundNumber ?? 0) === r)
              .map((cr) => {
                const cat = categoryOf(cr.target ?? '');
                return (
                  <li
                    key={cr.id}
                    className='flex items-start gap-2.5 border-b border-hairline py-2.5 last:border-b-0'
                  >
                    <EditNumber n='·' hasMark={false} />
                    <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                      <span className='min-w-0 break-words pt-px text-labelColor'>
                        {cr.note || <EmptyCell />}
                      </span>
                      {cat && (
                        <Text size='micro' variant='label' className='uppercase tracking-label'>
                          {cat}
                        </Text>
                      )}
                    </div>
                    <Button
                      type='button'
                      variant='main'
                      size='xs'
                      aria-label='carry'
                      onClick={() =>
                        addEdit({ note: cr.note ?? '', target: cr.target ?? '', carriedFrom: cr })
                      }
                    >
                      ✓
                    </Button>
                    <CheckboxCommon
                      name={`carry-${cr.id}-resolved`}
                      aria-label='resolved'
                      className='mt-0.5'
                      checked={false}
                      disabled={resolve.isPending}
                      onChange={() =>
                        resolve.mutate(
                          {
                            id: cr.id as number,
                            changeRequest: changeRequestInsert(cr, cr.fittingId ?? 0, {
                              status: 'resolved',
                            }),
                          },
                          {
                            onError: (e) =>
                              notify({
                                sev: 'error',
                                subject: 'EDIT',
                                text: 'not resolved',
                                detail: fieldErrorSummary(e, 'Failed'),
                              }),
                          },
                        )
                      }
                    />
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </>
  );
}
