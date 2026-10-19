// Что лист SEAM MAP берёт из карты сборки: семейства деталей и ключ шагов — тем же lib и по тому же
// графу, что вид PIECES на экране. Отдельным модулем, чтобы страница печати и проба звали ОДНУ
// функцию, а не две похожие.
import { isJoin, pieceFamilies, readMap } from 'lib/assembly-skeleton/map';
import type { SeamGraph } from 'lib/assembly-skeleton/types';
import {
  seamSignature,
  sewnStrip,
  sewnShort,
  type SewnCard,
  type SewnOp,
} from '../components/assembly-map/sewn';
import type { PrintModel } from './model';
import type { SeamSheet } from './paper';

export type SeamSheetStep = SewnOp & {
  inputKeys: string[];
  outputUnitKey: string;
  /** MACHINE: только такие шаги сшивают кромки и получают номера. */
  sews: boolean;
};

export function seamSheetOf(
  graph: SeamGraph | null,
  steps: readonly SeamSheetStep[],
  M: PrintModel,
  card: SewnCard = { machines: [] },
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
  // «Как шьют» — той же функцией, что полоса STEP на экране; на бумаге словами, номер ISO — текстом.
  const legend = new Map<string, { text: string; numbers: number[] }>();
  read.steps.forEach((s, i) => {
    if (!s.sews || !isJoin(read, i)) return;
    const r = M.rows[i];
    const what =
      r?.workpiece?.name ||
      [...(r?.unitInputNames ?? []), ...(r?.pieceInputNames ?? [])].join(' + ');
    const tiles = sewnStrip(steps, i, card);
    const unread = (read.seams[i] ?? []).length === 0;
    key.push({
      number: numberOf(i),
      text: [r?.verb, what, sewnShort(tiles)].filter(Boolean).join(' · '),
      unread,
    });
    if (unread) return;
    const sig = seamSignature(tiles) ?? '';
    const sec = tiles.find((t) => t.kind === 'section');
    const st = tiles.find((t) => t.kind === 'stitch');
    const text = sig
      ? [sec?.word, st && st.kind !== 'empty' ? (st.iso ? `ISO ${st.word}` : st.word) : '']
          .filter(Boolean)
          .join(' · ')
      : 'seam type not set';
    const row = legend.get(sig) ?? { text, numbers: [] };
    row.numbers.push(numberOf(i));
    legend.set(sig, row);
  });
  return {
    families: pieceFamilies(read),
    numberOf,
    key,
    legend: [...legend.values()].map((r) => `${r.text} — ${r.numbers.join(' ')}`),
  };
}
