import { authService } from 'api/api';
import type { VerifyEmailResponse } from 'api/proto-http/auth';
import { goToUrl, teamUrl } from 'lib/host';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AddressField, useSlugCheck } from './address';
import {
  clearHash,
  errMessage,
  hashParam,
  isRefusal,
  rememberEmail,
  rememberedEmail,
} from './api-error';
import { CODE_LEN, CodeCells, Resend } from './code-cells';
import { isBadLogo, type PickedLogo } from './logo';
import { LogoStep } from './logo-step';
import { ProviderButtons } from './providers';
import {
  AgreeRow,
  AuthSheet,
  AwaitingApproval,
  PasswordInput,
  RootSide,
  SheetFoot,
  SheetForm,
  SheetInput,
  SheetRow,
  SheetSubmit,
  SheetValue,
} from './sheet';
import { slugify } from './slug';

/** After a confirmed sign-up the team host greets with `email confirmed`. */
export function signupHandoffUrl(slug: string, code: string): string {
  return teamUrl(slug, `/auth#code=${encodeURIComponent(code)}&from=signup`);
}

/** A confirmed sign-up either waits for the operator (the slug to show) or leaves for its team. */
function afterVerify(r: VerifyEmailResponse, fallbackSlug: string): string | null {
  if (r.awaitingApproval) return r.teamSlug || fallbackSlug;
  goToUrl(signupHandoffUrl(r.teamSlug ?? '', r.handoffCode ?? ''));
  return null;
}

/** Step one's values; `back` from the logo step finds them as they were. */
interface Draft {
  team: string;
  address: string;
  edited: boolean;
  email: string;
  password: string;
  agreed: boolean;
}

const EMPTY: Draft = {
  team: '',
  address: '',
  edited: false,
  email: '',
  password: '',
  agreed: false,
};

/** Which word a failed SignUp / CreateTeam shows (bad_logo: the square turns red instead). */
export function createError(e: unknown): string {
  return errMessage(e).includes('taken')
    ? 'address taken'
    : isRefusal(e)
      ? 'check fields'
      : 'try again';
}

export function SignUp() {
  const [step, setStep] = useState<'form' | 'logo' | 'code'>('form');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [slug, setSlug] = useState('');
  const [logo, setLogo] = useState<PickedLogo | null>(null);
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState<'create' | 'skip' | null>(null);
  const [error, setError] = useState('');

  const send = async (withLogo: boolean) => {
    if (busy) return;
    setBusy(withLogo ? 'create' : 'skip');
    setError('');
    try {
      await authService.SignUp({
        email: draft.email.trim(),
        password: draft.password,
        teamName: draft.team.trim(),
        teamSlug: slug,
        termsAccepted: true,
        logo: withLogo ? logo?.base64 : undefined,
        brand: undefined,
        name: undefined,
      });
      rememberEmail(draft.email.trim());
      setStep('code');
    } catch (e) {
      if (isBadLogo(errMessage(e))) setBad(true);
      else setError(createError(e));
    } finally {
      setBusy(null);
    }
  };

  if (step === 'code')
    return (
      <ConfirmCode
        email={draft.email}
        slug={slug}
        onChangeEmail={() => {
          setError('');
          setStep('form');
        }}
      />
    );
  if (step === 'logo')
    return (
      <AuthSheet side={<RootSide mode='signup' />}>
        <LogoStep
          title='sign up'
          team={draft.team.trim().toLowerCase()}
          primary='create team'
          logo={logo}
          onLogo={setLogo}
          bad={bad}
          onBad={setBad}
          busy={busy}
          note={error}
          onBack={() => {
            setError('');
            setStep('form');
          }}
          onSend={(withLogo) => void send(withLogo)}
        />
      </AuthSheet>
    );
  return (
    <SignUpForm
      draft={draft}
      onDraft={setDraft}
      note={error}
      onNext={(s) => {
        setSlug(s);
        setError('');
        setStep('logo');
      }}
    />
  );
}

function SignUpForm({
  draft,
  onDraft,
  note,
  onNext,
}: {
  draft: Draft;
  onDraft: (d: Draft) => void;
  note: string;
  onNext: (slug: string) => void;
}) {
  const { team, email, password, agreed } = draft;
  const set = (patch: Partial<Draft>) => onDraft({ ...draft, ...patch });
  const slug = draft.edited ? draft.address : slugify(team);
  const check = useSlugCheck(slug, team.trim());
  const ready =
    check.status === 'free' &&
    /.+@.+\..+/.test(email.trim()) &&
    password.length >= 8 &&
    !!team.trim() &&
    agreed;

  return (
    <AuthSheet side={<RootSide mode='signup' />}>
      <SheetForm title='sign up' note={note} onSubmit={() => ready && onNext(slug)}>
        <ProviderButtons fields={() => ({ target: 'signin' })} />
        <SheetRow label='team'>
          <SheetInput
            name='team'
            value={team}
            placeholder='ostra'
            autoComplete='organization'
            autoFocus
            invalid={!draft.edited && check.status === 'bad'}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ team: e.target.value })}
          />
        </SheetRow>
        <SheetRow label='address'>
          <AddressField check={check} onChange={(v) => set({ address: v, edited: true })} />
        </SheetRow>
        <SheetRow label='email'>
          <SheetInput
            type='email'
            name='email'
            value={email}
            placeholder='you@studio.com'
            autoComplete='email'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ email: e.target.value })}
          />
        </SheetRow>
        <SheetRow label='password'>
          <PasswordInput
            value={password}
            onChange={(v) => set({ password: v })}
            placeholder='8+ characters'
            autoComplete='new-password'
          />
        </SheetRow>
        <AgreeRow checked={agreed} onChange={(v) => set({ agreed: v })} />
        <SheetFoot>
          <SheetSubmit disabled={!ready}>continue</SheetSubmit>
        </SheetFoot>
      </SheetForm>
    </AuthSheet>
  );
}

function ConfirmCode({
  email,
  slug = '',
  onChangeEmail,
}: {
  email: string;
  slug?: string;
  onChangeEmail: () => void;
}) {
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);

  const verify = async (code: string) => {
    if (code.length < CODE_LEN || busy) return;
    setBusy(true);
    try {
      const r = await authService.VerifyEmail({ token: '', email: email.trim(), code });
      setAwaiting(afterVerify(r, slug));
    } catch {
      setWrong(true);
      setRound((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  if (awaiting !== null) return <AwaitingApproval slug={awaiting} />;
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
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const [email, setEmail] = useState(rememberedEmail);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    clearHash();
    if (!token) return;
    let live = true;
    authService
      .VerifyEmail({ token, email: '', code: '' })
      .then((r) => live && setAwaiting(afterVerify(r, '')))
      .catch(() => live && setState('expired'));
    return () => {
      live = false;
    };
  }, [token]);

  if (awaiting !== null) return <AwaitingApproval slug={awaiting} />;
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
