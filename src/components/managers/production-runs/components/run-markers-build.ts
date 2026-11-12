// СБОРКА МАРКЕРОВ ПАРТИИ со страницы прогона: один маркер на (материал × колорвей), все размеры
// партии в соотношении, ужатом на НОД (planBatchMarkers, режим 'batch'). Маркер длиннее стола
// пересобирается частями A, B, … — размеры делятся на группы под стол (splitSizesByTable), каждая
// группа — свой маркер прогона; прежние авто-маркеры пары убираются. Модуль тяжёлый
// (планировщик, геометрия, воркер) и грузится динамическим import'ом только по кнопке.
//
// Порядок тот же, что у очереди на костинге: воркер держит ОДИН разбор, поэтому ткань за тканью —
// скачать листы, разобрать, спланировать эту ткань и сразу прогнать её задания на живом разборе.
import { adminService } from 'api/api';
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
import {
  isManualKept,
  refusalWord,
  sizeLengthEstimates,
  splitSizesByTable,
  staleAutoMarkerIds,
  type RunMarkerIssue,
} from './run-markers';

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
  /** Длина стола, см: маркер длиннее делится на A, B, … */
  tableCm: number;
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

      const planArgs = {
        mode: 'batch' as const,
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
      };
      const plan = planBatchMarkers(planArgs);
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
        const fail = (word: string) => {
          failures.push({ lineKey: job.bomLineKey, colorwayId: job.colorwayId, word });
          tick();
        };
        const result = parseId > 0 ? await nestOne(client, job, parseId) : null;
        if (!inp.isAlive()) break;
        if (!result || result.cancelled) {
          fail('nesting');
          continue;
        }
        // Длиннее стола — пересобрать группами размеров; длинный целый маркер не сохраняется.
        let toSave: { job: MarkerJob; result: NestResult }[] = [{ job, result }];
        let splitFail = '';
        const groups =
          result.usedLengthCm > inp.tableCm && job.sizes.length > 1
            ? splitSizesByTable(sizeEstimates(job, result.usedLengthCm), inp.tableCm)
            : [];
        if (groups.length > 1) {
          toSave = [];
          for (const g of groups) {
            const gPlan = planBatchMarkers({
              ...planArgs,
              cells: inp.cells.filter(
                (c) => c.colorwayId === job.colorwayId && g.includes(c.sizeId),
              ),
            });
            const gJob = gPlan.jobs.find((j) => j.colorwayId === job.colorwayId);
            if (!gJob) {
              splitFail = 'split';
              break;
            }
            const gRes = await nestOne(client, gJob, parseId);
            if (!inp.isAlive()) break;
            if (!gRes || gRes.cancelled) {
              splitFail = 'nesting';
              break;
            }
            toSave.push({ job: gJob, result: gRes });
          }
          if (!inp.isAlive()) break;
        }
        if (splitFail) {
          fail(splitFail);
          continue;
        }
        const keepIds = new Set<number>();
        let saved = true;
        for (const one of toSave) {
          const id = await saveWithRetry(inp, one.job, one.result, sheets, toSave.length > 1);
          if (id == null) {
            saved = false;
            break;
          }
          if (id > 0) keepIds.add(id);
          if (one.job.replaces?.id) keepIds.add(one.job.replaces.id);
        }
        if (!saved) {
          fail('save');
          continue;
        }
        // Пересборка заменяет авто-маркеры пары: прежний целый или прежние A, B под другой стол.
        await deleteStale(
          staleAutoMarkerIds({
            runMarkers: inp.runMarkers,
            colorwayId: job.colorwayId,
            lineKey: job.bomLineKey,
            colorwayLabel: job.colorwayLabel,
            keepIds,
            referencedMarkerIds: inp.referencedMarkerIds,
          }),
        );
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
  part: boolean,
): Promise<number | null> {
  const args = {
    job,
    result,
    urlBySource: new Map(sheets.map((s) => [s.name, s.url])),
    provenanceNote: `captured by "build markers" on the run page of run #${inp.runId}: RUN LAY, composition ${job.sizeLabel} (${part ? `one part of the run ratio, split to fit a ${inp.tableCm / 100} m table` : 'the size ratio of the run, reduced by the GCD'}) — the measured efficiency IS the real cutting percent of this run.`,
  };
  try {
    return await saveMarkerJob(inp.techCardId, args);
  } catch (e) {
    if (extractFieldViolations(e).length > 0 || !inp.isAlive()) return null;
  }
  try {
    return await saveMarkerJob(inp.techCardId, args);
  } catch {
    return null;
  }
}

// Доля размеров в длине целого маркера — по площадям деталей задания.
function sizeEstimates(job: MarkerJob, lengthCm: number) {
  const areaById = new Map(job.pieces.map((p) => [p.id, p.areaCm2]));
  return sizeLengthEstimates({
    sizes: job.sizes.map((s) => ({ sizeId: s.sizeId, units: s.units })),
    pieces: job.config.pieces.map((p) => ({
      sizeId: job.sizeIdByPieceId.get(p.pieceId) ?? 0,
      areaCm2: areaById.get(p.pieceId) ?? 0,
      quantity: p.quantity,
    })),
    lengthCm,
  });
}

// Удаление старого не валит сборку: не удалилось — останется строкой, настил его не возьмёт.
async function deleteStale(ids: number[]): Promise<void> {
  for (const id of ids) {
    try {
      await adminService.DeleteTechCardMarker({ id });
    } catch {
      // оставляем
    }
  }
}
