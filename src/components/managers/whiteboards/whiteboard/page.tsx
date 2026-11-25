import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { BackLink, Input, Pill, Text } from 'ui';
import { UNTITLED, Whiteboard } from '../api/types';
import { useActor, useRenameWhiteboard, useWhiteboard } from '../api/useWhiteboards';
import { Canvas } from '../editor/canvas';
import { whenAgo } from '../model/when';

/** The editor: a full-window bare route — a top strip over the canvas, no admin chrome. */
export function WhiteboardEditor() {
  const { id = '' } = useParams();
  const { canRead, canWrite, resolved } = usePermissions();
  const canView = !resolved || canRead(SECTION.whiteboards);
  const writable = !resolved || canWrite(SECTION.whiteboards);
  useActor();
  const { data: whiteboard, isLoading, isError } = useWhiteboard(id);

  if (!canView || isError) {
    return (
      <div className='flex min-h-screen flex-col items-center justify-center gap-2 bg-pageBg p-10 text-center'>
        <Text size='large'>{canView ? 'whiteboard not found' : 'whiteboards'}</Text>
        <Text size='micro' variant='label'>
          {canView
            ? 'It may have been deleted, or it lives in another browser: until the backend ships, whiteboards are kept in this browser only.'
            : 'You don’t have access to this section. Ask a super admin to grant it.'}
        </Text>
        <BackLink to={ROUTES.whiteboards}>whiteboards</BackLink>
      </div>
    );
  }

  return (
    <div className='flex h-dvh flex-col bg-pageBg'>
      <header className='flex flex-wrap items-center gap-4 border-b border-borderColor bg-bgColor px-2.5 py-2'>
        <BackLink to={ROUTES.whiteboards}>whiteboards</BackLink>
        {whiteboard && <TitleField whiteboard={whiteboard} writable={writable} />}
        <Pill tone='mut' title='Kept in this browser until the backend ships'>
          local
        </Pill>
        <span className='ml-auto' />
        {whiteboard && <SavedAt iso={whiteboard.updatedAt} />}
      </header>
      {isLoading ? <div className='flex-1' /> : <Canvas />}
    </div>
  );
}

function TitleField({ whiteboard, writable }: { whiteboard: Whiteboard; writable: boolean }) {
  const rename = useRenameWhiteboard(whiteboard.uuid);
  const [draft, setDraft] = useState(whiteboard.title);
  useEffect(() => setDraft(whiteboard.title), [whiteboard.title]);

  const commit = () => {
    const next = draft.trim();
    if (next === whiteboard.title) return setDraft(next);
    rename.mutate(next);
  };

  return (
    <label className='flex items-center'>
      <span className='sr-only'>Title</span>
      <Input
        name='whiteboard-title'
        value={draft}
        placeholder={UNTITLED}
        readOnly={!writable}
        maxLength={120}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(whiteboard.title);
            // The blur that follows must see the reverted draft, so it runs after the render.
            const el = e.currentTarget;
            requestAnimationFrame(() => el.blur());
          }
        }}
        // Inline: no box at rest, the field's own box on hover and focus.
        className='w-60 border-transparent font-bold placeholder:font-normal hover:border-borderColor'
      />
    </label>
  );
}

/** «saved 4 s ago», re-read every few seconds so it does not freeze at «just now». */
function SavedAt({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <Text size='micro' variant='label' component='span'>
      saved {whenAgo(iso, now)}
    </Text>
  );
}
