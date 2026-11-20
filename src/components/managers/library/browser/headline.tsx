import { Fragment, type ReactNode, useState } from 'react';
import { Button, Close, Text } from 'ui';
import { type FolderNode, folderPath } from '../hooks/useLibraryFolders';
import { type FolderLoc, FolderNameInput, deepCount } from './folders';

/** An earlier part of the path: the title's type, grey, inks on hover. */
const CRUMB =
  'h-auto shrink-0 border-0 p-0 font-bold normal-case text-labelColor hover:text-textColor';

/**
 * The page title as a path: `files / lookbook / ss27`. The last segment is the open folder:
 * click it to rename (Enter saves, Esc cancels); × deletes it while it is empty; «move» puts it
 * under another folder. Phone: the same path on one line that scrolls sideways.
 */
export function Headline({
  loc,
  byId,
  phone,
  editable,
  onGo,
  onRename,
  onDelete,
  onMove,
  extra,
}: {
  loc: FolderLoc;
  byId: Map<number, FolderNode>;
  phone: boolean;
  editable: boolean;
  onGo: (loc: FolderLoc) => void;
  onRename: (id: number, name: string) => Promise<unknown>;
  onDelete: (id: number) => void;
  onMove: (node: FolderNode) => void;
  /** Right end of the title row: the section's other doors. */
  extra?: ReactNode;
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

  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 ${
        phone ? 'flex-nowrap overflow-x-auto whitespace-nowrap [scrollbar-width:none]' : 'flex-wrap'
      }`}
    >
      {loc !== 'all' && (
        <>
          <Button variant='default' className={CRUMB} onClick={() => onGo('all')}>
            files
          </Button>
          <span className='text-borderColor'>/</span>
        </>
      )}
      {path.slice(0, -1).map((n) => (
        <Fragment key={n.id}>
          <Button variant='default' className={CRUMB} onClick={() => onGo(n.id)}>
            {n.name}
          </Button>
          <span className='text-borderColor'>/</span>
        </Fragment>
      ))}
      {current}
      {tools}
      {extra && <span className='ml-auto flex shrink-0 items-center gap-2.5'>{extra}</span>}
    </div>
  );
}
