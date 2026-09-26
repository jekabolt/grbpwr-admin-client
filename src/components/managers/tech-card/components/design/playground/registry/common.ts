import type {
  GetDesignBandResponse,
  common_DesignRunParams,
  common_MediaFull,
} from 'api/proto-http/admin';

import { mediaThumb } from '../../render/model';
import { NO_PANTONE, type PantoneColour } from '../fields';
import {
  EMPTY_DRAFT,
  type Availability,
  type Draft,
  type InventoryLineDef,
  type SectionDef,
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
