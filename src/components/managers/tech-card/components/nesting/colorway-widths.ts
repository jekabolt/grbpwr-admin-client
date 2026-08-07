// Колорвей → раскройная ширина по каждому слоту BOM.
//
// Геометрия у стиля одна: все колорвеи кроят одни и те же детали. Разная — ТКАНЬ. Колорвей
// прикалывает свой артикул на слот (tech_card_colorway_usage.material_id, 0221), а у артикула своя
// ширина рулона и своя кромка. Значит одна и та же раскладка на артикуле 140 см и на 150 см — это
// две раскладки с разной измеренной длиной, и выбирать, «из чего мы кроим», надо ДО запуска, а не
// после.
//
// До этого модуля раскладка знала только ширину самой строки BOM (её собственный override или
// артикул по умолчанию) — то есть ширину РОЛИ, а не ширину того полотна, которое реально закупят
// под конкретный колорвей.
import type { common_Material, common_TechCard } from 'api/proto-http/admin';
import { parseDecimalNumber } from 'utils/decimal';

export type ColorwaySlotWidth = {
  // Раскройная ширина: рулон − 2×кромка, см. NaN = у артикула ширины нет.
  cutCm: number;
  // Кромка на КАЖДУЮ сторону, см. Едет на маркер, чтобы разложение отходов оставалось
  // проверяемым после правок материала.
  selvedgeCm: number;
  articleName: string;
};

export type MarkerColorway = {
  colorwayId: number;
  label: string;
  // Ключ строки BOM → ширина, которую даёт ИМЕННО этот колорвей. Слот, который колорвей не
  // прикалывает, сюда не попадает: наследование дефолта слота — работа вызывающей стороны,
  // иначе «колорвей ничего не сказал» и «колорвей сказал то же самое» стали бы неразличимы.
  widthByLine: Map<string, ColorwaySlotWidth>;
};

// Читаемое имя колорвея: код цвета, иначе артикул, иначе id. Совпадает с colorwayLabel вкладки
// деталей кроя — один объект должен называться одинаково во всех местах.
export function colorwayLabelOf(c: {
  colorwayId?: number;
  colorCode?: string;
  baseSku?: string;
}): string {
  return c.colorCode?.trim() || c.baseSku?.trim() || `#${c.colorwayId ?? 0}`;
}

// Раскройная ширина артикула. Рулон и кромка берутся ОБА у пина: взять ширину пина с кромкой
// слота значило бы описать рулон, которого не существует. Кромка шире рулона — ошибка ввода, и
// превращать её в отрицательную ширину нельзя.
function cutWidthOf(m: common_Material | undefined): { cutCm: number; selvedgeCm: number } {
  const roll = parseDecimalNumber(m?.fabricAttrs?.widthCm?.value || m?.fabricWidth?.value || '');
  const sv = parseDecimalNumber(m?.fabricAttrs?.selvedgeCm?.value || '');
  const selvedge = Number.isFinite(sv) && sv > 0 ? sv : 0;
  if (!Number.isFinite(roll) || roll <= 0) return { cutCm: NaN, selvedgeCm: selvedge };
  const cut = roll - 2 * selvedge;
  return { cutCm: cut > 0 ? Math.round(cut * 10) / 10 : NaN, selvedgeCm: selvedge };
}

// Собрать список колорвеев карточки с их шириной по слотам.
//
// Источник — СЕРВЕРНОЕ чтение карточки: рецепт колорвея пишется отдельным RPC
// (UpdateColorwayRecipe), а не вместе с формой, так что пины в форме не лежат и брать их
// неоткуда. Колорвей без пинов остаётся в списке с пустой картой — он существует и раскладку для
// него сделать можно, просто ширина придёт от слота.
export function markerColorways(
  card: common_TechCard | undefined,
  materialById: Map<number, common_Material>,
): MarkerColorway[] {
  const out: MarkerColorway[] = [];
  for (const cw of card?.colorways ?? []) {
    const id = Number(cw.colorwayId ?? 0);
    if (!id) continue;
    const widthByLine = new Map<string, ColorwaySlotWidth>();
    for (const u of cw.usages ?? []) {
      const key = (u.bomLineKey ?? '').trim();
      const materialId = Number(u.materialId ?? 0);
      if (!key || !materialId) continue;
      const mat = materialById.get(materialId);
      const { cutCm, selvedgeCm } = cutWidthOf(mat);
      widthByLine.set(key, { cutCm, selvedgeCm, articleName: mat?.name?.trim() || '' });
    }
    out.push({ colorwayId: id, label: colorwayLabelOf(cw), widthByLine });
  }
  return out;
}
