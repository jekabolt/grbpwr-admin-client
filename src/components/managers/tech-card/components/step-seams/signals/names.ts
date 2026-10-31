// What a piece is, read from its name: the owner's code dictionary first (lib/seam-hints/dictionary,
// the one accessor for codes), then the card's role book, then the static owner codes the book does
// not know. Only codes with one meaning are static — FLP is a placket on one card and a flap on
// another, so it waits for the owner's dictionary row.

import type { PieceGeom } from 'lib/assembly-skeleton/types';
import { readName, roleDef } from 'lib/assembly-skeleton/skeleton/model';
import { ownerBookRole, staticCodeRole } from 'lib/seam-hints/dictionary';

/** The role a bare piece name reads as: the owner's row, the role book, else a static code. */
export function roleOfName(name: string): string | null {
  return ownerBookRole(name) ?? readName(name).role ?? staticCodeRole(name);
}

/**
 * The piece's role: the owner's row, its own reading, a panel role through its mirror twin, else a
 * static code.
 */
export function roleOfGeom(piece: PieceGeom, geoms: ReadonlyMap<string, PieceGeom>): string | null {
  const owner = ownerBookRole(piece.name);
  if (owner) return owner;
  const own = readName(piece.name).role;
  if (roleDef(own)?.level === 'panel') return own;
  for (const twin of piece.twinOf ?? []) {
    if (twin.kind !== 'mirror') continue;
    const name = geoms.get(twin.key)?.name ?? '';
    const role = ownerBookRole(name) ?? readName(name).role;
    if (roleDef(role)?.level === 'panel') return role;
  }
  return own ?? staticCodeRole(piece.name);
}

export function rolesOf(
  pieces: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
): (string | null)[] {
  return pieces.map((p) => {
    const g = geoms.get(p);
    return g ? roleOfGeom(g, geoms) : null;
  });
}
