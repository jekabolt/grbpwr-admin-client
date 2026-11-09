// T4 — what a re-import does to the card's ASSEMBLY, said at the apply step before the click.
//
// One pure function, `assemblyImpact(draft, card)`: the draft (blocks bound, unresolved, vanished,
// settings that disagree) against the card's ops and seams. The apply step only renders it. The
// operator's answers ride in `draft.answers`; `withAnswers` turns them into ordinary draft rows
// (aliases, pieces, point writes) and is applied by `planFormWrites` — nothing else writes them.
//
// Severity: `block` — apply waits (an unclear block; a lost piece the assembly uses, owner default
// 1); `warn` — said in the header count, apply stays live (a setting the drawing changes: the card
// keeps its value unless the operator takes the drawing's, owner default 3); `note` — shown only.
//
// Seams that still fit after the re-import are NOT re-confirmed here: the server stamps them stale
// when the source moves, and the card's seam review re-confirms them.

import type {
  AssemblyContext,
  CardDraft,
  DraftAlias,
  DraftPiece,
  DraftPieceDifference,
  DraftPieceUpdate,
  DraftShapeRef,
  ImpactAnswers,
} from '../types';
import {
  FUSING_FULL,
  FUSING_UNKNOWN,
  IDENTICAL,
  aliasKey,
  aliasNames,
  cardNameOf,
  handOf,
  mintLineKey,
  normBlock,
  shapeCost,
} from './draft';
import { FOLD_CUT_SYMMETRY } from 'components/managers/tech-card/components/piece-codes';

export const NEW_PIECE = 'new';
export const KEEP_OLD = 'keep';
const FUSING_ZONE = 'TECH_CARD_PIECE_FUSING_MODE_ZONE';

export type ImpactSeverity = 'block' | 'warn' | 'note';
export type ImpactOp = { number: number; work: string };

/** A card piece offered for an unclear block: its first assembling op and its seam count. */
export type ImpactCandidate = {
  pieceLineKey: string;
  pieceName: string;
  op: number | null;
  seams: number;
};

/**
 * Kind 1 (and 4, 5b): a block of the new file nothing proves is which card piece. `state` as the
 * tiles show it: `open` (asked), `wait` (the second block of an exclusive pair — asked after the
 * first), `user` (answered), `auto` (answered by its pair sibling's answer).
 */
export type ImpactUnclear = {
  kind: 'unclear';
  severity: 'block';
  key: string;
  scopeKey: string;
  blockName: string;
  identity: string;
  state: 'open' | 'wait' | 'user' | 'auto';
  /** The tiles offered now (an answered pair sibling's choice is gone from the second block). */
  candidates: ImpactCandidate[];
  /** All candidates of the block (a pair shows both, the taken one dimmed). */
  all: ImpactCandidate[];
  /** Card piece lineKey or NEW_PIECE; null while open. */
  answer: string | null;
  /** The pair sibling this block follows (`wait` / `auto`). */
  after: string | null;
};

/** Kind 2: a card piece the new file no longer draws, and what of the assembly hangs on it. */
export type ImpactLost = {
  kind: 'lost';
  severity: 'block' | 'warn';
  scopeKey: string;
  pieceLineKey: string;
  pieceName: string;
  direct: ImpactOp[];
  /** Each unit the piece goes into (transitively) with the ops that consume it. */
  units: { unitKey: string; unitName: string; ops: ImpactOp[] }[];
  seams: number;
  fused: 'full' | 'zone' | null;
  /** New blocks of the file it may be (same hand, nearest outline first), at most two. */
  links: { pieceLineKey: string; name: string }[];
  /** KEEP_OLD, a link's draft lineKey, or null while open. */
  answer: string | null;
};

/** Kind 3: a piece the import creates while the card has an assembly — no op uses it yet. */
export type ImpactFresh = {
  kind: 'fresh';
  severity: 'note';
  key: string;
  name: string;
  /** The block (identity) it is cut from, when known. */
  identity: string | null;
};

/** Kinds 6b / 7: card pieces whose setting the drawing changes (one quiz per field). */
export type ImpactDiffer = {
  kind: 'differ';
  severity: 'warn' | 'note';
  field: DraftPieceDifference['field'];
  pieces: DraftPieceDifference[];
  /** null = not answered: the card keeps its value (owner default 3). */
  answer: 'card' | 'drawing' | null;
};

export type Impact = ImpactUnclear | ImpactLost | ImpactFresh | ImpactDiffer;

/** The card facts `assemblyImpact` reads (a `CardContext` fits). */
export type ImpactCard = {
  existingPieces: {
    lineKey: string;
    name: string;
    cutSymmetry?: string;
    piecesPerGarment?: number;
    fused?: boolean;
    fusingMode?: string;
  }[];
  existingShapes?: DraftShapeRef[];
  assembly?: AssemblyContext | null;
};

const lc = (s: string) => normBlock(s).toLowerCase();

/** What of the assembly hangs on one piece: direct ops, then each unit chain, then seams. */
export function hangsOn(
  pieceLineKey: string,
  assembly: AssemblyContext | null | undefined,
): Pick<ImpactLost, 'direct' | 'units' | 'seams'> & { confirmed: number } {
  const ops = assembly?.ops ?? [];
  const ref = (o: AssemblyContext['ops'][number]): ImpactOp => ({ number: o.number, work: o.work });
  const direct = ops.filter((o) => o.inputKeys.includes(pieceLineKey));
  const units: ImpactLost['units'] = [];
  const seen = new Set<string>();
  const queue: string[] = [];
  const enqueue = (o: AssemblyContext['ops'][number]) => {
    const u = o.outputUnitKey.trim();
    if (u && !seen.has(u)) {
      seen.add(u);
      queue.push(u);
    }
  };
  direct.forEach(enqueue);
  for (let i = 0; i < queue.length; i++) {
    const u = queue[i];
    const consumers = ops.filter((o) => o.inputKeys.includes(u));
    const named = ops.find((o) => o.outputUnitKey === u && o.outputUnitName.trim());
    units.push({
      unitKey: u,
      unitName: named?.outputUnitName.trim() || u,
      ops: consumers.map(ref),
    });
    consumers.forEach(enqueue);
  }
  const seams = (assembly?.seams ?? []).filter((s) => s.pieces.includes(pieceLineKey));
  return {
    direct: direct.map(ref),
    units,
    seams: seams.length,
    confirmed: seams.filter((s) => s.confirmed).length,
  };
}

/** The candidate tile's meta: the first op that joins it into a unit (else its first op). */
function candidateOf(
  c: { pieceLineKey: string; pieceName: string },
  assembly: AssemblyContext | null | undefined,
): ImpactCandidate {
  const ops = (assembly?.ops ?? []).filter((o) => o.inputKeys.includes(c.pieceLineKey));
  const join = ops.find((o) => o.outputUnitKey.trim()) ?? ops[0];
  return { ...c, op: join?.number ?? null, seams: hangsOn(c.pieceLineKey, assembly).seams };
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** Exclusive pairs: two unclear blocks of one scope offered the same two card pieces. */
function pairsOf(unresolved: NonNullable<CardDraft['unresolved']>): Map<string, string> {
  const sibling = new Map<string, string>();
  unresolved.forEach((u, i) => {
    const keys = u.candidates.map((c) => c.pieceLineKey);
    if (keys.length !== 2 || sibling.has(aliasKey(u.scopeKey, u.blockName))) return;
    const mates = unresolved.filter(
      (v, j) =>
        j !== i &&
        v.scopeKey === u.scopeKey &&
        sameSet(
          v.candidates.map((c) => c.pieceLineKey),
          keys,
        ),
    );
    if (mates.length !== 1) return;
    const a = aliasKey(u.scopeKey, u.blockName);
    const b = aliasKey(mates[0].scopeKey, mates[0].blockName);
    if (sibling.has(b)) return;
    sibling.set(a, b);
    sibling.set(b, a);
  });
  return sibling;
}

/** The unclear blocks with their answers applied (pair siblings follow). */
function unclearOf(
  draft: CardDraft,
  answers: ImpactAnswers,
  assembly: AssemblyContext | null | undefined,
): ImpactUnclear[] {
  const list = draft.unresolved ?? [];
  const sibling = pairsOf(list);
  const byKey = new Map(list.map((u) => [aliasKey(u.scopeKey, u.blockName), u]));
  const given = (key: string): string | null => {
    const u = byKey.get(key);
    const a = answers.blocks?.[key];
    if (!u || !a) return null;
    return a === NEW_PIECE || u.candidates.some((c) => c.pieceLineKey === a) ? a : null;
  };
  const out: ImpactUnclear[] = [];
  const done = new Set<string>();
  for (const u of list) {
    const key = aliasKey(u.scopeKey, u.blockName);
    if (done.has(key)) continue;
    const all = u.candidates.map((c) => candidateOf(c, assembly));
    const row = (
      v: typeof u,
      k: string,
      state: ImpactUnclear['state'],
      answer: string | null,
      after: string | null,
      offered: ImpactCandidate[],
    ): ImpactUnclear => ({
      kind: 'unclear',
      severity: 'block',
      key: k,
      scopeKey: v.scopeKey,
      blockName: v.blockName,
      identity: v.identity,
      state,
      candidates: offered,
      all: v.candidates.map((c) => candidateOf(c, assembly)),
      answer,
      after,
    });
    const mateKey = sibling.get(key);
    const mate = mateKey ? byKey.get(mateKey) : undefined;
    if (!mate || !mateKey) {
      const a = given(key);
      out.push(row(u, key, a ? 'user' : 'open', a, null, all));
      done.add(key);
      continue;
    }
    // the pair: the first block is asked, the second follows its answer (mockup v3 `derive`)
    const ra = given(key);
    let rb = given(mateKey);
    let autoB = false;
    if (ra && ra !== NEW_PIECE && !rb) {
      rb = mate.candidates.find((c) => c.pieceLineKey !== ra)?.pieceLineKey ?? null;
      autoB = !!rb;
    }
    if (rb && rb !== NEW_PIECE && rb === ra) rb = null;
    if (!ra) {
      out.push(row(u, key, 'open', null, null, all));
      out.push(row(mate, mateKey, 'wait', null, u.blockName, []));
    } else {
      out.push(row(u, key, 'user', ra, null, all));
      const left = mate.candidates
        .filter((c) => c.pieceLineKey !== ra)
        .map((c) => candidateOf(c, assembly));
      out.push(
        rb
          ? row(mate, mateKey, autoB ? 'auto' : 'user', rb, u.blockName, autoB ? [] : left)
          : row(mate, mateKey, 'open', null, u.blockName, left),
      );
    }
    done.add(key);
    done.add(mateKey);
  }
  return out;
}

/** The manifest blocks a draft piece is cut from (its aliases in its scopes). */
function blocksOfPiece(draft: CardDraft, lineKey: string) {
  return draft.aliases
    .filter((a) => a.pieceLineKey === lineKey)
    .flatMap((a) => {
      const sc = draft.scopes.find((s) => s.target.scopeKey === a.scopeKey);
      if (!sc) return [];
      const ids = [...aliasNames(sc.manifest)]
        .filter(([, spelling]) => lc(spelling) === lc(a.blockName))
        .map(([id]) => id);
      return sc.manifest.blocks.filter((b) => ids.includes(b.identity));
    });
}

/** The identity a draft piece is cut from (its first alias's block), for its silhouette. */
export function identityOfPiece(draft: CardDraft, lineKey: string): string | null {
  const a = draft.aliases.find((x) => x.pieceLineKey === lineKey);
  if (!a) return null;
  const sc = draft.scopes.find((s) => s.target.scopeKey === a.scopeKey);
  const hit = sc && [...aliasNames(sc.manifest)].find(([, sp]) => lc(sp) === lc(a.blockName));
  return hit ? hit[0] : a.blockName;
}

/**
 * The assembly impact of applying `draft` to the card, answers included. Pure: the apply step
 * renders it, the session gates apply on it (`blockingCount`). Clean re-import → [].
 */
export function assemblyImpact(draft: CardDraft | null | undefined, card: ImpactCard): Impact[] {
  if (!draft) return [];
  const answers = draft.answers ?? {};
  const assembly = card.assembly ?? null;
  const out: Impact[] = [];
  const nameOf = (k: string) => card.existingPieces.find((p) => p.lineKey === k)?.name ?? k;

  // 1. unclear blocks
  const unclear = unclearOf(draft, answers, assembly);
  out.push(...unclear);

  // 2. lost pieces: no block of the new file draws them, nothing binds them, nothing pending
  const bound = new Set(
    draft.pieces.flatMap((p) => (p.existingLineKey ? [p.existingLineKey] : [])),
  );
  for (const u of unclear) if (u.answer && u.answer !== NEW_PIECE) bound.add(u.answer);
  const pending = new Set<string>();
  for (const u of unclear)
    if (u.state === 'open' || u.state === 'wait')
      for (const c of u.all) pending.add(c.pieceLineKey);
  const fresh = draft.pieces.filter((p) => !p.existingLineKey);
  const linked = new Map<string, string>(); // draft piece → lost piece it was linked to
  for (const [lost, to] of Object.entries(answers.lost ?? {}))
    if (to !== KEEP_OLD && fresh.some((p) => p.lineKey === to)) linked.set(to, lost);
  const seenLost = new Set<string>();
  for (const sc of draft.scopes) {
    for (const v of sc.vanished ?? []) {
      const k = v.pieceLineKey;
      if (bound.has(k) || pending.has(k) || seenLost.has(k)) continue;
      seenLost.add(k);
      const h = hangsOn(k, assembly);
      const live = card.existingPieces.find((p) => p.lineKey === k);
      const mode = (live?.fusingMode ?? '').trim();
      const fused: ImpactLost['fused'] =
        mode === FUSING_ZONE ? 'zone' : live?.fused ? 'full' : null;
      if (!h.direct.length && !h.seams && !fused) continue;
      const hand = handOf(live?.name ?? v.pieceName);
      const ref = (card.existingShapes ?? []).find(
        (r) => r.pieceLineKey === k && r.scopeKey === sc.target.scopeKey,
      );
      const links = fresh
        .filter((p) => (p.scopeKeys ?? []).includes(sc.target.scopeKey))
        .filter((p) => !hand || !handOf(p.name) || handOf(p.name) === hand)
        .filter((p) => !linked.has(p.lineKey) || linked.get(p.lineKey) === k)
        .map((p) => ({
          p,
          cost: ref ? shapeCost(blocksOfPiece(draft, p.lineKey), ref.sizes) : null,
        }))
        .sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity))
        .slice(0, 2)
        .map(({ p }) => ({ pieceLineKey: p.lineKey, name: p.name }));
      const a = answers.lost?.[k];
      const answer = a === KEEP_OLD || (a && links.some((l) => l.pieceLineKey === a)) ? a : null;
      out.push({
        kind: 'lost',
        severity: h.direct.length || h.confirmed ? 'block' : 'warn',
        scopeKey: sc.target.scopeKey,
        pieceLineKey: k,
        pieceName: live?.name ?? v.pieceName ?? nameOf(k),
        direct: h.direct,
        units: h.units,
        seams: h.seams,
        fused,
        links,
        answer,
      });
    }
  }

  // 6b / 7: settings the drawing changes — one quiz per field, the card keeps its value by default
  const diffs = draft.pieceDifferences ?? [];
  const qtyKeys = new Set(
    diffs.filter((d) => d.field === 'piecesPerGarment').map((d) => d.pieceLineKey),
  );
  for (const field of ['piecesPerGarment', 'fused', 'cutSymmetry'] as const) {
    // a symmetry the new count forces follows the count's answer: not asked twice
    const pieces = diffs.filter(
      (d) => d.field === field && !(field === 'cutSymmetry' && qtyKeys.has(d.pieceLineKey)),
    );
    if (!pieces.length) continue;
    const a = answers.take?.[field];
    out.push({
      kind: 'differ',
      severity: field === 'piecesPerGarment' ? 'warn' : 'note',
      field,
      pieces,
      answer: a === 'card' || a === 'drawing' ? a : null,
    });
  }

  // 3. new pieces while the card has an assembly: nothing uses them yet
  if (assembly?.ops.length) {
    for (const p of fresh) {
      if (linked.has(p.lineKey)) continue;
      out.push({
        kind: 'fresh',
        severity: 'note',
        key: p.lineKey,
        name: p.name,
        identity: identityOfPiece(draft, p.lineKey),
      });
    }
    for (const u of unclear)
      if (u.answer === NEW_PIECE)
        out.push({
          kind: 'fresh',
          severity: 'note',
          key: u.key,
          name: u.blockName,
          identity: u.identity,
        });
  }
  return out;
}

/** An answer still owed: an open unclear block, an unanswered lost piece the assembly uses. */
export const isOpen = (i: Impact): boolean =>
  (i.kind === 'unclear' && i.state === 'open') ||
  (i.kind === 'lost' && i.severity === 'block' && !i.answer);

/** How many answers apply waits for. */
export const blockingCount = (impacts: readonly Impact[]): number => impacts.filter(isOpen).length;

/** The header's `! N`: answers owed plus warnings not yet answered. */
export const warnCount = (impacts: readonly Impact[]): number =>
  blockingCount(impacts) +
  impacts.filter(
    (i) =>
      (i.kind === 'differ' && i.severity === 'warn' && !i.answer) ||
      (i.kind === 'lost' && i.severity === 'warn'),
  ).length;

/** Blocks not yet bound: open and waiting unclear blocks (the pieces row's `N unclear`). */
export const unclearCount = (impacts: readonly Impact[]): number =>
  impacts.filter((i) => i.kind === 'unclear' && (i.state === 'open' || i.state === 'wait')).length;

/** A new answers object with one answer set or cleared (undefined clears). */
export function answer(
  prev: ImpactAnswers | undefined,
  part: keyof ImpactAnswers,
  key: string,
  value: string | undefined,
  /** For a pair's first block: the sibling's answer goes with it. */
  clear: string[] = [],
): ImpactAnswers {
  const next: ImpactAnswers = { ...(prev ?? {}) };
  const map = { ...((next[part] as Record<string, string> | undefined) ?? {}) };
  for (const k of clear) delete map[k];
  if (value === undefined) delete map[key];
  else map[key] = value;
  (next as Record<string, unknown>)[part] = map;
  return next;
}

type PieceFacts = ImpactCard['existingPieces'][number] | LiveLike;
type LiveLike = {
  lineKey?: string;
  name?: string;
  piecesPerGarment?: number;
  cutSymmetry?: string;
  fused?: boolean;
  fusingMode?: string;
};

/**
 * The draft with the operator's answers made into ordinary rows — what `planFormWrites` writes:
 * an unclear block linked to a card piece (alias + reused piece) or made a new piece; a lost piece
 * linked to a new block (that block reuses it); a setting taken from the drawing (a point write in
 * `pieceUpdates`). Unanswered = nothing written: the card keeps its value, the block stays unbound.
 */
export function withAnswers(
  draft: CardDraft,
  livePieces: readonly PieceFacts[],
  mint: () => string = mintLineKey,
): CardDraft {
  const answers = draft.answers;
  if (!answers) return draft;
  const pieces: DraftPiece[] = draft.pieces.map((p) => ({ ...p }));
  let aliases: DraftAlias[] = draft.aliases.map((a) => ({ ...a }));
  const live = (k: string) => livePieces.find((p) => (p.lineKey ?? '') === k);
  const reuse = (k: string, scopeKey: string, base?: DraftPiece): DraftPiece => {
    const l = live(k);
    return {
      ...(base ?? { grainline: '', ungraded: false }),
      lineKey: k,
      name: l?.name ?? base?.name ?? k,
      piecesPerGarment: l?.piecesPerGarment ?? 1,
      cutSymmetry: l?.cutSymmetry ?? '',
      grainline: base?.grainline ?? '',
      fused: !!l?.fused,
      fusingMode: l?.fusingMode ?? FUSING_UNKNOWN,
      existingLineKey: k,
      basis: 'alias',
      scopeKeys: base?.scopeKeys ?? [scopeKey],
      symmetryForce: undefined,
    };
  };

  // unclear blocks (pair siblings follow the first block's answer)
  for (const u of unclearOf(draft, answers, null)) {
    if (!u.answer) continue;
    const sc = draft.scopes.find((s) => s.target.scopeKey === u.scopeKey);
    if (!sc) continue;
    let to = u.answer;
    if (to === NEW_PIECE) {
      const mp = sc.manifest.pieces.find((p) => p.identity === u.identity);
      const taken = new Set([
        ...livePieces.map((p) => lc(p.name ?? '')),
        ...pieces.map((p) => lc(p.name)),
      ]);
      const wanted = mp ? cardNameOf(mp) : normBlock(u.identity);
      const name = taken.has(lc(wanted)) ? normBlock(u.identity) : wanted;
      const fused = !!mp?.fused || sc.target.isInterlining;
      to = mint();
      pieces.push({
        lineKey: to,
        name,
        piecesPerGarment: Math.max(1, mp?.piecesPerGarment ?? 1),
        cutSymmetry: mp?.halfFold ? FOLD_CUT_SYMMETRY : IDENTICAL,
        ...(mp?.halfFold
          ? { symmetryForce: 'half' as const }
          : mp?.pairOf
            ? { symmetryForce: 'pair' as const }
            : mp?.unfoldedFold
              ? { symmetryForce: 'unfolded' as const }
              : {}),
        grainline: '',
        fused,
        fusingMode: fused ? FUSING_FULL : FUSING_UNKNOWN,
        existingLineKey: null,
        ungraded: !!mp?.ungraded,
        basis: 'new',
        scopeKeys: [u.scopeKey],
      });
    } else if (!pieces.some((p) => p.existingLineKey === to)) {
      pieces.push(reuse(to, u.scopeKey));
    }
    aliases = aliases.filter((a) => aliasKey(a.scopeKey, a.blockName) !== u.key);
    aliases.push({
      scopeKey: u.scopeKey,
      fabricPurpose: sc.target.fabricPurpose,
      bomLineKey: sc.target.bomLineKey,
      blockName: u.blockName,
      pieceLineKey: to,
    });
  }

  // a lost piece linked to a new block: that block reuses the card piece
  for (const [lost, to] of Object.entries(answers.lost ?? {})) {
    if (to === KEEP_OLD) continue;
    const i = pieces.findIndex((p) => p.lineKey === to && !p.existingLineKey);
    if (i < 0 || pieces.some((p) => p.existingLineKey === lost)) continue;
    pieces[i] = reuse(lost, pieces[i].scopeKeys?.[0] ?? '', pieces[i]);
    aliases = aliases.map((a) => (a.pieceLineKey === to ? { ...a, pieceLineKey: lost } : a));
  }

  // settings taken from the drawing: point writes (the card keeps every other value)
  const updates = new Map<string, DraftPieceUpdate>(
    draft.pieceUpdates.map((u) => [u.lineKey, { ...u }]),
  );
  const diffs = draft.pieceDifferences ?? [];
  const takes = (f: DraftPieceDifference['field']) => answers.take?.[f] === 'drawing';
  const update = (d: DraftPieceDifference) => {
    const u = updates.get(d.pieceLineKey) ?? { lineKey: d.pieceLineKey, reason: '' };
    updates.set(d.pieceLineKey, u);
    return u;
  };
  const reasons = new Map<string, string[]>();
  const say = (k: string, w: string) => reasons.set(k, [...(reasons.get(k) ?? []), w]);
  for (const d of diffs) {
    const qtyTaken = takes('piecesPerGarment');
    const piece = pieces.find((p) => p.existingLineKey === d.pieceLineKey);
    if (d.field === 'piecesPerGarment' && qtyTaken) {
      update(d).piecesPerGarment = Number(d.drawingValue);
      if (piece) piece.piecesPerGarment = Number(d.drawingValue);
      say(d.pieceLineKey, `× per garment ${d.cardValue} → ${d.drawingValue} from the drawing`);
    } else if (d.field === 'fused' && takes('fused')) {
      const u = update(d);
      u.fused = true;
      const mode = (live(d.pieceLineKey)?.fusingMode ?? '').trim();
      if (!mode || mode === FUSING_UNKNOWN) u.fusingMode = FUSING_FULL;
      if (piece) piece.fused = true;
      say(d.pieceLineKey, 'fused from the drawing');
    } else if (d.field === 'cutSymmetry') {
      const withQty = diffs.some(
        (x) => x.field === 'piecesPerGarment' && x.pieceLineKey === d.pieceLineKey,
      );
      if (withQty ? qtyTaken : takes('cutSymmetry')) {
        update(d).cutSymmetry = String(d.drawingValue);
        if (piece) piece.cutSymmetry = String(d.drawingValue);
        if (!withQty) say(d.pieceLineKey, 'symmetry from the drawing');
      }
    }
  }
  for (const [k, words] of reasons) {
    const u = updates.get(k);
    if (u) u.reason = [u.reason, ...words].filter(Boolean).join(' · ');
  }

  return { ...draft, pieces, aliases, pieceUpdates: [...updates.values()], answers: undefined };
}

/** How many pieces apply creates, answers included (the primary's count). */
export function createdCount(draft: CardDraft | null | undefined): number {
  if (!draft) return 0;
  const linked = new Set(Object.values(draft.answers?.lost ?? {}).filter((v) => v !== KEEP_OLD));
  const fresh = draft.pieces.filter((p) => !p.existingLineKey && !linked.has(p.lineKey)).length;
  const made = unclearOf(draft, draft.answers ?? {}, null).filter(
    (u) => u.answer === NEW_PIECE,
  ).length;
  return fresh + made;
}
