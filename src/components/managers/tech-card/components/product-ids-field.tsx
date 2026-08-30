import { common_Colorway } from 'api/proto-http/admin';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useProductsByIds } from 'components/managers/fittings/components/useResolvers';
import { Link, useParams } from 'react-router-dom';
import Text from 'ui/components/text';
import { Row } from 'ui/components/row';

function productName(product?: common_Colorway): string {
  return product?.display?.translations?.[0]?.name ?? `product #${product?.id ?? ''}`;
}

// Catalog products linked to this tech card — read-only. Post R1-merge, a colourway IS a
// product (its `styleId` points at this tech card, not the other way around), so "linked
// products" is a projection of techCard.colorways, not an independently editable list. This
// field used to read/write a `productIds` RHF field that was a phantom — common_TechCardInsert
// carries no productIds at all anymore, so the key has since been deleted from the form schema
// along with index.tsx's "unlinks N products" warning, its only other reader.
// There is no RPC to attach/detach a colourway from here, so this renders what's real
// (techCard.colorways) and points to where a link is actually made (the colourways tab). Fetches
// its own copy of the tech card since this field receives no props from its caller — react-query
// dedupes against the page-level load, so this is effectively free once the tab has loaded.
export function ProductIdsField() {
  const { id } = useParams<{ id: string }>();
  const numId = id ? parseInt(id, 10) : undefined;
  const { data: techCard } = useTechCard(numId);

  const colorwayIds = (techCard?.colorways ?? [])
    .map((c) => c.colorwayId)
    .filter((cwId): cwId is number => cwId != null);
  const productMap = useProductsByIds(colorwayIds);

  if (!numId) {
    return (
      <Text variant='inactive' size='small'>
        save this tech card first — linked products are its colourways, created from the colourways
        tab.
      </Text>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-1'>
        <Text variant='inactive' size='small'>
          every colourway of this style is a product — this list is read-only. Add, remove or
          archive colourways from the colourways tab.
        </Text>
        <Link
          to={`/tech-cards/${numId}?tab=colorways`}
          className='shrink-0 text-textBaseSize uppercase underline'
        >
          go to colourways
        </Link>
      </div>

      {colorwayIds.length === 0 ? (
        <Text variant='inactive' size='small'>
          no colourways yet
        </Text>
      ) : (
        <div>
          {colorwayIds.map((cwId) => {
            const product = productMap.get(cwId);
            const name = product ? productName(product) : `#${cwId}`;
            return (
              <Row
                key={cwId}
                label={
                  <Text size='small' component='span' variant='inactive'>
                    SKU
                  </Text>
                }
                value={
                  <span className='flex min-w-0 items-center gap-2'>
                    <span className='truncate' title={name}>
                      {name}
                    </span>
                    <Text variant='inactive' size='small' component='span'>
                      #{cwId}
                    </Text>
                  </span>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
