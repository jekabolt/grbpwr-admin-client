import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  GetWorkshopSettingsResponse,
  UpdateWorkshopSettingsRequest,
  googletype_Decimal,
} from 'api/proto-http/admin';

// «ДОМ НАСТРОЕК ЦЕХА» (0272 + 0277) — one singleton row of shop-floor constants: the things that
// are true of the ROOM and its equipment rather than of any one tech card or раскладка.
//
// One query key for the whole singleton, deliberately: every consumer wants the same row, and the
// nesting modal's allowance prefill (§5.5) reads it on a screen the operator opens dozens of times
// per session. Sharing the key makes that a cache hit against whatever already fetched it.
export const workshopSettingsKeys = {
  all: ['workshop-settings'] as const,
};

// GetWorkshopSettings is on the RBAC allowlist — any authenticated account may READ the shop's
// constants; only production:write may change them.
export function useWorkshopSettings(enabled = true) {
  return useQuery({
    queryKey: workshopSettingsKeys.all,
    queryFn: () => adminService.GetWorkshopSettings({}),
    enabled,
  });
}

// PRESENT-BUT-EMPTY is how a setting is CLEARED. The three states of every setting in this patch are
// `absent` (leave the stored value alone), `{}` (back to "not configured") and `{ value }` (set it) —
// and protojson cannot tell `null` from an absent field, so `null` would silently read as "leave
// alone" and the operator's attempt to unset a wrong number would report success and do nothing.
// `{ value: undefined }` is the TypeScript spelling of the empty message: JSON.stringify emits `{}`.
export const CLEAR_SETTING: googletype_Decimal = { value: undefined };

// A request that names NO setting at all is rejected by the server rather than executed — it would
// write nothing and still stamp updated_by/updated_at, i.e. put a fake edit in the audit trail. So
// the caller must only submit a patch it has actually changed something in (the screen keeps its
// save button disabled until the form is dirty).
export function useUpdateWorkshopSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateWorkshopSettingsRequest) =>
      adminService.UpdateWorkshopSettings(patch),
    // The response carries the RESULTING configuration, so seed the cache with it rather than
    // re-fetching: a partial patch that touched one setting must not leave the other reading stale.
    onSuccess: (res) => {
      qc.setQueryData<GetWorkshopSettingsResponse>(workshopSettingsKeys.all, {
        settings: res.settings,
      });
    },
  });
}
