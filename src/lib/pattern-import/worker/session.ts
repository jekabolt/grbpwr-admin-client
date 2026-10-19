// One import session = one wizard run (08-CONTRACT §4.1). The session owns the heavy artifacts —
// file bytes (blob store), the extracted docs, the assembled sheet, the DXF fast path, the stage
// outputs — and every stage reads them implicitly. Re-running a stage drops everything after it.
//
// Memory: the page geometry of the docs is the largest thing a session holds (F2 measured
// polupalto at 777 MB RSS in node with docs + sheet alive). Once a sheet is assembled the docs are
// dropped; the file bytes stay in the blob store (Blob, not a JS ArrayBuffer), so re-assembling a
// different sheet or with a hand grid re-reads them (seconds) instead of keeping them (hundreds MB).
import type {
  AllowanceDecision,
  BackgroundKind,
  ChainAmbiguity,
  ChromeLine,
  CleanPreview,
  ChainSet,
  DraftRul,
  GradeAsk,
  RulRefusal,
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
  SeedId,
  SemanticsOutput,
  SetAside,
  Sheet,
  SizeMap,
  ExpectedSizes,
  FillOpts,
  SizeCountAsk,
  SizeRun,
  SourceDoc,
  SheetClean,
  SheetAnswer,
  SheetCover,
  SheetPieces,
  SourceFileInfo,
  StageIO,
  StageName,
} from '../types';
import { MODELS_MAX, PATIMPORT } from '../types';
import type { GarmentPassport } from '../passport/types';
import {
  bindPassport,
  passportDigest,
  passportSourceDigest,
  readPassport,
  type BindPiece,
} from '../passport';
import {
  applyScale,
  detectScale,
  detectScaleSet,
  extractPdfWith,
  isOversizedScan,
} from '../adapters/pdf';
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
  isUnsupportedFormat,
  type ExtractorRegistry,
} from '../adapters/sniff';
import { assembleAllSheets, classifyPages } from '../assemble';
import {
  applyMasks,
  cleanPages,
  cleanSheet,
  countsOf,
  keptByOperator,
  mergeScale,
  srcKey,
} from '../clean';
import { renderPagePng, renderSom } from '../ai/som';
import { pageChains } from '../clean/page-chains';
import { marksOn, pageStats } from '../clean/page-roles';
import { writeAndGate } from '../gate';
import { writeR12 } from '../write/r12';
import type { PlannedBlock } from '../write/plan';
import { expandRul, looksLikeRul, packRul, parseRul, zipRulPair } from '../adapters/rul';
import { equalizeForRul } from '../adapters/rul/correspond';
import { rulSizesMismatch } from '../adapters/rul/settle';
import { applyLegend, buildChainsDetailed, confirmRows, mergeSameSize, splitRows } from '../chains';
import { layerLoopAsides } from '../chains/layer-role';
import { gradeView, sourceClash } from '../chains/face-role';
import { withClassSigs } from '../chains/legend';
import { assignChains, lineKeys } from '../chains/assign';
import { lineSuspects, sizeOutlines } from '../chains/nests';
import { detectSizeRun } from '../sizes';
import {
  blobShapes,
  countEvidence,
  labelSingleRun,
  shapeCandidates,
  sheetFeed,
} from '../sizes/count-evidence';
import { expectedSizes, inferDrawnSizes, runForExpected } from '../pieces/grade/expected';
import {
  applyOperatorMap,
  createProposeSizeMap,
  defaultTokensOf,
  markNotDrawn,
} from '../sizes/map';
import { fileSizeLabel } from '../sizes/recover';
import {
  applyPieceEdits,
  applyWallEdits,
  isWallEdit,
  pageLabels,
  proposeSeeds,
  startSession,
  variantLabels,
  variantMarksOut,
  pieceClaims,
  markLabels,
  modelKey,
  wallEditsInto,
  type PieceSession,
  type WallPieceEdit,
} from '../pieces';
import { pointInPoly } from '../pieces/geom';
import { asidesOf, blobOf, faceMap, faceSeedsOf, type FaceMap } from '../pieces/faces';
import { dartLegsDrawn, provenDarts } from '../pieces/darts';
import { codeTextSeeds } from '../pieces/seeds';
import { exceptNested } from '../pieces/fill';
import { cleanNotchMarks } from '../pieces/notch-marks';
import { sheetModule, undrawnRanks } from '../pieces/walls';
import { sheetCoverOf, sheetLegend, sheetPieces } from '../pieces/sheets';
import { tileSheetIds } from '../assemble';
import { chainView, joinSheetChains, partAt, sheetView } from '../assemble/composite';
import { acceptMissing, missingEvidence } from '../assemble/holes';
import { holeChainEnds, holeGuard } from '../pieces/holes';
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
import { legendSwatches } from '../chains/swatch';
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
/** P2: DXF dialects whose numbered layers are AAMA/ASTM layers (adapters/dxf detectDialect). */
const AAMA_DIALECTS = new Set(['grbpwr', 'clo-r2000', 'clo-aama-r12', 'clo-aama-gerber', 'aama']);

const sheetOnly = (s: Sheet): StageIO['assemble']['out']['sheet'] => {
  const { paths: _p, texts: _t, rasters: _r, styles: _s, ...rest } = s;
  return rest;
};

/** A2: the sheet's closed faces for one chain set and size-run shape (face seeds, click placement). */
type FacesEntry = {
  set: ChainSet;
  /** `facesKey`: the run's shape and the raster cell. */
  key: string;
  map: FaceMap;
  seeds: Seed[];
  /** Text seeds held back in junk (a "10" in the test square), and every outline set aside. */
  held: Set<SeedId>;
  asides: SetAside[];
};

/** What the face walls depend on: encoding, ranks, classes, files — and labels once two or more. */
const facesKey = (run: SizeRun, cellMm: number | undefined) =>
  [
    run.encoding,
    cellMm ?? '',
    ...run.sizes.map(
      (z) => `${z.rank}/${z.classId}/${z.file}${run.sizes.length > 1 ? `/${z.label}` : ''}`,
    ),
  ].join('|');

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
  /** A9: the tile chrome per file the last clean run found (the page stats test a page against). */
  private tileMarks: NonNullable<StageIO['clean']['out']['tileMarks']> = [];
  private cleanEdits: PageMaskEdit[] = [];
  /** Sources (`srcKey`) of the paths page items offer but do not apply (8b does not offer them twice). */
  private offeredSrc = new Set<string>();
  /** A8b: sources of the tile chrome page items offer but do not apply (G19 measures against them). */
  private chromeSrc = new Map<string, BackgroundKind>();
  /** A0.3: sheet path ids the sheet pass (8b) offers and the operator did not take. */
  private sheetOffered = new Set<number>();
  /** D6: the last pieces run's cross-sheet reading and the answers it was given (G23). */
  private sheetRead: SheetPieces | null = null;
  private sheetAnswers: Record<string, SheetAnswer> = {};
  private scaleCands: ScaleCandidate[] = [];
  private extractWarnings: string[] = [];
  private dxf: { read: DxfRead; seg: DxfSegmentation } | null = null;
  /** Several DXF files, one per size (owner decision 5): merged into one drawing by the first read
   * (R4: in the cancellable read stage, never at open), kept for the rereads. */
  private isDxfSet = false;
  private dxfSet: DxfSet | null = null;
  /** The set's sizes as the reader saw them in the merged drawing (`settleDxfSet`). */
  private setSizes: DxfSetSize[] = [];
  /**
   * RUL: the grade rule table dropped (or zipped) with a base-size DXF. The read stage grades the
   * DXF into every size of the table (`expandRul`) and reads THAT drawing; the run is a DXF run.
   */
  private rul: { name: string; bytes: number; sha256: string } | null = null;
  // scale
  private decision: ScaleDecision | null = null;
  private fast: DxfFastPath | null = null;
  // assemble
  private sheet: Sheet | null = null;
  /** Every page's text and the file names, kept past the docs: the legend reads size runs there. */
  private docTexts: string[] = [];
  /** `docTexts` with the file each was printed in (A6: only the selected sheet's files count). */
  private docTextSrc: { file: FileId; page: PageIndex; text: string }[] = [];
  private fileNames = new Map<string, string>();
  /** P2: a file of the sheet is an AAMA/CLO DXF (its numbered layers are AAMA layers). */
  private aamaLayers = false;
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
  /** NAP: the text seeds that read as fragments of a printed code (seeds.ts codeTextSeeds). */
  private codeHeld: { seeds: Seed[]; v: Map<SeedId, string> } | null = null;
  /** A2: the sheet's closed faces for this chain set and size run (face seeds, click placement). */
  private faces: FacesEntry | null = null;
  /**
   * A6: the faces the sizes stage read the nest evidence off — kept across sizes re-runs (a size
   * map click) for this chain set; the pieces stage adopts them when its run has the same shape.
   */
  private sizeFaces: FacesEntry | null = null;
  private seeds: Seed[] | null = null;
  private families: PieceFamily[] | null = null;
  /**
   * VARIANTS: seeds a certain 'piece' mark tied to one model, by position (read on the run without
   * a model; a model run then fills without the other model's pieces) — and that uncut fill.
   */
  private modelClaims = new Map<SeedId, { label: string; piece: string; evidence: string }>();
  /** The model the last pieces run was filled for (null = none chosen). */
  private pieceVariant: string | null = null;
  /** DARTS: the outlines the pieces stage set aside (the proven darts are read off them). */
  private setAside: SetAside[] = [];
  private semantics: SemanticsOutput | null = null;
  /** PASSPORT Ф1: what the document says (extract), and the same bound to the pieces (semantics). */
  private passport: GarmentPassport | null = null;
  private passportBound: GarmentPassport | null = null;
  /** Source walls per written identity × rank (F5) — what the gate measures the cut line against. */
  private wallsOf: SemanticsDetail['wallsOf'] | null = null;
  /** The outlines' derived edges per written identity × rank (F14b): gate G15, never walls. */
  private derivedOf: SemanticsDetail['derivedOf'] | null = null;
  private notchChordsOf: SemanticsDetail['notchChordsOf'] | null = null;
  private continuityOf: SemanticsDetail['continuityOf'] | null = null;
  private identityOf: SemanticsDetail['identityOf'] | null = null;
  private onePieceOf: SemanticsDetail['onePieceOf'] | null = null;
  private gradeOf: SemanticsDetail['gradeOf'] | null = null;
  /** Text of the pages that are not pattern tiles (instructions, cover, overview): cut layouts (F7). */
  private pageTexts: IRText[] = [];

  /** sha256 per file id, computed once when the bytes are first read (provenance, error report). */
  private sha = new Map<string, string>();

  constructor(id: number, input: { name: string; bytes: ArrayBuffer }[]) {
    let files = input;
    this.id = id;
    if (!files.length) throw new ImportError('out-of-order', 'no files given');
    // M6: the main thread checked the File sizes already; the worker re-checks what it received.
    const refusal = checkInputSet(files.map((f) => ({ name: f.name, bytes: f.bytes.byteLength })));
    if (refusal) throw new ImportError(refusal.code, refusal.message);
    // RUL: one base DXF + one text grade rule table (two files, or one ZIP holding exactly those)
    let rulFile: { name: string; bytes: ArrayBuffer } | null = null;
    if (files.length === 1) {
      let pair: ReturnType<typeof zipRulPair> = null;
      try {
        pair = zipRulPair(files[0].bytes);
      } catch (e) {
        throw new ImportError(
          'unsupported-format',
          `${files[0].name}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      if (pair) files = [pair.dxf, pair.rul];
    }
    const ruls = files.filter((f) => looksLikeRul(f.bytes));
    if (ruls.length) {
      const rest = files.filter((f) => !ruls.includes(f));
      if (ruls.length > 1)
        throw new ImportError(
          'unsupported-format',
          `${ruls.map((f) => f.name).join(', ')}: ${new UnsupportedFormat('rul-alone', 'one grade rule table grades one base DXF').message}`,
        );
      const dxfOnly = rest.length === 1 && sniffFormat(rest[0].bytes, rest[0].name).route === 'dxf';
      if (!dxfOnly)
        throw new ImportError(
          'unsupported-format',
          `${ruls[0].name}: ${
            new UnsupportedFormat(
              'rul-alone',
              rest.length ? `dropped with ${rest.map((f) => f.name).join(', ')}` : 'dropped alone',
            ).message
          }`,
        );
      rulFile = ruls[0];
      files = rest;
    }
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
    if (rulFile) {
      this.blobs.set('rul', new Blob([rulFile.bytes]));
      this.rul = { name: rulFile.name, bytes: rulFile.bytes.byteLength, sha256: '' };
    }
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
      this.chromeSrc = new Map();
    }
    if (at < ORDER.indexOf('scale')) {
      this.decision = null;
      this.fast = null;
    }
    if (at < ORDER.indexOf('assemble')) this.sheet = null;
    if (at < ORDER.indexOf('chains')) {
      this.chains = null;
      this.textSeeds = null;
      this.sizeFaces = null;
      this.countEv = null;
    }
    if (at < ORDER.indexOf('sizes')) {
      this.run = null;
      this.sizeMap = null;
      this.expected = null;
    }
    if (at < ORDER.indexOf('pieces')) {
      this.seeds = null;
      this.faces = null;
      this.families = null;
      this.setAside = [];
      this.wallSet = null;
      this.pieceSession = null;
      this.pieceWallEdits = [];
      this.sheetRead = null;
      this.sheetAnswers = {};
      this.pieceKey = '';
      this.modelClaims = new Map();
      this.pieceVariant = null;
    }
    if (at < ORDER.indexOf('semantics')) {
      this.semantics = null;
      this.wallsOf = null;
      this.derivedOf = null;
      this.notchChordsOf = null;
      this.continuityOf = null;
      this.identityOf = null;
      this.onePieceOf = null;
      this.gradeOf = null;
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
        case 'render-pages':
          return this.renderPagesStage(input as StageIO['render-pages']['in'], ctx);
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
        // RASTER: a PDF whose only content is images over the pixel limit (pdf.js drops them, the
        // vector read refuses it) is a scan too — the raster adapter reads them in rows.
        pdf: async (f, o, p) => {
          let doc: SourceDoc | null = null;
          try {
            doc = await extractPdfWith(f, o, p);
          } catch (e) {
            if (!isOversizedScan(e)) throw e;
          }
          const scans = doc ? doc.pages.filter(isScanPage).length : 1;
          if (doc && (!scans || scans < Math.ceil(doc.pages.length / 2))) return doc;
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
          const graded = this.rul ? await this.gradeByRul(f) : null;
          const read = await readDxf(graded ? { ...f, bytes: graded.bytes } : f, o, p);
          const seg = segmentDxf(read);
          if (graded) {
            const off = rulSizesMismatch(graded.sizes, seg, graded.blocks);
            if (off)
              throw new ImportError(
                'unsupported-format',
                `${this.rul!.name} + ${f.name}: ${new UnsupportedFormat('rul-invalid', off).message}`,
              );
            read.doc.warnings.unshift(...graded.warnings);
          }
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
   * RUL: the base DXF graded into every size of its rule table — one per-size drawing, as a graded
   * CAD export draws it (`expandRul`). A malformed table, a rule the table lacks, a rule text at no
   * point… refuse the whole run (`rul-invalid`): never a partial grade.
   */
  private async gradeByRul(f: {
    name: string;
    bytes: ArrayBuffer;
  }): Promise<{ bytes: ArrayBuffer; sizes: string[]; blocks: string[]; warnings: string[] }> {
    const meta = this.rul!;
    const blob = this.blobs.get('rul');
    if (!blob) throw new ImportError('no-session', 'the session lost its files — read them again');
    const bytes = await blob.arrayBuffer();
    if (!meta.sha256) meta.sha256 = await sha256Hex(bytes);
    try {
      const table = parseRul(bytes, meta.name);
      const ex = expandRul({ dxf: f.bytes, dxfName: f.name, rul: table, rulName: meta.name });
      return {
        bytes: new TextEncoder().encode(ex.text).buffer as ArrayBuffer,
        sizes: ex.sizes,
        blocks: ex.blocks,
        warnings: [
          `graded by ${meta.name}: ${ex.stats.pieces} pieces × ${ex.sizes.length} sizes (${ex.sizes.join(' ')}), sample ${ex.sample}, ${ex.stats.rulesUsed} rules`,
          ...ex.warnings,
        ],
      };
    } catch (e) {
      if (isUnsupportedFormat(e))
        throw new ImportError('unsupported-format', `${meta.name} + ${f.name}: ${e.message}`);
      throw e;
    }
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
    // A10: what each page prints that tells the sheets apart (models, a sheet letter) — the
    // autopilot matches the card against it before a sheet is assembled
    if (multiPage.length) {
      const textOf = new Map(
        multiPage.flatMap((d) =>
          d.pages.map((p) => [`${d.file.id}:${p.page}`, p.texts.map((t) => t.text)] as const),
        ),
      );
      this.pages = this.pages.map((c) => {
        const l = pageLabels(textOf.get(`${c.file}:${c.page}`) ?? []);
        return l.models || l.sheets ? { ...c, labels: l } : c;
      });
    }
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
    // PASSPORT Ф1: one pass over every page and layer name — evidence, never a failure of the read
    this.passport = null;
    this.passportBound = null;
    try {
      this.passport = readPassport(docs, {
        sourceDigest: await passportSourceDigest(this.files.map((f) => f.sha256)),
      });
    } catch (e) {
      warnings.push(`the document's passport could not be read: ${String(e).slice(0, 120)}`);
    }
    return {
      files: this.files,
      pages: this.pages,
      scale,
      warnings,
      presegmented: !!this.dxf,
      calibrations: this.calibrations.length ? this.calibrations : undefined,
      ...(this.passport ? { passport: this.passport } : {}),
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
      this.chromeSrc = new Map();
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
    this.tileMarks = out.tileMarks ?? [];
    this.offeredSrc = new Set<string>();
    this.chromeSrc = new Map<string, BackgroundKind>();
    for (const m of out.pages) {
      const unapplied = m.items.filter((it) => !it.applied);
      const off = new Set(unapplied.flatMap((it) => it.paths));
      if (!off.size) continue;
      // the chrome offered and not refused: what the operator explicitly kept is out of G19
      const chrome = new Map<number, BackgroundKind>(
        unapplied
          .filter(
            (it) =>
              CHROME_KINDS.has(it.kind) && !keptByOperator(it, m.file, m.page, this.cleanEdits),
          )
          .flatMap((it) => it.paths.map((id) => [id, it.kind] as const)),
      );
      const pg = docs.find((d) => d.file.id === m.file)?.pages.find((p) => p.page === m.page);
      for (const p of pg?.paths ?? []) {
        if (off.has(p.id)) this.offeredSrc.add(srcKey(p.src));
        const kind = chrome.get(p.id);
        if (kind) this.chromeSrc.set(srcKey(p.src), kind);
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
      // D6: one file is one garment — every tile sheet goes into the drawing, side by side
      const tiles = this.pages.filter((p) => p.cls === 'tile');
      if (!tiles.length)
        throw new ImportError(
          'out-of-order',
          'no pattern tiles — the pages were read as cover / instructions only',
          'assemble',
        );
      ctx.checkCancel();
      // Instruction pages carry the size run and the legend; keep their text past the docs (the
      // tile labels and copyright lines the clean stage masked are not read).
      this.docTextSrc = docs.flatMap((d) =>
        d.pages.flatMap((p) =>
          p.texts
            .filter((t) => !t.background)
            .map((t) => ({ file: d.file.id, page: p.page, text: t.text })),
        ),
      );
      this.docTexts = this.docTextSrc.map((t) => t.text);
      this.fileNames = new Map(docs.map((d) => [d.file.id, d.file.name]));
      // P2: numbered DXF layers are AAMA layers only when the reader proved the dialect
      this.aamaLayers = docs.some((d) => AAMA_DIALECTS.has(d.file.dxf?.dialect ?? ''));
      sheet = assembleAllSheets(
        docs,
        this.pages,
        input.override,
        (d, t, n) => ctx.progress(d, t, n),
        input.probeSheets,
      ).sheet;
      // Page geometry is no longer needed once the sheet exists (memory hygiene, see the header).
      this.docs = null;
    }
    const ext = Math.max(sheet.bbox.maxX - sheet.bbox.minX, sheet.bbox.maxY - sheet.bbox.minY);
    let clean: SheetClean | undefined;
    if (!this.fast) {
      // A8 8b: the sheet-wide pass (a watermark the tile borders cut); masked texts leave the sheet
      ctx.checkCancel();
      // the paths a page item offers (a stroke-text suggestion) are not offered again
      this.sheetOffered = new Set();
      const items = cleanSheet(sheet, this.cleanEdits, this.offeredSrc, this.sheetOffered);
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
    // UXHOOKS: the evidence on every missing cell (lines it cuts, line work around it), then the
    // cells accepted as blank pages move to `holes` (a refused placement stays refused)
    if (sheet.missing.length)
      sheet = acceptMissing(
        { ...sheet, missing: missingEvidence(sheet, sheet.missing) },
        input.acceptMissing,
      );
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
      // A0.3: what the clean stage offers as background (and the operator did not take) is
      // evidence for the legend's stray row
      const offeredPaths = new Set(
        sheet.paths
          .filter((p) => this.sheetOffered.has(p.id) || this.offeredSrc.has(srcKey(p.src)))
          .map((p) => p.id),
      );
      const build = (one: Sheet, sub: Progress) => {
        // gb2: the face pass's size count reads only what feeds this sheet (A6 sheetFeed)
        const feed = sheetFeed(one, this.files, this.docTextSrc, this.pages);
        const countFeed = {
          texts: feed.texts,
          files: feed.files,
          models: variantLabels(feed.texts.map((t) => t.text)).length,
          // the source's own one-size reading (sizes/detect: one file, a size in its name) — a
          // graded look against it is asked, never held silently
          sourceOne: this.files.length === 1 ? fileSizeLabel(this.files[0].name) : null,
        };
        return buildChainsDetailed(
          one,
          { ...input.opts },
          {
            extraTexts: this.docTexts,
            fileNames: this.fileNames,
            offeredPaths,
            countFeed,
            aamaLayers: this.aamaLayers,
          },
          (d, t, n) => {
            ctx.checkCancel();
            sub(d, t, n);
          },
        ).set;
      };
      // D6: every tile sheet's lines are read on that sheet alone (its pens, its legend, its size
      // labels — what it was alone), then joined: the same size label is one size row
      const parts = sheet.parts;
      set =
        parts && parts.length > 1
          ? joinSheetChains(
              parts.map((part, i) => ({
                sheet: part.sheet,
                set: build(sheetView(sheet, part), (d, t, n) =>
                  ctx.progress(i + d / Math.max(1, t), parts.length, n),
                ),
              })),
              sheet.styles,
            )
          : build(sheet, (d, t, n) => ctx.progress(d, t, n));
      // The operator's legend: role / size label per class; two size rows given one label are one
      // size (a size drawn in two looks).
      set = withClassSigs(set, sheet.styles);
      // MOOD-F1: a row the operator split goes into two rows first (the new row's answers are
      // bound to its own sig)
      if (input.legend?.length)
        set = mergeSameSize(applyLegend(splitRows(set, input.legend), input.legend));
      // rows confirmed as proposed are answered (confidence 1): the size checks read the answer
      if (input.confirmed?.length) set = confirmRows(set, input.confirmed);
    }
    // LINEFIX: the operator's per-line answers, after the legend — everything downstream (faces,
    // fill, gates) reads the lines where he put them
    let lineAssign: StageIO['chains']['out']['lineAssign'];
    if (input.chainAssign?.length) {
      if (this.fast)
        lineAssign = {
          applied: [],
          flags: [],
          notes: [],
          stale: input.chainAssign.flatMap((e, entry) =>
            e.keys.map((key) => ({
              entry,
              key,
              why: 'not-here' as const,
              detail: 'a DXF of pieces has no lines step',
            })),
          ),
        };
      else {
        const r = assignChains(set, sheet.styles, sheet.parts, sheet.id, input.chainAssign);
        set = r.set;
        lineAssign = r.report;
      }
    }
    this.chains = set;
    return {
      classes: set.classes,
      bundles: set.bundles,
      orphans: set.orphans,
      chainPreview: chainPreviewOf(set.chains, this.extentOf(sheet)),
      warnings: set.warnings,
      ambiguities: set.ambiguities ?? [],
      ...(this.fast ? {} : legendSwatches(sheet, set)),
      ...(this.fast ? {} : { chainLines: lineKeys(set, sheet.styles, sheet.parts, sheet.id) }),
      ...(this.fast
        ? {}
        : { suspects: lineSuspects(set, sheet.styles), outlines: sizeOutlines(set) }),
      ...(lineAssign ? { lineAssign } : {}),
    };
  }

  private sizesStage(input: StageIO['sizes']['in']): StageIO['sizes']['out'] {
    if (!this.sheet || !this.chains)
      throw new ImportError('out-of-order', 'trace the lines first', 'sizes');
    const read = this.fast ? this.fast.run : detectSizeRun(this.sheet, this.chains, this.files);
    // H1: the sizes the sheet draws decide the run the pieces are ranked in
    let expected = expectedSizes(read, input.drawnSizes, this.chains);
    const countAsk = this.countAsk(read);
    // A6: two or more independent evidences agree on the count → 'inferred' (taken like the
    // operator's answer; `drawnSizes: 0` = the operator took it back, and he is asked)
    const auto = countAsk?.auto;
    if (!expected && auto?.n != null && input.drawnSizes !== 0) {
      expected = { n: auto.n, from: 'inferred' };
      auto.applied = true;
    }
    this.expected = expected;
    // one size drawn and the sheet names it ("SIZE 38"): the run carries the label for the map
    const label = this.countEv?.set === this.chains ? this.countEv.v.label : null;
    const named =
      expected?.n === 1 && expected.from !== 'source' ? labelSingleRun(read, label) : read;
    const run = runForExpected(named, expected);
    let map = proposeCardSizeMap(run, input.card);
    if (this.dxfSet) map = reviewPlaceholderSizes(map, this.setSizes, input.card);
    if (input.operatorMap?.length) map = applyOperatorMap(map, input.operatorMap, input.card);
    // a size the sheet lists but draws no line of its own for is not drawn here: never written,
    // never filled from its neighbour (cause E, viola's 34)
    if (!this.fast && run.encoding !== 'single' && run.sizes.length > 1)
      map = markNotDrawn(
        map,
        undrawnRanks(
          this.chains,
          run,
          this.sheet.texts,
          sheetModule(this.sheet),
          undefined,
          new Map(this.sheet.styles.map((s) => [s.id, s])),
        ),
        input.card,
      );
    this.run = run;
    this.sizeMap = map;
    // D6: one legend for the document — the sheets must draw the same size pens
    const sheetLeg = this.fast
      ? null
      : sheetLegend(this.sheet.parts, this.chains.classes, this.chains.chains);
    return { run, map, expected, countAsk, ...(sheetLeg ? { sheetLegend: sheetLeg } : {}) };
  }

  /**
   * D1: the sizes step asks "sizes drawn on this sheet" unless the source states it. A DXF's blocks
   * are its pieces, so there it is asked only for blocks drawn as outline + sew line alike (they
   * close only as one size). The lines' own suggestion is computed once per chain set.
   */
  private inferred: { set: ChainSet; v: SizeCountAsk['inferred'] } | null = null;
  private countEv: { key: string; set: ChainSet; v: ReturnType<typeof countEvidence> } | null =
    null;
  private countAsk(read: SizeRun): SizeCountAsk | null {
    // gb2: a file name's one size against lines that look graded (chains/face-role sourceClash) is
    // no settled count: the step asks it
    if (
      expectedSizes(read, null, this.chains ?? undefined)?.from === 'source' &&
      !(this.chains && sourceClash(this.chains))
    )
      return null;
    if (
      this.fast &&
      !this.fast.families.some((f) => f.candidates.some((c) => (c as DxfPieceCandidate).oneSize))
    )
      return null;
    const set = this.chains;
    if (!set || !this.sheet) return { inferred: null };
    if (this.inferred?.set !== set)
      this.inferred = { set, v: inferDrawnSizes(this.sheet, gradeView(set)) };
    // A6 (not on the DXF fast path: its blocks are its pieces, the faces are not read)
    if (this.fast) return { inferred: this.inferred.v };
    // A6: only what feeds THIS sheet — its texts, its files' instruction texts, its faces, its files
    const sheet = this.sheet;
    const key = `${sheet.id}`;
    if (this.countEv?.set !== set || this.countEv.key !== key) {
      // the geometry as the size checks read it (gradeView: the face pass's candidate size lines
      // are walls) — on the canonical set a graded sheet's held sizes are no walls and its outlines
      // would read one line deep
      const view = gradeView(set);
      const faces =
        view === set
          ? this.facesOf(set, read, PATIMPORT.fillCellMm)
          : {
              map: faceMap(sheet, view, read, this.labelSeeds(sheet, set), {
                cellMm: PATIMPORT.fillCellMm,
              }),
            };
      const feed = sheetFeed(sheet, this.files, this.docTextSrc, this.pages);
      const cands = new Set(shapeCandidates(faces.map.blobs).map((b) => b.id));
      this.countEv = {
        key,
        set,
        v: countEvidence({
          texts: feed.texts,
          blobs: faces.map.blobs,
          shapes: blobShapes(faces.map, cands),
          files: feed.files,
          // the models it names are read as the pieces stage reads them (its model choice)
          models: variantLabels(sheet.texts.map((t) => t.text)).length,
        }),
      };
    }
    const ev = this.countEv.v;
    return {
      inferred: this.inferred.v,
      auto: ev.evidence.length
        ? {
            n: ev.n,
            evidence: ev.evidence,
            applied: false,
            ...(ev.blocked ? { blocked: ev.blocked } : {}),
          }
        : undefined,
    };
  }

  /** The text seeds that are piece labels: proposed, less the fragments of a printed code (NAP). */
  private labelSeeds(sheet: Sheet, set: ChainSet): Seed[] {
    const text = (this.textSeeds ??= proposeSeeds(sheet, set));
    if (this.codeHeld?.seeds !== text)
      this.codeHeld = { seeds: text, v: codeTextSeeds(sheet, text) };
    const code = this.codeHeld.v;
    return code.size ? text.filter((t) => !code.has(t.id)) : text;
  }

  /**
   * A2 faces of a chain set for a size run (seeds, set-asides, click placement) — computed once:
   * the sizes stage reads its nest evidence off them (A6), the pieces stage seeds from them. Labels
   * of a one-size run do not change the walls, so they are not part of the key.
   */
  private facesOf(base: ChainSet, run: SizeRun, cellMm: number | undefined): FacesEntry {
    const key = facesKey(run, cellMm);
    if (this.faces?.set === base && this.faces.key === key) return this.faces;
    if (this.sizeFaces?.set === base && this.sizeFaces.key === key)
      return (this.faces = this.sizeFaces);
    const sheet = this.sheet!;
    const text = (this.textSeeds ??= proposeSeeds(sheet, base));
    // NAP: a number that is part of a printed code is no label — the outline it sits in is read
    // as unlabelled by the face pass (seeded, or set aside as such), the number is held back
    const labels = this.labelSeeds(sheet, base);
    const map = faceMap(sheet, base, run, labels, { cellMm });
    const first = Math.max(-1, ...text.map((x) => x.id)) + 1;
    const { held, asides: a0 } = asidesOf(map, labels);
    for (const t of text) {
      const why = this.codeHeld?.v.get(t.id);
      if (why == null || !t.text) continue;
      held.add(t.id);
      a0.push({
        id: -1 - t.id,
        at: t.at,
        box: t.text.bbox,
        areaMm2: 0,
        reason: 'code-text',
        seed: t,
        why,
      });
    }
    // P2: a loop on the internal layer inside a cut piece is positive evidence of no piece
    const asides = layerLoopAsides(base, a0);
    const entry = { set: base, key, map, seeds: faceSeedsOf(map, first), held, asides };
    this.faces = entry;
    this.sizeFaces = entry;
    return entry;
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
      this.setAside = [];
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
    // A2: text seeds, then one face seed per closed outline no text seed is in (junk filtered)
    const text = (this.textSeeds ??= proposeSeeds(sheet, base));
    const faces = this.facesOf(base, run, input.opts.cellMm);
    const fm = faces.map;
    const held = faces.held;
    // A click is the operator's own point and stays where it is; it supersedes the face seed of
    // the outline it falls in (one seed per region) — unless the operator drew walls of his own in
    // that region (a "use line" makes a region inside it the face map does not know: both seeds
    // stay), or made a set-aside outline there a piece ("this is a piece": another piece).
    const given = input.seeds ?? [...text.filter((x) => !held.has(x.id)), ...faces.seeds];
    const walled = new Set<number>();
    for (const e of input.edits) {
      if (!isWallEdit(e)) continue;
      const pts = e.kind === 'bridge' ? [e.from, e.to] : base.chains[e.chain]?.pts ?? [];
      for (const p of pts) walled.add(blobOf(fm, p));
    }
    const clicked = new Set(
      given
        .flatMap((x) => (x.origin === 'click' && x.aside == null ? [blobOf(fm, x.at)] : []))
        .filter((b) => b >= 0 && !walled.has(b)),
    );
    const superseded = new Set(
      given.filter((x) => x.origin === 'face' && clicked.has(blobOf(fm, x.at))).map((x) => x.id),
    );
    // VARIANTS: a model a seed carries only because an earlier run's claim put it there is read
    // afresh below (the claim follows this run's fill), never taken as the seed's own
    const seeds = given
      .filter((x) => !superseded.has(x.id))
      .map((x) => {
        if (x.variantFrom !== 'claim') return x;
        const { variantFrom: _f, ...own } = x;
        return { ...own, variant: null };
      });
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
    // A2: a face seed whose region the fill finds open in every size stays — an open outline is a
    // question (close the gap, or not a piece), not a deletion. A piece drawn inside another is its
    // own piece: its lines are not the host's internal lines.
    families = exceptNested(families);
    // UXHOOKS (D3): no piece closes across a missing page accepted as blank
    families = holeGuard(families, set, sheet.holes);
    // SHAPE: a notch mark on the line is a notch, never outline (pieces/notch-marks.ts)
    families = cleanNotchMarks(families, set);
    // VARIANTS: the pieces a model's own label block claims (D3: inside exactly one piece AND
    // beside its texts), read afresh on this run's fill — a claimed piece is left out of another
    // model's run. A seed with a model of its own (the operator's, or a label by its number) or a
    // click keeps it: the claim does not override it.
    const models = variantLabels(sheet.texts.map((t) => t.text));
    const filled = families;
    this.modelClaims = new Map();
    for (const c of pieceClaims(sheet, markLabels(sheet, models), filled)) {
      const sd = seeds.find((x) => x.id === c.seed);
      if (!sd || sd.variant != null || sd.origin === 'click') continue;
      this.modelClaims.set(sd.id, {
        label: c.label,
        piece: sd.text?.text.trim() || `seed ${sd.id}`,
        evidence: c.evidence,
      });
    }
    if (opts.variant) {
      const v = modelKey(opts.variant);
      families = families.filter((f) => {
        const c = this.modelClaims.get(f.seed);
        return !c || modelKey(c.label) === v;
      });
    }
    this.pieceVariant = opts.variant ?? null;
    // the claim reaches the wizard as the seed's model (the garment it belongs to), marked as
    // the claim's so a seed passed back is read afresh
    const shown = seeds.map((sd) => {
      const c = this.modelClaims.get(sd.id);
      return c ? { ...sd, variant: c.label, variantFrom: 'claim' as const } : sd;
    });
    // what was set aside and is not a piece now
    const taken = new Set<number>();
    for (const x of given) {
      if (x.aside != null) taken.add(x.aside);
      if (held.has(x.id)) taken.add(-1 - x.id);
    }
    // DARTS: a possible dart is a dart of its piece only where every closed size of that piece
    // draws its own V there (pieces/darts provenDart reads `legs`)
    const kept = faces.asides.filter((a) => !taken.has(a.id));
    const legs = dartLegsDrawn(kept, families, shown, set, run);
    const setAside = kept.map((a) =>
      a.dart ? { ...a, dart: { ...a.dart, legs: legs.get(a.id) ?? { sizes: 0, drawn: 0 } } } : a,
    );
    this.wallSet = set;
    this.seeds = shown;
    this.families = families;
    this.setAside = setAside;
    // D6: the pieces read across the tile sheets (copies, alternatives, splits) — the wizard asks
    this.sheetAnswers = input.sheetAnswers ?? {};
    this.sheetRead = sheetPieces(sheet.parts, families, shown, sheet.texts, setAside);
    // A10 (Codex #1): the models THIS drawing prints (D6: every tile sheet of it) — never the text
    // of an instruction or overview page naming every model of the magazine
    const variants = models;
    // what tells those models apart on the drawing: each printed cutting line, its pieces, and —
    // before a model is chosen (the fill uncut) — those pieces as each model cuts them
    // (`[]` only when the models are proven one garment; absent = unknown, the wizard asks)
    const variantMarks = variants.length
      ? variantMarksOut(
          sheet,
          set,
          variants,
          shown,
          families,
          run,
          !opts.variant,
          filled,
          new Set(this.modelClaims.keys()),
        )
      : undefined;
    // H1: what the size solver could not decide reaches the wizard (a refill keeps the last full
    // fill's answer: the solver reads the whole sheet either way)
    if (!appended) this.gradeAmbiguities = ps.diag?.grade?.ambiguities ?? [];
    else if (ps.diag?.grade) this.gradeAmbiguities = ps.diag.grade.ambiguities;
    return {
      seeds: shown,
      families,
      sheets: this.sheetRead,
      variants,
      ...(variantMarks ? { variantMarks } : {}),
      grade: { expected: expected ?? null, ambiguities: this.gradeAmbiguities },
      setAside,
    };
  }

  // ── semantics (F5) ────────────────────────────────────────────────────────────────────────

  /**
   * D6: the allowance each tile sheet states or measures, read as that sheet alone read it (its
   * texts, its pieces, its lines; else the instruction pages' statement). Null when the drawing is
   * one sheet or no sheet reads one (the file-level path then asks). The file decision is the
   * sheet with the most pieces; every piece of a sheet that reads otherwise carries its own
   * sheet's decision, and the disagreement is written into every such decision's evidence.
   */
  private sheetAllowances(
    sheet: Sheet,
    set: ChainSet,
  ): { file: AllowanceDecision; bySeed: Record<number, AllowanceDecision> } | null {
    const parts = sheet.parts;
    if (!parts || parts.length < 2 || !this.families) return null;
    const at = new Map((this.seeds ?? []).map((sd) => [sd.id, sd.at]));
    const silent: number[] = [];
    const reads = parts.flatMap((part) => {
      const fams = this.families!.filter((f) => {
        const p = at.get(f.seed);
        return !!p && partAt(parts, p)?.sheet === part.sheet;
      });
      if (!fams.length) return [];
      const own = detectAllowance(sheetView(sheet, part), fams, chainView(set, parts, part.sheet));
      // the statement is often on an instruction page, not on the sheet itself
      const d = own.origin !== 'default' ? own : allowanceFromTexts(this.docTexts).decision;
      if (!d) silent.push(part.sheet + 1);
      return d ? [{ part, fams, d }] : [];
    });
    if (!reads.length) return null;
    // a sheet that states nothing takes the file decision — said, never silent
    const quiet = silent.length
      ? [`tile sheet ${silent.join(', ')} states no allowance: its pieces take this one`]
      : [];
    const key = (d: AllowanceDecision) => `${d.meaning}/${d.allowanceMm}`;
    if (new Set(reads.map((r) => key(r.d))).size < 2) {
      const main = [...reads].sort((a, b) => b.fams.length - a.fams.length)[0];
      return { file: { ...main.d, evidence: [...main.d.evidence, ...quiet] }, bySeed: {} };
    }
    const said = reads
      .map((r) => `sheet ${r.part.sheet + 1}: ${r.d.meaning} ${r.d.allowanceMm} mm`)
      .join(', ');
    const main = [...reads].sort((a, b) => b.fams.length - a.fams.length)[0];
    const note = `the tile sheets read different allowances (${said}) — each sheet's pieces take their own sheet's`;
    const bySeed: Record<number, AllowanceDecision> = {};
    for (const r of reads)
      if (r !== main)
        for (const f of r.fams)
          bySeed[f.seed] = {
            ...r.d,
            evidence: [`tile sheet ${r.part.sheet + 1}`, ...r.d.evidence, note],
          };
    return {
      file: {
        ...main.d,
        evidence: [`tile sheet ${main.part.sheet + 1}`, ...main.d.evidence, note, ...quiet],
      },
      bySeed,
    };
  }

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
    // D6: a drawing of several tile sheets — each sheet states (or measures) its own allowance; where
    // they disagree, each sheet's pieces take their own sheet's (as each sheet imported alone did),
    // written into every such piece's evidence — never one sheet's value over the other's pieces
    const perSheet =
      input.fileAllowance.origin === 'default' ? this.sheetAllowances(sheet, set) : null;
    const fileAllowance = perSheet
      ? perSheet.file
      : input.fileAllowance.origin === 'default'
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
    const pieceOverrides = perSheet
      ? Object.fromEntries(
          [
            ...Object.keys(perSheet.bySeed).map(Number),
            ...Object.keys(input.pieceOverrides).map(Number),
          ].map((seed) => {
            const ov = input.pieceOverrides[seed] ?? {};
            const own = perSheet.bySeed[seed];
            return [seed, ov.allowance || !own ? ov : { ...ov, allowance: own }];
          }),
        )
      : input.pieceOverrides;
    const detail = buildPieceSpecsDetailed(
      {
        sheet,
        set,
        run: this.run,
        sizeMap: this.sizeMap,
        families: this.families,
        ...input,
        pieceOverrides,
        fileAllowance,
        traced: this.traced(),
        docTexts: this.docTexts,
        // the text label of each text seed: the cutting list binds its entries to them (S5)
        seedLabels: Object.fromEntries(
          (this.seeds ?? []).flatMap((sd) =>
            sd.origin === 'text' && sd.text ? [[sd.id, sd.text.text.trim()]] : [],
          ),
        ),
        // MOOD Ф0 (G24): the header text of each text seed
        seedTexts: Object.fromEntries(
          (this.seeds ?? []).flatMap((sd) =>
            sd.origin === 'text' && sd.text ? [[sd.id, sd.text.id]] : [],
          ),
        ),
        seedAts: Object.fromEntries((this.seeds ?? []).map((sd) => [sd.id, sd.at])),
        // DARTS: the darts proven of a seeded piece write their legs on layer 8
        darts: provenDarts(this.setAside, this.families ?? [], this.seeds ?? []),
      },
      (d, t, n) => ctx.progress(d, t, n),
    );
    this.passportBound = this.passport
      ? bindPassport(this.passport, this.bindPieces(detail.output, set, sheet))
      : null;
    const output = this.passportBound
      ? {
          ...detail.output,
          passport: this.passportBound,
          // an operator's file-level answer closes it (a measured pair may still override it per
          // piece in build.ts — the question was seen, it is not asked again: Codex P1 re-check)
          unproven:
            input.fileAllowance.origin === 'operator'
              ? detail.output.unproven
              : outlineWordQuestions(detail.output, this.passportBound),
        }
      : detail.output;
    this.semantics = output;
    this.wallsOf = detail.wallsOf;
    this.derivedOf = detail.derivedOf;
    this.notchChordsOf = detail.notchChordsOf;
    this.continuityOf = detail.continuityOf;
    this.identityOf = detail.identityOf;
    this.onePieceOf = detail.onePieceOf;
    this.gradeOf = detail.gradeOf;
    return output;
  }

  /**
   * PASSPORT Ф1: each piece as the passport binds it — its exported identities, the layer of every
   * wall chain of its outline (every size), the printed label it was seeded from.
   */
  /**
   * D6 (G23): the garment's tile sheets as this run read them — over the whole garment (every
   * fabric scope gets the same verdict); null = one sheet (nothing to check).
   */
  private sheetCover(exportedSeeds: readonly SeedId[]): SheetCover | null {
    const parts = this.sheet?.parts;
    if (this.fast || !parts || parts.length < 2) return null;
    const expected = (this.passportBound?.pieces ?? []).filter(
      (e) => e.drawn?.value !== 'by-dimensions' && e.drawn?.value !== 'trace-from',
    );
    return sheetCoverOf({
      parts,
      tileSheets: tileSheetIds(this.pages),
      read: this.sheetRead,
      answers: this.sheetAnswers,
      exported: exportedSeeds,
      expected: expected.map((e) => ({
        name: e.label?.value ?? e.name.value,
        bound: !!e.binding,
      })),
    });
  }

  private bindPieces(out: SemanticsOutput, set: ChainSet, sheet: Sheet): BindPiece[] {
    const chainById = new Map(set.chains.map((c) => [c.id, c]));
    const layerOf = new Map(sheet.styles.map((st) => [st.id, st.layer]));
    const label = new Map(
      (this.seeds ?? []).flatMap((sd) =>
        sd.origin === 'text' && sd.text ? [[sd.id, sd.text.text.trim()] as const] : [],
      ),
    );
    return (this.families ?? []).map((f) => {
      const identities = out.pieces.filter((p) => p.seed === f.seed).map((p) => p.identity);
      const wallLayers = f.candidates.flatMap((c) =>
        c.walls.map((id) => {
          const ch = chainById.get(id);
          return ch ? layerOf.get(ch.style) ?? null : null;
        }),
      );
      return { seed: f.seed, identities, wallLayers, label: label.get(f.seed) ?? null };
    });
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

  // ── render-pages (A9) ─────────────────────────────────────────────────────────────────────

  /**
   * The thumbnails of the AI page-role call: each page after the clean stage's mask (the grid and
   * the chrome it masked are not shown), with its stats. A side stage: invalidates nothing.
   */
  private async renderPagesStage(
    input: StageIO['render-pages']['in'],
    ctx: StageCtx,
  ): Promise<StageIO['render-pages']['out']> {
    if (!this.docs || !this.masks)
      throw new ImportError('out-of-order', 'clean the pages first', 'render-pages');
    // stats and pictures in page millimetres (a scale applied since is undone for the numbers)
    const f = this.docsFactor || 1;
    const marksOf = new Map(this.tileMarks.map((m) => [m.file, m]));
    const out: StageIO['render-pages']['out']['pages'] = [];
    let n = 0;
    for (const want of input.pages) {
      ctx.checkCancel();
      const pg = this.docs
        .find((d) => d.file.id === want.file)
        ?.pages.find((p) => p.page === want.page);
      if (!pg) continue;
      // the line work as the mask leaves it; the tile chrome is looked for on the whole page (a
      // tile's own chrome is masked)
      const marks = f === 1 ? marksOf.get(pg.file) : undefined;
      const st = pageStats(pg, pageChains(pg), marks);
      if (marks && st.hasTileMarks === false && pg.paths.some((p) => p.background)) {
        const whole = { ...pg, paths: pg.paths.map((p) => ({ ...p, background: undefined })) };
        st.hasTileMarks = marksOn(pageChains(whole), marks.sigs) > 0;
      }
      const png =
        input.pictures === false ? null : await renderPagePng(pg, Math.max(64, input.maxPx));
      out.push({
        ...st,
        widthMm: pg.widthMm / f,
        heightMm: pg.heightMm / f,
        lineLengthM: Math.round((st.lineLengthM / f) * 100) / 100,
        png,
      });
      ctx.progress(++n, input.pages.length, `page ${pg.page + 1}`);
    }
    return { pages: out };
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
      files: [
        ...this.files.map((f) => ({
          name: f.name,
          sha256: f.sha256,
          bytes: f.bytes,
          kind: f.kind,
          pages: f.pages,
        })),
        // RUL: the grade rule table the DXF was graded by is a source file of the run too
        ...(this.rul
          ? [
              {
                name: this.rul.name,
                sha256: this.rul.sha256,
                bytes: this.rul.bytes,
                kind: 'dxf' as const,
                pages: 0,
              },
            ]
          : []),
      ],
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
        // TILESTEP: where the tile pitch came from (measured, the tiles line, assumed, by hand)
        ...(this.sheet?.pitchFrom ? { pitch: this.sheet.pitchFrom } : {}),
      },
      // D6: every tile sheet the drawing is made of
      ...((this.sheet?.parts?.length ?? 0) > 1
        ? {
            sheets: this.sheet!.parts!.map((p) => ({
              sheet: p.sheet,
              pages: p.pages.length,
              maxResidualMm: p.maxResidualMm,
              ...(p.pitchFrom ? { pitch: p.pitchFrom } : {}),
            })),
          }
        : {}),
      // UXHOOKS: missing pages imported as blank, with the lines each one cuts
      ...(this.sheet?.holes?.length
        ? {
            holes: (() => {
              const hs = this.sheet!.holes!;
              const chainEnds = this.chains ? holeChainEnds(this.chains, hs) : hs.map(() => 0);
              return hs.map((h, k) => ({
                sheet: h.sheet,
                row: h.row,
                col: h.col,
                lineEnds: h.lineEnds,
                chainEnds: chainEnds[k],
                origin: h.origin,
              }));
            })(),
          }
        : {}),
      sizeEncoding: this.run?.encoding ?? 'single',
      variant: this.pieceVariant ?? sem.pieces.find((p) => p.variant)?.variant ?? null,
    };
    // VARIANTS (D5): the pieces the drawing ties to one model — in THIS file or left out — and why
    const chosen = this.pieceVariant;
    const sourceFor = (specs: readonly { seed: SeedId }[]): ManifestSource =>
      this.modelClaims.size
        ? {
            ...source,
            models: [...this.modelClaims].slice(0, MODELS_MAX).map(([seed, c]) => ({
              piece: c.piece,
              model: c.label,
              kept:
                (chosen == null || modelKey(c.label) === modelKey(chosen)) &&
                specs.some((x) => x.seed === seed),
              evidence: `${c.label} only — ${c.evidence}`,
            })),
          }
        : source;
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
    const chords = this.notchChordsOf;
    const continuity = this.continuityOf;
    const identity = this.identityOf;
    // G24's face evidence (another piece's header in the face, two outlines of one size overlapping)
    // reads a FILL's faces: a DXF's pieces are its blocks, each drawn in its own frame — they are
    // not faces of one drawing, and blocks laid over each other are no outline across two pieces
    const onePiece = this.fast ? null : this.onePieceOf;
    // SILENT (G26 / G8): the grade model reads the fill's nested size lines, as G24 does
    const grade = this.fast ? null : this.gradeOf;
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
    // (a kind the operator kept is out: G19 always has a way out); marks block, frames warn
    const chrome: ChromeLine[] = [];
    if (this.sheet && !this.fast)
      for (const p of this.sheet.paths) {
        const kind = p.background ?? this.chromeSrc.get(srcKey(p.src));
        if (!kind || !CHROME_KINDS.has(kind)) continue;
        chrome.push({
          mark: kind !== 'tile-frame',
          pts: p.closed && p.pts.length > 2 ? [...p.pts, p.pts[0]] : p.pts,
        });
      }
    const sheets = this.sheetCover(sem.pieces.map((p) => p.seed));
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
          source: sourceFor(sp.specs),
          generator: input.generator,
          dialect: input.dialect,
          ...(input.autopilot ? { autopilot: input.autopilot } : {}),
          ...(this.passportBound ? { passport: passportDigest(this.passportBound) } : {}),
          ...(input.replay ? { replay: input.replay } : {}),
        },
        {
          rules: cardRules,
          sizeTokens,
          wallsOf: rawWalls ? (id, rank) => rawWalls(sp.sourceOf[id] ?? id, rank) : undefined,
          wallsUsedOf: wallsUsed ? (id, rank) => wallsUsed(sp.sourceOf[id] ?? id, rank) : undefined,
          derivedOf: derived ? (id, rank) => derived(sp.sourceOf[id] ?? id, rank) : undefined,
          notchChordsOf: chords ? (id, rank) => chords(sp.sourceOf[id] ?? id, rank) : undefined,
          continuityOf: continuity
            ? (id, rank) => continuity(sp.sourceOf[id] ?? id, rank)
            : undefined,
          identityOf: identity ? (id, rank) => identity(sp.sourceOf[id] ?? id, rank) : undefined,
          onePieceOf: onePiece ? (id, rank) => onePiece(sp.sourceOf[id] ?? id, rank) : undefined,
          gradeOf: grade ? (id, rank) => grade(sp.sourceOf[id] ?? id, rank) : undefined,
          chrome,
          openFolds,
          ...(sheets ? { sheets } : {}),
          hausdorffP95Mm: raster ? PATIMPORT.hausdorffP95RasterMm : PATIMPORT.hausdorffP95VectorMm,
        },
      );
      const base = (this.files[0]?.name ?? 'pattern').replace(/\.[^.]+$/, '');
      const filename = `${base}-${purposeWord(scope)}.dxf`;
      scopes.push({
        target: scope,
        filename,
        name: '',
        dxfText: res.dxfText,
        manifest: res.detail.manifest,
        ...(input.storage === 'rul'
          ? {
              rul: rulPackageOf(
                res.detail.plan.blocks,
                input,
                scope.label || scope.scopeKey,
                filename,
                this.semantics?.gradeAsks ?? [],
              ),
            }
          : {}),
        identities: [...new Set(res.detail.plan.blocks.map((b) => b.identity))],
      });
      gate[scope.scopeKey] = res.report;
    }
    ctx.progress(plan.scopes.length, plan.scopes.length);
    return { scopes, gate };
  }
}

/**
 * RUL: one scope's written blocks as base DXF + .rul (`packRul`, proved by expanding back). The
 * package is built from the AAMA R12 rendering of the same blocks whatever dialect the scope file
 * is written in — base + RUL is an AAMA exchange.
 */
function rulPackageOf(
  blocks: PlannedBlock[],
  input: StageIO['write']['in'],
  styleName: string,
  filename: string,
  gradeAsks: readonly GradeAsk[] = [],
): DraftRul {
  const sizes = [...input.sizes].sort((a, b) => a.rank - b.rank).map((s) => s.token);
  const base = input.rulBase ?? sizes[Math.floor((sizes.length - 1) / 2)];
  // SHAPE-KINK: one point list per graded line in every size (corners matched, edges resampled at
  // every size's own vertices) — the per-size DXF itself is not touched (adapters/rul/correspond.ts)
  const eq = equalizeForRul(blocks, base ?? '');
  const perSize = writeR12(eq.blocks, {
    styleName,
    createdAt: new Date().toISOString(),
    sampleSize: base ?? '',
  });
  // probe switch (node only): PATIMPORT_RUL_PICK=<regex> packs only the pieces it matches
  const pickRe =
    typeof process !== 'undefined' && process.env?.PATIMPORT_RUL_PICK
      ? new RegExp(process.env.PATIMPORT_RUL_PICK)
      : null;
  const pack = packRul(perSize, {
    sizes,
    base,
    name: styleName,
    ...(pickRe ? { pick: (piece: string) => pickRe.test(piece) } : {}),
  });
  // a line not matched point for point is never packed (its pairing would be unproven)
  const unmatched = eq.notes.map((n) => `not matched: ${n}`);
  if (!pack.ok || unmatched.length) {
    const reasons = [...(pack.ok ? [] : pack.reasons), ...unmatched];
    return { ok: false, reasons, refusals: rulRefusalsOf(reasons, blocks, gradeAsks) };
  }
  const stem = filename.replace(/\.dxf$/i, '');
  return {
    ok: true,
    dxfFilename: `${stem}-base-${base}.dxf`,
    dxfText: pack.baseDxf,
    rulFilename: `${stem}.rul`,
    rulText: pack.rulText,
    base: pack.base,
    sizes: pack.sizes,
    rules: pack.rules,
    maxErrMm: pack.maxErrMm,
  };
}

/**
 * SHAPE-KINK: the refusal reasons per piece (the piece a reason starts with, when it is one of the
 * written identities) and, where the piece's sizes are not the same drawing, the open GRADE P1
 * counts ask whose answer would make them so — the UI routes the operator to it (never answered
 * here: the decision stays the operator's).
 */
function rulRefusalsOf(
  reasons: readonly string[],
  blocks: readonly PlannedBlock[],
  gradeAsks: readonly GradeAsk[],
): RulRefusal[] {
  const ids = new Set(blocks.map((b) => b.identity));
  return reasons.map((why) => {
    const head = why.replace(/^not matched: /, '').match(/^([^\s:]+)/)?.[1] ?? '';
    const identity = ids.has(head) ? head : null;
    // a per-size entity difference (lines / points in one size and not another)
    const counts = /not the same drawing|lines\/points/.test(why);
    // a mirrored hand (`_R` derived from `_L`) answers through its source piece's ask
    const src = blocks.find((b) => b.identity === identity)?.derivedFrom ?? null;
    const ask =
      identity && counts
        ? gradeAsks.find(
            (q) =>
              q.kind === 'counts' &&
              !q.answer &&
              [identity, src].some(
                (id) => !!id && (q.identity === id || `LIN_${q.identity}` === id),
              ),
          )
        : undefined;
    return { identity, why, ...(ask ? { gradeAskKey: ask.key } : {}) };
  });
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

/**
 * PASSPORT (c), Codex P1 #2/#3: the file's layer word may never lose silently to what the sheet
 * says. Where the outline layers disagree among themselves, or the bound word says the other line
 * than the sheet's text / measured second line, every exported piece whose outline the SHEET
 * decided (origin text / measured — never an operator's answer) gets the outline question back.
 */
function outlineWordQuestions(
  out: SemanticsOutput,
  p: GarmentPassport,
): SemanticsOutput['unproven'] {
  const o = p.outline;
  if (!o || !o.classes.includes('structure')) return out.unproven;
  const asked = new Set(out.unproven.filter((u) => u.kind === 'allowance').map((u) => u.seed));
  const extra: SemanticsOutput['unproven'] = [];
  for (const piece of out.pieces) {
    const a = piece.allowance;
    if (asked.has(piece.seed) || (a.origin !== 'text' && a.origin !== 'measured')) continue;
    const clash =
      o.status === 'conflict' ||
      (o.status === 'read' && (a.meaning === 'seam') !== (o.value === 'seam'));
    if (!clash) continue;
    asked.add(piece.seed);
    extra.push({
      seed: piece.seed,
      kind: 'allowance',
      shown: `${a.meaning}+${a.allowanceMm}`,
      detail:
        o.status === 'conflict'
          ? `${o.note ?? "the file's outline layers disagree"}: is the outline the cut or the seam line?`
          : `the sheet says ${a.meaning === 'seam' ? 'seam line' : 'cut line'} (${(a.evidence[0] ?? a.origin).slice(0, 80)}) but the file's layer says ${o.value} line: which is it?`,
    });
  }
  return extra.length ? [...out.unproven, ...extra] : out.unproven;
}
