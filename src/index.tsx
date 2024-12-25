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
import ProtectedRoute from 'components/login/protectedRoute';
import { Main } from 'components/managers/MainContent';
import { Archive } from 'components/managers/archive/archive';
import { Hero } from 'components/managers/hero/hero';
import { MediaManager } from 'components/managers/media/mediaManager';
import { OrderDetails } from 'components/managers/orders/order-details/page';
import { Orders } from 'components/managers/orders/orders';
import { ProductForm } from 'components/managers/products/productForm/productForm';
import { Product } from 'components/managers/products/products';
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
export const location = new ReactLocation({ history: hashHistory });

const routes: Route<DefaultGenerics>[] = [
  { path: ROUTES.login, element: <LoginBlock /> },
  {
    path: ROUTES.main,
    element: (
      <ProtectedRoute>
        <Main />
      </ProtectedRoute>
    ),
  },
  {
    path: ROUTES.media,
    element: (
      <ProtectedRoute>
        <MediaManager />
      </ProtectedRoute>
    ),
  },
  {
    path: ROUTES.singleProduct,
    element: (
      <ProtectedRoute>
        <ProductForm />
      </ProtectedRoute>
    ),
  },
  {
    path: ROUTES.product,
    element: (
      <ProtectedRoute>
        <Product />
      </ProtectedRoute>
    ),
  },
  {
    path: ROUTES.addProduct,
    element: (
      <ProtectedRoute>
        <ProductForm />
      </ProtectedRoute>
    ),
  },
  {
    path: `${ROUTES.copyProduct}/:id`,
    element: (
      <ProtectedRoute>
        <ProductForm />
      </ProtectedRoute>
    ),
  },
  {
    path: ROUTES.hero,
    element: (
      <ProtectedRoute>
        <Hero />
      </ProtectedRoute>
    ),
  },

  {
    path: ROUTES.promo,
    element: (
      <ProtectedRoute>
        <Promo />
      </ProtectedRoute>
    ),
  },
  {
    path: ROUTES.archive,
    element: (
      <ProtectedRoute>
        <Archive />
      </ProtectedRoute>
    ),
  },
  {
    path: ROUTES.settings,
    element: (
      <ProtectedRoute>
        <Settings />
      </ProtectedRoute>
    ),
  },
  {
    path: ROUTES.orderDetails,
    element: (
      <ProtectedRoute>
        <OrderDetails />
      </ProtectedRoute>
    ),
  },
  {
    path: ROUTES.orders,
    element: (
      <ProtectedRoute>
        <Orders />
      </ProtectedRoute>
    ),
  },
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
