#!/usr/bin/env node
// yarn doll:check — the paper doll (lib/doll) on real patterns, rendered as SHADED WebGL in headless
// Chrome (SwiftShader), four views per file, plus the report in words and the gates of
// tmp/plans/assembly-3d-doll/01-DESIGN-L0.md §7 (P1):
//   every file: solves ≤ 3 s, 0 NaN, settles;
//   SS26-005: truth seams closed (gap ≤ 3 mm, strain ≤ 3 %), sleeves attached by proposed cap ↔ armhole,
//             stand on the neckline by a proposed seam;
//   NEGATIVE CONTROL: SS26-005 with its two side seams dropped must report them open (red), and the
//             gate set above must FAIL on it — a gate that does not move is not measuring anything.
//   COLLAR (04-COLLAR.md): on the shirts, the neck path is 30–55 % of the girth, every collar unit is
//             attached (gap p95 ≤ 3 mm), a stand / one-piece collar sews 0.90–1.15 of the path
//             between its marks, a fall hangs DOWN from the stand top and ≥ 95 % outside the stand,
//             no collar seam is open; a synthetic pullover keeps a CLOSED neck path (negative
//             control), a synthetic open front an OPEN one. Views: four + a collar close-up
//             (<id>-collar.png).
//
// Usage: yarn doll:check            (all files)
//        DOLL_FILES=ss26,card6 yarn doll:check
// Data:  SKELETON_PLANS=<dir with assembly-from-pattern/, pdf-to-dxf/, assembly-3d-doll/>, default
//        ../tmp/plans next to the repo. Output: $DOLL_OUT or tmp/plans/assembly-3d-doll/p2-doll/.

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { dollFiles } from './files.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const plans = process.env.SKELETON_PLANS ?? resolve(here, '../../../tmp/plans');
// L4 GOLD mode (DOLL_GOLD=1): the doll on the gold seam rows (scripts/doll/gold/<id>.seams.json),
// each file also without rows (<id>-none) side by side, plus the negative control ss26-wrong (one
// gold row deliberately re-pointed shoulder → armhole). Output: p4-gold/.
const GOLD = !!process.env.DOLL_GOLD;
const GOLD_IDS = ['ss26', 'card4', 'card6', 'card16', 'card11', 'card7'];
const out =
  process.env.DOLL_OUT ?? resolve(plans, `assembly-3d-doll/${GOLD ? 'p4-gold' : 'p2-doll'}`);
mkdirSync(out, { recursive: true });
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const ALL0 = dollFiles(plans);
const goldOf = (id) => resolve(here, 'gold', `${id}.seams.json`);
const ALL = GOLD
  ? GOLD_IDS.flatMap((id) => {
      const f = ALL0.find((x) => x.id === id);
      if (!f) return [];
      return [
        { ...f, gold: goldOf(id), label: `${f.label} — GOLD seam rows` },
        { ...f, id: `${id}-none`, label: `${f.label} — no rows (as before)` },
        ...(id === 'ss26'
          ? [
              {
                ...f,
                id: 'ss26-wrong',
                label: `${f.label} — NEGATIVE CONTROL: one gold row wrong (shoulder BP#13 ↔ front armhole FRONT_L#0)`,
                gold: goldOf(id),
                wrong: { a: 'BP#13', b: 'FRONT_L#1', to: 'FRONT_L#0' },
              },
            ]
          : []),
      ];
    })
  : ALL0;
const want = (process.env.DOLL_FILES ?? '').split(',').filter(Boolean);
const files = ALL.filter(
  (f) => f.dxf && existsSync(f.dxf) && (!want.length || want.includes(f.id)),
);
for (const f of ALL)
  if (!f.dxf || !existsSync(f.dxf)) console.log(`SKIPPED ${f.id}: DXF not found`);

const dist = mkdtempSync(resolve(tmpdir(), 'doll-check-'));
await Promise.all([
  build({
    entryPoints: [resolve(here, 'check-entry.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: resolve(dist, 'check.mjs'),
    logLevel: 'warning',
  }),
  build({
    entryPoints: [resolve(here, 'render-entry.ts')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    outfile: resolve(dist, 'render.js'),
    logLevel: 'warning',
  }),
]);
const specPath = resolve(dist, 'spec.json');
writeFileSync(
  specPath,
  JSON.stringify({
    files,
    plans,
    ...(process.env.DOLL_PASSES ? { maxPasses: Number(process.env.DOLL_PASSES) } : {}),
    ...(process.env.DOLL_NOOPS ? { noOps: true } : {}),
  }),
);
execFileSync(process.execPath, [resolve(dist, 'check.mjs'), specPath, out], { stdio: 'inherit' });

// ── screenshots ───────────────────────────────────────────────────────────────────────────
const renderJs = readFileSync(resolve(dist, 'render.js'), 'utf8');
const profile = mkdtempSync(resolve(tmpdir(), 'doll-chrome-'));
const shots = [];
for (const f of files) {
  const scene = readFileSync(resolve(out, `${f.id}.scene.json`), 'utf8');
  const html = resolve(out, `${f.id}.html`);
  writeFileSync(
    html,
    `<!doctype html><html><head><meta charset="utf-8"><title>doll ${f.id}</title><style>html,body{margin:0;background:#f4f4f2;overflow:hidden}</style></head><body><script>window.__DOLL__=${scene.replaceAll('<', '\\u003c')};</script><script>${renderJs}</script></body></html>`,
  );
  const views = (process.env.DOLL_VIEWS ?? 'all,collar')
    .split(',')
    .filter((v) => v && v !== 'none');
  for (const v of views) {
    const png = resolve(out, v === 'all' ? `${f.id}.png` : `${f.id}-${v}.png`);
    const size = v === 'all' ? '1600,1400' : v === 'collar' ? '1600,900' : '1000,1100';
    try {
      execFileSync(
        chrome,
        [
          '--headless=new',
          '--no-sandbox',
          '--hide-scrollbars',
          '--allow-file-access-from-files',
          '--use-angle=swiftshader',
          '--enable-unsafe-swiftshader',
          '--ignore-gpu-blocklist',
          '--run-all-compositor-stages-before-draw',
          '--virtual-time-budget=8000',
          `--window-size=${size}`,
          '--force-device-scale-factor=1',
          `--user-data-dir=${profile}`,
          `--screenshot=${png}`,
          `${pathToFileURL(html).href}?view=${v}`,
        ],
        { stdio: 'ignore', timeout: 90_000 },
      );
    } catch (e) {
      console.log(`screenshot FAILED for ${f.id}: ${e.message}`);
      continue;
    }
    if (existsSync(png) && statSync(png).size > 20_000) shots.push(png);
    else console.log(`screenshot too small / missing: ${png}`);
  }
}
rmSync(profile, { recursive: true, force: true });

// ── gates ─────────────────────────────────────────────────────────────────────────────────
const summary = JSON.parse(readFileSync(resolve(out, 'summary.json'), 'utf8'));
const txt = (id) =>
  existsSync(resolve(out, `${id}.txt`)) ? readFileSync(resolve(out, `${id}.txt`), 'utf8') : '';
let failed = 0;
const gate = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};
const ss26Gates = (id) => {
  const t = txt(id);
  const truth =
    /TRUTH tube \((\d+)\): closed (\d+) · proposed (\d+) \(wrong reading \(direction\) — mirror reading closed (\d+) of \d+\) · not closed (\d+); eased \d+ by design, (\d+) beyond ease \+ 2 %: residual p95 ([\d.]+) mm [^·]*· local strain max ([\d.]+) %/.exec(
      t,
    );
  const caps = (t.match(/\[proposed · doll\] (left|right) sleeve cap ↔ armhole/g) ?? []).length;
  const stand = /\[proposed · doll\] collar stand ↔ neckline/.test(t);
  const openSide =
    /\[open[^\]]*\] [^\n]*(FP_1_R|BP_2_R|BP_1_L|FP_2_L)[^\n]*(FP_1_R|BP_2_R|BP_1_L|FP_2_L)/.test(t);
  return {
    truthClosed:
      !!truth &&
      truth[5] === '0' &&
      truth[3] === truth[4] &&
      truth[6] === '0' &&
      Number(truth[7]) <= 3 &&
      Number(truth[8]) <= 3,
    truthDetail: truth
      ? `${truth[1]} truth seams: ${truth[2]} closed, ${truth[3]} proposed (wrong reading — mirror closed ${truth[4]}), ${truth[5]} not closed; gap p95 ${truth[7]} mm, strain max ${truth[8]} %, ${truth[6]} eased beyond ease`
      : 'no truth line',
    caps,
    stand,
    openSide,
  };
};
for (const s of summary) {
  gate(
    `${s.id}: solves ≤ 3 s`,
    s.ms <= 3000,
    `${Math.round(s.ms)} ms (+ graph ${Math.round(s.msGraph)} ms)`,
  );
  gate(`${s.id}: 0 NaN`, s.nan === 0);
  gate(`${s.id}: settles (travel p99 ≤ 1 mm per 20 passes)`, s.converged, `p99 ${s.travelP99} mm`);
  if (s.lacks > 0 && !GOLD && !s.id.endsWith('-shuf') && !s.id.endsWith('-neg'))
    gate(
      `${s.id}: declared joins the graph lacks — doll proposes ≥ 70 %`,
      s.proposed >= 0.7 * s.lacks,
      `${s.proposed} of ${s.lacks} (${Math.round((100 * s.proposed) / s.lacks)} %), ${s.fromOrderClosed}/${s.fromOrder} from the order closed`,
    );
}
if (GOLD) {
  goldGates();
  sideBySide();
  console.log(`\nscreenshots:\n${shots.map((s) => `  ${s}`).join('\n')}\nreports: ${out}/*.txt`);
  rmSync(dist, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
const real6 = summary.find((s) => s.id === 'card6');
const shuf6 = summary.find((s) => s.id === 'card6-shuf');
// The order must MEAN something: read with shuffled inputs, fewer of its declared parts end up
// joined (by the graph or a doll proposal) than with the technologist's own inputs. (Counted over
// parts, not only from-order proposals: a seam the graph finds itself — the yoke sandwiched between
// its plies — leaves the from-order count without being any less the order's.)
const share = (s) => (s.declaredParts ? s.joinedParts / s.declaredParts : 0);
if (real6 && shuf6)
  gate(
    'NEG card6-shuf: shuffled order inputs → fewer declared parts joined',
    share(shuf6) < share(real6),
    `real ${real6.joinedParts}/${real6.declaredParts} · shuffled ${shuf6.joinedParts}/${shuf6.declaredParts} · from-order closed: real ${real6.fromOrderClosed} of ${real6.fromOrder}, shuffled ${shuf6.fromOrderClosed} of ${shuf6.fromOrder}`,
  );
if (summary.some((s) => s.id === 'ss26')) {
  const g = ss26Gates('ss26');
  gate(
    'ss26: body tube truth seams closed (≤ 3 mm, ≤ 3 % strain; eased ≤ ease + 2 %)',
    g.truthClosed,
    g.truthDetail,
  );
  gate('ss26: both sleeves attached by proposed cap ↔ armhole', g.caps === 2, `${g.caps} of 2`);
  gate('ss26: stand on the neckline by a proposed seam', g.stand);
}
if (summary.some((s) => s.id === 'ss26-neg')) {
  const g = ss26Gates('ss26-neg');
  gate('NEG ss26-neg: the dropped side seams are reported open', g.openSide);
  gate(
    'NEG ss26-neg: the doll gate set FAILS without the side seams',
    !(g.truthClosed && g.caps === 2 && g.stand && !g.openSide),
    g.truthDetail,
  );
}
// ── collar gates (tmp/plans/assembly-3d-doll/04-COLLAR.md) ─────────────────────────────────
// Shirts with a collar: the neck path, every unit on it, every fall on the stand top. A unit not
// attached, or a gate the body makes impossible, FAILS with its number — never skipped.
const COLLAR_FILES = ['ss26', 'card4', 'card6', 'card9', 'card16', 'card4-graft', 'card4-graft6'];
const f1 = (x) => (x === null || x === undefined || Number.isNaN(x) ? 'n/a' : Number(x).toFixed(1));
for (const s of summary) {
  if (!COLLAR_FILES.includes(s.id)) continue;
  const C = s.collar;
  const units = C?.units ?? [];
  const r = C?.ratio ?? null;
  gate(
    `${s.id}: neck path 30–55 % of the girth`,
    r !== null && r >= 0.3 && r <= 0.55,
    C?.neckMm
      ? `${f1(C.neckMm)} mm ${C.neckClosed ? 'closed' : 'open'} / girth ${f1(C.chestMm)} mm = ${f1(100 * r)} %${C.neckOk ? '' : ' (K1 failed — fallback loop)'}`
      : 'no neck path',
  );
  gate(
    `${s.id}: a collar unit is attached`,
    units.some((u) => u.attached !== 'not sewn'),
    units.map((u) => `${u.role} ${u.keys}: ${u.attached}`).join(' · ') ||
      'no collar piece drawn as a collar',
  );
  for (const u of units) {
    const tag = `${s.id}: ${u.role} ${u.keys}`;
    gate(
      `${tag} attached, gap p95 ≤ 3 mm`,
      u.attached !== 'not sewn' && Number.isFinite(u.gapP95) && u.gapP95 <= 3,
      `${u.attached} · gap p95 ${f1(u.gapP95)} / max ${f1(u.gapMax)} mm`,
    );
    if (u.role !== 'fall')
      gate(
        `${tag} sewn length / neck path 0.90–1.15 (extensions excluded)`,
        u.ease >= 0.9 && u.ease <= 1.15,
        `${f1(u.sewnMm)} / ${f1(u.baseMm)} mm = ${u.ease.toFixed(3)} · extensions ${f1(u.extMm)} mm`,
      );
    if (u.role === 'collar' && u.outerY !== undefined && u.outerY !== null) {
      gate(
        `${tag} rolled over (outer edge below the roll line)`,
        u.outerY < u.baseY,
        `outer edge y ${f1(u.outerY)} vs roll line y ${f1(u.baseY)}`,
      );
      gate(
        `${tag} turned-down part ≥ 95 % outside its standing part`,
        u.outsidePct >= 95,
        `${f1(u.outsidePct)} %`,
      );
    }
    if (u.role === 'fall') {
      gate(
        `${tag} turned down (outer edge below the stand top)`,
        u.outerY < u.baseY,
        `outer edge y ${f1(u.outerY)} vs stand top y ${f1(u.baseY)}`,
      );
      gate(
        `${tag} ≥ 95 % outside the stand`,
        u.outsidePct >= 95,
        `${f1(u.outsidePct)} % of its free vertices`,
      );
    }
  }
  gate(
    `${s.id}: no open collar seam`,
    !(C?.openCollar ?? []).length,
    (C?.openCollar ?? []).join(', ') || '0',
  );
}
const ss = summary.find((s) => s.id === 'ss26');
if (ss) gate('ss26: still ≥ 19 closed graph seams', ss.closedGraph >= 19, `${ss.closedGraph}`);
// Negative control of K1 on synthetic boundaries (no pattern).
if (existsSync(resolve(out, 'neck-fixture.json'))) {
  const fx = JSON.parse(readFileSync(resolve(out, 'neck-fixture.json'), 'utf8'));
  gate(
    'NEG neck fixture: a pullover (no front opening) keeps a CLOSED neck path',
    fx.pullover.closed === true,
    fx.pullover.how,
  );
  gate(
    "neck fixture: an open front gives an OPEN path of the neckline's own length (±2 %)",
    fx.openFront.closed === false &&
      Math.abs(fx.openFront.lenMm / fx.openFront.expectMm - 1) <= 0.02,
    `${f1(fx.openFront.lenMm)} vs ${f1(fx.openFront.expectMm)} mm · ${fx.openFront.how}`,
  );
}
console.log(`\nscreenshots:\n${shots.map((s) => `  ${s}`).join('\n')}\nreports: ${out}/*.txt`);
rmSync(dist, { recursive: true, force: true });
process.exit(failed ? 1 : 0);

// ── L4 gold gates ────────────────────────────────────────────────────────────────────────────
function goldGates() {
  const f1 = (x) =>
    x === null || x === undefined || Number.isNaN(x) ? 'n/a' : Number(x).toFixed(1);
  const SHIRTS = ['ss26', 'card4', 'card6', 'card16'];
  const PANTS = ['card11', 'card7'];
  for (const s of summary) {
    const G = s.gold;
    if (!G || s.id === 'ss26-wrong') continue;
    gate(`${s.id} GOLD: zero open seams`, G.open.length === 0, G.open.join(', ') || '0');
    gate(
      `${s.id} GOLD: no contradiction`,
      G.contradictions.length === 0,
      G.contradictions.join(' | ') || '0',
    );
    if (SHIRTS.includes(s.id)) {
      const cl = G.closures;
      gate(
        `${s.id} GOLD: fronts closed at CF with overlap`,
        cl.length > 0 && cl.every((c) => c.ok),
        cl
          .map(
            (c) =>
              `${c.top} over ${c.under}: CF p95 ${f1(c.cfGapP95Mm)} mm, edges cross ${f1(c.overlapMm)} (exp ${f1(c.offTopMm + c.offUnderMm)}), outside ${f1(c.outsidePct)} %`,
          )
          .join(' · ') || 'no closure',
      );
      gate(
        `${s.id} GOLD: sleeves attached at both armholes`,
        G.sleeves.L.on && G.sleeves.R.on,
        `L ${G.sleeves.L.on} (${G.sleeves.L.words}) · R ${G.sleeves.R.on} (${G.sleeves.R.words})`,
      );
      const C = s.collar;
      const units = C?.units ?? [];
      const onNeck = units.filter((u) => u.base === 'neck path');
      gate(
        `${s.id} GOLD: unit on the neck path attached, gap p95 ≤ 3 mm, ease 0.90–1.15 after intake`,
        onNeck.length > 0 &&
          onNeck.every(
            (u) => u.attached !== 'not sewn' && u.gapP95 <= 3 && u.ease >= 0.9 && u.ease <= 1.15,
          ),
        `neck ${f1(C?.neckMm)} mm · ` +
          onNeck
            .map(
              (u) =>
                `${u.role} ${u.keys}: ${u.attached}, gap p95 ${f1(u.gapP95)} mm, ease ${f1(u.ease * 100)} %${u.folds?.length ? `, folded ${u.folds.join('+')} mm` : ''}`,
            )
            .join(' · '),
      );
      for (const u of units.filter((x) => x.role === 'fall' || x.role === 'collar'))
        gate(
          `${s.id} GOLD: ${u.role} ${u.keys} turned down (≥ 95 % outside)`,
          u.outerY < u.baseY && u.outsidePct >= 95,
          `outer y ${f1(u.outerY)} vs ${f1(u.baseY)} · ${f1(u.outsidePct)} % outside · gap p95 ${f1(u.gapP95)} mm (${u.attached})`,
        );
    }
    if (PANTS.includes(s.id)) {
      gate(`${s.id} GOLD: rise / crotch joined`, G.riseOk, G.rise.join(' · ') || 'no rise seam');
      gate(
        `${s.id} GOLD: waist closed, waistband ring on`,
        G.bandOk,
        G.band.join(' · ') || 'no waistband seam',
      );
    }
  }
  const w = summary.find((s) => s.id === 'ss26-wrong');
  if (w)
    gate(
      'NEG ss26-wrong: the deliberately wrong row is reported as a contradiction in words',
      (w.gold?.contradictions ?? []).some((c) => /BP#13|FRONT_L#0/.test(c)),
      (w.gold?.contradictions ?? []).join(' | ') || 'none reported',
    );
}

function sideBySide() {
  const prof = mkdtempSync(resolve(tmpdir(), 'doll-pair-'));
  for (const id of GOLD_IDS)
    for (const v of ['', '-collar']) {
      const a = resolve(out, `${id}${v}.png`);
      const b = resolve(out, `${id}-none${v}.png`);
      if (!existsSync(a) || !existsSync(b)) continue;
      const html = resolve(dist, `${id}${v}-pair.html`);
      writeFileSync(
        html,
        `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff;font:16px sans-serif;display:flex}div{flex:1;text-align:center}img{width:100%}</style></head><body><div><b>${id} — GOLD seam rows</b><br><img src="${pathToFileURL(a).href}"></div><div><b>${id} — no rows (as before)</b><br><img src="${pathToFileURL(b).href}"></div></body></html>`,
      );
      const png = resolve(out, `${id}${v}-vs-none.png`);
      try {
        execFileSync(
          chrome,
          [
            '--headless=new',
            '--no-sandbox',
            '--hide-scrollbars',
            '--allow-file-access-from-files',
            `--window-size=2400,${v ? 720 : 1080}`,
            '--force-device-scale-factor=1',
            `--user-data-dir=${prof}`,
            `--screenshot=${png}`,
            pathToFileURL(html).href,
          ],
          { stdio: 'ignore', timeout: 60_000 },
        );
        shots.push(png);
      } catch (e) {
        console.log(`pair screenshot failed ${id}${v}: ${e.message}`);
      }
    }
  rmSync(prof, { recursive: true, force: true });
}
