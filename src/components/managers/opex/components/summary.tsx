import { BarRow } from 'ui/components/bar-row';
import { GroupLabel } from 'ui/components/group-label';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import { money, opexCategoryLabel, OpexSummary } from '../utils/options';

// opxKpi v1 (keep) — the month reads at a glance as three equal-weight tiles (total / one-off /
// recurring) over a monochrome "where the money goes" share of BarRows. Restyled onto the shared
// StatGrid + BarRow primitives; `reveal=false` masks every figure for a non-costing viewer (opxGate
// v2) while the category structure stays legible.
export function MonthSummary({
  summary,
  base,
  reveal = true,
}: {
  summary: OpexSummary;
  base: string;
  reveal?: boolean;
}) {
  if (summary.count === 0) return null;

  return (
    <div className='flex flex-col gap-2.5'>
      <StatGrid min={150}>
        <Stat
          label={`total · ${base}`}
          value={money(summary.total, base, reveal)}
          sub={
            summary.uncosted > 0
              ? `${summary.uncosted} uncosted`
              : `${summary.count} line${summary.count === 1 ? '' : 's'}`
          }
          tone={summary.uncosted > 0 ? 'down' : undefined}
        />
        <Stat
          label='one-off'
          value={money(summary.oneOffTotal, base, reveal)}
          sub={`${summary.oneOffCount} line${summary.oneOffCount === 1 ? '' : 's'}`}
        />
        <Stat
          label='recurring ⟳'
          value={money(summary.recurringTotal, base, reveal)}
          sub={`${summary.recurringCount} line${summary.recurringCount === 1 ? '' : 's'}`}
        />
      </StatGrid>

      {summary.byCategory.length > 0 && (
        <div className='flex flex-col gap-1.5'>
          <GroupLabel flush>by category</GroupLabel>
          {summary.byCategory.map((c) => {
            const share = summary.total > 0 ? (c.total / summary.total) * 100 : 0;
            return (
              // Each category sits on its own white card (opxKpi card grammar) rather than
              // as bare text on the page ground, so the breakdown reads as a stack of cards.
              <div
                key={c.category}
                className='border border-borderColor bg-bgColor px-2.5 py-1.5'
              >
                <BarRow
                  name={
                    <>
                      {opexCategoryLabel(c.category)}
                      <span className='font-normal text-labelColor'>
                        {' · '}
                        {c.count}
                        {c.uncosted > 0 ? ` · ${c.uncosted} uncosted` : ''}
                      </span>
                    </>
                  }
                  // reveal=false: a masked strip shows the ranking bones with no magnitude (pct 0).
                  pct={reveal ? share : 0}
                  value={money(c.total, base, reveal)}
                  tone={c.uncosted > 0 ? 'down' : 'ink'}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
