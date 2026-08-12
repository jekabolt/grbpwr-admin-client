// РАСКРОЙ ПАРТИИ — очередь раскладок прямо на вкладке костинга.
//
// Вопрос владельца: «выбрать конкретную партию конкретных колорвеев и сколько сайзов каждого
// колорвея мы будем делать, на основании этого сделать раскладку или набор раскладок, где мы
// полностью будем видеть реальный вейстедж и юзедж каждой ткани». Состав партии набирается блоком
// выше; здесь он превращается в НАБОР РАСКЛАДОК и в измеренный расход по каждой ткани.
//
// ═══ ПОЧЕМУ ЭТО ОЧЕРЕДЬ В ОТКРЫТОЙ ВКЛАДКЕ, А НЕ КНОПКА «ПОСЧИТАТЬ» ════════════════════════════
//
// Движок раскладки живёт в ВЕБ-ВОРКЕРЕ этого браузера, и другого исполнителя нет: DXF на сервере
// разбирать нечем. Значит «автоматически» здесь может означать только одно — очередь заданий в
// открытой вкладке, с прогрессом и честной оценкой времени. Обещать фоновый расчёт было бы враньём:
// уход со страницы карточки убивает воркер вместе с очередью.
//
// Цена одного задания растёт как КВАДРАТ числа деталей (предпросчёт платится за пары контуров): 20
// деталей — секунды, 45 деталей на бюджете в 20 с съедают весь бюджет предпросчётом и не делают ни
// одного поколения поиска. Поэтому у каждого задания на экране стоит его СОБСТВЕННАЯ оценка,
// посчитанная той же функцией, которую движок зовёт внутри себя, — и оператор видит цену ДО того,
// как её заплатит.
//
// ═══ ОДИН ВОРКЕР, ПОСЛЕДОВАТЕЛЬНО ══════════════════════════════════════════════════════════════
//
// Генетический поиск между уступками потоку почти синхронен, поэтому два задания на одном воркере
// не распараллелились бы, а выстроились бы в ту же очередь плюс лишняя латентность. Несколько
// воркеров — отдельная оптимизация, и в этой волне её нет.
//
// ВОРКЕР ДЕРЖИТ РОВНО ОДИН РАЗБОР (`currentParse` в nesting.worker.ts): новый разбор ЗАМЕЩАЕТ
// прежний. Отсюда весь порядок работы очереди — задания идут сгруппированными по ткани, и разбор
// делается по одному на ткань. Скачанные файлы кешируются в памяти вкладки, поэтому повторный
// разбор той же ткани не платит за CDN.
import { adminService } from 'api/api';
import type {
  common_Material,
  common_ProductionRun,
  common_TechCard,
  common_TechCardColorwayUsage,
} from 'api/proto-http/admin';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useWorkshopSettings } from 'components/managers/workshop/useWorkshopSettings';
import { useQueryClient } from '@tanstack/react-query';
import { fetchMediaBlob } from 'lib/features/media-blob';
import { useSnackBarStore } from 'lib/stores/store';
import type { NestResult, PieceDTO } from 'lib/nesting/types';
import { NEST_DEFAULTS, allowsFlip } from 'lib/nesting/types';
import { NestingWorkerClient } from 'lib/nesting/worker/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import CheckboxCommon from 'ui/components/checkbox';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { extractFieldViolations } from 'utils/field-errors';
import {
  aliasInScope,
  fabricScopes,
  isRollGoodsSection,
  markerScopeDirection,
  type RollGoodsLine,
} from './bom-purpose';
import { bomPurposeLabel } from './bom-purpose-labels';
import {
  planBatchMarkers,
  type BatchCell,
  type MarkerJob,
  type PlanScope,
} from './nesting/batch-marker-plan';
import { sizeTokensOf } from './nesting/block-code';
import { colorwayLabelOf, markerColorways, slotCutWidth } from './nesting/colorway-widths';
import { dxfSheetsByScope, type ScopedSheet } from './nesting/dxf-by-scope';
import { weightBasisOf } from './nesting/fabric-weight';
import {
  bomUnitKind,
  buildMarkerLayout,
  cardMarkers,
  dec,
  legacyPairOf,
  toBomUnit,
  type MarkerCompositionEntry,
} from './nesting/marker-io';
import { useDictionarySizeTokens } from './nesting/use-block-sizes';
import type { TechCardFormData } from './schema';

// Тот же жёсткий стоп, что у одиночной раскладки: «остановить» — сперва мягкая отмена (поиск
// возвращает лучшее из найденного), и если воркер молчит дольше этого, его убивают. Разбор живёт
// внутри воркера и умирает вместе с ним — поэтому после жёсткого стопа ткань разбирается заново.
const HARD_STOP_MS = 1500;
// Кадры прогресса чаще этого не перерисовываем: очередь рисует таблицу целиком.
const PROGRESS_MIN_MS = 250;
type JobStatus = 'queued' | 'running' | 'saving' | 'done' | 'failed' | 'skipped';

type JobRun = {
  status: JobStatus;
  /** Предпросчёт NFP: сколько пар посчитано. null = стадия поиска. */
  nfp: { done: number; total: number } | null;
  generation: number;
  /** Лучший КПД на текущем поколении, % — чтобы прогресс не был одним крутящимся колесом. */
  bestPct: number | null;
  result: NestResult | null;
  markerId: number;
  error: string;
};

type Phase = 'idle' | 'preparing' | 'ready' | 'running';

const blankRun = (): JobRun => ({
  status: 'queued',
  nfp: null,
  generation: 0,
  bestPct: null,
  result: null,
  markerId: 0,
  error: '',
});

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const meters = (cm: number) => `${(cm / 100).toFixed(2)} м`;

/** Слово для источника расхода, лежащего в рецепте. */
function sourceWord(source: string | undefined): string {
  const s = (source ?? '').trim();
  if (s === 'dxf') return 'оценка по площади выкроек';
  if (s === 'marker') return 'из раскладки';
  return 'введено руками';
}

export function BatchMarkerQueue({
  techCard,
  techCardId,
  run,
  canEdit,
  frozen,
}: {
  /** Карточка КАК ПРОЧИТАНА с сервера: пины рецепта и сегодняшние раскладки живут только здесь. */
  techCard?: common_TechCard;
  techCardId: number;
  /** Партия-база с линиями. Она решает ТОЛЬКО, какие пары (колорвей, размер) раскладывать. */
  run: common_ProductionRun;
  /** tech_cards:write. Без него раскладку не сохранить — сервер откажет. */
  canEdit: boolean;
  /** Карточка выпущена. См. releasedRefusal ниже: это ОТКАЗ, а не ограничение интерфейса. */
  frozen: boolean;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const sizeById = useSizeNames();
  const orderSizes = useSizeOrdering();
  const dictTokens = useDictionarySizeTokens();
  const workshop = useWorkshopSettings();
  const { data: materialsData } = useMaterials('', true, true);

  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as Array<{
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
  }>;
  const patterns = (useWatch({ control, name: 'patterns' }) ?? []) as Array<{
    url?: string;
    name?: string;
    filename?: string;
    bomLineKey?: string;
    fabricPurpose?: string;
  }>;
  const cardSeamRaw = (useWatch({ control, name: 'requiredSeamAllowanceMm' }) ?? null) as
    | string
    | null;

  const materialById = useMemo(() => {
    const m = new Map<number, common_Material>();
    for (const mat of materialsData?.materials ?? []) if (mat.id) m.set(Number(mat.id), mat);
    return m;
  }, [materialsData]);

  // ── что вообще есть у карточки: ткани, листы, колорвеи, раскладки ─────────────────────────
  const rollLines = useMemo(
    () =>
      bomItems
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
        })),
    [bomItems],
  );
  const scopeDefs = useMemo(() => fabricScopes(rollLines), [rollLines]);
  const sheetsByScope = useMemo(() => dxfSheetsByScope(patterns, scopeDefs), [patterns, scopeDefs]);
  // Листы, не принадлежащие ни одной живой ткани. Ключ '' — законный ответ резолвера, и без него
  // они просто не участвовали бы в раскрое молча (подготовка обходит только живые скоупы).
  const looseSheets = useMemo(() => sheetsByScope.get('') ?? [], [sheetsByScope]);
  const colorways = useMemo(
    () => markerColorways(techCard, materialById),
    [techCard, materialById],
  );
  const markers = useMemo(() => cardMarkers(techCard?.markers), [techCard?.markers]);
  // Сопоставление «блок DXF → деталь кроя», как его записал диалог сопоставления. Фильтруется по
  // ткани ЗДЕСЬ, потому что скоуп знает эта сторона: у одного имени блока на подкладе и на верхе
  // разные детали кроя. Вторую половину (идентичность блока) добавит разбор — см. планировщик.
  const pieceDxfAliases = (useWatch({ control, name: 'pieceDxfAliases' }) ?? []) as Array<{
    bomLineKey?: string;
    fabricPurpose?: string;
    blockName?: string;
    pieceLineKey?: string;
  }>;

  // ПОДГОТОВКА ПРОТУХАЕТ. Разбор — это СНИМОК: ширины артикулов, набор листов и состав тканей могут
  // измениться на соседней вкладке, которая всё это время смонтирована. Запустить очередь по
  // устаревшему снимку значит снять раскладку на ширине, которой у ткани уже нет, — и записать её
  // как норму. Подпись покрывает ровно то, от чего зависит план: состав скоупов, их листы, ширины и
  // кромки (слота и пинов), направление, единицу и сопоставление деталей.
  const prepSignature = useMemo(() => {
    const scopes = scopeDefs.map((s) => {
      const line = s.lines.length === 1 ? s.lines[0] : undefined;
      const w = line ? slotCutWidth(line) : { cutCm: NaN, selvedgeCm: 0 };
      const sheets = (sheetsByScope.get(s.key) ?? []).map((x) => x.url).join(',');
      return `${s.key}|${s.lines.map((l) => l.lineKey).join('+')}|${w.cutCm}|${w.selvedgeCm}|${line?.unit ?? ''}|${line?.fabricDirection ?? ''}|${sheets}`;
    });
    const pins = colorways
      .map(
        (c) =>
          `${c.colorwayId}:${[...c.widthByLine]
            .map(([k, v]) => `${k}=${v.cutCm}/${v.selvedgeCm}`)
            .join(',')}`,
      )
      .join(';');
    const aliases = pieceDxfAliases
      .map(
        (a) =>
          `${a.fabricPurpose ?? ''}/${a.bomLineKey ?? ''}/${a.blockName ?? ''}=${a.pieceLineKey ?? ''}`,
      )
      .join(';');
    return `${scopes.join('#')}||${pins}||${aliases}||${looseSheets.map((s) => s.url).join(',')}`;
  }, [scopeDefs, sheetsByScope, colorways, pieceDxfAliases, looseSheets]);

  /** Клетки партии с ненулевым количеством: (колорвей = product_id, размер). */
  const cells: BatchCell[] = useMemo(
    () =>
      (run.run?.lines ?? [])
        .filter((l) => (l.plannedQty ?? 0) > 0)
        .map((l) => ({
          colorwayId: Number(l.productId ?? 0),
          sizeId: Number(l.sizeId ?? 0),
          qty: Number(l.plannedQty ?? 0),
        })),
    [run],
  );
  // Порядок размеров — тот же, что везде на карточке (система размеров, а не алфавит): «L, M, S»
  // читалось бы как порча данных.
  const sizeOrder = useMemo(
    () => new Map(orderSizes([...new Set(cells.map((c) => c.sizeId))]).map((id, i) => [id, i])),
    [cells, orderSizes],
  );

  // ── состояние очереди ────────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('idle');
  const [prepError, setPrepError] = useState('');
  // Подготовка вместе с подписью данных, по которым она снята: см. prepSignature.
  const [parsed, setParsed] = useState<{ scopes: PlanScope[]; signature: string } | null>(null);
  const [budgetS, setBudgetS] = useState(NEST_DEFAULTS.timeBudgetMs / 1000);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [runs, setRuns] = useState<Record<string, JobRun>>({});
  const stale = !!parsed && parsed.signature !== prepSignature;

  const clientRef = useRef<NestingWorkerClient | null>(null);
  // Скачанные листы по ткани. Разбор воркер держит ровно один, и повторный разбор той же ткани
  // неизбежен; платить за CDN второй раз при этом не за что.
  const filesRef = useRef(new Map<string, File[]>());
  // Какая ткань разобрана в воркере ПРЯМО СЕЙЧАС. null = разбора нет (воркер новый либо убит).
  const liveParse = useRef<{ scopeKey: string; parseId: number } | null>(null);
  const stopRef = useRef(false);
  const skipRef = useRef(false);
  const cancelRef = useRef<(() => void) | null>(null);
  // Компонент ещё на экране. `start()` — обычная асинхронная функция, она НЕ ПРИВЯЗАНА к
  // жизненному циклу: убить воркер мало, цикл продолжится, поднимет новый воркер (клиент
  // пересоздаётся лениво), перепарсит следующую ткань и запишет на сервер раскладки ПРЕДЫДУЩЕЙ
  // партии — уже после того, как оператор с неё ушёл. Ссылку читает и цикл, и `patch`.
  const aliveRef = useRef(true);

  const client = useCallback((): NestingWorkerClient => {
    if (!clientRef.current) clientRef.current = new NestingWorkerClient();
    return clientRef.current;
  }, []);

  // Размонтирование ОСТАНАВЛИВАЕТ ОЧЕРЕДЬ, а не только глушит воркер. Смена базы расчёта
  // размонтирует компонент (родитель держит `key={batchRunId}`), и всё, что цикл сделал бы дальше,
  // относилось бы к партии, которой на экране больше нет.
  useEffect(
    () => () => {
      aliveRef.current = false;
      stopRef.current = true;
      cancelRef.current?.();
      cancelRef.current = null;
      liveParse.current = null;
      clientRef.current?.terminate();
      clientRef.current = null;
    },
    [],
  );

  // ── отказы, которые надо назвать ДО единого прогона ───────────────────────────────────────
  //
  // ВЫПУЩЕННАЯ КАРТОЧКА НЕ ПРИНИМАЕТ КАРТОЧНЫХ РАСКЛАДОК, и это не осторожность экрана, а слово
  // сервера: SaveMarker требует изменяемую карточку для всего, что не принадлежит прогону
  // (production_run_id = 0 — а здесь все раскладки такие: только карточная может стать НОРМОЙ,
  // прогонной это запрещено CHECK'ом chk_tcm_run_not_norm). То есть на релизнутой карточке каждое
  // задание отработало бы полный бюджет и получило отказ на сохранении — десятки минут счёта в
  // мусор. Поэтому запрет стоит ДО запуска и называет обходной путь.
  const releasedRefusal = frozen
    ? 'карточка выпущена: сервер не принимает на неё карточные раскладки (SaveMarker требует изменяемую карточку). Раскладку под конкретный настил снимают со страницы партии — она принадлежит прогону; переснять норму стиля можно, только сняв карточку с релиза.'
    : '';
  const rightsRefusal = !canEdit ? 'нет прав на изменение тех-карт — раскладку не сохранить' : '';
  const savedRefusal = !techCardId
    ? 'карточка ещё не сохранена — привязать раскладку не к чему'
    : '';
  const blocked = releasedRefusal || rightsRefusal || savedRefusal;

  // ── план ──────────────────────────────────────────────────────────────────────────────────
  const plan = useMemo(() => {
    if (!parsed) return null;
    return planBatchMarkers({
      cells,
      scopes: parsed.scopes,
      looseSheets,
      colorways,
      sizeLabel: (id) => formatSizeName(sizeById.get(id) ?? `#${id}`),
      sizeTokensOf: (id) => sizeTokensOf(sizeById.get(id)),
      dictTokens,
      markers,
      timeBudgetMs: Math.max(1, budgetS) * 1000,
      cardSeamAllowanceRaw: cardSeamRaw,
      workshopSeamAllowance: workshop.data?.settings?.defaultSeamAllowanceMm,
    });
  }, [
    parsed,
    cells,
    colorways,
    sizeById,
    dictTokens,
    markers,
    budgetS,
    cardSeamRaw,
    workshop.data,
  ]);

  // Задание с уже снятой раскладкой ПРЕДВЫБРАНО ВЫКЛЮЧЕННЫМ: пересъёмка стоит бюджета и двигает
  // число, которое, возможно, уже применено в рецепт. Галочка остаётся — переснять законно.
  const isOn = (j: MarkerJob) => (j.id in off ? !off[j.id] : !j.replaces);
  const selectedJobs = useMemo(
    () => (plan?.jobs ?? []).filter(isOn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, off],
  );

  // ── подготовка: скачать и разобрать выкройки каждой ткани ─────────────────────────────────
  const prepare = async () => {
    setPhase('preparing');
    setPrepError('');
    setRuns({});
    // Подпись снимается ДО первого await: план обязан помнить, по каким данным он снят, а не по
    // тем, какими они стали, пока качались файлы.
    const signature = prepSignature;
    const out: PlanScope[] = [];
    try {
      for (const scope of scopeDefs) {
        const sheets = sheetsByScope.get(scope.key) ?? [];
        const line = scope.lines.length === 1 ? scope.lines[0] : undefined;
        const slot = line ? slotCutWidth(line) : { cutCm: NaN, selvedgeCm: 0 };
        const article = line?.materialId ? materialById.get(line.materialId) : undefined;
        const base: PlanScope = {
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
          // Алиасы ЭТОЙ ткани — тем же резолвером скоупа, каким их фильтрует панель выкроек: алиас,
          // записанный до разбора BOM, лежит на СТРОКЕ, а его ткань уже могла стать назначением.
          aliases: pieceDxfAliases.filter((a) => aliasInScope(a, scope)),
          pieces: [],
          detectedUnit: 'mm',
          parseWarnings: [],
        };
        // Скоуп без листов и скоуп с несколькими строками разбирать незачем — планировщик по ним
        // всё равно откажет, а разбор стоит скачивания.
        if (sheets.length === 0 || !line) {
          out.push(base);
          continue;
        }
        const { files, failed } = await sheetFiles(scope.key, sheets);
        // Недокачанные листы едут ОТДЕЛЬНЫМ полем (планировщик по ним отказывает) И В
        // parseWarnings: если задание всё же когда-нибудь сохранится, блоб обязан нести признак
        // того, из чего он собран.
        if (failed.length > 0 || files.length === 0) {
          out.push({
            ...base,
            failedSheets: failed.length > 0 ? failed : sheets.map((s) => s.name),
            parseWarnings: [`не скачались листы: ${failed.join(', ') || 'все'}`],
          });
          continue;
        }
        const res = await client().parse(files, {
          unit: 'auto',
          tol: NEST_DEFAULTS.tol,
          tolChain: NEST_DEFAULTS.tolChain,
        });
        if (!aliveRef.current) return;
        liveParse.current = { scopeKey: scope.key, parseId: res.parseId };
        out.push({
          ...base,
          pieces: res.pieces,
          detectedUnit: res.detectedUnit,
          parseWarnings: res.warnings,
        });
      }
      if (!aliveRef.current) return;
      setParsed({ scopes: out, signature });
      setPhase('ready');
    } catch (e) {
      if (!aliveRef.current) return;
      setPrepError(e instanceof Error && e.message ? e.message : 'не удалось разобрать выкройки');
      setPhase('idle');
    }
  };

  /**
   * Листы ткани как File[] — из кеша вкладки либо с CDN.
   *
   * ЧЕГО НЕ ХВАТИЛО, ВОЗВРАЩАЕТСЯ ЗНАЧЕНИЕМ. `allSettled` здесь не «терпимость к сбою», а способ
   * узнать ИМЯ пропавшего листа: раньше провал уезжал в общую строку на экране, ткань разбиралась
   * по остатку, и раскладка выходила полной по всем счётчикам — без рукавов.
   *
   * Ключ кеша — СОДЕРЖИМОЕ пачки (адреса листов), а не ключ ткани: выкройку перезаливают прямо на
   * соседней вкладке той же карточки, и кеш по ключу ткани молча раскладывал бы вчерашний чертёж,
   * не показав ни одного признака. Кешируется ТОЛЬКО полная пачка — неполную незачем: по ней всё
   * равно откажут, а повтор подготовки обязан попробовать скачать заново.
   */
  const sheetFiles = async (
    scopeKey: string,
    sheets: ScopedSheet[],
  ): Promise<{ files: File[]; failed: string[] }> => {
    const cacheKey = `${scopeKey}|${sheets.map((s) => s.url).join('|')}`;
    const cached = filesRef.current.get(cacheKey);
    if (cached) return { files: cached, failed: [] };
    const settled = await Promise.allSettled(
      sheets.map(async (s) => new File([await fetchMediaBlob(s.url)], s.name)),
    );
    const files: File[] = [];
    const failed: string[] = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') files.push(r.value);
      else failed.push(sheets[i].name);
    });
    if (failed.length === 0) filesRef.current.set(cacheKey, files);
    return { files, failed };
  };
  /** Тот же ключ, каким кеш заполнялся, — переразбор в очереди берёт файлы по нему. */
  const filesKeyOf = (scopeKey: string) =>
    `${scopeKey}|${(sheetsByScope.get(scopeKey) ?? []).map((s) => s.url).join('|')}`;

  // Обновление состояния ПОСЛЕ размонтирования — не только предупреждение React: это правка
  // экрана, которого нет, из цикла, который обязан был остановиться.
  const patch = (id: string, next: Partial<JobRun>) => {
    if (!aliveRef.current) return;
    setRuns((prev) => ({ ...prev, [id]: { ...(prev[id] ?? blankRun()), ...next } }));
  };

  // ── прогон одной раскладки ────────────────────────────────────────────────────────────────
  const nestOne = (job: MarkerJob, parseId: number): Promise<NestResult | null> => {
    let last = 0;
    const { id, done } = client().nest(parseId, job.config, (p) => {
      const now = Date.now();
      if (p.phase === 'ga' && now - last < PROGRESS_MIN_MS) return;
      last = now;
      if (p.phase === 'nfp') {
        patch(job.id, { nfp: { done: p.nfpDone ?? 0, total: p.nfpTotal ?? 0 } });
      } else {
        patch(job.id, {
          nfp: null,
          generation: p.generation ?? 0,
          bestPct: p.best ? Math.min(100, p.best.efficiency * 100) : null,
        });
      }
    });
    let hard: number | null = null;
    let settled = false;
    cancelRef.current = () => {
      client().cancel(id);
      // Жёсткий стоп: воркер, застрявший внутри непрерываемой геометрии, убивается. Вместе с ним
      // умирает разбор — поэтому следующая ткань (и эта тоже) разбирается заново.
      if (hard != null) window.clearTimeout(hard);
      hard = window.setTimeout(() => {
        if (settled) return;
        client().terminate();
        clientRef.current = null;
        liveParse.current = null;
      }, HARD_STOP_MS);
    };
    return done
      .then((r) => {
        settled = true;
        if (hard != null) window.clearTimeout(hard);
        return r;
      })
      .catch(() => {
        // Воркер убит (жёсткий стоп) либо упал: результата нет и не будет.
        settled = true;
        if (hard != null) window.clearTimeout(hard);
        return null;
      })
      .finally(() => {
        cancelRef.current = null;
      });
  };

  // ── сохранение ────────────────────────────────────────────────────────────────────────────
  //
  // КАЖДАЯ ГОТОВАЯ РАСКЛАДКА СОХРАНЯЕТСЯ СРАЗУ, ДО СТАРТА СЛЕДУЮЩЕЙ. Очередь идёт минутами, и
  // прерывают её обычно потому, что что-то пошло не так; накопить результаты «и сохранить всё в
  // конце» значило бы выбросить весь уже оплаченный счёт при первом же «остановить», закрытой
  // вкладке или упавшем воркере.
  const saveJob = async (job: MarkerJob, result: NestResult): Promise<number> => {
    const composition: MarkerCompositionEntry[] = [{ sizeId: job.sizeId, quantity: 1 }];
    const perSetQty = new Map<number, number>(job.config.pieces.map((p) => [p.pieceId, 1]));
    const urlBySource = new Map(
      (sheetsByScope.get(job.scopeKey) ?? []).map((s) => [s.name, s.url]),
    );
    const layout = buildMarkerLayout({
      pieces: job.pieces,
      perSetQty,
      urlBySource,
      result: {
        ...result,
        warnings: [
          ...result.warnings,
          job.seamAllowanceMm > 0
            ? `припуск на шов: ${job.seamAllowanceMm.toFixed(1)} мм (${job.seamAllowanceWhy}) — сохранён контур КРОЯ`
            : 'припуск на шов: 0 — раскладывалась ЛИНИЯ ШВА, расход занижен относительно кроя',
          `снято очередью раскроя партии #${run.id ?? 0}: настил на ОДНО изделие размера ${job.sizeLabel}. Многокомплектный настил кладётся плотнее, поэтому измеренный здесь расход идёт с запасом.`,
        ],
      },
      unit: job.detectedUnit,
      config: {
        targetLengthCm: undefined,
        // Ступень упрощения, которую движок ВЗЯЛ, а не которую просили: он грубит её сам, когда
        // задание не тянет запрошенную точность, и записать запрос значило бы соврать тому, кто
        // попробует воспроизвести этот маркер.
        rdpEpsCm: result.telemetry?.rdpEpsCm ?? NEST_DEFAULTS.rdpEpsCm,
        timeBudgetMs: job.config.timeBudgetMs,
      },
      tol: NEST_DEFAULTS.tol,
      tolChain: NEST_DEFAULTS.tolChain,
      parseWarnings: job.parseWarnings,
      composition,
      // ДЕТАЛЬ КРОЯ ЗА КАЖДЫМ КОНТУРОМ — тем же правилом, что у модалки (piece-selection.ts).
      // Без него сохранённая раскладка держится на ИМЕНИ БЛОКА и перестаёт сходиться после
      // переименования детали, а раскладки этой очереди становятся НОРМАМИ уже сегодня.
      pieceLineKeyById: job.pieceLineKeyById as Map<number, string>,
    });
    const pair = legacyPairOf(composition);
    const res = await adminService.SaveTechCardMarker({
      // Пересъёмка ЗАМЕЩАЕТ прежнюю раскладку по id — иначе на карточке копились бы близнецы, и
      // «какая из них норма» решал бы календарь.
      id: job.replaces?.id ?? 0,
      techCardId,
      marker: {
        // КАРТОЧНАЯ, ВСЕГДА. Прогонная раскладка нормой быть не может (chk_tcm_run_not_norm) и
        // умирает вместе с прогоном — то есть не может стать тем, ради чего эта фаза написана.
        productionRunId: 0,
        sizeId: pair.sizeId,
        // Имя выдал ПЛАНИРОВЩИК: только он видит разом все задания и все сегодняшние раскладки
        // карточки, а уникальность у сервера — (карточка, прогон, размер, имя), и её нарушение
        // приходит отказом ПОСЛЕ полностью оплаченного прогона.
        name: job.markerName,
        source: 'auto',
        bomLineKey: job.bomLineKey,
        colorwayId: job.colorwayId,
        fabricWidthCm: dec(job.widthCm),
        gapCm: dec(job.config.gapCm),
        edgeMarginCm: dec(job.config.edgeMarginCm),
        selvedgeCm: dec(job.selvedgeCm),
        allowCrossGrain: job.config.allowCrossGrain,
        seamAllowanceMm: dec(job.seamAllowanceMm),
        // `undefined` = «не мерялось», и это НЕ ноль: на выдуманном нуле костинг посчитал бы расход
        // по контуру, который на самом деле уже раздут.
        contourAllowanceMm:
          job.contourAllowanceMm != null ? dec(job.contourAllowanceMm) : undefined,
        contourLayer: job.contourLayer,
        grainLayer: job.grainLayer,
        // Политика переворота, ПОД КОТОРОЙ ШЁЛ ПОИСК. Выводить её из геометрии нельзя: «ни одна
        // деталь не перевёрнута» не значит «переворот был запрещён».
        allowFlip: allowsFlip(job.direction),
        sets: pair.sets,
        usedLengthCm: dec(result.usedLengthCm),
        efficiencyPct: dec(Math.min(100, result.efficiency * 100)),
        placedCount: result.placedCount,
        totalCount: result.totalCount,
        layout,
      },
    });
    return Number((res as { id?: number })?.id ?? 0);
  };

  // ── сама очередь ──────────────────────────────────────────────────────────────────────────
  const start = async () => {
    // ПРОТУХШИЙ ПЛАН НЕ ЗАПУСКАЕТСЯ. Разбор — снимок; ширина, состав тканей или сами листы могли
    // измениться на соседней смонтированной вкладке, и раскладка по старому снимку записала бы
    // норму на полотне, которого у ткани уже нет.
    if (!plan || selectedJobs.length === 0 || blocked || stale) return;
    stopRef.current = false;
    setPhase('running');
    // Задания идут СГРУППИРОВАННЫМИ ПО ТКАНИ: воркер держит один разбор, и чередование тканей
    // означало бы полный переразбор перед каждым заданием.
    const queue = [...selectedJobs].sort(
      (a, b) => a.scopeKey.localeCompare(b.scopeKey) || a.sizeId - b.sizeId,
    );
    setRuns(Object.fromEntries(queue.map((j) => [j.id, blankRun()])));
    try {
      for (const job of queue) {
        // Проверяется КАЖДУЮ итерацию, а не только stopRef: размонтирование ставит оба флага, но
        // «жив» — сильнее: при нём цикл обязан выйти, ничего больше не записав на сервер.
        if (!aliveRef.current) return;
        if (stopRef.current) {
          patch(job.id, { status: 'skipped', error: 'очередь остановлена' });
          continue;
        }
        skipRef.current = false;
        patch(job.id, { status: 'running' });

        // Разбор нужной ткани в воркере. После жёсткого стопа разбора нет вовсе — переразбор идёт
        // из кеша файлов, без повторного скачивания.
        //
        // ПЕРЕРАЗБОР ОБЯЗАН ДАТЬ ТЕ ЖЕ id ДЕТАЛЕЙ, и он их даёт: `parseSheets` нумерует детали с
        // единицы В ПОРЯДКЕ ФАЙЛОВ на каждый вызов, а порядок файлов берётся из того же кеша. Иначе
        // задание, собранное по первому разбору, адресовало бы несуществующие детали, и движок
        // ответил бы «missing» на каждую — то есть пустой раскладкой без единой жалобы.
        let parseId = liveParse.current?.scopeKey === job.scopeKey ? liveParse.current.parseId : 0;
        if (!parseId) {
          const files = filesRef.current.get(filesKeyOf(job.scopeKey)) ?? [];
          if (files.length === 0) {
            patch(job.id, { status: 'failed', error: 'выкройки этой ткани не скачаны' });
            continue;
          }
          const res = await client().parse(files, {
            unit: 'auto',
            tol: NEST_DEFAULTS.tol,
            tolChain: NEST_DEFAULTS.tolChain,
          });
          if (!aliveRef.current) return;
          liveParse.current = { scopeKey: job.scopeKey, parseId: res.parseId };
          parseId = res.parseId;
        }

        const result = await nestOne(job, parseId);
        if (!aliveRef.current) return;
        if (!result) {
          patch(job.id, { status: 'skipped', error: 'прогон прерван' });
          if (stopRef.current) break;
          continue;
        }
        if (result.cancelled || skipRef.current) {
          patch(job.id, { status: 'skipped', error: 'прогон отменён оператором', result });
          if (stopRef.current) break;
          continue;
        }
        if (result.placedCount !== result.totalCount) {
          // НЕПОЛНАЯ РАСКЛАДКА НЕ СОХРАНЯЕТСЯ. Сервер её тоже не примет без явного согласия
          // (0299, is_draft), а поля `is_draft` в сегодняшнем клиентском прото нет вовсе — то
          // есть отправить черновик отсюда физически нечем.
          // TODO(волна 2): после `make proto` — предлагать сохранить такую раскладку ЧЕРНОВИКОМ
          // (is_draft), чтобы оплаченный прогон не пропадал вместе с окном.
          patch(job.id, {
            status: 'failed',
            result,
            error: `уложил ${result.placedCount} из ${result.totalCount} деталей — поднимите бюджет поиска (сейчас ${budgetS} с) либо снимите эту раскладку руками во вкладке «выкройки»`,
          });
          continue;
        }
        await saveWithRetry(job, result);
      }
    } finally {
      // Карточка перечитывается ОДИН РАЗ в конце, а не после каждого сохранения: инвалидация
      // тянет за собой полный ре-рендер формы карточки, и делать его посреди счёта значит
      // тормозить сам счёт. Итоги ниже читаются из результатов прогонов, а не из карточки.
      if (techCardId) {
        qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
        qc.invalidateQueries({ queryKey: techCardKeys.lists() });
      }
      if (!aliveRef.current) return;
      setPhase('ready');
      stopRef.current = false;
    }
  };

  /**
   * Сохранение с ОДНИМ повтором — и повторяется только то, что имеет смысл повторять.
   *
   * За плечами каждой строки лежат десятки секунд поиска, а сорваться сохранение может на
   * обрыве сети или пятисотке. Полевое нарушение (сервер разобрал пэйлоад и назвал поле) повторять
   * бессмысленно: второй такой же запрос получит тот же отказ, и повтор лишь съест время очереди.
   * Результат при отказе ОСТАЁТСЯ на строке — его можно досохранить кнопкой, не пересчитывая.
   */
  const saveWithRetry = async (job: MarkerJob, result: NestResult) => {
    patch(job.id, { status: 'saving', result, error: '' });
    try {
      const markerId = await saveJob(job, result);
      patch(job.id, { status: 'done', result, markerId });
      return;
    } catch (e) {
      if (!aliveRef.current) return;
      if (extractFieldViolations(e).length > 0) {
        patch(job.id, { status: 'failed', result, error: saveErrorText(e) });
        return;
      }
      patch(job.id, { status: 'saving', result, error: `${saveErrorText(e)} — повторяем…` });
    }
    try {
      const markerId = await saveJob(job, result);
      patch(job.id, { status: 'done', result, markerId });
    } catch (e) {
      patch(job.id, { status: 'failed', result, error: saveErrorText(e) });
    }
  };

  const stopAll = () => {
    stopRef.current = true;
    cancelRef.current?.();
    showMessage('очередь останавливается — уже сохранённые раскладки остаются', 'success');
  };
  const skipCurrent = () => {
    skipRef.current = true;
    cancelRef.current?.();
  };

  // ── ИТОГ: измеренный расход по каждой ткани ───────────────────────────────────────────────
  //
  // Ровно то, ради чего фаза и написана: реальный процент раскроя и расход на изделие, которых
  // никто не вводил руками. Сверка идёт с тем числом, которое СЕЙЧАС лежит в рецепте — то есть с
  // тем, по которому костинг считает деньги, — и берётся оно оттуда же, откуда его берёт костинг,
  // а не пересчитывается здесь второй раз.
  const results = useMemo(() => {
    if (!plan) return [];
    type Line = {
      job: MarkerJob;
      result: NestResult;
    };
    const byKey = new Map<string, { job: MarkerJob; lines: Line[] }>();
    for (const job of plan.jobs) {
      const r = runs[job.id];
      if (!r || r.status !== 'done' || !r.result) continue;
      const key = `${job.scopeKey}|${job.colorwayId}`;
      const bucket = byKey.get(key) ?? { job, lines: [] };
      bucket.lines.push({ job, result: r.result });
      byKey.set(key, bucket);
    }
    return [...byKey.values()].map((b) => {
      // Порядок строк — ГРАДАЦИЯ, а не алфавит: «L, M, S» читается как порча данных.
      b.lines.sort(
        (x, y) => (sizeOrder.get(x.job.sizeId) ?? 0) - (sizeOrder.get(y.job.sizeId) ?? 0),
      );
      // РАСХОД НА ИЗДЕЛИЕ — СРЕДНЕЕ, ВЗВЕШЕННОЕ КОЛИЧЕСТВАМИ ПАРТИИ. Настил кроит ровно одно
      // изделие, поэтому длина настила и есть расход РАЗМЕРА; но партия шьётся не поровну, и
      // среднее арифметическое отвечает на вопрос, которого никто не задавал. Партия из 99×S по
      // 1 м и 1×XL по 2 м расходует 1.01 м на изделие, а невзвешенное среднее печатает 1.50 —
      // и тут же объявляет, что прежняя оценка «занижала на 49 %», хотя она была точна.
      //
      // Размеры, для которых раскладка не снялась (отказ, пропуск), в веса НЕ ВХОДЯТ: делить на
      // количество, длины которого мы не измеряли, значит занизить среднее ровно на его долю.
      const totalQty = b.lines.reduce((s, l) => s + Math.max(0, l.job.batchQty), 0);
      const avgCm =
        totalQty > 0
          ? b.lines.reduce((s, l) => s + l.result.usedLengthCm * Math.max(0, l.job.batchQty), 0) /
            totalQty
          : b.lines.reduce((s, l) => s + l.result.usedLengthCm, 0) / Math.max(1, b.lines.length);
      // ЗНАМЕНАТЕЛЬ — ВЕСЬ ЗАКАЗ КОЛОРВЕЯ, а не сумма запланированных заданий. Размер, по которому
      // задание вообще не создалось (нет деталей в выкройках, не влезает в ширину), из суммы
      // заданий выпал бы — и покрытие отрапортовало бы «посчитано всё», умолчав ровно про ту
      // часть партии, для которой ткани посчитать не удалось. Каждое изделие партии кроится из
      // каждой ткани карточки, поэтому знаменатель один и тот же для всех тканей.
      const plannedQty = cells
        .filter((c) => c.colorwayId === b.job.colorwayId)
        .reduce((s, c) => s + Math.max(0, c.qty), 0);
      const line = rollLines.find((l) => l.lineKey === b.job.bomLineKey);
      // Основа веса — с ТОГО артикула, чью ширину мерили: пин колорвея, иначе артикул слота.
      // Иначе кг-сверка сравнивала бы две разные ткани — 150 см × 200 г/м² против 160 × 250.
      const pinId = pinnedMaterialId(techCard, b.job.colorwayId, b.job.bomLineKey);
      const articleId = pinId || Number(line?.materialId ?? 0);
      const basis = weightBasisOf(
        articleId ? materialById.get(articleId) : undefined,
        line,
        !!pinId,
      );
      const measured = toBomUnit(avgCm, b.job.unit, basis.ok ? basis.basis : undefined);
      const current = recipeConsumption(techCard, b.job.colorwayId, b.job.bomLineKey);
      const deltaPct =
        measured && current && current.value > 0
          ? ((measured.value - current.value) / current.value) * 100
          : null;
      return {
        head: b.job,
        lines: b.lines,
        avgCm,
        measured,
        current,
        deltaPct,
        totalQty,
        plannedQty,
      };
    });
  }, [plan, runs, cells, rollLines, materialById, techCard, sizeOrder]);

  // ── рендер ────────────────────────────────────────────────────────────────────────────────
  const running = phase === 'running';
  const jobs = plan?.jobs ?? [];

  return (
    <div className='flex w-full min-w-0 flex-col gap-1.5'>
      <GroupLabel
        flush
        action={
          phase === 'idle' || phase === 'preparing' ? (
            <Button
              type='button'
              size='xs'
              variant='secondary'
              disabled={phase === 'preparing' || !!blocked}
              onClick={prepare}
            >
              {phase === 'preparing' ? 'разбираем выкройки…' : 'раскроить партию'}
            </Button>
          ) : running ? (
            <div className='flex gap-2'>
              <Button type='button' size='xs' variant='secondary' onClick={skipCurrent}>
                пропустить
              </Button>
              <Button type='button' size='xs' variant='secondary' onClick={stopAll}>
                остановить
              </Button>
            </div>
          ) : (
            <div className='flex items-center gap-2'>
              <label className='flex items-center gap-1'>
                <Text size='micro' variant='label' component='span'>
                  бюджет, с
                </Text>
                <input
                  className='w-12 border border-borderColor bg-bgColor px-1 text-right text-textBaseSize'
                  inputMode='numeric'
                  value={budgetS}
                  onChange={(e) => setBudgetS(Math.max(1, Number(e.target.value) || 0))}
                />
              </label>
              {/* ПЕРЕПОДГОТОВКА — ЯВНОЕ ДЕЙСТВИЕ, а не автоматика. Пересобрать план сам по себе
                  экран не имеет права: разбор стоит скачивания всех DXF карточки, и делать это на
                  каждое нажатие клавиши в BOM соседней вкладки нельзя. */}
              <Button type='button' size='xs' variant='secondary' onClick={prepare}>
                {stale ? 'подготовить заново' : 'переподготовить'}
              </Button>
              <Button
                type='button'
                size='xs'
                variant='secondary'
                disabled={selectedJobs.length === 0 || !!blocked || stale}
                title={stale ? 'данные карточки изменились — подготовьте заново' : undefined}
                onClick={start}
              >
                {`запустить (${selectedJobs.length})`}
              </Button>
            </div>
          )
        }
      >
        раскрой партии — раскладки по колорвеям и размерам
      </GroupLabel>

      {blocked ? (
        <Text size='micro' className='text-error'>
          {blocked}
        </Text>
      ) : (
        <Text size='micro' variant='label'>
          движок раскладки работает в ЭТОЙ вкладке: вкладки карточки не размонтируются, поэтому
          очередь считает и когда вы ушли на другую, — но уход со страницы карточки её убивает.
          Настил снимается на ОДНО изделие каждого размера: многокомплектный кладётся плотнее, так
          что измеренный расход идёт с запасом, а КПД ниже цехового.
        </Text>
      )}

      {/* ПОДГОТОВКА ПРОТУХЛА. Разбор — снимок; ширина артикула, состав тканей или сами листы
          правятся на соседней вкладке, которая всё это время смонтирована. Раскладка по старому
          снимку записала бы норму на полотне, которого у ткани уже нет, — поэтому «запустить»
          гаснет, а причина стоит словами. */}
      {stale ? (
        <CalloutBox tone='warning'>
          <Text size='micro'>
            данные карточки изменились после подготовки (ширина, состав тканей или набор выкроек) —
            план снят по устаревшему снимку. Подготовьте заново, иначе раскладка будет измерена не
            на том полотне.
          </Text>
        </CalloutBox>
      ) : null}

      {prepError ? (
        <Text size='micro' className='text-error'>
          {prepError}
        </Text>
      ) : null}
      {plan && jobs.length > 0 ? (
        <div className='w-full overflow-x-auto'>
          <table className='w-full border-collapse'>
            <thead>
              <tr>
                <th className='border-b border-hairline px-1 py-1 text-left uppercase'> </th>
                <th className='border-b border-hairline px-1 py-1 text-left uppercase'>колорвей</th>
                <th className='border-b border-hairline px-1 py-1 text-left uppercase'>ткань</th>
                <th className='border-b border-hairline px-1 py-1 text-left uppercase'>размер</th>
                <th className='border-b border-hairline px-1 py-1 text-right uppercase'>ширина</th>
                <th className='border-b border-hairline px-1 py-1 text-right uppercase'>детали</th>
                <th className='border-b border-hairline px-1 py-1 text-left uppercase'>прогноз</th>
                <th className='border-b border-hairline px-1 py-1 text-left uppercase'>
                  состояние
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const r = runs[j.id];
                return (
                  <tr key={j.id} className='align-top'>
                    <td className='border-b border-hairline px-1 py-1'>
                      <CheckboxCommon
                        name={`job-${j.id}`}
                        checked={isOn(j)}
                        disabled={running}
                        onChange={() => setOff((p) => ({ ...p, [j.id]: isOn(j) }))}
                      />
                    </td>
                    <td className='border-b border-hairline px-1 py-1'>{j.colorwayLabel}</td>
                    <td className='border-b border-hairline px-1 py-1'>
                      <div className='flex flex-col'>
                        <span>{j.scopeLabel}</span>
                        <Text size='micro' variant='label' component='span'>
                          {`${j.articleName}${j.pinned ? ' · пин колорвея' : ' · артикул слота'}`}
                        </Text>
                      </div>
                    </td>
                    <td className='border-b border-hairline px-1 py-1'>{j.sizeLabel}</td>
                    <td className='border-b border-hairline px-1 py-1 text-right tabular-nums'>
                      {`${j.widthCm} см`}
                    </td>
                    <td className='border-b border-hairline px-1 py-1 text-right tabular-nums'>
                      {j.pieceCount}
                    </td>
                    <td className='border-b border-hairline px-1 py-1'>
                      <div className='flex flex-col gap-0.5'>
                        <span>{forecastText(j)}</span>
                        {j.replaces ? (
                          <Pill tone={j.replaces.isNorm ? 'warn' : 'mut'}>
                            {j.replaces.isNorm ? 'уже снята · НОРМА' : 'уже снята'}
                          </Pill>
                        ) : null}
                        {j.notes.map((n) => (
                          <Text key={n} size='micro' variant='label' component='span'>
                            {n}
                          </Text>
                        ))}
                      </div>
                    </td>
                    <td className='border-b border-hairline px-1 py-1'>
                      <span>{statusText(r)}</span>
                      {r?.error ? (
                        <Text size='micro' className='text-error'>
                          {r.error}
                        </Text>
                      ) : null}
                      {/* ЗА ЭТОЙ СТРОКОЙ ЛЕЖИТ ПОСЧИТАННАЯ РАСКЛАДКА. Сохранение сорвалось —
                          геометрия от этого не испортилась, и заставлять оператора платить
                          минутами поиска за чужую пятисотку незачем. Кнопка есть только там, где
                          результат полон: неполную сервер не примет в любом случае. */}
                      {r?.status === 'failed' &&
                      r.result &&
                      r.result.placedCount === r.result.totalCount &&
                      !running ? (
                        <Button
                          type='button'
                          size='xs'
                          variant='secondary'
                          disabled={!!blocked}
                          onClick={() => void saveWithRetry(j, r.result as NestResult)}
                        >
                          сохранить ещё раз
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {plan && plan.refusals.length > 0 ? (
        <CalloutBox tone='note'>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label'>
              {`не раскладывается (${plan.refusals.length})`}
            </Text>
            {plan.refusals.map((r) => (
              <Text key={r.key + r.reason} size='micro'>
                {[r.scopeLabel, r.colorwayLabel, r.sizeLabel].filter(Boolean).join(' · ')} —{' '}
                {r.reason}
              </Text>
            ))}
          </div>
        </CalloutBox>
      ) : null}

      {plan && jobs.length === 0 && plan.refusals.length === 0 ? (
        <Text size='micro' variant='label'>
          раскладывать нечего: в партии нет ни одной клетки с количеством, либо у карточки нет
          рулонных тканей с выкройками
        </Text>
      ) : null}

      {/* ═══ ИЗМЕРЕННЫЙ РАСХОД — то, ради чего всё считалось. */}
      {results.length > 0 ? (
        <div className='mt-2 flex flex-col gap-2'>
          {results.map((g) => (
            <div key={`${g.head.scopeKey}|${g.head.colorwayId}`} className='flex flex-col'>
              <GroupLabel>
                {`${g.head.scopeLabel} · ${g.head.colorwayLabel} · ${g.head.widthCm} см`}
              </GroupLabel>
              {g.lines.map((l) => (
                <Row
                  key={l.job.id}
                  label={`${l.job.sizeLabel} · ${l.job.batchQty} шт`}
                  value={`${l.result.usedLengthCm.toFixed(0)} см · КПД ${pct(l.result.efficiency)}`}
                />
              ))}
              <Row
                emphasis
                label={
                  g.lines.length > 1 ? 'на изделие — взвешенно по количествам партии' : 'на изделие'
                }
                value={g.measured ? `${g.measured.value} ${g.measured.unit}` : meters(g.avgCm)}
              />
              {/* ЧАСТИЧНОЕ ПОКРЫТИЕ НАЗЫВАЕТСЯ ВСЛУХ. Взвешенное среднее по ПОЛОВИНЕ партии — это
                  ответ про половину, и молча выдавать его за расход партии нельзя: сравнение с
                  рецептом ниже опиралось бы на вес, которого нет. */}
              {g.totalQty > 0 && g.plannedQty > g.totalQty ? (
                <Text size='micro' className='text-error'>
                  {`посчитано ${g.totalQty} из ${g.plannedQty} изделий этого колорвея — по остальным размерам раскладка не снялась (см. отказы выше), и число выше описывает только посчитанную часть партии`}
                </Text>
              ) : null}
              <Text size='micro' variant='label'>
                {g.current == null
                  ? 'в рецепте этого колорвея расхода по этой ткани нет — сравнивать не с чем'
                  : g.measured == null
                    ? `в рецепте ${g.current.value} ${g.head.unit} (${sourceWord(g.current.source)}); перевести измеренную длину в единицу слота нечем — ${
                        bomUnitKind(g.head.unit) === 'kg'
                          ? 'кг-слоту нужны полная ширина рулона и плотность артикула'
                          : `единица «${g.head.unit || '—'}» длину не принимает`
                      }`
                    : g.deltaPct == null
                      ? `в рецепте ${g.current.value} ${g.head.unit} (${sourceWord(g.current.source)})`
                      : `${sourceWord(g.current.source)} давала ${g.current.value} ${g.head.unit} — ${
                          g.deltaPct >= 0
                            ? `занижала на ${Math.abs(g.deltaPct).toFixed(0)}%`
                            : `завышала на ${Math.abs(g.deltaPct).toFixed(0)}%`
                        }`}
              </Text>
            </div>
          ))}
          {/* СЛЕДУЮЩИЙ ШАГ — назначить раскладку НОРМОЙ, и делается он там, где уже живёт
              подтверждение с его последствиями (переназначение нормы рецепты НЕ пересчитывает).
              Ссылка, а не вторая кнопка: копия того диалога разошлась бы с оригиналом. */}
          <Text size='micro' variant='label'>
            назначить раскладку нормой ткани и применить расход в рецепт —{' '}
            <Button asChild variant='underline' size='xs'>
              <Link to='?tab=patterns'>раскладки карточки ↗</Link>
            </Button>
          </Text>
        </div>
      ) : null}
    </div>
  );
}

// ── подписи ───────────────────────────────────────────────────────────────────────────────

function roleWord(section: string): string {
  if (section === 'TECH_CARD_BOM_SECTION_LINING') return 'подкладка';
  if (section === 'TECH_CARD_BOM_SECTION_INTERLINING') return 'бортовка';
  if (section === 'TECH_CARD_BOM_SECTION_INSULATION') return 'утеплитель';
  return 'основная ткань';
}

/** Подпись ткани: назначение с его артикулами, либо роль с названием неразобранной строки. */
function scopeLabel(
  key: string,
  byPurpose: boolean,
  lines: Array<RollGoodsLine & { name?: string; section?: string }>,
): string {
  const names = lines
    .map((l) => (l.name ?? '').trim())
    .filter(Boolean)
    .join(', ');
  if (!byPurpose) {
    return [roleWord(lines[0]?.section ?? ''), names].filter(Boolean).join(' · ') || 'без названия';
  }
  return [bomPurposeLabel(key), names].filter(Boolean).join(' · ');
}

function forecastText(j: MarkerJob): string {
  const e = j.estimate;
  if (!e) return 'оценить нечего';
  const seconds = e.predictedElapsedMs != null ? Math.ceil(e.predictedElapsedMs / 1000) : null;
  const head =
    e.outlook === 'starved'
      ? 'поиска не будет'
      : e.outlook === 'squeezed'
        ? `поиску ~${Math.round(e.searchMsLeft / 1000)} с`
        : `до ${seconds ?? Math.ceil(e.timeBudgetMs / 1000)} с`;
  const coarse = e.coarsened ? ` · контуры огрублены до ${e.effectiveEps} см` : '';
  return `${head} · предпросчёт ~${Math.round(e.predictedPrepassMs / 1000)} с${coarse}`;
}

function statusText(r: JobRun | undefined): string {
  if (!r) return '—';
  switch (r.status) {
    case 'queued':
      return 'в очереди';
    case 'running':
      return r.nfp
        ? `предпросчёт ${r.nfp.done}/${r.nfp.total}`
        : `поколение ${r.generation}${r.bestPct != null ? ` · КПД ${r.bestPct.toFixed(1)}%` : ''}`;
    case 'saving':
      return 'сохраняем…';
    case 'done':
      return r.result
        ? `готово · ${r.result.usedLengthCm.toFixed(0)} см · КПД ${pct(r.result.efficiency)}`
        : 'готово';
    case 'failed':
      return 'отказ';
    case 'skipped':
      return 'пропущено';
  }
}

function saveErrorText(e: unknown): string {
  const vs = extractFieldViolations(e);
  if (vs.length > 0) return vs.map((v) => v.description).join('; ');
  return e instanceof Error && e.message ? e.message : 'не удалось сохранить раскладку';
}

/**
 * Расход, который СЕЙЧАС лежит в рецепте колорвея по этой ткани, — то самое число, по которому
 * костинг считает деньги.
 *
 * Читается ровно одна строка: НОРМОНОСЕЦ, то есть строка уровня ИЗДЕЛИЯ. Строка, привязанная к
 * детали кроя, — это назначение материала («деталь X кроится из артикула Y»), а не норма, и брать с
 * неё расход значило бы прочитать чужой факт (сервер её так и читает — IsPieceMaterialAssignment).
 */
function recipeConsumption(
  card: common_TechCard | undefined,
  colorwayId: number,
  bomLineKey: string,
): { value: number; source: string } | null {
  for (const u of normCarriers(card, colorwayId, bomLineKey)) {
    const raw = u.consumption?.value;
    const n = Number(raw ?? '');
    if (!raw || !Number.isFinite(n) || n <= 0) continue;
    return { value: n, source: u.consumptionSource ?? '' };
  }
  return null;
}

/** Артикул, который ЭТОТ колорвей приколол на слот. 0 = наследует артикул слота. */
function pinnedMaterialId(
  card: common_TechCard | undefined,
  colorwayId: number,
  bomLineKey: string,
): number {
  for (const u of normCarriers(card, colorwayId, bomLineKey)) {
    const id = Number(u.materialId ?? 0);
    if (id > 0) return id;
  }
  return 0;
}

function normCarriers(
  card: common_TechCard | undefined,
  colorwayId: number,
  bomLineKey: string,
): common_TechCardColorwayUsage[] {
  const cw = (card?.colorways ?? []).find((c) => Number(c.colorwayId ?? 0) === colorwayId);
  return (cw?.usages ?? []).filter(
    (u) => (u.bomLineKey ?? '') === bomLineKey && !(u.pieceLineKey ?? '').trim(),
  );
}
