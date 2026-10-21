// План → новые строки формы. Детерминированно, без вопросов (поворот 21.10).
//
// Что делается:
//   · детали: 'delete' уходят, переименования и L/R ×2 применяются, новые блоки → новые детали
//     (в конце, в порядке строк плана);
//   · алиасы scope пересобираются ровно из links плана; алиасы других scope проезжают нетронутыми;
//     существующая строка алиаса сохраняется, если её связь не поменялась;
//   · шаги не удаляются, аннотации не переписываются — метка review на шаг, где задетая деталь
//     стоит входом или участником аннотации (тяжелейшая побеждает);
//   · единственное исключение — разрез (круг 2, 21.10): перед первым шагом, где разрезанная деталь
//     стоит входом, встаёт ОДИН обычный шаг join [деталь, части…] → узел под старым именем детали,
//     метка 'split' только на нём; входы шагов с этой деталью (с этого места) берут узел вместо
//     неё, и меток на них нет. Деталь не стоит ни в одном входе — join нет, метки нет;
//   · assemblySweep до и после: нарушение, которого не было, отказывает применение целиком
//     (шаг сравнивается по исходному индексу — вставленный join не делает старые нарушения новыми).
import {
  assemblySweep,
  classifyAssemblyInputs,
  type AssemblyViolation,
} from 'components/managers/tech-card/components/assembly-frontier';
import { normBlock, bareToken } from 'components/managers/tech-card/components/nesting/block-code';
import {
  aliasIdentity,
  splitPiecesBySize,
} from 'components/managers/tech-card/components/nesting/split-pieces';

import { IDENTICAL, REVIEW_RANK, aliasScopeKey, ciKey, opPieceRefs } from './defaults';
import type {
  ApplyDeps,
  ApplyResult,
  CardAlias,
  CardOperation,
  CardPiece,
  ReconcileInput,
  ReconcilePlan,
  Review,
  ReviewMark,
  SplitJoin,
  Tier,
} from './types';

/**
 * Ключ нарушения для сравнения до/после. `stepOf` переводит индекс шага результата в исходный
 * (join — свой ярлык), `keyOf` — узел join обратно в деталь, которую он заменил во входах.
 */
const violationKey = (
  v: AssemblyViolation,
  stepOf: (i: number) => string = String,
  keyOf: (k: string) => string = (k) => k,
) => `${v.rule}|${v.detail}|${v.step < 0 ? v.step : stepOf(v.step)}|${v.input}|${keyOf(v.key)}`;

const UNIT_BYTES = 64;

/** Код узла join из старого имени детали: «Back panel» → «BACK-PANEL», занятые → «-2», «-3»… */
function unitCodeOf(name: string, taken: Set<string>): string {
  const base =
    name
      .toUpperCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'UNIT';
  const fit = (v: string, room: number) => {
    let out = v;
    while (out && new TextEncoder().encode(out).length > UNIT_BYTES - room) out = out.slice(0, -1);
    return out || 'UNIT';
  };
  let code = fit(base, 0);
  for (let n = 2; taken.has(code); n++) code = `${fit(base, `-${n}`.length)}-${n}`;
  taken.add(code);
  return code;
}

/** Вход `from` → `to` (побайтно после trim, как сравнивает sweep); без вхождения — та же строка. */
function swapInput<O extends CardOperation>(op: O, from: string, to: string): O {
  const keys = op.inputKeys ?? [];
  if (!keys.some((k) => k.trim() === from)) return op;
  return { ...op, inputKeys: keys.map((k) => (k.trim() === from ? to : k)) };
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

const NOTE_ORDER: Tier[] = ['renamed', 'reshaped', 'split', 'merged', 'added', 'removed', 'moved'];

export function applyPlan<P extends CardPiece, A extends CardAlias, O extends CardOperation>(
  input: ReconcileInput<P, A, O>,
  plan: ReconcilePlan,
  deps: ApplyDeps<P, A, O>,
): ApplyResult<P, A, O> {
  const untouched = (
    refused: ApplyResult<P, A, O>['refused'],
    violations: AssemblyViolation[] = [],
  ) => ({
    refused,
    pieces: [...input.pieces],
    aliases: [...input.aliases],
    operations: [...input.operations],
    reviews: [],
    violations,
    addedPieceKeys: [],
    joins: [],
    reshapedPieceKeys: [],
    ghostPieceKeys: [],
    removedPieceKeys: [],
    renamed: [],
    revisionNote: '',
  });
  if (plan.status === 'noop') return untouched({ reason: 'noop' });

  // ── судьбы деталей ───────────────────────────────────────────────────────────────────────
  // Деталь, связанная хоть одной строкой, живёт — даже если другая строка считала её пропавшей.
  const linked = new Set(
    plan.rows.flatMap((r) => r.links.map((l) => l.pieceLineKey ?? '')).filter(Boolean),
  );
  const deleted = new Set<string>();
  const ghosts = new Set<string>();
  for (const r of plan.rows) {
    for (const o of r.old) {
      if (!o.pieceLineKey || linked.has(o.pieceLineKey)) continue;
      if (o.fate === 'delete') deleted.add(o.pieceLineKey);
      if (o.fate === 'ghost') ghosts.add(o.pieceLineKey);
    }
  }
  for (const k of ghosts) deleted.delete(k);

  const renameOf = new Map(
    plan.rows.filter((r) => r.rename).map((r) => [r.rename!.pieceLineKey, r.rename!.to]),
  );
  const updateOf = new Map(
    plan.rows
      .filter((r) => r.pieceUpdate)
      .map((r) => [r.pieceUpdate!.pieceLineKey, r.pieceUpdate!]),
  );

  const renamed: ApplyResult<P, A, O>['renamed'] = [];
  const pieces: P[] = [];
  for (const p of input.pieces) {
    if (deleted.has(p.lineKey)) continue;
    const to = renameOf.get(p.lineKey);
    const up = updateOf.get(p.lineKey);
    if (!to && !up) {
      pieces.push(p);
      continue;
    }
    let next: P = p;
    if (to && to !== p.name) {
      renamed.push({ pieceLineKey: p.lineKey, from: p.name, to });
      next = { ...next, name: to };
    }
    if (up) next = { ...next, piecesPerGarment: up.piecesPerGarment, cutSymmetry: up.cutSymmetry };
    pieces.push(next);
  }

  // ── новые детали: по строкам плана, ключ — mintKey ───────────────────────────────────────
  const byKey = new Map(input.pieces.map((p) => [p.lineKey, p]));
  const added: string[] = [];
  const keyOfLink = new Map<string, string>(); // `${rowId}|${identity}` → lineKey
  for (const r of plan.rows) {
    for (const l of r.links) {
      if (l.pieceLineKey !== null) continue;
      const ref = r.new.find((n) => n.identity === l.identity);
      // Часть разреза наследует кратность и симметрию детали, от которой отрезана.
      const parent = r.tier === 'split' ? byKey.get(r.old[0]?.pieceLineKey ?? '') : undefined;
      const lineKey = deps.mintKey();
      pieces.push(
        deps.makePiece({
          lineKey,
          name: l.name || l.identity,
          piecesPerGarment: parent?.piecesPerGarment ?? Math.max(1, ref?.instances ?? 1),
          cutSymmetry: parent?.cutSymmetry || IDENTICAL,
          identity: l.identity,
        }),
      );
      keyOfLink.set(`${r.id}|${l.identity}`, lineKey);
      added.push(lineKey);
    }
  }

  // ── алиасы scope ─────────────────────────────────────────────────────────────────────────
  const scopeKey = input.scope.fabricPurpose.trim() || input.scope.bomLineKey.trim();
  const inScope = input.aliasInScope ?? ((a: A) => aliasScopeKey(a) === scopeKey);
  const dict = new Set(input.sizeTokens.map((t) => bareToken(t)).filter(Boolean));
  const newSplit = splitPiecesBySize(input.newSheet.parse.pieces, dict);
  const want: { identity: string; pieceLineKey: string }[] = [];
  const seenWant = new Set<string>();
  for (const r of plan.rows) {
    for (const l of r.links) {
      const pk = l.pieceLineKey ?? keyOfLink.get(`${r.id}|${l.identity}`) ?? '';
      const sig = `${ciKey(l.identity)}|${pk}`;
      if (!pk || seenWant.has(sig)) continue;
      seenWant.add(sig);
      want.push({ identity: normBlock(l.identity), pieceLineKey: pk });
    }
  }
  want.sort((a, b) =>
    ciKey(a.identity) < ciKey(b.identity) ? -1 : ciKey(a.identity) > ciKey(b.identity) ? 1 : 0,
  );
  const kept = new Map<string, A>();
  for (const a of input.aliases) {
    if (!inScope(a)) continue;
    const sig = `${ciKey(aliasIdentity(normBlock(a.blockName ?? ''), newSplit))}|${(a.pieceLineKey ?? '').trim()}`;
    if (!kept.has(sig)) kept.set(sig, a);
  }
  const aliases: A[] = input.aliases.filter((a) => !inScope(a));
  for (const w of want) {
    const old = kept.get(`${ciKey(w.identity)}|${w.pieceLineKey}`);
    aliases.push(
      old ??
        deps.makeAlias({
          bomLineKey: input.scope.bomLineKey,
          fabricPurpose: input.scope.fabricPurpose,
          blockName: w.identity,
          pieceLineKey: w.pieceLineKey,
        }),
    );
  }

  // ── метки на шаги ────────────────────────────────────────────────────────────────────────
  const order = new Map(input.pieces.map((p, i) => [p.lineKey.trim(), i]));
  const marks = new Map<string, Review>(); // pieceKey → тяжелейшая метка детали
  const splits: { parent: string; parts: string[] }[] = [];
  for (const r of plan.rows) {
    for (const rv of r.reviews) {
      // Разрез метит не шаги детали, а join, который встанет перед ними (ниже).
      if (rv.review === 'split') {
        const parent = (rv.pieceKeys[0] ?? '').trim();
        const parts = r.links
          .filter((l) => l.pieceLineKey === null)
          .map((l) => keyOfLink.get(`${r.id}|${l.identity}`) ?? '')
          .filter(Boolean);
        if (parent && parts.length && !deleted.has(parent)) splits.push({ parent, parts });
        continue;
      }
      for (const k of rv.pieceKeys) {
        const t = k.trim();
        const cur = marks.get(t);
        if (!cur || REVIEW_RANK[rv.review] > REVIEW_RANK[cur]) marks.set(t, rv.review);
      }
    }
  }
  const reviews: ReviewMark[] = [];
  const operations: O[] = input.operations.map((op, opIndex) => {
    const { inputs, annotations } = opPieceRefs(op);
    const hit = [...new Set([...inputs.map((k) => k.trim()), ...annotations])].filter((k) =>
      marks.has(k),
    );
    if (!hit.length) return op;
    let review = marks.get(hit[0])!;
    for (const k of hit)
      if (REVIEW_RANK[marks.get(k)!] > REVIEW_RANK[review]) review = marks.get(k)!;
    const pieceKeys = hit
      .filter((k) => marks.get(k) === review)
      .sort(
        (a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9) || (a < b ? -1 : a > b ? 1 : 0),
      );
    reviews.push({ opIndex, review, pieceKeys });
    return deps.setReview ? deps.setReview(op, review) : op;
  });

  // ── разрез: один join перед первым шагом, где деталь — вход ──────────────────────────────
  // slot.src — индекс шага во входе; -1 — вставленный join.
  let slots: { op: O; src: number }[] = operations.map((op, src) => ({ op, src }));
  const taken = new Set<string>();
  for (const p of [...input.pieces, ...pieces]) if (p.lineKey.trim()) taken.add(p.lineKey.trim());
  for (const op of input.operations) {
    const out = (op.outputUnitKey ?? '').trim();
    if (out) taken.add(out);
    for (const k of op.inputKeys ?? []) if (k.trim()) taken.add(k.trim());
  }
  const joinOps: {
    op: O;
    parentKey: string;
    partKeys: string[];
    unitKey: string;
    unitName: string;
  }[] = [];
  for (const sp of splits) {
    const at = slots.findIndex((x) => (x.op.inputKeys ?? []).some((k) => k.trim() === sp.parent));
    if (at < 0) continue; // деталь нигде не вход — части остаются просто новыми деталями
    const unitName = (byKey.get(sp.parent)?.name ?? '').trim() || sp.parent;
    const unitKey = unitCodeOf(unitName, taken);
    let join = deps.makeJoin({
      inputKeys: [sp.parent, ...sp.parts],
      outputUnitKey: unitKey,
      outputUnitName: unitName,
      before: slots[at].op,
    });
    if (deps.setReview) join = deps.setReview(join, 'split');
    slots = slots.map((x, i) => (i < at ? x : { ...x, op: swapInput(x.op, sp.parent, unitKey) }));
    slots.splice(at, 0, { op: join, src: -1 });
    joinOps.push({ op: join, parentKey: sp.parent, partKeys: sp.parts, unitKey, unitName });
  }
  const result: O[] = slots.map((x) => x.op);
  const resultIndexOf = new Map<number, number>();
  slots.forEach((x, i) => {
    if (x.src >= 0) resultIndexOf.set(x.src, i);
  });
  const joins: SplitJoin[] = joinOps.map((j) => ({
    opIndex: result.indexOf(j.op),
    parentKey: j.parentKey,
    partKeys: j.partKeys,
    unitKey: j.unitKey,
    unitName: j.unitName,
  }));
  for (const m of reviews) m.opIndex = resultIndexOf.get(m.opIndex) ?? m.opIndex;
  for (const j of joins)
    reviews.push({ opIndex: j.opIndex, review: 'split', pieceKeys: [j.parentKey] });
  reviews.sort((a, b) => a.opIndex - b.opIndex);

  // ── сторож сборки ────────────────────────────────────────────────────────────────────────
  const before = new Set(sweep(input.pieces, input.operations).map((v) => violationKey(v)));
  const parentOfUnit = new Map(joins.map((j) => [j.unitKey, j.parentKey]));
  const fresh = sweep(pieces, result).filter(
    (v) =>
      !before.has(
        violationKey(
          v,
          (i) => (slots[i] && slots[i].src >= 0 ? String(slots[i].src) : `join${i}`),
          (k) => parentOfUnit.get(k) ?? k,
        ),
      ),
  );
  if (fresh.length) return untouched({ reason: 'sweep', violations: fresh }, fresh);

  const reshaped = [...new Set(plan.rows.flatMap((r) => r.reshapedPieceKeys))].filter(
    (k) => !deleted.has(k),
  );
  reshaped.sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));
  const inOrder = (s: Set<string>) =>
    [...s].sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));

  const counts = NOTE_ORDER.map((t) => [t, plan.summary[t]] as const).filter(([, n]) => n > 0);
  const note = [
    ...counts.map(([t, n]) => `${t} ${n}`),
    ...(joins.length ? [`join ${joins.length}`] : []),
    ...(reviews.length ? [`review ${reviews.length}`] : []),
    ...(plan.summary.scale !== 1 ? [`units ×${+plan.summary.scale.toFixed(4)}`] : []),
    ...(plan.summary.otherFile ? ['other file'] : []),
  ];

  return {
    refused: null,
    pieces,
    aliases,
    operations: result,
    reviews,
    violations: [],
    addedPieceKeys: added,
    joins,
    reshapedPieceKeys: reshaped,
    ghostPieceKeys: inOrder(ghosts),
    removedPieceKeys: inOrder(deleted),
    renamed,
    revisionNote: `dxf reconcile: ${note.length ? note.join(' · ') : 'no changes'}`,
  };
}
