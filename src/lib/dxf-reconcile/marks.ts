// Метки «проверить» на шагах после перезалива: навигация и правило «правка снимает метку».
//
// У шагов формы нет стабильного ключа (номер шага пересчитывается при перестановке), поэтому
// навигация — по индексу в массиве operations формы.
import type { CardAlias, CardOperation, CardPiece } from './types';
import { opPieceRefs } from './defaults';

const marked = (op: CardOperation | undefined) => !!(op?.review ?? '').trim();

/** Первый шаг с меткой; -1 — меток нет (после заливки остаёмся на выкройках). */
export function firstMarkedOperation(ops: readonly CardOperation[]): number {
  return ops.findIndex((op) => marked(op));
}

/**
 * Следующий шаг с меткой после `afterIndex` (по кругу, сам `afterIndex` не в счёт): «ok» снял
 * метку — открывается следующий. -1 — помеченных больше нет.
 */
export function nextMarkedOperation(ops: readonly CardOperation[], afterIndex: number): number {
  const n = ops.length;
  if (!n) return -1;
  const start = Number.isInteger(afterIndex) && afterIndex >= 0 ? afterIndex : -1;
  for (let step = 1; step <= n; step++) {
    const i = (start + step + n) % n;
    if (i !== start && marked(ops[i])) return i;
  }
  return -1;
}

/** Детали без единого алиаса (на карте, но ни одного блока листа) — призраки после заливки. */
export function unaliasedPieceKeys(
  pieces: readonly Pick<CardPiece, 'lineKey'>[],
  aliases: readonly CardAlias[],
): string[] {
  const bound = new Set(aliases.map((a) => (a.pieceLineKey ?? '').trim()).filter(Boolean));
  return pieces.map((p) => p.lineKey.trim()).filter((k) => k && !bound.has(k));
}

/** Детали из `pieceKeys`, которых нет ни в одном входе шага — чип «+N в сборку». */
export function unplacedPieceKeys(
  pieceKeys: readonly string[],
  ops: readonly CardOperation[],
): string[] {
  const used = new Set(ops.flatMap((o) => (o.inputKeys ?? []).map((k) => k.trim())));
  return pieceKeys.filter((k) => k.trim() && !used.has(k.trim()));
}

/**
 * Метка шага после ЛЮБОЙ правки шага: снята. Кроме 'orphan' — он снимается только заменой
 * призрака или удалением его из шага; пока шаг ссылается на призрак (`ghostKeys`), метка стоит.
 */
export function reviewAfterEdit(op: CardOperation, ghostKeys: Iterable<string>): string {
  const review = (op.review ?? '').trim();
  if (review !== 'orphan') return '';
  const ghosts = new Set([...ghostKeys].map((k) => k.trim()).filter(Boolean));
  const { inputs, annotations } = opPieceRefs(op);
  return [...inputs, ...annotations].some((k) => ghosts.has(k.trim())) ? 'orphan' : '';
}
