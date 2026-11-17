#!/usr/bin/env node
// Fits the ANSUR II relations behind `ansur-untyped-field-estimates-v1.ts` (CPU only, no engine).
//
//   node scripts/anthropometry/ansur-fit.mjs --male <ANSUR_II_MALE_Public.csv> \
//     --female <ANSUR_II_FEMALE_Public.csv> [--out <fits.json>] [--holdout-list <ids.txt>] \
//     [--compare]
//
// Split: per sex, subjectid-sorted, shuffled with the study seed (20261117, same shuffle as
// ansur.mjs `sample`), first half = training, second half = holdout. Every coefficient is fitted on
// the training half only; every error printed is on the holdout half. `--holdout-list` writes the
// fixed 200 + 200 study holdout (the first 200 holdout subjects per sex in shuffled order).
//
// Predictors are only typed form fields whose ANSUR definition matches ours: stature (height),
// chest circumference (chest), buttock circumference (hip), biacromial breadth (across shoulder).
// ANSUR waist is at the navel, ours at the natural waist, so waist is never a predictor.
// Pooled (neutral base) fit: both sexes, weighted so each sex carries half the weight.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function args() {
  const out = {};
  const rest = process.argv.slice(2);
  for (let i = 0; i < rest.length; i += 1) {
    const key = rest[i].replace(/^--/, '');
    const value = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[(i += 1)] : 'true';
    out[key] = value;
  }
  return out;
}

function readAnsur(path, sex) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',').map((name) => name.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = { sex };
    header.forEach((name, i) => {
      const n = Number(cells[i]);
      row[name] = cells[i] !== '' && Number.isFinite(n) ? n : cells[i];
    });
    row.subjectid = String(row.subjectid);
    return row;
  });
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

/** Same shuffle as ansur.mjs `sample` (one generator, female pool first, then male). */
function split(subjects, seed) {
  const random = mulberry32(seed);
  const out = {};
  for (const sex of ['female', 'male']) {
    const pool = subjects
      .filter((row) => row.sex === sex)
      .sort((a, b) => Number(a.subjectid) - Number(b.subjectid));
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const half = Math.floor(pool.length / 2);
    out[sex] = { train: pool.slice(0, half), holdout: pool.slice(half) };
  }
  return out;
}

// form canonical key -> ANSUR column (definitions: ANSURII-TR15-007)
const PREDICTORS = {
  heightMm: 'stature',
  chestCircumferenceMm: 'chestcircumference',
  hipCircumferenceMm: 'buttockcircumference',
  shoulderBreadthMm: 'biacromialbreadth',
};
const TARGETS = {
  neckCircumferenceMm: 'neckcircumference',
  wristCircumferenceMm: 'wristcircumference',
  thighCircumferenceMm: 'thighcircumference',
  calfCircumferenceMm: 'calfcircumference',
  ankleCircumferenceMm: 'anklecircumference',
  chestDepthMm: 'chestdepth',
  hipDepthMm: 'buttockdepth',
};

/** Weighted least squares with intercept; Gaussian elimination on centred predictors. */
function fit(rows, predictorKeys, targetColumn, weightOf) {
  const k = predictorKeys.length;
  let sw = 0;
  const mean = new Array(k).fill(0);
  let my = 0;
  for (const row of rows) {
    const w = weightOf(row);
    sw += w;
    predictorKeys.forEach((key, i) => (mean[i] += w * row[PREDICTORS[key]]));
    my += w * row[targetColumn];
  }
  for (let i = 0; i < k; i += 1) mean[i] /= sw;
  my /= sw;
  const a = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  for (const row of rows) {
    const w = weightOf(row);
    const x = predictorKeys.map((key, i) => row[PREDICTORS[key]] - mean[i]);
    const y = row[targetColumn] - my;
    for (let i = 0; i < k; i += 1) {
      for (let j = 0; j < k; j += 1) a[i][j] += w * x[i] * x[j];
      a[i][k] += w * x[i] * y;
    }
  }
  for (let c = 0; c < k; c += 1) {
    let pivot = c;
    for (let r = c + 1; r < k; r += 1) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    [a[c], a[pivot]] = [a[pivot], a[c]];
    for (let r = 0; r < k; r += 1) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let j = c; j <= k; j += 1) a[r][j] -= f * a[c][j];
    }
  }
  const coefficients = Object.fromEntries(predictorKeys.map((key, i) => [key, a[i][k] / a[i][i]]));
  const intercept = my - predictorKeys.reduce((s, key, i) => s + coefficients[key] * mean[i], 0);
  return { intercept, coefficients };
}

const predict = (model, row) =>
  model.intercept +
  Object.entries(model.coefficients).reduce((s, [key, b]) => s + b * row[PREDICTORS[key]], 0);

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
const r1 = (v) => Math.round(v * 10) / 10;
function errorStats(errors) {
  const abs = errors.map(Math.abs).sort((x, y) => x - y);
  return {
    n: errors.length,
    biasMm: r1(errors.reduce((s, e) => s + e, 0) / errors.length),
    medianAbsMm: r1(quantile(abs, 0.5)),
    p90AbsMm: r1(quantile(abs, 0.9)),
  };
}

const options = args();
const subjects = [
  ...readAnsur(resolve(options.male), 'male'),
  ...readAnsur(resolve(options.female), 'female'),
];
const seed = Number(options.seed ?? 20261117);
const parts = split(subjects, seed);
const trainBoth = [...parts.female.train, ...parts.male.train];
const nF = parts.female.train.length;
const nM = parts.male.train.length;
const pooledWeight = (row) => (row.sex === 'female' ? 0.5 / nF : 0.5 / nM);
const GROUPS = {
  female: { train: parts.female.train, weight: () => 1, holdout: parts.female.holdout },
  male: { train: parts.male.train, weight: () => 1, holdout: parts.male.holdout },
  pooled: {
    train: trainBoth,
    weight: pooledWeight,
    holdout: [...parts.female.holdout, ...parts.male.holdout],
  },
};

const FINAL_PREDICTORS = [
  'heightMm',
  'chestCircumferenceMm',
  'hipCircumferenceMm',
  'shoulderBreadthMm',
];

if (options.compare) {
  const sets = {
    'height+chest+hip': ['heightMm', 'chestCircumferenceMm', 'hipCircumferenceMm'],
    'height+chest+hip+shoulder': FINAL_PREDICTORS,
    'height only': ['heightMm'],
  };
  for (const [target, column] of Object.entries(TARGETS)) {
    for (const [name, keys] of Object.entries(sets)) {
      const line = [];
      for (const [group, g] of Object.entries(GROUPS)) {
        const model = fit(g.train, keys, column, g.weight);
        const s = errorStats(g.holdout.map((row) => predict(model, row) - row[column]));
        line.push(`${group} med ${s.medianAbsMm} p90 ${s.p90AbsMm}`);
      }
      console.log(`${target.padEnd(22)} ${name.padEnd(26)} ${line.join(' | ')}`);
    }
  }
}

const fits = {};
for (const [group, g] of Object.entries(GROUPS)) {
  fits[group] = {};
  for (const [target, column] of Object.entries(TARGETS)) {
    const model = fit(g.train, FINAL_PREDICTORS, column, g.weight);
    const trainValues = g.train.map((row) => row[column]).sort((x, y) => x - y);
    const holdout = errorStats(g.holdout.map((row) => predict(model, row) - row[column]));
    const bySex =
      group === 'pooled'
        ? Object.fromEntries(
            ['female', 'male'].map((sex) => [
              sex,
              errorStats(parts[sex].holdout.map((row) => predict(model, row) - row[column])),
            ]),
          )
        : undefined;
    fits[group][target] = {
      ansurColumn: column,
      intercept: Number(model.intercept.toFixed(4)),
      coefficients: Object.fromEntries(
        Object.entries(model.coefficients).map(([key, b]) => [key, Number(b.toFixed(6))]),
      ),
      // Estimates are clamped to the 0.5–99.5 % range of the training half.
      rangeMm: [r1(quantile(trainValues, 0.005)), r1(quantile(trainValues, 0.995))],
      trainN: g.train.length,
      holdout,
      ...(bySex ? { holdoutBySex: bySex } : {}),
    };
  }
}
for (const [group, byTarget] of Object.entries(fits)) {
  for (const [target, f] of Object.entries(byTarget)) {
    const s = f.holdout;
    console.log(
      `${group.padEnd(7)} ${target.padEnd(22)} n ${s.n} bias ${s.biasMm} med ${s.medianAbsMm} p90 ${s.p90AbsMm}` +
        (f.holdoutBySex
          ? ` | F bias ${f.holdoutBySex.female.biasMm} med ${f.holdoutBySex.female.medianAbsMm} | M bias ${f.holdoutBySex.male.biasMm} med ${f.holdoutBySex.male.medianAbsMm}`
          : ''),
    );
  }
}
if (options.out) {
  writeFileSync(
    resolve(options.out),
    `${JSON.stringify({ seed, split: { female: { train: nF, holdout: parts.female.holdout.length }, male: { train: nM, holdout: parts.male.holdout.length } }, predictors: FINAL_PREDICTORS, fits }, null, 2)}\n`,
  );
}
if (options['holdout-list']) {
  const ids = [...parts.female.holdout.slice(0, 200), ...parts.male.holdout.slice(0, 200)].map(
    (row) => row.subjectid,
  );
  writeFileSync(resolve(options['holdout-list']), `${ids.join(',')}\n`);
  console.log(`holdout list: ${ids.length} ids`);
}
