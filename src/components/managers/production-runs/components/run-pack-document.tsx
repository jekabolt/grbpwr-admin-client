import {
  CutPlanRow,
  GetProductionRunCutPlanResponse,
  common_ProductionRun,
  common_ProductionRunLay,
  common_ProductionRunLayCoverageCell,
  googletype_Decimal,
} from 'api/proto-http/admin';
import { useSuppliers } from 'components/managers/accounting/utils/hooks';
import { PageFurniture, furnitureLine } from 'components/managers/print/page-furniture';
import { EMPTY_QUERY, type PrintQuery } from 'components/managers/print/scope';
import { depStatus, type PrintDep } from 'components/managers/print/use-print-ready';
import {
  PRINT_CUT_SYMMETRY_LEGEND,
  PRINT_LAY_MODE_LABEL,
  printCutSymmetryBadge,
  printLayVerdictWord,
} from 'components/managers/print/labels';
import { KV, Nothing, Sheet, TD, TH } from 'components/managers/print/sheet';
import { cutPlanAuthoritative } from 'components/managers/print/labels';
import { PackagingSheet } from 'components/managers/print/sheets/packaging';
import { grainlineArrow } from 'components/managers/tech-card/components/piece-codes';
import { wireInt } from 'components/managers/tech-card/components/schema';
import { useTechCardReleases } from 'components/managers/tech-card/components/useSamples';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { ReactNode, useEffect, useMemo } from 'react';
import { PatternQR } from 'ui/components/pattern-qr';
import { GrbpwrMark } from 'ui/icons/grbpwr-mark';
import { decimalToInput } from 'utils/decimal';
import { viewerOrigin } from 'utils/viewer-origin';
import { cmToM } from './lay-card';
import { runDate, runStatusLabel } from './options';
import { VERDICT_GLYPH, layVerdict, useRunLays } from './useLays';
import { useMaterialPlan } from './useProductionRuns';

// НАРЯД НА ПАРТИЮ — печатный документ ПРОГОНА.
//
// Разделение, которое этот документ обязан выражать собой, а не только соблюдать:
//   тех-пак карты  = «как это устроено» — деталь, долевая, шов, лекало. Чисел тиража там НЕТ.
//   наряд прогона  = «сколько и из чего именно в ЭТОЙ партии» — всё, что зависит от тиража.
// Со стиля только что убрали cut list и лист «size run» (02c3b35a) — потому что оба печатали
// количества от ТИПОВОГО тиража карточки, то есть от калькуляционной величины, которую цех читал
// как заказ. Наряд заменяет их обоих, но на прогоне, где количества настоящие.
//
// ДЕНЕГ ЗДЕСЬ НЕТ НИ ОДНОЙ: ни плановой себестоимости, ни цен артикулов, ни актуалов. Бумага уезжает
// в цех, а костинг живёт за costing:read — напечатанный лист этого гейта не имеет. Часть данных,
// которые документ читает, денежные поля НЕСЁТ (release meta.unit_cost, run.actuals); они просто не
// выводятся, и это правило, а не текущее состояние вёрстки.

// Примитивы вёрстки (Sheet/KV/TD/TH/Nothing) переехали в components/managers/print/sheet.tsx —
// общий лёгкий модуль. Раньше здесь стояла намеренная копия, чтобы не тащить в чанк печатного
// роута наряда весь тех-пак с его медиа, моделями и словарями; общий модуль эту причину снимает,
// пока сам остаётся standalone (правило записано в его шапке).

const ZERO_TS = '0001-01-01T00:00:00Z';

// Слово слоя по секции слота (T4): деталь со слоями даёт по строке наряда на слой, и подпись — то,
// что не даёт шеллу и подкладу прочитаться дублем. Кат-план несёт proto-энум секции; глубже секции
// наряд роль не знает (назначение по его проводу не едет), и этого достаточно.
const CUT_LAYER_WORD: Record<string, string> = {
  TECH_CARD_BOM_SECTION_FABRIC: 'fabric',
  TECH_CARD_BOM_SECTION_LINING: 'lining',
  TECH_CARD_BOM_SECTION_INTERLINING: 'interlining',
  TECH_CARD_BOM_SECTION_INSULATION: 'insulation',
};
const cutLayerWord = (section?: string): string => CUT_LAYER_WORD[section ?? ''] ?? '';

// Отметка времени для ревизии документа: минуты достаточно, секунды — шум. UTC назван вслух, потому
// что штамп сверяют с другим листом, напечатанным в другом часовом поясе.
const stampAt = (ts?: string): string =>
  !ts || ts === ZERO_TS ? '' : `${ts.slice(0, 10)} ${ts.slice(11, 16)} UTC`;

const dec = (d?: googletype_Decimal): string => decimalToInput(d) || '';

export function RunPackDocument({
  run,
  cutPlan,
  cutPlanUnavailable = false,
  runPackToken,
  onDataStatus,
  printQuery = EMPTY_QUERY,
}: {
  run: common_ProductionRun;
  cutPlan?: GetProductionRunCutPlanResponse;
  /** Сервер отказал (в том числе «RPC ещё нет на контуре») — это отдельная новость от «пусто». */
  cutPlanUnavailable?: boolean;
  /**
   * Токен-капабилити публичного наряда (GetProductionRunResponse.run_pack_token). Пусто — старый
   * бэкенд или неподключённый сервис наряда: тогда QR просто не рисуется. Рамка-пустышка вместо
   * него была бы хуже пустого места — она читается как «QR не пропечатался».
   */
  runPackToken?: string;
  /** Статусы запросов, которые документ делает сам, — для гейта готовности печатной страницы. */
  onDataStatus?: (deps: PrintDep[]) => void;
  /**
   * Скоуп печати из query. Наряду сейчас нужен из него только колорвей: партия на нескольких
   * цветах печатается в цех по одному цвету за раз, иначе на раскройном столе лежит бумага про
   * чужую ткань.
   */
  printQuery?: PrintQuery;
}) {
  const ins = run.run;
  const runId = wireInt(run.id);
  const techCardId = wireInt(ins?.techCardId);
  const releaseId = wireInt(ins?.releaseId);

  const { dictionary } = useDictionary();
  const {
    data: techCard,
    isPending: techCardPending,
    isLoading: techCardLoading,
    isError: techCardError,
  } = useTechCard(techCardId || undefined);
  // Статусы, а не только данные. Лист, напечатанный на полпути загрузки, обязан сказать
  // «не получено», а не «настилов нет» и не «потребности нет»: пустой ответ и не приехавший ответ
  // выглядят на бумаге одинаково, а означают противоположное, и цех отличить их уже ничем не может.
  const {
    data: laysData,
    isPending: laysPending,
    isLoading: laysLoading,
    isError: laysError,
  } = useRunLays(runId, runId > 0);
  const {
    data: materialPlan,
    isPending: materialPending,
    isLoading: materialLoading,
    isError: materialError,
  } = useMaterialPlan(runId, runId > 0);
  const { data: suppliersData } = useSuppliers();
  // Резервный источник номера ревизии: кат-план называет её сам (release_number), но он может не
  // приехать, а прогон при этом ПРИВЯЗАН к релизу. Напечатать в этом случае «ревизия не
  // зафиксирована» было бы враньём наоборот.
  const { data: releasesData } = useTechCardReleases(techCardId || undefined);

  // Статусы собственных запросов документа — наверх, в гейт готовности печатной страницы.
  // Ключ-строка не даёт эффекту срабатывать на каждый рендер.
  //
  // ГЕЙТУ отдаём isLoading, а НЕ isPending. В react-query v5 у отключённого запроса
  // (`enabled: false`) `isPending` навсегда true — данных нет и не будет, — а `isLoading` = pending
  // && fetching, то есть false. Скорми гейту isPending, и прогон, у которого нет привязанной
  // карты, десять секунд держал бы кнопку печати заблокированной, а потом печатал плашку «тех-карта
  // не пришла» про запрос, который никто не посылал. Собственным плашкам документа, наоборот,
  // нужен именно isPending: там вопрос «есть ли данные», а не «едут ли они».
  const depsKey = [
    techCardLoading,
    techCardError,
    laysLoading,
    laysError,
    materialLoading,
    materialError,
  ].join(',');
  useEffect(() => {
    onDataStatus?.([
      { label: 'tech card', status: depStatus(techCardLoading, techCardError) },
      { label: 'lays', status: depStatus(laysLoading, laysError) },
      { label: 'material plan', status: depStatus(materialLoading, materialError) },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  const tc = techCard?.techCard;

  // ФИЛЬТР КОЛОРВЕЯ. Применяется к ИСТОЧНИКАМ (линии, кат-лист, настилы, покрытие), а не к
  // выводу: отфильтруй только таблицу — и итоги под ней останутся от всей партии, то есть лист
  // напечатает урезанные строки под чужой суммой. На линии основной карты колорвей адресуется
  // productId (колорвей = product, R1), на линии aux-карты — outputVariantId.
  const scopeColorwayId = printQuery.colorwayId;
  const inScope = (colorwayId?: number, variantId?: number): boolean =>
    !scopeColorwayId ||
    wireInt(colorwayId) === scopeColorwayId ||
    wireInt(variantId) === scopeColorwayId;

  const lines = useMemo(
    () => (ins?.lines ?? []).filter((l) => inScope(l.productId, l.outputVariantId)),
    [ins?.lines, scopeColorwayId],
  );

  // Градация карточки, приведённая к числам ОДИН РАЗ. Ниже она трижды сравнивается со множествами
  // размеров, собранными через wireInt (линии прогона, клетки покрытия, кат-лист): сравни строку с
  // числом — и `includes` промолчит, порядок градации потеряется, а колонки трёх таблиц одного листа
  // разъедутся между собой, не сообщив об этом ничем.
  const gradeSizeIds = useMemo(() => (tc?.sizeIds ?? []).map(wireInt), [tc?.sizeIds]);

  const sizeLabel = useMemo(
    () => (id: number) =>
      id > 0 ? findInDictionary(dictionary, id, 'size') || `#${id}` : 'no size',
    [dictionary],
  );

  // Колорвей = продукт (R1); имя резолвится из словаря по коду цвета — тем же способом, что
  // lines-grid.tsx, material-plan.tsx и lay-plan.tsx, чтобы экран и бумага не назвали цвет
  // по-разному прямо в тот момент, когда по бумаге режут.
  const colorwayLabel = useMemo(() => {
    const byId = new Map<number, string>();
    for (const cw of techCard?.colorways ?? []) {
      const dc = dictionary?.colors?.find((c) => c.code === cw.colorCode);
      const name = dc?.name ?? cw.colorCode ?? '';
      byId.set(wireInt(cw.colorwayId), `${cw.colorCode ? `${cw.colorCode} · ` : ''}${name}`);
    }
    return (id: number) => byId.get(id) || (id > 0 ? `#${id}` : '(no colorway)');
  }, [techCard?.colorways, dictionary?.colors]);

  const variantLabel = useMemo(() => {
    const byId = new Map<number, string>();
    for (const v of techCard?.outputVariants ?? []) {
      const label = [v.colorCode, v.colorName].filter(Boolean).join(' · ');
      byId.set(wireInt(v.id), label || `color #${wireInt(v.id)}`);
    }
    return (id: number) => byId.get(id) || `color #${id}`;
  }, [techCard?.outputVariants]);

  // ─────────────────────────────────────────────────────────────────────────
  // ЛИНИИ ПАРТИИ. Строка = колор-модель (продукт) или, у вспомогательной карты, цвет выхода;
  // колонка = размер. Клетка — planned_qty прогона, и это ЕДИНСТВЕННЫЙ источник тиража во всём
  // документе: всё ниже (кат-лист, покрытие, материалы, короба) считается от него.
  const lineRows = useMemo(() => {
    type Row = { key: string; label: string; bySize: Map<number, number>; total: number };
    const rows = new Map<string, Row>();
    for (const l of lines) {
      const productId = wireInt(l.productId);
      const variantId = wireInt(l.outputVariantId);
      const key = productId > 0 ? `p${productId}` : variantId > 0 ? `v${variantId}` : 'none';
      let row = rows.get(key);
      if (!row) {
        row = {
          key,
          label:
            productId > 0
              ? colorwayLabel(productId)
              : variantId > 0
                ? variantLabel(variantId)
                : '(colorway not assigned)',
          bySize: new Map(),
          total: 0,
        };
        rows.set(key, row);
      }
      const sizeId = wireInt(l.sizeId);
      const qty = wireInt(l.plannedQty);
      row.bySize.set(sizeId, (row.bySize.get(sizeId) ?? 0) + qty);
      row.total += qty;
    }
    return [...rows.values()];
  }, [lines, colorwayLabel, variantLabel]);

  // Колонки — ТОЛЬКО те размеры, по которым в партии есть клетки, в порядке градации карточки.
  // Печатать всю градацию значило бы вывести на бумагу колонки, которых в этом тираже нет: пустая
  // колонка у раскройного стола читается как «этот размер забыли проставить». Размер 0 — линия без
  // размера (вспомогательная карта), у неё своя колонка «б/р», а не молчание.
  const lineSizeColumns = useMemo(() => {
    const present = new Set(lines.map((l) => wireInt(l.sizeId)));
    const grade = gradeSizeIds.filter((s) => present.has(s));
    const extra = [...present].filter((s) => s > 0 && !grade.includes(s));
    return [...(present.has(0) ? [0] : []), ...grade, ...extra];
  }, [lines, gradeSizeIds]);

  const plannedTotal = lineRows.reduce((sum, r) => sum + r.total, 0);
  const lineColTotal = (sizeId: number) =>
    lineRows.reduce((sum, r) => sum + (r.bySize.get(sizeId) ?? 0), 0);

  // ─────────────────────────────────────────────────────────────────────────
  // КАТ-ЛИСТ. Считает СЕРВЕР (тот же ответ уезжает в публичный манифест наряда), клиент только
  // печатает: вторая реализация «сколько выкроить» обязана была бы совпасть с первой и не совпала
  // бы — ровно от такой пары этот наряд цех и избавляет.
  const cutRows = useMemo(
    () => (cutPlan?.rows ?? []).filter((r) => inScope(r.colorwayId, r.outputVariantId)),
    [cutPlan?.rows, scopeColorwayId],
  );
  // Блокеры фильтруются так же, как строки: «стоп» про белый цвет над таблицей чёрного
  // отправляет цех останавливаться из-за чужой партии.
  const cutBlockers = (cutPlan?.blockers ?? []).filter((b) => inScope(b.colorwayId));

  // АВТОРИТЕТЕН ЛИ ОТВЕТ ВООБЩЕ. Пока бэкенд этого RPC дописывают, шлюз может ответить 200 и пустым
  // телом — и тогда `rows: []` неотличимо от честного «в карте нет деталей кроя». Разница огромна:
  // первое значит «мы ничего не узнали», второе — «узнали, кроить нечего», и печатать первое как
  // второе значит выдать несуществующий наряд за полный. Различаем по ревизии: настоящая реализация
  // ВСЕГДА называет свой снимок (generated_at + run_lock_version, они же едут в QR), а пустая
  // заглушка — никогда.
  const cutPlanIsAuthoritative = cutPlanAuthoritative(cutPlan?.generatedAt);

  // РЕВИЗИЯ, ПОД КОТОРОЙ ПОСЧИТАНЫ КОЛИЧЕСТВА, против ревизии прогона СЕЙЧАС. Это две РАЗНЫЕ
  // величины, и они расходятся ровно в том случае, ради которого документ вообще называет свою
  // ревизию: кто-то поправил сетку, пока лист печатался. Штамповать лист версией прогона, а числа
  // брать из снимка другой версии — это подпись под чужими цифрами.
  const runLockVersion = wireInt(run.lockVersion);
  const planLockVersion = wireInt(cutPlan?.runLockVersion);
  const revisionDrift = cutPlanIsAuthoritative && planLockVersion !== runLockVersion;

  // Колонки кат-листа и их подписи берутся ИЗ ОТВЕТА (size_name), а не из словаря: строка наряда и
  // её заголовок обязаны называть размер одним словом, даже если словарь клиента отстал.
  const cutSizeColumns = useMemo(() => {
    const names = new Map<number, string>();
    for (const r of cutRows)
      for (const s of r.bySize ?? []) {
        const id = wireInt(s.sizeId);
        if (id > 0 && !names.has(id)) names.set(id, s.sizeName?.trim() || sizeLabel(id));
      }
    const grade = gradeSizeIds.filter((s) => names.has(s));
    const extra = [...names.keys()].filter((s) => !grade.includes(s));
    return [...grade, ...extra].map((id) => ({ id, name: names.get(id) ?? sizeLabel(id) }));
  }, [cutRows, gradeSizeIds, sizeLabel]);

  const cutCell = (row: CutPlanRow, sizeId: number) =>
    (row.bySize ?? []).find((s) => wireInt(s.sizeId) === sizeId);

  // ─────────────────────────────────────────────────────────────────────────
  // НАСТИЛЫ И ПОКРЫТИЕ. Покрытие считает сервер по размещениям в блобах маркеров; здесь оно только
  // читается. Печатный вид проще экранного (без поповеров), но СЛОВАРЬ вердиктов общий с экраном —
  // ровно затем словарь и вынесен в useLays.ts: «не проверено» на бумаге и «не проверено» на экране
  // обязаны означать одно и то же.
  const lays = useMemo(
    () => (laysData?.lays ?? []).filter((l) => inScope(l.colorwayId)),
    [laysData?.lays, scopeColorwayId],
  );
  const coverage = useMemo(
    () => (laysData?.coverage ?? []).filter((c) => inScope(c.colorwayId)),
    [laysData?.coverage, scopeColorwayId],
  );

  const coverageColorways = useMemo(() => {
    const ids = new Set<number>();
    for (const c of coverage) ids.add(wireInt(c.colorwayId));
    for (const l of lays) ids.add(wireInt(l.colorwayId));
    return [...ids].filter((id) => id > 0);
  }, [coverage, lays]);

  const coverageSizes = useMemo(() => {
    const extra = coverage
      .map((c) => wireInt(c.sizeId))
      .filter((s) => s > 0 && !gradeSizeIds.includes(s));
    const present = new Set(coverage.map((c) => wireInt(c.sizeId)));
    return [...gradeSizeIds.filter((s) => present.has(s)), ...new Set(extra)];
  }, [coverage, gradeSizeIds]);

  const coverageByCell = useMemo(() => {
    const m = new Map<string, common_ProductionRunLayCoverageCell>();
    for (const c of coverage) m.set(`${wireInt(c.colorwayId)}:${wireInt(c.sizeId)}`, c);
    return m;
  }, [coverage]);

  // Клетки, на которых цех обязан остановиться, — списком под матрицей. В самой клетке им места нет
  // (там две цифры и глиф), а без имён деталей «✗ 8/20» не говорит, чего именно не хватает.
  const coverageNotes = useMemo(
    () =>
      coverage
        .filter((c) => layVerdict(c.status) !== 'ok')
        .map((c) => ({
          key: `${wireInt(c.colorwayId)}:${wireInt(c.sizeId)}`,
          verdict: layVerdict(c.status),
          text: `${colorwayLabel(wireInt(c.colorwayId))} · ${sizeLabel(wireInt(c.sizeId))} — ${
            c.coveredQty ?? 0
          }/${c.plannedQty ?? 0}${
            (c.blockingPieceNames ?? []).length > 0
              ? `, minimum set by: ${(c.blockingPieceNames ?? []).join(', ')}`
              : ''
          }${(c.unknownPieceCount ?? 0) > 0 ? `, pieces without an answer: ${c.unknownPieceCount}` : ''}`,
        })),
    [coverage, colorwayLabel, sizeLabel],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ШАПКА.
  const factory = useMemo(() => {
    const supplierId = wireInt(ins?.supplierId);
    if (supplierId <= 0) return '';
    const s = (suppliersData?.suppliers ?? []).find((x) => wireInt(x.id) === supplierId);
    return s?.name?.trim() || `#${supplierId}`;
  }, [ins?.supplierId, suppliersData?.suppliers]);

  // ПО КАКОЙ КАРТЕ ПОСЧИТАН КАТ-ЛИСТ — говорит САМ ОТВЕТ (release_id/release_number), и контракт
  // называет это полем ответа именно затем, чтобы клиент не выводил ревизию из наличия release_id на
  // прогоне. Привязка прогона остаётся запасным источником: она отвечает на тот же вопрос, когда
  // кат-лист не приехал вовсе.
  const planReleaseId = wireInt(cutPlan?.releaseId) || releaseId;
  const releaseNumber = useMemo(() => {
    const fromPlan = wireInt(cutPlan?.releaseNumber);
    if (fromPlan > 0) return fromPlan;
    const meta = (releasesData?.releases ?? []).find((r) => wireInt(r.id) === planReleaseId);
    return wireInt(meta?.releaseNumber);
  }, [cutPlan?.releaseNumber, releasesData?.releases, planReleaseId]);

  const materialRows = materialPlan?.rows ?? [];
  const materialBlockers = materialPlan?.blockers ?? [];
  const materialCaveats = materialPlan?.caveats ?? [];

  const packaging = tc?.packaging;

  return (
    <div className='mx-auto max-w-[210mm] bg-white px-8 py-6 text-black'>
      {/* Постраничный колонтитул: лист наряда, вынутый из стопки, обязан называть партию и
          версию плана, по которой он напечатан. Один PageFurniture на документ. */}
      <PageFurniture
        line={furnitureLine(
          `PR-${runId || '—'}`,
          tc?.styleNumber ? `style ${tc.styleNumber}` : '',
          runLockVersion > 0 ? `plan v${runLockVersion}` : '',
        )}
      />
      {/* ЧЕМ ОГРАНИЧЕН ЛИСТ. Наряд по одному колорвею выглядит как наряд на всю партию, только
          короче: не назови он свой скоуп вслух — и тираж одного цвета прочитают как весь заказ. */}
      {scopeColorwayId > 0 && (
        <p className='mb-3 break-inside-avoid border-2 border-black px-2 py-1 text-control uppercase'>
          printed for one colorway: {colorwayLabel(scopeColorwayId)} — lines of this batch&apos;s
          other colors are not on this sheet
        </p>
      )}
      {/* ШАПКА — что это за партия и по какой ревизии её кроят. */}
      <header className='mb-5 border-b-2 border-black pb-3'>
        <div className='flex items-start justify-between gap-4'>
          <div className='flex items-start gap-3'>
            <GrbpwrMark className='mt-0.5 h-10 w-10 shrink-0 text-black' />
            <div>
              <div className='text-micro uppercase tracking-[0.2em] text-labelColor'>
                {tc?.brand || 'GRBPWR'} · production run pack
              </div>
              <div className='text-2xl font-bold uppercase leading-tight'>PR-{runId || '—'}</div>
              <div className='text-sm'>
                style <span className='font-semibold'>{tc?.styleNumber || `TC-${techCardId}`}</span>
                {tc?.name ? ` · ${tc.name}` : ''}
              </div>
            </div>
          </div>
          <div className='flex items-start gap-3'>
            <div className='text-right text-control leading-tight'>
              <div className='font-semibold uppercase'>{runStatusLabel(ins?.status)}</div>
              <div className='text-labelColor'>
                planned {runDate(ins?.plannedStartAt) || '—'} → promised{' '}
                {runDate(ins?.promisedAt) || '—'}
              </div>
              <div>{factory ? `factory: ${factory}` : 'factory not assigned'}</div>
            </div>
            {/* QR ЖИВОГО НАРЯДА.
                Ширина под ~22 мм — минимум, на котором телефон берёт код с мятого листа; место было
                зарезервировано заранее ровно затем, чтобы появление кода не перекраивало шапку —
                цех читает её по позициям, и переехавшая строка «по какой ревизии кроим» это не
                косметика.

                В ссылке ДВЕ ЧАСТИ, и вторая — весь смысл этой бумаги. Токен открывает наряд, а
                ?v={lock_version} говорит, ДЛЯ КАКОЙ ВЕРСИИ ПАРТИИ лист напечатан: вьюер сверяет его
                с живой версией и, если они разошлись, кричит, что бумага в руках устарела. Убери
                параметр — и лист снова станет неотличим от свежего, то есть станет ровно тем, от
                чего живой вьюер и заводился.

                origin берётся из VITE_PATTERN_VIEWER_ORIGIN (utils/viewer-origin), а НЕ из
                window.location.origin: печать из превью Vercel зашила бы в код эфемерный алиас за
                SSO, который умирает вместе с веткой, и умирает молча — через месяц, в цеху.

                Токена нет — место остаётся пустым, без рамки: рамка без кода читается как «QR не
                пропечатался», то есть отправляет печатать заново то, что печатать заново незачем. */}
            <div data-run-pack-qr className='w-[22mm] shrink-0'>
              {runPackToken ? (
                <figure className='text-center'>
                  <PatternQR
                    size={76}
                    value={`${viewerOrigin()}/r/${runPackToken}?v=${runLockVersion}`}
                  />
                  <figcaption className='mt-0.5 text-nano uppercase leading-tight'>
                    live run pack
                    <span className='block text-labelColor'>
                      point a camera: its numbers are always current
                    </span>
                  </figcaption>
                </figure>
              ) : (
                <div className='h-[22mm]' aria-hidden />
              )}
            </div>
          </div>
        </div>

        {/* ПО КАКОЙ КАРТЕ КРОИМ. Релиз — замороженная спецификация; его отсутствие не «мелочь по
            умолчанию», а факт, который цех обязан знать: живая карта меняется под ним, и лист в
            руках может расходиться с ней уже сейчас. Поэтому не молчание, а плашка. */}
        <div className='mt-2'>
          {planReleaseId > 0 ? (
            <div className='border border-black px-2 py-1 text-control'>
              cut list computed from frozen specification{' '}
              <b>Rev.{releaseNumber > 0 ? releaseNumber : `#${planReleaseId}`}</b>.
              {/* Claim'у нельзя быть шире того, что заморожено. Замораживает релиз спецификацию
                  кроя, по которой сервер считал кат-лист; градация и упаковка на этом листе взяты
                  с ЖИВОЙ карточки, потому что читаются они оттуда. Написать просто «спецификация
                  заморожена» значило бы распространить гарантию на числа, которых она не покрывает. */}
              <span className='text-labelColor'>
                {' '}
                Size grading and packaging below come from the live card.
              </span>
            </div>
          ) : (
            <div className='border-2 border-black px-2 py-1 text-control font-bold uppercase'>
              printed from the live card — revision not frozen. The card is being edited and may
              have changed after printing: confirm with the technologist before cutting.
            </div>
          )}
        </div>

        {/* РЕВИЗИЯ САМОГО ДОКУМЕНТА. Наряд живой — количества берутся из прогона, а прогон правят.
            Замораживать его отдельной сущностью не стали, поэтому он ОБЯЗАН называть свою ревизию:
            иначе два листа с разными числами неразличимы, и невозможно сказать, какой из них
            устарел. lock_version — версия прогона, generated_at — момент снимка кат-листа. */}
        <div className='mt-1 flex flex-wrap gap-x-4 text-nano uppercase text-labelColor'>
          <span>batch revision now: lock_version {runLockVersion}</span>
          <span>
            cut list computed for: lock_version{' '}
            {cutPlanIsAuthoritative ? planLockVersion : 'UNKNOWN'}
          </span>
          <span>
            cut list snapshot:{' '}
            {stampAt(cutPlan?.generatedAt) || (cutPlanUnavailable ? 'NOT RECEIVED' : 'none')}
          </span>
          <span>sheet printed: {stampAt(new Date().toISOString())}</span>
        </div>

        {/* РАСХОЖДЕНИЕ РЕВИЗИЙ — единственная новость шапки, которая отменяет весь кат-лист ниже.
            Прогон правили после того, как сервер посчитал «сколько выкроить»: количества в таблице
            принадлежат другой сетке. Лист не прячется целиком — «из чего кроить» в нём по-прежнему
            верно, — но резать по его числам нельзя, и сказать это надо там, где читают первым. */}
        {revisionDrift && (
          <div className='mt-1 border-2 border-black px-2 py-1 text-control font-bold uppercase'>
            the batch plan changed after the cut list was computed (batch lock_version{' '}
            {runLockVersion}, cut list computed for {planLockVersion}) — quantities below are stale.
            Reprint the run pack before cutting.
          </div>
        )}
      </header>

      {/* ЛИНИИ ПАРТИИ */}
      <Sheet title='batch lines — how many we sew'>
        {lineRows.length === 0 || plannedTotal === 0 ? (
          <Nothing>
            the batch plan is empty — not a single &quot;colorway × size&quot; cell. Until they
            exist, the cut list and material plan below have nothing to be computed from.
          </Nothing>
        ) : (
          <table className='w-full border-collapse text-micro'>
            <thead>
              <tr>
                <th className={TH}>colorway</th>
                {lineSizeColumns.map((s) => (
                  <th key={s} className={`${TH} text-center`}>
                    {sizeLabel(s)}
                  </th>
                ))}
                <th className={`${TH} text-center`}>Σ</th>
              </tr>
            </thead>
            <tbody>
              {lineRows.map((r) => (
                <tr key={r.key} className='break-inside-avoid'>
                  <td className={`${TD} font-medium`}>{r.label}</td>
                  {lineSizeColumns.map((s) => (
                    <td key={s} className={`${TD} text-center`}>
                      {r.bySize.get(s) || '·'}
                    </td>
                  ))}
                  <td className={`${TD} text-center font-semibold`}>{r.total}</td>
                </tr>
              ))}
              <tr>
                <td className={`${TD} text-right uppercase`}>Σ</td>
                {lineSizeColumns.map((s) => (
                  <td key={s} className={`${TD} text-center`}>
                    {lineColTotal(s) || '·'}
                  </td>
                ))}
                <td className={`${TD} text-center font-bold`}>{plannedTotal}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Sheet>

      {/* КАТ-ЛИСТ ПАРТИИ */}
      <Sheet title='batch cut list — what to cut and from what'>
        {/* БЛОКЕРЫ ИДУТ ПЕРЕД ТАБЛИЦЕЙ И ОТДЕЛЬНЫМ БЛОКОМ. Это единственное место наряда, где цех
            обязан остановиться и спросить, а строка с прочерком в общей таблице читается как
            «кроить не из чего» и теряется среди сорока таких же. */}
        {cutBlockers.length > 0 && (
          <div className='mb-2 break-inside-avoid border-2 border-black p-2'>
            <div className='mb-1 text-control font-bold uppercase'>
              stop — {cutBlockers.length} piece × colorway rows are not linked to an article
            </div>
            <table className='w-full border-collapse text-micro'>
              <thead>
                <tr>
                  <th className={TH}>piece</th>
                  <th className={TH}>colorway</th>
                  <th className={`${TH} text-center`}>units</th>
                  <th className={TH}>why</th>
                </tr>
              </thead>
              <tbody>
                {cutBlockers.map((b, i) => (
                  <tr key={`${wireInt(b.pieceId)}-${wireInt(b.colorwayId)}-${i}`}>
                    <td className={`${TD} font-medium`}>{b.pieceName || `piece #${b.pieceId}`}</td>
                    <td className={TD}>{b.colorwayName || colorwayLabel(wireInt(b.colorwayId))}</td>
                    <td className={`${TD} text-center`}>{b.garments ?? 0}</td>
                    <td className={TD}>{b.reason || 'reason not given'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className='mt-1 text-nano uppercase'>
              these pieces are NOT included in the table below — they must not be cut until the
              technologist names the article.
            </p>
          </div>
        )}

        {cutRows.length === 0 ? (
          <Nothing>
            {cutPlanUnavailable
              ? 'cut list NOT RECEIVED from the server — do not cut from this sheet; reprint the run pack or check with the technologist.'
              : !cutPlan
                ? 'cut list not loaded yet.'
                : // Пустой ответ БЕЗ ревизии — это не «кроить нечего», а «мы ничего не узнали».
                  // Пока бэкенд дописывают, шлюз отвечает ровно так, и молчаливое «в карте нет
                  // деталей» отправило бы цех проверять карточку вместо того, чтобы ждать сервер.
                  !cutPlanIsAuthoritative
                  ? 'cut list not computed: the server answered without a snapshot revision. This does NOT mean there is nothing to cut — it means nobody computed "how many to cut".'
                  : plannedTotal === 0
                    ? 'no cut list because the batch has no lines: there is nothing to compute "how many to cut" from.'
                    : cutBlockers.length > 0
                      ? 'not a single piece is linked to an article — everything found is in the block above.'
                      : 'the tech card has no cut pieces — there is nothing to cut on this run pack.'}
          </Nothing>
        ) : (
          <>
            <table className='w-full border-collapse text-micro'>
              <thead>
                <tr>
                  <th className={TH}>piece</th>
                  <th className={TH}>colorway</th>
                  {/* Количество на изделие и подпись «как кроится» стоят в ОДНОЙ клетке, как в
                      тех-паке: подпись уточняет именно это число, а отдельной колонкой на другом
                      конце строки она читается как ещё один атрибут детали. Побочно это снимает
                      колонку с листа, а ширина A4 у таблицы, где к пяти описательным колонкам
                      добавляется вся градация, — не запас, а дефицит. */}
                  <th className={`${TH} text-center`}>per unit</th>
                  <th className={TH}>cut from</th>
                  {cutSizeColumns.map((s) => (
                    <th key={s.id} className={`${TH} text-center`}>
                      {s.name}
                    </th>
                  ))}
                  <th className={`${TH} text-center`}>to cut</th>
                </tr>
              </thead>
              <tbody>
                {cutRows.map((r, i) => {
                  const badge = printCutSymmetryBadge(r.cutSymmetry, r.piecesPerGarment);
                  const arrow = grainlineArrow(r.grainline);
                  return (
                    <tr
                      // Ключ несёт И колорвей, И цвет выхода: у aux-строк colorway_id = 0, и без
                      // output_variant_id две строки одной детали в разных цветах становятся
                      // неразличимы для React — он переиспользует чужую напечатанную строку.
                      // И СЛОТ (T4): деталь со слоями (шелл + подклад) даёт несколько строк одного
                      // колорвея — без bomItemId их ключи совпали бы.
                      key={`${wireInt(r.pieceId)}-${wireInt(r.colorwayId)}-${wireInt(
                        r.outputVariantId,
                      )}-${wireInt(r.bomItemId)}-${r.pieceLineKey || i}`}
                      className='break-inside-avoid'
                    >
                      <td className={TD}>
                        <div className='font-medium'>{r.pieceName || `piece #${r.pieceId}`}</div>
                        {/* Долевая и клеевая дублируются в КАЖДОЙ строке колорвея намеренно (так же
                            их дублирует сервер): наряд режут по строкам, и деталь без долевой в
                            своей строке — это деталь, которую раскроят неправильно, даже если та же
                            долевая написана строкой выше у другого цвета. */}
                        <div className='text-nano uppercase text-labelColor'>
                          grainline: {r.grainline || 'not set'}
                          {arrow ? ` ${arrow}` : ''}
                        </div>
                        {r.fused ? (
                          <div className='text-nano uppercase'>
                            fusing: {r.fusingMaterialName || 'article not named'}
                          </div>
                        ) : null}
                      </td>
                      <td className={TD}>
                        {r.colorwayName ||
                          r.outputVariantName ||
                          colorwayLabel(wireInt(r.colorwayId))}
                      </td>
                      {/* Число + СЛОВАМИ, как оно кроится. Словарь общий с экраном
                          (cutSymmetryBadge), а не печатный cutSymmetryPrintCaption: тот молчит про
                          «одинаковые», потому что рассчитан стоять вплотную к числу под колонкой
                          «qty / garment» тех-пака. Здесь подпись обязана быть у КАЖДОЙ размеченной
                          детали — в наряде рядом стоят строки одной детали в разных цветах, и
                          молчание в одной из них читается как «а тут иначе». cut_symmetry при этом
                          НИЧЕГО не умножает (0266 свернула удвоение в pieces_per_garment); она
                          объясняет, как связаны панели, и только. */}
                      <td className={`${TD} text-center`}>
                        <div>{r.piecesPerGarment ?? '—'}</div>
                        {badge ? (
                          badge.tone === 'attention' ? (
                            <div className='mt-0.5 border border-black px-0.5 text-nano uppercase'>
                              ! {badge.label}
                            </div>
                          ) : (
                            <div className='mt-0.5 text-nano uppercase text-labelColor'>
                              {badge.label}
                            </div>
                          )
                        ) : null}
                      </td>
                      <td className={TD}>
                        <div className='font-medium'>{r.slotName || 'slot not named'}</div>
                        <div>{r.materialName || 'article not assigned'}</div>
                        {/* Подпись слоя (T4): деталь со слоями даёт несколько строк одного
                            колорвея, и без слова секции шелл и подклад читаются как дубль. */}
                        <div className='text-nano uppercase text-labelColor'>
                          {[cutLayerWord(r.section), r.pinned ? 'recipe pin' : 'slot default']
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                        {/* ДОГАДКА СЕРВЕРА, НАПЕЧАТАННАЯ КАК ДОГАДКА. slot_inferred = рецепт эту
                            деталь не называет вовсе, и слот подставлен потому, что рулонный слот у
                            колорвея ровно один. Подставить молча — значит напечатать догадку
                            шрифтом факта; в цехе её нечем отличить от привязки, которую делал
                            человек. */}
                        {r.slotInferred ? (
                          <div className='mt-0.5 border border-black px-0.5 text-nano uppercase'>
                            ! slot inferred: the recipe does not name this piece
                          </div>
                        ) : null}
                      </td>
                      {cutSizeColumns.map((s) => {
                        const cell = cutCell(r, s.id);
                        return (
                          <td key={s.id} className={`${TD} text-center`}>
                            {/* ОТСУТСТВУЮЩЕЕ ЧИСЛО НЕ ПЕЧАТАЕТСЯ НУЛЁМ. «·» — клетки нет в плане,
                                «?» — клетка есть, а количества в ней сервер не назвал. Ноль здесь
                                означал бы измеренное «кроить ноль панелей», то есть указание не
                                кроить, которого никто не давал. */}
                            {!cell ? (
                              '·'
                            ) : (
                              <>
                                <div className='font-semibold'>{cell.piecesToCut ?? '?'}</div>
                                <div className='text-nano text-labelColor'>
                                  {cell.garments ?? '?'} units
                                </div>
                              </>
                            )}
                          </td>
                        );
                      })}
                      <td className={`${TD} text-center`}>
                        <div className='font-bold'>{r.piecesToCutTotal ?? '?'}</div>
                        <div className='text-nano uppercase text-labelColor'>panels</div>
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  {/* colSpan = описательные колонки (деталь, колорвей, на изд., из чего) + вся
                      градация; итог стоит под колонкой «выкроить». Разъедется — таблица поедет. */}
                  <td className={`${TD} text-right uppercase`} colSpan={4 + cutSizeColumns.length}>
                    batch total
                  </td>
                  {/* Итог считаем от ВИДИМЫХ строк, а не берём серверный piecesToCutTotal: тот
                      посчитан по всему прогону, и под таблицей одного колорвея он был бы суммой
                      чужих цветов. Без скоупа обе величины совпадают. */}
                  <td className={`${TD} text-center font-bold`}>
                    {scopeColorwayId > 0
                      ? cutRows.reduce((sum, r) => sum + wireInt(r.piecesToCutTotal), 0)
                      : cutPlan?.piecesToCutTotal ?? '?'}
                  </td>
                </tr>
              </tbody>
            </table>

            <p className='mt-1 text-nano text-labelColor'>{PRINT_CUT_SYMMETRY_LEGEND}</p>
            <p className='text-nano text-labelColor'>
              &quot;recipe pin&quot; — the article is assigned by the colorway recipe; &quot;slot
              default&quot; — the slot&apos;s default article from the BOM is used. &quot;Slot
              inferred&quot; — the recipe does not name this piece, the slot was substituted as the
              colorway&apos;s only roll-goods fabric: confirm before cutting.
            </p>
            {(cutPlan?.caveats ?? []).map((c, i) => (
              <p key={i} className='text-nano text-labelColor'>
                · {c}
              </p>
            ))}
          </>
        )}
      </Sheet>

      {/* НАСТИЛЫ И ПОКРЫТИЕ */}
      <Sheet title='lay plan and coverage'>
        {laysPending || laysError ? (
          // «Не приехало» ≠ «нет настилов». На бумаге эти два состояния выглядят одинаково пусто, а
          // означают противоположное: во втором случае цех вправе резать по нормам, в первом —
          // не вправе ничего, потому что плана он не видел.
          <Nothing>
            {laysError
              ? 'lay plan NOT RECEIVED from the server — this does not mean there are no lays.'
              : 'lay plan is still loading — reprint the sheet.'}
          </Nothing>
        ) : laysData?.applicable === false ? (
          <Nothing>
            {laysData.notApplicableReason ||
              'this batch never has lays — the card is auxiliary, it has no cut pieces or markers.'}
          </Nothing>
        ) : (
          <>
            {coverageColorways.length > 0 && coverageSizes.length > 0 ? (
              <table className='mb-2 w-full border-collapse text-micro'>
                <thead>
                  <tr>
                    <th className={TH}>coverage: colorway</th>
                    {coverageSizes.map((s) => (
                      <th key={s} className={`${TH} text-center`}>
                        {sizeLabel(s)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {coverageColorways.map((cw) => (
                    <tr key={cw} className='break-inside-avoid'>
                      <td className={`${TD} font-medium`}>{colorwayLabel(cw)}</td>
                      {coverageSizes.map((s) => {
                        const cell = coverageByCell.get(`${cw}:${s}`);
                        // Пары, которой прогон не планирует вовсе, в матрице нет — точка, а не
                        // ноль: ноль читался бы как «запланировали и не покрыли».
                        if (!cell)
                          return (
                            <td key={s} className={`${TD} text-center`}>
                              ·
                            </td>
                          );
                        const verdict = layVerdict(cell.status);
                        return (
                          <td
                            key={s}
                            className={`${TD} text-center ${verdict === 'blocker' ? 'font-bold' : ''}`}
                          >
                            {VERDICT_GLYPH[verdict]} {cell.coveredQty ?? 0}/{cell.plannedQty ?? 0}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              // Причина пустой матрицы НЕ одна: настилов может не быть вовсе, а могут быть — и
              // тогда покрытие не посчиталось (деталь неатрибутируема, симметрия не размечена, слот
              // не резолвится). Написать «настилов ещё нет» при непустом списке настилов значило бы
              // противоречить таблице, стоящей на том же листе двумя сантиметрами ниже.
              <Nothing>
                {lays.length === 0
                  ? 'coverage not computed — no lays yet.'
                  : 'lays exist, but their coverage could not be computed — pieces cannot be attributed, symmetry is not marked, or the slot does not resolve. This is NOT "covered".'}
              </Nothing>
            )}

            {/* Легенда — четыре состояния, различимые на экране цветом, на бумаге обязаны
                различаться словом. «Не проверено» стоит отдельной строкой, а не в скобках у
                «покрыто»: это не «покрыто» и не «нехватка». */}
            {coverage.length > 0 && (
              <p className='mb-2 text-nano uppercase text-labelColor'>
                {VERDICT_GLYPH.ok} covered · {VERDICT_GLYPH.blocker} shortfall — fabric not cut ·{' '}
                {VERDICT_GLYPH.warning} overcut — a human decides · {VERDICT_GLYPH.unknown} not
                checked (this is NOT &quot;covered&quot;)
              </p>
            )}

            {coverageNotes.length > 0 && (
              <div className='mb-2 break-inside-avoid border border-black p-2'>
                <div className='mb-0.5 text-control font-bold uppercase'>
                  cells without &quot;covered&quot;
                </div>
                {coverageNotes.map((n) => (
                  <p key={n.key} className='text-micro'>
                    {VERDICT_GLYPH[n.verdict]} {printLayVerdictWord(n.verdict)}: {n.text}
                  </p>
                ))}
              </div>
            )}

            {lays.length === 0 ? (
              // Чем питается потребность в материалах — говорит САМ материальный план
              // (plan_source), и он напечатан на своём листе. Выводить это здесь из пустого списка
              // настилов значило бы завести второй ответ на тот же вопрос, который сервер уже дал.
              <Nothing>no lays yet — they do not govern cutting.</Nothing>
            ) : (
              <table className='w-full border-collapse text-micro'>
                <thead>
                  <tr>
                    <th className={TH}>lay</th>
                    <th className={TH}>colorway · slot · article</th>
                    <th className={TH}>mode</th>
                    <th className={TH}>sections (marker × plies)</th>
                    <th className={`${TH} text-center`}>plies</th>
                    <th className={`${TH} text-center`}>plan, m</th>
                    <th className={`${TH} text-center`}>stack, cm</th>
                  </tr>
                </thead>
                <tbody>
                  {lays.map((lay: common_ProductionRunLay, i) => (
                    <tr key={lay.layKey || i} className='break-inside-avoid'>
                      <td className={TD}>
                        <div className='font-medium'>{lay.name || `lay ${i + 1}`}</div>
                        {/* Рулон назван — значит, настилали именно с него, и это единственная
                            строка наряда, которую потом не переписать. */}
                        {lay.lotCode ? (
                          <div className='text-nano uppercase text-labelColor'>
                            roll {lay.lotCode}
                          </div>
                        ) : null}
                        {lay.quantitiesStale ? (
                          <div className='mt-0.5 border border-black px-0.5 text-nano uppercase'>
                            ! quantities changed after the lay was computed
                          </div>
                        ) : null}
                      </td>
                      <td className={TD}>
                        <div>{lay.colorwayName || colorwayLabel(wireInt(lay.colorwayId))}</div>
                        <div className='text-nano uppercase text-labelColor'>
                          {lay.bomItemName || 'slot'} · {lay.materialName || 'article not assigned'}
                        </div>
                      </td>
                      <td className={TD}>
                        {PRINT_LAY_MODE_LABEL[lay.mode ?? ''] ?? 'mode not set'}
                      </td>
                      <td className={TD}>
                        {(lay.sections ?? []).length === 0
                          ? '—'
                          : (lay.sections ?? []).map((s, j) => (
                              <div key={s.sectionKey || j}>
                                {s.markerName || `marker #${s.markerId}`} × {s.plies ?? 0}
                              </div>
                            ))}
                      </td>
                      <td className={`${TD} text-center`}>{lay.totalPlies ?? 0}</td>
                      <td className={`${TD} text-center`}>{cmToM(lay.plannedLengthCm) || '—'}</td>
                      <td className={`${TD} text-center`}>{dec(lay.stackHeightCm) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {(laysData?.caveats ?? []).map((c, i) => (
              <p key={i} className='text-nano text-labelColor'>
                · {c}
              </p>
            ))}
          </>
        )}
      </Sheet>

      {/* ВЫДАЧА МАТЕРИАЛОВ */}
      <Sheet title='material issue'>
        {/* Материальный план НЕ ИМЕЕТ оси колорвея: сервер считает потребность по артикулам на всю
            партию сразу. При печати по одному цвету этот лист остаётся про всю партию, и молчать
            об этом нельзя — склад выдал бы по нему ткань как под один цвет. */}
        {scopeColorwayId > 0 && (
          <p className='mb-2 break-inside-avoid border-2 border-black px-2 py-1 text-micro uppercase'>
            this sheet is computed for the WHOLE batch, other colorways included — per-article
            requirements do not split by color
          </p>
        )}
        {/* Блокеры плана — первыми и здесь, по той же причине: план, молча уронивший слот, читается
            как «нехватки нет», и партия уезжает шить не с той фурнитурой. */}
        {materialBlockers.length > 0 && (
          <div className='mb-2 break-inside-avoid border-2 border-black p-2 text-micro'>
            <div className='mb-1 text-control font-bold uppercase'>
              not computed — the material plan is incomplete
            </div>
            {materialBlockers.map((b, i) => (
              <p key={`${wireInt(b.bomItemId)}-${wireInt(b.colorwayId)}-${i}`}>
                {b.slotName || 'slot'} · {b.colorwayName || colorwayLabel(wireInt(b.colorwayId))} —{' '}
                {b.plannedQty ?? 0} units: {b.reason || 'reason not given'}
              </p>
            ))}
          </div>
        )}

        {/* ЧЕМ ПОСЧИТАНА ПОТРЕБНОСТЬ — говорит сервер (plan_source), а не вывод клиента по числу
            настилов. Разница практическая: норма это оценка карточки, настил — измеренная геометрия
            этой партии, и закройщик вправе знать, какое из двух чисел он держит. */}
        {materialPlan?.planSource && materialRows.length > 0 ? (
          <p className='mb-1 text-nano uppercase text-labelColor'>
            {materialPlan.planSource === 'PRODUCTION_RUN_COVERAGE_SOURCE_LAYS'
              ? "requirements computed from this batch's lays"
              : materialPlan.planSource === 'PRODUCTION_RUN_COVERAGE_SOURCE_MIXED'
                ? 'requirements are mixed: some slots from lays, some from tech card norms'
                : materialPlan.planSource === 'PRODUCTION_RUN_COVERAGE_SOURCE_NORM'
                  ? 'requirements computed from tech card norms (no lays yet)'
                  : 'the server did not name the source of this requirement'}
          </p>
        ) : null}

        {materialPending || materialError ? (
          <Nothing>
            {materialError
              ? 'material plan NOT RECEIVED from the server — this does not mean materials are sufficient.'
              : 'material plan is still loading — reprint the sheet.'}
          </Nothing>
        ) : materialRows.length === 0 ? (
          <Nothing>
            {plannedTotal === 0
              ? 'no material requirements: the batch has no lines.'
              : "requirements not computed — the card's colorways have no linked articles with norms."}
          </Nothing>
        ) : (
          <table className='w-full border-collapse text-micro'>
            <thead>
              <tr>
                <th className={TH}>material</th>
                <th className={`${TH} text-center`}>required</th>
                <th className={`${TH} text-center`}>on hand</th>
                <th className={`${TH} text-center`}>issued</th>
                <th className={`${TH} text-center`}>shortage</th>
              </tr>
            </thead>
            <tbody>
              {materialRows.map((r, i) => {
                const short = Number(r.shortage?.value) > 0;
                return (
                  <tr key={`${wireInt(r.materialId)}-${i}`} className='break-inside-avoid'>
                    <td className={TD}>
                      <div className='font-medium'>{r.materialName || `#${r.materialId}`}</div>
                      {r.hasSizeNorms === false ? (
                        <div className='text-nano uppercase text-labelColor'>
                          per-unit norm, no per-size breakdown — an estimate
                        </div>
                      ) : null}
                    </td>
                    {/* «—», а не «0», у отсутствующего числа: ноль на складе это утверждение
                        «проверили, пусто», и подменять им «сервер этого не прислал» — тот же
                        подлог, что и в кат-листе. Настоящий ноль печатается как 0. */}
                    <td className={`${TD} text-center`}>
                      {dec(r.required) || '—'} {r.unit || ''}
                    </td>
                    <td className={`${TD} text-center`}>{dec(r.onHand) || '—'}</td>
                    <td className={`${TD} text-center`}>{dec(r.issued) || '—'}</td>
                    <td className={`${TD} text-center ${short ? 'font-bold' : ''}`}>
                      {short ? `! ${dec(r.shortage)}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {materialCaveats.map((c, i) => (
          <p key={i} className='text-nano text-labelColor'>
            · {c}
          </p>
        ))}
      </Sheet>

      {/* УПАКОВКА ПАРТИИ */}
      {/* УПАКОВКА — общий лист (print/sheets/packaging.tsx). Считаемая половина живёт в нём же:
          тираж передаётся пропом, а формулы (короб вверх, пусто вместо нуля) переехали туда
          дословно вместе с их обоснованием. */}
      <PackagingSheet title='batch packaging' packaging={packaging} plannedTotal={plannedTotal} />
    </div>
  );
}
