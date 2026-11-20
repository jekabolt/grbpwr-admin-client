import { useQueryClient } from '@tanstack/react-query';
import { authService } from 'api/api';
import type { ListMySessionsResponse } from 'api/proto-http/auth';
import { errMessage } from 'components/auth/api-error';
import { useState } from 'react';
import { Button, Loader, Section } from 'ui';
import { deviceWord, serverWord, sessionWord } from './model';
import { BLOCK_BUTTON, mySessionsKey, Note, PlainRow, ROW_BUTTON, useMySessions } from './parts';

// The `sessions` block: one row per device (`chrome on macos` · `ip · 2h ago · this device`),
// `sign out` on every other device, `sign out others` at the foot.

export function ProfileSessions() {
  const qc = useQueryClient();
  const list = useMySessions(true);
  const [busy, setBusy] = useState('');
  const [refused, setRefused] = useState('');
  const sessions = list.data?.sessions ?? [];
  const others = sessions.some((s) => !s.thisDevice);

  const drop = (keep: (key: string | undefined, me: boolean | undefined) => boolean) =>
    qc.setQueryData<ListMySessionsResponse>(mySessionsKey, (old) =>
      old ? { sessions: (old.sessions ?? []).filter((s) => keep(s.key, s.thisDevice)) } : old,
    );

  const run = async (id: string, call: () => Promise<unknown>, after: () => void) => {
    if (busy) return;
    setBusy(id);
    setRefused('');
    try {
      await call();
      after();
    } catch (e) {
      const m = errMessage(e);
      if (!m.includes('not_found') && !m.includes('this_device')) setRefused(serverWord(m));
    } finally {
      setBusy('');
      void qc.invalidateQueries({ queryKey: mySessionsKey });
    }
  };

  const refusedList = list.isError ? serverWord(errMessage(list.error)) : '';
  const note = refused || refusedList;

  return (
    <Section
      title='sessions'
      headerClassName='[&_h3]:normal-case'
      action={note ? <Note bad>{note}</Note> : undefined}
    >
      {list.isLoading ? (
        <Loader />
      ) : (
        <div className='flex flex-col'>
          {sessions.map((s, i) => (
            <PlainRow
              key={s.key || i}
              word={deviceWord(s)}
              quiet={sessionWord(s)}
              control={
                s.thisDevice ? undefined : (
                  <Button
                    variant='secondary'
                    className={ROW_BUTTON}
                    loading={busy === s.key}
                    disabled={!!busy && busy !== s.key}
                    onClick={() =>
                      void run(
                        s.key ?? '',
                        () => authService.RevokeMySession({ key: s.key }),
                        () => drop((k) => k !== s.key),
                      )
                    }
                  >
                    sign out
                  </Button>
                )
              }
            />
          ))}
        </div>
      )}
      <div className='mt-2.5 flex flex-wrap justify-end gap-3 border-t border-hairline pt-2.5'>
        <Button
          variant='secondary'
          className={BLOCK_BUTTON}
          disabled={!others || (!!busy && busy !== 'others')}
          loading={busy === 'others'}
          onClick={() =>
            void run(
              'others',
              () => authService.RevokeMyOtherSessions({}),
              () => drop((_, me) => !!me),
            )
          }
        >
          sign out others
        </Button>
      </div>
    </Section>
  );
}
