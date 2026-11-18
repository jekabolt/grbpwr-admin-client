import { authService } from 'api/api';
import { goToUrl, teamUrl } from 'lib/host';
import { useEffect, useState } from 'react';
import { Loader } from 'ui';

import { clearHash, hashParam, isRefusal } from './api-error';
import {
  AuthSheet,
  PasswordInput,
  SheetFoot,
  SheetForm,
  SheetInput,
  SheetRow,
  SheetSubmit,
  SheetValue,
  TeamSide,
} from './sheet';

type Invite = { teamName: string; email: string; accountExists: boolean };

/** `/join#token=…`: the invite letter's link. */
export function Join() {
  const [token] = useState(() => hashParam('token'));
  const [invite, setInvite] = useState<Invite | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'expired'>(
    token ? 'loading' : 'expired',
  );
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    clearHash();
    if (!token) return;
    let live = true;
    authService
      .GetInvite({ token })
      .then((r) => {
        if (!live) return;
        setInvite({
          teamName: r.teamName ?? '',
          email: r.email ?? '',
          accountExists: !!r.accountExists,
        });
        setState('ready');
      })
      .catch(() => live && setState('expired'));
    return () => {
      live = false;
    };
  }, [token]);

  const submit = async () => {
    if (password.length < (invite?.accountExists ? 1 : 8) || busy) return;
    setBusy(true);
    setNote('');
    try {
      const handle = invite?.accountExists ? undefined : name.trim() || undefined;
      const r = await authService.AcceptInvite({ token, password, handle });
      goToUrl(teamUrl(r.teamSlug ?? '', `/auth#code=${encodeURIComponent(r.handoffCode ?? '')}`));
    } catch (e) {
      setNote(
        isRefusal(e) ? (invite?.accountExists ? 'wrong password' : 'link expired') : 'try again',
      );
      setBusy(false);
    }
  };

  return (
    <AuthSheet side={<TeamSide name={invite?.teamName || ''} />}>
      <SheetForm
        title='join'
        note={state === 'expired' ? 'link expired' : note}
        onSubmit={state === 'ready' ? submit : undefined}
      >
        {state === 'loading' && (
          <div className='flex justify-center py-6'>
            <Loader />
          </div>
        )}
        {state === 'ready' && invite && (
          <>
            <SheetRow label='email'>
              <SheetValue>{invite.email}</SheetValue>
            </SheetRow>
            {!invite.accountExists && (
              <SheetRow label='name'>
                <SheetInput
                  name='name'
                  value={name}
                  placeholder='mira'
                  autoComplete='name'
                  autoFocus
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                />
              </SheetRow>
            )}
            <SheetRow label='password'>
              <PasswordInput
                value={password}
                onChange={setPassword}
                invalid={note === 'wrong password'}
                placeholder={invite.accountExists ? undefined : '8+ characters'}
                autoComplete={invite.accountExists ? 'current-password' : 'new-password'}
                autoFocus={invite.accountExists}
              />
            </SheetRow>
            <SheetFoot>
              <SheetSubmit
                disabled={password.length < (invite.accountExists ? 1 : 8)}
                loading={busy}
              >
                join
              </SheetSubmit>
            </SheetFoot>
          </>
        )}
      </SheetForm>
    </AuthSheet>
  );
}
