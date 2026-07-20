import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
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
  const { showMessage } = useSnackBarStore();
  const reverse = useReverseJournalEntry();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (entryId === null) setReason('');
  }, [entryId]);

  const handleConfirm = () => {
    if (entryId === null || !reason.trim()) return;
    reverse.mutate(
      { entryId, reason: reason.trim() },
      {
        onSuccess: () => {
          showMessage('Entry reversed', 'success');
          onReversed();
        },
        onError: (e) =>
          showMessage(e instanceof Error ? e.message : 'Failed to reverse entry', 'error'),
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
      </div>
    </ConfirmationModal>
  );
}
