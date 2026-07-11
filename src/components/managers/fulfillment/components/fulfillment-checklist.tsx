import { ChecklistEditor } from 'ui/components/checklist-editor';
import { FulfillmentChecklistItem } from '../api/types';
import {
  useAddFulfillmentChecklistItem,
  useDeleteFulfillmentChecklistItem,
  useSetFulfillmentChecklistItemDone,
} from '../hooks/useFulfillment';

// Packing checklist on an order's fulfillment annotation (picked / packed / label
// printed …). Board-owned overlay — never touches the order itself.
export function FulfillmentChecklist({
  orderUuid,
  items,
  canWrite,
}: {
  orderUuid: string;
  items: FulfillmentChecklistItem[];
  canWrite: boolean;
}) {
  const add = useAddFulfillmentChecklistItem(orderUuid);
  const toggle = useSetFulfillmentChecklistItemDone(orderUuid);
  const remove = useDeleteFulfillmentChecklistItem(orderUuid);

  return (
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
  );
}
