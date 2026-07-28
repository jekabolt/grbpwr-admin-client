// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW-COUNT SEAM — live audience count for a draft predicate.
//
// The backend PreviewEmailSegment RPC is NOT in the generated client yet (the
// orchestrator regenerates the proto shortly). Until then this hook is a STUB that
// reports `available: false` so the editor renders the button disabled with a
// "live count available after deploy" hint — WITHOUT referencing a non-generated
// RPC that would break `yarn build:check`.
//
// TO WIRE THE REAL RPC (≈ one-line swap), once the client is regenerated:
//   1. import { adminService } from 'api/api'
//   2. replace the STUB body of `useMutation` with:
//        mutationFn: (vars: { predicate: common_SegmentPredicate }) =>
//          adminService.PreviewEmailSegment({ predicate: vars.predicate })
//              .then((r) => r?.count ?? 0),
//   3. flip `PREVIEW_AVAILABLE` to true (or delete it and always return the mutation).
// The editor already calls `preview.mutate({ predicate })` and reads
// `preview.data` / `preview.isPending`, so no call-site change is needed.
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation } from '@tanstack/react-query';
import { common_SegmentPredicate } from 'api/proto-http/admin';

// Flip to true the moment PreviewEmailSegment exists in the generated client.
export const PREVIEW_AVAILABLE = false;

export type PreviewSegmentVars = { predicate: common_SegmentPredicate };

export function usePreviewSegmentCount() {
  const mutation = useMutation<number, Error, PreviewSegmentVars>({
    // STUB: never resolves to a real count. Rejects so an accidental call surfaces
    // clearly in dev rather than silently reporting 0. The UI gates on
    // `PREVIEW_AVAILABLE` and never actually fires this until the RPC lands.
    mutationFn: async () => {
      throw new Error('PreviewEmailSegment RPC not generated yet');
    },
  });

  return {
    ...mutation,
    // Consumed by the editor to decide whether the button is live or disabled.
    available: PREVIEW_AVAILABLE,
  };
}
