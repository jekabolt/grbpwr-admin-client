import { useSyncExternalStore } from 'react';

/**
 * ═══ ASK · REFERENCES — «WHAT PART IS THIS?» BEFORE A FLAT RUN (T70, owner 06.10) ═══════════════
 *
 * Owner: «если мы не разметили картинки после нажатия кнопки генерейт как в квизе с фокусом картинки
 * спросило что это за часть или оно может само понять». An input picture with no role has NO
 * `design_reference` row (an empty role deletes it), so it never reaches the model — the tile said
 * `not sent`. GENERATE now asks about every such picture first, one at a time:
 *   · a side / detail → the role is written (`SetDesignReferenceRole`), the picture travels with it;
 *   · `figure it out ✦` → no role is written; the picture travels in `params.extra_input_media_ids`,
 *     which the server folds into the run's refs with an EMPTY role (captioned «reference image») —
 *     the model decides what it shows. No backend change was needed;
 *   · `leave out` → stays `not sent`.
 * The last two choices are remembered per card (module + sessionStorage), so the next GENERATE does
 * not ask about them again; picking a role on the tile wins over the memory.
 */

export type RefChoice = 'figure' | 'out';

const SKEY = (card: number) => `grbpwr.design.refs.ask.${card}`;
const memory = new Map<number, Record<number, RefChoice>>();
const listeners = new Set<() => void>();
let version = 0;

function read(card: number): Record<number, RefChoice> {
  const hit = memory.get(card);
  if (hit) return hit;
  let v: Record<number, RefChoice> = {};
  try {
    const raw = window.sessionStorage.getItem(SKEY(card));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === 'object') {
      for (const [k, c] of Object.entries(parsed as Record<string, unknown>)) {
        if (c === 'figure' || c === 'out') v[Number(k)] = c;
      }
    }
  } catch {
    v = {};
  }
  memory.set(card, v);
  return v;
}

function write(card: number, next: Record<number, RefChoice>): void {
  memory.set(card, next);
  try {
    window.sessionStorage.setItem(SKEY(card), JSON.stringify(next));
  } catch {
    /* the module still remembers */
  }
  version += 1;
  listeners.forEach((l) => l());
}

/** Every choice of this card, read NOW (for a press — a render may lag a frame). */
export function readRefChoices(card: number): Record<number, RefChoice> {
  return read(card);
}

/** What the person chose for an unmarked picture of this card, or `undefined` (never asked). */
export function refChoiceOf(card: number, mediaId: number): RefChoice | undefined {
  return read(card)[mediaId];
}

export function rememberRefChoice(card: number, mediaId: number, choice: RefChoice | null): void {
  const now = { ...read(card) };
  if (choice) now[mediaId] = choice;
  else delete now[mediaId];
  write(card, now);
}

export function useRefChoices(card: number): Record<number, RefChoice> {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => version,
    () => version,
  );
  return read(card);
}

type RefLike = { mediaId?: number; role?: string };

/** The input rows' media ids, in input order (the board rows of kind REFERENCE). */
export function inputIdsOf(
  board: readonly { mediaId?: number; kind?: string | null }[] | null | undefined,
  isInput: (row: { kind?: string | null }) => boolean,
): number[] {
  return (board ?? []).filter((r) => r && isInput(r)).map((r) => r.mediaId ?? 0);
}

/** Input pictures (in input order) with no role on the band — dedup'd, positive ids only. */
export function unmarkedInputIds(
  inputIds: readonly number[],
  references: readonly RefLike[] | undefined,
  /** Pictures that travel anyway (mood): never asked about. */
  skip?: ReadonlySet<number>,
): number[] {
  const roled = new Set(
    (references ?? [])
      .filter((r) => (r.mediaId ?? 0) > 0 && !!(r.role ?? '').trim())
      .map((r) => r.mediaId ?? 0),
  );
  const out: number[] = [];
  for (const id of inputIds) {
    if (id > 0 && !roled.has(id) && !skip?.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** The pictures GENERATE asks about: unmarked and never answered. */
export function picturesToAsk(
  unmarked: readonly number[],
  choices: Record<number, RefChoice>,
): number[] {
  return unmarked.filter((id) => !choices[id]);
}

/** The pictures that travel role-less (`extra_input_media_ids`): unmarked and `figure it out`. */
export function figureIds(
  unmarked: readonly number[],
  choices: Record<number, RefChoice>,
): number[] {
  return unmarked.filter((id) => choices[id] === 'figure');
}
