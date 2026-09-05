import { common_Colorway } from 'api/proto-http/admin';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useProductsByIds } from 'components/managers/fittings/components/useResolvers';
import { Link, useParams } from 'react-router-dom';
import Media from 'ui/components/media';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';

function productName(product?: common_Colorway): string {
  return product?.display?.translations?.[0]?.name ?? `product #${product?.id ?? ''}`;
}

/**
 * ═══ B-5 · СНИМОК ПРОДУКТА, А НЕ СТРОКА «SKU — имя» ══════════════════════════════════════════
 *
 * Владелец, круг 20: «LINKED PRODUCTS давай как-то более удачно показывать пиктограмки с
 * тамбнейлом и название продукта».
 *
 * ⚠ ВТОРОГО ЗАПРОСА НЕ ЗАВЕДЕНО, И ЭТО ГЛАВНОЕ В ЭТОЙ ПРАВКЕ. Миниатюра приезжает В ТОМ ЖЕ
 * ОБЪЕКТЕ, который блок уже читал ради имени: `useProductsByIds` отдаёт `common_Colorway`, а у
 * него `display.thumbnail` — это `common_MediaFull` целиком. Адрес читается ровно тем же путём,
 * каким его читают все остальные экраны админки с миниатюрой продукта
 * (`display?.thumbnail?.media?.thumbnail?.mediaUrl` — каталог товаров, пикер героя, пикер
 * кастом-заказа, рельс архива): один путь, одна форма отказа. Заводить здесь второй резолвер
 * значило бы платить N запросов за факт, который уже лежит в кэше react-query.
 *
 * НЕТ АДРЕСА — ПОЛОСАТЫЙ КАДР, А НЕ ПУСТОЙ БЕЛЫЙ. Пустая белая коробка читается как поломка,
 * полосатая — как «слот, в котором пока ничего нет»; это правило `Placeholder`, а не выбор
 * этого экрана. Пропорция кадра 3/4 — портрет, как снимают продукт, и она ОДНА на все плитки:
 * `Media` держит её сама, поэтому ряд не разъезжается по низу от того, какой снимок приехал.
 */
function productThumb(product?: common_Colorway): string {
  return product?.display?.thumbnail?.media?.thumbnail?.mediaUrl ?? '';
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
        /* ПЛИТКИ, А НЕ РЯДЫ. `Row` — это подпись и ЧИСЛО: он выравнивает второй столбец вправо и
           табулирует его, чтобы стопка цифр читалась как ведомость. Здесь во втором столбце стояло
           имя товара, то есть ряд обещал ведомость и печатал прозу, а подпись «SKU» повторялась
           на каждой строке, ничего не различая. Продукт узнают по снимку — значит плитка.
           Дорожка 96px — наименьший кадр, на котором вещь ещё узнаётся; сетка сама решает, сколько
           их встанет в ряд, поэтому блок одинаково работает и в половину ширины шапки, и во всю. */
        <div data-b5-products=''>
          <Tiles min={96}>
            {colorwayIds.map((cwId) => {
              const product = productMap.get(cwId);
              const name = product ? productName(product) : `#${cwId}`;
              const url = productThumb(product);
              return (
                /* Обёртка несёт якорь пробы, а не разметку: `Tiles` кладёт `[&>*]:min-w-0` на
                   ДЕТЕЙ грида, то есть на неё, и заворачивать плитку в свой div — объявленный
                   приём примитива, а не обход. Плитка внутри тянется `h-full`. */
                <div key={cwId} data-b5-product={cwId}>
                  <Tile
                    title={name}
                    name={name}
                    /* Подпись снимается, когда продукт НЕ разрешился: там `name` уже вырожден в
                       `#502`, и вторая строка печатала бы то же самое число второй раз — плитка
                       выглядела бы сломанной ровно в тот момент, когда важно понять, что вещи
                       просто нет. `sub` у `Tile` необязателен и рисуется через `{sub && …}`,
                       поэтому `undefined` честно убирает строку, а не оставляет пустую. */
                    sub={product ? `#${cwId}` : undefined}
                    media={
                      url ? (
                        <Media src={url} alt={name} aspectRatio='3/4' fit='cover' />
                      ) : (
                        <Placeholder aspect='3/4' />
                      )
                    }
                  />
                </div>
              );
            })}
          </Tiles>
        </div>
      )}
    </div>
  );
}
