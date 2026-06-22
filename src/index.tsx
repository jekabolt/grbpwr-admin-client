import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { LoginBlock } from 'components/login/login';
import ProtectedRoute from 'components/login/protectedRoute';
import { Archive } from 'components/managers/archive';
import { Archives } from 'components/managers/archives';
import { CustomerPage } from 'components/managers/customer-support';
import { Shipping } from 'components/managers/shipping';
import { ROUTES } from 'constants/routes';
import { ContextProvider } from 'context';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
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
const CustomOrders = lazy(() =>
  import('components/managers/custom-orders').then((m) => ({ default: m.CustomOrders })),
);
const Analitic = lazy(() =>
  import('components/managers/page/index').then((m) => ({ default: m.Analitic })),
);
const Product = lazy(() =>
  import('components/managers/product/page').then((m) => ({ default: m.Product })),
);
const ProductsCatalog = lazy(() => import('components/managers/products-catalog/page'));
const Promo = lazy(() => import('components/managers/promo').then((m) => ({ default: m.Promo })));
const Settings = lazy(() =>
  import('components/managers/settings').then((m) => ({ default: m.Settings })),
);
const Members = lazy(() =>
  import('components/managers/membership/members/page').then((m) => ({ default: m.Members })),
);
const MemberDetails = lazy(() =>
  import('components/managers/membership/member-details/page').then((m) => ({
    default: m.MemberDetails,
  })),
);
const TierConfig = lazy(() =>
  import('components/managers/membership/tier-config/page').then((m) => ({
    default: m.TierConfig,
  })),
);
const HackerManager = lazy(() =>
  import('components/managers/membership/hacker/page').then((m) => ({ default: m.HackerManager })),
);
const TierAudit = lazy(() =>
  import('components/managers/membership/audit/page').then((m) => ({ default: m.TierAudit })),
);
const Models = lazy(() =>
  import('components/managers/models').then((m) => ({ default: m.Models })),
);
const Model = lazy(() =>
  import('components/managers/model/page').then((m) => ({ default: m.Model })),
);
const Fittings = lazy(() =>
  import('components/managers/fittings').then((m) => ({ default: m.Fittings })),
);
const Fitting = lazy(() =>
  import('components/managers/fitting/page').then((m) => ({ default: m.Fitting })),
);
const TechCards = lazy(() =>
  import('components/managers/tech-cards').then((m) => ({ default: m.TechCards })),
);
const TechCard = lazy(() =>
  import('components/managers/tech-card/page').then((m) => ({ default: m.TechCard })),
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
    {/* Mounted inside the auth gate so the dictionary is fetched only once a
        valid token exists (after login), not at app boot before login. */}
    <DictionaryProvider>
      <Layout>
        <Suspense fallback={<LoadingFallback />}>
          <Outlet />
        </Suspense>
      </Layout>
    </DictionaryProvider>
  </ProtectedRoute>
);

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);

root.render(
  <StrictMode>
    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => (window.location.href = '/')}>
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
                  <Route path={ROUTES.shipping} element={<Shipping />} />
                  <Route path={ROUTES.orderDetails} element={<OrderDetails />} />
                  <Route path={ROUTES.customOrders} element={<CustomOrders />} />
                  <Route path={ROUTES.orders} element={<OrdersCatalog />} />
                  <Route path={ROUTES.singleArchive} element={<Archive />} />
                  <Route path={ROUTES.archives} element={<Archives />} />
                  <Route path={ROUTES.addArchive} element={<Archive />} />
                  <Route path={ROUTES.customerSupport} element={<CustomerPage />} />
                  <Route path={ROUTES.members} element={<Members />} />
                  <Route path={ROUTES.memberDetails} element={<MemberDetails />} />
                  <Route path={ROUTES.tierConfig} element={<TierConfig />} />
                  <Route path={ROUTES.hacker} element={<HackerManager />} />
                  <Route path={ROUTES.tierAudit} element={<TierAudit />} />
                  <Route path={ROUTES.models} element={<Models />} />
                  <Route path={ROUTES.addModel} element={<Model />} />
                  <Route path={ROUTES.singleModel} element={<Model />} />
                  <Route path={ROUTES.fittings} element={<Fittings />} />
                  <Route path={ROUTES.addFitting} element={<Fitting />} />
                  <Route path={ROUTES.singleFitting} element={<Fitting />} />
                  <Route path={ROUTES.techCards} element={<TechCards />} />
                  <Route path={ROUTES.addTechCard} element={<TechCard />} />
                  <Route path={ROUTES.singleTechCard} element={<TechCard />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </ContextProvider>
    </ErrorBoundary>
  </StrictMode>,
);
