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
  if (section === 'TECH_CARD_BOM_SECTION_LINING') return 'подкладка';
  if (section === 'TECH_CARD_BOM_SECTION_INTERLINING') return 'бортовка';
  if (section === 'TECH_CARD_BOM_SECTION_INSULATION') return 'утеплитель';
  return 'основная ткань';
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
    return [roleWord(lines[0]?.section ?? ''), names].filter(Boolean).join(' · ') || 'без названия';
  }
  return [bomPurposeLabel(key), names].filter(Boolean).join(' · ');
}
