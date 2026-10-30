// What a piece is, read from its name: the card's role book first, then the owner's own codes the
// book does not know. Only codes with one meaning live here — FLP is a placket on one card and a
// flap on another, so it waits for the owner's dictionary.

import type { PieceGeom } from 'lib/assembly-skeleton/types';
import { readName, roleDef } from 'lib/assembly-skeleton/skeleton/model';

/** Owner codes → role, matched as the first name token (P_L_MAIN, BP_U). */
const CODES: Readonly<Record<string, string>> = { p: 'front' };

function codeRole(name: string): string | null {
  const first = name.toLowerCase().split(/[^a-zа-я0-9]+/i)[0] ?? '';
  return CODES[first] ?? null;
}

/** The piece's role: its own reading, a panel role through its mirror twin, else an owner code. */
export function roleOfGeom(piece: PieceGeom, geoms: ReadonlyMap<string, PieceGeom>): string | null {
  const own = readName(piece.name).role;
  if (roleDef(own)?.level === 'panel') return own;
  for (const twin of piece.twinOf ?? []) {
    if (twin.kind !== 'mirror') continue;
    const role = readName(geoms.get(twin.key)?.name ?? '').role;
    if (roleDef(role)?.level === 'panel') return role;
  }
  return own ?? codeRole(piece.name);
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
