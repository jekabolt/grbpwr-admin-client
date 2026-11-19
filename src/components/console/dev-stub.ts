// DEV ONLY: canned answers for the console (PlatformService) and the people screen (team members),
// reached through `components/auth/dev-stub` under `VITE_AUTH_STUB=1`. A production build never
// imports it (api.ts loads the stub only under `import.meta.env.DEV`).
//
// Switches for screenshots, in this origin's localStorage:
//   stub.fail = '1'        every console / people write is refused (optimistic revert)
//   stub.soleOwner = '1'   the signed-in person is the team's only owner
//   stub.noTeams = '1'     the console has no teams
//   stub.member = '1'      the signed-in person is a plain member (no people actions)
//   stub.ownerOnly = '1'   people writes are refused `owner_only` (demoted a moment ago)
//   stub.unauth = '1'      EnterTeam answers 401 (console session revoked)
//   stub.tooMany = '1'     DeleteTeam answers 429 (too many password attempts)
//
// DeleteTeam accepts only the password `stub-password`; deleted teams stay in memory until reload.

import type {
  FeatureInfo,
  PlatformMember,
  PlatformTeam,
  TeamInvite,
  TeamMember,
} from 'api/proto-http/admin';

const flag = (k: string) => {
  try {
    return localStorage.getItem(k) === '1';
  } catch {
    return false;
  }
};

function refuse(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const CATALOG: FeatureInfo[] = [
  ['analytics', 'analytics', 'operations'],
  ['accounting', 'accounting', 'operations'],
  ['orders', 'orders', 'operations'],
  ['fulfillment', 'fulfillment', 'operations'],
  ['tasks', 'tasks', 'operations', 1],
  ['files', 'files', 'operations', 1],
  ['products', 'products', 'catalog'],
  ['media', 'media', 'catalog', 1],
  ['hero', 'hero', 'catalog'],
  ['promo', 'promo', 'catalog'],
  ['email_campaigns', 'email', 'catalog'],
  ['archive', 'timeline', 'catalog'],
  ['models', 'models', 'production', 1],
  ['fittings', 'fittings', 'production', 1],
  ['tech_cards', 'tech cards', 'production', 1],
  ['materials', 'materials', 'production', 1],
  ['production', 'production', 'production', 1],
  ['membership', 'members', 'members'],
  ['support', 'support', 'members'],
  ['settings', 'settings', 'admin'],
  ['ai', 'ai', 'admin', 1],
  ['ai_providers', 'ai providers', 'admin', 0, 1],
  ['local_accounts', 'local accounts', 'admin', 0, 1],
].map(([key, title, group, def, one]) => ({
  key: key as string,
  title: title as string,
  group: group as string,
  defaultOn: !!def,
  teamOneOnly: !!one,
}));

const DEFAULTS = CATALOG.filter((f) => f.defaultOn).map((f) => f.key as string);
const ALL = CATALOG.map((f) => f.key as string);

interface StubTeam extends PlatformTeam {
  members: PlatformMember[];
  /** the status a deleted team returns to */
  deletedFrom?: string;
}

const STUB_PASSWORD = 'stub-password';
const RETENTION = 30 * DAY;

function team(
  slug: string,
  name: string,
  days: number,
  spend: string,
  members: [string, string, string, number][],
  extra: Partial<PlatformTeam> = {},
): StubTeam {
  return {
    slug,
    name,
    status: 'active',
    people: members.length,
    createdAt: ago(days * DAY),
    features: DEFAULTS,
    aiSpendMonthUsd: spend,
    aiUnpricedCallsMonth: 0,
    schemaOk: true,
    purgeAt: undefined,
    members: members.map(([handle, email, role, seenMin]) => ({
      handle,
      email,
      role,
      lastSeenAt: ago(seenMin * 60_000),
    })),
    ...extra,
  };
}

let teams: StubTeam[] = [
  team(
    'grbpwr',
    'grbpwr',
    420,
    '184.20',
    [
      ['jekabolt', 'owner@grbpwr.com', 'owner', 1],
      ['vera', 'vera@grbpwr.com', 'owner', 30],
      ['jonas', 'jonas@grbpwr.com', 'member', 180],
      ['mika', 'mika@grbpwr.com', 'member', 60 * 26],
      ['lena', 'lena@grbpwr.com', 'member', 60 * 24 * 4],
    ],
    { features: ALL.filter((k) => k !== 'support') },
  ),
  team(
    'ostra',
    'ostra',
    2,
    '12.40',
    [
      ['mira', 'mira@ostra.studio', 'owner', 0],
      ['tomas', 'tomas@ostra.studio', 'owner', 120],
      ['ana', 'ana@ostra.studio', 'member', 60 * 30],
    ],
    { features: [...DEFAULTS, 'products', 'orders'] },
  ),
  team(
    'atelier-nord',
    'atelier nord',
    9,
    '0',
    [
      ['ilse', 'ilse@ateliernord.com', 'owner', 60 * 24 * 6],
      ['oskar', 'oskar@ateliernord.com', 'member', 60 * 24 * 8],
    ],
    { status: 'read_only' },
  ),
  team('vela', 'vela', 0, '0', [['noor', 'noor@vela.design', 'owner', 3]], {
    status: 'provisioning',
  }),
  team(
    'kiln-and-cloth',
    'kiln and cloth',
    5,
    '7.85',
    [
      ['felix', 'felix@kilnandcloth.com', 'owner', 15],
      ['ruth', 'ruth@kilnandcloth.com', 'member', 60 * 5],
      ['sami', 'sami@kilnandcloth.com', 'member', 60 * 24 * 3],
      ['ada', 'ada@kilnandcloth.com', 'member', 60 * 24 * 12],
    ],
    { schemaOk: false, features: [...DEFAULTS, 'analytics'] },
  ),
  team('pale-hours', 'pale hours', 14, '0.52', [
    ['emil', 'emil@palehours.co', 'owner', 60 * 2],
    ['juno', 'juno@palehours.co', 'member', 60 * 24 * 2],
  ]),
  team(
    'halden-rook',
    'halden & rook',
    31,
    '43.10',
    [
      ['kai', 'kai@haldenrook.com', 'owner', 40],
      ['lotte', 'lotte@haldenrook.com', 'member', 60 * 9],
    ],
    { features: DEFAULTS.filter((k) => k !== 'fittings') },
  ),
  team('atelier-brisk', 'atelier brisk', 0, '0', [['ines', 'ines@atelierbrisk.com', 'owner', 0]], {
    status: 'review',
    features: [],
  }),
  team('seam-salt', 'seam & salt', 1, '0', [['theo', 'theo@seamsalt.studio', 'owner', 0]], {
    status: 'review',
    features: [],
  }),
  team('draft-x', 'draft x', 0, '0', [], { status: 'pending', features: [] }),
];

const pub = ({ members, deletedFrom, ...t }: StubTeam): PlatformTeam => {
  void members;
  void deletedFrom;
  return t;
};

function find(slug: string | undefined): StubTeam {
  const t = teams.find((x) => x.slug === slug);
  if (!t) refuse(404, 'team not found');
  return t;
}

function total(): string {
  return teams.reduce((s, t) => s + Number(t.aiSpendMonthUsd || 0), 0).toFixed(2);
}

// ---- people (the team host's own team) ----

const now = Date.now();
let members: TeamMember[] = [
  {
    username: 'mira',
    email: 'mira@ostra.studio',
    role: flag('stub.member') ? 'member' : 'owner',
    lastSeenAt: ago(0),
    you: true,
    permissions: [],
  },
  {
    username: 'tomas',
    email: 'tomas@ostra.studio',
    role: flag('stub.soleOwner') ? 'member' : 'owner',
    lastSeenAt: ago(2 * 3_600_000),
    you: false,
    permissions: [],
  },
  {
    username: 'ana',
    email: 'ana@ostra.studio',
    role: 'member',
    lastSeenAt: ago(30 * 3_600_000),
    you: false,
    permissions: [],
  },
  {
    username: 'lena',
    email: 'lena@petrak.design',
    role: 'member',
    lastSeenAt: ago(5 * DAY),
    you: false,
    permissions: [],
  },
  {
    username: 'sami',
    email: 'sami@ostra.studio',
    role: 'member',
    lastSeenAt: ago(9 * DAY),
    you: false,
    permissions: [],
  },
];
let invites: TeamInvite[] = [
  {
    inviteRef: 'ref-noor',
    email: 'noor@ostra.studio',
    role: 'member',
    sentAt: ago(DAY),
    expiresAt: new Date(now + 6 * DAY).toISOString(),
    status: 'pending',
  },
  {
    inviteRef: 'ref-felix',
    email: 'felix@morel-atelier.com',
    role: 'owner',
    sentAt: ago(15 * DAY),
    expiresAt: ago(8 * DAY),
    status: 'expired',
  },
];

const owners = () => members.filter((m) => m.role === 'owner').length;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function failWrite() {
  if (flag('stub.fail')) refuse(500, 'stub refused');
}

/** People changes are owner only on the server. */
function ownerWrite() {
  failWrite();
  const me = members.find((m) => m.you);
  if (flag('stub.ownerOnly') || me?.role !== 'owner') refuse(403, 'owner_only');
}

/** The answer for a console / people method, or `undefined` when this stub does not know it. */
export function consoleStubAnswer(method: string, body: string | null, path = ''): unknown {
  const req = (body ? JSON.parse(body) : {}) as Record<string, unknown>;
  // a GET names its team in the path only
  const slug = (req.teamSlug as string | undefined) ?? path.match(/teams\/([^/?]+)/)?.[1];
  switch (method) {
    // ---- PlatformService ----
    case 'ListFeatures':
      return { features: CATALOG };
    case 'ListTeams':
      if (flag('stub.noTeams')) return { teams: [], aiSpendMonthTotalUsd: '0' };
      // deleted teams whose data is not wiped yet come after every other team
      return {
        teams: [
          ...teams.filter((t) => t.status !== 'deleted'),
          ...teams.filter((t) => t.status === 'deleted'),
        ].map(pub),
        aiSpendMonthTotalUsd: total(),
      };
    case 'GetTeam': {
      const t = find(slug);
      return { team: pub(t), members: t.members };
    }
    case 'SetTeamFeature': {
      failWrite();
      const t = find(slug);
      const key = req.feature as string;
      if (CATALOG.find((f) => f.key === key)?.teamOneOnly) refuse(400, 'team_one_only');
      const rest = (t.features ?? []).filter((k) => k !== key);
      t.features = req.enabled ? [...rest, key] : rest;
      return { team: pub(t) };
    }
    case 'SetTeamStatus': {
      failWrite();
      const t = find(slug);
      if (t.slug === 'grbpwr') refuse(400, 'team_one');
      t.status = req.readOnly ? 'read_only' : 'active';
      return { team: pub(t) };
    }
    case 'ApproveTeam': {
      failWrite();
      const t = find(slug);
      t.status = 'provisioning';
      t.features = DEFAULTS;
      return { team: pub(t) };
    }
    case 'DeclineTeam':
      failWrite();
      teams = teams.filter((t) => t.slug !== slug);
      return {};
    case 'DeleteTeam': {
      if (flag('stub.tooMany')) refuse(429, 'too many attempts');
      if (req.password !== STUB_PASSWORD) refuse(403, 'wrong_password');
      const t = find(slug);
      if (t.slug === 'grbpwr') refuse(400, 'team_one');
      if (t.status !== 'active' && t.status !== 'read_only') refuse(400, 'wrong_status');
      t.deletedFrom = t.status;
      t.status = 'deleted';
      t.purgeAt = new Date(Date.now() + RETENTION).toISOString();
      return { team: pub(t) };
    }
    case 'RestoreTeam': {
      failWrite();
      const t = find(slug);
      if (t.status !== 'deleted') refuse(400, 'wrong_status');
      t.status = t.deletedFrom ?? 'active';
      t.deletedFrom = undefined;
      t.purgeAt = undefined;
      return { team: pub(t) };
    }
    case 'EnterTeam':
      if (flag('stub.unauth')) refuse(401, 'unauthorized');
      find(slug);
      return { handoffCode: 'stub-code' };

    // ---- team members ----
    case 'ListTeamMembers':
      return { members, invites };
    case 'InviteTeamMember': {
      ownerWrite();
      const email = String(req.email ?? '')
        .trim()
        .toLowerCase();
      const role = String(req.role ?? 'member');
      if (!EMAIL.test(email)) refuse(400, 'invalid email');
      if (members.some((m) => m.email === email)) refuse(409, 'already_member');
      const fresh: TeamInvite = {
        inviteRef: `ref-${email}`,
        email,
        role,
        sentAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * DAY).toISOString(),
        status: 'pending',
      };
      const open = invites.find((i) => i.email === email);
      invites = open
        ? invites.map((i) => (i.email === email ? { ...fresh, inviteRef: i.inviteRef } : i))
        : [fresh, ...invites];
      return { invite: invites.find((i) => i.email === email) };
    }
    case 'ResendTeamInvite':
      ownerWrite();
      invites = invites.map((i) =>
        i.inviteRef === req.inviteRef
          ? {
              ...i,
              status: 'pending',
              sentAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 7 * DAY).toISOString(),
            }
          : i,
      );
      return {};
    case 'RevokeTeamInvite':
      ownerWrite();
      invites = invites.filter((i) => i.inviteRef !== req.inviteRef);
      return {};
    case 'RemoveTeamMember': {
      ownerWrite();
      const m = members.find((x) => x.username === req.username);
      if (!m) refuse(404, 'member not found');
      if (m.role === 'owner' && owners() === 1) refuse(400, 'last_owner');
      members = members.filter((x) => x !== m);
      return {};
    }
    case 'SetTeamMemberRole': {
      ownerWrite();
      const m = members.find((x) => x.username === req.username);
      if (!m) refuse(404, 'member not found');
      if (m.role === 'owner' && req.role !== 'owner' && owners() === 1) refuse(400, 'last_owner');
      members = members.map((x) => (x === m ? { ...x, role: String(req.role) } : x));
      return {};
    }
    default:
      return undefined;
  }
}
