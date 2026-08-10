import { common_Material } from 'api/proto-http/admin';
import { parseDecimalNumber } from 'utils/decimal';

// ЛЕСТНИЦА ЦЕНЫ строки BOM — одна на весь клиент.
//
// Цена строки — это ЗАМОРОЖЕННЫЙ снапшот, который ставится в момент привязки артикула
// (materialLineFields в bom-field). Цена, заведённая в справочнике ПОЗЖЕ, в строку сама не
// попадает — её переносит только ручная кнопка «обновить цены из каталога» на вкладке costing.
// Поэтому у строки два источника цены, и сервер считает костинг ровно по такой лестнице:
//
//   1) снапшот строки          → цена, согласованная на этой карте;
//   2) latest_price артикула   → текущая каталожная, на карте НЕ зафиксированная;
//   3) ничего                  → цены нет нигде.
//
// Экраны, которые показывали только первую ступень, писали «no price» на строке с проценённым
// артикулом и отправляли владельца в справочник, где он уже всё сделал. Ступени живут ЗДЕСЬ,
// чтобы плитка BOM, панель редактора строки и печатный tech-pack не могли разойтись в третий раз.

/**
 * Единственное место, которое знает, где у каталожного артикула лежит цена.
 *
 * `latest_price` — это последняя точка append-only истории цен, и валюта у неё СВОЯ. Это и есть
 * ответ на «какая валюта, если цен несколько»: точку уже выбрал сервер, валюта едет вместе с
 * числом и никогда не смешивается с валютой строки. Поле костинг-гейтед: у аккаунта без доступа к
 * костингу оно просто отсутствует (не ноль), и весь клиент честно читает это как «каталожной цены
 * нет».
 */
export function catalogPrice(m?: common_Material) {
  const value = m?.latestPrice?.price?.value?.trim() ?? '';
  return {
    value,
    // Валюта принадлежит ЧИСЛУ: подписать каталожное число валютой строки — хуже, чем не
    // подписать вовсе, поэтому без цены валюты тоже нет.
    currency: value ? (m?.latestPrice?.currency?.trim() ?? '') : '',
    // Единица — свойство САМОГО артикула (в ней же лежит и складской остаток), и каталожная цена
    // всегда котируется за неё. Поэтому она переживает отсутствие цены, в отличие от валюты.
    unit: m?.unit?.trim() ?? '',
  };
}

export type BomPriceSource = 'line' | 'catalog' | 'none';

/** Ценовые поля строки BOM как простые строки: поле формы или `decimalToInput(item.unitPrice)`. */
export type BomPriceLine = {
  unitPrice?: string;
  currency?: string;
  unit?: string;
};

export type ResolvedBomPrice = {
  source: BomPriceSource;
  /**
   * Число, валюта и единица — ОДНОЙ ступени, без смешивания. Подписать снапшотное число
   * каталожной валютой (или каталожной единицей) — та же ложь, что подписать каталожное число
   * валютой строки, только в другую сторону: «80» превращалось в «80 USD / kg», хотя ни доллара,
   * ни килограмма на карте никогда не фиксировали. Неизвестная сторона печатается пустой —
   * голое число честнее подписанного чужой подписью.
   */
  value: string;
  currency: string;
  unit: string;
  /** «80.00 PLN / m»; пустая строка, когда цены нет ни на одной ступени. */
  label: string;
  /**
   * Текущая каталожная цена — ТОЛЬКО когда у строки есть свой снапшот и каталог с ним не согласен.
   * Ради этого расхождения и живёт ручная кнопка reprice, поэтому видно его должно быть на строке,
   * а не на костинге через две вкладки.
   */
  drift?: { value: string; currency: string; unit: string; label: string };
};

/** «80.00 PLN / m». Пустое число — пустая строка, чтобы вызывающий не печатал одинокую валюту. */
export function formatBomMoney(value: string, currency?: string, unit?: string): string {
  if (!value) return '';
  return `${value}${currency ? ` ${currency}` : ''}${unit ? ` / ${unit}` : ''}`;
}

// Известная сторона против известной. Пустая сторона — «неизвестно», а не «другое»: у легаси-строк
// единица или валюта не заполнены, и объявлять дрейф по их отсутствию значило бы кричать на каждой
// такой строке о расхождении, которого никто не вносил.
const sameFacet = (a: string, b: string) => !a || !b || a === b;

// Та же цена? «80» и «80.00» — одно и то же число, записанное дважды, и сравнение строк выдумывало
// бы дрейф на каждой аккуратно переоценённой строке. Сравниваем численно (с запятой в разделителе
// тоже: поля формы набирают руками). Валюта И ЕДИНИЦА — часть цены: 80 PLN/м и 80 PLN/кг это не
// одна цена, а уехавшая в другую размерность, и молчать об этом опаснее, чем о смене числа.
function samePrice(
  a: { value: string; currency: string; unit: string },
  b: { value: string; currency: string; unit: string },
) {
  if (!sameFacet(a.currency, b.currency)) return false;
  if (!sameFacet(a.unit, b.unit)) return false;
  const na = parseDecimalNumber(a.value);
  const nb = parseDecimalNumber(b.value);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return a.value.trim() === b.value.trim();
  // Юнит-прайс хранится с точностью до 4 знаков — половина последнего разряда и есть допуск.
  return Math.abs(na - nb) < 5e-5;
}

/**
 * Цена, по которой эта строка реально считается, + чем она является (снапшот / каталог / ничего)
 * + расхождение со справочником, если снапшот есть и он устарел.
 */
export function resolveBomPrice(line: BomPriceLine, material?: common_Material): ResolvedBomPrice {
  const catalog = catalogPrice(material);
  const value = line.unitPrice?.trim() ?? '';
  const currency = line.currency?.trim() ?? '';
  const unit = line.unit?.trim() ?? '';

  // 1) Снапшот строки — цена, согласованная на карте, со СВОЕЙ валютой и СВОЕЙ единицей. Каталог
  //    не перебивает её и не дописывает ей подпись: переносить цену вправе только явный reprice,
  //    иначе карта молча меняла бы и себестоимость, и размерность под ногами.
  if (value) {
    const own = { value, currency, unit };
    const drifted = !!catalog.value && !samePrice(own, catalog);
    return {
      source: 'line',
      ...own,
      label: formatBomMoney(value, currency, unit),
      drift: drifted
        ? {
            value: catalog.value,
            currency: catalog.currency,
            unit: catalog.unit,
            // Валюта и единица — только те, что ОТЛИЧАЮТСЯ от уже напечатанных рядом с числом
            // строки: на плитке за место дерутся четыре плашки, и «каталог 95» читается, а
            // «каталог 95 PLN / m» рвёт ряд. Но «каталог 95 / kg» обязано быть напечатано
            // целиком — иначе «95» прочтут как «95 за метр».
            label: formatBomMoney(
              catalog.value,
              catalog.currency && catalog.currency !== currency ? catalog.currency : '',
              catalog.unit && catalog.unit !== unit ? catalog.unit : '',
            ),
          }
        : undefined,
    };
  }

  // 2) Каталожная цена артикула — та самая ступень, которой не было на экранах: цена в справочнике
  //    есть, на карте не зафиксирована. Единица тоже каталожная: это цена ЗА каталожную единицу.
  if (catalog.value) {
    return {
      source: 'catalog',
      ...catalog,
      label: formatBomMoney(catalog.value, catalog.currency, catalog.unit),
    };
  }

  // 3) Цены нет нигде — и только здесь «заведите её в справочнике» правда. Валюта и единица
  //    остаются строкины: подписывать нечего, но её собственные объявления печатать можно.
  return { source: 'none', value: '', currency, unit, label: '' };
}
