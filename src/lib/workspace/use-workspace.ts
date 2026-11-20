import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { GetCurrentAccountResponse } from 'api/proto-http/admin';
import { accountsKeys } from 'components/managers/accounts/utils/hooks';
import { currentHost } from 'lib/host';
import {
  FEATURE,
  featureOn,
  workspaceGate,
  type WorkspaceGate,
  type WorkspaceInfo,
} from './features';

export function toWorkspace(res: GetCurrentAccountResponse | undefined): WorkspaceInfo | null {
  const w = res?.workspace;
  if (!w || !w.slug) return null;
  return {
    slug: w.slug,
    name: w.name || w.slug,
    role: w.role ?? '',
    features: w.features ?? [],
    readOnly: !!w.readOnly,
    brand: w.brand ?? null,
    logoUrl: w.logoUrl ?? '',
    entryNeeded: !!w.entryNeeded,
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
  /** GetCurrentAccount failed (nothing cached). */
  failed: boolean;
  refetch: () => void;
}

/**
 * The team this tab works in, from GetCurrentAccount (shared cache with `useCurrentAccount`). The
 * periodic and on-focus refresh belongs to the one observer in `WorkspaceProvider`; this hook adds
 * no timers.
 */
/** Paid ai is on for this team (no workspace = a legacy host: on, as before). */
export function useAiOn(): boolean {
  const { workspace } = useWorkspace();
  return featureOn(workspace, FEATURE.ai);
}

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
    failed: q.isError && !q.data,
    refetch: () => {
      void q.refetch();
    },
  };
}
