import { isActiveRoute, ROUTES } from 'constants/routes';
import { cn } from 'lib/utility';
import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Text from 'ui/components/text';

const TABS: { label: string; route: string }[] = [
  { label: 'journal', route: ROUTES.accounting },
  { label: 'accounts', route: ROUTES.accountingAccounts },
  { label: 'reports', route: ROUTES.accountingReports },
  { label: 'periods', route: ROUTES.accountingPeriods },
  { label: 'events', route: ROUTES.accountingEvents },
];

type Props = {
  children?: ReactNode;
};

// Shared title bar for all four accounting screens (02.4): section title, the four
// intra-section tabs (journal is the section's landing route, `/accounting`), and a
// right-aligned slot for screen-specific actions (new entry, new account, close period…).
// Styled after opex/page.tsx's header bar; unlike opex's view=monthly|recurring toggle these
// tabs are real routes, so each is independently deep-linkable and gets its own Suspense
// boundary (02.2).
export function AcctSectionHeader({ children }: Props) {
  const { pathname } = useLocation();

  // /accounting is both the section root and the journal tab's own route, so a naive
  // isActiveRoute(pathname, ROUTES.accounting) prefix-matches every nested tab too (e.g.
  // /accounting/accounts starts with "/accounting/") and journal would underline alongside
  // whichever tab is actually open. Resolve the most specific (non-root) tab first and only
  // fall back to the root when nothing nested matches.
  const activeRoute =
    TABS.find((t) => t.route !== ROUTES.accounting && isActiveRoute(pathname, t.route))?.route ??
    ROUTES.accounting;

  return (
    <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3'>
      <div className='flex flex-wrap items-center gap-6'>
        <Text variant='uppercase' size='large'>
          accounting
        </Text>
        <nav className='flex items-center gap-4'>
          {TABS.map((tab) => {
            const active = tab.route === activeRoute;
            return (
              <Link
                key={tab.route}
                to={tab.route}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'text-textBaseSize uppercase underline-offset-4 transition-opacity hover:opacity-70',
                  active ? 'text-textColor underline' : 'text-textInactiveColor',
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children ? <div className='flex items-center gap-2'>{children}</div> : null}
    </div>
  );
}
