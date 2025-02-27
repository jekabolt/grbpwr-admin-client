import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginBlock } from 'components/login/login';
import ProtectedRoute from 'components/login/protectedRoute';
import { Archive } from 'components/managers/archive/archive';
import { Hero } from 'components/managers/hero/hero';
import { MediaManager } from 'components/managers/media/mediaManager';
import { OrdersCatalog } from 'components/managers/orders-catalog/page';
import { OrderDetails } from 'components/managers/orders/page';
import { Analitic } from 'components/managers/page';
import { Product } from 'components/managers/product/page';
import ProductsCatalog from 'components/managers/products-catalog/page';
import { Promo } from 'components/managers/promo/promo';
import { Settings } from 'components/managers/settings/settings';
import { ROUTES } from 'constants/routes';
import { ContextProvider } from 'context';
import { StoreProvider } from 'lib/stores/store-provider';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
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
          <BrowserRouter>
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
                path={ROUTES.archive}
                element={
                  <ProtectedRoute>
                    <Archive />
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
          </BrowserRouter>
        </QueryClientProvider>
      </ContextProvider>
    </StoreProvider>
  </ThemeProvider>,
);
