import React from 'react';
import ReactDOM from 'react-dom';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Outlet, ReactLocation, Router, Route, DefaultGenerics } from '@tanstack/react-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContextProvider } from 'context';
import { ROUTES } from 'constants/routes';
import { LoginBlock } from 'components/login';
import { UploadPage } from 'pages/mediaManager/upload'
import { MainContent } from 'pages/MainContent';
import { MediaManager } from 'pages/mediaManager/mediaManager'
import 'styles/global.scss';

const container = document.getElementById('root');
const root = createRoot(container!);

const queryClient = new QueryClient();
const location = new ReactLocation();

const routes: Route<DefaultGenerics>[] = [
  { path: ROUTES.login, element: <LoginBlock /> },
  { path: ROUTES.main, element: <MainContent /> },
  { path: ROUTES.mediaManager, element: <MediaManager />},
  { path: ROUTES.all, element: <UploadPage /> }
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
  </StrictMode>
);
