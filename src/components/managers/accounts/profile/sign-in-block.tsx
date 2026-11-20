import { useQueryClient } from '@tanstack/react-query';
import { authService } from 'api/api';
import type { MyProfile } from 'api/proto-http/auth';
import { errMessage } from 'components/auth/api-error';
import { oauthStartUrl } from 'components/auth/oauth';
import { useEffect, useState } from 'react';
import { AddDoor, Close, Section } from 'ui';
import { googleReturnWord, serverWord } from './model';
import { myProfileKey, Note, PlainRow } from './parts';

// The `sign in` block: one row, `google` · `connected · <gmail>` with × to disconnect (locked
// while it is the only way in), or `not connected` with `+ connect` (P0 §3.7: a ticket, then a
// plain form POST to the API host; Google sends the person back to `/profile?google=…`).

const STUB = import.meta.env.DEV && !!import.meta.env.VITE_AUTH_STUB;

function postLink(ticket: string) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = oauthStartUrl('google');
  form.style.display = 'none';
  for (const [name, value] of Object.entries({ target: 'link', ticket })) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

/** `?google=…` from the round trip: read once, then dropped from the address. */
function useGoogleReturn(): string {
  const [word] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : googleReturnWord(new URLSearchParams(window.location.search).get('google')),
  );
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('google')) return;
    url.searchParams.delete('google');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, []);
  return word;
}

export function ProfileSignIn({ profile }: { profile: MyProfile }) {
  const qc = useQueryClient();
  const back = useGoogleReturn();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState('');
  const gmail = profile.googleEmail ?? '';
  const only = !profile.passwordSet;

  const connect = async () => {
    if (busy) return;
    setBusy(true);
    setRefused('');
    try {
      const r = await authService.StartGoogleLink({});
      if (STUB) {
        await qc.invalidateQueries({ queryKey: myProfileKey });
        setBusy(false);
        return;
      }
      postLink(r.ticket ?? '');
    } catch (e) {
      const m = errMessage(e);
      if (m.includes('already_linked')) void qc.invalidateQueries({ queryKey: myProfileKey });
      else setRefused(serverWord(m));
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (busy || only) return;
    setBusy(true);
    setRefused('');
    try {
      await authService.UnlinkMyGoogle({});
      qc.setQueryData<{ profile: MyProfile | undefined }>(myProfileKey, (old) =>
        old?.profile ? { profile: { ...old.profile, googleEmail: '' } } : old,
      );
      void qc.invalidateQueries({ queryKey: myProfileKey });
    } catch (e) {
      setRefused(serverWord(errMessage(e)));
    } finally {
      setBusy(false);
    }
  };

  const note = refused || back;

  return (
    <Section
      title='sign in'
      headerClassName='[&_h3]:normal-case'
      action={note ? <Note bad>{note}</Note> : undefined}
    >
      <div className='flex flex-col'>
        <PlainRow
          word='google'
          quiet={gmail ? `connected · ${gmail}` : 'not connected'}
          control={
            gmail ? (
              <Close
                size='sm'
                aria-label='disconnect google'
                disabled={only || busy}
                onClick={() => void disconnect()}
              />
            ) : (
              <AddDoor shape='inline' lowercase disabled={busy} onClick={() => void connect()}>
                connect
              </AddDoor>
            )
          }
        />
      </div>
    </Section>
  );
}
