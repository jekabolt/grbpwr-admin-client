import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { ChecklistEditor } from 'ui/components/checklist-editor';
import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';
import { FulfillmentChecklistItem } from '../api/types';
import {
  useAddFulfillmentChecklistItem,
  useDeleteFulfillmentChecklistItem,
  useSetFulfillmentChecklistItemDone,
} from '../hooks/useFulfillment';
import { CHECKLIST_TEMPLATES, ChecklistTemplate } from '../utils/checklist-templates';

// Packing checklist on an order's fulfillment annotation (picked / packed / label
// printed …). Board-owned overlay — never touches the order itself.
//
// ffCheck v2 — an "apply template" action seeds a whole packing checklist at once.
// Gap note (ff-checklist-template): there is NO ApplyChecklistTemplate RPC, so the
// template is a client-side constant and "apply" simply loops the existing
// AddFulfillmentChecklistItem RPC once per step (sequentially, so their positions
// come out in order).
export function FulfillmentChecklist({
  orderUuid,
  items,
  canWrite,
}: {
  orderUuid: string;
  items: FulfillmentChecklistItem[];
  canWrite: boolean;
}) {
  const { showMessage } = useSnackBarStore();
  const add = useAddFulfillmentChecklistItem(orderUuid);
  const toggle = useSetFulfillmentChecklistItemDone(orderUuid);
  const remove = useDeleteFulfillmentChecklistItem(orderUuid);
  const [applying, setApplying] = useState<string | null>(null);

  async function applyTemplate(t: ChecklistTemplate) {
    if (applying) return;
    setApplying(t.id);
    try {
      for (const step of t.items) {
        await add.mutateAsync(step);
      }
      showMessage(`Applied “${t.label}” template`, 'success');
    } catch {
      // the add hook already surfaces the error; stop looping on the first failure.
    } finally {
      setApplying(null);
    }
  }

  return (
    <div className='flex flex-col gap-2'>
      <ChecklistEditor
        label='packing checklist'
        items={items}
        canWrite={canWrite}
        adding={add.isPending}
        addPlaceholder='Add a packing step…'
        emptyLabel='No packing steps.'
        onAdd={(content) =>
          add
            .mutateAsync(content)
            .then(() => undefined)
            .catch(() => undefined)
        }
        onToggle={(id, isDone) => toggle.mutate({ id, isDone })}
        onDelete={(id) => remove.mutate(id)}
      />

      {canWrite && (
        <div className='flex flex-wrap items-center gap-1.5'>
          <Text
            size='micro'
            variant='label'
            tracking='label'
            component='span'
            className='uppercase'
          >
            apply template
          </Text>
          <ChipRow>
            {CHECKLIST_TEMPLATES.map((t) => (
              <Chip
                key={t.id}
                dashed
                disabled={applying !== null}
                onClick={() => applyTemplate(t)}
              >
                {applying === t.id ? 'applying…' : t.label}
              </Chip>
            ))}
          </ChipRow>
        </div>
      )}
    </div>
  );
}
