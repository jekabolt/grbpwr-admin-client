import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from 'lib/utility';
import { DotsHorizontalIcon } from 'ui';

/**
 * BOARD ORDER «HANDLE» (owner pick 21.10). Only the grip lifts a board — a tap on the row still
 * chooses it. The drop hands the whole new id list up; the caller saves it (ReorderTaskBoards).
 */
export function SortableBoards({
  ids,
  onReorder,
  children,
}: {
  ids: number[];
  onReorder: (ids: number[]) => void;
  children: React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const end = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = ids.indexOf(Number(e.active.id));
    const to = ids.indexOf(Number(e.over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={end}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/** One board row with its grip. `handle={false}` (read-only account) draws the row alone. */
export function SortableBoardRow({
  id,
  name,
  handle,
  phone,
  children,
}: {
  id: number;
  /** For the grip's label. */
  name: string;
  handle: boolean;
  phone?: boolean;
  children: React.ReactNode;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    attributes,
    listeners,
  } = useSortable({ id, disabled: !handle });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group relative flex items-center',
        phone ? 'gap-0 border-b border-hairline last:border-b-0' : 'gap-1',
        isDragging && 'z-10 bg-pageBg outline outline-1 outline-textColor',
      )}
    >
      {handle && (
        <span
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`move ${name}`}
          className={cn(
            'flex shrink-0 cursor-grab touch-none items-center justify-center text-labelColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor',
            phone
              ? 'min-h-12 w-10 pl-2'
              : 'w-3 opacity-40 group-hover:opacity-100 focus-visible:opacity-100',
          )}
        >
          <DotsHorizontalIcon aria-hidden className='rotate-90' width={14} height={14} />
        </span>
      )}
      <div className='min-w-0 flex-1'>{children}</div>
    </div>
  );
}
