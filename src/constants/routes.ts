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
  marketing: 'marketing',
  members: 'members',
  models: 'models',
  fittings: 'fittings',
  techCards: 'tech_cards',
  files: 'files',
  production: 'production',
  tasks: 'tasks',
  accounts: 'accounts',
  accounting: 'accounting',
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
  hero = '/hero',
  addHero = '/add-hero',
  getHero = '/get-hero',
  promo = '/promo',
  getPromo = '/get-promo',
  emailCampaigns = '/email-campaigns',
  emailCampaign = '/email-campaigns/:id',
  emailSegments = '/email-segments',
  emailSegment = '/email-segments/:id',
  addArchive = '/add-archive',
  archives = '/archives',
  singleArchive = '/timeline/:handle',
  settings = '/settings',
  dictionaries = '/dictionaries',
  orders = '/orders',
  orderDetails = '/orders/:uuid',
  waitlist = '/waitlist',
  orderInvoice = '/orders/:uuid/invoice',
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
  // PUBLIC pattern viewer — the page a printed tech-pack QR opens (no JWT, no dictionary).
  // Registered in src/index.tsx OUTSIDE ProtectedRoute/DictionaryProvider on purpose.
  patternViewer = '/p/:token',
  // PUBLIC run-pack viewer — the page a printed НАРЯД НА ПАРТИЮ QR opens (no JWT, no dictionary).
  // Registered in src/index.tsx OUTSIDE ProtectedRoute/Layout/DictionaryProvider, next to
  // patternViewer and for the same reasons. The QR also carries ?v={run lock version at print
  // time}, which the page compares against the live manifest to tell the floor its paper is stale.
  runPackViewer = '/r/:token',
  materials = '/materials',
  workshop = '/workshop',
  productionRuns = '/production-runs',
  productionRun = '/production-runs/:id',
  // НАРЯД НА ПАРТИЮ — печатный документ ПРОГОНА, а не стиля. Тех-пак карты отвечает «как это
  // устроено», наряд — «сколько и из чего именно в ЭТОЙ партии»; поэтому у него свой роут на
  // прогоне, а не лист внутри /tech-cards/:id/print. Регистрируется в index.tsx под ProtectedBare
  // (без Layout) — по тем же причинам, что techCardPrint.
  productionRunPrint = '/production-runs/:id/print',
  tasks = '/tasks',
  taskDetails = '/tasks/:id',
  // Библиотека файлов. Карточка файла — отдельный адрес, а не состояние экрана: ссылку на
  // файл кидают в чат вместо самого файла, и именно этим команда узнаёт, что библиотека есть.
  files = '/files',
  // Словарь тем — отдельный экран, а не панель в библиотеке: в холсте чип по клику
  // ФИЛЬТРУЕТ, и правка имени там потребовала бы второго жеста на том же элементе.
  // Статический сегмент выигрывает у `/files/:id` по правилам ранжирования react-router,
  // поэтому «topics» никогда не разберётся как идентификатор файла.
  fileTopics = '/files/topics',
  file = '/files/:id',
  accounts = '/accounts',
  // «Мой профиль» — СВОЙ аккаунт, отдельным адресом от `/accounts`.
  //
  // Решение Р1: самоописание («чем я занимаюсь») человек правит сам, без прав на аккаунты.
  // Но пункт «accounts» в меню закрыт `SECTION.accounts`, поэтому аккаунт без accounts:read
  // не видел даже ссылки — и поле, ради которого заводился словарь специальностей, оставалось
  // пустым ровно так, как решение и предупреждало.
  //
  // Отдельный адрес, а не ветка внутри `/accounts`: экран профиля не импортирует ни список
  // аккаунтов, ни модалку прав, ни пикер разрешений, поэтому чужих учёток на нём нет не по
  // условию в разметке, а по составу чанка — условие можно случайно инвертировать правкой,
  // отсутствующий импорт нельзя. Плюс адрес значит одно и то же для всех и потому линкуется.
  //
  // Сознательно НЕ входит в NAV_GROUPS/ADMIN_GROUP: оттуда собирается `SIDE_BAR_ITEMS`, а по
  // нему `usePermissions().homeRoute` выбирает посадочную страницу — пункт без секции стоял бы
  // первым и приземлял бы каждый ограниченный аккаунт на профиль вместо его рабочего раздела.
  me = '/me',
  opex = '/opex',
  accounting = '/accounting',
  accountingAccounts = '/accounting/accounts',
  accountingReports = '/accounting/reports',
  accountingBank = '/accounting/bank',
  accountingSubledgers = '/accounting/subledgers',
  accountingPeriods = '/accounting/periods',
  accountingEvents = '/accounting/events',
  employees = '/employees',
}

// Primary navigation, grouped by domain. Desktop renders each group as a top-bar
// dropdown; mobile renders each as a titled drawer section. This is the single
// source of truth — desktop and mobile can no longer drift apart.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'operations',
    items: [
      { label: 'analytics', route: ROUTES.main, section: SECTION.analytics },
      { label: 'opex', route: ROUTES.opex, section: SECTION.analytics },
      { label: 'employees', route: ROUTES.employees, section: SECTION.analytics },
      { label: 'accounting', route: ROUTES.accounting, section: SECTION.accounting },
      { label: 'orders', route: ROUTES.orders, section: SECTION.orders },
      { label: 'fulfillment', route: ROUTES.fulfillment, section: SECTION.fulfillment },
      { label: 'tasks', route: ROUTES.tasks, section: SECTION.tasks },
      { label: 'files', route: ROUTES.files, section: SECTION.files },
    ],
  },
  {
    label: 'catalog',
    items: [
      { label: 'products', route: ROUTES.product, section: SECTION.products },
      { label: 'waitlist', route: ROUTES.waitlist, section: SECTION.products },
      { label: 'media', route: ROUTES.media, section: SECTION.media },
      { label: 'hero', route: ROUTES.hero, section: SECTION.hero },
      { label: 'promo', route: ROUTES.promo, section: SECTION.promo },
      { label: 'email', route: ROUTES.emailCampaigns, section: SECTION.marketing },
      { label: 'timeline', route: ROUTES.archives, section: SECTION.archive },
    ],
  },
  {
    label: 'production',
    items: [
      { label: 'models', route: ROUTES.models, section: SECTION.models },
      { label: 'fittings', route: ROUTES.fittings, section: SECTION.fittings },
      { label: 'tech cards', route: ROUTES.techCards, section: SECTION.techCards },
      { label: 'materials', route: ROUTES.materials, section: SECTION.techCards },
      { label: 'production', route: ROUTES.productionRuns, section: SECTION.production },
      // Shop-floor constants (cutting table, default seam allowance). Gated on `production`, which
      // is what UpdateWorkshopSettings actually requires — not on `settings`, whose screen holds
      // storefront configuration and is a different role's business.
      { label: 'workshop', route: ROUTES.workshop, section: SECTION.production },
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
    { label: 'dictionaries', route: ROUTES.dictionaries, section: SECTION.settings },
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
