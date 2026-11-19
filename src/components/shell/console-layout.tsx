import { useQueryClient } from '@tanstack/react-query';
import { authService } from 'api/api';
import { clearAuthToken } from 'api/auth-headers';
import ProtectedRoute from 'components/login/protectedRoute';
import { Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { Button, Loader, Text } from 'ui';
import { usd } from 'components/console/model';
import { useConsoleData } from 'components/console/use-console';
import { SnackBar } from './snackbar';

// The console host (console.<base>): the operator's shell. C2 fills the pages; this lane only
// gives it a guarded frame, a sign-out and a home route at `/`.

function ConsoleLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { total, loading, error } = useConsoleData();
  const signOut = () => {
    authService.SignOut({}).catch(() => undefined);
    clearAuthToken();
    queryClient.clear();
    navigate('/', { replace: true });
  };
  return (
    <div className='min-h-screen bg-pageBg'>
      <div className='flex h-12 items-center justify-between border-b border-borderColor bg-bgColor px-4 md:px-gutter'>
        <Text component='span'>
          <b>lekalo</b> · <b>console</b>
        </Text>
        <div className='flex items-baseline gap-4'>
          {!loading && !error && (
            <span className='whitespace-nowrap tabular-nums'>
              <Text variant='label' component='span'>
                ai spend
              </Text>{' '}
              {usd(total)}
            </span>
          )}
          <Button variant='underline' onClick={signOut}>
            log out
          </Button>
        </div>
      </div>
      <main className='p-4 md:p-gutter'>
        <Suspense fallback={<Loader />}>
          <Outlet />
        </Suspense>
      </main>
      <SnackBar />
    </div>
  );
}

export default function ConsoleApp({ home }: { home?: React.ReactNode }) {
  return (
    <Routes>
      <Route
        path='/'
        element={
          <ProtectedRoute>
            <ConsoleLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={home ?? null} />
      </Route>
      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
  );
}
