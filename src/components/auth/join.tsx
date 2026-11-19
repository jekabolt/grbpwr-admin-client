import { authService } from 'api/api';
import { currentHost, goToUrl, teamUrl } from 'lib/host';
import { useEffect, useState } from 'react';
import { Loader, Section, Text } from 'ui';

import { clearHash, hashParam, isRefusal } from './api-error';
import { TeamMark } from './logo-step';
import { teamLogoUrl } from './oauth';
import { ProviderButtons, signInOptions } from './providers';
import {
  AgreeRow,
  AuthSheet,
  PasswordInput,
  SheetFoot,
  SheetForm,
  SheetInput,
  SheetRow,
  SheetSubmit,
  SheetValue,
  Wordmark,
} from './sheet';

/**
 * The join sheet's side: the team name, and under it the team's logo as a square (spec O §15) —
 * the word `lekalo` while it loads, when the team has none, or when it fails. Nothing is reserved.
 */
function JoinSide({ name }: { name: string }) {
  const [src] = useState(() => teamLogoUrl(currentHost().slug));
  const [loaded, setLoaded] = useState(false);
  return (
    <Section className='self-start'>
      <Wordmark>{name}</Wordmark>
      {src && (
        <img
          src={src}
          alt=''
          hidden
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(false)}
        />
      )}
      {loaded ? (
        <TeamMark src={src} size='side' />
      ) : (
        <Text size='micro' variant='label' tracking='label' component='span' className='block'>
          lekalo
        </Text>
      )}
    </Section>
  );
}

type Invite = { teamName: string; email: string; accountExists: boolean };

/** `/join#token=…`: the invite letter's link. */
export function Join() {
  const [token] = useState(() => hashParam('token'));
  const [invite, setInvite] = useState<Invite | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'expired'>(
    token ? 'loading' : 'expired',
  );
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    clearHash();
    if (!token) return;
    let live = true;
    // the provider buttons come with the form, so nothing jumps in after it
    Promise.all([authService.GetInvite({ token }), signInOptions()])
      .then(([r]) => {
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
    if (password.length < (invite?.accountExists ? 1 : 8) || !agreed || busy) return;
    setBusy(true);
    setNote('');
    try {
      const handle = invite?.accountExists ? undefined : name.trim() || undefined;
      const r = await authService.AcceptInvite({
        token,
        password,
        handle,
        termsAccepted: true,
        name: undefined,
      });
      goToUrl(teamUrl(r.teamSlug ?? '', `/auth#code=${encodeURIComponent(r.handoffCode ?? '')}`));
    } catch (e) {
      setNote(
        isRefusal(e) ? (invite?.accountExists ? 'wrong password' : 'link expired') : 'try again',
      );
      setBusy(false);
    }
  };

  return (
    <AuthSheet side={<JoinSide name={invite?.teamName || ''} />}>
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
            <ProviderButtons
              fields={() => ({
                target: 'invite',
                invite_token: token,
                terms_accepted: agreed ? 'true' : 'false',
              })}
            />
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
            <AgreeRow checked={agreed} onChange={setAgreed} />
            <SheetFoot>
              <SheetSubmit
                disabled={password.length < (invite.accountExists ? 1 : 8) || !agreed}
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
