// Какой слой DXF несёт саму деталь.
//
// Блок обычно содержит контур ДВАЖДЫ: линию шва и линию кроя на разных слоях. Внутри одного
// блока их не различить — оба замкнуты, оба похожи на деталь. Различает их градация: настоящая
// деталь МЕНЯЕТСЯ от размера к размеру, а справочный контур — нет.
//
// Замерено на реальном файле лекальщика (summer men.dxf):
//   слой 1:  BP 52.1×18.5 во ВСЕХ пяти размерах; FP_R 32.2×74.4 во всех; SL_R 47.8×34.2 во всех
//   слой 14: BP XS 47.9×15.2 → XL 51.9×17.2; FP_R 28.4×70.5 → 32.0×73.7 (ровный шаг градации)
// Слой 1 там оказался линией кроя БАЗОВОГО размера, выгруженной без градации, а прежний парсер
// предпочитал именно его — отчего BP_S и BP_M выходили с одинаковым габаритом.
//
// Отсюда правило: слой тем правдоподобнее, чем на большем числе деталей его габарит меняется
// между размерами. Ни одного размера сравнить не с чем — правило молчит и решает запасной
// порядок, а не выдумка.
import type { PieceDTO } from 'lib/nesting/types';

export type LayerOption = {
  layer: string;
  // Сколько деталей этот слой даёт вообще.
  pieces: number;
  // На скольких идентичностях (деталь без размерного хвоста) слой ГРАДУИРУЕТСЯ, и на скольких
  // его можно было проверить. graded === 0 при checked > 0 — это справочный контур.
  graded: number;
  checked: number;
};

// Габарит с точностью до 0.5 мм: градация мельче этого не бывает, а дребезг тесселяции бывает.
const dim = (p: PieceDTO) => `${Math.round(p.bboxW * 20)}x${Math.round(p.bboxH * 20)}`;

export function layerOptions(
  pieces: readonly PieceDTO[],
  // Идентичность детали (имя блока без размера) и размер — по id детали.
  codeById: ReadonlyMap<number, { identity: string; size: string }>,
): LayerOption[] {
  // слой → идентичность → размер → габарит
  const byLayer = new Map<string, Map<string, Map<string, string>>>();
  const count = new Map<string, number>();
  for (const p of pieces) {
    const layer = p.layer ?? '';
    count.set(layer, (count.get(layer) ?? 0) + 1);
    const code = codeById.get(p.id);
    if (!code || !code.identity) continue;
    const ident = byLayer.get(layer) ?? new Map<string, Map<string, string>>();
    const sizes = ident.get(code.identity.toLowerCase()) ?? new Map<string, string>();
    // Первый выигрывает: две ревизии одного размера в одном разборе не должны читаться как
    // градация.
    if (!sizes.has(code.size)) sizes.set(code.size, dim(p));
    ident.set(code.identity.toLowerCase(), sizes);
    byLayer.set(layer, ident);
  }

  const out: LayerOption[] = [];
  for (const [layer, pieceCount] of count) {
    let graded = 0;
    let checked = 0;
    for (const sizes of byLayer.get(layer)?.values() ?? []) {
      // Одна деталь в одном размере ничего не доказывает ни в одну сторону.
      if (sizes.size < 2) continue;
      checked++;
      if (new Set(sizes.values()).size > 1) graded++;
    }
    out.push({ layer, pieces: pieceCount, graded, checked });
  }

  // Сортировка = порядок правдоподобия. Сперва доля градуирующихся деталей, затем охват
  // (слой, дающий деталей больше, вероятнее несёт весь комплект), затем сам номер слоя — чтобы
  // порядок был устойчивым, а не зависел от порядка обхода Map.
  const rate = (o: LayerOption) => (o.checked > 0 ? o.graded / o.checked : -1);
  return out.sort(
    (a, b) => rate(b) - rate(a) || b.pieces - a.pieces || a.layer.localeCompare(b.layer),
  );
}

// Слой по умолчанию. Возвращает '' когда выбирать не из чего — вызывающий тогда ничего не
// фильтрует, вместо того чтобы показать пустой лист.
export function defaultContourLayer(options: readonly LayerOption[]): string {
  return options[0]?.layer ?? '';
}

// Блоки, у которых на выбранном слое контура НЕТ вовсе. Такие детали фильтр выкидывает молча —
// а молча потерянная деталь кроя обнаруживается уже на раскроенной ткани. Считаем по имени
// блока, а не по идентичности: пропасть может и отдельный размер.
export function blocksMissingOnLayer(
  pieces: readonly PieceDTO[],
  layer: string,
): string[] {
  const all = new Set<string>();
  const present = new Set<string>();
  for (const p of pieces) {
    const b = (p.blockName ?? '').trim();
    if (!b) continue; // безымянный контур привязать всё равно не к чему
    all.add(b);
    if ((p.layer ?? '') === layer) present.add(b);
  }
  return [...all].filter((b) => !present.has(b)).sort();
}
