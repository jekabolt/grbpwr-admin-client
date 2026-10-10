// One import session = one wizard run (08-CONTRACT §4.1). The session owns the heavy artifacts —
// file bytes (blob store), the extracted docs, the assembled sheet, the DXF fast path, the stage
// outputs — and every stage reads them implicitly. Re-running a stage drops everything after it.
//
// Memory: the page geometry of the docs is the largest thing a session holds (F2 measured
// polupalto at 777 MB RSS in node with docs + sheet alive). Once a sheet is assembled the docs are
// dropped; the file bytes stay in the blob store (Blob, not a JS ArrayBuffer), so re-assembling a
// different sheet or with a hand grid re-reads them (seconds) instead of keeping them (hundreds MB).
import type {
  BackgroundKind,
  ChainAmbiguity,
  CleanPreview,
  ChainSet,
  DraftScope,
  ExtractOpts,
  FileId,
  GateReport,
  IRPage,
  IRText,
  ManifestSource,
  PageClassification,
  PageIndex,
  PageMask,
  PageMaskEdit,
  PieceFamily,
  Progress,
  PtMm,
  RasterCalibration,
  ScaleCandidate,
  ScaleDecision,
  Seed,
  SemanticsOutput,
  Sheet,
  SizeMap,
  ExpectedSizes,
  FillOpts,
  SizeCountAsk,
  SizeRun,
  SourceDoc,
  SheetClean,
  SourceFileInfo,
  StageIO,
  StageName,
} from '../types';
import { PATIMPORT } from '../types';
import { applyScale, detectScale, detectScaleSet, extractPdfWith } from '../adapters/pdf';
import {
  dxfFastPath,
  dxfScaleCandidates,
  readDxf,
  settleSeamPair,
  segmentDxf,
  type DxfFastPath,
  type DxfPieceCandidate,
  type DxfRead,
  type DxfSegmentation,
} from '../adapters/dxf';
import { extractRasterImageDetailed, extractRasterPdfDetailed } from '../adapters/raster';
import { extractHpgl } from '../adapters/hpgl';
import { extractSvg } from '../adapters/svg';
import {
  pickExtractor,
  sniffFormat,
  UnsupportedFormat,
  type ExtractorRegistry,
} from '../adapters/sniff';
import { assembleSheetDetailed, classifyPages } from '../assemble';
import { applyMasks, cleanPages, cleanSheet, countsOf, mergeScale, srcKey } from '../clean';
import { renderSom } from '../ai/som';
import { writeAndGate } from '../gate';
import { applyLegend, buildChainsDetailed, mergeSameSize } from '../chains';
import { detectSizeRun } from '../sizes';
import { expectedSizes, inferDrawnSizes, runForExpected } from '../pieces/grade/expected';
import { applyOperatorMap, createProposeSizeMap, defaultTokensOf } from '../sizes/map';
import {
  applyPieceEdits,
  applyWallEdits,
  isWallEdit,
  proposeSeeds,
  startSession,
  variantLabels,
  wallEditsInto,
  type PieceSession,
  type WallPieceEdit,
} from '../pieces';
import { pointInPoly } from '../pieces/geom';
import {
  allowanceFromTexts,
  pieceOnlyEvidence,
  buildPieceSpecsDetailed,
  detectAllowance,
  type SemanticsDetail,
} from '../semantics';
import { planScopes, proposeFabricsDetailed, purposeWord } from '../fabrics';
import { cardRules } from './card-rules';
import { ImportError, cancelled, stageUnavailable } from './errors';
import { chainPreviewOf, previewOf } from './preview';
import { wallsUsedBy } from './walls-used';
import { checkInputSet, imagePixelsRefusal } from './limits';
import { assertFiniteDoc, WorkBudget } from '../adapters/budget';
import {
  attributeSizes,
  mergeDxfSet,
  reviewPlaceholderSizes,
  settleDxfSet,
  type DxfSet,
  type DxfSetSize,
} from './dxf-set';

/** Hex SHA-256 of the bytes ('' where the runtime has no WebCrypto — an insecure origin). */
async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) return '';
  const d = new Uint8Array(await subtle.digest('SHA-256', bytes));
  let hex = '';
  for (const b of d) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/**
 * Card size spellings come from the CARD side (`CardSize.spellings`, read there by block-code
 * `sizeTokensOf` off the dictionary name), so the map agrees with the card's own reader; a size
 * without them falls back to the default reader of sizes/map.ts.
 */
const proposeCardSizeMap = createProposeSizeMap({
  tokensOf: (c) =>
    c.spellings?.length ? [...new Set([c.token, ...c.spellings])] : defaultTokensOf(c),
});

/** Stage order (08-CONTRACT §4.1); render-som is a side stage and invalidates nothing. */
const ORDER: StageName[] = [
  'extract',
  'clean',
  'scale',
  'assemble',
  'chains',
  'sizes',
  'pieces',
  'semantics',
  'fabrics',
  'write',
];

export type StageCtx = {
  progress: Progress;
  /** Throws `cancelled` when the operator stopped the stage (checked at every progress tick). */
  checkCancel: () => void;
};

type Calib = { file: FileId; page: PageIndex; calibration: RasterCalibration };

const DEFAULT_OPTS: ExtractOpts = { sagittaMm: PATIMPORT.sagittaMm, keepFills: true };

/**
 * A page whose drawing IS an image (a scan): one raster covering at least half the page, and next
 * to nothing drawn as vectors (a frame, a few marks). The contract's "pageCover ≥ 0.9" is too
 * strict for real files: leonie's scans sit inside print margins at 0.56–0.86 of the page.
 */
export const SCAN_MIN_COVER = 0.5;
function isScanPage(p: IRPage): boolean {
  if (!p.rasters.some((r) => r.pageCover >= SCAN_MIN_COVER)) return false;
  const stroked = p.paths.filter((q) => !p.styles[q.style]?.fill).length;
  return stroked <= 3 && p.paths.length <= 20;
}

/** Points the masked lines of the sheet view may carry (the live lines keep the full budget). */
const PREVIEW_MASK_BUDGET = 60_000;
/** Points all page previews of the files step carry together. */
const PREVIEW_PAGES_BUDGET = 250_000;

/** A8: each masked page drawn — live lines and masked lines by kind (the files step's strip). */
function cleanPreviews(docs: SourceDoc[], masks: PageMask[]): CleanPreview[] {
  // every page: the tiles with their mask, the pages set aside as thumbnails (their live lines)
  const shown = masks;
  const tilesN = masks.filter((m) => m.role === 'tile').length;
  const asideN = masks.length - tilesN;
  const thumb = Math.min(4000, Math.floor((0.2 * PREVIEW_PAGES_BUDGET) / Math.max(1, asideN)));
  const per = Math.max(
    3000,
    Math.floor((PREVIEW_PAGES_BUDGET - thumb * asideN) / Math.max(1, tilesN)),
  );
  const out: CleanPreview[] = [];
  for (const m of shown) {
    const pg = docs.find((d) => d.file.id === m.file)?.pages.find((p) => p.page === m.page);
    if (!pg) continue;
    const ext = Math.max(pg.widthMm, pg.heightMm);
    const byId = new Map(pg.paths.map((p) => [p.id, p]));
    const inItem = new Set(m.items.flatMap((it) => it.paths));
    const masked = new Map<string, { item: (typeof m.items)[number]; paths: typeof pg.paths }>();
    for (const it of m.items) {
      if (!it.paths.length) continue;
      const k = `${it.kind}|${it.status}|${it.applied}`;
      const e = masked.get(k) ?? { item: it, paths: [] };
      for (const id of it.paths) {
        const p = byId.get(id);
        if (p) e.paths.push(p);
      }
      masked.set(k, e);
    }
    out.push({
      file: m.file,
      page: m.page,
      widthMm: pg.widthMm,
      heightMm: pg.heightMm,
      live: previewOf(
        pg.paths.filter((p) => !inItem.has(p.id)),
        pg.styles,
        ext,
        m.role === 'tile' ? per : Math.max(500, thumb),
      ),
      masked: [...masked.values()].map(({ item, paths }) => ({
        kind: item.kind,
        status: item.status,
        applied: item.applied,
        lines: previewOf(paths, pg.styles, ext, Math.max(1000, per >> 1)),
      })),
    });
  }
  return out;
}

/** A8b: tile chrome — a cut line on it, or around it, is traced chrome (G19). */
const CHROME_KINDS = new Set<BackgroundKind>(['tile-frame', 'regmark', 'tile-label']);

const sheetOnly = (s: Sheet): StageIO['assemble']['out']['sheet'] => {
  const { paths: _p, texts: _t, rasters: _r, styles: _s, ...rest } = s;
  return rest;
};

export class Session {
  readonly id: number;
  files: SourceFileInfo[];
  /** Blob store: the input files (re-read on demand) and the latest renders. */
  private blobs = new Map<string, Blob>();

  // extract
  private docs: SourceDoc[] | null = null;
  /** Factor already applied to `docs` (1 = as extracted). */
  private docsFactor = 1;
  private pages: PageClassification[] = [];
  /** The page classes as extract found them (`pages` is them after the clean stage's role edits). */
  private extractPages: PageClassification[] = [];
  private extractScale: ScaleCandidate[] = [];
  private calibrations: Calib[] = [];
  // clean (A8)
  /** The page masks of the last clean run (re-applied whenever the docs are read again). */
  private masks: PageMask[] | null = null;
  private cleanEdits: PageMaskEdit[] = [];
  /** Sources (`srcKey`) of the paths page items offer but do not apply (8b does not offer them twice). */
  private offeredSrc = new Set<string>();
  /** A8b: sources of the tile chrome page items offer but do not apply (G19 measures against them). */
  private chromeSrc = new Set<string>();
  private scaleCands: ScaleCandidate[] = [];
  private extractWarnings: string[] = [];
  private dxf: { read: DxfRead; seg: DxfSegmentation } | null = null;
  /** Several DXF files, one per size (owner decision 5): merged into one drawing by the first read
   * (R4: in the cancellable read stage, never at open), kept for the rereads. */
  private isDxfSet = false;
  private dxfSet: DxfSet | null = null;
  /** The set's sizes as the reader saw them in the merged drawing (`settleDxfSet`). */
  private setSizes: DxfSetSize[] = [];
  // scale
  private decision: ScaleDecision | null = null;
  private fast: DxfFastPath | null = null;
  // assemble
  private sheet: Sheet | null = null;
  /** Every page's text and the file names, kept past the docs: the legend reads size runs there. */
  private docTexts: string[] = [];
  private fileNames = new Map<string, string>();
  // chains (legend applied) → sizes → pieces → semantics
  /** The legend's chain set (operator legend applied, same-label size rows merged). */
  private chains: ChainSet | null = null;
  /** The set the fill ran on (the operator's wall edits live in `pieceSession.walls`, not here). */
  private wallSet: ChainSet | null = null;
  /**
   * The fill's state (F4b operator API, pieces/operator.ts): the operator's walls + the families.
   * Kept while the wizard only APPENDS wall edits (same chains, run, seeds, opts), so a closed gap
   * or an ignored line refills only the seeds it can reach; anything else starts a new session.
   */
  private pieceSession: PieceSession | null = null;
  private pieceWallEdits: WallPieceEdit[] = [];
  private pieceKey = '';
  private run: SizeRun | null = null;
  private sizeMap: SizeMap | null = null;
  /** pieces/grade (H1): sizes the sheet draws (sizes stage); the pieces stage fails closed on it. */
  private expected: ExpectedSizes | null = null;
  private gradeAmbiguities: ChainAmbiguity[] = [];
  /** Text seeds proposed once per chain set (clicks are appended by the wizard). */
  private textSeeds: Seed[] | null = null;
  private seeds: Seed[] | null = null;
  private families: PieceFamily[] | null = null;
  private semantics: SemanticsOutput | null = null;
  /** Source walls per written identity × rank (F5) — what the gate measures the cut line against. */
  private wallsOf: SemanticsDetail['wallsOf'] | null = null;
  /** The outlines' derived edges per written identity × rank (F14b): gate G15, never walls. */
  private derivedOf: SemanticsDetail['derivedOf'] | null = null;
  /** Text of the pages that are not pattern tiles (instructions, cover, overview): cut layouts (F7). */
  private pageTexts: IRText[] = [];

  /** sha256 per file id, computed once when the bytes are first read (provenance, error report). */
  private sha = new Map<string, string>();

  constructor(id: number, files: { name: string; bytes: ArrayBuffer }[]) {
    this.id = id;
    if (!files.length) throw new ImportError('out-of-order', 'no files given');
    // M6: the main thread checked the File sizes already; the worker re-checks what it received.
    const refusal = checkInputSet(files.map((f) => ({ name: f.name, bytes: f.bytes.byteLength })));
    if (refusal) throw new ImportError(refusal.code, refusal.message);
    const routes = files.map((f) => {
      const sn = sniffFormat(f.bytes, f.name);
      if (sn.route === null) {
        const msg = new UnsupportedFormat(sn.refusal, sn.why).message;
        throw new ImportError('unsupported-format', `${f.name}: ${msg}`);
      }
      return { route: sn.route, kind: sn.kind };
    });
    const kinds = new Set(routes.map((r) => r.route));
    if (kinds.size > 1)
      throw new ImportError(
        'unsupported-format',
        `one run reads one format — got ${[...kinds].join(' + ')}. Import each format on its own.`,
      );
    // Several DXF files = one file per size: merged into one drawing by the read stage (R4: the
    // set is guarded, decoded and merged there — cancellable, after its size checks), read as one
    // DXF after.
    this.isDxfSet = routes[0].route === 'dxf' && files.length > 1;
    this.files = files.map((f, i) => ({
      id: String(i),
      name: f.name,
      bytes: f.bytes.byteLength,
      sha256: '',
      kind: routes[i].kind,
      pages: 0,
    }));
    // The ArrayBuffers are copied into Blobs (the browser may page those out) and released.
    files.forEach((f, i) => this.blobs.set(`file:${i}`, new Blob([f.bytes])));
  }

  close() {
    this.blobs.clear();
    this.docs = null;
    this.sheet = null;
    this.fast = null;
    this.dxf = null;
    this.dxfSet = null;
  }

  /** Running stage S drops every output after S (render-som drops nothing). */
  private invalidateAfter(stage: StageName) {
    const at = ORDER.indexOf(stage);
    if (at < 0) return;
    if (at < ORDER.indexOf('clean')) {
      this.masks = null;
      this.cleanEdits = [];
      this.offeredSrc = new Set();
      this.chromeSrc = new Set();
    }
    if (at < ORDER.indexOf('scale')) {
      this.decision = null;
      this.fast = null;
    }
    if (at < ORDER.indexOf('assemble')) this.sheet = null;
    if (at < ORDER.indexOf('chains')) {
      this.chains = null;
      this.textSeeds = null;
    }
    if (at < ORDER.indexOf('sizes')) {
      this.run = null;
      this.sizeMap = null;
      this.expected = null;
    }
    if (at < ORDER.indexOf('pieces')) {
      this.seeds = null;
      this.families = null;
      this.wallSet = null;
      this.pieceSession = null;
      this.pieceWallEdits = [];
      this.pieceKey = '';
    }
    if (at < ORDER.indexOf('semantics')) {
      this.semantics = null;
      this.wallsOf = null;
      this.derivedOf = null;
    }
  }

  async runStage<S extends StageName>(
    stage: S,
    input: StageIO[S]['in'],
    ctx: StageCtx,
  ): Promise<StageIO[S]['out']> {
    this.invalidateAfter(stage);
    const out = await (async (): Promise<StageIO[StageName]['out']> => {
      switch (stage) {
        case 'extract':
          return this.extract(input as StageIO['extract']['in'], ctx);
        case 'clean':
          return this.clean(input as StageIO['clean']['in'], ctx);
        case 'scale':
          return this.scale(input as StageIO['scale']['in'], ctx);
        case 'assemble':
          return this.assemble(input as StageIO['assemble']['in'], ctx);
        case 'chains':
          return this.chainsStage(input as StageIO['chains']['in'], ctx);
        case 'sizes':
          return this.sizesStage(input as StageIO['sizes']['in']);
        case 'pieces':
          return this.piecesStage(input as StageIO['pieces']['in'], ctx);
        case 'semantics':
          return this.semanticsStage(input as StageIO['semantics']['in'], ctx);
        case 'render-som':
          return this.renderSomStage(input as StageIO['render-som']['in']);
        case 'write':
          return this.write(input as StageIO['write']['in'], ctx);
        case 'fabrics':
          return this.fabricsStage(input as StageIO['fabrics']['in']);
        default:
          throw new ImportError('internal', `unknown stage ${String(stage)}`);
      }
    })();
    return out as StageIO[S]['out'];
  }

  // ── extract ───────────────────────────────────────────────────────────────────────────────

  private async readAll(ctx: StageCtx, opts: ExtractOpts = DEFAULT_OPTS): Promise<SourceDoc[]> {
    const docs: SourceDoc[] = [];
    this.calibrations = [];
    this.dxf = null;
    // C4: one work budget for all files of this read (adapters/budget.ts)
    const runOpts: ExtractOpts = { ...opts, budget: new WorkBudget() };
    if (this.isDxfSet) return [await this.readDxfSet(ctx, runOpts)];
    const n = this.files.length;
    for (let i = 0; i < n; i++) {
      ctx.checkCancel();
      const info = this.files[i];
      const blob = this.blobs.get(`file:${i}`);
      if (!blob)
        throw new ImportError('no-session', 'the session lost its files — read them again');
      const bytes = await blob.arrayBuffer();
      if (!this.sha.has(info.id)) this.sha.set(info.id, await sha256Hex(bytes));
      const fileProgress: Progress = (done, total, note) =>
        ctx.progress(i + done / Math.max(1, total), n, `${info.name}${note ? ` · ${note}` : ''}`);
      const calibs = this.calibrations;
      const keepCalibs = (file: string, cs: RasterCalibration[], doc: SourceDoc) =>
        doc.pages.forEach((p, k) =>
          calibs.push({ file, page: p.page, calibration: p.calibration ?? cs[k] }),
        );
      const reg: ExtractorRegistry = {
        // A PDF is read as vector first; when its pages are scans (an image over the whole page
        // and nothing drawn) it is re-read by the raster adapter (F11), which traces every page.
        pdf: async (f, o, p) => {
          const doc = await extractPdfWith(f, o, p);
          const scans = doc.pages.filter(isScanPage).length;
          if (!scans || scans < Math.ceil(doc.pages.length / 2)) return doc;
          ctx.checkCancel();
          const r = await extractRasterPdfDetailed(f, o, {
            progress: (d, t, note) => {
              ctx.checkCancel();
              p?.(d, t, `tracing scan · ${note ?? ''}`);
            },
          });
          keepCalibs(f.id, r.calibrations, r.doc);
          return r.doc;
        },
        dxf: async (f, o, p) => {
          const read = await readDxf(f, o, p);
          const seg = segmentDxf(read);
          if (seg.presegmented) this.dxf = { read, seg };
          return read.doc;
        },
        hpgl: extractHpgl,
        svg: extractSvg,
        raster: async (f, o, p) => {
          // M6: an image whose pixels would not fit in the worker is refused before decoding.
          const big = imagePixelsRefusal(f.bytes, f.name);
          if (big) throw new ImportError(big.code, big.message);
          const r = await extractRasterImageDetailed(f, o, { progress: p });
          keepCalibs(f.id, r.calibrations, r.doc);
          return r.doc;
        },
      };
      const extract = pickExtractor(bytes, info.name, reg);
      let doc: SourceDoc;
      try {
        doc = await extract({ id: info.id, name: info.name, bytes }, runOpts, (d, t, note) => {
          ctx.checkCancel();
          fileProgress(d, t, note);
        });
      } catch (e) {
        // the pdf.js guard (pdf-guard.ts) does not know the file's name
        if (e instanceof ImportError && e.code === 'too-large' && !e.message.startsWith(info.name))
          throw new ImportError(e.code, `${info.name}: ${e.message}`, e.stage);
        throw e;
      }
      docs.push({
        ...doc,
        file: { ...doc.file, sha256: this.sha.get(info.id) ?? doc.file.sha256 },
      });
    }
    ctx.progress(n, n);
    return docs;
  }

  /**
   * A per-size DXF set: every file is hashed (provenance); the first read merges the files into one
   * drawing (`mergeDxfSet`: raw-byte guards before any decoding, a cancel check between files) and
   * keeps it for the rereads; the merged drawing is read as the one DXF of the run on the run's
   * work budget, and the reader must see one size per file (`settleDxfSet`).
   */
  private async readDxfSet(ctx: StageCtx, opts: ExtractOpts): Promise<SourceDoc> {
    const n = this.files.length;
    const total = 3; // one unit each: hash the files · merge them · read the merged drawing
    const members: { id: string; name: string; bytes: ArrayBuffer }[] = [];
    for (let i = 0; i < n; i++) {
      ctx.checkCancel();
      const info = this.files[i];
      if (this.dxfSet && this.sha.has(info.id)) continue;
      const blob = this.blobs.get(`file:${i}`);
      if (!blob)
        throw new ImportError('no-session', 'the session lost its files — read them again');
      const bytes = await blob.arrayBuffer();
      if (!this.sha.has(info.id)) this.sha.set(info.id, await sha256Hex(bytes));
      if (!this.dxfSet) members.push({ id: info.id, name: info.name, bytes });
      ctx.progress(i / n, total, info.name);
    }
    const set = (this.dxfSet ??= await mergeDxfSet(members, {
      checkCancel: ctx.checkCancel,
      progress: (d, t, note) => ctx.progress(1 + d / Math.max(1, t), total, note),
    }));
    members.length = 0;
    const bytes = set.bytes.slice().buffer;
    const read = await readDxf({ id: '0', name: set.name, bytes }, opts, (d, t, note) => {
      ctx.checkCancel();
      ctx.progress(2 + d / Math.max(1, t), total, `${set.name}${note ? ` · ${note}` : ''}`);
    });
    assertFiniteDoc(read.doc); // C4: the set path bypasses pickExtractor's boundary check
    const seg = segmentDxf(read);
    if (!seg.presegmented)
      throw new ImportError('corrupt', `${set.name}: the merged drawing has no block inserts`);
    this.setSizes = settleDxfSet(set, seg, read.meta.encoding);
    this.dxf = { read, seg };
    ctx.progress(total, total);
    return read.doc;
  }

  private async extract(
    input: StageIO['extract']['in'],
    ctx: StageCtx,
  ): Promise<StageIO['extract']['out']> {
    const opts = { ...DEFAULT_OPTS, ...input.opts };
    const docs = await this.readAll(ctx, opts);
    this.docs = docs;
    this.docsFactor = 1;
    // A merged set keeps its own files: the operator dropped them, the manifest names them.
    this.files = this.dxfSet
      ? this.files.map((f) => ({ ...f, sha256: this.sha.get(f.id) ?? '', pages: 1 }))
      : docs.map((d) => d.file);
    const warnings = docs.flatMap((d) => d.warnings.map((w) => `${d.file.name}: ${w}`));
    if (this.dxfSet) warnings.unshift(...this.dxfSet.notes);

    // Page classes: PDFs are sorted by F2; a one-page drawing (DXF, SVG, PLT, a scan image) is
    // its own sheet.
    const multiPage = docs.filter(
      (d) =>
        d.file.kind === 'pdf' ||
        d.file.kind === 'ai' ||
        (d.file.kind === 'raster' && d.pages.length > 1),
    );
    const single = docs.filter((d) => !multiPage.includes(d));
    this.pages = [
      ...(multiPage.length ? classifyPages(multiPage) : []),
      ...single.flatMap((d) =>
        d.pages.map(
          (p): PageClassification => ({
            file: d.file.id,
            page: p.page,
            cls: 'tile',
            sheet: 0,
            confidence: 1,
            why: `${d.file.kind.toUpperCase()} drawing — one page is the whole sheet`,
          }),
        ),
      ),
    ];
    if (this.dxfSet)
      this.pages = this.setSizes.map(
        (s): PageClassification => ({
          file: s.file,
          page: 0,
          cls: 'tile',
          sheet: 0,
          confidence: 1,
          why:
            s.from === 'placeholder'
              ? 'DXF · size unknown: map it on the sizes step'
              : `DXF · size ${s.token}, from the ${s.from === 'blocks' ? 'block names' : 'file name'}`,
        }),
      );

    // Scale candidates by kind.
    let scale: ScaleCandidate[];
    if (this.dxf) {
      scale = dxfScaleCandidates(this.dxf.read);
    } else if (docs.every((d) => d.file.kind === 'raster')) {
      scale = rasterCandidates(this.calibrations);
    } else if (docs.length > 1) {
      const set = detectScaleSet(docs);
      warnings.push(...set.warnings);
      if (!set.consistent)
        warnings.push(
          'the files of this set are printed at different scales — check the square of each file before merging',
        );
      const best = docs
        .map((d) => detectScale(d))
        .sort((a, b) => (b[0]?.confidence ?? 0) - (a[0]?.confidence ?? 0))[0];
      scale = set.consistent
        ? best
        : best.map((c) => ({ ...c, confidence: Math.min(c.confidence, 0.5) }));
    } else {
      scale = detectScale(docs[0]);
    }
    if (!scale.length)
      scale = [
        {
          method: 'none',
          factor: 1,
          measuredMm: null,
          declaredMm: null,
          evidence: null,
          confidence: 0,
        },
      ];
    this.scaleCands = scale;
    this.extractScale = scale;
    this.extractPages = this.pages;
    this.extractWarnings = warnings;
    // Cut layouts live on the instruction pages, which the sheet drops (F7 reads them): keep only
    // their text, a few kB, before the docs go.
    const tilePage = new Set(
      this.pages.filter((p) => p.cls === 'tile').map((p) => `${p.file}:${p.page}`),
    );
    this.pageTexts = docs.flatMap((d) =>
      d.pages.filter((p) => !tilePage.has(`${d.file.id}:${p.page}`)).flatMap((p) => p.texts),
    );
    return {
      files: this.files,
      pages: this.pages,
      scale,
      warnings,
      presegmented: !!this.dxf,
      calibrations: this.calibrations.length ? this.calibrations : undefined,
    };
  }

  // ── scale ─────────────────────────────────────────────────────────────────────────────────

  private async scale(
    input: StageIO['scale']['in'],
    ctx: StageCtx,
  ): Promise<StageIO['scale']['out']> {
    const d = input.decision;
    if (!(d.factor > 0) || !Number.isFinite(d.factor))
      throw new ImportError('out-of-order', `scale factor ${d.factor} is not usable`, 'scale');
    if (!this.docs && !this.dxf && !this.pages.length)
      throw new ImportError('out-of-order', 'read the files first', 'scale');
    await this.ensureClean(ctx);
    if (this.dxf) {
      // The fast path is built in the confirmed units; the docs are only re-scaled when needed.
      const { read, seg } = this.dxf;
      const scaled =
        Math.abs(d.factor - 1) < 1e-12
          ? { read, seg }
          : (() => {
              const r2: DxfRead = { doc: applyScale(read.doc, d), meta: read.meta };
              return { read: r2, seg: segmentDxf(r2) };
            })();
      this.fast = dxfFastPath(scaled.read, scaled.seg);
      if (this.dxfSet) this.fast = attributeSizes(this.fast, this.setSizes);
      ctx.progress(1, 1);
    } else {
      await this.ensureDocs(ctx);
      this.rescaleTo(d.factor);
    }
    this.decision = d;
    return { applied: d };
  }

  /** Docs at `factor` relative to the extraction (scale is linear, so it composes). */
  private rescaleTo(factor: number) {
    if (!this.docs) return;
    const rel = factor / this.docsFactor;
    if (Math.abs(rel - 1) > 1e-12)
      this.docs = this.docs.map((doc) =>
        applyScale(doc, { factor: rel, method: 'manual', operatorConfirmed: true }),
      );
    this.docsFactor = factor;
  }

  /** The docs were dropped after an assembly: read the files again and re-apply the scale. */
  private async ensureDocs(ctx: StageCtx) {
    if (this.docs) return;
    const note: Progress = (d, t, n) => ctx.progress(d, t, `re-reading · ${n ?? ''}`);
    this.docs = await this.readAll({ ...ctx, progress: note });
    this.docsFactor = 1;
    // A8: the mask is a flag on the docs — a re-read carries it again
    if (this.masks) applyMasks(this.docs, this.masks);
    if (this.decision) this.rescaleTo(this.decision.factor);
  }

  // ── clean (A8) ────────────────────────────────────────────────────────────────────────────

  /**
   * The input pages cleaned before anything is parsed (clean/): page roles, the masks of every
   * tile page as flags on the docs, the test square's scale candidate. A DXF read by its blocks
   * has nothing to clean (its blocks are the pieces). Runs on its own (no edits) when a caller
   * goes from extract straight to the scale (the probes, an old wizard).
   */
  private async clean(
    input: StageIO['clean']['in'],
    ctx: StageCtx,
  ): Promise<StageIO['clean']['out']> {
    if (!this.docs && !this.dxf && !this.extractPages.length)
      throw new ImportError('out-of-order', 'read the files first', 'clean');
    const edits = input.edits ?? [];
    this.cleanEdits = edits;
    if (this.dxf) {
      this.masks = [];
      this.offeredSrc = new Set();
      this.chromeSrc = new Set();
      this.pages = this.extractPages;
      this.scaleCands = this.extractScale;
      ctx.progress(1, 1);
      return {
        pages: this.pages.map((p) => ({ file: p.file, page: p.page, role: p.cls, items: [] })),
        dropped: [],
        classes: this.pages,
        summary: {},
        offered: {},
        scaleHints: [],
        scale: this.scaleCands,
        curveTexts: [],
        previews: [],
        notes: ['the DXF carries its pieces as blocks — nothing to clean'],
      };
    }
    // the docs at extraction scale: masks are found in page frame before any scale is applied
    await this.ensureDocs(ctx);
    if (this.docsFactor !== 1) this.rescaleTo(1);
    const docs = this.docs!;
    // Detect on the unmasked extract every time: the flags of the previous run (an operator edit
    // re-runs clean) would hide those lines from the chains and their items would vanish.
    applyMasks(docs, []);
    this.masks = null;
    const out = cleanPages(docs, this.extractPages, input, {
      checkCancel: ctx.checkCancel,
      progress: (d, t, n) => {
        ctx.checkCancel();
        ctx.progress(d, t, n);
      },
    });
    applyMasks(docs, out.pages);
    this.masks = out.pages;
    this.offeredSrc = new Set<string>();
    this.chromeSrc = new Set<string>();
    for (const m of out.pages) {
      const unapplied = m.items.filter((it) => !it.applied);
      const off = new Set(unapplied.flatMap((it) => it.paths));
      if (!off.size) continue;
      const chrome = new Set(
        unapplied.filter((it) => CHROME_KINDS.has(it.kind)).flatMap((it) => it.paths),
      );
      const pg = docs.find((d) => d.file.id === m.file)?.pages.find((p) => p.page === m.page);
      for (const p of pg?.paths ?? []) {
        if (off.has(p.id)) this.offeredSrc.add(srcKey(p.src));
        if (chrome.has(p.id)) this.chromeSrc.add(srcKey(p.src));
      }
    }
    this.pages = out.classes;
    this.scaleCands = mergeScale(this.extractScale, out.scaleHints);
    // the text of the pages set aside (cut layouts, F7) follows the roles
    const tilePage = new Set(
      this.pages.filter((p) => p.cls === 'tile').map((p) => `${p.file}:${p.page}`),
    );
    this.pageTexts = docs.flatMap((d) =>
      d.pages.filter((p) => !tilePage.has(`${d.file.id}:${p.page}`)).flatMap((p) => p.texts),
    );
    return { ...out, scale: this.scaleCands, previews: cleanPreviews(docs, out.pages) };
  }

  /** extract → scale without a clean run: clean with no edits first (D3 autos only). */
  private async ensureClean(ctx: StageCtx) {
    if (this.masks || this.dxf) return;
    await this.clean({ edits: [] }, ctx);
  }

  // ── assemble ──────────────────────────────────────────────────────────────────────────────

  private async assemble(
    input: StageIO['assemble']['in'],
    ctx: StageCtx,
  ): Promise<StageIO['assemble']['out']> {
    if (!this.decision)
      throw new ImportError('out-of-order', 'confirm the scale first', 'assemble');
    let sheet: Sheet;
    if (this.fast) {
      sheet = this.fast.sheet;
    } else {
      await this.ensureDocs(ctx);
      const docs = this.docs!;
      const tiles = this.pages.filter((p) => p.cls === 'tile' && p.sheet === input.sheet);
      if (!tiles.length)
        throw new ImportError(
          'out-of-order',
          `no pattern tiles for sheet ${input.sheet + 1} — the pages were read as cover / instructions only`,
          'assemble',
        );
      ctx.checkCancel();
      // Instruction pages carry the size run and the legend; keep their text past the docs (the
      // tile labels and copyright lines the clean stage masked are not read).
      this.docTexts = docs.flatMap((d) =>
        d.pages.flatMap((p) => p.texts.filter((t) => !t.background).map((t) => t.text)),
      );
      this.fileNames = new Map(docs.map((d) => [d.file.id, d.file.name]));
      sheet = assembleSheetDetailed(docs, this.pages, input.sheet, input.override, (d, t, n) => {
        ctx.progress(d, t, n);
      }).sheet;
      // Page geometry is no longer needed once the sheet exists (memory hygiene, see the header).
      this.docs = null;
    }
    const ext = Math.max(sheet.bbox.maxX - sheet.bbox.minX, sheet.bbox.maxY - sheet.bbox.minY);
    let clean: SheetClean | undefined;
    if (!this.fast) {
      // A8 8b: the sheet-wide pass (a watermark the tile borders cut); masked texts leave the sheet
      ctx.checkCancel();
      // the paths a page item offers (a stroke-text suggestion) are not offered again
      const items = cleanSheet(sheet, this.cleanEdits, this.offeredSrc);
      sheet = { ...sheet, texts: sheet.texts.filter((t) => !t.background) };
      const byKind = new Map<BackgroundKind, typeof sheet.paths>();
      for (const p of sheet.paths) {
        if (!p.background) continue;
        const a = byKind.get(p.background);
        if (a) a.push(p);
        else byKind.set(p.background, [p]);
      }
      const { summary } = countsOf(items);
      clean = {
        items,
        summary,
        masked: [...byKind].map(([kind, ps]) => ({
          kind,
          lines: previewOf(ps, sheet.styles, ext, PREVIEW_MASK_BUDGET),
        })),
      };
    }
    this.sheet = sheet;
    const live = clean ? sheet.paths.filter((p) => !p.background) : sheet.paths;
    return {
      sheet: sheetOnly(sheet),
      previewPaths: previewOf(live, sheet.styles, ext),
      ...(clean ? { clean } : {}),
    };
  }

  // ── chains + sizes (F3 / F5; the DXF fast path answers from its segmentation) ─────────

  private extentOf(sheet: Sheet) {
    return Math.max(sheet.bbox.maxX - sheet.bbox.minX, sheet.bbox.maxY - sheet.bbox.minY);
  }

  private chainsStage(input: StageIO['chains']['in'], ctx: StageCtx): StageIO['chains']['out'] {
    const sheet = this.sheet;
    if (!sheet) throw new ImportError('out-of-order', 'assemble the sheet first', 'chains');
    let set: ChainSet;
    if (this.fast) {
      set = this.fast.chains;
    } else {
      ctx.checkCancel();
      set = buildChainsDetailed(
        sheet,
        { ...input.opts },
        { extraTexts: this.docTexts, fileNames: this.fileNames },
        (d, t, n) => {
          ctx.checkCancel();
          ctx.progress(d, t, n);
        },
      ).set;
      // The operator's legend: role / size label per class; two size rows given one label are one
      // size (a size drawn in two looks).
      if (input.legend?.length) set = mergeSameSize(applyLegend(set, input.legend));
    }
    this.chains = set;
    return {
      classes: set.classes,
      bundles: set.bundles,
      orphans: set.orphans,
      chainPreview: chainPreviewOf(set.chains, this.extentOf(sheet)),
      warnings: set.warnings,
      ambiguities: set.ambiguities ?? [],
    };
  }

  private sizesStage(input: StageIO['sizes']['in']): StageIO['sizes']['out'] {
    if (!this.sheet || !this.chains)
      throw new ImportError('out-of-order', 'trace the lines first', 'sizes');
    const read = this.fast ? this.fast.run : detectSizeRun(this.sheet, this.chains, this.files);
    // H1: the sizes the sheet draws decide the run the pieces are ranked in
    this.expected = expectedSizes(read, input.drawnSizes, this.chains);
    const run = runForExpected(read, this.expected);
    let map = proposeCardSizeMap(run, input.card);
    if (this.dxfSet) map = reviewPlaceholderSizes(map, this.setSizes, input.card);
    if (input.operatorMap?.length) map = applyOperatorMap(map, input.operatorMap, input.card);
    this.run = run;
    this.sizeMap = map;
    return { run, map, expected: this.expected, countAsk: this.countAsk(read) };
  }

  /**
   * D1: the sizes step asks "sizes drawn on this sheet" unless the source states it. A DXF's blocks
   * are its pieces, so there it is asked only for blocks drawn as outline + sew line alike (they
   * close only as one size). The lines' own suggestion is computed once per chain set.
   */
  private inferred: { set: ChainSet; v: SizeCountAsk['inferred'] } | null = null;
  private countAsk(read: SizeRun): SizeCountAsk | null {
    if (expectedSizes(read, null, this.chains ?? undefined)?.from === 'source') return null;
    if (
      this.fast &&
      !this.fast.families.some((f) => f.candidates.some((c) => (c as DxfPieceCandidate).oneSize))
    )
      return null;
    const set = this.chains;
    if (!set || !this.sheet) return { inferred: null };
    if (this.inferred?.set !== set) this.inferred = { set, v: inferDrawnSizes(this.sheet, set) };
    return { inferred: this.inferred.v };
  }

  // ── pieces (F4; the DXF fast path answers from its segmentation) ─────────────────────────

  private piecesStage(input: StageIO['pieces']['in'], ctx: StageCtx): StageIO['pieces']['out'] {
    const sheet = this.sheet;
    if (!sheet) throw new ImportError('out-of-order', 'assemble the sheet first', 'pieces');
    if (this.fast) {
      if (input.edits.length || input.seeds?.some((s) => s.origin === 'click'))
        throw new ImportError(
          'out-of-order',
          'the pieces of a DXF are its blocks — they are not re-seeded or edited here',
          'pieces',
        );
      // H1c-4: a block read as outline + sew line alike stays refused unless one size is drawn
      // (the source names it, or the operator answered 1 on the sizes step)
      const oneSize = this.expected?.n === 1;
      // F8 keeps the DXF's own features on `dxf.features`; the contract field is
      // `PieceCandidate.features` — copy them across so every reader finds them in one place.
      const families = this.fast.families.map((f) => ({
        ...f,
        candidates: f.candidates.map((c0) => {
          const c = settleSeamPair(c0 as DxfPieceCandidate, oneSize);
          const dx = (
            c as typeof c & { dxf?: { features?: PieceFamily['candidates'][number]['features'] } }
          ).dxf;
          return dx?.features && !c.features ? { ...c, features: dx.features } : c;
        }),
      }));
      this.seeds = this.fast.seeds;
      this.families = families;
      this.run = this.run ?? this.fast.run;
      this.wallSet = this.fast.chains;
      return { seeds: this.fast.seeds, families };
    }
    const base = this.chains;
    if (!base) throw new ImportError('out-of-order', 'trace the lines first', 'pieces');
    const run = this.run ?? detectSizeRun(sheet, base, this.files);
    this.run = run;
    // H1: the fill must know how many sizes the sheet draws — the wizard passes the sizes step's
    // answer; without it, the session's own (sizes stage), else what the source alone says
    const expected =
      input.opts.expectedSizes ?? this.expected ?? expectedSizes(run, null, base) ?? undefined;
    const opts: FillOpts = expected ? { ...input.opts, expectedSizes: expected } : input.opts;
    const seeds = input.seeds ?? (this.textSeeds ??= proposeSeeds(sheet, base));
    // "Not a piece" on a seed that is junk — its region never closed on its own (it leaked, or
    // shared another seed's region), or it sits inside another piece's outline — takes it out of
    // the FILL, not only out of the result: such a seed makes its neighbour "merged", drops
    // frame-like walls around it and splits it by cells (BLAZER's page numbers answered "not a
    // piece" still moved the front's outline). A seed that closed a region of its own stays as a
    // separator: the touching piece beside it (Redcafe's sleeve beside the front) must not grow
    // into it.
    const prevFams = this.pieceSession?.families ?? [];
    const separator = (seed: number) => {
      const f = prevFams.find((x) => x.seed === seed);
      const at = seeds.find((x) => x.id === seed)?.at;
      if (!f || !at || !f.candidates.length) return false;
      if (!f.candidates.every((c) => c.outcome === 'closed')) return false;
      return !prevFams.some(
        (o) =>
          o.seed !== seed &&
          o.candidates.some((c) => c.outer.length > 2 && pointInPoly(at, c.outer)),
      );
    };
    const notPiece = new Set(
      input.edits.flatMap((e) => (e.kind === 'not-a-piece' && !separator(e.seed) ? [e.seed] : [])),
    );
    const fillSeeds = notPiece.size ? seeds.filter((s) => !notPiece.has(s.id)) : seeds;
    // Wall edits (close gap / ignore line / use line) go through the F4b session: appended ones
    // refill only the seeds they reach; an undo, new seeds or another variant fill afresh with
    // every wall edit so far. The other edits (not a piece, reseed, merge, split) apply after, on
    // the session's families, keeping the operator's walls.
    const wallEdits = input.edits.filter(isWallEdit);
    const key = JSON.stringify([
      fillSeeds.map((x) => [x.id, x.at.x, x.at.y, x.variant, x.origin]),
      opts,
    ]);
    const prev = this.pieceSession;
    const prior = this.pieceWallEdits;
    const appended =
      !!prev &&
      prev.set === base &&
      prev.run === run &&
      this.pieceKey === key &&
      prior.length <= wallEdits.length &&
      prior.every((e, i) => JSON.stringify(e) === JSON.stringify(wallEdits[i]));
    ctx.checkCancel();
    let ps: PieceSession;
    if (appended) {
      ps = applyWallEdits(prev!, wallEdits.slice(prior.length));
    } else {
      const empty: PieceSession = {
        sheet,
        set: base,
        run,
        seeds: fillSeeds,
        opts: opts,
        walls: { exclude: [], include: [], bridges: [] },
        families: [],
      };
      ps = startSession(
        sheet,
        base,
        run,
        fillSeeds,
        opts,
        wallEditsInto(empty, wallEdits).walls,
        (d, t, n) => {
          ctx.checkCancel();
          ctx.progress(d, t, n);
        },
      );
    }
    this.pieceSession = ps;
    this.pieceWallEdits = wallEdits;
    this.pieceKey = key;
    const set = base;
    let families = ps.families;
    const edits = input.edits.filter((e) => !isWallEdit(e));
    if (edits.length)
      families = applyPieceEdits(families, edits, {
        sheet,
        set,
        run,
        opts,
        walls: ps.walls,
      });
    this.wallSet = set;
    this.seeds = seeds;
    this.families = families;
    const variants = variantLabels([...sheet.texts.map((t) => t.text), ...this.docTexts]);
    // H1: what the size solver could not decide reaches the wizard (a refill keeps the last full
    // fill's answer: the solver reads the whole sheet either way)
    if (!appended) this.gradeAmbiguities = ps.diag?.grade?.ambiguities ?? [];
    else if (ps.diag?.grade) this.gradeAmbiguities = ps.diag.grade.ambiguities;
    return {
      seeds,
      families,
      variants,
      grade: { expected: expected ?? null, ambiguities: this.gradeAmbiguities },
    };
  }

  // ── semantics (F5) ────────────────────────────────────────────────────────────────────────

  private semanticsStage(
    input: StageIO['semantics']['in'],
    ctx: StageCtx,
  ): StageIO['semantics']['out'] {
    const sheet = this.sheet;
    const set = this.wallSet ?? this.chains;
    if (!sheet || !set || !this.families || !this.run)
      throw new ImportError('out-of-order', 'find the pieces first', 'semantics');
    if (!this.sizeMap)
      throw new ImportError('out-of-order', 'map the sizes to the card first', 'semantics');
    // Nobody decided the file's allowance yet: what the sheet says (text in 9 languages, or the gap
    // between two nested loops) beats the owner default. The decision rides on every spec.
    const fileAllowance =
      input.fileAllowance.origin === 'default'
        ? (() => {
            const found = detectAllowance(sheet, this.families!, set);
            if (found.origin !== 'default') return found;
            // the statement is often on an instruction page, not on the sheet itself
            const t = allowanceFromTexts(this.docTexts);
            if (t.decision) return t.decision;
            // per-piece / per-edge sentences only (FLY M3): shown as context, the outline is
            // still asked (origin stays 'default')
            const ctx = t.context.length
              ? [pieceOnlyEvidence(t.context)]
              : found.evidence.filter((e) => /only for some pieces/.test(e));
            return ctx.length ? { ...input.fileAllowance, evidence: ctx } : input.fileAllowance;
          })()
        : input.fileAllowance;
    const detail = buildPieceSpecsDetailed(
      {
        sheet,
        set,
        run: this.run,
        sizeMap: this.sizeMap,
        families: this.families,
        ...input,
        fileAllowance,
        traced: this.traced(),
        docTexts: this.docTexts,
        // the text label of each text seed: the cutting list binds its entries to them (S5)
        seedLabels: Object.fromEntries(
          (this.seeds ?? []).flatMap((sd) =>
            sd.origin === 'text' && sd.text ? [[sd.id, sd.text.text.trim()]] : [],
          ),
        ),
      },
      (d, t, n) => ctx.progress(d, t, n),
    );
    this.semantics = detail.output;
    this.wallsOf = detail.wallsOf;
    this.derivedOf = detail.derivedOf;
    return detail.output;
  }

  /** Traced pages in the run (F11): their outlines are cleaned before any offset (E3). */
  private traced(): boolean {
    return this.files.some((f) => f.kind === 'raster') || this.calibrations.length > 0;
  }

  // ── render-som (F10) ──────────────────────────────────────────────────────────────────────

  private async renderSomStage(
    input: StageIO['render-som']['in'],
  ): Promise<StageIO['render-som']['out']> {
    if (!this.sheet || !this.families || !this.seeds)
      throw new ImportError('out-of-order', 'find the pieces first', 'render-som');
    const out = await renderSom(this.sheet, this.families, this.seeds, input.dpi, {
      only: input.seeds.length ? input.seeds : undefined,
    });
    this.blobs.set('som:sheet', out.sheetPng);
    return out;
  }

  // ── fabrics (F7) ──────────────────────────────────────────────────────────────────────────

  private fabricsStage(input: StageIO['fabrics']['in']): StageIO['fabrics']['out'] {
    if (!this.sheet || !this.families)
      throw new ImportError('out-of-order', 'find the pieces first', 'fabrics');
    return proposeFabricsDetailed({
      texts: this.sheet.texts,
      families: this.families,
      seeds: this.seeds ?? undefined,
      bom: input.bom,
      pageTexts: this.pageTexts,
      aiHints: input.aiHints,
      identities: this.semantics?.pieces.map((p) => ({ seed: p.seed, identity: p.identity })),
    }).assignment;
  }

  // ── write + gate (F6) ─────────────────────────────────────────────────────────────────────

  private async write(
    input: StageIO['write']['in'],
    ctx: StageCtx,
  ): Promise<StageIO['write']['out']> {
    const sem = this.semantics;
    if (!sem) throw new ImportError('out-of-order', 'piece details have not been built', 'write');
    const raster = this.files.some((f) => f.kind === 'raster');
    const source: ManifestSource = {
      files: this.files.map((f) => ({
        name: f.name,
        sha256: f.sha256,
        bytes: f.bytes,
        kind: f.kind,
        pages: f.pages,
      })),
      scale: {
        method: this.decision?.method ?? 'none',
        factor: this.decision?.factor ?? 1,
        measuredMm: this.scaleCands[0]?.measuredMm ?? null,
        declaredMm: this.scaleCands[0]?.declaredMm ?? null,
      },
      sheet: {
        pages: this.sheet?.poses.length ?? 0,
        method:
          (this.sheet?.poses.length ?? 0) <= 1
            ? 'single'
            : this.sheet?.pairs[0]?.method ?? 'single',
        maxResidualMm: Math.max(0, ...(this.sheet?.poses.map((p) => p.residualMm) ?? [0])),
      },
      sizeEncoding: this.run?.encoding ?? 'single',
      variant: sem.pieces.find((p) => p.variant)?.variant ?? null,
    };
    // One file per fabric scope (F7 `planScopes`): lining copies renamed LIN_…, `fabrics` = the
    // scope. Walls come from F5's own map (unfolded halves mirrored, a derived `_R` mirrored) — the
    // write stage's earlier chain lookup dropped the closing edge of closed walls (F5 report).
    const plan = planScopes(sem.pieces, input.assignment, input.scopes);
    if (plan.problems.length)
      throw new ImportError('out-of-order', plan.problems[0].message, 'write');
    // The walls each WRITTEN identity × rank came from, in its own frame (F5): a closed wall keeps
    // its closing edge, an unfolded piece and a derived `_R` get their mirrored walls. G3 asks how
    // much of the walls the written line follows; a PDF wall chain runs on past the piece, so each
    // is cut to the junction-to-junction segments this piece uses — junctions from the source
    // chains' own topology, never trimmed by the output (walls-used.ts, M7). A DXF's walls are its
    // own blocks.
    const rawWalls = this.wallsOf;
    const derived = this.derivedOf;
    const specOf = new Map(sem.pieces.map((p) => [p.identity, p]));
    // The fill's snapped outline votes which segments are this piece's — only where it is in the
    // spec's frame: the first identity of a seed (a derived `_R` is mirrored), not unfolded.
    const drawnOfSeed = new Map<number, string>();
    for (const p of sem.pieces) if (!drawnOfSeed.has(p.seed)) drawnOfSeed.set(p.seed, p.identity);
    const famBySeed = new Map((this.families ?? []).map((f) => [f.seed, f]));
    const traced = this.traced();
    const wallsUsed = rawWalls
      ? (identity: string, rank: number): PtMm[][] | undefined => {
          const w = rawWalls(identity, rank);
          const spec = specOf.get(identity);
          const size = spec?.sizes.find((z) => z.rank === rank) ?? spec?.sizes[0];
          if (!w || !spec || !size || this.fast) return w;
          const written = spec.allowance.meaning === 'seam' ? size.seam : size.cut;
          // A traced outline was cleaned before it was written (spurs, twin-trace slivers out, E3):
          // the fill's raw outline would vote in the spur and sliver segments the written line
          // rightly leaves, so on a scan the written line votes — still whole junction-to-junction
          // segments only, never a trim (walls-used.ts).
          const outline =
            !traced && !spec.unfoldedFold && drawnOfSeed.get(spec.seed) === identity
              ? famBySeed.get(spec.seed)?.candidates.find((c) => c.rank === size.rank)?.outer
              : undefined;
          return wallsUsedBy(w, outline && overlaps(outline, w) ? outline : written);
        }
      : null;
    const sizeTokens = new Set(input.sizes.map((s) => s.token.toLowerCase()));
    // E1a: an open fold question blocks every file of the run (the piece is not written at all)
    const openFolds = [
      ...sem.blocked.filter((b) => b.reason === 'fold-question').map((b) => b.detail),
      ...(sem.foldList
        ? [
            `the cutting list names pieces cut on fold that no piece on the sheet matches: ${sem.foldList.entries.join('; ')}`,
          ]
        : []),
    ];
    // A8b (G19): the sheet's tile chrome — masked frames, marks, tile labels, and the chrome the
    // clean stage only offered — in the walls' frame
    const chrome =
      this.sheet && !this.fast
        ? this.sheet.paths
            .filter((p) =>
              p.background ? CHROME_KINDS.has(p.background) : this.chromeSrc.has(srcKey(p.src)),
            )
            .map((p) => (p.closed && p.pts.length > 2 ? [...p.pts, p.pts[0]] : p.pts))
        : [];
    const scopes: DraftScope[] = [];
    const gate: Record<string, GateReport> = {};
    let k = 0;
    for (const sp of plan.scopes) {
      ctx.checkCancel();
      const scope = sp.target;
      ctx.progress(k++, plan.scopes.length, scope.label);
      const res = await writeAndGate(
        {
          techCardId: input.techCardId,
          scope,
          pieces: sp.specs,
          sizes: input.sizes,
          source,
          generator: input.generator,
          dialect: input.dialect,
        },
        {
          rules: cardRules,
          sizeTokens,
          wallsOf: rawWalls ? (id, rank) => rawWalls(sp.sourceOf[id] ?? id, rank) : undefined,
          wallsUsedOf: wallsUsed ? (id, rank) => wallsUsed(sp.sourceOf[id] ?? id, rank) : undefined,
          derivedOf: derived ? (id, rank) => derived(sp.sourceOf[id] ?? id, rank) : undefined,
          chrome,
          openFolds,
          hausdorffP95Mm: raster ? PATIMPORT.hausdorffP95RasterMm : PATIMPORT.hausdorffP95VectorMm,
        },
      );
      const base = (this.files[0]?.name ?? 'pattern').replace(/\.[^.]+$/, '');
      scopes.push({
        target: scope,
        filename: `${base}-${purposeWord(scope)}.dxf`,
        name: '',
        dxfText: res.dxfText,
        manifest: res.detail.manifest,
        identities: [...new Set(res.detail.plan.blocks.map((b) => b.identity))],
      });
      gate[scope.scopeKey] = res.report;
    }
    ctx.progress(plan.scopes.length, plan.scopes.length);
    return { scopes, gate };
  }
}

/** Bounding boxes of a line and a set of walls overlap (a sanity check that both share a frame). */
function overlaps(line: readonly PtMm[], walls: readonly PtMm[][]): boolean {
  let a = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const p of line)
    a = {
      x0: Math.min(a.x0, p.x),
      y0: Math.min(a.y0, p.y),
      x1: Math.max(a.x1, p.x),
      y1: Math.max(a.y1, p.y),
    };
  let b = { ...a, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const w of walls)
    for (const p of w)
      b = {
        x0: Math.min(b.x0, p.x),
        y0: Math.min(b.y0, p.y),
        x1: Math.max(b.x1, p.x),
        y1: Math.max(b.y1, p.y),
      };
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
}

/**
 * Scans carry their correction on every page already (F11 calibrate, affine to the test square or
 * inherited). The scale step reports it; the factor left to apply is 1.
 */
function rasterCandidates(calibs: Calib[]): ScaleCandidate[] {
  const sq = calibs.find((c) => c.calibration.method === 'test-square' && c.calibration.square);
  if (!sq)
    return [
      {
        method: 'none',
        factor: 1,
        measuredMm: null,
        declaredMm: null,
        evidence: null,
        confidence: 0,
      },
    ];
  const s = sq.calibration.square!;
  const xs = s.cornersMm.map((p) => p.x);
  const ys = s.cornersMm.map((p) => p.y);
  return [
    {
      method: 'test-square',
      factor: 1,
      measuredMm: s.sideMm,
      declaredMm: s.sideMm,
      evidence: {
        page: sq.page,
        bbox: {
          minX: Math.min(...xs),
          minY: Math.min(...ys),
          maxX: Math.max(...xs),
          maxY: Math.max(...ys),
        },
        text: `scan, corrected per page (traced ${s.measuredWMm.toFixed(2)} × ${s.measuredHMm.toFixed(2)})`,
      },
      confidence: sq.calibration.confidence,
    },
  ];
}

export { cancelled };
