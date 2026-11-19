import type { VerifyEmailResponse } from 'api/proto-http/auth';
import { teamUrl } from 'lib/host';

/** After a confirmed sign-up the team host greets with `email confirmed`. */
export function signupHandoffUrl(slug: string, code: string): string {
  return teamUrl(slug, `/auth#code=${encodeURIComponent(code)}&from=signup`);
}

export type AfterVerify =
  | { kind: 'signed-in'; token: string }
  | { kind: 'awaiting'; slug: string }
  | { kind: 'handoff'; url: string };

/**
 * A confirmed email: with a root token the person is signed in and lands on their teams (the new
 * team there as `awaiting approval`). A server without the token answers as before — the team
 * waits for the operator (its address) or the person leaves for the team host.
 */
export function afterVerify(r: VerifyEmailResponse, fallbackSlug: string): AfterVerify {
  if (r.rootToken) return { kind: 'signed-in', token: r.rootToken };
  if (r.awaitingApproval) return { kind: 'awaiting', slug: r.teamSlug || fallbackSlug };
  return { kind: 'handoff', url: signupHandoffUrl(r.teamSlug ?? '', r.handoffCode ?? '') };
}
