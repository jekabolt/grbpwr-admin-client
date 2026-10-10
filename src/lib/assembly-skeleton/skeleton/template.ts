// B2 — the order template: a stage table per garment category, kept as DATA in templates/*.json.
//
// A template is not a prediction. It is the industry's default order (subassemblies → panels →
// shoulders → collar → sleeves → sides → hem → closures → final press, 00-FEASIBILITY §C/§E) that a
// workshop is expected to overrule — which is why the draft is ratified step by step in D2. The
// table lives in JSON so the technologist's corrections are a data edit, not a code change.

import type { SkeletonBomFacts, SkeletonCategory, SkeletonOperationType } from '../types';
import coatLined from './templates/coat-lined.json';
import dress from './templates/dress.json';
import generic from './templates/generic.json';
import hoodie from './templates/hoodie.json';
import jacketLined from './templates/jacket-lined.json';
import jumpsuit from './templates/jumpsuit.json';
import roles from './templates/roles.json';
import shirt from './templates/shirt.json';
import skirt from './templates/skirt.json';
import sweat from './templates/sweat.json';
import tee from './templates/tee.json';
import trousers from './templates/trousers.json';

export type StageOp =
  /** FUSING on pieces marked fused (or, with BOM interlining and nothing marked, on `fuseRoles`). */
  | 'fuse'
  /**
   * Per-piece features read off the pattern's internal marks (geometry/marks.ts: darts …). Runs
   * right after `fuse`, before any unit is emitted. Stage 0 of P2 adds it to every template empty;
   * lane D fills it (`runFeatures` in build-skeleton.ts).
   */
  | 'features'
  /** Emit the `groupUnits` units of these roles ('*' = whatever is left) in dependency order. */
  | 'units'
  /** One join of every live unit carrying one of `roles` (per hand with `byHand`). */
  | 'combine'
  /** Sew the units of `roles` onto the unit of role `to` (all in one step with `together`). */
  | 'attach'
  /** A step that joins nothing (side seams, hem): one per live unit of `roles`. */
  | 'process'
  /** A processing step on the main unit, only when the BOM carries `when`. */
  | 'bom'
  /** The final press of the main unit. */
  | 'press'
  /** Shell + lining (+ live units of `roles`) → the garment, in one join. */
  | 'bag';

export type TemplateStage = {
  id: string;
  op: StageOp;
  /** The step's title in words; also the start of its reason. */
  label: string;
  roles?: string[];
  to?: string[];
  /** combine: the role the joined unit takes on (body, leg). */
  as?: string;
  /** combine/attach/bag: the unit's human name. */
  name?: string;
  /** combine: skip unless every role here is present among the inputs. */
  requireAll?: string[];
  /** combine: one join per hand (trousers: left leg, right leg). */
  byHand?: boolean;
  /** attach: every attacher in one step (both sleeves at once, like the technologist does). */
  together?: boolean;
  /** attach: look for the target in the other subtree (facings go onto the lining). */
  targetTree?: 'shell' | 'lining';
  /** Short zone token (SHOULDER) — the fallback when the zone cannot be inferred from pieces. */
  zone?: string;
  /** Short machine token (buttonhole) for process/bom steps; joins take the card's default. */
  machine?: string;
  operationType?: SkeletonOperationType;
  when?: keyof SkeletonBomFacts;
  /** Skip the stage when the garment has a piece of any of these roles (no sleeve hem with cuffs). */
  unless?: string[];
  /** Press after the stage's joins: 'open' = PRESS_OPEN, 'flat' = PRESS. */
  press?: 'open' | 'flat' | 'none';
  /**
   * process: a step the template expects but the pattern cannot show (a vent) — always a decision
   * («check», 0.4; evidence on the piece raises it, never to a tick). P2 lane Z3.
   */
  check?: boolean;
};

export type SkeletonTemplate = {
  id: string;
  category: SkeletonCategory;
  /** Name of the finished garment — the terminal unit's name. */
  garmentName: string;
  pressOpen: boolean;
  pressFlat: boolean;
  /** Roles whose left, right and centre parts become ONE unit (back, collar) before the body. */
  mergeHands: string[];
  /** Roles fused when the BOM has interlining but no piece is marked fused. */
  fuseRoles: string[];
  stages: TemplateStage[];
};

export type RoleDef = {
  id: string;
  tokens: string[];
  zone: string;
  name: string;
  level: 'sub' | 'panel';
  wraps?: string;
  attachTo?: string[];
  sameHand?: boolean;
  noGroup?: boolean;
  /**
   * Identical layers inside a family of this role are sewn AROUND the rest of the family in one
   * step (yoke + yoke facing around the back), not paired first like collar or cuff layers.
   */
  layersWrap?: boolean;
  /**
   * attachTo roles only: a part whose edge seam names the piece it goes onto is sewn there while
   * that piece is still flat — before the piece meets its own family or any panel (pockets).
   */
  attachEarly?: boolean;
};

export type RoleBook = {
  hands: { L: string[]; R: string[] };
  ignoreTokens: string[];
  /** Tokens that mark a piece as lining by name (no role, no family). */
  liningTokens?: string[];
  roles: RoleDef[];
};

const OPS: ReadonlySet<string> = new Set([
  'fuse',
  'features',
  'units',
  'combine',
  'attach',
  'process',
  'bom',
  'press',
  'bag',
]);

const BOM_KEYS: ReadonlySet<string> = new Set([
  'zipper',
  'buttons',
  'snaps',
  'tape',
  'elastic',
  'drawcord',
  'interlining',
]);

const OP_TYPES: ReadonlySet<string> = new Set([
  'MACHINE',
  'PRESS',
  'PRESS_OPEN',
  'FUSING',
  'HANDWORK',
]);

/**
 * JSON → template, checked. A misspelt op or BOM key in the data must fail loudly here, not turn
 * into a stage that silently never fires.
 */
export function readTemplate(raw: unknown, book: RoleBook = ROLE_BOOK): SkeletonTemplate {
  const t = raw as SkeletonTemplate;
  const where = `skeleton template «${t?.id ?? '?'}»`;
  if (!t || typeof t.id !== 'string' || !Array.isArray(t.stages)) {
    throw new Error(`${where}: not a template`);
  }
  const known = new Set(book.roles.map((r) => r.id));
  // Roles a stage may name besides the dictionary: the ones stages create, and '*'.
  const made = new Set<string>(['*']);
  for (const s of t.stages) if (s.as) made.add(s.as);
  made.add('body');
  const checkRoles = (list: string[] | undefined, field: string, id: string) => {
    for (const r of list ?? []) {
      if (!known.has(r) && !made.has(r))
        throw new Error(`${where}: stage ${id} ${field} «${r}» is no role`);
    }
  };
  const ids = new Set<string>();
  for (const s of t.stages) {
    if (ids.has(s.id)) throw new Error(`${where}: stage id «${s.id}» repeats`);
    ids.add(s.id);
    if (!OPS.has(s.op)) throw new Error(`${where}: stage ${s.id} has unknown op «${s.op}»`);
    if (s.when !== undefined && !BOM_KEYS.has(s.when)) {
      throw new Error(`${where}: stage ${s.id} has unknown BOM key «${s.when}»`);
    }
    if (s.operationType !== undefined && !OP_TYPES.has(s.operationType)) {
      throw new Error(`${where}: stage ${s.id} has unknown operation type «${s.operationType}»`);
    }
    if (s.op === 'attach' && !(s.to ?? []).length)
      throw new Error(`${where}: attach ${s.id} has no target`);
    if (s.op === 'combine' && !s.as) throw new Error(`${where}: combine ${s.id} has no «as»`);
    if (s.op === 'bom' && !s.when) throw new Error(`${where}: bom ${s.id} has no «when»`);
    checkRoles(s.roles, 'roles', s.id);
    checkRoles(s.to, 'to', s.id);
    checkRoles(s.requireAll, 'requireAll', s.id);
    checkRoles(s.unless, 'unless', s.id);
  }
  checkRoles(t.mergeHands, 'mergeHands', '-');
  checkRoles(t.fuseRoles, 'fuseRoles', '-');
  return t;
}

export const ROLE_BOOK: RoleBook = roles as RoleBook;

const TEMPLATES: Record<SkeletonCategory, unknown> = {
  tee,
  sweat,
  hoodie,
  trousers,
  skirt,
  dress,
  jumpsuit,
  shirt,
  'jacket-lined': jacketLined,
  'coat-lined': coatLined,
  generic,
};

/** B2: the stage table of a category; an unknown category gets the generic one. */
export function orderTemplate(category: SkeletonCategory | string): SkeletonTemplate {
  const raw = (TEMPLATES as Record<string, unknown>)[category] ?? TEMPLATES.generic;
  return readTemplate(raw);
}

/** Every category with a template of its own — for the probe and the picker. */
export const SKELETON_CATEGORIES: SkeletonCategory[] = [
  'tee',
  'sweat',
  'hoodie',
  'trousers',
  'skirt',
  'dress',
  'jumpsuit',
  'shirt',
  'jacket-lined',
  'coat-lined',
  'generic',
];
