#!/usr/bin/env node
// ANSUR II vs the model-form mannequin (CPU only, single process, no browser).
//
//   nice -n 10 node scripts/anthropometry/ansur.mjs run \
//     --male <ANSUR_II_MALE_Public.csv> --female <ANSUR_II_FEMALE_Public.csv> \
//     --raw <runs.jsonl> [--per-sex N] [--seed S] [--limit N] [--subjects id,id]
//     [--shard i/n --skip <other.jsonl>]   # parallel workers resuming a run, one raw file each
//   node scripts/anthropometry/ansur.mjs summarize --male <csv> --female <csv> \
//     --raw <runs.jsonl>[,more.jsonl] --out <dir> [--notes <summary.txt>] [--wall "<text>"]
//                                         # writes results.csv, summary.json, report.md
//
// `run` appends one JSON line per subject x experiment x base and skips lines already present, so
// an interrupted run resumes. Experiments: A = core required set (prediction of everything else),
// B = full mappable set incl. depths and limbs (honouring). Bases: the subject's own sex base and
// the neutral base. Field mapping and its caveats are in CORE / FULL_EXTRA / TARGETS below.
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build } from '../probe-esbuild.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

function args() {
  const [command, ...rest] = process.argv.slice(2);
  const out = { command };
  for (let i = 0; i < rest.length; i += 1) {
    const key = rest[i].replace(/^--/, '');
    const value = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[(i += 1)] : 'true';
    out[key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Mapping ANSUR -> model-form wire fields (all mm). See report for the definition comparison.
// ---------------------------------------------------------------------------------------------
const CORE = {
  BODY_MEASUREMENT_NAME_HEIGHT: 'stature', // exact
  BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 'biacromialbreadth', // acromion-acromion; ANSUR sitting
  BODY_MEASUREMENT_NAME_CHEST: 'chestcircumference', // max horizontal at chest point
  BODY_MEASUREMENT_NAME_WAIST: 'waistcircumference', // ANSUR at omphalion, ours natural waist
  BODY_MEASUREMENT_NAME_HIP: 'buttockcircumference', // max buttock protrusion
  BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 'sleeveoutseam', // acromion -> stylion straight, same def
  BODY_MEASUREMENT_NAME_INSEAM: 'crotchheight', // floor -> crotch (engine does not apply inseam)
};
const FULL_EXTRA = {
  BODY_MEASUREMENT_NAME_CHEST_DEPTH: 'chestdepth',
  BODY_MEASUREMENT_NAME_WAIST_DEPTH: 'waistdepth', // omphalion level, consistent with waist input
  BODY_MEASUREMENT_NAME_HIP_DEPTH: 'buttockdepth',
  BODY_MEASUREMENT_NAME_NECK: 'neckcircumference', // ANSUR below Adam's apple, ours mid-neck
  BODY_MEASUREMENT_NAME_WRIST: 'wristcircumference',
  BODY_MEASUREMENT_NAME_THIGH: 'thighcircumference', // at gluteal furrow
  BODY_MEASUREMENT_NAME_CALF: 'calfcircumference',
  BODY_MEASUREMENT_NAME_ANKLE: 'anklecircumference',
};
// Not fed: BICEP (ANSUR flexed vs ours relaxed), KNEE / UNDER_BUST / HIGH_HIP (no ANSUR field),
// NECK_BASE and WAIST_HEIGHT (not shape inputs of the engine; compared as predictions only).

const EXPERIMENTS = {
  A: { ...CORE },
  B: { ...CORE, ...FULL_EXTRA },
};

/**
 * Body values compared with ANSUR. `wire` = the form field that feeds it (input in an experiment
 * when that field is fed), `key` = the engine's canonical key for its status, `fit`:
 *   comparable  — definitions match closely
 *   approx      — same idea, documented landmark/posture difference
 *   level       — measured at the mannequin's own level, ANSUR at a different one (stated rule)
 */
const TARGETS = [
  { id: 'stature', body: 'statureMm', ansur: (r) => r.stature, wire: 'BODY_MEASUREMENT_NAME_HEIGHT', key: 'heightMm', fit: 'comparable' },
  { id: 'chest girth (engine station)', body: 'chestCircEngineStationMm', ansur: (r) => r.chestcircumference, wire: 'BODY_MEASUREMENT_NAME_CHEST', key: 'chestCircumferenceMm', fit: 'comparable', note: 'horizontal loop at the runtime chest station (what the engine solves)' },
  { id: 'chest girth (guide line)', body: 'chestCircMm', ansur: (r) => r.chestcircumference, wire: 'BODY_MEASUREMENT_NAME_CHEST', key: 'chestCircumferenceMm', fit: 'comparable' },
  { id: 'waist girth', body: 'waistCircMm', ansur: (r) => r.waistcircumference, wire: 'BODY_MEASUREMENT_NAME_WAIST', key: 'waistCircumferenceMm', fit: 'level' },
  { id: 'hip girth', body: 'hipCircMm', ansur: (r) => r.buttockcircumference, wire: 'BODY_MEASUREMENT_NAME_HIP', key: 'hipCircumferenceMm', fit: 'comparable' },
  { id: 'shoulder breadth (engine vertices)', body: 'shoulderBreadthEngineMm', ansur: (r) => r.biacromialbreadth, wire: 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER', key: 'shoulderBreadthMm', fit: 'comparable', note: 'chord between the engine shoulder vertices (what the engine solves)' },
  { id: 'shoulder breadth (guide line)', body: 'shoulderBreadthMm', ansur: (r) => r.biacromialbreadth, wire: 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER', key: 'shoulderBreadthMm', fit: 'comparable' },
  { id: 'sleeve length', body: 'sleeveLengthMm', ansur: (r) => r.sleeveoutseam, wire: 'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH', key: 'armLengthMm', fit: 'comparable' },
  { id: 'chest depth', body: 'chestDepthMm', ansur: (r) => r.chestdepth, wire: 'BODY_MEASUREMENT_NAME_CHEST_DEPTH', key: 'chestDepthMm', fit: 'comparable' },
  { id: 'waist depth', body: 'waistDepthMm', ansur: (r) => r.waistdepth, wire: 'BODY_MEASUREMENT_NAME_WAIST_DEPTH', key: 'waistDepthMm', fit: 'level' },
  { id: 'buttock depth', body: 'hipDepthMm', ansur: (r) => r.buttockdepth, wire: 'BODY_MEASUREMENT_NAME_HIP_DEPTH', key: 'hipDepthMm', fit: 'comparable' },
  { id: 'neck girth', body: 'neckCircMm', ansur: (r) => r.neckcircumference, wire: 'BODY_MEASUREMENT_NAME_NECK', key: 'neckCircumferenceMm', fit: 'approx' },
  { id: 'wrist girth', body: 'wristCircMm', ansur: (r) => r.wristcircumference, wire: 'BODY_MEASUREMENT_NAME_WRIST', key: 'wristCircumferenceMm', fit: 'approx', note: 'engine limb station is a geometric rule, not the ANSUR landmark' },
  { id: 'thigh girth', body: 'thighCircMm', ansur: (r) => r.thighcircumference, wire: 'BODY_MEASUREMENT_NAME_THIGH', key: 'thighCircumferenceMm', fit: 'approx', note: 'engine limb station is a geometric rule, not the ANSUR landmark' },
  { id: 'calf girth', body: 'calfCircMm', ansur: (r) => r.calfcircumference, wire: 'BODY_MEASUREMENT_NAME_CALF', key: 'calfCircumferenceMm', fit: 'approx', note: 'engine limb station is a geometric rule, not the ANSUR landmark' },
  { id: 'ankle girth', body: 'ankleCircMm', ansur: (r) => r.anklecircumference, wire: 'BODY_MEASUREMENT_NAME_ANKLE', key: 'ankleCircumferenceMm', fit: 'approx', note: 'engine limb station is a geometric rule, not the ANSUR landmark' },
  // Never inputs (pure predictions in both experiments).
  { id: 'chest breadth', body: 'chestBreadthMm', ansur: (r) => r.chestbreadth, fit: 'approx' },
  { id: 'waist breadth', body: 'waistBreadthMm', ansur: (r) => r.waistbreadth, fit: 'level' },
  { id: 'hip breadth', body: 'hipBreadthMm', ansur: (r) => r.hipbreadth, fit: 'approx' },
  { id: 'cervicale height', body: 'cervicaleHeightMm', ansur: (r) => r.cervicaleheight, fit: 'comparable' },
  { id: 'acromial height', body: 'acromialHeightMm', ansur: (r) => r.acromialheight, fit: 'comparable' },
  { id: 'crotch height', body: 'crotchHeightMm', ansur: (r) => r.crotchheight, fit: 'comparable', note: 'fed as INSEAM, which the engine never applies' },
  { id: 'waist height (rule)', body: 'waistHeightMm', ansur: (r) => (r.tenthribheight + r.iliocristaleheight) / 2, fit: 'level', note: 'ANSUR natural waist approximated as midpoint of 10th rib and iliac crest heights' },
  { id: 'waist height vs omphalion', body: 'waistHeightMm', ansur: (r) => r.waistheightomphalion, fit: 'not comparable' },
  { id: 'neck base girth', body: 'neckBaseCircMm', ansur: (r) => r.neckcircumferencebase, fit: 'approx' },
  { id: 'shoulder length', body: 'shoulderLengthMm', ansur: (r) => r.shoulderlength, fit: 'approx' },
  // Level checks: where the mannequin puts the landmarks the girths hang on.
  { id: 'chest point height (apex vertex)', body: 'apexYMm', ansur: (r) => r.chestheight, fit: 'comparable', note: 'ANSUR chest height = floor to chest point anterior' },
  { id: 'chest station height (engine)', body: 'chestEngineYMm', ansur: (r) => r.chestheight, fit: 'comparable', note: 'level at which the engine solves the chest girth' },
  { id: 'chest guide line height', body: 'chestGuideYMm', ansur: (r) => r.chestheight, fit: 'comparable', note: 'level of the drawn chest guide' },
  { id: 'axilla height (underarm anchor)', body: 'underarmYMm', ansur: (r) => r.axillaheight, fit: 'approx', note: 'ANSUR anterior scye on the torso vs the underarm surface anchor' },
  { id: 'shoulder guide chord vs bideltoid', body: 'shoulderBreadthMm', ansur: (r) => r.bideltoidbreadth, fit: 'not comparable', note: 'diagnostic: does the drawn shoulder line sit on the deltoids rather than the acromions' },
];

// ---------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------
function readAnsur(path, sex) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',').map((name) => name.trim().toLowerCase());
  return lines.slice(1).map((line, index) => {
    const cells = line.split(',');
    if (cells.length !== header.length) throw new Error(`${path}:${index + 2} has ${cells.length} cells`);
    const row = { sex };
    header.forEach((name, i) => {
      const n = Number(cells[i]);
      row[name] = cells[i] !== '' && Number.isFinite(n) ? n : cells[i];
    });
    row.subjectid = String(row.subjectid);
    return row;
  });
}

function loadSubjects(options) {
  const subjects = [];
  if (options.male) subjects.push(...readAnsur(resolve(options.male), 'male'));
  if (options.female) subjects.push(...readAnsur(resolve(options.female), 'female'));
  if (!subjects.length) throw new Error('pass --male and/or --female CSV paths');
  return subjects;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fixed-seed sample stratified by sex (simple random within each sex). */
function sample(subjects, perSex, seed) {
  if (!perSex) return subjects;
  const random = mulberry32(seed);
  const out = [];
  for (const sex of ['female', 'male']) {
    const pool = subjects
      .filter((row) => row.sex === sex)
      .sort((a, b) => Number(a.subjectid) - Number(b.subjectid));
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    out.push(...pool.slice(0, perSex));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------------------------
async function bundleEntry() {
  const outfile = resolve(tmpdir(), `ansur-entry-${process.pid}.mjs`);
  await build({
    entryPoints: [resolve(HERE, 'ansur-entry.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'es2022',
    outfile,
    logLevel: 'warning',
    absWorkingDir: REPO,
    define: {
      'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
      'import.meta.env.MODE': '"production"',
      'process.env.NODE_ENV': '"production"',
    },
    alias: Object.fromEntries(
      ['components', 'lib', 'api', 'utils', 'ui', 'constants', 'hooks', 'types', 'context', 'styles'].map(
        (name) => [name, resolve(REPO, 'src', name)],
      ),
    ),
  });
  const mod = await import(pathToFileURL(outfile).href);
  rmSync(outfile, { force: true });
  return mod;
}

async function doneKeys(rawPath) {
  const keys = new Set();
  if (!existsSync(rawPath)) return keys;
  const rl = createInterface({ input: createReadStream(rawPath) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue; // a line cut by an interrupted run is recomputed
    }
    keys.add(`${row.subjectid}|${row.experiment}|${row.base}`);
  }
  return keys;
}

const GENDER = { female: 'GENDER_ENUM_FEMALE', male: 'GENDER_ENUM_MALE', neutral: 'GENDER_ENUM_UNISEX' };

async function run(options) {
  const rawPath = resolve(options.raw ?? 'ansur-runs.jsonl');
  mkdirSync(dirname(rawPath), { recursive: true });
  const experiments = (options.experiments ?? 'A,B').split(',');
  const bases = (options.bases ?? 'own,neutral').split(',');
  let subjects = sample(loadSubjects(options), Number(options['per-sex'] ?? 0), Number(options.seed ?? 20261117));
  if (options.subjects) {
    const wanted = new Set(String(options.subjects).split(','));
    subjects = loadSubjects(options).filter((row) => wanted.has(row.subjectid));
  }
  if (options.limit) subjects = subjects.slice(0, Number(options.limit));
  if (options.shard) {
    // --shard i/n: worker i of n takes every n-th subject of the fixed sample (parallel resume).
    const [shardIndex, shardCount] = String(options.shard).split('/').map(Number);
    subjects = subjects.filter((_, i) => i % shardCount === shardIndex);
  }
  const { runAnsurSubject } = await bundleEntry();
  const done = await doneKeys(rawPath);
  // --skip a.jsonl,b.jsonl: keys already computed in other raw files (read only).
  for (const other of options.skip ? String(options.skip).split(',') : []) {
    for (const key of await doneKeys(resolve(other))) done.add(key);
  }
  const total = subjects.length * experiments.length * bases.length;
  let index = 0;
  const startedAt = Date.now();
  for (const subject of subjects) {
    for (const experiment of experiments) {
      for (const baseChoice of bases) {
        index += 1;
        const base = baseChoice === 'own' ? subject.sex : 'neutral';
        const key = `${subject.subjectid}|${experiment}|${base}`;
        if (done.has(key)) continue;
        const fields = Object.fromEntries(
          Object.entries(EXPERIMENTS[experiment]).map(([wire, column]) => [wire, subject[column]]),
        );
        let result;
        try {
          result = await runAnsurSubject({
            gender: GENDER[base],
            fields,
            sourceRevision: `ansur:${subject.subjectid}:${experiment}:${base}`,
          });
        } catch (reason) {
          // Anything that escapes the preview's own catch boundaries fails the preview build.
          result = {
            basisKind: base,
            outcome: 'harness-throw',
            message: reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason),
            elapsedMs: null,
          };
        }
        await appendFile(
          rawPath,
          `${JSON.stringify({ subjectid: subject.subjectid, sex: subject.sex, experiment, base, ...result })}\n`,
        );
        if (index % 25 === 0 || index === total) {
          const elapsed = (Date.now() - startedAt) / 1000;
          console.log(`${index}/${total} ${elapsed.toFixed(0)}s last ${result.outcome} ${result.elapsedMs?.toFixed?.(0)}ms`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------------------------
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function stats(errors) {
  const n = errors.length;
  if (!n) return { n: 0 };
  const abs = errors.map(Math.abs).sort((a, b) => a - b);
  const mean = errors.reduce((s, e) => s + e, 0) / n;
  return {
    n,
    biasMm: round(mean),
    medianAbsMm: round(quantile(abs, 0.5)),
    p90AbsMm: round(quantile(abs, 0.9)),
    within10Pct: round((100 * abs.filter((e) => e <= 10).length) / n),
    within20Pct: round((100 * abs.filter((e) => e <= 20).length) / n),
  };
}

const round = (value) => (value == null ? null : Math.round(value * 10) / 10);

const GROUPS = {
  'female→female': (row) => row.sex === 'female' && row.base === 'female',
  'male→male': (row) => row.sex === 'male' && row.base === 'male',
  'both→neutral': (row) => row.base === 'neutral',
  'female→neutral': (row) => row.sex === 'female' && row.base === 'neutral',
  'male→neutral': (row) => row.sex === 'male' && row.base === 'neutral',
};

const SHAPE_KEYS = [
  'heightMm', 'shoulderBreadthMm', 'chestCircumferenceMm', 'waistCircumferenceMm', 'hipCircumferenceMm',
  'chestDepthMm', 'waistDepthMm', 'hipDepthMm', 'armLengthMm', 'neckCircumferenceMm',
  'wristCircumferenceMm', 'thighCircumferenceMm', 'calfCircumferenceMm', 'ankleCircumferenceMm',
];

function statusOf(row, key) {
  if (row.applied?.includes(key)) return 'represented';
  if (row.limited?.includes(key)) return 'limited';
  if (row.notApplied?.includes(key)) return 'not applied';
  return key === 'heightMm' && row.outcome === 'ok' ? 'represented' : '';
}

// Fallbacks the engine takes on every run by design (no under-bust input, uncalibrated
// front/back share, unisex gender). They are not failures and are counted separately.
const ROUTINE_FALLBACK = /^(underbust-station:bounded-height-fallback|anterior-share:bounded-neutral-fallback|gender-[a-z]+-neutral-fallback)$/;

function realRollbacks(row) {
  return [...new Set((row.rollbacks ?? []).filter((r) => !ROUTINE_FALLBACK.test(r)).map((r) => r.replace(/[0-9]+(\.[0-9]+)?/g, '#')))];
}

function failureClasses(row) {
  const out = [];
  if (row.outcome !== 'ok') out.push(row.outcome);
  if (row.outcome === 'ok' || row.outcome === 'beta-throw') {
    const real = realRollbacks(row);
    if (real.length) out.push('rollback (any)');
    for (const r of real) out.push(`rollback: ${r}`);
    if (row.qualitySafe === false) out.push('quality-unsafe');
    if (row.qualityReasons?.some((r) => /intersect/i.test(r))) out.push('self-intersection');
    if (row.implausible?.length) out.push('implausible');
    if (row.anchorFailure) out.push('shaped mesh not exactly mirror-symmetric (guide anchors order-dependent)');
  }
  return out;
}

async function summarize(options) {
  const rawPath = resolve(String(options.raw).split(',')[0]);
  const outDir = resolve(options.out ?? dirname(rawPath));
  mkdirSync(outDir, { recursive: true });
  const subjects = new Map(loadSubjects(options).map((row) => [row.subjectid, row]));
  const rows = [];
  const seen = new Set();
  for (const path of String(options.raw).split(',')) {
    const rl = createInterface({ input: createReadStream(resolve(path)) });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      const key = `${row.subjectid}|${row.experiment}|${row.base}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }

  // results.csv — one row per subject x experiment x base.
  const head = [
    'subjectid', 'sex', 'age', 'experiment', 'base', 'outcome', 'beta_status', 'quality_safe',
    'failure_classes', 'limited', 'not_applied', 'rollbacks', 'implausible', 'elapsed_ms',
  ];
  for (const t of TARGETS) {
    const slug = t.id.replace(/[^a-z0-9]+/gi, '_');
    head.push(`${slug}_ansur_mm`, `${slug}_mannequin_mm`, `${slug}_err_mm`, `${slug}_role`, `${slug}_status`);
  }
  const csv = [head.join(',')];
  const cells = { A: {}, B: {} };
  const statusCounts = {};
  const failures = {};
  const routineFallbacks = {};
  const outcomeCounts = {};
  const elapsed = [];

  for (const row of rows) {
    const subject = subjects.get(row.subjectid);
    if (!subject) continue;
    const fed = EXPERIMENTS[row.experiment];
    const classes = failureClasses(row);
    for (const r of row.rollbacks ?? []) if (ROUTINE_FALLBACK.test(r)) routineFallbacks[r] = (routineFallbacks[r] ?? 0) + 1;
    for (const cls of classes) {
      failures[cls] ??= { count: 0, subjects: 0, examples: [], _subjects: new Set() };
      failures[cls].count += 1;
      failures[cls]._subjects.add(row.subjectid);
      failures[cls].subjects = failures[cls]._subjects.size;
      if (failures[cls].examples.length < 5 && !failures[cls].examples.some((e) => e.subjectid === row.subjectid))
        failures[cls].examples.push({
          subjectid: row.subjectid,
          sex: row.sex,
          experiment: row.experiment,
          base: row.base,
          detail: (row.message || realRollbacks(row).join(' ') || row.implausible?.join(' ') || row.qualityReasons?.join(' ') || row.anchorFailure || '').slice(0, 160),
        });
    }
    const runKey = `${row.experiment}|${row.base === 'neutral' ? 'neutral' : 'own'}`;
    outcomeCounts[runKey] ??= {};
    outcomeCounts[runKey][row.outcome] = (outcomeCounts[runKey][row.outcome] ?? 0) + 1;
    if (row.elapsedMs != null) elapsed.push(row.elapsedMs);

    const line = [
      row.subjectid, row.sex, subject.age, row.experiment, row.base, row.outcome, row.betaStatus ?? '',
      row.qualitySafe ?? '', classes.join(' '), (row.limited ?? []).join(' '), (row.notApplied ?? []).join(' '),
      (row.rollbacks ?? []).join(' '), (row.implausible ?? []).join(' '), row.elapsedMs == null ? '' : Math.round(row.elapsedMs),
    ];
    for (const t of TARGETS) {
      const truth = t.ansur(subject);
      const value = row.measured?.[t.body];
      const role = t.wire && fed[t.wire] ? 'input' : 'predicted';
      const status = role === 'input' ? statusOf(row, t.key) : '';
      const err = value == null || !Number.isFinite(truth) ? null : value - truth;
      line.push(round(truth), round(value), round(err), role, status);
      if (err == null) continue;
      for (const [group, match] of Object.entries(GROUPS)) {
        if (!match(row)) continue;
        const bucketKey = `${group}|${t.id}|${role}`;
        (cells[row.experiment][bucketKey] ??= []).push(err);
        if (role === 'input') {
          const sKey = `${group}|${t.id}|input:${status || 'unknown'}`;
          (cells[row.experiment][sKey] ??= []).push(err);
        }
      }
    }
    if (row.outcome === 'ok') {
      for (const [group, match] of Object.entries(GROUPS)) {
        if (!match(row)) continue;
        for (const key of SHAPE_KEYS) {
          const wire = TARGETS.find((t) => t.key === key)?.wire;
          if (!wire || !fed[wire]) continue;
          const s = statusOf(row, key) || 'missing';
          const k = `${row.experiment}|${group}|${key}`;
          statusCounts[k] ??= { represented: 0, limited: 0, 'not applied': 0, missing: 0 };
          statusCounts[k][s] += 1;
        }
        const anyKey = `${row.experiment}|${group}|ANY`;
        statusCounts[anyKey] ??= { subjects: 0, anyLimited: 0, anyLimitedExWaist: 0, anyNotApplied: 0 };
        statusCounts[anyKey].subjects += 1;
        if (row.limited?.some((k) => k !== 'armLengthMm')) statusCounts[anyKey].anyLimited += 1;
        // Waist is fed the navel girth (level mismatch), so also count without it.
        if (row.limited?.some((k) => k !== 'armLengthMm' && k !== 'waistCircumferenceMm')) statusCounts[anyKey].anyLimitedExWaist += 1;
        if (row.notApplied?.length) statusCounts[anyKey].anyNotApplied += 1;
      }
    }
    csv.push(line.map((v) => (v == null ? '' : String(v).replace(/,/g, ';'))).join(','));
  }
  writeFileSync(resolve(outDir, 'results.csv'), `${csv.join('\n')}\n`);

  const errorStats = {};
  for (const experiment of ['A', 'B']) {
    for (const [k, errs] of Object.entries(cells[experiment])) errorStats[`${experiment}|${k}`] = stats(errs);
  }
  elapsed.sort((a, b) => a - b);
  const summary = {
    generatedAt: new Date().toISOString(),
    runs: rows.length,
    subjects: new Set(rows.map((r) => r.subjectid)).size,
    subjectsBySex: {
      female: new Set(rows.filter((r) => r.sex === 'female').map((r) => r.subjectid)).size,
      male: new Set(rows.filter((r) => r.sex === 'male').map((r) => r.subjectid)).size,
    },
    elapsedMsPerRun: { median: round(quantile(elapsed, 0.5)), p90: round(quantile(elapsed, 0.9)), max: round(elapsed.at(-1)) },
    mapping: { experimentA: CORE, experimentBExtra: FULL_EXTRA, targets: TARGETS.map(({ id, wire, key, fit, note }) => ({ id, wire, key, fit, note })) },
    outcomeCounts,
    routineFallbacks,
    failures: Object.fromEntries(Object.entries(failures).map(([k, { _subjects, ...f }]) => [k, f])),
    statusCounts,
    errorStats,
  };
  writeFileSync(resolve(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  // report.md = owner-facing notes (--notes, plain text written after reading the numbers) +
  // the fixed method / mapping section + every table.
  const notes = options.notes ? readFileSync(resolve(options.notes), 'utf8').trim() : '';
  writeFileSync(resolve(outDir, 'report.md'), `${notes ? `${notes}\n\n` : ''}${methodSection(summary, options)}\n${tables(summary)}`);
  console.log(`wrote ${outDir}/results.csv, summary.json, report.md (${rows.length} runs)`);
}

function methodSection(summary, options) {
  const { female, male } = summary.subjectsBySex;
  const wall = options.wall ? ` Wall time: ${options.wall}.` : '';
  return `## What was run

- **Data.** ANSUR II public release (US Army survey, 2012; 4082 men, 1986 women; lengths in mm).
  **Population note:** soldiers aged 17–58, fitter and leaner than the general public; very large
  and older bodies are under-represented, so real customers will hit the safe-range limits *more*
  often than the rates below.
- **Sample.** Fixed-seed stratified sample: ${female} women + ${male} men (seed ${options.seed ?? 20261117}, shuffled per sex
  from the subjectid-sorted list). All 6068 would take ~9 h in one process (~5.5 s per subject for
  the 4 builds), so the spec's ≥ 600 per sex fallback was used. ${summary.runs} builds in total.
- **Runtime.** Median ${summary.elapsedMsPerRun.median} ms per build (p90 ${summary.elapsedMsPerRun.p90}, max ${summary.elapsedMsPerRun.max}), CPU only, \`nice -n 10\`.${wall}
- **Engine path.** The production model-form preview chain, bundled for node by
  \`scripts/probe-esbuild.mjs\` (no browser, no GPU): measurement adapter → MakeHuman open-reference
  basis → measurement body frame (A-pose) → uniform-height display → waist/hip runtime → beta shape
  runtime → \`modelOpenReferenceMeasurementApplicationV1\` (the represented / limited / not applied
  statuses the form shows). The preview's own catch boundaries are kept.
- **Bases.** Each subject is built on their own sex base and on the neutral base (gender UNISEX)
  for both experiments. "both→neutral" pools men and women on the neutral base.
- **Measuring back.** Horizontal section loops on the shaped display mesh at the engine's own
  stations (chest, waist, hip, neck, limbs) and at the product guide's chest line; the product
  guide's surface anchors (SSN, C7, HPS, underarm, crotch, acromion vertex 8280, apex vertex 8454)
  for heights, breadths and lengths. Floor is y = 0; stature comes back exact.
- **Reading the tables.** Error = mannequin − person (negative = mannequin smaller / lower).
  "fit": comparable = same definition; approx = close but not identical landmarks; level = ANSUR
  measures at the navel, ours at the natural waist; not comparable = shown only as a diagnostic.

## Mapping ANSUR → model-form fields (definitions from ANSURII-TR15-007)

| form field | ANSUR column | fit | caveat |
|---|---|---|---|
| height | stature | exact | — |
| across shoulder | biacromialbreadth | comparable | acromion to acromion, beam caliper, measured **sitting** with arms forward |
| chest | chestcircumference | comparable | max horizontal girth **at the chest point (most anterior point of bust / chest)** |
| waist | waistcircumference | level | ANSUR waist is at the **navel**, ours is the natural waist; ANSUR has no natural-waist girth. Waist is a required field, so the navel girth is fed |
| hip | buttockcircumference | comparable | max buttock protrusion |
| sleeve length | sleeveoutseam | comparable | acromion → wrist (stylion), straight, arms at the sides; the engine always marks arm length limited |
| inseam | crotchheight | comparable | floor → crotch; the engine never applies inseam, so crotch height stays a prediction |
| chest depth (B) | chestdepth | comparable | at the chest point level |
| waist depth (B) | waistdepth | level | navel level, consistent with the waist input |
| hip depth (B) | buttockdepth | comparable | — |
| neck (B) | neckcircumference | approx | ANSUR at the Adam's apple; ours at the engine neck station |
| wrist / thigh / calf / ankle (B) | same names | approx | ANSUR at landmarks (thigh: gluteal furrow; calf: max; wrist: styloid; ankle: min); the engine's limb stations are a geometric rule (centre of the limb modifier's support), flagged \`anatomicalLandmarkEquivalent: false\` in code |
| not fed | — | — | biceps (ANSUR flexed), knee, under-bust, high hip (no ANSUR field); neck base and waist height are not shape inputs |

Predicted-only checks: chest breadth (ANSUR on a held deep breath, hands on hips → approx), waist
breadth (navel level), hip breadth (lateral buttock points vs hip-loop width → approx), cervicale /
acromial / crotch / chest-point / axilla heights, natural waist height (rule: midpoint of the
10th-rib and iliac-crest heights; navel height shown as not comparable), neck-base girth and
shoulder length (approx: ours are surface paths between guide anchors).

## What ANSUR can and cannot show

- **Can:** whether girths, depths, breadths and landmark heights of the shaped mannequin land where
  real people's do; how often real values fall outside the safe ranges; where the engine and the
  drawn guides disagree with each other.
- **Cannot:** the front/back split of a depth (how much of it sits in front of the side seam),
  local surface shape or curvature, or posture effects (ANSUR is standing or sitting, the mannequin
  is in A-pose). ANSUR has no surface scans, so \`torsoDepthFrontBackDistributionCalibrated\` stays
  \`false\` and no claim was changed.
`;
}

function tables(summary) {
  const out = [];
  const fmt = (s) =>
    s?.n ? `${s.biasMm} | ${s.medianAbsMm} | ${s.p90AbsMm} | ${s.within10Pct}% | ${s.within20Pct}% | ${s.n}` : '— | — | — | — | — | 0';
  const groups = ['female→female', 'male→male', 'both→neutral'];
  for (const [experiment, role, title] of [
    ['A', 'predicted', 'A. Prediction — fields NOT given as input (core set fed)'],
    ['A', 'input', 'A. Honouring of the core inputs'],
    ['B', 'input', 'B. Honouring — all fed fields (any status)'],
    ['B', 'input:represented', 'B. Honouring — only fields the engine marks represented'],
    ['B', 'input:limited', 'B. Gap left on fields the engine marks limited (mannequin minus person)'],
    ['B', 'input:not applied', 'B. Gap left on fields the engine marks not applied'],
    ['B', 'predicted', 'B. Still-predicted fields with the full set fed'],
  ]) {
    out.push(`\n### ${title}\n`);
    out.push('| field | fit | base | bias mm | median abs mm | p90 abs mm | ±10 mm | ±20 mm | n |');
    out.push('|---|---|---|---|---|---|---|---|---|');
    for (const t of TARGETS) {
      for (const group of groups) {
        const s = summary.errorStats[`${experiment}|${group}|${t.id}|${role}`];
        if (!s?.n) continue;
        out.push(`| ${t.id} | ${t.fit} | ${group} | ${fmt(s)} |`);
      }
    }
  }
  for (const experiment of ['A', 'B']) {
  out.push(`\n### ${experiment}. Status per fed field (share of successful builds)\n`);
  out.push('| field | base | represented | limited | not applied | n |');
  out.push('|---|---|---|---|---|---|');
  for (const key of SHAPE_KEYS) {
    for (const group of groups) {
      const c = summary.statusCounts[`${experiment}|${group}|${key}`];
      if (!c) continue;
      const n = c.represented + c.limited + c['not applied'] + c.missing;
      const pct = (v) => `${round((100 * v) / n)}%`;
      out.push(`| ${key} | ${group} | ${pct(c.represented)} | ${pct(c.limited)} | ${pct(c['not applied'])} | ${n} |`);
    }
  }
  }
  out.push('\n### Subjects with at least one limited / not-applied field (arm length excluded: always limited by design)\n');
  out.push('| experiment | base | subjects | ≥1 limited | ≥1 limited (waist excluded) | ≥1 not applied |');
  out.push('|---|---|---|---|---|---|');
  for (const experiment of ['A', 'B']) {
    for (const group of groups) {
      const c = summary.statusCounts[`${experiment}|${group}|ANY`];
      if (!c) continue;
      out.push(`| ${experiment} | ${group} | ${c.subjects} | ${round((100 * c.anyLimited) / c.subjects)}% | ${round((100 * c.anyLimitedExWaist) / c.subjects)}% | ${round((100 * c.anyNotApplied) / c.subjects)}% |`);
    }
  }
  out.push('\n### C. Failures (runs)\n');
  out.push(`Runs: ${summary.runs}, subjects: ${summary.subjects}.\n`);
  out.push('| class | runs | subjects | example subject ids |');
  out.push('|---|---|---|---|');
  for (const [cls, f] of Object.entries(summary.failures).sort((a, b) => b[1].count - a[1].count)) {
    out.push(`| ${cls} | ${f.count} | ${f.subjects} | ${f.examples.map((e) => `${e.subjectid} (${e.sex}, ${e.experiment}, ${e.base})`).join(', ')} |`);
  }
  out.push('\nRoutine fallbacks taken by design (not failures): ' + (Object.entries(summary.routineFallbacks).map(([k, v]) => `${k} ${v} runs`).join('; ') || 'none') + '.');
  out.push('\n### Outcomes per experiment / base\n');
  out.push('```');
  out.push(JSON.stringify(summary.outcomeCounts, null, 1));
  out.push('```');
  return `${out.join('\n')}\n`;
}

const options = args();
if (options.command === 'run') await run(options);
else if (options.command === 'summarize') await summarize(options);
else {
  console.log('usage: ansur.mjs run|summarize --male <csv> --female <csv> --raw <jsonl> [--out <dir>] [--per-sex N] [--seed S] [--limit N] [--subjects id,id] [--experiments A,B] [--bases own,neutral] [--shard i/n --skip other.jsonl]; summarize --raw accepts a,b,c');
  process.exit(2);
}
