import { abortableAdminService } from 'api/api';
import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';

import { errorInfoReason } from '../generation/refusal';
import type { Draft, SectionDef } from './registry/types';

/**
 * ═══ IDEAS FROM THE SERVER — `SuggestPrompts` BEHIND THE SAME `ideas ▾` DOOR (PLAYGROUND C-15) ═══
 *
 * Phase 2's Ideas were fixed lists (`./ideas.ts`, D5): `EnhanceText` refuses blank text and sees no
 * picture. Phase 3's `SuggestPrompts` does both — the field's purpose, the card facts, the text so
 * far and at most two thumbnails → 3–5 starting phrases. The door stays the one it was; what changes
 * is what the menu holds once it opens.
 *
 * WHEN THE SERVER IS ASKED. Only on a PRESS of the door (every call spends the AI key and one of the
 * 30 presses an hour the admin shares with Improve), never on mount, and only when the band says the
 * binary has an assistant: `suggest_prompts_model` (band 33) present AND non-empty. Absent = a binary
 * without the RPC; '' = the assistant is not configured or switched off in admin → AI providers.
 * In both cases the menu is the static list, exactly as in phase 2.
 *
 * WHAT THE MENU SHOWS. The static list at once; above it a «thinking…» row while the call is out,
 * then the server's phrases ABOVE one hairline, the static ones below it. A failure of any kind —
 * a refusal, the hour's limit, the network — leaves the static list alone, silently: a menu is not
 * an action, so it owes no toast. A refusal that says the server CANNOT answer (`AI_NOT_CONFIGURED`,
 * or the route is not there: 404 / 501) switches the server half off for the rest of the page's life
 * (`serverIdeasOff`), so no further press pays for the same refusal.
 *
 * ONE CALL PER QUESTION. The answer is kept in module memory for the page's life, keyed by workflow,
 * field and a fingerprint of what was asked (pictures, context, text). The PROMISE is what is kept,
 * so a second press while the first is out waits for it instead of buying another; a failed promise
 * is dropped, so the next press may ask again. A menu that closes does not cancel the request — the
 * field ignores the late answer by ticket, and the answer still lands in the cache: it was paid for,
 * and the next press of the same question shows it at once.
 *
 * ⚠ THE QUESTION IS WHAT CHANGES THE ANSWER (G-03 Codex MINOR). The context carries the form's
 * VALUES — each filled section with what it holds (a choice, a colour, a text, the pictures by id),
 * not only its title — so changing the framing, the angle or a logo's size is a new question, and
 * the cache, keyed by the request, asks again instead of showing the answer to the old form.
 *
 * ⚠ A CALL THAT NEVER ANSWERS IS GIVEN UP (G-03 Codex MINOR). A proxy that takes the request and never
 * closes it would have left «thinking…» on that question for the page's life. After
 * `IDEAS_DEADLINE_MS` the call counts as failed: the menu shows the static list, the pending entry is
 * dropped (nothing is cached), and for `IDEAS_COOLDOWN_MS` no press asks the server at all, so a
 * stalled connection cannot turn every changed letter into another hung call. The given-up call is
 * ABORTED (G-03 Codex r2 MINOR): it goes out through `abortableAdminService`, and the deadline closes
 * its connection rather than leaving it open for the page's life — each cooldown would otherwise add
 * one more hung request.
 */

/** The door's limits (admin.proto `SuggestPromptsRequest`): ≤ 2 pictures, ≤ 2000 runes each text. */
export const SUGGEST_MEDIA_MAX = 2;
export const SUGGEST_TEXT_MAX = 2000;
/** The server returns 3–5; the menu never shows more than this whatever arrives. */
export const SERVER_IDEAS_MAX = 5;
/** How long a SuggestPrompts call may go unanswered before the menu gives it up. */
export const IDEAS_DEADLINE_MS = 20_000;
/** After a given-up call, how long no press asks the server. */
export const IDEAS_COOLDOWN_MS = 60_000;
/** A text value's share of the context (a long sentence elsewhere on the form must not eat it). */
const CONTEXT_VALUE_MAX = 200;

/** What a prompt field asks with, besides its own text. `mediaIds` ≤ 2, `context` ≤ 2000. */
export type ServerIdeasInput = {
  techCardId: number;
  mediaIds: readonly number[];
  context: string;
};

export type SuggestRequest = {
  techCardId: number;
  workflow: string;
  field: string;
  mediaIds: number[];
  context: string;
  text: string;
};

/* ─────────────────────────── the band's word ─────────────────────────── */

let sessionOff = false;

/** The server half was switched off for this page by a refusal that says it cannot answer. */
export const serverIdeasOff = (): boolean => sessionOff;

/** Whether this band advertises an assistant (band 33 present and non-empty). */
export const bandSuggestsPrompts = (band: GetDesignBandResponse): boolean =>
  (band.suggestPromptsModel ?? '').trim() !== '';

/* ─────────────────────────── the question ─────────────────────────── */

const runes = (text: string, max: number): string => {
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join('') : text;
};

/** The ids of pictures, first two, no zero, no repeat — what the door takes. */
export function ideaMediaIds(
  ...pictures: readonly (common_MediaFull | null | undefined)[]
): number[] {
  const out: number[] = [];
  for (const media of pictures) {
    const id = media?.id ?? 0;
    if (id > 0 && !out.includes(id) && out.length < SUGGEST_MEDIA_MAX) out.push(id);
  }
  return out;
}

const pictureIds = (list: readonly (common_MediaFull | null | undefined)[]): string =>
  list
    .map((m) => m?.id ?? 0)
    .filter((id) => id > 0)
    .map((id) => `#${id}`)
    .join(' ');

/**
 * What a draft key holds, as one short phrase — or '' when it holds nothing: a text (quoted, capped),
 * the pictures by id, the fixed slots by name, a colour, a choice, a switch.
 */
function valueOf(draft: Draft, key: string): string {
  const out: string[] = [];
  const text = (draft.texts[key] ?? '').trim().replace(/\s+/g, ' ');
  if (text) out.push(`"${runes(text, CONTEXT_VALUE_MAX)}"`);
  const images = pictureIds(draft.images[key] ?? []);
  if (images) out.push(`pictures ${images}`);
  const slots = Object.entries(draft.slots[key] ?? {})
    .map(([slot, m]) => ((m?.id ?? 0) > 0 ? `${slot} #${m?.id}` : ''))
    .filter(Boolean);
  if (slots.length) out.push(slots.join(', '));
  const colour = draft.colours[key];
  if (colour && (colour.code || colour.hex))
    out.push([colour.code, colour.hex].filter(Boolean).join(' '));
  const choice = draft.choices[key] ?? '';
  if (choice !== '') out.push(choice);
  if (key in draft.flags) out.push(draft.flags[key] ? 'on' : 'off');
  return out.join('; ');
}

/** Every draft key a field writes: its own, its sub-keys (`engine.quality`), and its named partners. */
function keysOf(field: SectionDef['fields'][number], draft: Draft): string[] {
  const own = [field.key];
  if ('photoKey' in field && field.photoKey) own.push(field.photoKey);
  if ('colorwayKey' in field && field.colorwayKey) own.push(field.colorwayKey);
  if ('backgroundKey' in field && field.backgroundKey) own.push(field.backgroundKey);
  const all = new Set([
    ...Object.keys(draft.texts),
    ...Object.keys(draft.images),
    ...Object.keys(draft.slots),
    ...Object.keys(draft.colours),
    ...Object.keys(draft.choices),
    ...Object.keys(draft.flags),
  ]);
  const subs = [...all].filter((k) => k.startsWith(`${field.key}.`)).sort();
  return [...own, ...subs];
}

/**
 * THE CARD FACTS a field asks with — the same kind Improve sends (the field's purpose), plus what is
 * filled so far on the form: each section by title WITH ITS VALUES (Codex MINOR — a title alone
 * would let the cache answer a changed form with the old form's ideas). The asking field's own text
 * is left out (`skip`): it travels as `text`. DATA, never instructions: the server says so in its
 * own system line. At most 2000 runes.
 */
export function ideasContext(opts: {
  workflowTitle: string;
  hint?: string;
  sections?: readonly SectionDef[];
  draft?: Draft;
  /** The asking field's key: its own text is `text`, not context. */
  skip?: string;
  /** A tile's own extra fact (`PromptFieldDef.ideasFrom`), if it has one. */
  extra?: string;
}): string {
  const lines = [`Tool: ${opts.workflowTitle}`];
  if (opts.hint?.trim()) lines.push(`This field: ${opts.hint.trim()}`);
  if (opts.sections && opts.draft) {
    const draft = opts.draft;
    const filled: string[] = [];
    for (const section of opts.sections) {
      const parts: string[] = [];
      for (const field of section.fields) {
        for (const key of keysOf(field, draft)) {
          if (key === opts.skip) continue;
          const value = valueOf(draft, key);
          if (value) parts.push(`${key}: ${value}`);
        }
      }
      if (parts.length) filled.push(`${section.title} (${parts.join(', ')})`);
    }
    if (filled.length) lines.push(`Filled so far: ${filled.join('; ')}`);
  }
  if (opts.extra?.trim()) lines.push(opts.extra.trim());
  return runes(lines.join('\n'), SUGGEST_TEXT_MAX);
}

/** The body `SuggestPrompts` gets — every limit of the door applied here, before any spend. */
export function suggestRequest(
  workflow: string,
  field: string,
  input: ServerIdeasInput,
  text: string,
): SuggestRequest {
  const ids: number[] = [];
  for (const id of input.mediaIds)
    if (id > 0 && !ids.includes(id) && ids.length < SUGGEST_MEDIA_MAX) ids.push(id);
  return {
    techCardId: input.techCardId,
    workflow,
    field,
    mediaIds: ids,
    context: runes(input.context, SUGGEST_TEXT_MAX),
    text: runes(text, SUGGEST_TEXT_MAX),
  };
}

/** Identical questions share one answer (the server's own cache key has the same parts). */
export const suggestKey = (req: SuggestRequest): string =>
  JSON.stringify([
    req.techCardId,
    req.workflow,
    req.field,
    req.mediaIds,
    req.context,
    req.text.trim(),
  ]);

/* ─────────────────────────── the answer ─────────────────────────── */

const norm = (text: string) => text.trim().replace(/\s+/g, ' ');

/** The server's phrases, trimmed, no blanks, no repeats (any case), at most five. */
export function cleanServerIdeas(list: readonly unknown[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list ?? []) {
    if (typeof item !== 'string') continue;
    const text = norm(item);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= SERVER_IDEAS_MAX) break;
  }
  return out;
}

export type IdeasMenu = {
  /** The server's group: `null` = no server group at all (static list only, no labels). */
  server: { label: string; thinking: boolean; ideas: readonly string[] } | null;
  /** The static list, minus what the server already said (the server's row wins the repeat). */
  more: readonly string[];
};

/** The server state of one open menu. */
export type ServerIdeasState =
  | { status: 'off' }
  | { status: 'thinking' }
  | { status: 'failed' }
  | { status: 'done'; ideas: readonly string[] };

/**
 * THE MENU, AS DATA — pure, so the field and a probe read one rule. Server phrases above, the static
 * list below; a failed or empty answer is the static list only, as if nobody had asked.
 */
export function ideasMenu(
  statics: readonly string[],
  state: ServerIdeasState,
  pictures: number,
): IdeasMenu {
  const label =
    pictures > 1 ? 'for these pictures' : pictures === 1 ? 'for this picture' : 'for this field';
  if (state.status === 'thinking')
    return { server: { label, thinking: true, ideas: [] }, more: statics };
  if (state.status !== 'done' || state.ideas.length === 0) return { server: null, more: statics };
  const said = new Set(state.ideas.map((t) => norm(t).toLowerCase()));
  return {
    server: { label, thinking: false, ideas: state.ideas },
    more: statics.filter((t) => !said.has(norm(t).toLowerCase())),
  };
}

/* ─────────────────────────── the call ─────────────────────────── */

const asked = new Map<string, Promise<string[]>>();
/** Settled answers, readable without awaiting: a press of a question already answered shows it at once. */
const answered = new Map<string, string[]>();

/**
 * The refusal says this server cannot answer at all — asking again would only pay for it again.
 * A 404 counts only BARE (G-03 m-5): the gateway's «no such route» carries no ErrorInfo, while the
 * server's own NotFound (a picture of the question deleted meanwhile) names its reason — that one is
 * about this question, not about the route.
 */
function cannotAnswer(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  const reason = errorInfoReason(error);
  return (
    (status === 404 && reason === undefined) || status === 501 || reason === 'AI_NOT_CONFIGURED'
  );
}

/** Until when no press asks the server (a call was given up, see the file head). */
let quietUntil = 0;

/** The deadline of one call, readable by a probe stand. */
const deadlineMs = (): number =>
  (globalThis as { __ideasDeadlineMs?: number }).__ideasDeadlineMs ?? IDEAS_DEADLINE_MS;

/** The given-up call's error: the menu treats it as any failure (static list, no toast). */
export class IdeasGivenUp extends Error {
  constructor() {
    super('the assistant did not answer in time');
    this.name = 'IdeasGivenUp';
  }
}

/** A settled answer to this exact question, if there is one. */
export const answeredIdeas = (req: SuggestRequest): string[] | undefined =>
  answered.get(suggestKey(req));

/**
 * Ask the server, once per question. Resolves to the cleaned phrases (maybe none); rejects on any
 * failure, and a failure that says the server cannot answer switches the server half off.
 */
export function fetchServerIdeas(req: SuggestRequest): Promise<string[]> {
  const key = suggestKey(req);
  const out = asked.get(key);
  if (out) return out;
  if (Date.now() < quietUntil) return Promise.reject(new IdeasGivenUp());
  const abort = new AbortController();
  const answer = abortableAdminService(abort.signal)
    .SuggestPrompts({
      techCardId: req.techCardId,
      workflow: req.workflow,
      field: req.field,
      mediaIds: req.mediaIds,
      context: req.context,
      text: req.text,
    })
    .then(
      (res) => {
        const ideas = cleanServerIdeas(res.ideas);
        answered.set(key, ideas);
        return ideas;
      },
      (error: unknown) => {
        if (asked.get(key) === call) asked.delete(key);
        if (cannotAnswer(error)) sessionOff = true;
        throw error;
      },
    );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const call = Promise.race([
    answer,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        if (asked.get(key) === call) asked.delete(key);
        quietUntil = Date.now() + IDEAS_COOLDOWN_MS;
        reject(new IdeasGivenUp());
        abort.abort();
      }, deadlineMs());
    }),
  ]).finally(() => clearTimeout(timer));
  // The given-up call's own failure (its abort) has nobody left to hear it.
  answer.catch(() => undefined);
  asked.set(key, call);
  return call;
}

/** For the probe only: forget every answer and switch the server half back on. */
export function resetServerIdeasForProbe(): void {
  asked.clear();
  answered.clear();
  sessionOff = false;
  quietUntil = 0;
}
