#!/usr/bin/env node
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const fixture = JSON.parse(
  readFileSync(resolve(here, 'fixtures/dxf-piece-shape/shape-cases.json'), 'utf8'),
);

async function bundle() {
  const outfile = resolve(tmpdir(), `dxf-piece-shape-check-${process.pid}.mjs`);
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

function area(poly) {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum / 2);
}

function parsed(entries) {
  const pieces = entries.map(({ block, contour }, index) => {
    const maxX = Math.max(...contour.map(([x]) => x));
    const maxY = Math.max(...contour.map(([, y]) => y));
    return {
      id: index + 1,
      name: block,
      blockName: block,
      layer: '1',
      source: 'fixture.dxf',
      fileIndex: 0,
      poly: contour.map(([x, y]) => ({ x, y })),
      bboxW: maxX,
      bboxH: maxY,
      areaCm2: area(contour),
      originX: index * 10,
      originY: 0,
    };
  });
  return { pieces, blockNames: entries.map((entry) => entry.block) };
}

const cardPieces = [
  { lineKey: 'piece-old', name: 'OLD_PANEL' },
  { lineKey: 'piece-pck-l', name: 'PCK_L' },
  { lineKey: 'piece-pck-l-1', name: 'PCK_L_1' },
  { lineKey: 'piece-sleeve-r', name: 'SLEEVE_R' },
];

async function main() {
  const M = await bundle();
  const known = parsed([
    { block: 'OLD_PANEL', contour: fixture.contours.rename },
    { block: 'PCK_L', contour: fixture.contours.pocket },
    { block: 'PCK_L_1', contour: fixture.contours.pocket },
    { block: 'SLEEVE_R', contour: fixture.contours.sleeveRight },
  ]);
  const aliases = cardPieces.map((piece) => ({
    blockName: piece.name,
    pieceLineKey: piece.lineKey,
  }));
  const references = M.pieceShapeReferences({
    parse: known,
    // OLD_PANEL deliberately has no alias: this is the post-vanish state after another file
    // dropped its dead link; the live piece name still recovers its last loaded geometry.
    bindings: aliases.filter((alias) => alias.blockName !== 'OLD_PANEL'),
    pieces: cardPieces,
    sizeTokens: [],
  });

  const renamed = parsed([{ block: 'RENAMED_PANEL', contour: fixture.contours.renameQuarterTurn }]);
  const renameProposal = M.proposePieceShapes({
    target: renamed,
    references,
    pieces: cardPieces,
    sizeTokens: [],
  }).get('renamed_panel');
  assert(
    'same contour under a new name proposes the old live piece after its alias vanished',
    renameProposal?.basis === 'shape' && renameProposal.pieceLineKey === 'piece-old',
  );
  assert(
    'quarter-turn comparison stays inside every calibrated threshold',
    !!renameProposal &&
      renameProposal.areaRel <= M.SHAPE_PROPOSAL_THRESHOLDS.areaRel &&
      renameProposal.perimeterRel <= M.SHAPE_PROPOSAL_THRESHOLDS.perimeterRel &&
      renameProposal.aspectLog <= M.SHAPE_PROPOSAL_THRESHOLDS.aspectLog &&
      renameProposal.outline <= M.SHAPE_PROPOSAL_THRESHOLDS.outline,
  );

  const sizedPieces = [
    { lineKey: 'piece-base-size', name: 'BASE_REF' },
    { lineKey: 'piece-other-size', name: 'OTHER_REF' },
  ];
  const sizedKnown = parsed([
    { block: 'BASE_REF_S', contour: fixture.contours.pocket },
    { block: 'BASE_REF_M', contour: fixture.contours.rename },
    { block: 'OTHER_REF_S', contour: fixture.contours.rename },
    { block: 'OTHER_REF_M', contour: fixture.contours.pocket },
  ]);
  const sizedReferences = M.pieceShapeReferences({
    parse: sizedKnown,
    bindings: sizedPieces.map((piece) => ({
      blockName: piece.name,
      pieceLineKey: piece.lineKey,
    })),
    pieces: sizedPieces,
    sizeTokens: ['s', 'm'],
  });
  const sizedTarget = parsed([
    { block: 'RENAMED_SIZE_S', contour: fixture.contours.rename },
    { block: 'RENAMED_SIZE_M', contour: fixture.contours.rename },
  ]);
  const preferredProposal = M.proposePieceShapes({
    target: sizedTarget,
    references: sizedReferences,
    pieces: sizedPieces,
    sizeTokens: ['s', 'm'],
    preferredSizeTokens: ['m'],
  }).get('renamed_size');
  assert(
    'shape matching prefers the card base/sample size when it exists in both blocks',
    preferredProposal?.pieceLineKey === 'piece-base-size',
  );

  const scope = { bomLineKey: 'bom-main', fabricPurpose: 'MAIN' };
  const renameInput = {
    scope,
    pieces: [cardPieces[0]],
    aliases: [{ ...scope, blockName: 'OLD_PANEL', pieceLineKey: 'piece-old' }],
    operations: [],
    oldSheet: { parse: parsed([{ block: 'OLD_PANEL', contour: fixture.contours.rename }]) },
    newSheet: { parse: renamed },
    sizeTokens: [],
  };
  const renamePlan = M.reconcile(renameInput);
  let minted = 0;
  let uploads = 0;
  const oldBytes = new TextEncoder().encode('0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n');
  const newBytes = new TextEncoder().encode('0\nSECTION\n2\nHEADER\n999\nnew\n0\nENDSEC\n0\nEOF\n');
  const reupload = await M.reuploadSheet(
    {
      patterns: [
        {
          lineKey: 'sheet-main',
          url: 'mem://old.dxf',
          filename: 'old-panel.dxf',
          ...scope,
        },
      ],
      pieces: renameInput.pieces,
      aliases: renameInput.aliases,
      operations: [],
      scopeKey: scope.fabricPurpose,
      scope,
      scopeOf: (binding) => binding.fabricPurpose ?? binding.bomLineKey ?? '',
      isDxf: (url) => url.endsWith('.dxf'),
      sizeTokens: [],
      planDelete: () => null,
    },
    { name: 'renamed-panel.dxf', bytes: newBytes },
    {
      download: async () => oldBytes,
      parse: async (files) => ({
        ...(files[0]?.name === 'renamed-panel.dxf' ? renamed : renameInput.oldSheet.parse),
        failedFiles: 0,
      }),
      sha256: async (bytes) => (bytes === newBytes ? 'new' : 'old'),
      upload: async (file) => {
        uploads++;
        return {
          url: 'mem://new.dxf',
          filename: file.name,
          sizeBytes: file.bytes.byteLength,
          sha256: 'new',
        };
      },
      otherSheets: async () => [],
      mintKey: () => `mint-${++minted}`,
      makePiece: (seed) => seed,
      makeAlias: (seed) => seed,
    },
  );
  assert(
    'shape rename is proposed but never auto-applied by re-upload reconcile',
    renamePlan.needsShapeReview &&
      !renamePlan.needsPieceMatch &&
      reupload.kind === 'match' &&
      uploads === 1 &&
      minted === 0,
  );

  const shapeRow = renamePlan.rows
    .flatMap((row) =>
      row.new.map((next) => ({
        block: next.identity,
        suggested: row.links.find((link) => link.identity === next.identity)?.pieceLineKey ?? '',
        choice: M.CREATE_PIECE_CHOICE,
      })),
    )
    .find((row) => row.block === 'RENAMED_PANEL');
  const acceptedShape = shapeRow ? M.autoPieceMatchRows([shapeRow], new Set())[0] : undefined;
  const autoRenamePlan = {
    ...renamePlan,
    needsShapeReview: false,
    rows: renamePlan.rows.map((row) => ({
      ...row,
      links: row.links.map((link) =>
        link.identity === acceptedShape?.block
          ? { ...link, pieceLineKey: acceptedShape.choice, name: '' }
          : link,
      ),
    })),
  };
  const shapeApplied = M.applyPlan(renameInput, autoRenamePlan, {
    mintKey: () => 'must-not-mint',
    makePiece: (seed) => seed,
    makeAlias: (seed) => seed,
  });
  assert(
    'AUTO applies a shape-only proposal',
    acceptedShape?.choice === 'piece-old' &&
      shapeApplied.refused === null &&
      shapeApplied.addedPieceKeys.length === 0 &&
      shapeApplied.aliases.some(
        (alias) => alias.blockName === 'RENAMED_PANEL' && alias.pieceLineKey === 'piece-old',
      ),
  );
  const authored = [
    {
      title: 'join panels',
      inputKeys: ['piece-old', 'piece-pck-l'],
      outputUnitKey: 'PANEL',
      outputUnitName: 'Panel',
      smv: '2.4',
    },
    {
      title: 'finish panel',
      inputKeys: ['PANEL'],
      outputUnitKey: 'BODY',
      outputUnitName: 'Body',
      smv: '1.1',
    },
    {
      title: 'panel callout',
      inputKeys: ['BODY'],
      outputUnitKey: '',
      outputUnitName: '',
      media: [{ annotations: [{ pieceLineKey: 'piece-old' }] }],
    },
  ];
  const pieceDelete = M.planOldPieceOps(authored, new Set(['piece-old']));
  const withoutReview = (operation) => {
    const { review: _review, ...rest } = operation;
    return rest;
  };
  assert(
    'piece matcher Save/AUTO keeps operation count, order, joins and output units',
    JSON.stringify(pieceDelete.operations.map(withoutReview)) === JSON.stringify(authored) &&
      pieceDelete.operations[0].review === 'remapped' &&
      pieceDelete.operations[1] === authored[1] &&
      pieceDelete.operations[2].review === 'remapped',
  );
  const identityRemap = M.planOldPieceOps(
    authored,
    new Set(['piece-old']),
    new Map([['piece-old', 'piece-successor']]),
  );
  const ambiguousRemap = M.planOldPieceOps(
    authored,
    new Set(['piece-old', 'piece-pck-l']),
    new Map([
      ['piece-old', 'piece-successor'],
      ['piece-pck-l', 'piece-successor'],
    ]),
  );
  assert(
    'piece matcher only permits a 1:1 in-place piece-key remap',
    JSON.stringify(identityRemap.operations[0].inputKeys) ===
      JSON.stringify(['piece-successor', 'piece-pck-l']) &&
      identityRemap.operations[0].outputUnitKey === 'PANEL' &&
      identityRemap.operations[1] === authored[1] &&
      identityRemap.operations.length === authored.length &&
      JSON.stringify(ambiguousRemap.operations[0].inputKeys) ===
        JSON.stringify(authored[0].inputKeys),
  );
  assert(
    'AUTO is disabled by the same blocking guard as SAVE',
    M.pieceMatchActionDisabled(true, false, true),
  );

  const pockets = parsed([
    { block: 'PCK_L', contour: fixture.contours.pocket },
    { block: 'PCK_L_1', contour: fixture.contours.pocket },
  ]);
  const pocketProposals = M.proposePieceShapes({
    target: pockets,
    references,
    pieces: cardPieces,
    sizeTokens: [],
  });
  assert(
    'identical PCK_L and PCK_L_1 geometry cannot override their names',
    !pocketProposals.has('pck_l') && !pocketProposals.has('pck_l_1'),
  );
  const pocketInput = {
    scope,
    pieces: cardPieces.slice(1, 3),
    aliases: [
      { ...scope, blockName: 'PCK_L', pieceLineKey: 'piece-pck-l' },
      { ...scope, blockName: 'PCK_L_1', pieceLineKey: 'piece-pck-l-1' },
    ],
    operations: [],
    oldSheet: { parse: pockets },
    newSheet: { parse: pockets },
    sizeTokens: [],
  };
  const pocketPlan = M.reconcile(pocketInput);
  const pocketLinks = new Map(
    pocketPlan.rows.flatMap((row) => row.links.map((link) => [link.identity, link.pieceLineKey])),
  );
  assert(
    'reconcile keeps identical named pockets as two pieces',
    pocketLinks.get('PCK_L') === 'piece-pck-l' && pocketLinks.get('PCK_L_1') === 'piece-pck-l-1',
  );

  const sleeveLeft = parsed([{ block: 'SLEEVE_L', contour: fixture.contours.sleeveLeft }]);
  const sleeveProposals = M.proposePieceShapes({
    target: sleeveLeft,
    references,
    pieces: cardPieces,
    sizeTokens: [],
  });
  assert('_L and _R mirror contours do not cross-match by shape', !sleeveProposals.has('sleeve_l'));

  console.log(`\n${checks}/${checks} checks green`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
