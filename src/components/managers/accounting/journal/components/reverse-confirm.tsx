import { notify } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { CalloutBox, ConfirmationModal, Input, Text } from 'ui';
import { errorText, isRefused, reasonOf } from '../../utils/feedback';
import { useReverseJournalEntry } from '../../utils/hooks';

type Props = {
  entryId: number | null;
  onOpenChange: (open: boolean) => void;
  // Called after a successful reverse so the parent can also close the underlying detail modal.
  onReversed: () => void;
};

// Reverse flow (03 §3.2 "Деталка"): posts a mirror entry cancelling the original. closeOnConfirm
// is false so a backend rejection ("already reversed", "cannot reverse a reversal") keeps the
// modal open with the typed reason intact; the reason is required (the backend records it).
export function ReverseConfirm({ entryId, onOpenChange, onReversed }: Props) {
  const reverse = useReverseJournalEntry();
  const [reason, setReason] = useState('');
  // The server's refusal stands in the modal until the next attempt.
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (entryId === null) {
      setReason('');
      setRefusal(null);
    }
  }, [entryId]);

  const handleConfirm = () => {
    if (entryId === null || !reason.trim()) return;
    setRefusal(null);
    reverse.mutate(
      { entryId, reason: reason.trim() },
      {
        // No receipt: the reversing entry appears in the journal.
        onSuccess: () => onReversed(),
        onError: (e) => {
          const said = errorText(e, 'failed to reverse entry') ?? '';
          if (isRefused(e)) {
            setRefusal(said);
            return;
          }
          // No retry: a lost reply may still have posted the reversal.
          notify({
            sev: 'error',
            subject: `ENTRY ${entryId}`,
            text: 'not reversed',
            bad: reasonOf(e),
            detail: said,
          });
        },
      },
    );
  };

  return (
    <ConfirmationModal
      open={entryId !== null}
      onOpenChange={onOpenChange}
      onConfirm={handleConfirm}
      closeOnConfirm={false}
      title={entryId !== null ? `Reverse entry #${entryId}?` : 'Reverse entry?'}
      confirmLabel={reverse.isPending ? 'reversing…' : 'reverse'}
      confirmDisabled={reverse.isPending || !reason.trim()}
    >
      <div className='flex min-w-[min(90vw,24rem)] flex-col gap-3'>
        <Text size='small'>
          A reversing entry will be posted to cancel this one. This action is itself a posting and
          cannot be undone.
        </Text>
        <label className='flex flex-col gap-1'>
          <Text variant='inactive' size='small'>
            reason
          </Text>
          <Input
            name='reason'
            value={reason}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}
            placeholder='why is this being reversed?'
            autoFocus
          />
        </label>
        {refusal && <CalloutBox tone='error'>{refusal}</CalloutBox>}
      </div>
    </ConfirmationModal>
  );
}
