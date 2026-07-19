import type { SizeRunEfficiencyRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { sizeVerdict } from '../productSignals';
import { ProductNameLink } from './ProductNameLink';

const Row: FC<{ row: SizeRunEfficiencyRow; note: string }> = ({ row, note }) => (
  <li className='flex items-baseline justify-between gap-3 py-1.5'>
    <div className='min-w-0 max-w-[55%] font-bold'>
      <ProductNameLink productId={row.productId} productName={row.productName} maxWidth='100%' />
    </div>
    <Text className='text-labelColor text-textBaseSize text-right'>
      sold {row.unitsSold}/{row.unitsBought} · {note}
    </Text>
  </li>
);

/** Sizes as a verdict, not a bar chart: which styles were under- vs over-bought. */
export const SizeVerdict: FC<{ sizeRunEfficiency: SizeRunEfficiencyRow[] | undefined }> = ({
  sizeRunEfficiency,
}) => {
  const { under, over } = sizeVerdict(sizeRunEfficiency);
  if (under.length === 0 && over.length === 0) return null;

  return (
    <div className='space-y-4 border border-textInactiveColor bg-bgSecondary/20 p-4'>
      <div>
        <Text variant='uppercase' className='block font-bold'>
          Sizes — buy verdict
        </Text>
        <Text className='text-labelColor text-textBaseSize block'>
          Where the size run missed: sold out early (buy deeper) vs stuck (buy shallower).
        </Text>
      </div>
      <div className='grid gap-4 md:grid-cols-2'>
        {under.length > 0 && (
          <div>
            <Text variant='uppercase' className='text-labelColor text-textBaseSize mb-1 block'>
              Under-bought — sold out early
            </Text>
            <ul>
              {under.map((r, i) => (
                <Row key={`u-${r.productId ?? i}`} row={r} note='buy deeper' />
              ))}
            </ul>
          </div>
        )}
        {over.length > 0 && (
          <div>
            <Text variant='uppercase' className='text-labelColor text-textBaseSize mb-1 block'>
              Over-bought — stuck
            </Text>
            <ul>
              {over.map((r, i) => (
                <Row key={`o-${r.productId ?? i}`} row={r} note='buy shallower' />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
