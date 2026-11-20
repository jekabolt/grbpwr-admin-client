import { type ChangeEvent, type KeyboardEvent, useEffect, useState } from 'react';
import { AddDoor, Input, PLACEHOLDER_SURFACE, Text, Tile } from 'ui';
import { LIBRARY_ERROR_WORD, libraryErrorCode } from '../api/library';
import { type LibraryFilter, makeFilter, refKey, refOf } from '../api/types';
import { FRAME_RATIO, ItemPicture } from '../components/item-thumb';
import { type FolderNode } from '../hooks/useLibraryFolders';
import { useLibraryItems } from '../hooks/useLibraryItems';

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

const COLLAGE = 4;

/** True once the element has come near the viewport (or the given scroll root); stays true. */
function useSeen(el: HTMLElement | null, root?: HTMLElement | null): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true);
      },
      { root: root ?? null, rootMargin: '200px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, root, seen]);
  return seen;
}

/**
 * The 2×2 collage of a folder's first pictures under the current filter (the folder and its
 * subfolders). `folders/list` carries counts only, so each tile asks the items list for 4 rows,
 * once it is on screen; the answer is cached like any list page. Empty: hatched.
 */
function FolderCollage({
  node,
  filter,
  scrollRoot,
}: {
  node: FolderNode;
  filter: LibraryFilter;
  scrollRoot?: HTMLElement | null;
}) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const seen = useSeen(el, scrollRoot);
  const empty = deepCount(node) === 0;
  const q = makeFilter({
    ...filter,
    folderId: node.id,
    noFolder: false,
    includeSubfolders: true,
  });
  const list = useLibraryItems(q, 'new', { limit: COLLAGE, enabled: seen && !empty });
  const cells = list.items.slice(0, COLLAGE);
  if (empty) {
    return (
      <div ref={setEl} className='w-full' style={{ aspectRatio: FRAME_RATIO }}>
        <span aria-hidden className='block h-full w-full bg-pageBg' style={PLACEHOLDER_SURFACE} />
      </div>
    );
  }
  return (
    <div
      ref={setEl}
      className='grid w-full grid-cols-2 grid-rows-2 gap-0.5 bg-bgColor'
      style={{ aspectRatio: FRAME_RATIO }}
    >
      {Array.from({ length: COLLAGE }, (_, i) => {
        const item = cells[i];
        const ref = item ? refOf(item) : undefined;
        return (
          <span
            key={ref ? refKey(ref) : `empty-${i}`}
            className={`flex min-h-0 min-w-0 overflow-hidden ${item || list.total === 0 ? 'bg-pageBg' : ''}`}
          >
            {item && <ItemPicture item={item} load fit='cover' />}
          </span>
        );
      })}
    </div>
  );
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** A folder in the grid: collage, name, `N items · M folders`. Click opens it. */
export function FolderTile({
  node,
  filter,
  scrollRoot,
  onOpen,
}: {
  node: FolderNode;
  /** The browser's filter: the collage shows what the list would show inside. */
  filter: LibraryFilter;
  scrollRoot?: HTMLElement | null;
  onOpen: () => void;
}) {
  const kids = node.children.length;
  return (
    <Tile
      media={<FolderCollage node={node} filter={filter} scrollRoot={scrollRoot} />}
      name={node.name}
      title={node.name}
      sub={`${plural(deepCount(node), 'item')}${kids ? ` · ${plural(kids, 'folder')}` : ''}`}
      onClick={onOpen}
      lowercase
    />
  );
}

/** The dashed door in a tile grid (`+ folder`, `+ upload`): an item tile's footprint. */
export function DoorTile({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <AddDoor shape='tile' lowercase className='h-full min-h-32 w-full' onClick={onClick}>
      {children}
    </AddDoor>
  );
}

/** The new folder's tile: a hatched frame and its name field. */
export function NewFolderTile({
  onSave,
  onCancel,
}: {
  onSave: (name: string) => Promise<unknown>;
  onCancel: () => void;
}) {
  return (
    <Tile
      media={
        <span
          aria-hidden
          className='block w-full'
          style={{ ...PLACEHOLDER_SURFACE, aspectRatio: FRAME_RATIO }}
        />
      }
      lowercase
    >
      <FolderNameInput className='mt-1.5 w-full' onCancel={onCancel} onSave={onSave} />
    </Tile>
  );
}
