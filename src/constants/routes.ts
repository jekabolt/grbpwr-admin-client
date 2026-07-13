export const BASE_PATH = process.env.NODE_ENV === 'production' ? '/grbpwr-admin-client' : '';

// A single navigation destination. `section` (from AdminService.ListAccountSections)
// gates the item against an account's RBAC permissions; when omitted the item is
// always shown. See usePermissions() for the gating rules.
export type NavItem = {
  label: string;
  route: string;
  section?: string;
};

// A labeled group of destinations. On desktop each group is a dropdown in the top
// bar; on mobile it renders as a titled section in the drawer.
export type NavGroup = {
  label: string;
  items: NavItem[];
};

// Canonical section keys used to gate admin-panel navigation against an account's
// RBAC permissions. Keys mirror the backend's ListAccountSections catalog; any key
// the backend does not publish simply fails open (item stays visible).
export const SECTION = {
  analytics: 'analytics',
  media: 'media',
  products: 'products',
  orders: 'orders',
  fulfillment: 'fulfillment',
  hero: 'hero',
  promo: 'promo',
  archive: 'archive',
  settings: 'settings',
  shipping: 'shipping',
  support: 'support',
  members: 'members',
  models: 'models',
  fittings: 'fittings',
  techCards: 'tech_cards',
  tasks: 'tasks',
  accounts: 'accounts',
  // Field-shaping section (NOT a screen gate): when an account lacks costing:read
  // the backend nulls out cost/margin fields across products, tech cards, metrics
  // and the dashboard. Deliberately absent from the nav arrays — there is no
  // "costing" page; canRead/canWrite(SECTION.costing) only tidy cost UI visibility.
  costing: 'costing',
} as const;

export type SectionKey = (typeof SECTION)[keyof typeof SECTION];

export enum ROUTES {
  login = '/',
  main = '/main',
  media = '/media-manager',
  addProduct = '/add-product',
  product = '/products',
  singleProduct = '/products/:id',
  copyProduct = '/copy',
  hero = '/hero',
  addHero = '/add-hero',
  getHero = '/get-hero',
  promo = '/promo',
  getPromo = '/get-promo',
  addArchive = '/add-archive',
  archives = '/archives',
  singleArchive = '/timeline/:heading/:tag/:id',
  settings = '/settings',
  orders = '/orders',
  orderDetails = '/orders/:uuid',
  fulfillment = '/fulfillment',
  fulfillmentCard = '/fulfillment/:uuid',
  customOrders = '/custom-orders',
  customerSupport = '/customer-support',
  shipping = '/shipping',
  members = '/members',
  memberDetails = '/members/:id',
  tierConfig = '/tier-config',
  hacker = '/hacker',
  tierAudit = '/tier-audit',
  models = '/models',
  addModel = '/add-model',
  singleModel = '/models/:id',
  fittings = '/fittings',
  addFitting = '/add-fitting',
  singleFitting = '/fittings/:id',
  techCards = '/tech-cards',
  addTechCard = '/add-tech-card',
  singleTechCard = '/tech-cards/:id',
  techCardPrint = '/tech-cards/:id/print',
  tasks = '/tasks',
  taskDetails = '/tasks/:id',
  accounts = '/accounts',
}

// Primary navigation, grouped by domain. Desktop renders each group as a top-bar
// dropdown; mobile renders each as a titled drawer section. This is the single
// source of truth — desktop and mobile can no longer drift apart.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'operations',
    items: [
      { label: 'analytics', route: ROUTES.main, section: SECTION.analytics },
      { label: 'orders', route: ROUTES.orders, section: SECTION.orders },
      { label: 'fulfillment', route: ROUTES.fulfillment, section: SECTION.fulfillment },
      { label: 'tasks', route: ROUTES.tasks, section: SECTION.tasks },
    ],
  },
  {
    label: 'catalog',
    items: [
      { label: 'products', route: ROUTES.product, section: SECTION.products },
      { label: 'media', route: ROUTES.media, section: SECTION.media },
      { label: 'hero', route: ROUTES.hero, section: SECTION.hero },
      { label: 'promo', route: ROUTES.promo, section: SECTION.promo },
      { label: 'timeline', route: ROUTES.archives, section: SECTION.archive },
    ],
  },
  {
    label: 'production',
    items: [
      { label: 'models', route: ROUTES.models, section: SECTION.models },
      { label: 'fittings', route: ROUTES.fittings, section: SECTION.fittings },
      { label: 'tech cards', route: ROUTES.techCards, section: SECTION.techCards },
    ],
  },
  {
    label: 'members',
    items: [
      { label: 'members', route: ROUTES.members, section: SECTION.members },
      { label: 'tier config', route: ROUTES.tierConfig, section: SECTION.members },
      { label: 'tier audit', route: ROUTES.tierAudit, section: SECTION.members },
      { label: 'hacker', route: ROUTES.hacker, section: SECTION.members },
      { label: 'support', route: ROUTES.customerSupport, section: SECTION.support },
    ],
  },
];

// Admin cluster, surfaced to the right of the logo on desktop and as the final
// drawer section on mobile.
export const ADMIN_GROUP: NavGroup = {
  label: 'admin',
  items: [
    { label: 'settings', route: ROUTES.settings, section: SECTION.settings },
    { label: 'shipping', route: ROUTES.shipping, section: SECTION.shipping },
    { label: 'accounts', route: ROUTES.accounts, section: SECTION.accounts },
  ],
};

// Flattened list of every destination, in nav order. Retained for RBAC landing-route
// resolution (usePermissions().homeRoute picks the first item an account can read).
export const SIDE_BAR_ITEMS: NavItem[] = [...NAV_GROUPS, ADMIN_GROUP].flatMap(
  (group) => group.items,
);

// True when `pathname` is at `route` or nested beneath it (e.g. /products/42 is under
// /products). Used to highlight the active nav item and its parent group.
export function isActiveRoute(pathname: string, route: string): boolean {
  if (route === ROUTES.login) return pathname === ROUTES.login;
  return pathname === route || pathname.startsWith(`${route}/`);
}
