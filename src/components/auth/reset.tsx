import { authService } from 'api/api';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { clearHash, hashParam, isRefusal } from './api-error';
import { CODE_LEN, CodeCells, Resend } from './code-cells';
import {
  AuthSheet,
  PasswordInput,
  RootSide,
  SheetFoot,
  SheetForm,
  SheetInput,
  SheetRow,
  SheetSubmit,
  SheetValue,
} from './sheet';

/** `/reset`: email → code → new password. `/reset#token=` (the letter's link) skips the code. */
export function ResetPassword() {
  const navigate = useNavigate();
  const { showMessage } = useSnackBarStore();
  const loc = useLocation();
  const [token] = useState(() => hashParam('token'));
  const [step, setStep] = useState<'email' | 'code' | 'password'>(token ? 'password' : 'email');
  const [email, setEmail] = useState(
    () => (loc.state as { email?: string } | null)?.email ?? hashParam('email'),
  );
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState(false);
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => clearHash(), []);

  const send = async () => {
    if (!/.+@.+/.test(email.trim()) || busy) return;
    setBusy(true);
    try {
      await authService.RequestPasswordReset({ email: email.trim() });
      setStep('code');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (password.length < 8 || busy) return;
    setBusy(true);
    setNote('');
    try {
      await authService.ResetPassword({
        token,
        email: token ? '' : email.trim(),
        code: token ? '' : code,
        newPassword: password,
      });
      showMessage('password saved', 'success');
      navigate('/login', { replace: true });
    } catch (e) {
      if (!isRefusal(e)) setNote('try again');
      else if (token) setNote('link expired');
      else {
        setWrong(true);
        setRound((n) => n + 1);
        setStep('code');
      }
    } finally {
      setBusy(false);
    }
  };

  const side = <RootSide mode='login' />;

  if (step === 'email')
    return (
      <AuthSheet side={side}>
        <SheetForm title='reset password' onSubmit={send}>
          <SheetRow label='email'>
            <SheetInput
              type='email'
              name='email'
              value={email}
              placeholder='you@studio.com'
              autoComplete='email'
              autoFocus
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            />
          </SheetRow>
          <SheetFoot>
            <SheetSubmit disabled={!/.+@.+/.test(email.trim())} loading={busy}>
              send code
            </SheetSubmit>
          </SheetFoot>
        </SheetForm>
      </AuthSheet>
    );

  if (step === 'code')
    return (
      <AuthSheet side={side}>
        <SheetForm title='reset password' note={wrong ? 'wrong code' : undefined}>
          <SheetRow label='sent to'>
            <SheetValue onChange={() => setStep('email')}>{email}</SheetValue>
          </SheetRow>
          <SheetRow label='code'>
            <CodeCells
              key={round}
              invalid={wrong}
              onChange={(c) => {
                if (c.length < CODE_LEN) return;
                setWrong(false);
                setCode(c);
                setStep('password');
              }}
            />
          </SheetRow>
          <SheetFoot
            left={
              <Resend
                startWaiting={!wrong}
                onResend={() => authService.RequestPasswordReset({ email: email.trim() })}
              />
            }
          >
            <span />
          </SheetFoot>
        </SheetForm>
      </AuthSheet>
    );

  return (
    <AuthSheet side={side}>
      <SheetForm title='new password' note={note} onSubmit={save}>
        {!!email && (
          <SheetRow label='email'>
            <SheetValue>{email}</SheetValue>
          </SheetRow>
        )}
        <SheetRow label='password'>
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder='8+ characters'
            autoComplete='new-password'
            autoFocus
          />
        </SheetRow>
        <SheetFoot>
          <SheetSubmit disabled={password.length < 8} loading={busy}>
            save
          </SheetSubmit>
        </SheetFoot>
      </SheetForm>
    </AuthSheet>
  );
}
