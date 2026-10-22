// Призрак после перезалива: кандидаты на замену по форме и замена по всей карте (круг 2, 21.10).
//
// Призрак — деталь, пропавшая с листа, на которую есть ссылки; её шаги несут 'orphan'. Снимается
// метка ТОЛЬКО выбором замены (replaceGhost — одним выбором во всех шагах карты) или удалением
// призрака из шага (removeGhostFromStep). «Принять как есть» у призрака нет. Остальные метки
// снимает clearReview («ok» на шаге) и любая правка шага (reviewAfterEdit в marks.ts).
//
// Чистые функции: ни React, ни формы. Шаг — любая строка с полями CardOperation, остальное
// проезжает насквозь.
import {
  assemblySweep,
  classifyAssemblyInputs,
} from 'components/managers/tech-card/components/assembly-frontier';
import { normBlock, bareToken } from 'components/managers/tech-card/components/nesting/block-code';
import { aliasIdentity } from 'components/managers/tech-card/components/nesting/split-pieces';
import type { PieceDTO } from 'lib/nesting/types';

import { opPieceRefs } from './defaults';
import { byName, comparePair, indexSheet, type SheetEntry } from './match';
import type { CardAlias, CardAnnotation, CardOperation, CardPiece, ParsedSheetLite } from './types';

/** Деталь карточки и её контуры на листе (по одному на размер). */
export type ShapedPiece = {
  pieceLineKey: string;
  shapes: readonly PieceDTO[];
};

export type GhostQuery = ShapedPiece & {
  /** шаг, для которого ищется замена: детали, уже стоящие в нём, не предлагаются */
  step?: CardOperation;
  /**
   * карточка целиком: кандидат, чья замена по всей карте ломает сборку (джойн сводится к одному
   * входу, деталь поглощается дважды), не предлагается — выбор не должен упираться в отказ
   */
  assembly?: { pieces: readonly CardPiece[]; operations: readonly CardOperation[] };
};

export type GhostCandidate = {
  pieceLineKey: string;
  /** расстояние формы (compareSigs.cost), меньше — ближе */
  cost: number;
};

const dictOf = (sizeTokens: readonly string[]) =>
  new Set(sizeTokens.map((t) => bareToken(t)).filter(Boolean));

function entriesOf(shapes: readonly PieceDTO[], dict: ReadonlySet<string>): SheetEntry[] {
  if (!shapes.length) return [];
  const blockNames = [...new Set(shapes.map((p) => p.blockName ?? ''))].filter(Boolean);
  return [...indexSheet({ pieces: shapes, blockNames }, dict).entries.values()];
}

/** Контуры идентичности на листе — по одному на размер, на слое кроя (как у сверки). */
export function shapesOfIdentity(
  parse: ParsedSheetLite,
  identity: string,
  sizeTokens: readonly string[] = [],
): PieceDTO[] {
  const idx = indexSheet(parse, dictOf(sizeTokens));
  const key = aliasIdentity(normBlock(identity), idx.split).toLowerCase();
  const e = idx.entries.get(key);
  return e ? e.sizes.map((s) => e.bySize.get(s)!) : [];
}

/**
 * Контуры листа по деталям карточки: блок алиаса (имя без размера) → деталь. `inScope` — только
 * алиасы этого листа (по умолчанию все). Порядок — первое появление детали в алиасах.
 */
export function shapesByPiece(
  parse: ParsedSheetLite,
  aliases: readonly CardAlias[],
  sizeTokens: readonly string[] = [],
  inScope: (a: CardAlias) => boolean = () => true,
): ShapedPiece[] {
  const idx = indexSheet(parse, dictOf(sizeTokens));
  const out = new Map<string, { shapes: PieceDTO[]; seen: Set<string> }>();
  for (const a of aliases) {
    const pk = (a.pieceLineKey ?? '').trim();
    if (!pk || !inScope(a)) continue;
    const key = aliasIdentity(normBlock(a.blockName ?? ''), idx.split).toLowerCase();
    const e = idx.entries.get(key);
    if (!e) continue;
    const slot = out.get(pk) ?? { shapes: [], seen: new Set<string>() };
    out.set(pk, slot);
    if (slot.seen.has(e.key)) continue;
    slot.seen.add(e.key);
    for (const s of e.sizes) slot.shapes.push(e.bySize.get(s)!);
  }
  return [...out].map(([pieceLineKey, s]) => ({ pieceLineKey, shapes: s.shapes }));
}

/**
 * Кандидаты на замену призрака: детали карточки (`pieces` — только они, имён не выдумываем) по
 * расстоянию формы (ближе — раньше), не больше `limit`. Без самого призрака, без деталей, уже
 * стоящих в шаге `ghost.step` (входом или аннотацией), и — если дана `ghost.assembly` — без тех,
 * чья замена по всей карте ломает сборку. Деталь с несколькими блоками (веер) — по ближайшему.
 * Порядок при равной стоимости — по ключу, так что ответ детерминирован. Без контура призрака
 * (листа не было) — пусто.
 */
export function ghostCandidates(
  ghost: GhostQuery,
  pieces: readonly ShapedPiece[],
  limit = 3,
  sizeTokens: readonly string[] = [],
): GhostCandidate[] {
  const dict = dictOf(sizeTokens);
  const from = entriesOf(ghost.shapes, dict);
  if (!from.length || limit <= 0) return [];
  const ghostKey = ghost.pieceLineKey.trim();
  const exclude = new Set<string>([ghostKey]);
  if (ghost.step) {
    const { inputs, annotations } = opPieceRefs(ghost.step);
    for (const k of [...inputs, ...annotations]) exclude.add(k.trim());
  }
  const best = new Map<string, number>();
  for (const p of pieces) {
    const pk = p.pieceLineKey.trim();
    if (!pk || exclude.has(pk)) continue;
    for (const n of entriesOf(p.shapes, dict)) {
      for (const o of from) {
        const c = comparePair(o, n, 1, false);
        if (!c || !Number.isFinite(c.cmp.cost)) continue;
        const cur = best.get(pk);
        if (cur === undefined || c.cmp.cost < cur) best.set(pk, c.cmp.cost);
      }
    }
  }
  const ranked = [...best]
    .map(([pieceLineKey, cost]) => ({ pieceLineKey, cost }))
    .sort((a, b) => a.cost - b.cost || byName(a.pieceLineKey, b.pieceLineKey));
  const card = ghost.assembly;
  if (!card) return ranked.slice(0, limit);
  const out: GhostCandidate[] = [];
  for (const c of ranked) {
    if (out.length >= limit) break;
    if (!ghostSwapBreaksAssembly(card.pieces, card.operations, ghostKey, c.pieceLineKey))
      out.push(c);
  }
  return out;
}

const violationsOf = (pieces: readonly CardPiece[], ops: readonly CardOperation[]) => {
  const keys = new Set(pieces.map((p) => p.lineKey).filter(Boolean));
  return assemblySweep(
    pieces.map((p) => ({ lineKey: p.lineKey, name: p.name })),
    ops.map((o) => ({
      inputs: classifyAssemblyInputs(keys, [...(o.inputKeys ?? [])]),
      outputUnitKey: o.outputUnitKey ?? '',
      outputUnitName: o.outputUnitName ?? '',
    })),
  ).violations.map((v) => `${v.rule}|${v.detail}|${v.step}|${v.key}`);
};

/**
 * Замена призрака `ghostKey` на `newKey` по всей карте (replaceGhost) даёт нарушение сборки,
 * которого не было до неё: джойн призрака с этой же деталью сводится к одному входу, деталь
 * поглощается вторым джойном и т.п.
 */
export function ghostSwapBreaksAssembly(
  pieces: readonly CardPiece[],
  ops: readonly CardOperation[],
  ghostKey: string,
  newKey: string,
): boolean {
  const before = new Set(violationsOf(pieces, ops));
  return violationsOf(pieces, replaceGhost(ops, ghostKey, newKey)).some((v) => !before.has(v));
}

// ─── метки шага ───────────────────────────────────────────────────────────────────────────────

/** «ok» на шаге: метка снята. Та же строка, если метки не было. */
export function clearReview<O extends CardOperation>(op: O): O {
  return op.review ? { ...op, review: '' } : op;
}

type GhostOpts = {
  /** все призраки карты: шаг, где после правки остался ДРУГОЙ призрак, сохраняет 'orphan' */
  ghosts?: Iterable<string>;
};

function refsAny(op: CardOperation, keys: ReadonlySet<string>): boolean {
  const { inputs, annotations } = opPieceRefs(op);
  return [...inputs, ...annotations].some((k) => keys.has(k.trim()));
}

/** Метка после того, как призрак ушёл из шага: 'orphan', пока в шаге есть другой призрак. */
function reviewWithout(op: CardOperation, ghostKey: string, opts?: GhostOpts): string {
  if (!op.review) return '';
  const others = new Set([...(opts?.ghosts ?? [])].map((k) => k.trim()).filter(Boolean));
  others.delete(ghostKey);
  return op.review === 'orphan' && refsAny(op, others) ? 'orphan' : '';
}

function mapAnnotations<O extends CardOperation>(
  op: O,
  f: (a: CardAnnotation) => CardAnnotation,
): CardOperation['media'] {
  return op.media?.map((m) =>
    m.annotations ? { ...m, annotations: m.annotations.map((a) => f(a)) } : m,
  );
}

const uniq = (xs: string[]) =>
  xs.filter((k, i) => xs.findIndex((x) => x.trim() === k.trim()) === i);

/**
 * Замена призрака одним выбором на всю карту: в каждом шаге, где призрак стоит входом или в
 * аннотации, он становится `newKey` (повтор во входах схлопывается), и метка шага снимается —
 * кроме шага, где остался другой призрак (`opts.ghosts`). Шаги без призрака — те же строки.
 * Сборку после замены проверяет вызывающий (assemblySweep): одна деталь в двух джойнах — его отказ.
 */
export function replaceGhost<O extends CardOperation>(
  ops: readonly O[],
  ghostKey: string,
  newKey: string,
  opts?: GhostOpts,
): O[] {
  const from = ghostKey.trim();
  const to = newKey.trim();
  if (!from || !to || from === to) return [...ops];
  const swap = (k: string | undefined) => (k?.trim() === from ? to : k);
  return ops.map((op) => {
    if (!refsAny(op, new Set([from]))) return op;
    const next: O = {
      ...op,
      inputKeys: op.inputKeys && uniq(op.inputKeys.map((k) => swap(k)!)),
      media: mapAnnotations(op, (a) => ({
        ...a,
        ...(a.pieceLineKey !== undefined ? { pieceLineKey: swap(a.pieceLineKey) } : {}),
        ...(a.pieceLineKeys ? { pieceLineKeys: uniq(a.pieceLineKeys.map((k) => swap(k)!)) } : {}),
      })),
    };
    return { ...next, review: reviewWithout(next, from, opts) };
  });
}

/**
 * Призрак убран из ОДНОГО шага: из входов и из аннотаций (выноска остаётся, без детали); метка
 * шага снимается, если другого призрака в нём нет. Арность джойна после этого проверяет
 * вызывающий.
 */
export function removeGhostFromStep<O extends CardOperation>(
  op: O,
  ghostKey: string,
  opts?: GhostOpts,
): O {
  const from = ghostKey.trim();
  if (!from || !refsAny(op, new Set([from]))) return op;
  const next: O = {
    ...op,
    inputKeys: op.inputKeys?.filter((k) => k.trim() !== from),
    media: mapAnnotations(op, (a) => ({
      ...a,
      ...(a.pieceLineKey?.trim() === from ? { pieceLineKey: '' } : {}),
      ...(a.pieceLineKeys
        ? { pieceLineKeys: a.pieceLineKeys.filter((k) => k.trim() !== from) }
        : {}),
    })),
  };
  return { ...next, review: reviewWithout(next, from, opts) };
}
