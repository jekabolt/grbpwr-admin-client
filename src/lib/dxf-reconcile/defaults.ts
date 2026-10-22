// Политика автоматического исхода (поворот 21.10: вопросов нет, всё решается здесь).
//
// Пороги откалиброваны на golden (tmp/plans/dxf-reupload-reconcile/golden) и на шуме экспорта:
// сдвиг начальной вершины, лишние вершины на отрезках, обратный обход и зеркало реальных деталей
// allsizes-merged дают форму ≤ 0.006 (scripts/dxf-reconcile-probe.mjs, гейт «шум»).
import { IDENTICAL_CUT_SYMMETRY } from 'components/managers/tech-card/components/piece-codes';

import type { SigCompare } from './shape-sig';
import type { CardAlias, CardOperation, Review } from './types';

export const THRESH = {
  /** «та же форма»: каждая относительная разница ≤, форма ≤, надсечки равны */
  unchangedRel: 0.002,
  unchangedForm: 0.012,
  /** дрейф экспорта — молча, без метки и без протухания «Конструкции» */
  minorRel: 0.005,
  minorForm: 0.025,
  /** changed shape without a resolvable card seam: area + perimeter inside this are automatic */
  autoAcceptRel: 0.02,
  /** a resolved seam is broken when its sides differ by more than max(3 mm, this share) */
  seamMismatchRel: 0.01,
  /** переименование по форме: уверенно при стоимости ≤ и отрыве от соперника ≥ */
  renameSure: 0.08,
  renameMargin: 0.02,
  /** дальше — не та деталь; без общего размера (сравнение медиан) — строже */
  renameMax: 0.25,
  renameMaxNoCommonSize: 0.08,
  /** an unmatched upload block may replace a ghost only with this lead over the runner-up */
  ghostRenameMargin: 0.05,
  /** две одинаковые формы: решает место на листе, если стоимости ближе, чем это */
  tieBucket: 0.01,
  /** разрез/слияние: сумма площадей и сложение габаритов */
  splitArea: 0.05,
  splitBox: 0.1,
  /** часть разреза, которая сама по себе почти точно совпала со старым блоком, — не разрез */
  splitNotIfRename: 0.02,
  /** L/R-пара → одна деталь: вторая половина конгруэнтна новой детали (в любом кадре) */
  pairCost: 0.12,
  /** moved/shared из другого scope: только точное имя И почти та же форма */
  movedMax: 0.02,
  /** меньше этой доли старых блоков нашли пару — «другой файл», матч по форме выключен */
  otherFileShare: 0.3,
  /** гипотеза единиц: каждое отношение линейных размеров в пределах ± от множителя */
  unitsTol: 0.02,
} as const;

/** Множители «весь лист не в тех единицах» (новый / старый). */
export const UNIT_FACTORS = [10, 0.1, 25.4, 1 / 25.4, 2.54, 1 / 2.54] as const;

export const IDENTICAL = IDENTICAL_CUT_SYMMETRY as string;
// piece-codes намеренно не выносит MIRRORED наружу: модалка не имеет права утверждать зеркальность
// за человека. Здесь утверждает ЧЕРТЁЖ: старый лист нёс L и R, которые конгруэнтны в зеркальном
// кадре, и новый лист свернул их в один блок — пара доказана геометрией, а не догадкой (GS4).
export const MIRRORED = 'TECH_CARD_PIECE_CUT_SYMMETRY_MIRRORED';

export type ShapeVerdict = 'unchanged' | 'minor' | 'changed';

export function verdictOf(c: SigCompare | null): ShapeVerdict {
  if (!c) return 'unchanged';
  const worst = Math.max(Math.abs(c.dArea), Math.abs(c.dPerim), Math.abs(c.dW), Math.abs(c.dH));
  if (c.dNotches !== 0) return 'changed';
  if (worst <= THRESH.unchangedRel && c.form <= THRESH.unchangedForm) return 'unchanged';
  if (worst <= THRESH.minorRel && c.form <= THRESH.minorForm) return 'minor';
  return 'changed';
}

/** Тяжесть метки: на шаг, задетый несколькими строками, ставится самая тяжёлая. */
export const REVIEW_RANK: Readonly<Record<Review, number>> = {
  orphan: 4,
  split: 3,
  remapped: 2,
  reshaped: 1,
};

export const ciKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** scope алиаса по умолчанию: назначение, иначе строка BOM (как в схеме, 0267). */
export const aliasScopeKey = (a: CardAlias) =>
  (a.fabricPurpose ?? '').trim() || (a.bomLineKey ?? '').trim();

/** Ключи деталей, на которые ссылается шаг: входы (побайтно, как assemblySweep) и аннотации. */
export function opPieceRefs(o: CardOperation): { inputs: string[]; annotations: string[] } {
  const inputs = (o.inputKeys ?? []).filter(Boolean);
  const annotations: string[] = [];
  for (const m of o.media ?? []) {
    for (const a of m.annotations ?? []) {
      for (const k of [a.pieceLineKey, ...(a.pieceLineKeys ?? [])]) {
        const t = (k ?? '').trim();
        if (t) annotations.push(t);
      }
    }
  }
  return { inputs, annotations };
}

/** Число ссылок на каждую деталь: входы шагов + аннотации + внешние (рецепт, площади…). */
export function refCounts(
  ops: readonly CardOperation[],
  externalRefs: Readonly<Record<string, number>> | undefined,
): Map<string, number> {
  const m = new Map<string, number>();
  const bump = (k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
  for (const o of ops) {
    const { inputs, annotations } = opPieceRefs(o);
    for (const k of new Set([...inputs, ...annotations])) bump(k);
  }
  for (const [k, n] of Object.entries(externalRefs ?? {})) if (n > 0) bump(k.trim(), n);
  return m;
}

/** Имя, свободное на карте (ci): «PKT», затем «PKT_2», «PKT_3»… */
export function uniqueName(want: string, taken: Set<string>): string {
  const base = want.trim() || 'piece';
  let name = base;
  for (let i = 2; taken.has(ciKey(name)); i++) name = `${base}_${i}`;
  taken.add(ciKey(name));
  return name;
}

/** Пара после свёртки L/R: зеркальная требует чётного ≥ 2 (CHECK БД). */
export function pairCount(current: number | undefined): number {
  const n = Math.max(1, Math.floor(current ?? 1));
  return n >= 2 && n % 2 === 0 ? n : Math.max(2, n + (n % 2));
}
