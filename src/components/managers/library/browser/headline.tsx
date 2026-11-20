import { Fragment, useState } from 'react';
import { BackLink, Button, Close, Text } from 'ui';
import { type FolderNode, folderPath } from '../hooks/useLibraryFolders';
import { type FolderLoc, FolderNameInput, deepCount } from './folder-rail';

const WORD = 'text-micro uppercase tracking-label';

/**
 * The page title as a path: `files / lookbook / ss27`. The last segment is the open folder:
 * click it to rename (Enter saves, Esc cancels); × deletes it while it is empty; «move» puts it
 * under another folder. Phone: a back word to the parent above the title.
 */
export function Headline({
  loc,
  byId,
  phone,
  editable,
  selecting,
  onSelectMode,
  onGo,
  onRename,
  onDelete,
  onMove,
}: {
  loc: FolderLoc;
  byId: Map<number, FolderNode>;
  phone: boolean;
  editable: boolean;
  /** Phone: the select / done word sits on the title row. Absent: no word. */
  selecting?: boolean;
  onSelectMode?: () => void;
  onGo: (loc: FolderLoc) => void;
  onRename: (id: number, name: string) => Promise<unknown>;
  onDelete: (id: number) => void;
  onMove: (node: FolderNode) => void;
}) {
  const [editing, setEditing] = useState(false);
  const path = typeof loc === 'number' ? folderPath(byId, loc) : [];
  const folder = path[path.length - 1];
  const empty = !!folder && deepCount(folder) === 0 && folder.children.length === 0;
  const title = loc === 'unfiled' ? 'unfiled' : folder ? folder.name : 'files';

  const current =
    folder && editable && editing ? (
      <FolderNameInput
        initial={folder.name}
        className='min-w-0 max-w-sm flex-1'
        onCancel={() => setEditing(false)}
        onSave={async (name) => {
          await onRename(folder.id, name);
          setEditing(false);
        }}
      />
    ) : folder && editable ? (
      <Button
        variant='default'
        className='h-auto border-0 p-0 font-bold normal-case'
        onClick={() => setEditing(true)}
      >
        {title}
      </Button>
    ) : (
      <Text component='h1' className='font-bold'>
        {title}
      </Text>
    );

  const tools = folder && editable && !editing && (
    <>
      {empty && <Close aria-label='delete folder' onClick={() => onDelete(folder.id)} />}
      <Button variant='underline' size='xs' onClick={() => onMove(folder)}>
        move
      </Button>
    </>
  );

  if (phone) {
    const parent = path.length > 1 ? path[path.length - 2] : undefined;
    return (
      <div className='flex flex-col gap-1'>
        {loc !== 'all' && (
          <BackLink onClick={() => onGo(parent ? parent.id : 'all')}>
            {parent ? parent.name : 'files'}
          </BackLink>
        )}
        <div className='flex min-w-0 items-center gap-2'>
          {current}
          {tools}
          {onSelectMode && (
            <Button variant='underline' size='xs' className='ml-auto' onClick={onSelectMode}>
              {selecting ? 'done' : 'select'}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
      {loc !== 'all' && (
        <>
          <Button variant='underline' size='xs' onClick={() => onGo('all')}>
            files
          </Button>
          <span className={`${WORD} text-labelColor`}>/</span>
        </>
      )}
      {path.slice(0, -1).map((n) => (
        <Fragment key={n.id}>
          <Button variant='underline' size='xs' onClick={() => onGo(n.id)}>
            {n.name}
          </Button>
          <span className={`${WORD} text-labelColor`}>/</span>
        </Fragment>
      ))}
      {current}
      {tools}
    </div>
  );
}
