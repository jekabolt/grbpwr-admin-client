#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const TMP = mkdtempSync(join(tmpdir(), 'fitting-edit-rows-'));
const OUTFILE = join(TMP, 'edit-rows.mjs');

try {
  await build({
    entryPoints: [resolve(REPO, 'src/components/managers/fitting/components/edit-rows.ts')],
    outfile: OUTFILE,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'warning',
  });
  const { buildEditRows, categoryOf, nextEditNumber } = await import(pathToFileURL(OUTFILE));

  runFixtures({ buildEditRows, categoryOf, nextEditNumber });
  if (!process.argv.includes('--fixtures-only')) {
    runBeta({ buildEditRows, categoryOf, nextEditNumber });
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

function runFixtures({ buildEditRows, categoryOf, nextEditNumber }) {
  const callouts = [
    callout(4, 'first mark for four', 40),
    callout(4, 'duplicate mark for four', 41),
    callout(2, 'legacy two', 20),
    callout(0, 'very old first', 70),
    callout(0, 'very old second', 71),
    callout(8, 'mark for fallback status', 80),
  ];
  const changeRequests = [
    request(400, 4, 'request four', 'pattern', 'open', true),
    request(500, 6, 'text only six', 'construction', 'resolved'),
    request(40, 0, 'zero id forty', 'material', 'open'),
    request(30, 0, 'zero id thirty', 'grading', '', true),
    request(800, 8, 'resolved fallback', 'other', '', true),
  ];

  const rows = buildEditRows(callouts, changeRequests);
  assert.deepEqual(
    rows.map((row) => row.number),
    [2, 4, 6, 8, 9, 10, 11, 12],
    'rows are ordered, zero-number requests are id-stable, and zero callouts are index-stable',
  );
  assert.equal(rows.length, 8, 'duplicate positive callouts do not create duplicate edit rows');

  const matched = rowAt(rows, 4);
  assert.equal(matched.crId, 400);
  assert.equal(matched.note, 'request four');
  assert.equal(matched.target, 'pattern');
  assert.equal(matched.status, 'open', 'valid status wins over the legacy resolved boolean');
  assert.equal(matched.callout?.index, 0, 'the first duplicate callout is the row mark');
  assert.equal(matched.mediaId, 40);

  const textOnly = rowAt(rows, 6);
  assert.equal(textOnly.callout, null);
  assert.equal(textOnly.mediaId, 0);

  const legacy = rowAt(rows, 2);
  assert.equal(legacy.crId, 0);
  assert.equal(legacy.note, 'legacy two');
  assert.equal(legacy.target, '');
  assert.equal(legacy.status, 'open');

  assert.equal(rowAt(rows, 8).status, 'resolved', 'resolved boolean is the status fallback');
  assert.equal(rowAt(rows, 9).crId, 30, 'zero-number requests sort by id');
  assert.equal(rowAt(rows, 10).crId, 40, 'zero-number request display numbers never collide');
  assert.equal(rowAt(rows, 11).callout?.index, 3, 'zero callouts retain array-index order');
  assert.equal(rowAt(rows, 12).callout?.index, 4, 'each zero callout gets its own row');
  assert.equal(nextEditNumber(callouts, changeRequests), 13);

  assert.equal(categoryOf(''), '');
  assert.equal(categoryOf('  '), '');
  assert.equal(categoryOf(' Pattern '), 'pattern');
  assert.equal(categoryOf('construction'), 'construction');
  assert.equal(categoryOf('material'), 'material');
  assert.equal(categoryOf('grading'), 'grading');
  assert.equal(categoryOf('other'), 'other');
  assert.equal(categoryOf('sleeve'), 'other');

  const negativeRows = buildEditRows([callout(-1, 'old negative', 90)], []);
  assert.equal(negativeRows[0]?.number, 1, 'invalid non-positive numbers use display numbering');
  assert.equal(nextEditNumber([callout(-1, 'old negative', 90)], []), 2);

  console.log('fixtures: all edit-row rules passed');
}

function runBeta({ buildEditRows, categoryOf, nextEditNumber }) {
  const db = join(homedir(), '.claude/scripts/db.sh');
  const sql = `
SELECT f.id AS fitting_id, 'fitting' AS kind, 0 AS display_order, 0 AS entity_id,
       0 AS callout_number, '' AS note_hex, 0 AS media_id, '' AS target_hex,
       '' AS status_hex, 0 AS resolved, 0 AS carried_from_id
FROM fitting f
UNION ALL
SELECT c.fitting_id, 'callout', c.display_order, c.id,
       COALESCE(c.callout_number, 0), HEX(COALESCE(c.note, '')), COALESCE(c.media_id, 0),
       '', '', 0, 0
FROM fitting_callout c
UNION ALL
SELECT cr.fitting_id, 'request', cr.display_order, cr.id,
       COALESCE(cr.callout_number, 0), HEX(COALESCE(cr.note, '')), 0,
       HEX(COALESCE(cr.target, '')), HEX(COALESCE(cr.status, '')), 0,
       COALESCE(cr.carried_from_id, 0)
FROM fitting_change_request cr
ORDER BY fitting_id, kind, display_order, entity_id`;
  const output = execFileSync(db, ['-e', sql, '--', '--batch', '--raw', '--skip-column-names'], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const fittings = parseBetaRows(output);
  const histogram = new Map();
  const totals = {
    rows: 0,
    textOnly: 0,
    legacy: 0,
    duplicateNumberGroups: 0,
    anomalousFittings: 0,
  };

  console.log(`beta fittings: ${fittings.size}`);
  for (const [fittingId, data] of fittings) {
    const rows = buildEditRows(data.callouts, data.changeRequests);
    const textOnly = rows.filter((row) => row.callout === null).length;
    const legacy = rows.filter((row) => row.crId === 0).length;
    const duplicateNumbers = duplicateNumberSummary(data.callouts);
    const anomalies = fittingAnomalies(data, rows, categoryOf);
    const largestNumber = rows.reduce((max, row) => Math.max(max, row.number), 0);
    const next = nextEditNumber(data.callouts, data.changeRequests);
    assert.ok(next > largestNumber, `fitting ${fittingId}: next number ${next} > ${largestNumber}`);

    totals.rows += rows.length;
    totals.textOnly += textOnly;
    totals.legacy += legacy;
    totals.duplicateNumberGroups += duplicateNumbers.length;
    if (anomalies.length) totals.anomalousFittings += 1;

    for (const cr of data.changeRequests) {
      const target = (cr.target ?? '').trim() || '<empty>';
      histogram.set(target, (histogram.get(target) ?? 0) + 1);
    }

    console.log(
      `fitting ${fittingId}: rows=${rows.length} text-only=${textOnly} ` +
        `legacy-callout-only=${legacy} duplicate-numbers=${duplicateNumbers.join(',') || 'none'} ` +
        `anomalies=${anomalies.join(';') || 'none'}`,
    );
  }

  console.log(
    `beta totals: rows=${totals.rows} text-only=${totals.textOnly} ` +
      `legacy-callout-only=${totals.legacy} duplicate-number-groups=${totals.duplicateNumberGroups} ` +
      `anomalous-fittings=${totals.anomalousFittings}`,
  );
  console.log(
    `target histogram: ${
      [...histogram.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([target, count]) => `${JSON.stringify(target)}=${count}`)
        .join(' ') || 'empty'
    }`,
  );
}

function parseBetaRows(output) {
  const fittings = new Map();
  for (const line of output.trim().split('\n')) {
    if (!line) continue;
    const fields = line.split('\t');
    assert.equal(fields.length, 11, `unexpected beta row: ${line}`);
    const [
      fittingIdRaw,
      kind,
      ,
      entityIdRaw,
      calloutNumberRaw,
      noteHex,
      mediaIdRaw,
      targetHex,
      statusHex,
      resolvedRaw,
      carriedFromIdRaw,
    ] = fields;
    const fittingId = Number(fittingIdRaw);
    const data = fittings.get(fittingId) ?? { callouts: [], changeRequests: [] };
    fittings.set(fittingId, data);

    if (kind === 'callout') {
      data.callouts.push({
        number: Number(calloutNumberRaw),
        note: fromHex(noteHex),
        mediaId: Number(mediaIdRaw),
      });
    } else if (kind === 'request') {
      data.changeRequests.push({
        id: Number(entityIdRaw),
        fittingId,
        target: fromHex(targetHex),
        note: fromHex(noteHex),
        calloutNumber: Number(calloutNumberRaw),
        resolved: resolvedRaw === '1',
        status: fromHex(statusHex),
        carriedFromId: Number(carriedFromIdRaw),
      });
    } else {
      assert.equal(kind, 'fitting', `unknown beta row kind: ${kind}`);
    }
  }
  return new Map([...fittings.entries()].sort(([a], [b]) => a - b));
}

function fittingAnomalies(data, rows, categoryOf) {
  const anomalies = [];
  const duplicateRequests = duplicateNumberSummary(data.changeRequests, 'calloutNumber');
  if (duplicateRequests.length) anomalies.push(`duplicate-requests:${duplicateRequests.join(',')}`);

  const negativeCallouts = data.callouts.filter((callout) => (callout.number ?? 0) < 0).length;
  if (negativeCallouts) anomalies.push(`negative-callout-number:${negativeCallouts}`);
  const negativeRequests = data.changeRequests.filter((cr) => (cr.calloutNumber ?? 0) < 0).length;
  if (negativeRequests) anomalies.push(`negative-request-number:${negativeRequests}`);

  const invalidTargets = [
    ...new Set(
      data.changeRequests
        .map((cr) => (cr.target ?? '').trim())
        .filter(
          (target) => target && categoryOf(target) === 'other' && target.toLowerCase() !== 'other',
        ),
    ),
  ];
  if (invalidTargets.length) anomalies.push(`unknown-target:${invalidTargets.join(',')}`);

  const invalidStatuses = [
    ...new Set(
      data.changeRequests
        .map((cr) => cr.status ?? '')
        .filter((status) => status && status !== 'open' && status !== 'resolved'),
    ),
  ];
  if (invalidStatuses.length) anomalies.push(`unknown-status:${invalidStatuses.join(',')}`);

  const rowNumbers = rows.map((row) => row.number);
  if (new Set(rowNumbers).size !== rowNumbers.length) anomalies.push('duplicate-row-number');
  return anomalies;
}

function duplicateNumberSummary(items, field = 'number') {
  const counts = new Map();
  for (const item of items) {
    const number = Number(item[field] ?? 0);
    if (number > 0) counts.set(number, (counts.get(number) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort(([a], [b]) => a - b)
    .map(([number, count]) => `${number}x${count}`);
}

function rowAt(rows, number) {
  const row = rows.find((item) => item.number === number);
  assert.ok(row, `missing row ${number}`);
  return row;
}

function callout(number, note, mediaId) {
  return { number, note, mediaId };
}

function request(id, calloutNumber, note, target, status, resolved = false) {
  return {
    id,
    fittingId: 1,
    target,
    note,
    calloutNumber,
    resolved,
    zone: '',
    pieceId: 0,
    status,
    carriedFromId: 0,
    createdBy: '',
    roundNumber: 1,
    pieceIds: [],
  };
}

function fromHex(value) {
  return Buffer.from(value, 'hex').toString('utf8');
}
