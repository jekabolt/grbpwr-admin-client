export const BASE_PATH = process.env.NODE_ENV === 'production' ? '/grbpwr-admin-client' : '';

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
  archives = '/archives',
  singleArchive = '/timeline/:heading/:tag/:id',
  settings = '/settings',
  orders = '/orders',
  orderDetails = '/orders/:uuid',
  customerSupport = '/customer-support',
}

export const sideBarItems = [
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
    label: 'ARCHIVE',
    route: ROUTES.archives,
  },
  {
    label: 'SETTINGS',
    route: ROUTES.settings,
  },
  {
    label: 'CUSTOMER SUPPORT',
    route: ROUTES.customerSupport,
  },
];
