import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CSSProperties, ReactNode } from 'react';

interface SortableRenderProps {
  setNodeRef: (el: HTMLElement | null) => void;
  style: CSSProperties;
  dragHandleProps: Record<string, any>;
  isDragging: boolean;
}

interface SortableEntityProps {
  uid: string;
  disabled?: boolean;
  children: (props: SortableRenderProps) => ReactNode;
}

/**
 * Thin wrapper around dnd-kit's useSortable. It owns only the sortable
 * mechanics (node ref, transform, drag listeners) and hands them back through a
 * render prop, so the block's chrome and all its business-logic closures stay
 * in entities.tsx. `disabled` keeps an item in the sortable layout (so indices
 * stay aligned) while blocking drag — used for the pinned MAIN block and
 * soft-deleted placeholders.
 */
export function SortableEntity({ uid, disabled = false, children }: SortableEntityProps) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({
    id: uid,
    disabled,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? 'relative' : undefined,
  };

  return (
    <>
      {children({
        setNodeRef,
        style,
        dragHandleProps: { ...attributes, ...listeners },
        isDragging,
      })}
    </>
  );
}
