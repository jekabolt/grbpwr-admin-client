import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { accountsKeys } from 'components/managers/accounts/utils/hooks';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { NAV_GROUPS, ADMIN_GROUP, ROUTES } from 'constants/routes';
import { isLekaloHost } from 'lib/host';
import { useSnackBarStore } from 'lib/stores/store';
import { type ReactNode, useEffect, useRef } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { onWorkspaceSignal } from './events';
import { featureForPath, featureOn } from './features';
import { PaperBrandProvider } from './paper-brand-context';
import { useWorkspace } from './use-workspace';

const NAV_ITEMS = [...NAV_GROUPS, ADMIN_GROUP].flatMap((g) => g.items);
const LIVE = isLekaloHost();

/**
 * Keeps the workspace fresh (load, window focus, every 60 s) and answers the backend's team
 * refusals: `team_read_only` → toast + refetch, `feature_off` → refetch + leave for the first
 * allowed screen. Mounted once inside the protected layouts.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  useQuery({
    queryKey: accountsKeys.current(),
    queryFn: () => adminService.GetCurrentAccount({}),
    staleTime: 5 * 60_000,
    retry: false,
    // today's admin host keeps its old fetch pattern; lekalo hosts follow pauses and features live
    refetchInterval: LIVE ? 60_000 : false,
    refetchOnWindowFocus: LIVE,
  });
  const { refetch } = useWorkspace();
  const { homeRoute } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const navigate = useNavigate();
  const latest = useRef({ refetch, homeRoute, showMessage, navigate });
  latest.current = { refetch, homeRoute, showMessage, navigate };

  useEffect(
    () =>
      onWorkspaceSignal((signal) => {
        const { refetch, homeRoute, showMessage, navigate } = latest.current;
        refetch();
        if (signal === 'read_only') {
          showMessage('read only', 'error');
          return;
        }
        navigate(homeRoute ?? ROUTES.me, { replace: true });
      }),
    [],
  );

  return <PaperBrandProvider>{children}</PaperBrandProvider>;
}

/** Sends a path whose feature is off to the first allowed screen. */
export function FeatureGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { workspace, gate } = useWorkspace();
  const { homeRoute } = usePermissions();
  if (gate !== 'gated') return <>{children}</>;
  const feature = featureForPath(pathname, NAV_ITEMS);
  if (featureOn(workspace, feature)) return <>{children}</>;
  const to = homeRoute ?? ROUTES.me;
  if (to === pathname) return <>{children}</>;
  return <Navigate to={to} replace />;
}
