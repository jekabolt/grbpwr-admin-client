// PASSPORT Ф1 (c) — "nothing on the sheet says what the drawn outline is": the file's OWN word for
// the layer that holds the outlines. The worker binds it (lib/pattern-import/passport `bindPassport`)
// only from the layers of the exported pieces' outline walls, only when every wall of every exported
// piece lies on a layer whose whole name is one outline word ("Cut lines", Illustrator
// `CUT_x5F_LINE`, "Schnittlinie" …). Like the CAD-export prior (a CLO DXF's layer 1, a plotter
// file) it is ONE 'structure' evidence: the autopilot takes "cut line" as a STRONG assumption, the
// operator gets it as the prefilled answer. A seam-line word leaves the amount unsaid — a question;
// layers that disagree, or a word against what the sheet's text or second line says — a question.
import type { AllowanceDecision, ImportSession, OutlineMeaning } from 'lib/pattern-import/types';

export type OutlineWord =
  | { kind: 'cut'; evidence: string[]; layers: string[] }
  | { kind: 'stop'; reason: string; conflict?: true };

/** The bound layer word, when the worker found one (status 'read' or 'conflict'). */
export function layerWordOf(s: ImportSession) {
  const o = s.semantics?.passport?.outline ?? null;
  if (!o || !o.classes.includes('structure')) return null;
  return o;
}

const layersOf = (o: { refs: { quote?: string }[] }) =>
  o.refs.map((r) => r.quote ?? '').filter(Boolean);
const said = (ls: string[]) => ls.map((l) => `«${l.slice(0, 40)}»`).join(', ');

/** The outline drawn as `a` and the layer word `b` say different things. */
const disagree = (a: AllowanceDecision['meaning'], b: OutlineMeaning) =>
  (a === 'seam') !== (b === 'seam');

/**
 * The outline question answered by the file's layer word: 'cut' (an assumption to record), a stop,
 * or null (the word says nothing — the CAD prior or the question as before).
 */
export function outlineByLayerWord(s: ImportSession): OutlineWord | null {
  const o = layerWordOf(s);
  if (!o) return null;
  const ls = layersOf(o);
  if (o.status === 'conflict')
    return {
      kind: 'stop',
      conflict: true,
      reason: `the file's layer names disagree about the drawn outline (${o.note ?? said(ls)}) — the cut line (allowance included) or the seam line?`,
    };
  if (o.status !== 'read') return null;
  if (o.value === 'seam')
    return {
      kind: 'stop',
      reason: `the file's layer ${said(ls)} says every outline is the seam line, but nothing says how much allowance to add — how many mm? (pre-filled: the seam line + the default)`,
    };
  return {
    kind: 'cut',
    layers: ls,
    evidence: [
      `layer ${said(ls)}: the file's own word for the layer every outline lies on`,
      ...(o.note ? [o.note.slice(0, 200)] : []),
    ],
  };
}

/**
 * The sheet says (text, or a second line drawn inside) one thing and the file's layer word the
 * other — a question, never one of them silently (null = they agree, or there is no word).
 */
export function layerWordConflict(
  s: ImportSession,
  sheet: AllowanceDecision | null | undefined,
): string | null {
  const o = layerWordOf(s);
  if (!o || o.status !== 'read' || !sheet) return null;
  if (sheet.origin !== 'text' && sheet.origin !== 'measured') return null;
  if (!disagree(sheet.meaning, o.value)) return null;
  return `the sheet says the outline is the ${sheet.meaning === 'seam' ? 'seam line' : 'cut line'} (${(sheet.evidence[0] ?? sheet.origin).slice(0, 80)}) but the file's layer ${said(layersOf(o))} says the ${o.value === 'seam' ? 'seam line' : 'cut line'} — which is it?`;
}
