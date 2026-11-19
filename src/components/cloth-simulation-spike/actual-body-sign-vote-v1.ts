import type { BodyQueryPoint } from './actual-body-query-partition-v1';

export const ACTUAL_BODY_SIGN_RAYS_V1: readonly BodyQueryPoint[] = Object.freeze([
  Object.freeze([1, 0.3713906763541037, 0.1937129433613962]) as BodyQueryPoint,
  Object.freeze([0.219438401739403, 1, 0.413879781155325]) as BodyQueryPoint,
  Object.freeze([0.317022238725803, 0.233891391482773, 1]) as BodyQueryPoint,
]);

/** Sign requires two or more unambiguous votes with no dissent. */
export function unanimousBodyRayVoteV1(votes: readonly (boolean | null)[]): boolean | null {
  let sign: boolean | null = null;
  let count = 0;
  for (const vote of votes) {
    if (vote === null) continue;
    if (sign !== null && vote !== sign) return null;
    sign = vote;
    count++;
  }
  return count >= 2 ? sign : null;
}
