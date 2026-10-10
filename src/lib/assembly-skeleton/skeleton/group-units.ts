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
  type SkeletonDecision,
  type SkeletonFacts,
  type SkeletonPins,
  type SkeletonTree,
  type SkeletonUnit,
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
        ? `Lining ${out.name[0].toLowerCase()}${out.name.slice(1)}`
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
): { chosen: number; decision?: SkeletonDecision; others: SkeletonUnit['alternatives'] } {
  const want = pins[id] ?? 0;
  // A pin that no longer fits (the reading vanished, or one of its inputs is already sewn
  // elsewhere) falls back to the engine's own reading rather than inventing a join.
  const chosen = want > 0 && want < readings.length && readings[want].inputs.every(live) ? want : 0;
  if (readings.length < 2) return { chosen, others: undefined };
  return {
    chosen,
    decision: { id, chosen },
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

/** B1 with the state `buildSkeleton` continues from. */
export function groupDetailed(
  graph: SeamGraph,
  facts: SkeletonFacts,
  template: SkeletonTemplate = orderTemplate(facts.category),
  pins: SkeletonPins = {},
): Grouping {
  const pieces = readPieces(graph, facts);
  const seams = new SeamIndex(graph, pieces, template);
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

  // Same shape, not proven layers: said, never joined silently (lane A matched no seam between them).
  for (const w of graph.warnings) if (w.includes('have the same shape')) warnings.push(w);
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
      seams: j.seams,
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
    const layers = isLayers(group, graph);
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
        name: `${display(top.t)} with ${def.name.toLowerCase()}`,
        roles: mergeRoles(top.t.roles, [def.id]),
        kind: 'attach',
        hand: top.t.hand,
        why,
        alternatives: withSeams(d.others),
        decision: d.decision,
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
): SkeletonUnit[] {
  return groupDetailed(graph, facts, template, pins).units;
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
