import { common_FittingChangeRequest } from 'api/proto-http/admin';
import {
  useAddFittingChangeRequest,
  useOpenFittingChangeRequests,
  useUpdateFittingChangeRequest,
} from 'components/managers/fittings/components/useFittingQuery';
import { notify } from 'lib/stores/store';
import { Button, CalloutBox, Text, EmptyCell } from 'ui';
import { fieldErrorSummary } from 'utils/field-errors';
import { crPieceIds } from './schema';
import { fittingZoneLabel, normalizeFittingZone } from './zone-options';

// Carry-over (S26/E.15): the OPEN structured remarks from a style's earlier rounds, shown when opening
// the next round. Each can be RESOLVED (marked done) or CARRIED into this round (a new item here with
// carried_from_id → a visible continuation history). Only meaningful once the fitting links a style.
export function FittingCarryOver({
  techCardId,
  roundNumber,
  fittingId = 0,
  onCarryToForm,
}: {
  techCardId?: number;
  roundNumber: number;
  fittingId?: number;
  // CREATE mode (no fitting id yet): append the carried item to the form instead of an RPC.
  onCarryToForm?: (source: common_FittingChangeRequest) => void;
}) {
  // beforeRound = this fitting's round (0 = auto/not-yet-assigned → show every open item).
  const { data, isLoading } = useOpenFittingChangeRequests(techCardId, roundNumber, !!techCardId);
  const resolve = useUpdateFittingChangeRequest(fittingId, techCardId);
  const add = useAddFittingChangeRequest(fittingId, techCardId);

  const items = data?.changeRequests ?? [];
  if (!techCardId) return null;
  if (isLoading)
    return (
      <Text variant='inactive' size='small'>
        loading open items…
      </Text>
    );
  if (items.length === 0)
    return (
      <Text variant='inactive' size='small'>
        no open items from earlier rounds
      </Text>
    );

  const asInsert = (cr: common_FittingChangeRequest, carry: boolean) => ({
    fittingId: carry ? fittingId : cr.fittingId || 0,
    target: cr.target || '',
    note: cr.note || '',
    calloutNumber: cr.calloutNumber || 0,
    zone: normalizeFittingZone(cr.zone),
    pieceIds: crPieceIds(cr),
    pieceId: 0, // deprecated on the wire; pieceIds is authoritative
    status: carry ? 'open' : 'resolved',
    carriedFromId: carry ? cr.id || 0 : cr.carriedFromId || 0,
  });

  return (
    <div className='flex flex-col gap-2'>
      <Text variant='inactive' size='small'>
        Open items from previous rounds — mark them resolved (done) or carry them into this round.
      </Text>
      {items.map((cr) => (
        <CalloutBox
          key={cr.id}
          tone='warning'
          className='flex flex-wrap items-center justify-between gap-2'
        >
          <div className='flex min-w-0 flex-col'>
            <Text size='small' className='truncate'>
              round {cr.roundNumber ?? '?'} · {cr.target?.trim() || 'change'}
              {fittingZoneLabel(cr.zone) ? ` · ${fittingZoneLabel(cr.zone)}` : ''}
            </Text>
            <Text variant='inactive' size='small' className='truncate'>
              {cr.note || <EmptyCell />}
            </Text>
          </div>
          <div className='flex shrink-0 gap-2'>
            <Button
              type='button'
              variant='secondary'
              className='uppercase'
              disabled={resolve.isPending}
              onClick={() =>
                cr.id &&
                resolve.mutate(
                  { id: cr.id, changeRequest: asInsert(cr, false) },
                  {
                    // The item leaving the carry-over list is the receipt.
                    onError: (e) =>
                      notify({
                        sev: 'error',
                        subject: 'CHANGE REQUEST',
                        text: 'not resolved',
                        detail: fieldErrorSummary(e, 'Failed'),
                      }),
                  },
                )
              }
            >
              resolve
            </Button>
            <Button
              type='button'
              variant='secondary'
              className='uppercase'
              disabled={add.isPending}
              title='continue this item in the current round'
              onClick={() => {
                if (onCarryToForm) {
                  onCarryToForm(cr);
                  return;
                }
                // The item showing up in this round is the receipt.
                add.mutate(asInsert(cr, true), {
                  onError: (e) =>
                    notify({
                      sev: 'error',
                      subject: 'CHANGE REQUEST',
                      text: 'not carried',
                      detail: fieldErrorSummary(e, 'Failed'),
                    }),
                });
              }}
            >
              carry over
            </Button>
          </div>
        </CalloutBox>
      ))}
    </div>
  );
}
