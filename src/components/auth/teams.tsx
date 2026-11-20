import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authService } from 'api/api';
import { writeAuthToken } from 'api/auth-headers';
import type { ListMyTeamsResponse, TeamRef } from 'api/proto-http/auth';
import { goToUrl, teamUrl } from 'lib/host';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AddDoor, Loader, Text, Tile, Tiles } from 'ui';

import { AddressField, useSlugCheck } from './address';
import { clearHash, errMessage, errStatus } from './api-error';
import { isBadLogo, type PickedLogo } from './logo';
import { LogoStep, TeamMark } from './logo-step';
import { oauthErrorWord, parseOAuthFragment } from './oauth';
import {
  AccountSide,
  AgreeRow,
  AuthSheet,
  RootSide,
  SheetFoot,
  SheetForm,
  SheetInput,
  SheetLink,
  SheetRow,
  SheetSubmit,
} from './sheet';
import { createError } from './signup';
import { slugify } from './slug';
import { useBrandDraft } from './use-brand-draft';

// The signed-in root (fix mockup `teams · tiles`, `no team yet · list`, `new team · fixed`): the
// person's teams as tiles, each opened through the hand-off; the `new team` door; `log out` in
// the side. The root token stays (30 days, spec O §5).

export const MY_TEAMS_KEY = ['auth', 'my-teams'] as const;

/** What a signed-in root page does when its token is gone: `log in` again. */
export interface RootSession {
  /** Sign out locally (token cleared); `to` is where to land. */
  out: (to: '/' | '/login') => void;
}

/** A 401 from any root call ends the session. */
function useRootErrors(session: RootSession) {
  return (e: unknown): boolean => {
    if (errStatus(e) !== 401) return false;
    session.out('/login');
    return true;
  };
}

function useMyTeams(session: RootSession) {
  const ended = useRootErrors(session);
  const q = useQuery({
    queryKey: MY_TEAMS_KEY,
    queryFn: () => authService.ListMyTeams({}),
    retry: false,
    staleTime: 0,
  });
  useEffect(() => {
    if (q.error) ended(q.error);
  }, [q.error]); // eslint-disable-line react-hooks/exhaustive-deps
  return q;
}

function useLogOut(session: RootSession) {
  const queryClient = useQueryClient();
  return async () => {
    await authService.SignOut({ device: undefined }).catch(() => undefined);
    queryClient.removeQueries({ queryKey: MY_TEAMS_KEY });
    session.out('/');
  };
}

/** One team: its square, name, and role — or `awaiting approval`, greyed and not openable. */
function TeamTile({ team, busy, onOpen }: { team: TeamRef; busy: boolean; onOpen: () => void }) {
  const name = team.name || team.slug || '';
  const media = <TeamMark src={team.logoUrl || undefined} size='tile' />;
  if (team.awaitingApproval)
    return (
      <Tile
        lowercase
        media={media}
        name={
          <Text variant='label' component='span' className='block truncate'>
            {name}
          </Text>
        }
        sub='awaiting approval'
        title={name}
      />
    );
  return (
    <Tile
      lowercase
      media={media}
      name={name}
      sub={team.role || undefined}
      title={name}
      onClick={busy ? undefined : onOpen}
    />
  );
}

export function MyTeams({ session }: { session: RootSession }) {
  const navigate = useNavigate();
  const ended = useRootErrors(session);
  const logOut = useLogOut(session);
  const { data, isPending } = useMyTeams(session);
  const [opening, setOpening] = useState('');
  const [note, setNote] = useState('');
  const teams = data?.teams ?? [];

  const open = async (slug: string) => {
    if (opening) return;
    setOpening(slug);
    setNote('');
    try {
      const r = await authService.IssueHandoff({ teamSlug: slug });
      goToUrl(
        r.code ? teamUrl(slug, `/auth#code=${encodeURIComponent(r.code)}`) : r.url || teamUrl(slug),
      );
    } catch (e) {
      setOpening('');
      if (!ended(e)) setNote('try again');
    }
  };

  return (
    <AuthSheet side={<AccountSide email={data?.email ?? ''} onLogOut={() => void logOut()} />}>
      <SheetForm title='teams' note={note}>
        {isPending ? (
          <div className='flex justify-center py-6'>
            <Loader />
          </div>
        ) : teams.length === 0 ? (
          <SheetFoot>
            <SheetSubmit onClick={() => navigate('/new')}>new team</SheetSubmit>
          </SheetFoot>
        ) : (
          <Tiles min={100} className='auto-rows-fr'>
            {teams.map((t) => (
              <TeamTile
                key={t.slug}
                team={t}
                busy={!!opening}
                onOpen={() => void open(t.slug ?? '')}
              />
            ))}
            <AddDoor shape='tile' lowercase className='h-full' onClick={() => navigate('/new')}>
              new team
            </AddDoor>
          </Tiles>
        )}
      </SheetForm>
    </AuthSheet>
  );
}

interface NewDraft {
  team: string;
  address: string;
  edited: boolean;
  agreed: boolean;
}

/**
 * `new team`: name + address (+ terms while the server needs them) → the logo step with the brand
 * fields → one CreateTeam.
 */
export function NewTeam({ session }: { session: RootSession }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ended = useRootErrors(session);
  const logOut = useLogOut(session);
  const { data } = useMyTeams(session);
  const [step, setStep] = useState<'form' | 'logo'>('form');
  const [draft, setDraft] = useState<NewDraft>({
    team: '',
    address: '',
    edited: false,
    agreed: false,
  });
  const [logo, setLogo] = useState<PickedLogo | null>(null);
  const [bad, setBad] = useState(false);
  const brand = useBrandDraft();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const termsNeeded = !!data?.termsNeeded;
  const first = !!data && (data.teams ?? []).length === 0;
  const slug = draft.edited ? draft.address : slugify(draft.team);
  const check = useSlugCheck(slug, draft.team.trim());
  const set = (patch: Partial<NewDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const ready =
    check.status === 'free' && !!draft.team.trim() && (!termsNeeded || draft.agreed) && !!data;

  const send = async () => {
    if (busy) return;
    setError('');
    if (!brand.check()) {
      setError('check fields');
      return;
    }
    setBusy(true);
    try {
      const r = await authService.CreateTeam({
        teamName: draft.team.trim(),
        teamSlug: slug,
        termsAccepted: termsNeeded ? draft.agreed : undefined,
        logo: logo?.base64,
        brand: brand.payload(),
      });
      const team = r.team;
      if (team) {
        queryClient.setQueryData<ListMyTeamsResponse>(MY_TEAMS_KEY, (prev) =>
          prev
            ? {
                ...prev,
                termsNeeded: false,
                teams: [...(prev.teams ?? []).filter((t) => t.slug !== team.slug), team],
              }
            : prev,
        );
      }
      void queryClient.invalidateQueries({ queryKey: MY_TEAMS_KEY });
      navigate('/', { replace: true });
    } catch (e) {
      setBusy(false);
      if (ended(e)) return;
      const msg = errMessage(e);
      if (isBadLogo(msg)) setBad(true);
      else setError(brand.refused(msg) ? 'check fields' : createError(e));
    }
  };

  if (step === 'logo')
    return (
      <AuthSheet
        side={
          <AccountSide
            email={data?.email ?? ''}
            onLogOut={first ? () => void logOut() : undefined}
          />
        }
      >
        <LogoStep
          title='new team'
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
    <AuthSheet side={<AccountSide email={data?.email ?? ''} />}>
      <SheetForm
        title='new team'
        note={error}
        onSubmit={() => {
          if (!ready) return;
          setError('');
          brand.prefill(draft.team.trim());
          setStep('logo');
        }}
      >
        <SheetRow label='team name'>
          <SheetInput
            name='team'
            value={draft.team}
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
        <SheetFoot
          left={
            termsNeeded ? (
              <AgreeRow checked={draft.agreed} onChange={(v) => set({ agreed: v })} />
            ) : (
              <SheetLink onClick={() => navigate('/')}>cancel</SheetLink>
            )
          }
        >
          <SheetSubmit disabled={!ready}>continue</SheetSubmit>
        </SheetFoot>
      </SheetForm>
    </AuthSheet>
  );
}

type Exchanged =
  | { kind: 'list' }
  | { kind: 'enter'; url: string }
  | { kind: 'error'; note: string };

/** The code is single use: one exchange per page load, whatever React re-runs. */
let exchange: Promise<Exchanged> | null = null;

async function exchangeOnce(back: ReturnType<typeof parseOAuthFragment>): Promise<Exchanged> {
  if (!back) return { kind: 'error', note: 'link expired' };
  if (!('code' in back)) return { kind: 'error', note: oauthErrorWord(back.error) };
  try {
    const r = await authService.ExchangeSignInCode({ code: back.code });
    if (!r.token) return { kind: 'error', note: 'link expired' };
    writeAuthToken(r.token);
    const enter = r.enterTeamSlug;
    if (!enter) return { kind: 'list' };
    // an invite accepted with a provider: straight into that team
    const h = await authService.IssueHandoff({ teamSlug: enter });
    return {
      kind: 'enter',
      url: h.code
        ? teamUrl(enter, `/auth#code=${encodeURIComponent(h.code)}`)
        : h.url || teamUrl(enter),
    };
  } catch {
    return { kind: 'error', note: 'link expired' };
  }
}

/**
 * `/auth/oauth#code=…` or `#error=<key>`: the one page every provider sign-in returns to. The
 * fragment is read once and wiped from the address bar at once.
 */
export function OAuthReturn({ onSignedIn }: { onSignedIn: () => void }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!exchange) {
      const back = parseOAuthFragment(window.location.hash);
      clearHash();
      exchange = exchangeOnce(back);
    }
    let live = true;
    void exchange.then((r) => {
      if (!live) return;
      exchange = null;
      if (r.kind === 'enter') goToUrl(r.url);
      else if (r.kind === 'list') onSignedIn();
      else navigate('/login', { replace: true, state: { note: r.note } });
    });
    return () => {
      live = false;
    };
  }, [navigate, onSignedIn]);

  return (
    <AuthSheet side={<RootSide mode='login' />}>
      <SheetForm title='log in'>
        <div className='flex justify-center py-6'>
          <Loader />
        </div>
      </SheetForm>
    </AuthSheet>
  );
}
