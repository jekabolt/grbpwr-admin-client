// B1 — units from the seam graph: which pieces become which unit before the body is assembled.
//
// Three sources, in this order of trust (00-FEASIBILITY §C, §G):
//   1. the piece's NAME — role (collar, front …), family (FP vs FRONT), hand (L/R). The technologist
//      of SS26-005 split the shirt exactly along these lines (Collar base, Left front panel …);
//   2. the seam GRAPH — whether the grouped pieces are really sewn to each other (confidence and the
//      evidence in words), and the ONLY source for pieces whose names say nothing (blazer «3», «17»);
//   3. the TEMPLATE — which roles merge across hands (one back, two fronts) and what is a sandwich.
// Lining is its own subtree (cloth = lining): nothing here ever joins a lining piece to a shell one.

import {
  SKELETON,
  type SeamCandidate,
  type SeamGraph,
  type SkeletonDecision,
  type SkeletonFacts,
  type SkeletonPins,
  type SkeletonTree,
  type SkeletonUnit,
  type SkeletonUnitHint,
} from '../types';
import { replayExisting, type ExistingReplay } from './existing';
import {
  SeamIndex,
  commonHand,
  commonMult,
  multWord,
  judge,
  mergeLeaves,
  mergeRoles,
  nameTokens,
  pieceOfEdge as pieceOf,
  readPieces,
  roleDef,
  roleName,
  round2,
  type Entity,
  type PieceFact,
} from './model';
import { ROLE_BOOK, orderTemplate, type SkeletonTemplate } from './template';

/** The table: what is live (on the table, not yet swallowed) after each join. */
export class Table {
  readonly live = new Map<string, Entity>();
  readonly order: Map<string, number>;
  private n = 0;
  private names = new Set<string>();

  constructor(pieces: PieceFact[]) {
    this.order = new Map(pieces.map((p) => [p.key, p.order]));
    for (const p of pieces) {
      this.live.set(p.key, {
        key: p.key,
        name: p.name,
        unit: false,
        roles: p.role ? [p.role] : [],
        family: p.family,
        hand: p.hand,
        tree: p.tree,
        leaves: [p.key],
        mult: p.mult,
      });
    }
  }

  /** A name already taken by the card's own order (append mode): new units do not repeat it. */
  reserve(name: string) {
    this.names.add(name);
  }

  list(tree?: SkeletonTree): Entity[] {
    return [...this.live.values()].filter((e) => !tree || e.tree === tree);
  }

  /** A unique human name: «Collar», then «Collar 2». */
  uniqueName(name: string): string {
    let out = name;
    for (let i = 2; this.names.has(out); i++) out = `${name} ${i}`;
    this.names.add(out);
    return out;
  }

  rename(e: Entity, name: string) {
    this.names.delete(e.name);
    e.name = this.uniqueName(name);
  }

  join(
    inputs: Entity[],
    out: { name: string; roles: string[]; hand?: Entity['hand']; tree?: SkeletonTree },
  ): Entity {
    const tree = out.tree ?? inputs[0].tree;
    const mult = commonMult(inputs);
    // The lining subtree reads as lining in every name («Lining body»), not as «Body 2»; a unit of
    // ×2 mirrored blocks says it is two («Sleeve ×2»).
    const lined =
      tree === 'lining' && !/^lining\b/i.test(out.name)
        ? `Lining ${/^[A-Z][a-z]/.test(out.name) ? out.name[0].toLowerCase() : out.name[0]}${out.name.slice(1)}`
        : out.name;
    // One «×2» at the end, never «Front ×2 with placket ×2».
    const name = mult >= 2 ? `${lined.replace(/ ×\d+/g, '')}${multWord(mult)}` : lined;
    const e: Entity = {
      key: `~u${++this.n}`,
      name: this.uniqueName(name),
      unit: true,
      roles: out.roles,
      family: null,
      hand: out.hand === undefined ? commonHand(inputs) : out.hand,
      tree,
      leaves: mergeLeaves(inputs, this.order),
      mult,
    };
    for (const i of inputs) this.live.delete(i.key);
    this.live.set(e.key, e);
    return e;
  }
}

export type Grouping = {
  units: SkeletonUnit[];
  table: Table;
  pieces: PieceFact[];
  seams: SeamIndex;
  warnings: string[];
  /** Append mode: the card's order replayed (consumed pieces, its unit codes). */
  replay: ExistingReplay;
  /** The card's own units still on the table, as entities the stages may sew on. */
  existing: Map<string, Entity>;
};

const listNames = (es: Entity[]) => es.map((e) => e.name).join(', ');

/** E3: an orphan this large against a host (by area) is not a part of it. */
const ORPHAN_HOST_AREA = 0.9;

/** F4: this many nameless pieces of one shape are a repeat (a ring), read by name, not by seams. */
const REPEAT_MIN = 6;

/** Seam score floors for geometry-only grouping: notches matched, then lengths, then accepted. */
const GEOMETRY_TIERS = [0.95, 0.75, SKELETON.accept];

/**
 * One ambiguous join as a decision. The readings keep the engine's order (its own first); `pins`
 * may choose another, and the unit is then BUILT from that reading — everything after it reads the
 * table as that choice left it, so the proposal stays one consistent order.
 */
type Reading = { inputs: Entity[]; reason: string };
function decide(
  pins: SkeletonPins,
  id: string,
  readings: Reading[],
  live: (e: Entity) => boolean,
  /** Reading 0 won only on the name / key tie-breaker: why, in words (absent = by evidence). */
  tie?: string,
): { chosen: number; decision?: SkeletonDecision; others: SkeletonUnit['alternatives'] } {
  const want = pins[id] ?? 0;
  // A pin that no longer fits (the reading vanished, or one of its inputs is already sewn
  // elsewhere) falls back to the engine's own reading rather than inventing a join.
  const chosen = want > 0 && want < readings.length && readings[want].inputs.every(live) ? want : 0;
  if (readings.length < 2) return { chosen, others: undefined };
  return {
    chosen,
    // A tie is the engine's default only: a pinned reading (even reading 0) is a person's.
    decision: { id, chosen, ...(tie && pins[id] === undefined ? { tie } : {}) },
    others: readings
      .filter((_, i) => i !== chosen)
      .map((r) => ({ inputs: r.inputs.map((e) => e.key), seams: [], reason: r.reason })),
  };
}

const leafId = (es: Entity[]) =>
  es
    .flatMap((e) => e.leaves)
    .sort()
    .join('+');

const cmpText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/**
 * THE LAST WORD where evidence ties: the name, then the piece keys — never where a piece stands on
 * the card. Hosts ranked by it come out the same whatever order the card lists its
 * pieces in (07 review: twin panels of a bag swapped their belt when the pieces were reversed).
 */
const byNameThenKey = (a: Entity, b: Entity) =>
  cmpText(a.name, b.name) || cmpText(leafId([a]), leafId([b]));
/** Two areas a pattern cannot tell apart (twins cut from one block differ by rounding). */
const sameArea = (a: number, b: number) => Math.abs(a - b) <= 0.02 * Math.max(a, b, 1);

/** B1 with the state `buildSkeleton` continues from. */
export function groupDetailed(
  graph: SeamGraph,
  facts: SkeletonFacts,
  template: SkeletonTemplate = orderTemplate(facts.category),
  pins: SkeletonPins = {},
  hints: readonly SkeletonUnitHint[] = [],
): Grouping {
  const pieces = readPieces(graph, facts);
  // Surface joins (P2 lane S) are not edge evidence: a pocket laid on a front links nothing along
  // their edges. They are read by step S alone; every other step sees the edge seams only.
  const surfaces = graph.chosen.filter(
    (c): c is SeamCandidate & { surface: NonNullable<SeamCandidate['surface']> } =>
      c.kind === 'surface' && !!c.surface,
  );
  const seams = new SeamIndex(
    surfaces.length
      ? { ...graph, chosen: graph.chosen.filter((c) => c.kind !== 'surface') }
      : graph,
    pieces,
    template,
  );
  const byKey = new Map(pieces.map((p) => [p.key, p]));
  // APPEND MODE: what the card's own joins consumed is out of play; its live units are on the table.
  const replay = replayExisting(facts.existing, new Set(pieces.map((p) => p.key)));
  const table = new Table(
    pieces.filter((p) => p.cloth !== 'interfacing' && !replay.consumed.has(p.key)),
  );
  const existing = new Map<string, Entity>();
  for (const u of replay.live) {
    const leaves = u.leaves.map((k) => byKey.get(k)).filter((p): p is PieceFact => !!p);
    // Its own role is a PANEL's when it holds one («left panel with placket» is a front, not a
    // placket waiting to be sewn onto a front).
    const level = (r: string) => (roleDef(r)?.level === 'panel' ? 0 : 1);
    const own = mergeRoles(...leaves.map((p) => (p.role ? [p.role] : []))).sort(
      (a, b) => level(a) - level(b),
    );
    // A unit holding a front and a back IS the body the template sews collars and sleeves onto.
    const roles = own.includes('front') && own.includes('back') ? ['body', ...own] : own;
    const hands = new Set(leaves.map((p) => p.hand));
    const e: Entity = {
      key: u.key,
      name: u.name,
      unit: true,
      roles,
      family: null,
      hand: hands.size === 1 ? [...hands][0] : null,
      tree: leaves.length && leaves.every((p) => p.tree === 'lining') ? 'lining' : 'shell',
      leaves: [...u.leaves].sort((a, b) => (byKey.get(a)?.order ?? 0) - (byKey.get(b)?.order ?? 0)),
      mult: leaves.length ? Math.min(...leaves.map((p) => p.mult)) : 1,
    };
    table.reserve(u.name);
    table.live.set(u.key, e);
    existing.set(u.key, e);
  }
  const units: SkeletonUnit[] = [];
  const warnings: string[] = [];
  const mergeHands = new Set(template.mergeHands);
  const areaOf = (e: Entity) => e.leaves.reduce((a, k) => a + (byKey.get(k)?.areaMm2 ?? 0), 0);
  /** Pieces E3 placed with no role and no seam: parts of their host from then on. */
  const orphaned = new Set<string>();
  /** Parts already sewn onto a thing (a front with two pockets: 2); a flap is not a part of its own. */
  const partCount = (e: Entity) =>
    e.leaves.filter((k) => {
      const p = byKey.get(k);
      if (orphaned.has(k)) return true;
      return roleDef(p?.role ?? null)?.level === 'sub' && !isFlap(p?.name ?? '');
    }).length;
  /** A flap, or a unit of flap layers only. */
  const flapEntity = (e: Entity) => e.leaves.every((k) => isFlap(byKey.get(k)?.name ?? ''));
  /** A thing's own panel pieces — not the pockets or plackets already sewn on it. */
  const panelLeaves = (t: Entity) =>
    t.leaves.filter((k) => roleDef(byKey.get(k)?.role ?? null)?.level !== 'sub');
  /** The best seam from `e` to the panel pieces of `t`. */
  const panelScore = (e: Entity, t: Entity) =>
    seams.between(e.leaves, panelLeaves(t))[0]?.score ?? 0;

  // Same shape, not proven layers: said, never joined silently (lane A matched no seam between them)
  // — once per pair of name families, not per pair of pieces.
  warnings.push(
    ...sameShapeByFamily(
      graph.warnings.filter((w) => w.includes(SAME_SHAPE)),
      graph.pieces.map((p) => p.name),
    ),
  );
  for (const p of graph.pieces) {
    if (!byKey.has(p.pieceKey))
      warnings.push(`piece ${p.name} is in the pattern but not on the card — left out`);
  }

  const record = (
    inputs: Entity[],
    spec: {
      name: string;
      roles: string[];
      kind: SkeletonUnit['kind'];
      why: string;
      hand?: Entity['hand'];
      tree?: SkeletonTree;
      alternatives?: SkeletonUnit['alternatives'];
      decision?: SkeletonDecision;
      judgement?: Pick<SkeletonUnit, 'confidence' | 'reason' | 'source'>;
      /** The seams the join stands on, when they are not edge seams between its inputs (surface). */
      seams?: SeamCandidate[];
    },
  ): Entity => {
    const j = judge(inputs, seams, spec.why);
    const e = table.join(inputs, {
      name: spec.name,
      roles: spec.roles,
      hand: spec.hand,
      tree: spec.tree,
    });
    units.push({
      key: e.key,
      name: e.name,
      inputs: inputs.map((i) => i.key),
      pieceKeys: e.leaves,
      roles: e.roles,
      hand: e.hand,
      tree: e.tree,
      ...((e.mult ?? 1) >= 2 ? { mult: e.mult } : {}),
      kind: spec.kind,
      seams: spec.seams ?? j.seams,
      confidence: spec.judgement?.confidence ?? j.confidence,
      reason: spec.judgement?.reason ?? j.reason,
      source: spec.judgement?.source ?? j.source,
      ...(spec.alternatives?.length ? { alternatives: spec.alternatives } : {}),
      ...(spec.decision ? { decision: spec.decision } : {}),
    });
    return e;
  };
  const isLive = (e: Entity) => table.live.get(e.key) === e;
  /** A reading's seams, for the alternatives the screen lists beside the chosen one. */
  const withSeams = (alts: SkeletonUnit['alternatives']) =>
    alts?.map((a) => {
      const [x, ...rest] = a.inputs.map((k) => table.live.get(k)?.leaves ?? [k]);
      return { ...a, seams: seams.between(x ?? [], rest.flat()) };
    });

  /**
   * F1: layer pairs inside one family, in this order of trust:
   *   1. three or more pieces of ONE shape (belts ×4): the seams between congruent layers say
   *      nothing about which two go together, so they pair by name — the same stem first
   *      (CLR_MAIN with CLR_MAIN_1, not with CLR_SECOND), then neighbouring numbers (BLT_1 + BLT_2,
   *      BLT_3 + BLT_4) — and every pair is a decision with the other reading beside it;
   *   2. two pieces with a seam between them that are layers of one thing: identical twins (lane
   *      A), or — for a part built before the body (pocket, flap, cuff, collar) — numbered
   *      siblings of one family (FL_1 + FL_2, PCK_#_1 + PCK_#_2). Best seam first; seams within
   *      SKELETON.ambiguity are told apart by the stem, then by neighbouring numbers, then by both
   *      being numbered (the unnumbered piece is the family's own: FL is the flap the pair is not).
   * Panel strips (FP_1_L + FP_2_L + FP_L) are not layers: only identical twins pair among them.
   */
  type LayerPair = {
    pair: Entity[];
    decision?: SkeletonDecision;
    alternatives?: SkeletonUnit['alternatives'];
    confidence?: number;
  };
  // Identical twins indexed once: `identical` is asked for every pair of a family or a repeat, and
  // a linear scan of `twinOf` there made a set of n identical pieces Θ(n³) (150 pieces: millions).
  const twinsOf = new Map<string, Set<string>>();
  for (const p of graph.pieces) {
    const ids = p.twinOf.filter((t) => t.kind === 'identical').map((t) => t.key);
    if (ids.length) twinsOf.set(p.pieceKey, new Set(ids));
  }
  const identical = (a: Entity, b: Entity) =>
    !a.unit && !b.unit && (twinsOf.get(a.key)?.has(b.key) ?? false);
  const geomOf = new Map(graph.pieces.map((p) => [p.pieceKey, p]));
  /** Two lone pieces lane A calls twins of either kind (mirror or identical). */
  const twinned = (a: Entity, b: Entity) =>
    !a.unit && !b.unit && (geomOf.get(a.key)?.twinOf.some((t) => t.key === b.key) ?? false);
  function layerPairs(group: Entity[]): LayerPair[] {
    const out: LayerPair[] = [];
    const used = new Set<string>();
    const idx = (e: Entity) => nameIndex(e.name);
    // 1. one shape ×3 or more
    const clique = group.filter(
      (a) => group.filter((b) => b === a || identical(a, b)).length === group.length,
    );
    if (group.length >= 3 && clique.length === group.length) {
      const ordered = [...group].sort(
        (x, y) =>
          (layerStem(x.name) < layerStem(y.name)
            ? -1
            : layerStem(x.name) > layerStem(y.name)
              ? 1
              : 0) || idx(x) - idx(y),
      );
      for (let i = 0; i + 1 < ordered.length; i += 2) {
        const pair = [ordered[i], ordered[i + 1]];
        const other = ordered[i + 2] ?? ordered[i - 1];
        const readings: Reading[] = [
          { inputs: pair, reason: `or ${listNames(pair)} — one name, neighbouring numbers` },
          ...(other
            ? [{ inputs: [ordered[i], other], reason: `or ${ordered[i].name} with ${other.name}` }]
            : []),
        ];
        const d = decide(pins, `layers:${ordered[i].key}`, readings, isLive);
        const pick = readings[d.chosen].inputs;
        const seamed = bestScore(seams, pick[0].leaves, pick[1]) > 0;
        out.push({
          pair: pick,
          decision: d.decision,
          alternatives: d.others,
          ...(seamed ? {} : { confidence: 0.5 }),
        });
      }
      return out;
    }
    // 2. pairs with a seam
    const sub = roleDef(group[0].roles[0] ?? null)?.level === 'sub';
    type Cand = { a: Entity; b: Entity; s: number; stem: boolean; adj: boolean; numbered: boolean };
    const cands: Cand[] = [];
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i], group[j]];
        const adj = Math.abs(idx(a) - idx(b)) === 1;
        if (!identical(a, b) && !(sub && adj)) continue;
        // Two halves of a pocket bag named for different panels (PCK_B_L for the back, PCK_L for
        // the front) are copies going two ways, not layers of one thing: each is placed alone.
        if (sub && panelHint(a.name) !== panelHint(b.name)) continue;
        const s = bestScore(seams, a.leaves, b);
        if (s <= 0) continue;
        cands.push({
          a,
          b,
          s,
          stem: layerStem(a.name) === layerStem(b.name),
          adj,
          numbered: idx(a) > 0 && idx(b) > 0,
        });
      }
    }
    for (;;) {
      const open = cands.filter((c) => !used.has(c.a.key) && !used.has(c.b.key));
      if (!open.length) break;
      const top = Math.max(...open.map((c) => c.s));
      const tied = open
        .filter((c) => c.s >= top - SKELETON.ambiguity)
        .sort(
          (x, y) =>
            Number(y.stem) - Number(x.stem) ||
            Number(y.adj) - Number(x.adj) ||
            Number(y.numbered) - Number(x.numbered) ||
            y.s - x.s ||
            byNameThenKey(x.a, y.a) ||
            byNameThenKey(x.b, y.b),
        );
      const [best] = tied;
      const head = best.a;
      const readings: Reading[] = [
        best,
        ...tied.filter((c) => c !== best && (c.a === head || c.b === head)),
      ]
        .slice(0, 3)
        .map((c, i) => ({
          inputs: [c.a, c.b],
          reason:
            i === 0
              ? `or ${c.a.name} with ${c.b.name} — the pattern's first reading`
              : `or ${c.a.name} with ${c.b.name} — a seam almost as good`,
        }));
      const d = decide(pins, `layers:${head.key}`, readings, isLive);
      const pick = readings[d.chosen].inputs;
      pick.forEach((e) => used.add(e.key));
      out.push({ pair: pick, decision: d.decision, alternatives: d.others });
    }
    return out;
  }

  // ── 0. interfacing as a separate card piece enters ONLY through a FUSING join (§G) ────────────
  for (const p of pieces.filter((x) => x.cloth === 'interfacing' && !replay.consumed.has(x.key))) {
    const hosts = table.list().filter((e) => !e.unit && e.hand === p.hand);
    const host =
      hosts.find((e) => sameStem(e.name, p.name)) ??
      hosts
        .filter((e) => {
          const a = byKey.get(e.key)?.areaMm2;
          return a && p.areaMm2 && Math.abs(a - p.areaMm2) / Math.max(a, p.areaMm2) <= 0.1;
        })
        .sort(
          (x, y) =>
            Math.abs((byKey.get(x.key)?.areaMm2 ?? 0) - (p.areaMm2 ?? 0)) -
              Math.abs((byKey.get(y.key)?.areaMm2 ?? 0) - (p.areaMm2 ?? 0)) || byNameThenKey(x, y),
        )[0];
    const self: Entity = {
      key: p.key,
      name: p.name,
      unit: false,
      roles: [],
      family: p.family,
      hand: p.hand,
      tree: p.tree,
      leaves: [p.key],
      mult: p.mult,
    };
    if (!host) {
      warnings.push(
        `interfacing ${p.name}: no piece of the same name or shape to fuse it onto — left out`,
      );
      continue;
    }
    table.live.set(p.key, self);
    const sameFamily = sameStem(host.name, p.name);
    record([host, self], {
      name: `${display(host)} fused`,
      roles: host.roles,
      kind: 'fuse',
      why: '',
      hand: host.hand,
      tree: host.tree,
      judgement: {
        confidence: sameFamily ? 0.7 : 0.45,
        source: 'template',
        reason: `Interfacing ${p.name} is fused onto ${host.name} (${sameFamily ? 'same name' : 'same shape'}) before its first seam`,
      },
    });
  }

  // ── H. an outside structural reading first (the AI's units, «use AI structure») ───────────────
  // Each hint is a set of pieces made into one unit; nested hints build a tree, smallest first, so
  // a unit is always made before the unit that takes it. A hint is made from the things now on the
  // table inside it (a fused interfacing rides along with its host); one that cuts through a unit
  // already made, or holds fewer than two things, is said and skipped, and pieces of it that are on
  // no table (left out, consumed by the card's own order) are said. A hint that puts lining into the
  // shell (other than a named part such as a pocket bag) IS the bag: it is left to the template's
  // bag stage, which sews it as one (facings checked, the bag operation) at its place. Then the
  // engine goes on as is.
  if (hints.length) {
    const fusedOnto = new Set(pieces.filter((p) => p.cloth === 'interfacing').map((p) => p.key));
    const sorted = hints
      .map((h, i) => ({ h, i, keys: new Set(h.pieceKeys.filter((k) => byKey.has(k))) }))
      .filter((x) => x.keys.size >= 2)
      .sort((x, y) => x.keys.size - y.keys.size || x.i - y.i);
    for (const { h, keys } of sorted) {
      const label = h.name.trim() || 'unit';
      const live = table.list();
      const inside = live.filter((e) => e.leaves.some((k) => keys.has(k)));
      const cut = inside.find((e) => e.leaves.some((k) => !keys.has(k) && !fusedOnto.has(k)));
      if (cut) {
        warnings.push(`AI unit «${label}» cuts through ${cut.name} — not made`);
        continue;
      }
      if (inside.length < 2) {
        if (inside.length === 0 || inside[0].leaves.length < keys.size)
          warnings.push(`AI unit «${label}»: its pieces are not on the table — not made`);
        continue;
      }
      const trees = new Set(inside.map((e) => e.tree));
      // Shell and lining in one hint: a panel (or a piece whose name says nothing) on BOTH sides is
      // the bag or part of it — the lining body into the shell — and is left to the template's bag
      // stage, said. Otherwise one side only carries parts: a pocket bag on a front (a shell unit),
      // an inside pocket on a lining front (a lining unit) — made, in the tree of its panels.
      let tree: SkeletonTree | null = trees.size === 1 ? [...trees][0] : null;
      if (trees.size > 1) {
        // Only what the hint really takes: pieces on the table, a fused interfacing aside.
        const taken = inside.flatMap((e) => e.leaves).filter((k) => keys.has(k));
        const bodyOf = (t: SkeletonTree) =>
          taken
            .map((k) => byKey.get(k))
            .some(
              (p) =>
                p?.tree === t &&
                p.cloth !== 'interfacing' &&
                (!p.role || roleDef(p.role)?.level === 'panel'),
            );
        const shellBody = bodyOf('shell');
        const liningBody = bodyOf('lining');
        if (shellBody && liningBody) {
          warnings.push(
            `AI unit «${label}» puts lining into the shell — left to the order template's bag stage`,
          );
          continue;
        }
        tree = liningBody ? 'lining' : 'shell';
      }
      const held = new Set(inside.flatMap((e) => e.leaves));
      const absent = [...keys].filter((k) => !held.has(k));
      if (absent.length)
        warnings.push(
          `AI unit «${label}» is made without ${absent.map((k) => byKey.get(k)?.name ?? k).join(', ')} — not on the table`,
        );
      const merged = mergeRoles(...inside.map((e) => e.roles));
      const level = (r: string) => (roleDef(r)?.level === 'panel' ? 0 : 1);
      const own = [...merged].sort((a, b) => level(a) - level(b));
      const roles =
        own.includes('front') && own.includes('back')
          ? ['body', ...own.filter((r) => r !== 'body')]
          : own;
      const j = judge(inside, seams, `AI: ${h.reason?.trim() || label}`);
      record(inside, {
        name: label,
        roles,
        kind: 'merge',
        why: '',
        tree: tree ?? 'shell',
        judgement: { confidence: j.confidence, reason: j.reason, source: 'ai' },
      });
    }
  }

  // ── 1. one family, one hand: FP_L + FP_1_L + FP_2_L, CLR + CLR_1 ─────────────────────────────
  const groupable = (e: Entity) => {
    const def = roleDef(e.roles[0] ?? null);
    return !!def && !def.wraps && !def.noGroup;
  };
  const families = new Map<string, Entity[]>();
  for (const e of table.list()) {
    if (e.unit || !groupable(e) || !e.family) continue;
    const k = `${e.roles[0]}|${e.family}|${e.hand ?? '-'}|${e.tree}`;
    families.set(k, [...(families.get(k) ?? []), e]);
  }
  // How many separate things each role-hand (or role, when hands merge) will hold after step 1 —
  // decides whether a family unit needs its family in the name («Left front (FP)»).
  const crowd = new Map<string, number>();
  const crowdKey = (role: string, hand: Entity['hand'], tree: SkeletonTree) =>
    mergeHands.has(role) ? `${role}|${tree}` : `${role}|${hand ?? '-'}|${tree}`;
  {
    const counted = new Set<string>();
    for (const e of table.list()) {
      if (!groupable(e)) continue;
      const fam = `${e.roles[0]}|${e.family}|${e.hand ?? '-'}|${e.tree}`;
      const one = (families.get(fam)?.length ?? 0) >= 2 ? fam : e.key;
      if (counted.has(one)) continue;
      counted.add(one);
      const ck = crowdKey(e.roles[0], e.hand, e.tree);
      crowd.set(ck, (crowd.get(ck) ?? 0) + 1);
    }
  }
  // Two parts of one family that the pattern lays on DIFFERENT marks (the flap of the left pocket
  // and the flap of the right one) are copies going two ways, not layers of one thing: step S
  // places each on its own host, so the family does not sew them to each other first.
  const surfacePart = new Map<string, number>();
  for (const c of surfaces)
    surfacePart.set(c.surface.part, (surfacePart.get(c.surface.part) ?? 0) + 1);
  for (const [k, group] of families) {
    const parts = group.filter((e) => e.leaves.some((l) => surfacePart.has(l)));
    if (parts.length >= 2)
      families.set(
        k,
        group.filter((e) => !parts.includes(e)),
      );
  }
  const later: { group: Entity[]; layers: boolean; name: string }[] = [];
  for (const group of families.values()) {
    if (group.length < 2) continue;
    const [head] = group;
    const role = head.roles[0];
    const base = roleName(role, head.hand);
    const crowded = (crowd.get(crowdKey(role, head.hand, head.tree)) ?? 0) > 1;
    // F1 (05-PROD-DIAGNOSIS §6): layer PAIRS first. A family of three or more (four collar layers,
    // a sleeve and its two cuff layers, two pocket bags and a facing) is not one seam: identical
    // twins with a seam between them are joined pairwise, and the rest of the family stays apart —
    // the panel it belongs to (or the template) takes it later. Never four layers in one step.
    // A back family with two identical layers is a yoke and its facing: they are sewn AROUND the
    // back in one step (the burrito), not paired first (roles.json `layersWrap`).
    const pairs = roleDef(role)?.layersWrap && group.length > 2 ? [] : layerPairs(group);
    if (pairs.length) {
      for (const { pair, decision, alternatives, confidence } of pairs) {
        if (!pair.every(isLive)) continue;
        record(pair, {
          name: crowded ? `${base} (${pair[0].family?.toUpperCase()})` : base,
          roles: [role],
          kind: 'layers',
          why: `Layers of one shape, sewn into one first: ${listNames(pair)}`,
          alternatives: withSeams(alternatives),
          decision,
          ...(confidence !== undefined
            ? {
                judgement: {
                  confidence,
                  source: 'geometry' as const,
                  reason: `${listNames(pair)} are ${group.length} layers of one shape with no seam told apart — paired by their numbers, check`,
                },
              }
            : {}),
        });
      }
      continue;
    }
    const layers = isLayers(group, graph);
    // Parts of a pocket, flap or placket that are not layers of one shape are separate things,
    // each going onto its own panel (PCK_R_MAIN on the upper front, PCK_R_BTTM on the lower one).
    if (!layers && roleDef(role)?.attachTo?.length) continue;
    later.push({ group, layers, name: crowded ? `${base} (${head.family?.toUpperCase()})` : base });
  }

  // ── E. onto its panel first: a pocket (or, on a garment with no body, a belt) whose seam says
  // which piece it goes onto is sewn there while that piece is still flat — before the piece
  // meets the rest of its family, before any panel seam (F2, 05-PROD-DIAGNOSIS §4 P2: 10/10
  // cards). A part laid by a placement mark is step S's; a part with no seam to any panel is E2's.
  {
    const bodyless = !pieces.some((p) => p.role === 'front' || p.role === 'back');
    const toBody = new Set(
      template.stages
        .filter((st) => st.op === 'attach' && st.to?.includes('body'))
        .flatMap((st) => st.roles ?? []),
    );
    const early = (e: Entity) => {
      const def = roleDef(e.roles[0] ?? null);
      if (!def || e.leaves.some((l) => surfacePart.has(l))) return false;
      if (def.attachEarly) return true;
      return bodyless && def.level === 'sub' && toBody.has(def.id);
    };
    const host = (attachTo: string[], t: Entity) => {
      const tdef = roleDef(t.roles[0] ?? null);
      if (!tdef) return true; // a nameless piece: the geometry pass names nothing anyway
      if (tdef.attachTo?.length || tdef.wraps || early(t)) return false;
      return t.roles.some((r) => attachTo.includes(r)) || (bodyless && tdef.level === 'panel');
    };
    for (const e of table.list().filter(early)) {
      if (!isLive(e)) continue;
      const def = roleDef(e.roles[0])!;
      const attachTo = def.attachTo ?? [];
      const cands = table
        .list(e.tree)
        .filter((t) => t !== e && host(attachTo, t))
        // A seam read before any panel is assembled is only trusted between pieces of one hand:
        // a left pocket «matching» a centre-back yoke is the rectangles' noise, not its host.
        .filter((t) => !(def.sameHand && e.hand) || t.hand === e.hand)
        // To the panel itself: a seam to a pocket already on it says nothing about this one.
        .map((t) => ({ t, score: panelScore(e, t) }))
        .filter((x) => x.score >= SKELETON.accept)
        .sort((a, b) => b.score - a.score || byNameThenKey(a.t, b.t));
      if (!cands.length) continue;
      // ONE host: a seam the part could equally make with another piece (a rival within
      // SKELETON.ambiguity, here or in lane A's own reading) is no host yet — step 5 decides.
      // A rival that is itself one of the tied hosts is that tie, not a stranger.
      const { t, score } = cands[0];
      const tied = cands.filter((x) => x.score >= score - SKELETON.ambiguity);
      const tiedLeaves = new Set(tied.flatMap((x) => x.t.leaves));
      const own = seams.between(e.leaves, panelLeaves(t))[0];
      const rivalled = (own?.ambiguousWith ?? []).some((q) => {
        const ends = [pieceOf(q.a), pieceOf(q.b)];
        return (
          ends.some((k) => e.leaves.includes(k)) &&
          ends.some((k) => !e.leaves.includes(k) && !tiedLeaves.has(k))
        );
      });
      // Tied hosts that are twins (two mirrored fronts; the inner and outer of a bag) — or any tie
      // on a garment with no body — fit the part alike: it goes onto ONE of them now, the one with
      // the fewest parts on it, as a decision, rather than onto whatever the twins become later.
      const twinTie = tied.every((x) => x.t === t || twinned(x.t, t));
      if (rivalled || (tied.length > 1 && !twinTie && !bodyless)) continue;
      const ordered = [...tied].sort(
        (x, y) => partCount(x.t) - partCount(y.t) || byNameThenKey(x.t, y.t),
      );
      // As many parts on the next host too: only the name put the first one first — a tie.
      const tie =
        ordered.length > 1 && partCount(ordered[0].t) === partCount(ordered[1].t)
          ? `${roleName(def.id, e.hand)} fits ${apart(ordered[0].t, ordered[1].t).join(' and ')} alike, with as many parts on each — nothing tells them apart`
          : undefined;
      const d = decide(
        pins,
        `place:${leafId([e])}`,
        ordered.slice(0, 3).map((o, i) => ({
          inputs: [e, o.t],
          reason:
            i === 0
              ? `or onto ${display(o.t)} — the same seam, ${tie ? 'first by name' : 'the fewest parts on it'}`
              : `or onto ${display(o.t)} — the same seam`,
        })),
        isLive,
        tie,
      );
      const pick = (ordered[d.chosen] ?? ordered[0]).t;
      const made = record([e, pick], {
        name: withPart(display(pick), def.name.toLowerCase()),
        // A front with a pocket is still a front; a nameless piece stays nameless for step 4.
        roles: pick.roles.length ? mergeRoles(pick.roles, [def.id]) : [],
        kind: 'attach',
        hand: pick.hand,
        why: `${roleName(def.id, e.hand)} goes onto ${display(pick)} while it is still flat`,
        alternatives: withSeams(d.others),
        decision: d.decision,
        ...(tied.length > 1
          ? {
              judgement: {
                confidence: 0.55,
                source: 'geometry' as const,
                reason: `${roleName(def.id, e.hand)} fits ${tied.map((x) => display(x.t)).join(' and ')} alike — onto ${display(pick)} ${d.chosen ? 'by your reading' : tie ? 'first by name: a tie, pick one' : 'with the fewest parts on it'}, check`,
              },
            }
          : {}),
      });
      made.family = pick.family;
    }

    // ── E2. a part the pattern gives no seam to any panel for (a patch pocket with no placement
    // mark, a pocket bag half): still sewn onto a panel while it is flat, never left for the end
    // of the order. Which panel is said by names, not geometry (a seam would have been step E's):
    //   a. the panel its own name points at (PCK_BACK_L → the back);
    //   b. the position word in both names (a BOTTOM pocket onto the lower strip, not the upper);
    //   c. between panels of different roles, a bag onto the one with the fewest parts so far and
    //      a flap onto the one with the most (it covers a pocket) — strips of one panel are told
    //      apart by position and size only;
    //   d. the order of the role's `attachTo` (front before back), then the larger panel.
    // Always a decision with the next panels beside it, and said as a guess.
    for (const e of table.list().filter(early)) {
      if (!isLive(e)) continue;
      const def = roleDef(e.roles[0])!;
      const attachTo = def.attachTo ?? [];
      const hosts = table
        .list(e.tree)
        // A named panel only: a nameless piece may be anything, the geometry pass reads it.
        .filter((t) => t !== e && !!t.roles.length && host(attachTo, t))
        .filter((t) => !(def.sameHand && e.hand) || t.hand === e.hand);
      if (!hosts.length) continue;
      // A seam to a panel itself is step E's — placed there, or held back for step 5 as rivalled.
      if (hosts.some((t) => panelScore(e, t) >= SKELETON.accept)) continue;
      const oneRole = new Set(hosts.map((t) => t.roles[0])).size === 1;
      const pos = positionOf(e.name);
      const flap = flapEntity(e);
      // A half of a pocket bag (a lone piece with a twin) may name its panel by a bare B / F.
      const half =
        !e.unit && (geomOf.get(e.key)?.twinOf.length ?? 0) > 0 ? panelHint(e.name) : null;
      const ranked = hosts
        .map((t) => {
          const at = positionOf(t.name);
          return {
            t,
            hint: hintsAt(e, t, attachTo) || (!!half && t.roles.includes(half)) ? 0 : 1,
            position: pos === null || at === null ? 1 : at === pos ? 0 : 2,
            parts: oneRole ? 0 : flap ? -partCount(t) : partCount(t),
            rank: Math.min(
              ...t.roles.map((r) => (attachTo.includes(r) ? attachTo.indexOf(r) : 99)),
            ),
            area: areaOf(t),
          };
        })
        .sort(
          (a, b) =>
            a.hint - b.hint ||
            a.position - b.position ||
            a.parts - b.parts ||
            a.rank - b.rank ||
            b.area - a.area ||
            byNameThenKey(a.t, b.t),
        );
      // The next host ties on every rule (its size within a rounding): only the name decided.
      const [r0, r1] = ranked;
      const tie =
        r1 &&
        r0.hint === r1.hint &&
        r0.position === r1.position &&
        r0.parts === r1.parts &&
        r0.rank === r1.rank &&
        sameArea(r0.area, r1.area)
          ? `${roleName(def.id, e.hand)} could go onto ${apart(r0.t, r1.t).join(' or ')} alike — no seam, name, position or size tells them apart`
          : undefined;
      const because = (o: (typeof ranked)[number]) =>
        o.hint === 0
          ? 'its name points there'
          : o.position === 0
            ? 'the position word in both names'
            : oneRole
              ? 'the larger strip'
              : flap
                ? 'the panel with the most parts on it'
                : 'the panel with the fewest parts on it';
      const d = decide(
        pins,
        `place:${leafId([e])}`,
        ranked.slice(0, 3).map((o, i) => ({
          inputs: [e, o.t],
          reason:
            i === 0
              ? `or onto ${display(o.t)} — ${tie ? 'first by name' : because(o)}`
              : `or onto ${display(o.t)}`,
        })),
        isLive,
        tie,
      );
      const top = ranked[d.chosen] ?? ranked[0];
      const made = record([e, top.t], {
        name: withPart(display(top.t), def.name.toLowerCase()),
        roles: mergeRoles(top.t.roles, [def.id]),
        kind: 'attach',
        hand: top.t.hand,
        why: '',
        alternatives: withSeams(d.others),
        decision: d.decision,
        judgement: {
          confidence: top.hint === 0 || top.position === 0 ? 0.55 : 0.45,
          source: 'template',
          reason: `${roleName(def.id, e.hand)}: the pattern gives no seam to a panel — onto ${display(top.t)} by ${d.chosen ? 'your reading' : tie ? 'name only (a tie, pick one)' : because(top)}, while it is flat; check`,
        },
      });
      made.family = top.t.family;
    }
  }

  // ── 1b. the rest of a family in one step (strips of one panel: FP_L + FP_1_L + FP_2_L) ───────
  for (const { group, layers, name } of later) {
    const holders = [
      ...new Set(
        group.map((m) => table.list().find((e) => e.leaves.includes(m.key))).filter(Boolean),
      ),
    ] as Entity[];
    if (holders.length < 2) continue;
    const role = group[0].roles[0];
    record(holders, {
      name,
      roles: holders.every((h) => !h.unit)
        ? [role]
        : mergeRoles([role], ...holders.map((h) => h.roles)),
      kind: layers && holders.every((h) => !h.unit) ? 'layers' : 'panel',
      why: layers
        ? `Layers of one shape, sewn into one: ${listNames(holders)}`
        : `One family by name: ${listNames(holders)}`,
    });
  }

  // ── S. laid on a host: patch pockets, appliqués, a flap on a pocket (P2 lane S) ───────────────
  // A part goes onto the thing that carries its placement mark, whatever the names say, while the
  // host is still flat — before it is merged into a panel, before any body seam. A part that is
  // itself a host (the pocket the flap sits on) takes its own parts first. The unit is the host
  // with something on it: it keeps the host's roles (a front with a pocket is still a front; a
  // nameless host stays nameless for the geometry pass).
  {
    const level = new Map<SeamCandidate, number>();
    const levelOf = (c: (typeof surfaces)[number], seen: Set<string> = new Set()): number => {
      const known = level.get(c);
      if (known !== undefined) return known;
      if (seen.has(c.surface.part)) return 0;
      seen.add(c.surface.part);
      const below = surfaces.filter((q) => q.surface.host === c.surface.part);
      const l = below.length ? 1 + Math.max(...below.map((q) => levelOf(q, seen))) : 0;
      level.set(c, l);
      return l;
    };
    const holder = (leaf: string) => table.list().find((e) => e.leaves.includes(leaf));
    const short = (e: Entity) => {
      const base = e.unit ? e.name.replace(/ with .*$/, '') : e.name;
      return e.unit ? `${base[0].toLowerCase()}${base.slice(1)}` : base;
    };
    const ordered = [...surfaces].sort(
      (x, y) => levelOf(x) - levelOf(y) || (x.surface.mark < y.surface.mark ? -1 : 1),
    );
    const laid = new Set<string>();
    for (const c of ordered) {
      // Already laid (a chosen reading put it on another mark) — never pull its host along.
      if (laid.has(c.surface.part)) continue;
      const host = holder(c.surface.host);
      const part = holder(c.surface.part);
      // Already one thing (a family step joined them).
      if (!host || !part || host === part || host.tree !== part.tree) continue;
      // The other parts whose outline fits this mark equally well (two equal flaps, hands not told).
      const rivals: { e: Entity; seam: SeamCandidate }[] = [];
      for (const q of c.ambiguousWith ?? []) {
        const e = q.surface ? holder(q.surface.part) : undefined;
        if (e && e !== host && e !== part && !rivals.some((r) => r.e === e))
          rivals.push({ e, seam: q });
      }
      const options = [{ e: part, seam: c as SeamCandidate }, ...rivals];
      const readings: Reading[] = options.map((o, i) => ({
        inputs: [o.e, host],
        reason:
          i === 0
            ? `or ${o.e.name} — the pattern's first reading`
            : `or ${o.e.name} — its outline fits the same mark`,
      }));
      const d = decide(pins, `surface:${c.surface.mark}`, readings, isLive);
      const pick = options[d.chosen];
      laid.add(pick.seam.surface?.part ?? c.surface.part);
      const mark = (pick.seam.evidence.rule ?? '').replace(/^surface: /, '');
      record([pick.e, host], {
        name: withPart(display(host), short(pick.e)),
        roles: host.roles,
        kind: 'attach',
        hand: host.hand,
        why: '',
        alternatives: d.others?.map((a) => ({
          ...a,
          seams: [options.find((o) => o.e.key === a.inputs[0])?.seam ?? c],
        })),
        decision: d.decision,
        // The mark, and any edge seam the two already share (a flap's top stitched to the pocket).
        seams: [pick.seam, ...seams.crossing([pick.e.leaves, host.leaves])],
        judgement: {
          confidence: d.chosen ? 0.6 : 0.8,
          source: 'geometry',
          reason: d.chosen
            ? `${pick.e.name} goes onto ${display(host)} — your reading`
            : `${pick.e.name} is laid on ${display(host)}: ${mark}`,
        },
      });
    }
  }

  // ── 2a. one role, one hand: FRONT_L + the FP_L panel → «Left front» ──────────────────────────
  // Not for what is sewn ONTO a panel (pockets, plackets, fly): two pockets of one hand are two
  // pockets, each on its own host (step 5), never one «Left pocket» first.
  const byRole = (keyOf: (e: Entity) => string | null) => {
    const m = new Map<string, Entity[]>();
    for (const e of table.list()) {
      if (!groupable(e) || e.roles.length !== 1) continue;
      if (roleDef(e.roles[0])?.attachTo?.length) continue;
      const k = keyOf(e);
      if (k) m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.values()].filter((g) => g.length >= 2);
  };
  for (const group of byRole((e) => `${e.roles[0]}|${e.hand ?? '-'}|${e.tree}`)) {
    const role = group[0].roles[0];
    record(group, {
      name: roleName(role, group[0].hand),
      roles: [role],
      kind: 'merge',
      why: `${roleName(role, group[0].hand)} from its parts: ${listNames(group)}`,
    });
  }

  // ── 5. sewn onto a panel before the body: plackets, pockets, fly ─────────────────────────────
  for (const def of ROLE_BOOK.roles.filter((d) => d.attachTo?.length)) {
    const attachTo = def.attachTo ?? [];
    for (const e of table.list().filter((x) => x.roles[0] === def.id)) {
      if (!table.live.has(e.key)) continue;
      const cands = table
        .list(e.tree)
        .filter((t) => t !== e && t.roles.some((r) => attachTo.includes(r)))
        .filter((t) => !(def.sameHand && e.hand) || t.hand === e.hand || t.hand === null)
        .map((t) => ({
          t,
          score: bestScore(seams, e.leaves, t),
          // With no seam to tell, the name may: PCK_BACK_L goes onto the back (F2).
          hint: hintsAt(e, t, attachTo) ? 0 : 1,
          rank: Math.min(...t.roles.map((r) => (attachTo.includes(r) ? attachTo.indexOf(r) : 99))),
          handMatch: t.hand === e.hand ? 0 : 1,
        }))
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.hint - b.hint ||
            a.rank - b.rank ||
            a.handMatch - b.handMatch ||
            b.t.leaves.length - a.t.leaves.length ||
            byNameThenKey(a.t, b.t),
        );
      if (!cands.length) {
        // No panel of those roles (a bag, names that say nothing): its best seam names the host
        // rather than the end of the order (F2 — «no front to sew it onto» was the dead end).
        const partner = table
          .list(e.tree)
          .filter((t) => t !== e && !roleDef(t.roles[0] ?? null)?.wraps)
          .map((t) => ({ t, score: bestScore(seams, e.leaves, t) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score || byNameThenKey(a.t, b.t));
        if (!partner.length) {
          warnings.push(`${e.name}: no ${attachTo.join(' or ')} to sew it onto — left for the end`);
          continue;
        }
        const top = partner[0].score;
        const readings = partner.filter((x) => x.score >= top - SKELETON.ambiguity).slice(0, 3);
        const d = decide(
          pins,
          `onto:${leafId([e])}`,
          readings.map((o, i) => ({
            inputs: [e, o.t],
            reason:
              i === 0
                ? `or onto ${o.t.name} — its best seam`
                : `or onto ${o.t.name} — a seam almost as good`,
          })),
          isLive,
        );
        const t = readings[d.chosen].t;
        record([e, t], {
          name: withPart(display(t), def.name.toLowerCase()),
          roles: t.roles.length ? mergeRoles(t.roles, [def.id]) : [],
          kind: 'attach',
          hand: t.hand,
          why: `${roleName(def.id, e.hand)}: no ${attachTo.join(' or ')} in the names — ${
            d.chosen ? 'your reading sews it' : 'its best seam goes'
          } onto ${display(t)}`,
          alternatives: withSeams(d.others),
          decision: d.decision,
        });
        continue;
      }
      const [first] = cands;
      const readings = [
        first,
        ...cands
          .slice(1)
          .filter((x) => (first.score > 0 ? x.score >= first.score - SKELETON.ambiguity : true))
          .slice(0, 2),
      ];
      const d = decide(
        pins,
        `onto:${leafId([e])}`,
        readings.map((o, i) => ({
          inputs: [e, o.t],
          reason:
            i === 0
              ? `or onto ${o.t.name} — the pattern's first reading`
              : o.score
                ? `or onto ${o.t.name} — a seam almost as good`
                : `or onto ${o.t.name}`,
        })),
        isLive,
      );
      const top = readings[d.chosen];
      const why = d.chosen
        ? `${roleName(def.id, e.hand)} goes onto ${display(top.t)} — your reading`
        : top.score
          ? `${roleName(def.id, e.hand)} goes onto ${display(top.t)}`
          : `${roleName(def.id, e.hand)} goes onto ${display(top.t)} by name (${attachTo.join(' / ')})`;
      record([e, top.t], {
        name: withPart(display(top.t), def.name.toLowerCase()),
        roles: mergeRoles(top.t.roles, [def.id]),
        kind: 'attach',
        hand: top.t.hand,
        why,
        alternatives: withSeams(d.others),
        decision: d.decision,
      });
    }
  }

  // ── 2b. roles with a centre seam merge across hands: left back + BP + right back → «Back» ────
  for (const group of byRole((e) =>
    mergeHands.has(e.roles[0]) ? `${e.roles[0]}|${e.tree}` : null,
  )) {
    const role = group[0].roles[0];
    record(group, {
      name: roleName(role, null),
      roles: [role],
      kind: 'merge',
      hand: null,
      why: `${roleName(role, null)}: left, right and centre parts in one — ${listNames(group)}`,
    });
  }

  // ── 3. sandwiches around another unit: stand layers + collar in one step ──────────────────────
  for (const def of ROLE_BOOK.roles.filter((d) => d.wraps)) {
    for (const tree of ['shell', 'lining'] as const) {
      const layers = table.list(tree).filter((e) => e.roles[0] === def.id);
      if (!layers.length) continue;
      const leaves = layers.flatMap((e) => e.leaves);
      const target = table
        .list(tree)
        .filter((e) => e.roles[0] === def.wraps)
        .sort(
          (x, y) =>
            bestScore(seams, leaves, y) - bestScore(seams, leaves, x) || byNameThenKey(x, y),
        )[0];
      if (!target) {
        if (layers.length >= 2) {
          record(layers, {
            name: roleName(def.id, null),
            roles: [def.id],
            kind: 'layers',
            why: `Layers of the ${def.name.toLowerCase()}: ${listNames(layers)}`,
          });
        }
        continue;
      }
      const targetBase = roleName(def.wraps ?? null, null);
      const own = def.name.toLowerCase().startsWith(`${targetBase.toLowerCase()} `)
        ? def.name.slice(targetBase.length + 1)
        : def.name.toLowerCase();
      record([...layers, target], {
        name: `${targetBase} with ${own}`,
        roles: mergeRoles(target.roles, [def.id]),
        kind: 'wrap',
        hand: target.hand,
        why: `${def.name} layers ${listNames(layers)} sewn around ${target.name} in one step`,
      });
    }
  }

  // ── R. repeats: six or more nameless pieces of ONE shape (the 16 triangles of a bag) ──────────
  // Between congruent pieces every edge «matches» every other: lane A's pairing of them is noise,
  // not evidence (F4, 05-PROD-DIAGNOSIS §6). They are read by name instead — one ring per name
  // stem (outer_* apart from inner_*), all of it in one step — and said as a guess.
  for (const tree of ['shell', 'lining'] as const) {
    const loose = table.list(tree).filter((e) => !e.unit && e.roles.length === 0);
    const seen = new Set<string>();
    for (const e of loose) {
      if (seen.has(e.key)) continue;
      const same = loose.filter((x) => x === e || identical(e, x));
      if (
        same.length < REPEAT_MIN ||
        !same.every((a) => same.every((b) => a === b || identical(a, b)))
      )
        continue;
      same.forEach((x) => seen.add(x.key));
      const byStem = new Map<string, Entity[]>();
      for (const x of same)
        byStem.set(layerStem(x.name), [...(byStem.get(layerStem(x.name)) ?? []), x]);
      for (const [stem, ring] of byStem) {
        if (ring.length < 3) continue;
        ring.sort((x, y) => nameIndex(x.name) - nameIndex(y.name));
        record(ring, {
          name: `${stem || ring[0].name} ×${ring.length}`,
          roles: [],
          kind: 'geometry',
          why: '',
          judgement: {
            confidence: 0.5,
            source: 'template',
            reason: `${ring.length} pieces of one shape (${ring[0].name} … ${ring[ring.length - 1].name}) joined into one by their name — the seams between congruent pieces cannot tell which edge meets which, check`,
          },
        });
      }
    }
  }

  // ── E3. a piece with no role in its name and no seam at all (a border strip, a sleeve placket
  // whose edges match nothing): not dropped to «what is left» but placed — onto a panel of its
  // hand, or on a garment with no named panels onto any piece — as a guess (orphans below).
  // Before the geometry pass, so it lands on a piece rather than on whatever that pass glues.
  placeOrphans((e) => !e.unit);

  // ── 4. pieces whose names say nothing: geometry alone ─────────────────────────────────────────
  // Tiered, not one component: notch-confirmed seams first, then length-only, then the rest —
  // a blazer of 46 numbered pieces would otherwise become one 46-input «join».
  for (const tier of GEOMETRY_TIERS) {
    for (const tree of ['shell', 'lining'] as const) {
      const nameless = table.list(tree).filter((e) => e.roles.length === 0);
      const owner = new Map<string, number>();
      nameless.forEach((e, i) => e.leaves.forEach((k) => owner.set(k, i)));
      const parent = nameless.map((_, i) => i);
      const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
      for (const c of seams.usable) {
        if (c.score < tier) continue;
        const x = owner.get(pieceOf(c.a));
        const y = owner.get(pieceOf(c.b));
        if (x === undefined || y === undefined || x === y) continue;
        parent[find(x)] = find(y);
      }
      const comps = new Map<number, Entity[]>();
      nameless.forEach((e, i) => comps.set(find(i), [...(comps.get(find(i)) ?? []), e]));
      for (const found of comps.values()) {
        // A pinned reading earlier in this pass may already have sewn one of these elsewhere.
        const comp = found.filter(isLive);
        if (comp.length < 2) continue;
        const readings: Reading[] = [
          { inputs: comp, reason: `or ${listNames(comp)} — the pattern's first reading` },
          ...(comp.length === 2 ? rivals(comp, tree) : []),
        ];
        const d = decide(pins, `pair:${leafId(comp)}`, readings, isLive);
        const pick = readings[d.chosen].inputs;
        const named = pick.find((e) => e.roles.length > 0);
        const shown = pick.map((e) => e.name);
        record(pick, {
          name: named
            ? `${named.name} + ${pick
                .filter((e) => e !== named)
                .map((e) => e.name)
                .join(' + ')}`
            : pick.length <= 3
              ? shown.join(' + ')
              : `${shown[0]} + ${pick.length - 1} more`,
          roles: named ? named.roles : [],
          kind: named ? 'attach' : 'geometry',
          hand: named?.hand,
          why: d.chosen
            ? `Your reading: ${listNames(pick)} sewn to each other`
            : `Sewn to each other by the pattern alone (no role in the names): ${listNames(comp)}`,
          alternatives: withSeams(d.others),
          decision: d.decision,
        });
      }
    }
  }
  // A pair joined by geometry alone whose seam has a rival within SKELETON.ambiguity: the rival's
  // piece is the other way to read the pattern («?» in D2, the first one preselected).
  function rivals(pair: Entity[], tree: SkeletonTree): Reading[] {
    const out: Reading[] = [];
    for (const c of seams.crossing(pair.map((e) => e.leaves))) {
      for (const alt of c.ambiguousWith ?? []) {
        const ends = [pieceOf(alt.a), pieceOf(alt.b)];
        for (const [i, e] of pair.entries()) {
          const keep = pair[1 - i];
          if (!ends.some((k) => keep.leaves.includes(k))) continue;
          const other = ends.find((k) => !keep.leaves.includes(k));
          const rival = table.list(tree).find((x) => other && x.leaves.includes(other));
          if (!rival || rival === e || out.some((o) => o.inputs.includes(rival))) continue;
          out.push({
            inputs: [keep, rival],
            reason: `or ${keep.name} with ${rival.name} — ${seams.words(alt)}`,
          });
        }
      }
    }
    return out.slice(0, 2);
  }

  // A nameless piece or group sewn to a named unit joins it, best seam first.
  for (;;) {
    let best: { u: Entity; t: Entity; score: number; others: Entity[] } | null = null;
    for (const u of table.list().filter((e) => e.roles.length === 0)) {
      const targets = table
        .list(u.tree)
        .filter((t) => t !== u && t.roles.length > 0)
        .map((t) => ({ t, score: bestScore(seams, u.leaves, t) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || byNameThenKey(a.t, b.t));
      if (!targets.length) continue;
      if (!best || targets[0].score > best.score) {
        best = {
          u,
          t: targets[0].t,
          score: targets[0].score,
          others: targets
            .slice(1)
            .filter((x) => x.score >= targets[0].score - SKELETON.ambiguity)
            .slice(0, 2)
            .map((x) => x.t),
        };
      }
    }
    if (!best) break;
    const { u } = best;
    const targets = [best.t, ...best.others];
    const d = decide(
      pins,
      // Keyed by the group's first piece, not its whole leaf set: a chosen reading re-reads the
      // composite seams, the nameless group may come back larger, and a pin keyed by every leaf
      // would no longer find its own decision.
      `attach:${[...u.leaves].sort()[0]}`,
      targets.map((o, i) => ({
        inputs: [o, u],
        reason:
          i === 0 ? `or to ${o.name} — its best seam` : `or to ${o.name} — a seam almost as good`,
      })),
      isLive,
    );
    const t = targets[d.chosen];
    record([t, u], {
      name: `${t.name} + ${u.name}`,
      roles: t.roles,
      kind: 'attach',
      hand: t.hand,
      why: d.chosen
        ? `${u.name} has no role in its name; your reading sews it to ${t.name}`
        : `${u.name} has no role in its name; its best seam goes to ${t.name}`,
      alternatives: withSeams(d.others),
      decision: d.decision,
    });
  }

  // A nameless group the geometry pass made that has no seam outward (two placket pieces sewn
  // only to each other): placed the same way.
  placeOrphans((e) => e.unit);

  /**
   * E3: a thing with no role and no usable seam to anything else on its table goes onto the host
   * with the fewest parts on it, then the largest, then the first on the card — among the panels
   * (front, back, sleeve …) of its own hand when it has one, or, on a garment with no named panel,
   * among every piece and unit. A decision with the next hosts beside it, at 0.4: a guess said as
   * one is still better than a piece outside every unit.
   */
  function placeOrphans(which: (e: Entity) => boolean) {
    const panels = table.list().some((x) => roleDef(x.roles[0] ?? null)?.level === 'panel');
    for (const e of table.list().filter((x) => x.roles.length === 0 && which(x))) {
      if (!isLive(e)) continue;
      // A bare number («7», «30») says nothing to go by — no word, no hand: the geometry pass and
      // «what is left» keep it. A name with a word in it (BRDR, FLP_L) is placed.
      if (!e.leaves.some((k) => byKey.get(k)?.family)) continue;
      const others = table.list(e.tree).filter((t) => t !== e);
      if (others.some((t) => bestScore(seams, e.leaves, t) > 0)) continue;
      let hosts = others.filter((t) => {
        // A part is smaller than what it is sewn onto: a piece as large as its host is a copy,
        // a layer or the lining of it — lane A asks about those in words, it is not placed.
        if (areaOf(t) > 0 && areaOf(e) >= ORPHAN_HOST_AREA * areaOf(t)) return false;
        const d = roleDef(t.roles[0] ?? null);
        if (panels) return d?.level === 'panel' && !d.wraps;
        return t.unit || !(d?.attachTo?.length || d?.wraps);
      });
      if (e.hand && hosts.some((t) => t.hand === e.hand))
        hosts = hosts.filter((t) => t.hand === e.hand);
      if (!hosts.length) continue;
      const ranked = [...hosts].sort(
        (a, b) => partCount(a) - partCount(b) || areaOf(b) - areaOf(a) || byNameThenKey(a, b),
      );
      // As many parts and the same size on the next host: only the name decided — a tie.
      const tie =
        ranked.length > 1 &&
        partCount(ranked[0]) === partCount(ranked[1]) &&
        sameArea(areaOf(ranked[0]), areaOf(ranked[1]))
          ? `${e.name} could go onto ${apart(ranked[0], ranked[1]).join(' or ')} alike — as many parts and the same size on each`
          : undefined;
      const d = decide(
        pins,
        `orphan:${leafId([e])}`,
        ranked.slice(0, 3).map((t, i) => ({
          inputs: [t, e],
          reason:
            i === 0
              ? `or onto ${display(t)} — ${tie ? 'first by name' : 'the fewest parts on it'}`
              : `or onto ${display(t)}`,
        })),
        isLive,
        tie,
      );
      const top = ranked[d.chosen] ?? ranked[0];
      e.leaves.forEach((k) => orphaned.add(k));
      record([top, e], {
        name: `${display(top)} + ${e.name}`,
        roles: top.roles,
        kind: 'attach',
        hand: top.hand,
        why: '',
        alternatives: withSeams(d.others),
        decision: d.decision,
        judgement: {
          confidence: 0.4,
          source: 'template',
          reason: `${e.name}: no role in its name and no seam found — onto ${display(top)} ${
            d.chosen
              ? 'by your reading'
              : tie
                ? '(first by name: a tie, pick one)'
                : `(${e.hand ? 'same hand, ' : ''}the fewest parts on it)`
          } as a guess, check`,
        },
      });
    }
  }

  return { units, table, pieces, seams, warnings, replay, existing };
}

/** B1: the units before the body, in dependency order (inputs always come first). */
export function groupUnits(
  graph: SeamGraph,
  facts: SkeletonFacts,
  template: SkeletonTemplate = orderTemplate(facts.category),
  pins: SkeletonPins = {},
  hints: readonly SkeletonUnitHint[] = [],
): SkeletonUnit[] {
  return groupDetailed(graph, facts, template, pins, hints).units;
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────

/**
 * The attacher's own name points at this host's role: PCK_BACK_L carries a back token, so with no
 * seam to tell, it goes onto the back rather than the first role of `attachTo`.
 */
function hintsAt(e: Entity, t: Entity, attachTo: string[]): boolean {
  const own = new Set(nameTokens(e.name).map((x) => x.replace(/^\d+|\d+$/g, '')));
  return attachTo.some(
    (r) => t.roles.includes(r) && (roleDef(r)?.tokens ?? []).some((x) => own.has(x)),
  );
}

/** A name's tokens without the numbers glued to them: PCK_BACK_1L → pck, back, l. */
const bareTokens = (name: string) => nameTokens(name).map((x) => x.replace(/^\d+|\d+$/g, ''));

const POSITION_TOP = new Set([
  'top',
  'upper',
  'up',
  'u',
  'верх',
  'верхний',
  'верхняя',
  'górny',
  'gorny',
  'górna',
  'gorna',
]);
const POSITION_BOTTOM = new Set([
  'bottom',
  'bttm',
  'btm',
  'lower',
  'low',
  'down',
  'dn',
  'низ',
  'нижний',
  'нижняя',
  'dolny',
  'dolna',
]);
/** The position word in a name: P_R_U → top, PCK_R_BTTM → bottom, none → null. */
function positionOf(name: string): 'top' | 'bottom' | null {
  const t = bareTokens(name);
  if (t.some((x) => POSITION_TOP.has(x))) return 'top';
  if (t.some((x) => POSITION_BOTTOM.has(x))) return 'bottom';
  return null;
}

/**
 * The panel a part's own name points at, for telling two halves of one pocket bag apart: the
 * roles' tokens plus the bare B / F, which only mean back / front next to such a twin.
 */
const BACK_HINT = new Set([...(roleDef('back')?.tokens ?? []), 'b']);
const FRONT_HINT = new Set([...(roleDef('front')?.tokens ?? []), 'f']);
function panelHint(name: string): 'back' | 'front' | null {
  const t = bareTokens(name);
  if (t.some((x) => BACK_HINT.has(x))) return 'back';
  if (t.some((x) => FRONT_HINT.has(x))) return 'front';
  return null;
}

/** A pocket flap by its name (the pocket role reads flaps and bags alike). */
const FLAP_TOKENS = new Set(['fl', 'flp', 'flap', 'клапан', 'patka']);
function isFlap(name: string): boolean {
  return bareTokens(name).some((x) => FLAP_TOKENS.has(x));
}

const SAME_SHAPE = ' have the same shape';

/**
 * Lane A says «A and B have the same shape — …» for every such pair: eight inner and eight outer
 * panels of one shape are 64 lines of one question. Pairs are grouped by the name stems of both
 * sides (layerStem: inner_trapezoid_3 → inner_trapezoid) and each group is said once —
 * «inner_trapezoid ×8 and outer_trapezoid ×8 have the same shape — …». A group of one pair keeps
 * lane A's own words. The names are split where both halves are piece names (a name may hold «and»).
 */
function sameShapeByFamily(lines: string[], names: string[]): string[] {
  const known = new Set(names);
  const stemOf = (n: string) => layerStem(n) || n;
  type Group = { stems: string[]; pieces: Map<string, Set<string>>; lines: string[]; tail: string };
  const groups = new Map<string, Group>();
  const out: string[] = [];
  const splitPair = (head: string): [string, string] | null => {
    for (let i = head.indexOf(' and '); i >= 0; i = head.indexOf(' and ', i + 1)) {
      const [a, b] = [head.slice(0, i), head.slice(i + 5)];
      if (known.has(a) && known.has(b)) return [a, b];
    }
    return null;
  };
  for (const line of lines) {
    const at = line.indexOf(SAME_SHAPE);
    const pair = splitPair(line.slice(0, at));
    if (!pair) {
      out.push(line);
      continue;
    }
    const stems = [...new Set(pair.map(stemOf))].sort();
    const key = stems.join('\u0000');
    const g: Group = groups.get(key) ?? {
      stems,
      pieces: new Map(),
      lines: [],
      tail: line.slice(at),
    };
    for (const n of pair) {
      const st = stemOf(n);
      g.pieces.set(st, (g.pieces.get(st) ?? new Set()).add(n));
    }
    g.lines.push(line);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    if (g.lines.length === 1) {
      out.push(g.lines[0]);
      continue;
    }
    const side = (st: string) => {
      const ps = [...(g.pieces.get(st) ?? [])];
      return ps.length === 1 ? ps[0] : `${st} ×${ps.length}`;
    };
    out.push(`${g.stems.map(side).join(' and ')}${g.tail}`);
  }
  return out;
}

/** The number a layer carries in its name (BLT_3_M → 3, CLR_MAIN → 0): the last number token. */
function nameIndex(name: string): number {
  const nums = nameTokens(name).filter((t) => /^\d+$/.test(t));
  return nums.length ? Number(nums[nums.length - 1]) : 0;
}

/** A name without its numbers and size tokens: CLR_MAIN_1 and CLR_MAIN are one layer stem. */
const SIZE_TOKENS = new Set(['xxs', 'xs', 's', 'm', 'xl', 'xxl', 'os']);
function layerStem(name: string): string {
  return nameTokens(name)
    .filter((t) => !/^\d+$/.test(t) && !SIZE_TOKENS.has(t))
    .join('_');
}

/** Tokens that only say «this is the interfacing of …». */
const INTERFACING_TOKENS = new Set([
  'int',
  'interfacing',
  'fuse',
  'fusing',
  'fus',
  'dbl',
  'interlining',
]);

/** INT_FACING_L and FACING_L name the same piece once the interfacing word is dropped. */
function sameStem(a: string, b: string): boolean {
  const stem = (n: string) =>
    nameTokens(n)
      .filter((t) => !INTERFACING_TOKENS.has(t))
      .join('_');
  return stem(a) !== '' && stem(a) === stem(b);
}

/**
 * «Left front with pocket» + pocket → «Left front with pockets», + placket → «Left front with
 * pocket, placket»: a unit name says each part once, never «with pocket with pocket».
 */
export function withPart(name: string, part: string): string {
  // «Left front with pocket 2» is a uniqueness suffix, not part of what the unit holds.
  const base = name.replace(/ \d+$/, '');
  const at = base.indexOf(' with ');
  if (at < 0) return `${base} with ${part}`;
  const parts = base.slice(at + 6).split(', ');
  const i = parts.findIndex((x) => x === part || x === `${part}s`);
  if (i >= 0) parts[i] = parts[i].endsWith('s') ? parts[i] : `${part}s`;
  else parts.push(part);
  return `${base.slice(0, at)} with ${parts.join(', ')}`;
}

/** How a thing is called in a unit name: a unit by its name, a lone piece by its role (Left front). */
/** Two hosts in words that tell them apart: their piece names where both read the same. */
function apart(a: Entity, b: Entity): [string, string] {
  const [x, y] = [display(a), display(b)];
  return x === y ? [a.name, b.name] : [x, y];
}

export function display(e: Entity): string {
  return e.unit || !e.roles[0] ? e.name : roleName(e.roles[0], e.hand);
}

function bestScore(seams: SeamIndex, leaves: string[], t: Entity): number {
  return seams.between(leaves, t.leaves)[0]?.score ?? 0;
}

/**
 * Layers = pieces of ONE shape in ONE fabric (collar and under-collar, yoke and yoke facing): only
 * when lane A calls them identical twins — congruent edge sequences and one cloth (or, with no cloth
 * known, one name family). Never by area alone: a shell piece and its lining twin have one area.
 */
function isLayers(group: Entity[], graph: SeamGraph): boolean {
  const geo = new Map(graph.pieces.map((p) => [p.pieceKey, p]));
  const [head, ...rest] = group;
  return rest.every(
    (e) =>
      geo.get(head.key)?.twinOf.some((t) => t.key === e.key && t.kind === 'identical') ?? false,
  );
}
