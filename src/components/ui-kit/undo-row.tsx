import { useState } from 'react';
import { Button, Close, UndoRow } from 'ui';
import { KitDemo, KitLines } from './kit-entry';

const ITEMS = ['shell fabric', 'lining', 'zip 18cm'];

/** Remove a row: the ghost stands in for 5 s, undo puts it back, timeout drops it. */
function UndoRowDemo() {
  const [items, setItems] = useState(ITEMS);
  const [ghost, setGhost] = useState<string | null>(null);
  const row = 'flex min-h-8 items-center gap-2.5 border-b border-hairline';
  return (
    <KitLines
      lines={[
        {
          label: 'list',
          content: (
            <div className='flex w-full flex-col'>
              {items.map((it) =>
                it === ghost ? (
                  <UndoRow
                    key={it}
                    name={it}
                    onUndo={() => setGhost(null)}
                    onCommit={() => {
                      setItems((xs) => xs.filter((x) => x !== it));
                      setGhost(null);
                    }}
                  />
                ) : (
                  <div key={it} className={row}>
                    <span className='min-w-0 flex-1 truncate'>{it}</span>
                    <Close size='sm' aria-label={`remove ${it}`} onClick={() => setGhost(it)} />
                  </div>
                ),
              )}
              {items.length < ITEMS.length && !ghost && (
                <Button
                  variant='underline'
                  size='xs'
                  className='self-start'
                  onClick={() => setItems(ITEMS)}
                >
                  reset
                </Button>
              )}
            </div>
          ),
        },
      ]}
    />
  );
}

export const undoRowDemo: KitDemo = {
  names: ['UndoRow'],
  keywords: ['undo', 'ghost', 'delete', 'remove'],
  Demo: UndoRowDemo,
};
