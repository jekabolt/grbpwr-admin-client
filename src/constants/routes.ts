export const BASE_PATH = process.env.NODE_ENV === 'production' ? '/grbpwr-admin-client' : '';

type Manager = {
  label: string;
  route: string;
};

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
  customerSupport = '/customer-support',
  shipping = '/shipping',
}

export const SIDE_BAR_ITEMS = [
  {
    label: 'ANALYTICS',
    route: ROUTES.main,
  },
  {
    label: 'MEDIA',
    route: ROUTES.media,
  },
  {
    label: 'PRODUCTS',
    route: ROUTES.product,
  },
  {
    label: 'ORDERS',
    route: ROUTES.orders,
  },
  {
    label: 'HERO',
    route: ROUTES.hero,
  },
  {
    label: 'PROMO',
    route: ROUTES.promo,
  },
  {
    label: 'TIMELINE',
    route: ROUTES.archives,
  },
  {
    label: 'SETTINGS',
    route: ROUTES.settings,
  },
  {
    label: 'SHIPPING',
    route: ROUTES.shipping,
  },
  {
    label: 'CUSTOMER SUPPORT',
    route: ROUTES.customerSupport,
  },
];

export const LEFT_SIDE_ITEMS: Manager[] = [
  {
    label: 'analytics',
    route: ROUTES.main,
  },
  {
    label: 'media',
    route: ROUTES.media,
  },
  {
    label: 'products',
    route: ROUTES.product,
  },
  {
    label: 'timiline',
    route: ROUTES.archives,
  },
  {
    label: 'orders',
    route: ROUTES.orders,
  },
  {
    label: 'hero',
    route: ROUTES.hero,
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
  },
];
