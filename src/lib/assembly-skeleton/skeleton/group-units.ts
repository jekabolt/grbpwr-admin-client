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
  type SeamGraph,
  type SkeletonFacts,
  type SkeletonTree,
  type SkeletonUnit,
} from '../types';
import {
  SeamIndex,
  commonHand,
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
      });
    }
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
    // The lining subtree reads as lining in every name («Lining body»), not as «Body 2».
    const name =
      tree === 'lining' && !/^lining\b/i.test(out.name)
        ? `Lining ${out.name[0].toLowerCase()}${out.name.slice(1)}`
        : out.name;
    const e: Entity = {
      key: `~u${++this.n}`,
      name: this.uniqueName(name),
      unit: true,
      roles: out.roles,
      family: null,
      hand: out.hand === undefined ? commonHand(inputs) : out.hand,
      tree,
      leaves: mergeLeaves(inputs, this.order),
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
};

const listNames = (es: Entity[]) => es.map((e) => e.name).join(', ');

/** Seam score floors for geometry-only grouping: notches matched, then lengths, then accepted. */
const GEOMETRY_TIERS = [0.95, 0.75, SKELETON.accept];

/** B1 with the state `buildSkeleton` continues from. */
export function groupDetailed(
  graph: SeamGraph,
  facts: SkeletonFacts,
  template: SkeletonTemplate = orderTemplate(facts.category),
): Grouping {
  const pieces = readPieces(graph, facts);
  const seams = new SeamIndex(graph, pieces, template);
  const byKey = new Map(pieces.map((p) => [p.key, p]));
  const table = new Table(pieces.filter((p) => p.cloth !== 'interfacing'));
  const units: SkeletonUnit[] = [];
  const warnings: string[] = [];
  const mergeHands = new Set(template.mergeHands);

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
      judgement?: Pick<SkeletonUnit, 'confidence' | 'reason' | 'source'>;
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
      kind: spec.kind,
      seams: j.seams,
      confidence: spec.judgement?.confidence ?? j.confidence,
      reason: spec.judgement?.reason ?? j.reason,
      source: spec.judgement?.source ?? j.source,
      ...(spec.alternatives?.length ? { alternatives: spec.alternatives } : {}),
    });
    return e;
  };

  // ── 0. interfacing as a separate card piece enters ONLY through a FUSING join (§G) ────────────
  for (const p of pieces.filter((x) => x.cloth === 'interfacing')) {
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
            Math.abs((byKey.get(y.key)?.areaMm2 ?? 0) - (p.areaMm2 ?? 0)),
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
  for (const group of families.values()) {
    if (group.length < 2) continue;
    const [head] = group;
    const role = head.roles[0];
    const layers = isLayers(group, graph, byKey);
    const base = roleName(role, head.hand);
    const crowded = (crowd.get(crowdKey(role, head.hand, head.tree)) ?? 0) > 1;
    record(group, {
      name: crowded ? `${base} (${head.family?.toUpperCase()})` : base,
      roles: [role],
      kind: layers ? 'layers' : 'panel',
      why: layers
        ? `Layers of one shape, sewn into one: ${listNames(group)}`
        : `One family by name: ${listNames(group)}`,
    });
  }

  // ── 2a. one role, one hand: FRONT_L + the FP_L panel → «Left front» ──────────────────────────
  const byRole = (keyOf: (e: Entity) => string | null) => {
    const m = new Map<string, Entity[]>();
    for (const e of table.list()) {
      if (!groupable(e) || e.roles.length !== 1) continue;
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
        .sort((x, y) => bestScore(seams, leaves, y) - bestScore(seams, leaves, x))[0];
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
      for (const comp of comps.values()) {
        if (comp.length < 2) continue;
        const shown = comp.map((e) => e.name);
        record(comp, {
          name: comp.length <= 3 ? shown.join(' + ') : `${shown[0]} + ${comp.length - 1} more`,
          roles: [],
          kind: 'geometry',
          why: `Sewn to each other by the pattern alone (no role in the names): ${listNames(comp)}`,
          alternatives: comp.length === 2 ? rivals(comp, tree) : undefined,
        });
      }
    }
  }
  // A pair joined by geometry alone whose seam has a rival within SKELETON.ambiguity: the rival's
  // piece is the other way to read the pattern («?» in D2, the first one preselected).
  function rivals(pair: Entity[], tree: SkeletonTree): SkeletonUnit['alternatives'] {
    const out: NonNullable<SkeletonUnit['alternatives']> = [];
    for (const c of seams.crossing(pair.map((e) => e.leaves))) {
      for (const alt of c.ambiguousWith ?? []) {
        const ends = [pieceOf(alt.a), pieceOf(alt.b)];
        for (const [i, e] of pair.entries()) {
          const keep = pair[1 - i];
          if (!ends.some((k) => keep.leaves.includes(k))) continue;
          const other = ends.find((k) => !keep.leaves.includes(k));
          const rival = table.list(tree).find((x) => other && x.leaves.includes(other));
          if (!rival || rival === e || out.some((o) => o.inputs.includes(rival.key))) continue;
          out.push({
            inputs: [keep.key, rival.key],
            seams: [alt],
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
        .sort((a, b) => b.score - a.score);
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
    const { u, t, others } = best;
    record([t, u], {
      name: `${t.name} + ${u.name}`,
      roles: t.roles,
      kind: 'attach',
      hand: t.hand,
      why: `${u.name} has no role in its name; its best seam goes to ${t.name}`,
      alternatives: others.map((o) => ({
        inputs: [o.key, u.key],
        seams: seams.between(u.leaves, o.leaves),
        reason: `or to ${o.name} — a seam almost as good`,
      })),
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
          rank: Math.min(...t.roles.map((r) => (attachTo.includes(r) ? attachTo.indexOf(r) : 99))),
          handMatch: t.hand === e.hand ? 0 : 1,
        }))
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.rank - b.rank ||
            a.handMatch - b.handMatch ||
            b.t.leaves.length - a.t.leaves.length,
        );
      if (!cands.length) {
        warnings.push(`${e.name}: no ${attachTo.join(' or ')} to sew it onto — left for the end`);
        continue;
      }
      const [top] = cands;
      const others = cands
        .slice(1)
        .filter((x) => (top.score > 0 ? x.score >= top.score - SKELETON.ambiguity : true))
        .slice(0, 2);
      const why = top.score
        ? `${roleName(def.id, e.hand)} goes onto ${display(top.t)}`
        : `${roleName(def.id, e.hand)} goes onto ${display(top.t)} by name (${attachTo.join(' / ')})`;
      record([e, top.t], {
        name: `${display(top.t)} with ${def.name.toLowerCase()}`,
        roles: mergeRoles(top.t.roles, [def.id]),
        kind: 'attach',
        hand: top.t.hand,
        why,
        alternatives: others.map((o) => ({
          inputs: [e.key, o.t.key],
          seams: seams.between(e.leaves, o.t.leaves),
          reason: o.score ? `or onto ${o.t.name} — a seam almost as good` : `or onto ${o.t.name}`,
        })),
      });
    }
  }

  return { units, table, pieces, seams, warnings };
}

/** B1: the units before the body, in dependency order (inputs always come first). */
export function groupUnits(
  graph: SeamGraph,
  facts: SkeletonFacts,
  template: SkeletonTemplate = orderTemplate(facts.category),
): SkeletonUnit[] {
  return groupDetailed(graph, facts, template).units;
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────

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

/** How a thing is called in a unit name: a unit by its name, a lone piece by its role (Left front). */
export function display(e: Entity): string {
  return e.unit || !e.roles[0] ? e.name : roleName(e.roles[0], e.hand);
}

function bestScore(seams: SeamIndex, leaves: string[], t: Entity): number {
  return seams.between(leaves, t.leaves)[0]?.score ?? 0;
}

/**
 * Layers = pieces of ONE shape (collar and under-collar, yoke and yoke facing): the graph calls
 * them identical twins; without lane A's twins, areas within 1.5 % say the same.
 */
function isLayers(group: Entity[], graph: SeamGraph, byKey: Map<string, PieceFact>): boolean {
  const geo = new Map(graph.pieces.map((p) => [p.pieceKey, p]));
  const [head, ...rest] = group;
  return rest.every((e) => {
    const twin = geo.get(head.key)?.twinOf.some((t) => t.key === e.key && t.kind === 'identical');
    if (twin) return true;
    const a = byKey.get(head.key)?.areaMm2;
    const b = byKey.get(e.key)?.areaMm2;
    return !!a && !!b && round2(Math.abs(a - b) / Math.max(a, b)) <= 0.015;
  });
}
