#!/usr/bin/env node
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const fixtures = resolve(here, 'fixtures/dxf-reupload-unlinked');

async function bundle() {
  const outfile = resolve(tmpdir(), `dxf-reupload-unlinked-check-${process.pid}.mjs`);
  await build({
    entryPoints: [resolve(here, 'dxf-reupload-check-entry.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
    absWorkingDir: root,
  });
  return import(pathToFileURL(outfile).href);
}

let checks = 0;
function assert(name, condition, detail = '') {
  checks++;
  if (condition) {
    console.log(`  ✓ ${name}`);
    return;
  }
  throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const ab = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const lower = (value) => value.trim().toLowerCase();

async function main() {
  const M = await bundle();
  const snapshot = JSON.parse(readFileSync(resolve(fixtures, 'snapshot-10-lining.json'), 'utf8'));
  const dxf = new Uint8Array(readFileSync(resolve(fixtures, 'lining-pattern69-trimmed.dxf')));
  const parsed = await M.parseSheets(
    [{ name: 'lining-pattern69-trimmed.dxf', open: async () => ab(dxf) }],
    { ...M.RECONCILE_PARSE },
  );
  assert(
    'fixture parses ten lining identities',
    parsed.failedFiles === 0 && parsed.pieces.length === 10,
  );

  const input = {
    scope: snapshot.scope,
    pieces: snapshot.pieces,
    aliases: snapshot.aliases,
    operations: snapshot.operations,
    oldSheet: { parse: parsed, sha256: 'old' },
    newSheet: { parse: parsed, sha256: 'new' },
    sizeTokens: [],
  };
  const plan = M.reconcile(input);
  const reusedLinks = plan.rows
    .flatMap((row) => row.links)
    .filter((link) => link.pieceLineKey)
    .map((link) => [link.identity, link.pieceLineKey]);
  const unresolved = plan.rows.filter((row) => row.tier === 'unlinked');
  assert(
    'snapshot-10 reconcile reuses seven live pieces',
    reusedLinks.length === 7 &&
      reusedLinks.every(([identity, key]) =>
        snapshot.pieces.some((piece) => piece.name === identity && piece.lineKey === key),
      ),
  );
  assert(
    'three truly new identities require PieceMatchModal',
    plan.needsPieceMatch &&
      unresolved
        .map((row) => row.new[0].identity)
        .sort()
        .join('|') === [...snapshot.newPieceIdentities].sort().join('|'),
  );

  let minted = 0;
  const applyDeps = {
    mintKey: () => `new-${++minted}`,
    makePiece: (seed) => ({
      lineKey: seed.lineKey,
      name: seed.name,
      piecesPerGarment: seed.piecesPerGarment,
      cutSymmetry: seed.cutSymmetry,
    }),
    makeAlias: (seed) => ({ ...seed }),
    makeJoin: (seed) => ({
      inputKeys: seed.inputKeys,
      outputUnitKey: seed.outputUnitKey,
      outputUnitName: seed.outputUnitName,
    }),
  };
  const guarded = M.applyPlan(input, plan, applyDeps);
  assert(
    'unresolved plan is not auto-applied',
    guarded.refused?.reason === 'unresolved' && guarded.aliases.length === 0 && minted === 0,
  );

  // The modal's default for an unmatched identity is "create". Resolve only those rows, then run
  // the same deterministic apply path to verify the complete mapping and preserved live keys.
  const decided = {
    ...plan,
    needsPieceMatch: false,
    rows: plan.rows.map((row) =>
      row.tier !== 'unlinked'
        ? row
        : {
            ...row,
            tier: 'added',
            links: row.new.map((next) => ({
              identity: next.identity,
              pieceLineKey: null,
              name: next.identity,
            })),
          },
    ),
  };
  const applied = M.applyPlan(input, decided, applyDeps);
  const aliasByIdentity = new Map(applied.aliases.map((alias) => [lower(alias.blockName), alias]));
  assert(
    'resolved reconcile/apply aliases every DXF identity',
    parsed.blockNames.every((name) => aliasByIdentity.has(lower(name))),
  );
  assert(
    'resolved reconcile/apply preserves all seven production lineKeys',
    snapshot.pieces.every(
      (piece) => aliasByIdentity.get(lower(piece.name))?.pieceLineKey === piece.lineKey,
    ),
  );
  assert(
    'resolved reconcile/apply creates exactly three new pieces',
    applied.addedPieceKeys.length === 3 &&
      applied.pieces
        .filter((piece) => applied.addedPieceKeys.includes(piece.lineKey))
        .map((piece) => piece.name)
        .sort()
        .join('|') === [...snapshot.newPieceIdentities].sort().join('|'),
  );

  const pckOnly = {
    pieces: parsed.pieces.filter((piece) => piece.blockName === 'PCK_L'),
    blockNames: ['PCK_L'],
  };
  const ambiguousInput = {
    ...input,
    pieces: [
      { lineKey: 'piece-space', name: 'PCK L' },
      { lineKey: 'piece-dash', name: 'PCK-L' },
    ],
    oldSheet: { parse: pckOnly },
    newSheet: { parse: pckOnly },
  };
  const ambiguous = M.reconcile(ambiguousInput);
  assert(
    'ambiguous loose-name block flags PieceMatchModal',
    ambiguous.needsPieceMatch && ambiguous.rows.some((row) => row.tier === 'unlinked'),
  );

  const revised = new TextEncoder().encode(
    new TextDecoder().decode(dxf).replace('0\nEOF\n', '999\nre-upload\n0\nEOF\n'),
  );
  const card = {
    patterns: [
      {
        lineKey: 'lining-sheet',
        url: 'mem://old/lining.dxf',
        filename: 'lining.dxf',
        ...snapshot.scope,
      },
    ],
    pieces: ambiguousInput.pieces,
    aliases: [],
    operations: [],
    scopeKey: snapshot.scope.fabricPurpose,
    scope: snapshot.scope,
    scopeOf: (binding) => binding.fabricPurpose ?? binding.bomLineKey ?? '',
    isDxf: (url) => url.endsWith('.dxf'),
    sizeTokens: [],
    planDelete: () => null,
  };
  let uploads = 0;
  let madePieces = 0;
  const parse = async (files) => {
    const result = await M.parseSheets(
      files.map((file) => ({ name: file.name, open: async () => ab(file.bytes) })),
      { ...M.RECONCILE_PARSE },
    );
    return {
      pieces: result.pieces,
      blockNames: result.blockNames,
      failedFiles: result.failedFiles,
    };
  };
  const outcome = await M.reuploadSheet(
    card,
    { name: 'lining-reupload.dxf', bytes: revised },
    {
      download: async () => dxf,
      parse,
      sha256: M.sha256Hex,
      upload: async (file) => {
        uploads++;
        return {
          url: 'mem://new/lining.dxf',
          filename: file.name,
          sizeBytes: file.bytes.byteLength,
          sha256: await M.sha256Hex(file.bytes),
        };
      },
      otherSheets: async () => [],
      mintKey: () => 'must-not-mint',
      makePiece: (seed) => {
        madePieces++;
        return seed;
      },
      makeAlias: (seed) => seed,
      makeJoin: (seed) => seed.before,
    },
  );
  assert(
    'occupied re-upload routes unresolved plan to PieceMatchModal without applying it',
    outcome.kind === 'match' &&
      outcome.plan.needsPieceMatch &&
      uploads === 1 &&
      madePieces === 0 &&
      card.patterns[0].url === 'mem://old/lining.dxf' &&
      card.aliases.length === 0,
  );

  console.log(`\n${checks}/${checks} checks green`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
