// chains/ — operator edits to the legend (ApplyLegendFn): class → role / size label.
//
// Edits change the class row only; chains, bundles and ambiguities stay as built. A class moved
// out of role 'size' loses its size label; ambiguities naming an edited class are dropped (the
// operator answered them). Orphans are recomputed: size-line chains no class claims as size/common.
import type { ApplyLegendFn, ChainSet, LineClass } from 'lib/pattern-import/types';

export const applyLegend: ApplyLegendFn = (set, edits) => {
  const byId = new Map(edits.map((e) => [e.classId, e]));
  const classes: LineClass[] = set.classes.map((c) => {
    const e = byId.get(c.id);
    if (!e) return c;
    const sizeLabel = e.role === 'size' ? e.sizeLabel : null;
    // an edit that changes nothing is no answer (T3): the row keeps its confidence and its question
    if (e.role === c.role && (sizeLabel ?? null) === (c.sizeLabel ?? null)) return c;
    return { ...c, role: e.role, sizeLabel, confidence: 1 };
  });
  const edited = new Set(classes.filter((c, k) => c !== set.classes[k]).map((c) => c.id));
  const ambiguities = set.ambiguities?.filter((a) => !a.classes.some((c) => edited.has(c)));
  const claimed = new Set(classes.filter((c) => c.role !== 'ignore').flatMap((c) => c.chains));
  const orphans = set.orphans.filter((i) => !claimed.has(i));
  return { ...set, classes, orphans, ...(ambiguities ? { ambiguities } : {}) };
};

/**
 * Same size label on two size rows = one size (a size drawn in two looks, F3 `class-split`): the
 * chains join the lower-ranked row. Run after `applyLegend` (the operator's labels).
 */
export function mergeSameSize(set: ChainSet): ChainSet {
  const rankOf = (c: LineClass) => {
    for (const e of c.evidence) if (e.kind === 'nesting-order') return e.rank;
    return Infinity;
  };
  const groups = new Map<string, LineClass[]>();
  for (const c of set.classes) {
    if (c.role !== 'size' || !c.sizeLabel?.trim()) continue;
    const k = c.sizeLabel.trim().toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const gone = new Set<number>();
  const into = new Map<number, LineClass>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const [head, ...rest] = [...g].sort((a, b) => rankOf(a) - rankOf(b));
    const chains = [...head.chains, ...rest.flatMap((c) => c.chains)];
    into.set(head.id, {
      ...head,
      chains,
      totalLengthMm: head.totalLengthMm + rest.reduce((n, c) => n + c.totalLengthMm, 0),
      evidence: [
        ...head.evidence,
        ...rest.flatMap((c) => c.evidence.filter((e) => e.kind !== 'nesting-order')),
      ],
      confidence: 1,
    });
    rest.forEach((c) => gone.add(c.id));
  }
  if (!gone.size) return set;
  return {
    ...set,
    classes: set.classes.filter((c) => !gone.has(c.id)).map((c) => into.get(c.id) ?? c),
    // bundles were cut to the old size count; the fill re-derives local ranks without them
    bundles: [],
    ambiguities: set.ambiguities?.filter((a) => !a.classes.some((id) => gone.has(id))),
    warnings: [
      ...set.warnings,
      `${gone.size} size ${gone.size === 1 ? 'row' : 'rows'} merged by label (one size drawn in two looks)`,
    ],
  };
}
