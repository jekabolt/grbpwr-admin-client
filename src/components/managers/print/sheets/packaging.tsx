import type { PackagingRecipeLine, common_TechCardPackaging } from 'api/proto-http/admin';
import { KV, Nothing, Sheet, TD, TH } from 'components/managers/print/sheet';

// ЛИСТ УПАКОВКИ — один на обе бумаги.
//
// До этого он был раздвоен, и не дословно: тех-пак печатал статичную часть (укладка, полибэг,
// стикер, вкладыш, маркировка, габариты, вес нетто/брутто) плюс отдельно packaging recipe;
// наряд — считаемую от тиража половину (изделий, коробов, вес партии), без стикера и рецепта.
// Две вёрстки одного предмета расходятся молча: поле, добавленное в одну, не появляется в другой,
// и цех получает разные инструкции по укладке из двух листов одной партии. Здесь ОБЪЕДИНЕНИЕ
// полей, а не пересечение.
//
// СЧИТАЕМАЯ и ОПИСАТЕЛЬНАЯ половины разведены намеренно (правило приехало из наряда): карта, где
// заполнены укладка и полибэг, но не заведено «штук в коробе», не должна объявляться «не
// описанной» целиком — цех потерял бы инструкцию по укладке из-за отсутствия числа, к укладке
// отношения не имеющего. Не считается ровно то, чего не из чего посчитать.

export function PackagingSheet({
  title,
  packaging,
  recipeRows = [],
  recipeIsGlobalFallback = false,
  recipeIsLive = false,
  plannedTotal = 0,
}: {
  title: string;
  packaging?: common_TechCardPackaging;
  recipeRows?: PackagingRecipeLine[];
  /** Рецепт стиля не заведён, печатается глобальный — это надо назвать, а не выдать за стилевой. */
  recipeIsGlobalFallback?: boolean;
  /**
   * Бумага печатается по снапшоту релиза, но РЕЦЕПТ упаковки в снапшот не входит (он живёт в
   * ListPackagingRecipe, снапшот — common.TechCard) и печатается сегодняшним. Описательная
   * половина (`packaging`) при этом ИЗ снапшота — пометить надо ровно таблицу рецепта, а не лист
   * целиком, иначе пометка врала бы про замороженную половину.
   */
  recipeIsLive?: boolean;
  /**
   * Тираж партии ЦЕЛИКОМ (по выбранному колорвею, но по ВСЕМ его размерам). 0 — печать без
   * прогона: считаемая половина отсутствует, а не обнуляется.
   *
   * Не сужать по печатаемым размерам: короба и вес — факт отгрузки всей партии, а не свойство
   * листа. Посчитай их от поднабора размеров — и два листа одной партии назовут разное число
   * коробов, а грузчик поверит тому, который у него в руках.
   */
  plannedTotal?: number;
}) {
  const perBox = Number(packaging?.unitsPerBox ?? 0) || 0;
  const netG = Number(packaging?.weightNetGrams ?? 0) || 0;
  const grossG = Number(packaging?.weightGrossGrams ?? 0) || 0;
  // Нецелый короб округляется вверх — половину короба не отгружают. Пусто, а не «0»: ноль коробов
  // означал бы «отгружать нечего», а не «посчитать не из чего».
  const cartons = perBox > 0 && plannedTotal > 0 ? Math.ceil(plannedTotal / perBox) : 0;
  const batchWeightG = cartons > 0 && grossG > 0 ? cartons * grossG : plannedTotal * netG;

  return (
    <Sheet title={title}>
      {!packaging ? (
        <Nothing>
          packaging is not described in the tech card — no folding, no carton, no weight.
        </Nothing>
      ) : (
        <div className='grid grid-cols-2 gap-x-8'>
          <div>
            <KV k='folding' v={packaging.foldingMethod} />
            <KV k='polybag' v={packaging.polybag} />
            <KV k='bag sticker' v={packaging.bagSticker} />
            <KV k='insert card' v={packaging.inserts} />
            <KV k='carton marking' v={packaging.boxMarking} />
            <KV k='carton dimensions' v={packaging.boxDimensions} />
          </div>
          <div>
            <KV k='pcs per carton' v={packaging.unitsPerBox || ''} />
            <KV
              k='weight net / gross'
              v={netG || grossG ? `${netG || '—'} / ${grossG || '—'} g` : ''}
            />
            {plannedTotal > 0 && (
              <>
                <KV k='units in run' v={plannedTotal} />
                <KV k='cartons' v={cartons || ''} />
                <KV
                  k='run weight'
                  v={
                    batchWeightG > 0
                      ? `${(batchWeightG / 1000).toFixed(batchWeightG >= 10000 ? 0 : 1)} kg`
                      : ''
                  }
                />
                {perBox === 0 && (
                  <p className='mt-1 text-nano uppercase text-labelColor'>
                    &quot;pcs per carton&quot; is not set on the card — nothing to compute cartons
                    and batch weight from.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {recipeRows.length > 0 && (
        <>
          {recipeIsGlobalFallback && (
            <p className='mt-3 text-nano uppercase text-labelColor'>
              no style-specific packaging recipe — the global one is printed
            </p>
          )}
          {recipeIsLive && (
            <p className='mt-3 text-nano uppercase text-labelColor'>
              live data — the packaging recipe below is not part of the revision snapshot and is
              printed as of today
            </p>
          )}
          <table className='mt-1 w-full border-collapse text-micro'>
            <thead>
              <tr>
                <th className={TH}>material</th>
                <th className={TH}>unit</th>
                <th className={`${TH} text-right`}>qty / order</th>
                <th className={`${TH} text-right`}>qty / item</th>
              </tr>
            </thead>
            <tbody>
              {recipeRows.map((p, i) => (
                <tr key={p.id ?? i} className='break-inside-avoid'>
                  <td className={TD}>{p.materialName || `#${p.materialId}`}</td>
                  {/* Единица обязана стоять рядом с числом: «1.5» без «m» — не количество, а
                      загадка. Она печаталась в старом тех-паке и чуть не потерялась при слиянии. */}
                  <td className={TD}>{p.materialUnit || '—'}</td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    {p.qtyPerOrder?.value?.trim() || '—'}
                  </td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    {p.qtyPerItem?.value?.trim() || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Sheet>
  );
}
