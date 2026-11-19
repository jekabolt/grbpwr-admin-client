// DEV ONLY: canned answers for `/workspace` (brand, people, access), reached through
// `components/auth/dev-stub` under `VITE_AUTH_STUB=1`. A production build never imports it.
//
// localStorage `stub.ws` picks the scenario (the fix mockup's screens):
//   owner (default) · new (an empty team of one owner) · member · readonly · solo (one owner)
// `stub.fail = '1'` refuses every write. Writes live in memory until reload.

import type { AdminSectionInfo, TeamBrand, TeamInvite, TeamMember } from 'api/proto-http/admin';

import { STUB_LOGOS } from 'components/auth/stub-logos';

type Scenario = 'owner' | 'new' | 'member' | 'readonly' | 'solo';

function knob(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

const scenario = (): Scenario => {
  const v = knob('stub.ws');
  return v === 'new' || v === 'member' || v === 'readonly' || v === 'solo' ? v : 'owner';
};

function refuse(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const SECTIONS: AdminSectionInfo[] = [
  ['tasks', 'tasks'],
  ['files', 'files'],
  ['media', 'media'],
  ['models', 'models'],
  ['fittings', 'fittings'],
  ['tech_cards', 'tech cards'],
  ['materials', 'materials'],
  ['production', 'production'],
  ['costing', 'costing'],
  ['dictionaries', 'dictionaries'],
].map(([key, title]) => ({ key, title, description: '' }));

const W = 'ACCESS_LEVEL_WRITE' as const;
const R = 'ACCESS_LEVEL_READ' as const;
const grants = (levels: (typeof W | typeof R | null)[]) =>
  levels.flatMap((access, i) => (access ? [{ section: SECTIONS[i].key, access }] : []));

// what each person says they do (fix mockup v4); the vocabulary is the panel-wide one
const VOCAB = [
  'pattern maker',
  'designer',
  'technologist',
  'sourcing',
  'cutter',
  'sewing',
  'production',
  'quality',
  'photographer',
];
const SEED_SPECIALTIES: Record<string, string[]> = {
  'mira.kolesnikova': ['pattern maker', 'technologist'],
  teo: ['designer'],
  'lena.ruiz': ['cutter', 'sewing', 'production', 'quality', 'sourcing', 'technologist'],
  sam: ['photographer'],
};

const member = (
  username: string,
  email: string,
  role: string,
  permissions: TeamMember['permissions'] = [],
  you = false,
): TeamMember => ({ username, email, role, lastSeenAt: ago(DAY), you, permissions });

function seed(s: Scenario) {
  if (s === 'new')
    return {
      slug: 'mono',
      brand: blankBrand(),
      logo: '',
      members: [member('nika', 'nika@mono.example', 'owner', [], true)],
      invites: [] as TeamInvite[],
      specialties: {} as Record<string, string[]>,
    };
  const you = s === 'member' ? 'sam' : 'mira.kolesnikova';
  const team = [
    member('mira.kolesnikova', 'mira.kolesnikova@ostra-studio.example', 'owner'),
    member('teo', 'teo@ostra.example', 'owner'),
    member(
      'lena.ruiz',
      'lena@ostra.example',
      'member',
      grants([W, W, R, W, W, W, R, null, null, R]),
    ),
    member(
      'sam',
      'sam@ostra.example',
      'member',
      grants([W, R, R, R, null, null, null, null, null, null]),
    ),
    member('ada', 'ada@ostra.example', 'member', grants([W, W, W, W, W, W, W, W, R, R])),
  ].map((m) => ({ ...m, you: m.username === you }));
  return {
    slug: 'ostra',
    brand: {
      brandName: 'ostra',
      legalEntity: 'OSTRA STUDIO LTD',
      legalAddress: ['14 KILN YARD, UNIT 3', 'LONDON, E2 8QT', 'UNITED KINGDOM'],
      contactEmail: 'studio@ostra.example',
      website: 'https://ostra.example',
      firstTeam: false,
      unavailable: false,
    } as TeamBrand,
    logo: STUB_LOGOS.ostra,
    specialties: { ...SEED_SPECIALTIES },
    members: s === 'solo' ? team.slice(0, 1).map((m) => ({ ...m, you: true })) : team,
    invites:
      s === 'solo'
        ? []
        : ([
            {
              inviteRef: 'ref-kai',
              email: 'kai@ostra.example',
              role: 'member',
              sentAt: ago(2 * DAY),
              expiresAt: new Date(Date.now() + 5 * DAY).toISOString(),
              status: 'pending',
            },
            {
              inviteRef: 'ref-rue',
              email: 'rue@atelier.example',
              role: 'member',
              sentAt: ago(9 * DAY),
              expiresAt: ago(2 * DAY),
              status: 'expired',
            },
          ] as TeamInvite[]),
  };
}

function blankBrand(): TeamBrand {
  return {
    brandName: '',
    legalEntity: '',
    legalAddress: [],
    contactEmail: '',
    website: '',
    firstTeam: false,
    unavailable: false,
  };
}

let state: (ReturnType<typeof seed> & { s: Scenario }) | null = null;
const st = () => {
  const s = scenario();
  if (!state || state.s !== s) state = { ...seed(s), s };
  return state;
};

const owners = () => st().members.filter((m) => m.role === 'owner').length;

function ownerWrite() {
  if (knob('stub.fail') === '1') refuse(500, 'stub refused');
  if (scenario() === 'readonly') refuse(403, 'team_read_only');
  if (st().members.find((m) => m.you)?.role !== 'owner') refuse(403, 'owner_only');
}

/** The workspace part of GetCurrentAccount on a team host, and the caller's username. */
export function stubWorkspace(features: string[]) {
  const s = st();
  const me = s.members.find((m) => m.you);
  return {
    you: me?.username ?? 'mira',
    workspace: {
      slug: s.slug,
      name: s.slug,
      role: me?.role ?? 'member',
      features,
      readOnly: s.s === 'readonly',
      logoUrl: s.logo,
      brand: s.brand,
    },
  };
}

/** The answer for a workspace method, or `undefined` when this stub does not know it. */
export function workspaceStubAnswer(method: string, body: string | null): unknown {
  const req = (body ? JSON.parse(body) : {}) as Record<string, unknown>;
  const s = st();
  switch (method) {
    case 'ListAdmins':
      return {
        admins: s.members.map((m, i) => ({
          id: i + 1,
          username: m.username,
          specialties: s.specialties[m.username ?? ''] ?? [],
          isSuper: false,
        })),
        specialties: [
          ...new Set(
            [...VOCAB, ...Object.values(s.specialties).flat()].map((x) => x.toLowerCase()),
          ),
        ],
      };
    case 'SetAccountSpecialties': {
      if (knob('stub.fail') === '1') refuse(500, 'stub refused');
      if (scenario() === 'readonly') refuse(403, 'team_read_only');
      const who = String(req.username ?? '');
      const next = ((req.newSpecialties as string[]) ?? []).map((x) => x.trim()).filter(Boolean);
      s.specialties = { ...s.specialties, [who]: next };
      return { specialties: next };
    }
    case 'ListTeamMembers':
      return { members: s.members, invites: s.invites, sections: SECTIONS };
    case 'SetTeamBrand': {
      ownerWrite();
      const email = String(req.contactEmail ?? '');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) refuse(400, 'bad_email');
      s.brand = {
        ...s.brand,
        brandName: String(req.brandName ?? ''),
        legalEntity: String(req.legalEntity ?? ''),
        legalAddress: ((req.legalAddress as string[]) ?? []).filter(Boolean),
        contactEmail: email,
        website: String(req.website ?? ''),
      };
      return { brand: s.brand };
    }
    case 'SetTeamLogo': {
      ownerWrite();
      const logo = String(req.logo ?? '');
      s.logo = logo
        ? `data:${logo.startsWith('/9j/') ? 'image/jpeg' : 'image/png'};base64,${logo}`
        : '';
      return { logoUrl: s.logo };
    }
    case 'SetTeamMemberAccess': {
      ownerWrite();
      const m = s.members.find((x) => x.username === req.username);
      if (!m) refuse(404, 'not_member');
      if (m.role === 'owner') refuse(400, 'owner_full');
      s.members = s.members.map((x) =>
        x === m ? { ...x, permissions: req.permissions as TeamMember['permissions'] } : x,
      );
      return { member: s.members.find((x) => x.username === req.username) };
    }
    case 'SetTeamMemberRole': {
      ownerWrite();
      const m = s.members.find((x) => x.username === req.username);
      if (!m) refuse(404, 'not_member');
      if (m.role === 'owner' && req.role !== 'owner' && owners() === 1) refuse(400, 'last_owner');
      s.members = s.members.map((x) => (x === m ? { ...x, role: String(req.role) } : x));
      return {};
    }
    case 'RemoveTeamMember': {
      ownerWrite();
      const m = s.members.find((x) => x.username === req.username);
      if (!m) refuse(404, 'not_member');
      if (m.role === 'owner' && owners() === 1) refuse(400, 'last_owner');
      s.members = s.members.filter((x) => x !== m);
      return {};
    }
    case 'InviteTeamMember': {
      ownerWrite();
      const email = String(req.email ?? '')
        .trim()
        .toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) refuse(400, 'invalid email');
      if (s.members.some((m) => m.email === email)) refuse(409, 'already_member');
      const fresh: TeamInvite = {
        inviteRef: `ref-${email}`,
        email,
        role: String(req.role ?? 'member'),
        sentAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * DAY).toISOString(),
        status: 'pending',
      };
      s.invites = [fresh, ...s.invites.filter((i) => i.email !== email)];
      return { invite: fresh };
    }
    case 'RevokeTeamInvite':
      ownerWrite();
      s.invites = s.invites.filter((i) => i.inviteRef !== req.inviteRef);
      return {};
    default:
      return undefined;
  }
}
