// Ярусы: старые детали scope × новый лист → строки плана с решениями (поворот 21.10: без вопросов).
//
// Порядок матча (каждый шаг работает с остатком предыдущего):
//   1. та же идентичность (имя без размерного хвоста);
//   2. гипотеза единиц по этим парам (весь лист ×10 и т.п.) — дальше новый лист делится на неё;
//   3. размерный хвост одноразмерного листа («PCK_INS_S» ↔ «PCK_INS» XS…XL);
//   4. разрез / слияние по площадям и габаритам;
//   5. форма (жадно, канонически; две одинаковые формы решает место на листе);
//   6. меньше 30 % старых нашли пару → «другой файл»: шаги 4–5 отменяются;
//   7. L/R-пара → одна деталь ×2; moved из другого scope; остальное — пропала / новая.
import { aliasIdentity } from 'components/managers/tech-card/components/nesting/split-pieces';
import { bareToken, normBlock } from 'components/managers/tech-card/components/nesting/block-code';

import { ghostSwapBreaksAssembly } from './candidates';
import {
  MIRRORED,
  THRESH,
  aliasScopeKey,
  ciKey,
  pairCount,
  refCounts,
  uniqueName,
  verdictOf,
  type ShapeVerdict,
} from './defaults';
import {
  assignByShape,
  byName,
  comparePair,
  indexSheet,
  partsFit,
  shapeMatrix,
  sideOf,
  unitsScale,
  type PairCmp,
  type SheetEntry,
  type SheetIndex,
} from './match';
import { seamReshapeVerdict, type PieceGeometry } from './seams';
import type {
  CardAlias,
  CardOperation,
  CardPiece,
  Confidence,
  NewLink,
  NewRef,
  OldRef,
  PieceFate,
  ReconcileInput,
  ReconcilePlan,
  ReconcileRow,
  ReconcileSummary,
  RowReview,
  Tier,
} from './types';

type OldUnit<P> = {
  key: string;
  identity: string;
  piece: P | null;
  entry: SheetEntry | null;
};

type How = 'exact' | 'tail' | 'shape' | 'ghost';

type Link<P> = {
  unit: OldUnit<P>;
  n: SheetEntry;
  how: How;
  /** стоимость матча по форме (срединный размер); 0 у имени и хвоста */
  cost: number;
  confidence: Confidence;
  candidates: { identity: string; cost: number }[];
  /** все общие размеры, худший; null — старой геометрии нет */
  full: PairCmp | null;
  verdict: ShapeVerdict;
};

/** `sure` — no rival candidate (same old piece or a shared part) fits within THRESH.splitMargin */
type Split<P> = { unit: OldUnit<P>; parts: SheetEntry[]; err: number; sure: boolean };
type Merge<P> = { units: OldUnit<P>[]; whole: SheetEntry; err: number };

const TIERS: Tier[] = [
  'unchanged',
  'minor',
  'reshaped',
  'renamed',
  'split',
  'merged',
  'added',
  'removed',
  'moved',
  'unlinked',
];

const confRank: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };

function emptySummary(): ReconcileSummary {
  const counts = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<Tier, number>;
  return { ...counts, matchedShare: 1, otherFile: false, scale: 1 };
}

/** Площадь срединного размера — кто «больше» при разрезе и слиянии. */
const midArea = (e: SheetEntry) =>
  e.bySize.get(e.sizes[Math.floor((e.sizes.length - 1) / 2)])?.areaCm2 ?? 0;

const newRef = (e: SheetEntry): NewRef => ({
  identity: e.identity,
  blocks: e.blocks,
  instances: e.instances,
});

function pct(x: number): string {
  return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`;
}

/** «width ×1.10 · notches +2» — что заметнее всего поменялось. */
function deltaNote(l: Link<unknown>): string {
  const c = l.full?.cmp;
  if (!c || l.verdict === 'unchanged') return '';
  const bits: string[] = [];
  if (Math.abs(c.dW) > THRESH.unchangedRel) bits.push(`width ${pct(c.dW)}`);
  if (Math.abs(c.dH) > THRESH.unchangedRel) bits.push(`height ${pct(c.dH)}`);
  if (!bits.length && Math.abs(c.dArea) > THRESH.unchangedRel) bits.push(`area ${pct(c.dArea)}`);
  if (c.dNotches) bits.push(`notches ${c.dNotches > 0 ? '+' : ''}${c.dNotches}`);
  if (!bits.length) bits.push('outline');
  return bits.join(' · ');
}

export function reconcile<P extends CardPiece, A extends CardAlias, O extends CardOperation>(
  input: ReconcileInput<P, A, O>,
): ReconcilePlan {
  const oldSha = (input.oldSheet?.sha256 ?? '').trim();
  const newSha = (input.newSheet.sha256 ?? '').trim();
  if (oldSha && oldSha === newSha)
    return { status: 'noop', refused: null, rows: [], summary: emptySummary() };

  const dict = new Set(input.sizeTokens.map((t) => bareToken(t)).filter(Boolean));
  const oldIdx: SheetIndex | null = input.oldSheet ? indexSheet(input.oldSheet.parse, dict) : null;
  const newIdx = indexSheet(input.newSheet.parse, dict, oldIdx?.layer);
  const foldSplit = (oldIdx ?? newIdx).split;

  // ── детали и алиасы ──────────────────────────────────────────────────────────────────────
  const pieceByKey = new Map<string, P>();
  for (const p of input.pieces) {
    const k = p.lineKey.trim().toLowerCase();
    if (k && !pieceByKey.has(k)) pieceByKey.set(k, p);
  }
  const scopeKey = input.scope.fabricPurpose.trim() || input.scope.bomLineKey.trim();
  const inScope = input.aliasInScope ?? ((a: A) => aliasScopeKey(a) === scopeKey);
  const scoped: A[] = [];
  const elsewhere = new Set<string>();
  for (const a of input.aliases) {
    if (inScope(a)) scoped.push(a);
    else if ((a.pieceLineKey ?? '').trim())
      elsewhere.add((a.pieceLineKey ?? '').trim().toLowerCase());
  }
  scoped.sort(
    (a, b) =>
      byName(normBlock(a.blockName ?? ''), normBlock(b.blockName ?? '')) ||
      byName(a.pieceLineKey ?? '', b.pieceLineKey ?? ''),
  );

  const units = new Map<string, OldUnit<P>>();
  for (const a of scoped) {
    const piece = pieceByKey.get((a.pieceLineKey ?? '').trim().toLowerCase());
    const block = normBlock(a.blockName ?? '');
    if (!piece || !block) continue;
    const identity = aliasIdentity(block, foldSplit);
    const key = identity.toLowerCase();
    if (units.has(key)) continue;
    const entry = oldIdx?.entries.get(key) ?? null;
    units.set(key, { key, identity: entry?.identity ?? identity, piece, entry });
  }
  for (const e of oldIdx?.entries.values() ?? []) {
    if (!units.has(e.key))
      units.set(e.key, { key: e.key, identity: e.identity, piece: null, entry: e });
  }
  const unitList = [...units.values()].sort((a, b) => byName(a.key, b.key));

  // ── 1. та же идентичность ────────────────────────────────────────────────────────────────
  const links = new Map<string, Omit<Link<P>, 'full' | 'verdict'>>();
  const usedN = new Set<string>();
  const pair = (
    unit: OldUnit<P>,
    n: SheetEntry,
    how: How,
    confidence: Confidence,
    cost = 0,
    candidates: Link<P>['candidates'] = [],
  ) => {
    links.set(unit.key, { unit, n, how, cost, confidence, candidates });
    usedN.add(n.key);
  };
  for (const u of unitList) {
    const n = newIdx.entries.get(u.key);
    if (n) pair(u, n, 'exact', u.entry ? 'high' : 'low');
  }

  // ── 2. единицы ───────────────────────────────────────────────────────────────────────────
  const scale = unitsScale(
    [...links.values()]
      .filter((l) => l.unit.entry)
      .map((l) => [l.unit.entry!, l.n] as [SheetEntry, SheetEntry]),
  );

  // ── 3. размерный хвост ───────────────────────────────────────────────────────────────────
  const newLeft = () =>
    [...newIdx.entries.values()]
      .filter((n) => !usedN.has(n.key))
      .sort((a, b) => byName(a.key, b.key));
  for (const u of unitList) {
    if (links.has(u.key) || !u.entry) continue;
    if (u.entry.sizes.length === 1 && u.entry.sizes[0] === '' && u.entry.tail) {
      const n = newIdx.entries.get(u.entry.stem.toLowerCase());
      if (n && !usedN.has(n.key)) pair(u, n, 'tail', 'high');
    }
  }
  for (const n of newLeft()) {
    if (!(n.sizes.length === 1 && n.sizes[0] === '' && n.tail)) continue;
    const u = units.get(n.stem.toLowerCase());
    if (u && !links.has(u.key)) pair(u, n, 'tail', 'high');
  }

  // ── 4–5. разрез / слияние и форма — по остатку ───────────────────────────────────────────
  const oldLeftWithGeom = () => unitList.filter((u) => !links.has(u.key) && u.entry);
  const matrix = shapeMatrix(
    oldLeftWithGeom().map((u) => u.entry!),
    newLeft(),
    scale,
  );
  const minCostO = new Map<string, number>();
  const minCostN = new Map<string, number>();
  for (const c of matrix) {
    minCostO.set(c.o, Math.min(minCostO.get(c.o) ?? Infinity, c.cost));
    minCostN.set(c.n, Math.min(minCostN.get(c.n) ?? Infinity, c.cost));
  }
  const renamesClearly = (cost: number | undefined) =>
    (cost ?? Infinity) <= THRESH.splitNotIfRename;

  let splits: Split<P>[] = [];
  let merges: Merge<P>[] = [];
  {
    const olds = oldLeftWithGeom().filter((u) => u.piece);
    const news = newLeft();
    type Cand = {
      kind: 'split' | 'merge';
      olds: OldUnit<P>[];
      news: SheetEntry[];
      err: number;
      id: string;
    };
    const cands: Cand[] = [];
    for (const o of olds) {
      if (renamesClearly(minCostO.get(o.key))) continue;
      for (let i = 0; i < news.length; i++) {
        for (let j = i + 1; j < news.length; j++) {
          const parts = [news[i], news[j]];
          if (parts.some((p) => renamesClearly(minCostN.get(p.key)))) continue;
          const err = partsFit(o.entry!, parts, scale);
          if (err !== null)
            cands.push({
              kind: 'split',
              olds: [o],
              news: parts,
              err,
              id: `${o.key}>${parts[0].key}+${parts[1].key}`,
            });
        }
      }
    }
    for (const n of news) {
      if (renamesClearly(minCostN.get(n.key))) continue;
      for (let i = 0; i < olds.length; i++) {
        for (let j = i + 1; j < olds.length; j++) {
          const parts = [olds[i], olds[j]];
          if (parts.some((p) => renamesClearly(minCostO.get(p.key)))) continue;
          const err = partsFit(
            n,
            parts.map((p) => p.entry!),
            1 / scale,
          );
          if (err !== null)
            cands.push({
              kind: 'merge',
              olds: parts,
              news: [n],
              err,
              id: `${parts[0].key}+${parts[1].key}>${n.key}`,
            });
        }
      }
    }
    cands.sort((a, b) => a.err - b.err || byName(a.id, b.id));
    const takenO = new Set<string>();
    const takenN = new Set<string>();
    for (const c of cands) {
      if (c.olds.some((u) => takenO.has(u.key)) || c.news.some((n) => takenN.has(n.key))) continue;
      c.olds.forEach((u) => takenO.add(u.key));
      c.news.forEach((n) => takenN.add(n.key));
      // Ambiguity: another candidate over the same old piece or a shared part fits nearly as well.
      const rival = Math.min(
        ...cands
          .filter(
            (x) =>
              x !== c &&
              (x.olds.some((u) => c.olds.includes(u)) || x.news.some((n) => c.news.includes(n))),
          )
          .map((x) => x.err),
        Infinity,
      );
      const sure = rival - c.err >= THRESH.splitMargin;
      if (c.kind === 'split') splits.push({ unit: c.olds[0], parts: c.news, err: c.err, sure });
      else
        merges.push({
          units: [...c.olds].sort(
            (a, b) => midArea(b.entry!) - midArea(a.entry!) || byName(a.key, b.key),
          ),
          whole: c.news[0],
          err: c.err,
        });
    }
  }
  const inSplitMerge = (k: string) =>
    splits.some((s) => s.unit.key === k || s.parts.some((p) => p.key === k)) ||
    merges.some((m) => m.whole.key === k || m.units.some((u) => u.key === k));

  for (const m of assignByShape(matrix.filter((c) => !inSplitMerge(c.o) && !inSplitMerge(c.n)))) {
    pair(units.get(m.o)!, newIdx.entries.get(m.n)!, 'shape', m.confidence, m.cost, m.candidates);
  }

  // ── 6. другой файл ───────────────────────────────────────────────────────────────────────
  const linked = unitList.filter((u) => u.piece);
  // Пара по форме засчитывается, только если она уверенная по стоимости: карманы другого файла
  // всегда найдут «ближайший» воротник, но не дешевле renameSure.
  const found = (u: OldUnit<P>) => {
    const l = links.get(u.key);
    return (l && (l.how !== 'shape' || l.cost <= THRESH.renameSure)) || inSplitMerge(u.key);
  };
  // Доля — по деталям заменяемого листа (targetFileIndex), если он назван: нетронутый соседний лист
  // слота совпадает сам с собой и иначе прятал бы чужой файл, брошенный на другой лист.
  const target = input.targetFileIndex;
  const pool =
    target === undefined ? linked : linked.filter((u) => !!u.entry?.files.includes(target));
  const share = () => (pool.length === 0 ? 1 : pool.filter(found).length / pool.length);
  let matchedShare = share();
  const otherFile = linked.length > 0 && matchedShare < THRESH.otherFileShare;
  if (otherFile) {
    const summary = emptySummary();
    return {
      status: 'ready',
      refused: 'foreign',
      rows: [],
      summary: { ...summary, matchedShare, otherFile: true, scale },
    };
  }

  // ── полные сравнения пар ─────────────────────────────────────────────────────────────────
  const full = new Map<string, Link<P>>();
  for (const [k, l] of links) {
    const cmp = l.unit.entry ? comparePair(l.unit.entry, l.n, scale, true) : null;
    full.set(k, { ...l, full: cmp, verdict: verdictOf(cmp?.cmp ?? null) });
  }

  // ── 7a. L/R-пара → одна деталь ───────────────────────────────────────────────────────────
  // Непарный старый «X_R», чей партнёр «X_L» нашёл новый блок N, и сам конгруэнтен N.
  const collapsed = new Map<string, { unit: OldUnit<P>; into: Link<P> }>();
  if (!otherFile) {
    for (const u of unitList) {
      if (!u.piece || !u.entry || links.has(u.key) || inSplitMerge(u.key)) continue;
      const side = sideOf(u.identity);
      if (!side) continue;
      const partner = [...full.values()]
        .filter(
          (l) =>
            l.unit.piece &&
            sideOf(l.unit.identity)?.stem === side.stem &&
            sideOf(l.unit.identity)?.side !== side.side,
        )
        .sort((a, b) => byName(a.unit.key, b.unit.key))[0];
      // Новый блок без стороны («FP», не «FP_R»): лист сам свернул пару. Пропавшая половина при
      // живой и всё ещё сторонней второй — просто пропавшая деталь.
      if (!partner || sideOf(partner.n.identity)) continue;
      const c = comparePair(u.entry, partner.n, scale, false);
      if (c && c.cmp.cost <= THRESH.pairCost) collapsed.set(u.key, { unit: u, into: partner });
    }
    // Соперник партнёра по форме — его же вторая половина; она поглощена, уверенность без неё.
    for (const l of full.values()) {
      if (l.how !== 'shape' || l.confidence !== 'medium') continue;
      const gone = new Set(
        [...collapsed.values()].filter((c) => c.into === l).map((c) => c.unit.key),
      );
      if (!gone.size) continue;
      const rival = Math.min(
        ...matrix
          .filter((x) => !gone.has(x.o) && (x.o === l.unit.key) !== (x.n === l.n.key))
          .map((x) => x.cost),
        Infinity,
      );
      if (rival - l.cost >= THRESH.renameMargin) l.confidence = 'high';
    }
  }

  // Свёрнутая половина пары тоже нашла себе блок — для чипа доля честнее с ней.
  if (collapsed.size) {
    matchedShare = pool.length
      ? pool.filter((u) => found(u) || collapsed.has(u.key)).length / pool.length
      : 1;
  }

  // ── 7b. moved / shared из другого scope ──────────────────────────────────────────────────
  const moved: { n: SheetEntry; piece: P }[] = [];
  const linkedPieces = new Set(
    [...full.values()]
      .filter((l) => l.unit.piece)
      .map((l) => l.unit.piece!.lineKey.trim().toLowerCase()),
  );
  if (input.otherSheets?.length) {
    const others = input.otherSheets.map((s) => {
      const key = s.scope.fabricPurpose.trim() || s.scope.bomLineKey.trim();
      return { key, idx: indexSheet(s.parse, dict) };
    });
    for (const n of newLeft().filter((e) => !inSplitMerge(e.key))) {
      const hits: { piece: P; cost: number; order: string }[] = [];
      for (const a of input.aliases) {
        if (inScope(a)) continue;
        const other = others.find((o) => o.key === aliasScopeKey(a));
        const piece = pieceByKey.get((a.pieceLineKey ?? '').trim().toLowerCase());
        if (!other || !piece || linkedPieces.has(piece.lineKey.trim().toLowerCase())) continue;
        const ident = aliasIdentity(normBlock(a.blockName ?? ''), other.idx.split).toLowerCase();
        if (ident !== n.key) continue;
        const e = other.idx.entries.get(ident);
        const c = e ? comparePair(e, n, 1, true) : null;
        if (c && c.cmp.cost <= THRESH.movedMax)
          hits.push({ piece, cost: c.cmp.cost, order: piece.lineKey });
      }
      hits.sort((a, b) => a.cost - b.cost || byName(a.order, b.order));
      if (hits[0]) {
        moved.push({ n, piece: hits[0].piece });
        usedN.add(n.key);
        linkedPieces.add(hits[0].piece.lineKey.trim().toLowerCase());
      }
    }
  }

  // ── 7c. единственная новая деталь уверенно заменяет призрак ──────────────────────────────
  // Кандидатами служат только ещё не связанные блоки этой заливки. Существующая деталь карты не
  // может исчезнуть под видом автоматической замены призрака.
  const refs = refCounts(input.operations, input.externalRefs);
  const pk = (p: P) => p.lineKey.trim().toLowerCase();
  const fateOf = (p: P): PieceFate =>
    elsewhere.has(pk(p)) ? 'keep' : (refs.get(p.lineKey.trim()) ?? 0) > 0 ? 'ghost' : 'delete';
  const movedKeys = new Set(moved.map((x) => x.n.key));
  const ghostNews = newLeft().filter((n) => !inSplitMerge(n.key) && !movedKeys.has(n.key));
  type GhostProposal = {
    unit: OldUnit<P>;
    n: SheetEntry;
    cost: number;
    candidates: { identity: string; cost: number }[];
  };
  const proposals: GhostProposal[] = [];
  const byGhostPiece = new Map<P, OldUnit<P>[]>();
  for (const u of unitList) {
    if (!u.piece || !u.entry || links.has(u.key) || inSplitMerge(u.key) || collapsed.has(u.key))
      continue;
    const list = byGhostPiece.get(u.piece) ?? [];
    list.push(u);
    byGhostPiece.set(u.piece, list);
  }
  for (const [piece, oldUnits] of byGhostPiece) {
    if (fateOf(piece) !== 'ghost') continue;
    const ranked = ghostNews
      .map((n) => {
        const costs = oldUnits.flatMap((u) => {
          const c = comparePair(u.entry!, n, scale, false);
          return c ? [{ unit: u, cost: c.cmp.cost }] : [];
        });
        costs.sort((a, b) => a.cost - b.cost || byName(a.unit.key, b.unit.key));
        return costs[0] ? { n, ...costs[0] } : null;
      })
      .filter((x): x is { n: SheetEntry; unit: OldUnit<P>; cost: number } => !!x)
      .sort((a, b) => a.cost - b.cost || byName(a.n.key, b.n.key));
    const sure = ranked.filter((x) => x.cost <= THRESH.renameMax);
    const best = sure.length === 1 ? sure[0] : null;
    const runner = ranked.find((x) => x !== best);
    if (!best || (runner && runner.cost - best.cost < THRESH.ghostRenameMargin)) continue;
    const syntheticKey = `__dxf_new_${best.n.key}`;
    if (
      ghostSwapBreaksAssembly(
        [...input.pieces, { ...piece, lineKey: syntheticKey }],
        input.operations,
        piece.lineKey,
        syntheticKey,
      )
    )
      continue;
    proposals.push({
      ...best,
      candidates: ranked.slice(0, 3).map((x) => ({ identity: x.n.identity, cost: x.cost })),
    });
  }
  const proposalCount = new Map<string, number>();
  for (const p of proposals) proposalCount.set(p.n.key, (proposalCount.get(p.n.key) ?? 0) + 1);
  for (const p of proposals
    .filter((x) => proposalCount.get(x.n.key) === 1)
    .sort((a, b) => a.cost - b.cost || byName(a.unit.key, b.unit.key))) {
    if (usedN.has(p.n.key) || links.has(p.unit.key)) continue;
    pair(p.unit, p.n, 'ghost', 'high', p.cost, p.candidates);
    const cmp = comparePair(p.unit.entry!, p.n, scale, true);
    full.set(p.unit.key, {
      unit: p.unit,
      n: p.n,
      how: 'ghost',
      cost: p.cost,
      confidence: 'high',
      candidates: p.candidates,
      full: cmp,
      verdict: 'unchanged',
    });
  }
  if (proposals.length) matchedShare = share();

  // ── строки ───────────────────────────────────────────────────────────────────────────────
  // Geometry by existing card piece, after every accepted link. It also includes other scopes when
  // their parsed sheets were supplied, so a seam across materials can still be re-measured.
  const geometry = new Map<string, PieceGeometry>();
  for (const l of [...full.values()].sort((a, b) => byName(a.unit.key, b.unit.key)))
    if (l.unit.piece && !geometry.has(l.unit.piece.lineKey))
      geometry.set(l.unit.piece.lineKey, { entry: l.n, scale });
  for (const m of moved)
    if (!geometry.has(m.piece.lineKey)) geometry.set(m.piece.lineKey, { entry: m.n, scale: 1 });
  for (const sheet of input.otherSheets ?? []) {
    const key = sheet.scope.fabricPurpose.trim() || sheet.scope.bomLineKey.trim();
    const idx = indexSheet(sheet.parse, dict);
    for (const a of input.aliases) {
      if (aliasScopeKey(a) !== key) continue;
      const piece = pieceByKey.get((a.pieceLineKey ?? '').trim().toLowerCase());
      const identity = aliasIdentity(normBlock(a.blockName ?? ''), idx.split).toLowerCase();
      const entry = idx.entries.get(identity);
      if (piece && entry && !geometry.has(piece.lineKey))
        geometry.set(piece.lineKey, { entry, scale: 1 });
    }
  }

  const unitsOf = new Map<string, OldUnit<P>[]>();
  for (const u of unitList) {
    if (!u.piece) continue;
    const list = unitsOf.get(pk(u.piece)) ?? [];
    list.push(u);
    unitsOf.set(pk(u.piece), list);
  }

  const rows: ReconcileRow[] = [];
  const renameWish: { row: ReconcileRow; piece: P; to: string }[] = [];
  const oldRef = (u: OldUnit<P>, fate: PieceFate, piece = u.piece): OldRef => ({
    pieceLineKey: piece?.lineKey ?? '',
    pieceName: piece?.name ?? '',
    identity: u.identity,
    fate,
  });
  const pushReview = (
    list: RowReview[],
    review: RowReview['review'],
    keys: string[],
    operationIndexes?: number[],
    mark = true,
  ) => {
    if (!keys.length) return;
    const direct = operationIndexes?.length
      ? [...new Set(operationIndexes)].sort((a, b) => a - b)
      : undefined;
    const hit = list.find(
      (r) =>
        r.review === review &&
        (r.mark !== false) === mark &&
        JSON.stringify(r.operationIndexes ?? []) === JSON.stringify(direct ?? []),
    );
    if (hit) hit.pieceKeys = [...new Set([...hit.pieceKeys, ...keys])];
    else
      list.push({
        review,
        pieceKeys: [...keys],
        ...(direct ? { operationIndexes: direct } : {}),
        ...(mark ? {} : { mark: false }),
      });
  };

  // Поглощённая деталь (слияние / L/R-пара): своих связей нет — призрак или удаление.
  const absorbedFate = (q: P): PieceFate => {
    const own = (unitsOf.get(pk(q)) ?? []).some(
      (u) =>
        full.has(u.key) ||
        splits.some((s) => s.unit.key === u.key) ||
        merges.some((m) => m.units[0].key === u.key),
    );
    return own ? 'keep' : fateOf(q);
  };

  for (const list of [...unitsOf.values()].sort((a, b) => byName(a[0].key, b[0].key))) {
    const piece = list[0].piece!;
    const myLinks = list.map((u) => full.get(u.key)).filter((l): l is Link<P> => !!l);
    const mySplit = splits.find((s) => list.includes(s.unit));
    const myMerge = merges.find((m) => list.includes(m.units[0]));
    const absorbedHere = [...collapsed.values()].filter((c) => c.into.unit.piece === piece);
    const isAbsorbedElsewhere =
      merges.some((m) => list.includes(m.units[1]) && m.units[0].piece !== piece) ||
      [...collapsed.values()].some((c) => list.includes(c.unit) && c.into.unit.piece !== piece);
    if (!myLinks.length && !mySplit && !myMerge && !absorbedHere.length) {
      if (isAbsorbedElsewhere) continue; // строку ведёт деталь, которая его поглотила
      const fate = fateOf(piece);
      const reviews: RowReview[] = [];
      if (fate === 'ghost') pushReview(reviews, 'orphan', [piece.lineKey]);
      rows.push({
        id: `p:${list[0].key}`,
        tier: 'removed',
        old: list.map((u) => oldRef(u, fate)),
        new: [],
        confidence: 'high',
        candidates: [],
        delta: null,
        links: [],
        rename: null,
        pieceUpdate: null,
        reviews,
        reshapedPieceKeys: [],
        note:
          fate === 'keep'
            ? 'still in another material'
            : fate === 'ghost'
              ? 'kept: has references'
              : '',
      });
      continue;
    }

    const old: OldRef[] = list.map((u) => oldRef(u, 'keep'));
    const neu: NewRef[] = [];
    const nlinks: NewLink[] = [];
    const reviews: RowReview[] = [];
    const reshaped: string[] = [];
    const notes: string[] = [];
    let tier: Tier = 'unchanged';
    let confidence: Confidence = 'high';
    let delta: ReconcileRow['delta'] = null;
    let pieceUpdate: ReconcileRow['pieceUpdate'] = null;
    let renameTo: string | null = null;
    const rankTier = (t: Tier) => {
      const order: Tier[] = ['unchanged', 'minor', 'reshaped', 'renamed', 'merged', 'split'];
      if (order.indexOf(t) > order.indexOf(tier)) tier = t;
    };

    for (const l of [...myLinks].sort((a, b) => byName(a.n.key, b.n.key))) {
      neu.push(newRef(l.n));
      nlinks.push({ identity: l.n.identity, pieceLineKey: piece.lineKey, name: '' });
      if (confRank[l.confidence] < confRank[confidence]) confidence = l.confidence;
      if (!delta || (l.full && l.full.cmp.cost > delta.cost))
        delta = l.full ? { ...l.full.cmp } : delta;
      if (l.unit.key !== l.n.key) {
        rankTier('renamed');
        notes.push(`${l.unit.identity} → ${l.n.identity}`);
      }
      if (l.verdict === 'changed') {
        rankTier('reshaped');
        reshaped.push(piece.lineKey);
        const d = deltaNote(l);
        if (d) notes.push(d);
      } else if (l.verdict === 'minor') rankTier('minor');
      if (l.how === 'shape' && l.confidence !== 'high')
        pushReview(reviews, 'remapped', [piece.lineKey]);
    }
    if (reshaped.length && !reviews.some((r) => r.pieceKeys.includes(piece.lineKey))) {
      const seamVerdict = seamReshapeVerdict(input, piece.lineKey, geometry);
      if (seamVerdict.kind === 'seams') {
        for (const r of seamVerdict.reviews)
          pushReview(reviews, r.review, r.pieceKeys, r.operationIndexes);
      } else {
        const outsideAutoAccept = myLinks.some((l) => {
          const c = l.full?.cmp;
          return (
            l.verdict === 'changed' &&
            (!c ||
              Math.abs(c.dArea) > THRESH.autoAcceptRel ||
              Math.abs(c.dPerim) > THRESH.autoAcceptRel ||
              c.dNotches !== 0)
          );
        });
        if (outsideAutoAccept) pushReview(reviews, 'reshaped', [piece.lineKey]);
      }
    }
    if (myLinks.length === 1 && list.length >= 1) {
      const l = myLinks[0];
      if (l.unit.key !== l.n.key && ciKey(piece.name) === ciKey(l.unit.identity))
        renameTo = l.n.identity;
    }

    if (mySplit) {
      // Деталь идёт за большей частью (площадь срединного размера, затем имя), остальные — новые.
      const parts = [...mySplit.parts].sort(
        (a, b) => midArea(b) - midArea(a) || byName(a.key, b.key),
      );
      tier = 'split';
      confidence = 'medium';
      parts.forEach((e, i) => {
        neu.push(newRef(e));
        nlinks.push({
          identity: e.identity,
          pieceLineKey: i === 0 ? piece.lineKey : null,
          name: '',
        });
      });
      reshaped.push(piece.lineKey);
      // A clean split joins unmarked only when its candidate was unique; doubt keeps the mark.
      pushReview(reviews, 'split', [piece.lineKey], undefined, !mySplit.sure);
      notes.push(`${mySplit.unit.identity} → ${parts.map((e) => e.identity).join(' + ')}`);
      if (!myLinks.length && ciKey(piece.name) === ciKey(mySplit.unit.identity))
        renameTo = parts[0].identity;
    }

    if (myMerge) {
      const q = myMerge.units[1].piece!;
      const sameP = q === piece;
      const fate: PieceFate = sameP ? 'keep' : absorbedFate(q);
      tier = 'merged';
      confidence = 'medium';
      neu.push(newRef(myMerge.whole));
      nlinks.push({ identity: myMerge.whole.identity, pieceLineKey: piece.lineKey, name: '' });
      if (!sameP) old.push(oldRef(myMerge.units[1], fate, q));
      reshaped.push(piece.lineKey);
      pushReview(
        reviews,
        sameP ? 'reshaped' : 'remapped',
        fate === 'ghost' ? [piece.lineKey, q.lineKey] : [piece.lineKey],
      );
      notes.push(`${myMerge.units.map((u) => u.identity).join(' + ')} → ${myMerge.whole.identity}`);
      if (!myLinks.length && ciKey(piece.name) === ciKey(myMerge.units[0].identity))
        renameTo = myMerge.whole.identity;
    }

    for (const c of absorbedHere.sort((a, b) => byName(a.unit.key, b.unit.key))) {
      const q = c.unit.piece!;
      const sameP = q === piece;
      const fate: PieceFate = sameP ? 'keep' : absorbedFate(q);
      if (!sameP) old.push(oldRef(c.unit, fate, q));
      rankTier('merged');
      const ppg = pairCount(piece.piecesPerGarment);
      if (ppg !== piece.piecesPerGarment || (piece.cutSymmetry ?? '') !== MIRRORED) {
        pieceUpdate = { pieceLineKey: piece.lineKey, piecesPerGarment: ppg, cutSymmetry: MIRRORED };
      }
      if (fate === 'ghost') pushReview(reviews, 'remapped', [q.lineKey]);
      notes.push(`L/R pair ${c.into.unit.identity} + ${c.unit.identity} → ×2`);
    }

    // Блоки детали, которые просто исчезли, а деталь жива другими (веер алиасов).
    for (const u of list) {
      if (
        full.has(u.key) ||
        collapsed.has(u.key) ||
        mySplit?.unit === u ||
        myMerge?.units.includes(u)
      )
        continue;
      notes.push(`−${u.identity}`);
    }

    const row: ReconcileRow = {
      id: `p:${list[0].key}`,
      tier,
      old,
      new: neu,
      confidence,
      candidates: myLinks.flatMap((l) => l.candidates),
      delta,
      links: nlinks,
      rename: null,
      pieceUpdate,
      reviews,
      reshapedPieceKeys: [...new Set(reshaped)],
      note: notes.join(' · '),
    };
    rows.push(row);
    if (renameTo) renameWish.push({ row, piece, to: renameTo });
  }

  // Старые блоки без детали, нашедшие пару, — новых деталей под них не заводим.
  for (const l of [...full.values()]
    .filter((x) => !x.unit.piece)
    .sort((a, b) => byName(a.n.key, b.n.key))) {
    rows.push({
      id: `u:${l.n.key}`,
      tier: 'unlinked',
      old: [oldRef(l.unit, 'keep')],
      new: [newRef(l.n)],
      confidence: l.confidence,
      candidates: l.candidates,
      delta: l.full?.cmp ?? null,
      links: [],
      rename: null,
      pieceUpdate: null,
      reviews: [],
      reshapedPieceKeys: [],
      note: '',
    });
  }

  for (const m of moved) {
    rows.push({
      id: `m:${m.n.key}`,
      tier: 'moved',
      old: [{ pieceLineKey: m.piece.lineKey, pieceName: m.piece.name, identity: '', fate: 'keep' }],
      new: [newRef(m.n)],
      confidence: 'high',
      candidates: [],
      delta: null,
      links: [{ identity: m.n.identity, pieceLineKey: m.piece.lineKey, name: '' }],
      rename: null,
      pieceUpdate: null,
      reviews: [],
      reshapedPieceKeys: [],
      note: 'shared with another material',
    });
  }

  const splitParts = new Set(splits.flatMap((s) => s.parts.map((p) => p.key)));
  const mergeWholes = new Set(merges.map((m) => m.whole.key));
  const placedKeys = new Set(
    input.operations.flatMap((o) => (o.inputKeys ?? []).map((k) => k.trim())).filter(Boolean),
  );
  for (const n of newLeft()) {
    if (splitParts.has(n.key) || mergeWholes.has(n.key)) continue;
    const side = sideOf(n.identity);
    const pair = side
      ? [...full.values()]
          .flatMap((l) => {
            const other = sideOf(l.n.identity);
            if (
              !l.unit.piece ||
              !placedKeys.has(l.unit.piece.lineKey.trim()) ||
              !other ||
              other.stem !== side.stem ||
              other.side === side.side
            )
              return [];
            const c = comparePair(l.n, n, 1, false);
            return c &&
              c.cmp.cost <= THRESH.pairCost &&
              (c.cmp.frame === 'mirrorU' || c.cmp.frame === 'mirrorV')
              ? [{ pieceLineKey: l.unit.piece.lineKey, cost: c.cmp.cost }]
              : [];
          })
          .sort((a, b) => a.cost - b.cost || byName(a.pieceLineKey, b.pieceLineKey))[0]
      : undefined;
    rows.push({
      id: `n:${n.key}`,
      tier: 'added',
      old: [],
      new: [newRef(n)],
      confidence: 'high',
      candidates: [],
      delta: null,
      links: [
        {
          identity: n.identity,
          pieceLineKey: null,
          name: '',
          ...(pair ? { placeWithPieceKey: pair.pieceLineKey } : {}),
        },
      ],
      rename: null,
      pieceUpdate: null,
      reviews: [],
      reshapedPieceKeys: [],
      note: n.instances > 1 ? `×${n.instances}` : '',
    });
  }

  rows.sort((a, b) => byName(a.id, b.id));

  // ── имена: переименования, затем новые детали — в порядке строк ──────────────────────────
  const deleted = new Set(
    rows.flatMap((r) => r.old.filter((o) => o.fate === 'delete').map((o) => o.pieceLineKey)),
  );
  const taken = new Set(
    input.pieces.filter((p) => !deleted.has(p.lineKey)).map((p) => ciKey(p.name)),
  );
  for (const w of renameWish.sort((a, b) => byName(a.row.id, b.row.id))) {
    const to = normBlock(w.to);
    if (taken.has(ciKey(to))) continue; // имя занято другой деталью — оставляем как было
    taken.delete(ciKey(w.piece.name));
    taken.add(ciKey(to));
    w.row.rename = { pieceLineKey: w.piece.lineKey, to };
  }
  for (const r of rows) {
    for (const l of r.links) if (l.pieceLineKey === null) l.name = uniqueName(l.identity, taken);
  }

  const summary = emptySummary() as Record<Tier, number> & ReconcileSummary;
  for (const r of rows) (summary as Record<Tier, number>)[r.tier]++;
  return {
    status: 'ready',
    refused: null,
    rows,
    summary: { ...summary, matchedShare, otherFile, scale },
  };
}
