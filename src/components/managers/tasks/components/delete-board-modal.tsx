import { useEffect, useState } from 'react';
import { ConfirmationModal, Row, Select } from 'ui';
import type { TaskBoardEntry } from '../api/types';

/**
 * CUSTOM-BOARDS delete (owner OK 21.10, mockup «delete»): one question — where the tasks go.
 * Every task of the board moves (archived ones too), so the count is the board's full count.
 * An empty board deletes without the row. The caller never opens it for the last board.
 */
export function DeleteBoardModal({
  board,
  boards,
  busy,
  onOpenChange,
  onConfirm,
}: {
  board: TaskBoardEntry | null;
  boards: TaskBoardEntry[];
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (moveToId: number) => void;
}) {
  const others = boards.filter((b) => b.id !== board?.id);
  const total = board ? board.taskCount + board.archivedTaskCount : 0;
  const [moveTo, setMoveTo] = useState(0);
  useEffect(() => {
    if (board) setMoveTo(others[0]?.id ?? 0);
    // Reset only when a different board is asked about, not on every count refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board?.id]);

  return (
    <ConfirmationModal
      open={board !== null}
      onOpenChange={onOpenChange}
      title={`delete ${board?.name ?? ''}`}
      width='sm'
      confirmLabel={total > 0 ? 'move and delete' : 'delete'}
      confirmDisabled={busy || (total > 0 && !moveTo)}
      closeOnConfirm={false}
      onConfirm={() => onConfirm(total > 0 ? moveTo : 0)}
    >
      {total > 0 && (
        <Row
          className='min-h-10 items-center uppercase tracking-label'
          label={`${total} ${total === 1 ? 'task' : 'tasks'}`}
          value={
            <Select
              name='delete-board-move-to'
              placeholder='board'
              value={moveTo ? String(moveTo) : undefined}
              items={others.map((b) => ({ value: String(b.id), label: b.name }))}
              onValueChange={(v: string) => setMoveTo(Number(v))}
              customWidth={150}
              className='uppercase tracking-label'
            />
          }
        />
      )}
    </ConfirmationModal>
  );
}
