import { buildAst, type RawBlock, type RawEntity } from '../adapters/dxf/ast';
import { tokenize } from '../adapters/dxf/tags';
import { readManifest } from '../manifest';
import { authoredPointKind } from '../manifest/authored-point';
import { AUTHORED_TEXT_HEIGHT_MM, AUTHORED_TEXT_LAYER } from '../manifest/authored-text';
import { PATIMPORT, type ManifestBlock } from '../types';
import { asciiText, num } from '../write/format';
import { R12_TEXT_HEIGHT, R12_TEXT_PITCH } from '../write/r12';

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
function nativeBlock(
  block: RawBlock,
  record: ManifestBlock,
  displayHeading?: RawEntity,
  preserveSheetPosition = false,
) {
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
      if (e === displayHeading && code === 1) return [code, { displayHeading: true }];
      return [code, value];
    });
    return [e.type, e.layer, tags, e.children.map(entity)];
  }
  const relative = (value: number, axis: 'x' | 'y') =>
    (BigInt(value) - (axis === 'x' ? x : y)).toString();
  return JSON.stringify({
    ...(preserveSheetPosition ? { cutOrigin: [x.toString(), y.toString()] } : {}),
    entities: block.entities.map(entity),
    authoredInternal: record.authoredInternal?.map((feature) => ({
      ...feature,
      vertices: feature.vertices.map((value, index) => relative(value, index % 2 ? 'y' : 'x')),
    })),
    authoredText: record.authoredText?.map(({ text, anchor }) => ({
      text,
      anchor: [relative(anchor[0], 'x'), relative(anchor[1], 'y')],
    })),
    authoredNotches: record.authoredNotches?.map((group) => ({
      ...group,
      vertices: group.vertices.map((value, index) => relative(value, index % 2 ? 'y' : 'x')),
    })),
  });
}

export type NativePieceCopyMode = 'duplicate' | 'mirror-across-grain';
type ReviewedDisplayHeadings = Readonly<{ source: string; copy: string }>;

/** One R12 writer heading, bound to the manifest label and the exact AAMA text row. */
function writerDisplayHeading(block: RawBlock, displayName: string): RawEntity {
  const displayEntities = block.entities.filter(({ layer }) => layer === '15');
  const heading = displayEntities[0];
  const previous = heading && block.entities[block.entities.indexOf(heading) - 1];
  requireMatch(
    displayEntities.length === 1 &&
      heading.type === 'TEXT' &&
      heading.children.length === 0 &&
      heading.tags.length === allowed.TEXT.length &&
      allowed.TEXT.every((code) => read(heading, code) !== undefined) &&
      read(heading, 1) === asciiText(displayName) &&
      read(heading, 7) === 'STANDARD' &&
      read(heading, 40) === num(R12_TEXT_HEIGHT) &&
      read(heading, 50) === num(0) &&
      read(heading, 30) === num(0) &&
      previous?.type === 'TEXT' &&
      previous.layer === '1' &&
      /^(Material|Category): /.test(read(previous, 1) ?? '') &&
      read(heading, 10) === read(previous, 10) &&
      coordinate(read(heading, 20)) ===
        coordinate(read(previous, 20)) - coordinate(num(R12_TEXT_PITCH)),
    'the manifest display heading does not match its exact R12 writer row',
  );
  return heading;
}

/** Coordinates relative to each block's directed, written grain. A reflection must land exactly
 * on the other block's six-decimal DXF grid. Winding carries the cut/hole distinction. */
function grainFrame(
  block: RawBlock,
  record: ManifestBlock,
  reflect: boolean,
  displayHeading?: RawEntity,
) {
  const { identity } = record;
  const axes = block.entities.filter((e) => e.type === 'LINE' && e.layer === '7');
  requireMatch(axes.length === 1, 'mirror requires one native grain axis per size');
  const axis = axes[0]!,
    ox = coordinate(read(axis, 10)),
    oy = coordinate(read(axis, 20));
  const dx = coordinate(read(axis, 11)) - ox,
    dy = coordinate(read(axis, 21)) - oy,
    norm = dx * dx + dy * dy;
  requireMatch(norm > 0n, 'mirror requires a nonzero native grain axis');
  const point = (e: RawEntity, index = 10, map = reflect) => {
    const x = coordinate(read(e, index)) - ox,
      y = coordinate(read(e, index + 10)) - oy;
    if (!map) return x + ',' + y;
    const along = 2n * (dx * x + dy * y),
      nx = dx * along - norm * x,
      ny = dy * along - norm * y;
    requireMatch(
      nx % norm === 0n && ny % norm === 0n,
      'reflection falls outside the exact written coordinate grid',
    );
    return nx / norm + ',' + ny / norm;
  };
  function attributes(e: RawEntity) {
    const fields = allowed[e.type];
    requireMatch(
      fields &&
        e.tags.length === fields.length &&
        fields.every((code) => read(e, code) !== undefined),
      'missing or ambiguous native attributes',
    );
    return e.tags
      .filter((t) => ![10, 20, 11, 21].includes(t.code))
      .map(({ code, value }) => {
        if (code === 1) {
          if (e === displayHeading) return [code, { displayHeading: true }];
          if (e.type === 'TEXT' && value === `Piece Name: ${identity}`)
            return [code, { pieceName: true }];
        }
        return [code, value];
      });
  }
  const outer = block.entities.find((e) => e.type === 'POLYLINE' && e.layer === '1');
  requireMatch(
    outer && block.entities.filter((e) => e.type === 'POLYLINE' && e.layer === '14').length <= 1,
    'ambiguous native cut or seam',
  );
  const textMarks = record.authoredText ?? [];
  const nativeTextMarks = block.entities.filter((e) => e.layer === AUTHORED_TEXT_LAYER);
  requireMatch(nativeTextMarks.length === textMarks.length, 'missing or ambiguous authored text');
  const markByEntity = new Map(nativeTextMarks.map((e, index) => [e, textMarks[index]!]));
  return JSON.stringify({
    entities: block.entities.map((e, index) => {
      const tags = attributes(e);
      const textMark = markByEntity.get(e);
      if (textMark) {
        requireMatch(
          e.type === 'TEXT' &&
            read(e, 7) === 'STANDARD' &&
            read(e, 1) === asciiText(textMark.text) &&
            read(e, 40) === num(AUTHORED_TEXT_HEIGHT_MM) &&
            coordinate(read(e, 30)) === 0n &&
            coordinate(read(e, 50)) === 0n &&
            coordinate(read(e, 10)) === BigInt(textMark.anchor[0]) &&
            coordinate(read(e, 20)) === BigInt(textMark.anchor[1]),
          'authored text differs from its native anchor or glyphs',
        );
        return [e.type, e.layer, tags, point(e), textMark.text];
      }
      if (e.type === 'TEXT') {
        const value = read(e, 1) ?? '';
        const attribute =
          e.layer === '1' &&
          /^(Piece Name|Size|Quantity|Material|Category|Annotation): /.test(value);
        const foldLabel = e.layer === '15' && /^HALF - CUT [1-9]\d* ON FOLD$/.test(value);
        requireMatch(
          read(e, 7) === 'STANDARD' && (attribute || foldLabel || e === displayHeading),
          'unsupported native text mark in mirrored piece',
        );
        // R12 positions these upright labels from the grain midpoint. Geometry marks require their own reflected anchor.
        return [e.type, e.layer, tags, point(e, 10, false)];
      }
      if (e.type === 'LINE') {
        requireMatch(e.layer === '7' || e.layer === '4', 'unsupported mirror line role');
        return [e.type, e.layer, tags, point(e), point(e, 11)];
      }
      if (e.type === 'POINT') {
        if (authoredPointKind(e.layer)) return [e.type, e.layer, tags, point(e)];
        const marker = block.entities[index - 1];
        requireMatch(
          e.layer === '13' &&
            marker?.type === 'POLYLINE' &&
            marker.layer === '8' &&
            read(marker, 70) === '1',
          'missing native drill contour',
        );
        for (const axisCode of [10, 20]) {
          const values = marker.children.map((v) => coordinate(read(v, axisCode)));
          const lo = values.reduce((a, b) => (a < b ? a : b)),
            hi = values.reduce((a, b) => (a > b ? a : b));
          requireMatch(
            lo + hi === 2n * coordinate(read(e, axisCode)),
            'drill contour and native centre disagree',
          );
        }
        return [e.type, e.layer, tags, point(e)];
      }
      requireMatch(
        e.type === 'POLYLINE' &&
          ['1', '14', '6', '8'].includes(e.layer) &&
          e.seqend &&
          read(e, 66) === '1',
        'unsupported mirror contour role',
      );
      const closed = read(e, 70) === '1';
      requireMatch(closed || read(e, 70) === '0', 'unsupported contour flags');
      if (e.layer === '1' || e.layer === '14') {
        requireMatch(closed && e.children.length >= 3, 'a cut or seam ring is open');
        let area = 0n;
        for (const [i, v] of e.children.entries()) {
          const next = e.children[(i + 1) % e.children.length]!;
          area +=
            coordinate(read(v, 10)) * coordinate(read(next, 20)) -
            coordinate(read(v, 20)) * coordinate(read(next, 10));
        }
        requireMatch(
          e.layer === '14' || e === outer ? area > 0n : area < 0n,
          'cut, seam or hole winding changed',
        );
      }
      let points = e.children.map((v) => {
        requireMatch(v.type === 'VERTEX' && v.layer === e.layer, 'wrong native vertex role');
        attributes(v);
        return point(v);
      });
      requireMatch(points.length >= (closed ? 3 : 2), 'missing native vertices');
      if (closed) {
        requireMatch(new Set(points).size === points.length, 'ambiguous closed native vertex');
        // Cut/seam loops keep their winding after reflection. The writer draws each drill
        // outline with standard winding and emits its own exact centre as the following POINT.
        const next = block.entities[index + 1];
        if (
          reflect &&
          (e.layer === '1' ||
            e.layer === '14' ||
            (e.layer === '8' && next?.type === 'POINT' && next.layer === '13'))
        )
          points.reverse();
        const start = points.reduce((min, p, i) => (p < points[min]! ? i : min), 0);
        points = [...points.slice(start), ...points.slice(0, start)];
      }
      return [e.type, e.layer, tags, points];
    }),
    authoredInternal: record.authoredInternal?.map(({ index, label, closed }) => ({
      index,
      label,
      closed,
    })),
    authoredNotches: record.authoredNotches?.map(({ groupId, shape, firstStroke }) => ({
      groupId,
      shape,
      firstStroke,
    })),
  });
}

function inventory(
  text: string,
  mirror?: { id: string; reflect: boolean },
  displayHeading?: { id: string; label: string },
) {
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
          (!displayHeading || coordinate(read(e, 10)) === 0n) &&
          coordinate(read(e, 20)) === 0n,
      ),
    'missing, transformed or ambiguous native insertion',
  );
  const shapes = new Map<string, Map<string, string>>();
  const grainRanks = new Map<string, string>();
  const displayHeadingRanks = new Map<string, string>();
  if (displayHeading) {
    const piece = manifest.pieces.find(({ identity }) => identity === displayHeading.id);
    requireMatch(
      piece?.displayName === displayHeading.label &&
        piece.displayName.toUpperCase() !== piece.identity.toUpperCase(),
      'the display heading is not bound to the reviewed manifest piece',
    );
  }
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
    ranks.set(key, nativeBlock(native, b, undefined, !!displayHeading));
    const heading =
      displayHeading?.id === b.identity
        ? writerDisplayHeading(native, displayHeading.label)
        : undefined;
    if (mirror?.id === b.identity)
      grainRanks.set(key, grainFrame(native, b, mirror.reflect, heading));
    else if (heading) displayHeadingRanks.set(key, nativeBlock(native, b, heading));
    shapes.set(b.identity, ranks);
  }
  requireMatch(
    shapes.size === manifest.pieces.length &&
      manifest.pieces.every((p) => shapes.has(p.identity)) &&
      new Set(manifest.pieces.map((p) => p.identity)).size === manifest.pieces.length,
    'missing writer piece',
  );
  return { manifest, shapes, grainRanks, displayHeadingRanks };
}

/** Every original native block and exactly one additional independent piece must survive the ordinary writer. */
export function nativePieceCopyVerifier(
  sourceText: string,
  sourceIdentity: string,
  copyIdentity: string,
  mode: NativePieceCopyMode = 'duplicate',
  displayHeadings?: ReviewedDisplayHeadings,
) {
  requireMatch(mode === 'duplicate' || mode === 'mirror-across-grain', 'unknown copy operation');
  const mirror = mode === 'mirror-across-grain';
  requireMatch(
    !displayHeadings ||
      (/^[A-Z][A-Z0-9_]*$/.test(displayHeadings.source) &&
        /^[A-Z][A-Z0-9_]*$/.test(displayHeadings.copy) &&
        displayHeadings.source !== displayHeadings.copy),
    'unsupported reviewed display heading',
  );
  const source = inventory(
    sourceText,
    mirror ? { id: sourceIdentity, reflect: true } : undefined,
    displayHeadings && { id: sourceIdentity, label: displayHeadings.source },
  );
  return (resultText: string) => {
    const result = inventory(
      resultText,
      mirror ? { id: copyIdentity, reflect: false } : undefined,
      displayHeadings && { id: copyIdentity, label: displayHeadings.copy },
    );
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
    if (mirror) {
      const resultPieces = new Map(result.manifest.pieces.map((p) => [p.identity, p]));
      requireMatch(
        source.manifest.pieces.every((p) => {
          const current = resultPieces.get(p.identity);
          return (
            current &&
            current.pairHand === p.pairHand &&
            current.pairOf === p.pairOf &&
            current.piecesPerGarment === p.piecesPerGarment &&
            current.fused === p.fused &&
            JSON.stringify(current.fabrics) === JSON.stringify(p.fabrics)
          );
        }),
        'an existing piece changed its material, quantities or hand',
      );
    }
    requireMatch(
      mirror
        ? sourcePiece.fabrics.length > 0 &&
            sourcePiece.piecesPerGarment === 1 &&
            copy.piecesPerGarment === 1 &&
            JSON.stringify(sourcePiece.fabrics) === JSON.stringify(copy.fabrics) &&
            sourcePiece.fused === copy.fused &&
            source.grainRanks.size === source.manifest.sizes.length &&
            sameRanks(source.grainRanks, result.grainRanks)
        : displayHeadings
          ? source.displayHeadingRanks.size === source.manifest.sizes.length &&
            sameRanks(source.displayHeadingRanks, result.displayHeadingRanks)
          : sameRanks(original, copied),
      mirror
        ? 'the new piece differs from the exact reflected native layers, marks, material or ranks'
        : 'the duplicate changed a native layer, mark, coordinate or rank',
    );
  };
}
