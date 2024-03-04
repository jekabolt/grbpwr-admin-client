import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Outlet, ReactLocation, Router, Route, DefaultGenerics } from '@tanstack/react-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContextProvider } from 'context';
import { ROUTES } from 'constants/routes';
import { LoginBlock } from 'components/login/login';
import { MediaManager } from 'components/managers/media/mediaManager';
import { UploadPage } from 'components/managers/media/upload';
import { Main } from 'components/managers/MainContent';
import { Product } from 'components/managers/product/product';
import { AddProducts } from 'components/managers/product/addProduct';
import { PageProduct } from 'components/managers/product/pageProduct';
import { ProductId } from 'components/managers/product/componentsOfPageProduct/productID';
import { Hero } from 'components/managers/hero/hero';
import { MediaPicker } from 'components/managers/hero/mediaPicker';
import { GetHero } from 'components/managers/hero/getHero';
import { Promo } from 'components/managers/promo/promo';
import { GetPromo } from 'components/managers/promo/getPromo';
import { MainArchive } from 'components/managers/archive/mainArchive';
import { Archive } from 'components/managers/archive/archive';
import { GetArchive } from 'components/managers/archive/getArchive';
import { Settings } from 'components/managers/settings/settings';
import { Orders } from 'components/managers/orders/orders';
import { OrderId } from 'components/managers/orders/orderId';
import 'styles/global.scss';

const container = document.getElementById('root') ?? document.body;
const root = createRoot(container);

const queryClient = new QueryClient();
const location = new ReactLocation();

const routes: Route<DefaultGenerics>[] = [
  { path: ROUTES.login, element: <LoginBlock /> },
  { path: ROUTES.main, element: <Main /> },
  { path: ROUTES.media, element: <MediaManager /> },
  { path: ROUTES.all, element: <UploadPage /> },
  { path: ROUTES.product, element: <Product /> },
  { path: ROUTES.addProduct, element: <AddProducts /> },
  { path: ROUTES.pagedProduct, element: <PageProduct /> },
  { path: ROUTES.singleProduct, element: <ProductId /> },
  { path: ROUTES.hero, element: <Hero /> },
  { path: ROUTES.addHero, element: <MediaPicker /> },
  { path: ROUTES.getHero, element: <GetHero /> },
  { path: ROUTES.promo, element: <Promo /> },
  { path: ROUTES.getPromo, element: <GetPromo /> },
  { path: ROUTES.archive, element: <MainArchive /> },
  { path: ROUTES.createArchive, element: <Archive /> },
  { path: ROUTES.getArchive, element: <GetArchive /> },
  { path: ROUTES.settings, element: <Settings /> },
  { path: ROUTES.orders, element: <Orders /> },
  { path: ROUTES.ordersById, element: <OrderId /> },
];

root.render(
  <StrictMode>
    <ContextProvider>
      <QueryClientProvider client={queryClient}>
        <Router location={location} routes={routes}>
          <Outlet />
        </Router>
      </QueryClientProvider>
    </ContextProvider>
  </StrictMode>,
);
