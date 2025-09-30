import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginBlock } from 'components/login/login';
import ProtectedRoute from 'components/login/protectedRoute';

import { Archives } from 'components/managers/archives';
import { Archive } from 'components/managers/archives/archive';
import { Hero } from 'components/managers/hero/components';
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
import { HashRouter, Route, Routes } from 'react-router-dom';
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

root.render(
  <ThemeProvider theme={theme}>
    <StoreProvider>
      <ContextProvider>
        <QueryClientProvider client={queryClient}>
          <HashRouter>
            <Routes>
              <Route path={ROUTES.login} element={<LoginBlock />} />
              <Route
                path={ROUTES.main}
                element={
                  <ProtectedRoute>
                    <Analitic />
                  </ProtectedRoute>
                }
              />
              <Route
                path={ROUTES.media}
                element={
                  <ProtectedRoute>
                    <MediaManager />
                  </ProtectedRoute>
                }
              />
              <Route
                path={ROUTES.singleProduct}
                element={
                  <ProtectedRoute>
                    <Product />
                  </ProtectedRoute>
                }
              />
              <Route
                path={ROUTES.product}
                element={
                  <ProtectedRoute>
                    <ProductsCatalog />
                  </ProtectedRoute>
                }
              />
              <Route
                path={ROUTES.addProduct}
                element={
                  <ProtectedRoute>
                    <Product />
                  </ProtectedRoute>
                }
              />
              <Route
                path={`${ROUTES.copyProduct}/:id`}
                element={
                  <ProtectedRoute>
                    <Product />
                  </ProtectedRoute>
                }
              />
              <Route
                path={ROUTES.hero}
                element={
                  <ProtectedRoute>
                    <Hero />
                  </ProtectedRoute>
                }
              />
              <Route
                path={ROUTES.promo}
                element={
                  <ProtectedRoute>
                    <Promo />
                  </ProtectedRoute>
                }
              />
              <Route
                path={ROUTES.singleArchive}
                element={
                  <ProtectedRoute>
                    <Archive />
                  </ProtectedRoute>
                }
              />
              <Route
                path={ROUTES.archives}
                element={
                  <ProtectedRoute>
                    <Archives />
                  </ProtectedRoute>
                }
              />

              <Route
                path={ROUTES.settings}
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                }
              />
              <Route
                path={ROUTES.orderDetails}
                element={
                  <ProtectedRoute>
                    <OrderDetails />
                  </ProtectedRoute>
                }
              />
              <Route
                path={ROUTES.orders}
                element={
                  <ProtectedRoute>
                    <OrdersCatalog />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </HashRouter>
        </QueryClientProvider>
      </ContextProvider>
    </StoreProvider>
  </ThemeProvider>,
);
