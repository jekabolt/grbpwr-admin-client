// S3 (Codex round 3): an operator's answer belongs to the question it answered.
//
// D3 asks what the drawing does not prove (the outline, a count, a name, a fold, the cutting list)
// and the wizard keeps the answers across `back`. Kept by seed alone, an answer outlived its
// question: a multi-model PDF re-numbers seeds per sheet, so "seed 1 is ×1" confirmed on sheet A
// silently answered seed 1 of sheet B. Here every answer is tied to a fingerprint of what was
// asked:
//
//   · the SCOPE — the sheet, its grid and the model (file-level answers: the outline, its allowance);
//   · each piece's REVISION — the scope + the seed + its outline at every rank, as the fill drew it
//     (per-piece answers: names, counts, overrides, grain, fold edges);
//   · the question itself — kind, what was shown, why it was asked (`questionKey`, the counts).
//
// `liveAnswers` keeps only what still matches now; the wizard settles its inputs to it after every
// pieces run, and reads its inputs through it everywhere an answer counts (semantics input, the
// footer, the write gate), so an answer that was not settled away still cannot be used.
import type {
  FabricAssignment,
  NameDecision,
  PieceFamily,
  SeedId,
  StageIO,
  Unproven,
} from 'lib/pattern-import/types';

/** What the current answers were given against: the scope and each piece's revision. */
export type AnswerCtx = { scope: string; revs: Partial<Record<SeedId, string>> };

type Overrides = StageIO['semantics']['in']['pieceOverrides'];
type Edges = Partial<Record<SeedId, { a: { x: number; y: number }; b: { x: number; y: number } }>>;

/** The operator inputs that answer a question (a subset of the wizard's `Inputs`). */
export type Answers = {
  fileAllowance: StageIO['semantics']['in']['fileAllowance'] | null;
  /**
   * The unbound cutting-list entries (as printed) the operator checked (S5): a new entry asks again.
   * Live only while no piece moved; an entry no longer listed simply matches nothing.
   */
  foldListChecked: string[];
  confirmedNames: SeedId[];
  editedNames: SeedId[];
  /** Per seed: the `questionKey` of the count confirmed as shown. */
  confirmedQuantities: Partial<Record<SeedId, string>>;
  overrides: Overrides;
  operatorGrain: Edges;
  operatorFold: Edges;
  assignment: FabricAssignment | null;
  /** The fingerprint the answers above were given (and last settled) against; null = none yet. */
  answerCtx: AnswerCtx | null;
};

/** Stage outputs are never mutated: a family's revision is hashed once (read on every render). */
const revCache = new WeakMap<PieceFamily, string>();

/**
 * A piece's geometry revision: every rank's outcome and outline (0.01 mm), in rank order — the
 * canonical string itself, not a hash of it: two different outlines can never share a revision
 * (a 32-bit hash did collide, Codex round 4 T2). Compared by equality, cached per stage output.
 */
export function pieceRev(f: PieceFamily): string {
  const hit = revCache.get(f);
  if (hit) return hit;
  const ranks = [...f.candidates].sort((a, b) => a.rank - b.rank);
  const rev = ranks
    .map(
      (c) =>
        `${c.rank}:${c.outcome}:${c.outer.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}`,
    )
    .join('|');
  revCache.set(f, rev);
  return rev;
}

/**
 * A8: the revision of the mask a sheet was read with — the masked items (by id, page pass and
 * sheet pass) and the operator's mask edits, as one 64-bit FNV-1a pair of hex words. An answer
 * given on one mask does not survive another (a line set aside or back changes the pieces).
 */
export function maskRevOf(masked: readonly string[], edits: readonly unknown[]): string {
  const text = `${[...masked].sort().join(',')}|${JSON.stringify(edits)}`;
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c ^ (i & 0xff), 0x5bd1e995) >>> 0;
  }
  return `m${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

/**
 * The fingerprint of "now": the sheet (index + grid), the model and every piece the fill returned.
 * A piece's revision carries the scope, so the same outline on another sheet is another question.
 */
export function answerCtxOf(
  at: {
    sheetIndex: number;
    gridOverride: unknown;
    variant: string | null;
    /** A8: the mask the sheet was read with (`maskRevOf`): another mask is another drawing. */
    maskRev?: string;
  },
  families: readonly PieceFamily[] | null | undefined,
): AnswerCtx {
  const scope = JSON.stringify([
    at.sheetIndex,
    at.gridOverride ?? null,
    at.variant ?? null,
    ...(at.maskRev ? [at.maskRev] : []),
  ]);
  const revs: Partial<Record<SeedId, string>> = {};
  for (const f of families ?? []) revs[f.seed] = `${scope}#${f.seed}@${pieceRev(f)}`;
  return { scope, revs };
}

/** Where a "sizes drawn on this sheet" answer (H1) was given: the sheet, its grid, the model. */
export type DrawnAt = { sheetIndex: number; gridOverride: unknown; variant: string | null };
export const drawnSizesKey = (at: DrawnAt) =>
  JSON.stringify([at.sheetIndex, at.gridOverride ?? null, at.variant ?? null]);

const parseDrawnAt = (key: string | null): DrawnAt | null => {
  if (!key) return null;
  try {
    const at: unknown = JSON.parse(key);
    if (!Array.isArray(at) || at.length !== 3) return null;
    const [sheetIndex, gridOverride, variant] = at as [number, unknown, string | null];
    return { sheetIndex, gridOverride, variant };
  } catch {
    return null;
  }
};

/**
 * The drawn-size count, if it was answered on THIS sheet (and grid) for THIS model — exactly: an
 * answer given before any model was picked is bound to the first model picked (`bindDrawnToModel`)
 * and is no wildcard for the others (Codex round 4 T6). Not live = not answered (null).
 */
export function liveDrawnSizes(
  i: { drawnSizes: number | null; drawnSizesAt: string | null },
  now: DrawnAt,
): number | null {
  const at = parseDrawnAt(i.drawnSizesAt);
  if (i.drawnSizes == null || !at) return null;
  return drawnSizesKey(at) === drawnSizesKey(now) ? i.drawnSizes : null;
}

/**
 * A model is picked: a drawn-size answer given on this sheet while no model was picked becomes
 * this model's answer (the pieces it was asked for). Returns the new `drawnSizesAt`, or the old one
 * when there is nothing to bind (already bound, another sheet, no answer).
 */
export function bindDrawnToModel(
  i: { drawnSizes: number | null; drawnSizesAt: string | null },
  now: DrawnAt,
): string | null {
  const at = parseDrawnAt(i.drawnSizesAt);
  if (i.drawnSizes == null || !at || at.variant != null || now.variant == null)
    return i.drawnSizesAt;
  if (drawnSizesKey({ ...at, variant: null }) !== drawnSizesKey({ ...now, variant: null }))
    return i.drawnSizesAt;
  return drawnSizesKey(now);
}

const sameRevs = (a: AnswerCtx['revs'], b: AnswerCtx['revs']) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[+k] === b[+k]);
};

/**
 * The answers that still answer today's questions — pure, nothing mutated, `answerCtx` unchanged:
 *   · per piece (names, counts, overrides, grain, fold edge): the piece's revision is the same;
 *   · the file's outline answer: the scope (sheet, grid, model) is the same;
 *   · "cutting list checked" and the fabric assignment (they speak of every piece): nothing moved.
 * No fingerprint yet (`answerCtx` null) = nothing was answered against anything: none is live.
 */
export function liveAnswers<T extends Answers>(i: T, now: AnswerCtx): T {
  const was = i.answerCtx;
  const sameScope = !!was && was.scope === now.scope;
  const sameSheet = sameScope && sameRevs(was!.revs, now.revs);
  const live = (seed: SeedId) =>
    sameScope && was!.revs[seed] != null && was!.revs[seed] === now.revs[seed];
  const keep = <V>(r: Partial<Record<SeedId, V>>): Partial<Record<SeedId, V>> => {
    const out: Partial<Record<SeedId, V>> = {};
    for (const k of Object.keys(r)) if (live(+k)) out[+k] = r[+k];
    return out;
  };
  return {
    ...i,
    fileAllowance: sameScope ? i.fileAllowance : null,
    foldListChecked: sameSheet ? i.foldListChecked : [],
    confirmedNames: i.confirmedNames.filter(live),
    editedNames: i.editedNames.filter(live),
    confirmedQuantities: keep(i.confirmedQuantities),
    overrides: keep(i.overrides),
    operatorGrain: keep(i.operatorGrain),
    operatorFold: keep(i.operatorFold),
    assignment: sameSheet ? i.assignment : null,
  };
}

/** Settle: drop what no longer matches and re-stamp the rest with `now`. */
export const settleAnswers = <T extends Answers>(i: T, now: AnswerCtx): T => ({
  ...liveAnswers(i, now),
  answerCtx: now,
});

/** Splits a `questionKey` from the piece revision it carries (reports keep the question only). */
export const REV_SEP = '\u0000@';

/**
 * A count confirmed "as shown" is of THIS question: the piece's revision (scope + outline), its
 * kind, what was shown and why it was asked — the full fingerprint, kept with the answer itself.
 */
export const questionKey = (u: Unproven, now: AnswerCtx) =>
  `${u.kind}|${u.shown}|${u.detail}${REV_SEP}${now.revs[u.seed] ?? '-'}`;

type Sem = Pick<StageIO['semantics']['out'], 'unproven' | 'pieces'> &
  Partial<Pick<StageIO['semantics']['out'], 'blocked' | 'folds' | 'foldList'>>;

/**
 * D3: the details step's open questions — what semantics found unproven, minus the LIVE answers,
 * plus the AI names below the auto-accept threshold (decision 11). The outline (allowance) is
 * answered by setting the file's allowance, so it closes in semantics.
 */
export function openQuestions(
  sem: Sem | null | undefined,
  names: readonly NameDecision[],
  answers: Answers,
  now: AnswerCtx,
) {
  const i = liveAnswers(answers, now);
  const un = sem?.unproven ?? [];
  const named = new Set([...i.confirmedNames, ...i.editedNames]);
  const exported = new Set((sem?.pieces ?? []).map((p) => p.seed));
  const allowance = un.filter((u) => u.kind === 'allowance');
  const quantity = un.filter(
    (u) => u.kind === 'quantity' && i.confirmedQuantities[u.seed] !== questionKey(u, now),
  );
  const name = un.filter((u) => u.kind === 'name' && !named.has(u.seed));
  // a DXF block name (lane E3: source 'dxf') is the file's own word, never an AI name to confirm
  const aiNames = names.filter(
    (n) => !n.autoAccepted && n.source !== 'dxf' && !named.has(n.seed) && exported.has(n.seed),
  );
  return {
    allowance,
    quantity,
    name,
    aiNames,
    total: quantity.length + name.length + aiNames.length,
  };
}

/** "3 quantities, 2 names" for the footer and the confirm strip. */
export function countWords(o: ReturnType<typeof openQuestions>): string {
  const n = o.name.length + o.aiNames.length;
  return [
    o.quantity.length
      ? `${o.quantity.length} ${o.quantity.length === 1 ? 'quantity' : 'quantities'}`
      : '',
    n ? `${n} ${n === 1 ? 'name' : 'names'}` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * Everything the details step still asks, recomputed from a semantics run on the live answers:
 * blocked pieces (fold questions and grainlines included), the cutting list, the outline, the
 * counts and names. Empty = nothing unanswered. The write transition refuses on anything here.
 */
export function unansweredAtWrite(
  sem: Sem,
  names: readonly NameDecision[],
  answers: Answers,
  now: AnswerCtx,
): string[] {
  const o = openQuestions(sem, names, answers, now);
  // the cutting list: every unbound entry listed NOW that is not among the live checked ones
  const checked = new Set(liveAnswers(answers, now).foldListChecked);
  const listOpen = sem.foldList
    ? Math.max(1, sem.foldList.entries.filter((e) => !checked.has(e)).length)
    : 0;
  const folds = new Set([
    ...(sem.folds ?? []).map((f) => f.seed),
    ...(sem.blocked ?? []).filter((b) => b.reason === 'fold-question').map((b) => b.seed),
  ]).size;
  const otherBlocked = (sem.blocked ?? []).filter((b) => b.reason !== 'fold-question').length;
  return [
    folds ? `${folds} fold ${folds === 1 ? 'question' : 'questions'}` : '',
    otherBlocked ? `${otherBlocked} blocked ${otherBlocked === 1 ? 'piece' : 'pieces'}` : '',
    listOpen ? `${listOpen} cutting-list ${listOpen === 1 ? 'entry' : 'entries'} to check` : '',
    o.allowance.length ? 'what the drawn outline is' : '',
    o.total ? countWords(o) : '',
  ].filter(Boolean);
}

/**
 * The write transition found questions nobody answered for THIS sheet and model — typically an
 * answer given on another sheet or before the pieces changed, which no longer counts.
 */
export class UnansweredQuestionsError extends Error {
  readonly code = 'unanswered' as const;
  constructor(readonly open: string[]) {
    super(
      `not written: ${open.join(' · ')} — unanswered for this sheet and model; go back to details and answer ${open.length === 1 ? 'it' : 'them'}`,
    );
    this.name = 'UnansweredQuestionsError';
  }
}
