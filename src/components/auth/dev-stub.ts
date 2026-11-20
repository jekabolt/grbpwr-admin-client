// DEV ONLY (`VITE_AUTH_STUB=1 yarn dev`): canned answers for the auth and workspace calls, so every
// sign-up / log-in screen can be driven and screenshotted before the backend implements them.
// api.ts loads this file only under `import.meta.env.DEV`; a production build drops it.

import { currentHost } from 'lib/host';

import { STUB_LOGOS } from './stub-logos';

const TOKEN = 'eyJhbGciOiJub25lIn0.eyJleHAiOjQxMDI0NDQ4MDB9.stub';
const TAKEN = new Set(['atelier-nord', 'studio', 'console', 'www', 'api', 'admin']);
const TEAMS = [
  { slug: 'ostra', name: 'ostra', role: 'owner', readOnly: false, ready: true },
  { slug: 'atelier-nord', name: 'atelier nord', role: 'member', readOnly: false, ready: true },
  { slug: 'vela', name: 'vela', role: 'member', readOnly: true, ready: true },
];
const DEFAULT_FEATURES = [
  'tasks',
  'files',
  'media',
  'models',
  'fittings',
  'materials',
  'production',
  'tech_cards',
];

const WAITING = { slug: 'linea', name: 'linea', awaitingApproval: true };

// `your teams` (mockup): own team with a logo, member teams with and without one, one waiting.
const MY_TEAMS = [
  { slug: 'ostra', name: 'ostra', role: 'owner', ready: true, logoUrl: STUB_LOGOS.ostra },
  {
    slug: 'atelier-nord',
    name: 'atelier nord',
    role: 'member',
    ready: true,
    logoUrl: STUB_LOGOS['atelier-nord'],
  },
  { slug: 'vela', name: 'vela', role: 'member', ready: true, logoUrl: '' },
  {
    slug: 'linea',
    name: 'linea',
    role: 'owner',
    awaitingApproval: true,
    logoUrl: STUB_LOGOS.linea,
  },
];
const created: Record<string, unknown>[] = [];
// a sign-up of this page load: after the code its person sees only this team, awaiting approval
let signedUp: { email: string; team: Record<string, unknown> } | null = null;

/**
 * localStorage knobs: stub.teams=empty (first time), stub.signin=google|none (default: both),
 * stub.rootToken=0 (the code answers as the old server: no token; 111111 → awaiting, else the
 * team host). Brand: a website starting with `refuse` → the server's `bad_website`.
 * stub.entry=1 → the first entry (`/welcome`); username `taken` → `username_taken`.
 */
function knob(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function terms(body: string | null): boolean {
  return !!body && (JSON.parse(body) as { termsAccepted?: boolean }).termsAccepted === true;
}

function refuse(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

function refuseBrand(body: string | null): void {
  const brand = body ? (JSON.parse(body) as { brand?: { website?: string } }).brand : undefined;
  if (brand?.website?.startsWith('refuse')) refuse(400, 'bad_website');
}

function logoUrlOf(logo: string | undefined): string {
  return logo ? `data:${logo.startsWith('/9j/') ? 'image/jpeg' : 'image/png'};base64,${logo}` : '';
}

// first entry (stub.entry=1): `/welcome` until FinishTeamEntry; the profile lives for the page load
let entryDone = false;
const myProfile = {
  firstName: 'mira',
  lastName: '',
  publicUsername: '',
  email: 'mira@ostra.studio',
  avatarUrl: '',
  passwordSet: true,
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let slowOnce = true;

export async function stubAnswer(method: string, body: string | null, path = ''): Promise<unknown> {
  const req = (body ? JSON.parse(body) : {}) as Record<string, string>;
  await wait(250);
  switch (method) {
    case 'CheckTeamSlug':
      return { available: !TAKEN.has(req.slug), suggestion: '' };
    case 'SignUp':
      if (TAKEN.has(req.teamSlug)) refuse(409, 'slug taken');
      if (!terms(body)) refuse(400, 'terms not accepted');
      refuseBrand(body);
      signedUp = {
        email: req.email,
        team: {
          slug: req.teamSlug,
          name: req.teamName,
          role: 'owner',
          awaitingApproval: true,
          logoUrl: logoUrlOf(req.logo),
        },
      };
      return {};
    case 'ResendVerification':
    case 'RequestPasswordReset':
    case 'SignOut':
      return {};
    case 'VerifyEmail':
      if (req.code === '000000' || req.token === 'expired') refuse(400, 'invalid or expired code');
      if (knob('stub.rootToken') !== '0') {
        // the new server: signed in at once, the team waits for the operator
        if (!signedUp)
          signedUp = {
            email: req.email || 'mira@fold.studio',
            team: { slug: 'fold', name: 'fold', role: 'owner', awaitingApproval: true },
          };
        return { teamSlug: signedUp.team.slug, awaitingApproval: true, rootToken: TOKEN };
      }
      // 111111 → the team waits for the operator
      if (req.code === '111111') return { teamSlug: 'linea', awaitingApproval: true };
      return { teamSlug: 'ostra', handoffCode: 'stub-code' };
    case 'SignIn':
      if (req.password === 'linen2025') refuse(401, 'wrong password');
      return {
        token: TOKEN,
        teams:
          req.target === 'SIGN_IN_TARGET_ROOT'
            ? req.login.includes('wait')
              ? [WAITING]
              : req.login.includes('one@')
                ? TEAMS.slice(0, 1)
                : [...TEAMS, WAITING]
            : [],
      };
    case 'GetSignInOptions': {
      const s = knob('stub.signin');
      return { google: s !== 'none', apple: s === '' || s === 'all' };
    }
    case 'ExchangeSignInCode':
      if (req.code === 'bad') refuse(400, 'invalid code');
      return { token: TOKEN, teams: [], enterTeamSlug: '' };
    case 'ListMyTeams': {
      if (signedUp)
        return {
          email: signedUp.email,
          teams: [signedUp.team, ...created],
          canCreateTeam: true,
          termsNeeded: false,
        };
      const first = knob('stub.teams') === 'empty';
      return {
        email: 'mira@ostra.studio',
        teams: [...(first ? [] : MY_TEAMS), ...created],
        canCreateTeam: true,
        termsNeeded: first && created.length === 0,
      };
    }
    case 'CreateTeam': {
      if (TAKEN.has(req.teamSlug) || MY_TEAMS.some((t) => t.slug === req.teamSlug))
        refuse(409, 'slug taken');
      if (req.teamSlug === 'badlogo' && req.logo) refuse(400, 'bad_logo');
      refuseBrand(body);
      const team = {
        slug: req.teamSlug,
        name: req.teamName,
        role: 'owner',
        awaitingApproval: true,
        logoUrl: logoUrlOf(req.logo),
      };
      created.push(team);
      return { team };
    }
    case 'IssueHandoff':
      return { url: '', code: 'stub-code' };
    case 'ExchangeHandoff':
      if (req.code === 'slow' && slowOnce) {
        slowOnce = false;
        refuse(503, 'team not ready');
      }
      if (req.code === 'bad') refuse(400, 'invalid code');
      return { token: TOKEN };
    case 'ResetPassword':
      if (req.code === '000000' || req.token === 'expired') refuse(400, 'invalid or expired code');
      return {};
    case 'GetInvite':
      if (req.token === 'expired') refuse(404, 'invite not found');
      return { teamName: 'ostra', email: 'mira@ostra.studio', accountExists: false };
    case 'AcceptInvite':
      if (!terms(body)) refuse(400, 'terms not accepted');
      return { teamSlug: currentHost().slug || 'ostra', handoffCode: 'stub-code' };
    case 'GetCurrentAccount': {
      const h = currentHost();
      let readOnly = false;
      try {
        readOnly = localStorage.getItem('stub.readOnly') === '1';
      } catch {
        /* none */
      }
      if (h.kind !== 'team')
        return { account: { username: 'mira', isSuper: true, permissions: [] } };
      // the workspace screen's team (brand, logo, role): stub.ws picks the scenario
      const { stubWorkspace } = await import('components/workspace/dev-stub');
      const ws = stubWorkspace(DEFAULT_FEATURES);
      return {
        account: { username: ws.you, isSuper: true, permissions: [] },
        workspace: {
          ...ws.workspace,
          slug: h.slug,
          readOnly: readOnly || ws.workspace.readOnly,
          entryNeeded: knob('stub.entry') === '1' && !entryDone,
        },
      };
    }
    case 'GetMyProfile': {
      const { profileExtras } = await import('components/managers/accounts/profile/dev-stub');
      const extra = profileExtras(myProfile);
      return { profile: { ...myProfile, ...extra } };
    }
    case 'UpdateMyProfile': {
      const u = req.publicUsername ?? '';
      if (u === 'taken') refuse(409, 'username_taken');
      if (u && !/^[a-z0-9][a-z0-9._-]{1,29}$/.test(u)) refuse(400, 'bad_username');
      Object.assign(myProfile, {
        firstName: req.firstName ?? '',
        lastName: req.lastName ?? '',
        publicUsername: u,
      });
      const { profileExtras } = await import('components/managers/accounts/profile/dev-stub');
      const extra = profileExtras(myProfile);
      return { profile: { ...myProfile, ...extra } };
    }
    case 'SetMyAvatar':
      myProfile.avatarUrl = logoUrlOf(req.avatar);
      return { avatarUrl: myProfile.avatarUrl };
    case 'FinishTeamEntry':
      entryDone = true;
      return {};
    default: {
      // team home lists (GETs: id and filters ride in the path), then workspace calls
      // (brand, people, access), then console calls (lane C2)
      const { profileStubAnswer } = await import('components/managers/accounts/profile/dev-stub');
      const profile = profileStubAnswer(method, body);
      if (profile !== undefined) return profile;
      const { homeStubAnswer } = await import('components/home/dev-stub');
      const home = homeStubAnswer(method, body, path);
      if (home !== undefined) return home;
      const { workspaceStubAnswer } = await import('components/workspace/dev-stub');
      const ws = workspaceStubAnswer(method, body);
      if (ws !== undefined) return ws;
      const { consoleStubAnswer } = await import('components/console/dev-stub');
      return consoleStubAnswer(method, body) ?? {};
    }
  }
}
