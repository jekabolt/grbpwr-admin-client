import { authService } from 'api/api';
import { writeAuthToken } from 'api/auth-headers';
import type { SignInResponse } from 'api/proto-http/auth';
import { cn } from 'lib/utility';
import { QRCodeSVG } from 'qrcode.react';
import { type ReactNode, useEffect, useState } from 'react';
import { Button, Section, Text } from 'ui';

import { errMessage, errStatus, isRefusal } from './api-error';
import { CODE_LEN, CodeCells, Resend } from './code-cells';
import {
  AuthSheet,
  PasswordInput,
  SheetFoot,
  SheetForm,
  SheetInput,
  SheetLink,
  SheetSubmit,
  SIDE,
  Wordmark,
} from './sheet';

// The console log-in, the owner's «step rail» (mockup ThqfUsjhTFSKcKX8HAJ3M5, variant 3): the side
// block lists the steps (password → code; first setup: mail → scan → save), the form block holds
// one big action. A server with the second step off answers a token at once: today's flow.

type Stage =
  | { k: 'password' }
  | { k: 'code'; ticket: string; recovery: boolean }
  | { k: 'mail'; ticket: string }
  | { k: 'scan'; ticket: string; secret: string; url: string }
  | { k: 'save'; token: string; codes: string[] }
  | { k: 'locked'; until: number };

const LOCK_MS = 15 * 60 * 1000;

const TITLE: Record<Stage['k'], string> = {
  password: 'log in',
  code: 'code',
  mail: 'check your mail',
  scan: 'scan',
  save: 'save these',
  locked: 'locked',
};

function rail(stage: Stage): { steps: string[]; at: number } {
  switch (stage.k) {
    case 'mail':
      return { steps: ['mail', 'scan', 'save'], at: 0 };
    case 'scan':
      return { steps: ['mail', 'scan', 'save'], at: 1 };
    case 'save':
      return { steps: ['mail', 'scan', 'save'], at: 2 };
    case 'password':
      return { steps: ['password', 'code'], at: 0 };
    default:
      return { steps: ['password', 'code'], at: 1 };
  }
}

function StepSide({ stage }: { stage: Stage }) {
  const { steps, at } = rail(stage);
  return (
    <Section className={SIDE}>
      <Wordmark>lekalo</Wordmark>
      <Text size='micro' variant='label' tracking='label' component='span' className='block'>
        console
      </Text>
      <ol className='mt-4' aria-label='steps'>
        {steps.map((s, i) => (
          <li
            key={s}
            aria-current={i === at ? 'step' : undefined}
            className={cn(
              'flex justify-between border-b py-1.5',
              i === at ? 'border-textColor' : 'border-hairline',
            )}
          >
            <Text
              size='micro'
              variant={i === at ? undefined : 'label'}
              tracking='label'
              component='span'
            >
              {s}
            </Text>
            {i < at && (
              <Text size='micro' variant='label' tracking='label' component='span'>
                ok
              </Text>
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** One column of the big action: a small label word, then the thing itself. */
function Big({ children }: { children: ReactNode }) {
  return <div className='flex flex-col gap-3.5'>{children}</div>;
}

function Word({ children }: { children: string }) {
  return (
    <Text size='micro' variant='label' component='span' className='break-all'>
      {children}
    </Text>
  );
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** `JBSW Y3DP …` — the key in groups of four, as an app's manual entry shows it. */
function grouped(secret: string): string {
  return secret
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

function download(codes: string[]) {
  const url = URL.createObjectURL(new Blob([`${codes.join('\n')}\n`], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lekalo-recovery-codes.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ConsoleLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [stage, setStage] = useState<Stage>({ k: 'password' });
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [noteTone, setNoteTone] = useState<'warn' | 'ok'>('warn');
  // a new key empties the cells (after a wrong code, between steps)
  const [cellsKey, setCellsKey] = useState(0);
  const [, tick] = useState(0);

  const locked = stage.k === 'locked' ? stage.until - Date.now() : 0;
  useEffect(() => {
    if (stage.k !== 'locked') return;
    const t = setInterval(() => {
      if (stage.until <= Date.now()) setStage({ k: 'password' });
      tick((n) => n + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [stage]);

  const go = (next: Stage, nextNote = '') => {
    setStage(next);
    setCode('');
    setRecovery('');
    setNote(nextNote);
    setNoteTone('warn');
    setCellsKey((n) => n + 1);
  };

  const finish = (token: string) => {
    writeAuthToken(token);
    onSignedIn();
  };

  /** The answer to a password: a token (switch off, or no second step) or a ticket. */
  const afterSignIn = (r: SignInResponse) => {
    if (r.token) return finish(r.token);
    const ticket = r.ticket ?? '';
    if (!ticket) throw Object.assign(new Error('no token'), { status: 401 });
    if (r.secondStep === 'OPERATOR_SECOND_STEP_SETUP') {
      go({ k: 'mail', ticket }, r.setupLetterSent === false ? 'not sent · try later' : '');
      return;
    }
    go({ k: 'code', ticket, recovery: false });
  };

  /** A refused code: locked, the sign-in gone (back to the password), or just wrong. */
  const refused = (e: unknown) => {
    const m = errMessage(e);
    if (errStatus(e) === 429 || m.includes('locked'))
      return go({ k: 'locked', until: Date.now() + LOCK_MS });
    if (m.includes('sign_in_again') || m.includes('second_step_off'))
      return go({ k: 'password' }, 'log in again');
    setNote(isRefusal(e) ? 'wrong code' : 'try again');
    setNoteTone('warn');
    if (isRefusal(e)) {
      setCode('');
      setCellsKey((n) => n + 1);
    }
  };

  const run = async (call: () => Promise<void>, onError: (e: unknown) => void) => {
    if (busy) return;
    setBusy(true);
    setNote('');
    try {
      await call();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const signIn = () =>
    authService.SignIn({ login: login.trim(), password, target: 'SIGN_IN_TARGET_CONSOLE' });

  const submit = () => {
    switch (stage.k) {
      case 'password':
        if (!login.trim() || !password) return;
        return run(
          async () => afterSignIn(await signIn()),
          (e) => setNote(isRefusal(e) ? 'wrong password' : 'try again'),
        );
      case 'code': {
        const typed = stage.recovery ? recovery.trim() : code;
        if (stage.recovery ? !typed : typed.length < CODE_LEN) return;
        return run(async () => {
          const r = await authService.OperatorVerify({ ticket: stage.ticket, code: typed });
          if (!r.token) throw Object.assign(new Error('no token'), { status: 500 });
          finish(r.token);
        }, refused);
      }
      case 'mail':
        if (code.length < CODE_LEN) return;
        return run(async () => {
          const r = await authService.OperatorSetupMail({ ticket: stage.ticket, code });
          go({ k: 'scan', ticket: stage.ticket, secret: r.secret ?? '', url: r.otpauthUrl ?? '' });
        }, refused);
      case 'scan':
        if (code.length < CODE_LEN) return;
        return run(async () => {
          const r = await authService.OperatorSetupConfirm({ ticket: stage.ticket, code });
          if (!r.token) throw Object.assign(new Error('no token'), { status: 500 });
          go({ k: 'save', token: r.token, codes: r.recoveryCodes ?? [] });
        }, refused);
      case 'save':
        return finish(stage.token);
      default:
    }
  };

  /** A new letter = a new sign-in with the same password (the server burns the old ticket). */
  const resend = async () => {
    const r = await signIn();
    if (r.ticket && r.secondStep === 'OPERATOR_SECOND_STEP_SETUP') {
      setStage({ k: 'mail', ticket: r.ticket });
      setNote(r.setupLetterSent === false ? 'not sent · try later' : '');
    } else afterSignIn(r);
  };

  const copy = async (codes: string[]) => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setNote('copied');
      setNoteTone('ok');
    } catch {
      setNote('not copied');
      setNoteTone('warn');
    }
  };

  const wrong = note === 'wrong code';
  let body: ReactNode = null;
  let action = 'next';
  let ready = code.length === CODE_LEN;
  let left: ReactNode;

  switch (stage.k) {
    case 'password':
      action = 'log in';
      ready = !!login.trim() && !!password;
      body = (
        <Big>
          <SheetInput
            name='login'
            value={login}
            placeholder='email'
            aria-label='email'
            autoComplete='username'
            autoFocus
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLogin(e.target.value)}
          />
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder='password'
            invalid={note === 'wrong password'}
          />
        </Big>
      );
      break;
    case 'code':
      action = 'log in';
      if (stage.recovery) {
        ready = !!recovery.trim();
        body = (
          <Big>
            <Word>recovery code</Word>
            <SheetInput
              name='recovery'
              value={recovery}
              aria-label='recovery code'
              autoComplete='off'
              autoFocus
              invalid={wrong}
              className='h-[3.75rem]! font-mono text-lg max-sm:h-[3.375rem]!'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecovery(e.target.value)}
            />
          </Big>
        );
      } else {
        body = (
          <Big>
            <Word>authenticator</Word>
            <CodeCells key={cellsKey} big onChange={setCode} invalid={wrong} />
          </Big>
        );
      }
      left = (
        <SheetLink onClick={() => go({ ...stage, recovery: !stage.recovery })}>
          {stage.recovery ? 'code' : 'recovery code'}
        </SheetLink>
      );
      break;
    case 'mail':
      body = (
        <Big>
          <Word>{login.trim()}</Word>
          <CodeCells key={cellsKey} big onChange={setCode} invalid={wrong} />
        </Big>
      );
      left = <Resend onResend={resend} startWaiting />;
      break;
    case 'scan':
      body = (
        <div className='grid grid-cols-1 items-start gap-4 sm:grid-cols-[auto_minmax(0,1fr)]'>
          {stage.url && (
            <div className='w-fit border border-borderColor bg-bgColor text-textColor'>
              <QRCodeSVG
                value={stage.url}
                size={148}
                level='M'
                marginSize={2}
                bgColor='transparent'
                fgColor='currentColor'
                aria-label='qr code'
              />
            </div>
          )}
          <Big>
            <Word>key</Word>
            <Text component='span' className='break-all font-mono tracking-[0.06em]'>
              {grouped(stage.secret)}
            </Text>
            <Word>code</Word>
            <CodeCells key={cellsKey} big autoFocus={false} onChange={setCode} invalid={wrong} />
          </Big>
        </div>
      );
      break;
    case 'save': {
      const codes = stage.codes;
      action = 'done';
      ready = true;
      body = (
        <ul className='grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] border-t border-borderColor font-mono'>
          {codes.map((c) => (
            <li key={c} className='border-b border-hairline px-1 py-1.5'>
              <Text component='span'>{c}</Text>
            </li>
          ))}
        </ul>
      );
      left = (
        <span className='flex gap-1.5'>
          <Button variant='secondary' size='lg' className='py-2' onClick={() => copy(codes)}>
            copy
          </Button>
          <Button variant='secondary' size='lg' className='py-2' onClick={() => download(codes)}>
            download
          </Button>
        </span>
      );
      break;
    }
    case 'locked':
      action = 'log in';
      ready = false;
      body = (
        <Big>
          <Wordmark>try later</Wordmark>
          <Text size='micro' variant='label' component='span' className='tabular-nums'>
            {mmss(locked)}
          </Text>
        </Big>
      );
      break;
  }

  return (
    <AuthSheet side={<StepSide stage={stage} />}>
      <SheetForm
        title={stage.k === 'code' && stage.recovery ? 'recovery code' : TITLE[stage.k]}
        note={note}
        noteTone={noteTone}
        onSubmit={submit}
      >
        <div className='py-2'>{body}</div>
        <SheetFoot left={left}>
          <SheetSubmit disabled={!ready} loading={busy}>
            {action}
          </SheetSubmit>
        </SheetFoot>
      </SheetForm>
    </AuthSheet>
  );
}
