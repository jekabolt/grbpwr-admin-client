import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import type { TaskStatus } from '../api/types';

/** Where a held card lands: a column, and the card it goes above (null = the column's end). */
export type DropSlot = { status: TaskStatus; before: number | null };

/** The first card whose middle is below the pointer takes the slot above it. */
export function slotBefore(
  rows: readonly { id: number; top: number; height: number }[],
  y: number,
): number | null {
  return rows.find((row) => y < row.top + row.height / 2)?.id ?? null;
}

/** The server re-sequences the FULL column, so the slot is counted there, without the held card. */
export function dropPosition(
  fullColumn: readonly { id: number }[],
  activeId: number,
  before: number | null,
): number {
  const rest = fullColumn.filter((task) => task.id !== activeId);
  const at = before == null ? -1 : rest.findIndex((task) => task.id === before);
  return at < 0 ? rest.length : at;
}

/**
 * The lane under the cursor; off every lane, the nearest one. A lane hidden on a narrow screen has
 * no box and never wins.
 */
export const cursorThenNearest: CollisionDetection = (args) => {
  const droppableContainers = args.droppableContainers.filter(
    (container) => (args.droppableRects.get(container.id)?.width ?? 0) > 0,
  );
  const within = pointerWithin({ ...args, droppableContainers });
  return within.length > 0 ? within : closestCenter({ ...args, droppableContainers });
};

const KEY_STEP: Record<string, readonly [number, number]> = {
  ArrowDown: [0, 72],
  ArrowUp: [0, -72],
  ArrowRight: [296, 0],
  ArrowLeft: [-296, 0],
};

/** Arrows: a card's height down the lane, one lane across. */
export const keyboardStep: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
  const step = KEY_STEP[event.code];
  if (!step) return undefined;
  event.preventDefault();
  return { x: currentCoordinates.x + step[0], y: currentCoordinates.y + step[1] };
};
