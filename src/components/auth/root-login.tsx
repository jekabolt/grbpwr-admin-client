import { authService } from 'api/api';
import { writeAuthToken } from 'api/auth-headers';
import { type ChangeEvent, useState } from 'react';
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
} from './sheet';

/**
 * Root log in on one sheet: a provider, or email / username and password. Either way the root
 * token is kept (30 days) and `teams` opens.
 */
export function RootLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const navigate = useNavigate();
  // a provider sign-in that came back with an error lands here with its word
  const { state } = useLocation() as { state: { note?: string } | null };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(state?.note ?? '');
  const login = email.trim();

  const signIn = async () => {
    if (!login || !password || busy) return;
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

  return (
    <AuthSheet side={<RootSide mode='login' />}>
      <SheetForm title='Log in' note={note} onSubmit={signIn}>
        <ProviderButtons fields={() => ({ target: 'signin' })} />
        <SheetRow label='Email or username' htmlFor='email'>
          <SheetInput
            type='text'
            name='email'
            value={email}
            placeholder='you@studio.com'
            autoComplete='username'
            autoCapitalize='none'
            autoFocus
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          />
        </SheetRow>
        <SheetRow label='Password' htmlFor='password'>
          <PasswordInput
            value={password}
            onChange={(v) => {
              setPassword(v);
              if (note === 'wrong password') setNote('');
            }}
            invalid={note === 'wrong password'}
          />
        </SheetRow>
        <SheetFoot
          left={
            <SheetLink onClick={() => navigate('/reset', { state: { email } })}>
              Forgot password
            </SheetLink>
          }
        >
          <SheetSubmit disabled={!login || !password} loading={busy}>
            Log in
          </SheetSubmit>
        </SheetFoot>
      </SheetForm>
    </AuthSheet>
  );
}
