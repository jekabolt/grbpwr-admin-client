#!/usr/bin/env node
// GARMENT MANIFEST (95-GARMENT-TAXONOMY §3.3) — the client half of the anti-drift pair; the backend
// half is TestGarmentManifest. Both pin the same sha256 (scripts/sync-garment-manifest.sh rewrites
// the two constants), both assert the same invariants and run the same shared `vectors` through
// their own resolver. On top, the geometry coverage only the client has: every family draws all
// four views, and a DRAWN family has exactly one mark per manifest part token (same view, zone).
// A family still drawn as its `base` is a warning; GARMENT_STRICT=1 (or the end of wave §4.2,
// when none is left) makes it a failure.
//
//   node scripts/garment-manifest-probe.mjs

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// sync-garment-manifest.sh rewrites this line
const GARMENT_MANIFEST_SHA256 = '01442db110eed6bfb711d6460e7ac1c5dc2a535b0cd6b794e2a3bfbd2e200697';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const manifestPath = resolve(
  root,
  'src/components/managers/tech-card/components/design/garment-manifest.json',
);
const outfile = resolve(tmpdir(), `garment-manifest-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(here, 'garment-manifest-probe-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'error',
  absWorkingDir: root,
  jsx: 'automatic',
  alias: Object.fromEntries(
    [
      'components',
      'lib',
      'api',
      'utils',
      'ui',
      'constants',
      'store',
      'hooks',
      'context',
      'types',
      'styles',
    ].map((name) => [name, resolve(root, 'src', name)]),
  ),
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
});
let mod;
try {
  mod = await import(pathToFileURL(outfile).href);
} finally {
  rmSync(outfile, { force: true });
}
const {
  GARMENT_MANIFEST: m,
  FAMILIES,
  GARMENT_FAMILIES,
  GARMENT_SHAPES,
  GARMENT_PARTS,
  UNDRAWN_FAMILIES,
  familyFor,
  partsOf,
  baseOf,
} = mod;

let checks = 0;
const failed = [];
const warnings = [];
const ok = (name, cond) => {
  checks++;
  if (!cond) failed.push(name);
};

// sha — a copy edited by hand or not re-synced fails here and in the backend test
const sha = createHash('sha256').update(readFileSync(manifestPath)).digest('hex');
ok(
  `sha256 ${sha} = GARMENT_MANIFEST_SHA256 (run scripts/sync-garment-manifest.sh)`,
  sha === GARMENT_MANIFEST_SHA256,
);

// invariants (same list as TestGarmentManifest)
const groups = new Set(m.groups);
const traits = new Set(Object.keys(m.traits));
const labels = new Set(Object.keys(m.part_labels));
const keyRe = /^[a-z0-9_]{1,16}$/;
for (const [key, f] of Object.entries(m.families)) {
  ok(`${key}: key matches ^[a-z0-9_]{1,16}$`, keyRe.test(key));
  ok(`${key}: group ${f.group} is a group`, groups.has(f.group));
  ok(
    `${key}: traits ⊆ traits`,
    f.traits.every((t) => traits.has(t)),
  );
  ok(
    `${key}: base ${f.base} is '' or an existing family`,
    f.base === '' || m.families[f.base]?.status === 'existing',
  );
  ok(`${key}: status`, f.status === (f.base ? 'new' : 'existing'));
  const tokens = f.parts.split(/\s+/).filter(Boolean);
  ok(`${key}: first token is whole`, tokens[0]?.startsWith('whole:'));
  const seen = new Set();
  for (const t of tokens) {
    const [k, v = ''] = t.split(':');
    ok(`${key}: ${t} view ∈ f|b|s`, /^[fbs](\(z\))?$/.test(v));
    ok(`${key}: ${t} key ∈ part_labels`, labels.has(k));
    ok(`${key}: ${t} not repeated`, !seen.has(k));
    seen.add(k);
  }
}
for (const [path, fam] of Object.entries(m.categories))
  ok(`categories ${path} → ${fam} is a family`, fam in m.families);
for (const r of m.refinements) {
  for (const [from, to] of Object.entries(r.from_to)) {
    ok(`refinement ${r.id}: ${from} → ${to} are families`, from in m.families && to in m.families);
    ok(
      `refinement ${r.id}: ${from} → ${to} stays in its group`,
      m.families[from]?.group === m.families[to]?.group,
    );
  }
}
ok(
  'FAMILIES = manifest families, in order',
  JSON.stringify(FAMILIES) === JSON.stringify(Object.keys(m.families)),
);
ok('GARMENT_FAMILIES = FAMILIES', GARMENT_FAMILIES.length === FAMILIES.length);

// shared vectors — the backend runs the very same rows through designQuizFamily
for (const v of m.vectors) {
  const details = Object.entries(v.details ?? {}).map(([key, text]) => ({ key, text }));
  const got = familyFor({ top: v.top, sub: v.sub, type: v.type }, details);
  ok(`vector ${JSON.stringify(v)} → ${got}`, got === v.family);
}

// geometry coverage
const undrawn = new Set(UNDRAWN_FAMILIES);
for (const family of FAMILIES) {
  const shape = GARMENT_SHAPES[family];
  ok(`${family}: has a shape with body and side`, !!shape?.body && shape.side.length > 0);
  if (undrawn.has(family)) continue;
  const marks = GARMENT_PARTS[family] ?? {};
  const tokens = partsOf(family);
  const tokenKeys = new Set(tokens.map((p) => p.key));
  for (const p of tokens) {
    const mk = marks[p.key];
    ok(`${family}: part ${p.key} has a mark`, !!mk);
    if (!mk) continue;
    ok(`${family}: ${p.key} mark view ${mk.view} = ${p.view}`, mk.view === p.view);
    ok(`${family}: ${p.key} zone ${!!mk.zone} = ${p.zone}`, !!mk.zone === p.zone);
    ok(
      `${family}: ${p.key} mark has paths`,
      mk.d.length > 0 && mk.d.every((d) => typeof d === 'string' && d),
    );
  }
  for (const k of Object.keys(marks))
    ok(`${family}: mark ${k} is a manifest part`, tokenKeys.has(k));
}
const strict = process.env.GARMENT_STRICT === '1';
if (undrawn.size) {
  const line = `${undrawn.size} famil${undrawn.size === 1 ? 'y' : 'ies'} still drawn as base: ${[...undrawn].map((f) => `${f}←${baseOf(f)}`).join(' ')}`;
  if (strict) failed.push(line);
  else warnings.push(line);
}

for (const w of warnings) console.warn(`warn  ${w}`);
if (failed.length) {
  console.error(`FAIL ${failed.length}/${checks}`);
  for (const f of failed) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `ok ${checks} checks · ${FAMILIES.length} families · ${FAMILIES.length - undrawn.size} drawn · ${m.vectors.length} vectors · sha ${sha.slice(0, 12)}`,
);
