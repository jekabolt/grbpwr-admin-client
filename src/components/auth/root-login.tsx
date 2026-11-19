import { authService } from 'api/api';
import { clearAuthToken, writeAuthToken } from 'api/auth-headers';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { isRefusal } from './api-error';
import { ProviderButtons } from './providers';
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

/**
 * Root log in: a provider, or email / username → password. Either way the root token is kept
 * (30 days) and `your teams` opens.
 */
export function RootLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const navigate = useNavigate();
  // a provider sign-in that came back with an error lands here with its word
  const { state } = useLocation() as { state: { note?: string } | null };
  const [step, setStep] = useState<'email' | 'password'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(state?.note ?? '');
  const login = email.trim();

  const forgot = (
    <SheetLink onClick={() => navigate('/reset', { state: { email } })}>forgot password</SheetLink>
  );

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
      if (!r.token) throw Object.assign(new Error('no token'), { status: 401 });
      writeAuthToken(r.token);
      onSignedIn();
    } catch (e) {
      setBusy(false);
      setNote(isRefusal(e) ? 'wrong password' : 'try again');
    }
  };

  const changeEmail = () => {
    clearAuthToken();
    setPassword('');
    setNote('');
    setStep('email');
  };

  if (step === 'email')
    return (
      <AuthSheet side={<RootSide mode='login' />}>
        <SheetForm
          title='log in'
          note={note}
          onSubmit={() => {
            if (!login) return;
            setNote('');
            setStep('password');
          }}
        >
          <ProviderButtons fields={() => ({ target: 'signin' })} />
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
      <SheetForm title='log in' note={note} onSubmit={signIn}>
        <SheetRow label='email'>
          <SheetValue onChange={changeEmail}>{email}</SheetValue>
        </SheetRow>
        <SheetRow label='password'>
          <PasswordInput
            value={password}
            onChange={setPassword}
            invalid={note === 'wrong password'}
            autoFocus
          />
        </SheetRow>
        <SheetFoot left={forgot}>
          <SheetSubmit disabled={!password} loading={busy}>
            log in
          </SheetSubmit>
        </SheetFoot>
      </SheetForm>
    </AuthSheet>
  );
}
