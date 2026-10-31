// THE HINTS IN WORDS (mockup variant 1). One reading of a piece's role and one short «what → where»
// line per join, shared by the hints panel and the row above each step's canvas, so both say the
// same thing. Pure.

import { readName } from 'lib/assembly-skeleton/skeleton/model';
import {
  ownerCodeOf,
  type EffectiveJoinHint,
  type EffectiveRoleHint,
  type SeamHintOverride,
  type SeamHints,
  type SeamJoinSide,
  type SeamRole,
} from 'lib/seam-hints';
import { seamRoleOfBook, staticCodeRole } from 'lib/seam-hints/dictionary';

export const word = (s: string) => s.replace(/_/g, ' ');

export type RoleView = {
  role: SeamRole;
  hand: 'L' | 'R' | null;
  /** own — this card's fix; all — the owner's dictionary; ai — the model; book — the static reading. */
  src: 'own' | 'all' | 'ai' | 'book';
  off: boolean;
};

/** What a piece is, by precedence: the owner's fix on this card > dictionary row > AI > static. */
export function roleView(
  name: string,
  aiRole: EffectiveRoleHint | undefined,
  override: SeamHintOverride | undefined,
): RoleView | null {
  if (override?.kind === 'role' && override.state !== 'off' && override.value)
    return { role: override.value.role, hand: override.value.hand ?? null, src: 'own', off: false };
  const off = override?.kind === 'role' && override.state === 'off';
  const row = ownerCodeOf(name);
  if (row) return { role: row.role, hand: row.hand, src: 'all', off };
  if (aiRole) return { role: aiRole.role, hand: aiRole.hand, src: 'ai', off };
  const book = seamRoleOfBook(readName(name).role ?? staticCodeRole(name));
  return book ? { role: book, hand: null, src: 'book', off } : null;
}

/** name → its role view, over the card's merged hints (by piece NAME) and the owner's rows. */
export function roleReader(
  hints: SeamHints,
  overrides: readonly SeamHintOverride[],
): (name: string) => RoleView | null {
  const ai = new Map(hints.roles.map((row) => [row.piece, row]));
  const own = new Map(
    overrides.filter((row) => row.kind === 'role').map((row) => [row.hint_key, row]),
  );
  return (name) => roleView(name, ai.get(name), own.get(name));
}

/** Edge words that already say where on the garment; the rest need the pieces' roles in front. */
const PLACE_WORDS = new Set<string>(['front_edge', 'neckline', 'armhole', 'shoulder', 'hem']);

function rolesText(side: SeamJoinSide, roleOf: (name: string) => RoleView | null): string {
  const roles = [...new Set(side.pieces.map((name) => roleOf(name)?.role ?? name))];
  return roles.map(word).join(' + ');
}

/** «placket → front edge»: what is sewn, then where it goes. */
export function joinWords(
  row: Pick<EffectiveJoinHint, 'a' | 'b'>,
  roleOf: (name: string) => RoleView | null,
): { what: string; where: string } {
  if (PLACE_WORDS.has(row.b.edge))
    return { what: rolesText(row.a, roleOf), where: word(row.b.edge) };
  if (PLACE_WORDS.has(row.a.edge))
    return { what: rolesText(row.b, roleOf), where: word(row.a.edge) };
  return {
    what: rolesText(row.a, roleOf),
    where: `${rolesText(row.b, roleOf)} ${word(row.b.edge)}`,
  };
}

/** The full scheme, pieces + edge → pieces + edge. */
export const sideText = (side: SeamJoinSide) => `${side.pieces.join(' + ')} ${word(side.edge)}`;

export const stateWord = (state: EffectiveJoinHint['state']) =>
  state === 'ai' ? 'ai' : state === 'off' ? 'off' : 'own';
