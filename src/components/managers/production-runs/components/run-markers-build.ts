// СБОРКА МАРКЕРОВ ПАРТИИ со страницы прогона: один маркер на (материал × колорвей), все размеры
// партии в соотношении, ужатом на НОД (planBatchMarkers, режим 'batch'). Модуль тяжёлый
// (планировщик, геометрия, воркер) и грузится динамическим import'ом только по кнопке.
//
// Порядок тот же, что у очереди на костинге: воркер держит ОДИН разбор, поэтому ткань за тканью —
// скачать листы, разобрать, спланировать эту ткань и сразу прогнать её задания на живом разборе.
import type {
  common_Material,
  common_TechCardMarkerSummary,
  googletype_Decimal,
} from 'api/proto-http/admin';
import {
  aliasInScope,
  bindingScopes,
  fabricScopes,
  isRollGoodsSection,
  markerScopeDirection,
} from 'components/managers/tech-card/components/bom-purpose';
import {
  planBatchMarkers,
  type BatchCell,
  type MarkerJob,
  type PlanScope,
} from 'components/managers/tech-card/components/nesting/batch-marker-plan';
import {
  slotCutWidth,
  type MarkerColorway,
} from 'components/managers/tech-card/components/nesting/colorway-widths';
import {
  dxfSheetsByScope,
  type ScopedSheet,
} from 'components/managers/tech-card/components/nesting/dxf-by-scope';
import { saveMarkerJob } from 'components/managers/tech-card/components/nesting/marker-save';
import { roleWord, scopeLabel } from 'components/managers/tech-card/components/nesting/scope-label';
import { fetchMediaBlob } from 'lib/features/media-blob';
import type { NestResult } from 'lib/nesting/types';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { NestingWorkerClient } from 'lib/nesting/worker/client';
import { extractFieldViolations } from 'utils/field-errors';
import { isManualKept, refusalWord, type RunMarkerIssue } from './run-markers';

export type BuildBomItem = {
  section?: string;
  name?: string;
  unit?: string;
  lineKey?: string;
  purpose?: string;
  fabricDirection?: string;
  isSample?: boolean;
  fabricWidth?: string;
  effectiveFabricWidthCm?: string;
  selvedgeCm?: string;
  materialId?: number;
};

export type BuildInput = {
  techCardId: number;
  runId: number;
  bomItems: readonly BuildBomItem[];
  patterns: readonly {
    url?: string;
    name?: string;
    filename?: string;
    bomLineKey?: string;
    fabricPurpose?: string;
  }[];
  pieceDxfAliases: readonly {
    bomLineKey?: string;
    fabricPurpose?: string;
    blockName?: string;
    pieceLineKey?: string;
  }[];
  cardSeamAllowanceRaw: string | null | undefined;
  workshopSeamAllowance: googletype_Decimal | undefined;
  colorways: readonly MarkerColorway[];
  materialById: ReadonlyMap<number, common_Material>;
  cells: readonly BatchCell[];
  sizeLabel: (sizeId: number) => string;
  sizeOrderOf: (sizeId: number) => number;
  sizeTokensOf: (sizeId: number) => string[];
  dictTokens: { has(token: string): boolean };
  cardMarkers: readonly common_TechCardMarkerSummary[];
  runMarkers: readonly common_TechCardMarkerSummary[];
  referencedMarkerIds: ReadonlySet<number>;
  isAlive: () => boolean;
  onProgress: (done: number, total: number) => void;
};

export type BuildOutcome = { refusals: RunMarkerIssue[]; failures: RunMarkerIssue[] };

export async function buildRunMarkers(inp: BuildInput): Promise<BuildOutcome> {
  const rollLines = inp.bomItems
    .filter((b) => isRollGoodsSection(b.section) && !!b.lineKey)
    .map((b) => ({
      lineKey: b.lineKey as string,
      purpose: b.purpose ?? '',
      name: b.name ?? '',
      section: b.section ?? '',
      unit: b.unit ?? '',
      fabricDirection: b.fabricDirection ?? '',
      isSample: !!b.isSample,
      fabricWidth: b.fabricWidth ?? '',
      effectiveFabricWidthCm: b.effectiveFabricWidthCm ?? '',
      selvedgeCm: b.selvedgeCm ?? '',
      materialId: Number(b.materialId ?? 0),
    }));
  const scopeDefs = fabricScopes(rollLines);
  const sheetsByScope = dxfSheetsByScope([...inp.patterns], scopeDefs);
  const links = bindingScopes(scopeDefs, [...inp.pieceDxfAliases]);
  const cwIdByLabel = new Map(inp.colorways.map((c) => [c.label, c.colorwayId]));
  const runColorways = [...new Set(inp.cells.map((c) => c.colorwayId))].filter((id) => id > 0);

  const refusals: RunMarkerIssue[] = [];
  const failures: RunMarkerIssue[] = [];
  const lineOf = (s: (typeof scopeDefs)[number]) => s.lines[0]?.lineKey ?? '';
  // Ручной маркер пары не перестраивается — такие пары не входят ни в план, ни в счётчик.
  const pendingOf = (s: (typeof scopeDefs)[number]) =>
    runColorways.filter((cw) => !isManualKept(inp.runMarkers, cw, lineOf(s)));
  const total = scopeDefs.reduce((n, s) => n + pendingOf(s).length, 0);
  let done = 0;
  const tick = (n = 1) => {
    done += n;
    inp.onProgress(Math.min(done, total), total);
  };
  inp.onProgress(0, total);

  const client = new NestingWorkerClient();
  try {
    for (const scope of scopeDefs) {
      if (!inp.isAlive()) break;
      const pending = pendingOf(scope);
      if (pending.length === 0) continue;
      const lineKey = lineOf(scope);
      const failAll = (word: string) => {
        for (const cw of pending) failures.push({ lineKey, colorwayId: cw, word });
        tick(pending.length);
      };
      const sheets = sheetsByScope.get(scope.key) ?? [];
      const line = scope.lines.length === 1 ? scope.lines[0] : undefined;
      const slot = line ? slotCutWidth(line) : { cutCm: NaN, selvedgeCm: 0 };
      const article = line?.materialId ? inp.materialById.get(line.materialId) : undefined;
      let planScope: PlanScope = {
        key: scope.key,
        label: scopeLabel(scope.key, scope.byPurpose, scope.lines),
        role: roleWord(scope.lines[0]?.section ?? ''),
        lineKey: line?.lineKey ?? '',
        lineCount: scope.lines.length,
        unit: line?.unit ?? '',
        slotCutCm: slot.cutCm,
        slotSelvedgeCm: slot.selvedgeCm,
        slotArticleName: article?.name?.trim() || line?.name?.trim() || '',
        direction: markerScopeDirection(line?.lineKey ?? '', rollLines),
        sheets,
        failedSheets: [],
        aliases: inp.pieceDxfAliases.filter((a) => aliasInScope(a, scope, links)),
        pieces: [],
        detectedUnit: 'mm',
        parseWarnings: [],
      };
      let parseId = 0;
      if (sheets.length > 0 && line) {
        const { files, failed } = await sheetFiles(sheets);
        if (!inp.isAlive()) break;
        if (failed.length > 0 || files.length === 0) {
          planScope = {
            ...planScope,
            failedSheets: failed.length > 0 ? failed : sheets.map((s) => s.name),
            parseWarnings: [`sheets didn't download: ${failed.join(', ') || 'all'}`],
          };
        } else {
          try {
            const res = await client.parse(files, {
              unit: 'auto',
              tol: NEST_DEFAULTS.tol,
              tolChain: NEST_DEFAULTS.tolChain,
            });
            parseId = res.parseId;
            planScope = {
              ...planScope,
              pieces: res.pieces,
              detectedUnit: res.detectedUnit,
              parseWarnings: res.warnings,
            };
          } catch {
            failAll('parse');
            continue;
          }
          if (!inp.isAlive()) break;
        }
      }

      const plan = planBatchMarkers({
        mode: 'batch',
        productionRunId: inp.runId,
        cells: inp.cells,
        scopes: [planScope],
        looseSheets: [],
        colorways: inp.colorways,
        sizeLabel: inp.sizeLabel,
        sizeOrderOf: inp.sizeOrderOf,
        sizeTokensOf: inp.sizeTokensOf,
        dictTokens: inp.dictTokens,
        markers: inp.cardMarkers,
        runMarkers: inp.runMarkers,
        referencedMarkerIds: inp.referencedMarkerIds,
        timeBudgetMs: NEST_DEFAULTS.timeBudgetMs,
        cardSeamAllowanceRaw: inp.cardSeamAllowanceRaw,
        workshopSeamAllowance: inp.workshopSeamAllowance,
      });
      for (const r of plan.refusals) {
        refusals.push({
          lineKey,
          colorwayId: r.colorwayLabel ? cwIdByLabel.get(r.colorwayLabel) ?? 0 : 0,
          word: refusalWord(r.reason),
        });
      }
      const jobs = plan.jobs.filter(
        (j) => !isManualKept(inp.runMarkers, j.colorwayId, j.bomLineKey),
      );
      tick(Math.max(0, pending.length - jobs.length));
      for (const job of jobs) {
        if (!inp.isAlive()) break;
        const result = parseId > 0 ? await nestOne(client, job, parseId) : null;
        if (!inp.isAlive()) break;
        if (!result || result.cancelled) {
          failures.push({ lineKey: job.bomLineKey, colorwayId: job.colorwayId, word: 'nesting' });
          tick();
          continue;
        }
        const ok = await saveWithRetry(inp, job, result, sheets);
        if (!ok)
          failures.push({ lineKey: job.bomLineKey, colorwayId: job.colorwayId, word: 'save' });
        tick();
      }
    }
  } finally {
    client.terminate();
  }
  return { refusals, failures };
}

async function sheetFiles(sheets: ScopedSheet[]): Promise<{ files: File[]; failed: string[] }> {
  const settled = await Promise.allSettled(
    sheets.map(async (s) => new File([await fetchMediaBlob(s.url)], s.name)),
  );
  const files: File[] = [];
  const failed: string[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') files.push(r.value);
    else failed.push(sheets[i].name);
  });
  return { files, failed };
}

function nestOne(
  client: NestingWorkerClient,
  job: MarkerJob,
  parseId: number,
): Promise<NestResult | null> {
  const { done } = client.nest(parseId, job.config, () => {});
  return done.catch(() => null);
}

// Сохранение с одним повтором — как у очереди: полевое нарушение не повторяется.
async function saveWithRetry(
  inp: BuildInput,
  job: MarkerJob,
  result: NestResult,
  sheets: ScopedSheet[],
): Promise<boolean> {
  const args = {
    job,
    result,
    urlBySource: new Map(sheets.map((s) => [s.name, s.url])),
    provenanceNote: `captured by "build markers" on the run page of run #${inp.runId}: RUN LAY, composition ${job.sizeLabel} (the size ratio of the run, reduced by the GCD) — the measured efficiency IS the real cutting percent of this run.`,
  };
  try {
    await saveMarkerJob(inp.techCardId, args);
    return true;
  } catch (e) {
    if (extractFieldViolations(e).length > 0 || !inp.isAlive()) return false;
  }
  try {
    await saveMarkerJob(inp.techCardId, args);
    return true;
  } catch {
    return false;
  }
}
