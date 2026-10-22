import { common_TechCardBomPurpose } from 'api/proto-http/admin';
import type { FabricDirection } from 'lib/nesting/types';
import { sectionShort } from './bom-line-picker';

// НАЗНАЧЕНИЕ — what the garment uses a roll-goods line FOR (0265). A SECOND axis beside `section`,
// not a refinement of it: a карманка, a контраст and a сетка are all genuinely section=fabric —
// cloth sold by length, laid out on the same marker, grossed up by the same wastage — and they
// differ only in role. Several lines legitimately share one purpose; naming a SUBSET of the fabrics
// is the entire point of the field.
//
// The list is closed because the field exists to GROUP. A free-text role stops grouping the moment
// one operator writes «карманка» and the next writes «мешковина кармана», which is exactly what the
// free-text slot NAME already does today. OTHER carries its meaning in a separate note so the note
// can never quietly become a ninth purpose.

// Подписи назначений живут в bom-purpose-labels.ts (лист без тяжёлых импортов — его читает и
// публичный вьюер выкроек); реэкспорт сохраняет всех прежних импортёров этого файла.
import {
  PURPOSE_LABEL,
  UNSET_PURPOSE,
  UNSET_PURPOSE_LABEL,
  bomPurposeLabel,
} from './bom-purpose-labels';

export { UNSET_PURPOSE, UNSET_PURPOSE_LABEL, bomPurposeLabel } from './bom-purpose-labels';

// Owner's order, and the order the BOM tab lists its groups in — the garment read outwards from the
// shell, not alphabetical.
export const bomPurposeOrder: common_TechCardBomPurpose[] = [
  'TECH_CARD_BOM_PURPOSE_MAIN',
  'TECH_CARD_BOM_PURPOSE_LINING',
  'TECH_CARD_BOM_PURPOSE_POCKETING',
  'TECH_CARD_BOM_PURPOSE_INTERFACING',
  'TECH_CARD_BOM_PURPOSE_INSULATION',
  'TECH_CARD_BOM_PURPOSE_CONTRAST',
  'TECH_CARD_BOM_PURPOSE_MESH',
  'TECH_CARD_BOM_PURPOSE_OTHER',
];

// Роль строки по умолчанию, когда оператор её не написал: назначение уже сказано, и повторять
// одно и то же руками незачем. «Другое» роли не даёт — там смысл в примечании, а не в значении.
export function defaultRoleForPurpose(purpose?: string): string {
  if (!purpose || purpose === UNSET_PURPOSE || purpose === 'TECH_CARD_BOM_PURPOSE_OTHER') return '';
  return PURPOSE_LABEL[purpose] ?? '';
}

export const techCardBomPurposeOptions: Array<{
  value: common_TechCardBomPurpose;
  label: string;
}> = bomPurposeOrder.map((value) => ({ value, label: bomPurposeLabel(value) }));

// The EDITOR's list carries an explicit unset; the ADD modal's does not. Adding a fabric is the one
// moment the answer is in front of the operator, so the question is asked then and required. Editing
// is also where a WRONG sort has to be undoable — including back to «не знаю», which is a different
// and more honest answer than leaving «основной материал» standing.
export const purposeEditorOptions: Array<{ value: string; label: string }> = [
  { value: UNSET_PURPOSE, label: '— unset —' },
  ...bomPurposeOrder.map((value) => ({ value: value as string, label: bomPurposeLabel(value) })),
];

export function isOtherPurpose(purpose?: string): boolean {
  return purpose === 'TECH_CARD_BOM_PURPOSE_OTHER';
}

// The four families cloth is measured by the metre and laid out on a marker. They are the only ones
// a purpose describes: a purpose on a thread or a button would be data no screen renders. Mirrors
// rollGoodsSectionList in the backend's internal/store/techcard — the same four the раскладка and
// the DXF binding already use, which is why the purpose axis can later carry those bindings.
const ROLL_GOODS_SECTIONS = new Set<string>([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
]);

export function isRollGoodsSection(section?: string): boolean {
  return !!section && ROLL_GOODS_SECTIONS.has(section);
}

// Non-roll-goods sections keep their own headings, in the order the section select offers them —
// purpose exists only where it means something, so thread, hardware, trim, labels and packaging are
// grouped exactly as they always were.
const SECTION_ORDER: string[] = [
  'TECH_CARD_BOM_SECTION_HARDWARE',
  'TECH_CARD_BOM_SECTION_THREAD',
  'TECH_CARD_BOM_SECTION_TRIM',
  'TECH_CARD_BOM_SECTION_DECORATION',
  'TECH_CARD_BOM_SECTION_LABEL',
  'TECH_CARD_BOM_SECTION_PACKAGING',
  'TECH_CARD_BOM_SECTION_OTHER',
];

export type BomGroup = {
  key: string;
  label: string;
  /** Positions in the RHF field array — NOT a re-sorted copy of the rows. */
  indices: number[];
  /** Roll goods with no purpose yet: the pile the operator is meant to work through. */
  unsorted?: boolean;
};

type GroupableLine = { section?: string; purpose?: string };

/**
 * Fold the BOM into the headings the tab renders, returning POSITIONS rather than rows: every tile,
 * editor and remove path addresses a line by its index in the RHF field array, so a grouping that
 * handed back reordered copies would silently repoint them at the wrong line.
 *
 * Roll goods group by purpose (one heading per purpose, several sections legitimately mixing inside
 * it — the tile still shows its own section pill). Everything else groups by section. Unsorted roll
 * goods get their own trailing heading instead of being folded into MAIN, so «not sorted yet» stays
 * visibly different from «sorted, and the answer is основной материал».
 */
export function groupBomLines(lines: GroupableLine[]): BomGroup[] {
  const byPurpose = new Map<string, number[]>();
  const unsorted: number[] = [];
  const bySection = new Map<string, number[]>();

  lines.forEach((line, index) => {
    if (isRollGoodsSection(line.section)) {
      const p = line.purpose && line.purpose !== UNSET_PURPOSE ? line.purpose : '';
      if (!p) {
        unsorted.push(index);
        return;
      }
      byPurpose.set(p, [...(byPurpose.get(p) ?? []), index]);
      return;
    }
    const s = line.section || 'TECH_CARD_BOM_SECTION_OTHER';
    bySection.set(s, [...(bySection.get(s) ?? []), index]);
  });

  const groups: BomGroup[] = [];
  bomPurposeOrder.forEach((p) => {
    const indices = byPurpose.get(p);
    if (indices?.length) groups.push({ key: p, label: bomPurposeLabel(p), indices });
  });
  // A purpose the current build does not know (a card saved by a newer client) must still render
  // its lines — under its raw value rather than vanishing from a tab that claims to list the BOM.
  [...byPurpose.keys()]
    .filter((p) => !bomPurposeOrder.includes(p as common_TechCardBomPurpose))
    .sort()
    .forEach((p) => groups.push({ key: p, label: bomPurposeLabel(p), indices: byPurpose.get(p)! }));
  if (unsorted.length) {
    groups.push({
      key: UNSET_PURPOSE,
      label: UNSET_PURPOSE_LABEL,
      indices: unsorted,
      unsorted: true,
    });
  }

  const seenSections = new Set<string>();
  [...SECTION_ORDER, ...[...bySection.keys()].sort()].forEach((s) => {
    if (seenSections.has(s)) return;
    seenSections.add(s);
    const indices = bySection.get(s);
    if (indices?.length) {
      groups.push({
        key: s,
        label: sectionShort(s) || s,
        indices,
      });
    }
  });
  return groups;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// FABRIC SCOPE (0267) — what a выкройка and a cut-piece alias are bound to.
//
// They used to name a concrete BOM LINE. They now name a НАЗНАЧЕНИЕ, because at card level
// everything a градалка draws is a CLASS: «это лекало основной ткани», «эта деталь кроится из
// подкладки». The concrete line matters only where the ARTICLE matters — the раскладка (width and
// selvedge come off the article the colourway pins) and the production run — and neither of those
// is a property of the sheet.
//
// The transition is ADDITIVE and this is the whole of it: existing cards have NO purposes (0265
// deliberately back-filled nothing, because section=fabric is exactly where карманка, контраст and
// сетка hide and a guess would label all three «основной материал» confidently and wrongly), so a
// sheet bound to line L cannot migrate — L has no purpose to move to. Both fields coexist, and
// resolution is always:
//
//     purpose first, else the legacy line.
//
// Mirrors internal/entity/fabric_scope.go. The two sides spell a purpose differently (the enum name
// here, the lowercase stored value there), so the KEYS differ — but the PARTITION they induce is
// identical, and the partition is the only thing either side reasons about.

/** A cloth line of the card, as the bindings see it. `purpose` empty = not sorted yet. */
export type RollGoodsLine = {
  lineKey: string;
  purpose?: string;
  name?: string;
  section?: string;
};

/**
 * One binding target. A purpose scope owns EVERY line sorted into it (several is the norm — that is
 * the point of назначение); an unsorted line is its own scope, which is exactly how the whole panel
 * behaved before 0267 and is why an unsorted card is untouched by any of this.
 */
export type FabricScope<L extends RollGoodsLine = RollGoodsLine> = {
  /** COALESCE(purpose, lineKey) — the uniqueness bucket, mirroring the DB's generated scope_key. */
  key: string;
  byPurpose: boolean;
  /** Generic in the line type so callers keep the extra per-line facts (width, кромка) they carry. */
  lines: L[];
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// НАПРАВЛЕНИЕ ТКАНИ across a scope (Ф1). A назначение legitimately owns SEVERAL BOM lines, and
// nothing validates that they agree about direction — so the раскладка has to decide what the
// scope's direction IS.
//
// STRICTEST WINS: one napped article in the scope makes the whole scope napped. The alternative
// (loosest, or first-line-wins) produces a marker that is legal for one of the articles and puts
// the other one's pile against itself — and a two-tone garment is not something anyone catches
// before it is cut. Mirrors the backend rule in internal/entity/fabric_scope.go.
//
// UNKNOWN wins over everything, and that is the point of the field being tri-state: NULL is the
// ABSENCE of an answer, not a value. Reading it as «any» would silently permit the flip on every
// line nobody has filled in, which is almost all of them today; reading it as one_way would make
// every existing marker unreproducible. So it stays its own answer, and the SAVE path is where it
// bites (the server refuses a marker whose cloth has no direction) rather than the search.

// Deliberately an ALIAS of the engine's own type rather than a second spelling of the same four
// words: this value is computed here and consumed by the раскладка, and two structurally identical
// types would let them drift apart the day one of them gains a fifth value.
export type ScopeDirection = FabricDirection;

const DIRECTION_OF_ENUM: Record<string, ScopeDirection> = {
  TECH_CARD_FABRIC_DIRECTION_ANY: 'any',
  TECH_CARD_FABRIC_DIRECTION_ONE_WAY: 'one_way',
  TECH_CARD_FABRIC_DIRECTION_TWO_WAY: 'two_way',
};

export function directionOf(enumValue?: string): ScopeDirection {
  return DIRECTION_OF_ENUM[(enumValue ?? '').trim()] ?? 'unknown';
}

/**
 * The direction a раскладка over these lines must obey. An EMPTY list is 'unknown' — an unbound
 * sheet names no cloth, and claiming «any» for it would be inventing permission out of nothing.
 */
export function strictestDirection(lines: Array<{ fabricDirection?: string }>): ScopeDirection {
  if (lines.length === 0) return 'unknown';
  let out: ScopeDirection = 'any';
  for (const l of lines) {
    const d = directionOf(l.fabricDirection);
    if (d === 'unknown') return 'unknown';
    if (d === 'one_way') out = 'one_way';
    else if (d === 'two_way' && out === 'any') out = 'two_way';
  }
  return out;
}

/**
 * КАКОЕ ПОЛОТНО СУДИТ РАСКЛАДКУ, привязанную к строке `bomLineKey` — точная копия серверного
 * `entity.MarkerFabricScope` (internal/entity/fabric_direction.go), потому что расхождение здесь
 * стоит отказа ПОСЛЕ прогона: клиент раскладывает по одной политике, сервер судит по другой.
 *
 * Два правила, и второе легко не заметить:
 *
 *  1. НАЗНАЧЕНИЕ, а не строка. Одни и те же лекала кроятся со всех артикулов одного назначения,
 *     согласованность их направлений никто не валидирует, поэтому строгое побеждает.
 *  2. СЕМПЛОВАЯ ЯРДАЖА В СКОУП НЕ ВХОДИТ. is_sample — флаг РЯДОМ с назначением, а не его значение,
 *     ровно потому, что одна карточка несёт производственную основную ткань И семпловую основную
 *     ткань под ОДНИМ назначением (0265). Без этого фильтра непроставленное направление на
 *     семпловом рулоне объявляло бы «НЕ ЗАДАНО» и снимало 180° у ПРОИЗВОДСТВЕННОГО маркера,
 *     который сервер принял бы. Симметрично: ворс производственного рулона не должен управлять
 *     раскладкой, которая его никогда не коснётся.
 *
 * Пустой результат (ключ ни к чему не резолвится, привязки нет) — это 'unknown' у
 * strictestDirection, то есть «никто не ответил», а не «можно всё».
 */
export function markerScopeLines<L extends RollGoodsLine & { isSample?: boolean }>(
  bomLineKey: string,
  lines: L[],
): L[] {
  const key = (bomLineKey ?? '').trim().toLowerCase();
  if (!key) return [];
  const named = lines.find((l) => (l.lineKey ?? '').trim().toLowerCase() === key);
  if (!named) return [];
  const sample = !!named.isSample;
  const purpose = (named.purpose ?? '').trim();
  if (!purpose || purpose === UNSET_PURPOSE) return [named];
  return lines.filter((l) => !!l.isSample === sample && (l.purpose ?? '').trim() === purpose);
}

/** Направление, которому обязана подчиняться раскладка на строке `bomLineKey`. */
export function markerScopeDirection(
  bomLineKey: string,
  lines: Array<RollGoodsLine & { isSample?: boolean; fabricDirection?: string }>,
): ScopeDirection {
  return strictestDirection(markerScopeLines(bomLineKey, lines));
}

/** THE rule, pure half: no BOM needed, so the dedupe checks can run anywhere. */
export function fabricScopeKey(purpose?: string, bomLineKey?: string): string {
  const p = (purpose ?? '').trim();
  if (p && p !== UNSET_PURPOSE) return p;
  return (bomLineKey ?? '').trim();
}

/** The scope an alias row files under. */
export function aliasScopeKey(a: { fabricPurpose?: string; bomLineKey?: string }): string {
  return fabricScopeKey(a.fabricPurpose, a.bomLineKey);
}

/**
 * Fold the card's cloth lines into the scopes the panel groups by: one per назначение present, in
 * the owner's order, then one per UNSORTED line in BOM order.
 *
 * An unsorted line trailing its own group rather than being folded into MAIN is the same choice
 * groupBomLines makes on the BOM tab, and for the same reason: «not sorted yet» must stay visibly
 * different from «sorted, and the answer is основной материал».
 */
export function fabricScopes<L extends RollGoodsLine>(lines: L[]): FabricScope<L>[] {
  const byPurpose = new Map<string, L[]>();
  const loose: FabricScope<L>[] = [];
  for (const l of lines) {
    if (!l.lineKey) continue;
    const p = l.purpose && l.purpose !== UNSET_PURPOSE ? l.purpose : '';
    if (!p) {
      loose.push({ key: l.lineKey, byPurpose: false, lines: [l] });
      continue;
    }
    byPurpose.set(p, [...(byPurpose.get(p) ?? []), l]);
  }
  const ordered: FabricScope<L>[] = [];
  const known = new Set<string>(bomPurposeOrder as string[]);
  bomPurposeOrder.forEach((p) => {
    const ls = byPurpose.get(p);
    if (ls?.length) ordered.push({ key: p, byPurpose: true, lines: ls });
  });
  // A purpose this build does not know (a card saved by a newer client) still has to render its
  // sheets — under its raw value rather than vanishing from the panel that claims to list them.
  [...byPurpose.keys()]
    .filter((p) => !known.has(p))
    .sort()
    .forEach((p) => ordered.push({ key: p, byPurpose: true, lines: byPurpose.get(p)! }));
  return [...ordered, ...loose];
}

/**
 * Resolution for DISPLAY: which scope does a STORED binding belong to? This is the case that
 * usually breaks mid-sort, so it is worth stating plainly — a sheet bound to line L, whose L has
 * SINCE been sorted into назначение P, belongs to P's group. Matching the sheet's raw scope key
 * against the group keys would strand it as «без материала» the moment the operator sorted the BOM,
 * which is precisely the "you sorted and lost your work" outcome the additive design exists to avoid.
 *
 * Returns '' when nothing resolves — a genuinely loose sheet (uploaded before 0260, or its line was
 * deleted/reclassified).
 */
export function scopeKeyOfBinding(
  purpose: string | undefined,
  bomLineKey: string | undefined,
  scopes: FabricScope<RollGoodsLine>[],
): string {
  const p = (purpose ?? '').trim();
  if (p && p !== UNSET_PURPOSE) {
    return scopes.some((s) => s.key === p) ? p : '';
  }
  const line = (bomLineKey ?? '').trim();
  if (!line) return '';
  return scopes.find((s) => s.lines.some((l) => l.lineKey === line))?.key ?? '';
}

/**
 * What to WRITE for a scope. The compatibility line rides along only when the scope owns exactly
 * ONE line: with several there is no single honest answer, and inventing one is how a class quietly
 * becomes an article — which is the confusion this whole change exists to remove. An unsorted scope
 * writes the line and no purpose, i.e. byte-for-byte what the panel wrote before 0267.
 */
export function bindingForScope<L extends RollGoodsLine>(
  scope: FabricScope<L>,
): { fabricPurpose: string; bomLineKey: string } {
  if (!scope.byPurpose) return { fabricPurpose: '', bomLineKey: scope.key };
  return {
    fabricPurpose: scope.key,
    bomLineKey: scope.lines.length === 1 ? scope.lines[0].lineKey : '',
  };
}

/**
 * Does a STORED alias belong to this scope? The mid-sort question again, and the one that decides
 * whether «детали кроя» shows a card's existing work or silently offers to redo it.
 *
 * An alias written before the card was sorted carries the LINE. Once that line is sorted into
 * назначение P, the alias still belongs to P's group — comparing raw scope keys would say otherwise
 * and the dialog would offer every already-mapped block again, minting a second alias for the same
 * physical piece.
 */
export function aliasInScope<L extends RollGoodsLine>(
  a: { fabricPurpose?: string; bomLineKey?: string },
  scope: FabricScope<L>,
): boolean {
  const p = (a.fabricPurpose ?? '').trim();
  if (p && p !== UNSET_PURPOSE) return scope.byPurpose && scope.key === p;
  const line = (a.bomLineKey ?? '').trim();
  if (!line) return false;
  return scope.lines.some((l) => l.lineKey === line);
}

// ═══ ONE WRITER FOR A SCOPE'S BINDINGS (sheet binding, lane B1) ═══════════════════════════════
//
// The owner's rule: a DXF sheet is never «without a material». Every path that moves a cloth line
// between scopes — the purpose select on BOM, MATERIALS and PATTERNS, a section change, a delete,
// the construction draft's undo, a sheet dragged onto another tile — either carries the sheets and
// piece links along or refuses. These pure helpers are the one place that decides which rows go,
// so the editors cannot drift apart. They return the next arrays; the caller writes them.

/** A stored binding: a pattern sheet row or a DXF piece link. */
export type BindingRow = { fabricPurpose?: string; bomLineKey?: string };
/** A DXF piece link (`pieceDxfAliases[]`). */
export type AliasRow = BindingRow & { blockName?: string; pieceLineKey?: string };
/** A saved marker: it measures one BOM line. */
export type MarkerRef = { bomLineKey?: string };

/** The card's cloth lines as the scopes see them: the four roll-goods sections, keyed lines only. */
export function clothLines(
  items: readonly { lineKey?: string; purpose?: string; name?: string; section?: string }[],
): RollGoodsLine[] {
  return items
    .filter((b) => isRollGoodsSection(b.section) && !!b.lineKey?.trim())
    .map((b) => ({
      lineKey: (b.lineKey ?? '').trim(),
      purpose: b.purpose ?? '',
      name: b.name ?? '',
      section: b.section ?? '',
    }));
}

/** The scope a line sits in; undefined when the line is not cloth. */
export function scopeOfLine<L extends RollGoodsLine>(
  scopes: readonly FabricScope<L>[],
  lineKey: string,
): FabricScope<L> | undefined {
  const key = lineKey.trim();
  return key ? scopes.find((s) => s.lines.some((l) => l.lineKey === key)) : undefined;
}

/** Block identity for «which sheet holds this block»: case and inner spaces do not count. */
export function blockKey(name?: string): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const resolvedScope = (b: BindingRow, scopes: readonly FabricScope<RollGoodsLine>[]) =>
  scopeKeyOfBinding(b.fabricPurpose, b.bomLineKey, scopes as FabricScope<RollGoodsLine>[]);

/**
 * Piece links that would bounce the save: two different pieces on one block under one STORED scope
 * — the same key as the schema's alias dedupe and the server's UNIQUE. Only groups holding a row of
 * `touched` count: an old clash is not this move's doing.
 */
export function aliasCollisions(
  aliases: readonly AliasRow[],
  touched: ReadonlySet<number>,
): string[] {
  const groups = new Map<string, { block: string; pieces: Set<string>; touched: boolean }>();
  aliases.forEach((a, i) => {
    const block = a.blockName?.trim() ?? '';
    const piece = a.pieceLineKey?.trim() ?? '';
    if (!block || !piece) return;
    const key = `${aliasScopeKey(a).toLowerCase()}|${block.toLowerCase()}`;
    const g = groups.get(key) ?? { block, pieces: new Set<string>(), touched: false };
    g.pieces.add(piece);
    if (touched.has(i)) g.touched = true;
    groups.set(key, g);
  });
  const out: string[] = [];
  for (const g of groups.values()) {
    if (g.touched && g.pieces.size > 1 && !out.includes(g.block)) out.push(g.block);
  }
  return out;
}

/** What uses a scope: its sheets, its piece links, and the markers of its lines. */
export type ScopeImpact<P, A, M> = { sheets: P[]; aliases: A[]; markers: M[] };

export function impactEmpty(i: ScopeImpact<unknown, unknown, unknown>): boolean {
  return i.sheets.length + i.aliases.length + i.markers.length === 0;
}

export function scopeImpact<P extends BindingRow, A extends BindingRow, M extends MarkerRef>(
  scope: FabricScope<RollGoodsLine>,
  card: {
    patterns: readonly P[];
    aliases: readonly A[];
    markers?: readonly M[];
    scopes: readonly FabricScope<RollGoodsLine>[];
  },
): ScopeImpact<P, A, M> {
  const keys = new Set(scope.lines.map((l) => l.lineKey));
  return {
    sheets: card.patterns.filter((p) => resolvedScope(p, card.scopes) === scope.key),
    aliases: card.aliases.filter((a) => resolvedScope(a, card.scopes) === scope.key),
    markers: (card.markers ?? []).filter((m) => keys.has(m.bomLineKey?.trim() ?? '')),
  };
}

/**
 * What holds a line in the cloth (delete, section change, the draft's undo): the rows that resolve
 * now and would resolve to nothing once the line is gone — the «without a material» rows. A line
 * that shares its purpose with others strands nothing (the purpose still resolves); the LAST line
 * of a scope takes the whole scope with it, its markers included.
 */
export function lineExitImpact<P extends BindingRow, A extends BindingRow, M extends MarkerRef>(
  lineKey: string,
  card: {
    lines: readonly RollGoodsLine[];
    patterns: readonly P[];
    aliases: readonly A[];
    markers?: readonly M[];
  },
): ScopeImpact<P, A, M> {
  const key = lineKey.trim();
  const before = fabricScopes([...card.lines]);
  const own = scopeOfLine(before, key);
  if (!own) return { sheets: [], aliases: [], markers: [] };
  const after = fabricScopes(card.lines.filter((l) => l.lineKey !== key));
  const strands = (b: BindingRow) =>
    resolvedScope(b, before) !== '' && resolvedScope(b, after) === '';
  return {
    sheets: card.patterns.filter(strands),
    aliases: card.aliases.filter(strands),
    markers:
      own.lines.length === 1
        ? (card.markers ?? []).filter((m) => m.bomLineKey?.trim() === key)
        : [],
  };
}

/**
 * A line leaves a purpose that stays live: rows that carried its key as the compatibility line get
 * the scope's own answer (its one remaining line, or none). The purpose still resolves them; the
 * stale key would only point the next reader at a line that is gone.
 */
export function releaseLineKey(
  rows: readonly BindingRow[],
  lineKey: string,
  nextLines: readonly RollGoodsLine[],
): Array<{ index: number; bomLineKey: string }> {
  const key = lineKey.trim();
  if (!key) return [];
  const next = fabricScopes([...nextLines]);
  const out: Array<{ index: number; bomLineKey: string }> = [];
  rows.forEach((r, index) => {
    if ((r.bomLineKey ?? '').trim() !== key) return;
    const p = (r.fabricPurpose ?? '').trim();
    if (!p || p === UNSET_PURPOSE) return;
    const scope = next.find((s) => s.byPurpose && s.key === p);
    if (!scope) return;
    const bomLineKey = bindingForScope(scope).bomLineKey;
    if (bomLineKey !== key) out.push({ index, bomLineKey });
  });
  return out;
}

/** The answer of a move: the next arrays, nothing to do, a block clash, or blocks not read yet. */
export type BindingMove<P, A> =
  | { kind: 'moved'; patterns: P[]; aliases: A[]; sheets: number; links: number }
  | { kind: 'noop' }
  | { kind: 'clash'; blocks: string[] }
  | { kind: 'pending' };

/**
 * Move everything bound to scope `from` onto `to`: sheets AND piece links, both fields of the
 * binding at once (bindingForScope). `scopes` are the scopes BEFORE the change — they decide what
 * belongs to `from`; `to` is the target AFTER it, so its line count picks the compatibility line.
 * A merge into a scope that already links a block of the same name to another piece is refused
 * with the clashing block names: the save would bounce on it, so the move does not happen.
 */
export function moveScope<P extends BindingRow, A extends AliasRow>(input: {
  patterns: readonly P[];
  aliases: readonly A[];
  scopes: readonly FabricScope<RollGoodsLine>[];
  from: string;
  to: FabricScope<RollGoodsLine>;
}): BindingMove<P, A> {
  const from = input.from.trim();
  if (!from) return { kind: 'noop' };
  const binding = bindingForScope(input.to);
  let sheets = 0;
  const patterns = input.patterns.map((p) => {
    if (resolvedScope(p, input.scopes) !== from) return p;
    sheets++;
    return { ...p, ...binding };
  });
  const touched = new Set<number>();
  const aliases = input.aliases.map((a, i) => {
    if (resolvedScope(a, input.scopes) !== from) return a;
    touched.add(i);
    return { ...a, ...binding };
  });
  if (sheets === 0 && touched.size === 0) return { kind: 'noop' };
  const blocks = aliasCollisions(aliases, touched);
  if (blocks.length > 0) return { kind: 'clash', blocks };
  return { kind: 'moved', patterns, aliases, sheets, links: touched.size };
}

/**
 * Move ONE sheet onto scope `to` (a drag between tiles). The piece links whose blocks come from
 * this sheet's DXF go with it — only those no other sheet of the old scope still holds (a sibling
 * whose blocks are unknown holds them all). `blocksOf` gives a sheet's block identities (blockKey of
 * each name and of its sizeless identity); null = not read yet, and then the move waits. A sheet
 * bound to nothing live just takes the binding: there are no links to carry.
 */
export function moveSheet<P extends BindingRow, A extends AliasRow>(input: {
  patterns: readonly P[];
  aliases: readonly A[];
  scopes: readonly FabricScope<RollGoodsLine>[];
  sheet: number;
  to: FabricScope<RollGoodsLine>;
  blocksOf: (row: P, index: number) => ReadonlySet<string> | null;
}): BindingMove<P, A> {
  const row = input.patterns[input.sheet];
  if (!row) return { kind: 'noop' };
  const from = resolvedScope(row, input.scopes);
  if (from === input.to.key) return { kind: 'noop' };
  const binding = bindingForScope(input.to);
  const patterns = input.patterns.map((p, i) => (i === input.sheet ? { ...p, ...binding } : p));
  if (!from) return { kind: 'moved', patterns, aliases: [...input.aliases], sheets: 1, links: 0 };
  const own = input.blocksOf(row, input.sheet);
  if (!own) return { kind: 'pending' };
  const siblings = input.patterns
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => i !== input.sheet && resolvedScope(p, input.scopes) === from)
    .map(({ p, i }) => input.blocksOf(p, i));
  const held = (k: string) => siblings.some((s) => s == null || s.has(k));
  const touched = new Set<number>();
  const aliases = input.aliases.map((a, i) => {
    if (resolvedScope(a, input.scopes) !== from) return a;
    const k = blockKey(a.blockName);
    if (!k || !own.has(k) || held(k)) return a;
    touched.add(i);
    return { ...a, ...binding };
  });
  const blocks = aliasCollisions(aliases, touched);
  if (blocks.length > 0) return { kind: 'clash', blocks };
  return { kind: 'moved', patterns, aliases, sheets: 1, links: touched.size };
}
