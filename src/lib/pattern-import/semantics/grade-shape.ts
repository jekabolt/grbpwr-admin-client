// GRADE P1 (owner 16.10, card 49 — "the same piece must have the same outline in every size"),
// semantics hook: one piece's sizes after every size is built (outline cleaned, features read),
// before the pair is mirrored and the piece written.
//   1. notches: a notch drawn in ≥ 2 sizes at a grade-consistent place on the piece's canonical
//      topology is placed on the sizes that lack it — flagged `graded` (D5: recorded in the piece's
//      notes, counted in the manifest, never presented as drawn); a notch drawn in ONE size of ≥ 3 is
//      a question (all / none / only this), applied only when the operator answers it;
//   2. counts: sizes that still carry different numbers of notches / drills / internal lines
//      (buttonholes among them) — an explicit question, "in size S 5, in XL 7 — intended?", with
//      every size's places; "intended" lifts the G5 count warning / hold and goes to the passport.
// Nothing here blocks or changes an outline; the autopilot never answers (D3).
//   probe switch (node only): GRADE_P1_OFF=1 — the hook does nothing (the "before" column)
import type {
  GradeAnswer,
  GradeAsk,
  GradeCountFeature,
  NotchFeature,
  PieceSizeSpec,
  PtMm,
  SeedId,
} from '../types';
import { gradeNotches, type LoneAnswer } from '../pieces/gfit/notch-grade';
import { shapeOf, turnMismatch } from './shape-check';

export function gradeP1Off(): boolean {
  return typeof process !== 'undefined' && !!process.env?.GRADE_P1_OFF;
}

export type GradeShapeOut = {
  sizes: PieceSizeSpec[];
  notes: string[];
  /** identity filled in when the piece is named (the build loop) */
  asks: GradeAsk[];
  intended: GradeCountFeature[];
};

/** Internal-line counts are asked only up to this many per size (see `gradeShape`). */
export const INTERNAL_ASK_MAX = 12;

const WORD: Record<GradeCountFeature, [string, string]> = {
  notches: ['notch', 'notches'],
  drills: ['drill hole', 'drill holes'],
  internal: ['internal line', 'internal lines'],
};

/** "in size XS, S 0 notches, in M, L, XL 1 — intended?" */
function countQuestion(f: GradeCountFeature, per: { size: string; n: number }[]): string {
  const groups: { n: number; sizes: string[] }[] = [];
  for (const x of per) {
    const g = groups[groups.length - 1];
    if (g && g.n === x.n) g.sizes.push(x.size);
    else groups.push({ n: x.n, sizes: [x.size] });
  }
  const said = groups
    .map(
      (g, i) =>
        `in ${g.sizes.length > 1 ? 'sizes' : 'size'} ${g.sizes.join(', ')} ${g.n}${i === 0 ? ` ${WORD[f][g.n === 1 ? 0 : 1]}` : ''}`,
    )
    .join(', ');
  return `${said} — intended?`;
}

const placesOf = (s: PieceSizeSpec, f: GradeCountFeature): PtMm[] =>
  f === 'notches'
    ? s.notches.map((n) => n.at)
    : f === 'drills'
      ? s.drills.map((d) => d.at)
      : s.internal.map((l) => l.pts[Math.floor(l.pts.length / 2)] ?? l.pts[0]);

export function gradeShape(
  seed: SeedId,
  sizes0: readonly PieceSizeSpec[],
  meaning: 'seam' | 'cut',
  answers: Readonly<Record<string, GradeAnswer>> = {},
): GradeShapeOut {
  let sizes = [...sizes0];
  const notes: string[] = [];
  const asks: GradeAsk[] = [];
  if (gradeP1Off() || sizes.length < 2) return { sizes, notes, asks, intended: [] };
  // ── 1 · notches across sizes (only when the sizes' counts differ: equal counts are one shape)
  const nc = sizes.map((s) => s.notches.length);
  // a cut line that turns differently in one size is not one shape (G5 holds it): no notch is
  // carried between outlines that are not the same piece
  const turns = nc.some((n) => n !== nc[0]) ? turnMismatch(sizes.map((s) => shapeOf(s))) : null;
  if (turns)
    notes.push(
      `notches across sizes not compared: ${sizes[turns.a].sizeToken}'s outline turns where ${sizes[turns.b].sizeToken}'s does not`,
    );
  if (nc.some((n) => n !== nc[0]) && !turns) {
    const ringOf = (s: PieceSizeSpec) => (meaning === 'seam' && s.seam ? s.seam : s.cut);
    const loneAns: Record<string, LoneAnswer> = {};
    for (const [k, v] of Object.entries(answers))
      if (v === 'all' || v === 'none' || v === 'only') loneAns[k] = v;
    const g = gradeNotches(
      sizes.map((s) => ({
        rank: s.rank,
        token: s.sizeToken,
        ring: ringOf(s),
        notches: s.notches.map((n) => ({ at: n.at, depthMm: n.depthMm })),
      })),
      seed,
      loneAns,
    );
    if (!g.ok) notes.push(`notches across sizes not compared: ${g.why}`);
    if (g.ok) {
      const drop = new Set(g.remove.map((r) => `${r.k}:${r.n}`));
      sizes = sizes.map((s, k) => {
        const add = g.add.filter((a) => a.k === k);
        const kept = s.notches.filter((_, n) => !drop.has(`${k}:${n}`));
        if (!add.length && kept.length === s.notches.length) return s;
        const graded: NotchFeature[] = add.map((a) => ({
          kind: 'notch',
          origin: 'derived',
          ranges: [],
          confidence: a.answered ? 1 : 0.7,
          at: a.at,
          seg: [a.at, a.tip],
          depthMm: a.depthMm,
          graded: { from: a.from, ...(a.answered ? { answered: true } : {}) },
        }));
        return { ...s, notches: [...kept, ...graded] };
      });
      // one note per transferred notch (the sizes it went to, the sizes that draw it)
      const byFrom = new Map<string, string[]>();
      for (const a of g.add) {
        const k = `${a.answered ? 'answered ' : ''}${a.from.join(', ')}`;
        byFrom.set(k, [...(byFrom.get(k) ?? []), sizes[a.k].sizeToken]);
      }
      for (const [from, to] of byFrom)
        notes.push(
          from.startsWith('answered ')
            ? `notch placed in ${to.join(', ')} — the operator: in every size (drawn in ${from.slice(9)})`
            : `notch graded into ${to.join(', ')} from ${from} (not drawn there — D5)`,
        );
      if (g.remove.length)
        notes.push(`${g.remove.length} notch(es) removed — the operator: in no size`);
      if (g.inconsistent)
        notes.push(
          `${g.inconsistent} notch(es) drawn in several sizes at places that do not grade — not transferred`,
        );
      for (const l of g.lone) {
        const size = sizes[l.k]?.sizeToken ?? sizes0[l.k].sizeToken;
        asks.push({
          kind: 'notch-lone',
          seed,
          identity: null,
          key: l.key,
          size,
          at: l.at,
          question: `a notch drawn only in size ${size} — in every size, in none, or only in ${size}?`,
          ...(l.answer ? { answer: l.answer } : {}),
        });
      }
    }
  }
  // ── 2 · counts that still differ: the explicit question
  const intended: GradeCountFeature[] = [];
  for (const f of ['notches', 'drills', 'internal'] as const) {
    const per = sizes.map((s) => ({ size: s.sizeToken, n: placesOf(s, f).length }));
    if (per.every((x) => x.n === per[0].n)) continue;
    // internal lines: a question only while they are few enough to be the piece's own marks
    // (buttonholes, a pocket line); dozens of line pieces per size are the reader's fragments, not a
    // count the operator can confirm
    if (f === 'internal' && per.some((x) => x.n > INTERNAL_ASK_MAX)) continue;
    const key = `counts|${seed}|${f}|${per.map((x) => `${x.size}:${x.n}`).join(',')}`;
    const yes = answers[key] === 'intended';
    if (yes) intended.push(f);
    asks.push({
      kind: 'counts',
      seed,
      identity: null,
      key,
      feature: f,
      perSize: sizes.map((s) => {
        const at = placesOf(s, f);
        return { size: s.sizeToken, n: at.length, at };
      }),
      question: countQuestion(f, per),
      ...(yes ? { answer: 'intended' as const } : {}),
    });
  }
  return { sizes, notes, asks, intended };
}
