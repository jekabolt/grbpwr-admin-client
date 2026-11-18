import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { GetCurrentAccountResponse } from 'api/proto-http/admin';
import { accountsKeys } from 'components/managers/accounts/utils/hooks';
import { currentHost } from 'lib/host';
import { workspaceGate, type WorkspaceGate, type WorkspaceInfo } from './features';

export function toWorkspace(res: GetCurrentAccountResponse | undefined): WorkspaceInfo | null {
  const w = res?.workspace;
  if (!w || !w.slug) return null;
  return {
    slug: w.slug,
    name: w.name || w.slug,
    role: w.role ?? '',
    features: w.features ?? [],
    readOnly: !!w.readOnly,
  };
}

export interface UseWorkspace {
  workspace: WorkspaceInfo | null;
  slug: string;
  name: string;
  role: string;
  features: string[];
  readOnly: boolean;
  gate: WorkspaceGate;
  refetch: () => void;
}

/**
 * The team this tab works in, from GetCurrentAccount (shared cache with `useCurrentAccount`). The
 * periodic and on-focus refresh belongs to the one observer in `WorkspaceProvider`; this hook adds
 * no timers.
 */
export function useWorkspace(): UseWorkspace {
  const q = useQuery({
    queryKey: accountsKeys.current(),
    queryFn: () => adminService.GetCurrentAccount({}),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const workspace = toWorkspace(q.data);
  const loaded = !q.isLoading;
  return {
    workspace,
    slug: workspace?.slug ?? '',
    name: workspace?.name ?? '',
    role: workspace?.role ?? '',
    features: workspace?.features ?? [],
    readOnly: workspace?.readOnly ?? false,
    gate: workspaceGate(currentHost().kind, workspace, loaded),
    refetch: () => {
      void q.refetch();
    },
  };
}
