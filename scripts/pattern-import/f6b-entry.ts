// F6b ASSERTIONS — manifest/ unit tests and the K1 fixtures re-read WITH a conversion manifest.
//
// Bundled by f6b.mjs against HEAD (must pass) and against HEAD with the manifest gate forced shut
// (every `needsGate` assertion must FAIL there — negative control B). The K1 fixtures are read from
// tmp/plans/pdf-to-dxf/k1-work/fixtures; their manifest-bearing twins are built here by embedding a
// manifest that says what the fixture's generator meant (sizes, pairs, unfolded folds, layers).
import { isDeepStrictEqual } from 'node:util';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ConversionManifest, ManifestBlock, ManifestPiece } from 'lib/pattern-import/types';
import {
  embedManifest,
  embedManifestAs,
  MANIFEST_MAX_JSON_BYTES,
  readManifest,
  readManifestBytes,
  trustedSheetOf,
  ManifestError,
} from 'lib/pattern-import/manifest';
import type { PieceDTO } from 'lib/nesting/types';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { parseSheets, type ParsedSheets } from 'lib/nesting/worker/parse-files';
import {
  normBlock,
  sizeTokensOf,
} from 'components/managers/tech-card/components/nesting/block-code';
import {
  splitPiecesBySize,
  type BlockSplit,
} from 'components/managers/tech-card/components/nesting/split-pieces';
import {
  foreignManifestSizes,
  missingSizesIn,
} from 'components/managers/tech-card/components/nesting/use-block-sizes';
import {
  contourIsCutLine,
  defaultContourLayer,
  layerAllowanceLabel,
  layerOptions,
  seamAllowancePrefill,
} from 'components/managers/tech-card/components/nesting/contour-layer';
import { buildAllowanceIndex } from 'components/managers/tech-card/components/nesting/contour-allowance';
import {
  defaultGrainLayer,
  grainLayerOptions,
} from 'components/managers/tech-card/components/nesting/grain';
import {
  markerUnits,
  selectMarkerPieces,
  unitsOfPieces,
} from 'components/managers/tech-card/components/nesting/piece-selection';
import { dxfNormAreas } from 'components/managers/tech-card/components/nesting/dxf-consumption';
import type { DxfIndex } from 'components/managers/tech-card/components/nesting/dxf-geometry';
import * as modal from 'components/managers/tech-card/components/nesting/piece-match-modal';
import { DICT_NAMES, DICT_TOKENS, SIZE_BY_ID, plainSizeId } from './f6b-fingerprint-entry';

type M = Record<string, any>;
const M_ = modal as unknown as M;
const IDENTICAL = 'TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL';
const MIRRORED = 'TECH_CARD_PIECE_CUT_SYMMETRY_MIRRORED';
const FOLD = 'TECH_CARD_PIECE_CUT_SYMMETRY_FOLD';

export type Result = { name: string; ok: boolean; detail: string; needsGate: boolean };

// ── manifest builder for the K1 fixtures ───────────────────────────────────────────────────────

type Spec = {
  sizes: string[];
  unfolded?: string[];
  purpose?: string;
  allowanceMm?: number;
  noSeam?: boolean;
};

export function blocksOf(text: string): string[] {
  const out: string[] = [];
  const re = /\nBLOCK\n8\n0\n2\n([^\n]+)\n/g;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push(m[1]);
  return out;
}

export function manifestFor(text: string, spec: Spec): ConversionManifest {
  const blocks = blocksOf(text);
  const sizeSet = new Set(spec.sizes.map((s) => s.toUpperCase()));
  type B = { block: string; identity: string; sizeToken: string; ungraded: boolean };
  const bs: B[] = blocks.map((block) => {
    const parts = block.split('_');
    const last = parts[parts.length - 1].toUpperCase();
    if (last === 'UNI')
      return { block, identity: parts.slice(0, -1).join('_'), sizeToken: 'UNI', ungraded: true };
    if (sizeSet.has(last))
      return { block, identity: parts.slice(0, -1).join('_'), sizeToken: last, ungraded: false };
    throw new Error(`fixture block ${block} has no size of ${spec.sizes}`);
  });
  const identities = [...new Set(bs.map((b) => b.identity))];
  const pieces: ManifestPiece[] = identities.map((identity) => {
    const parts = identity.split('_');
    const hand =
      parts.length > 1 && (parts[parts.length - 1] === 'L' || parts[parts.length - 1] === 'R')
        ? (parts[parts.length - 1] as 'L' | 'R')
        : null;
    const sib = hand ? [...parts.slice(0, -1), hand === 'L' ? 'R' : 'L'].join('_') : null;
    const paired = !!sib && identities.includes(sib);
    return {
      identity,
      code: parts[0],
      mods: parts.slice(1),
      displayName: identity,
      pairHand: paired ? hand : null,
      pairOf: paired ? sib : null,
      unfoldedFold: (spec.unfolded ?? []).includes(identity),
      piecesPerGarment: 1,
      fabrics: [spec.purpose ?? 'main'],
      fused: false,
      ungraded: bs.some((b) => b.identity === identity && b.ungraded),
      allowanceMm: spec.allowanceMm ?? 10,
      nameOrigin: 'text',
    };
  });
  const tokens = [...new Set(bs.filter((b) => !b.ungraded).map((b) => b.sizeToken))];
  const blocksOut: ManifestBlock[] = bs.map((b) => ({
    block: b.block,
    identity: b.identity,
    sizeToken: b.sizeToken,
    sizeId: b.ungraded ? 0 : plainSizeId(b.sizeToken),
    bboxMm: [0, 0, 1, 1],
    areaMm2: 1,
    hasGrain: true,
    notches: 2,
    drills: 0,
    internal: (spec.unfolded ?? []).includes(b.identity) ? 1 : 0,
    hasSeam: !spec.noSeam,
  }));
  return {
    v: 1,
    generator: 'f6b-probe',
    createdAt: '2026-10-09T00:00:00Z',
    techCardId: 1,
    scope: { fabricPurpose: spec.purpose ?? 'main', bomLineKey: '' },
    units: 'mm',
    layers: { cut: '1', seam: '14', grain: '7', notch: '4', internal: '8' },
    cutLayerIsFinal: true,
    allowanceMm: spec.allowanceMm ?? 10,
    sizes: tokens.map((t, i) => ({
      token: t,
      sizeId: plainSizeId(t),
      name: t.toLowerCase(),
      sourceLabel: t,
      rank: i,
    })),
    pieces,
    blocks: blocksOut,
    source: {
      files: [{ name: 'probe.pdf', sha256: '0', bytes: 1, kind: 'pdf', pages: 1 }],
      scale: { method: 'test-square', factor: 1, measuredMm: 100, declaredMm: 100 },
      sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
      sizeEncoding: 'single',
      variant: null,
    },
    gate: { passed: true, checks: [], durationMs: 0 },
  };
}

const SPECS: Record<string, Spec> = {
  'a-single-M.dxf': { sizes: ['M'], unfolded: ['BP'] },
  'b-sml-pck-m-only.dxf': { sizes: ['S', 'M', 'L', 'XL'], unfolded: ['BP'] },
  'b2-one-stem.dxf': { sizes: ['S', 'M', 'L'] },
  'c-pair-LR.dxf': { sizes: ['S', 'M', 'L'] },
  'd-unfolded-fold.dxf': { sizes: ['S', 'M', 'L'], unfolded: ['BP', 'CLR'] },
  'e-shell.dxf': { sizes: ['S', 'M', 'L'], unfolded: ['BP'], purpose: 'main' },
  'e-lining.dxf': { sizes: ['S', 'M', 'L'], unfolded: ['BP'], purpose: 'lining' },
  'e-interlining.dxf': { sizes: ['S', 'M', 'L'], purpose: 'interfacing' },
  'f1-one-block.dxf': { sizes: ['M'] },
  'f2-two-blocks.dxf': { sizes: ['M'] },
  'f3-cut-only.dxf': { sizes: ['S', 'M', 'L'], noSeam: true },
  'g-uni.dxf': { sizes: ['S', 'M', 'L'] },
};

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────

const enc = (s: string) => new TextEncoder().encode(s);
const opts = { unit: 'auto' as const, tol: NEST_DEFAULTS.tol, tolChain: NEST_DEFAULTS.tolChain };
async function parse(files: { name: string; text: string }[]): Promise<ParsedSheets> {
  return parseSheets(
    files.map((f) => ({
      name: f.name,
      open: async () => enc(f.text).slice().buffer as ArrayBuffer,
    })),
    opts,
  );
}

type View = {
  parsed: ParsedSheets;
  pieces: PieceDTO[];
  split: BlockSplit;
  contourLayer: string;
  contourPieces: PieceDTO[];
  counted: Map<string, any>;
};
function view(parsed: ParsedSheets): View {
  const pieces = parsed.pieces;
  const split = splitPiecesBySize(pieces, DICT_TOKENS);
  const contourLayer = defaultContourLayer(layerOptions(pieces, split.codeById));
  const contourPieces = pieces.filter((p) => (p.layer ?? '') === contourLayer);
  const counted = M_.countBlocks(contourPieces, split) as Map<string, any>;
  return { parsed, pieces, split, contourLayer, contourPieces, counted };
}

/** The create branch of apply() for a fresh card, every row on «create» with its default name. */
function createAll(counted: Map<string, any>) {
  const rows = M_.proposeRows(counted, {
    storedFirst: new Map(),
    pieceOptions: [],
    otherFabricByBlock: new Map(),
    elsewhereOnly: new Map(),
  }) as any[];
  const byName = new Map<
    string,
    { name: string; blocks: { identity: string; instances: number }[] }
  >();
  for (const r of rows) {
    const name = M_.defaultPieceName(r) as string;
    const e = byName.get(name.toLowerCase()) ?? { name, blocks: [] };
    e.blocks.push({ identity: r.uniBase.trim() || r.block, instances: r.instances });
    byName.set(name.toLowerCase(), e);
  }
  return [...byName.values()]
    .map((e) => ({
      name: e.name,
      ppg: M_.perGarmentFromBlocks(e.blocks) as number,
      blocks: e.blocks.map((b) => b.identity).sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normOf(
  v: View,
  cardPieces: { name: string; perGarment: number; refs: string[] }[],
  sizeIds: number[],
  allowanceCm: number,
) {
  const byKey = new Map<string, Map<string, PieceDTO[]>>();
  for (const p of v.pieces) {
    const code = v.split.codeById.get(p.id);
    const identity = normBlock(code?.identity ?? p.blockName ?? '');
    if (!identity) continue;
    const key = `S|${identity.toLowerCase()}`;
    const bySize = byKey.get(key) ?? new Map<string, PieceDTO[]>();
    bySize.set(code?.size ?? '', [...(bySize.get(code?.size ?? '') ?? []), p]);
    byKey.set(key, bySize);
  }
  const index: DxfIndex = {
    split: v.split,
    contourLayer: v.contourLayer,
    grainLayer: '',
    byKey,
    filesOfScope: new Map([['S', [0]]]),
  };
  return dxfNormAreas({
    index,
    pieces: cardPieces.map((c) => ({
      name: c.name,
      lineKey: c.name,
      perGarment: c.perGarment,
      refs: c.refs.map((b) => ({ scopeKey: 'S', block: b })),
    })),
    unaliasedPieces: [],
    sizeIds,
    tokensOfSize: (id) => sizeTokensOf(SIZE_BY_ID.get(id)),
    contourLayer: v.contourLayer,
    allowanceCm,
  });
}

// ── the suite ──────────────────────────────────────────────────────────────────────────────────

export async function runTests(ctx: { k1: string; plans: string }): Promise<Result[]> {
  const out: Result[] = [];
  const check = (name: string, needsGate: boolean, ok: boolean, detail: unknown = '') =>
    out.push({
      name,
      ok,
      needsGate,
      detail: ok ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail),
    });
  const throwsCode = (fn: () => unknown, code: string): boolean => {
    try {
      fn();
      return false;
    } catch (e) {
      return e instanceof ManifestError && e.code === code;
    }
  };
  const fixture = (name: string) => readFileSync(join(ctx.k1, name), 'utf8');
  const withManifest = (name: string, spec = SPECS[name]) => {
    const text = fixture(name);
    const m = manifestFor(text, spec);
    return { name, text: embedManifest(text, m), legacy: text, m };
  };

  // ═══ manifest/ — embed and read ═══════════════════════════════════════════════════════════
  {
    const { text, legacy, m } = withManifest('b-sml-pck-m-only.dxf');
    check(
      'manifest: embed → read round-trips deep-equal',
      false,
      isDeepStrictEqual(readManifest(text), m),
    );
    check(
      'manifest: a foreign DXF reads null (text and bytes)',
      false,
      readManifest(legacy) === null &&
        readManifestBytes(enc(legacy).slice().buffer as ArrayBuffer) === null,
    );
    check(
      'manifest: bytes reader agrees with text reader',
      false,
      isDeepStrictEqual(readManifestBytes(enc(text).slice().buffer as ArrayBuffer), m),
    );
    // Both line forms: v1z (deflate-raw, what the writer emits since MF-B) and v1 (plain, files
    // written before it — the reader must keep accepting them).
    let tagged: string[] = [];
    let corrupt = '';
    for (const form of ['v1z', 'v1'] as const) {
      const t = embedManifestAs(legacy, m, form);
      const lines = t.split('\n');
      const tg = lines.filter((l) => l.startsWith('GRBPWR-MANIFEST '));
      if (form === 'v1z') tagged = tg;
      const firstSection = lines.indexOf('SECTION');
      const allLead = tg.every((l) => lines.indexOf(l) < firstSection);
      const LINE_RE =
        form === 'v1z'
          ? /^GRBPWR-MANIFEST v1z (\d+)\/(\d+) (\S*)$/
          : /^GRBPWR-MANIFEST v1 (\d+)\/(\d+) (\S*)$/;
      check(
        `manifest ${form}: chunked ≤ 200 base64 chars per 999 line, all before the first SECTION, 1-based i/n`,
        false,
        tg.length >= 1 &&
          allLead &&
          tg.every((l, i) => {
            const mm = LINE_RE.exec(l);
            return (
              !!mm && Number(mm[1]) === i + 1 && Number(mm[2]) === tg.length && mm[3].length <= 200
            );
          }) &&
          lines.every((l, i) => !l.startsWith('GRBPWR-MANIFEST ') || lines[i - 1] === '999'),
        { n: tg.length },
      );
      check(
        `manifest ${form}: embed → read round-trips deep-equal (text and bytes)`,
        false,
        isDeepStrictEqual(readManifest(t), m) &&
          isDeepStrictEqual(readManifestBytes(enc(t).slice().buffer as ArrayBuffer), m),
      );
      const bad = t.replace(
        new RegExp(`(GRBPWR-MANIFEST ${form} 1\\/\\d+ )(.)`),
        (_x, a, c) => a + (c === '*' ? 'A' : '*'),
      );
      if (form === 'v1z') corrupt = bad;
      check(
        `manifest ${form}: a corrupt chunk throws (corrupt), never null`,
        false,
        bad !== t && throwsCode(() => readManifest(bad), 'corrupt'),
      );
      if (tg.length > 1) {
        const partial = t.replace(
          new RegExp(`999\\nGRBPWR-MANIFEST ${form} 2\\/\\d+ [^\\n]*\\n`),
          '',
        );
        check(
          `manifest ${form}: a missing chunk throws (partial)`,
          false,
          throwsCode(() => readManifest(partial), 'partial'),
        );
      }
      const v2line = t.replace(
        new RegExp(`GRBPWR-MANIFEST ${form} `, 'g'),
        `GRBPWR-MANIFEST ${form.replace('1', '2')} `,
      );
      check(
        `manifest ${form}: an unknown line version throws (version)`,
        false,
        throwsCode(() => readManifest(v2line), 'version'),
      );
    }
    {
      const z = embedManifestAs(legacy, m, 'v1z');
      const plain = embedManifestAs(legacy, m, 'v1');
      check(
        'manifest v1z: at least 3× smaller than the plain form',
        false,
        (plain.length - legacy.length) / (z.length - legacy.length) >= 3,
        { plain: plain.length - legacy.length, z: z.length - legacy.length },
      );
      // one v1 line spliced into a v1z prologue
      const zl = z.split('\n');
      const pl = plain.split('\n');
      const mixed = [zl[0], pl[1], ...zl.slice(2)].join('\n');
      check(
        'manifest: v1 and v1z lines mixed in one file throw (corrupt)',
        false,
        throwsCode(() => readManifest(mixed), 'corrupt'),
      );
      // a deflate bomb: 64 MB of zeros compress to ~64 KB; the reader stops at its cap
      const { deflateSync } = await import('fflate');
      const bomb = deflateSync(new Uint8Array(16 * MANIFEST_MAX_JSON_BYTES), { level: 9 });
      let bin = '';
      for (let i = 0; i < bomb.length; i += 0x8000)
        bin += String.fromCharCode(...bomb.subarray(i, i + 0x8000));
      const b = btoa(bin);
      const chunks = b.match(/.{1,200}/g) ?? [];
      const bombText =
        chunks.map((c, i) => `999\nGRBPWR-MANIFEST v1z ${i + 1}/${chunks.length} ${c}\n`).join('') +
        legacy;
      const t0 = Date.now();
      check(
        'manifest v1z: a deflate bomb is refused (corrupt) without inflating it all',
        false,
        throwsCode(() => readManifest(bombText), 'corrupt') && Date.now() - t0 < 5000,
        { ms: Date.now() - t0 },
      );
    }
    const b64 = (o: unknown) =>
      btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))));
    const raw = (o: unknown) => `999\nGRBPWR-MANIFEST v1 1/1 ${b64(o)}\n${legacy}`;
    check(
      'manifest: an unknown JSON version throws (version)',
      false,
      throwsCode(() => readManifest(raw({ ...m, v: 2 })), 'version'),
    );
    const { pieces: _p, ...noPieces } = m;
    void _p;
    check(
      'manifest: a missing field throws (shape)',
      false,
      throwsCode(() => readManifest(raw(noPieces)), 'shape'),
    );
    const brokenPair = {
      ...m,
      pieces: m.pieces.map((p) => (p.identity === 'FP_R' ? { ...p, pairOf: 'SL_L' } : p)),
    };
    check(
      'manifest: a non-reciprocal pair throws (shape)',
      false,
      throwsCode(() => readManifest(raw(brokenPair)), 'shape'),
    );
    const strayBlock = {
      ...m,
      blocks: [...m.blocks, { ...m.blocks[0], block: 'ZZ_M', identity: 'ZZ' }],
    };
    check(
      'manifest: a block of an unknown identity throws (shape)',
      false,
      throwsCode(() => readManifest(raw(strayBlock)), 'shape'),
    );
    check(
      'manifest: embedding an invalid manifest throws (writer bug fails loudly)',
      false,
      throwsCode(() => embedManifest(legacy, noPieces as ConversionManifest), 'shape'),
    );

    const foreign = `999\nmade by CAD X\n${text}`;
    const reEmbedded = embedManifest(embedManifest(foreign, m), { ...m, generator: 'second' });
    const reTagged = reEmbedded.split('\n').filter((l) => l.startsWith('GRBPWR-MANIFEST '));
    check(
      'manifest: re-embedding replaces our lines and keeps a foreign leading comment',
      false,
      readManifest(reEmbedded)?.generator === 'second' &&
        reEmbedded.includes('999\nmade by CAD X\n') &&
        reTagged.length === tagged.length,
    );
    const crlf = legacy.replace(/\n/g, '\r\n');
    const crlfEmb = embedManifest(crlf, m);
    check(
      'manifest: CRLF files stay CRLF and read back',
      false,
      !/[^\r]\n/.test(crlfEmb) && isDeepStrictEqual(readManifest(crlfEmb), m),
    );
    const bom = '﻿' + legacy;
    check(
      'manifest: a BOM stays first and the manifest reads back',
      false,
      embedManifest(bom, m).startsWith('﻿999') &&
        isDeepStrictEqual(readManifest(embedManifest(bom, m)), m),
    );

    const ts = trustedSheetOf(m, 3);
    check(
      'manifest: trustedSheetOf (sizes by block ci, pairs, unfolded, cm)',
      false,
      ts.fileIndex === 3 &&
        ts.sizeByBlock.get('pck_m') === 'M' &&
        ts.sizeByBlock.get('bp_xl') === 'XL' &&
        ts.pairOf.get('fp_l') === 'fp_r' &&
        ts.pairOf.get('sl_r') === 'sl_l' &&
        ts.unfolded.has('bp') &&
        ts.cutAllowanceCm === 1,
    );

    // the parser still reads the file, and the worker refuses a manifest it cannot fully trust
    const pLegacy = await parse([{ name: 'b.dxf', text: legacy }]);
    const pEmb = await parse([{ name: 'b.dxf', text }]);
    check(
      'parse: an embedded manifest is invisible to dxf-parser (same contours, same blocks)',
      false,
      pEmb.failedFiles === 0 &&
        pEmb.pieces.length === pLegacy.pieces.length &&
        isDeepStrictEqual(pEmb.blockNames, pLegacy.blockNames) &&
        pEmb.manifests.length === 1 &&
        pEmb.manifests[0] !== null &&
        pLegacy.manifests[0] === null,
    );
    const pCorrupt = await parse([
      { name: 'b.dxf', text: corrupt },
      { name: 'c.dxf', text: fixture('c-pair-LR.dxf') },
    ]);
    check(
      'parse: a corrupt manifest fails THAT sheet (refusal), the others still parse',
      false,
      pCorrupt.failedFiles === 1 &&
        pCorrupt.pieces.every((p) => p.fileIndex === 1) &&
        pCorrupt.warnings.some((w) => w.startsWith('b.dxf:') && w.includes('manifest')),
    );
    const foreignManifest = embedManifest(fixture('c-pair-LR.dxf'), m);
    const pMismatch = await parse([{ name: 'c.dxf', text: foreignManifest }]);
    check(
      'parse: a manifest that does not describe the drawing fails the sheet',
      false,
      pMismatch.failedFiles === 1 &&
        pMismatch.pieces.length === 0 &&
        pMismatch.warnings.some((w) => w.includes('does not describe this drawing')),
    );
  }

  // ═══ card paths on the K1 fixtures, with the manifest ═══════════════════════════════════════
  const parsedM = async (name: string) => view(await parse([withManifest(name)]));
  const parsedL = async (name: string) => view(await parse([{ name, text: fixture(name) }]));
  const identities = (v: View) => [...v.split.identities].sort();
  const sizesOf = (v: View, ci: string) => v.counted.get(ci)?.sizes ?? null;

  // a — single size M (C2): sizes and names come from the manifest
  {
    const v = await parsedM('a-single-M.dxf');
    check(
      'a: identities lose the size tail (one-size file)',
      true,
      isDeepStrictEqual(identities(v), ['bp', 'clr', 'fp_l', 'fp_r', 'sl_l', 'sl_r']),
      identities(v),
    );
    check(
      'a: every contour carries size M',
      true,
      v.contourPieces.every((p) => v.split.codeById.get(p.id)?.size === 'M'),
    );
    const missing = missingSizesIn(v.pieces, DICT_TOKENS, [plainSizeId('s')], SIZE_BY_ID);
    check(
      'a: the card is offered size M from the manifest (structure alone finds none)',
      true,
      isDeepStrictEqual(
        missing.map((x) => x.sizeId),
        [plainSizeId('m')],
      ),
      missing,
    );
    // F14 MAJOR 4: the same manifest uploaded to card B whose range is in another size system
    // (ta_m): its plain M is not trusted, nothing is added, the refusal is reported
    const cardB = [DICT_NAMES.indexOf('s_46ta_m') + 1];
    const missingB = missingSizesIn(v.pieces, DICT_TOKENS, cardB, SIZE_BY_ID);
    const foreignB = foreignManifestSizes(v.pieces, cardB, SIZE_BY_ID);
    check(
      'a (F14): manifest from card A on card B (ta_m) → M not added, reported as foreign',
      true,
      missingB.length === 0 && isDeepStrictEqual(foreignB, ['m']),
      { missingB, foreignB },
    );
    const created = createAll(v.counted);
    check(
      'a: create-all makes FP×2, SL×2 (pairs → one piece), BP×1, CLR×1',
      true,
      isDeepStrictEqual(
        created.map((c) => `${c.name}×${c.ppg}`),
        ['BP×1', 'CLR×1', 'FP×2', 'SL×2'],
      ),
      created,
    );
    const fpL = v.contourPieces.find((p) => p.blockName === 'FP_L_M')!;
    const allowanceCm =
      seamAllowancePrefill({
        measured:
          layerOptions(v.pieces, v.split.codeById, buildAllowanceIndex(v.pieces)).find(
            (o) => o.layer === v.contourLayer,
          )?.allowance ?? null,
        fallbackMm: 10,
      }).value / 10;
    const norm = normOf(
      v,
      [{ name: 'FP', perGarment: 2, refs: ['FP_L', 'FP_R'] }],
      [plainSizeId('m')],
      allowanceCm,
    );
    check(
      'a: the norm by patterns works on a one-size card (FP = 2 × area(FP_L), no added allowance)',
      true,
      norm.ok && Math.abs(norm.areas.rows[0].areaCm2 - 2 * fpL.areaCm2) < 1e-6,
      norm,
    );
  }
  // b — rare size, piece only in M (C2)
  {
    const v = await parsedM('b-sml-pck-m-only.dxf');
    const sorted = (x: string[] | null) => [...(x ?? [])].sort();
    check(
      'b: XL survives on BP and CLR (no frequency cut)',
      true,
      isDeepStrictEqual(sorted(sizesOf(v, 'bp')), ['L', 'M', 'S', 'XL']) &&
        isDeepStrictEqual(sorted(sizesOf(v, 'clr')), ['L', 'M', 'S', 'XL']),
      { bp: sizesOf(v, 'bp'), clr: sizesOf(v, 'clr') },
    );
    // F14 MAJOR 4: card B in the ta_m system — the manifest's plain S/M/L/XL are foreign; the sizes
    // come from the block names (legacy token path), resolved in the card's own system
    {
      const id = (n: string) => DICT_NAMES.indexOf(n) + 1;
      const cardB = [id('s_46ta_m')];
      const missingB = missingSizesIn(v.pieces, DICT_TOKENS, cardB, SIZE_BY_ID);
      const foreignB = foreignManifestSizes(v.pieces, cardB, SIZE_BY_ID);
      check(
        'b (F14): manifest from card A on card B (ta_m) → no foreign id, sizes derived in ta_m',
        true,
        // what the legacy token path derives from the names (XL is on too few stems for it)
        isDeepStrictEqual(
          missingB.map((x) => x.sizeId).sort((a, b) => a - b),
          [id('m_48ta_m'), id('l_50ta_m')],
        ) && isDeepStrictEqual([...foreignB].sort(), ['l', 'm', 's', 'xl']),
        { missingB, foreignB },
      );
      const missingA = missingSizesIn(v.pieces, DICT_TOKENS, [plainSizeId('s')], SIZE_BY_ID);
      check(
        'b (F14 control): on its own card (plain system) the manifest sizes are trusted',
        true,
        isDeepStrictEqual(
          missingA.map((x) => x.sizeId).sort((a, b) => a - b),
          ['m', 'l', 'xl'].map(plainSizeId),
        ) && foreignManifestSizes(v.pieces, [plainSizeId('s')], SIZE_BY_ID).length === 0,
        missingA,
      );
    }
    check(
      'b: PCK is a piece of size M, not a sizeless piece',
      true,
      isDeepStrictEqual(
        identities(v).filter((x) => x.startsWith('pck')),
        ['pck'],
      ) && isDeepStrictEqual(sizesOf(v, 'pck'), ['M']),
    );
    const units = markerUnits({
      graded: true,
      rows: ['S', 'M', 'L'].map((t) => ({ tokens: [t], qty: 1 })),
      ungradedUnits: 1,
    });
    const unitsOf = unitsOfPieces(
      v.contourPieces,
      (id) => v.split.codeById.get(id)?.size ?? '',
      units,
    );
    const sel = selectMarkerPieces(v.contourPieces, v.contourLayer, unitsOf);
    const pck = sel.filter((p) => p.blockName === 'PCK_M').map((p) => unitsOf.get(p.id));
    const lv = await parsedL('b-sml-pck-m-only.dxf');
    const lUnits = unitsOfPieces(
      lv.contourPieces,
      (id) => lv.split.codeById.get(id)?.size ?? '',
      units,
    );
    const lPck = lv.contourPieces
      .filter((p) => p.blockName === 'PCK_M')
      .map((p) => lUnits.get(p.id));
    check(
      'b: an S+M+L marker cuts PCK once (the M garment), not three times',
      true,
      isDeepStrictEqual(pck, [1]) && isDeepStrictEqual(lPck, [3]),
      { manifest: pck, legacy: lPck },
    );
  }
  // b2 — one stem only
  {
    const v = await parsedM('b2-one-stem.dxf');
    check(
      'b2: one stem in three sizes is ONE piece SCF',
      true,
      isDeepStrictEqual(identities(v), ['scf']) &&
        isDeepStrictEqual(sizesOf(v, 'scf'), ['S', 'M', 'L']),
      identities(v),
    );
  }
  // c — the pair
  {
    const v = await parsedM('c-pair-LR.dxf');
    const fpL = v.counted.get('fp_l');
    check(
      'c: FP_L/FP_R rows propose the manifest name FP (pair → one piece)',
      true,
      fpL?.manifestName === 'FP' &&
        v.counted.get('fp_r')?.manifestName === 'FP' &&
        fpL?.force === 'pair',
    );
    const live = [
      { lineKey: 'FPKEY', name: 'FP', piecesPerGarment: 2, cutSymmetry: MIRRORED },
      { lineKey: 'BPKEY', name: 'BP', piecesPerGarment: 1, cutSymmetry: '' },
    ];
    const bound = new Map([
      ['fp_l', 'FPKEY'],
      ['fp_r', 'FPKEY'],
      ['bp', 'BPKEY'],
    ]);
    const upd = M_.planPieceUpdates(live, bound, v.counted, true);
    const fp = upd.updates.find((u: any) => u.index === 0);
    check(
      'c: an existing MIRRORED FP is rewritten IDENTICAL with the reason, ppg stays 2',
      true,
      fp?.cutSymmetry === IDENTICAL &&
        fp?.piecesPerGarment === undefined &&
        /both hands/.test(fp?.reason ?? ''),
      upd,
    );
    const again = M_.planPieceUpdates(
      live.map((p, i) =>
        i === 0 ? { ...p, cutSymmetry: IDENTICAL } : { ...p, cutSymmetry: IDENTICAL },
      ),
      bound,
      v.counted,
      true,
    );
    check(
      'c: re-applying changes nothing (stable)',
      false,
      again.updates.length === 0 && again.unchanged === 2,
      again,
    );
    const incomplete = M_.planPieceUpdates(live, bound, v.counted, false);
    check(
      'c: an incomplete parse touches no existing piece even with a manifest',
      false,
      incomplete.updates.length === 0,
      incomplete,
    );
    const rows = M_.proposeRows(v.counted, {
      storedFirst: new Map(),
      pieceOptions: [{ lineKey: 'FPKEY', name: 'FP' }],
      otherFabricByBlock: new Map(),
      elsewhereOnly: new Map(),
    }) as any[];
    check(
      'c: a card piece FP (bound nowhere else) is preselected for both hands by the manifest name',
      true,
      rows
        .filter((r) => r.block.startsWith('FP_'))
        .every((r) => r.choice === 'FPKEY' && r.basis === 'exact'),
      rows,
    );
    // D1 evidence from the client: the marker lays both hands AS DRAWN, one each per garment.
    const units = markerUnits({
      graded: true,
      rows: ['M'].map((t) => ({ tokens: [t], qty: 1 })),
      ungradedUnits: 1,
    });
    const unitsOf = unitsOfPieces(
      v.contourPieces,
      (id) => v.split.codeById.get(id)?.size ?? '',
      units,
    );
    const sel = selectMarkerPieces(v.contourPieces, v.contourLayer, unitsOf).filter((p) =>
      /^FP_/.test(p.blockName ?? ''),
    );
    check(
      'c (D1): a one-garment marker carries FP_L ×1 and FP_R ×1 as drawn — both hands from the drawing',
      false,
      isDeepStrictEqual(sel.map((p) => `${p.blockName}×${unitsOf.get(p.id)}`).sort(), [
        'FP_L_M×1',
        'FP_R_M×1',
      ]),
      sel.map((p) => p.blockName),
    );
  }
  // d — unfolded fold, grain
  {
    const v = await parsedM('d-unfolded-fold.dxf');
    const lv = await parsedL('d-unfolded-fold.dxf');
    const g = defaultGrainLayer(grainLayerOptions(v.pieces));
    const lg = defaultGrainLayer(grainLayerOptions(lv.pieces));
    check(
      'd: grain is the manifest layer 7, not the longer fold line on 8 (legacy picks 8)',
      true,
      g === '7' && lg === '8',
      { manifest: g, legacy: lg },
    );
    const live = [
      { lineKey: 'BPKEY', name: 'BP', piecesPerGarment: 1, cutSymmetry: FOLD },
      { lineKey: 'CLRKEY', name: 'CLR', piecesPerGarment: 2, cutSymmetry: FOLD },
    ];
    const upd = M_.planPieceUpdates(
      live,
      new Map([
        ['bp', 'BPKEY'],
        ['clr', 'CLRKEY'],
      ]),
      v.counted,
      true,
    );
    const bp = upd.updates.find((u: any) => u.index === 0);
    const clr = upd.updates.find((u: any) => u.index === 1);
    check(
      'd: existing FOLD → IDENTICAL with the unfolded reason; CLR ×2 recounted ×1',
      true,
      bp?.cutSymmetry === IDENTICAL &&
        /unfolded/.test(bp?.reason ?? '') &&
        clr?.cutSymmetry === IDENTICAL &&
        clr?.piecesPerGarment === 1,
      upd,
    );
    const lupd = M_.planPieceUpdates(
      live,
      new Map([
        ['bp', 'BPKEY'],
        ['clr', 'CLRKEY'],
      ]),
      lv.counted,
      true,
    );
    check(
      'd: without a manifest an explicit FOLD is kept (legacy rule untouched)',
      false,
      !lupd.updates.some((u: any) => u.cutSymmetry),
      lupd,
    );
  }
  // e — scopes: the lining's FP_L must not auto-bind to the shell's FP_L
  {
    const v = await parsedM('e-lining.dxf');
    const lv = await parsedL('e-lining.dxf');
    const args = {
      storedFirst: new Map(),
      pieceOptions: [
        { lineKey: 'SHELLFPL', name: 'FP_L' },
        { lineKey: 'LINBP', name: 'BP' },
      ],
      otherFabricByBlock: new Map(),
      // SHELLFPL is bound in «main» and nowhere in the lining; LINBP is not bound anywhere else.
      elsewhereOnly: new Map([['shellfpl', 'main']]),
    };
    const rows = M_.proposeRows(v.counted, args) as any[];
    const fpl = rows.find((r) => r.block === 'FP_L');
    const bp = rows.find((r) => r.block === 'BP');
    check(
      'e: lining FP_L is NOT preselected to the shell piece FP_L (suggested, flagged)',
      true,
      fpl?.choice === '' &&
        fpl?.suggested === 'SHELLFPL' &&
        fpl?.basis === 'same-name-elsewhere' &&
        fpl?.fromSlot === 'main',
      fpl,
    );
    check(
      'e: a same-name piece bound nowhere else is still preselected',
      false,
      bp?.choice === 'LINBP',
      bp,
    );
    const lrows = M_.proposeRows(lv.counted, args) as any[];
    check(
      'e: without a manifest the legacy exact-name preselect is unchanged',
      false,
      lrows.find((r: any) => r.block === 'FP_L')?.choice === 'SHELLFPL',
      lrows,
    );
    // mixed pack: manifest shell + legacy lining in ONE parse — the legacy file reads as if alone
    const mixed = view(
      await parse([
        withManifest('e-shell.dxf'),
        { name: 'e-lining.dxf', text: fixture('e-lining.dxf') },
      ]),
    );
    const alone = await parsedL('e-lining.dxf');
    const codes = (vv: View, fi: number) =>
      vv.pieces.filter((p) => (p.fileIndex ?? 0) === fi).map((p) => vv.split.codeById.get(p.id));
    check(
      'e: in a mixed pack the legacy file keeps its own size verdict',
      false,
      isDeepStrictEqual(codes(mixed, 1), codes(alone, 0)),
      { mixed: codes(mixed, 1).slice(0, 3), alone: codes(alone, 0).slice(0, 3) },
    );
    const mixedLayer1 = layerOptions(mixed.pieces, mixed.split.codeById).find(
      (o) => o.layer === '1',
    );
    check(
      'e: a layer shared with a legacy file is not declared cut by the other file’s manifest',
      false,
      !mixedLayer1?.trustedCut && mixedLayer1?.allowance === null,
      mixedLayer1,
    );
  }
  // f — double allowance (C4)
  for (const f of ['f1-one-block.dxf', 'f2-two-blocks.dxf', 'f3-cut-only.dxf']) {
    const v = await parsedM(f);
    const lv = await parsedL(f);
    const idx = buildAllowanceIndex(v.pieces);
    const lo = layerOptions(v.pieces, v.split.codeById, idx);
    const chosen = defaultContourLayer(lo);
    const opt = lo.find((o) => o.layer === chosen);
    const pre = seamAllowancePrefill({
      measured: opt?.allowance ?? null,
      cardRequiredMm: 10,
      fallbackMm: 10,
    });
    const llo = layerOptions(lv.pieces, lv.split.codeById, buildAllowanceIndex(lv.pieces));
    const lpre = seamAllowancePrefill({
      measured: llo.find((o) => o.layer === defaultContourLayer(llo))?.allowance ?? null,
      cardRequiredMm: 10,
      fallbackMm: 10,
    });
    check(
      `${f}: layer 1 is the declared cut line, prefill 0 even with a card allowance (legacy prefills 10)`,
      true,
      chosen === '1' &&
        opt?.trustedCut === true &&
        opt.allowance?.source === 'manifest' &&
        opt.allowance.allowanceCm === 1 &&
        pre.value === 0 &&
        pre.source === 'contour_is_cut' &&
        lpre.value === 10,
      { chosen, allowance: opt?.allowance?.verdict, pre, lpre },
    );
    check(
      `${f}: the double-allowance guard fires on the declared cut line`,
      true,
      contourIsCutLine(opt?.allowance),
      opt?.allowance,
    );
    check(
      `${f}: the measurement cross-check agrees (or has no evidence)`,
      true,
      opt?.allowance?.crossCheck?.agrees === true,
      opt?.allowance?.crossCheck,
    );
  }
  {
    // a manifest that LIES about the allowance (5 mm declared, 10 mm drawn) is still obeyed but flagged
    const name = 'c-pair-LR.dxf';
    const text = fixture(name);
    const lying = embedManifest(text, manifestFor(text, { ...SPECS[name], allowanceMm: 5 }));
    const v = view(await parse([{ name, text: lying }]));
    const lo = layerOptions(v.pieces, v.split.codeById, buildAllowanceIndex(v.pieces));
    const opt = lo.find((o) => o.layer === '1');
    check(
      'crosscheck: a declared allowance the file contradicts is printed next to the declaration',
      true,
      opt?.allowance?.crossCheck?.agrees === false &&
        /measures \+10\.0 mm/.test(layerAllowanceLabel(opt!)),
      {
        cc: opt?.allowance?.crossCheck,
        label: opt && layerAllowanceLabel(opt),
      },
    );
  }
  // g — UNI
  {
    const v = await parsedM('g-uni.dxf');
    const uni = v.counted.get('pck_uni');
    check(
      'g: PCK_UNI keeps its raw identity (alias key) and proposes the manifest name PCK',
      true,
      !!uni &&
        uni.uniBase === 'PCK' &&
        uni.manifestName === 'PCK' &&
        isDeepStrictEqual(uni.sizes, []),
      uni,
    );
  }
  // ═══ interop: the files F6's writer actually produced (skipped when the samples are absent) ═══
  const samples = join(ctx.plans, 'reports', 'f6-samples');
  if (existsSync(samples)) {
    for (const f of readdirSync(samples)
      .filter((n) => n.endsWith('.dxf'))
      .sort()) {
      const text = readFileSync(join(samples, f), 'latin1');
      let m: ConversionManifest | null = null;
      let err = '';
      try {
        m = readManifest(text);
      } catch (e) {
        err = String(e);
      }
      if (!m) {
        // A sample written without a manifest (K2's golden rebuild) must at least not throw.
        check(
          `F6 sample ${f}: no manifest → read as a foreign DXF (null, no throw)`,
          false,
          !err,
          err,
        );
        continue;
      }
      const v = view(await parse([{ name: f, text }]));
      const declared = new Set(
        m.blocks.map((b) => (/(^|_)UNI(_|$)/i.test(b.block) ? b.block : b.identity).toLowerCase()),
      );
      check(
        `F6 sample ${f}: parses whole, every contour carries the manifest`,
        false,
        v.parsed.failedFiles === 0 && v.pieces.length > 0 && v.pieces.every((p) => !!p.manifest),
        v.parsed.warnings,
      );
      check(
        `F6 sample ${f}: identities are the manifest's, sizes are the manifest's`,
        // Not gate-dependent on these well-formed multi-size samples: the name heuristic agrees.
        false,
        isDeepStrictEqual([...v.split.identities].sort(), [...declared].sort()) &&
          v.pieces.every((p) => (v.split.codeById.get(p.id)?.size ?? '') === p.manifest!.size),
        { got: [...v.split.identities].sort(), want: [...declared].sort() },
      );
      const lo = layerOptions(v.pieces, v.split.codeById, buildAllowanceIndex(v.pieces));
      const chosen = lo.find((o) => o.layer === defaultContourLayer(lo));
      check(
        `F6 sample ${f}: layer 1 declared cut, prefill 0, cross-check agrees`,
        true,
        chosen?.layer === '1' &&
          chosen.trustedCut === true &&
          seamAllowancePrefill({ measured: chosen.allowance, cardRequiredMm: 10, fallbackMm: 10 })
            .value === 0 &&
          chosen.allowance?.crossCheck?.agrees === true,
        { chosen: chosen?.layer, cc: chosen?.allowance?.crossCheck },
      );
      // Grain: the card parser reads no grain from the R2000 dialect's CLO arrow (K2 pitfall 1, F6.md:
      // F15 fixes the parser). Where it reads one, it must be layer 7; where it reads none, there is
      // nothing to promote and the answer stays '' — reported, not failed.
      const grainOpts = grainLayerOptions(v.pieces);
      if (grainOpts.length > 0) {
        check(
          `F6 sample ${f}: grain is the declared layer 7`,
          false,
          defaultGrainLayer(grainOpts) === '7',
          grainOpts,
        );
      } else {
        out.push({
          name: `F6 sample ${f}: NOTE the card parser reads no grain from this dialect`,
          ok: true,
          needsGate: false,
          detail: '',
        });
      }
      const created = createAll(v.counted);
      const pairs = m.pieces.filter((p) => p.pairHand === 'L');
      if (pairs.length > 0)
        check(
          `F6 sample ${f}: create-all binds each pair as ONE piece ×2`,
          true,
          pairs.every((p) =>
            created.some(
              (c) => c.blocks.length === 2 && c.ppg === 2 && c.blocks.includes(p.identity),
            ),
          ),
          created,
        );
    }
  }
  return out;
}
