// КАКИЕ ЛИСТЫ ВЫКРОЕК ПРИНАДЛЕЖАТ КАКОЙ ТКАНИ — один ответ на всех, кто его спрашивает.
//
// Раскладка (одна ткань — один настил), очередь раскроя партии и панель выкроек задают ровно этот
// вопрос, и раньше на него отвечал ИНЛАЙНОВЫЙ мемо внутри `patterns-field.tsx`. Пока спрашивал
// один экран, это было незаметно; второму спрашивающему пришлось бы завести вторую копию правила —
// а правило здесь не «сгруппировать по полю», и разъехаться копии умеют молча:
//
//   лист несёт СЫРУЮ привязку (назначение ЛИБО строка BOM), а принадлежность решает СЕГОДНЯШНИЙ
//   BOM. Лист, привязанный к строке L, которую потом разложили в назначение P, принадлежит теперь
//   P — и сравнение сырых ключей с ключами групп выбросило бы его в «без материала» ровно в тот
//   момент, когда оператор навёл порядок в BOM.
//
// Поэтому резолвер один (`scopeKeyOfBinding`), и зовут его отсюда обе стороны.
//
// Модуль НАМЕРЕННО лёгкий: из тяжёлого графа раскладки (dxf-parser, clipper, воркер) он не тянет
// ничего, поэтому его свободно импортируют и главный бандл, и ленивый чанк.
import { isDxfUrl } from 'utils/pattern';
import { scopeKeyOfBinding, type FabricScope, type RollGoodsLine } from '../bom-purpose';
import { patternSheetName } from './sheet-name';

/** Сырая привязка листа, как она лежит в строке формы. */
export type ScopeBinding = { fabricPurpose?: string; bomLineKey?: string };

/** Лист для движка: имя (подпись и ключ провенанса в блобе) и адрес на CDN. */
export type ScopedSheet = { name: string; url: string };

/**
 * Разложить произвольные элементы по РАЗРЕШЁННЫМ скоупам ткани.
 *
 * Ключ '' — законный результат и означает «привязки нет ни к чему живому»: лист, залитый до 0260,
 * или лист, чью строку BOM удалили. Такие не выбрасываются, а собираются под пустым ключом —
 * панель показывает их в «без материала», а очередь раскроя по ним отказывает НАЗЫВАЯ причину.
 * Молча потерянный лист — это молча потерянная деталь кроя.
 */
export function dxfByScope<T>(
  items: readonly T[],
  scopes: readonly FabricScope<RollGoodsLine>[],
  bindingOf: (item: T) => ScopeBinding,
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  const list = scopes as FabricScope<RollGoodsLine>[];
  for (const item of items) {
    const b = bindingOf(item);
    const key = scopeKeyOfBinding(b.fabricPurpose, b.bomLineKey, list);
    const bucket = out.get(key) ?? [];
    bucket.push(item);
    out.set(key, bucket);
  }
  return out;
}

// Правило имени листа и его фолбэк переехали в `./sheet-name`: фолбэк — это СОХРАНЁННОЕ значение
// (см. там), а сравнивать его умеет только `sameSheetName`. Реэкспорт — чтобы импорт отсюда,
// который уже написан у соседей, остался рабочим.
export {
  FALLBACK_SHEET_NAME,
  LEGACY_FALLBACK_SHEET_NAME,
  patternSheetName,
  sameSheetName,
} from './sheet-name';

/**
 * Строки выкроек карточки → DXF-листы по скоупам. Ровно то, что нужно ЗАПУСТИТЬ раскладку: PDF и
 * прочие не-DXF отсеиваются здесь, потому что разбирать их движку нечем.
 */
export function dxfSheetsByScope(
  rows: readonly (ScopeBinding & { url?: string; name?: string; filename?: string })[],
  scopes: readonly FabricScope<RollGoodsLine>[],
): Map<string, ScopedSheet[]> {
  const dxf = rows.filter((r) => !!r.url && isDxfUrl(r.url));
  const grouped = dxfByScope(dxf, scopes, (r) => r);
  const out = new Map<string, ScopedSheet[]>();
  for (const [key, list] of grouped) {
    out.set(
      key,
      list.map((r) => ({ name: patternSheetName(r), url: r.url as string })),
    );
  }
  return out;
}
