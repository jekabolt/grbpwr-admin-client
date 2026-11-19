import { buildAst, numOr, str, type RawDxf } from '../adapters/dxf/ast';
import type { DxfBlockPiece } from '../adapters/dxf/dxf-types';
import { readDxf } from '../adapters/dxf/extract';
import { segmentDxf } from '../adapters/dxf/segment';
import { loadDxf, type LoadedDxf, type Tag } from '../adapters/dxf/tags';
import { sha256Hex } from '../adapters/vector/builder';
import { AUTHORED_POINT_LAYERS } from '../manifest/authored-point';
import { footOnSegment, pointInPolygon } from '../semantics/geom';
import { PATIMPORT, type PtMm } from '../types';
import { num, serialize } from './format';

const layer = AUTHORED_POINT_LAYERS['draft-point'];
const opts = { sagittaMm: PATIMPORT.sagittaMm, keepFills: true };

export type RetainedRankedDraftPointInputV1 = Readonly<{
  file: Readonly<{ id: string; name: string; bytes: ArrayBuffer }>;
  sourceSha256: string;
  blockName: string;
  sizeToken: string;
  /** In the original millimetre block frame. */
  pointMm: Readonly<PtMm>;
}>;

export type RetainedRankedDraftPointResultV1 = Readonly<{
  bytes: ArrayBuffer;
  sourceSha256: string;
  outputSha256: string;
  blockName: string;
  sizeToken: string;
  pointMm: Readonly<PtMm>;
  insertion: Readonly<{ byteOffset: number; byteLength: number; entitySha256: string }>;
}>;

type Refusal =
  | 'source-moved'
  | 'unsupported-dxf'
  | 'ambiguous-block'
  | 'invalid-point'
  | 'preservation-failed';

export class RetainedRankedDraftPointErrorV1 extends Error {
  constructor(
    readonly code: Refusal,
    detail: string,
  ) {
    super(detail);
    this.name = 'RetainedRankedDraftPointErrorV1';
  }
}

function requirePoint(condition: unknown, code: Refusal, detail: string): asserts condition {
  if (!condition) throw new RetainedRankedDraftPointErrorV1(code, detail);
}

function isEntity(tag: Tag, type: string) {
  return tag.code === 0 && tag.value.trim().toUpperCase() === type;
}

function editableSource(stored: LoadedDxf) {
  const { tok } = stored;
  const ast = buildAst(tok.tags);
  requirePoint(
    !stored.binary &&
      !stored.manifest &&
      !stored.generatedFusing &&
      str(ast.header.$ACADVER ?? [], 1) === 'AC1009' &&
      str(ast.header.$INSUNITS ?? [], 70) === '4' &&
      !ast.header.$HANDSEED &&
      !tok.tags.some(({ code }) => [5, 100, 102, 105, 330, 360].includes(code)),
    'unsupported-dxf',
    'Retaining one point requires handleless R12 DXF in millimetres. Newer DXF needs verified layer and handle allocation.',
  );
  requirePoint(
    ast.sections.filter((section) => section === 'BLOCKS').length === 1 &&
      ast.sections.filter((section) => section === 'ENTITIES').length === 1,
    'unsupported-dxf',
    'The source must have one BLOCKS and one ENTITIES section.',
  );

  const markLayers = ast.layers.filter(({ name }) => name.toUpperCase() === layer);
  requirePoint(
    !ast.sections.includes('TABLES') || (markLayers.length === 1 && markLayers[0].name === layer),
    'unsupported-dxf',
    'The source layer table must already declare the exact Draft point layer.',
  );
  return ast;
}

function findBlockEnd(ast: RawDxf, tags: readonly Tag[], blockName: string) {
  const name = blockName.toUpperCase();
  const blocks = ast.blockOrder.filter((block) => block.name.toUpperCase() === name);
  const [block] = blocks;
  requirePoint(
    blocks.length === 1 &&
      block.name === blockName &&
      block.base.x === 0 &&
      block.base.y === 0 &&
      (block.flags === 0 || block.flags === 64),
    'ambiguous-block',
    'Select one exact native block in its original planar frame.',
  );

  const namesBlock = (entity: RawDxf['entities'][number]) =>
    entity.type === 'INSERT' &&
    entity.tags.some(({ code, value }) => code === 2 && value.trim().toUpperCase() === name);
  const inserts = ast.entities.filter(namesBlock);
  const [insert] = inserts;
  const identityTransform = [
    [10, 0],
    [20, 0],
    [30, 0],
    [41, 1],
    [42, 1],
    [43, 1],
    [44, 0],
    [45, 0],
    [50, 0],
    [66, 0],
    [67, 0],
    [70, 1],
    [71, 1],
    [210, 0],
    [220, 0],
    [230, 1],
  ] as const;
  requirePoint(
    inserts.length === 1 &&
      str(insert.tags, 2) === blockName &&
      insert.tags.filter(({ code }) => code === 2).length === 1 &&
      !insert.paper &&
      !insert.children.length &&
      !ast.blockOrder.some(({ entities }) => entities.some(namesBlock)) &&
      !block.entities.some(({ type }) => type === 'INSERT') &&
      identityTransform.every(
        ([code, value]) =>
          insert.tags.filter((tag) => tag.code === code).length <= 1 &&
          numOr(insert.tags, code, value) === value,
      ),
    'ambiguous-block',
    'The selected block must have one untransformed model-space INSERT.',
  );
  const startIndex = tags.findIndex((tag) => tag.line === block.line && isEntity(tag, 'BLOCK'));
  requirePoint(startIndex >= 0, 'ambiguous-block', 'The source cannot locate the exact raw block.');
  let firstEntity = startIndex + 1;
  while (tags[firstEntity] && tags[firstEntity].code !== 0) firstEntity++;
  const blockTags = tags.slice(startIndex + 1, firstEntity);
  requirePoint(
    blockTags.filter(({ code }) => code === 2).length === 1 && numOr(blockTags, 30, 0) === 0,
    'ambiguous-block',
    'The exact raw block name and planar origin are required.',
  );
  const end = tags
    .slice(firstEntity)
    .find((tag) => isEntity(tag, 'BLOCK') || isEntity(tag, 'ENDBLK') || isEntity(tag, 'ENDSEC'));
  requirePoint(
    end &&
      isEntity(end, 'ENDBLK') &&
      block.entities.every(({ line }) => block.line < line && line < end.line),
    'ambiguous-block',
    'The exact native block has no independent ENDBLK boundary.',
  );
  return { block, line: end.line };
}

function findInsertion(bytes: Uint8Array<ArrayBuffer>, line: number) {
  let width = 0;
  let offset = -1;
  let lineCount = 1;
  for (let index = 0; index < bytes.length; index++) {
    const byte = bytes[index];
    if (byte === 10) {
      const endingWidth = bytes[index - 1] === 13 ? 2 : 1;
      requirePoint(
        !width || width === endingWidth,
        'unsupported-dxf',
        'Mixed line endings cannot be retained.',
      );
      width = endingWidth;
      if (++lineCount === line) offset = index + 1;
    } else {
      requirePoint(
        (byte === 13 && bytes[index + 1] === 10) || (byte >= 32 && byte <= 126),
        'unsupported-dxf',
        'The retained source must contain only printable ASCII DXF and line endings.',
      );
    }
  }
  const boundary = new TextDecoder().decode(bytes.subarray(offset, offset + 32)).split('\n');
  requirePoint(
    offset >= 0 && boundary[0]?.trim() === '0' && boundary[1]?.trim().toUpperCase() === 'ENDBLK',
    'ambiguous-block',
    'The raw insertion byte offset does not identify the block terminator.',
  );
  return { offset, eol: width === 2 ? '\r\n' : '\n' };
}

function hasNativePlanarOutline(block: RawDxf['blockOrder'][number], layer: '1' | '14') {
  const outlines = block.entities.filter(
    (entity) => entity.layer === layer && entity.type === 'POLYLINE',
  );
  const [outline] = outlines;
  return (
    outlines.length === 1 &&
    outline.seqend &&
    outline.children.length >= 3 &&
    numOr(outline.tags, 70, 0) === 1 &&
    numOr(outline.tags, 30, 0) === 0 &&
    numOr(outline.tags, 39, 0) === 0 &&
    numOr(outline.tags, 210, 0) === 0 &&
    numOr(outline.tags, 220, 0) === 0 &&
    numOr(outline.tags, 230, 1) === 1 &&
    outline.children.every(
      ({ tags, type }) =>
        type === 'VERTEX' && [30, 40, 41, 42, 70].every((code) => numOr(tags, code, 0) === 0),
    )
  );
}

function selectedPiece(pieces: readonly DxfBlockPiece[], blockName: string, sizeToken: string) {
  const matches = pieces.filter((piece) => piece.block === blockName);
  const [piece] = matches;
  requirePoint(
    matches.length === 1 &&
      piece.size === sizeToken &&
      !piece.uni &&
      pieces.some(
        (other) => other.identity === piece.identity && other.size && other.size !== sizeToken,
      ),
    'ambiguous-block',
    'The native adapter must identify one block in the explicitly selected ranked family.',
  );
  return piece;
}

function sourceGeometry(piece: DxfBlockPiece) {
  return [
    piece.block,
    piece.size,
    piece.identity,
    piece.cut?.pts,
    piece.seam?.pts,
    piece.seamSource,
    piece.gradePoints,
    piece.pointNumbers,
  ];
}

/**
 * Retains original foreign DXF by inserting exactly one R12 POINT. The caller owns the
 * saved card/row, scope, piece alias and selected rank. This function neither writes nor issues Apply authority.
 */
export async function writeDxfWithRetainedRankedDraftPointV1(
  input: RetainedRankedDraftPointInputV1,
): Promise<RetainedRankedDraftPointResultV1> {
  const { file, sourceSha256, blockName, sizeToken } = input;
  const point = { ...input.pointMm };
  const source = file.bytes.slice(0);
  const sourceBytes = new Uint8Array(source);
  requirePoint(
    /^[a-f0-9]{64}$/.test(sourceSha256) && (await sha256Hex(source)) === sourceSha256,
    'source-moved',
    'The retained bytes do not match the current saved DXF hash.',
  );
  requirePoint(
    Number.isFinite(point.x) && Number.isFinite(point.y),
    'invalid-point',
    'Enter finite original block coordinates.',
  );
  const pointMm = { x: Number(num(point.x)), y: Number(num(point.y)) };
  requirePoint(
    pointMm.x === point.x && pointMm.y === point.y,
    'invalid-point',
    'The selected point is not exactly representable at DXF millimetre precision.',
  );

  const loaded = loadDxf(source);
  const ast = editableSource(loaded);
  const { block, line } = findBlockEnd(ast, loaded.tok.tags, blockName);
  const { offset, eol } = findInsertion(sourceBytes, line);
  requirePoint(
    !block.entities.some(
      ({ type, tags }) =>
        type === 'POINT' &&
        numOr(tags, 10, Number.NaN) === pointMm.x &&
        numOr(tags, 20, Number.NaN) === pointMm.y,
    ),
    'invalid-point',
    'A native point already occupies the selected coordinate.',
  );

  requirePoint(
    hasNativePlanarOutline(block, '1') && hasNativePlanarOutline(block, '14'),
    'unsupported-dxf',
    'The selected source requires separate simple, straight planar R12 outline records.',
  );
  const original = segmentDxf(await readDxf({ ...file, bytes: source }, opts));
  const selected = selectedPiece(original.pieces, blockName, sizeToken);
  const cut = selected.cut?.pts;
  requirePoint(
    cut &&
      selected.cut?.layer === '1' &&
      selected.cut.paths.length === 1 &&
      selected.seam?.layer === '14' &&
      selected.seam.paths.length === 1 &&
      !selected.nested &&
      !Object.values(selected.roles).some((role) => role === 'hole' || role === 'cut-extra'),
    'unsupported-dxf',
    'The selected block requires one original cut and sewing outline without cut holes.',
  );
  requirePoint(
    pointInPolygon(pointMm, cut) &&
      cut.every(
        (start, index) => footOnSegment(pointMm, start, cut[(index + 1) % cut.length]).d > 1e-6,
      ),
    'invalid-point',
    'Place the point strictly inside its original cut outline.',
  );

  // Same five tags and precision as the R12 writer, with the input's original line ending.
  const tuple = serialize([
    [0, 'POINT'],
    [8, layer],
    [10, num(pointMm.x)],
    [20, num(pointMm.y)],
    [30, num(0)],
  ]);
  const entity = new TextEncoder().encode(tuple.replaceAll('\r\n', eol));
  const output = new Uint8Array(sourceBytes.length + entity.length);
  output.set(sourceBytes.subarray(0, offset));
  output.set(entity, offset);
  output.set(sourceBytes.subarray(offset), offset + entity.length);

  const reopened = segmentDxf(await readDxf({ ...file, bytes: output.buffer }, opts));
  const reopenedSelected = selectedPiece(reopened.pieces, blockName, sizeToken);
  requirePoint(
    JSON.stringify(original.sizes) === JSON.stringify(reopened.sizes) &&
      original.pieces.length === reopened.pieces.length &&
      original.pieces.every((piece, index) => {
        const candidate = reopened.pieces[index];
        return (
          JSON.stringify(sourceGeometry(piece)) === JSON.stringify(sourceGeometry(candidate)) &&
          (piece === selected ||
            JSON.stringify(piece.pointMarks ?? []) === JSON.stringify(candidate.pointMarks ?? []))
        );
      }) &&
      JSON.stringify(reopenedSelected.pointMarks) ===
        JSON.stringify([...(selected.pointMarks ?? []), { at: pointMm, kind: 'draft-point' }]),
    'preservation-failed',
    'The native re-read must preserve all ranks and recognize exactly the selected Draft point.',
  );
  return {
    bytes: output.buffer,
    sourceSha256,
    outputSha256: await sha256Hex(output.buffer),
    blockName,
    sizeToken,
    pointMm: Object.freeze(pointMm),
    insertion: Object.freeze({
      byteOffset: offset,
      byteLength: entity.length,
      entitySha256: await sha256Hex(entity.buffer),
    }),
  };
}
