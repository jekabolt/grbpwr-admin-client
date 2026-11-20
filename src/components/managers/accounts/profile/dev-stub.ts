// DEV ONLY (`VITE_AUTH_STUB=1 yarn dev`): the profile calls the server does not answer yet
// (password, Google, sessions, delete). components/auth/dev-stub.ts owns the profile itself and
// merges `profileExtras` into it. Knob `stub.profile`: `full` (the mockup's filled profile; '' keeps the
// auth stub's names), `empty` (a fresh account, one device), `sole` (delete blocked), `gonly` (Google only).

function knob(): string {
  try {
    return localStorage.getItem('stub.profile') ?? '';
  } catch {
    return '';
  }
}

const HOUR = 3_600_000;
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();

const PHOTO =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#d9d4cc"/><rect y="78" width="120" height="42" fill="#bfb6aa"/><circle cx="60" cy="50" r="22" fill="#8a7c6c"/><path d="M22 120c4-26 20-38 38-38s34 12 38 38z" fill="#2f2a26"/><path d="M38 46c0-16 10-26 22-26s22 10 22 26c-4-8-12-12-22-12s-18 4-22 12z" fill="#2f2a26"/></svg>',
  );

let seeded = false;
let state: {
  passwordSet: boolean;
  passwordChangedAt: string;
  googleEmail: string;
  sessions: Record<string, unknown>[];
} | null = null;

function st() {
  if (state) return state;
  const k = knob();
  const all = [
    {
      key: 'a1',
      browser: 'chrome',
      os: 'macos',
      ip: '81.2.69.142',
      lastSeenAt: ago(0),
      thisDevice: true,
    },
    { key: 'b2', browser: 'safari', os: 'ios', ip: '81.2.69.160', lastSeenAt: ago(2) },
    { key: 'c3', browser: 'chrome', os: 'windows', ip: '194.12.40.7', lastSeenAt: ago(30) },
    { key: 'd4', browser: 'firefox', os: 'linux', ip: '62.4.18.201', lastSeenAt: ago(72) },
    { key: 'e5', browser: 'edge', os: 'windows', ip: '185.6.33.90', lastSeenAt: ago(14 * 24) },
  ];
  state = {
    passwordSet: k !== 'gonly',
    passwordChangedAt: ago(24 * 95),
    googleEmail:
      k === 'empty' ? '' : k === 'gonly' ? 'nika@mono.example' : 'mira.kolesnikova@gmail.com',
    sessions: k === 'empty' ? all.slice(0, 1) : all,
  };
  return state;
}

/** Seeds the mockup's names once, then the fields the server adds (password, Google, teams). */
export function profileExtras(base: Record<string, unknown>): Record<string, unknown> {
  const k = knob();
  if (!seeded && k && k !== 'empty') {
    seeded = true;
    Object.assign(base, {
      firstName: 'mira',
      lastName: 'kolesnikova',
      publicUsername: 'mira.k',
      email: 'mira.kolesnikova@ostra-studio.example',
      avatarUrl: PHOTO,
    });
  }
  const s = st();
  return {
    passwordSet: s.passwordSet,
    passwordChangedAt: s.passwordSet ? s.passwordChangedAt : undefined,
    googleEmail: s.googleEmail,
    soleOwnerTeams:
      k === 'sole'
        ? [
            { slug: 'ostra', name: 'ostra', role: 'owner' },
            { slug: 'ostra-archive', name: 'ostra archive', role: 'owner' },
          ]
        : [],
    closingTeams: k === 'sole' ? [] : [{ slug: 'mira-lab', name: 'mira lab', role: 'owner' }],
  };
}

export function profileStubAnswer(method: string, body: string | null): unknown {
  const req = (body ? JSON.parse(body) : {}) as Record<string, unknown>;
  const s = st();
  switch (method) {
    case 'ChangeMyPassword':
      if (s.passwordSet && req.currentPassword === 'wrong') {
        throw Object.assign(new Error('wrong_password'), { status: 400 });
      }
      if (String(req.newPassword ?? '').length < 8) {
        throw Object.assign(new Error('weak_password'), { status: 400 });
      }
      s.passwordSet = true;
      s.passwordChangedAt = new Date().toISOString();
      if (req.signOutOthers) s.sessions = s.sessions.filter((x) => x.thisDevice);
      return { passwordChangedAt: s.passwordChangedAt, signedOut: 0 };
    case 'ListMySessions':
      return { sessions: s.sessions };
    case 'RevokeMySession':
      s.sessions = s.sessions.filter((x) => x.key !== req.key);
      return {};
    case 'RevokeMyOtherSessions':
      s.sessions = s.sessions.filter((x) => x.thisDevice);
      return { signedOut: 1 };
    case 'StartGoogleLink':
      s.googleEmail = 'mira.kolesnikova@gmail.com';
      return { ticket: 'stub' };
    case 'UnlinkMyGoogle':
      s.googleEmail = '';
      return {};
    case 'DeleteMyAccount':
      return { purgeAt: new Date(Date.now() + 30 * 24 * HOUR).toISOString() };
    default:
      return undefined;
  }
}
