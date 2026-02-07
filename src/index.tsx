import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { LoginBlock } from 'components/login/login';
import ProtectedRoute from 'components/login/protectedRoute';
import { Archives } from 'components/managers/archives';
import { Archive } from 'components/managers/archives/archive';
import { CustomerPage } from 'components/managers/customer-support';
import { ROUTES } from 'constants/routes';
import { ContextProvider } from 'context';
import { StoreProvider } from 'lib/stores/store-provider';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';
import { Layout } from 'ui/layout';
import './global.css';

// Lazy load routes for code splitting
const Hero = lazy(() =>
  import('components/managers/hero/components').then((m) => ({ default: m.Hero })),
);
const MediaManager = lazy(() =>
  import('components/managers/media').then((m) => ({ default: m.MediaManager })),
);
const OrderDetails = lazy(() =>
  import('components/managers/order/page').then((m) => ({ default: m.OrderDetails })),
);
const OrdersCatalog = lazy(() =>
  import('components/managers/orders-catalog/page').then((m) => ({ default: m.OrdersCatalog })),
);
const Analitic = lazy(() =>
  import('components/managers/page').then((m) => ({ default: m.Analitic })),
);
const Product = lazy(() =>
  import('components/managers/product/page').then((m) => ({ default: m.Product })),
);
const ProductsCatalog = lazy(() => import('components/managers/products-catalog/page'));
const Promo = lazy(() =>
  import('components/managers/promo/promo').then((m) => ({ default: m.Promo })),
);
const Settings = lazy(() =>
  import('components/managers/settings').then((m) => ({ default: m.Settings })),
);

// Configure QueryClient with best practices
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

// Error fallback component
const ErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => (
  <div style={{ padding: '2rem', textAlign: 'center' }}>
    <h2>Something went wrong</h2>
    <pre style={{ color: 'red', marginTop: '1rem' }}>
      {error instanceof Error ? error.message : String(error)}
    </pre>
    <button onClick={resetErrorBoundary} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
      Try again
    </button>
  </div>
);

// Loading fallback
const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    Loading...
  </div>
);

const ProtectedLayout = () => (
  <ProtectedRoute>
    <Layout>
      <Suspense fallback={<LoadingFallback />}>
        <Outlet />
      </Suspense>
    </Layout>
  </ProtectedRoute>
);

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);

root.render(
  <StrictMode>
    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => (window.location.href = '/')}>
      <StoreProvider>
        <ContextProvider>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route path={ROUTES.login} element={<LoginBlock />} />
                  <Route path='/' element={<ProtectedLayout />}>
                    <Route path={ROUTES.main} element={<Analitic />} />
                    <Route path={ROUTES.media} element={<MediaManager disabled={true} />} />
                    <Route path={ROUTES.singleProduct} element={<Product />} />
                    <Route path={ROUTES.product} element={<ProductsCatalog />} />
                    <Route path={ROUTES.addProduct} element={<Product />} />
                    <Route path={`${ROUTES.copyProduct}/:id`} element={<Product />} />
                    <Route path={ROUTES.hero} element={<Hero />} />
                    <Route path={ROUTES.promo} element={<Promo />} />
                    <Route path={ROUTES.settings} element={<Settings />} />
                    <Route path={ROUTES.orderDetails} element={<OrderDetails />} />
                    <Route path={ROUTES.orders} element={<OrdersCatalog />} />
                    <Route path={ROUTES.singleArchive} element={<Archive />} />
                    <Route path={ROUTES.archives} element={<Archives />} />
                    <Route path={ROUTES.customerSupport} element={<CustomerPage />} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
            <ReactQueryDevtools initialIsOpen={false} />
          </QueryClientProvider>
        </ContextProvider>
      </StoreProvider>
    </ErrorBoundary>
  </StrictMode>,
);
