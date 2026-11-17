#!/usr/bin/env node
// Before / after table for two `ansur.mjs run` raw sets on the same subjects (CPU only).
//
//   node scripts/anthropometry/ansur-compare.mjs --male <csv> --female <csv> \
//     --before a.jsonl,b.jsonl --after c.jsonl,d.jsonl [--experiment A]
//
// Prints markdown: per field mannequin-minus-person bias / median |err| / p90 |err| per base group,
// the share of subjects with a field limited per base, outcomes and the runtime's estimate codes.
import { readFileSync } from 'node:fs';
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

const readRaw = (paths) =>
  paths
    .split(',')
    .flatMap((path) => readFileSync(resolve(path), 'utf8').split('\n'))
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

const FIELDS = [
  ['neck girth', 'neckCircMm', (r) => r.neckcircumference],
  ['wrist girth', 'wristCircMm', (r) => r.wristcircumference],
  ['thigh girth', 'thighCircMm', (r) => r.thighcircumference],
  ['calf girth', 'calfCircMm', (r) => r.calfcircumference],
  ['ankle girth', 'ankleCircMm', (r) => r.anklecircumference],
  ['chest depth', 'chestDepthMm', (r) => r.chestdepth],
  ['chest breadth', 'chestBreadthMm', (r) => r.chestbreadth],
  ['buttock depth', 'hipDepthMm', (r) => r.buttockdepth],
  ['hip breadth', 'hipBreadthMm', (r) => r.hipbreadth],
  ['chest girth (engine station)', 'chestCircEngineStationMm', (r) => r.chestcircumference],
  ['hip girth', 'hipCircMm', (r) => r.buttockcircumference],
  ['waist girth (navel, level)', 'waistCircMm', (r) => r.waistcircumference],
  ['sleeve length', 'sleeveLengthMm', (r) => r.sleeveoutseam],
];
const GROUPS = {
  'female→female': (row) => row.sex === 'female' && row.base === 'female',
  'male→male': (row) => row.sex === 'male' && row.base === 'male',
  'both→neutral': (row) => row.base === 'neutral',
};

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
const r1 = (v) => (v == null ? '—' : String(Math.round(v * 10) / 10));
function stats(errors) {
  if (!errors.length) return null;
  const abs = errors.map(Math.abs).sort((a, b) => a - b);
  return {
    n: errors.length,
    bias: errors.reduce((s, e) => s + e, 0) / errors.length,
    median: quantile(abs, 0.5),
    p90: quantile(abs, 0.9),
  };
}
const pct = (k, n) => (n ? `${Math.round((1000 * k) / n) / 10}%` : '—');

const options = args();
const subjects = new Map(
  [
    ...readAnsur(resolve(options.male), 'male'),
    ...readAnsur(resolve(options.female), 'female'),
  ].map((row) => [row.subjectid, row]),
);
const experiment = options.experiment ?? 'A';
const sets = {
  before: readRaw(options.before).filter((row) => row.experiment === experiment),
  after: readRaw(options.after).filter((row) => row.experiment === experiment),
};

const out = [];
out.push(`| field | base | before bias | before med | before p90 | after bias | after med | after p90 | n |`);
out.push('|---|---|---|---|---|---|---|---|---|');
for (const [label, body, truth] of FIELDS) {
  for (const [group, match] of Object.entries(GROUPS)) {
    const cell = {};
    for (const [name, rows] of Object.entries(sets)) {
      const errors = [];
      for (const row of rows) {
        if (row.outcome !== 'ok' || !match(row)) continue;
        const subject = subjects.get(row.subjectid);
        const value = row.measured?.[body];
        const t = truth(subject);
        if (value != null && Number.isFinite(t)) errors.push(value - t);
      }
      cell[name] = stats(errors);
    }
    const b = cell.before;
    const a = cell.after;
    out.push(
      `| ${label} | ${group} | ${r1(b?.bias)} | ${r1(b?.median)} | ${r1(b?.p90)} | ${r1(a?.bias)} | ${r1(a?.median)} | ${r1(a?.p90)} | ${a?.n ?? b?.n ?? 0} |`,
    );
  }
}

out.push('\n| base | run | builds ok | chest limited | hip limited | waist limited | ≥1 limited (waist excl.) | ≥1 not applied |');
out.push('|---|---|---|---|---|---|---|---|');
for (const [group, match] of Object.entries(GROUPS)) {
  for (const [name, rows] of Object.entries(sets)) {
    const ok = rows.filter((row) => match(row) && row.outcome === 'ok');
    const has = (row, key) => row.limited?.includes(key);
    out.push(
      `| ${group} | ${name} | ${ok.length} | ${pct(ok.filter((r) => has(r, 'chestCircumferenceMm')).length, ok.length)} | ${pct(ok.filter((r) => has(r, 'hipCircumferenceMm')).length, ok.length)} | ${pct(ok.filter((r) => has(r, 'waistCircumferenceMm')).length, ok.length)} | ${pct(ok.filter((r) => r.limited?.some((k) => k !== 'armLengthMm' && k !== 'waistCircumferenceMm')).length, ok.length)} | ${pct(ok.filter((r) => r.notApplied?.length).length, ok.length)} |`,
    );
  }
}

// Typed-field status changes per subject (a guess must never cost a typed field).
const rank = (row, key) =>
  row.applied?.includes(key) ? 2 : row.limited?.includes(key) ? 1 : 0;
const beforeByKey = new Map(sets.before.map((row) => [`${row.subjectid}|${row.base}`, row]));
let worse = 0;
let better = 0;
const worseExamples = [];
for (const row of sets.after) {
  const prior = beforeByKey.get(`${row.subjectid}|${row.base}`);
  if (!prior || row.outcome !== 'ok' || prior.outcome !== 'ok') continue;
  const keys = new Set([...prior.applied, ...prior.limited, ...prior.notApplied]);
  let w = false;
  let b = false;
  for (const key of keys) {
    if (rank(row, key) < rank(prior, key)) w = true;
    if (rank(row, key) > rank(prior, key)) b = true;
  }
  if (w) {
    worse += 1;
    if (worseExamples.length < 8) worseExamples.push(`${row.subjectid}/${row.base}`);
  }
  if (b) better += 1;
}
out.push(`\nTyped-field status vs before: worse on ${worse} builds${worseExamples.length ? ` (${worseExamples.join(', ')})` : ''}, better on ${better}.`);

const outcomes = {};
const codes = {};
const estimated = {};
const elapsed = { before: [], after: [] };
for (const [name, rows] of Object.entries(sets)) {
  for (const row of rows) {
    outcomes[`${name}:${row.outcome}`] = (outcomes[`${name}:${row.outcome}`] ?? 0) + 1;
    if (row.elapsedMs != null) elapsed[name].push(row.elapsedMs);
    if (name !== 'after') continue;
    for (const code of row.estimateCodes ?? []) {
      const key = code.replace(/:applied:.*/, ':applied').replace(/:clamped-to-ansur-range:.*/, ':clamped');
      codes[key] = (codes[key] ?? 0) + 1;
    }
    for (const key of row.estimated ?? []) estimated[key] = (estimated[key] ?? 0) + 1;
  }
}
for (const list of Object.values(elapsed)) list.sort((a, b) => a - b);
out.push(`Outcomes: ${JSON.stringify(outcomes)}`);
out.push(`Median build ms: before ${r1(quantile(elapsed.before, 0.5))} (p90 ${r1(quantile(elapsed.before, 0.9))}), after ${r1(quantile(elapsed.after, 0.5))} (p90 ${r1(quantile(elapsed.after, 0.9))})`);
out.push(`Estimate codes (after): ${JSON.stringify(codes)}`);
out.push(`Estimated fields shaped (after, builds): ${JSON.stringify(estimated)}`);
console.log(out.join('\n'));
