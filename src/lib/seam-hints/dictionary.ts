// THE PIECE CODE DICTIONARY — one accessor for «what a piece code means». Two layers:
//
// - the owner's rows («all cards», ListPieceCodeDictionary): a code is an upper token run of a piece
//   name (FLP matches FLP_R_MAIN, CLR_SECOND matches CLR_SECOND_2, P matches P_L_U but not PLCK —
//   the server's own match rule); the longest matching code wins;
// - the static defaults: owner codes with one meaning on every card, matched as the FIRST token
//   (P_L_MAIN → front). FLP is not one — a placket on one card, a flap on another — so it waits for
//   the owner's row.
//
// Precedence everywhere: the owner's fix on this card > the owner's dictionary row > AI > the
// static default (the role book reading of the name, then these codes). No rows → today's reading.

import { readName } from 'lib/assembly-skeleton/skeleton/model';

import type { SeamRole } from './schema';

export type OwnerCode = { code: string; role: SeamRole; hand: 'L' | 'R' | null };

/** Static owner codes → role-book role, matched as the first name token. */
const STATIC_CODES: Readonly<Record<string, string>> = { p: 'front' };

/** The first token of a name in the static reading (P_L_MAIN → p). */
function firstToken(name: string): string {
  return name.toLowerCase().split(/[^a-zа-я0-9]+/i)[0] ?? '';
}

/** A static owner code's role-book role, or null. */
export function staticCodeRole(name: string): string | null {
  return STATIC_CODES[firstToken(name)] ?? null;
}

// ── the owner's rows (module state: the dictionary is one table for every card) ──────────────

let ownerRows: readonly OwnerCode[] = [];
let ownerSig = '';
let version = 0;
const listeners = new Set<() => void>();

/** Replace the owner's rows (from ListPieceCodeDictionary). Same rows → nothing changes. */
export function setOwnerCodes(rows: readonly OwnerCode[]): void {
  const clean = rows
    .map((row) => ({ ...row, code: row.code.trim().toUpperCase() }))
    .filter((row) => row.code)
    .sort((x, y) => y.code.length - x.code.length || x.code.localeCompare(y.code));
  const sig = JSON.stringify(clean);
  if (sig === ownerSig) return;
  ownerSig = sig;
  ownerRows = clean;
  version += 1;
  listeners.forEach((listener) => listener());
}

export function ownerCodesVersion(): number {
  return version;
}

export function subscribeOwnerCodes(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const isAlnum = (ch: string | undefined) => !!ch && /[A-Z0-9]/.test(ch);

/** The server's rule: `code` occurs in `name` (both upper case) as a whole token run. */
export function codeMatches(name: string, code: string): boolean {
  const upper = name.toUpperCase();
  for (let from = 0; from <= upper.length - code.length; ) {
    const at = upper.indexOf(code, from);
    if (at < 0) return false;
    const end = at + code.length;
    if (!isAlnum(upper[at - 1]) && !isAlnum(upper[end])) return true;
    from = at + 1;
  }
  return false;
}

/** The owner's row that reads this piece name (longest code first), or null. */
export function ownerCodeOf(name: string): OwnerCode | null {
  for (const row of ownerRows) if (codeMatches(name, row.code)) return row;
  return null;
}

// ── role vocabularies: the hints' closed vocab ↔ the role book the guess reads ───────────────

const TO_BOOK: Readonly<Record<SeamRole, string | null>> = {
  front: 'front',
  back: 'back',
  yoke: 'yoke',
  sleeve: 'sleeve',
  cuff: 'cuff',
  placket: 'placket',
  collar: 'collar',
  stand: 'stand',
  neck_facing: 'facing',
  facing: 'facing',
  pocket_bag: 'pocket',
  pocket: 'pocket',
  flap: 'pocket',
  waistband: 'waistband',
  lining: null,
  interlining: null,
  other: null,
};

const FROM_BOOK: Readonly<Record<string, SeamRole>> = {
  front: 'front',
  back: 'back',
  yoke: 'yoke',
  sleeve: 'sleeve',
  cuff: 'cuff',
  placket: 'placket',
  collar: 'collar',
  stand: 'stand',
  facing: 'facing',
  pocket: 'pocket',
  waistband: 'waistband',
};

/** A hints role → the role-book role the seam signals read (null: the book has none). */
export function bookRoleOf(role: SeamRole): string | null {
  return TO_BOOK[role];
}

/** A role-book role → the hints vocabulary (null: no word for it there). */
export function seamRoleOfBook(role: string | null): SeamRole | null {
  return role ? FROM_BOOK[role] ?? null : null;
}

/** The owner's row for this name as a role-book role (null: no row, or a row the book cannot say). */
export function ownerBookRole(name: string): string | null {
  const row = ownerCodeOf(name);
  return row ? bookRoleOf(row.role) : null;
}

/**
 * The dictionary role of a piece name in the hints vocabulary (SPEC-F §3 `dict_role`): the owner's
 * row, else the role book / static code reading; null when nothing reads it.
 */
export function dictRoleOf(name: string): SeamRole | null {
  return ownerCodeOf(name)?.role ?? seamRoleOfBook(readName(name).role ?? staticCodeRole(name));
}

// ── the code the screen writes for «all cards» ───────────────────────────────────────────────

const HAND_TOKENS = new Set(['L', 'R', 'LEFT', 'RIGHT']);

/**
 * The code a role fix «all cards» writes for this piece: the leading tokens before the first hand
 * or copy number (FLP_R_MAIN → FLP, CLR_SECOND_2 → CLR_SECOND, BP_U_1 → BP_U, P_L_U → P). Null when
 * the name has no Latin code (the server takes 1..32 of A-Z 0-9 _ -).
 */
export function pieceCodeOf(name: string): string | null {
  const tokens = name
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  const plain = (token: string) => !HAND_TOKENS.has(token) && !/^\d+[LR]?$/.test(token);
  const start = tokens.findIndex(plain);
  if (start < 0) return null;
  const lead: string[] = [];
  for (const token of tokens.slice(start)) {
    if (!plain(token)) break;
    lead.push(token);
  }
  const code = lead.join('_').slice(0, 32);
  return code && codeMatches(name, code) ? code : null;
}
