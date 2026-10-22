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

// ── 1. moveScope: the only line of its scope carries its sheets and links ──────────────────
{
  const next = withPurpose('L3', LINING);
  const to = scopeOf(next, 'L3');
  const patterns = [
    { name: 'pocket', fabricPurpose: POCKET, bomLineKey: 'L3' },
    { name: 'shell', fabricPurpose: MAIN, bomLineKey: '' },
  ];
  const aliases = [
    { fabricPurpose: POCKET, bomLineKey: 'L3', blockName: 'pocket bag', pieceLineKey: 'p1' },
    { fabricPurpose: MAIN, bomLineKey: '', blockName: 'front', pieceLineKey: 'p2' },
  ];
  const out = m.moveScope({ patterns, aliases, scopes: BEFORE, from: POCKET, to });
  eq(out.kind, 'moved', 'only line → new purpose: moved');
  eq(out.patterns?.[0], { name: 'pocket', fabricPurpose: LINING, bomLineKey: 'L3' }, 'its sheet takes the new purpose + its line');
  eq(out.patterns?.[1], patterns[1], 'another scope\'s sheet stays');
  eq(out.aliases?.[0].fabricPurpose, LINING, 'its piece link moves too');
  eq(out.aliases?.[1], aliases[1], 'another scope\'s link stays');
  eq([out.sheets, out.links], [1, 1], 'counts');
}

// ── 1b. card-11 path: an unsorted line gets a purpose, its line-bound sheet follows ────────
{
  const next = withPurpose('L4', CONTRAST);
  const to = scopeOf(next, 'L4');
  const patterns = [{ name: 'c', fabricPurpose: '', bomLineKey: 'L4' }];
  const out = m.moveScope({ patterns, aliases: [], scopes: BEFORE, from: 'L4', to });
  eq(out.patterns?.[0], { name: 'c', fabricPurpose: CONTRAST, bomLineKey: 'L4' }, 'unsorted → purpose: sheet bound to the purpose + line');
}

// ── 1c. purpose → unset: the line's own scope again ─────────────────────────────────────────
{
  const next = withPurpose('L3', UNSET);
  const to = scopeOf(next, 'L3');
  const out = m.moveScope({
    patterns: [{ fabricPurpose: POCKET, bomLineKey: '' }],
    aliases: [],
    scopes: BEFORE,
    from: POCKET,
    to,
  });
  eq(out.patterns?.[0], { fabricPurpose: '', bomLineKey: 'L3' }, 'purpose → unset: sheet bound to the line, no purpose');
}

// ── 2. merge into an existing scope: a block linked to another piece blocks the move ──────
{
  const next = withPurpose('L3', MAIN);
  const to = scopeOf(next, 'L3');
  eq(to?.lines.length, 3, 'merge target holds three lines');
  const aliases = [
    { fabricPurpose: POCKET, bomLineKey: 'L3', blockName: 'Front', pieceLineKey: 'p1' },
    { fabricPurpose: MAIN, bomLineKey: '', blockName: 'front', pieceLineKey: 'p2' },
  ];
  const out = m.moveScope({ patterns: [{ fabricPurpose: POCKET, bomLineKey: 'L3' }], aliases, scopes: BEFORE, from: POCKET, to });
  eq(out.kind, 'clash', 'same block, other piece: clash');
  eq((out.blocks ?? []).map((b) => b.toLowerCase()), ['front'], 'clash names the block');

  const same = aliases.map((a) => ({ ...a, pieceLineKey: 'p1' }));
  const ok = m.moveScope({ patterns: [], aliases: same, scopes: BEFORE, from: POCKET, to });
  eq(ok.kind, 'moved', 'same block, same piece: merges');
  eq(ok.aliases?.[0], { ...same[0], fabricPurpose: MAIN, bomLineKey: '' }, 'merged link: purpose, no line (three lines)');

  // An old clash inside MAIN is not this move's doing.
  const old = [
    { fabricPurpose: MAIN, bomLineKey: '', blockName: 'x', pieceLineKey: 'p2' },
    { fabricPurpose: MAIN, bomLineKey: '', blockName: 'x', pieceLineKey: 'p3' },
    { fabricPurpose: POCKET, bomLineKey: 'L3', blockName: 'y', pieceLineKey: 'p4' },
  ];
  eq(m.moveScope({ patterns: [], aliases: old, scopes: BEFORE, from: POCKET, to }).kind, 'moved', 'an untouched old clash does not block');
  eq(m.moveScope({ patterns: [], aliases: [], scopes: BEFORE, from: POCKET, to }).kind, 'noop', 'nothing bound: noop');
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
  eq(nonLast.sheets.map((s) => s.name), ['b'], 'non-last line: only a sheet bound to that very line strands');
  eq(nonLast.markers, [], 'non-last line: its purpose still holds the markers');
  const last = m.lineExitImpact('L3', { lines: L, patterns, aliases, markers });
  eq([last.sheets.map((s) => s.name), last.aliases.length, last.markers.map((x) => x.name)], [['c'], 1, ['m3']], 'last line: the whole scope holds it');
  ck(m.impactEmpty(m.lineExitImpact('L2', { lines: L, patterns, aliases, markers })), 'a free line: nothing holds it');
  ck(m.impactEmpty(m.lineExitImpact('T1', { lines: L, patterns, aliases, markers })), 'not cloth: nothing holds it');
}

// ── 6. releaseLineKey: a deleted line\'s key comes off rows whose purpose stays live ─────
{
  const rows = [
    { fabricPurpose: MAIN, bomLineKey: 'L1' },
    { fabricPurpose: '', bomLineKey: 'L1' },
    { fabricPurpose: POCKET, bomLineKey: 'L3' },
  ];
  const rest = lines(ITEMS.filter((b) => b.lineKey !== 'L1'));
  eq(m.releaseLineKey(rows, 'L1', rest), [{ index: 0, bomLineKey: 'L2' }], 'MAIN keeps one line: its key replaces the gone one');
  const two = [...rest, { lineKey: 'L5', section: FABRIC, purpose: MAIN, name: '' }];
  eq(m.releaseLineKey(rows, 'L1', two), [{ index: 0, bomLineKey: '' }], 'MAIN keeps two lines: no key');
  eq(m.releaseLineKey(rows, 'L3', lines(ITEMS.filter((b) => b.lineKey !== 'L3'))), [], 'a purpose that dies is not released (the hold blocks it)');
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
{
  const FUSE = 'TECH_CARD_BOM_SECTION_INTERLINING';
  const FUSING = P('INTERFACING');
  const GEN = 'Fusing · generated · ';
  const items = [
    ...ITEMS,
    { lineKey: 'F1', section: FUSE, purpose: FUSING, name: 'fusing' },
  ];
  const values = {
    bomItems: items,
    patterns: [
      { name: 'main sheet', fabricPurpose: MAIN, bomLineKey: '' },
      { name: `${GEN}F1`, fabricPurpose: FUSING, bomLineKey: 'F1' },
    ],
    pieceDxfAliases: [
      { fabricPurpose: MAIN, bomLineKey: '', blockName: 'front', pieceLineKey: 'p1' },
      { fabricPurpose: FUSING, bomLineKey: 'F1', blockName: 'front', pieceLineKey: 'p1' },
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
  const g = fakeForm({ ...values, patterns: [...values.patterns, { name: 'own fuse', fabricPurpose: FUSING, bomLineKey: 'F1' }] });
  eq(m.lineExitHold(g.getValues, 'F1').sheets.map((s) => s.name), ['own fuse'], 'a user sheet beside it still holds, named alone');

  // Leaving the cloth (section change) strands the same way.
  const h = fakeForm(values);
  m.dropStrandedGenerated(h.getValues, h.setValue, items.map((b) => (b.lineKey === 'F1' ? { ...b, section: TRIM } : b)));
  eq(h.v.patterns.length, 1, 'section out of the cloth: generated sheet dropped');
  // A live slot keeps it.
  const k = fakeForm(values);
  m.dropStrandedGenerated(k.getValues, k.setValue, [...items, { lineKey: 'F2', section: FUSE, purpose: FUSING, name: 'fusing 2' }]);
  eq(k.v.patterns.length, 2, 'slot stays live: generated sheet kept');
  // A legacy sheet with no binding is not "stranded" by any change.
  const o = fakeForm({ ...values, patterns: [...values.patterns, { name: `${GEN}old`, fabricPurpose: '', bomLineKey: '' }] });
  m.dropStrandedGenerated(o.getValues, o.setValue, rest);
  eq(o.v.patterns.map((p) => p.name), ['main sheet', `${GEN}old`], 'unbound legacy sheet left alone');
}

console.log(bad === 0 ? '\nscope-move: all ok' : `\nscope-move: ${bad} FAIL`);
process.exit(bad === 0 ? 0 : 1);
