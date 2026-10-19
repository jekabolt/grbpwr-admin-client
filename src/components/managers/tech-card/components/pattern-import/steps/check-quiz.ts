// CHECK-QUIZ (owner OK 18.10, 05-CHECK-QUIZ.md): the check step's side panel asks ONE question at a
// time — every held size of a SHAPE-KINK, every other failing check, then every open GRADE P1
// question — each in ≤ 6 words with the piece's name (not its block code), its answers ≤ 3 words,
// the likely one preselected. This file holds the words and the question list; check.tsx draws it.
import type {
  BoxMm,
  DraftScope,
  GateCheck,
  GateCheckId,
  GradeAnswer,
  GradeAsk,
  PieceSpec,
  ShapeIssue,
} from 'lib/pattern-import/types';
import type { PieceDTO } from 'lib/nesting/types';
import { gradeWord } from './details-grade';

export type CheckQ =
  | { key: string; kind: 'shape'; scopeKey: string; check: GateCheck; issue: ShapeIssue }
  | { key: string; kind: 'check'; scopeKey: string; check: GateCheck }
  | { key: string; kind: 'grade'; ask: GradeAsk };

const shapeKey = (scopeKey: string, i: ShapeIssue) => `s:${scopeKey}:${i.identity}:${i.size}`;

/**
 * The questions open now, in asking order: the failing checks of the scope (each held size of a
 * shape check its own question), then the open grade questions.
 */
export function openQuestions(
  scopeKey: string | null,
  failing: readonly GateCheck[],
  grade: readonly GradeAsk[],
): CheckQ[] {
  const out: CheckQ[] = [];
  if (scopeKey != null)
    for (const c of failing) {
      if (c.shapeIssues?.length)
        for (const issue of c.shapeIssues)
          out.push({ key: shapeKey(scopeKey, issue), kind: 'shape', scopeKey, check: c, issue });
      else
        out.push({
          key: `c:${scopeKey}:${c.id}:${c.blocks.join(',')}`,
          kind: 'check',
          scopeKey,
          check: c,
        });
    }
  for (const ask of grade) out.push({ key: `g:${ask.key}`, kind: 'grade', ask });
  return out;
}

const bare = (identity: string) => identity.replace(/_[LR]$/, '');

/** The piece's display name the steps use ("front"), else its code without the hand. */
export function pieceName(identity: string | null, pieces: readonly PieceSpec[]): string {
  if (!identity) return 'piece';
  const s =
    pieces.find((p) => p.identity === identity) ??
    pieces.find((p) => bare(p.identity) === bare(identity));
  return (s?.displayName || bare(identity)).toLowerCase();
}

/** A block name ("FP_L_M") → the piece's identity, by the longest identity it starts with. */
export function identityOfBlock(block: string, pieces: readonly PieceSpec[]): string {
  const b = block.toLowerCase();
  const hit = pieces
    .filter((p) => b.startsWith(`${p.identity.toLowerCase()}_`) || b === p.identity.toLowerCase())
    .sort((x, y) => y.identity.length - x.identity.length)[0];
  return hit?.identity ?? block.replace(/_[^_]+$/, '');
}

/** The pieces a check names, as one short subject ("front", "front +2"). */
export function checkSubject(c: GateCheck, pieces: readonly PieceSpec[]): string | null {
  const names = [...new Set(c.blocks.map((b) => pieceName(identityOfBlock(b, pieces), pieces)))];
  if (!names.length) return null;
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
}

/** Sizes as a short list: "l", "xs, s", "xs, s +2". */
const sizeList = (sizes: readonly string[]) =>
  sizes.length <= 2 ? sizes.join(', ') : `${sizes.slice(0, 2).join(', ')} +${sizes.length - 2}`;

/**
 * A counts question as two groups: the sizes that differ (the fewer) and whether they have MORE of
 * the feature than the rest ("line only in l") or fewer ("notch missing in xs"). Null = more than
 * two counts (no short way to say it).
 */
function countSplit(ask: Extract<GradeAsk, { kind: 'counts' }>) {
  const byN = new Map<number, string[]>();
  for (const p of ask.perSize) byN.set(p.n, [...(byN.get(p.n) ?? []), p.size]);
  if (byN.size !== 2) return null;
  const [[na, a], [nb, b]] = [...byN];
  const [odd, oddN, restN] = a.length <= b.length ? [a, na, nb] : [b, nb, na];
  return { odd, more: oddN > restN };
}

/** The grade question in ≤ 6 words: «back: line only in l?». */
export function gradeQuestion(ask: GradeAsk, pieces: readonly PieceSpec[]): string {
  const who = pieceName(ask.identity, pieces);
  if (ask.kind === 'notch-lone') return `${who}: notch only in ${ask.size}?`;
  const sp = countSplit(ask);
  if (!sp)
    return ask.perSize.every((p) => p.n === ask.perSize[0]?.n)
      ? `${who}: ${gradeWord(ask)} sit differently?`
      : `${who}: ${gradeWord(ask)} differ by size?`;
  const w = gradeWord(ask, sp.odd.length === 1 ? 1 : 2);
  return sp.more
    ? `${who}: ${w} only in ${sizeList(sp.odd)}?`
    : `${who}: ${w} missing in ${sizeList(sp.odd)}?`;
}

/**
 * The grade answers in ≤ 3 words, the likely one marked: an extra mark in few sizes → «no size»,
 * a mark missing in few sizes → «every size», else «as drawn». A refused answer is never the likely
 * one; an applied answer (a question opened again) is.
 */
export function gradeChoices(
  ask: GradeAsk,
  refusedAnswer: GradeAnswer | null,
): { label: string; answer: GradeAnswer; suggested: boolean }[] {
  const sp = ask.kind === 'counts' ? countSplit(ask) : null;
  const list: { label: string; answer: GradeAnswer }[] =
    ask.kind === 'notch-lone'
      ? [
          { label: 'no size', answer: 'none' },
          { label: 'every size', answer: 'all' },
          { label: `only ${ask.size}`, answer: 'only' },
        ]
      : [
          { label: 'no size', answer: 'none' },
          { label: 'every size', answer: 'all' },
          {
            label: sp?.more ? `only ${sizeList(sp.odd)}` : 'as drawn',
            answer: 'intended',
          },
        ];
  const guess: GradeAnswer =
    ask.answer ??
    (ask.kind === 'notch-lone' ? 'none' : !sp ? 'intended' : sp.more ? 'none' : 'all');
  const likely = guess === refusedAnswer ? (guess === 'intended' ? 'none' : 'intended') : guess;
  return list.map((c) => ({ ...c, suggested: c.answer === likely }));
}

/**
 * The shape issue's place on the card sheet (mm, y-up, the sheet's own frame): the written-frame
 * point moved by the block's written box onto the laid-out piece. Null = the piece is not drawn.
 */
export function shapeFocus(
  issue: ShapeIssue,
  dtos: readonly PieceDTO[],
  scope: DraftScope | undefined,
  pieces: readonly PieceSpec[],
): { box: BoxMm; mark: { x: number; y: number; r: number } } | null {
  const block = `${issue.identity}_${issue.size}`.toLowerCase();
  const dto = dtos.find((d) => (d.blockName ?? '').toLowerCase() === block);
  if (!dto) return null;
  const written = scope?.manifest.blocks.find((b) => b.block.toLowerCase() === block)?.bboxMm;
  const src = pieces
    .find((p) => p.identity === issue.identity)
    ?.sizes.find((s) => s.sizeToken === issue.size)?.bbox;
  const minX = written ? written[0] : src?.minX ?? 0;
  const minY = written ? written[1] : src?.minY ?? 0;
  const x = (dto.originX ?? 0) * 10 + (issue.at.x - minX);
  const y = (dto.originY ?? 0) * 10 + (issue.at.y - minY);
  const half = Math.min(250, Math.max(60, Math.max(dto.bboxW, dto.bboxH) * 10 * 0.3));
  return {
    box: { minX: x - half, minY: y - half, maxX: x + half, maxY: y + half },
    mark: { x, y, r: half * 0.3 },
  };
}

/** A failing check as the question, ≤ 4 words (the piece's name goes in front). */
export const CHECK_ASK: Record<GateCheckId, string> = {
  'G1-roundtrip': 'card parser misreads it',
  'G2-square': 'probe square is off',
  'G3-coverage': 'cut line leaves walls',
  'G4-hausdorff': 'cut line too far',
  'G5-features': 'notches or grain off',
  'G6-offset': 'allowance offset broken',
  'G7-overview': 'overview page differs',
  'G8-monotone': 'area shrinks with size',
  'G9-sizes': 'sizes differ from card',
  'G10-uni': 'UNI size conflict',
  'G11-grammar': 'block name invalid',
  'G12-pair': '_R not mirroring _L',
  'G13-manifest': 'manifest incomplete',
  'G14-prologue': 'manifest too long',
  'G15-derived': 'closed gap too long',
  'G16-glyphs': 'lettering inside piece',
  'G18-grain-source': 'grain read from lettering',
  'G19-chrome': 'line around tile marks',
  'G20-nested-piece': 'piece inside piece',
  'G21-continuity': 'closed size lost proof',
  'G22-identity': 'size off its line',
  'G24-one-piece': 'two pieces, one outline',
  'G23-sheets': 'tile sheet missing',
};
