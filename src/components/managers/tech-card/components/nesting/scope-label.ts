// ПОДПИСЬ ТКАНИ — один экземпляр на всех, потому что она уезжает в ИМЯ РАСКЛАДКИ.
//
// Пока подпись жила приватно внутри очереди раскроя партии, копия была не нужна. Теперь ту же
// раскладку заказывает карточка ткани в рецепте колорвея (kit-marker), и вторая реализация была бы
// не «похожим текстом», а ДРУГИМ ИМЕНЕМ: уникальность имени у сервера — (карточка, прогон, размер,
// имя), и планировщик моделирует этот ключ, чтобы не получить отказ ПОСЛЕ оплаченного прогона.
// Две поверхности, называющие одну ткань по-разному, дали бы на карточке две раскладки одного
// скоупа с непересекающимися именами — и «пересчитать» перестало бы находить свой прошлый
// результат (`findReplacements` ищет по слоту и составу, а имя показывают человеку).
import type { RollGoodsLine } from '../bom-purpose';
import { bomPurposeLabel } from '../bom-purpose-labels';

/** Роль ткани словом — ею подписывается строка результата и начало подписи неразобранной строки. */
export function roleWord(section: string): string {
  if (section === 'TECH_CARD_BOM_SECTION_LINING') return 'lining';
  if (section === 'TECH_CARD_BOM_SECTION_INTERLINING') return 'interlining';
  if (section === 'TECH_CARD_BOM_SECTION_INSULATION') return 'insulation';
  return 'main fabric';
}

/** Подпись ткани: назначение с его артикулами, либо роль с названием неразобранной строки. */
export function scopeLabel(
  key: string,
  byPurpose: boolean,
  lines: Array<RollGoodsLine & { name?: string; section?: string }>,
): string {
  const names = lines
    .map((l) => (l.name ?? '').trim())
    .filter(Boolean)
    .join(', ');
  if (!byPurpose) {
    return [roleWord(lines[0]?.section ?? ''), names].filter(Boolean).join(' · ') || 'unnamed';
  }
  return [bomPurposeLabel(key), names].filter(Boolean).join(' · ');
}

// ЭТА ПОДПИСЬ — ЕЩЁ И СОХРАНЁННОЕ ЗНАЧЕНИЕ, а не только текст на экране.
//
// `baseMarkerName` (batch-marker-plan.ts) склеивает из неё имя раскладки, и режим настила ищет
// СВОЙ ПРОШЛЫЙ результат строгим равенством имён: `runPeers.filter((m) => m.name === baseName)`.
// Значит перевод `roleWord` на английский переименовывает то, что уже лежит на сервере: у
// раскладки, снятой до этой фазы, в имени стоит «основная ткань», а очередь генерирует теперь
// «main fabric», равенство не срабатывает — и пересчёт вместо ЗАМЕНЫ своей прошлой раскладки
// заводит ВТОРУЮ рядом с ней. Ничего не портится (раскладку, на которую ссылается секция настила,
// защищает проверка по id), но идемпотентность пересчёта на старых прогонах теряется молча.
//
// Поэтому сравнение имён идёт через `sameMarkerName`: та же схема, что у фолбэка имени листа в
// `sheet-name.ts` — новое имя и его легаси-написание считаются ОДНИМ именем.
const LEGACY_ROLE_WORDS: Record<string, string> = {
  'основная ткань': 'main fabric',
  подкладка: 'lining',
  бортовка: 'interlining',
  утеплитель: 'insulation',
  'без названия': 'unnamed',
};

// Посегментно, а не заменой подстроки: имя собрано через ' · ' из размера, колорвея, роли и
// НАЗВАНИЙ АРТИКУЛОВ, а название артикула — это данные, и оно вполне может само быть словом
// «подкладка». Переписывать надо ровно тот сегмент, который писала `roleWord`.
function markerNameToday(name: string): string {
  return name
    .split(' · ')
    .map((part) => LEGACY_ROLE_WORDS[part] ?? part)
    .join(' · ');
}

/** Одно ли это имя раскладки — с поправкой на то, как роль ткани писалась до перехода на английский. */
export function sameMarkerName(a: string, b: string): boolean {
  return a === b || markerNameToday(a) === markerNameToday(b);
}
