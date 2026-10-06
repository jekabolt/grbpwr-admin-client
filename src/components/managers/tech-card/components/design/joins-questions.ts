import type { common_DesignJoinItem, common_DesignJoins } from 'api/proto-http/admin';

import { suggestsStraps } from './flat-mode';
import type { FlatRoute } from './flat-route';
import {
  NEGATION,
  absenceKey,
  addAbsence,
  dropAbsence,
  dropItem,
  dropUncertain,
  editItem,
  pathOf,
  type JoinsEdit,
} from './joins-model';

/**
 * ═══ ASK · CONSTRUCTION — 1–3 QUESTIONS INSTEAD OF A LIST TO CONFIRM (82-INPUT-REDESIGN §3.2) ════
 *
 * The owner took the JOINS list off the screen: «1–3 yes/no questions only when unsure / straps;
 * answers edit the list; no confirm button». The questions are PURE RULES over the list the model
 * read (no model call, no proto), in this priority, at most three:
 *
 *   Q1 strap start   — a strap starting at a neck point or between the neck and shoulder points:
 *                      «Where do the straps start?» · at the neck · mid-shoulder · shoulder tip
 *                      (owner 06.10, answer 1: three positions — «no» alone cannot place a strap);
 *   Q2 cross         — two straps whose ends land on the opposite side: «Do the straps cross on the
 *                      back?» · yes (as drawn) · no (the two ends swap sides);
 *   Q3 back neckline — no item passes the centre back neck: «Is there a back neckline?» · yes · no
 *                      (`no back neckline` added / dropped);
 *   Q4 opening       — an opening: «Open back between the straps?» · yes (as drawn) · no (dropped);
 *   Q5 doubt         — each of the model's doubts, verbatim: as drawn · no (an own answer: an
 *                      absence when it starts with «no», else a note on the part it names).
 *
 * Q1–Q4 only for a strap / opening garment (`suggestsStraps`); Q5 on any route that reads the list.
 * None on «from my flat» (the list is not read) or a detail run, none once the list is confirmed —
 * the last answer (or `skip all`) saves the list confirmed, and any later save clears it.
 * `skip` on one question is «as the model read it»: the identity.
 */

export type QuestionOption = {
  key: string;
  label: string;
  /** null = the own-answer field opens (Q5 `no`). */
  edit: JoinsEdit | null;
};

export type ConstructionQuestion = {
  /** Stable by content: the same list asks the same ids. */
  id: string;
  topic: 'strap start' | 'cross' | 'back neckline' | 'opening' | 'doubt';
  /** The pictogram part (`garment-manifest.json` part keys). */
  part: string;
  question: string;
  options: QuestionOption[];
  /** Q5: the doubt as the model wrote it. */
  doubt?: string;
};

export const QUESTION_CAP = 3;

export const NO_BACK_NECKLINE = 'no back neckline';

const IDENTITY: JoinsEdit = (j) => j;

/** Several edits as one, in order; the replay guard reads every targeted part. */
export function chainEdits(...edits: JoinsEdit[]): JoinsEdit {
  const fn = (j: common_DesignJoins) => edits.reduce((acc, e) => e(acc), j);
  const targets = edits.filter((e) => !!e.target);
  if (!targets.length) return fn;
  return Object.assign(fn, {
    target: (j: common_DesignJoins) => {
      const parts = targets.map((e) => e.target?.(j) ?? null);
      return parts.some((p) => p === null) ? null : JSON.stringify(parts);
    },
  });
}

const STRAP_START = /^NP_(L|R)(?:\.\.SP_(L|R):[0-9.]+)?$/;

/** The side letter of a ruler point (`NP_L`, `NP_L..SP_L:0.3` → L); '' for a centre point. */
export function sideOf(point: string): 'L' | 'R' | '' {
  const head = point.trim().split('..')[0];
  const m = /_(L|R)$/.exec(head);
  return m ? (m[1] as 'L' | 'R') : '';
}

const kindOf = (it: common_DesignJoinItem) => (it.kind ?? '').trim();
const isStrap = (it: common_DesignJoinItem) => kindOf(it) === 'strap';

function strapStartQuestion(items: common_DesignJoinItem[]): ConstructionQuestion | null {
  const straps = items.filter((it) => {
    if (!isStrap(it)) return false;
    const m = STRAP_START.exec((it.from ?? '').trim());
    return !!m && (!m[2] || m[2] === m[1]);
  });
  if (!straps.length) return null;
  const at = (to: (side: 'L' | 'R') => string): JoinsEdit =>
    chainEdits(
      ...straps.map((it) => {
        const side = sideOf(it.from ?? '') || 'L';
        return editItem(it.id ?? '', { from: to(side) });
      }),
    );
  return {
    id: `strap-start:${straps.map((s) => s.id ?? '').join(',')}`,
    topic: 'strap start',
    part: 'strap',
    question: straps.length > 1 ? 'Where do the straps start?' : 'Where does the strap start?',
    options: [
      { key: 'neck', label: 'at the neck', edit: at((s) => `NP_${s}`) },
      { key: 'mid', label: 'mid-shoulder', edit: at((s) => `NP_${s}..SP_${s}:0.5`) },
      { key: 'tip', label: 'shoulder tip', edit: at((s) => `SP_${s}`) },
    ],
  };
}

function crossQuestion(items: common_DesignJoinItem[]): ConstructionQuestion | null {
  const crossing = items.filter((it) => {
    if (!isStrap(it)) return false;
    const a = sideOf(it.from ?? '');
    const b = sideOf(it.to ?? '');
    return !!a && !!b && a !== b;
  });
  const lr = crossing.find((it) => sideOf(it.from ?? '') === 'L');
  const rl = crossing.find((it) => sideOf(it.from ?? '') === 'R');
  if (!lr || !rl) return null;
  const swap = chainEdits(
    editItem(lr.id ?? '', { to: rl.to ?? '' }),
    editItem(rl.id ?? '', { to: lr.to ?? '' }),
  );
  return {
    id: `cross:${lr.id ?? ''},${rl.id ?? ''}`,
    topic: 'cross',
    part: 'back',
    question: 'Do the straps cross on the back?',
    options: [
      { key: 'yes', label: 'yes', edit: IDENTITY },
      { key: 'no', label: 'no', edit: swap },
    ],
  };
}

const passesBackNeck = (it: common_DesignJoinItem) =>
  pathOf(it).some((p) => {
    const head = p.split('..')[0];
    return head === 'CBN' || head === 'CBN_LOW' || p.includes('..CBN');
  });

function backNecklineQuestion(j: common_DesignJoins): ConstructionQuestion | null {
  if ((j.items ?? []).some(passesBackNeck)) return null;
  const said = (j.absences ?? []).find((a) => /back neck/i.test(a));
  return {
    id: 'back-neckline',
    topic: 'back neckline',
    part: 'neckline',
    question: 'Is there a back neckline?',
    options: [
      { key: 'yes', label: 'yes', edit: said ? dropAbsence(said) : IDENTITY },
      {
        key: 'no',
        label: 'no',
        edit:
          said && absenceKey(said) === absenceKey(NO_BACK_NECKLINE)
            ? IDENTITY
            : addAbsence(NO_BACK_NECKLINE),
      },
    ],
  };
}

const words = (id: string) => id.replace(/[_-]+/g, ' ').trim();

function openingQuestion(items: common_DesignJoinItem[]): ConstructionQuestion | null {
  const op = items.find((it) => kindOf(it) === 'opening' && !!(it.id ?? ''));
  if (!op) return null;
  const by = (op.boundedBy ?? []).map(words).filter(Boolean);
  const where = (op.view ?? '').trim() || 'back';
  return {
    id: `opening:${op.id ?? ''}`,
    topic: 'opening',
    part: 'back',
    question:
      by.length >= 2
        ? `Open ${where} between ${by.slice(0, -1).join(', ')} and ${by[by.length - 1]}?`
        : `Open ${where} between the straps?`,
    options: [
      { key: 'yes', label: 'yes', edit: IDENTITY },
      { key: 'no', label: 'no', edit: dropItem(op.id ?? '') },
    ],
  };
}

function doubtQuestion(u: string): ConstructionQuestion {
  return {
    id: `doubt:${u}`,
    topic: 'doubt',
    part: 'whole',
    question: u,
    doubt: u,
    options: [
      { key: 'as-drawn', label: 'as drawn', edit: dropUncertain(u) },
      { key: 'no', label: 'no', edit: null },
    ],
  };
}

/**
 * THE QUESTIONS THIS LIST ASKS NOW — empty when nothing is pending: no list, a confirmed list, a
 * route that does not read it.
 */
export function pendingQuestions(
  joins: common_DesignJoins | null | undefined,
  route: FlatRoute,
): ConstructionQuestion[] {
  if (!joins || joins.confirmed) return [];
  if (route === 'hand_flat' || route === 'detail') return [];
  return allQuestions(joins);
}

/** Every question the list raises, capped — whatever its confirmation (the CAS check reads it). */
export function allQuestions(joins: common_DesignJoins): ConstructionQuestion[] {
  const items = joins.items ?? [];
  const out: ConstructionQuestion[] = [];
  if (suggestsStraps(joins)) {
    for (const q of [
      strapStartQuestion(items),
      crossQuestion(items),
      backNecklineQuestion(joins),
      openingQuestion(items),
    ])
      if (q) out.push(q);
  }
  for (const u of joins.uncertain ?? []) if (u.trim()) out.push(doubtQuestion(u));
  return out.slice(0, QUESTION_CAP);
}

/**
 * Q5 `no` + the own words → one edit, or why not. A sentence starting with a negation is an
 * absence; any other text becomes a note on the item the doubt (or the text) names by id or kind.
 * The doubt leaves the list in both cases.
 */
export function doubtOwnAnswer(
  joins: common_DesignJoins,
  doubt: string,
  text: string,
): { edit: JoinsEdit } | { why: string } {
  const said = text.trim();
  if (!said) return { why: 'say what it is' };
  if (NEGATION.test(said)) return { edit: chainEdits(addAbsence(said), dropUncertain(doubt)) };
  const items = (joins.items ?? []).filter((it) => !!(it.id ?? ''));
  const names = (it: common_DesignJoinItem) =>
    [it.id ?? '', words(it.id ?? ''), kindOf(it)].filter((n) => n.length >= 3);
  const mentions = (hay: string) => (it: common_DesignJoinItem) =>
    names(it).some((n) =>
      new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(hay),
    );
  const it = items.find(mentions(doubt)) ?? items.find(mentions(said));
  if (!it) return { why: 'start with “no” or name the part' };
  const note = (it.text ?? '').trim();
  return {
    edit: chainEdits(
      editItem(it.id ?? '', { text: note ? `${note}; ${said}` : said }),
      dropUncertain(doubt),
    ),
  };
}

export type Answer = { key: string; text?: string };

/**
 * The answers as ONE edit over the list the questions were asked on, in question order. A question
 * without an answer (skipped) changes nothing. `why` — a Q5 own answer that maps to nothing.
 */
export function answersEdit(
  joins: common_DesignJoins,
  questions: readonly ConstructionQuestion[],
  answers: Readonly<Record<string, Answer>>,
): { edit: JoinsEdit } | { why: string; id: string } {
  const edits: JoinsEdit[] = [];
  for (const q of questions) {
    const a = answers[q.id];
    if (!a || a.key === 'skip') continue;
    const option = q.options.find((o) => o.key === a.key);
    if (!option) continue;
    if (option.edit) {
      edits.push(option.edit);
      continue;
    }
    const own = doubtOwnAnswer(joins, q.doubt ?? q.question, a.text ?? '');
    if ('why' in own) return { why: own.why, id: q.id };
    edits.push(own.edit);
  }
  return { edit: chainEdits(...edits) };
}

/** The ids asked, as one key — two lists that ask the same questions read the same. */
export const questionsKey = (qs: readonly ConstructionQuestion[]) => qs.map((q) => q.id).join('|');
