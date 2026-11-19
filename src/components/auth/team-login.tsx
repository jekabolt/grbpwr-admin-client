import { authService } from 'api/api';
import { writeAuthToken } from 'api/auth-headers';
import type { SignInTarget } from 'api/proto-http/auth';
import { currentHost, goToUrl, rootUrl } from 'lib/host';
import { useState } from 'react';

import { isRefusal } from './api-error';
import { TeamMark, useTeamLogo } from './logo-step';
import {
  AuthSheet,
  PasswordInput,
  SheetFoot,
  SheetForm,
  SheetInput,
  SheetLink,
  SheetRow,
  SheetSubmit,
  TeamSide,
} from './sheet';

/**
 * Log in on a team host (side = the team) or on the console host (side = lekalo · console).
 * The token stays in this origin's storage; `onSignedIn` re-renders the guarded page.
 */
export function TeamLogin({
  target = 'SIGN_IN_TARGET_TEAM',
  onSignedIn,
}: {
  target?: Extract<SignInTarget, 'SIGN_IN_TARGET_TEAM' | 'SIGN_IN_TARGET_CONSOLE'>;
  onSignedIn: () => void;
}) {
  const isConsole = target === 'SIGN_IN_TARGET_CONSOLE';
  const logo = useTeamLogo(isConsole ? '' : currentHost().slug);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const submit = async () => {
    if (!login.trim() || !password || busy) return;
    setBusy(true);
    setNote('');
    try {
      const r = await authService.SignIn({ login: login.trim(), password, target });
      if (!r.token) throw Object.assign(new Error('no token'), { status: 401 });
      writeAuthToken(r.token);
      onSignedIn();
    } catch (e) {
      setNote(isRefusal(e) ? 'wrong password' : 'try again');
      setBusy(false);
    }
  };

  return (
    <AuthSheet
      side={
        isConsole ? (
          <TeamSide name='lekalo' sub='console' />
        ) : (
          <TeamSide
            name={currentHost().slug}
            brand
            mark={logo && <TeamMark src={logo} size='plate' />}
          />
        )
      }
    >
      <SheetForm title='log in' note={note} onSubmit={submit}>
        <SheetRow label='email'>
          <SheetInput
            name='login'
            value={login}
            placeholder='you@studio.com'
            autoComplete='username'
            autoFocus
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLogin(e.target.value)}
          />
        </SheetRow>
        <SheetRow label='password'>
          <PasswordInput
            value={password}
            onChange={setPassword}
            invalid={note === 'wrong password'}
          />
        </SheetRow>
        <SheetFoot
          left={
            isConsole ? undefined : (
              <SheetLink onClick={() => goToUrl(rootUrl('/reset'))}>forgot password</SheetLink>
            )
          }
        >
          <SheetSubmit disabled={!login.trim() || !password} loading={busy}>
            log in
          </SheetSubmit>
        </SheetFoot>
      </SheetForm>
    </AuthSheet>
  );
}
