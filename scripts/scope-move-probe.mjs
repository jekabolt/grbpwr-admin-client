// SCOPE MOVE — the one writer of a scope's bindings (lane B1, sheet binding).
//
// Every editor that moves a cloth line between scopes (BOM, MATERIALS, PATTERNS, the draft's undo, a
// sheet dragged onto another tile) asks these pure helpers which sheets and piece links go along, and
// whether the move is allowed at all. A wrong answer is silent: a sheet lands «without a material», or
// the save bounces on a duplicate piece link. Neither shows in tsc.
//
//   node scripts/scope-move-probe.mjs
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `scope-move-probe-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'scope-move-entry.ts')], bundle: true, platform: 'node',
  format: 'esm', target: 'node20', outfile, logLevel: 'warning', absWorkingDir: REPO,
  jsx: 'automatic', loader: { '.css': 'empty', '.svg': 'text', '.png': 'dataurl' },
  // form-writers reaches api/api through the fusing rebuild (isGenerated).
  define: {
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'process.env.NODE_ENV': '"production"',
  },
  alias: {
    components: resolve(REPO, 'src/components'), lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'), utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'), constants: resolve(REPO, 'src/constants'),
  },
});
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem() {}, removeItem() {} },
  configurable: true,
});
const m = await import(pathToFileURL(outfile).href);

let bad = 0;
const j = (v) => JSON.stringify(v);
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const eq = (got, want, what) => ck(j(got) === j(want), what, j(got) === j(want) ? '' : `${j(got)} ≠ ${j(want)}`);

// ── fixtures ──────────────────────────────────────────────────────────────────────────────────
const FABRIC = 'TECH_CARD_BOM_SECTION_FABRIC';
const TRIM = 'TECH_CARD_BOM_SECTION_TRIM';
const P = (k) => `TECH_CARD_BOM_PURPOSE_${k}`;
const UNSET = 'TECH_CARD_BOM_PURPOSE_UNSET';
const MAIN = P('MAIN');
const POCKET = P('POCKETING');
const LINING = P('LINING');
const CONTRAST = P('CONTRAST');

const ITEMS = [
  { lineKey: 'L1', section: FABRIC, purpose: MAIN, name: 'twill' },
  { lineKey: 'L2', section: FABRIC, purpose: MAIN, name: 'twill 2' },
  { lineKey: 'L3', section: FABRIC, purpose: POCKET, name: 'pocketing' },
  { lineKey: 'L4', section: FABRIC, purpose: '', name: 'loose' },
  { lineKey: 'T1', section: TRIM, purpose: '', name: 'zip' },
];
const lines = (items) => m.clothLines(items);
const scopesOf = (items) => m.fabricScopes(lines(items));
const withPurpose = (key, purpose) =>
  ITEMS.map((b) => (b.lineKey === key ? { ...b, purpose } : b));
const scopeOf = (items, key) => m.scopeOfLine(scopesOf(items), key);
const BEFORE = scopesOf(ITEMS);

// ── 0. cloth lines ────────────────────────────────────────────────────────────────────────────
eq(lines(ITEMS).map((l) => l.lineKey), ['L1', 'L2', 'L3', 'L4'], 'clothLines keeps the four roll sections only');
eq(BEFORE.map((s) => s.key), [MAIN, POCKET, 'L4'], 'scopes: purposes in owner order, then unsorted lines');

// planLineChange over the probe's card: `next` is the BOM after the change, `keys` the lines changed.
const plan = (next, keys, patterns, aliases, markers) =>
  m.planLineChange({ patterns, aliases, markers, before: lines(ITEMS), after: lines(next), lines: keys });
const clean = (out) => out.clash.length === 0 && m.impactEmpty(out.impact);

// ── 1. the only line of its scope carries its sheets and links ─────────────────────────────
{
  const next = withPurpose('L3', LINING);
  const patterns = [
    { name: 'pocket', fabricPurpose: POCKET, bomLineKey: 'L3' },
    { name: 'shell', fabricPurpose: MAIN, bomLineKey: '' },
  ];
  const aliases = [
    { fabricPurpose: POCKET, bomLineKey: 'L3', blockName: 'pocket bag', pieceLineKey: 'p1' },
    { fabricPurpose: MAIN, bomLineKey: '', blockName: 'front', pieceLineKey: 'p2' },
  ];
  const out = plan(next, ['L3'], patterns, aliases);
  ck(clean(out), 'only line → new purpose: nothing held, no clash');
  eq(out.patterns[0], { name: 'pocket', fabricPurpose: LINING, bomLineKey: 'L3' }, 'its sheet takes the new purpose + its line');
  eq(out.patterns[1], patterns[1], 'another scope\'s sheet stays');
  eq(out.aliases[0].fabricPurpose, LINING, 'its piece link moves too');
  eq(out.aliases[1], aliases[1], 'another scope\'s link stays');
  eq([out.sheets, out.links], [1, 1], 'counts');
}

// ── 1b. card-11 path: an unsorted line gets a purpose, its line-bound sheet follows ────────
{
  const out = plan(withPurpose('L4', CONTRAST), ['L4'], [{ name: 'c', fabricPurpose: '', bomLineKey: 'L4' }], []);
  eq(out.patterns[0], { name: 'c', fabricPurpose: CONTRAST, bomLineKey: 'L4' }, 'unsorted → purpose: sheet bound to the purpose + line');
}

// ── 1c. purpose → unset: the line's own scope again ─────────────────────────────────────────
{
  const out = plan(withPurpose('L3', UNSET), ['L3'], [{ fabricPurpose: POCKET, bomLineKey: '' }], []);
  eq(out.patterns[0], { fabricPurpose: '', bomLineKey: 'L3' }, 'purpose → unset: sheet bound to the line, no purpose');
}

// ── 1d. a line that leaves others behind: the scope keeps its rows ─────────────────────────
{
  const patterns = [
    { name: 'a', fabricPurpose: MAIN, bomLineKey: '' },
    { name: 'b', fabricPurpose: '', bomLineKey: 'L1' },
  ];
  const out = plan(withPurpose('L1', POCKET), ['L1'], patterns, []);
  ck(clean(out), 'one of two MAIN lines → POCKETING: nothing held');
  eq(m.resolveSet(out.patterns, scopesOf(withPurpose('L1', POCKET))), [MAIN, MAIN], 'both sheets stay in MAIN (a line-bound one is pinned, not dragged along)');
}

// ── 2. merge into an existing scope: a block linked to another piece blocks the move ──────
{
  const next = withPurpose('L3', MAIN);
  eq(scopeOf(next, 'L3')?.lines.length, 3, 'merge target holds three lines');
  const aliases = [
    { fabricPurpose: POCKET, bomLineKey: 'L3', blockName: 'Front', pieceLineKey: 'p1' },
    { fabricPurpose: MAIN, bomLineKey: '', blockName: 'front', pieceLineKey: 'p2' },
  ];
  const out = plan(next, ['L3'], [{ fabricPurpose: POCKET, bomLineKey: 'L3' }], aliases);
  eq(out.clash.map((b) => b.toLowerCase()), ['front'], 'same block, other piece: clash names the block');

  const same = aliases.map((a) => ({ ...a, pieceLineKey: 'p1' }));
  const ok = plan(next, ['L3'], [], same);
  ck(clean(ok), 'same block, same piece: merges');
  eq(ok.aliases[0], { ...same[0], fabricPurpose: MAIN, bomLineKey: '' }, 'merged link: purpose, no line (three lines)');

  // An old clash inside MAIN is not this move's doing.
  const old = [
    { fabricPurpose: MAIN, bomLineKey: '', blockName: 'x', pieceLineKey: 'p2' },
    { fabricPurpose: MAIN, bomLineKey: '', blockName: 'x', pieceLineKey: 'p3' },
    { fabricPurpose: POCKET, bomLineKey: 'L3', blockName: 'y', pieceLineKey: 'p4' },
  ];
  ck(clean(plan(next, ['L3'], [], old)), 'an untouched old clash does not block');
  eq([plan(next, ['L3'], [], []).sheets, plan(next, ['L3'], [], []).links], [0, 0], 'nothing bound: nothing written');
}

// ── 3. moveSheet: one sheet, plus the links only its DXF still needs ──────────────────────
{
  const S1 = { name: 'SS26-011 pocketing', fabricPurpose: MAIN, bomLineKey: '' };
  const S2 = { name: 'SS26-011 main', fabricPurpose: MAIN, bomLineKey: '' };
  const S3 = { name: 'old', fabricPurpose: '', bomLineKey: 'gone' };
  const patterns = [S1, S2, S3];
  const blocks = [
    new Set(['front', 'back', 'pocket bag']),
    new Set(['front', 'sleeve']),
    new Set(['z']),
  ];
  const aliases = [
    { fabricPurpose: MAIN, bomLineKey: '', blockName: 'Front', pieceLineKey: 'p1' },
    { fabricPurpose: MAIN, bomLineKey: '', blockName: 'back', pieceLineKey: 'p2' },
    { fabricPurpose: MAIN, bomLineKey: '', blockName: ' Pocket  Bag ', pieceLineKey: 'p3' },
    { fabricPurpose: MAIN, bomLineKey: '', blockName: 'sleeve', pieceLineKey: 'p4' },
    { fabricPurpose: POCKET, bomLineKey: 'L3', blockName: 'facing', pieceLineKey: 'p5' },
  ];
  const to = BEFORE.find((s) => s.key === POCKET);
  const out = m.moveSheet({ patterns, aliases, scopes: BEFORE, sheet: 0, to, blocksOf: (_r, i) => blocks[i] });
  eq(out.kind, 'moved', 'MAIN → POCKETING: moved');
  eq(out.patterns?.[0], { ...S1, fabricPurpose: POCKET, bomLineKey: 'L3' }, 'the sheet takes POCKETING (one line → its key)');
  eq(out.patterns?.slice(1), [S2, S3], 'the other sheets stay');
  eq(out.aliases?.map((a) => a.fabricPurpose), [MAIN, POCKET, POCKET, MAIN, POCKET], 'back + pocket bag go; front (held by S2) and sleeve stay');
  eq([out.sheets, out.links], [1, 2], 'counts');

  eq(
    m.moveSheet({ patterns, aliases, scopes: BEFORE, sheet: 0, to, blocksOf: (_r, i) => (i === 0 ? null : blocks[i]) }).kind,
    'pending',
    'own blocks not read yet: pending',
  );
  const held = m.moveSheet({ patterns, aliases, scopes: BEFORE, sheet: 0, to, blocksOf: (_r, i) => (i === 1 ? null : blocks[i]) });
  eq([held.kind, held.links], ['moved', 0], 'a sibling with unknown blocks holds every link');

  const clash = m.moveSheet({
    patterns,
    aliases: [...aliases, { fabricPurpose: POCKET, bomLineKey: 'L3', blockName: 'BACK', pieceLineKey: 'p9' }],
    scopes: BEFORE,
    sheet: 0,
    to,
    blocksOf: (_r, i) => blocks[i],
  });
  eq([clash.kind, clash.blocks?.map((b) => b.toLowerCase())], ['clash', ['back']], 'target links the block to another piece: clash');

  const mainScope = BEFORE.find((s) => s.key === MAIN);
  eq(m.moveSheet({ patterns, aliases, scopes: BEFORE, sheet: 0, to: mainScope, blocksOf: () => null }).kind, 'noop', 'onto its own scope: noop');

  const orphan = m.moveSheet({
    patterns,
    aliases,
    scopes: BEFORE,
    sheet: 2,
    to: mainScope,
    blocksOf: () => {
      throw new Error('an orphan has no links to read');
    },
  });
  eq([orphan.kind, orphan.links], ['moved', 0], 'a sheet bound to nothing live just binds');
  eq(orphan.patterns?.[2], { ...S3, fabricPurpose: MAIN, bomLineKey: '' }, 'orphan → MAIN (two lines: no line key)');
}

// ── 4. scopeImpact ───────────────────────────────────────────────────────────────────────────
{
  const mainScope = BEFORE.find((s) => s.key === MAIN);
  const patterns = [
    { name: 'a', fabricPurpose: MAIN, bomLineKey: '' },
    { name: 'b', fabricPurpose: '', bomLineKey: 'L1' },
    { name: 'c', fabricPurpose: POCKET, bomLineKey: 'L3' },
    { name: 'd', fabricPurpose: '', bomLineKey: 'gone' },
  ];
  const aliases = [{ fabricPurpose: MAIN, bomLineKey: '', blockName: 'x', pieceLineKey: 'p' }];
  const markers = [{ name: 'm1', bomLineKey: 'L2' }, { name: 'm2', bomLineKey: 'L3' }];
  const imp = m.scopeImpact(mainScope, { patterns, aliases, markers, scopes: BEFORE });
  eq(imp.sheets.map((s) => s.name), ['a', 'b'], 'scopeImpact: purpose-bound and line-bound sheets');
  eq(imp.aliases.length, 1, 'scopeImpact: its links');
  eq(imp.markers.map((x) => x.name), ['m1'], 'scopeImpact: markers of its lines');
  const contrast = { key: CONTRAST, byPurpose: true, lines: [] };
  ck(m.impactEmpty(m.scopeImpact(contrast, { patterns, aliases, markers, scopes: BEFORE })), 'scopeImpact: unused scope is empty');
}

// ── 5. lineExitImpact: what keeps a line in the cloth ─────────────────────────────────────
{
  const L = lines(ITEMS);
  const patterns = [
    { name: 'a', fabricPurpose: MAIN, bomLineKey: '' },
    { name: 'b', fabricPurpose: '', bomLineKey: 'L1' },
    { name: 'c', fabricPurpose: POCKET, bomLineKey: 'L3' },
  ];
  const aliases = [{ fabricPurpose: POCKET, bomLineKey: 'L3', blockName: 'x', pieceLineKey: 'p' }];
  const markers = [{ name: 'm1', bomLineKey: 'L1' }, { name: 'm3', bomLineKey: 'L3' }];
  const nonLast = m.lineExitImpact('L1', { lines: L, patterns, aliases, markers });
  ck(m.impactEmpty(nonLast), 'non-last line: its scope keeps every sheet and marker');
  const kept = m.planLineChange({ patterns, aliases, before: L, after: L.filter((l) => l.lineKey !== 'L1'), lines: ['L1'] });
  eq(kept.patterns[1], { name: 'b', fabricPurpose: MAIN, bomLineKey: 'L2' }, 'non-last line: a sheet bound to it rebinds to its purpose');
  const last = m.lineExitImpact('L3', { lines: L, patterns, aliases, markers });
  eq([last.sheets.map((s) => s.name), last.aliases.length, last.markers.map((x) => x.name)], [['c'], 1, ['m3']], 'last line: the whole scope holds it');
  ck(m.impactEmpty(m.lineExitImpact('L2', { lines: L, patterns, aliases, markers })), 'a free line: nothing holds it');
  ck(m.impactEmpty(m.lineExitImpact('T1', { lines: L, patterns, aliases, markers })), 'not cloth: nothing holds it');
}

// ── 6. a deleted line's key comes off rows whose purpose stays live ──────────────────────
{
  const rows = [
    { fabricPurpose: MAIN, bomLineKey: 'L1' },
    { fabricPurpose: POCKET, bomLineKey: 'L3' },
  ];
  const drop = (items, key) => m.planLineChange({
    patterns: rows, aliases: [], before: lines(items), after: lines(items.filter((b) => b.lineKey !== key)), lines: [key],
  });
  eq(drop(ITEMS, 'L1').patterns[0], { fabricPurpose: MAIN, bomLineKey: 'L2' }, 'MAIN keeps one line: its key replaces the gone one');
  const two = [...ITEMS, { lineKey: 'L5', section: FABRIC, purpose: MAIN, name: '' }];
  eq(drop(two, 'L1').patterns[0], { fabricPurpose: MAIN, bomLineKey: '' }, 'MAIN keeps two lines: no key');
  const dies = drop(ITEMS, 'L3');
  eq([dies.patterns[1], dies.stranded.sheets], [rows[1], [1]], 'a purpose that dies is not released: it strands (the hold blocks it)');
}

// ── 7. aliasCollisions on its own ─────────────────────────────────────────────────────────
{
  const aliases = [
    { fabricPurpose: MAIN, blockName: 'A', pieceLineKey: 'p1' },
    { fabricPurpose: MAIN, blockName: 'a ', pieceLineKey: 'p2' },
    { fabricPurpose: POCKET, blockName: 'a', pieceLineKey: 'p3' },
  ];
  eq(m.aliasCollisions(aliases, new Set([1])), ['A'], 'one stored scope, one block, two pieces');
  eq(m.aliasCollisions(aliases, new Set([2])), [], 'another scope: no clash');
  eq(m.blockKey('  Pocket   Bag '), 'pocket bag', 'blockKey: case and inner spaces do not count');
}

// ── 8. the fusing rebuild's generated sheets: never hold, leave with their line ──────────────
// A fake react-hook-form: getValues/setValue over dotted paths, the way the editors call them.
const fakeForm = (values) => {
  const v = structuredClone(values);
  const getValues = (path) => (path ? path.split('.').reduce((o, k) => o?.[k], v) : v);
  const setValue = (path, value) => {
    const ks = path.split('.');
    const last = ks.pop();
    ks.reduce((o, k) => o[k], v)[last] = value;
  };
  return { v, getValues, setValue };
};
const FUSE = 'TECH_CARD_BOM_SECTION_INTERLINING';
const FUSING = P('INTERFACING');
const OTHER = P('OTHER');
const GEN = 'Fusing · generated · ';
const F1 = { lineKey: 'F1', section: FUSE, purpose: FUSING, name: 'fusing' };
const F2 = { lineKey: 'F2', section: FUSE, purpose: FUSING, name: 'fusing 2' };
{
  const items = [...ITEMS, F1];
  const values = {
    bomItems: items,
    patterns: [
      { name: 'main sheet', fabricPurpose: MAIN, bomLineKey: '' },
      { name: `${GEN}F1`, fabricPurpose: '', bomLineKey: 'F1' },
    ],
    pieceDxfAliases: [
      { fabricPurpose: MAIN, bomLineKey: '', blockName: 'front', pieceLineKey: 'p1' },
      { fabricPurpose: '', bomLineKey: 'F1', blockName: 'front', pieceLineKey: 'p1' },
    ],
  };
  const f = fakeForm(values);
  ck(m.impactEmpty(m.lineExitHold(f.getValues, 'F1')), 'generated sheet and its links never hold their line');
  const own = m.scopeImpact(m.scopeOfLine(scopesOf(items), 'F1'), {
    patterns: values.patterns, aliases: values.pieceDxfAliases, scopes: scopesOf(items),
  });
  ck(m.impactEmpty(m.withoutGenerated(own)), 'withoutGenerated: the slot of a generated sheet is free to go');
  const rest = items.filter((b) => b.lineKey !== 'F1');
  m.releaseLineBindings(f.getValues, f.setValue, 'F1', rest);
  eq(f.v.patterns.map((p) => p.name), ['main sheet'], 'line deleted: its generated sheet goes in the same change');
  eq(f.v.pieceDxfAliases.map((a) => a.fabricPurpose), [MAIN], 'line deleted: the links of that sheet go with it');

  // A user sheet in the same slot still holds — the generated one does not hide it.
  const g = fakeForm({ ...values, patterns: [...values.patterns, { name: 'own fuse', fabricPurpose: '', bomLineKey: 'F1' }] });
  eq(m.lineExitHold(g.getValues, 'F1').sheets.map((s) => s.name), ['own fuse'], 'a user sheet beside it still holds, named alone');

  // Leaving the cloth (section change) strands the same way.
  const h = fakeForm(values);
  const outH = m.changeLineSection(h.getValues, h.setValue, items.length - 1, TRIM);
  eq([outH.kind, h.v.patterns.length, h.v.bomItems.at(-1).section], ['done', 1, TRIM], 'section out of the cloth: generated sheet dropped, section written');
  // An unbound legacy sheet is not "stranded" by any change.
  const o = fakeForm({ ...values, patterns: [...values.patterns, { name: `${GEN}old`, fabricPurpose: '', bomLineKey: '' }] });
  m.releaseLineBindings(o.getValues, o.setValue, 'F1', rest);
  eq(o.v.patterns.map((p) => p.name), ['main sheet', `${GEN}old`], 'unbound legacy sheet left alone');
}

// ── 9. interlining (L11): every interlining line is its own scope ──────────────────────────
{
  const two = [...ITEMS, F1, F2];
  eq(scopesOf(two).map((s) => s.key), [MAIN, POCKET, 'L4', 'F1', 'F2'], 'two interlining lines, one purpose: two scopes, no purpose group');

  // Purpose change on an interlining line: its scope stays; legacy purpose-only rows are pinned.
  const one = [...ITEMS, F1];
  const legacySheet = { name: 'collar fuse', fabricPurpose: FUSING, bomLineKey: '' };
  const legacyLink = { fabricPurpose: FUSING, bomLineKey: '', blockName: 'collar', pieceLineKey: 'p7' };
  eq(m.resolveSet([legacySheet], scopesOf(one)), ['F1'], 'legacy purpose-only sheet reads as its sole interlining carrier');
  const toOther = one.map((b) => (b.lineKey === 'F1' ? { ...b, purpose: OTHER } : b));
  const pp = m.planLineChange({ patterns: [legacySheet], aliases: [legacyLink], before: lines(one), after: lines(toOther), lines: ['F1'] });
  ck(clean(pp), 'interlining purpose change: nothing held');
  eq([pp.patterns[0], pp.aliases[0]], [{ ...legacySheet, fabricPurpose: '', bomLineKey: 'F1' }, { ...legacyLink, fabricPurpose: '', bomLineKey: 'F1' }], 'its legacy rows are pinned to the line');
  eq([m.resolveSet(pp.patterns, scopesOf(toOther)), m.resolveSet(pp.aliases, scopesOf(toOther))], [['F1'], ['F1']], 'and still read as the line');
  const bound = m.planLineChange({ patterns: [{ fabricPurpose: '', bomLineKey: 'F1' }], aliases: [], before: lines(one), after: lines(toOther), lines: ['F1'] });
  eq([bound.sheets, bound.patterns[0]], [0, { fabricPurpose: '', bomLineKey: 'F1' }], 'a line-bound row is not rewritten');
  // The same through the BOM select.
  const ff = fakeForm({ bomItems: one, patterns: [legacySheet], pieceDxfAliases: [legacyLink] });
  const outP = m.changeLinePurpose(ff.getValues, ff.setValue, one.length - 1, OTHER);
  eq([outP.kind, ff.v.bomItems.at(-1).purpose, ff.v.patterns[0].bomLineKey, ff.v.pieceDxfAliases[0].bomLineKey], ['done', OTHER, 'F1', 'F1'], 'BOM select: purpose written, legacy rows pinned');

  // Deleting one of two same-purpose interlining lines: no silent shift onto the other.
  const preL11 = { name: 'own fuse', fabricPurpose: FUSING, bomLineKey: 'F1' };
  const restF2 = two.filter((b) => b.lineKey !== 'F1');
  eq(m.resolveSet([preL11], scopesOf(restF2)), ['F2'], 'trap: unwritten, a pre-L11 F1 row would read as F2 once F1 is gone');
  const del = m.planLineChange({ patterns: [preL11], aliases: [], before: lines(two), after: lines(restF2), lines: ['F1'] });
  eq([del.stranded.sheets, del.patterns[0]], [[0], preL11], 'the writer strands it instead (held, nothing written)');
  const dv = {
    bomItems: two,
    patterns: [preL11, { name: `${GEN}F1`, fabricPurpose: '', bomLineKey: 'F1' }, { name: `${GEN}F2`, fabricPurpose: '', bomLineKey: 'F2' }],
    pieceDxfAliases: [
      { fabricPurpose: '', bomLineKey: 'F1', blockName: 'front', pieceLineKey: 'p1' },
      { fabricPurpose: '', bomLineKey: 'F2', blockName: 'front', pieceLineKey: 'p1' },
    ],
  };
  const d1 = fakeForm(dv);
  eq(m.lineExitHold(d1.getValues, 'F1').sheets.map((s) => s.name), ['own fuse'], 'F1 delete: the user sheet holds');
  const d2 = fakeForm({ ...dv, patterns: dv.patterns.slice(1) });
  m.releaseLineBindings(d2.getValues, d2.setValue, 'F1', restF2);
  eq([d2.v.patterns.map((p) => p.name), d2.v.pieceDxfAliases.map((a) => a.bomLineKey)], [[`${GEN}F2`], ['F2']], 'F1 delete: its generated sheet + links go, F2\'s stay');

  // A legacy row whose carrier count changes (a fabric line takes the purpose) stays pinned.
  const gain = one.map((b) => (b.lineKey === 'L4' ? { ...b, purpose: FUSING } : b));
  eq(m.resolveSet([legacySheet], scopesOf(gain)), [FUSING], 'trap: unwritten, it would read as the fabric group');
  const cg = m.planLineChange({
    patterns: [legacySheet, { name: 'loose', fabricPurpose: '', bomLineKey: 'L4' }], aliases: [], before: lines(one), after: lines(gain), lines: ['L4'],
  });
  eq(m.resolveSet(cg.patterns, scopesOf(gain)), ['F1', FUSING], 'pinned to F1; the line\'s own sheet follows it');

  // Section change between INTERLINING and FABRIC, the only line of its scope: the rows follow.
  const toFabric = one.map((b) => (b.lineKey === 'F1' ? { ...b, section: FABRIC } : b));
  const sf = m.planLineChange({
    patterns: [{ fabricPurpose: '', bomLineKey: 'F1' }], aliases: [], before: lines(one), after: lines(toFabric), lines: ['F1'],
  });
  eq([sf.patterns[0], m.resolveSet(sf.patterns, scopesOf(toFabric))], [{ fabricPurpose: FUSING, bomLineKey: 'F1' }, [FUSING]], 'INTERLINING → FABRIC: the sheet follows into the purpose group');
  const toFuse = ITEMS.map((b) => (b.lineKey === 'L3' ? { ...b, section: FUSE } : b));
  const fs = plan(toFuse, ['L3'], [{ fabricPurpose: POCKET, bomLineKey: '' }], []);
  eq([fs.patterns[0], m.resolveSet(fs.patterns, scopesOf(toFuse))], [{ fabricPurpose: '', bomLineKey: 'L3' }, ['L3']], 'FABRIC → INTERLINING: the sheet follows onto the line');

  // Merge clash: an interlining line moved into MAIN brings a block another piece holds there.
  const mv = {
    bomItems: one.map((b) => (b.lineKey === 'F1' ? { ...b, purpose: MAIN } : b)),
    patterns: [],
    pieceDxfAliases: [
      { fabricPurpose: MAIN, bomLineKey: '', blockName: 'front', pieceLineKey: 'p1' },
      { fabricPurpose: '', bomLineKey: 'F1', blockName: 'Front', pieceLineKey: 'p9' },
    ],
  };
  const cf = fakeForm(mv);
  const outC = m.changeLineSection(cf.getValues, cf.setValue, one.length - 1, FABRIC);
  eq([outC.kind, (outC.blocks ?? []).map((b) => b.toLowerCase()), cf.v.bomItems.at(-1).section, cf.v.pieceDxfAliases[1].bomLineKey], ['clash', ['front'], FUSE, 'F1'], 'merge clash: refused, nothing written');

  // moveSheet into an interlining scope that holds only legacy rows: they are pinned, not hidden.
  const sc = scopesOf(one);
  const mainSheet = { name: 'shell', fabricPurpose: MAIN, bomLineKey: '' };
  const ms = m.moveSheet({
    patterns: [mainSheet, legacySheet],
    aliases: [{ fabricPurpose: MAIN, bomLineKey: '', blockName: 'front', pieceLineKey: 'p2' }, legacyLink],
    scopes: sc,
    sheet: 0,
    to: m.scopeOfLine(sc, 'F1'),
    blocksOf: () => new Set(['front']),
  });
  eq(ms.kind, 'moved', 'onto the interlining line: moved');
  eq([m.resolveSet(ms.patterns ?? [], sc), m.resolveSet(ms.aliases ?? [], sc)], [['F1', 'F1'], ['F1', 'F1']], 'the legacy sheet and link stay read as the line');
  eq([ms.patterns?.[1].bomLineKey, ms.aliases?.[1].bomLineKey], ['F1', 'F1'], 'they are written to the line');
}

console.log(bad === 0 ? '\nscope-move: all ok' : `\nscope-move: ${bad} FAIL`);
process.exit(bad === 0 ? 0 : 1);
