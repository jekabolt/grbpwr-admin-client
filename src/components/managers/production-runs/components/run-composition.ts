import {
  common_AdminColorwayRef,
  common_Color,
  common_ProductionRunLine,
} from 'api/proto-http/admin';

// СОСТАВ ПАРТИИ (колорвей × размер) — общий вывод сетки для всех поверхностей, где её набирают.
//
// Поверхностей теперь три: модалка создания прогона, сетка на странице прогона и редактор состава
// на вкладке костинга. Копия вывода в каждой расходится молча: правило «архивный колорвей не
// предлагаем» или «колорвей без продукта не предлагаем» достаточно забыть в одной из них, чтобы на
// одном экране составлялась партия, которую другой составить не даёт, — и разницу никто не увидит
// до отказа сервера.

export const ARCHIVED_COLORWAY = 'COLORWAY_LIFECYCLE_STATUS_ARCHIVED';

export type RunColorwayRow = { id: number; label: string };

/**
 * Живые колорвеи карточки как строки сетки.
 *
 * АРХИВНЫЕ НЕ ПРЕДЛАГАЮТСЯ: гейт готовности судил бы их блокером `colorway_live`, а строка,
 * единственный смысл которой — покраснеть, это мёртвый контрол.
 *
 * КОЛОРВЕЙ БЕЗ ПРОДУКТА тоже не предлагается: клетку сетки ключует product_id (колорвей — это
 * продукт), и без него приёмке потом нечего засчитывать. Сколько таких у карточки, считает
 * `unpublishedColorwayCount` — их надо назвать числом, а не молча вычесть.
 */
export function runColorwayRows(
  colorways: common_AdminColorwayRef[] | undefined,
  colors: common_Color[] | undefined,
): RunColorwayRow[] {
  return (colorways ?? [])
    .filter((c) => (c.colorwayId ?? 0) > 0 && c.status !== ARCHIVED_COLORWAY)
    .map((c) => {
      const dc = colors?.find((x) => x.code === c.colorCode);
      return {
        id: c.colorwayId as number,
        label: `${c.colorCode ? `${c.colorCode} · ` : ''}${
          dc?.name ?? c.colorCode ?? `#${c.colorwayId}`
        }`,
      };
    });
}

/** Живые колорвеи, которые ещё не опубликованы продуктом — сетка предложить их не может. */
export function unpublishedColorwayCount(colorways: common_AdminColorwayRef[] | undefined): number {
  return (colorways ?? []).filter(
    (c) => (c.colorwayId ?? 0) === 0 && c.status !== ARCHIVED_COLORWAY,
  ).length;
}

/** Ключ клетки. Пара (product_id, size_id) — та же, которой линию ключует контракт. */
export const runGridKey = (colorwayId: number, sizeId: number) => `${colorwayId}:${sizeId}`;

/**
 * Колонки сетки: объявленный размерный ряд карточки ПЛЮС размеры, которые уже стоят на линиях
 * партии вне этого ряда.
 *
 * Вторая половина не про аккуратность, а про сохранность: запись партии — полная замена линий, и
 * линия, которой сетка не показала, при сохранении просто исчезнет. Размер, убранный из ряда
 * карточки уже после планирования партии, — обычное дело, и терять по нему количество молча нельзя.
 */
export function runGridColumns(
  cardSizeIds: number[] | undefined,
  lines: common_ProductionRunLine[] | undefined,
): number[] {
  const base = cardSizeIds ?? [];
  const extra = (lines ?? []).map((l) => l.sizeId ?? 0).filter((s) => s > 0 && !base.includes(s));
  return [...base, ...Array.from(new Set(extra))];
}
