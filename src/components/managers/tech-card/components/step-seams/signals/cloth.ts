// What a piece is cut from. Pocketing and lining pieces are layers: sewn into a host's seam, they
// leave the host's edge open for the structural seam that follows (a pocket bag in the yoke seam).

import type { PieceGeom } from 'lib/assembly-skeleton/types';

import { roleOfGeom } from './names';
import type { SignalFn } from './types';

const LAYER_NAME = /(^|[_\s-])(pck|pocket|lining|lin)(?=$|[_\s-])/i;

/** A piece that lies on a host as a layer: pocketing / lining cloth, a pocket by role or name. */
export function isLayerCloth(piece: string, geoms: ReadonlyMap<string, PieceGeom>): boolean {
  const geom = geoms.get(piece);
  if (!geom) return false;
  const cloth = String(geom.cloth ?? '').toLowerCase();
  return (
    cloth === 'pocketing' ||
    cloth === 'lining' ||
    roleOfGeom(geom, geoms) === 'pocket' ||
    LAYER_NAME.test(geom.name)
  );
}

const SHELL = new Set(['main', 'contrast']);
const BAG = 'pocketing';

/**
 * A pocket bag on a shell piece is the usual pocket seam; a pocket bag on another bag is closing
 * the bag, which comes after it is set — the shell pairing goes first. Read by cloth only: an
 * unbound piece says nothing.
 */
export const clothSignal: SignalFn = (a, b, { geoms }) => {
  const cloths = (pieces: readonly string[]) =>
    new Set(pieces.map((p) => String(geoms.get(p)?.cloth ?? '')));
  const ca = cloths(a.pieces);
  const cb = cloths(b.pieces);
  if (ca.size !== 1 || cb.size !== 1) return null;
  const [x] = ca;
  const [y] = cb;
  if ((x === BAG && SHELL.has(y)) || (y === BAG && SHELL.has(x)))
    return { term: 'cloth', delta: -0.02, reason: 'bag on shell' };
  return null;
};
