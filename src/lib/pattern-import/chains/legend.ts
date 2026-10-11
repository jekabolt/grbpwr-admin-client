// chains/ — operator edits to the legend (ApplyLegendFn): class → role / size label.
//
// Edits change the class row only; chains, bundles and ambiguities stay as built. A class moved
// out of role 'size' loses its size label; ambiguities naming an edited class are dropped (the
// operator answered them). Orphans are recomputed: size-line chains no class claims as size/common.
import type { ApplyLegendFn, ChainSet, LineClass, Style } from 'lib/pattern-import/types';

/**
 * Every row's signature (LineClass.sig): the dominant pen of its lines (colour, width, dash,
 * layer) and how it was found (its evidence kinds); rows alike in all of that are told apart by
 * their order.
 */
export function withClassSigs(set: ChainSet, styles: readonly Style[]): ChainSet {
  const byId = new Map(styles.map((s) => [s.id, s]));
  const seen = new Map<string, number>();
  const classes = set.classes.map((c) => {
    const len = new Map<number, number>();
    for (const id of c.chains) {
      const ch = set.chains[id];
      if (ch) len.set(ch.style, (len.get(ch.style) ?? 0) + ch.lengthMm);
    }
    const top = [...len].sort((a, b) => b[1] - a[1])[0]?.[0];
    const st = top != null ? byId.get(top) : undefined;
    const pen = st
      ? `${st.strokeRgb ? st.strokeRgb.join(',') : '-'}|${st.widthMm.toFixed(2)}|${st.dash ? st.dash.join(',') : '-'}|${st.layer ?? '-'}`
      : '-';
    const how = [...new Set(c.evidence.map((e) => e.kind))].sort().join(',');
    const base = `${pen}|${how}|${c.sizeLabel ?? ''}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { ...c, sig: `${base}#${n}` };
  });
  return { ...set, classes };
}

export const applyLegend: ApplyLegendFn = (set, edits) => {
  // an answer bound to a row signature finds that row whatever its number now, and is dropped when
  // no row carries it any more; an unbound (older) answer goes by the number
  const editOf = (c: LineClass) =>
    edits.find((e) => (e.sig ? e.sig === c.sig : e.classId === c.id));
  const classes: LineClass[] = set.classes.map((c) => {
    const e = editOf(c);
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
 * The operator's "confirm" on a row as proposed (the sizes step's chip; keys as `legendConfirmed`:
 * the row's sig, or `#id` for a row without one). An answer like a role edit — confidence 1, the
 * row's questions dropped — in a NEW set, so what is keyed by the set (gradeView, the solver's cache)
 * sees it. `applyLegend` alone keeps a same-role edit at its proposed confidence (T3: a row sent
 * back as built is no answer); this is the explicit one. Rows nobody touched stay as built.
 */
export function confirmRows(set: ChainSet, keys: readonly string[]): ChainSet {
  const want = new Set(keys);
  const classes = set.classes.map((c) =>
    want.has(c.sig ?? `#${c.id}`) && c.confidence < 1 ? { ...c, confidence: 1 } : c,
  );
  const edited = new Set(classes.filter((c, k) => c !== set.classes[k]).map((c) => c.id));
  if (!edited.size) return set;
  const ambiguities = set.ambiguities?.filter((a) => !a.classes.some((c) => edited.has(c)));
  return { ...set, classes, ...(ambiguities ? { ambiguities } : {}) };
}

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
