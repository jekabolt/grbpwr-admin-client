import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginBlock } from 'components/login/login';
import ProtectedRoute from 'components/login/protectedRoute';
import { Archive } from 'components/managers/archive/archive';
import { Hero } from 'components/managers/hero/hero';
import { MediaManager } from 'components/managers/media/mediaManager';
import { OrderDetails } from 'components/managers/order/page';
import { OrdersCatalog } from 'components/managers/orders-catalog/page';
import { Analitic } from 'components/managers/page';
import { Product } from 'components/managers/product/page';
import ProductsCatalog from 'components/managers/products-catalog/page';
import { Promo } from 'components/managers/promo/promo';
import { Settings } from 'components/managers/settings/settings';
import { ROUTES } from 'constants/routes';
import { ContextProvider } from 'context';
import { StoreProvider } from 'lib/stores/store-provider';
import { createRoot } from 'react-dom/client';
import { HashRouter, Outlet, Route, Routes } from 'react-router-dom';
import { Layout } from 'ui/layout';
import './global.css';

const container = document.getElementById('root') ?? document.body;
const root = createRoot(container);
const queryClient = new QueryClient();

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

const ProtectedLayout = () => (
  <ProtectedRoute>
    <Layout>
      <Outlet />
    </Layout>
  </ProtectedRoute>
);

root.render(
  <ThemeProvider theme={theme}>
    <StoreProvider>
      <ContextProvider>
        <QueryClientProvider client={queryClient}>
          <HashRouter>
            <Routes>
              <Route path={ROUTES.login} element={<LoginBlock />} />
              <Route path='/' element={<ProtectedLayout />}>
                <Route path={ROUTES.main} element={<Analitic />} />
                <Route path={ROUTES.media} element={<MediaManager />} />
                <Route path={ROUTES.singleProduct} element={<Product />} />
                <Route path={ROUTES.product} element={<ProductsCatalog />} />
                <Route path={ROUTES.addProduct} element={<Product />} />
                <Route path={`${ROUTES.copyProduct}/:id`} element={<Product />} />
                <Route path={ROUTES.hero} element={<Hero />} />
                <Route path={ROUTES.promo} element={<Promo />} />
                <Route path={ROUTES.archive} element={<Archive />} />
                <Route path={ROUTES.settings} element={<Settings />} />
                <Route path={ROUTES.orderDetails} element={<OrderDetails />} />
                <Route path={ROUTES.orders} element={<OrdersCatalog />} />
              </Route>
            </Routes>
          </HashRouter>
        </QueryClientProvider>
      </ContextProvider>
    </StoreProvider>
  </ThemeProvider>,
);
