// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW-COUNT SEAM — live audience count for a draft predicate.
//
// Wired to the real adminService.PreviewEmailSegment RPC. The generated request is
//   PreviewEmailSegmentRequest  { segment: common_EmailSegment }
//   PreviewEmailSegmentResponse { count: number }
// so this hook wraps the caller's predicate into an EmailSegment envelope and returns
// the count. The editor calls `preview.mutate({ id, predicate })` and reads
// `preview.data` / `preview.isPending`.
//
// The id MATTERS: the backend counts the supplied predicate either way, but only
// persists it as the segment's cached last_count/last_count_at when segment.id > 0
// (SaveSegmentCount). Sending id: undefined for a saved segment left the segments
// list stuck on "count not run yet" forever.
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_SegmentPredicate } from 'api/proto-http/admin';

// The RPC now exists in the generated client, so the preview button is live.
export const PREVIEW_AVAILABLE = true;

export type PreviewSegmentVars = {
  /** Saved segment id (0 / undefined while creating) — caches the count server-side. */
  id?: number;
  predicate: common_SegmentPredicate;
};

export function usePreviewSegmentCount() {
  const mutation = useMutation<number, Error, PreviewSegmentVars>({
    mutationFn: (vars) =>
      adminService
        .PreviewEmailSegment({
          // The predicate drives the count; the id (when the segment is saved) also
          // refreshes its cached last_count. The rest is an inert envelope so the
          // request matches the generated EmailSegment shape.
          segment: {
            id: vars.id && vars.id > 0 ? vars.id : undefined,
            name: '',
            description: '',
            predicate: vars.predicate,
            lastCount: undefined,
            lastCountAt: undefined,
          },
        })
        .then((r) => r?.count ?? 0),
  });

  return {
    ...mutation,
    // Consumed by the editor to decide whether the button is live or disabled.
    available: PREVIEW_AVAILABLE,
  };
}
