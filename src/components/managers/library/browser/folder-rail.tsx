import { type ChangeEvent, type KeyboardEvent, type ReactNode, useState } from 'react';
import { AddDoor, Chip, ChipRow, FoldCaret, Input, SideRailGroup, SideRailItem, Text } from 'ui';
import { LIBRARY_ERROR_WORD, libraryErrorCode } from '../api/library';
import { type FolderNode, folderPath } from '../hooks/useLibraryFolders';

/** Where the browser stands: every row, the rows outside any folder, or one folder. */
export type FolderLoc = 'all' | 'unfiled' | number;

export function locOf(f: { folderId: number; noFolder: boolean }): FolderLoc {
  if (f.noFolder) return 'unfiled';
  return f.folderId > 0 ? f.folderId : 'all';
}

/** The word for a refused folder write (`name taken`, `not empty`), or a plain fallback. */
export function folderErrorWord(e: unknown): string {
  const code = libraryErrorCode(e);
  return code ? LIBRARY_ERROR_WORD[code] : 'not saved';
}

/** Items of the folder and every folder under it. */
export function deepCount(node: FolderNode): number {
  return node.children.reduce((sum, c) => sum + deepCount(c), node.itemCount);
}

const INDENT = ['', 'pl-3', 'pl-6', 'pl-9', 'pl-12'];
const indent = (depth: number) => INDENT[Math.min(depth, INDENT.length - 1)];

/** One-line name field: Enter saves, Esc cancels; a refusal shows as its word. */
export function FolderNameInput({
  initial = '',
  placeholder = 'folder name',
  onSave,
  onCancel,
  className,
}: {
  initial?: string;
  placeholder?: string;
  onSave: (name: string) => Promise<unknown>;
  onCancel: () => void;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const name = value.trim();
    if (!name || name === initial) {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      await onSave(name);
    } catch (e) {
      setError(folderErrorWord(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className ?? ''}`}>
      <Input
        type='text'
        value={value}
        autoFocus
        disabled={busy}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-invalid={!!error || undefined}
        className={`min-w-0 flex-1 ${error ? 'border-error' : ''}`}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          setValue(e.target.value);
          setError('');
        }}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          if (!error && !busy && !value.trim()) onCancel();
        }}
      />
      {error && (
        <Text size='micro' variant='errorLabel' component='span' className='shrink-0'>
          {error}
        </Text>
      )}
    </span>
  );
}

/** The desktop rail's folder group: all, unfiled, the tree (open along the path), + folder. */
export function FolderRail({
  tree,
  byId,
  loc,
  total,
  onGo,
  onCreate,
}: {
  tree: FolderNode[];
  byId: Map<number, FolderNode>;
  loc: FolderLoc;
  /** Rows of the current list, shown on the row that is open. */
  total?: number;
  onGo: (loc: FolderLoc) => void;
  /** Absent: no «+ folder» (read only, or a picker). Creates under the open folder. */
  onCreate?: (name: string) => Promise<unknown>;
}) {
  const [creating, setCreating] = useState(false);
  const path = typeof loc === 'number' ? folderPath(byId, loc).map((n) => n.id) : [];

  const rows = (list: FolderNode[]): ReactNode =>
    list.map((n) => {
      const open = path.includes(n.id);
      const has = n.children.length > 0;
      return (
        <div key={n.id}>
          <SideRailItem
            className={indent(n.depth)}
            selected={loc === n.id}
            onClick={() => onGo(n.id)}
            label={
              <span className='inline-flex min-w-0 items-center gap-1'>
                <span className='inline-flex w-2.5 shrink-0'>
                  {has && <FoldCaret open={open} className='ml-0' />}
                </span>
                <span className='truncate'>{n.name}</span>
              </span>
            }
            count={deepCount(n)}
          />
          {open && has && rows(n.children)}
        </div>
      );
    });

  return (
    <>
      <SideRailGroup flush>folders</SideRailGroup>
      <SideRailItem
        label='all'
        selected={loc === 'all'}
        count={loc === 'all' ? total : undefined}
        onClick={() => onGo('all')}
      />
      <SideRailItem
        label='unfiled'
        selected={loc === 'unfiled'}
        count={loc === 'unfiled' ? total : undefined}
        onClick={() => onGo('unfiled')}
      />
      {rows(tree)}
      {onCreate &&
        (creating ? (
          <FolderNameInput
            className='w-full py-0.5'
            onCancel={() => setCreating(false)}
            onSave={async (name) => {
              await onCreate(name);
              setCreating(false);
            }}
          />
        ) : (
          <AddDoor lowercase onClick={() => setCreating(true)}>
            folder
          </AddDoor>
        ))}
    </>
  );
}

/** Phone: the open place's subfolders as a chip row; at the top, «unfiled» comes first. */
export function FolderChips({
  tree,
  byId,
  loc,
  onGo,
  onCreate,
}: {
  tree: FolderNode[];
  byId: Map<number, FolderNode>;
  loc: FolderLoc;
  onGo: (loc: FolderLoc) => void;
  onCreate?: (name: string) => Promise<unknown>;
}) {
  const [creating, setCreating] = useState(false);
  const list = loc === 'all' ? tree : typeof loc === 'number' ? byId.get(loc)?.children ?? [] : [];
  if (loc === 'unfiled') return null;
  return (
    <ChipRow className='flex-nowrap overflow-x-auto'>
      {loc === 'all' && <Chip onClick={() => onGo('unfiled')}>unfiled</Chip>}
      {list.map((n) => (
        <Chip key={n.id} onClick={() => onGo(n.id)}>
          {n.name} {deepCount(n)}
        </Chip>
      ))}
      {onCreate &&
        (creating ? (
          <FolderNameInput
            className='min-w-40'
            onCancel={() => setCreating(false)}
            onSave={async (name) => {
              await onCreate(name);
              setCreating(false);
            }}
          />
        ) : (
          <Chip dashed onClick={() => setCreating(true)}>
            + folder
          </Chip>
        ))}
    </ChipRow>
  );
}
