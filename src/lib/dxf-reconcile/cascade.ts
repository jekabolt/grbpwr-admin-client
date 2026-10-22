// Удаление листа выкройки с каскадом (L6, владелец 22.10). Чисто: ни React, ни формы, ни сети.
//
// Правила:
//   · уходят алиасы листа: алиасы его scope, чей блок есть на этом листе и нет ни на одном другом
//     листе того же scope (лист — единственный в scope, или его блоки не названы → все алиасы scope);
//   · уходит деталь, у которой был алиас листа и не осталось ни одного другого (другой лист, другой
//     scope). Деталь без алиасов (ручная, призрак) не трогается;
//   · шаг уходит ЦЕЛИКОМ, если ушедшая деталь стоит в нём входом или участником аннотации, и затем
//     транзитивно — каждый шаг, чей вход — узел (▣) ушедшего шага;
//   · номера шагов позиционны (маппер ставит (i+1)*10) — оставшиеся шаги просто сдвигаются;
//     issues[].operationNumber переезжают правилом OperationsField.remapIssues, дефекты ушедших
//     шагов уходят;
//   · швы, у которых хоть один якорь на ушедшей детали, уходят (removedSeamIds);
//   · ссылки вне карточки сборки (строки рецепта колорвеев, площади…) не чинятся, а называются в
//     `blockedBy`: колорвей с такой строкой сервер откажет сохранить — UI показывает текст сервера.
import {
  assemblySweep,
  classifyAssemblyInputs,
  type AssemblyViolation,
} from 'components/managers/tech-card/components/assembly-frontier';
import { splitBlockSize } from 'components/managers/tech-card/components/nesting/block-code';

import { aliasScopeKey, ciKey, opPieceRefs } from './defaults';
import type { CardAlias, CardOperation, CardPiece, ReconcileScope } from './types';

/**
 * Лист карточки: строка выкройки. blockNames — имена блоков файла (как отдаёт разбор); алиас
 * совпадает с блоком по имени или по идентичности (без размерного хвоста, по `sizeTokens`).
 * null/undefined — блоки не известны (лист не разобран): такой лист держит ВСЕ блоки своего scope.
 */
export type CascadeSheet = {
  /** sheetRowId: lineKey, у старых строк — url */
  key: string;
  scope: Partial<ReconcileScope>;
  blockNames?: readonly string[] | null;
};

/** Якорь шва: сохранённый (`{ parts }`) или оптимистичный (массив `{ piece }`). */
export type CascadeSeamSide =
  | { parts?: readonly { pieceLineKey?: string }[] }
  | readonly { piece?: string }[]
  | undefined;

export type CascadeSeam = {
  seamKey?: string;
  sideA?: CascadeSeamSide;
  sideB?: CascadeSeamSide;
};

export type CascadeIssue = { operationNumber?: number };

/** Ссылка на деталь вне шагов и швов: kind — 'colourway' (строка рецепта), 'area' и т.п. */
export type CascadeRef = { kind: string; pieceLineKey?: string };

export type CascadeInput<
  P extends CardPiece = CardPiece,
  A extends CardAlias = CardAlias,
  O extends CardOperation = CardOperation,
  I extends CascadeIssue = CascadeIssue,
  S extends CascadeSeam = CascadeSeam,
> = {
  pieces: readonly P[];
  aliases: readonly A[];
  operations: readonly O[];
  /** ВСЕ листы карточки (все scope) — по ним видно, держит ли блок другой лист того же scope */
  sheets: readonly CascadeSheet[];
  issues?: readonly I[];
  seams?: readonly S[];
  refs?: readonly CascadeRef[];
  /** токены размеров словаря (нижний регистр) — для идентичности блока; без них только имя */
  sizeTokens?: readonly string[];
  /**
   * Ключ scope привязки (алиаса или листа). По умолчанию — назначение, иначе строка BOM; форма
   * передаёт scopeKeyOfBinding. '' — падаем на сырой ключ.
   */
  scopeKeyOf?: (b: { fabricPurpose?: string; bomLineKey?: string }) => string;
};

export type CascadeBlock = { kind: string; pieceLineKey: string; count: number };

export type CascadeResult<
  P extends CardPiece = CardPiece,
  A extends CardAlias = CardAlias,
  O extends CardOperation = CardOperation,
  I extends CascadeIssue = CascadeIssue,
  S extends CascadeSeam = CascadeSeam,
> = {
  /** false — листа с таким ключом нет; всё остальное — вход как есть */
  found: boolean;
  pieces: P[];
  aliases: A[];
  operations: O[];
  /** оставшиеся дефекты с переехавшими номерами шагов (в порядке входа) */
  issues: I[];
  seams: S[];
  removedPieceKeys: string[];
  /** индексы ушедших алиасов во входе */
  removedAliasIndexes: number[];
  /** индексы ушедших шагов во входе, по возрастанию */
  removedStepIndexes: number[];
  /** индексы ушедших дефектов во входе */
  removedIssueIndexes: number[];
  removedSeamIds: string[];
  /** индекс шага входа → индекс в результате; null — шаг ушёл */
  opIndexOf: (number | null)[];
  /** ссылки на ушедшие детали, которые каскад не чинит (по детали и роду) */
  blockedBy: CascadeBlock[];
  /** нарушения assemblySweep после, которых не было до (по исходному индексу шага) */
  violations: AssemblyViolation[];
  counts: { pieces: number; steps: number };
};

const trim = (s: string | undefined) => (s ?? '').trim();
const lower = (s: string | undefined) => ciKey(s ?? '');

function seamAnchors(s: CascadeSeam): string[] {
  const out: string[] = [];
  for (const side of [s.sideA, s.sideB]) {
    if (!side) continue;
    if (Array.isArray(side)) {
      for (const a of side as readonly { piece?: string }[])
        if (trim(a.piece)) out.push(trim(a.piece));
      continue;
    }
    for (const a of (side as { parts?: readonly { pieceLineKey?: string }[] }).parts ?? [])
      if (trim(a.pieceLineKey)) out.push(trim(a.pieceLineKey));
  }
  return out;
}

function sweep(pieces: readonly CardPiece[], ops: readonly CardOperation[]): AssemblyViolation[] {
  const keys = new Set(pieces.map((p) => p.lineKey).filter(Boolean));
  return assemblySweep(
    pieces.map((p) => ({ lineKey: p.lineKey, name: p.name })),
    ops.map((o) => ({
      inputs: classifyAssemblyInputs(keys, [...(o.inputKeys ?? [])]),
      outputUnitKey: o.outputUnitKey ?? '',
      outputUnitName: o.outputUnitName ?? '',
    })),
  ).violations;
}

const violationKey = (v: AssemblyViolation, step: number) =>
  `${v.rule}|${v.detail}|${step}|${v.input}|${v.key}`;

export function removeSheetCascade<
  P extends CardPiece,
  A extends CardAlias,
  O extends CardOperation,
  I extends CascadeIssue = CascadeIssue,
  S extends CascadeSeam = CascadeSeam,
>(input: CascadeInput<P, A, O, I, S>, sheetKey: string): CascadeResult<P, A, O, I, S> {
  const issuesIn = input.issues ?? [];
  const seamsIn = input.seams ?? [];
  const target = input.sheets.find((s) => trim(s.key) === trim(sheetKey) && trim(sheetKey));
  if (!target) {
    return {
      found: false,
      pieces: [...input.pieces],
      aliases: [...input.aliases],
      operations: [...input.operations],
      issues: [...issuesIn],
      seams: [...seamsIn],
      removedPieceKeys: [],
      removedAliasIndexes: [],
      removedStepIndexes: [],
      removedIssueIndexes: [],
      removedSeamIds: [],
      opIndexOf: input.operations.map((_, i) => i),
      blockedBy: [],
      violations: [],
      counts: { pieces: 0, steps: 0 },
    };
  }

  // ── алиасы листа ─────────────────────────────────────────────────────────────────────────
  const scopeOf = (b: { fabricPurpose?: string; bomLineKey?: string }) =>
    trim(input.scopeKeyOf?.(b)) || aliasScopeKey(b);
  const scope = scopeOf(target.scope);
  const sizes = new Set((input.sizeTokens ?? []).map((t) => t.toLowerCase()));
  const blocksOf = (s: CascadeSheet) => {
    if (s.blockNames == null) return null;
    const out = new Set<string>();
    for (const n of s.blockNames) {
      if (!lower(n)) continue;
      out.add(lower(n));
      if (sizes.size) out.add(lower(splitBlockSize(n, sizes).identity));
    }
    out.delete('');
    return out;
  };
  const own = blocksOf(target);
  const siblings = input.sheets
    .filter((s) => s !== target && scope !== '' && scopeOf(s.scope) === scope)
    .map(blocksOf);
  const heldElsewhere = (block: string) => siblings.some((b) => b == null || b.has(block));

  const removedAliasIndexes: number[] = [];
  input.aliases.forEach((a, i) => {
    if (!scope || scopeOf(a) !== scope) return;
    const b = lower(a.blockName);
    if (own && !own.has(b)) return;
    if (heldElsewhere(b)) return;
    removedAliasIndexes.push(i);
  });
  const goneAlias = new Set(removedAliasIndexes);

  // ── детали: только те, что приходят ТОЛЬКО с этого листа ─────────────────────────────────
  const fromSheet = new Set<string>();
  const kept = new Set<string>();
  input.aliases.forEach((a, i) => {
    const k = trim(a.pieceLineKey);
    if (!k) return;
    (goneAlias.has(i) ? fromSheet : kept).add(k);
  });
  const removedPieces = new Set<string>();
  for (const p of input.pieces) {
    const k = trim(p.lineKey);
    if (k && fromSheet.has(k) && !kept.has(k)) removedPieces.add(k);
  }
  const pieceKeys = new Set(input.pieces.map((p) => trim(p.lineKey)).filter(Boolean));

  // ── шаги: с ушедшей деталью, затем транзитивно ниже по течению ───────────────────────────
  const gone = new Set<number>();
  input.operations.forEach((o, i) => {
    const { inputs, annotations } = opPieceRefs(o);
    if ([...inputs, ...annotations].some((k) => removedPieces.has(k.trim()))) gone.add(i);
  });
  const deadUnits = new Set<string>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const i of gone) {
      const u = trim(input.operations[i].outputUnitKey);
      if (u && !pieceKeys.has(u) && !deadUnits.has(u)) {
        deadUnits.add(u);
        grew = true;
      }
    }
    input.operations.forEach((o, i) => {
      if (gone.has(i)) return;
      if ((o.inputKeys ?? []).some((k) => deadUnits.has(k.trim()))) {
        gone.add(i);
        grew = true;
      }
    });
  }
  const removedStepIndexes = [...gone].sort((a, b) => a - b);
  const opIndexOf: (number | null)[] = [];
  const operations: O[] = [];
  input.operations.forEach((o, i) => {
    if (gone.has(i)) opIndexOf.push(null);
    else {
      opIndexOf.push(operations.length);
      operations.push(o);
    }
  });

  // ── дефекты: правило OperationsField.remapIssues ─────────────────────────────────────────
  const opCount = input.operations.length;
  const issues: I[] = [];
  const removedIssueIndexes: number[] = [];
  issuesIn.forEach((iss, ii) => {
    const n = iss.operationNumber ?? 0;
    // позиционна только ссылка, которую мог выдать редактор: кратная 10 внутри ряда шагов
    if (!n || n % 10 !== 0 || n / 10 - 1 >= opCount) {
      issues.push(iss);
      return;
    }
    const next = opIndexOf[n / 10 - 1];
    if (next == null) {
      removedIssueIndexes.push(ii);
      return;
    }
    const num = (next + 1) * 10;
    issues.push(num === n ? iss : { ...iss, operationNumber: num });
  });

  // ── швы и внешние ссылки ─────────────────────────────────────────────────────────────────
  const seams: S[] = [];
  const removedSeamIds: string[] = [];
  for (const s of seamsIn) {
    if (seamAnchors(s).some((k) => removedPieces.has(k))) removedSeamIds.push(trim(s.seamKey));
    else seams.push(s);
  }
  const removedCi = new Map([...removedPieces].map((k) => [lower(k), k]));
  const blocked = new Map<string, CascadeBlock>();
  for (const r of input.refs ?? []) {
    const k = removedCi.get(lower(r.pieceLineKey));
    if (!k) continue;
    const id = `${r.kind}|${k}`;
    const b = blocked.get(id) ?? { kind: r.kind, pieceLineKey: k, count: 0 };
    b.count++;
    blocked.set(id, b);
  }

  const pieces = input.pieces.filter((p) => !removedPieces.has(trim(p.lineKey)));
  const aliases = input.aliases.filter((_, i) => !goneAlias.has(i));

  // ── сторож сборки: каскад не должен оставить висящих ссылок ──────────────────────────────
  const before = new Set(sweep(input.pieces, input.operations).map((v) => violationKey(v, v.step)));
  const srcOf: number[] = [];
  opIndexOf.forEach((r, i) => {
    if (r != null) srcOf[r] = i;
  });
  const violations = sweep(pieces, operations).filter(
    (v) => !before.has(violationKey(v, v.step < 0 ? v.step : srcOf[v.step])),
  );

  const removedPieceKeys = input.pieces
    .map((p) => trim(p.lineKey))
    .filter((k) => removedPieces.has(k));
  return {
    found: true,
    pieces,
    aliases,
    operations,
    issues,
    seams,
    removedPieceKeys,
    removedAliasIndexes,
    removedStepIndexes,
    removedIssueIndexes,
    removedSeamIds,
    opIndexOf,
    blockedBy: [...blocked.values()],
    violations,
    counts: { pieces: removedPieceKeys.length, steps: removedStepIndexes.length },
  };
}
