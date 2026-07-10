import { AccessLevel } from 'api/proto-http/admin';
import { SECTION } from 'constants/routes';
import { useMemo } from 'react';
import { ACCESS, accessSatisfies, useAccountSections, useCurrentAccount } from './hooks';

// usePermissions resolves the calling account's effective access so the panel can
// decide which sections to show.
//
// Fail-open by design: while the account or the section catalog is still loading —
// or when the backend predates RBAC and the call errors — every section is shown.
// A section is gated only once we have a definitive non-super account AND the section
// key is one the backend actually publishes in ListAccountSections. Wrong key guesses
// therefore fail open rather than hiding legitimate navigation. The backend remains the
// real enforcement boundary; this only tidies the UI.
export function usePermissions() {
  const {
    data: accountData,
    isLoading: accountLoading,
    isError: accountError,
  } = useCurrentAccount();
  const { data: sectionsData } = useAccountSections();

  const account = accountData?.account;
  const isSuper = account?.isSuper ?? false;

  const catalog = useMemo(
    () => new Set((sectionsData?.sections ?? []).map((s) => s.key).filter(Boolean) as string[]),
    [sectionsData],
  );

  const grants = useMemo(() => {
    const map = new Map<string, AccessLevel>();
    (account?.permissions ?? []).forEach((p) => {
      if (p.section) map.set(p.section, p.access ?? ACCESS.NONE);
    });
    return map;
  }, [account]);

  // We only start gating once we have a definitive account that is not super.
  const resolved = !accountLoading && !accountError && !!account;

  const hasSection = useMemo(
    () =>
      (section?: string, level: AccessLevel = ACCESS.READ): boolean => {
        if (!section) return true;
        if (!resolved || isSuper) return true;
        // Only gate keys the backend recognises; unknown keys fail open.
        if (catalog.size > 0 && !catalog.has(section)) return true;
        return accessSatisfies(grants.get(section), level);
      },
    [resolved, isSuper, catalog, grants],
  );

  return {
    account,
    isSuper,
    isLoading: accountLoading,
    resolved,
    hasSection,
    canRead: (section?: string) => hasSection(section, ACCESS.READ),
    canWrite: (section?: string) => hasSection(section, ACCESS.WRITE),
    canManageAccounts: hasSection(SECTION.accounts, ACCESS.READ),
    canManageAccountsWrite: hasSection(SECTION.accounts, ACCESS.WRITE),
    sections: sectionsData?.sections ?? [],
  };
}
