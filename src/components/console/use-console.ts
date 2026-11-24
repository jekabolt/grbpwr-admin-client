import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { clearAuthToken } from 'api/auth-headers';
import type { ListTeamsResponse, PlatformTeam } from 'api/proto-http/admin';
import { currentHost, goToUrl, teamUrl } from 'lib/host';
import { useSnackBarStore } from 'lib/stores/store';
import { consoleKeys, platformService } from './api';
import {
  type CapChange,
  deleteRefusal,
  patchTeam,
  refusalWord,
  STATUS,
  withFeature,
  withReadOnly,
} from './model';

/** `ostra.lekalo.studio`: the team's address on this contour. */
export const addressOf = (slug: string) => `${slug}.${currentHost().base}`;

export function useConsoleData() {
  const teams = useQuery({
    queryKey: consoleKeys.teams(),
    queryFn: () => platformService.ListTeams({ query: '' }),
    staleTime: 30_000,
  });
  const features = useQuery({
    queryKey: consoleKeys.features(),
    queryFn: () => platformService.ListFeatures({}),
    staleTime: 10 * 60_000,
  });
  return {
    rows: teams.data?.teams ?? [],
    total: teams.data?.aiSpendMonthTotalUsd,
    catalog: features.data?.features ?? [],
    loading: teams.isLoading || features.isLoading,
    error: teams.isError || features.isError,
  };
}

export function useTeamDetail(slug: string, enabled = true) {
  return useQuery({
    queryKey: consoleKeys.team(slug),
    queryFn: () => platformService.GetTeam({ teamSlug: slug }),
    enabled: enabled && !!slug,
    staleTime: 60_000,
  });
}

/** The owner's address of each waiting sign-up (its only member). */
export function useRequestEmails(slugs: string[]): Record<string, string> {
  const res = useQueries({
    queries: slugs.map((slug) => ({
      queryKey: consoleKeys.team(slug),
      queryFn: () => platformService.GetTeam({ teamSlug: slug }),
      staleTime: 60_000,
    })),
  });
  const out: Record<string, string> = {};
  slugs.forEach((s, i) => {
    const email = res[i]?.data?.members?.[0]?.email;
    if (email) out[s] = email;
  });
  return out;
}

export function useConsoleActions() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const key = consoleKeys.teams();

  const setRows = (fn: (rows: PlatformTeam[] | undefined) => PlatformTeam[]) =>
    qc.setQueryData<ListTeamsResponse>(key, (d) => (d ? { ...d, teams: fn(d.teams) } : d));
  const hold = () => qc.cancelQueries({ queryKey: key });
  const fail = (e: unknown) => showMessage(refusalWord(e), 'error');
  // approve / decline on a row another operator already moved: show it, then the real list
  const stale = (e: unknown) => {
    fail(e);
    qc.invalidateQueries({ queryKey: key });
  };

  // Optimistic: the cell flips now; a refusal flips only that cell back.
  const feature = useMutation({
    mutationFn: (v: { slug: string; key: string; on: boolean }) =>
      platformService.SetTeamFeature({ teamSlug: v.slug, feature: v.key, enabled: v.on }),
    onMutate: async (v) => {
      await hold();
      setRows((rows) => patchTeam(rows, v.slug, (t) => withFeature(t, v.key, v.on)));
    },
    onError: (e, v) => {
      setRows((rows) => patchTeam(rows, v.slug, (t) => withFeature(t, v.key, !v.on)));
      fail(e);
    },
  });

  const readOnly = useMutation({
    mutationFn: (v: { slug: string; on: boolean }) =>
      platformService.SetTeamStatus({ teamSlug: v.slug, readOnly: v.on }),
    onMutate: async (v) => {
      await hold();
      setRows((rows) => patchTeam(rows, v.slug, (t) => withReadOnly(t, v.on)));
    },
    onError: (e, v) => {
      setRows((rows) => patchTeam(rows, v.slug, (t) => withReadOnly(t, !v.on)));
      fail(e);
    },
  });

  const approve = useMutation({
    mutationFn: (slug: string) => platformService.ApproveTeam({ teamSlug: slug }),
    onSuccess: (r, slug) =>
      setRows((rows) =>
        patchTeam(rows, slug, (t) => r.team ?? { ...t, status: STATUS.provisioning }),
      ),
    onError: stale,
  });

  const decline = useMutation({
    mutationFn: (slug: string) => platformService.DeclineTeam({ teamSlug: slug }),
    onSuccess: (_r, slug) => setRows((rows) => (rows ?? []).filter((t) => t.slug !== slug)),
    onError: stale,
  });

  // The operator opens the team through its hand-off route with a one-time code.
  const enter = useMutation({
    mutationFn: (slug: string) => platformService.EnterTeam({ teamSlug: slug }),
    onSuccess: (r, slug) => {
      if (!r.handoffCode) return showMessage('no code', 'error');
      goToUrl(teamUrl(slug, `/auth#code=${encodeURIComponent(r.handoffCode)}`));
    },
    onError: (e) => {
      // a code is only issued to a live console session: a revoked one signs in again
      if ((e as { status?: number } | null)?.status === 401) {
        clearAuthToken();
        qc.clear();
        return goToUrl(`${window.location.origin}/`);
      }
      showMessage(refusalWord(e, 'not opened'), 'error');
    },
  });

  // No confirmation: a deleted team comes back in its old status at once.
  const restore = useMutation({
    mutationFn: (slug: string) => platformService.RestoreTeam({ teamSlug: slug }),
    onSuccess: (r, slug) => {
      if (r.team) setRows((rows) => patchTeam(rows, slug, () => r.team as PlatformTeam));
      qc.invalidateQueries({ queryKey: key });
    },
    onError: stale,
  });

  // The cap is saved on press (no optimistic flip): the row takes the server's answer.
  const storageCap = useMutation({
    mutationFn: (v: { slug: string; change: CapChange }) =>
      platformService.SetTeamStorageCap({
        teamSlug: v.slug,
        capBytes: 'capBytes' in v.change ? v.change.capBytes : undefined,
        noCap: 'noCap' in v.change ? true : undefined,
        defaultCap: 'defaultCap' in v.change ? true : undefined,
      }),
    onSuccess: (r, v) => {
      if (r.team) setRows((rows) => patchTeam(rows, v.slug, (t) => ({ ...t, ...r.team })));
    },
    onError: fail,
  });

  // The operator's close of a team's shop (lane X18): the row takes the server's answer.
  const shop = useMutation({
    mutationFn: (v: { slug: string; closed: boolean }) =>
      platformService.SetTeamShop({ teamSlug: v.slug, closed: v.closed }),
    onSuccess: (r, v) => {
      if (r.team) setRows((rows) => patchTeam(rows, v.slug, (t) => ({ ...t, ...r.team })));
    },
    onError: fail,
  });

  const busy = (m: { isPending: boolean; variables?: unknown }, slug: string) =>
    m.isPending && m.variables === slug;

  return {
    toggleFeature: (slug: string, k: string, on: boolean) => feature.mutate({ slug, key: k, on }),
    toggleReadOnly: (slug: string, on: boolean) => readOnly.mutate({ slug, on }),
    approve: (slug: string) => approve.mutate(slug),
    decline: (slug: string) => decline.mutate(slug),
    enter: (slug: string) => enter.mutate(slug),
    restore: (slug: string) => restore.mutate(slug),
    setStorageCap: (slug: string, change: CapChange) =>
      storageCap.mutateAsync({ slug, change }).then(
        () => true,
        () => false,
      ),
    setShopClosed: (slug: string, closed: boolean) => shop.mutate({ slug, closed }),
    savingShop: (slug: string) => shop.isPending && shop.variables?.slug === slug,
    savingCap: (slug: string) => storageCap.isPending && storageCap.variables?.slug === slug,
    approving: (slug: string) => busy(approve, slug),
    declining: (slug: string) => busy(decline, slug),
    entering: (slug: string) => busy(enter, slug),
    restoring: (slug: string) => busy(restore, slug),
  };
}

/**
 * Delete a team with the operator's own password. A plain call, not a mutation: a mutation keeps its
 * variables in the query client's cache after the sheet is gone, and the password must live only in
 * the sheet's state. Resolves to `null` on success, else the word the sheet shows.
 */
export function useDeleteTeam() {
  const qc = useQueryClient();
  const key = consoleKeys.teams();
  return async (slug: string, password: string): Promise<string | null> => {
    try {
      const r = await platformService.DeleteTeam({ teamSlug: slug, password });
      qc.setQueryData<ListTeamsResponse>(key, (d) =>
        d && r.team ? { ...d, teams: patchTeam(d.teams, slug, () => r.team as PlatformTeam) } : d,
      );
      qc.invalidateQueries({ queryKey: key });
      return null;
    } catch (e) {
      return deleteRefusal(e);
    }
  };
}
