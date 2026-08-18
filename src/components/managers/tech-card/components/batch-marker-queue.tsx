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
import type {
  common_Material,
  common_ProductionRun,
  common_TechCard,
  common_TechCardColorwayUsage,
  common_TechCardMarkerSummary,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import type {
  LayEditorContext,
  LaySlotOption,
} from 'components/managers/production-runs/components/lay-editor';
import { isRunLocked } from 'components/managers/production-runs/components/options';
import { layKeys, useRunLays } from 'components/managers/production-runs/components/useLays';
import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { SECTION } from 'constants/routes';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useWorkshopSettings } from 'components/managers/workshop/useWorkshopSettings';
import { useQueryClient } from '@tanstack/react-query';
import { fetchMediaBlob } from 'lib/features/media-blob';
import { useSnackBarStore } from 'lib/stores/store';
import type { NestResult, PieceDTO } from 'lib/nesting/types';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { NestingWorkerClient } from 'lib/nesting/worker/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import CheckboxCommon from 'ui/components/checkbox';
import { Chip, ChipRow } from 'ui/components/chip';
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
} from './bom-purpose';
import { BatchLayProposal } from './nesting/batch-lay-proposal';
import {
  planBatchMarkers,
  type BatchCell,
  type JobSizeRow,
  type MarkerJob,
  type MarkerMode,
  type PlanScope,
} from './nesting/batch-marker-plan';
import { sizeTokensOf } from './nesting/block-code';
import { colorwayLabelOf, markerColorways, slotCutWidth } from './nesting/colorway-widths';
import { dxfSheetsByScope, type ScopedSheet } from './nesting/dxf-by-scope';
import { weightBasisOf } from './nesting/fabric-weight';
import {
  bomUnitKind,
  cardMarkers,
  consumptionForSize,
  decNum,
  latestPerSize,
  markersForLine,
  markersOfColorway,
  toBomUnit,
} from './nesting/marker-io';
import { saveMarkerJob } from './nesting/marker-save';
import { roleWord, scopeLabel } from './nesting/scope-label';
import { useDictionarySizeTokens } from './nesting/use-block-sizes';
import type { TechCardFormData } from './schema';

// Тот же жёсткий стоп, что у одиночной раскладки: «остановить» — сперва мягкая отмена (поиск
// возвращает лучшее из найденного), и если воркер молчит дольше этого, его убивают. Разбор живёт
// внутри воркера и умирает вместе с ним — поэтому после жёсткого стопа ткань разбирается заново.
const HARD_STOP_MS = 1500;
// Кадры прогресса чаще этого не перерисовываем: очередь рисует таблицу целиком.
const PROGRESS_MIN_MS = 250;
// «черновик» — ОТДЕЛЬНОЕ состояние, а не оттенок «готово» и не оттенок «отказа». Раскладка
// сохранена и её видно, но числа с неё не берут: часть деталей не легла, и длина короче настоящей.
// Свалить её в 'done' значило бы пустить её в итог по ткани; свалить в 'failed' — выбросить то, за
// что уже заплачено минутами поиска.
type JobStatus = 'queued' | 'running' | 'saving' | 'done' | 'draft' | 'failed' | 'skipped';

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
// Свёрнутый по миксу ряд — уже не то число, что лежит в колонке: печатать все его знаки значило бы
// выдать среднее за записанное. Тысячные — шаг записи нормы (DECIMAL(10,3)), дальше округлять
// нечего; хвост нулей не рисуем.
const round3 = (v: number) => String(Math.round(v * 1000) / 1000);
// Пометка, что число в рецепте — СВЁРНУТЫЙ РЯД, а не одно записанное значение. Без неё «в рецепте
// 1.10» читается как «в поле стоит 1.10», а в поле стоят M = 1.00 и L = 2.00.
const perSizeWord = (kind: 'scalar' | 'perSize') =>
  kind === 'perSize' ? ' (a per-size range, collapsed by the run mix)' : '';
const meters = (cm: number) => `${(cm / 100).toFixed(2)} m`;

/** Слово для источника расхода, лежащего в рецепте. */
function sourceWord(source: string | undefined): string {
  const s = (source ?? '').trim();
  if (s === 'dxf') return 'estimated from pattern areas';
  if (s === 'marker') return 'from a marker';
  return 'entered by hand';
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
  // ПРАВО НА НАСТИЛ — ЭТО ПРАВО НА ПРОИЗВОДСТВО, а не на тех-карты. Настил принадлежит прогону, и
  // `canEdit` этого компонента (tech_cards:write) про него не говорит НИЧЕГО: раскройщик, которому
  // открыты партии и закрыты карточки, обязан собрать настил, а тот, кому открыты карточки и
  // закрыты партии, — не обязан увидеть кнопку, за которой стоит отказ сервера.
  const { canWrite } = usePermissions();
  const canWriteRuns = canWrite(SECTION.production);
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
  // Подпись размера — ОДНА на весь компонент. Её читают план, сверка с рецептом и предложение
  // настила; три инлайновых копии одного выражения разошлись бы ровно тогда, когда формат размера
  // однажды поменяют в одном из трёх мест.
  const sizeName = useCallback(
    (id: number) => formatSizeName(sizeById.get(id) ?? `#${id}`),
    [sizeById],
  );
  // Имя колорвея — тем же правилом, что и вся вкладка раскладок (colorwayLabelOf внутри
  // markerColorways). Форме настила оно нужно отдельной функцией: она подписывает им заголовок и
  // выбор колорвея.
  const colorwayName = useCallback(
    (id: number) => colorways.find((c) => c.colorwayId === id)?.label || `#${id}`,
    [colorways],
  );

  // ── состояние очереди ────────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('idle');
  const [prepError, setPrepError] = useState('');
  // Подготовка вместе с подписью данных, по которым она снята: см. prepSignature.
  const [parsed, setParsed] = useState<{ scopes: PlanScope[]; signature: string } | null>(null);
  const [budgetS, setBudgetS] = useState(NEST_DEFAULTS.timeBudgetMs / 1000);
  // ЧТО СНИМАЕМ. Выбор делается ДО прогона и меняет ровно две вещи: состав настила и владельца
  // раскладки (см. шапку планировщика). Умолчание — размерные нормы: они переиспользуются между
  // партиями, а настил партии живёт ровно столько, сколько живёт партия.
  const [mode, setMode] = useState<MarkerMode>('norms');
  // РАСКЛАДКИ ЭТОГО ПРОГОНА — ОТДЕЛЬНЫМ ЗАПРОСОМ, и другого способа нет. Прогонные маркеры в
  // `techCard.markers` НЕ ПРИЕЗЖАЮТ: их отфильтровывает сам сервер (контракт
  // ListProductionRunLays.run_markers говорит это прямым текстом — «карточный список их теперь не
  // показывает»), а клиентский cardMarkers — лишь вторая линия обороны для устаревшего бэкенда.
  // Искать их в поле карточки значило бы всегда получать пустой список: пересчёт настила не нашёл
  // бы собственную вчерашнюю раскладку, отправил бы её с id = 0 и получил отказ по уникальности
  // имени ПОСЛЕ полностью оплаченного прогона.
  //
  // Запрос включается только в режиме настила: в режиме норм прогонные раскладки не нужны никому, а
  // это лишний вызов на каждой открытой карточке. Ключ общий со страницей партии, так что чаще
  // всего это чтение из кэша.
  const batchRunId = Number(run.id ?? 0);
  const laysQuery = useRunLays(batchRunId, batchRunId > 0 && mode === 'batch');
  const runMarkers = useMemo(() => laysQuery.data?.runMarkers ?? [], [laysQuery.data]);
  // Настилы прогона — тот же ответ, что и раскладки. Читает их предложение настила (Ф6.9): по ним
  // видно, собран ли настил по этой раскладке уже, и с каких концевых потерь начал этот цех.
  const lays = useMemo(() => laysQuery.data?.lays ?? [], [laysQuery.data]);
  // РАСКЛАДКИ, ЗАНЯТЫЕ СЕКЦИЯМИ НАСТИЛОВ. Секция настила ссылается на раскладку по id, а её
  // плановая длина, число полотен и проверки посчитаны по ТОЙ геометрии; перезаписать такую
  // раскладку значит оставить производственную строку ссылаться на то же место с другим
  // содержимым. Планировщик поэтому их не трогает — см. предикат замены.
  const referencedMarkerIds = useMemo(() => {
    const ids = new Set<number>();
    for (const lay of laysQuery.data?.lays ?? []) {
      for (const sec of lay.sections ?? []) {
        const id = Number(sec.markerId ?? 0);
        if (id > 0) ids.add(id);
      }
    }
    return ids;
  }, [laysQuery.data]);
  // СПИСОК РАСКЛАДОК ПАРТИИ ЕЩЁ НЕ ПРОЧИТАН — планировать НЕЛЬЗЯ, и это не косметика загрузки.
  // План, снятый по пустому списку, не находит собственную прошлую раскладку: задание уходит с
  // `id = 0`, полностью оплачивает прогон и получает отказ по уникальности имени. Тот же гейт
  // закрывает окно ПОСЛЕ сохранения: инвалидация ключа настилов запускает перезапрос, и до его
  // конца план описывает вчерашнее состояние прогона.
  //
  // `isPending` у выключенного запроса в react-query v5 висит вечно, поэтому оба флага читаются
  // строго под условием включения — тем же, что стоит в самом хуке.
  const laysLoading =
    batchRunId > 0 && mode === 'batch' && (laysQuery.isPending || laysQuery.isFetching);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [runs, setRuns] = useState<Record<string, JobRun>>({});
  const stale = !!parsed && parsed.signature !== prepSignature;

  // ── окружение ФОРМЫ НАСТИЛА ──────────────────────────────────────────────────────────────
  //
  // Форма настила на весь клиент одна (`LayEditor`), и монтируется она отсюда ровно теми же
  // данными, какими её монтирует страница партии. Собирается окружение ЗДЕСЬ, потому что здесь
  // лежат обе его половины: рулонные слоты и колорвеи — с карточки, раскройные раскладки и
  // порядок настилов — с прогона.
  //
  // Партия ЗАКРЫТА — настил не правится: он план, а не история (то же правило, что на странице
  // партии, и тот же предикат).
  const runLocked = isRunLocked(run.run?.status);
  const layColorwayOptions = useMemo(
    () =>
      [...new Set(cells.map((c) => c.colorwayId))]
        .filter((id) => id > 0)
        .map((id) => ({ colorwayId: id, label: colorwayName(id) })),
    [cells, colorwayName],
  );
  // Слоты — рулонные строки BOM, тем же предикатом, что и весь раскрой. `materialId` едет вместе с
  // ними ради выбора РУЛОНА в форме: лоты спрашиваются по артикулу, и у слота без каталожной связи
  // список рулонов взять неоткуда — форма говорит это вслух.
  const laySlotOptions = useMemo<LaySlotOption[]>(
    () =>
      rollLines.map((l) => ({
        lineKey: l.lineKey,
        name: l.name.trim() || materialById.get(l.materialId)?.name?.trim() || l.lineKey,
        materialId: l.materialId,
      })),
    [rollLines, materialById],
  );
  const layEditorContext = useMemo<LayEditorContext>(
    () => ({
      runId: batchRunId,
      techCardId,
      colorwayLabel: colorwayName,
      colorwayOptions: layColorwayOptions,
      slotOptions: laySlotOptions,
      runMarkers,
      // Источники копирования — только КАРТОЧНЫЕ раскладки, ровно как на странице партии: копировать
      // прогонную в её же прогон незачем, она уже в нём.
      cardMarkers: markers,
      nextDisplayOrder: lays.length + 1,
    }),
    [
      batchRunId,
      techCardId,
      colorwayName,
      layColorwayOptions,
      laySlotOptions,
      runMarkers,
      markers,
      lays.length,
    ],
  );

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
  // (production_run_id = 0). Размерная норма — ровно такая: нормой может стать только карточная
  // раскладка, прогонной это запрещено CHECK'ом chk_tcm_run_not_norm. То есть на релизнутой
  // карточке каждое задание режима норм отработало бы полный бюджет и получило отказ на
  // сохранении — десятки минут счёта в мусор. Поэтому запрет стоит ДО запуска.
  //
  // И ЭТО ОТКАЗ РЕЖИМА, А НЕ ЭКРАНА. Настил партии принадлежит ПРОГОНУ (production_run_id > 0), и
  // правило изменяемой карточки на него не распространяется — прежний текст сам же и отправлял за
  // такой раскладкой на страницу партии. Выпущенная карточка — обычное состояние ровно в тот
  // момент, когда партию кроят, так что запрещать здесь ещё и настил значило бы закрыть режим там,
  // где он и нужен.
  const releasedRefusal =
    frozen && mode === 'norms'
      ? 'the card is released: the server does not accept card markers on it (SaveMarker requires an editable card), and a per-size norm can only be a card marker. Re-capturing the style norm is possible only by taking the card off the release; the lay of THIS run is captured on a released card too — switch the mode.'
      : '';
  const rightsRefusal = !canEdit ? "no rights to edit tech cards — the marker can't be saved" : '';
  const savedRefusal = !techCardId
    ? 'the card is not saved yet — there is nothing to attach the marker to'
    : '';
  const blocked = releasedRefusal || rightsRefusal || savedRefusal;

  // ── план ──────────────────────────────────────────────────────────────────────────────────
  const plan = useMemo(() => {
    if (!parsed) return null;
    return planBatchMarkers({
      mode,
      productionRunId: Number(run.id ?? 0),
      cells,
      scopes: parsed.scopes,
      looseSheets,
      colorways,
      sizeLabel: sizeName,
      // Порядок ГРАДАЦИИ, а не алфавита: состав «3M+2L» и состав «2L+3M» — одно и то же соотношение,
      // но второе читается как порча данных.
      sizeOrderOf: (id) => sizeOrder.get(id) ?? 1e6,
      sizeTokensOf: (id) => sizeTokensOf(sizeById.get(id)),
      dictTokens,
      markers,
      runMarkers,
      referencedMarkerIds,
      timeBudgetMs: Math.max(1, budgetS) * 1000,
      cardSeamAllowanceRaw: cardSeamRaw,
      workshopSeamAllowance: workshop.data?.settings?.defaultSeamAllowanceMm,
    });
  }, [
    mode,
    run.id,
    parsed,
    cells,
    colorways,
    sizeById,
    sizeName,
    sizeOrder,
    dictTokens,
    markers,
    runMarkers,
    referencedMarkerIds,
    budgetS,
    cardSeamRaw,
    workshop.data,
  ]);

  // Задание с уже снятой раскладкой ПРЕДВЫБРАНО ВЫКЛЮЧЕННЫМ: пересъёмка стоит бюджета и двигает
  // число, которое, возможно, уже применено в рецепт. Галочка остаётся — переснять законно.
  //
  // ЧЕРНОВИК — ИСКЛЮЧЕНИЕ, и ровно обратное: он не «уже снят», он НЕДОСЧИТАН, и единственное, что с
  // ним делают, — пересчитывают с бо́льшим бюджетом. Оставить его выключенным значило бы прятать
  // недоделанную работу за галочкой, которую надо догадаться поставить.
  const isOn = (j: MarkerJob) => (j.id in off ? !off[j.id] : !j.replaces || j.replaces.isDraft);
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
            parseWarnings: [`sheets didn't download: ${failed.join(', ') || 'all'}`],
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
      setPrepError(e instanceof Error && e.message ? e.message : "couldn't parse the patterns");
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
    const urlBySource = new Map(
      (sheetsByScope.get(job.scopeKey) ?? []).map((s) => [s.name, s.url]),
    );
    // ВЕСЬ ПЭЙЛОАД — В `marker-save.ts`, один писатель на всех, кто считает задание без модалки
    // (см. шапку того модуля). Здесь остаётся ровно то, чего планировщик знать не может: чем
    // именно снята эта геометрия.
    //
    // Оговорка про запас едет ТОЛЬКО с размерной нормой: у настила партии её не бывает, он и есть
    // плотная укладка.
    return saveMarkerJob(techCardId, {
      job,
      result,
      urlBySource,
      provenanceNote:
        job.mode === 'batch'
          ? `captured by the run cutting queue of run #${run.id ?? 0}: RUN LAY, composition ${job.sizeLabel} (the size ratio of the run, reduced by the GCD) — the measured efficiency IS the real cutting percent of this run.`
          : `captured by the run cutting queue of run #${run.id ?? 0}: a lay for ONE garment of size ${job.sizeLabel}. A multi-kit lay packs tighter, so the consumption measured here runs on the high side.`,
    });
  };

  // ── сама очередь ──────────────────────────────────────────────────────────────────────────
  const start = async () => {
    // ПРОТУХШИЙ ПЛАН НЕ ЗАПУСКАЕТСЯ. Разбор — снимок; ширина, состав тканей или сами листы могли
    // измениться на соседней смонтированной вкладке, и раскладка по старому снимку записала бы
    // норму на полотне, которого у ткани уже нет.
    if (!plan || selectedJobs.length === 0 || blocked || stale || laysLoading) return;
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
          patch(job.id, { status: 'skipped', error: 'the queue was stopped' });
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
            patch(job.id, { status: 'failed', error: "this fabric's patterns are not downloaded" });
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
          patch(job.id, { status: 'skipped', error: 'the search was aborted' });
          if (stopRef.current) break;
          continue;
        }
        if (result.cancelled || skipRef.current) {
          patch(job.id, {
            status: 'skipped',
            error: 'the search was cancelled by the operator',
            result,
          });
          if (stopRef.current) break;
          continue;
        }
        // НЕПОЛНАЯ УКЛАДКА СОХРАНЯЕТСЯ ЧЕРНОВИКОМ, а не выбрасывается. Исполнитель у раскладки
        // ровно один — воркер этой вкладки, — и минуты, которые он уже потратил, не восстановятся
        // ничем; выброшенный результат к тому же не оставлял следа, и «задание считалось» надо было
        // помнить головой. Числа с черновика не берёт никто: сервер не публикует ни расхода, ни
        // площадей, а клиент отдельно не пускает его ни в норму, ни в применение по размерам.
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
      // НАСТИЛЫ ПАРТИИ ЖИВУТ В ДРУГОМ КЛЮЧЕ. Прогонные раскладки приезжают не с карточкой, а с
      // ListProductionRunLays, и без этой инвалидации следующий план не увидел бы того, что очередь
      // только что сохранила: пересчёт отправил бы новую раскладку с id = 0 и получил отказ по
      // уникальности имени. Тот же ключ читает и страница партии.
      if (batchRunId > 0) qc.invalidateQueries({ queryKey: layKeys.list(batchRunId) });
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
    // ЧЕРНОВИК ИЛИ ИЗМЕРЕНИЕ — решают СЧЁТЧИКИ ДВИЖКА, тем же сравнением, каким сервер выводит
    // колонку is_draft. Одно место на весь файл: строка, итог по ткани и повторное сохранение
    // обязаны считать раскладку черновиком одинаково.
    const partial = result.placedCount !== result.totalCount;
    const draftError = partial
      ? `placed ${result.placedCount} of ${result.totalCount} pieces — saved as a DRAFT: no consumption is computed from it. Raise the search budget (now ${budgetS} s) and recompute — the recompute will replace this very marker`
      : '';
    patch(job.id, { status: 'saving', result, error: '' });
    try {
      const markerId = await saveJob(job, result);
      patch(job.id, { status: partial ? 'draft' : 'done', result, markerId, error: draftError });
      return;
    } catch (e) {
      if (!aliveRef.current) return;
      if (extractFieldViolations(e).length > 0) {
        patch(job.id, { status: 'failed', result, error: saveErrorText(e) });
        return;
      }
      patch(job.id, { status: 'saving', result, error: `${saveErrorText(e)} — retrying…` });
    }
    try {
      const markerId = await saveJob(job, result);
      patch(job.id, { status: partial ? 'draft' : 'done', result, markerId, error: draftError });
    } catch (e) {
      patch(job.id, { status: 'failed', result, error: saveErrorText(e) });
    }
  };

  const stopAll = () => {
    stopRef.current = true;
    cancelRef.current?.();
    showMessage('the queue is stopping — the markers already saved stay', 'success');
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
      /** Расход на ОДНО изделие, см: длина настила, делённая на число изделий его состава. */
      perUnitCm: number;
    };
    const byKey = new Map<string, { job: MarkerJob; lines: Line[] }>();
    for (const job of plan.jobs) {
      const r = runs[job.id];
      // ЧЕРНОВИК В ИТОГ НЕ ВХОДИТ. Его длина короче настоящей ровно на то, что заняли бы не
      // уложенные детали, и подмешать её в средний расход значило бы занизить весь итог по ткани —
      // молча и правдоподобно. Строка про него стоит ниже отдельным предупреждением.
      if (!r || r.status !== 'done' || !r.result) continue;
      const key = `${job.scopeKey}|${job.colorwayId}`;
      const bucket = byKey.get(key) ?? { job, lines: [] };
      bucket.lines.push({
        job,
        result: r.result,
        perUnitCm: r.result.usedLengthCm / Math.max(1, job.unitsTotal),
      });
      byKey.set(key, bucket);
    }
    return [...byKey.values()].map((b) => {
      // Порядок строк — ГРАДАЦИЯ, а не алфавит: «L, M, S» читается как порча данных.
      b.lines.sort(
        (x, y) => (sizeOrder.get(x.job.sizeId) ?? 0) - (sizeOrder.get(y.job.sizeId) ?? 0),
      );
      // РАСХОД НА ИЗДЕЛИЕ — СРЕДНЕЕ, ВЗВЕШЕННОЕ КОЛИЧЕСТВАМИ ПАРТИИ. Формула одна на оба режима, и
      // это не совпадение: слагаемое — расход одного изделия (длина настила ÷ число изделий его
      // состава), вес — сколько таких изделий заказано. У размерной нормы настил кроит одно
      // изделие, и слагаемое равно всей длине; у настила партии строка ровно одна, и взвешивание
      // вырождается в неё саму — потому что соотношение партии УЖЕ учтено внутри настила.
      //
      // Невзвешенное среднее отвечало бы на вопрос, которого никто не задавал: партия из 99×S по
      // 1 м и 1×XL по 2 м расходует 1.01 м на изделие, а среднее арифметическое печатает 1.50 — и
      // тут же объявляет, что прежняя оценка «занижала на 49 %», хотя она была точна.
      //
      // Размеры, для которых раскладка не снялась (отказ, пропуск, черновик), в веса НЕ ВХОДЯТ:
      // делить на количество, длины которого мы не измеряли, значит занизить среднее на его долю.
      const totalQty = b.lines.reduce((s, l) => s + Math.max(0, l.job.batchQty), 0);
      const avgCm =
        totalQty > 0
          ? b.lines.reduce((s, l) => s + l.perUnitCm * Math.max(0, l.job.batchQty), 0) / totalQty
          : b.lines.reduce((s, l) => s + l.perUnitCm, 0) / Math.max(1, b.lines.length);
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
      const current = recipeConsumption(
        techCard,
        b.job,
        // ТЕ ЖЕ ВЕСА, ЧТО У ИЗМЕРЕННОЙ СТОРОНЫ: строки, которые реально посчитались, с их
        // количествами в партии. Размер, по которому раскладка не снялась, в сверку не входит ни
        // слева, ни справа — иначе половина сравнения описывала бы другую партию.
        b.lines.flatMap((l) => l.job.sizes),
        sizeName,
      );
      const deltaPct =
        measured && current && current.kind !== 'perSizeGap' && current.value > 0
          ? ((measured.value - current.value) / current.value) * 100
          : null;
      // ═══ СКОЛЬКО РАЗМЕРНАЯ НОРМА НЕ ДОГОВАРИВАЕТ ═══════════════════════════════════════════
      //
      // Ради этой строки настил партии и снимается. Размерные нормы сняты на ОДНОМ изделии, а
      // одно изделие кладётся реже настоящего настила — то есть норма систематически идёт с
      // запасом, и НАСКОЛЬКО, до сих пор не знал никто.
      //
      // Оба числа берутся ГОТОВЫМИ: слева — измеренная длина настила ÷ его изделия, справа —
      // пер-размерный расход, ОПУБЛИКОВАННЫЙ сервером на строках состава норм (consumptionForSize).
      // Считать норму здесь заново значило бы завести второй ответ на вопрос, у которого уже есть
      // владелец, — и первым же расхождением стало бы «костинг говорит одно, раскрой другое».
      //
      // Взвешивание — тем же миксом партии, что и слева: сравнивать реальный настил партии со
      // средним по ряду значит сравнивать две разные партии.
      const normPerUnitCm =
        b.job.mode === 'batch'
          ? weightedNormCm(markersForLine(techCard?.markers, b.job.bomLineKey), b.job)
          : null;
      const normMeasured =
        normPerUnitCm != null
          ? toBomUnit(normPerUnitCm, b.job.unit, basis.ok ? basis.basis : undefined)
          : null;
      // Знаменатель — ЭТАЛОН (число, о котором говорится «занижала»), тот же, что и в сверке с
      // рецептом строкой ниже: два процента рядом обязаны означать одно и то же.
      const normDeltaPct =
        measured && normMeasured && normMeasured.value > 0
          ? ((measured.value - normMeasured.value) / normMeasured.value) * 100
          : null;
      return {
        head: b.job,
        lines: b.lines,
        avgCm,
        measured,
        current,
        deltaPct,
        normMeasured,
        normDeltaPct,
        totalQty,
        plannedQty,
      };
    });
  }, [plan, runs, cells, rollLines, materialById, techCard, sizeName, sizeOrder]);

  // ── рендер ────────────────────────────────────────────────────────────────────────────────
  const running = phase === 'running';
  const jobs = plan?.jobs ?? [];
  const draftCount = jobs.filter((j) => runs[j.id]?.status === 'draft').length;

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
              {phase === 'preparing' ? 'parsing the patterns…' : 'cut the run'}
            </Button>
          ) : running ? (
            <div className='flex gap-2'>
              <Button type='button' size='xs' variant='secondary' onClick={skipCurrent}>
                skip
              </Button>
              <Button type='button' size='xs' variant='secondary' onClick={stopAll}>
                stop
              </Button>
            </div>
          ) : (
            <div className='flex items-center gap-2'>
              <label className='flex items-center gap-1'>
                <Text size='micro' variant='label' component='span'>
                  budget, s
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
                {stale ? 'prepare again' : 're-prepare'}
              </Button>
              <Button
                type='button'
                size='xs'
                variant='secondary'
                disabled={selectedJobs.length === 0 || !!blocked || stale || laysLoading}
                title={
                  stale
                    ? 'the card data changed — prepare it again'
                    : laysLoading
                      ? "reading the run's markers — until the list is read, the plan does not know what is already captured in the run"
                      : undefined
                }
                onClick={start}
              >
                {laysLoading ? "reading the run's markers…" : `start (${selectedJobs.length})`}
              </Button>
            </div>
          )
        }
      >
        run cutting — markers by colorway and size
      </GroupLabel>

      {/* ЧТО СНИМАЕМ — ВЫБОР ДО ПРОГОНА, а не после. Оба режима считает один и тот же движок по
          одним и тем же выкройкам; отличаются они составом настила и владельцем раскладки, и это
          именно то, что оператор обязан решить заранее: переделка стоит минут поиска. Чипы, а не
          вкладки: это два ответа на один вопрос, а не два раздела. */}
      <ChipRow>
        <Chip
          selected={mode === 'norms'}
          pressed={mode === 'norms'}
          disabled={running}
          title='a marker for every (colorway × size), a lay for ONE garment. Such a norm is reused between runs and lives on the card'
          onClick={() => !running && setMode('norms')}
        >
          per-size norms
        </Chip>
        <Chip
          selected={mode === 'batch'}
          pressed={mode === 'batch'}
          disabled={running}
          title='one marker per (colorway × fabric), the composition is the size ratio of THIS run, reduced by the GCD. It belongs to the run and cannot become a norm'
          onClick={() => !running && setMode('batch')}
        >
          run lay
        </Chip>
      </ChipRow>

      {blocked ? (
        <Text size='micro' className='text-error'>
          {blocked}
        </Text>
      ) : (
        <Text size='micro' variant='label'>
          the nesting engine runs in THIS tab: the card's tabs are not unmounted, so the queue keeps
          computing while you are on another one — but leaving the card page kills it.{' '}
          {mode === 'batch'
            ? "The lay is placed on the run's OWN size ratio, reduced by the GCD (60 M + 40 L → 3 M + 2 L): its efficiency IS the real cutting percent of this run. The marker belongs to the run and cannot become a style norm — every run has a ratio of its own."
            : "The lay is captured for ONE garment of each size: a multi-kit one packs tighter, so the measured consumption runs on the high side and the efficiency is lower than the workshop's. The real cutting percent is shown by the “run lay” mode."}
        </Text>
      )}

      {/* ПОДГОТОВКА ПРОТУХЛА. Разбор — снимок; ширина артикула, состав тканей или сами листы
          правятся на соседней вкладке, которая всё это время смонтирована. Раскладка по старому
          снимку записала бы норму на полотне, которого у ткани уже нет, — поэтому «запустить»
          гаснет, а причина стоит словами. */}
      {stale ? (
        <CalloutBox tone='warning'>
          <Text size='micro'>
            the card data changed after the preparation (width, fabric composition or the set of
            patterns) — the plan was taken on a stale snapshot. Prepare it again, otherwise the
            marker will be measured on the wrong cloth.
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
                <th className='border-b border-hairline px-1 py-1 text-left uppercase'>colorway</th>
                <th className='border-b border-hairline px-1 py-1 text-left uppercase'>fabric</th>
                {/* СОСТАВ, а не «размер»: у настила партии одного размера нет — там «3M+2L». */}
                <th className='border-b border-hairline px-1 py-1 text-left uppercase'>
                  composition
                </th>
                <th className='border-b border-hairline px-1 py-1 text-right uppercase'>width</th>
                <th className='border-b border-hairline px-1 py-1 text-right uppercase'>pieces</th>
                <th className='border-b border-hairline px-1 py-1 text-left uppercase'>forecast</th>
                <th className='border-b border-hairline px-1 py-1 text-left uppercase'>status</th>
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
                          {`${j.articleName}${j.pinned ? ' · colorway pin' : ' · slot article'}`}
                        </Text>
                      </div>
                    </td>
                    <td className='border-b border-hairline px-1 py-1'>{j.sizeLabel}</td>
                    <td className='border-b border-hairline px-1 py-1 text-right tabular-nums'>
                      {`${j.widthCm} cm`}
                    </td>
                    <td className='border-b border-hairline px-1 py-1 text-right tabular-nums'>
                      <div className='flex flex-col'>
                        <span>{j.pieceCount}</span>
                        {/* ЭКЗЕМПЛЯРЫ — ВТОРОЕ ЧИСЛО: слева уникальные контуры (ими платится
                            предпросчёт NFP), справа сколько их всего ляжет на полотно (это цена
                            поиска). У смешанного настила растут ОБА, и по-разному: контуры — на
                            набор каждого размера состава, экземпляры — на весь тираж. Сколько это
                            секунд, считает прогноз слева. */}
                        {j.instanceCount !== j.pieceCount ? (
                          <Text size='micro' variant='label' component='span'>
                            {`${j.instanceCount} instances`}
                          </Text>
                        ) : null}
                      </div>
                    </td>
                    <td className='border-b border-hairline px-1 py-1'>
                      <div className='flex flex-col gap-0.5'>
                        <span>{forecastText(j)}</span>
                        {j.replaces ? (
                          // ЧЕРНОВИК — НЕ «уже снята». Тот же бейдж на недосчитанной раскладке
                          // читался бы как «работа сделана», и оператор снял бы галочку с
                          // единственного задания, которое как раз надо пересчитать.
                          <Pill tone={j.replaces.isNorm || j.replaces.isDraft ? 'warn' : 'mut'}>
                            {j.replaces.isDraft
                              ? 'a DRAFT is lying there'
                              : j.replaces.isNorm
                                ? 'already captured · NORM'
                                : 'already captured'}
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
                      <div className='flex flex-col items-start gap-0.5'>
                        <span>{statusText(r)}</span>
                        {/* ЧЕРНОВИК ВИДЕН СЛОВОМ, а не только цветом строки: от готовой раскладки
                            он отличается ровно отсутствием числа, а отсутствие числа само по себе
                            читается как «ещё не посчитали». */}
                        {r?.status === 'draft' ? (
                          <Pill
                            tone='warn'
                            title='some pieces were not placed: the marker is saved, but no consumption is computed from it — neither scalar nor per size. A recompute with a bigger budget will replace it'
                          >
                            draft
                          </Pill>
                        ) : null}
                      </div>
                      {r?.error ? (
                        <Text
                          size='micro'
                          className={r.status === 'draft' ? 'text-labelColor' : 'text-error'}
                        >
                          {r.error}
                        </Text>
                      ) : null}
                      {/* ЗА ЭТОЙ СТРОКОЙ ЛЕЖИТ ПОСЧИТАННАЯ РАСКЛАДКА. Сохранение сорвалось —
                          геометрия от этого не испортилась, и заставлять оператора платить
                          минутами поиска за чужую пятисотку незачем. Досохранить можно и неполную:
                          она ляжет черновиком, ровно как легла бы в очереди. */}
                      {r?.status === 'failed' && r.result && !running ? (
                        <Button
                          type='button'
                          size='xs'
                          variant='secondary'
                          disabled={!!blocked}
                          onClick={() => void saveWithRetry(j, r.result as NestResult)}
                        >
                          save it again
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
              {`won't nest (${plan.refusals.length})`}
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
          nothing to nest: the run has no cell with a quantity, or the card has no roll-goods
          fabrics with patterns
        </Text>
      ) : null}

      {/* ЧЕРНОВИКИ НАЗЫВАЮТСЯ ОТДЕЛЬНО, а не растворяются в таблице. Их не видно в итоге по ткани
          (и правильно — их длина короче настоящей), поэтому без этой строки экран выглядел бы так,
          будто часть заданий просто не считалась. */}
      {draftCount > 0 ? (
        <CalloutBox tone='warning'>
          <Text size='micro'>
            {`drafts saved: ${draftCount}. They are visible ${
              mode === 'batch' ? 'on the run page' : "in the card's marker list"
            } and can be recomputed, but no consumption is computed from them anywhere — not in the total below, not in costing, not in the recipe: some pieces were not placed, and the length is shorter than the real one. Raise the search budget and run these rows again.`}
          </Text>
        </CalloutBox>
      ) : null}

      {/* ═══ ИЗМЕРЕННЫЙ РАСХОД — то, ради чего всё считалось. */}
      {results.length > 0 ? (
        <div className='mt-2 flex flex-col gap-2'>
          {results.map((g) => (
            <div key={`${g.head.scopeKey}|${g.head.colorwayId}`} className='flex flex-col'>
              <GroupLabel>
                {`${g.head.scopeLabel} · ${g.head.colorwayLabel} · ${g.head.widthCm} cm`}
              </GroupLabel>
              {g.lines.map((l) => (
                <Row
                  key={l.job.id}
                  // У настила партии в строке стоит ЕГО СОСТАВ, а не размер: «настил 3M+2L» —
                  // это и есть предмет замера, и КПД рядом относится именно к нему.
                  label={
                    l.job.mode !== 'batch'
                      ? `${l.job.sizeLabel} · ${l.job.batchQty} pcs`
                      : l.job.unitsTotal > 1
                        ? `lay ${l.job.sizeLabel} · covers ${l.job.batchQty} pcs of the run`
                        : // НАСТИЛОМ ЭТО НЕ НАЗЫВАЕТСЯ: соотношение свелось к одному изделию, и
                          // подпись «настил» приписала бы одиночной укладке цеховую плотность.
                          `ONE garment ${l.job.sizeLabel} · covers ${l.job.batchQty} pcs of the run`
                  }
                  value={`${l.result.usedLengthCm.toFixed(0)} cm · efficiency ${pct(l.result.efficiency)}`}
                />
              ))}
              <Row
                emphasis
                label={
                  g.lines.length > 1 ? 'per unit — weighted by the run quantities' : 'per unit'
                }
                value={g.measured ? `${g.measured.value} ${g.measured.unit}` : meters(g.avgCm)}
              />
              {/* ═══ ГЛАВНАЯ СТРОКА РЕЖИМА «НАСТИЛ ПАРТИИ»: НАСКОЛЬКО РАЗМЕРНАЯ НОРМА
                  НЕ ДОГОВАРИВАЕТ. Слева — измеренный настил на реальном соотношении, справа — те
                  же размерные нормы, взвешенные тем же миксом. Разницу между ними до сих пор не
                  видел никто: обе цифры выглядят одинаково «измеренными». */}
              {/* СОСТАВ СВЁЛСЯ К ОДНОМУ ИЗДЕЛИЮ — говорим это раньше любых процентов. КПД такой
                  укладки не является процентом раскроя партии: одиночное изделие кладётся реже
                  настоящего настила, ровно как в режиме размерных норм. */}
              {g.head.mode === 'batch' && g.head.unitsTotal === 1 ? (
                <Text size='micro' className='text-error'>
                  {`in this run the colorway is ordered in a single size (${g.head.sizeLabel}) — there is no lay here: the engine placed ONE garment. This is the same sparse placement as a per-size norm, so the efficiency is lower than the workshop's and the consumption runs on the high side; this number cannot be called the real cutting percent of the run`}
                </Text>
              ) : null}
              {g.head.mode === 'batch' && g.head.unitsTotal > 1 ? (
                <Text size='micro' variant='label'>
                  {g.normMeasured == null
                    ? 'nothing to compare with the per-size norms: they are not captured for all sizes of this lay, are captured on a different cloth width, or give no consumption (a draft is lying there, for instance). Capture the “per-size norms” mode for the same sizes'
                    : g.normDeltaPct == null
                      ? `the per-size norms give ${g.normMeasured.value} ${g.normMeasured.unit} on this mix`
                      : `the per-size norm gave ${g.normMeasured.value} ${g.normMeasured.unit} — ${
                          g.normDeltaPct >= 0
                            ? `understated by ${Math.abs(g.normDeltaPct).toFixed(0)}%`
                            : `overstated by ${Math.abs(g.normDeltaPct).toFixed(0)}%`
                        } (the percent is of the norm, as in the check against the recipe below)`}
                </Text>
              ) : null}
              {/* ЧАСТИЧНОЕ ПОКРЫТИЕ НАЗЫВАЕТСЯ ВСЛУХ. Взвешенное среднее по ПОЛОВИНЕ партии — это
                  ответ про половину, и молча выдавать его за расход партии нельзя: сравнение с
                  рецептом ниже опиралось бы на вес, которого нет. */}
              {g.totalQty > 0 && g.plannedQty > g.totalQty ? (
                <Text size='micro' className='text-error'>
                  {`computed ${g.totalQty} of ${g.plannedQty} garments of this colorway — for the remaining sizes no marker was captured (see the refusals above), and the number above describes only the computed part of the run`}
                </Text>
              ) : null}
              {/* СВЕРКА С РЕЦЕПТОМ — с тем числом, по которому расчёт РЕАЛЬНО идёт: пер-размерный
                  ряд, если он есть, иначе скаляр (см. recipeConsumption). Ряд, не покрывающий
                  размеры партии, — отдельный ответ: сравнить с ним нечего, а усечённая сумма
                  описывала бы другую партию. */}
              <Text size='micro' variant='label'>
                {g.current == null
                  ? "this colorway's recipe has no consumption for this fabric — nothing to compare with"
                  : g.current.kind === 'perSizeGap'
                    ? `the recipe sets the consumption PER SIZE (${sourceWord(g.current.source)}), but it has no sizes ${g.current.missing.join(', ')} of this run — nothing to compare with: a truncated range would describe a different run`
                    : g.measured == null
                      ? `the recipe holds ${round3(g.current.value)} ${g.head.unit}${perSizeWord(g.current.kind)} (${sourceWord(g.current.source)}); there is nothing to convert the measured length into the slot's unit with — ${
                          bomUnitKind(g.head.unit) === 'kg'
                            ? 'a kg slot needs the full roll width and the density of the article'
                            : `the unit “${g.head.unit || '—'}” does not accept length`
                        }`
                      : g.deltaPct == null
                        ? `the recipe holds ${round3(g.current.value)} ${g.head.unit}${perSizeWord(g.current.kind)} (${sourceWord(g.current.source)})`
                        : `the recipe number (${sourceWord(g.current.source)}) gave ${round3(g.current.value)} ${g.head.unit}${perSizeWord(g.current.kind)} — ${
                            g.deltaPct >= 0
                              ? `understated by ${Math.abs(g.deltaPct).toFixed(0)}%`
                              : `overstated by ${Math.abs(g.deltaPct).toFixed(0)}%`
                          }`}
              </Text>
              {/* ═══ СЛЕДУЮЩИЙ ШАГ НАСТИЛА ПАРТИИ — СТРОКА РАСКРОЯ ПРОГОНА.
                  Раскладка измерена, и всё, чего не хватает производственной строке, — это число
                  слоёв (выводится из партии) и концевые потери (не выводятся ниоткуда, см.
                  batch-lay-proposal). Форма настила при этом ОДНА на клиент: здесь монтируется та
                  же самая, что на странице партии, и запись делает она.

                  Нормой прогонная раскладка не станет физически (CHECK chk_tcm_run_not_norm) —
                  поэтому шага «назначить нормой» у настила партии нет и в помине. */}
              {g.head.mode === 'batch' && batchRunId > 0 ? (
                <BatchLayProposal
                  job={g.head}
                  markerId={runs[g.head.id]?.markerId ?? 0}
                  cells={cells}
                  lays={lays}
                  sizeLabel={sizeName}
                  canEdit={canWriteRuns}
                  locked={runLocked}
                  laysLoading={laysLoading}
                  queueRunning={running}
                  editor={layEditorContext}
                />
              ) : null}
            </div>
          ))}
          {/* СЛЕДУЮЩИЙ ШАГ — ОДНОЙ СТРОКОЙ НА ВЕСЬ ИТОГ, а не по строке на каждую ткань. Ссылка
              на страницу партии, размноженная по парам (ткань × колорвей), даёт на шести тканях и
              двух колорвеях двенадцать одинаковых ссылок — это шум, а не навигация: адрес у всех
              один и тот же.

              У размерной нормы шаг другой — назначить раскладку НОРМОЙ, — и делается он там, где
              уже живёт подтверждение с его последствиями (переназначение нормы рецепты НЕ
              пересчитывает). Ссылка, а не вторая кнопка: копия того диалога разошлась бы с
              оригиналом. */}
          <Text size='micro' variant='label'>
            {mode === 'batch' ? (
              <>
                the cutting can be assembled by hand, together with the rest of the run's fabrics,
                on the{' '}
                <Button asChild variant='underline' size='xs'>
                  <Link to={`/production-runs/${run.id ?? 0}`}>run page ↗</Link>
                </Button>
              </>
            ) : (
              <>
                to set a marker as the norm of the fabric and apply the consumption into the recipe
                —{' '}
                <Button asChild variant='underline' size='xs'>
                  <Link to='?tab=patterns'>the card's markers ↗</Link>
                </Button>
              </>
            )}
          </Text>
        </div>
      ) : null}
    </div>
  );
}

// ── подписи ───────────────────────────────────────────────────────────────────────────────

function forecastText(j: MarkerJob): string {
  const e = j.estimate;
  if (!e) return 'nothing to estimate';
  const seconds = e.predictedElapsedMs != null ? Math.ceil(e.predictedElapsedMs / 1000) : null;
  const head =
    e.outlook === 'starved'
      ? 'there will be no search'
      : e.outlook === 'squeezed'
        ? `~${Math.round(e.searchMsLeft / 1000)} s for the search`
        : `up to ${seconds ?? Math.ceil(e.timeBudgetMs / 1000)} s`;
  const coarse = e.coarsened ? ` · contours coarsened to ${e.effectiveEps} cm` : '';
  return `${head} · prepass ~${Math.round(e.predictedPrepassMs / 1000)} s${coarse}`;
}

function statusText(r: JobRun | undefined): string {
  if (!r) return '—';
  switch (r.status) {
    case 'queued':
      return 'queued';
    case 'running':
      return r.nfp
        ? `prepass ${r.nfp.done}/${r.nfp.total}`
        : `generation ${r.generation}${
            r.bestPct != null ? ` · efficiency ${r.bestPct.toFixed(1)}%` : ''
          }`;
    case 'saving':
      return 'saving…';
    case 'done':
      return r.result
        ? `done · ${r.result.usedLengthCm.toFixed(0)} cm · efficiency ${pct(r.result.efficiency)}`
        : 'done';
    case 'draft':
      // Ни длины, ни КПД: они относятся к НЕПОЛНОЙ укладке, и напечатанные в той же колонке, что у
      // готовой раскладки, читались бы как замер. Что именно не сошлось — говорит строка ошибки.
      return r.result ? `saved · ${r.result.placedCount} of ${r.result.totalCount}` : 'saved';
    case 'failed':
      return 'refused';
    case 'skipped':
      return 'skipped';
  }
}

function saveErrorText(e: unknown): string {
  const vs = extractFieldViolations(e);
  if (vs.length > 0) return vs.map((v) => v.description).join('; ');
  return e instanceof Error && e.message ? e.message : "couldn't save the marker";
}

/**
 * РАЗМЕРНАЯ НОРМА, ВЗВЕШЕННАЯ МИКСОМ ЭТОЙ ПАРТИИ, см на изделие. null = сравнивать не с чем.
 *
 * Эталон для настила партии: «сколько ткани обещали размерные нормы на ровно тот же микс». Числа
 * берутся ТОЛЬКО опубликованные — `consumptionForSize` отдаёт то, что сервер посчитал на строках
 * состава раскладки, — и ни одно из них здесь не выводится заново. Раскладку на каждый размер
 * выбирает общий компаратор (`latestPerSize`: норма → свой колорвей → свежесть), тот же, которым
 * пользуется применение в рецепт: показывать один эталон, а применять другой было бы хуже, чем не
 * показывать вовсе.
 *
 * ВСЕ РАЗМЕРЫ ИЛИ НИ ОДНОГО. Норма, посчитанная по трём размерам из пяти, описывает другую партию —
 * и ровно на разницу их долей разошлась бы с левой частью сравнения.
 *
 * И ВСЕ — НА ТОМ ЖЕ ПОЛОТНЕ. Длина не переносится между ширинами: норма, снятая на 140 см, против
 * настила на 150 даёт разницу, которая к плотности укладки отношения не имеет вовсе, — а строка на
 * экране объявила бы её тем самым «сколько норма не договаривает». Сверяются РАСКРОЙНЫЕ ширины
 * (обе стороны хранят именно их), допуск — полсантиметра, как и в диалоге применения.
 */
function weightedNormCm(
  lineMarkers: common_TechCardMarkerSummary[],
  job: MarkerJob,
): number | null {
  // Чужие колорвеи — вон: у них свой приколотый артикул, своя ширина, и «расхождение» вышло бы
  // расхождением тканей. Общие раскладки (colorway_id = 0) остаются: они и снимались на ширине
  // слота, то есть на том же полотне, что достаётся колорвею без пина.
  const bySize = latestPerSize(markersOfColorway(lineMarkers, job.colorwayId), job.colorwayId);
  let qty = 0;
  let sum = 0;
  for (const row of job.sizes) {
    const m = bySize.get(row.sizeId);
    if (!m) return null;
    const w = decNum(m.fabricWidthCm);
    if (!(w > 0) || Math.abs(w - job.widthCm) > 0.5) return null;
    const cm = consumptionForSize(m, row.sizeId);
    if (cm == null || !(cm > 0)) return null;
    const q = Math.max(0, row.batchQty);
    qty += q;
    sum += q * cm;
  }
  return qty > 0 ? sum / qty : null;
}

/**
 * Расход, который СЕЙЧАС лежит в рецепте колорвея по этой ткани, — то самое число, по которому
 * костинг считает деньги.
 *
 * Читается ровно одна строка: НОРМОНОСЕЦ, то есть строка уровня ИЗДЕЛИЯ. Строка, привязанная к
 * детали кроя, — это назначение материала («деталь X кроится из артикула Y»), а не норма, и брать с
 * неё расход значило бы прочитать чужой факт (сервер её так и читает — IsPieceMaterialAssignment).
 *
 * ═══ ПЕР-РАЗМЕРНЫЙ РЯД БЬЁТ СКАЛЯР, И ЭТО НЕ ПРЕДПОЧТЕНИЕ, А ПРАВИЛО РАСЧЁТА ══════════════════
 *
 * `usagePerGarmentQty` игнорирует скаляр, как только `size_consumptions` непуст, — а применение по
 * размерам СПЕЦИАЛЬНО оставляет прежний скаляр лежать на месте (стирает его только скалярный
 * режим). То есть строка сплошь и рядом несёт ОБА числа, из которых работает только одно. Читая
 * скаляр, экран сравнивал измеренное с числом, которого костинг не видит: живой ряд M = 1.00 /
 * L = 2.00 при партии 90 M + 10 L даёт 1.10, лежащий рядом мёртвый скаляр 1.50 — и «завышала на
 * 27 %» печаталось там, где расхождения нет вовсе.
 *
 * Ряд сворачивается ТЕМ ЖЕ МИКСОМ ПАРТИИ, что и измеренная сторона: сравнивать реальный настил со
 * средним по ряду значит сравнивать две разные партии. Неполное покрытие — отдельный ответ, а не
 * усечённая сумма: ряд без одного из размеров партии не описывает ни того, ни другого.
 */
type RecipeNorm =
  | { kind: 'scalar' | 'perSize'; value: number; source: string }
  | { kind: 'perSizeGap'; source: string; missing: string[] };

function recipeConsumption(
  card: common_TechCard | undefined,
  job: MarkerJob,
  /**
   * Размеры, ПО КОТОРЫМ РЕАЛЬНО СНЯТ измеренный ответ, с их количествами в партии. Берутся не из
   * `job.sizes`, а из всех посчитанных строк группы: в режиме норм группа держит по строке на
   * размер, и свернуть ряд рецепта по составу ОДНОЙ из них значило бы сравнить среднее по трём
   * размерам с нормой одного.
   */
  measuredSizes: readonly JobSizeRow[],
  sizeName: (sizeId: number) => string,
): RecipeNorm | null {
  for (const u of normCarriers(card, job.colorwayId, job.bomLineKey)) {
    const rows = u.sizeConsumptions ?? [];
    const source = u.consumptionSource ?? '';
    if (rows.length > 0) {
      const bySize = new Map<number, number>();
      for (const r of rows) {
        const n = Number(r.consumption?.value ?? '');
        if (Number(r.sizeId ?? 0) > 0 && Number.isFinite(n) && n > 0) {
          bySize.set(Number(r.sizeId), n);
        }
      }
      const missing = measuredSizes
        .filter((x) => !bySize.has(x.sizeId))
        .map((x) => sizeName(x.sizeId));
      if (missing.length > 0) return { kind: 'perSizeGap', source, missing };
      let qty = 0;
      let sum = 0;
      for (const x of measuredSizes) {
        const q = Math.max(0, x.batchQty);
        qty += q;
        sum += q * (bySize.get(x.sizeId) as number);
      }
      if (qty > 0) return { kind: 'perSize', value: sum / qty, source };
      continue;
    }
    const raw = u.consumption?.value;
    const n = Number(raw ?? '');
    if (!raw || !Number.isFinite(n) || n <= 0) continue;
    return { kind: 'scalar', value: n, source };
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
