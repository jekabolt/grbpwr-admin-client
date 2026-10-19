// F6b ASSERTIONS — manifest/ unit tests and the K1 fixtures re-read WITH a conversion manifest.
//
// Bundled by f6b.mjs against HEAD (must pass) and against HEAD with the manifest gate forced shut
// (every `needsGate` assertion must FAIL there — negative control B). The K1 fixtures are read from
// tmp/plans/pdf-to-dxf/k1-work/fixtures; their manifest-bearing twins are built here by embedding a
// manifest that says what the fixture's generator meant (sizes, pairs, unfolded folds, layers).
import { isDeepStrictEqual } from 'node:util';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ConversionManifest,
  ManifestBlock,
  ManifestPiece,
  PieceSpec,
  PtMm,
} from 'lib/pattern-import/types';
import {
  contourSigMatch,
  contourSigProblem,
  contourSignature,
  embedManifest,
  embedManifestAs,
  MANIFEST_MAX_JSON_BYTES,
  readManifest,
  readManifestBytes,
  MANIFEST_MAX_PROLOGUE_BYTES,
  trustedSheetOf,
  ManifestError,
} from 'lib/pattern-import/manifest';
import { readRawDxf } from 'lib/pattern-import/gate/reader';
import type { PieceDTO } from 'lib/nesting/types';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import {
  manifestGeometryProblems,
  parseFiles,
  parseSheets,
  type ParsedSheets,
} from 'lib/nesting/worker/parse-files';
import { writeDxfDetailed } from 'lib/pattern-import/write';
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

// Codex C3: the card trusts a manifest only when every block is drawn as declared — the fixture
// manifests carry the fixture's real geometry (cut-line bbox and area, notches, drills).
function geometryOf(text: string, block: string) {
  const ents = readRawDxf(text).blocks.get(block) ?? [];
  const cut = ents.find(
    (e) => e.layer === '1' && e.closed && (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE'),
  );
  const pts = cut?.pts ?? [];
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const isDrill = (e: (typeof ents)[number]) => {
    if (e.layer !== '8' || !e.closed || e.pts.length !== 4) return false;
    const w = Math.max(...e.pts.map((q) => q.x)) - Math.min(...e.pts.map((q) => q.x));
    const h = Math.max(...e.pts.map((q) => q.y)) - Math.min(...e.pts.map((q) => q.y));
    return Math.abs(w - 10) <= 0.5 && Math.abs(h - 10) <= 0.5;
  };
  return {
    bboxMm: [
      r1(Math.min(...xs)),
      r1(Math.min(...ys)),
      r1(Math.max(...xs)),
      r1(Math.max(...ys)),
    ] as [number, number, number, number],
    areaMm2: Math.round(Math.abs(a) / 2),
    notches: ents.filter((e) => e.layer === '4').length,
    drills: ents.filter(isDrill).length,
    // F14f: the cut ring's signature, as the writer embeds it
    contour: contourSignature(pts)!,
  };
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
    ...geometryOf(text, b.block),
    hasGrain: true,
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
    // ── Codex C6: chunk headers bounded, no hang; prologue scanned, not the whole sheet ──────────
    {
      const fast = (fn: () => unknown, code: string) => {
        const t0 = Date.now();
        const ok = throwsCode(fn, code);
        return { ok: ok && Date.now() - t0 < 200, ms: Date.now() - t0 };
      };
      const huge = fast(
        () => readManifest(`999\nGRBPWR-MANIFEST v1 1/1${'0'.repeat(300)} ${b64(m)}\n${legacy}`),
        'corrupt',
      );
      check('manifest (C6): total = 1e300 → fast typed error (corrupt)', false, huge.ok, huge);
      const million = fast(
        () => readManifest(`999\nGRBPWR-MANIFEST v1 1/999999 ${b64(m)}\n${legacy}`),
        'corrupt',
      );
      check(
        'manifest (C6): total = 999999 → fast typed error (corrupt)',
        false,
        million.ok,
        million,
      );
      let partialMsg = '';
      const few = fast(() => {
        try {
          readManifest(`999\nGRBPWR-MANIFEST v1 1/3000 ${b64(m)}\n${legacy}`);
        } catch (e) {
          partialMsg = e instanceof Error ? e.message : '';
          throw e;
        }
      }, 'partial');
      check(
        'manifest (C6): 2999 missing chunks → partial, reported as a count + the first few',
        false,
        few.ok && /2999 of 3000 chunk\(s\) missing \(first: 2, 3, 4, 5, 6\)/.test(partialMsg),
        partialMsg,
      );
      check(
        'manifest (C6 control): a manifest still reads after the bounds',
        false,
        isDeepStrictEqual(readManifest(embedManifest(legacy, m)), m),
      );
      // a 40 MB sheet behind the manifest: only the prologue is decoded
      const big = embedManifest(legacy, m) + `999\n${'x'.repeat(40 * 1024 * 1024)}\n`;
      const bigBuf = enc(big).slice().buffer as ArrayBuffer;
      const t0 = Date.now();
      const got = readManifestBytes(bigBuf);
      check(
        'manifest (C6): readManifestBytes on a 40 MB sheet reads the prologue only (< 100 ms)',
        false,
        isDeepStrictEqual(got, m) && Date.now() - t0 < 100,
        { ms: Date.now() - t0 },
      );
      // a foreign file whose leading comments exceed the bound is still foreign; ours is refused
      const pad = `999\n${'c'.repeat(150)}\n`.repeat(
        Math.ceil(MANIFEST_MAX_PROLOGUE_BYTES / 150) + 10,
      );
      check(
        'manifest (C6): an oversized foreign comment prologue → null (not a manifest)',
        false,
        readManifestBytes(enc(pad + legacy).slice().buffer as ArrayBuffer) === null,
      );
      check(
        'manifest (C6): an oversized prologue carrying our tag → corrupt',
        false,
        throwsCode(
          () =>
            readManifestBytes(
              enc(embedManifest(legacy, m).replace(/\n0\nSECTION/, `\n${pad}0\nSECTION`)).slice()
                .buffer as ArrayBuffer,
            ),
          'corrupt',
        ),
      );
    }
    // ── Codex C8: nested source and gate fully validated ───────────────────────────────────────
    {
      const shape = (o: unknown) => throwsCode(() => readManifest(raw(o)), 'shape');
      const gate0 = {
        passed: true,
        durationMs: 1,
        checks: [
          {
            id: 'G1-roundtrip',
            ok: true,
            severity: 'block',
            value: 3,
            threshold: null,
            blocks: [],
            note: 'ok',
          },
        ],
      };
      check('manifest (C8): source: {} → shape', false, shape({ ...m, source: {} }));
      check(
        'manifest (C8): source.files[0].sha256 not a string → shape',
        false,
        shape({ ...m, source: { ...m.source, files: [{ ...m.source.files[0], sha256: 5 }] } }),
      );
      check(
        'manifest (C8): source.scale.factor not finite (null) → shape',
        false,
        shape({ ...m, source: { ...m.source, scale: { ...m.source.scale, factor: null } } }),
      );
      check(
        'manifest (C8): unknown source kind → shape',
        false,
        shape({ ...m, source: { ...m.source, files: [{ ...m.source.files[0], kind: 'exe' }] } }),
      );
      check(
        'manifest (C8): gate check with an unknown id → shape',
        false,
        shape({ ...m, gate: { ...gate0, checks: [{ ...gate0.checks[0], id: 'G99' }] } }),
      );
      check(
        'manifest (C8): gate check with a 100 KB note → shape',
        false,
        shape({
          ...m,
          gate: { ...gate0, checks: [{ ...gate0.checks[0], note: 'n'.repeat(100_000) }] },
        }),
      );
      check(
        'manifest (C8): gate passed=true over a failed blocking check → shape',
        false,
        shape({ ...m, gate: { ...gate0, checks: [{ ...gate0.checks[0], ok: false }] } }),
      );
      const der = {
        block: 'FP_L_M',
        kind: 'operator-bridge',
        lengthMm: 4.7,
        offSourceMm: 4.7,
        a: [1, 2],
        b: [3, 4],
      };
      const okDerived = readManifest(raw({ ...m, gate: { ...gate0, derived: [der] } }));
      check(
        'manifest (C8 control): a valid gate report with F14b G15/derived is accepted and kept',
        false,
        isDeepStrictEqual((okDerived?.gate as unknown as { derived: unknown[] })?.derived, [der]) &&
          !!readManifest(
            raw({ ...m, gate: { ...gate0, checks: [{ ...gate0.checks[0], id: 'G15-derived' }] } }),
          ),
      );
      check(
        'manifest (C8): derived entry with an unknown kind / non-finite end → shape',
        false,
        shape({ ...m, gate: { ...gate0, derived: [{ ...der, kind: 'glue' }] } }) &&
          shape({ ...m, gate: { ...gate0, derived: [{ ...der, a: [1, null] }] } }),
      );
      check(
        'manifest (C8): extra unknown fields are not carried into the result',
        false,
        !('evil' in (readManifest(raw({ ...m, evil: 'x'.repeat(10) })) ?? {})),
      );
    }
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
  // ── Codex C3: the manifest is trusted only when bound to the drawn geometry ─────────────────────
  {
    const name = 'a-single-M.dxf';
    const orig = fixture(name);
    const m0 = manifestFor(orig, SPECS[name]);
    const trusted = (p: ParsedSheets) =>
      p.failedFiles === 0 &&
      p.pieces.length > 0 &&
      p.pieces.every((x) => !!x.manifest) &&
      !(p as ParsedSheets & { manifestDistrust: (string | null)[] }).manifestDistrust[0];
    const distrusted = (p: ParsedSheets, why: RegExp, warned = true) => {
      const d = (p as ParsedSheets & { manifestDistrust: (string | null)[] }).manifestDistrust[0];
      return (
        p.failedFiles === 0 &&
        p.pieces.length > 0 &&
        p.pieces.every((x) => !x.manifest) &&
        !!d &&
        why.test(d) &&
        p.warnings.some((w) => w.includes('manifest is not trusted')) === warned
      );
    };
    const ok = await parse([{ name, text: embedManifest(orig, m0) }]);
    check('C3 control: the fixture with its own manifest is trusted', false, trusted(ok));
    // forged: same block names, BP_M and CLR_M contours swapped (names swapped in the drawing)
    const swapped = orig
      .replace(/\bBP_M\b/g, '__T__')
      .replace(/\bCLR_M\b/g, 'BP_M')
      .replace(/__T__/g, 'CLR_M');
    const forged = await parse([{ name, text: embedManifest(swapped, m0) }]);
    check(
      'C3: a manifest with matching block names but swapped contours is not trusted (legacy parse + reason)',
      false,
      swapped !== orig && distrusted(forged, /BP_M|CLR_M/),
      (forged as ParsedSheets & { manifestDistrust: unknown[] }).manifestDistrust,
    );
    const blocked = await parse([
      {
        name,
        text: embedManifest(orig, {
          ...m0,
          gate: {
            passed: false,
            durationMs: 0,
            checks: [
              {
                id: 'G3-coverage',
                ok: false,
                severity: 'block',
                value: 0.9,
                threshold: 0.99,
                blocks: ['BP_M'],
                note: 'x',
              },
            ],
          },
        }),
      },
    ]);
    check(
      'C3: a manifest whose gate did not pass is not trusted',
      false,
      distrusted(blocked, /gate did not pass/),
    );
    const noGate = await parse([{ name, text: embedManifest(orig, { ...m0, gate: null }) }]);
    check(
      'C3: a manifest without a gate report is not trusted (badge only: it is also the pre-gate round trip)',
      false,
      distrusted(noGate, /no conversion gate/, false),
    );
    const lessNotches = await parse([
      {
        name,
        text: embedManifest(orig, {
          ...m0,
          blocks: m0.blocks.map((b) =>
            b.block === 'FP_L_M' ? { ...b, notches: b.notches + 1 } : b,
          ),
        }),
      },
    ]);
    check(
      'C3: a notch count that differs from the drawing → not trusted',
      false,
      distrusted(lessNotches, /FP_L_M: \d+ notches/),
    );
    const unsigned = await parse([
      {
        name,
        text: embedManifest(orig, {
          ...m0,
          blocks: m0.blocks.map(({ contour: _c, ...b }) => b),
        }),
      },
    ]);
    check(
      'F14f: a manifest without contour signatures (pre-F14f) is not trusted — legacy parse',
      false,
      distrusted(unsigned, /no contour signature/),
    );

    // ── F14f (Codex R2): the manifest is bound to the SHAPE, and features are counted uncapped ───
    {
      const sizeM = { token: 'M', sizeId: plainSizeId('m'), name: 'm', sourceLabel: 'M', rank: 0 };
      const scope = {
        scopeKey: 'main',
        fabricPurpose: 'main',
        bomLineKey: '',
        label: 'main',
        isInterlining: false,
      };
      const pieceOf = (
        identity: string,
        cut: PtMm[],
        seam: PtMm[] | null,
        notchAt: PtMm[] = [],
      ): PieceSpec => ({
        identity,
        code: identity,
        mods: [],
        displayName: identity.toLowerCase(),
        nameOrigin: 'operator',
        seed: 0,
        variant: null,
        pairHand: null,
        pairOf: null,
        unfoldedFold: false,
        piecesPerGarment: 1,
        allowance: { meaning: 'cut', allowanceMm: 10, origin: 'text', evidence: [] },
        fabrics: ['main'],
        fused: false,
        ungraded: false,
        sizes: [
          {
            rank: 0,
            sizeToken: 'M',
            sizeId: sizeM.sizeId,
            cut,
            seam,
            grain: null,
            notches: notchAt.map((at) => ({
              kind: 'notch' as const,
              at,
              seg: [at, { x: at.x, y: at.y + 5 }] as [PtMm, PtMm],
              depthMm: 5,
              origin: 'detected' as const,
              ranges: [],
              confidence: 1,
            })),
            drills: [],
            internal: [],
            fold: null,
            offset: null,
            walls: [],
            bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } as never,
            areaMm2: 0,
          },
        ],
      });
      const written = (p: PieceSpec) =>
        writeDxfDetailed(
          {
            techCardId: 1,
            scope,
            pieces: [p],
            sizes: [sizeM],
            source: m0.source,
            generator: 'f6b-probe',
            dialect: 'r2000',
          },
          { embed: null, now: () => new Date(0) },
        );
      const passed = (m: ConversionManifest): ConversionManifest => ({
        ...m,
        gate: { passed: true, checks: [], durationMs: 0 },
      });
      const sheet = (text: string) => [{ name: 'w.dxf', text }];

      // R2-A: Codex's triangle swap — same bbox, area, position, feature counts
      const triA = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 0, y: 100 },
      ];
      const triB = [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      const wA = written(pieceOf('TRI', triA, null));
      const wB = written(pieceOf('TRI', triB, null));
      const [bA, bB] = [wA.manifest.blocks[0], wB.manifest.blocks[0]];
      const sameFacts =
        isDeepStrictEqual(bA.bboxMm, bB.bboxMm) &&
        bA.areaMm2 === bB.areaMm2 &&
        bA.notches === bB.notches &&
        bA.drills === bB.drills;
      const own = await parse(sheet(embedManifest(wA.bareText, passed(wA.manifest))));
      const swapped = await parse(sheet(embedManifest(wB.bareText, passed(wA.manifest))));
      check(
        'F14f R2-A control: the written triangle with its own manifest is trusted',
        false,
        trusted(own),
        (own as ParsedSheets).manifestDistrust,
      );
      check(
        'F14f R2-A: triangle (0,0),(100,0),(0,100) swapped for (0,0),(100,100),(0,100) — same bbox/area/position/features — is NOT trusted',
        false,
        sameFacts && distrusted(swapped, /TRI_M: outline differs/),
        { sameFacts, why: (swapped as ParsedSheets).manifestDistrust },
      );
      // the pre-F14f facts alone (no signature) could not tell the two apart — the signature is what
      // catches it, not a side effect of the other checks
      const rawsB = parseFiles(new TextEncoder().encode(wB.bareText).slice().buffer, opts, []).raws;
      const noSig = passed({
        ...wA.manifest,
        blocks: wA.manifest.blocks.map(({ contour: _c, ...b }) => b),
      });
      const legacyProblems = manifestGeometryProblems(noSig, rawsB).filter(
        (w) => !/contour signature/.test(w),
      );
      check(
        'F14f R2-A: without the signature the swapped triangle passes every other C3 check (the bypass is real)',
        false,
        legacyProblems.length === 0,
        legacyProblems,
      );

      // R2-B: genuine output, a 5001-vertex seam written before one notch
      const W = 300;
      const H = 200;
      const cutR = [
        { x: 0, y: 0 },
        { x: W, y: 0 },
        { x: W, y: H },
        { x: 0, y: H },
      ];
      const seamR: PtMm[] = [];
      const N = 5001;
      const per = 2 * (W - 20 + H - 20);
      for (let k = 0; k < N; k++) {
        let d = (k / N) * per;
        const j = k % 2 === 0 ? 0.05 : -0.05; // ±0.05 mm: survives the writer's 0.01 mm simplify
        let p: PtMm;
        if (d < W - 20) p = { x: 10 + d, y: 10 + j };
        else if ((d -= W - 20) < H - 20) p = { x: W - 10 + j, y: 10 + d };
        else if ((d -= H - 20) < W - 20) p = { x: W - 10 - d, y: H - 10 + j };
        else p = { x: 10 + j, y: H - 10 - (d - (W - 20)) };
        seamR.push(p);
      }
      const wS = written(pieceOf('SEAMY', cutR, seamR, [{ x: 150, y: 0 }]));
      const seamWritten = wS.plan.blocks[0].seam?.length ?? 0;
      const genuine = await parse(sheet(embedManifest(wS.bareText, passed(wS.manifest))));
      const cutPiece = genuine.pieces.find((p) => p.layer === '1');
      const shownNotches = cutPiece?.inner?.filter((c) => c.layer === '4').length ?? -1;
      check(
        'F14f R2-B: genuine output with a 5001-vertex seam + 1 notch IS trusted (the notch is counted past the display budget)',
        false,
        seamWritten > 4000 && wS.manifest.blocks[0].notches === 1 && trusted(genuine),
        { seamWritten, why: (genuine as ParsedSheets).manifestDistrust },
      );
      check(
        'F14f R2-B (not vacuous): the display geometry of that piece really lost the notch to the 4000-point budget',
        false,
        shownNotches === 0,
        shownNotches,
      );
      const fakeNotch = await parse(
        sheet(
          embedManifest(
            wS.bareText,
            passed({
              ...wS.manifest,
              blocks: wS.manifest.blocks.map((b) => ({ ...b, notches: 2 })),
            }),
          ),
        ),
      );
      check(
        'F14f R2-B: the uncapped counter still catches a wrong notch count behind the budget',
        false,
        distrusted(fakeNotch, /SEAMY_M: 1 notches, declared 2/),
        (fakeNotch as ParsedSheets).manifestDistrust,
      );

      // the signature does not depend on the ring's start vertex or winding
      const ring = wS.plan.blocks[0].cut;
      const sig = contourSignature(ring)!;
      const rot = [...ring.slice(2), ...ring.slice(0, 2)];
      const rev = [...ring].reverse();
      const shifted = ring.map((p) => ({ x: p.x + 1234.5, y: p.y - 77 }));
      check(
        'F14f: signature check is start-vertex / winding / translation independent',
        false,
        [rot, rev, shifted].every((r) => contourSigProblem(sig, r) === null),
      );
      const moved = ring.map((p, i) => (i === 1 ? { x: p.x + 1, y: p.y } : p));
      check(
        'F14f: a 1 mm move of one corner is caught',
        false,
        contourSigProblem(sig, moved) !== null,
        contourSigMatch(sig, moved),
      );
      // validator: strict and bounded — on embed AND on read (a hand-written v1 line)
      const rawLine = (c: unknown) => {
        const m = { ...m0, blocks: m0.blocks.map((b, i) => (i === 0 ? { ...b, contour: c } : b)) };
        const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(m))));
        return `999\nGRBPWR-MANIFEST v1 1/1 ${b64}\n${orig}`;
      };
      const bad: [string, unknown][] = [
        ['odd length', { dev: 1, pts: [0, 0, 1, 1, 2] }],
        ['two points', { dev: 1, pts: [0, 0, 1, 1] }],
        ['non-integer', { dev: 1, pts: [0, 0, 1.5, 1, 2, 2] }],
        ['negative coordinate', { dev: 1, pts: [0, 0, -1, 1, 2, 2] }],
        ['too many points', { dev: 1, pts: new Array(82).fill(1) }],
        ['huge dev', { dev: 1e9, pts: [0, 0, 1, 1, 2, 2] }],
        ['not an object', [0, 0, 1]],
        ['null', null],
      ];
      const refusedOn = (fn: () => unknown) => {
        try {
          fn();
          return false;
        } catch (e) {
          return e instanceof ManifestError && e.code === 'shape';
        }
      };
      const leaks = bad
        .filter(
          ([, c]) =>
            !refusedOn(() =>
              embedManifest(orig, {
                ...m0,
                blocks: m0.blocks.map((b, i) => (i === 0 ? { ...b, contour: c } : b)),
              } as never),
            ) || !refusedOn(() => readManifest(rawLine(c))),
        )
        .map(([n]) => n);
      check(
        'F14f: the validator refuses malformed or unbounded contour signatures (embed and read)',
        false,
        leaks.length === 0 && readManifest(rawLine(m0.blocks[0].contour)) !== null,
        leaks,
      );
    }
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
    const missing = missingSizesIn(v.pieces, DICT_TOKENS, [plainSizeId('s')], SIZE_BY_ID, 1);
    check(
      'a: the card is offered size M from the manifest (structure alone finds none)',
      true,
      isDeepStrictEqual(
        missing.map((x) => x.sizeId),
        [plainSizeId('m')],
      ) && missing.every((x) => !x.confirm),
      missing,
    );
    // F14 MAJOR 4: the same manifest uploaded to card B whose range is in another size system
    // (ta_m): its plain M is not trusted, nothing is added, the refusal is reported
    const cardB = [DICT_NAMES.indexOf('s_46ta_m') + 1];
    const missingB = missingSizesIn(v.pieces, DICT_TOKENS, cardB, SIZE_BY_ID, 2);
    const foreignB = foreignManifestSizes(v.pieces, cardB, SIZE_BY_ID, 2);
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
      const missingB = missingSizesIn(v.pieces, DICT_TOKENS, cardB, SIZE_BY_ID, 2);
      const foreignB = foreignManifestSizes(v.pieces, cardB, SIZE_BY_ID, 2);
      check(
        'b (F14): manifest from card A on card B (ta_m) → no foreign id, sizes derived in ta_m and only proposed',
        true,
        // what the legacy token path derives from the names (XL is on too few stems for it)
        isDeepStrictEqual(
          missingB.map((x) => x.sizeId).sort((a, b) => a - b),
          [id('m_48ta_m'), id('l_50ta_m')],
        ) &&
          missingB.every((x) => x.confirm === true) &&
          isDeepStrictEqual([...foreignB].sort(), ['l', 'm', 's', 'xl']),
        { missingB, foreignB },
      );
      const missingA = missingSizesIn(v.pieces, DICT_TOKENS, [plainSizeId('s')], SIZE_BY_ID, 1);
      check(
        'b (F14 control): on its own card (plain system) the manifest sizes are trusted and written by themselves',
        true,
        isDeepStrictEqual(
          missingA.map((x) => x.sizeId).sort((a, b) => a - b),
          ['m', 'l', 'xl'].map(plainSizeId),
        ) &&
          missingA.every((x) => !x.confirm) &&
          foreignManifestSizes(v.pieces, [plainSizeId('s')], SIZE_BY_ID, 1).length === 0,
        missingA,
      );
      // ── F14f (Codex R6) ──
      // card #2 in the SAME (plain) size system: the manifest of card #1 used to pass the system
      // guard and append its ids. Now its ids are never taken: sizes come from the block names and
      // are only proposed.
      const sameSys = missingSizesIn(v.pieces, DICT_TOKENS, [plainSizeId('s')], SIZE_BY_ID, 2);
      check(
        'b (F14f R6): foreign manifest (card #1) on card #2 in the SAME system → nothing auto-written, names-derived sizes proposed',
        true,
        sameSys.length > 0 &&
          sameSys.every((x) => x.confirm === true) &&
          isDeepStrictEqual(
            sameSys.map((x) => x.sizeId).sort((a, b) => a - b),
            ['m', 'l'].map(plainSizeId),
          ) &&
          isDeepStrictEqual(
            [...foreignManifestSizes(v.pieces, [plainSizeId('s')], SIZE_BY_ID, 2)].sort(),
            ['l', 'm', 'xl'],
          ),
        sameSys,
      );
      const unknownCard = missingSizesIn(v.pieces, DICT_TOKENS, [plainSizeId('s')], SIZE_BY_ID);
      check(
        'b (F14f R6): an unknown card id is not "own" → nothing auto-written',
        true,
        unknownCard.length > 0 && unknownCard.every((x) => x.confirm === true),
        unknownCard,
      );
      const emptyOwn = missingSizesIn(v.pieces, DICT_TOKENS, [], SIZE_BY_ID, 1);
      check(
        'b (F14f R6): own manifest on a card with NO sizes → all four proposed, none auto-written',
        true,
        isDeepStrictEqual(
          emptyOwn.map((x) => x.sizeId).sort((a, b) => a - b),
          ['s', 'm', 'l', 'xl'].map(plainSizeId),
        ) && emptyOwn.every((x) => x.confirm === true),
        emptyOwn,
      );
      const emptyForeign = missingSizesIn(v.pieces, DICT_TOKENS, [], SIZE_BY_ID, 2);
      check(
        // a safety invariant, not a manifest behaviour: it holds with the gate shut too (the
        // names-derived plain tokens are ambiguous across systems on an empty card)
        'b (F14f R6): foreign manifest on a card with NO sizes → nothing auto-written',
        false,
        emptyForeign.every((x) => x.confirm === true),
        emptyForeign,
      );
      // control: the same drawing WITHOUT a manifest keeps the legacy rule (written by itself)
      const vl = await parsedL('b-sml-pck-m-only.dxf');
      const legacy = missingSizesIn(vl.pieces, DICT_TOKENS, [plainSizeId('s')], SIZE_BY_ID, 2);
      check(
        'b (F14f R6 control): the same drawing without a manifest → derived sizes still written by themselves',
        false,
        legacy.length > 0 && legacy.every((x) => !('confirm' in x)),
        legacy,
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
      // F14f: a sample written before contour signatures (by a lane without F14f — the samples are
      // shared) is legacy: the card must read it as any DXF, with the reason, and nothing else is
      // asserted about it.
      if (m.blocks.some((b) => !b.contour)) {
        check(
          `F6 sample ${f}: pre-F14f manifest (no contour signature) → not trusted, legacy parse`,
          false,
          v.parsed.failedFiles === 0 &&
            v.pieces.length > 0 &&
            v.pieces.every((p) => !p.manifest) &&
            /no contour signature/.test(v.parsed.manifestDistrust[0] ?? ''),
          v.parsed.manifestDistrust,
        );
        continue;
      }
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
