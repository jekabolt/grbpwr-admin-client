import { authService } from 'api/api';
import { clearAuthToken, writeAuthToken } from 'api/auth-headers';
import type { TeamRef } from 'api/proto-http/auth';
import { goToUrl, teamUrl } from 'lib/host';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chip, ChipRow, Text } from 'ui';

import { isRefusal } from './api-error';
import {
  AuthSheet,
  AwaitingApproval,
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

/** Root log in: email or username → password → (several teams) a team → that team's address. */
export function RootLogin() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'password' | 'team'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [teams, setTeams] = useState<TeamRef[]>([]);
  const [picked, setPicked] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const login = email.trim();

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
        login,
        password,
        target: 'SIGN_IN_TARGET_ROOT',
      });
      writeAuthToken(r.token ?? '');
      const list = r.teams ?? [];
      const open = list.filter((t) => !t.awaitingApproval);
      if (list.length === 1 && open.length === 1) return void (await enter(open[0].slug ?? ''));
      setBusy(false);
      if (list.length === 0) return setNote('no team');
      // nothing to open yet: the team waits for the operator
      if (open.length === 0) return setAwaiting(list[0].slug ?? '');
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

  if (awaiting !== null) return <AwaitingApproval slug={awaiting} />;

  if (step === 'email')
    return (
      <AuthSheet side={<RootSide mode='login' />}>
        <SheetForm title='log in' onSubmit={() => login && setStep('password')}>
          <SheetRow label='email'>
            <SheetInput
              type='text'
              name='email'
              value={email}
              placeholder='you@studio.com'
              autoComplete='username'
              autoCapitalize='none'
              autoFocus
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            />
          </SheetRow>
          <SheetFoot left={forgot}>
            <SheetSubmit disabled={!login}>continue</SheetSubmit>
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
              {teams.map((t) =>
                t.awaitingApproval ? (
                  <Chip
                    key={t.slug}
                    disabled
                    className='h-8 gap-2 px-3 normal-case disabled:opacity-100 max-sm:h-10'
                  >
                    {t.name || t.slug}
                    <Text size='micro' variant='label' tracking='label' component='span'>
                      awaiting approval
                    </Text>
                  </Chip>
                ) : (
                  <Chip
                    key={t.slug}
                    pressed={picked === t.slug}
                    disabled={busy}
                    className='h-8 px-3 normal-case max-sm:h-10'
                    onClick={() => void enter(t.slug ?? '')}
                  >
                    {t.name || t.slug}
                  </Chip>
                ),
              )}
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
