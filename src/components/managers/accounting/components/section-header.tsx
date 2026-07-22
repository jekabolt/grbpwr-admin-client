import { isActiveRoute, ROUTES } from 'constants/routes';
import { cn } from 'lib/utility';
import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Text from 'ui/components/text';

const TABS: { label: string; route: string }[] = [
  { label: 'journal', route: ROUTES.accounting },
  { label: 'accounts', route: ROUTES.accountingAccounts },
  { label: 'reports', route: ROUTES.accountingReports },
  { label: 'bank', route: ROUTES.accountingBank },
  { label: 'ap / ar', route: ROUTES.accountingSubledgers },
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
    // Column on phones (title/action row, then the tab strip below); the original single inline row
    // from md up. Without this the 7-tab <nav> was a non-wrapping ~545px flex row that ran wider than
    // a phone viewport and scrolled the WHOLE page sideways (this header is shared by every
    // accounting screen, so it broke all of them).
    <div className='-mx-2.5 flex flex-col gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3 md:flex-row md:flex-wrap md:items-center md:justify-between'>
      <div className='flex min-w-0 items-center gap-4 md:gap-6'>
        <Text variant='uppercase' size='large' className='shrink-0'>
          accounting
        </Text>
        {/* min-w-0 lets this flex child shrink below its content width so overflow-x-auto can take
            over and scroll the tabs, instead of the tabs forcing the page wider. */}
        <nav className='-my-1 flex min-w-0 items-center gap-4 overflow-x-auto py-1'>
          {TABS.map((tab) => {
            const active = tab.route === activeRoute;
            return (
              <Link
                key={tab.route}
                to={tab.route}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'shrink-0 whitespace-nowrap text-textBaseSize uppercase underline-offset-4 transition-opacity hover:opacity-70',
                  active ? 'text-textColor underline' : 'text-textInactiveColor',
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children ? <div className='flex shrink-0 items-center gap-2'>{children}</div> : null}
    </div>
  );
}
