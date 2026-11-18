import { authService } from 'api/api';
import { goToUrl, teamUrl } from 'lib/host';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Text } from 'ui';

import {
  clearHash,
  errMessage,
  hashParam,
  isRefusal,
  rememberEmail,
  rememberedEmail,
} from './api-error';
import { CODE_LEN, CodeCells, Resend } from './code-cells';
import {
  AuthSheet,
  baseSuffix,
  PasswordInput,
  RootSide,
  SheetFoot,
  SheetForm,
  SheetInput,
  SheetRow,
  SheetSubmit,
  SheetValue,
} from './sheet';
import { checkSlug, type SlugCheck, slugify } from './slug';

const DEBOUNCE_MS = 300;

/** After a confirmed sign-up the team host greets with `email confirmed`. */
export function signupHandoffUrl(slug: string, code: string): string {
  return teamUrl(slug, `/auth#code=${encodeURIComponent(code)}&from=signup`);
}

function useSlugCheck(slug: string, name: string): SlugCheck {
  const local = checkSlug(slug);
  const [remote, setRemote] = useState<{ slug: string; available: boolean } | null>(null);
  const ask = local.status === 'free';

  useEffect(() => {
    if (!ask) return;
    let live = true;
    const t = setTimeout(() => {
      authService
        .CheckTeamSlug({ slug, name })
        .then((r) => live && setRemote({ slug, available: !!r.available }))
        .catch(() => live && setRemote(null));
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [ask, slug, name]);

  if (!ask) return local;
  if (!remote || remote.slug !== slug) return { slug, status: 'checking', word: '' };
  return remote.available
    ? { slug, status: 'free', word: 'free' }
    : { slug, status: 'taken', word: 'taken' };
}

export function SignUp() {
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [email, setEmail] = useState('');

  if (step === 'code') return <ConfirmCode email={email} onChangeEmail={() => setStep('form')} />;
  return (
    <SignUpForm
      email={email}
      onEmail={setEmail}
      onSent={() => {
        rememberEmail(email.trim());
        setStep('code');
      }}
    />
  );
}

function SignUpForm({
  email,
  onEmail,
  onSent,
}: {
  email: string;
  onEmail: (v: string) => void;
  onSent: () => void;
}) {
  const [team, setTeam] = useState('');
  const [address, setAddress] = useState('');
  const edited = useRef(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const slug = edited.current ? address : slugify(team);
  const check = useSlugCheck(slug, team.trim());
  const bad = check.status === 'bad' || check.status === 'taken';
  const ready =
    check.status === 'free' &&
    /.+@.+\..+/.test(email.trim()) &&
    password.length >= 8 &&
    !!team.trim();

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      await authService.SignUp({
        email: email.trim(),
        password,
        teamName: team.trim(),
        teamSlug: slug,
      });
      onSent();
    } catch (e) {
      setError(
        errMessage(e).includes('taken')
          ? 'address taken'
          : isRefusal(e)
            ? 'check fields'
            : 'try again',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthSheet side={<RootSide mode='signup' />}>
      <SheetForm title='sign up' note={error} onSubmit={submit}>
        <SheetRow label='team'>
          <SheetInput
            name='team'
            value={team}
            placeholder='ostra'
            autoComplete='organization'
            autoFocus
            invalid={!edited.current && check.status === 'bad'}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTeam(e.target.value)}
          />
        </SheetRow>
        <SheetRow label='address'>
          <div className='flex min-w-0 items-center gap-2'>
            <div className='flex min-w-0 flex-1 items-center'>
              <SheetInput
                name='address'
                value={slug}
                placeholder='your-team'
                autoComplete='off'
                aria-label='address'
                invalid={bad}
                className='min-w-0 flex-1 font-bold'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  edited.current = true;
                  setAddress(e.target.value.toLowerCase());
                }}
              />
              <Text component='span' variant='label' className='shrink-0 pl-1'>
                {baseSuffix()}
              </Text>
            </div>
            <Text
              component='span'
              size='micro'
              className={
                check.status === 'free'
                  ? 'shrink-0 text-success'
                  : bad
                    ? 'shrink-0 text-error'
                    : 'shrink-0 text-labelColor'
              }
            >
              {check.word}
            </Text>
          </div>
        </SheetRow>
        <SheetRow label='email'>
          <SheetInput
            type='email'
            name='email'
            value={email}
            placeholder='you@studio.com'
            autoComplete='email'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onEmail(e.target.value)}
          />
        </SheetRow>
        <SheetRow label='password'>
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder='8+ characters'
            autoComplete='new-password'
          />
        </SheetRow>
        <SheetFoot>
          <SheetSubmit disabled={!ready} loading={busy}>
            create team
          </SheetSubmit>
        </SheetFoot>
      </SheetForm>
    </AuthSheet>
  );
}

function ConfirmCode({ email, onChangeEmail }: { email: string; onChangeEmail: () => void }) {
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);

  const verify = async (code: string) => {
    if (code.length < CODE_LEN || busy) return;
    setBusy(true);
    try {
      const r = await authService.VerifyEmail({ token: '', email: email.trim(), code });
      goToUrl(signupHandoffUrl(r.teamSlug ?? '', r.handoffCode ?? ''));
    } catch {
      setWrong(true);
      setRound((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthSheet side={<RootSide mode='signup' />}>
      <SheetForm title='confirm email' note={wrong ? 'wrong code' : undefined}>
        <SheetRow label='sent to'>
          <SheetValue onChange={onChangeEmail}>{email}</SheetValue>
        </SheetRow>
        <SheetRow label='code'>
          <CodeCells
            key={round}
            invalid={wrong}
            onChange={(c) => {
              if (c.length < CODE_LEN) return;
              setWrong(false);
              void verify(c);
            }}
          />
        </SheetRow>
        <SheetFoot left={<Resend onResend={() => authService.ResendVerification({ email })} />}>
          <span />
        </SheetFoot>
      </SheetForm>
    </AuthSheet>
  );
}

/** `/confirm#token=…`: the link in the letter. Good → the team host; bad → `link expired`. */
export function ConfirmLink() {
  const navigate = useNavigate();
  const [token] = useState(() => hashParam('token'));
  const [state, setState] = useState<'checking' | 'expired' | 'code'>(
    token ? 'checking' : 'expired',
  );
  const [email, setEmail] = useState(rememberedEmail);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    clearHash();
    if (!token) return;
    let live = true;
    authService
      .VerifyEmail({ token, email: '', code: '' })
      .then((r) => live && goToUrl(signupHandoffUrl(r.teamSlug ?? '', r.handoffCode ?? '')))
      .catch(() => live && setState('expired'));
    return () => {
      live = false;
    };
  }, [token]);

  if (state === 'code')
    return <ConfirmCode email={email} onChangeEmail={() => navigate('/', { replace: true })} />;

  const known = rememberedEmail();
  const resend = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      await authService.ResendVerification({ email: email.trim() });
      rememberEmail(email.trim());
      setState('code');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthSheet side={<RootSide mode='signup' />}>
      <SheetForm
        title='confirm email'
        note={state === 'expired' ? 'link expired' : undefined}
        onSubmit={resend}
      >
        <SheetRow label='email'>
          {known ? (
            <SheetValue>{known}</SheetValue>
          ) : (
            <SheetInput
              type='email'
              name='email'
              value={email}
              placeholder='you@studio.com'
              autoComplete='email'
              disabled={state === 'checking'}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            />
          )}
        </SheetRow>
        <SheetFoot>
          <SheetSubmit
            disabled={state === 'checking' || !email.trim()}
            loading={busy || state === 'checking'}
          >
            send new code
          </SheetSubmit>
        </SheetFoot>
      </SheetForm>
    </AuthSheet>
  );
}
