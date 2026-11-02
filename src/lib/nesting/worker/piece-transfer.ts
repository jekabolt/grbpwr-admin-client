import type { PackedPieceDTO, PackedPieces, PackedPointRange, PieceDTO, Pt } from '../types';

function pointCount(piece: PieceDTO): number {
  return (
    piece.poly.length +
    (piece.inner ?? []).reduce((sum, path) => sum + path.pts.length, 0) +
    (piece.grain?.length ?? 0) * 2 +
    (piece.displayGrain ? 2 : 0)
  );
}

/** Pack every point into one transferable buffer; scalar/nested metadata stays structured data. */
export function packPieces(pieces: readonly PieceDTO[]): PackedPieces {
  const coordinates = new Float64Array(
    pieces.reduce((sum, piece) => sum + pointCount(piece), 0) * 2,
  );
  let pointOffset = 0;

  const put = (points: readonly Pt[]): PackedPointRange => {
    const range: PackedPointRange = [pointOffset, points.length];
    for (const point of points) {
      coordinates[pointOffset * 2] = point.x;
      coordinates[pointOffset * 2 + 1] = point.y;
      pointOffset++;
    }
    return range;
  };

  const packed = pieces.map((piece): PackedPieceDTO => {
    const { poly, grain, displayGrain, inner, ...metadata } = piece;
    return {
      ...metadata,
      poly: put(poly),
      ...(grain
        ? {
            grain: grain.map((line) => ({
              layer: line.layer,
              angleDeg: line.angleDeg,
              lengthCm: line.lengthCm,
              points: put([line.a, line.b]),
            })),
          }
        : {}),
      ...(displayGrain
        ? {
            displayGrain: {
              layer: displayGrain.layer,
              points: put([displayGrain.a, displayGrain.b]),
            },
          }
        : {}),
      ...(inner
        ? {
            inner: inner.map((path) => ({
              layer: path.layer,
              closed: path.closed,
              pts: put(path.pts),
            })),
          }
        : {}),
    };
  });

  return { pieces: packed, coordinates };
}

/** Rebuild the public PieceDTO object graph. Float64 preserves every JS coordinate exactly. */
export function unpackPieces(packed: PackedPieces): PieceDTO[] {
  const { coordinates } = packed;
  const read = ([start, length]: PackedPointRange): Pt[] => {
    if (!Number.isInteger(start) || !Number.isInteger(length) || start < 0 || length < 0)
      throw new Error('invalid packed piece range');
    const end = start + length;
    if (end * 2 > coordinates.length) throw new Error('packed piece range is out of bounds');
    const points = new Array<Pt>(length);
    for (let at = start, i = 0; at < end; at++, i++) {
      points[i] = { x: coordinates[at * 2], y: coordinates[at * 2 + 1] };
    }
    return points;
  };

  return packed.pieces.map((wire) => {
    const { poly, grain, displayGrain, inner, ...metadata } = wire;
    // Keep PieceDTO's historical insertion order. Besides making fixture hashes easy to compare,
    // this prevents debug snapshots from changing just because transport became packed.
    const piece: PieceDTO = {
      id: metadata.id,
      name: metadata.name,
      ...('blockName' in metadata ? { blockName: metadata.blockName } : {}),
      ...('layer' in metadata ? { layer: metadata.layer } : {}),
      ...(grain
        ? {
            grain: grain.map((line) => {
              const [a, b] = read(line.points);
              return {
                layer: line.layer,
                angleDeg: line.angleDeg,
                lengthCm: line.lengthCm,
                a,
                b,
              };
            }),
          }
        : {}),
      ...(displayGrain
        ? (() => {
            const [a, b] = read(displayGrain.points);
            return { displayGrain: { layer: displayGrain.layer, a, b } };
          })()
        : {}),
      ...(inner
        ? {
            inner: inner.map((path) => ({
              layer: path.layer,
              closed: path.closed,
              pts: read(path.pts),
            })),
          }
        : {}),
      source: metadata.source,
      ...('fileIndex' in metadata ? { fileIndex: metadata.fileIndex } : {}),
      poly: read(poly),
      bboxW: metadata.bboxW,
      bboxH: metadata.bboxH,
      areaCm2: metadata.areaCm2,
      ...('originX' in metadata ? { originX: metadata.originX } : {}),
      ...('originY' in metadata ? { originY: metadata.originY } : {}),
      ...('manifest' in metadata ? { manifest: metadata.manifest } : {}),
      ...('fold' in metadata ? { fold: metadata.fold } : {}),
    };
    return piece;
  });
}

export function packedPiecesBytes(packed: PackedPieces): number {
  return (
    packed.coordinates.byteLength +
    new TextEncoder().encode(JSON.stringify(packed.pieces)).byteLength
  );
}
