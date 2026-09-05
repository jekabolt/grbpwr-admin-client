import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

/**
 * THE ONE PRINTER OF A DESTRUCTIVE QUESTION — a sentence, a verb, and the line `there is no undo`.
 *
 * It is a skin over `ui/components/confirmation-modal`, nothing more: `sm` width, the sentence at
 * control size, the note in micro grey under it. It ONLY DRAWS. What the gesture will do — how many
 * rows go, what stays — is computed by the code that performs the gesture, once, and read by both
 * the question and the act (`history-recall.tsx`, `planFlat`: «the plan is computed HERE and read
 * by both»). This organ has no calculator of its own and must never grow one; a second count of
 * the same loss is how a dialog comes to promise what the act no longer does.
 *
 * `note` replaces the default line; `null` drops it. `sentence` may be a node when the question has
 * to name a number in bold — the number still comes from the caller's plan.
 */
export function AskModal({
  open,
  title,
  sentence,
  verb,
  onDo,
  onClose,
  note = 'there is no undo',
}: {
  open: boolean;
  title: string;
  sentence: React.ReactNode;
  /** The confirm label — the verb of the act, as the door said it: `remove it`, `take it off`. */
  verb: string;
  onDo: () => void;
  onClose: () => void;
  note?: string | null;
}) {
  return (
    <ConfirmationModal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      onConfirm={onDo}
      onCancel={onClose}
      title={title}
      confirmLabel={verb}
      width='sm'
    >
      <Text size='control'>{sentence}</Text>
      {note != null && (
        <Text size='micro' variant='label' component='p' className='mt-2'>
          {note}
        </Text>
      )}
    </ConfirmationModal>
  );
}
