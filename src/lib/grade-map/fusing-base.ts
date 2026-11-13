// Fusing markup key — the base a piece's fusing markup (strip edges / zone) was drawn against: the
// base size and the signature of that size's cut contour. Stored on the card piece
// (`TechCardPiece.fusing_base`); the server keeps it opaque and never compares it.
//
// Owner's rule (12.11): the pattern was replaced and the shape changed → the markup stays, marked;
// it is never reset. So everything here is data: whether the markup is stale and why.

import type { common_TechCardPiece, common_TechCardPieceFusingBase } from 'api/proto-http/admin';
import { fuseSpecFromPiece, readFuseSpec, type PieceFuseFields } from 'lib/fusing-dxf/types';

import { contourSignature, sameContourSignature, type SigPt } from './signature';

export type FusingBaseKey = { baseSizeId: number; contourSignature: string };

export type FusingMarkupStaleReason = 'base_size_changed' | 'contour_changed' | 'no_key';
export type FusingMarkupStale = { stale: boolean; reason?: FusingMarkupStaleReason };

/** The fuse fields a markup check reads, in the tech-card form's shape, plus the stored key. */
export type FusingMarkupPiece = Partial<
  Pick<PieceFuseFields, 'fused' | 'fusingMode' | 'fusingEdges' | 'fusingZone'>
> & { fusingBase?: FusingBaseKey | null };

const MAX_SIGNATURE = 64;

/** A usable key: a positive size id and a non-empty signature of at most 64 characters. */
export function validFusingBase(k: Partial<FusingBaseKey> | null | undefined): k is FusingBaseKey {
  const sig = k?.contourSignature?.trim() ?? '';
  return !!k && Number.isInteger(k.baseSizeId) && k.baseSizeId! > 0 && !!sig && sig.length <= 64;
}

/** The wire key → the form's key; half a key or none reads as null. */
export function fusingBaseFromWire(
  w: common_TechCardPieceFusingBase | null | undefined,
): FusingBaseKey | null {
  const k = { baseSizeId: Number(w?.baseSizeId ?? 0), contourSignature: w?.contourSignature ?? '' };
  return validFusingBase(k) ? { ...k, contourSignature: k.contourSignature.trim() } : null;
}

/** The key of a base contour, or null when the size or the contour is not usable. */
export function fusingBaseKeyOf(
  baseSizeId: number | null | undefined,
  baseContour: readonly SigPt[] | null | undefined,
): FusingBaseKey | null {
  if (!baseContour || !baseSizeId) return null;
  const sig = contourSignature(baseContour);
  if (!sig || sig.length > MAX_SIGNATURE) return null;
  const k = { baseSizeId, contourSignature: sig };
  return validFusingBase(k) ? k : null;
}

/** Markup = strip edges on a strip piece, or a zone on a zone piece (what the key belongs to). */
export function hasFusingMarkup(p: FusingMarkupPiece): boolean {
  if (!p.fused) return false;
  const spec = readFuseSpec(p);
  return spec.edges.length > 0 || spec.zone != null;
}

/**
 * Is the piece's fusing markup stale against the current pattern file?
 *   no markup → not stale · no stored key → stale `no_key` · another base size → `base_size_changed`
 *   · contour unknown now → not stale (cannot tell) · signature does not match → `contour_changed`.
 * Data only: the markup itself is never touched.
 */
export function fusingMarkupStale(
  piece: FusingMarkupPiece,
  currentBaseContour: readonly SigPt[] | null | undefined,
  currentBaseSizeId: number | null | undefined,
): FusingMarkupStale {
  if (!hasFusingMarkup(piece)) return { stale: false };
  const key = piece.fusingBase;
  if (!validFusingBase(key)) return { stale: true, reason: 'no_key' };
  if (currentBaseSizeId && currentBaseSizeId !== key.baseSizeId)
    return { stale: true, reason: 'base_size_changed' };
  if (!currentBaseContour || !currentBaseSizeId) return { stale: false };
  const now = contourSignature(currentBaseContour);
  if (!now) return { stale: false };
  return sameContourSignature(key.contourSignature, now)
    ? { stale: false }
    : { stale: true, reason: 'contour_changed' };
}

/**
 * The base size of a piece, by the fusing generator's rule (`buildFusingSheets`): the card's base
 * sample size when the piece has it, else the first size in grade order. `sizes` are in grade order.
 */
export function fusingBaseSizeOf<S extends { sizeId: number }>(
  sizes: readonly S[],
  cardBaseSizeId: number | null | undefined,
): S | null {
  return sizes.find((s) => !!cardBaseSizeId && s.sizeId === cardBaseSizeId) ?? sizes[0] ?? null;
}

/** A wire piece as the save builds it (the fields the markup and the key live on). */
type WirePiece = Partial<common_TechCardPiece> & Pick<common_TechCardPiece, 'fused'>;

/** The piece's markup in one comparable string ('' = none), read the way the generator reads it. */
function wireMarkupOf(p: Partial<common_TechCardPiece>): string {
  const spec = fuseSpecFromPiece({
    fused: !!p.fused,
    fusingMode: p.fusingMode,
    fusingWidthMm: p.fusingWidthMm,
    fusingEdges: p.fusingEdges,
    fusingZone: p.fusingZone,
  });
  if (!spec || (!spec.edges.length && !spec.zone)) return '';
  return JSON.stringify([spec.mode, spec.edges, spec.zone]);
}

/**
 * SAVE — put the fusing markup key on the wire pieces whose markup this save changes.
 *
 * Sent when the piece has markup, the current base contour is known (`resolve`), and the markup
 * differs from the stored card's (or the piece is not stored yet). Otherwise the field stays absent
 * and the server keeps what it has. Resending the current contour on a save that did not touch the
 * markup would re-bless markup drawn on a replaced pattern and erase the very flag it exists for.
 * Never an empty key: the server clears it on its own when the markup goes.
 */
export function fusingBaseAttacher(
  stored: readonly Partial<common_TechCardPiece>[] | undefined,
  resolve: ((pieceLineKey: string) => FusingBaseKey | null) | undefined,
): <P extends WirePiece>(p: P) => P {
  if (!resolve) return (p) => p;
  const storedByKey = new Map(
    (stored ?? []).map((s) => [(s.lineKey ?? '').trim().toLowerCase(), s] as const),
  );
  return (p) => {
    const lineKey = (p.lineKey ?? '').trim();
    if (!lineKey) return p;
    const now = wireMarkupOf(p);
    if (!now) return p;
    const before = storedByKey.get(lineKey.toLowerCase());
    if (before && wireMarkupOf(before) === now) return p;
    const key = resolve(lineKey);
    return validFusingBase(key) ? { ...p, fusingBase: { ...key } } : p;
  };
}
