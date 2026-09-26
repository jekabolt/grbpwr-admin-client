import type {
  GetDesignBandResponse,
  common_DesignRun,
  common_DesignRunParams,
  common_MediaFull,
} from 'api/proto-http/admin';
import type { ReactNode } from 'react';

import type { Representation } from '../../bench-kinds';
import type { NotSentItem } from '../../core';
import type { StartRunInput } from '../../render/use-design-run';
import type {
  FieldGlyphName,
  FormatRatio,
  ImageSlotDef,
  OptionRowOption,
  PantoneColour,
  ReuseSource,
  SliderStep,
} from '../fields';

/**
 * ═══ THE PLAYGROUND REGISTRY — WHAT A WORKFLOW IS (C-03) ═════════════════════════════════════════
 *
 * Twelve workflows in the owner's grid order (`./index.ts`), one file per runnable tile
 * (`./tiles/*`). A workflow is DATA plus four pure functions; the screen (`../studio.tsx`,
 * `../workflow-panel.tsx`) draws any of them the same way and knows no wire shape.
 *
 * ⚠ `wire()` IS THE ONE WRITER OF THE REQUEST. The gate, the price text, the inventory and the press
 * all read ITS result — the doctrine the old playground's `wireParams` held (removed in C-06): two reconstructions of one paid
 * run disagree silently, and that cost a week on a neighbouring screen.
 */

/** The owner's twelve, in grid order. The key is also the value of `?wf=`. */
export type WorkflowKey =
  | 'virtual_try_on'
  | 'fabric_to_image'
  | 'ghost_mannequin'
  | 'change_color'
  | 'swap_fabrics'
  | 'add_logo'
  | 'design_variations'
  | 'remove_background'
  | 'extend_image'
  | 'retouch_zone'
  | 'create_edit'
  | 'image_to_3d';

/* ─────────────────────────── the draft ─────────────────────────── */

/**
 * What a person laid on one workflow's form, keyed by FIELD key. Nothing here is a form field of the
 * card (the card's RHF form is guarded by `payload-gate.ts`); it lives in memory per
 * `{techCardId, workflow}` and dies with the card (`../workflow-drafts.ts`).
 */
export type Draft = {
  texts: Readonly<Record<string, string>>;
  /** `images` fields in grow mode: the list, in the order it leaves. */
  images: Readonly<Record<string, readonly common_MediaFull[]>>;
  /** `images` fields in fixed mode: slot key → picture. */
  slots: Readonly<Record<string, Readonly<Record<string, common_MediaFull | null>>>>;
  colours: Readonly<Record<string, PantoneColour>>;
  /** `format`, `option` and `slider` fields — the chosen value as a string. */
  choices: Readonly<Record<string, string>>;
  flags: Readonly<Record<string, boolean>>;
};

export const EMPTY_DRAFT: Draft = {
  texts: {},
  images: {},
  slots: {},
  colours: {},
  choices: {},
  flags: {},
};

/* ─────────────────────────── the fields ─────────────────────────── */

type FieldBase = {
  /** Draft key; also the Ideas / Recently used key of a prompt (`recentTextKey(wf, key)`). */
  key: string;
};

export type PromptFieldDef = FieldBase & {
  type: 'prompt';
  /** Accessible name of the box. */
  label: string;
  placeholder?: string;
  /** Context handed to Improve. */
  hint?: string;
  maxLength?: number;
};

export type ImagesFieldDef = FieldBase & {
  type: 'images';
  purpose?: string;
  reuseLabel?: string;
  sources?: readonly ReuseSource[];
} & ({ mode: 'grow'; max: number } | { mode: 'fixed'; slots: readonly ImageSlotDef[] });

export type FormatFieldDef = FieldBase & {
  type: 'format';
  ratios: readonly FormatRatio[];
  initial: FormatRatio;
};

export type OptionFieldDef = FieldBase & {
  type: 'option';
  label: string;
  options: readonly OptionRowOption<string>[];
  initial: string;
  control?: 'select' | 'segmented';
};

export type ToggleFieldDef = FieldBase & { type: 'toggle'; label: string; initial: boolean };

export type SliderFieldDef = FieldBase & {
  type: 'slider';
  label: string;
  steps: readonly SliderStep<string>[];
  initial: string;
};

export type PantoneFieldDef = FieldBase & { type: 'pantone'; placeholder?: string };

/** A sentence in the form — an honest limit of today's server, never a control. */
export type NoteFieldDef = FieldBase & { type: 'note'; text: string };

/**
 * The fields a section can hold. `model-profile` and `colourway-render` (tile 1) arrive with their
 * pickers in C-09; engine/quality with C-08.
 */
export type FieldDef =
  | PromptFieldDef
  | ImagesFieldDef
  | FormatFieldDef
  | OptionFieldDef
  | ToggleFieldDef
  | SliderFieldDef
  | PantoneFieldDef
  | NoteFieldDef;

/**
 * One section of the form: the owner's header (glyph · title · REQUIRED · value) over its fields.
 * `collapsible` sections fold and keep their value in the header (Format 2:3, New color swatch).
 */
export type SectionDef = {
  key: string;
  title: string;
  glyph?: FieldGlyphName;
  required?: boolean;
  info?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** The value printed on the right of the header, open or folded. */
  value?: (draft: Draft) => ReactNode;
  fields: readonly FieldDef[];
};

/* ─────────────────────────── the run ─────────────────────────── */

export type WireCtx = { band: GetDesignBandResponse };

/** The whole body of `StartDesignRun` a workflow buys, minus the card and the idempotency id. */
export type RunRequest = {
  kind: StartRunInput['kind'];
  ask: string;
  params: common_DesignRunParams;
};

/** A refusal the screen can make for free; `section` names the section that lifts it. */
export type Refusal = { reason: string; section?: string };

/** Whether this server can run the workflow at all (the tile's dimmed state). */
export type Availability = { available: true } | { available: false; reason: string };

/** «What the model gets», as data: the modal (`../what-model-gets.tsx`) draws it. */
export type InventoryLineDef = {
  key: string;
  number?: number;
  thumb?: string;
  name: string;
  text: string;
};

export type InventoryGroupDef = {
  key: string;
  label: string;
  aside?: string;
  note?: string;
  /** Rows (pictures, fields). */
  lines?: readonly InventoryLineDef[];
  /** A paragraph instead of rows, or under them when `lines` is empty. */
  text?: string;
  /** Verbatim words as they leave (the ask). */
  words?: string;
};

export type Inventory = {
  kindWord: string;
  intro: string;
  groups: readonly InventoryGroupDef[];
  notSent: readonly NotSentItem[];
};

/** Which outputs of the card belong to a workflow — the results block reads this. */
export type ResultsDef = {
  /** The representations `cardOutputRows` is asked for. */
  reps: readonly Representation[];
  /** Narrows those rows (and the live runs above them) to this workflow. */
  match: (run: common_DesignRun) => boolean;
  /** A cut-out: drawn on a neutral ground, with the «no background» word. */
  cutout?: boolean;
  /** Recolour outputs keep the ON MODEL «select» mark (ARTIFACTS reads it). */
  selectable?: boolean;
};

/** The runnable half of a workflow. Absent on a tile this build cannot run yet. */
export type WorkflowRun = {
  sections: readonly SectionDef[];
  /** Every refusal the screen makes before money, in the server's order. `null` = ready. */
  validate: (draft: Draft, ctx: WireCtx) => Refusal | null;
  wire: (draft: Draft, ctx: WireCtx) => RunRequest;
  /** What the press buys, in the generate row's words («1 cut-out», «one call per photo»). */
  shape: (draft: Draft, request: RunRequest) => string;
  inventory: (draft: Draft, request: RunRequest, ctx: WireCtx) => Inventory;
  results: ResultsDef;
  /**
   * «Run that again» from the history: the draft rebuilt from a past run's FROZEN parameters and
   * the media its input snapshot still carries (`media`, by id). `said` = what could not be carried
   * over, in words; the intake prints it. Absent = this workflow recalls nothing.
   */
  recall?: (run: common_DesignRun, media: ReadonlyMap<number, common_MediaFull>) => Recalled;
};

export type Recalled = { draft: Draft; said: readonly string[]; lost: number };

export type WorkflowDef = {
  key: WorkflowKey;
  /** The owner's title, verbatim. */
  title: string;
  /** The owner's one-line description, verbatim. */
  blurb: string;
  gate: (band: GetDesignBandResponse) => Availability;
  run?: WorkflowRun;
};
