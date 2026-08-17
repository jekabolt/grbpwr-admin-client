// РАЗБОР ИЗМЕРЕННОЙ ДЛИНЫ — «откуда это число и на что ушло полотно».
//
// ЗЕРКАЛО dxf-piece-breakdown.tsx, И ЭТО ГЛАВНОЕ, ЧТО НАДО ПРО НЕГО ЗНАТЬ. У расхода ткани два
// источника, и они рассказывают одну физику с разных концов:
//
//   «по выкройкам»  — площадь деталей ÷ раскройную ширину = NETTO. Отходов в числе НЕТ, их
//                     доначисляет процент раскроя слота.
//   «из раскладки»  — измеренная длина настила ÷ изделий = BRUTTO. Отходы уже ВНУТРИ, и процент
//                     слота на такую норму костинг не начисляет.
//
// До этого разбора второй источник не объяснял себя ничем: диалог печатал «1.737 м» и двадцать
// абзацев текста вокруг. Оператор, только что видевший «0.867 м по выкройкам» на той же ткани,
// читал два числа как два мнения — и не имел ни одного способа понять, что это netto и brutto ОДНОЙ
// длины, а разница между ними и есть то, за что он платит проценту раскроя.
//
// Здесь это сказано двумя таблицами и без единого абзаца: арифметика самого замера (длина ÷
// изделия) и разложение полотна на площадь деталей + межлекальные выпады + кромку. Разложение
// считает `markerAreaSplitCm2` — та же тройка, что уезжает в провенанс рецепта процентами, только
// в сантиметрах; второй реализации здесь нет.
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { DataTable, EmptyCell, TotalRow } from 'ui/components/data-table';
import { Pill } from 'ui/components/pill';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import type { common_TechCardMarkerSummary } from 'api/proto-http/admin';
// Разряды в см² — тем же правилом, что у dxf-разбора: два формата одного числа на двух
// поверхностях одного расчёта разъехались бы первой же правкой.
import { fmtInt, fmtNum } from './dxf-piece-breakdown';
import {
  compositionOf,
  decNum,
  markerAreaSplitCm2,
  toBomUnit,
  type FabricWeightBasis,
} from './marker-io';

/**
 * АРИФМЕТИКА ЗАМЕРА — тремя числами.
 *
 * Расход раскладки — это деление, и ошибаются в нём ровно в делителе: настил на шесть изделий,
 * посчитанный как на три, даёт вдвое завышенную норму, и на экране это по-прежнему правдоподобное
 * число. Показать делимое и делитель рядом с частным — единственный способ дать это заметить.
 *
 * Оператор («÷», «=») — часть ПОДПИСИ следующей ячейки, а не своя колонка: StatGrid сама переносит
 * ячейки на узком экране, и колонка с одним глифом при переносе повисала бы отдельной строкой.
 */
export function MarkerLengthFormula({
  lengthCm,
  units,
  unitsLabel,
  perGarment,
  unit,
  widthCm,
}: {
  /** Измеренная длина настила, см. 0 — не записана. */
  lengthCm: number;
  /** Сколько ИЗДЕЛИЙ выкраивает настил. 0 — неизвестно, и подставлять единицу нельзя. */
  units: number;
  /** Состав словами («S×2 · M×2 · L×2») — он и есть расшифровка делителя. */
  unitsLabel: string;
  /** Готовый расход на изделие в единице строки; null — перевести не в чем. */
  perGarment: number | null;
  unit: string;
  /** РАСКРОЙНАЯ ширина, на которой снят настил, см. */
  widthCm: number;
}) {
  return (
    <StatGrid min={150}>
      <Stat
        label='lay length'
        value={lengthCm > 0 ? fmtNum(lengthCm) : '—'}
        sub={widthCm > 0 ? `cm · cutting width ${fmtNum(widthCm)} cm` : 'cm'}
      />
      <Stat
        label='÷ garments in the lay'
        value={units > 0 ? units : '—'}
        sub={unitsLabel || 'composition unreadable'}
      />
      <Stat
        label='= per-unit consumption'
        value={perGarment != null ? perGarment : '—'}
        sub={unit ? `${unit} · waste already inside` : 'slot unit not set'}
      />
    </StatGrid>
  );
}

/**
 * НА ЧТО УШЛО ПОЛОТНО НАСТИЛА: площадь деталей + межлекальные выпады + кромка.
 *
 * Три слагаемых и итог, каждое — в см² и в процентах от полотна. Первая строка (площадь деталей) —
 * это и есть NETTO, то самое, что даёт расчёт «по выкройкам»; поэтому у неё в подписи стоит её
 * длина в единице строки — чтобы два инструмента наконец сравнивались числом, а не на словах.
 *
 * ПРОЦЕНТЫ ЗДЕСЬ — ОТ ПОЛОТНА, а не от площади деталей, и это НЕ те проценты, что уезжают в
 * провенанс. Провенанс считает отходы от площади ДЕТАЛЕЙ (шкала костинга: «сколько сверх netto»),
 * и там кромка бывает 6%, а выпады 38%. Здесь вопрос другой — «как поделился купленный метр», — и
 * на него отвечают доли целого, которые обязаны сойтись в 100. Смешать две шкалы в одной таблице
 * значило бы напечатать рядом числа, которые не складываются ни во что.
 */
export function MarkerAreaSplit({
  marker,
  unit,
  fabric,
  units,
}: {
  marker: common_TechCardMarkerSummary;
  unit: string;
  fabric?: FabricWeightBasis;
  /** Изделий в настиле — чтобы назвать netto НА ИЗДЕЛИЕ, а не на весь настил. */
  units: number;
}) {
  const split = markerAreaSplitCm2(marker);
  if (!split || !(split.totalCm2 > 0)) return null;
  const widthCm = decNum(marker.fabricWidthCm);
  // NETTO-ДЛИНА ЭТОГО НАСТИЛА, ПРИВЕДЁННАЯ К ИЗДЕЛИЮ — единственное число здесь, которое сравнимо
  // с «по выкройкам» напрямую: площадь деталей ÷ раскройную ширину ÷ изделия. Та же формула, что
  // у dxf-пути, до последнего делителя.
  const nettoPerGarment =
    widthCm > 0 && units > 0 ? toBomUnit(split.pieceCm2 / widthCm / units, unit, fabric) : null;

  const row = (label: string, cm2: number, note?: string) => {
    const share = cm2 / split.totalCm2;
    return (
      <tr>
        <td>
          <span className='flex min-w-0 flex-col'>
            <span className='uppercase'>{label}</span>
            {note && (
              <Text size='nano' variant='label' component='span' className='normal-case'>
                {note}
              </Text>
            )}
          </span>
        </td>
        <td>{fmtInt(cm2)}</td>
        <td>
          <span className='flex flex-col items-end gap-0.5'>
            <span>{(share * 100).toFixed(share < 0.1 ? 1 : 0)}%</span>
            {/* Полоса — монохромная, ink на треке: та же ранжированная полоса, что в разборе по
                деталям и в BarRow системы. Цветом здесь красить нечего: доля — не состояние. */}
            <span aria-hidden className='block h-[3px] w-full bg-trackBg'>
              <span
                className='block h-full bg-textColor'
                style={{ width: `${Math.min(100, Math.max(2, share * 100))}%` }}
              />
            </span>
          </span>
        </td>
      </tr>
    );
  };

  return (
    <div className='flex flex-col gap-1.5'>
      <DataTable>
        <thead>
          <tr>
            <th>where the lay cloth went</th>
            <th>cm²</th>
            <th>share</th>
          </tr>
        </thead>
        <tbody>
          {/* РАВЕНСТВО С «ПО ВЫКРОЙКАМ» НЕ ОБЕЩАЕТСЯ, И ЭТО ВАЖНО. Здесь площадь деталей ЭТОЙ
              раскладки — той геометрии, на которой её сняли. Расчёт «по выкройкам» берёт
              СЕГОДНЯШНИЕ файлы и сегодняшний припуск, и после правки лекал числа законно
              разойдутся. Сказать «столько же дал бы» значило бы пообещать совпадение, за которое
              никто не отвечает; сказано, что это одна и та же ВЕЛИЧИНА, посчитанная по разным
              данным, — и этого достаточно, чтобы два числа перестали читаться как два мнения. */}
          {row(
            'piece area',
            split.pieceCm2,
            nettoPerGarment && nettoPerGarment.value > 0
              ? `this is the NETTO of this marker: ${nettoPerGarment.value} ${unit} per unit. “from the patterns” computes the very same quantity — but from TODAY'S files, and once the pattern pieces are edited the two numbers will legitimately diverge`
              : 'this is the NETTO — the same quantity the “from the patterns” calculation gives, but on the geometry of this marker',
          )}
          {row(
            'waste between pieces',
            split.interPieceCm2,
            'the cloth between the pieces and the lay ends — this is what the cutting percent pays for when the norm is entered by something other than a marker',
          )}
          {row(
            'selvedge',
            split.selvedgeCm2,
            'along the edges of the roll, it cannot be cut from — but it is bought together with the metre',
          )}
        </tbody>
        <tfoot>
          <TotalRow>
            <td>lay cloth</td>
            <td>{fmtInt(split.totalCm2)}</td>
            <td>100%</td>
          </TotalRow>
        </tfoot>
      </DataTable>
      <Text size='nano' variant='label' component='p' className='max-w-[90ch]'>
        the split is derived from the marker's efficiency, its width and its length — it explains the
        number, but it goes nowhere and is multiplied by nothing: the measured length has already paid
        for all three terms. the terms are rounded to whole cm², the total is computed on the unrounded
        ones — the column sum may differ from it by a few units. into the recipe the same waste is
        written as percentages OF THE PIECE AREA (the costing scale), so the numbers there are
        different — it is one and the same quantity on two scales
      </Text>
    </div>
  );
}

/**
 * ПЛАН ПРИМЕНЕНИЯ ПО РАЗМЕРАМ — ТАБЛИЦЕЙ, А НЕ СТОЛБИКОМ ПОДПИСЕЙ.
 *
 * Раньше строки плана печатались как «M: 1.737 м [измерено]» — по одной в `<div>`. Читать такой
 * столбик как норму размерного ряда нельзя: числа не выровнены, происхождение стоит после числа
 * разной длины, а сравнить соседние размеры (ради чего режим и существует) можно только глазами по
 * ломаной строке. Здесь тот же набор — размер, число, происхождение, площадь — в колонках.
 *
 * ПРОИСХОЖДЕНИЕ ОСТАЁТСЯ ПИЛЮЛЕЙ СО СВОИМ `title`: три источника выглядят одинаково убедительно, а
 * стоят разного — «измерено» снято настилом, «по площади» продолжено формулой, «среднее» это тот
 * самый перекос, ради устранения которого заводился состав.
 */
export function MarkerPerSizeTable({
  rows,
  sizeNameById,
  unit,
  fabric,
  toUnit,
}: {
  rows: readonly {
    sizeId: number;
    consumptionCm: number | null;
    areaCm2?: number | null;
    origin: string;
    originLabel: string;
    originTitle?: string;
  }[];
  sizeNameById: Map<number, string>;
  unit: string;
  fabric?: FabricWeightBasis;
  toUnit: (cm: number) => { value: number; unit: string } | null;
}) {
  const anyArea = rows.some((r) => (r.areaCm2 ?? 0) > 0);
  return (
    <DataTable>
      <thead>
        <tr>
          <th>size</th>
          <th>consumption{unit ? `, ${unit}` : ''}</th>
          {anyArea && <th>garment area, cm²</th>}
          <th>where the number comes from</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const c = r.consumptionCm != null ? toUnit(r.consumptionCm) : null;
          return (
            <tr key={r.sizeId}>
              <td>{formatSizeName(sizeNameById.get(r.sizeId) ?? `#${r.sizeId}`)}</td>
              {/* НОЛЬ ПОСЛЕ ОКРУГЛЕНИЯ ЧИСЛОМ НЕ ПЕЧАТАЕТСЯ — вместо него измеренные сантиметры:
                  «0 кг» читался бы как норма, а по сантиметрам видно, ЧТО округлилось. Правило то
                  же, что у превью на строке рецепта. */}
              <td>
                {c && c.value > 0 ? (
                  c.value
                ) : r.consumptionCm != null ? (
                  <span className='text-labelColor'>{`${r.consumptionCm} cm`}</span>
                ) : (
                  <EmptyCell />
                )}
              </td>
              {anyArea && (
                <td>{(r.areaCm2 ?? 0) > 0 ? fmtInt(r.areaCm2 as number) : <EmptyCell />}</td>
              )}
              <td>
                <Pill
                  tone={r.origin === 'mean' ? 'warn' : r.origin === 'area' ? 'attention' : 'mut'}
                  title={r.originTitle}
                >
                  {r.originLabel}
                </Pill>
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

/** Состав раскладки словами, для подписи делителя: «S×2 · M×2 · L×2». */
export function compositionSummary(
  marker: common_TechCardMarkerSummary,
  sizeName: (id: number) => string,
): string {
  return compositionOf(marker)
    .map((c) => `${formatSizeName(sizeName(c.sizeId))}×${c.quantity}`)
    .join(' · ');
}
