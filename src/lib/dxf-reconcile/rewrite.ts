// План → новые строки формы. Детерминированно, без вопросов (поворот 21.10).
//
// Что делается:
//   · детали: 'delete' уходят, переименования и L/R ×2 применяются, новые блоки → новые детали
//     (в конце, в порядке строк плана);
//   · алиасы scope пересобираются ровно из links плана; алиасы других scope проезжают нетронутыми;
//     существующая строка алиаса сохраняется, если её связь не поменялась;
//   · шаги не удаляются, не добавляются и не переставляются; их входы, выходные узлы и аннотации
//     не переписываются — меняется только review на шаге, где задетая деталь стоит входом или
//     участником аннотации (тяжелейшая побеждает);
//   · метки не слабеют (L4c): новая сливается с той, что уже стоит на шаге, по REVIEW_RANK, а шаг,
//     который ссылается на призрак (этой заливки или прошлой, пока у него нет блока), — всегда
//     'orphan';
//   · разрез и доказанная L/R-пара меняют детали/алиасы, но не достраивают за оператора сборку:
//     существующие шаги получают review, новые детали остаются в «+N в сборку».
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
  Tier,
} from './types';

const NOTE_ORDER: Tier[] = ['renamed', 'reshaped', 'split', 'merged', 'added', 'removed', 'moved'];

export function applyPlan<P extends CardPiece, A extends CardAlias, O extends CardOperation>(
  input: ReconcileInput<P, A, O>,
  plan: ReconcilePlan,
  deps: ApplyDeps<P, A, O>,
): ApplyResult<P, A, O> {
  const untouched = (
    refused: ApplyResult<P, A, O>['refused'],
    violations: ApplyResult<P, A, O>['violations'] = [],
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
  const directMarks = new Map<number, { review: Review; pieceKeys: string[] }>();
  for (const r of plan.rows) {
    for (const rv of r.reviews) {
      // `orphan` means the piece row survives without an alias. If a defensive/tampered plan
      // actually removes that row, use the ordinary clearable review mark instead.
      const directReview: Review =
        rv.review === 'orphan' && rv.pieceKeys.every((key) => deleted.has(key.trim()))
          ? 'remapped'
          : rv.review;
      if (rv.operationIndexes?.length) {
        for (const opIndex of rv.operationIndexes) {
          if (opIndex < 0 || opIndex >= input.operations.length) continue;
          const cur = directMarks.get(opIndex);
          if (!cur || REVIEW_RANK[directReview] > REVIEW_RANK[cur.review])
            directMarks.set(opIndex, { review: directReview, pieceKeys: [...rv.pieceKeys] });
          else if (cur.review === directReview)
            cur.pieceKeys = [...new Set([...cur.pieceKeys, ...rv.pieceKeys])];
        }
        continue;
      }
      for (const k of rv.pieceKeys) {
        const t = k.trim();
        const review: Review = rv.review === 'orphan' && deleted.has(t) ? 'remapped' : rv.review;
        const cur = marks.get(t);
        if (!cur || REVIEW_RANK[review] > REVIEW_RANK[cur]) marks.set(t, review);
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

  const reviews: ReviewMark[] = [];
  const operations: O[] = input.operations.map((op, opIndex) => {
    const { inputs, annotations } = opPieceRefs(op);
    const refs = [...new Set([...inputs.map((k) => k.trim()), ...annotations])];
    const hit = refs.filter((k) => marks.has(k));
    // Defensive backstop: a plan should normally keep a referenced removed piece as a ghost, but
    // if its reference projection was incomplete, the step still survives byte-for-byte and is
    // marked instead of being rewritten around the missing piece.
    const ghostHit = refs.filter((k) => ghostsAfter.has(k));
    const danglingHit = refs.filter((k) => deleted.has(k));
    const direct = directMarks.get(opIndex);
    if (!hit.length && !ghostHit.length && !danglingHit.length && !direct) return op;
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
    if (danglingHit.length && REVIEW_RANK.remapped > REVIEW_RANK[review]) {
      review = 'remapped';
      pieceKeys = danglingHit.sort(byOrder);
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

  // Operation identity is positional and structural here: review is the only writable field.
  // Keep the index map explicit so issue references can prove they were not renumbered.
  const result = operations;
  const opIndexOf = input.operations.map((_, index) => index);
  const joins: ApplyResult<P, A, O>['joins'] = [];
  reviews.sort((a, b) => a.opIndex - b.opIndex);

  const reshaped = [...new Set(plan.rows.flatMap((r) => r.reshapedPieceKeys))].filter(
    (k) => !deleted.has(k),
  );
  reshaped.sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));
  const inOrder = (s: Set<string>) =>
    [...s].sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));

  const counts = NOTE_ORDER.map((t) => [t, plan.summary[t]] as const).filter(([, n]) => n > 0);
  const note = [
    ...counts.map(([t, n]) => `${t} ${n}`),
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
    opIndexOf,
    addedPieceKeys: added,
    joins,
    reshapedPieceKeys: reshaped,
    ghostPieceKeys: inOrder(ghosts),
    removedPieceKeys: inOrder(deleted),
    renamed,
    revisionNote: `dxf reconcile: ${note.length ? note.join(' · ') : 'no changes'}`,
  };
}
