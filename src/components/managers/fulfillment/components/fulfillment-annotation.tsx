import { AssigneeSelect } from 'components/managers/tasks/components/assignee-select';
import { useEffect, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { FulfillmentAnnotation as AnnotationModel } from '../api/types';
import { useSetFulfillmentAssignee, useSetFulfillmentNotes } from '../hooks/useFulfillment';
import { FulfillmentChecklist } from './fulfillment-checklist';

// The board-owned overlay editor: assignee, internal packing notes and packing
// checklist. Notes save on demand; a genuine server change (e.g. another packer)
// resyncs the field, but a background refetch never clobbers in-progress typing.
export function FulfillmentAnnotation({
  annotation,
  canWrite,
}: {
  annotation: AnnotationModel;
  canWrite: boolean;
}) {
  const orderUuid = annotation.orderUuid;
  const setAssignee = useSetFulfillmentAssignee(orderUuid);
  const setNotes = useSetFulfillmentNotes(orderUuid);

  const [notes, setNotesDraft] = useState(annotation.notes);
  const baselineUuid = useRef(annotation.orderUuid);
  const baselineNotes = useRef(annotation.notes);
  useEffect(() => {
    // Resync the draft when we switch to a different order, or when the server
    // notes genuinely change (e.g. another packer edited them). An unrelated
    // background refetch (same order, same notes) never clobbers in-progress typing.
    if (
      annotation.orderUuid !== baselineUuid.current ||
      annotation.notes !== baselineNotes.current
    ) {
      baselineUuid.current = annotation.orderUuid;
      baselineNotes.current = annotation.notes;
      setNotesDraft(annotation.notes);
    }
  }, [annotation.orderUuid, annotation.notes]);
  const notesDirty = notes !== annotation.notes;

  return (
    <div className='flex flex-col gap-4'>
      <label className='flex flex-col gap-1'>
        <Text variant='label' size='small' component='span'>
          assignee
        </Text>
        {canWrite ? (
          <AssigneeSelect value={annotation.assignee} onChange={(u) => setAssignee.mutate(u)} />
        ) : (
          <Text size='small'>
            {annotation.assignee || <span className='text-labelColor'>unassigned</span>}
          </Text>
        )}
      </label>

      <div className='flex flex-col gap-1'>
        <Text variant='label' size='small' component='span'>
          packing notes
        </Text>
        {canWrite ? (
          <>
            <Textarea
              name='fulfillment-notes'
              variant='secondary'
              placeholder='Internal notes for whoever packs this…'
              className='mb-0 min-h-16 border border-textInactiveColor'
              value={notes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setNotesDraft(e.target.value)
              }
            />
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='self-end'
              loading={setNotes.isPending}
              disabled={!notesDirty}
              onClick={() => setNotes.mutate(notes)}
            >
              save notes
            </Button>
          </>
        ) : annotation.notes ? (
          <Text size='small' className='whitespace-pre-wrap break-words'>
            {annotation.notes}
          </Text>
        ) : (
          <Text variant='label' size='small'>
            No notes.
          </Text>
        )}
      </div>

      <FulfillmentChecklist
        orderUuid={orderUuid}
        items={annotation.checklist}
        canWrite={canWrite}
      />
    </div>
  );
}
