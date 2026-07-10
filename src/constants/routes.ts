export const BASE_PATH = process.env.NODE_ENV === 'production' ? '/grbpwr-admin-client' : '';

type Manager = {
  label: string;
  route: string;
  // Section key (from AdminService.ListAccountSections) that gates this item. When
  // omitted the item is always shown. See usePermissions() for the gating rules.
  section?: string;
};

// Canonical section keys used to gate admin-panel navigation against an account's
// RBAC permissions. Keys mirror the backend's ListAccountSections catalog; any key
// the backend does not publish simply fails open (item stays visible).
export const SECTION = {
  analytics: 'analytics',
  media: 'media',
  products: 'products',
  orders: 'orders',
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
  accounts: 'accounts',
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
  accounts = '/accounts',
}

export const SIDE_BAR_ITEMS: Manager[] = [
  {
    label: 'ANALYTICS',
    route: ROUTES.main,
    section: SECTION.analytics,
  },
  {
    label: 'MEDIA',
    route: ROUTES.media,
    section: SECTION.media,
  },
  {
    label: 'PRODUCTS',
    route: ROUTES.product,
    section: SECTION.products,
  },
  {
    label: 'ORDERS',
    route: ROUTES.orders,
    section: SECTION.orders,
  },
  {
    label: 'HERO',
    route: ROUTES.hero,
    section: SECTION.hero,
  },
  {
    label: 'PROMO',
    route: ROUTES.promo,
    section: SECTION.promo,
  },
  {
    label: 'TIMELINE',
    route: ROUTES.archives,
    section: SECTION.archive,
  },
  {
    label: 'SETTINGS',
    route: ROUTES.settings,
    section: SECTION.settings,
  },
  {
    label: 'SHIPPING',
    route: ROUTES.shipping,
    section: SECTION.shipping,
  },
  {
    label: 'CUSTOMER SUPPORT',
    route: ROUTES.customerSupport,
    section: SECTION.support,
  },
  {
    label: 'MEMBERS',
    route: ROUTES.members,
    section: SECTION.members,
  },
  {
    label: 'MODELS',
    route: ROUTES.models,
    section: SECTION.models,
  },
  {
    label: 'FITTINGS',
    route: ROUTES.fittings,
    section: SECTION.fittings,
  },
  {
    label: 'TECH CARDS',
    route: ROUTES.techCards,
    section: SECTION.techCards,
  },
  {
    label: 'TIER CONFIG',
    route: ROUTES.tierConfig,
    section: SECTION.members,
  },
  {
    label: 'HACKER',
    route: ROUTES.hacker,
    section: SECTION.members,
  },
  {
    label: 'TIER AUDIT',
    route: ROUTES.tierAudit,
    section: SECTION.members,
  },
  {
    label: 'ACCOUNTS',
    route: ROUTES.accounts,
    section: SECTION.accounts,
  },
];

export const LEFT_SIDE_ITEMS: Manager[] = [
  {
    label: 'analytics',
    route: ROUTES.main,
    section: SECTION.analytics,
  },
  {
    label: 'media',
    route: ROUTES.media,
    section: SECTION.media,
  },
  {
    label: 'products',
    route: ROUTES.product,
    section: SECTION.products,
  },
  {
    label: 'timiline',
    route: ROUTES.archives,
    section: SECTION.archive,
  },
  {
    label: 'orders',
    route: ROUTES.orders,
    section: SECTION.orders,
  },
  {
    label: 'hero',
    route: ROUTES.hero,
    section: SECTION.hero,
  },
  {
    label: 'members',
    route: ROUTES.members,
    section: SECTION.members,
  },
  {
    label: 'models',
    route: ROUTES.models,
    section: SECTION.models,
  },
  {
    label: 'fittings',
    route: ROUTES.fittings,
    section: SECTION.fittings,
  },
  {
    label: 'tech cards',
    route: ROUTES.techCards,
    section: SECTION.techCards,
  },
  {
    label: 'accounts',
    route: ROUTES.accounts,
    section: SECTION.accounts,
  },
  // {
  //   label: 'promo',
  //   route: ROUTES.promo,
  // },
  // {
  //   label: 'support',
  //   route: ROUTES.customerSupport,
  // },
];

export const RIGHT_SIDE_MANAGERS: Manager[] = [
  {
    label: 'settings',
    route: ROUTES.settings,
    section: SECTION.settings,
  },
];
