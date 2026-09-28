import type {
  DesignImageModel,
  GetDesignBandResponse,
  common_DesignImageOptions,
  common_DesignRun,
  common_DesignRunParams,
  common_MediaFull,
} from 'api/proto-http/admin';

import { mediaThumb } from '../../render/model';
import {
  IMAGE_FORMAT_RATIOS,
  NO_PANTONE,
  snapRatio,
  type FormatRatio,
  type PantoneColour,
} from '../fields';
import {
  EMPTY_DRAFT,
  type Availability,
  type Draft,
  type FieldDef,
  type FormatFieldDef,
  type InventoryGroupDef,
  type InventoryLineDef,
  type SectionDef,
  type WorkflowKey,
  type WorkflowRun,
} from './types';

/**
 * ═══ WHAT EVERY TILE SHARES — the empty body, the draft readers, the gate words (C-03) ════════════
 */

/** Said on a tile this server (or this build) cannot run. */
export const NOT_ON_THIS_SERVER = 'not on this server yet';

/** A tile the grid draws dimmed until the server lists it (phase 2/3 contract, D8). */
export const notYet = (): Availability => ({ available: false, reason: NOT_ON_THIS_SERVER });

/**
 * Why this server cannot open a workflow, in words — `''` when it can. The grid's dimmed tile and
 * the studio's «not available» line read this one answer.
 */
export function whyNot(
  def: { run?: WorkflowRun; gate: (band: GetDesignBandResponse) => Availability },
  band: GetDesignBandResponse,
): string {
  if (!def.run) return NOT_ON_THIS_SERVER;
  const gate = def.gate(band);
  return gate.available ? '' : gate.reason;
}

/**
 * ⚠ «ABSENT ≠ EMPTY», THE DOCTRINE OF `freeform_presets`. `undefined` = a binary older than the
 * playground route: nothing of it can run. A list = the server's own dictionary; a key missing from
 * it is a route this server has not wired, and the door would refuse it for the missing key.
 */
export function presetOffered(band: GetDesignBandResponse, key: string): Availability {
  const offered = band.freeformPresets;
  if (offered === undefined) return notYet();
  if (offered.some((raw) => (raw ?? '').trim() === key)) return { available: true };
  return { available: false, reason: 'not wired on this server' };
}

/**
 * ⚠ THE PHASE-2 GATE READS `playground_workflows` AND NOTHING ELSE (band 28, D8, [Codex 10]).
 * `undefined` = a server older than the field: every phase-2 tile stays dimmed «not on this server
 * yet» — the rollback behaviour. A list = exactly the tiles this server runs right now; a key
 * missing from it is a route it has not wired (or has switched off). `freeform_presets` is NEVER
 * read for these tiles: it keeps its old four keys for old clients and says nothing about them.
 */
export function workflowOffered(band: GetDesignBandResponse, key: WorkflowKey): Availability {
  const offered = band.playgroundWorkflows;
  if (offered === undefined) return notYet();
  if (offered.some((raw) => (raw ?? '').trim() === key)) return { available: true };
  return { available: false, reason: 'not wired on this server' };
}

/**
 * ⚠ A PHASE-3 ROUTE IS READ OFF `run_kinds` (band 32) AND NOTHING ELSE — the kinds the door accepts
 * on this binary right now: wired, keyed, with a bounded reserve (the door's own ladder). Membership,
 * never order. `undefined` = a binary older than phase 3: «not on this server yet», the rollback
 * behaviour. A list without the kind = this server has not wired it (or switched it off).
 */
export function runKindOffered(band: GetDesignBandResponse, kind: string): Availability {
  const kinds = band.runKinds;
  if (kinds === undefined) return notYet();
  if (kinds.some((raw) => (raw ?? '').trim() === kind)) return { available: true };
  return { available: false, reason: 'not wired on this server' };
}

/**
 * THE WORKING PIXEL CAP OF AN EXTEND OR A RETOUCH SOURCE (`designgen.CompositeMaxSourcePixels`, G-03
 * r2): the server composites the answer at the source's full size inside a small process, and refuses
 * a larger source as `source_too_large` — at the door for extend and the mask route, at the pickup for
 * the window route; free either way. The screen says it first, from the size the media row states.
 */
export const COMPOSITE_MAX_SOURCE_PIXELS = 18_000_000;
export const SOURCE_TOO_LARGE =
  'this picture is too large to edit here (over 18 MP); downscale it and upload it again';
/** The stated size is past the cap (an unstated size is left to the server). */
export const overCompositeCap = (w: number, h: number): boolean =>
  w > 0 && h > 0 && w * h > COMPOSITE_MAX_SOURCE_PIXELS;

/**
 * A PHASE-1 TILE ON EITHER SERVER. The new list decides whenever the server sends it — exactly those
 * tiles are live, the phase-1 three included — and a server that does not send it keeps today's
 * answer (`legacy`, read off `freeform_presets`), so the beta that predates the list keeps working.
 */
export function workflowOfferedOr(
  band: GetDesignBandResponse,
  key: WorkflowKey,
  legacy: () => Availability,
): Availability {
  return band.playgroundWorkflows === undefined ? legacy() : workflowOffered(band, key);
}

/**
 * EVERY FIELD OF `DesignRunParams`, NAMED EMPTY. A playground run binds no colourway
 * (`colorwayId: 0`), addresses no view and reads no bench; each tile then states the one or two
 * fields its kind reads. The object is fresh per call — a shared one would be mutated by the first
 * spread that forgot to copy a list.
 */
export function emptyParams(): common_DesignRunParams {
  return {
    views: [],
    layout: '',
    colour: undefined,
    threed: undefined,
    fixTarget: '',
    extraInputMediaIds: [],
    fixTargets: [],
    fixSlotIds: [],
    autoSplit: false,
    detailSlotIds: [],
    pattern: undefined,
    useFlatSlots: false,
    colorwayId: 0,
    flatSlotIds: [],
    freeform: undefined,
    image: undefined,
    inpaint: undefined,
    extend: undefined,
    video: undefined,
  };
}

/* ─────────────────────────── the draft, read ─────────────────────────── */

export const textOf = (draft: Draft, key: string): string => draft.texts[key] ?? '';

export const imagesOf = (draft: Draft, key: string): readonly common_MediaFull[] =>
  draft.images[key] ?? [];

export const colourOf = (draft: Draft, key: string): PantoneColour =>
  draft.colours[key] ?? NO_PANTONE;

/** The ids of a grow list, in its order, with no zero and no repeat — what the wire carries. */
export function mediaIdsOf(list: readonly common_MediaFull[]): number[] {
  const out: number[] = [];
  for (const media of list) {
    const id = media.id ?? 0;
    if (id > 0 && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Whether THIS server draws a section / field (its `when`). */
export const drawnOn = (
  band: GetDesignBandResponse,
  item: { when?: (band: GetDesignBandResponse) => boolean },
): boolean => !item.when || item.when(band);

/* ─────────────────────────── the AI model (C-08, D6) ─────────────────────────── */

/** The default draft keys of the engine and Format fields. */
export const ENGINE_KEY = 'engine';
export const FORMAT_KEY = 'format';

/**
 * The engines THIS server takes in `params.image`, cleaned (no row without a slug). `null` = none:
 * the band does not send the field (a server older than it) OR sends it empty (the image route is
 * closed) — either way no picker is drawn, no Format bound to one either, and no `image` leaves.
 */
export function imageModelsOf(band: GetDesignBandResponse): readonly DesignImageModel[] | null {
  const rows = (band.imageModels ?? []).filter((m) => (m.slug ?? '').trim() !== '');
  return rows.length ? rows : null;
}

/** Whether THIS server takes a per-run engine — the `when` of every engine / Format section. */
export const enginesOffered = (band: GetDesignBandResponse): boolean =>
  imageModelsOf(band) !== null;

/** The draft keys one `engine` field writes. */
export const engineChoiceKeys = (key: string) => ({ model: key, quality: `${key}.quality` });

/** The tier a fresh picker starts on: `medium` (today's DESIGN_IMAGE_QUALITY), else the middle one. */
export function defaultQuality(model: DesignImageModel): string {
  const tiers = model.qualities ?? [];
  if (tiers.includes('medium')) return 'medium';
  return tiers[Math.floor((tiers.length - 1) / 2)] ?? '';
}

/**
 * THE MODEL A DRAFT RUNS ON: the slug the field wrote when this server still offers it, else the
 * server's default row (`isDefault`, else the first). `null` = no engines here. A slug the server
 * dropped between two visits falls back to the default rather than riding to a refusal.
 */
export function engineOf(
  band: GetDesignBandResponse,
  draft: Draft,
  key: string,
): DesignImageModel | null {
  const rows = imageModelsOf(band);
  if (!rows) return null;
  const want = (draft.choices[engineChoiceKeys(key).model] ?? '').trim();
  return (
    (want && rows.find((m) => m.slug === want)) || rows.find((m) => m.isDefault) || rows[0] || null
  );
}

/** The chosen tier of that model: the draft's word when the model has it, else `defaultQuality`. */
export function qualityOf(model: DesignImageModel, draft: Draft, key: string): string {
  const want = (draft.choices[engineChoiceKeys(key).quality] ?? '').trim();
  return want && (model.qualities ?? []).includes(want) ? want : defaultQuality(model);
}

/** The header of the folded AI model section: «GPT Image 2 · medium». */
export function engineSummary(band: GetDesignBandResponse, draft: Draft, key: string): string {
  const model = engineOf(band, draft, key);
  if (!model) return '—';
  const label = (model.label ?? '').trim() || (model.slug ?? '');
  const tier = qualityOf(model, draft, key);
  return tier ? `${label} · ${tier}` : label;
}

/**
 * The tiles a bound Format grid DRAWS on this server: its own list, cut to the ratios at least one
 * listed model makes. A ratio no model here can make is not a choice at all — drawn, it would sit
 * dimmed forever (4:5 and 5:4 on the GPT Image rows). The cut is per SERVER, not per model, so the
 * grid never re-flows when the model changes: what the chosen one lacks is dimmed in place (D6).
 * No engines (or a list that would leave nothing) = the field's own list.
 */
export function drawnRatios(band: GetDesignBandResponse, field: FormatFieldDef): FormatRatio[] {
  const rows = field.boundTo === undefined ? null : imageModelsOf(band);
  if (!rows) return [...field.ratios];
  const made = new Set(rows.flatMap((m) => m.aspectRatios ?? []));
  const out = field.ratios.filter((r) => made.has(r));
  return out.length ? out : [...field.ratios];
}

/** The ratios a Format field may take under `model`: the ones it draws AND the model makes. */
export function allowedRatios(model: DesignImageModel, field: FormatFieldDef): string[] {
  const made = new Set(model.aspectRatios ?? []);
  return field.ratios.filter((r) => made.has(r));
}

/**
 * THE FORMAT A DRAFT RUNS WITH — ONE ANSWER FOR THE GRID, THE HEADER AND THE WIRE. The chosen ratio
 * (or the field's initial), snapped to the nearest ratio the bound model makes: a tile that opens on
 * a ratio the default model lacks shows, prints and sends the same snapped value, never one of each.
 */
export function formatOf(band: GetDesignBandResponse, draft: Draft, field: FormatFieldDef): string {
  const chosen = draft.choices[field.key] ?? field.initial;
  if (field.boundTo === undefined) return chosen;
  const model = engineOf(band, draft, field.boundTo);
  if (!model) return chosen;
  return snapRatio(chosen, allowedRatios(model, field));
}

/**
 * A NEW MODEL PICKED — the one writer of an engine change. The slug; the tier carried over when the
 * new model has it, else its default; and every Format bound to this field SNAPPED into the new
 * model's ratios (`snapRatio`: nearest shape, never «auto» by surprise), so the grid never holds a
 * dimmed choice.
 */
export function chooseEngine(
  draft: Draft,
  band: GetDesignBandResponse,
  sections: readonly SectionDef[],
  key: string,
  slug: string,
): Draft {
  const keys = engineChoiceKeys(key);
  const before = engineOf(band, draft, key);
  const withSlug: Draft = { ...draft, choices: { ...draft.choices, [keys.model]: slug } };
  const model = engineOf(band, withSlug, key);
  if (!model) return withSlug;
  const shown = before ? qualityOf(before, draft, key) : '';
  const choices: Record<string, string> = {
    ...withSlug.choices,
    [keys.quality]:
      shown && (model.qualities ?? []).includes(shown) ? shown : defaultQuality(model),
  };
  for (const field of formatFieldsOf(sections)) {
    if (field.boundTo !== key) continue;
    choices[field.key] = snapRatio(
      draft.choices[field.key] ?? field.initial,
      allowedRatios(model, field),
    );
  }
  return { ...withSlug, choices };
}

function formatFieldsOf(sections: readonly SectionDef[]): FormatFieldDef[] {
  return sections.flatMap((s) =>
    s.fields.filter((f: FieldDef): f is FormatFieldDef => f.type === 'format'),
  );
}

/**
 * `params.image` OF A REQUEST — THE ONE PLACE A TILE'S DRAFT BECOMES ITS ENGINE (C-08).
 *
 *   · `engine` — the key of the tile's `engine` field. Absent = a tile with NO picker (D6: tiles 2,
 *     3): the server's default model at the deployment's own tier (`quality: ''`), and the block
 *     leaves only when it says something — a Format other than auto, or a background.
 *   · `format` — the Format field (snapped, `formatOf`); `auto` travels as `''`.
 *   · `background` — the draft flag of «Transparent background»; sent only while the model lists it.
 *
 * `undefined` on a server that advertises no engines: an old server never sees the field [Codex 10].
 */
export function imageOptionsOf(
  band: GetDesignBandResponse,
  draft: Draft,
  opts: { engine?: string; format?: FormatFieldDef; background?: string },
): common_DesignImageOptions | undefined {
  const engineKey = opts.engine ?? opts.format?.boundTo ?? '';
  const model = engineOf(band, draft, engineKey);
  if (!model) return undefined;
  const ratio = opts.format ? formatOf(band, draft, opts.format) : '';
  const aspectRatio = ratio === 'auto' ? '' : ratio;
  const background =
    opts.background &&
    draft.flags[opts.background] &&
    (model.backgrounds ?? []).includes('transparent')
      ? 'transparent'
      : '';
  if (opts.engine === undefined) {
    if (!aspectRatio && !background) return undefined;
    return { model: model.slug ?? '', quality: '', aspectRatio, background };
  }
  return {
    model: model.slug ?? '',
    quality: qualityOf(model, draft, opts.engine),
    aspectRatio,
    background,
  };
}

/** «What the model gets» — the engine block as it leaves, or `null` when none does. */
export function imageInventoryGroup(
  band: GetDesignBandResponse,
  image: common_DesignImageOptions | undefined,
): InventoryGroupDef | null {
  if (!image) return null;
  const model = (band.imageModels ?? []).find((m) => m.slug === image.model);
  const label = (model?.label ?? '').trim() || image.model || 'the server default';
  const lines = [
    { key: 'model', name: 'AI model', text: label },
    {
      key: 'quality',
      name: 'quality',
      text: image.quality || 'the server default',
    },
    { key: 'format', name: 'format', text: image.aspectRatio || 'auto' },
  ];
  if (image.background) lines.push({ key: 'bg', name: 'background', text: image.background });
  return { key: 'engine', label: 'AI model', lines };
}

/**
 * The engine a past run was bought with, laid back into a draft (recall). A model this server no
 * longer offers falls back to the default when read (`engineOf`), so nothing here can refuse.
 */
export function recallImage(
  past: common_DesignRun,
  keys: { engine?: string; format?: string; background?: string },
): { choices: Record<string, string>; flags: Record<string, boolean> } {
  const image = past.params?.image;
  const choices: Record<string, string> = {};
  const flags: Record<string, boolean> = {};
  if (!image) return { choices, flags };
  if (keys.engine) {
    const k = engineChoiceKeys(keys.engine);
    if ((image.model ?? '').trim()) choices[k.model] = image.model!.trim();
    if ((image.quality ?? '').trim()) choices[k.quality] = image.quality!.trim();
  }
  if (keys.format) choices[keys.format] = (image.aspectRatio ?? '').trim() || 'auto';
  if (keys.background) flags[keys.background] = (image.background ?? '').trim() === 'transparent';
  return { choices, flags };
}

/**
 * THE ONE LINE A RECALL SAYS ABOUT ITS AI MODEL (G-02 Codex 7) — `null` when there is nothing to say.
 * `recallImage` lays the frozen slug back into the draft and `engineOf` falls back to the server's
 * default when that slug is gone; without this line the substitution would be silent. Said when the
 * run named a model this server no longer lists: which default replaces it, or — on a server that
 * takes no per-run model at all — that the server's own model draws it.
 */
export function recallEngineNote(
  past: common_DesignRun,
  band: GetDesignBandResponse,
): string | null {
  const want = (past.params?.image?.model ?? '').trim();
  if (!want) return null;
  const rows = imageModelsOf(band);
  if (!rows)
    return `its AI model (${want}) cannot be chosen on this server — the server's own draws it`;
  if (rows.some((m) => (m.slug ?? '').trim() === want)) return null;
  const now = rows.find((m) => m.isDefault) ?? rows[0];
  return `its AI model (${want}) is no longer offered — ${(now.label ?? '').trim() || now.slug} replaces it`;
}

/**
 * THE AI MODEL SECTION (D6: tiles 1, 7, 11) — folded, «<label> · <quality>» on its header, drawn
 * only where the server offers engines. One per tile; its field key is the one `imageOptionsOf` and
 * a bound Format name.
 */
export function engineSection(opts: { key?: string; backgroundKey?: string } = {}): SectionDef {
  const key = opts.key ?? ENGINE_KEY;
  return {
    key: `${key}-section`,
    title: 'AI model',
    glyph: 'options',
    collapsible: true,
    defaultOpen: false,
    when: enginesOffered,
    value: (draft, ctx) => engineSummary(ctx.band, draft, key),
    fields: [{ type: 'engine', key, backgroundKey: opts.backgroundKey }],
  };
}

/**
 * THE FORMAT SECTION (tiles 1, 2, 3, 7, 11) — folded, the ratio on its header, bound to an engine
 * field (`boundTo`, default `ENGINE_KEY`: a tile with no picker reads the default model through it).
 * Drawn only where the server offers engines: without one the ratio has nowhere to travel.
 *
 * `unbound: true` (Extend Image's «New final format», C-13): a grid of the ROUTE's own ratios, not
 * an image engine's — no `boundTo` (nothing dimmed, nothing snapped: `formatOf` reads the draft or
 * `initial`), and no `when` (the ratio travels in the route's own block, engines or not).
 */
export function formatSection(opts: {
  initial: FormatRatio;
  key?: string;
  boundTo?: string;
  title?: string;
  ratios?: readonly FormatRatio[];
  unbound?: boolean;
  defaultOpen?: boolean;
}): { section: SectionDef; field: FormatFieldDef } {
  const field: FormatFieldDef = {
    type: 'format',
    key: opts.key ?? FORMAT_KEY,
    ratios: opts.ratios ?? IMAGE_FORMAT_RATIOS,
    initial: opts.initial,
    ...(opts.unbound ? {} : { boundTo: opts.boundTo ?? ENGINE_KEY }),
  };
  return {
    field,
    section: {
      key: `${field.key}-section`,
      title: opts.title ?? 'Format',
      glyph: 'format',
      collapsible: true,
      defaultOpen: opts.defaultOpen ?? false,
      ...(opts.unbound ? {} : { when: enginesOffered }),
      value: (draft, ctx) => formatOf(ctx.band, draft, field),
      fields: [field],
    },
  };
}

/** A workflow's fresh draft: every field at its initial value. */
export function initialDraft(run: WorkflowRun | undefined): Draft {
  if (!run) return EMPTY_DRAFT;
  const choices: Record<string, string> = {};
  const flags: Record<string, boolean> = {};
  for (const section of run.sections) {
    for (const field of section.fields) {
      if (field.type === 'format' || field.type === 'option' || field.type === 'slider') {
        choices[field.key] = field.initial;
      } else if (field.type === 'toggle') {
        flags[field.key] = field.initial;
      }
    }
  }
  return { ...EMPTY_DRAFT, choices, flags };
}

/** The prompt fields of a workflow — remembered in «Recently used» after an accepted run. */
export function promptKeys(sections: readonly SectionDef[]): string[] {
  return sections.flatMap((s) => s.fields.filter((f) => f.type === 'prompt').map((f) => f.key));
}

/** The pictures of a request as inventory rows, numbered in the order they travel. */
export function pictureLines(
  list: readonly common_MediaFull[],
  name: (i: number) => string,
): InventoryLineDef[] {
  return list.map((media, i) => ({
    key: String(media.id ?? i),
    number: i + 1,
    thumb: mediaThumb(media),
    name: name(i),
    text: `media ${media.id ?? 0}`,
  }));
}

/** The retired freeform presets (Q17), in words — for the results label and the recall note. */
export const RETIRED_PRESET_WORD: Readonly<Record<string, string>> = {
  add_hardware: 'add hardware',
  repaint_parts: 'repaint the parts',
};
