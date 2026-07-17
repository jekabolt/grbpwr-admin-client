import Text from 'ui/components/text';
import { formatMoney, opexCategoryLabel, opexCurrencySymbol, OpexSummary } from '../utils/options';

// Summary-first header for a month: three plain stat tiles (total / one-off / recurring) and a
// monochrome "where the money goes" breakdown. Deliberately restrained — equal-weight tiles and a
// simple share bar, not a giant hero metric — so the month reads at a glance.
export function MonthSummary({ summary, base }: { summary: OpexSummary; base: string }) {
  if (summary.count === 0) return null;
  const sym = opexCurrencySymbol(base);

  return (
    <div className='flex flex-col gap-4 border border-textInactiveColor p-4'>
      <div className='grid grid-cols-1 gap-px bg-textInactiveColor sm:grid-cols-3'>
        <Tile
          label={`total · ${base}`}
          value={`${sym}${formatMoney(summary.total)}`}
          sub={
            summary.uncosted > 0
              ? `${summary.uncosted} uncosted (excluded) !`
              : `${summary.count} line${summary.count === 1 ? '' : 's'}`
          }
          alert={summary.uncosted > 0}
        />
        <Tile
          label='one-off'
          value={`${sym}${formatMoney(summary.oneOffTotal)}`}
          sub={`${summary.oneOffCount} line${summary.oneOffCount === 1 ? '' : 's'}`}
        />
        <Tile
          label='recurring ⟳'
          value={`${sym}${formatMoney(summary.recurringTotal)}`}
          sub={`${summary.recurringCount} line${summary.recurringCount === 1 ? '' : 's'}`}
        />
      </div>

      {summary.byCategory.length > 0 && (
        <div className='flex flex-col gap-2'>
          <Text size='small' variant='inactive' className='uppercase'>
            by category
          </Text>
          <div className='flex flex-col gap-1.5'>
            {summary.byCategory.map((c) => {
              const share = summary.total > 0 ? (c.total / summary.total) * 100 : 0;
              return (
                <div key={c.category} className='flex flex-col gap-0.5'>
                  <div className='flex items-baseline justify-between gap-2'>
                    <Text size='small' className='uppercase'>
                      {opexCategoryLabel(c.category)}
                      <span className='text-textInactiveColor'>
                        {' · '}
                        {c.count}
                        {c.uncosted > 0 ? ` · ${c.uncosted} uncosted !` : ''}
                      </span>
                    </Text>
                    <Text size='small'>
                      {sym}
                      {formatMoney(c.total)}
                    </Text>
                  </div>
                  <div className='h-1 w-full bg-textInactiveColor/25' role='presentation'>
                    <div
                      className='h-full bg-textColor'
                      style={{ width: `${Math.max(share, share > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div className='flex flex-col gap-1 bg-bgColor p-3'>
      <Text size='small' variant='inactive' className='uppercase'>
        {label}
      </Text>
      <Text size='large'>{value}</Text>
      {sub && (
        <Text size='small' variant={alert ? 'error' : 'inactive'}>
          {sub}
        </Text>
      )}
    </div>
  );
}
