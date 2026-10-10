// Что лист SEAM MAP берёт из карты сборки: семейства деталей и ключ шагов — тем же lib и по тому же
// графу, что вид PIECES на экране. Отдельным модулем, чтобы страница печати и проба звали ОДНУ
// функцию, а не две похожие.
import { isJoin, pieceFamilies, readMap } from 'lib/assembly-skeleton/map';
import type { SeamGraph } from 'lib/assembly-skeleton/types';
import type { PrintModel } from './model';
import type { SeamSheet } from './paper';

export type SeamSheetStep = {
  inputKeys: string[];
  outputUnitKey: string;
  /** MACHINE: только такие шаги сшивают кромки и получают номера. */
  sews: boolean;
};

export function seamSheetOf(
  graph: SeamGraph | null,
  steps: readonly SeamSheetStep[],
  M: PrintModel,
): SeamSheet {
  if (!graph) return null;
  const read = readMap(
    graph,
    steps.map((s) => ({
      inputs: s.inputKeys.filter(Boolean),
      outputUnitKey: s.outputUnitKey.trim(),
      sews: s.sews,
    })),
  );
  const numberOf = (i: number) => M.rows[i]?.number ?? (i + 1) * 10;
  const key: NonNullable<SeamSheet>['key'] = [];
  read.steps.forEach((s, i) => {
    if (!s.sews || !isJoin(read, i)) return;
    const r = M.rows[i];
    const what =
      r?.workpiece?.name ||
      [...(r?.unitInputNames ?? []), ...(r?.pieceInputNames ?? [])].join(' + ');
    key.push({
      number: numberOf(i),
      text: [r?.verb, what].filter(Boolean).join(' · '),
      unread: (read.seams[i] ?? []).length === 0,
    });
  });
  return { families: pieceFamilies(read), numberOf, key };
}
