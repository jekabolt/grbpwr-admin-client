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

/** localStorage knobs: stub.teams=empty (first time), stub.signin=google|none (default: both). */
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let slowOnce = true;

export async function stubAnswer(method: string, body: string | null): Promise<unknown> {
  const req = (body ? JSON.parse(body) : {}) as Record<string, string>;
  await wait(250);
  switch (method) {
    case 'CheckTeamSlug':
      return { available: !TAKEN.has(req.slug), suggestion: '' };
    case 'SignUp':
      if (TAKEN.has(req.teamSlug)) refuse(409, 'slug taken');
      if (!terms(body)) refuse(400, 'terms not accepted');
      return {};
    case 'ResendVerification':
    case 'RequestPasswordReset':
    case 'SignOut':
      return {};
    case 'VerifyEmail':
      if (req.code === '000000' || req.token === 'expired') refuse(400, 'invalid or expired code');
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
      const team = {
        slug: req.teamSlug,
        name: req.teamName,
        role: 'owner',
        awaitingApproval: true,
        logoUrl: req.logo
          ? `data:${req.logo.startsWith('/9j/') ? 'image/jpeg' : 'image/png'};base64,${req.logo}`
          : '',
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
      return {
        account: { username: 'mira', isSuper: true, permissions: [] },
        workspace:
          h.kind === 'team'
            ? { slug: h.slug, name: h.slug, role: 'owner', features: DEFAULT_FEATURES, readOnly }
            : undefined,
      };
    }
    default: {
      // console and people calls (lane C2)
      const { consoleStubAnswer } = await import('components/console/dev-stub');
      return consoleStubAnswer(method, body) ?? {};
    }
  }
}
