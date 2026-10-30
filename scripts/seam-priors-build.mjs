#!/usr/bin/env node
// Learned seam priors (unit-seams E): dump the owner's saved seams into a fixture the guess learns
// from. Read-only: prod through `db.sh --prod` (SELECT), plus beta cards whose product prod does
// not have (beta copies of prod cards are the same product and are skipped). No keys leave the
// database — a row keeps piece names, the edge shape numbers and whether it was kept or refused.
//
//   node scripts/seam-priors-build.mjs            # prod + beta-only products
//   node scripts/seam-priors-build.mjs --prod     # prod only

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const OUT = resolve(
  'src/components/managers/tech-card/components/step-seams/signals/prior-labels.json',
);
const DB = resolve(homedir(), '.claude/scripts/db.sh');

const SQL = `
SELECT JSON_OBJECT('t', 'seam', 'card', s.tech_card_id, 'kind', s.kind, 'status', s.status,
  'a', s.side_a, 'b', s.side_b) FROM tech_card_seam s;
SELECT JSON_OBJECT('t', 'piece', 'card', p.tech_card_id, 'key', p.line_key, 'name', p.name)
  FROM tech_card_piece p WHERE p.tech_card_id IN (SELECT DISTINCT tech_card_id FROM tech_card_seam);
SELECT JSON_OBJECT('t', 'card', 'card', c.id, 'name', c.name)
  FROM tech_card c WHERE c.id IN (SELECT DISTINCT tech_card_id FROM tech_card_seam);
`;

function read(prod) {
  const args = [
    ...(prod ? ['--prod'] : []),
    '-e',
    SQL,
    '--',
    '--batch',
    '--raw',
    '--skip-column-names',
  ];
  const raw = execFileSync(DB, args, {
    encoding: 'utf8',
    maxBuffer: 64 << 20,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return raw
    .split('\n')
    .filter((l) => l.trim().startsWith('{'))
    .map((l) => JSON.parse(l));
}

const side = (raw, names) =>
  (typeof raw === 'string' ? JSON.parse(raw) : raw).map((x) => ({
    name: names.get(x.piece_line_key) ?? '',
    lenMm: x.len_mm,
    share: x.perim_share ?? 0,
    turnDeg: x.turn_deg ?? 0,
    notches: x.notches ?? 0,
  }));

function labelsOf(rows, seen) {
  const cards = new Map(rows.filter((r) => r.t === 'card').map((r) => [r.card, r.name.trim()]));
  const names = new Map(rows.filter((r) => r.t === 'piece').map((r) => [r.key, r.name]));
  const out = [];
  for (const r of rows) {
    if (r.t !== 'seam') continue;
    const family = (cards.get(r.card) ?? `card ${r.card}`).toLowerCase();
    if (seen && seen.has(family)) continue;
    out.push({ family, kind: r.kind, status: r.status, a: side(r.a, names), b: side(r.b, names) });
  }
  return out;
}

const prodOnly = process.argv.includes('--prod');
const prod = labelsOf(read(true), null);
const families = new Set(prod.map((l) => l.family));
const beta = prodOnly ? [] : labelsOf(read(false), families);
const labels = [...prod, ...beta].filter(
  (l) => l.status === 'confirmed' || l.status === 'rejected',
);

writeFileSync(
  OUT,
  `${JSON.stringify({ builtAt: new Date().toISOString().slice(0, 10), labels }, null, 1)}\n`,
);
execFileSync('npx', ['prettier', '--write', OUT], { stdio: 'ignore' });
const fams = new Set(labels.map((l) => l.family));
console.log(`${labels.length} saved seams on ${fams.size} products → ${OUT}`);
