import type { BusinessMetrics } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { ProductNameLink } from './ProductNameLink';

interface CrossSellTableProps {
  metrics: BusinessMetrics | undefined;
}

// A pair bought together once or twice is chance, not a bundling signal — require real support.
const MIN_SUPPORT = 3;
// Lift > 1 means the pair sells together MORE than their solo rates predict. At/below 1 the
// co-occurrence is just two popular items crossing paths — not a bundle worth merchandising.
const MIN_LIFT = 1;

/** confidence/support are 0–1 probabilities from the backend; show as whole percents. */
function pct(fraction: number | undefined): string {
  return `${Math.round((fraction ?? 0) * 100)}%`;
}

export const CrossSellTable: FC<CrossSellTableProps> = ({ metrics }) => {
  const all = metrics?.commerce?.crossSellPairs ?? [];
  // Backend now ships lift; when present, rank by association strength and drop chance pairs.
  // Fall back to raw-count support if an older payload omits lift.
  const hasLift = all.some((p) => p.lift != null);
  const pairs = all
    .filter((p) => (p.count ?? 0) >= MIN_SUPPORT)
    .filter((p) => (hasLift ? (p.lift ?? 0) >= MIN_LIFT : true))
    .sort((a, b) => (hasLift ? (b.lift ?? 0) - (a.lift ?? 0) : (b.count ?? 0) - (a.count ?? 0)))
    .slice(0, 20);

  if (pairs.length === 0) return null;

  return (
    <div className='space-y-4'>
      <Text variant='uppercase' className='font-bold'>
        Frequently bought together
      </Text>
      <div className='border border-textInactiveColor overflow-x-auto'>
        <table className='w-full text-textBaseSize'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2 uppercase'>Product A</th>
              <th className='text-left p-2 uppercase'>Product B</th>
              <th className='text-right p-2 uppercase'>Together</th>
              <th className='text-right p-2 uppercase'>Attach rate</th>
              {hasLift && <th className='text-right p-2 uppercase'>Lift</th>}
            </tr>
          </thead>
          <tbody>
            {pairs.map((p, i) => {
              const lift = p.lift ?? 0;
              // >1.5× is a strong bundle worth a cross-sell slot; 1–1.5× is mild.
              const liftClass =
                lift >= 1.5 ? 'text-green-600 font-bold' : lift > 1 ? 'font-bold' : '';
              return (
                <tr key={i} className='border-b border-textInactiveColor last:border-0'>
                  <td className='p-2'>
                    <ProductNameLink productId={p.productAId} productName={p.productAName} />
                  </td>
                  <td className='p-2'>
                    <ProductNameLink productId={p.productBId} productName={p.productBName} />
                  </td>
                  <td className='p-2 text-right' title={`support ${pct(p.support)} of all orders`}>
                    {p.count ?? 0}
                  </td>
                  {/* Confidence = P(B|A): of orders with A, the share that also bought B. */}
                  <td className='p-2 text-right'>{pct(p.confidence)}</td>
                  {hasLift && <td className={`p-2 text-right ${liftClass}`}>{lift.toFixed(1)}×</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Text className='text-xs text-textInactiveColor'>
        {hasLift
          ? `Pairs bought together ${MIN_SUPPORT}+ times, ranked by lift. Lift = how much more often the pair sells together than their solo rates predict (>1× = a real bundle, not chance). Attach rate is the share of A's orders that also bought B.`
          : `Only pairs bought together ${MIN_SUPPORT}+ times.`}
      </Text>
    </div>
  );
};
