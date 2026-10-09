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
  DraftScopeTarget,
  ExtractOpts,
  FileId,
  GateReport,
  IRPage,
  ManifestSource,
  PageClassification,
  PageIndex,
  PieceFamily,
  PieceSpec,
  Progress,
  PtMm,
  RasterCalibration,
  ScaleCandidate,
  ScaleDecision,
  Seed,
  SemanticsOutput,
  Sheet,
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
import { pieceInScope } from '../write';
import { writeAndGate } from '../gate';
import { cardRules } from './card-rules';
import { ImportError, cancelled, stageUnavailable } from './errors';
import { previewOf } from './preview';

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
  // later stages (filled by their modules as they land)
  private chains: ChainSet | null = null;
  private run: SizeRun | null = null;
  private seeds: Seed[] | null = null;
  private families: PieceFamily[] | null = null;
  private semantics: SemanticsOutput | null = null;

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
    if (at < ORDER.indexOf('chains')) this.chains = null;
    if (at < ORDER.indexOf('sizes')) this.run = null;
    if (at < ORDER.indexOf('pieces')) {
      this.seeds = null;
      this.families = null;
    }
    if (at < ORDER.indexOf('semantics')) this.semantics = null;
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
          return this.chainsStage();
        case 'pieces':
          return this.piecesStage(input as StageIO['pieces']['in']);
        case 'render-som':
          return this.renderSomStage(input as StageIO['render-som']['in']);
        case 'write':
          return this.write(input as StageIO['write']['in'], ctx);
        case 'sizes':
        case 'semantics':
        case 'fabrics':
          throw stageUnavailable(stage);
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

  // ── chains / pieces: the DXF fast path today, F3 / F4 when they land ─────────────────────

  private chainsStage(): StageIO['chains']['out'] {
    if (!this.sheet) throw new ImportError('out-of-order', 'assemble the sheet first', 'chains');
    if (!this.fast) throw stageUnavailable('chains');
    const set = this.fast.chains;
    this.chains = set;
    const ext = Math.max(
      this.sheet.bbox.maxX - this.sheet.bbox.minX,
      this.sheet.bbox.maxY - this.sheet.bbox.minY,
    );
    return {
      classes: set.classes,
      bundles: set.bundles,
      orphans: set.orphans,
      chainPreview: previewOf(set.chains, this.sheet.styles, ext),
      warnings: set.warnings,
    };
  }

  private piecesStage(input: StageIO['pieces']['in']): StageIO['pieces']['out'] {
    if (!this.sheet) throw new ImportError('out-of-order', 'assemble the sheet first', 'pieces');
    if (!this.fast || input.edits.length || input.seeds?.some((s) => s.origin === 'click'))
      throw stageUnavailable('pieces');
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
    this.run = this.fast.run;
    return { seeds: this.fast.seeds, families };
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
    const seedOf = new Map(sem.pieces.map((p) => [p.identity, p.seed]));
    const wallsOf = (identity: string, rank: number): PtMm[][] | undefined => {
      const seed = seedOf.get(identity);
      const cand = this.families
        ?.find((f) => f.seed === seed)
        ?.candidates.find((c) => c.rank === rank);
      if (!cand || !this.chains) return undefined;
      return cand.walls.map((id) => this.chains!.chains[id]?.pts ?? []).filter((w) => w.length > 1);
    };
    const sizeTokens = new Set(input.sizes.map((s) => s.token.toLowerCase()));
    const scopes: DraftScope[] = [];
    const gate: Record<string, GateReport> = {};
    // FabricAssignment.byPurpose is keyed by the scope key (purpose literal or BOM lineKey, F13).
    const assigned = (scope: DraftScopeTarget, p: PieceSpec) =>
      input.assignment.byPurpose[scope.scopeKey]?.includes(p.seed) ?? pieceInScope(p, scope);
    let k = 0;
    for (const scope of input.scopes) {
      ctx.progress(k++, input.scopes.length, scope.label);
      const pieces = sem.pieces.filter((p) => assigned(scope, p));
      if (!pieces.length) continue;
      const res = await writeAndGate(
        {
          techCardId: 0,
          scope,
          pieces,
          sizes: input.sizes,
          source,
          generator: input.generator,
          dialect: input.dialect,
        },
        {
          rules: cardRules,
          sizeTokens,
          wallsOf,
          hausdorffP95Mm: raster ? PATIMPORT.hausdorffP95RasterMm : PATIMPORT.hausdorffP95VectorMm,
        },
      );
      const base = (this.files[0]?.name ?? 'pattern').replace(/\.[^.]+$/, '');
      scopes.push({
        target: scope,
        filename: `${base}-${scope.label.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.dxf`,
        name: '',
        dxfText: res.dxfText,
        manifest: res.detail.manifest,
        identities: [...new Set(res.detail.plan.blocks.map((b) => b.identity))],
      });
      gate[scope.scopeKey] = res.report;
    }
    ctx.progress(input.scopes.length, input.scopes.length);
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
