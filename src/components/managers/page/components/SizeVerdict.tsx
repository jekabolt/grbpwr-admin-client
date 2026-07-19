import type { SizeRunEfficiencyRow } from 'api/proto-http/admin';
import { FC } from 'react';
import { sizeVerdict } from '../productSignals';
import { ProductNameLink } from './ProductNameLink';
import { ProductSection } from './ProductSection';
import { ActPill, ColHead, VerdictColumns, VerdictList, VerdictRow } from './VerdictList';

function soldPct(row: SizeRunEfficiencyRow): number {
  const bought = row.unitsBought ?? 0;
  return bought > 0 ? Math.round(((row.unitsSold ?? 0) / bought) * 100) : 0;
}

/** Sizes as a verdict, not a bar chart: which styles were under- vs over-bought. Two columns
 *  (sold-out early = red, dead weight = gray) with a buy/cut act pill — matches products-final. */
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
      <VerdictColumns>
        {under.length > 0 && (
          <div>
            <ColHead crit>Buy deeper · sold out early</ColHead>
            <VerdictList>
              {under.map((r, i) => (
                <VerdictRow
                  key={`u-${r.productId ?? i}`}
                  name={
                    <ProductNameLink
                      productId={r.productId}
                      productName={r.productName}
                      maxWidth='100%'
                    />
                  }
                  why={`${soldPct(r)}% sold — under-bought`}
                  act={<ActPill tone='crit'>+ buy</ActPill>}
                />
              ))}
            </VerdictList>
          </div>
        )}
        {over.length > 0 && (
          <div>
            <ColHead>Buy shallower · dead weight</ColHead>
            <VerdictList>
              {over.map((r, i) => (
                <VerdictRow
                  key={`o-${r.productId ?? i}`}
                  name={
                    <ProductNameLink
                      productId={r.productId}
                      productName={r.productName}
                      maxWidth='100%'
                    />
                  }
                  why={`${soldPct(r)}% sold — over-bought`}
                  act={<ActPill>− cut</ActPill>}
                />
              ))}
            </VerdictList>
          </div>
        )}
      </VerdictColumns>
    </ProductSection>
  );
};
