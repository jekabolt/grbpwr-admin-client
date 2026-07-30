import { OpexLine } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
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
import { useOpexLinesRange, useOpexRecurring } from './utils/hooks';
import {
  currentMonth,
  lineMonthKey,
  MASK,
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
// opxGate v2 — this screen is costing-gated, but instead of a wall the STRUCTURE (months,
// categories, line labels) always renders; only the figures are masked (`•••`) for a viewer without
// costing:read. NB the backend may itself null/empty a non-costing read — we mask over whatever it
// returns; a truly empty read is the documented `opex-masked-read` gap, not something the client can
// synthesise structure for.
export function OpexPage() {
  const { canReadCosting, canWriteCosting } = usePermissions();
  const { dictionary } = useDictionary();
  const base = (dictionary?.baseCurrency || 'EUR').toUpperCase();

  const [params, setParams] = useSearchParams();
  const isRecurring = params.get('view') === 'recurring';
  const month = params.get('month') || currentMonth();

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
    const keys: string[] = [];
    for (let m = end; m >= start; m = shiftMonth(m, -1)) keys.push(m); // most-recent first
    // Fetch one extra month before the window so "copy from previous month" always has its source,
    // even when the oldest window month is selected.
    return { windowKeys: keys, rangeFrom: shiftMonth(start, -1), rangeTo: end };
  }, [month]);

  // One range query powers the rail counts, the strip totals and the selected month's lines.
  const { data, isLoading, isError, refetch } = useOpexLinesRange(rangeFrom, rangeTo);

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
  const { data: recurringData } = useOpexRecurring(false);
  const templateCount = recurringData?.recurring?.length ?? 0;

  const rail = (
    <SideRail width={168}>
      <SideRailGroup flush>months</SideRailGroup>
      {buckets.map((b) => (
        <SideRailItem
          key={b.key}
          label={monthLabelShort(b.key)}
          // Line count is structure (shown to everyone); an uncosted month raises a warning badge
          // that takes precedence over the count.
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

  return (
    <div className='flex flex-col gap-3 pb-16'>
      <SectionHeader
        title='opex'
        question='what did the business spend each month, folded to the base currency?'
      />

      {!canReadCosting && (
        <CalloutBox tone='note'>
          <Text size='micro' variant='label' component='span'>
            You are viewing OPEX without costing access — the structure is shown but every amount is
            masked ({MASK}). Ask an admin for the costing section to see the figures.
          </Text>
        </CalloutBox>
      )}

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
