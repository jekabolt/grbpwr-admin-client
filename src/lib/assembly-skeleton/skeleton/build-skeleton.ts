// B3 — the proposal: units (B1) laid out in the order of the category's stage table (B2), the body
// stages on top, press and BOM steps where the template asks, zones and unit codes filled in, and
// the result run through the card's own frontier rules before anyone sees it.
//
// What the draft fills: inputs → output unit (key + human name), operation type, machine (the
// card's default; the server rejects a MACHINE step without one), zone (inferred from the pieces,
// else the stage's). What it leaves empty on purpose: work, seam class, SMV — the technologist's.

import type {
  SeamCandidate,
  SeamGraph,
  SkeletonDeps,
  SkeletonFacts,
  SkeletonOperationType,
  SkeletonOptions,
  SkeletonProposal,
  SkeletonStep,
  SkeletonTree,
  SkeletonUnit,
} from '../types';
import { DART_CONFIDENCE, dartsByPiece, outlineVNotches } from '../geometry/darts';
import { handWord, judge, mergeRoles, multWord, roleDef, zoneEnum, type Entity } from './model';
import { display, groupDetailed } from './group-units';
import type { SkeletonTemplate, TemplateStage } from './template';

const OUTER = 'TECH_CARD_GARMENT_ZONE_OUTER';
const MACHINE_PREFIX = 'TECH_CARD_MACHINE_TYPE_';

const PRESS_BY_KIND: Record<SkeletonUnit['kind'], 'open' | 'flat' | 'none'> = {
  fuse: 'none',
  layers: 'flat',
  wrap: 'flat',
  attach: 'open',
  panel: 'open',
  merge: 'open',
  geometry: 'open',
};

const LABEL_BY_KIND: Record<SkeletonUnit['kind'], string> = {
  fuse: 'Fuse interfacing',
  layers: 'Join layers',
  wrap: 'Sew layers around',
  attach: 'Attach',
  panel: 'Join panel pieces',
  merge: 'Join parts',
  geometry: 'Join by seams',
};

/** B3: graph + card facts + template → the ordered draft of steps. */
export function buildSkeleton(
  graph: SeamGraph,
  facts: SkeletonFacts,
  template: SkeletonTemplate,
  deps: SkeletonDeps,
  options: SkeletonOptions = {},
): SkeletonProposal {
  const g = groupDetailed(graph, facts, template, options.pins);
  const { table, seams, pieces, replay } = g;
  const warnings = [...g.warnings];
  // Append mode: the card's own steps come first in every check and in zone inference.
  const before = facts.existing?.steps ?? [];
  const beforeDraft: SkeletonStep[] = before.map((s) => ({
    inputs: s.inputs.map((i) => i.key),
    outputUnitKey: s.outputUnitKey,
    outputUnitName: s.outputUnitName,
    operationType: 'MACHINE',
    zone: '',
    seams: [],
    confidence: 1,
    reason: '',
    source: 'template',
  }));
  const steps: SkeletonStep[] = [];
  const pressOpen = options.pressOpen ?? template.pressOpen;
  const pressFlat = options.pressFlat ?? template.pressFlat;
  const defaultMachine = (facts.defaultMachineType ?? '').trim() || 'lockstitch';
  const machineOf = (short: string) =>
    defaultMachine.startsWith(MACHINE_PREFIX) ? `${MACHINE_PREFIX}${short.toUpperCase()}` : short;
  const draftPieces = pieces.map((p) => ({ lineKey: p.key, name: p.name }));
  const pieceName = new Map(pieces.map((p) => [p.key, p.name]));
  const roleOfPiece = new Map(pieces.map((p) => [p.key, p.role]));
  const hasRole = (role: string) => pieces.some((p) => p.role === role);

  // Units from B1, emitted when their stage comes; `emitted` keeps the replay honest.
  const unitByKey = new Map(g.units.map((u) => [u.key, u]));
  const emitted = new Set<string>();
  const consumedByEmitted = new Set<string>();
  // Live entities as they were before grouping, for fusing a piece while it is still a piece.
  const unitEntity = (u: SkeletonUnit): Entity => ({
    key: u.key,
    name: u.name,
    unit: true,
    roles: u.roles,
    family: null,
    hand: u.hand,
    tree: u.tree,
    leaves: u.pieceKeys,
    mult: u.mult,
  });
  const anyEntity = (key: string): Entity => {
    const u = unitByKey.get(key);
    if (u) return unitEntity(u);
    const own = g.existing.get(key);
    if (own) return own;
    const p = pieces.find((x) => x.key === key);
    return {
      key,
      name: p?.name ?? key,
      unit: false,
      roles: p?.role ? [p.role] : [],
      family: p?.family ?? null,
      hand: p?.hand ?? null,
      tree: p?.tree ?? 'shell',
      leaves: [key],
      mult: p?.mult,
    };
  };

  const resolveZone = (index: number, preferred: string, fallback: string, inferFirst: boolean) => {
    const inferred =
      inferFirst || !preferred
        ? deps.zoneOf(
            { pieces: draftPieces, steps: [...beforeDraft, ...steps] },
            beforeDraft.length + index,
          )
        : '';
    return (inferFirst ? inferred || preferred : preferred || inferred) || fallback || OUTER;
  };

  // A press after a step is not a decision of its own: it rides on the step it follows (its tick,
  // its confidence), and the provenance is recorded HERE, where it is known — not guessed later
  // from the press's position.
  const pushPress = (after: SkeletonStep, unitKey: string, kind: 'open' | 'flat' | 'none') => {
    if (kind === 'none' || !unitKey) return;
    if (kind === 'open' && !pressOpen) return;
    if (kind === 'flat' && !pressFlat) return;
    const step: SkeletonStep = {
      inputs: [unitKey],
      outputUnitKey: '',
      outputUnitName: '',
      operationType: kind === 'open' ? 'PRESS_OPEN' : 'PRESS',
      zone: after.zone,
      seams: [],
      confidence: after.confidence,
      derivedFrom: steps.indexOf(after),
      reason:
        kind === 'open'
          ? 'Press the new seam open (template)'
          : 'Press the turned unit flat (template)',
      source: 'template',
      label: kind === 'open' ? 'Press seams open' : 'Press flat',
    };
    steps.push(step);
  };

  const pushJoin = (
    inputs: Entity[],
    output: Entity,
    spec: {
      stage: string;
      label: string;
      operationType: SkeletonOperationType;
      zone: string;
      roleZone: string;
      seams: SeamCandidate[];
      confidence: number;
      reason: string;
      source: SkeletonStep['source'];
      alternatives?: SkeletonStep['alternatives'];
      decision?: SkeletonStep['decision'];
      press: 'open' | 'flat' | 'none';
    },
  ) => {
    const step: SkeletonStep = {
      inputs: inputs.map((e) => e.key),
      outputUnitKey: output.key,
      outputUnitName: output.name,
      operationType: spec.operationType,
      ...(spec.operationType === 'MACHINE' ? { machineType: defaultMachine } : {}),
      zone: '',
      seams: spec.seams,
      confidence: spec.confidence,
      reason: spec.reason,
      source: spec.source,
      label: spec.label,
      ...(spec.alternatives?.length ? { alternatives: spec.alternatives } : {}),
      ...(spec.decision ? { decision: spec.decision } : {}),
    };
    steps.push(step);
    step.zone = resolveZone(steps.length - 1, spec.zone, spec.roleZone, true);
    pushPress(step, output.key, spec.press);
  };

  const pushProcess = (
    target: Entity,
    spec: {
      stage: string;
      label: string;
      operationType: SkeletonOperationType;
      machine?: string;
      zone: string;
      reason: string;
      source: SkeletonStep['source'];
      confidence: number;
      press?: 'open' | 'flat' | 'none';
    },
  ) => {
    // Processing a unit (hem, side seams, buttonholes, final press on «Shirt») follows the join that
    // made it: same tick, and — for the template's own steps — the same confidence. A BOM step
    // keeps its own (the BOM is evidence), but still rides on the join's tick. Processing a loose
    // piece (fusing, the rib closed into a ring) follows nothing and stands on its own.
    let made = -1;
    for (let j = steps.length - 1; j >= 0; j--) {
      if (steps[j].outputUnitKey === target.key) {
        made = j;
        break;
      }
    }
    const step: SkeletonStep = {
      inputs: [target.key],
      outputUnitKey: '',
      outputUnitName: '',
      operationType: spec.operationType,
      ...(spec.operationType === 'MACHINE'
        ? { machineType: spec.machine ? machineOf(spec.machine) : defaultMachine }
        : {}),
      zone: '',
      seams: [],
      confidence:
        made >= 0 && spec.source === 'template' ? steps[made].confidence : spec.confidence,
      ...(made >= 0 ? { derivedFrom: made } : {}),
      reason: spec.reason,
      source: spec.source,
      label: spec.label,
    };
    steps.push(step);
    step.zone = resolveZone(
      steps.length - 1,
      spec.zone,
      zoneEnum(roleDef(target.roles[0] ?? null)?.zone),
      false,
    );
    pushPress(step, target.key, spec.press ?? 'none');
  };

  // ── B1 units, in stage order ───────────────────────────────────────────────────────────────
  const emitUnit = (u: SkeletonUnit, stage: TemplateStage | null) => {
    if (emitted.has(u.key)) return;
    for (const k of u.inputs) {
      const dep = unitByKey.get(k);
      if (dep) emitUnit(dep, stage);
    }
    emitted.add(u.key);
    for (const k of u.inputs) consumedByEmitted.add(k);
    const kindPress = PRESS_BY_KIND[u.kind];
    const press =
      stage?.press && stage.press !== 'none' && kindPress !== 'none' ? stage.press : kindPress;
    pushJoin(u.inputs.map(anyEntity), unitEntity(u), {
      stage: stage?.id ?? 'units',
      label: `${LABEL_BY_KIND[u.kind]}: ${u.name}`,
      operationType: u.kind === 'fuse' ? 'FUSING' : 'MACHINE',
      zone: '',
      roleZone: zoneEnum(roleDef(u.roles[0] ?? null)?.zone),
      seams: u.seams,
      confidence: u.confidence,
      reason: u.reason,
      source: u.source,
      alternatives: u.alternatives,
      decision: u.decision,
      press,
    });
  };
  const emitAllUnits = () => g.units.forEach((u) => emitUnit(u, null));

  // ── body helpers ───────────────────────────────────────────────────────────────────────────
  const trees = (): SkeletonTree[] => {
    const t = new Set(table.list().map((e) => e.tree));
    return (['shell', 'lining'] as const).filter((x) => t.has(x));
  };
  const withRole = (e: Entity, roles: string[] | undefined) =>
    (roles ?? []).some((r) => r === '*' || e.roles.includes(r));
  /** The unit everything else is sewn onto: the body if there is one, else the biggest unit. */
  const main = (tree: SkeletonTree): Entity | undefined => {
    const list = table.list(tree);
    return (
      list
        .filter((e) => e.roles.includes('body'))
        .sort((a, b) => b.leaves.length - a.leaves.length)[0] ??
      list.filter((e) => e.unit).sort((a, b) => b.leaves.length - a.leaves.length)[0]
    );
  };
  const why = (stage: TemplateStage) => `${stage.label} (template ${template.id})`;
  const bodyJoin = (
    stage: TemplateStage,
    inputs: Entity[],
    out: { name: string; roles: string[]; tree?: SkeletonTree; hand?: Entity['hand'] },
    alternatives?: SkeletonStep['alternatives'],
    label: string = stage.label,
  ) => {
    const j = judge(inputs, seams, why(stage));
    const output = table.join(inputs, out);
    pushJoin(inputs, output, {
      stage: stage.id,
      label,
      operationType: 'MACHINE',
      zone: zoneEnum(stage.zone),
      roleZone: OUTER,
      seams: j.seams,
      confidence: j.confidence,
      reason: j.reason,
      source: j.source,
      alternatives,
      press: stage.press ?? 'none',
    });
    return output;
  };

  // ── the stage table ────────────────────────────────────────────────────────────────────────
  let bodyStarted = false;
  for (const stage of template.stages) {
    if (stage.unless?.some(hasRole)) continue;
    if (stage.op === 'fuse') {
      runFuse(stage);
      continue;
    }
    // Before any unit is emitted, like fuse — a feature is sewn on the flat piece (P2 §4).
    if (stage.op === 'features') {
      runFeatures(stage);
      continue;
    }
    if (stage.op === 'units') {
      const roles = stage.roles ?? ['*'];
      for (const u of g.units) {
        if (roles.includes('*') || roles.includes(u.roles[0] ?? '')) emitUnit(u, stage);
      }
      continue;
    }
    if (!bodyStarted) {
      emitAllUnits();
      bodyStarted = true;
    }
    switch (stage.op) {
      case 'combine':
        runCombine(stage);
        break;
      case 'attach':
        runAttach(stage);
        break;
      case 'process':
        runProcess(stage);
        break;
      case 'bom':
        runBom(stage);
        break;
      case 'press':
        runPress(stage);
        break;
      case 'bag':
        runBag(stage);
        break;
    }
  }
  emitAllUnits();
  converge();

  function runFuse(stage: TemplateStage) {
    const marked = pieces.filter((p) => p.fused);
    const byBom =
      marked.length === 0 && facts.bom.interlining > 0
        ? pieces.filter((p) => p.role && template.fuseRoles.includes(p.role))
        : [];
    for (const p of [...marked, ...byBom]) {
      // Already sewn by the card's own order (append mode): its fusing is the card's business.
      if (replay.consumed.has(p.key)) continue;
      if (consumedByEmitted.has(p.key)) {
        warnings.push(`${p.name} is fused after its first seam — move the fusing step up`);
        continue;
      }
      pushProcess(anyEntity(p.key), {
        stage: stage.id,
        label: `${stage.label}: ${p.name}`,
        operationType: 'FUSING',
        zone: '',
        reason: p.fused
          ? `${p.name} is marked fused — fuse before its first seam`
          : `BOM has interlining and nothing is marked fused; a ${p.role} is usually fused — check`,
        source: p.fused ? 'template' : 'bom',
        confidence: p.fused ? 0.7 : 0.4,
      });
    }
  }

  /**
   * P2 lane D: darts read off the pieces' internal marks (geometry/darts.ts), one step per piece,
   * on the flat piece before its first seam. Never above the accept threshold: no real pattern has
   * confirmed the reader yet, so every dart step is a «decide». A V cut into the outline is only
   * reported.
   */
  function runFeatures(stage: TemplateStage) {
    const byPiece = dartsByPiece(graph.pieces);
    const geomName = new Map(graph.pieces.map((g) => [g.pieceKey, g.name]));
    for (const p of pieces) {
      const d = byPiece.get(p.key);
      if (!d?.count || p.cloth === 'interfacing') continue;
      // Already sewn by the card's own order (append mode): its darts are the card's business.
      if (replay.consumed.has(p.key)) continue;
      if (consumedByEmitted.has(p.key)) {
        warnings.push(`${p.name} has darts but is sewn before them — move the dart step up`);
        continue;
      }
      const n = d.count;
      const what = `dart${n > 1 ? 's' : ''}`;
      const lines = d.darts
        .map((x) => `${Math.round(x.intakeMm)} × ${Math.round(x.depthMm)} mm`)
        .join(', ');
      const twin = d.inheritedFrom
        ? pieceName.get(d.inheritedFrom) ?? geomName.get(d.inheritedFrom)
        : null;
      const at = steps.length;
      pushProcess(anyEntity(p.key), {
        stage: stage.id,
        label: `Sew ${n} ${what} on ${p.name}${multWord(p.mult)}`,
        operationType: 'MACHINE',
        zone: '',
        reason: twin
          ? `${p.name} has no dart lines of its own; its mirror ${twin} has ${n} — read as ${what}, check`
          : `${n} V-shaped line${n > 1 ? 's' : ''} inside ${p.name} (intake × depth ${lines}) read as ${what} — check`,
        source: 'geometry',
        confidence: DART_CONFIDENCE,
      });
      steps[at].feature = {
        kind: 'dart',
        pieceKey: p.key,
        count: n,
        marks: d.darts.map((x) => x.mark),
      };
      // Pressing direction is unknown («toward the centre»?): only with press-open switched on,
      // and then as a rider on the dart step.
      if (pressOpen) {
        steps.push({
          inputs: [p.key],
          outputUnitKey: '',
          outputUnitName: '',
          operationType: 'PRESS',
          zone: steps[at].zone,
          seams: [],
          confidence: steps[at].confidence,
          derivedFrom: at,
          reason: `Press the darts of ${p.name} (direction: check)`,
          source: 'template',
          label: 'Press darts',
        });
      }
    }
    for (const g of graph.pieces) {
      if (replay.consumed.has(g.pieceKey) || !pieceName.has(g.pieceKey)) continue;
      if (outlineVNotches(g).length) {
        warnings.push(
          `V-notch in the outline of ${pieceName.get(g.pieceKey)} — a dart cut out? add the step by hand`,
        );
      }
    }
  }

  function runCombine(stage: TemplateStage) {
    for (const tree of trees()) {
      const cands = table.list(tree).filter((e) => withRole(e, stage.roles));
      const groups = stage.byHand
        ? (['L', 'R'] as const).map((h) => cands.filter((e) => e.hand === h))
        : [cands];
      for (const group of groups) {
        if (group.length < 2) continue;
        const roles = mergeRoles(...group.map((e) => e.roles));
        const missing = (stage.requireAll ?? []).filter((r) => !roles.includes(r));
        if (missing.length) {
          warnings.push(`${stage.label}: no ${missing.join(', ')} found — skipped`);
          continue;
        }
        const hand = stage.byHand ? group[0].hand : null;
        const base = stage.name ?? stage.label;
        bodyJoin(stage, group, {
          name: stage.byHand ? `${handWord(hand)}${base.toLowerCase()}` : base,
          roles: mergeRoles([stage.as ?? 'body'], roles),
          hand,
        });
      }
    }
  }

  function runAttach(stage: TemplateStage) {
    for (const tree of trees()) {
      const targetTree = stage.targetTree ?? tree;
      const attachers = table
        .list(tree)
        .filter((e) => withRole(e, stage.roles) && !withRole(e, stage.to));
      if (!attachers.length) continue;
      const target = () =>
        table
          .list(targetTree)
          .filter((e) => withRole(e, stage.to))
          .sort((a, b) => b.leaves.length - a.leaves.length)[0];
      if (!target()) {
        warnings.push(
          `${stage.label}: nothing to sew ${attachers.map((e) => e.name).join(', ')} onto yet — left for the end`,
        );
        continue;
      }
      checkSleeves(stage, attachers, target()!);
      const batches = stage.together ? [attachers] : attachers.map((a) => [a]);
      for (const batch of batches) {
        const t = target()!;
        // «Set sleeves ×2»: what is sewn on is two copies under one key (both hands at once).
        const copies = Math.max(...batch.map((e) => e.mult ?? 1));
        bodyJoin(
          stage,
          [...batch, t],
          {
            name:
              stage.name ??
              `${display(t)} with ${batch.map((e) => display(e).toLowerCase()).join(', ')}`,
            roles: mergeRoles(t.roles, ...batch.map((e) => e.roles)),
            tree: t.tree,
            hand: t.hand,
          },
          undefined,
          `${stage.label}${multWord(copies)}`,
        );
      }
    }
  }

  function runProcess(stage: TemplateStage) {
    for (const tree of trees()) {
      let targets = table.list(tree).filter((e) => withRole(e, stage.roles));
      if (!targets.length && stage.roles?.includes('body')) {
        const m = main(tree);
        targets = m ? [m] : [];
      }
      for (const t of targets) {
        pushProcess(t, {
          stage: stage.id,
          label: stage.label,
          operationType: stage.operationType ?? 'MACHINE',
          machine: stage.machine,
          zone: zoneEnum(stage.zone),
          reason: `${why(stage)} on ${t.name}`,
          source: 'template',
          confidence: 0.5,
          press: stage.press,
        });
      }
    }
  }

  function runBom(stage: TemplateStage) {
    const n = stage.when ? facts.bom[stage.when] : 0;
    if (!n) return;
    const t = main('shell') ?? main('lining');
    if (!t) return;
    const loose = table
      .list()
      .filter((e) => ['placket', 'fly'].includes(e.roles[0] ?? '') && !e.roles.includes('body'));
    if (loose.length && ['buttons', 'zipper', 'snaps'].includes(stage.when ?? '')) {
      warnings.push(
        `${stage.label} comes before ${loose.map((e) => e.name).join(', ')} is sewn on — check the order`,
      );
    }
    pushProcess(t, {
      stage: stage.id,
      label: stage.label,
      operationType: stage.operationType ?? 'MACHINE',
      machine: stage.machine,
      zone: zoneEnum(stage.zone),
      reason: `BOM has ${n} ${stage.when} row${n === 1 ? '' : 's'} → ${stage.label.toLowerCase()} on ${t.name}`,
      source: 'bom',
      confidence: 0.6,
    });
  }

  function runPress(stage: TemplateStage) {
    const t = main('shell') ?? main('lining');
    if (!t) return;
    pushProcess(t, {
      stage: stage.id,
      label: stage.label,
      operationType: 'PRESS',
      zone: zoneEnum(stage.zone),
      reason: `${why(stage)} on ${t.name}`,
      source: 'template',
      confidence: 0.6,
    });
  }

  function runBag(stage: TemplateStage) {
    const shell = main('shell');
    const lining = main('lining');
    if (!shell || !lining) return;
    const facings = table
      .list()
      .filter((e) => e !== shell && e !== lining && withRole(e, stage.roles));
    const missingFacings = pieces.filter(
      (p) =>
        p.role === 'facing' &&
        p.cloth !== 'interfacing' &&
        !shell.leaves.includes(p.key) &&
        !lining.leaves.includes(p.key),
    );
    if (missingFacings.length) {
      warnings.push(
        `${stage.label}: the lining is bagged before the facings (${missingFacings.map((p) => p.name).join(', ')}) are on it — check the order`,
      );
    }
    bodyJoin(stage, [shell, lining, ...facings], {
      name: stage.name ?? template.garmentName,
      roles: mergeRoles(['body'], shell.roles, lining.roles),
      tree: 'shell',
      hand: null,
    });
  }

  function checkSleeves(stage: TemplateStage, attachers: Entity[], target: Entity) {
    if (!attachers.some((e) => e.roles[0] === 'sleeve')) return;
    if (!hasRole('front') || !hasRole('back')) return;
    const roles = new Set(target.leaves.map((k) => roleOfPiece.get(k)));
    if (!roles.has('front') || !roles.has('back')) {
      warnings.push(
        `${stage.label}: the sleeve goes in before the shoulder seam (${target.name} has no front + back yet) — check`,
      );
    }
  }

  /** One terminal unit: whatever the template left on the table is joined at the end, out loud. */
  function converge() {
    const live = table.list();
    const sewn = live.filter(
      (e) => e.unit || e.roles.length > 0 || e.leaves.some((k) => seams.touches(k)),
    );
    const orphans = live.filter((e) => !sewn.includes(e));
    for (const o of orphans) {
      warnings.push(
        `${o.name} is outside every unit: no role in its name and no seam found — place it by hand`,
      );
    }
    if (sewn.length === 1 && !sewn[0].unit) {
      // One piece with a role and nothing to sew it to: no step — but said, not swallowed.
      warnings.push(
        `${sewn[0].name} is the only piece to assemble — there is nothing to join it to; add its steps by hand`,
      );
    }
    if (sewn.length >= 2) {
      const order = [...sewn].sort((a, b) => b.leaves.length - a.leaves.length);
      const extra = order.slice(1).map((e) => e.name);
      warnings.push(
        `no template stage takes ${extra.join(', ')} — joined to ${order[0].name} at the end, check`,
      );
      const stage: TemplateStage = {
        id: 'converge',
        op: 'combine',
        label: 'Join what is left',
        as: 'body',
        zone: 'OUTER',
      };
      bodyJoin(stage, order, {
        name: template.garmentName,
        roles: mergeRoles(['body'], ...order.map((e) => e.roles)),
        tree: order[0].tree,
        hand: null,
      });
    }
    // The terminal unit carries the garment's name («Shirt»), like the technologist's last join.
    const terminal = table.list().find((e) => e.unit);
    if (terminal && table.list().filter((e) => e.unit).length === 1) {
      const at = steps.findIndex((s) => s.outputUnitKey === terminal.key);
      if (at >= 0 && steps[at].outputUnitName !== template.garmentName) {
        table.rename(terminal, template.garmentName);
        steps[at].outputUnitName = terminal.name;
      }
    }
  }

  // ── unit codes: provisional keys → zone codes (the same rule the step editor offers) ────────
  // Taken: every piece key and every unit code the card already uses (append mode) — a new unit
  // never takes a code of the card's own order.
  const taken = new Set([...pieces.map((p) => p.key), ...replay.unitKeys]);
  const code = new Map<string, string>();
  const terminalKey =
    table.list().filter((e) => e.unit).length === 1
      ? table.list().find((e) => e.unit)?.key
      : undefined;
  for (const s of steps) {
    if (!s.outputUnitKey.startsWith('~u') || code.has(s.outputUnitKey)) continue;
    // The finished garment is coded by the garment, not by the zone of its last seam (SLEEVE-3).
    const c = deps.suggestUnitCode(s.outputUnitKey === terminalKey ? OUTER : s.zone, taken);
    taken.add(c);
    code.set(s.outputUnitKey, c);
  }
  const remap = (k: string) => code.get(k) ?? k;
  for (const s of steps) {
    s.inputs = s.inputs.map(remap);
    s.outputUnitKey = remap(s.outputUnitKey);
    s.alternatives = s.alternatives?.map((a) => ({ ...a, inputs: a.inputs.map(remap) }));
    if (!s.alternatives) delete s.alternatives;
  }

  // ── the card's own rules: 1–3, 6, 7 must hold; rule 4 is reported, not enforced ─────────────
  const pieceKeys = new Set(pieces.map((p) => p.key));
  const check = deps.checkAssembly(draftPieces, [
    ...before,
    ...steps.map((s) => ({
      inputs: s.inputs.map((key) => ({
        kind: pieceKeys.has(key) ? ('piece' as const) : ('unit' as const),
        key,
      })),
      outputUnitKey: s.outputUnitKey,
      outputUnitName: s.outputUnitName,
    })),
  ]);
  // The card's own order is the card's: only the draft's steps are reported, numbered as the draft.
  for (const v of check.violations) {
    if (v.step >= 0 && v.step < before.length) continue;
    warnings.push(
      `rule ${v.rule} broken at step ${v.step - before.length + 1}: ${namesIn(v.message, pieceName)} — a defect of the draft, report it`,
    );
  }
  for (const v of check.release) warnings.push(namesIn(v.message, pieceName));

  // ── seams no step stands on ──────────────────────────────────────────────────────────────────
  const used = new Set(steps.flatMap((s) => s.seams.map(seamId)));
  // A seam between two pieces the card's own order has already sewn is the card's, not a gap.
  const sewnByCard = (id: string) => replay.consumed.has(id.slice(0, id.lastIndexOf('#')));
  const unresolved = graph.chosen.filter(
    (c) => !used.has(seamId(c)) && !(sewnByCard(c.a) && sewnByCard(c.b)),
  );

  return { steps, unresolved, template: template.id, warnings: dedupe(warnings) };
}

/**
 * A rule message quotes keys; a piece key is a 26-character id nobody reads («01M1M1S2WR…»). Every
 * piece key in it is replaced by the piece's name — longest first, so no key is cut inside another.
 */
export function namesIn(message: string, names: ReadonlyMap<string, string>): string {
  let out = message;
  const keys = [...names.keys()].filter((k) => k && names.get(k) !== k);
  keys.sort((a, b) => b.length - a.length);
  for (const k of keys) if (out.includes(k)) out = out.split(k).join(names.get(k)!);
  return out;
}

function seamId(c: SeamCandidate): string {
  return c.a < c.b ? `${c.a}~${c.b}` : `${c.b}~${c.a}`;
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}
