import { ChecklistEditor, Section } from 'ui';
import { TaskChecklistItem } from '../api/types';
import {
  useAddChecklistItem,
  useDeleteChecklistItem,
  useSetChecklistItemDone,
} from '../hooks/useTasks';

// Subtask checklist for the task detail. Items are managed by dedicated RPCs
// (add / toggle / delete), so editing them never touches the task's content —
// per-item done state survives a content edit.
export function TaskChecklist({
  taskId,
  items,
  canWrite,
}: {
  taskId: number;
  items: TaskChecklistItem[];
  canWrite: boolean;
}) {
  const add = useAddChecklistItem(taskId);
  const toggle = useSetChecklistItemDone(taskId);
  const remove = useDeleteChecklistItem(taskId);

  return (
    <Section className='[&_button]:min-h-11 [&_button]:min-w-11 [&_input]:min-h-11 sm:[&_button]:min-h-0 sm:[&_button]:min-w-0 sm:[&_input]:min-h-0'>
      <ChecklistEditor
        label='checklist'
        items={items}
        canWrite={canWrite}
        adding={add.isPending}
        addPlaceholder='Add a subtask…'
        emptyLabel='No checklist items.'
        onAdd={(content) =>
          add
            .mutateAsync(content)
            .then(() => undefined)
            .catch(() => undefined)
        }
        onToggle={(id, isDone) => toggle.mutate({ id, isDone })}
        onDelete={(id) => remove.mutate(id)}
      />
    </Section>
  );
}
