import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authService } from 'api/api';
import { writeAuthToken } from 'api/auth-headers';
import type { ListMyTeamsResponse, TeamRef } from 'api/proto-http/auth';
import { goToUrl, teamUrl } from 'lib/host';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Loader, Text } from 'ui';

import { AddressField, useSlugCheck } from './address';
import { clearHash, errMessage, errStatus } from './api-error';
import { isBadLogo, type PickedLogo } from './logo';
import { LogoStep, TeamMark } from './logo-step';
import { oauthErrorWord, parseOAuthFragment } from './oauth';
import {
  AgreeRow,
  AuthSheet,
  RootSide,
  SheetFoot,
  SheetForm,
  SheetInput,
  SheetLink,
  SheetRow,
  SheetSubmit,
  TeamSide,
} from './sheet';
import { createError } from './signup';
import { slugify } from './slug';

// The signed-in root (mockup `teams`, `teams-first`, `new-team*`): the person's own teams, each
// opened through the hand-off; `new team`; `log out`. The root token stays (30 days, spec O §5).

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

function AccountSide({ email }: { email: string }) {
  return <TeamSide name='lekalo' sub={email} />;
}

/** One team: its mark, name, and role — or `awaiting approval`, not openable. */
function TeamRow({
  team,
  reserve,
  busy,
  onOpen,
}: {
  team: TeamRef;
  reserve: boolean;
  busy: boolean;
  onOpen: () => void;
}) {
  const name = (
    <span className='flex min-w-0 items-center gap-2.5'>
      {(reserve || team.logoUrl) && <TeamMark src={team.logoUrl} />}
      <span
        className={cn(
          'min-w-0 break-words',
          team.awaitingApproval
            ? 'text-labelColor'
            : 'underline-offset-2 group-hover:underline group-disabled:no-underline',
        )}
      >
        {team.name || team.slug}
      </span>
    </span>
  );
  const row =
    'flex min-h-10 w-full items-center justify-between gap-3 border-t border-hairline py-2.5 text-left first:border-t-0 max-sm:min-h-11 max-sm:py-3';
  const tag = (word: string) => (
    <Text size='micro' variant='label' tracking='label' component='span' className='flex-none'>
      {word}
    </Text>
  );
  if (team.awaitingApproval)
    return (
      <div className={row} aria-disabled='true'>
        {name}
        {tag('awaiting approval')}
      </div>
    );
  return (
    <Button className={cn(row, 'group')} disabled={busy} onClick={onOpen}>
      {name}
      {tag(team.role || '')}
    </Button>
  );
}

export function MyTeams({ session }: { session: RootSession }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ended = useRootErrors(session);
  const { data, isPending } = useMyTeams(session);
  const [opening, setOpening] = useState('');
  const [note, setNote] = useState('');
  const teams = data?.teams ?? [];
  const reserve = teams.some((t) => !!t.logoUrl);

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

  const logOut = async () => {
    await authService.SignOut({}).catch(() => undefined);
    queryClient.removeQueries({ queryKey: MY_TEAMS_KEY });
    session.out('/');
  };

  return (
    <AuthSheet side={<AccountSide email={data?.email ?? ''} />}>
      <SheetForm title='teams' note={note}>
        {isPending ? (
          <div className='flex justify-center py-6'>
            <Loader />
          </div>
        ) : (
          <div className='flex flex-col'>
            {teams.map((t) => (
              <TeamRow
                key={t.slug}
                team={t}
                reserve={reserve}
                busy={!!opening}
                onOpen={() => void open(t.slug ?? '')}
              />
            ))}
            <Button
              className='group flex min-h-10 w-full items-center gap-2.5 border-t border-hairline py-2.5 text-left first:border-t-0 max-sm:min-h-11 max-sm:py-3'
              onClick={() => navigate('/new')}
            >
              {reserve && <TeamMark />}
              <span className='text-labelColor underline underline-offset-2 group-hover:text-textColor'>
                new team
              </span>
            </Button>
          </div>
        )}
        <SheetFoot left={<SheetLink onClick={() => void logOut()}>log out</SheetLink>}>
          <span />
        </SheetFoot>
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

/** `new team`: name + address (+ terms while the server needs them) → the logo step → CreateTeam. */
export function NewTeam({ session }: { session: RootSession }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ended = useRootErrors(session);
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
  const [busy, setBusy] = useState<'create' | 'skip' | null>(null);
  const [error, setError] = useState('');
  const termsNeeded = !!data?.termsNeeded;
  const slug = draft.edited ? draft.address : slugify(draft.team);
  const check = useSlugCheck(slug, draft.team.trim());
  const set = (patch: Partial<NewDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const ready =
    check.status === 'free' && !!draft.team.trim() && (!termsNeeded || draft.agreed) && !!data;

  const send = async (withLogo: boolean) => {
    if (busy) return;
    setBusy(withLogo ? 'create' : 'skip');
    setError('');
    try {
      const r = await authService.CreateTeam({
        teamName: draft.team.trim(),
        teamSlug: slug,
        termsAccepted: termsNeeded ? draft.agreed : undefined,
        logo: withLogo ? logo?.base64 : undefined,
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
      setBusy(null);
      if (ended(e)) return;
      if (isBadLogo(errMessage(e))) setBad(true);
      else setError(createError(e));
    }
  };

  const side = <AccountSide email={data?.email ?? ''} />;

  if (step === 'logo')
    return (
      <AuthSheet side={side}>
        <LogoStep
          title='new team'
          team={draft.team.trim().toLowerCase()}
          primary='create'
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
    <AuthSheet side={side}>
      <SheetForm
        title='new team'
        note={error}
        onSubmit={() => {
          if (!ready) return;
          setError('');
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
        {termsNeeded && <AgreeRow checked={draft.agreed} onChange={(v) => set({ agreed: v })} />}
        <SheetFoot left={<SheetLink onClick={() => navigate('/')}>cancel</SheetLink>}>
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
