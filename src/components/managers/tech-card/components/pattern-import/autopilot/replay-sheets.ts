// D6 · replay across the sheet layout. Since D6 every tile sheet of a file is in ONE drawing, laid
// side by side (assemble/composite.ts: sheet 0 at the origin, the next ones to its right). A replay
// record's points (click seeds, piece anchors, grainlines, fold edges, edit seeds and lassos, chain
// prints, set-aside outlines) are in the drawing of the run that wrote it:
//
//   · a record written since D6 carries the layout (`sheet-layout`: each sheet by index + its page
//     set, where it sat, its box). A point belongs to the sheet whose box it lies in and moves by
//     that sheet's shift now − then — only when the sheet with the same index AND the same pages is
//     in the drawing now; otherwise its answers do not land (they are asked again).
//   · an older record imported ONE sheet in its own frame (`sheet-choice {sheet: k}`, else the
//     `scope` sheet, else sheet 0): every point moves by where sheet k sits now; the pieces of the
//     other sheets have no answers there — they are new questions.
//
// Pure. The record itself is never rewritten: `placedAnswers` returns shifted copies.
import type {
  FileId,
  ImportSession,
  PtMm,
  ReplayAnswer,
  SheetPart,
} from 'lib/pattern-import/types';

/** The kind of the layout answer a record carries since D6. */
export const SHEET_LAYOUT = 'sheet-layout';

/** A sheet of the record's drawing: index, pages ([file index, page]), shift, box. */
export type WasPart = {
  k: number;
  pages: [number, number][] | null;
  dx: number;
  dy: number;
  box: [number, number, number, number] | null;
};

/** The layout answer's value for a drawing's parts (file ids written as indices). */
export function layoutValue(parts: readonly SheetPart[]) {
  return {
    parts: parts.map((p) => ({
      k: p.sheet,
      pages: p.pages.map((q) => [Number(q.file), q.page]),
      dx: p.dx,
      dy: p.dy,
      box: [p.box.minX, p.box.minY, p.box.maxX, p.box.maxY],
    })),
  };
}

/** What the record's drawing was made of. */
export function wasLayout(answers: readonly ReplayAnswer[]): {
  parts: WasPart[];
  legacy: boolean;
} {
  const lay = answers.find((a) => a.kind === SHEET_LAYOUT)?.value as
    | { parts?: WasPart[] }
    | undefined;
  if (lay?.parts?.length) return { parts: lay.parts, legacy: false };
  const choice = answers.find((a) => a.kind === 'sheet-choice')?.value as
    | { sheet?: number }
    | undefined;
  const scope = answers.find((a) => a.kind === 'scope')?.value as { sheet?: number } | undefined;
  const k =
    typeof choice?.sheet === 'number'
      ? choice.sheet
      : typeof scope?.sheet === 'number'
        ? scope.sheet
        : 0;
  return { parts: [{ k, pages: null, dx: 0, dy: 0, box: null }], legacy: true };
}

/** Far away: a point of a sheet that is not in the drawing now lands on nothing. */
const AWAY = 1e9;

/**
 * The shift of every recorded sheet into the drawing now (null = that sheet is not in it, or its
 * pages changed). `fileOf` maps the record's file index to this run's file id.
 */
export function sheetShifts(
  was: readonly WasPart[],
  now: readonly SheetPart[] | undefined,
  fileOf: (k: number) => FileId | null,
): Map<number, { dx: number; dy: number } | null> {
  const out = new Map<number, { dx: number; dy: number } | null>();
  const parts = now?.length ? now : [{ sheet: 0, pages: [], dx: 0, dy: 0 } as unknown as SheetPart];
  for (const w of was) {
    const p = parts.find((q) => q.sheet === w.k);
    let ok = !!p;
    if (p && w.pages && now?.length) {
      const key = (f: FileId | null, pg: number) => `${f}:${pg}`;
      const a = new Set(w.pages.map(([f, pg]) => key(fileOf(f), pg)));
      const b = new Set(p.pages.map((q) => key(q.file, q.page)));
      ok = a.size === b.size && [...a].every((x) => b.has(x));
    }
    out.set(w.k, ok && p ? { dx: p.dx - w.dx, dy: p.dy - w.dy } : null);
  }
  return out;
}

/** The recorded sheet a point of the record lies on: inside its box, else the nearest. */
function wasPartAt(was: readonly WasPart[], p: PtMm): WasPart {
  if (was.length === 1) return was[0];
  let best = was[0];
  let bd = Infinity;
  for (const w of was) {
    if (!w.box) return w;
    const d = Math.max(w.box[0] - p.x, 0, p.x - w.box[2]);
    if (d < bd) {
      bd = d;
      best = w;
    }
  }
  return best;
}

const isPt = (v: unknown): v is PtMm & Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  typeof (v as PtMm).x === 'number' &&
  typeof (v as PtMm).y === 'number';

/** Every point of a JSON value moved by `move` (objects with numeric x / y; chain prints). */
export function movePoints(v: unknown, move: (p: PtMm) => PtMm, key?: string): unknown {
  if (Array.isArray(v)) {
    // a chain print [x0, y0, x1, y1, n] (replay-record `chainPrint`)
    if (key === 'chain' && v.length === 5 && v.every((x) => typeof x === 'number')) {
      const a = move({ x: v[0], y: v[1] });
      const b = move({ x: v[2], y: v[3] });
      return [a.x, a.y, b.x, b.y, v[4]];
    }
    return v.map((x) => movePoints(x, move));
  }
  if (!v || typeof v !== 'object') return v;
  const o = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(o)) {
    if (k === 'chains' && x && typeof x === 'object' && !Array.isArray(x)) {
      out[k] = Object.fromEntries(
        Object.entries(x as Record<string, unknown>).map(([id, c]) => [
          id,
          movePoints(c, move, 'chain'),
        ]),
      );
      continue;
    }
    out[k] = movePoints(x, move);
  }
  if (isPt(o)) {
    const m = move({ x: o.x, y: o.y });
    out.x = m.x;
    out.y = m.y;
  }
  return out;
}

const cache = new WeakMap<readonly ReplayAnswer[], { key: string; answers: ReplayAnswer[] }>();

/**
 * The record's answers with their points in the drawing now. Piece-edit parts are joined text: the
 * edit itself is moved where it is parsed (`moveEdit`); their seed points and chain prints here.
 */
export function placedAnswers(
  answers: readonly ReplayAnswer[],
  session: Pick<ImportSession, 'sheet'>,
  fileOf: (k: number) => FileId | null,
): { answers: ReplayAnswer[]; move: (p: PtMm) => PtMm; moved: boolean } {
  const { parts: was } = wasLayout(answers);
  const shifts = sheetShifts(was, session.sheet?.sheet.parts, fileOf);
  const move = (p: PtMm): PtMm => {
    const w = wasPartAt(was, p);
    const s = shifts.get(w.k);
    if (!s) return { x: p.x + AWAY, y: p.y + AWAY };
    return s.dx || s.dy ? { x: p.x + s.dx, y: p.y + s.dy } : p;
  };
  const moved = [...shifts.values()].some((s) => !s || s.dx || s.dy);
  if (!moved) return { answers: [...answers], move, moved };
  const key = JSON.stringify([...shifts]);
  const hit = cache.get(answers);
  if (hit && hit.key === key) return { answers: hit.answers, move, moved };
  // a piece edit's JSON text is moved where it is parsed (`move`); its seeds and chain prints here
  const out = answers.map((a) =>
    a.kind === SHEET_LAYOUT
      ? a
      : { ...a, value: movePoints(a.value, move) as ReplayAnswer['value'] },
  );
  cache.set(answers, { key, answers: out });
  return { answers: out, move, moved };
}
