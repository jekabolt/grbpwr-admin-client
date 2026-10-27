// ДАННЫЕ КАРТЫ — шаги карточки из формы + граф швов провайдера пиктограмм → `readMap` (lib). Свой
// лист со своей подпиской, как эскиз: вкладка `operations` не смотрит, чтобы набор в редакторе шага
// не перерисовывал всю колонку операций.
import {
  pieceFamilies,
  readMap,
  type MapRead,
  type MapStep,
  type PieceFamily,
} from 'lib/assembly-skeleton/map';
import { readablePieceName } from 'lib/assembly-skeleton/names';
import type { SeamGraph } from 'lib/assembly-skeleton/types';
import { unitDisplayName } from 'lib/assembly-unit-name';
import { useMemo, useRef } from 'react';
import { useWatch } from 'react-hook-form';
import { useCardSeamGraph } from '../card-unit-pictures';
import type { TechCardFormData } from '../schema';
import { sewnStrip, type SewnCard, type SewnTile } from './sewn';

export type FormOp = NonNullable<TechCardFormData['operations']>[number];
type FormPiece = TechCardFormData['pieces'][number];

export const MACHINE = 'TECH_CARD_OPERATION_TYPE_MACHINE';

export type MapModel = {
  read: MapRead | null;
  ops: FormOp[];
  families: PieceFamily[];
  pieces: Array<{ key: string; name: string }>;
  pieceName: (key: string) => string;
  unitName: (key: string) => string;
  isUnit: (key: string) => boolean;
  unsewnPieceCount: number;
  /** Первый машинный шаг — карта показывает его, пока ничего не выбрано (D2). */
  firstMachine: number | null;
  defaultSeamClass?: string;
  /** «Как шьют» шага `i` — поле шага, стандарт карточки или пустой слот (sewn.ts). */
  sewnOf: (index: number) => SewnTile[];
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
  const construction = useWatch<TechCardFormData>({ name: 'construction' }) as
    | TechCardFormData['construction']
    | undefined;
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
    () => new Map(pieces.map((p) => [(p.lineKey ?? '').trim(), readablePieceName(p.name ?? '')])),
    [pieces],
  );
  const families = useMemo(() => (read ? pieceFamilies(read) : []), [read]);
  const shownPieceNames = useMemo(() => {
    const names = new Map(pieceNames);
    for (const family of families) {
      const name = [readablePieceName(family.name), family.tag].filter(Boolean).join(' ');
      for (const key of family.members) names.set(key, name);
    }
    return names;
  }, [families, pieceNames]);
  const mappedPieces = useMemo(
    () => new Set(families.flatMap((family) => family.members)),
    [families],
  );
  const unitNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of ops) {
      const k = (o?.outputUnitKey ?? '').trim();
      if (k && !m.has(k)) {
        m.set(k, unitDisplayName({ key: k, outputUnitName: o?.outputUnitName }));
      }
    }
    return m;
  }, [ops]);
  const firstMachine = useMemo(() => {
    const i = ops.findIndex((o) => o?.operationType === MACHINE);
    return i >= 0 ? i : ops.length > 0 ? 0 : null;
  }, [ops]);

  const card = useMemo<SewnCard>(
    () => ({
      defaultSeamClass: construction?.defaultSeamClass,
      machines: construction?.equipmentDefaults?.machines ?? [],
    }),
    [construction],
  );
  const sewn = useMemo(() => new Map<number, SewnTile[]>(), [ops, card]);
  const sewnOf = (i: number) => {
    let hit = sewn.get(i);
    if (!hit) sewn.set(i, (hit = sewnStrip(ops, i, card)));
    return hit;
  };

  return {
    read,
    sewnOf,
    ops,
    families,
    pieces: pieces
      .map((piece) => {
        const key = (piece.lineKey ?? '').trim();
        return { key, name: pieceNames.get(key) || key };
      })
      .filter((piece) => piece.key),
    pieceName: (k) => shownPieceNames.get(k) || read?.geoms.get(k)?.name || k,
    unitName: (k) => unitNames.get(k) ?? unitDisplayName({ key: k }),
    isUnit: (k) => unitNames.has(k),
    unsewnPieceCount:
      families.filter((family) => family.picture.edges.length === 0).length +
      pieces.filter((piece) => {
        const key = (piece.lineKey ?? '').trim();
        return key && !mappedPieces.has(key);
      }).length,
    firstMachine,
    defaultSeamClass: construction?.defaultSeamClass,
  };
}
