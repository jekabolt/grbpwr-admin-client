import { useState } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import {
  AddDoor,
  Chip,
  ChipRow,
  HeaderCount,
  Input,
  Placeholder,
  PLACEHOLDER_SURFACE,
  SectionHeader,
  Text,
  Tile,
  Tiles,
  Toolbar,
  ToolbarSpacer,
} from 'ui';
import { UNTITLED, Whiteboard } from './api/types';
import { useActor, useAddWhiteboard, useWhiteboards } from './api/useWhiteboards';
import { whenAgo } from './model/when';

type Scope = 'all' | 'mine' | 'archived';
const SCOPES: Scope[] = ['all', 'mine', 'archived'];

export function Whiteboards() {
  const navigate = useNavigate();
  const { canRead, canWrite, resolved } = usePermissions();
  const canView = !resolved || canRead(SECTION.whiteboards);
  const writable = !resolved || canWrite(SECTION.whiteboards);
  const actor = useActor();

  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const { data: whiteboards = [], isLoading } = useWhiteboards({
    search,
    archived: scope === 'archived',
    createdBy: scope === 'mine' ? actor || '\u0000' : undefined,
  });
  const add = useAddWhiteboard();

  const open = (w: Whiteboard) => navigate(generatePath(ROUTES.whiteboard, { id: w.uuid }));
  const create = () => add.mutate({ title: '' }, { onSuccess: open });

  if (!canView) {
    return (
      <div className='mx-auto flex max-w-md flex-col items-center gap-2 border border-borderColor bg-bgColor p-10 text-center'>
        <Text size='large'>whiteboards</Text>
        <Text size='micro' variant='label'>
          You don’t have access to this section. Ask a super admin to grant it.
        </Text>
      </div>
    );
  }

  // The very first visit: no whiteboard anywhere, so filters have nothing to narrow — one big door.
  const nothingYet = !isLoading && whiteboards.length === 0 && scope === 'all' && !search;

  return (
    <div className='flex w-full flex-col gap-6 pb-10'>
      <SectionHeader
        className='[&_h3]:normal-case [&_h3]:tracking-normal'
        title='whiteboards'
        action={<HeaderCount n={whiteboards.length} noun='whiteboard' />}
      />

      {nothingYet ? (
        writable ? (
          <AddDoor
            shape='tile'
            className='min-h-60 w-full gap-2'
            style={PLACEHOLDER_SURFACE}
            onClick={create}
            disabled={add.isPending}
          >
            <span>whiteboard</span>
            <span className='normal-case tracking-normal'>
              No whiteboards yet. Stickies, shapes and live task cards — one canvas for the team.
            </span>
          </AddDoor>
        ) : (
          <Placeholder className='min-h-60' label='no whiteboards yet' />
        )
      ) : (
        <>
          <Toolbar>
            <label className='flex items-center gap-1.5'>
              <Text size='micro' variant='label' tracking='label' className='uppercase'>
                search
              </Text>
              <Input
                type='text'
                name='whiteboard-search'
                placeholder='title'
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                className='w-56'
              />
            </label>
            <ChipRow>
              {SCOPES.map((s) => (
                <Chip
                  key={s}
                  selected={scope === s}
                  pressed={scope === s}
                  onClick={() => setScope(s)}
                >
                  {s}
                </Chip>
              ))}
            </ChipRow>
            <ToolbarSpacer />
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              sort: last edited
            </Text>
          </Toolbar>

          <Tiles min={220}>
            {writable && scope !== 'archived' && (
              <AddDoor shape='tile' className='min-h-48' onClick={create} disabled={add.isPending}>
                whiteboard
              </AddDoor>
            )}
            {whiteboards.map((w) => (
              <Tile
                key={w.uuid}
                lowercase
                title={w.title || UNTITLED}
                onClick={() => open(w)}
                media={<Thumbnail />}
                name={w.title || UNTITLED}
                sub={byline(w, actor)}
              />
            ))}
          </Tiles>
          {!isLoading && whiteboards.length === 0 && (
            <Text size='micro' variant='label'>
              {scope === 'archived' ? 'Nothing archived.' : 'No whiteboard matches.'}
            </Text>
          )}
        </>
      )}
    </div>
  );
}

function byline(w: Whiteboard, actor: string): string {
  const who = !w.updatedBy ? '' : w.updatedBy === actor ? 'you' : w.updatedBy;
  const verb = w.updatedAt === w.createdAt ? 'created' : 'edited';
  return [`${verb} ${whenAgo(w.updatedAt)}`, who].filter(Boolean).join(' · ');
}

// PR 01 has no objects to draw, so every thumbnail is the empty ground. The thumbnail from
// `thumbnail_media_id` replaces this once the backend renders one.
function Thumbnail() {
  return (
    <div aria-hidden className='flex h-36 items-center justify-center bg-pageBg'>
      <Text size='micro' variant='label' tracking='label' className='uppercase'>
        empty
      </Text>
    </div>
  );
}
