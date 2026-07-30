import { OpexLine } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalloutBox } from 'ui/components/callout-box';
import { Pill } from 'ui/components/pill';
import { SectionHeader } from 'ui/components/section-header';
import {
  SideRail,
  SideRailGroup,
  SideRailItem,
  SideRailLayout,
} from 'ui/components/side-rail';
import Text from 'ui/components/text';
import { MonthlyContent } from './components/monthly-tab';
import { RecurringTab } from './components/recurring-tab';
import { isPermissionDenied, useOpexLinesRange, useOpexRecurring } from './utils/hooks';
import {
  currentMonth,
  lineMonthKey,
  MonthBucket,
  monthLabelShort,
  shiftMonth,
  sumBase,
} from './utils/options';

// OPEX v2 (NF-08): monthly fixed-cost lines + recurring templates.
//
// opxNav v3 — the two-button view toggle is replaced by a SideRailLayout: the left rail lists the
// months (most-recent first) plus a "templates" group whose one item switches to the recurring
// screen. `?view=recurring` and `?month=YYYY-MM` stay in the URL so any month is shareable.
//
// opxGate v3 — this screen is costing-gated and the gate is a WALL, not a mask. The backend denies
// ListOpexLines / ListOpexRecurring outright (PermissionDenied) without costing:read rather than
// shaping them to an empty success, so there is no structure to render and no retry that could ever
// work; promising "structure shown, figures masked" over a permanent load error was a lie. The
// mask plumbing (`money(..., reveal)`) stays in the tabs so a future shaped-read backend can switch
// this back by flipping the wall off — today the tabs only ever mount with canRead true.

/** A rail/URL month key. Anything else is not a month and must never reach shiftMonth. */
const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const isMonthKey = (value: string | null | undefined): value is string =>
  !!value && MONTH_KEY_RE.test(value);

/** The rail shows a rolling year. */
const WINDOW_MONTHS = 12;

export function OpexPage() {
  const { canReadCosting, canWriteCosting } = usePermissions();
  const { dictionary } = useDictionary();
  const base = (dictionary?.baseCurrency || 'EUR').toUpperCase();

  const [params, setParams] = useSearchParams();
  const isRecurring = params.get('view') === 'recurring';
  // ?month= is user input (a shared link, a typo, a truncated URL). shiftMonth returns
  // unparseable input UNCHANGED, so an invalid value used to make the window loop below spin
  // forever — `m = shiftMonth(m, -1)` never advanced and the render hung the tab. Validate once
  // here; everything downstream can then assume a real YYYY-MM.
  const rawMonth = params.get('month');
  const month = isMonthKey(rawMonth) ? rawMonth : currentMonth();

  // Rewrite a malformed ?month= so the bad value doesn't survive a reload or get re-shared. Only
  // the month key is touched — ?view= must keep working.
  useEffect(() => {
    if (rawMonth === null || isMonthKey(rawMonth)) return;
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('month', currentMonth());
        return p;
      },
      { replace: true },
    );
  }, [rawMonth, setParams]);

  const selectMonth = (m: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('view');
        p.set('month', m);
        return p;
      },
      { replace: true },
    );
  const selectRecurring = () =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('view', 'recurring');
        return p;
      },
      { replace: true },
    );

  // A 12-month window that always contains the selected month (normally ending at the current
  // month; a future- or deep-past-selected month re-anchors the window onto itself).
  const { windowKeys, rangeFrom, rangeTo } = useMemo(() => {
    const cur = currentMonth();
    let end = month > cur ? month : cur;
    let start = shiftMonth(end, -11);
    if (month < start) {
      end = month;
      start = shiftMonth(month, -11);
    }
    // Most-recent first. The length bound is belt-and-braces: `month` is validated above, but a
    // non-advancing shiftMonth must never be able to hang a render again.
    const keys: string[] = [];
    for (let m = end; m >= start && keys.length < WINDOW_MONTHS; m = shiftMonth(m, -1)) {
      keys.push(m);
    }
    // Fetch one extra month before the window so "copy from previous month" always has its source,
    // even when the oldest window month is selected.
    return { windowKeys: keys, rangeFrom: shiftMonth(start, -1), rangeTo: end };
  }, [month]);

  // One range query powers the rail counts, the strip totals and the selected month's lines. Kept
  // off the wire entirely without costing:read — the backend would only deny it.
  const { data, isLoading, isError, error, refetch } = useOpexLinesRange(
    rangeFrom,
    rangeTo,
    canReadCosting,
  );

  const linesByMonth = useMemo(() => {
    const map = new Map<string, OpexLine[]>();
    for (const l of data?.lines ?? []) {
      const k = lineMonthKey(l);
      (map.get(k) ?? map.set(k, []).get(k)!).push(l);
    }
    return map;
  }, [data]);

  const buckets = useMemo<MonthBucket[]>(
    () =>
      windowKeys.map((key) => {
        const ls = linesByMonth.get(key) ?? [];
        const { total, uncosted } = sumBase(ls);
        return { key, total, uncosted, count: ls.length };
      }),
    [windowKeys, linesByMonth],
  );

  // Rail badge for the templates group: how many recurring templates are on file.
  const { data: recurringData } = useOpexRecurring(false, canReadCosting);
  const templateCount = recurringData?.recurring?.length ?? 0;

  // The client's costing grant and the backend's can disagree (costing is resolved from
  // ListAccountSections and fails open while it loads). A 403 on the range read is the backend's
  // answer, so treat it exactly like a missing grant instead of showing a retry that can't succeed.
  const denied = !canReadCosting || (isError && isPermissionDenied(error));

  const rail = (
    <SideRail width={168}>
      <SideRailGroup flush>months</SideRailGroup>
      {buckets.map((b) => (
        <SideRailItem
          key={b.key}
          label={monthLabelShort(b.key)}
          // Line count is structure; an uncosted month raises a warning badge that takes
          // precedence over the count.
          count={b.count || undefined}
          badge={
            b.uncosted > 0 ? (
              <Pill tone='warn' title={`${b.uncosted} uncosted`}>
                !
              </Pill>
            ) : undefined
          }
          selected={!isRecurring && b.key === month}
          onClick={() => selectMonth(b.key)}
        />
      ))}
      <SideRailGroup>templates</SideRailGroup>
      <SideRailItem
        label='recurring ⟳'
        count={templateCount || undefined}
        selected={isRecurring}
        onClick={selectRecurring}
      />
    </SideRail>
  );

  const header = (
    <SectionHeader
      title='opex'
      question='what did the business spend each month, folded to the base currency?'
    />
  );

  if (denied) {
    return (
      <div className='flex flex-col gap-3 pb-16'>
        {header}
        <CalloutBox tone='note' className='flex flex-col items-start gap-2'>
          <Text size='micro' variant='label' tracking='label' component='span' className='font-bold uppercase'>
            opex needs costing access
          </Text>
          <Text size='micro' variant='label' component='span'>
            OPEX lines and recurring templates are costing-gated: the backend refuses these reads
            outright for an account without the costing section, so there is nothing to show — not
            even the month structure. Ask a super admin for costing read access.
          </Text>
        </CalloutBox>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-3 pb-16'>
      {header}

      <SideRailLayout rail={rail}>
        {isRecurring ? (
          <RecurringTab base={base} canWrite={canWriteCosting} canRead={canReadCosting} />
        ) : (
          <MonthlyContent
            month={month}
            onSelectMonth={selectMonth}
            linesByMonth={linesByMonth}
            base={base}
            canWrite={canWriteCosting}
            canRead={canReadCosting}
            isLoading={isLoading}
            isError={isError}
            refetch={refetch}
          />
        )}
      </SideRailLayout>
    </div>
  );
}
