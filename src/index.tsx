import React from 'react';
import ReactDOM from 'react-dom';
// import { StrictMode } from 'react'; -- TODO: what is it used for
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
];

root.render(
  <ContextProvider>
    <QueryClientProvider client={queryClient}>
      <Router location={location} routes={routes}>
        <Outlet />
      </Router>
    </QueryClientProvider>
  </ContextProvider>,
);
