import type { GetTechCardConstructionAuditResponse } from 'api/proto-http/admin';

export const TECH_CARD_CONSTRUCTION_AUDIT_OWNER_V1 =
  'tech-card-construction-audit-owner/1' as const;

/**
 * The read state shared by the Construction audit panel and card-level read-only projections.
 * It is intentionally narrower than TanStack's query result: consumers cannot refetch, mutate or
 * replace the query owner through this boundary.
 */
export type TechCardConstructionAuditOwnerV1 = Readonly<{
  data: GetTechCardConstructionAuditResponse | undefined;
  isPending: boolean;
  isError: boolean;
}>;

export type TechCardConstructionAuditSharedFactsV1 = Readonly<{
  schemaVersion: typeof TECH_CARD_CONSTRUCTION_AUDIT_OWNER_V1;
  techCardId: number;
  auditFindingCount: number;
  auditUncheckedCount: number;
}>;

/**
 * Count-only projection for card-level preflight. The full response remains owned by the existing
 * query and the audit panel; no finding text, reference or operation fingerprint is copied.
 */
export function projectTechCardConstructionAuditSharedFactsV1(
  techCardId: number | undefined,
  owner: TechCardConstructionAuditOwnerV1,
): TechCardConstructionAuditSharedFactsV1 | null {
  if (
    !Number.isSafeInteger(techCardId) ||
    !techCardId ||
    techCardId < 1 ||
    owner.isPending ||
    owner.isError ||
    !owner.data
  )
    return null;

  return Object.freeze({
    schemaVersion: TECH_CARD_CONSTRUCTION_AUDIT_OWNER_V1,
    techCardId,
    auditFindingCount: owner.data.findings?.length ?? 0,
    auditUncheckedCount:
      owner.data.notChecked?.filter((item) => typeof item === 'string' && item.trim().length > 0)
        .length ?? 0,
  });
}
