import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListTeamsResponse, PlatformTeam } from 'api/proto-http/admin';
import { currentHost, goToUrl, teamUrl } from 'lib/host';
import { useSnackBarStore } from 'lib/stores/store';
import { consoleKeys, platformService } from './api';
import { patchTeam, refusalWord, STATUS, withFeature, withReadOnly } from './model';

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
    onError: fail,
  });

  const decline = useMutation({
    mutationFn: (slug: string) => platformService.DeclineTeam({ teamSlug: slug }),
    onSuccess: (_r, slug) => setRows((rows) => (rows ?? []).filter((t) => t.slug !== slug)),
    onError: fail,
  });

  // The operator opens the team through its hand-off route with a one-time code.
  const enter = useMutation({
    mutationFn: (slug: string) => platformService.EnterTeam({ teamSlug: slug }),
    onSuccess: (r, slug) => {
      if (!r.handoffCode) return showMessage('no code', 'error');
      goToUrl(teamUrl(slug, `/auth#code=${encodeURIComponent(r.handoffCode)}`));
    },
    onError: (e) => showMessage(refusalWord(e, 'not opened'), 'error'),
  });

  const busy = (m: { isPending: boolean; variables?: unknown }, slug: string) =>
    m.isPending && m.variables === slug;

  return {
    toggleFeature: (slug: string, k: string, on: boolean) => feature.mutate({ slug, key: k, on }),
    toggleReadOnly: (slug: string, on: boolean) => readOnly.mutate({ slug, on }),
    approve: (slug: string) => approve.mutate(slug),
    decline: (slug: string) => decline.mutate(slug),
    enter: (slug: string) => enter.mutate(slug),
    approving: (slug: string) => busy(approve, slug),
    declining: (slug: string) => busy(decline, slug),
    entering: (slug: string) => busy(enter, slug),
  };
}
