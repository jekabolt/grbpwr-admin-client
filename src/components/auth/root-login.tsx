import { authService } from 'api/api';
import { clearAuthToken, writeAuthToken } from 'api/auth-headers';
import type { TeamRef } from 'api/proto-http/auth';
import { goToUrl, teamUrl } from 'lib/host';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chip, ChipRow } from 'ui';

import { isRefusal } from './api-error';
import {
  AuthSheet,
  PasswordInput,
  RootSide,
  SheetFoot,
  SheetForm,
  SheetInput,
  SheetLink,
  SheetRow,
  SheetSubmit,
  SheetValue,
} from './sheet';

/** Root log in: email → password → (several teams) a team → that team's address. */
export function RootLogin() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'password' | 'team'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [teams, setTeams] = useState<TeamRef[]>([]);
  const [picked, setPicked] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const forgot = (
    <SheetLink onClick={() => navigate('/reset', { state: { email } })}>forgot password</SheetLink>
  );

  const enter = async (slug: string) => {
    setPicked(slug);
    setBusy(true);
    setNote('');
    try {
      const r = await authService.IssueHandoff({ teamSlug: slug });
      clearAuthToken();
      goToUrl(
        r.code ? teamUrl(slug, `/auth#code=${encodeURIComponent(r.code)}`) : r.url || teamUrl(slug),
      );
    } catch {
      setNote('try again');
      setBusy(false);
    }
  };

  const signIn = async () => {
    if (!password || busy) return;
    setBusy(true);
    setNote('');
    try {
      const r = await authService.SignIn({
        login: email.trim(),
        password,
        target: 'SIGN_IN_TARGET_ROOT',
      });
      writeAuthToken(r.token ?? '');
      const list = r.teams ?? [];
      if (list.length === 1) return void (await enter(list[0].slug ?? ''));
      setBusy(false);
      if (list.length === 0) return setNote('no team');
      setTeams(list);
      setStep('team');
    } catch (e) {
      setBusy(false);
      setNote(isRefusal(e) ? 'wrong password' : 'try again');
    }
  };

  const changeEmail = () => {
    clearAuthToken();
    setTeams([]);
    setPassword('');
    setNote('');
    setStep('email');
  };

  if (step === 'email')
    return (
      <AuthSheet side={<RootSide mode='login' />}>
        <SheetForm
          title='log in'
          onSubmit={() => /.+@.+/.test(email.trim()) && setStep('password')}
        >
          <SheetRow label='email'>
            <SheetInput
              type='email'
              name='email'
              value={email}
              placeholder='you@studio.com'
              autoComplete='username'
              autoFocus
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            />
          </SheetRow>
          <SheetFoot left={forgot}>
            <SheetSubmit disabled={!/.+@.+/.test(email.trim())}>continue</SheetSubmit>
          </SheetFoot>
        </SheetForm>
      </AuthSheet>
    );

  return (
    <AuthSheet side={<RootSide mode='login' />}>
      <SheetForm title='log in' note={note} onSubmit={step === 'password' ? signIn : undefined}>
        <SheetRow label='email'>
          <SheetValue onChange={changeEmail}>{email}</SheetValue>
        </SheetRow>
        {step === 'team' ? (
          <SheetRow label='team'>
            <ChipRow className='gap-1.5'>
              {teams.map((t) => (
                <Chip
                  key={t.slug}
                  pressed={picked === t.slug}
                  disabled={busy}
                  className='h-8 px-3 normal-case max-sm:h-10'
                  onClick={() => void enter(t.slug ?? '')}
                >
                  {t.name || t.slug}
                </Chip>
              ))}
            </ChipRow>
          </SheetRow>
        ) : (
          <SheetRow label='password'>
            <PasswordInput
              value={password}
              onChange={setPassword}
              invalid={note === 'wrong password'}
              autoFocus
            />
          </SheetRow>
        )}
        <SheetFoot left={forgot}>
          {step === 'password' ? (
            <SheetSubmit disabled={!password} loading={busy}>
              log in
            </SheetSubmit>
          ) : (
            <span />
          )}
        </SheetFoot>
      </SheetForm>
    </AuthSheet>
  );
}
