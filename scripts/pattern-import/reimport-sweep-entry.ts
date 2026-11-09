// PATTERN-IMPORT · G-all — re-upload of a DXF over ANY prod card keeps the card intact.
//
// Offline regression sweep over a read-only snapshot of prod (sweep-data: prod-dump.tsv from
// `db.sh --prod`, the cards' current DXF sheets as files/c<card>-r<row>.dxf). Per card, the card side
// is read exactly as patterns-field.tsx reads it when the import wizard opens on a dropped slot:
// fabric scopes, sheet / link sets, the card's parse of its own sheets (parseCachedSources), the
// contour pieces per scope, `pieceShapeReferences` → `shapeRefsOf` → `buildCardContext`. Per sheet,
// the REAL wizard hook (`useImportSession` over an in-process worker Session, pinned to the slot's
// scope, the autopilot answering and the replay probe's stand-in operator where it stops) imports
// the stored file again; the draft is the card's own `cardBuildDraft` (= `buildDraft`).
//   A · the same file            → a no-op: no new piece, no card piece of the sheet left without a
//                                   block, nothing unresolved, no link moved to another piece, no
//                                   hand swap, no piece write (fused / × per garment / symmetry)
//   B · CLO-style renamed blocks → the same (hand token moved to the end + `_UNI`: PCK_L_MAIN →
//                                   PCK_MAIN_L_UNI), every spelling of the name in the file renamed
//   C · the same file onto an empty card → today's draft pairs pieces exactly as the draft before
//                                   7e4203260 did (old module bundled by the runner as `old-draft`)
//   node scripts/pattern-import/reimport-sweep.mjs [card[:row,row]…]   (data: REIMPORT_SWEEP_DATA)
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildDraft, handOf, tokenKey } from 'lib/pattern-import/fabrics/draft';
import { buildDraft as buildDraftOld } from 'old-draft';
import type { CardDraft, DraftScope, StageIO } from 'lib/pattern-import/types';
import { toWireError } from 'lib/pattern-import/worker/errors';
import { pieceShapeReferences, type PieceShapeReference } from 'lib/dxf-reconcile';
import { parseCachedSources } from 'lib/nesting/worker/parse-cached-sources';
import { NEST_DEFAULTS, type PieceDTO } from 'lib/nesting/types';
import { isDxfUrl } from 'utils/pattern';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import {
  aliasInScope,
  bindingForScope,
  bindingScopes,
  fabricScopes,
  isRollGoodsSection,
  scopeKeyOfBinding,
} from 'components/managers/tech-card/components/bom-purpose';
import {
  dxfByScope,
  patternSheetName,
} from 'components/managers/tech-card/components/nesting/dxf-by-scope';
import { sizeTokensOf } from 'components/managers/tech-card/components/nesting/block-code';
import { splitPiecesBySize } from 'components/managers/tech-card/components/nesting/split-pieces';
import {
  defaultContourLayer,
  layerOptions,
} from 'components/managers/tech-card/components/nesting/contour-layer';
import {
  buildCardContext,
  shapeRefsOf,
} from 'components/managers/tech-card/components/pattern-import/entry';
import type { CardContext } from 'components/managers/tech-card/components/pattern-import/client';
import {
  useImportSession,
  type ImportSessionApi,
} from 'components/managers/tech-card/components/pattern-import/use-import-session';
import {
  hookDriveCtx,
  resolverFor,
} from 'components/managers/tech-card/components/pattern-import/autopilot';
import {
  driveTick,
  newDriveState,
} from 'components/managers/tech-card/components/pattern-import/auto-drive';

import { mountHook, rerender } from './react-hook-shim';
import { sessionClient } from './autopilot-entry';
import { operate } from './replay-entry';

// lib/fusing-dxf/regenerate.ts GENERATED_FUSING_NAME_PREFIX (that module pulls the API client in)
const GENERATED_FUSING_NAME_PREFIX = 'Fusing · generated · ';

const DATA =
  process.env.REIMPORT_SWEEP_DATA ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/reimport-keeps-card/sweep-data';

// ── prod snapshot ───────────────────────────────────────────────────────────────────────────────

type Card = { id: number; style: string; name: string; season: string };
type Bom = { lineKey: string; section: string; purpose: string; name: string; order: number };
type Piece = {
  lineKey: string;
  name: string;
  piecesPerGarment: number;
  cutSymmetry: string;
  fused: boolean;
  fusingMode: string;
};
type Alias = { bomLineKey: string; fabricPurpose: string; blockName: string; pieceLineKey: string };
type Row = {
  id: number;
  lineKey: string;
  bomLineKey: string;
  fabricPurpose: string;
  sizeId: number;
  url: string;
  filename: string;
  name: string;
};
type Snapshot = {
  cards: Card[];
  sizesOf: Map<number, number[]>;
  dict: Map<number, { name: string; skuOrd: number | null }>;
  bomOf: Map<number, Bom[]>;
  piecesOf: Map<number, Piece[]>;
  aliasesOf: Map<number, Alias[]>;
  rowsOf: Map<number, Row[]>;
};

const SECTION = (s: string) => (s ? `TECH_CARD_BOM_SECTION_${s.toUpperCase()}` : '');
const PURPOSE = (s: string) =>
  s ? `TECH_CARD_BOM_PURPOSE_${s.toUpperCase()}` : 'TECH_CARD_BOM_PURPOSE_UNKNOWN';
const SYMMETRY = (s: string) => `TECH_CARD_PIECE_CUT_SYMMETRY_${(s || 'unknown').toUpperCase()}`;
const FUSING = (s: string) => `TECH_CARD_PIECE_FUSING_MODE_${(s || 'unknown').toUpperCase()}`;

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const l = m.get(k);
  if (l) l.push(v);
  else m.set(k, [v]);
}

function loadSnapshot(): Snapshot {
  const s: Snapshot = {
    cards: [],
    sizesOf: new Map(),
    dict: new Map(),
    bomOf: new Map(),
    piecesOf: new Map(),
    aliasesOf: new Map(),
    rowsOf: new Map(),
  };
  const lines = readFileSync(resolve(DATA, 'prod-dump.tsv'), 'utf8').split('\n');
  for (const line of lines) {
    const f = line.split('\t');
    // header rows carry the column names, never a number
    if (!/^\d+$/.test(f[1] ?? '')) continue;
    const n = (i: number) => Number(f[i]);
    switch (f[0]) {
      case 'CARD':
        s.cards.push({ id: n(1), style: f[2], name: f[3], season: f[4] });
        break;
      case 'CSIZE':
        push(s.sizesOf, n(1), n(2));
        break;
      case 'DICT':
        s.dict.set(n(1), { name: f[2], skuOrd: f[3] === '' ? null : Number(f[3]) });
        break;
      case 'BOM':
        push(s.bomOf, n(1), {
          lineKey: f[3],
          section: SECTION(f[4]),
          purpose: PURPOSE(f[5]),
          name: f[6],
          order: n(7),
        });
        break;
      case 'PIECE':
        push(s.piecesOf, n(1), {
          lineKey: f[3],
          name: f[4],
          piecesPerGarment: n(5),
          cutSymmetry: SYMMETRY(f[6]),
          fused: f[7] === '1',
          fusingMode: FUSING(f[8]),
        });
        break;
      case 'ALIAS':
        if (f[6])
          push(s.aliasesOf, n(1), {
            bomLineKey: f[3],
            fabricPurpose: f[4] ? PURPOSE(f[4]) : '',
            blockName: f[5],
            pieceLineKey: f[6],
          });
        break;
      case 'PAT':
        push(s.rowsOf, n(1), {
          id: n(2),
          lineKey: f[3],
          bomLineKey: f[4],
          fabricPurpose: f[5] ? PURPOSE(f[5]) : '',
          sizeId: n(6),
          url: f[7],
          filename: f[8],
          name: f[9],
        });
        break;
    }
  }
  return s;
}

const fileOf = (card: number, row: number) => resolve(DATA, 'files', `c${card}-r${row}.dxf`);
const bytesOf = (path: string): ArrayBuffer => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

// ── the card as patterns-field reads it ─────────────────────────────────────────────────────────

const ROLE_SECTIONS = new Set([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
]);

type CardSide = {
  ctx: CardContext;
  empty: CardContext;
  /** pattern row id → its resolved scope key (patterns-field `sheetSet`). */
  scopeOfRow: Map<number, string>;
  /** Which shape-ref signature the checkout's `shapeRefsOf` took (review fix 804128b34: sheet). */
  shapeRefs: 'sheet' | 'scope';
  scopeLabel: Map<string, string>;
};

async function cardSide(snap: Snapshot, card: Card): Promise<CardSide> {
  const bomItems = snap.bomOf.get(card.id) ?? [];
  const fabricBomLines = bomItems
    .filter((b) => ROLE_SECTIONS.has(b.section) && b.lineKey)
    .map((b, i) => ({ ...b, id: 0, order: i }));
  const first = (sc: { lines: { order: number }[] }) => Math.min(...sc.lines.map((l) => l.order));
  const scopes = fabricScopes(fabricBomLines).sort((a, b) => first(a) - first(b));
  const liveRows = snap.rowsOf.get(card.id) ?? [];
  const pieceDxfAliases = snap.aliasesOf.get(card.id) ?? [];
  const cardPieces = snap.piecesOf.get(card.id) ?? [];
  const sheetSet = bindingScopes(scopes, liveRows);
  const linkSet = bindingScopes(scopes, pieceDxfAliases);

  // card-dxf-pack.ts `useCardDxfPack`
  const packScopes = fabricScopes(
    bomItems
      .filter((b) => isRollGoodsSection(b.section) && !!b.lineKey)
      .map((b) => ({ lineKey: b.lineKey, purpose: b.purpose, name: b.name, section: b.section })),
  );
  const packSheets = bindingScopes(packScopes, liveRows);
  const files = liveRows
    .filter((p) => !!p.url && isDxfUrl(p.url))
    .map((p) => ({
      scopeKey: scopeKeyOfBinding(p.fabricPurpose, p.bomLineKey, packSheets),
      name: patternSheetName(p),
      url: p.url,
      row: p,
    }));

  // dxf-geometry.tsx `dxfGeometryQuery` — the worker's parseCachedSources, no cache
  const noCache = {
    read: async () => undefined,
    write: async () => {},
    remove: async () => {},
  };
  const parsed = await parseCachedSources(
    files.map(({ name, url }) => ({ name, url })),
    { unit: 'auto', tol: NEST_DEFAULTS.tol, tolChain: NEST_DEFAULTS.tolChain },
    'reimport-sweep',
    noCache as never,
    async (src) => {
      const f = files.find((x) => x.url === src.url)!;
      return bytesOf(fileOf(card.id, f.row.id));
    },
  );
  const scopeByFile = new Map<number, string>();
  const urlByFile = new Map<number, string>();
  parsed.sourceIndices.forEach((sourceIndex, fileIndex) => {
    scopeByFile.set(fileIndex, files[sourceIndex].scopeKey);
    urlByFile.set(fileIndex, files[sourceIndex].url);
  });
  const manifestByUrl = new Map<string, NonNullable<(typeof parsed.parsed.manifests)[number]>>();
  (parsed.parsed.manifests ?? []).forEach((m, i) => {
    const url = urlByFile.get(i);
    if (m && url) manifestByUrl.set(url, m);
  });
  const bundle = { pieces: parsed.parsed.pieces, scopeByFile, urlByFile };

  // the size dictionary (useSizeNames / useSizeOrdering / useDictionarySizeTokens)
  const sizeById = new Map([...snap.dict].map(([id, d]) => [id, d.name]));
  const ord = new Map([...snap.dict].map(([id, d]) => [id, d.skuOrd ?? id]));
  const orderSizes = (ids: number[]) =>
    [...ids].sort((a, b) => (ord.get(a) ?? a) - (ord.get(b) ?? b) || a - b);
  const dictTokens = new Map<string, number[]>();
  for (const [id, name] of sizeById)
    for (const t of sizeTokensOf(name)) dictTokens.set(t, [...(dictTokens.get(t) ?? []), id]);

  // patterns-field: dxfEntries → dxfByScopeMap → scopeGroups
  const dxfEntries = liveRows.filter((r) => isDxfUrl(r.url)).map((row) => ({ row }));
  const dxfByScopeMap = dxfByScope(dxfEntries, scopes, (e) => e.row, liveRows);
  const scopeGroups = scopes.map((s) => ({ scope: s, entries: dxfByScopeMap.get(s.key) ?? [] }));
  const isGeneratedFusingRow = (row: Row) =>
    (row.name ?? '').startsWith(GENERATED_FUSING_NAME_PREFIX);

  const contourPiecesByScope = new Map<string, PieceDTO[]>();
  for (const group of scopeGroups) {
    const interlining = group.scope.lines.some(
      (line) => line.section === 'TECH_CARD_BOM_SECTION_INTERLINING',
    );
    const ownerUrls = interlining
      ? new Set(
          group.entries
            .filter((entry) => !isGeneratedFusingRow(entry.row))
            .map((entry) => entry.row.url)
            .filter((url): url is string => !!url),
        )
      : null;
    const inScope = bundle.pieces.filter((piece) => {
      const file = piece.fileIndex ?? -1;
      if (bundle.scopeByFile.get(file) !== group.scope.key) return false;
      return !ownerUrls || ownerUrls.has(bundle.urlByFile.get(file) ?? '');
    });
    if (inScope.length === 0) continue;
    const split = splitPiecesBySize(inScope, dictTokens);
    const contourLayer = defaultContourLayer(layerOptions(inScope, split.codeById));
    contourPiecesByScope.set(
      group.scope.key,
      inScope.filter((piece) => (piece.layer ?? '') === contourLayer),
    );
  }
  const livePieces = cardPieces.flatMap((piece) => {
    const lineKey = piece.lineKey?.trim() ?? '';
    const name = piece.name?.trim() ?? '';
    return lineKey && name ? [{ ...piece, lineKey, name }] : [];
  });
  const refsOf = (scope: (typeof scopes)[number], scoped: PieceDTO[]): PieceShapeReference[] =>
    pieceShapeReferences({
      parse: {
        pieces: scoped,
        blockNames: scoped.flatMap((piece) => (piece.blockName?.trim() ? [piece.blockName] : [])),
      },
      bindings: pieceDxfAliases.filter((alias) => aliasInScope(alias, scope, linkSet)),
      pieces: livePieces,
      sizeTokens: [...dictTokens.keys()],
    });
  // 804128b34+: per sheet; before it: per scope (pieceShapesByScope). Whichever this checkout's
  // `shapeRefsOf` takes — the other shape throws on its first destructure.
  const perSheet = scopeGroups.flatMap((group) => {
    const bySheet = new Map<string, PieceDTO[]>();
    for (const piece of contourPiecesByScope.get(group.scope.key) ?? []) {
      const url = bundle.urlByFile.get(piece.fileIndex ?? -1) ?? '';
      bySheet.set(url, [...(bySheet.get(url) ?? []), piece]);
    }
    return [...bySheet].map(([url, scoped]) => ({
      scopeKey: group.scope.key,
      url: url || undefined,
      refs: refsOf(group.scope, scoped),
    }));
  });
  let shapes: ReturnType<typeof shapeRefsOf>;
  let mode: CardSide['shapeRefs'] = 'sheet';
  try {
    shapes = shapeRefsOf(perSheet as never);
  } catch {
    mode = 'scope';
    const byScope = new Map<string, PieceShapeReference[]>();
    for (const group of scopeGroups) {
      const scoped = contourPiecesByScope.get(group.scope.key) ?? [];
      if (scoped.length) byScope.set(group.scope.key, refsOf(group.scope, scoped));
    }
    shapes = shapeRefsOf(byScope as never);
  }

  const label = (sc: (typeof scopes)[number]) =>
    sc.byPurpose
      ? sc.key.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase()
      : sc.lines.map((l) => l.name).join(', ') || 'material';
  const args = {
    techCardId: card.id,
    orderedSizeIds: orderSizes(snap.sizesOf.get(card.id) ?? []),
    sizeName: (id: number) => formatSizeName(sizeById.get(id) ?? `#${id}`),
    rawSizeName: (id: number) => sizeById.get(id),
    scopes: scopes.map((sc) => ({
      key: sc.key,
      byPurpose: sc.byPurpose,
      label: label(sc),
      binding: bindingForScope(sc),
      sections: sc.lines.map((l) => l.section),
    })),
    styleLabel: [card.season, card.style].filter(Boolean).join(' · '),
    cardName: card.name,
    styleNumber: card.style,
  };
  const ctx = buildCardContext({
    ...args,
    pieces: cardPieces,
    aliases: pieceDxfAliases.map((a) => ({
      scopeKey: scopeKeyOfBinding(a.fabricPurpose, a.bomLineKey, linkSet),
      blockName: a.blockName,
      pieceLineKey: a.pieceLineKey,
    })),
    patterns: liveRows.map((p) => ({
      scopeKey: scopeKeyOfBinding(p.fabricPurpose, p.bomLineKey, sheetSet),
      filename: p.filename,
      url: p.url,
      lineKey: p.lineKey,
      name: p.name,
      manifest: (p.url && manifestByUrl.get(p.url)) || null,
    })),
    shapes,
    shapesPending: false,
  } as never);
  const empty = buildCardContext({
    ...args,
    pieces: [],
    aliases: [],
    patterns: [],
    shapes: [],
  } as never);
  return {
    ctx,
    empty,
    scopeOfRow: new Map(
      liveRows.map((p) => [p.id, scopeKeyOfBinding(p.fabricPurpose, p.bomLineKey, sheetSet)]),
    ),
    shapeRefs: mode,
    scopeLabel: new Map(scopes.map((sc) => [sc.key, label(sc)])),
  };
}

// ── variant B: CLO-style rename ─────────────────────────────────────────────────────────────────

const HAND = new Set(['L', 'R', 'LEFT', 'RIGHT']);
const OTHER: Record<string, string> = { L: 'R', R: 'L', LEFT: 'RIGHT', RIGHT: 'LEFT' };

/**
 * Every piece name the sheet prints («PIECE NAME: X», else the block name without its size tail) that
 * has its other hand in the same sheet → hand token moved to the end + `_UNI` (CLO's ungraded
 * spelling): PCK_L_MAIN → PCK_MAIN_L_UNI. Renamed wherever the file spells it: the block, its
 * INSERT, the piece-name text, a bare label.
 */
export function cloRename(
  dxf: string,
  sizeTokens: string[],
): { text: string; map: Map<string, string> } {
  const lines = dxf.split(/\r?\n/);
  const values = lines.map((l) => l.trim());
  const names = new Set<string>();
  for (const v of values) {
    const m = /^PIECE NAME:\s*(.+)$/i.exec(v);
    if (m) names.add(m[1].trim());
  }
  const sizes = new Set(sizeTokens.map((t) => t.toUpperCase()));
  if (!names.size) {
    // no piece-name text: the block names, size tail dropped
    for (let i = 0; i + 1 < values.length; i++)
      if (values[i] === '0' && values[i + 1] === 'BLOCK') {
        for (let j = i + 2; j + 1 < values.length && values[j] !== '0'; j += 2)
          if (values[j] === '2') {
            const b = values[j + 1];
            if (b.startsWith('*')) break;
            const parts = b.split('_');
            if (parts.length > 1 && sizes.has(parts[parts.length - 1].toUpperCase())) parts.pop();
            names.add(parts.join('_'));
            break;
          }
      }
  }
  const map = new Map<string, string>();
  for (const n of names) {
    const parts = n.split('_');
    const hands = parts.filter((p) => HAND.has(p.toUpperCase()));
    if (hands.length !== 1) continue;
    const h = hands[0];
    const other = parts.map((p) => (p === h ? OTHER[h.toUpperCase()] ?? p : p)).join('_');
    const hasOther = [...names].some((x) => x.toUpperCase() === other.toUpperCase());
    if (!hasOther) continue;
    map.set(n, [...parts.filter((p) => p !== h), h, 'UNI'].join('_'));
  }
  if (!map.size) return { text: dxf, map };
  const sizeAlt = [...sizes]
    .map((s) => s.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean)
    .join('|');
  const out = lines.map((raw) => {
    const v = raw.trim();
    const pn = /^(PIECE NAME:\s*)(.+)$/i.exec(v);
    if (pn && map.has(pn[2].trim())) return raw.replace(pn[2].trim(), map.get(pn[2].trim())!);
    if (map.has(v)) return raw.replace(v, map.get(v)!);
    if (sizeAlt) {
      const m = new RegExp(`^(.+)_(${sizeAlt})$`, 'i').exec(v);
      if (m && map.has(m[1])) return raw.replace(v, `${map.get(m[1])}_${m[2]}`);
    }
    return raw;
  });
  return { text: out.join('\n'), map };
}

// ── one wizard run ──────────────────────────────────────────────────────────────────────────────

const settle = async () => {
  for (let k = 0; k < 4; k++) await Promise.resolve();
  rerender();
};

type Run = {
  reached: boolean;
  stop: string | null;
  ops: string[];
  write: StageIO['write']['out'] | null;
  draft: CardDraft | null;
  /** Scopes whose gate fails the export: scope key → the failing block checks (id, blocks, note). */
  gate: { scopeKey: string; checks: { id: string; blocks: number; note: string }[] }[];
  /** REIMPORT_SWEEP_DEBUG: the wizard's answers and the written pieces' counts. */
  debug?: { ops: string[]; answers: string[]; pieces: string[] };
  error?: string;
};

async function runWizard(
  card: CardContext,
  pinScopeKey: string,
  name: string,
  bytes: ArrayBuffer,
): Promise<Run> {
  const { client, outs } = sessionClient();
  let api!: ImportSessionApi;
  mountHook(() => {
    api = useImportSession({
      client,
      card,
      namer: async () => [],
      // card-apply.ts `cardBuildDraft` — the card's own draft builder
      // REIMPORT_SWEEP_CARD_DRAFT=old: the draft before 7e4203260 (shows what the sweep catches)
      buildDraft: (write, { card: c }) =>
        process.env.REIMPORT_SWEEP_CARD_DRAFT === 'old'
          ? (buildDraftOld(write, c as never) as CardDraft)
          : buildDraft(write, c),
      applyDraft: async () => ({ ok: true, uploaded: [] }),
      pinScopeKey,
    });
  });
  const rec: Run = { reached: false, stop: null, ops: [], write: null, draft: null, gate: [] };
  const auto = resolverFor(card, () => api);
  const drive = async () => {
    let st = newDriveState();
    for (let t = 0; t < 600; t++) {
      const r = await driveTick(
        st,
        hookDriveCtx(() => api, settle, auto),
      );
      await settle();
      if (r.kind !== 'stopped') continue;
      if (r.why === 'auto-stop' && api.session.step === 'check') return true;
      if (rec.ops.length < 60 && (await operate({} as never, () => api, r, rec.ops))) {
        await settle();
        st = newDriveState();
        continue;
      }
      rec.stop = `${r.step}: ${r.why}: ${String(r.reason ?? r.question ?? '').slice(0, 200)}`;
      return false;
    }
    rec.stop = 'tick budget spent';
    return false;
  };
  try {
    await api.dispatch({ type: 'files', files: [new File([bytes], name)] });
    await settle();
    rec.reached = await drive();
    if (rec.reached) {
      rec.write = (outs.write as StageIO['write']['out']) ?? null;
      rec.draft = api.session.draft;
      rec.gate = Object.entries(api.session.gate ?? {})
        .filter(([, g]) => !g.passed)
        .map(([scopeKey, g]) => ({
          scopeKey,
          checks: g.checks
            .filter((c) => !c.ok && c.severity === 'block')
            .map((c) => ({ id: c.id, blocks: c.blocks.length, note: c.note })),
        }));
      if (process.env.REIMPORT_SWEEP_DEBUG)
        rec.debug = {
          ops: rec.ops,
          answers: api.inputs.autopilot.map((a) => `${a.kind} · ${a.subject} → ${a.answer}`),
          pieces: (api.session.semantics?.pieces ?? []).map(
            (p) => `${p.identity} ×${p.piecesPerGarment}${p.pairOf ? ` pair of ${p.pairOf}` : ''}`,
          ),
        };
    }
  } catch (e) {
    rec.error = String((e as Error)?.stack ?? e).slice(0, 800);
  }
  try {
    await client.close(1);
  } catch {
    /* gone */
  }
  (globalThis as { gc?: () => void }).gc?.();
  return rec;
}

// ── checks ──────────────────────────────────────────────────────────────────────────────────────

type Verdict = {
  variant: 'A' | 'B' | 'C';
  pass: boolean;
  /** The wizard stopped before the check step with this question (neither PASS nor FAIL). */
  stop?: string;
  /** One-line causes of a FAIL. */
  fails: string[];
  /** block → piece before / after (moves, new links, lost links). */
  moved: string[];
  notes: string[];
  stats: Record<string, number | string>;
};

const lc = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

function checkNoOp(
  variant: 'A' | 'B',
  card: CardContext,
  run: Run,
  slot: string,
  sheetUrl: string,
  rename: Map<string, string>,
  labelOf: (k: string) => string,
): Verdict {
  const v: Verdict = { variant, pass: false, fails: [], moved: [], notes: [], stats: {} };
  if (run.error) {
    v.fails.push(`crashed: ${run.error.split('\n')[0]}`);
    return v;
  }
  if (!run.reached || !run.draft) {
    v.stop = run.stop ?? 'no draft';
    v.fails.push(`wizard did not reach the check step (${v.stop})`);
    return v;
  }
  const d = run.draft;
  const nameOf = new Map(card.existingPieces.map((p) => [p.lineKey, p.name]));
  const pn = (k: string) => nameOf.get(k) ?? d.pieces.find((p) => p.lineKey === k)?.name ?? '?';
  const draftScopes = [...new Set(d.scopes.map((s) => s.target.scopeKey))];
  v.stats.blocks = d.aliases.length;
  v.stats.pieces = d.pieces.length;
  v.stats.scopes = draftScopes.map(labelOf).join('+');
  if (draftScopes.some((k) => k !== slot))
    v.fails.push(
      `the file also wrote into another material: ${draftScopes
        .filter((k) => k !== slot)
        .map(labelOf)
        .join(', ')}`,
    );
  for (const g of run.gate)
    v.fails.push(
      `the check step blocks the upload (${labelOf(g.scopeKey)}): ${g.checks
        .map((c) => `${c.id} on ${c.blocks} blocks — ${c.note.split(';')[0].slice(0, 110)}`)
        .join(' · ')}`,
    );
  if (run.debug) v.notes.push(`debug ${JSON.stringify(run.debug)}`);
  if (d.scopes.some((s) => s.alreadyOnCard))
    v.notes.push('same file already on the card (no upload)');
  for (const s of d.scopes)
    if (s.replaces) v.stats.replaces = `${s.replaces.matchedBy}`;
    else v.notes.push(`${labelOf(s.target.scopeKey)}: adds a second sheet (replaces nothing)`);

  // new pieces
  for (const p of d.pieces.filter((x) => !x.existingLineKey)) {
    const blocks = d.aliases.filter((a) => a.pieceLineKey === p.lineKey).map((a) => a.blockName);
    v.fails.push(`new piece «${p.name}» (block ${blocks.join(', ') || '?'})`);
  }
  // unresolved
  for (const u of d.unresolved ?? [])
    v.fails.push(
      `unresolved block ${u.blockName}: ${u.candidates.map((c) => pn(c.pieceLineKey)).join(' / ') || 'no candidate'}`,
    );
  // writes
  const byReason = new Map<string, string[]>();
  for (const u of d.pieceUpdates) push(byReason, u.reason, `«${pn(u.lineKey)}»`);
  for (const [reason, names] of byReason)
    v.fails.push(
      `rewrites ${names.length} card piece${names.length > 1 ? 's' : ''} (${reason}): ${names.join(', ')}`,
    );

  // links: before (card) vs after (draft), per scope the draft writes, matched by the order-free
  // name key (UNI dropped) after the rename of variant B
  const renamedKey = (block: string) => {
    for (const [from, to] of rename) if (lc(from) === lc(block)) return tokenKey(to);
    return tokenKey(block);
  };
  for (const sk of draftScopes) {
    const before = (card.existingAliases ?? []).filter((a) => a.scopeKey === sk);
    const after = d.aliases.filter((a) => a.scopeKey === sk);
    const afterByKey = new Map<string, typeof after>();
    for (const a of after) push(afterByKey, tokenKey(a.blockName), a);
    const owners = new Set(after.map((a) => a.pieceLineKey));
    let same = 0;
    for (const b of before) {
      const hits = afterByKey.get(renamedKey(b.blockName)) ?? [];
      if (!hits.length) continue;
      if (hits.some((h) => h.pieceLineKey === b.pieceLineKey)) {
        same++;
        continue;
      }
      v.fails.push(
        `link moved: ${b.blockName} → «${pn(b.pieceLineKey)}» now «${pn(hits[0].pieceLineKey)}»`,
      );
      v.moved.push(
        `${b.blockName} → ${pn(b.pieceLineKey)} ⇒ ${hits[0].blockName} → ${pn(hits[0].pieceLineKey)}`,
      );
    }
    v.stats[`same:${labelOf(sk)}`] = `${same}/${before.length}`;
    // a card piece of this sheet left without a block
    const sheetPieces = new Set([
      ...before.map((a) => a.pieceLineKey),
      ...(card.existingShapes ?? [])
        .filter((r) => r.scopeKey === sk && (!r.url || r.url === sheetUrl))
        .map((r) => r.pieceLineKey),
    ]);
    for (const k of sheetPieces) {
      if (owners.has(k) || !nameOf.has(k)) continue;
      const was = before.filter((a) => a.pieceLineKey === k).map((a) => a.blockName);
      v.fails.push(
        `card piece «${pn(k)}» left without a block (was ${was.join(', ') || 'outline only'})`,
      );
      v.moved.push(`${was.join(', ') || '(outline)'} → ${pn(k)} ⇒ (none)`);
    }
    // an old link whose block the file no longer spells that way, and a link that is not a renamed
    // spelling of an old one: paired up by their card piece (the piece kept, its block renamed)
    const beforeKeys = new Set(before.map((b) => renamedKey(b.blockName)));
    const fresh = after.filter((a) => !beforeKeys.has(tokenKey(a.blockName)));
    const lost = before.filter((b) => !afterByKey.has(renamedKey(b.blockName)));
    for (const b of lost) {
      if (!owners.has(b.pieceLineKey)) continue; // left without a block: reported above
      const to = fresh.find((a) => a.pieceLineKey === b.pieceLineKey);
      if (to) {
        fresh.splice(fresh.indexOf(to), 1);
        v.notes.push(
          `link renamed, same piece: block ${b.blockName} becomes ${to.blockName} on «${pn(b.pieceLineKey)}»`,
        );
        v.moved.push(
          `${b.blockName} → ${pn(b.pieceLineKey)} ⇒ ${to.blockName} → ${pn(to.pieceLineKey)}`,
        );
      } else {
        v.notes.push(
          `link dropped, the piece keeps other blocks: ${b.blockName} → «${pn(b.pieceLineKey)}»`,
        );
        v.moved.push(`${b.blockName} → ${pn(b.pieceLineKey)} ⇒ (dropped)`);
      }
    }
    for (const a of fresh) v.moved.push(`(new link) ${a.blockName} → ${pn(a.pieceLineKey)}`);
    // hand swap: a block of one hand on a piece named for the other, unless the card already had it
    for (const a of after) {
      const hb = handOf(a.blockName);
      const hp = handOf(pn(a.pieceLineKey));
      if (!hb || !hp || hb === hp) continue;
      const had = before.some(
        (b) =>
          b.pieceLineKey === a.pieceLineKey && renamedKey(b.blockName) === tokenKey(a.blockName),
      );
      if (!had) v.fails.push(`hand swap: ${a.blockName} (${hb}) → «${pn(a.pieceLineKey)}» (${hp})`);
    }
  }
  for (const s of d.scopes)
    for (const x of s.vanished ?? [])
      v.notes.push(`listed as no longer drawn: ${x.blockName} → «${x.pieceName}»`);
  v.fails = [...new Set(v.fails)];
  v.pass = v.fails.length === 0;
  return v;
}

/** C · the same write onto an empty card: today's draft vs the draft before 7e4203260. */
function checkFresh(card: CardContext, run: Run, labelOf: (k: string) => string): Verdict {
  const v: Verdict = { variant: 'C', pass: false, fails: [], moved: [], notes: [], stats: {} };
  if (run.error) {
    v.fails.push(`crashed: ${run.error.split('\n')[0]}`);
    return v;
  }
  if (!run.reached || !run.write) {
    v.stop = run.stop ?? 'no write';
    v.fails.push(`wizard did not reach the check step (${v.stop})`);
    return v;
  }
  const scopes = run.write.scopes as DraftScope[];
  const mint = () => {
    let n = 0;
    return () => `K${String(n++).padStart(4, '0')}`;
  };
  const now = buildDraft({ scopes }, card, { mintKey: mint() });
  const old = buildDraftOld({ scopes }, card as never, { mintKey: mint() }) as CardDraft;
  const shape = (d: CardDraft) => {
    const name = new Map(d.pieces.map((p) => [p.lineKey, p.name]));
    return {
      pieces: new Map(
        d.pieces.map((p) => [
          lc(p.name),
          `${p.name} ×${p.piecesPerGarment} ${String(p.cutSymmetry).replace('TECH_CARD_PIECE_CUT_SYMMETRY_', '').toLowerCase()}${p.symmetryForce ? ` (${p.symmetryForce})` : ''}`,
        ]),
      ),
      fused: new Map(d.pieces.map((p) => [lc(p.name), `${p.fused ? 'fused' : 'not fused'}`])),
      links: new Map(
        d.aliases.map((a) => [
          `${labelOf(a.scopeKey)}|${lc(a.blockName)}`,
          `${a.blockName} → ${name.get(a.pieceLineKey)}`,
        ]),
      ),
    };
  };
  const a = shape(old);
  const b = shape(now);
  const pairs = now.pieces.filter((p) => p.piecesPerGarment >= 2).length;
  v.stats.pieces = now.pieces.length;
  v.stats.pairs = pairs;
  v.stats.blocks = now.aliases.length;
  for (const k of new Set([...a.pieces.keys(), ...b.pieces.keys()])) {
    const x = a.pieces.get(k);
    const y = b.pieces.get(k);
    if (x === y) continue;
    v.fails.push(`piece differs: before ${x ?? '(none)'} · now ${y ?? '(none)'}`);
  }
  for (const k of new Set([...a.links.keys(), ...b.links.keys()])) {
    const x = a.links.get(k);
    const y = b.links.get(k);
    if (x === y) continue;
    v.fails.push(`link differs: before ${x ?? '(none)'} · now ${y ?? '(none)'}`);
    v.moved.push(`${x ?? '(none)'} ⇒ ${y ?? '(none)'}`);
  }
  for (const k of new Set([...a.fused.keys(), ...b.fused.keys()]))
    if (a.fused.get(k) !== b.fused.get(k) && a.pieces.has(k) && b.pieces.has(k))
      v.notes.push(`fusing differs (T2, not pairing): ${k} ${a.fused.get(k)} → ${b.fused.get(k)}`);
  if ((now.unresolved ?? []).length)
    v.fails.push(`unresolved on an empty card: ${now.unresolved!.length}`);
  v.pass = v.fails.length === 0;
  return v;
}

// ── one card ────────────────────────────────────────────────────────────────────────────────────

export async function runCard(snap: Snapshot, card: Card, only: Set<number> | null) {
  const T0 = Date.now();
  const side = await cardSide(snap, card);
  const labelOf = (k: string) => side.scopeLabel.get(k) ?? (k || 'no material');
  const sizeTokens = side.ctx.sizes.flatMap((s) => [s.token, ...(s.spellings ?? [])]);
  const sheets: Record<string, unknown>[] = [];
  for (const row of snap.rowsOf.get(card.id) ?? []) {
    if (!isDxfUrl(row.url) || (only && !only.has(row.id))) continue;
    const path = fileOf(card.id, row.id);
    const slot = side.scopeOfRow.get(row.id) ?? '';
    const sheet: Record<string, unknown> = {
      row: row.id,
      file: row.filename,
      rowName: row.name,
      generated: row.name.startsWith(GENERATED_FUSING_NAME_PREFIX),
      scope: labelOf(slot),
      verdicts: [] as Verdict[],
    };
    sheets.push(sheet);
    if (!existsSync(path)) {
      sheet.skip = 'file not downloaded';
      continue;
    }
    if (!slot) {
      sheet.skip = 'the sheet resolves to no material of the card';
      continue;
    }
    const bytes = bytesOf(path);
    const t = Date.now();
    const a = await runWizard(side.ctx, slot, row.filename || `c${card.id}.dxf`, bytes);
    (sheet.verdicts as Verdict[]).push(
      checkNoOp('A', side.ctx, a, slot, row.url, new Map(), labelOf),
    );
    (sheet.verdicts as Verdict[]).at(-1)!.stats.seconds = Math.round((Date.now() - t) / 1000);
    const { text, map } = cloRename(readFileSync(path).toString('latin1'), sizeTokens);
    if (map.size) {
      const t2 = Date.now();
      const b = await runWizard(
        side.ctx,
        slot,
        row.filename || `c${card.id}.dxf`,
        bytesOf2(Buffer.from(text, 'latin1')),
      );
      const vb = checkNoOp('B', side.ctx, b, slot, row.url, map, labelOf);
      vb.stats.renamed = [...map].map(([x, y]) => `${x}→${y}`).join(' ');
      vb.stats.seconds = Math.round((Date.now() - t2) / 1000);
      (sheet.verdicts as Verdict[]).push(vb);
    } else {
      // nothing to rename: B is the same file as A, and so is its verdict
      const va = (sheet.verdicts as Verdict[])[0];
      (sheet.verdicts as Verdict[]).push({
        ...va,
        variant: 'B',
        notes: [...va.notes, 'no hand-paired names in the sheet: nothing to rename (B = A)'],
        stats: { ...va.stats, renamed: 0 },
      });
    }
    const t3 = Date.now();
    const c = await runWizard(side.empty, slot, row.filename || `c${card.id}.dxf`, bytes);
    const vc = checkFresh(side.empty, c, labelOf);
    vc.stats.seconds = Math.round((Date.now() - t3) / 1000);
    (sheet.verdicts as Verdict[]).push(vc);
  }
  return {
    card: card.id,
    style: card.style,
    name: card.name,
    shapeRefs: side.shapeRefs,
    cardPieces: side.ctx.existingPieces.length,
    cardLinks: (side.ctx.existingAliases ?? []).length,
    cardOutlines: (side.ctx.existingShapes ?? []).length,
    seconds: Math.round((Date.now() - T0) / 1000),
    sheets,
  };
}

const bytesOf2 = (b: Buffer): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

export async function main(args: string[]): Promise<number> {
  const snap = loadSnapshot();
  if (args[0] === 'list') {
    console.log(
      JSON.stringify(snap.cards.filter((c) => snap.rowsOf.get(c.id)?.length).map((c) => c.id)),
    );
    return 0;
  }
  // `<card>` or `<card>:<row>,<row>`
  for (const arg of args) {
    const [cs, rs] = arg.split(':');
    const card = snap.cards.find((c) => c.id === Number(cs));
    if (!card) continue;
    const only = rs ? new Set(rs.split(',').map(Number)) : null;
    let r: Record<string, unknown>;
    try {
      r = await runCard(snap, card, only);
    } catch (e) {
      r = {
        card: card.id,
        style: card.style,
        name: card.name,
        crashed: toWireError(e).message.slice(0, 600),
      };
    }
    console.log(`@@RESULT ${JSON.stringify(r)}`);
  }
  return 0;
}
