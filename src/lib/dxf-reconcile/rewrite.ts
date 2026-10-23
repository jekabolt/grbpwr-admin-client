// План → новые строки формы. Детерминированно, без вопросов (поворот 21.10).
//
// Что делается:
//   · детали: 'delete' уходят, переименования и L/R ×2 применяются, новые блоки → новые детали
//     (в конце, в порядке строк плана);
//   · алиасы scope пересобираются ровно из links плана; алиасы других scope проезжают нетронутыми;
//     существующая строка алиаса сохраняется, если её связь не поменялась;
//   · шаги не удаляются, аннотации не переписываются — метка review на шаг, где задетая деталь
//     стоит входом или участником аннотации (тяжелейшая побеждает);
//   · метки не слабеют (L4c): новая сливается с той, что уже стоит на шаге, по REVIEW_RANK, а шаг,
//     который ссылается на призрак (этой заливки или прошлой, пока у него нет блока), — всегда
//     'orphan';
//   · единственное исключение — разрез: перед первым шагом, где разрезанная деталь стоит входом,
//     встаёт ОДИН обычный join [деталь, части…] → узел под старым именем детали. Чистый разрез
//     остаётся без метки (сомнительный сохраняет 'split'); следующие входы берут узел вместо детали;
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
) => `${v.rule}|${v.detail}|${v.step < 0 ? v.step : stepOf(v.step)}|${keyOf(v.key)}`;

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

/** Join-kind = two or more inputs producing an assembly unit. Empty/non-numeric SMV is ignored. */
function medianJoinSmv(ops: readonly CardOperation[]): string {
  const values = ops
    .filter((o) => (o.inputKeys?.length ?? 0) >= 2 && !!o.outputUnitKey?.trim())
    .map((o) => (o.smv ?? '').trim().replace(',', '.'))
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);
  if (!values.length) return '';
  const mid = Math.floor(values.length / 2);
  const value =
    values.length % 2 === 1 ? values[mid] : (values[Math.max(0, mid - 1)] + values[mid]) / 2;
  return String(+value.toFixed(6));
}

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
    opIndexOf: input.operations.map((_, i) => i),
    addedPieceKeys: [],
    joins: [],
    reshapedPieceKeys: [],
    ghostPieceKeys: [],
    removedPieceKeys: [],
    renamed: [],
    revisionNote: '',
  });
  if (plan.status === 'noop') return untouched({ reason: 'noop' });
  if (plan.refused === 'foreign') return untouched({ reason: 'foreign' });
  if (plan.needsPieceMatch || plan.rows.some((row) => row.tier === 'unlinked'))
    return untouched({ reason: 'unresolved' });

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
  const placements: { piece: string; withPiece: string }[] = [];
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
      if (l.placeWithPieceKey)
        placements.push({ piece: lineKey, withPiece: l.placeWithPieceKey.trim() });
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
  const directMarks = new Map<number, { review: Review; pieceKeys: string[] }>();
  const splits: { parent: string; parts: string[]; mark: boolean }[] = [];
  for (const r of plan.rows) {
    for (const rv of r.reviews) {
      // Разрез метит не шаги детали, а join, который встанет перед ними (ниже).
      if (rv.review === 'split') {
        const parent = (rv.pieceKeys[0] ?? '').trim();
        const parts = r.links
          .filter((l) => l.pieceLineKey === null)
          .map((l) => keyOfLink.get(`${r.id}|${l.identity}`) ?? '')
          .filter(Boolean);
        if (parent && parts.length && !deleted.has(parent))
          splits.push({ parent, parts, mark: rv.mark !== false });
        continue;
      }
      if (rv.operationIndexes?.length) {
        for (const opIndex of rv.operationIndexes) {
          if (opIndex < 0 || opIndex >= input.operations.length) continue;
          const cur = directMarks.get(opIndex);
          if (!cur || REVIEW_RANK[rv.review] > REVIEW_RANK[cur.review])
            directMarks.set(opIndex, { review: rv.review, pieceKeys: [...rv.pieceKeys] });
          else if (cur.review === rv.review)
            cur.pieceKeys = [...new Set([...cur.pieceKeys, ...rv.pieceKeys])];
        }
        continue;
      }
      for (const k of rv.pieceKeys) {
        const t = k.trim();
        const cur = marks.get(t);
        if (!cur || REVIEW_RANK[rv.review] > REVIEW_RANK[cur]) marks.set(t, rv.review);
      }
    }
  }
  // Призраки ПОСЛЕ применения: этой заливки и прошлых. Прошлый призрак — деталь без единого
  // алиаса, на которую ссылается шаг, уже помеченный 'orphan' (так его пометила прошлая заливка, и
  // reviewAfterEdit не снимает orphan, пока призрак в шаге). Деталь, которой блок вернули, —
  // больше не призрак.
  const bound = new Set(aliases.map((a) => (a.pieceLineKey ?? '').trim()).filter(Boolean));
  const unbound = (k: string) => !!k && !bound.has(k) && !deleted.has(k);
  const ghostsAfter = new Set([...ghosts].map((k) => k.trim()).filter(unbound));
  const hadAlias = new Set(input.aliases.map((a) => (a.pieceLineKey ?? '').trim()));
  for (const op of input.operations) {
    if ((op.review ?? '').trim() !== 'orphan') continue;
    const { inputs, annotations } = opPieceRefs(op);
    for (const k of [...inputs, ...annotations].map((x) => x.trim()))
      if (byKey.has(k) && !hadAlias.has(k) && unbound(k)) ghostsAfter.add(k);
  }
  const rankOf = (r: string | undefined) => REVIEW_RANK[(r ?? '').trim() as Review] ?? 0;
  const byOrder = (a: string, b: string) =>
    (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9) || (a < b ? -1 : a > b ? 1 : 0);

  const withPlacements: O[] = input.operations.map((op) => {
    const inputKeys = op.inputKeys ?? [];
    let changed = false;
    const next = [...inputKeys];
    for (const p of placements) {
      if (next.some((k) => k.trim() === p.piece)) continue;
      const at = next.findIndex((k) => k.trim() === p.withPiece);
      if (at < 0) continue;
      next.splice(at + 1, 0, p.piece);
      changed = true;
    }
    return changed ? { ...op, inputKeys: next } : op;
  });

  const reviews: ReviewMark[] = [];
  const operations: O[] = withPlacements.map((op, opIndex) => {
    const { inputs, annotations } = opPieceRefs(op);
    const refs = [...new Set([...inputs.map((k) => k.trim()), ...annotations])];
    const hit = refs.filter((k) => marks.has(k));
    const ghostHit = refs.filter((k) => ghostsAfter.has(k));
    const direct = directMarks.get(opIndex);
    if (!hit.length && !ghostHit.length && !direct) return op;
    let review: Review = direct?.review ?? 'reshaped';
    let pieceKeys: string[] = direct?.pieceKeys ?? [];
    if (hit.length) {
      const hitReview = hit.reduce<Review>(
        (best, k) => (REVIEW_RANK[marks.get(k)!] > REVIEW_RANK[best] ? marks.get(k)! : best),
        marks.get(hit[0])!,
      );
      if (!direct || REVIEW_RANK[hitReview] > REVIEW_RANK[review]) review = hitReview;
      for (const k of hit)
        if (REVIEW_RANK[marks.get(k)!] > REVIEW_RANK[review]) review = marks.get(k)!;
      pieceKeys = hit.filter((k) => marks.get(k) === review).sort(byOrder);
      if (direct && direct.review === review)
        pieceKeys = [...new Set([...pieceKeys, ...direct.pieceKeys])].sort(byOrder);
    }
    // Шаг со ссылкой на призрак — всегда orphan, какой бы ни была метка строки плана.
    if (ghostHit.length && review !== 'orphan') {
      review = 'orphan';
      pieceKeys = ghostHit.sort(byOrder);
    }
    // Метки не слабеют: стоящая тяжелее — остаётся.
    const had = (op.review ?? '').trim();
    if (rankOf(had) > REVIEW_RANK[review]) review = had as Review;
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
    mark: boolean;
  }[] = [];
  const joinSmv = medianJoinSmv(input.operations);
  for (const sp of splits) {
    const at = slots.findIndex((x) => (x.op.inputKeys ?? []).some((k) => k.trim() === sp.parent));
    if (at < 0) continue; // деталь нигде не вход — части остаются просто новыми деталями
    const unitName = (byKey.get(sp.parent)?.name ?? '').trim() || sp.parent;
    const unitKey = unitCodeOf(unitName, taken);
    let join = deps.makeJoin({
      inputKeys: [sp.parent, ...sp.parts],
      outputUnitKey: unitKey,
      outputUnitName: unitName,
      smv: joinSmv,
      before: slots[at].op,
    });
    join = { ...join, smv: joinSmv };
    if (sp.mark && deps.setReview) join = deps.setReview(join, 'split');
    slots = slots.map((x, i) => (i < at ? x : { ...x, op: swapInput(x.op, sp.parent, unitKey) }));
    slots.splice(at, 0, { op: join, src: -1 });
    joinOps.push({
      op: join,
      parentKey: sp.parent,
      partKeys: sp.parts,
      unitKey,
      unitName,
      mark: sp.mark,
    });
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
  for (const j of joinOps)
    if (j.mark)
      reviews.push({
        opIndex: result.indexOf(j.op),
        review: 'split',
        pieceKeys: [j.parentKey],
      });
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
    opIndexOf: input.operations.map((_, i) => resultIndexOf.get(i) ?? i),
    addedPieceKeys: added,
    joins,
    reshapedPieceKeys: reshaped,
    ghostPieceKeys: inOrder(ghosts),
    removedPieceKeys: inOrder(deleted),
    renamed,
    revisionNote: `dxf reconcile: ${note.length ? note.join(' · ') : 'no changes'}`,
  };
}
