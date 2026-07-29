// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW-COUNT SEAM — live audience count for a draft predicate.
//
// Wired to the real adminService.PreviewEmailSegment RPC. The generated request is
//   PreviewEmailSegmentRequest  { segment: common_EmailSegment }
//   PreviewEmailSegmentResponse { count: number }
// so this hook wraps the caller's bare predicate into a throwaway EmailSegment
// (only the predicate is read server-side for the count) and returns the count.
// The editor calls `preview.mutate({ predicate })` and reads `preview.data` /
// `preview.isPending`, so no call-site change is needed.
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_SegmentPredicate } from 'api/proto-http/admin';

// The RPC now exists in the generated client, so the preview button is live.
export const PREVIEW_AVAILABLE = true;

export type PreviewSegmentVars = { predicate: common_SegmentPredicate };

export function usePreviewSegmentCount() {
  const mutation = useMutation<number, Error, PreviewSegmentVars>({
    mutationFn: (vars) =>
      adminService
        .PreviewEmailSegment({
          // Only the predicate drives the count; the rest is an inert throwaway
          // envelope so the request matches the generated EmailSegment shape.
          segment: {
            id: undefined,
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
