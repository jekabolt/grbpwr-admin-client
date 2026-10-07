import { parseSeasonToSku } from './season-util';

/**
 * ═══ WHEN A NEW CARD MAY BE CREATED — ONE PREDICATE, PURE (onboarding Q1) ═══════════════════════
 *
 * The owner's answer: a card from CREATE NEW is created the moment its name, category, season and
 * style number are filled — not when someone finds ADD at the top. The same four facts gate the
 * CARD DETAILS footer (`next · moodboard ›`) of a card that does not exist yet, so the footer's
 * reason and the auto-create can never disagree about what is missing.
 *
 * The season counts only when it parses into a wire season (`parseSeasonToSku`): a label that
 * carries no season/year leaves `skuSeason` unset on the wire, and the style number is minted
 * from it.
 */
export type CreateReadyInput = {
  name?: string | null;
  categoryId?: number | null;
  season?: string | null;
  styleNumber?: string | null;
};

export type CreateReady = { ok: true } | { ok: false; reason: string; missing: string[] };

export function createReady(v: CreateReadyInput): CreateReady {
  const missing = [
    !(v.name ?? '').trim() && 'name',
    !(Number(v.categoryId ?? 0) > 0) && 'category',
    !parseSeasonToSku(v.season ?? '') && 'season',
    !(v.styleNumber ?? '').trim() && 'style number',
  ].filter((x): x is string => typeof x === 'string');
  if (!missing.length) return { ok: true };
  const words =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
  return { ok: false, reason: `${words} first`, missing };
}
