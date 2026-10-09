// One import session = one wizard run (08-CONTRACT §4.1). The session owns the heavy artifacts —
// file bytes (blob store), the extracted docs, the assembled sheet, the DXF fast path, the stage
// outputs — and every stage reads them implicitly. Re-running a stage drops everything after it.
//
// Memory: the page geometry of the docs is the largest thing a session holds (F2 measured
// polupalto at 777 MB RSS in node with docs + sheet alive). Once a sheet is assembled the docs are
// dropped; the file bytes stay in the blob store (Blob, not a JS ArrayBuffer), so re-assembling a
// different sheet or with a hand grid re-reads them (seconds) instead of keeping them (hundreds MB).
import type {
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
  SizeRun,
  SourceDoc,
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
  segmentDxf,
  type DxfFastPath,
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
import { renderSom } from '../ai/som';
import { writeAndGate } from '../gate';
import { applyLegend, buildChainsDetailed } from '../chains';
import { detectSizeRun } from '../sizes';
import { applyOperatorMap, createProposeSizeMap, defaultTokensOf } from '../sizes/map';
import { applyPieceEdits, fillPiecesDetailed, proposeSeeds } from '../pieces';
import {
  allowanceFromTexts,
  buildPieceSpecsDetailed,
  detectAllowance,
  type SemanticsDetail,
} from '../semantics';
import { planScopes, proposeFabricsDetailed, purposeWord } from '../fabrics';
import { cardRules } from './card-rules';
import { ImportError, cancelled, stageUnavailable } from './errors';
import { isWallEdit, mergeSameSize, withOperatorLines } from './operator-lines';
import { chainPreviewOf, previewOf } from './preview';
import { wallsUsedBy } from './walls-used';

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
  private calibrations: Calib[] = [];
  private scaleCands: ScaleCandidate[] = [];
  private extractWarnings: string[] = [];
  private dxf: { read: DxfRead; seg: DxfSegmentation } | null = null;
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
  /** The set the fill ran on: `chains` + the operator's bridges − ignored lines. */
  private wallSet: ChainSet | null = null;
  private run: SizeRun | null = null;
  private sizeMap: SizeMap | null = null;
  /** Text seeds proposed once per chain set (clicks are appended by the wizard). */
  private textSeeds: Seed[] | null = null;
  private seeds: Seed[] | null = null;
  private families: PieceFamily[] | null = null;
  private semantics: SemanticsOutput | null = null;
  /** Source walls per written identity × rank (F5) — what the gate measures the cut line against. */
  private wallsOf: SemanticsDetail['wallsOf'] | null = null;
  /** Text of the pages that are not pattern tiles (instructions, cover, overview): cut layouts (F7). */
  private pageTexts: IRText[] = [];

  constructor(id: number, files: { name: string; bytes: ArrayBuffer }[]) {
    this.id = id;
    if (!files.length) throw new ImportError('out-of-order', 'no files given');
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
    if (routes[0].route === 'dxf' && files.length > 1)
      throw new ImportError(
        'unsupported-format',
        'several DXF files are not merged yet — export all sizes into one DXF (or use "merge sizes").',
      );
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
  }

  /** Running stage S drops every output after S (render-som drops nothing). */
  private invalidateAfter(stage: StageName) {
    const at = ORDER.indexOf(stage);
    if (at < 0) return;
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
    }
    if (at < ORDER.indexOf('pieces')) {
      this.seeds = null;
      this.families = null;
      this.wallSet = null;
    }
    if (at < ORDER.indexOf('semantics')) {
      this.semantics = null;
      this.wallsOf = null;
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
    const n = this.files.length;
    for (let i = 0; i < n; i++) {
      ctx.checkCancel();
      const info = this.files[i];
      const blob = this.blobs.get(`file:${i}`);
      if (!blob)
        throw new ImportError('no-session', 'the session lost its files — read them again');
      const bytes = await blob.arrayBuffer();
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
          const r = await extractRasterImageDetailed(f, o, { progress: p });
          keepCalibs(f.id, r.calibrations, r.doc);
          return r.doc;
        },
      };
      const extract = pickExtractor(bytes, info.name, reg);
      const doc = await extract({ id: info.id, name: info.name, bytes }, opts, (d, t, note) => {
        ctx.checkCancel();
        fileProgress(d, t, note);
      });
      docs.push(doc);
    }
    ctx.progress(n, n);
    return docs;
  }

  private async extract(
    input: StageIO['extract']['in'],
    ctx: StageCtx,
  ): Promise<StageIO['extract']['out']> {
    const opts = { ...DEFAULT_OPTS, ...input.opts };
    const docs = await this.readAll(ctx, opts);
    this.docs = docs;
    this.docsFactor = 1;
    this.files = docs.map((d) => d.file);
    const warnings = docs.flatMap((d) => d.warnings.map((w) => `${d.file.name}: ${w}`));

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
    if (this.decision) this.rescaleTo(this.decision.factor);
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
      // Instruction pages carry the size run and the legend; keep their text past the docs.
      this.docTexts = docs.flatMap((d) => d.pages.flatMap((p) => p.texts.map((t) => t.text)));
      this.fileNames = new Map(docs.map((d) => [d.file.id, d.file.name]));
      sheet = assembleSheetDetailed(docs, this.pages, input.sheet, input.override, (d, t, n) => {
        ctx.progress(d, t, n);
      }).sheet;
      // Page geometry is no longer needed once the sheet exists (memory hygiene, see the header).
      this.docs = null;
    }
    this.sheet = sheet;
    const ext = Math.max(sheet.bbox.maxX - sheet.bbox.minX, sheet.bbox.maxY - sheet.bbox.minY);
    return { sheet: sheetOnly(sheet), previewPaths: previewOf(sheet.paths, sheet.styles, ext) };
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
    const run = this.fast ? this.fast.run : detectSizeRun(this.sheet, this.chains, this.files);
    let map = proposeCardSizeMap(run, input.card);
    if (input.operatorMap?.length) map = applyOperatorMap(map, input.operatorMap, input.card);
    this.run = run;
    this.sizeMap = map;
    return { run, map };
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
      // F8 keeps the DXF's own features on `dxf.features`; the contract field is
      // `PieceCandidate.features` — copy them across so every reader finds them in one place.
      const families = this.fast.families.map((f) => ({
        ...f,
        candidates: f.candidates.map((c) => {
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
    const seeds = input.seeds ?? (this.textSeeds ??= proposeSeeds(sheet, base));
    const lines = withOperatorLines(base, run, input.edits);
    const set = lines.set;
    ctx.checkCancel();
    let families = fillPiecesDetailed(sheet, set, run, seeds, input.opts, (d, t, n) => {
      ctx.checkCancel();
      ctx.progress(d, t, n);
    }).families;
    const edits = input.edits.filter((e) => !isWallEdit(e));
    if (edits.length)
      families = applyPieceEdits(families, edits, { sheet, set, run, opts: input.opts });
    this.wallSet = set;
    this.seeds = seeds;
    this.families = families;
    return { seeds, families };
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
            return allowanceFromTexts(this.docTexts).decision ?? input.fileAllowance;
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
      },
      (d, t, n) => ctx.progress(d, t, n),
    );
    this.semantics = detail.output;
    this.wallsOf = detail.wallsOf;
    return detail.output;
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
    // is cut to the stretch this piece uses (walls-used.ts). A DXF's walls are its own blocks.
    const rawWalls = this.wallsOf;
    const specOf = new Map(sem.pieces.map((p) => [p.identity, p]));
    const walls = rawWalls
      ? (identity: string, rank: number): PtMm[][] | undefined => {
          const w = rawWalls(identity, rank);
          const spec = specOf.get(identity);
          const size = spec?.sizes.find((z) => z.rank === rank) ?? spec?.sizes[0];
          if (!w || !spec || !size || this.fast) return w;
          return wallsUsedBy(w, spec.allowance.meaning === 'seam' ? size.seam : size.cut);
        }
      : null;
    const sizeTokens = new Set(input.sizes.map((s) => s.token.toLowerCase()));
    const scopes: DraftScope[] = [];
    const gate: Record<string, GateReport> = {};
    let k = 0;
    for (const sp of plan.scopes) {
      ctx.checkCancel();
      const scope = sp.target;
      ctx.progress(k++, plan.scopes.length, scope.label);
      const res = await writeAndGate(
        {
          techCardId: 0,
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
          wallsOf: walls ? (id, rank) => walls(sp.sourceOf[id] ?? id, rank) : undefined,
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
