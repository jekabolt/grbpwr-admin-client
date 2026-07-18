import { common_Colorway } from 'api/proto-http/admin';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useProductsByIds } from 'components/managers/fittings/components/useResolvers';
import { Link, useParams } from 'react-router-dom';
import Media from 'ui/components/media';
import Text from 'ui/components/text';

function productName(product?: common_Colorway): string {
  return product?.display?.translations?.[0]?.name ?? `product #${product?.id ?? ''}`;
}

// Catalog products linked to this tech card — read-only. Post R1-merge, a colourway IS a
// product (its `styleId` points at this tech card, not the other way around), so "linked
// products" is a projection of techCard.colorways, not an independently editable list. This
// field used to read/write a `productIds` RHF field that is a total phantom: mapTechCardToForm
// always resets it to `[]` (schema.ts) and mapFormToTechCardInsert never writes it back —
// common_TechCardInsert carries no productIds at all anymore (grepped: the only other reader was
// index.tsx's "unlinks N products" warning, which the same phantom field also leaves permanently
// dead). There is no RPC to attach/detach a colourway from here, so this renders what's real
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
      <div className='flex flex-wrap items-center justify-between gap-3'>
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
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4'>
          {colorwayIds.map((cwId) => {
            const product = productMap.get(cwId);
            const name = product ? productName(product) : `#${cwId}`;
            return (
              <div key={cwId} className='min-w-0 border border-textInactiveColor p-2'>
                <Media
                  src={product?.display?.thumbnail?.media?.thumbnail?.mediaUrl || ''}
                  alt='thumbnail'
                  aspectRatio='1/1'
                  fit='contain'
                />
                <Text className='mt-1 truncate' title={name}>
                  {name}
                </Text>
                <Text variant='inactive' size='small'>
                  #{cwId}
                </Text>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
