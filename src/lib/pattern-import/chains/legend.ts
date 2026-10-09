// chains/ — operator edits to the legend (ApplyLegendFn): class → role / size label.
//
// Edits change the class row only; chains, bundles and ambiguities stay as built. A class moved
// out of role 'size' loses its size label; ambiguities naming an edited class are dropped (the
// operator answered them). Orphans are recomputed: size-line chains no class claims as size/common.
import type { ApplyLegendFn, LineClass } from 'lib/pattern-import/types';

export const applyLegend: ApplyLegendFn = (set, edits) => {
  const byId = new Map(edits.map((e) => [e.classId, e]));
  const classes: LineClass[] = set.classes.map((c) => {
    const e = byId.get(c.id);
    if (!e) return c;
    return { ...c, role: e.role, sizeLabel: e.role === 'size' ? e.sizeLabel : null, confidence: 1 };
  });
  const edited = new Set(byId.keys());
  const ambiguities = set.ambiguities?.filter((a) => !a.classes.some((c) => edited.has(c)));
  const claimed = new Set(classes.filter((c) => c.role !== 'ignore').flatMap((c) => c.chains));
  const orphans = set.orphans.filter((i) => !claimed.has(i));
  return { ...set, classes, orphans, ...(ambiguities ? { ambiguities } : {}) };
};
