import { authService, authServiceWith } from 'api/api';
import { writeAuthToken } from 'api/auth-headers';
import { type ChangeEvent, type ReactNode, useState } from 'react';
import { ViewSwitch } from 'ui';

import { errMessage } from './api-error';
import { CODE_LEN, CodeCells, Resend } from './code-cells';
import { joinErrorWord } from './join-link-error';
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
} from './sheet';
import { useSignupProof } from './signup-proof';

type Mode = 'signup' | 'signin';

const MODES = [
  { value: 'signup', label: 'sign up' },
  { value: 'signin', label: 'sign in' },
] as const;

export function JoinLinkAccess({
  link,
  teamName,
  renderSide,
  onResult,
  onSession,
}: {
  link: string;
  teamName: string;
  renderSide: (name: string) => ReactNode;
  onResult: (state: string | undefined, email: string) => void;
  onSession: (email: string, note: string) => void;
}) {
  const proof = useSignupProof();
  const [mode, setMode] = useState<Mode>('signup');
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [code, setCode] = useState('');
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const login = email.trim();
  const signUpReady = /.+@.+\..+/.test(login) && password.length >= 8 && agreed;
  const signInReady = !!login && !!password;

  const openSession = async () => {
    const signed = await authService.SignIn({
      login,
      password,
      target: 'SIGN_IN_TARGET_TEAM',
    });
    if (!signed.token) throw Object.assign(new Error('no token'), { status: 401 });
    writeAuthToken(signed.token);
    setPassword('');
  };

  const signUp = async () => {
    if (!signUpReady || busy) return;
    setBusy(true);
    setNote('');
    const request = {
      email: login,
      password,
      teamName: undefined,
      teamSlug: undefined,
      termsAccepted: true,
      logo: undefined,
      brand: undefined,
      name: name.trim() || undefined,
      joinLink: link,
    };
    try {
      try {
        await authServiceWith(await proof.take()).SignUp(request);
      } catch (e) {
        if (!errMessage(e).includes('bot_check')) throw e;
        await authServiceWith(await proof.take(true)).SignUp(request);
      }
      setStep('code');
    } catch (e) {
      proof.again();
      setNote(joinErrorWord(e));
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    if (!signInReady || busy) return;
    setBusy(true);
    setNote('');
    try {
      await openSession();
      try {
        const joined = await authService.JoinTeam({ link });
        onResult(joined.state, login);
      } catch (e) {
        onSession(login, joinErrorWord(e, 'try again'));
      }
    } catch (e) {
      setNote(joinErrorWord(e, 'wrong password'));
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (code.length < CODE_LEN || busy) return;
    setBusy(true);
    setNote('');
    let state: string | undefined;
    try {
      state = (await authService.ConfirmJoinCode({ email: login, code, password })).state;
    } catch (e) {
      setCode('');
      setRound((n) => n + 1);
      setNote(joinErrorWord(e, 'wrong code'));
      setBusy(false);
      return;
    }
    try {
      await openSession();
      onResult(state, login);
    } catch (e) {
      setMode('signin');
      setStep('form');
      setNote(joinErrorWord(e, 'try again'));
      setBusy(false);
    }
  };

  if (step === 'code')
    return (
      <AuthSheet side={renderSide(teamName)}>
        <SheetForm title='join' note={note} onSubmit={confirm}>
          <SheetRow label='sent to'>
            <SheetValue>{login}</SheetValue>
          </SheetRow>
          <SheetRow label='code'>
            <CodeCells
              key={round}
              invalid={note === 'wrong code'}
              onChange={(next) => {
                setCode(next);
                if (note === 'wrong code') setNote('');
              }}
            />
          </SheetRow>
          <SheetFoot
            left={<Resend onResend={() => authService.ResendVerification({ email: login })} />}
          >
            <SheetSubmit disabled={code.length < CODE_LEN} loading={busy}>
              request to join
            </SheetSubmit>
          </SheetFoot>
        </SheetForm>
      </AuthSheet>
    );

  const changeMode = (next: Mode) => {
    setMode(next);
    setNote('');
  };

  return (
    <AuthSheet side={renderSide(teamName)}>
      <SheetForm title='join' note={note} onSubmit={mode === 'signup' ? signUp : signIn}>
        <ViewSwitch
          className='[&_*]:normal-case'
          label='mode'
          columns={2}
          value={mode}
          onChange={changeMode}
          options={MODES}
        />
        {mode === 'signup' && (
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
        <SheetRow label='email'>
          <SheetInput
            type='email'
            name='email'
            value={email}
            placeholder='you@studio.com'
            autoComplete='username'
            autoCapitalize='none'
            autoFocus={mode === 'signin'}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          />
        </SheetRow>
        <SheetRow label='password'>
          <PasswordInput
            value={password}
            onChange={(next) => {
              setPassword(next);
              if (note === 'wrong password') setNote('');
            }}
            invalid={note === 'wrong password'}
            placeholder={mode === 'signup' ? '8+ characters' : undefined}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
        </SheetRow>
        <SheetFoot
          left={mode === 'signup' ? <AgreeRow checked={agreed} onChange={setAgreed} /> : undefined}
        >
          <SheetSubmit disabled={mode === 'signup' ? !signUpReady : !signInReady} loading={busy}>
            request to join
          </SheetSubmit>
        </SheetFoot>
      </SheetForm>
    </AuthSheet>
  );
}
