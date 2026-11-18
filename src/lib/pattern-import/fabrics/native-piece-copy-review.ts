import { buildAst, type RawBlock, type RawEntity } from '../adapters/dxf/ast';
import { tokenize } from '../adapters/dxf/tags';
import { readManifest } from '../manifest';
import { PATIMPORT, type ManifestBlock } from '../types';

function requireMatch(ok: unknown, detail: string): asserts ok {
  if (!ok) throw new Error(`Unlinked copy review refused: ${detail}.`);
}

// Product R12 coordinates have six decimal places. Subtract on that exact written grid.
function coordinate(value: string | undefined): bigint {
  requireMatch(value && /^-?\d{1,12}\.\d{6}$/.test(value), 'unsupported written coordinate');
  return BigInt(value.replace('.', ''));
}
const read = (e: RawEntity, code: number) => e.tags.find((tag) => tag.code === code)?.value;

const allowed: Record<string, readonly number[]> = {
  POLYLINE: [8, 66, 70],
  VERTEX: [8, 10, 20, 30],
  POINT: [8, 10, 20, 30],
  LINE: [8, 10, 20, 30, 11, 21, 31],
  TEXT: [8, 10, 20, 30, 40, 1, 50, 7],
};

/** The only ignored displacement is the common translation of a whole block on the writer's sheet. */
function nativeBlock(block: RawBlock, record: ManifestBlock) {
  const { identity } = record;
  const outer = block.entities.find((e) => e.type === 'POLYLINE' && e.layer === '1');
  const first = outer?.children[0];
  requireMatch(
    block.entities.filter(
      (e) => e.type === 'TEXT' && e.layer === '1' && read(e, 1) === `Piece Name: ${identity}`,
    ).length === 1,
    'native block identity label is absent or ambiguous',
  );
  requireMatch(
    first && read(outer!, 70) === '1' && block.base.x === 0 && block.base.y === 0,
    'expected one writer block with a closed native cut boundary',
  );
  const x = coordinate(read(first, 10)),
    y = coordinate(read(first, 20));
  function entity(e: RawEntity): unknown {
    requireMatch(
      ['POLYLINE', 'VERTEX', 'POINT', 'LINE', 'TEXT'].includes(e.type),
      'unsupported native entity',
    );
    // Fail closed on curves, widths, non-planar extrusion and non-writer entity variants.
    const tags = e.tags.map(({ code, value }) => {
      requireMatch(allowed[e.type]!.includes(code), 'unexpected native entity attribute');
      if (code === 10 || code === 11) return [code, (coordinate(value) - x).toString()];
      if (code === 20 || code === 21) return [code, (coordinate(value) - y).toString()];
      if (code === 30 || code === 31)
        requireMatch(coordinate(value) === 0n, 'non-planar coordinate');
      if (e.type === 'TEXT' && e.layer === '1' && code === 1 && value === `Piece Name: ${identity}`)
        return [code, { pieceName: true }];
      return [code, value];
    });
    return [e.type, e.layer, tags, e.children.map(entity)];
  }
  const relative = (value: number, axis: 'x' | 'y') =>
    (BigInt(value) - (axis === 'x' ? x : y)).toString();
  return JSON.stringify({
    entities: block.entities.map(entity),
    authoredInternal: record.authoredInternal?.map((feature) => ({
      ...feature,
      vertices: feature.vertices.map((value, index) => relative(value, index % 2 ? 'y' : 'x')),
    })),
    authoredText: record.authoredText?.map(({ text, anchor }) => ({
      text,
      anchor: [relative(anchor[0], 'x'), relative(anchor[1], 'y')],
    })),
  });
}

function inventory(text: string) {
  requireMatch(text.length > 0 && text.length <= PATIMPORT.maxInputBytes, 'invalid DXF size');
  const manifest = readManifest(text);
  requireMatch(manifest && manifest.sizes.length > 0, 'no saved writer manifest or sizes');
  const raw = buildAst(tokenize(text).tags);
  const names = new Set(manifest.blocks.map((b) => b.block));
  requireMatch(
    names.size === manifest.blocks.length &&
      raw.blockOrder.length === names.size &&
      new Set(raw.blockOrder.map((b) => b.name)).size === names.size,
    'duplicate or unmatched native block',
  );
  const inserts = raw.entities.filter((e) => e.type === 'INSERT');
  requireMatch(
    raw.entities.every((e) => e.type === 'INSERT' || e.type === 'TEXT') &&
      inserts.length === names.size &&
      new Set(inserts.map((e) => read(e, 2))).size === names.size &&
      inserts.every(
        (e) =>
          names.has(read(e, 2)!) &&
          e.layer === '0' &&
          e.children.length === 0 &&
          e.tags.every((t) => [8, 2, 10, 20, 30].includes(t.code)) &&
          coordinate(read(e, 30)) === 0n &&
          coordinate(read(e, 10)) >= 0n &&
          coordinate(read(e, 20)) === 0n,
      ),
    'missing, transformed or ambiguous native insertion',
  );
  const shapes = new Map<string, Map<string, string>>();
  for (const b of manifest.blocks) {
    const native = raw.blocks.get(b.block);
    requireMatch(
      native && !b.protectedLineSplit,
      'missing block or unsupported protected occurrence',
    );
    const rank = manifest.sizes.filter((s) => s.token === b.sizeToken && s.sizeId === b.sizeId);
    requireMatch(
      rank.length === 1 && Number.isSafeInteger(rank[0]!.rank),
      'missing native size rank',
    );
    const key = JSON.stringify([rank[0]!.rank, b.sizeToken, b.sizeId]);
    const ranks = shapes.get(b.identity) ?? new Map<string, string>();
    requireMatch(!ranks.has(key), 'duplicate native size rank');
    ranks.set(key, nativeBlock(native, b));
    shapes.set(b.identity, ranks);
  }
  requireMatch(
    shapes.size === manifest.pieces.length &&
      manifest.pieces.every((p) => shapes.has(p.identity)) &&
      new Set(manifest.pieces.map((p) => p.identity)).size === manifest.pieces.length,
    'missing writer piece',
  );
  return { manifest, shapes };
}

/** Every original native block and exactly one additional independent piece must survive the ordinary writer. */
export function nativePieceCopyVerifier(
  sourceText: string,
  sourceIdentity: string,
  copyIdentity: string,
) {
  const source = inventory(sourceText);
  return (resultText: string) => {
    const result = inventory(resultText);
    const original = source.shapes.get(sourceIdentity),
      copied = result.shapes.get(copyIdentity);
    const sourcePiece = source.manifest.pieces.find((p) => p.identity === sourceIdentity);
    const copy = result.manifest.pieces.find((p) => p.identity === copyIdentity);
    const sizeMap = (m: typeof source.manifest) => m.sizes.map((s) => [s.rank, s.token, s.sizeId]);
    requireMatch(
      source.manifest.techCardId === result.manifest.techCardId &&
        source.manifest.scope.fabricPurpose === result.manifest.scope.fabricPurpose &&
        source.manifest.scope.bomLineKey === result.manifest.scope.bomLineKey &&
        JSON.stringify(sizeMap(source.manifest)) === JSON.stringify(sizeMap(result.manifest)) &&
        sourcePiece &&
        !sourcePiece.pairOf &&
        !sourcePiece.pairHand &&
        copy &&
        !copy.pairOf &&
        !copy.pairHand &&
        original &&
        copied &&
        !source.shapes.has(copyIdentity) &&
        result.shapes.size === source.shapes.size + 1,
      'card, scope, size map or independent piece identity changed',
    );
    const sameRanks = (a: Map<string, string>, b?: Map<string, string>) =>
      b && a.size === b.size && [...a].every(([rank, shape]) => b.get(rank) === shape);
    for (const [name, ranks] of source.shapes)
      requireMatch(
        sameRanks(ranks, result.shapes.get(name)),
        `native layer, mark, geometry or rank changed on ${name}`,
      );
    requireMatch(
      sameRanks(original, copied),
      'the duplicate changed a native layer, mark, coordinate or rank',
    );
  };
}
