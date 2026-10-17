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
import { gradeNotches, type LoneAnswer, type NgResult } from '../pieces/gfit/notch-grade';
import { featureTracks, placeTrack, type FtItem } from '../pieces/gfit/feature-tracks';
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
  /** answers `all` / `none` that could not be applied, by key → why (the ask stays open) */
  refusals: Record<string, string>;
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
  if (gradeP1Off() || sizes.length < 2) return { sizes, notes, asks, intended: [], refusals: {} };
  /** the notch tracks of step 1 and the notch each graded add became */
  let g: NgResult | null = null;
  const gradedOf = new Map<number, NotchFeature[]>(); // track → graded notches placed by step 1
  /** step 1's input notches per size (the tracks' member indices point here) */
  let notchesIn: NotchFeature[][] = sizes.map((s) => s.notches);
  // ── 1 · notches across sizes (only when the sizes' counts differ: equal counts are one shape)
  const nc = sizes.map((s) => s.notches.length);
  // every question carries the piece's geometry: a changed outline asks again (Codex r1)
  // the piece's geometry: every size's cut line (1 mm) and its feature places (1 mm)
  const r1 = (p: PtMm) => `${Math.round(p.x)},${Math.round(p.y)}`;
  const geo = `|g${fnv(
    sizes
      .map(
        (s) =>
          `${s.sizeToken}:${s.cut.map(r1).join(';')}/${s.notches.map((n) => r1(n.at)).join(';')}/${s.drills.map((d) => r1(d.at)).join(';')}/${s.internal.map((l) => l.pts.map(r1).join(';')).join('|')}`,
      )
      .join(','),
  )}`;
  const differ = nc.some((n) => n !== nc[0]);
  // a cut line that turns differently in one size is not one shape (G5 holds it): no notch is
  // carried between outlines that are not the same piece
  const turns = nc.some((n) => n > 0) ? turnMismatch(sizes.map((s) => shapeOf(s))) : null;
  if (turns)
    notes.push(
      `notches across sizes not compared: ${sizes[turns.a].sizeToken}'s outline turns where ${sizes[turns.b].sizeToken}'s does not`,
    );
  // equal counts: the tracks are still read — a notch at another place in one size is asked, but
  // nothing is placed (no size lacks a notch the others draw)
  if (nc.some((n) => n > 0) && !turns) {
    const ringOf = (s: PieceSizeSpec) => (meaning === 'seam' && s.seam ? s.seam : s.cut);
    const loneAns: Record<string, LoneAnswer> = {};
    for (const [k, v] of Object.entries(answers))
      if (v === 'all' || v === 'none' || v === 'only') loneAns[k] = v;
    notchesIn = sizes.map((s) => s.notches);
    g = gradeNotches(
      sizes.map((s) => ({
        rank: s.rank,
        token: s.sizeToken,
        ring: ringOf(s),
        notches: s.notches.map((n) => ({ at: n.at, depthMm: n.depthMm })),
      })),
      seed,
      loneAns,
      differ,
      geo,
    );
    if (!g.ok) notes.push(`notches across sizes not compared: ${g.why}`);
    if (g.ok) {
      const gg = g;
      const drop = new Set(gg.remove.map((r) => `${r.k}:${r.n}`));
      sizes = sizes.map((s, k) => {
        const add = gg.add.filter((a) => a.k === k);
        const kept = s.notches.filter((_, n) => !drop.has(`${k}:${n}`));
        if (!add.length && kept.length === s.notches.length) return s;
        const graded: NotchFeature[] = add.map((a) => {
          const nf: NotchFeature = {
            kind: 'notch',
            origin: 'derived',
            ranges: [],
            confidence: a.answered ? 1 : 0.7,
            at: a.at,
            seg: [a.at, a.tip],
            depthMm: a.depthMm,
            graded: { from: a.from, ...(a.answered ? { answered: true } : {}) },
          };
          gradedOf.set(a.track, [...(gradedOf.get(a.track) ?? []), nf]);
          return nf;
        });
        return { ...s, notches: [...kept, ...graded] };
      });
      // one note per transferred notch (the sizes it went to, the sizes that draw it)
      const byFrom = new Map<string, string[]>();
      for (const a of gg.add) {
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
      // equal counts at places that do not grade (S:A, M:A, L:B): asked, nothing moved (Codex r2)
      if (g.inconsistent && !differ) {
        const key = `places|${seed}|notches${geo}`;
        const yes = answers[key] === 'intended';
        asks.push({
          kind: 'counts',
          seed,
          identity: null,
          key,
          feature: 'notches',
          perSize: sizes.map((s) => ({
            size: s.sizeToken,
            n: s.notches.length,
            at: s.notches.map((n) => n.at),
          })),
          question: `the notches sit at places that do not grade from size to size (${g.inconsistent} of them) — intended?`,
          ...(yes ? { answer: 'intended' as const } : {}),
        });
      }
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
  // ── 2 · counts that still differ: the explicit question — and the operator's answer to it
  //   intended — the difference is the piece's own (G5 count warning lifted, passport records it);
  //   none     — the marks some sizes lack are removed where drawn (D5: counted as operator-removed);
  //   all      — placed in the sizes lacking them at a grade-derived place only, else refused (why)
  const intended: GradeCountFeature[] = [];
  const refusals: Record<string, string> = {};
  for (const f of ['notches', 'drills', 'internal'] as const) {
    const per = sizes.map((s) => ({ size: s.sizeToken, n: placesOf(s, f).length }));
    if (per.every((x) => x.n === per[0].n)) continue;
    // internal lines: a question only while they are few enough to be the piece's own marks
    // (buttonholes, a pocket line); dozens of line pieces per size are the reader's fragments, not a
    // count the operator can confirm
    if (f === 'internal' && per.some((x) => x.n > INTERNAL_ASK_MAX)) continue;
    const key = `counts|${seed}|${f}|${per.map((x) => `${x.size}:${x.n}`).join(',')}${geo}`;
    const a = answers[key];
    const perSize = sizes.map((s) => {
      const at = placesOf(s, f);
      return { size: s.sizeToken, n: at.length, at };
    });
    let applied: 'intended' | 'all' | 'none' | undefined =
      a === 'intended' ? 'intended' : undefined;
    let refused: string | undefined;
    if (a === 'all' || a === 'none') {
      const r =
        f === 'notches' ? notchAnswer(sizes, a, g, gradedOf, notchesIn) : markAnswer(sizes, f, a);
      if (r.ok) {
        sizes = r.sizes;
        notes.push(r.note);
        applied = a;
      } else {
        refused = r.why;
        refusals[key] = r.why;
        notes.push(
          `${f}: the answer "${a === 'all' ? 'in every size' : 'in no size'}" not applied — ${r.why}`,
        );
      }
    }
    if (applied === 'intended') intended.push(f);
    asks.push({
      kind: 'counts',
      seed,
      identity: null,
      key,
      feature: f,
      perSize,
      question: countQuestion(f, per),
      ...(applied ? { answer: applied } : {}),
      ...(refused ? { refused } : {}),
    });
  }
  return { sizes, notes, asks, intended, refusals };
}

type Applied = { ok: true; sizes: PieceSizeSpec[]; note: string } | { ok: false; why: string };

const removed = (s: PieceSizeSpec, f: GradeCountFeature, n: number): PieceSizeSpec =>
  n
    ? {
        ...s,
        removedByOperator: { ...s.removedByOperator, [f]: (s.removedByOperator?.[f] ?? 0) + n },
      }
    : s;

/** The counts of one kind are equal in every size. */
const equalCounts = (sizes: readonly PieceSizeSpec[], f: GradeCountFeature) =>
  sizes.every((s) => placesOf(s, f).length === placesOf(sizes[0], f).length);

/** The operator's all / none on the NOTCH count: by the canonical-topology tracks of step 1. */
function notchAnswer(
  sizes: readonly PieceSizeSpec[],
  a: 'all' | 'none',
  g: NgResult | null,
  gradedOf: ReadonlyMap<number, NotchFeature[]>,
  notchesIn: readonly (readonly NotchFeature[])[],
): Applied {
  if (!g?.ok)
    return { ok: false, why: 'the sizes share no outline topology to place the notches on' };
  const n = sizes.length;
  // per track, the sizes that carry it now (drawn members + the notches graded into them)
  const differing = g.tracks
    .map((t, ti) => ({ t, ti }))
    .filter(({ t, ti }) => {
      const have = new Set(t.members.map((m) => m.k));
      for (const x of gradedOf.get(ti) ?? []) {
        const k = sizes.findIndex((s) => s.notches.includes(x));
        if (k >= 0) have.add(k);
      }
      return have.size < n;
    });
  if (a === 'all') {
    for (const { ti } of differing) {
      const sk = g.skips.find((x) => x.track === ti);
      if (sk) return { ok: false, why: `size ${sizes[sk.k].sizeToken}: ${sk.why}` };
    }
    return { ok: false, why: "a notch lies off its size's line — no grade-derived place for it" };
  }
  // none: every notch of a track some size lacks goes — drawn ones counted as operator-removed
  const drop = new Set<NotchFeature>();
  const drawnDrop = new Set<NotchFeature>();
  for (const { t, ti } of differing) {
    for (const m of t.members) {
      const nf = notchesIn[m.k]?.[m.n];
      if (nf && sizes[m.k].notches.includes(nf)) {
        drop.add(nf);
        // a fold's mirrored copy is removed too but is not a drawn notch (D5 count)
        if (nf.origin !== 'derived') drawnDrop.add(nf);
      }
    }
    for (const x of gradedOf.get(ti) ?? []) drop.add(x);
  }
  const out = sizes.map((s) => {
    const kept = s.notches.filter((x) => !drop.has(x));
    return removed(
      { ...s, notches: kept },
      'notches',
      s.notches.filter((x) => drawnDrop.has(x)).length,
    );
  });
  if (!equalCounts(out, 'notches'))
    return { ok: false, why: "cannot tell which notches differ (some lie off their size's line)" };
  const gone = out
    .map((s, k) => `${s.sizeToken} ${sizes[k].notches.length - s.notches.length}`)
    .filter((x) => !x.endsWith(' 0'));
  return {
    ok: true,
    sizes: out,
    note: `notches removed — the operator: in no size (${gone.join(', ')}; D5)`,
  };
}

/** The operator's all / none on DRILL or INTERNAL-LINE counts: by their tracks (feature-tracks.ts). */
function markAnswer(
  sizes: readonly PieceSizeSpec[],
  f: 'drills' | 'internal',
  a: 'all' | 'none',
): Applied {
  const itemsOf = (s: PieceSizeSpec): FtItem[] =>
    f === 'drills'
      ? s.drills.map((d) => ({ pts: [d.at] }))
      : s.internal.map((l) => ({ pts: l.pts, closed: l.closed, label: l.label }));
  const fs = sizes.map((s) => ({
    rank: s.rank,
    token: s.sizeToken,
    cut: s.cut,
    items: itemsOf(s),
  }));
  const read = featureTracks(fs);
  const n = sizes.length;
  const differing = read.tracks.filter((t) => new Set(t.members.map((m) => m.k)).size < n);
  const word = f === 'drills' ? 'drill holes' : 'internal lines';
  if (!differing.length) return { ok: false, why: `cannot tell which ${word} differ` };
  if (read.tracks.some((t) => t.ambiguous))
    return { ok: false, why: `${word} lie too close to tell which is which across sizes` };
  const listOf = (s: PieceSizeSpec): readonly { origin: string }[] =>
    f === 'drills' ? s.drills : s.internal;
  if (a === 'none') {
    const drop = new Set(differing.flatMap((t) => t.members.map((m) => `${m.k}:${m.i}`)));
    const out = sizes.map((s, k) => {
      // only drawn marks count as operator-removed (a fold's mirrored copy is not drawn — D5)
      const drawnGone = listOf(s).filter(
        (x, i) => drop.has(`${k}:${i}`) && x.origin !== 'derived',
      ).length;
      const next =
        f === 'drills'
          ? { ...s, drills: s.drills.filter((_, i) => !drop.has(`${k}:${i}`)) }
          : { ...s, internal: s.internal.filter((_, i) => !drop.has(`${k}:${i}`)) };
      return removed(next, f, drawnGone);
    });
    if (!equalCounts(out, f)) return { ok: false, why: `cannot tell which ${word} differ` };
    const gone = out
      .map((s, k) => `${s.sizeToken} ${listOf(sizes[k]).length - listOf(s).length}`)
      .filter((x) => !x.endsWith(' 0'));
    return {
      ok: true,
      sizes: out,
      note: `${word} removed — the operator: in no size (${gone.join(', ')}; D5)`,
    };
  }
  const adds: { k: number; item: FtItem; from: string[]; label?: string }[] = [];
  for (const t of differing) {
    const r = placeTrack(fs, read, t);
    if (!r.ok) return { ok: false, why: r.why };
    const m0 = t.members[0];
    const label = f === 'internal' ? sizes[m0.k].internal[m0.i]?.label : undefined;
    adds.push(...r.add.map((x) => ({ ...x, ...(label ? { label } : {}) })));
  }
  const out = sizes.map((s, k) => {
    const mine = adds.filter((x) => x.k === k);
    if (!mine.length) return s;
    return f === 'drills'
      ? {
          ...s,
          drills: [
            ...s.drills,
            ...mine.map((x) => ({
              kind: 'drill' as const,
              origin: 'derived' as const,
              ranges: [],
              confidence: 1,
              at: x.item.pts[0],
              graded: { from: x.from, answered: true },
            })),
          ],
        }
      : {
          ...s,
          internal: [
            ...s.internal,
            ...mine.map((x) => ({
              kind: 'internal' as const,
              origin: 'derived' as const,
              ranges: [],
              confidence: 1,
              pts: [...x.item.pts],
              closed: false,
              ...(x.label ? { label: x.label } : {}),
              graded: { from: x.from, answered: true },
            })),
          ],
        };
  });
  if (!equalCounts(out, f))
    return { ok: false, why: `cannot place every missing ${word.slice(0, -1)}` };
  const got = out
    .map((s, k) => `${s.sizeToken} ${adds.filter((x) => x.k === k).length}`)
    .filter((x) => !x.endsWith(' 0'));
  return {
    ok: true,
    sizes: out,
    note: `${word} placed — the operator: in every size (${got.join(', ')}; graded, not drawn — D5)`,
  };
}

/** FNV-1a 32 of a string, hex (the question key's geometry tag). */
function fnv(t: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}
