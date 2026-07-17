import { common_FittingChangeRequest } from 'api/proto-http/admin';
import {
  useAddFittingChangeRequest,
  useOpenFittingChangeRequests,
  useUpdateFittingChangeRequest,
} from 'components/managers/fittings/components/useFittingQuery';
import { zoneOptions } from 'components/managers/tech-card/components/operation-options';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { fieldErrorSummary } from 'utils/field-errors';

const zoneLabel = (zone?: string) => zoneOptions.find((o) => o.value === zone)?.label ?? '';

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
  const { showMessage } = useSnackBarStore();
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
    zone: cr.zone || '',
    pieceId: cr.pieceId || 0,
    status: carry ? 'open' : 'resolved',
    carriedFromId: carry ? cr.id || 0 : cr.carriedFromId || 0,
  });

  return (
    <div className='flex flex-col gap-2'>
      <Text variant='inactive' size='small'>
        Открытые пункты прошлых раундов — отметьте resolved (сделано) или перенесите в этот раунд.
      </Text>
      {items.map((cr) => (
        <div
          key={cr.id}
          className='flex flex-wrap items-center justify-between gap-2 border border-warning p-2'
        >
          <div className='flex min-w-0 flex-col'>
            <Text size='small' className='truncate'>
              round {cr.roundNumber ?? '?'} · {cr.target?.trim() || 'change'}
              {zoneLabel(cr.zone) ? ` · ${zoneLabel(cr.zone)}` : ''}
            </Text>
            <Text variant='inactive' size='small' className='truncate'>
              {cr.note || '—'}
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
                    onSuccess: () => showMessage('Marked resolved', 'success'),
                    onError: (e) => showMessage(fieldErrorSummary(e, 'Failed'), 'error'),
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
                add.mutate(asInsert(cr, true), {
                  onSuccess: () => showMessage('Carried into this round', 'success'),
                  onError: (e) => showMessage(fieldErrorSummary(e, 'Failed'), 'error'),
                });
              }}
            >
              carry over
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
