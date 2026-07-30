import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_CampaignMetrics,
  common_EmailCampaignDispatchStatus,
  common_EmailCampaignInsert,
  common_EmailCampaignRecipient,
  common_EmailCampaignStatus,
  common_EmailCampaignTopic,
  common_EmailSegment,
} from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';

// React Query hooks for the email-campaign builder — mirrors hero's useHero.ts and
// promo's useInfiniteQuery pattern.
export const emailCampaignKeys = {
  all: ['emailCampaigns'] as const,
  lists: () => [...emailCampaignKeys.all, 'list'] as const,
  list: (filter: unknown) => [...emailCampaignKeys.lists(), filter] as const,
  details: () => [...emailCampaignKeys.all, 'detail'] as const,
  detail: (id: number) => [...emailCampaignKeys.details(), id] as const,
  segments: ['emailSegments'] as const,
  // Segment detail nests under `segments`, so invalidating `segments` refreshes the
  // list (campaign picker + segments page) AND every open segment detail at once.
  segmentDetail: (id: number) => [...['emailSegments'], 'detail', id] as const,
  // Ф3/Ф4 dispatch surfaces.
  dispatch: (id: number) => [...emailCampaignKeys.detail(id), 'dispatch'] as const,
  metrics: (id: number) => [...emailCampaignKeys.detail(id), 'metrics'] as const,
  recipients: (id: number) => [...emailCampaignKeys.detail(id), 'recipients'] as const,
};

const PAGE_LIMIT = 24;

export function useCampaign(id: number) {
  return useQuery({
    queryKey: emailCampaignKeys.detail(id),
    queryFn: async () => {
      const res = await adminService.GetEmailCampaign({ id });
      return res?.campaign ?? null;
    },
    enabled: id > 0,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export type CampaignListFilter = {
  status?: common_EmailCampaignStatus;
  topic?: common_EmailCampaignTopic;
};

export function useCampaignsPaged(filter: CampaignListFilter) {
  return useInfiniteQuery({
    queryKey: emailCampaignKeys.list(filter),
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number;
      const res = await adminService.ListEmailCampaignsPaged({
        limit: PAGE_LIMIT,
        offset,
        // UNKNOWN acts as "no filter" on both dimensions.
        status: filter.status ?? 'EMAIL_CAMPAIGN_STATUS_UNKNOWN',
        topic: filter.topic ?? 'EMAIL_CAMPAIGN_TOPIC_UNKNOWN',
      });
      return { campaigns: res?.campaigns ?? [], total: res?.total ?? 0, offset };
    },
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const loaded = last.offset + last.campaigns.length;
      return last.campaigns.length === PAGE_LIMIT && loaded < last.total ? loaded : undefined;
    },
    staleTime: 60 * 1000,
  });
}

export function useSaveCampaign() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { id: number; campaign: common_EmailCampaignInsert }) =>
      adminService.UpsertEmailCampaign(vars),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: emailCampaignKeys.lists() });
      if (vars.id) queryClient.invalidateQueries({ queryKey: emailCampaignKeys.detail(vars.id) });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'unknown error';
      showMessage(`couldn't save campaign — ${msg}`, 'error');
    },
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (id: number) => adminService.DeleteEmailCampaign({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailCampaignKeys.lists() });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'unknown error';
      showMessage(`couldn't delete campaign — ${msg}`, 'error');
    },
  });
}

export type RenderPreviewVars = {
  campaignId?: number;
  draft?: common_EmailCampaignInsert;
  languageId: number;
  variantId: number;
  device: string; // 'desktop' | 'mobile'
};

// RenderCampaignPreview returns server-rendered, sanitized email HTML (bluemonday
// at render) that the panel drops into a SANDBOXED iframe.
export function useRenderPreview() {
  return useMutation({
    mutationFn: (vars: RenderPreviewVars) => adminService.RenderCampaignPreview(vars),
  });
}

export type TestSendVars = {
  campaignId?: number;
  draft?: common_EmailCampaignInsert;
  languageId: number;
  variantId: number;
  toEmails: string[];
};

// SendTestEmail delivers a one-off test to an allowlisted address; the backend
// enforces the allowlist.
export function useTestSend() {
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: TestSendVars) => adminService.SendTestEmail(vars),
    onSuccess: () => showMessage('test email sent', 'success'),
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'unknown error';
      showMessage(`test send failed — ${msg}`, 'error');
    },
  });
}

// ─── Ф3 dispatch lifecycle + status ───────────────────────────────────────────

const DISPATCH_POLL_MS = 4000;

// GetCampaignDispatchStatus -> { status: EmailCampaignDispatchStatus }. Polls while
// the dispatch is fanning out (status === SENDING) so the operator sees live
// progress; goes quiet once terminal.
export function useDispatchStatus(id: number, enabled = true) {
  return useQuery({
    queryKey: emailCampaignKeys.dispatch(id),
    queryFn: async (): Promise<common_EmailCampaignDispatchStatus | null> => {
      const res = await adminService.GetCampaignDispatchStatus({ id });
      return res?.status ?? null;
    },
    enabled: enabled && id > 0,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.status === 'EMAIL_CAMPAIGN_STATUS_SENDING' ? DISPATCH_POLL_MS : false,
    retry: 1,
  });
}

// GetCampaignMetrics -> { metrics: CampaignMetrics }. Compute-on-read aggregates;
// refetch on a slow cadence while sending so open/click rates trend in near-real time.
// The app disables refetch-on-focus globally (src/index.tsx), so without an explicit
// interval a SENDING campaign's numbers would sit frozen at first load.
const METRICS_POLL_MS = 30000;

export function useCampaignMetrics(
  id: number,
  enabled = true,
  status?: common_EmailCampaignStatus,
) {
  return useQuery({
    queryKey: emailCampaignKeys.metrics(id),
    queryFn: async (): Promise<common_CampaignMetrics | null> => {
      const res = await adminService.GetCampaignMetrics({ campaignId: id });
      return res?.metrics ?? null;
    },
    enabled: enabled && id > 0,
    staleTime: 30 * 1000,
    refetchInterval: status === 'EMAIL_CAMPAIGN_STATUS_SENDING' ? METRICS_POLL_MS : false,
    retry: 1,
  });
}

// GetCampaignRecipients — keyset pagination via afterId/nextId. The generated
// request carries only { id, afterId, limit } (no server-side status/cohort/variant
// filters), so the table filters loaded rows client-side.
export const RECIPIENTS_PAGE_LIMIT = 100; // backend caps at 250.

export function useRecipients(id: number, enabled = true) {
  return useInfiniteQuery({
    queryKey: emailCampaignKeys.recipients(id),
    queryFn: async ({ pageParam }) => {
      const res = await adminService.GetCampaignRecipients({
        id,
        afterId: (pageParam as number) || 0,
        limit: RECIPIENTS_PAGE_LIMIT,
      });
      return {
        recipients: res?.recipients ?? ([] as common_EmailCampaignRecipient[]),
        nextId: res?.nextId ?? 0,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.nextId && last.recipients.length === RECIPIENTS_PAGE_LIMIT ? last.nextId : undefined,
    enabled: enabled && id > 0,
    staleTime: 30 * 1000,
  });
}

// Shared onSuccess for the lifecycle mutations: refetch the campaign detail + its
// dispatch status (the source of truth for which controls are valid next) and the
// list so status chips update, then surface a toast.
function useLifecycleMutation<TVars extends { id: number }>(
  fn: (vars: TVars) => Promise<unknown>,
  successMsg: string,
  errPrefix: string,
) {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (_res, vars) => {
      showMessage(successMsg, 'success');
      queryClient.invalidateQueries({ queryKey: emailCampaignKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailCampaignKeys.detail(vars.id) });
      // Refetch dispatch status so the control set reflects the new state immediately.
      await queryClient.refetchQueries({ queryKey: emailCampaignKeys.dispatch(vars.id) });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'unknown error';
      showMessage(`${errPrefix} — ${msg}`, 'error');
    },
  });
}

export function useSendCampaignNow() {
  return useLifecycleMutation(
    (vars: { id: number }) => adminService.SendCampaignNow({ id: vars.id }),
    'campaign sending now',
    "couldn't start send",
  );
}

// useAutoTranslateCampaign asks the backend to fill the non-English locales' subject + block
// translations from the English source via AI, then refetches the campaign so the editor shows the
// filled translations for review. overwrite re-translates all locales; default fills only missing.
export function useAutoTranslateCampaign() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { id: number; overwrite?: boolean }) =>
      adminService.AutoTranslateEmailCampaign({ id: vars.id, overwrite: vars.overwrite ?? false }),
    onSuccess: async (res, vars) => {
      const n = res?.translatedCount ?? 0;
      showMessage(`auto-translated ${n} string${n === 1 ? '' : 's'} — review before sending`, 'success');
      await queryClient.refetchQueries({ queryKey: emailCampaignKeys.detail(vars.id) });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'unknown error';
      showMessage(`couldn't auto-translate — ${msg}`, 'error');
    },
  });
}

export function useScheduleCampaign() {
  return useLifecycleMutation(
    (vars: { id: number; scheduleAt: number }) =>
      adminService.ScheduleCampaign({ id: vars.id, scheduleAt: vars.scheduleAt }),
    'campaign scheduled',
    "couldn't schedule",
  );
}

export function usePauseCampaign() {
  return useLifecycleMutation(
    (vars: { id: number }) => adminService.PauseCampaign({ id: vars.id }),
    'campaign paused',
    "couldn't pause",
  );
}

export function useResumeCampaign() {
  return useLifecycleMutation(
    (vars: { id: number }) => adminService.ResumeCampaign({ id: vars.id }),
    'campaign resumed',
    "couldn't resume",
  );
}

export function useCancelCampaign() {
  return useLifecycleMutation(
    (vars: { id: number }) => adminService.CancelCampaign({ id: vars.id }),
    'campaign cancelled',
    "couldn't cancel",
  );
}

// ListEmailSegments — feeds both the segments list page and the campaign envelope's
// segment picker. Errors are NOT swallowed: a caught-and-emptied queryFn made isError
// unreachable, so an outage rendered "no segments yet." as if the account had none.
// Consumers degrade on their own terms — the list page shows its retry state, and
// SegmentPanel keeps the campaign's saved segment id with an "(unavailable)" label.
export function useSegments() {
  return useQuery({
    queryKey: emailCampaignKeys.segments,
    queryFn: async (): Promise<common_EmailSegment[]> => {
      const res = await adminService.ListEmailSegments({});
      return res?.segments ?? [];
    },
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}

// Ф2 segment builder — load one segment (with its predicate tree) for the editor
// route. Uses GetEmailSegment so a deep-link / refresh resolves without the list.
export function useSegment(id: number) {
  return useQuery({
    queryKey: emailCampaignKeys.segmentDetail(id),
    queryFn: async () => {
      const res = await adminService.GetEmailSegment({ id });
      return res?.segment ?? null;
    },
    enabled: id > 0,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

// Create (id=0) or update (id>0) a segment via UpsertEmailSegment. Request shape is
// { id, segment: common_EmailSegment } — matches the generated client exactly.
export function useUpsertSegment() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { id: number; segment: common_EmailSegment }) =>
      adminService.UpsertEmailSegment(vars),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: emailCampaignKeys.segments });
      if (vars.id)
        queryClient.invalidateQueries({ queryKey: emailCampaignKeys.segmentDetail(vars.id) });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'unknown error';
      showMessage(`couldn't save segment — ${msg}`, 'error');
    },
  });
}

export function useDeleteSegment() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (id: number) => adminService.DeleteEmailSegment({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailCampaignKeys.segments });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'unknown error';
      showMessage(`couldn't delete segment — ${msg}`, 'error');
    },
  });
}
