// Вход пробы сверки DXF (scripts/dxf-reconcile-probe.mjs): то, что проба зовёт из src, и
// типизированные фикстуры карточки — чтобы карточка пробы собиралась теми же типами, что у формы.
import {
  assemblySweep,
  classifyAssemblyInputs,
} from 'components/managers/tech-card/components/assembly-frontier';
import { IDENTICAL } from 'lib/dxf-reconcile/defaults';
import { indexSheet } from 'lib/dxf-reconcile/match';
import type {
  CardAlias,
  CardOperation,
  CardPiece,
  ParsedSheetLite,
  ReconcileScope,
} from 'lib/dxf-reconcile/types';

export { parseSheets } from 'lib/nesting/worker/parse-files';
export { reconcile, applyPlan, THRESH, REVIEW_RANK } from 'lib/dxf-reconcile';
export { MIRRORED, IDENTICAL } from 'lib/dxf-reconcile/defaults';

export type ProbePiece = CardPiece & {
  lineKey: string;
  name: string;
  piecesPerGarment: number;
  cutSymmetry: string;
};
export type ProbeAlias = CardAlias & { id: string };
export type ProbeOp = CardOperation & { title: string; review?: string };

export type CardSpec = {
  scope: ReconcileScope;
  sizeTokens: string[];
  /** идентичности, которые стоят входами шагов (цепочка); по умолчанию все */
  inputs?: string[];
  /** идентичность, на которую ссылается только аннотация последнего шага */
  annotate?: string[];
  /** деталь → её алиасы (веер): {'FP': ['FP_L', 'FP_R']} — одна деталь на два блока */
  fan?: Record<string, string[]>;
  /** детали, которых нет на старом листе, но они есть на карте */
  extra?: string[];
  /** алиас детали в другом scope (проезжает нетронутым) */
  otherScope?: { identity: string; scope: ReconcileScope }[];
  overrides?: Record<string, Partial<ProbePiece>>;
};

export type ProbeCard = { pieces: ProbePiece[]; aliases: ProbeAlias[]; operations: ProbeOp[] };

const keyOf = (identity: string) => `pc-${identity.toLowerCase()}`;
export const pieceKey = keyOf;

/** Карточка, какой её оставила бы прошлая заливка листа: деталь на идентичность, алиас на неё. */
export function cardFromSheet(parse: ParsedSheetLite, spec: CardSpec): ProbeCard {
  const idx = indexSheet(parse, new Set(spec.sizeTokens));
  const fanned = new Set(
    Object.values(spec.fan ?? {})
      .flat()
      .map((s) => s.toLowerCase()),
  );
  const own = [...idx.entries.values()]
    .map((e) => e.identity)
    .filter((i) => !fanned.has(i.toLowerCase()));
  const names = [...own, ...Object.keys(spec.fan ?? {}), ...(spec.extra ?? [])].sort((a, b) =>
    a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0,
  );
  const pieces: ProbePiece[] = names.map((name) => ({
    lineKey: keyOf(name),
    name,
    piecesPerGarment: 1,
    cutSymmetry: IDENTICAL,
    ...(spec.overrides?.[name] ?? {}),
  }));
  const aliases: ProbeAlias[] = [];
  for (const name of names) {
    for (const block of spec.fan?.[name] ?? [name]) {
      aliases.push({
        id: `al-${aliases.length}`,
        bomLineKey: spec.scope.bomLineKey,
        fabricPurpose: spec.scope.fabricPurpose,
        blockName: block,
        pieceLineKey: keyOf(name),
      });
    }
  }
  for (const o of spec.otherScope ?? []) {
    aliases.push({
      id: `al-${aliases.length}`,
      bomLineKey: o.scope.bomLineKey,
      fabricPurpose: o.scope.fabricPurpose,
      blockName: o.identity,
      pieceLineKey: keyOf(o.identity),
    });
  }
  // Цепочка сборки: [p0, p1] → U1, [U1, p2] → U2, … — валидна для assemblySweep по построению.
  const inputs = (spec.inputs ?? names).map(keyOf);
  const operations: ProbeOp[] = [];
  if (inputs.length === 1)
    operations.push({
      title: 'prep',
      inputKeys: [inputs[0]],
      outputUnitKey: '',
      outputUnitName: '',
    });
  for (let i = 1; i < inputs.length; i++) {
    operations.push({
      title: `join ${i}`,
      inputKeys: i === 1 ? [inputs[0], inputs[1]] : [`u${i - 1}`, inputs[i]],
      outputUnitKey: `u${i}`,
      outputUnitName: `U${i}`,
    });
  }
  if (spec.annotate?.length && operations.length) {
    const last = operations[operations.length - 1];
    last.media = [{ annotations: spec.annotate.map((a) => ({ pieceLineKey: keyOf(a) })) }];
  }
  return { pieces, aliases, operations };
}

/** Нарушения сборки карточки — фикстура обязана быть чистой до сверки. */
export function sweepOf(card: {
  pieces: readonly CardPiece[];
  operations: readonly CardOperation[];
}) {
  const keys = new Set(card.pieces.map((p) => p.lineKey));
  return assemblySweep(
    card.pieces.map((p) => ({ lineKey: p.lineKey, name: p.name })),
    card.operations.map((o) => ({
      inputs: classifyAssemblyInputs(keys, [...(o.inputKeys ?? [])]),
      outputUnitKey: o.outputUnitKey ?? '',
      outputUnitName: o.outputUnitName ?? '',
    })),
  ).violations;
}
