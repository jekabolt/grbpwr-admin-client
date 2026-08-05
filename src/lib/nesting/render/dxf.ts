// NestResult → plotter-ready ASCII DXF (R12). Hand-written on purpose: the writer is a
// few group-code loops, while any DXF lib would drag a dependency into the bundle for
// features cutters do not read. R12 + classic POLYLINE/VERTEX/SEQEND (not LWPOLYLINE,
// which is R13+) is the lowest common denominator every cutter/plotter driver accepts.
//
// Layers: CUT (color 7) — every placed piece contour, the only layer a cutter needs;
// STRIP (color 1) — the fabric boundary rectangle, for aligning the marker on the table;
// LABELS (color 3) — piece-name TEXT at each piece's center, ignored by plotters, read
// by humans. Coordinates are cm (declared via $INSUNITS=5), y-up exactly as the source
// pattern DXF was authored — chirality is preserved, nothing is mirrored for display.
//
// Contours are the TRUE tessellated piece outlines (the same `poly` the SVG export
// draws), not the RDP-simplified placement geometry.
import type { NestResult, PieceDTO, Pt, RotationDeg } from '../types';

function rotPt(p: Pt, rot: RotationDeg): Pt {
  switch (rot) {
    case 0:
      return p;
    case 90:
      return { x: -p.y, y: p.x };
    case 180:
      return { x: -p.x, y: -p.y };
    case 270:
      return { x: p.y, y: -p.x };
  }
}

// Fixed 4-decimal formatting keeps the file deterministic and well under every driver's
// precision; -0.0000 is normalized so re-exports are byte-identical.
function num(v: number): string {
  const s = v.toFixed(4);
  return s === '-0.0000' ? '0.0000' : s;
}

// DXF TEXT value: control characters would corrupt the pair stream; the value itself is
// free text otherwise. Non-ASCII survives as UTF-8 — modern readers accept it, plotters
// never read LABELS.
function textValue(s: string): string {
  return s.replace(/[\r\n\t]/g, ' ');
}

type Tag = [code: number, value: string];

function polylineTags(layer: string, pts: readonly Pt[]): Tag[] {
  const tags: Tag[] = [
    [0, 'POLYLINE'],
    [8, layer],
    [66, '1'], // vertices follow
    [70, '1'], // closed
  ];
  for (const p of pts) {
    tags.push([0, 'VERTEX'], [8, layer], [10, num(p.x)], [20, num(p.y)], [30, '0.0']);
  }
  tags.push([0, 'SEQEND'], [8, layer]);
  return tags;
}

export function renderLayoutDxf(
  result: NestResult,
  pieces: readonly PieceDTO[],
  fabricWidthCm: number,
  opts?: { labels?: boolean },
): string {
  const labels = opts?.labels ?? true;
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const W = fabricWidthCm;
  const L = result.usedLengthCm;

  const entities: Tag[] = [];

  // Strip boundary first — the alignment reference.
  entities.push(
    ...polylineTags('STRIP', [
      { x: 0, y: 0 },
      { x: L, y: 0 },
      { x: L, y: W },
      { x: 0, y: W },
    ]),
  );

  for (const pl of result.placements) {
    const dto = byId.get(pl.pieceId);
    if (!dto) continue;
    const placed = dto.poly.map((p) => {
      const r = rotPt(p, pl.rot);
      return { x: r.x + pl.x, y: r.y + pl.y };
    });
    entities.push(...polylineTags('CUT', placed));

    if (labels) {
      let cx = 0;
      let cy = 0;
      for (const p of placed) {
        cx += p.x;
        cy += p.y;
      }
      cx /= placed.length;
      cy /= placed.length;
      const label =
        (pl.instance > 0 ? `${dto.name} ×${pl.instance + 1}` : dto.name) +
        (pl.rot ? ` (${pl.rot}°)` : '');
      entities.push(
        [0, 'TEXT'],
        [8, 'LABELS'],
        [10, num(cx)],
        [20, num(cy)],
        [30, '0.0'],
        [40, '1.0'], // text height, cm
        [1, textValue(label)],
        [72, '1'], // center-aligned — alignment point is 11/21
        [11, num(cx)],
        [21, num(cy)],
        [31, '0.0'],
      );
    }
  }

  const layerTags = (name: string, color: number): Tag[] => [
    [0, 'LAYER'],
    [2, name],
    [70, '0'],
    [62, String(color)],
    [6, 'CONTINUOUS'],
  ];

  const tags: Tag[] = [
    [0, 'SECTION'],
    [2, 'HEADER'],
    [9, '$ACADVER'],
    [1, 'AC1009'],
    // Not an R12 variable strictly speaking, but universally read and the only portable
    // way to declare «these numbers are centimeters».
    [9, '$INSUNITS'],
    [70, '5'],
    [9, '$EXTMIN'],
    [10, num(0)],
    [20, num(0)],
    [30, '0.0'],
    [9, '$EXTMAX'],
    [10, num(L)],
    [20, num(W)],
    [30, '0.0'],
    [0, 'ENDSEC'],
    [0, 'SECTION'],
    [2, 'TABLES'],
    [0, 'TABLE'],
    [2, 'LAYER'],
    [70, '3'],
    ...layerTags('CUT', 7),
    ...layerTags('STRIP', 1),
    ...layerTags('LABELS', 3),
    [0, 'ENDTAB'],
    [0, 'ENDSEC'],
    [0, 'SECTION'],
    [2, 'ENTITIES'],
    ...entities,
    [0, 'ENDSEC'],
    [0, 'EOF'],
  ];

  // Group-code pair stream, CRLF — the classic DXF wire format.
  return tags.map(([code, value]) => `${code}\r\n${value}`).join('\r\n') + '\r\n';
}
