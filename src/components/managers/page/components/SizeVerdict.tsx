import type { SizeRunEfficiencyRow } from 'api/proto-http/admin';
import { FC } from 'react';
import Text from 'ui/components/text';
import { sizeVerdict } from '../productSignals';
import { ProductNameLink } from './ProductNameLink';
import { ProductSection } from './ProductSection';

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

  const verdict =
    under.length > 0 && over.length > 0
      ? 'You sell out of some sizes early (lost sales) and over-buy others (dead stock).'
      : under.length > 0
        ? 'Some sizes sell out early — buy them deeper next run.'
        : 'Some sizes are over-bought and stuck — buy them shallower.';

  return (
    <ProductSection
      title='Sizes'
      subtitle='— which sizes to buy deeper vs shallower next run'
      verdict={verdict}
    >
      <div className='grid gap-4 md:grid-cols-2'>
        {under.length > 0 && (
          <div>
            <Text variant='uppercase' className='text-labelColor text-textBaseSize mb-1 block'>
              Buy deeper · sold out early
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
              Buy shallower · dead weight
            </Text>
            <ul>
              {over.map((r, i) => (
                <Row key={`o-${r.productId ?? i}`} row={r} note='buy shallower' />
              ))}
            </ul>
          </div>
        )}
      </div>
    </ProductSection>
  );
};
