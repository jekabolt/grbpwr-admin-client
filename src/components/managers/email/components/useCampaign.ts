import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_EmailCampaignInsert,
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

// Ф2 (segment builder) is deferred — the SegmentNode tree editor is not built yet.
// This is wired to the real ListEmailSegments RPC so the envelope picker can offer
// any segments that already exist, but resilient: on error it yields [] so the
// builder degrades to "no segment / everyone" rather than breaking.
export function useSegments() {
  return useQuery({
    queryKey: emailCampaignKeys.segments,
    queryFn: async (): Promise<common_EmailSegment[]> => {
      try {
        const res = await adminService.ListEmailSegments({});
        return res?.segments ?? [];
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}
