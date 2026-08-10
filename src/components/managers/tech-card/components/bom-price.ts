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
  drift?: { value: string; currency: string; label: string };
};

/** «80.00 PLN / m». Пустое число — пустая строка, чтобы вызывающий не печатал одинокую валюту. */
export function formatBomMoney(value: string, currency?: string, unit?: string): string {
  if (!value) return '';
  return `${value}${currency ? ` ${currency}` : ''}${unit ? ` / ${unit}` : ''}`;
}

// Та же цена? «80» и «80.00» — одно и то же число, записанное дважды, и сравнение строк выдумывало
// бы дрейф на каждой аккуратно переоценённой строке. Сравниваем численно (с запятой в разделителе
// тоже: поля формы набирают руками). Смена валюты — дрейф сама по себе, даже при том же числе.
function samePrice(a: { value: string; currency: string }, b: { value: string; currency: string }) {
  if (a.currency && b.currency && a.currency !== b.currency) return false;
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

  // 1) Снапшот строки — цена, согласованная на карте. Каталог её не перебивает: переносить цену
  //    вправе только явный reprice, иначе карта молча меняла бы себестоимость под ногами.
  if (value) {
    const cur = currency || catalog.currency;
    const u = unit || catalog.unit;
    const drifted = !!catalog.value && !samePrice({ value, currency: cur }, catalog);
    return {
      source: 'line',
      value,
      currency: cur,
      unit: u,
      label: formatBomMoney(value, cur, u),
      drift: drifted
        ? {
            value: catalog.value,
            currency: catalog.currency,
            // Валюта — только если она НЕ та, что уже напечатана рядом с числом строки: на плитке
            // за место дерутся четыре плашки, и «каталог 95» читается, а «каталог 95 PLN» рвёт ряд.
            label: formatBomMoney(
              catalog.value,
              catalog.currency && catalog.currency !== cur ? catalog.currency : '',
            ),
          }
        : undefined,
    };
  }

  // 2) Каталожная цена артикула — та самая ступень, которой не было на экранах: цена в справочнике
  //    есть, на карте не зафиксирована.
  if (catalog.value) {
    const u = catalog.unit || unit;
    return {
      source: 'catalog',
      value: catalog.value,
      currency: catalog.currency,
      unit: u,
      label: formatBomMoney(catalog.value, catalog.currency, u),
    };
  }

  // 3) Цены нет нигде — и только здесь «заведите её в справочнике» правда.
  return {
    source: 'none',
    value: '',
    currency: currency || catalog.currency,
    unit: unit || catalog.unit,
    label: '',
  };
}
