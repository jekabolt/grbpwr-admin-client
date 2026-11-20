import { authService } from 'api/api';
import { currentHost, goToUrl, teamUrl } from 'lib/host';
import { type ChangeEvent, useEffect, useState } from 'react';
import { Loader, Section } from 'ui';

import { clearHash, hashParam, isRefusal } from './api-error';
import { JoinByLink } from './join-link';
import { TeamMark, useTeamLogo } from './logo-step';
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
  SIDE,
  Wordmark,
} from './sheet';

/**
 * The join sheet's side: the team name, and under it the team's square (spec O §15) — its logo, or
 * the empty square while it loads, when the team has none, or when it fails.
 */
function JoinSide({ name }: { name: string }) {
  const logo = useTeamLogo(currentHost().slug);
  return (
    <Section className={SIDE}>
      <Wordmark>{name}</Wordmark>
      <TeamMark src={logo} size='side' />
    </Section>
  );
}

type Invite = { teamName: string; email: string; accountExists: boolean };

/** `/join`: public team link or invite letter. */
export function Join() {
  const [link] = useState(() => hashParam('link'));
  return link ? (
    <JoinByLink link={link} renderSide={(name) => <JoinSide name={name} />} />
  ) : (
    <JoinInvite />
  );
}

/** `/join#token=…`: the invite letter's link. */
function JoinInvite() {
  const [token] = useState(() => hashParam('token'));
  const [invite, setInvite] = useState<Invite | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'expired'>(
    token ? 'loading' : 'expired',
  );
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  // a provider pressed before consent: the consent line turns red, the page stays
  const [need, setNeed] = useState(false);
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
              gate={() => {
                if (agreed) return true;
                setNeed(true);
                document.getElementById('agree')?.focus();
                return false;
              }}
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
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
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
            <SheetFoot
              left={
                <AgreeRow
                  checked={agreed}
                  need={need}
                  onChange={(v) => {
                    setAgreed(v);
                    setNeed(false);
                  }}
                />
              }
            >
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
