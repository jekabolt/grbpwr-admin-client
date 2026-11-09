// A GARMENT LABEL IS A PICTURE PIECE, NOT A CUT PIECE. Its stable line key shares the piece and
// cut-strip key space so the existing pose machinery can place it on cloth or on another label.
// Virtual rows are added only to the assembly read; they never enter the form's structural pieces.
import type { common_TechCard } from 'api/proto-http/admin';
import type { GarmentLabelMark } from 'lib/assembly-skeleton/types';
import type { PieceDTO } from 'lib/nesting/types';

import { labelFoldLines } from './label-fold-lines';
import type { FoundPiece } from './nesting/dxf-geometry';
import { garmentLabelKindNames, kindLabel } from './tech-card-options';

export type GarmentLabelLike = {
  key?: string | null;
  kind?: string | null;
  lineKey?: string | null;
  widthMm?: string | number | { value?: string | null } | null;
  heightMm?: string | number | { value?: string | null } | null;
  fold?: string | null;
  foldLinesMm?: string | null;
  attachment?: string | null;
  qtyPerGarment?: number | null;
};

const NO_LABELS: readonly GarmentLabelLike[] = [];

const decimal = (value: GarmentLabelLike['widthMm']): number => {
  const text = (typeof value === 'object' && value !== null ? value.value ?? '' : value ?? '')
    .toString()
    .trim()
    .replace(',', '.');
  const parsed = text ? Number(text) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

const keyOf = (label: GarmentLabelLike) => (label.lineKey ?? '').trim();

export function garmentLabelsOfCard(
  card: common_TechCard | undefined,
): readonly GarmentLabelLike[] {
  return (card?.techCard?.garmentLabels ?? NO_LABELS) as readonly GarmentLabelLike[];
}

export function garmentLabelName(label: GarmentLabelLike): string {
  const key = (label.key ?? '').trim();
  const kind = (label.kind ?? '').trim() || key;
  return kindLabel(garmentLabelKindNames, kind) || key || 'label';
}

// A label saved without its size still has to be placeable: it is drawn at its kind's usual size
// until the size is entered (composition = the vertical care tape, the card default).
const UNSIZED_MM: Record<string, { widthMm: number; heightMm: number }> = {
  composition: { widthMm: 30, heightMm: 100 },
  size: { widthMm: 20, heightMm: 20 },
  flag: { widthMm: 20, heightMm: 20 },
  hanger_loop: { widthMm: 10, heightMm: 60 },
  neck_tape: { widthMm: 10, heightMm: 150 },
  hangtag: { widthMm: 50, heightMm: 90 },
};

export function unsizedLabelMm(label: GarmentLabelLike): { widthMm: number; heightMm: number } {
  const kind = ((label.kind ?? '').trim() || (label.key ?? '').trim()).toLowerCase();
  return UNSIZED_MM[kind] ?? { widthMm: 50, heightMm: 20 };
}

export function garmentLabelMark(label: GarmentLabelLike): GarmentLabelMark | null {
  const sized = decimal(label.widthMm) > 0 && decimal(label.heightMm) > 0;
  const fallback = sized ? null : unsizedLabelMm(label);
  const widthMm = fallback ? fallback.widthMm : decimal(label.widthMm);
  const heightMm = fallback ? fallback.heightMm : decimal(label.heightMm);
  const rawFold = (label.fold ?? '').trim();
  const fold: GarmentLabelMark['fold'] =
    rawFold === 'flat' ||
    rawFold === 'half' ||
    rawFold === 'ends' ||
    rawFold === 'mitre' ||
    rawFold === 'loop'
      ? rawFold
      : '';
  return {
    label: garmentLabelName(label),
    widthMm,
    heightMm,
    fold,
    foldLines: labelFoldLines({ fold, foldLinesMm: label.foldLinesMm }, heightMm),
    attachment: (label.attachment ?? '').trim(),
  };
}

export function withGarmentLabelPieces(card: common_TechCard): common_TechCard {
  const insert = card.techCard;
  const labels = garmentLabelsOfCard(card);
  if (!insert || labels.length === 0) return card;
  const known = new Set((insert.pieces ?? []).map((piece) => piece.lineKey));
  const rows = labels.flatMap((label) => {
    const lineKey = keyOf(label);
    if (!lineKey || known.has(lineKey)) return [];
    return [
      {
        lineKey,
        name: garmentLabelName(label),
        piecesPerGarment: label.qtyPerGarment || 1,
        materials: [],
      },
    ];
  });
  if (!rows.length) return card;
  return {
    ...card,
    techCard: { ...insert, pieces: [...(insert.pieces ?? []), ...(rows as never[])] },
  };
}

function labelPieceId(key: string): number {
  let hash = 17;
  for (let index = 0; index < key.length; index += 1)
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  return -1_000_000_001 - Math.abs(hash);
}

export function garmentLabelFoundPiece(
  key: string,
  mark: GarmentLabelMark,
  sizeToken = '',
): FoundPiece {
  const widthCm = mark.widthMm / 10;
  const heightCm = mark.heightMm / 10;
  const piece: PieceDTO = {
    id: labelPieceId(key),
    name: mark.label,
    source: 'garment label',
    poly: [
      { x: 0, y: 0 },
      { x: widthCm, y: 0 },
      { x: widthCm, y: heightCm },
      { x: 0, y: heightCm },
    ],
    bboxW: widthCm,
    bboxH: heightCm,
    areaCm2: widthCm * heightCm,
    originX: 0,
    originY: 0,
  };
  return { piece, block: '', size: sizeToken, instances: 1, layer: '', sizes: [sizeToken] };
}

export type GarmentLabelDrawing = {
  key: string;
  found: FoundPiece;
  mark: GarmentLabelMark;
};

export function garmentLabelDrawingsOf(
  labels: readonly GarmentLabelLike[],
  sizeToken = '',
): GarmentLabelDrawing[] {
  return labels.flatMap((label) => {
    const key = keyOf(label);
    const mark = key ? garmentLabelMark(label) : null;
    return key && mark ? [{ key, mark, found: garmentLabelFoundPiece(key, mark, sizeToken) }] : [];
  });
}
