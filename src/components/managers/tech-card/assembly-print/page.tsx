// ПЕЧАТЬ СХЕМЫ СБОРКИ — голый маршрут (механика A, см. print/sheet.tsx): страница вне Layout, лист
// лежит в обычном потоке. Лист набирается арифметикой в миллиметрах (paper.ts) и рисуется SVG; кнопка
// «download pdf» отдаёт ФАЙЛ размером с лист (paper-pdf.ts), а не диалог печати — владелец: «файл
// должен скачиваться, размером с канвас, на который помещается вся диаграмма». ⌘P всё равно работает:
// `@page { size }` объявлен под лист, а PageFurniture (A4) здесь не подключён.
//
// Печатается СОХРАНЁННАЯ карточка (GetTechCard), не черновик редактора: бумага в цеху обязана
// совпадать с тем, что лежит в базе, а не с тем, что было на экране у того, кто нажал кнопку.
//
// Два выбора оператора живут в адресе (`?form=route|map&shapes=on|off`), чтобы ссылку можно было
// отдать как есть: ROUTE — ведомость операций с дорожками узлов (основной документ), MAP — дерево
// карточек узлов; силуэты деталей — из DXF карточки, только там, где чертежи вообще есть.
import { PrintDegradedNotice } from 'components/managers/print/degraded-notice';
import { depStatus, usePrintReady, type PrintDep } from 'components/managers/print/use-print-ready';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES } from 'constants/routes';
import type { common_TechCard, common_TechCardInsert } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';
import { operationHeading, zoneLabel } from '../components/operation-options';
import type { WorkCatalog } from '../components/operation-work';
import { pieceRefKey } from '../components/piece-block-refs';
import { mapTechCardToForm, type TechCardFormData } from '../components/schema';
import { skuToSeasonLabel } from '../components/season-util';
import { usePieceShapes } from '../components/use-piece-shapes';
import { useOperationWorkCatalog } from '../components/useOperationWorkCatalog';
import { useTechCardReleases } from '../components/useSamples';
import { assemblyPrintModel, type PrintCardInput } from './model';
import { typesetMap, typesetRoute, type PaperDoc, type SheetMeta, type ShapeLookup } from './paper';
import { exportPaperPdf, PDF_MAX_MM } from './paper-pdf';
import { PaperSvg } from './paper-svg';

type Form = 'route' | 'map';

const PX_PER_MM = 96 / 25.4;
// Подпись входов листа: карточка ИЗ АДРЕСА (id в ответе бэка — необязательное поле), форма,
// силуэты. Роутер переиспользует страницу при смене `:id`, и без подписи кнопка могла бы скачать
// ПРЕДЫДУЩУЮ карточку, пока грузится новая.
const docKey = (routeId: string | undefined, form: Form, shapes: boolean) =>
  `${routeId ?? ''}|${form}|${shapes ? 'on' : 'off'}`;

// Экранная обвязка: на печати (⌘P) прячется тулбар и снимается масштаб; лист печатается как есть.
const SCREEN_CSS = `
.ap-sheet { box-shadow: 0 0 0 1px #ccc; }
@media print {
  html, body { background: #fff !important; margin: 0; }
  .ap-toolbar { display: none !important; }
  .ap-stage-wrap { padding: 0 !important; height: auto !important; }
  .ap-stage { transform: none !important; }
  .ap-sheet { box-shadow: none; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

/**
 * Что печатается из карточки. Шаг называется ТЕМ ЖЕ композитором и с теми же аргументами, что
 * схема сборки на экране (`labelOfStep` в operations-field): бумага и экран обязаны звать шаг одним
 * словом. Зона у таблицы — своя колонка, поэтому её хвост « · зона» отделяется от заголовка, а не
 * печатается дважды.
 */
function printInput(
  insert: common_TechCardInsert | undefined,
  workCatalog: WorkCatalog,
): PrintCardInput {
  const pieces = (insert?.pieces ?? [])
    .filter((p) => !!p.lineKey)
    .map((p) => ({ lineKey: p.lineKey!, name: p.name ?? '' }));
  const steps = (insert?.operations ?? []).map((o, i) => {
    const zone = zoneLabel(o.zone);
    const heading =
      operationHeading({
        operationType: o.operationType,
        machineType: o.machineType,
        seamClass: o.seamClass,
        work: o.work,
        workCatalog,
        zone: o.zone,
        pieceNames: [],
        note: o.note,
      }) || 'step';
    const suffix = zone ? ` · ${zone}` : '';
    let verb = heading;
    let zoneCell = '';
    if (zone && heading.endsWith(suffix)) {
      verb = heading.slice(0, -suffix.length);
      zoneCell = zone;
    } else if (zone && heading === zone) {
      verb = '';
      zoneCell = zone;
    }
    return {
      // Без номера — позиционный, как в тех-паке: «0» на всех строках сделал бы шаги неотличимыми.
      number: o.operationNumber || (i + 1) * 10,
      verb,
      zone: zoneCell,
      // Объединение (46) — источник; легаси-проекция (21) остаётся фолбэком для архивных
      // снапшотов — тот же фолбэк, что в mapTechCardToForm.
      inputKeys: (o.inputKeys?.length ? o.inputKeys : o.pieceLineKeys ?? []).filter(Boolean),
      outputUnitKey: (o.outputUnitKey ?? '').trim(),
      outputUnitName: (o.outputUnitName ?? '').trim(),
    };
  });
  return { pieces, steps };
}

/**
 * Документ живёт ПОД FormProvider карточки: силуэты берутся той же цепочкой, что рисует плитки
 * вкладки деталей кроя (usePieceShapes → пачка DXF → индекс → findPiece), а она читает форму.
 * Своя выборка контуров разошлась бы с экраном молча — та же деталь получила бы на бумаге другой
 * силуэт, и заметить это было бы нечем. Цена — форма из сохранённой карточки, которую никто не
 * редактирует; она и остаётся ровно снимком.
 */
function Document({
  techCard,
  form,
  shapes,
  workCatalog,
  meta,
  onDeps,
  onShapesAvailable,
  onDoc,
  docKey: key,
}: {
  techCard: common_TechCard;
  form: Form;
  shapes: boolean;
  workCatalog: WorkCatalog;
  meta: SheetMeta;
  onDeps: (deps: PrintDep[]) => void;
  onShapesAvailable: (available: boolean) => void;
  /** Лист и подпись входов, по которым он набран: страница верит листу только под текущую. */
  onDoc: (doc: PaperDoc, key: string) => void;
  docKey: string;
}) {
  const { shapeByKey, hasDxf, isLoading, error } = usePieceShapes(shapes);
  useEffect(() => onShapesAvailable(hasDxf), [hasDxf, onShapesAvailable]);
  useEffect(() => {
    // Контуры входят в гейт только когда их просили И есть чем рисовать: без DXF ждать нечего, а
    // отказ разбора — degraded, не блокировка (правило 1 гейта).
    onDeps(
      shapes && hasDxf ? [{ label: 'piece contours', status: depStatus(isLoading, !!error) }] : [],
    );
  }, [shapes, hasDxf, isLoading, error, onDeps]);

  const M = useMemo(
    () => assemblyPrintModel(printInput(techCard.techCard, workCatalog)),
    [techCard, workCatalog],
  );
  const shapeOf = useMemo<ShapeLookup>(() => {
    if (!shapes || !hasDxf) return null;
    return (key) => shapeByKey?.get(pieceRefKey(key))?.piece ?? null;
  }, [shapes, hasDxf, shapeByKey]);
  const doc = useMemo(
    () => (form === 'map' ? typesetMap(M, meta, shapeOf) : typesetRoute(M, meta, shapeOf)),
    [M, meta, shapeOf, form],
  );
  useEffect(() => onDoc(doc, key), [doc, key, onDoc]);
  return (
    <>
      <style>{`@page { size: ${doc.w}mm ${doc.h}mm; margin: 0; }`}</style>
      <PaperSvg doc={doc} />
    </>
  );
}

export function TechCardAssemblyPrint() {
  const { id } = useParams<{ id: string }>();
  const numId = id ? parseInt(id, 10) : undefined;
  const [searchParams, setSearchParams] = useSearchParams();
  const form: Form = searchParams.get('form') === 'map' ? 'map' : 'route';
  const shapes = searchParams.get('shapes') !== 'off';
  const setChoice = (next: { form?: Form; shapes?: boolean }) => {
    const f = next.form ?? form;
    const s = next.shapes ?? shapes;
    setSearchParams({ form: f, shapes: s ? 'on' : 'off' }, { replace: true });
  };
  const showMessage = useSnackBarStore((s) => s.showMessage);

  const { data: techCard, isLoading, isError } = useTechCard(numId);
  const {
    catalog: workCatalog,
    loading: catalogLoading,
    live: catalogLive,
  } = useOperationWorkCatalog();
  const {
    data: releasesData,
    isLoading: releasesLoading,
    isError: releasesError,
  } = useTechCardReleases(numId);

  // Форма-снимок для цепочки силуэтов (см. Document). `values` — RHF сам подхватит карточку, когда
  // она приедет; резолвера нет, потому что никто не сабмитит.
  const formValues = useMemo<TechCardFormData | undefined>(
    () => (techCard ? mapTechCardToForm(techCard) : undefined),
    [techCard],
  );
  const methods = useForm<TechCardFormData>({ values: formValues });

  const [docDeps, setDocDeps] = useState<PrintDep[]>([]);
  const [shapesAvailable, setShapesAvailable] = useState<boolean | null>(null);
  const [docState, setDocState] = useState<{ doc: PaperDoc; key: string } | null>(null);
  const onDoc = useCallback((doc: PaperDoc, key: string) => setDocState({ doc, key }), []);
  const currentKey = docKey(id, form, shapes);
  const doc = docState && docState.key === currentKey ? docState.doc : null;
  const [exporting, setExporting] = useState(false);
  // Предел страницы PDF (5080 мм): лист крупнее jsPDF молча обрежет — честнее не отдавать файл.
  const tooBigForPdf = !!doc && (doc.w > PDF_MAX_MM || doc.h > PDF_MAX_MM);

  const { ready, degraded } = usePrintReady([
    { label: 'tech card', status: depStatus(isLoading, isError) },
    // Каталог с сервера не приехал — имена шагов печатаются по снимку бандла (незнакомая работа —
    // токеном). Это деградация, и бумага обязана её назвать, а не молча печатать другое слово.
    { label: 'work catalog', status: catalogLoading ? 'pending' : catalogLive ? 'ok' : 'error' },
    { label: 'releases', status: depStatus(releasesLoading, releasesError) },
    ...docDeps,
  ]);

  // Наибольший номер релиза — «последний» не гарантирован порядком ответа.
  const latestRelease = (releasesData?.releases ?? []).reduce<number>(
    (best, r) => Math.max(best, r.releaseNumber ?? 0),
    0,
  );
  const printedOn = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const meta = useMemo<SheetMeta>(() => {
    const insert = techCard?.techCard;
    return {
      code: insert?.styleNumber ?? '',
      name: insert?.name ?? '',
      season: skuToSeasonLabel(insert?.skuSeason),
      revision: latestRelease
        ? `LIVE CARD · LATEST RELEASE REV.${latestRelease}`
        : releasesError
          ? 'RELEASES UNKNOWN'
          : 'UNRELEASED',
      // Баннер — только по ЗНАНИЮ, что релизов нет: пока список едет или отказал, молчим, а
      // отказ и так уходит на бумагу строкой warnings.
      unreleased: !releasesLoading && !releasesError && latestRelease === 0,
      warnings: degraded,
      printedOn,
    };
  }, [techCard, latestRelease, releasesLoading, releasesError, degraded, printedOn]);

  // Экран: лист шире любого монитора, по умолчанию вписываем по ширине; «100 %» — для проверки
  // глазом того, что уйдёт в файл.
  const [view, setView] = useState<'fit' | 'one'>('fit');
  const [winW, setWinW] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const sheetWpx = (doc?.w ?? 420) * PX_PER_MM;
  const sheetHpx = (doc?.h ?? 0) * PX_PER_MM;
  const k = view === 'fit' ? Math.min(1, (winW - 48) / sheetWpx) : 1;

  const report = doc?.report;
  const readout = report
    ? [
        `sheet ${report.sheetW} × ${report.sheetH} mm`,
        report.lanes != null ? `${report.lanes} lanes × ${report.pitch} mm` : '',
        report.cols != null ? `${report.cols} columns × ${report.colW} mm` : '',
        `${report.crossings} crossings`,
        report.overWidth ? 'wider than A0 — print from a roll' : '',
        tooBigForPdf
          ? `exceeds the PDF page limit of ${PDF_MAX_MM} mm — use the other diagram`
          : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const download = async () => {
    if (!doc) return;
    setExporting(true);
    try {
      await exportPaperPdf(doc);
    } catch (e) {
      showMessage(`pdf failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className='flex min-h-screen flex-col'>
      <style>{SCREEN_CSS}</style>

      <div className='ap-toolbar sticky top-0 z-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-textInactiveColor bg-bgColor px-4 py-3'>
        <div className='flex items-center gap-3'>
          <Button asChild variant='secondary' size='lg'>
            <Link to={id ? `/tech-cards/${id}` : ROUTES.techCards}>← back</Link>
          </Button>
          <Text variant='uppercase' size='large'>
            assembly order — print
          </Text>
        </div>
        <div className='flex flex-wrap items-center gap-x-6 gap-y-2'>
          <div className='flex items-center gap-2'>
            <Text variant='label' size='small'>
              diagram
            </Text>
            <ChipRow>
              <Chip
                nonForm
                pressed={form === 'route'}
                selected={form === 'route'}
                onClick={() => setChoice({ form: 'route' })}
                title='operations in order with unit lanes on the right — 420 mm wide, grows to 594 / 841 when the lanes need it'
              >
                route ledger
              </Chip>
              <Chip
                nonForm
                pressed={form === 'map'}
                selected={form === 'map'}
                onClick={() => setChoice({ form: 'map' })}
                title='tree of unit cards, leaves on the left — 420 / 594 / 841 mm wide by the number of columns'
              >
                map tree
              </Chip>
            </ChipRow>
          </div>
          <div className='flex items-center gap-2'>
            <Text variant='label' size='small'>
              pictograms
            </Text>
            <ChipRow>
              <Chip
                nonForm
                pressed={shapes}
                selected={shapes}
                disabled={shapesAvailable === false}
                onClick={() => setChoice({ shapes: true })}
                title='piece contours from the DXF next to each piece name, 28 × 16 mm, 0.5 mm line'
              >
                on
              </Chip>
              <Chip
                nonForm
                pressed={!shapes}
                selected={!shapes}
                onClick={() => setChoice({ shapes: false })}
                title='names only'
              >
                off
              </Chip>
            </ChipRow>
            {shapesAvailable === false && (
              <Text variant='label' size='small'>
                no DXF on this card — printed without contours
              </Text>
            )}
          </div>
          <div className='flex items-center gap-2'>
            <Text variant='label' size='small'>
              view
            </Text>
            <ChipRow>
              <Chip
                nonForm
                pressed={view === 'fit'}
                selected={view === 'fit'}
                onClick={() => setView('fit')}
              >
                fit width
              </Chip>
              <Chip
                nonForm
                pressed={view === 'one'}
                selected={view === 'one'}
                onClick={() => setView('one')}
              >
                100 %
              </Chip>
            </ChipRow>
          </div>
        </div>
        <div className='ml-auto flex items-center gap-3'>
          {readout && (
            <Text variant='label' size='small'>
              {readout}
            </Text>
          )}
          <Button
            variant='main'
            size='lg'
            className='uppercase'
            // Не «пришла ли карта», а «готов ли весь лист»: данные и контуры. По таймауту гейт
            // отпускает кнопку сам и называет недостающее строкой на листе.
            disabled={!doc || !ready || exporting || tooBigForPdf}
            onClick={download}
            title={
              doc ? `${doc.fileStem}.pdf · ${doc.w} × ${doc.h} mm · vector, black only` : undefined
            }
          >
            {exporting ? 'preparing pdf…' : 'download pdf'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='animate-pulse'>
            loading tech card…
          </Text>
        </div>
      ) : isError || !techCard ? (
        <div className='flex flex-col items-center gap-4 py-20'>
          <Text variant='inactive' className='uppercase'>
            tech card not found
          </Text>
          <Button asChild variant='main' size='lg' className='uppercase'>
            <Link to={ROUTES.techCards}>← back to tech cards</Link>
          </Button>
        </div>
      ) : (
        <div
          className='ap-stage-wrap relative p-6'
          style={{ height: sheetHpx ? sheetHpx * k + 48 : undefined }}
        >
          {/* Плашка деградации дублируется на листе строкой в шапке (meta.warnings) — экран видел
              не тот, кто держит лист. */}
          <div className='ap-toolbar'>
            <PrintDegradedNotice items={degraded} />
          </div>
          <div
            className='ap-stage origin-top-left'
            style={{ transform: `scale(${k})`, width: `${doc?.w ?? 420}mm` }}
          >
            <FormProvider {...methods}>
              <Document
                techCard={techCard}
                form={form}
                shapes={shapes}
                workCatalog={workCatalog}
                meta={meta}
                onDeps={setDocDeps}
                onShapesAvailable={setShapesAvailable}
                onDoc={onDoc}
                docKey={currentKey}
              />
            </FormProvider>
          </div>
        </div>
      )}
    </div>
  );
}
