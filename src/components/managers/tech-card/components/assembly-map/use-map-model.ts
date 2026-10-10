// ДАННЫЕ КАРТЫ — шаги карточки из формы + граф швов провайдера пиктограмм → `readMap` (lib). Свой
// лист со своей подпиской, как эскиз: вкладка `operations` не смотрит, чтобы набор в редакторе шага
// не перерисовывал всю колонку операций.
import { readMap, type MapRead, type MapStep } from 'lib/assembly-skeleton/map';
import type { SeamGraph } from 'lib/assembly-skeleton/types';
import { useMemo, useRef } from 'react';
import { useWatch } from 'react-hook-form';
import { useCardSeamGraph } from '../card-unit-pictures';
import type { TechCardFormData } from '../schema';

export type FormOp = NonNullable<TechCardFormData['operations']>[number];
type FormPiece = TechCardFormData['pieces'][number];

export const MACHINE = 'TECH_CARD_OPERATION_TYPE_MACHINE';

export type MapModel = {
  read: MapRead | null;
  ops: FormOp[];
  pieceName: (key: string) => string;
  unitName: (key: string) => string;
  isUnit: (key: string) => boolean;
  /** Первый машинный шаг — карта показывает его, пока ничего не выбрано (D2). */
  firstMachine: number | null;
};

const sigOf = (ops: readonly FormOp[]) =>
  ops
    .map(
      (o) =>
        `${(o?.outputUnitKey ?? '').trim()}<${(o?.inputKeys ?? []).join(',')}<${o?.operationType ?? ''}`,
    )
    .join('~');

export function useMapModel(): MapModel {
  const ops = (useWatch<TechCardFormData>({ name: 'operations' }) ?? []) as FormOp[];
  const pieces = (useWatch<TechCardFormData>({ name: 'pieces' }) ?? []) as FormPiece[];
  const { graph, settling } = useCardSeamGraph();
  // Пока новая подпись отстаивается (400 мс), карта держит прежний граф — без вспышки эскиза.
  const last = useRef<SeamGraph | null>(null);
  if (graph) last.current = graph;
  else if (!settling) last.current = null;
  const shown = graph ?? last.current;

  const sig = sigOf(ops);
  const read = useMemo(() => {
    if (!shown) return null;
    const steps: MapStep[] = ops.map((o) => ({
      inputs: (o?.inputKeys ?? []).filter(Boolean),
      outputUnitKey: (o?.outputUnitKey ?? '').trim(),
      sews: o?.operationType === MACHINE,
    }));
    return readMap(shown, steps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, sig]);

  const pieceNames = useMemo(
    () => new Map(pieces.map((p) => [(p.lineKey ?? '').trim(), p.name ?? ''])),
    [pieces],
  );
  const unitNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of ops) {
      const k = (o?.outputUnitKey ?? '').trim();
      if (k && !m.has(k)) m.set(k, (o?.outputUnitName ?? '').trim() || k);
    }
    return m;
  }, [ops]);
  const firstMachine = useMemo(() => {
    const i = ops.findIndex((o) => o?.operationType === MACHINE);
    return i >= 0 ? i : ops.length > 0 ? 0 : null;
  }, [ops]);

  return {
    read,
    ops,
    pieceName: (k) => pieceNames.get(k) || read?.geoms.get(k)?.name || k,
    unitName: (k) => unitNames.get(k) ?? k,
    isUnit: (k) => unitNames.has(k),
    firstMachine,
  };
}
