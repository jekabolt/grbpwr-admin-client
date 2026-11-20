import { formatBytes } from 'components/managers/files/utils/format';
import { useState } from 'react';
import { ConfirmationModal, FoldCaret, SideRailItem, Text } from 'ui';
import { KIND_WORD, type LibraryItem } from '../api/types';
import { type FolderNode, flattenTree, subtreeIds } from '../hooks/useLibraryFolders';
import { deepCount } from './folders';

const INDENT = ['', 'pl-3', 'pl-6', 'pl-9', 'pl-12'];

/**
 * «move N»: the folder list, indented, with counts. A row picks the target, «move» sends.
 * `unfiled` takes the rows out of every folder (a folder moved there becomes a root).
 */
export function MoveDialog({
  open,
  title,
  tree,
  exclude,
  rootLabel = 'unfiled',
  busy,
  onOpenChange,
  onMove,
}: {
  open: boolean;
  title: string;
  tree: FolderNode[];
  /** A moved folder: it and its subtree are not targets. */
  exclude?: FolderNode;
  rootLabel?: string;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onMove: (folderId: number) => void;
}) {
  const [target, setTarget] = useState<number | null>(null);
  const banned = new Set(exclude ? subtreeIds(exclude) : []);
  const rows = flattenTree(tree).filter((n) => !banned.has(n.id));
  return (
    <ConfirmationModal
      open={open}
      onOpenChange={(next) => {
        if (!next) setTarget(null);
        onOpenChange(next);
      }}
      title={title}
      confirmLabel='move'
      confirmDisabled={target === null || busy}
      onConfirm={() => {
        if (target !== null) onMove(target);
      }}
      closeOnConfirm={false}
      lowercase
      sheet
      width='sm'
    >
      <div className='flex max-h-[50vh] flex-col overflow-y-auto'>
        <SideRailItem label={rootLabel} selected={target === 0} onClick={() => setTarget(0)} />
        {rows.map((n) => (
          <SideRailItem
            key={n.id}
            className={INDENT[Math.min(n.depth, INDENT.length - 1)]}
            label={
              <span className='inline-flex min-w-0 items-center gap-1'>
                <span className='inline-flex w-2.5 shrink-0'>
                  {n.children.length > 0 && <FoldCaret open className='ml-0' />}
                </span>
                <span className='truncate'>{n.name}</span>
              </span>
            }
            count={deepCount(n)}
            selected={target === n.id}
            onClick={() => setTarget(n.id)}
          />
        ))}
      </div>
    </ConfirmationModal>
  );
}

/**
 * «delete N»: one confirmation for both sources. A picture in use is listed as kept and is not
 * sent (the server refuses it anyway); everything else goes.
 */
export function DeleteDialog({
  open,
  items,
  busy,
  onOpenChange,
  onDelete,
}: {
  open: boolean;
  items: LibraryItem[];
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (items: LibraryItem[]) => void;
}) {
  const kept = items.filter((i) => !!i.media && i.inUse);
  const going = items.filter((i) => !(i.media && i.inUse));
  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      title={`delete ${going.length}`}
      confirmLabel={`delete ${going.length}`}
      confirmDisabled={!going.length || busy}
      onConfirm={() => onDelete(going)}
      closeOnConfirm={false}
      lowercase
      sheet
      width='sm'
    >
      <div className='flex max-h-[50vh] flex-col gap-1 overflow-y-auto'>
        {[...going, ...kept].map((i) => {
          const isKept = kept.includes(i);
          const kind = i.kind ?? 'LIBRARY_KIND_UNSPECIFIED';
          const thumb = i.media?.media?.thumbnail?.mediaUrl || i.file?.previewUrl || '';
          return (
            <div
              key={`${i.media ? 'm' : 'f'}:${i.ref?.id}`}
              className='flex min-w-0 items-center gap-2'
            >
              {thumb ? (
                <img src={thumb} alt='' className='size-8 shrink-0 object-contain' />
              ) : (
                <span className='size-8 shrink-0 border border-borderColor' />
              )}
              <Text size='small' component='span' className='min-w-0 flex-1 truncate'>
                {i.name || KIND_WORD[kind]}
              </Text>
              <Text size='micro' variant='label' component='span' className='shrink-0'>
                {isKept ? 'in use · kept' : formatBytes(Number(i.sizeBytes ?? 0))}
              </Text>
            </div>
          );
        })}
      </div>
    </ConfirmationModal>
  );
}
