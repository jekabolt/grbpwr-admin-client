// Team feature switches (design §8). Pure: no React, no api — the nav, the route guard and the
// permission hook read them through `useWorkspace()`.

export const FEATURE = {
  core: 'core', // not a switch: accounts, profile, people
  tasks: 'tasks',
  files: 'files',
  media: 'media',
  models: 'models',
  fittings: 'fittings',
  materials: 'materials',
  production: 'production',
  techCards: 'tech_cards',
  products: 'products',
  orders: 'orders',
  fulfillment: 'fulfillment',
  promo: 'promo',
  hero: 'hero',
  archive: 'archive',
  emailCampaigns: 'email_campaigns',
  membership: 'membership',
  support: 'support',
  analytics: 'analytics',
  accounting: 'accounting',
  settings: 'settings',
  dictionaries: 'dictionaries',
  aiProviders: 'ai_providers',
  localAccounts: 'local_accounts',
} as const;

export type FeatureKey = (typeof FEATURE)[keyof typeof FEATURE];

export interface WorkspaceInfo {
  slug: string;
  name: string;
  role: string;
  features: string[];
  readOnly: boolean;
}

/** Is this feature on? No workspace (a backend before teams) means everything is on, as today. */
export function featureOn(ws: WorkspaceInfo | null | undefined, key?: string): boolean {
  if (!key || key === FEATURE.core) return true;
  if (!ws) return true;
  return ws.features.includes(key);
}

export type WorkspaceGate = 'loading' | 'open' | 'gated' | 'missing';

/**
 * How the shell treats navigation on this host.
 *  open     no workspace on a legacy host: today's app, nothing hidden
 *  gated    a workspace: features and fail-closed sections apply
 *  missing  a lekalo team host whose account came back without a workspace: no nav, an error
 *  loading  nothing known yet
 */
export function workspaceGate(
  hostKind: 'root' | 'console' | 'team' | 'legacy',
  ws: WorkspaceInfo | null | undefined,
  loaded: boolean,
): WorkspaceGate {
  if (ws) return 'gated';
  if (!loaded) return 'loading';
  return hostKind === 'legacy' ? 'open' : 'missing';
}

/**
 * Client section keys that differ from the backend's RBAC catalog. While the catalog is fail-open
 * (legacy) the old keys stay as they are; once gating is closed (a workspace), a wrong key would
 * hide a screen the account may open, so the backend key is asked instead.
 */
export const BACKEND_SECTION: Record<string, string> = {
  media: 'content',
  marketing: 'email_campaigns',
  members: 'membership',
  shipping: 'settings',
};

const EXTRA_PATHS: [string, FeatureKey][] = [
  ['/add-product', FEATURE.products],
  ['/add-hero', FEATURE.hero],
  ['/get-hero', FEATURE.hero],
  ['/get-promo', FEATURE.promo],
  ['/email-segments', FEATURE.emailCampaigns],
  ['/add-archive', FEATURE.archive],
  ['/timeline', FEATURE.archive],
  ['/custom-orders', FEATURE.orders],
  ['/add-model', FEATURE.models],
  ['/add-fitting', FEATURE.fittings],
  ['/add-tech-card', FEATURE.techCards],
  ['/production-runs', FEATURE.production],
  ['/me', FEATURE.core],
  ['/people', FEATURE.core],
];

function under(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/** The feature a path belongs to ('' when none: always reachable). */
export function featureForPath(
  pathname: string,
  items: { route: string; feature?: string }[],
): string {
  // the longest route wins: /tech-cards before /t…, /accounting/bank before /accounting
  const all: [string, string][] = [
    ...items
      .filter((i) => i.feature)
      .map((i) => [i.route, i.feature as string] as [string, string]),
    ...EXTRA_PATHS,
  ].sort((a, b) => b[0].length - a[0].length);
  const hit = all.find(([route]) => route !== '/' && under(pathname, route));
  return hit ? hit[1] : '';
}
