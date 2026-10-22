import { scanDxfSizes } from 'components/managers/tech-card/components/nesting/dxf-size-plan';
import {
  contourIsCutLine,
  defaultContourLayer,
  layerOptions,
} from 'components/managers/tech-card/components/nesting/contour-layer';
import { buildAllowanceIndex } from 'components/managers/tech-card/components/nesting/contour-allowance';
import { dedupeUniPieces } from 'components/managers/tech-card/components/nesting/piece-selection';
import {
  defaultGrainLayer,
  grainLayerOptions,
} from 'components/managers/tech-card/components/nesting/grain';
import { splitPiecesBySize } from 'components/managers/tech-card/components/nesting/split-pieces';
import { readManifestBytes } from 'lib/pattern-import/manifest';
import type { ConversionManifest } from 'lib/pattern-import/types';
import { dxfPairs } from 'lib/nesting/dxf/insunits';
import { parseFiles } from 'lib/nesting/worker/parse-files';
import { applySeamAllowance } from 'lib/nesting/geom/seam-allowance';
import { area, bounds } from 'lib/nesting/geom/polygon';
import { NEST_DEFAULTS, type PieceDTO, type PieceManifestFacts, type Pt } from 'lib/nesting/types';
import { drawnRollFootprint, straightenRollPiece } from './roll-geometry';

const stripExt = (name: string) => name.replace(/\.[^.]+$/, '') || 'pattern';
const bare = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

type PieceCode = { identity: string; size: string };

export type RollPieceTemplate = {
  piece: PieceDTO;
  /** Concave keep-out containing every rendered stroke and the complete piece label. */
  footprint: Pt[];
  identity: string;
  size: string;
  /** A paper template used for two mirrored cut pieces is printed once and marked x2. */
  cutMultiplier: number;
  label: string;
};

export type RollSourceModel = {
  title: string;
  templates: RollPieceTemplate[];
  sizes: string[];
  grainLayer: string;
  warnings: string[];
};

const sourceCache = new WeakMap<ArrayBuffer, Map<string, RollSourceModel>>();

export const ROLL_PIECE_LABEL_MM = 3;

function pieceLabel(template: { identity: string; size: string; cutMultiplier: number }): string {
  return [template.identity, template.size || 'OS', template.cutMultiplier === 2 ? '×2' : '']
    .filter(Boolean)
    .join(' · ');
}

function manifestFacts(manifest: ConversionManifest | null): Map<string, PieceManifestFacts> {
  const out = new Map<string, PieceManifestFacts>();
  if (!manifest?.gate?.passed) return out;
  const pieceByIdentity = new Map(
    manifest.pieces.map((piece) => [piece.identity.trim().toLowerCase(), piece]),
  );
  for (const block of manifest.blocks) {
    const piece = pieceByIdentity.get(block.identity.trim().toLowerCase());
    if (!piece) continue;
    const hand = piece.pairHand;
    const mods = hand ? piece.mods.filter((x) => x.toUpperCase() !== hand) : piece.mods;
    out.set(block.block.trim().toLowerCase(), {
      techCardId: manifest.techCardId,
      identity: piece.identity.trim(),
      size: piece.ungraded ? '' : block.sizeToken,
      sizeId: piece.ungraded ? 0 : block.sizeId,
      cardName: hand
        ? [piece.code, ...mods].filter(Boolean).join('_') || piece.identity.trim()
        : piece.identity.trim(),
      pairHand: hand,
      pairOf: piece.pairOf ? piece.pairOf.trim() : null,
      unfolded: piece.unfoldedFold,
      halfFold: piece.halfFold === true,
      cutLayer: manifest.layers.cut,
      seamLayer: manifest.layers.seam,
      grainLayer: manifest.layers.grain,
      cutAllowanceCm: manifest.allowanceMm / 10,
    });
  }
  return out;
}

function quantityLabels(text: string): Map<string, number> {
  const out = new Map<string, number>();
  let section = '';
  let awaitingSection = false;
  let entity = '';
  let block = '';
  for (const pair of dxfPairs(text)) {
    if (pair.code === 0) {
      entity = pair.value.trim().toUpperCase();
      if (entity === 'SECTION') awaitingSection = true;
      if (entity === 'ENDSEC') section = '';
      if (entity === 'ENDBLK') block = '';
      continue;
    }
    if (awaitingSection && pair.code === 2) {
      section = pair.value.trim().toUpperCase();
      awaitingSection = false;
      continue;
    }
    if (section !== 'BLOCKS') continue;
    if (entity === 'BLOCK' && pair.code === 2 && !pair.value.trim().startsWith('*')) {
      block = pair.value.trim();
      continue;
    }
    if (!block || (entity !== 'TEXT' && entity !== 'MTEXT') || pair.code !== 1) continue;
    const match = /^\s*(?:quantity|qty)\s*:\s*(\d+)\s*$/i.exec(pair.value);
    if (match) out.set(block.toLowerCase(), Number(match[1]));
  }
  return out;
}

function dtoFromRaw(
  raw: ReturnType<typeof parseFiles>['raws'][number],
  id: number,
  fileName: string,
  facts: ReadonlyMap<string, PieceManifestFacts>,
): PieceDTO {
  const bb = bounds(raw.poly);
  const poly = raw.poly.map((p) => ({ x: p.x - bb.minX, y: p.y - bb.minY }));
  const fact = raw.blockName ? facts.get(raw.blockName.trim().toLowerCase()) : undefined;
  return {
    id,
    name: raw.blockName == null ? `piece ${id}` : raw.name,
    blockName: raw.blockName ?? '',
    layer: raw.layer,
    grain: raw.grain,
    inner: raw.inner.map((path) => ({
      layer: path.layer,
      closed: path.closed,
      pts: path.pts.map((p) => ({ x: p.x - bb.minX, y: p.y - bb.minY })),
    })),
    source: fileName,
    fileIndex: 0,
    poly,
    bboxW: bb.maxX - bb.minX,
    bboxH: bb.maxY - bb.minY,
    areaCm2: area(poly),
    originX: bb.minX,
    originY: bb.minY,
    ...(fact ? { manifest: fact } : {}),
  };
}

function pairMultipliers(
  manifest: ConversionManifest | null,
  quantities: ReadonlyMap<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [block, quantity] of quantities) if (quantity === 2) out.set(block, 2);
  if (!manifest?.gate?.passed) return out;
  const pieceByIdentity = new Map(
    manifest.pieces.map((piece) => [piece.identity.trim().toLowerCase(), piece]),
  );
  for (const block of manifest.blocks) {
    const piece = pieceByIdentity.get(block.identity.trim().toLowerCase());
    // A declared L/R pair is already present as two separate contours. A lone x2 identity is the
    // mirrored-paper-template case: print it once, and tell the cutter to use it twice.
    if (piece?.piecesPerGarment === 2 && !piece.pairHand)
      out.set(block.block.trim().toLowerCase(), 2);
  }
  return out;
}

/** Parse and prepare exactly the same one-contour-per-piece geometry the marker starts from. */
export function readRollSourceModel(dxf: ArrayBuffer, fileName: string): RollSourceModel {
  const cached = sourceCache.get(dxf)?.get(fileName);
  if (cached) return cached;
  const warnings: string[] = [];
  const manifest = readManifestBytes(dxf);
  if (manifest && !manifest.gate?.passed)
    warnings.push(
      'the conversion manifest is not trusted - sizes and pairs were read from the DXF',
    );
  const parsed = parseFiles(
    dxf,
    {
      unit: 'auto',
      tol: NEST_DEFAULTS.tol,
      tolChain: NEST_DEFAULTS.tolChain,
    },
    warnings,
    manifest != null,
  );
  if (parsed.skippedBlocks > 0)
    throw new Error(
      `${parsed.skippedBlocks} block insert(s) could not be read, so the print would be incomplete`,
    );
  if (parsed.unitGuessed)
    warnings.push(`${fileName}: units are not set in the file - ${parsed.unit} assumed`);

  const facts = manifestFacts(manifest);
  const pieces = parsed.raws.map((raw, i) => dtoFromRaw(raw, i + 1, fileName, facts));
  if (pieces.length === 0) throw new Error('the drawing has no pattern pieces');

  const text = new TextDecoder('windows-1252').decode(new Uint8Array(dxf));
  const scan = scanDxfSizes(text, () => false);
  const sizeTokens = new Set(scan.sizes.map(bare));
  for (const size of manifest?.sizes ?? []) sizeTokens.add(bare(size.token));
  for (const fact of facts.values()) if (fact.size) sizeTokens.add(bare(fact.size));
  const split = splitPiecesBySize(pieces, sizeTokens);

  const allowanceIndex = buildAllowanceIndex(pieces);
  const options = layerOptions(pieces, split.codeById, allowanceIndex);
  const contourLayer = defaultContourLayer(options);
  if (!contourLayer) throw new Error('the drawing has no usable contour layer');
  const missingBlocks = new Set(
    pieces
      .filter((piece) => piece.blockName && piece.layer !== contourLayer)
      .map((piece) => piece.blockName!),
  );
  for (const piece of pieces)
    if (piece.blockName && piece.layer === contourLayer) missingBlocks.delete(piece.blockName);
  if (missingBlocks.size > 0)
    warnings.push(
      `${missingBlocks.size} block(s) have no contour on layer ${contourLayer}: ${[...missingBlocks]
        .slice(0, 5)
        .join(', ')}`,
    );

  const dedupe = dedupeUniPieces(pieces, split.codeById, contourLayer);
  if (dedupe.conflicts.length > 0)
    throw new Error('the drawing has conflicting UNI pieces and cannot be printed safely');
  const selected = pieces.filter(
    (piece) => piece.layer === contourLayer && !dedupe.excludedIds.has(piece.id),
  );
  const grainLayer = defaultGrainLayer(grainLayerOptions(selected));
  const straightened = selected.map((piece) => straightenRollPiece(piece, grainLayer).piece);
  const measured = options.find((option) => option.layer === contourLayer)?.allowance;
  const allowanceCm = contourIsCutLine(measured) ? 0 : NEST_DEFAULTS.seamAllowanceCm;
  const seam = applySeamAllowance(straightened, allowanceCm);
  if (allowanceCm > 0)
    warnings.push(`a ${(allowanceCm * 10).toFixed(0)} mm seam allowance was added to the contour`);
  if (seam.hulled.length > 0)
    warnings.push(
      `${seam.hulled.length} contour(s) used a safe convex allowance fallback: ${seam.hulled
        .slice(0, 5)
        .join(', ')}`,
    );

  const codeById = split.codeById as ReadonlyMap<number, PieceCode>;
  const quantities = quantityLabels(text);
  const multipliers = pairMultipliers(manifest, quantities);
  const templates: RollPieceTemplate[] = [];
  const seenPairs = new Set<string>();
  for (const piece of seam.pieces) {
    const code = codeById.get(piece.id) ?? { identity: piece.name, size: '' };
    const block = (piece.blockName ?? '').trim().toLowerCase();
    const cutMultiplier = multipliers.get(block) ?? 1;
    const pairKey = `${code.size.toLowerCase()}\u0000${code.identity.toLowerCase()}`;
    if (cutMultiplier === 2) {
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
    }
    const template = {
      piece,
      identity: code.identity || piece.name,
      size: code.size,
      cutMultiplier,
    };
    const label = pieceLabel(template);
    templates.push({
      ...template,
      label,
      footprint: drawnRollFootprint(piece, label, ROLL_PIECE_LABEL_MM),
    });
  }

  const sizes = split.groups
    .map((group) => group.size)
    .filter((size) => templates.some((template) => template.size === size));
  if (sizes.length === 1 && sizes[0] === '')
    warnings.push('the drawing has no size row - shown as OS');
  const source = {
    title: stripExt(fileName),
    templates,
    sizes: sizes.map((size) => size || 'OS'),
    grainLayer,
    warnings: [...new Set(warnings)],
  };
  const files = sourceCache.get(dxf) ?? new Map<string, RollSourceModel>();
  files.set(fileName, source);
  sourceCache.set(dxf, files);
  return source;
}
