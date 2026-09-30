// СОСТАВ, ПЕРЕОПРЕДЕЛЁННЫЙ НА СОСТАВНИКЕ (labels rework, I-13 / I-16, решение D-03).
//
// Состав колорвея по умолчанию ВЫВОДИТСЯ резолвером из BOM. Оператор может заменить его на
// составнике строками «часть · волокно · %» — на один колорвей (или сразу на все, галочкой). Тогда
// ЭТИ строки и есть состав колорвея целиком: переопределение заменяет вывод резолвера, а не
// дописывается к нему, — что на экране, то и на ленте. Пустой набор = «выведено из BOM».
//
// Переводы на 10 языков всё так же из словаря волокон (`formatRow`): переопределение никогда не
// требует набирать десять языков. Проверки те же, что у резолвера: волокна нет в словаре — БЛОК;
// часть не в сумме 100 — предупреждение (печатается как введено, не нормируется: цифры оператора).
import {
  formatRow,
  resolveColorwayComposition,
  type FiberDict,
  type FiberShare,
  type LabelBomLine,
  type LabelMaterial,
  type LabelUsage,
  type PartComposition,
  type ResolvedComposition,
} from './composition-resolver';
import { COMPOSITION_EMPTY_MESSAGE, hole, withColorway, type Hole } from './holes';
import { LABEL_PART_NAME, LABEL_PARTS, type PrintedPart } from './label-parts';
import { LABEL_LANGS, type LabelLang } from './phrases';

/** Строка переопределения: часть ленты (без NOTE), код словаря волокон, целый процент. */
export type OverrideFiber = { part: Exclude<PrintedPart, 'NOTE'>; fiberCode: string; pct: number };

const byPercentThenCode = (a: FiberShare, b: FiberShare) =>
  b.percent - a.percent || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);

/** Сумма долей части, как её увидит оператор (для предупреждения и подсказки в редакторе). */
export const partSum = (rows: readonly OverrideFiber[], part: OverrideFiber['part']): number =>
  rows.filter((r) => r.part === part).reduce((a, r) => a + (r.pct || 0), 0);

export function composeOverride(
  rows: readonly OverrideFiber[],
  fibers: FiberDict,
  colorwayId?: number,
): ResolvedComposition {
  const holes: Hole[] = [];
  const parts: PartComposition[] = [];
  for (const part of LABEL_PARTS) {
    if (part === 'NOTE') continue;
    const mine = rows.filter((r) => r.part === part && r.fiberCode.trim() && r.pct > 0);
    if (!mine.length) continue;
    const merged = new Map<string, number>();
    for (const r of mine) {
      const code = r.fiberCode.trim().toUpperCase();
      if (!fibers.has(code))
        holes.push(
          hole(
            'fibre-unknown',
            `${LABEL_PART_NAME[part]}: fibre "${code}" is not in the fibre dictionary`,
            { part, fiberCode: code },
          ),
        );
      merged.set(code, (merged.get(code) ?? 0) + r.pct);
    }
    const shares = [...merged]
      .map(([code, percent]) => ({ code, percent }))
      .sort(byPercentThenCode);
    const sum = shares.reduce((a, s) => a + s.percent, 0);
    if (sum !== 100)
      holes.push(
        hole(
          'part-not-100',
          `${LABEL_PART_NAME[part]}: the composition on the label sums to ${sum}%`,
          { part },
        ),
      );
    parts.push({
      part,
      fibers: shares,
      animal: shares.some((s) => !!fibers.get(s.code)?.animalNonTextile),
      rows: {} as Record<LabelLang, string>,
      lineKeys: [],
    });
  }
  if (!parts.length) holes.push(hole('composition-empty', COMPOSITION_EMPTY_MESSAGE));
  if (parts.some((p) => p.animal))
    parts.push({
      part: 'NOTE',
      fibers: [],
      animal: false,
      rows: {} as Record<LabelLang, string>,
      lineKeys: [],
    });
  for (const p of parts) {
    for (const lang of LABEL_LANGS) {
      const row = formatRow(p, lang, fibers);
      p.rows[lang] = row.text;
      holes.push(...row.holes);
    }
  }
  const seen = new Set<string>();
  const unique = holes.filter((h) => {
    const k = `${h.code}|${h.ref.part ?? ''}|${h.ref.fiberCode ?? ''}|${h.ref.lang ?? ''}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
  return { parts, holes: withColorway(unique, colorwayId) };
}

export type LabelCompositionInput = {
  colorwayId: number;
  bom: readonly LabelBomLine[];
  usages: readonly LabelUsage[];
  materials: ReadonlyMap<number, LabelMaterial>;
  fibers: FiberDict;
  /** Переопределение составника; null / [] — состав выводится резолвером из BOM. */
  override: readonly OverrideFiber[] | null;
};

/** Состав колорвея для ленты: переопределение составника, иначе резолвер (как было). */
export function labelComposition(input: LabelCompositionInput): ResolvedComposition {
  if (input.override?.length)
    return composeOverride(input.override, input.fibers, input.colorwayId);
  return resolveColorwayComposition({
    colorwayId: input.colorwayId,
    bom: input.bom,
    usages: input.usages,
    materials: input.materials,
    fibers: input.fibers,
  });
}

/** Выведенный состав → строки редактора (стартовая точка первой правки). */
export function overrideRowsOf(parts: readonly PartComposition[]): OverrideFiber[] {
  return parts
    .filter((p): p is PartComposition & { part: OverrideFiber['part'] } => p.part !== 'NOTE')
    .flatMap((p) => p.fibers.map((f) => ({ part: p.part, fiberCode: f.code, pct: f.percent })));
}
