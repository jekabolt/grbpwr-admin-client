import { authService, authServiceWith } from 'api/api';
import { writeAuthToken } from 'api/auth-headers';
import { goToUrl } from 'lib/host';
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
  AccountSide,
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
import { useSignupProof } from './signup-proof';
import { slugify } from './slug';
import { useBrandDraft } from './use-brand-draft';
import { afterVerify } from './verify';

/**
 * A confirmed email: signed in → `teams`; an old server → the waiting address (returned) or the
 * team host.
 */
function useAfterVerify(onSignedIn: () => void) {
  return (r: Parameters<typeof afterVerify>[0], fallbackSlug: string): string | null => {
    const next = afterVerify(r, fallbackSlug);
    if (next.kind === 'signed-in') {
      writeAuthToken(next.token);
      onSignedIn();
      return null;
    }
    if (next.kind === 'awaiting') return next.slug;
    goToUrl(next.url);
    return null;
  };
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

export function SignUp({ onSignedIn }: { onSignedIn: () => void }) {
  const [step, setStep] = useState<'form' | 'logo' | 'code'>('form');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [slug, setSlug] = useState('');
  const [logo, setLogo] = useState<PickedLogo | null>(null);
  const [bad, setBad] = useState(false);
  const brand = useBrandDraft();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const proof = useSignupProof();

  const send = async () => {
    if (busy) return;
    setError('');
    if (!brand.check()) {
      setError('check fields');
      return;
    }
    setBusy(true);
    const req = {
      email: draft.email.trim(),
      password: draft.password,
      teamName: draft.team.trim(),
      teamSlug: slug,
      termsAccepted: true,
      logo: logo?.base64,
      brand: brand.payload(),
      name: undefined,
    };
    try {
      try {
        await authServiceWith(await proof.take()).SignUp(req);
      } catch (e) {
        // A stale or spent answer: one more try with a fresh one.
        if (!errMessage(e).includes('bot_check')) throw e;
        await authServiceWith(await proof.take(true)).SignUp(req);
      }
      rememberEmail(draft.email.trim());
      setStep('code');
    } catch (e) {
      proof.again();
      const msg = errMessage(e);
      if (isBadLogo(msg)) setBad(true);
      else setError(brand.refused(msg) ? 'check fields' : createError(e));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'code')
    return (
      <ConfirmCode
        email={draft.email}
        slug={slug}
        onSignedIn={onSignedIn}
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
          logo={logo}
          onLogo={setLogo}
          bad={bad}
          onBad={setBad}
          brand={brand.brand}
          onBrand={brand.set}
          invalid={brand.invalid}
          busy={busy}
          note={error}
          onBack={() => {
            setError('');
            setStep('form');
          }}
          onSend={() => void send()}
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
        brand.prefill(draft.team.trim());
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
        <SheetRow label='team name'>
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
        <SheetFoot left={<AgreeRow checked={agreed} onChange={(v) => set({ agreed: v })} />}>
          <SheetSubmit disabled={!ready}>continue</SheetSubmit>
        </SheetFoot>
      </SheetForm>
    </AuthSheet>
  );
}

function ConfirmCode({
  email,
  slug = '',
  onSignedIn,
  onChangeEmail,
}: {
  email: string;
  slug?: string;
  onSignedIn: () => void;
  onChangeEmail: () => void;
}) {
  const next = useAfterVerify(onSignedIn);
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);

  const verify = async (code: string) => {
    if (code.length < CODE_LEN || busy) return;
    setBusy(true);
    try {
      const r = await authService.VerifyEmail({ token: '', email: email.trim(), code });
      setAwaiting(next(r, slug));
    } catch {
      setWrong(true);
      setRound((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  if (awaiting !== null) return <AwaitingApproval slug={awaiting} email={email} />;
  return (
    <AuthSheet side={<AccountSide email={email.trim()} />}>
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
export function ConfirmLink({ onSignedIn }: { onSignedIn: () => void }) {
  const navigate = useNavigate();
  const next = useAfterVerify(onSignedIn);
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
      .then((r) => live && setAwaiting(next(r, '')))
      .catch(() => live && setState('expired'));
    return () => {
      live = false;
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (awaiting !== null) return <AwaitingApproval slug={awaiting} email={rememberedEmail()} />;
  if (state === 'code')
    return (
      <ConfirmCode
        email={email}
        onSignedIn={onSignedIn}
        onChangeEmail={() => navigate('/', { replace: true })}
      />
    );

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
