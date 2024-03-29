import { ThemeProvider, createTheme } from '@mui/material/styles';
import {
  DefaultGenerics,
  Outlet,
  ReactLocation,
  Route,
  Router,
  createHashHistory,
} from '@tanstack/react-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginBlock } from 'components/login/login';
import { Main } from 'components/managers/MainContent';
import { Archive } from 'components/managers/archive/archive';
import { GetArchive } from 'components/managers/archive/getArchive';
import { MainArchive } from 'components/managers/archive/mainArchive';
import { Hero } from 'components/managers/hero/hero';
import { MediaManager } from 'components/managers/media/mediaManager';
import { UploadPage } from 'components/managers/media/upload';
import { OrderId } from 'components/managers/orders/orderId';
import { Orders } from 'components/managers/orders/orders';
import { AddProducts } from 'components/managers/products/addProduct/addProduct';
import { ProductDetails } from 'components/managers/products/productDetails/productDetails';
import { Product } from 'components/managers/products/products';
import { GetPromo } from 'components/managers/promo/getPromo';
import { Promo } from 'components/managers/promo/promo';
import { Settings } from 'components/managers/settings/settings';
import { ROUTES } from 'constants/routes';
import { ContextProvider } from 'context';
import { createRoot } from 'react-dom/client';
import 'styles/global.scss';

const container = document.getElementById('root') ?? document.body;
const root = createRoot(container);

const queryClient = new QueryClient();

const hashHistory = createHashHistory({
  window: window,
});
const location = new ReactLocation({ history: hashHistory });

const routes: Route<DefaultGenerics>[] = [
  { path: ROUTES.login, element: <LoginBlock /> },
  { path: ROUTES.main, element: <Main /> },
  { path: ROUTES.media, element: <MediaManager /> },
  { path: ROUTES.all, element: <UploadPage /> },
  { path: ROUTES.product, element: <Product /> },
  { path: ROUTES.addProduct, element: <AddProducts /> },
  { path: `${ROUTES.singleProduct}/:id`, element: <ProductDetails /> },
  { path: ROUTES.hero, element: <Hero /> },

  { path: ROUTES.promo, element: <Promo /> },
  { path: ROUTES.getPromo, element: <GetPromo /> },
  { path: ROUTES.archive, element: <MainArchive /> },
  { path: ROUTES.createArchive, element: <Archive /> },
  { path: ROUTES.getArchive, element: <GetArchive /> },
  { path: ROUTES.settings, element: <Settings /> },
  { path: ROUTES.orders, element: <Orders /> },
  { path: ROUTES.ordersById, element: <OrderId /> },
];

const theme = createTheme({
  palette: {
    primary: {
      light: '#9e9e9e',
      main: '#616161',
      dark: '#424242',
      contrastText: '#fff',
    },
    secondary: {
      light: '#ff7961',
      main: '#f44336',
      dark: '#ba000d',
      contrastText: '#000',
    },
  },
});

root.render(
  <ThemeProvider theme={theme}>
    <ContextProvider>
      <QueryClientProvider client={queryClient}>
        <Router location={location} routes={routes}>
          <Outlet />
        </Router>
      </QueryClientProvider>
    </ContextProvider>
  </ThemeProvider>,
);
