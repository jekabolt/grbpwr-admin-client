import type { common_ProductionRun, common_TechCard } from 'api/proto-http/admin';
import { TechPackDocument } from 'components/managers/tech-card/components/tech-pack-document';
import { RunPackDocument } from 'components/managers/production-runs/components/run-pack-document';
import { buildPrintScope, parsePrintQuery } from './scope';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

// СТЕНД ПЕЧАТИ — единственный способ увидеть обе бумаги без бэкенда и без логина.
//
// ЗАЧЕМ ОН ПОЯВИЛСЯ. Печать уронил `ReferenceError` из temporal dead zone: const читался из
// немедленно вызванной функции до своего объявления. `tsc` такого не видит (TS2448 не смотрит
// внутрь замыканий), сборка была зелёная, четыре прохода ревью прошли мимо — а поймал бы это
// ОДИН рендер. Между «код компилируется» и «компонент выполняется» лежит целый класс ошибок,
// и до этого файла его в проекте нечем было накрыть.
//
// Маршрут живёт ВНЕ авторизации (рядом с публичными вьюерами) и только в дев-сборке. Данные
// синтетические: RPC здесь всё равно отвечают 401, и это часть проверки — документ обязан
// печататься, называя недостающее, а не падать.
//
// В прод-сборке `import.meta.env.DEV` вырезает регистрацию маршрута целиком (строки
// `__print-smoke` в бандле нет), но rollup всё равно выпускает отдельный чанк на ~5 КБ: он
// статически видит динамический импорт. Чанк осиротевший — его нечем запросить, потому что
// маршрута не существует. Это цена в 5 КБ за возможность увидеть бумагу без бэкенда.
//
// КАК ПОЛЬЗОВАТЬСЯ БЕЗ РАСШИРЕНИЯ CHROME:
//   yarn dev
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
//     --virtual-time-budget=15000 --dump-dom \
//     "http://localhost:4040/__print-smoke?run=5&colorway=10&profile=factory" > /tmp/smoke.html
// и грепом по /tmp/smoke.html проверить инварианты: при profile=factory на бумаге нет ни одной
// денежной величины, при internal — есть; группа «zone not set» присутствует; кириллицы нет.
//
// ФИКСТУРА НАМЕРЕННО НЕДОБРАЯ. В ней собраны ровно те значения, на которых бумага ломалась или
// врала: зона операции UNKNOWN (шаги с ней исчезали с листа), нулевой припуск (легальное
// «кроить по линии», которое нельзя схлопнуть в «стандарт»), висячая ссылка на BOM, деталь с
// потерянной выноской, смешанная раскладка без скалярной нормы, подпись с разошедшимся digest,
// issue со ссылкой на несуществующую операцию, два профиля одного типа (ступень «по типу»
// обязана НЕ разрешиться) и шаг, у которого почти всё унаследовано от профиля.

const dec = (v: string) => ({ value: v });

const techCard = {
  id: 1,
  updatedAt: '2026-08-09T10:00:00Z',
  lockVersion: 7,
  techCard: {
    brand: 'GRBPWR',
    name: 'smoke test blazer',
    styleNumber: 'GR-0001',
    sizeIds: [1, 2, 3],
    requiredSeamAllowanceMm: dec('10'),
    measurementUnit: 'TECH_CARD_MEASUREMENT_UNIT_CM',
    concept: 'fixture concept',
    notes: 'fixture notes',
    construction: {
      defaultSeamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
      // Карточная плотность — НИЖНЯЯ ступень лестницы (§3.4): шаг, у которого своей нет и машинки
      // нет, обязан печататься с этим числом, а не пустой клеткой.
      defaultStitchesPerCm: dec('4'),
      hemFinish: 'blind hem',
      // ПАРК ОБОРУДОВАНИЯ (0306) — без него фикстура не накрывает ни таблицу дефолтов, ни колонку
      // «machine / mode», ни наследование: печать считает эффективные значения САМА, потому что
      // сервер унаследованное не материализует.
      equipmentDefaults: {
        machines: [
          {
            profileKey: 'M-LOCK',
            label: 'lockstitch by the window',
            machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
            threadCount: 2,
            needleType: 'TECH_CARD_NEEDLE_TYPE_BALLPOINT',
            needleSizeNm: 90,
            bedType: 'TECH_CARD_BED_TYPE_FLATBED',
            threadTension: 'TECH_CARD_THREAD_TENSION_NORMAL',
            stitchesPerCm: dec('4.5'),
            note: 'bobbin: same spool as the needle thread',
          },
          // ДВА ОВЕРЛОКА ОДНОГО ТИПА — обычный случай цеха и ловушка лестницы: шаг без ключа
          // профиля не наследует НИЧЕГО (с двумя оверлоками «оверлок» не ответ), и бумага обязана
          // это показать пустыми настройками, а не числами первого попавшегося.
          {
            profileKey: 'M-OVL-1',
            label: 'overlock by the window',
            machineType: 'TECH_CARD_MACHINE_TYPE_OVERLOCK',
            threadCount: 4,
            stitchWidthMm: dec('5'),
          },
          {
            // Без имени: имя профиля обязано откатиться на имя самой машинки.
            profileKey: 'M-OVL-2',
            machineType: 'TECH_CARD_MACHINE_TYPE_OVERLOCK',
            threadCount: 3,
          },
        ],
        presses: [
          {
            profileKey: 'P-FUSE',
            label: 'fusing press, line 2',
            pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_FUSING_PRESS',
            operationType: 'TECH_CARD_OPERATION_TYPE_FUSING',
            pressTemperatureC: 145,
            pressDwellSec: 12,
            pressPressureNCm2: dec('3.5'),
            // false — это «утюжить СУХИМ», указание, а не молчание: печататься обязано словом.
            pressSteam: false,
            pressCloth: 'TECH_CARD_PRESS_CLOTH_TEFLON_SHEET',
          },
        ],
      },
    },
    callouts: [
      { number: 1, part: 'collar', description: 'top stitch 2 mm', mediaId: 0 },
      { number: 2, part: 'cuff', description: 'button placement' },
    ],
    pieces: [
      {
        lineKey: 'P1',
        name: 'front panel',
        piecesPerGarment: 2,
        cutSymmetry: 'TECH_CARD_PIECE_CUT_SYMMETRY_MIRRORED',
        grainline: 'lengthwise',
        calloutNumber: 1,
        materials: [{ colorwayId: 10, bomItemId: 100 }],
      },
      // Деталь без выноски и с потерянной привязкой — обе колонки обязаны сказать это словами.
      { lineKey: 'P2', name: 'collar', piecesPerGarment: 1, detached: true, calloutNumber: 0 },
    ],
    bomItems: [
      { id: 100, lineKey: 'B1', name: 'shell fabric', section: 'TECH_CARD_BOM_SECTION_FABRIC', unit: 'm' },
      { id: 101, lineKey: 'B2', name: 'main zip', kind: 'TECH_CARD_BOM_KIND_ZIPPER', unit: 'pcs' },
    ],
    operations: [
      {
        operationNumber: 10,
        operationType: 'TECH_CARD_OPERATION_TYPE_LOCKSTITCH',
        zone: 'TECH_CARD_GARMENT_ZONE_FRONT',
        pieceLineKeys: ['P1'],
        bomLineKeys: ['B1'],
        seamAllowanceMm: dec('12'),
        smv: dec('1.5'),
      },
      {
        // Ноль — легальное «кроить по линии», и он обязан печататься нулём, а не «стандартом».
        operationNumber: 20,
        operationType: 'TECH_CARD_OPERATION_TYPE_OVERLOCK',
        zone: 'TECH_CARD_GARMENT_ZONE_FRONT',
        seamAllowanceMm: dec('0'),
        bomLineKeys: ['B2', 'GHOST'],
      },
      {
        // Зона по умолчанию: раньше такие шаги не попадали ни в одну группу и ИСЧЕЗАЛИ.
        operationNumber: 30,
        operationType: 'TECH_CARD_OPERATION_TYPE_BARTACK',
        zone: 'TECH_CARD_GARMENT_ZONE_UNKNOWN',
      },
      {
        // МАШИННЫЙ ШАГ, НАСЛЕДУЮЩИЙ ПОЧТИ ВСЁ. Своих значений два — натяжение и лапка с размером;
        // нитки, игла, станина и плотность приходят с профиля, названного ключом, и обязаны
        // печататься ЧИСЛАМИ без маркера. Строка, которая печаталась бы «не задано», — ровно тот
        // дефект, ради которого печать считает лестницу сама.
        operationNumber: 40,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
        machineProfileKey: 'M-LOCK',
        zone: 'TECH_CARD_GARMENT_ZONE_SLEEVE',
        pieceLineKeys: ['P1'],
        threadTension: 'TECH_CARD_THREAD_TENSION_TIGHTER',
        attachmentKind: 'TECH_CARD_ATTACHMENT_KIND_EDGE_GUIDE',
        attachmentSizeMm: dec('6'),
        // Ширина ОТСТРОЧКИ — расстояние от края, не амплитуда стежка: подписи обязаны их развести.
        topstitch: { mode: 'TECH_CARD_TOPSTITCH_MODE_WIDTH', widthMm: dec('6'), rows: 2 },
        smv: dec('2.1'),
      },
      {
        // Тип есть, ключа нет, а оверлоков на карте два — наследовать нечего. Своя ширина стежка
        // печатается с маркером, плотность падает до карточной (тоже число, но без маркера).
        operationNumber: 50,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_OVERLOCK',
        zone: 'TECH_CARD_GARMENT_ZONE_HEM',
        stitchWidthMm: dec('4'),
      },
      {
        // ВТО: профиль подобран по оборудованию И процессу (дублирование), своя — только
        // температура. Плотность на ВТО-шаге не печатается вовсе: там нечего ею описывать.
        operationNumber: 60,
        operationType: 'TECH_CARD_OPERATION_TYPE_FUSING',
        pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_FUSING_PRESS',
        zone: 'TECH_CARD_GARMENT_ZONE_COLLAR',
        pressTemperatureC: 150,
      },
    ],
    labels: [
      {
        labelType: 'TECH_CARD_LABEL_TYPE_CARE',
        content: 'M30,P,F',
        placement: 'left side seam',
        attachment: 'sewn',
      },
    ],
    packaging: {
      foldingMethod: 'flat fold',
      polybag: 'PE 40 mic',
      unitsPerBox: 20,
      weightNetGrams: 800,
      weightGrossGrams: 900,
    },
    issues: [
      { severity: 'TECH_CARD_ISSUE_SEVERITY_HIGH', status: 'TECH_CARD_ISSUE_STATUS_OPEN', operationNumber: 10, description: 'open issue' },
      // Ссылка на несуществующий шаг — должна быть названа «link lost», а не отправлять искать.
      { severity: 'TECH_CARD_ISSUE_SEVERITY_LOW', status: 'TECH_CARD_ISSUE_STATUS_OPEN', operationNumber: 999, description: 'dangling ref' },
      { severity: 'TECH_CARD_ISSUE_SEVERITY_LOW', status: 'TECH_CARD_ISSUE_STATUS_RESOLVED', description: 'closed issue', resolutionNote: 'fixed' },
    ],
    signoffs: [
      { section: 'TECH_CARD_SIGNOFF_SECTION_CONSTRUCTION', state: 'TECH_CARD_SIGNOFF_STATE_APPROVED', signedBy: 'tech', signedDigest: 'STALE' },
      { section: 'TECH_CARD_SIGNOFF_SECTION_MATERIALS', state: 'TECH_CARD_SIGNOFF_STATE_APPROVED', signedBy: 'tech', signedDigest: 'MATCH' },
    ],
    costing: { unitCost: dec('42.50'), materialsPerUnit: dec('18.00'), cmtCost: dec('12.00') },
  },
  sectionDigests: [
    { section: 'TECH_CARD_SIGNOFF_SECTION_CONSTRUCTION', digest: 'FRESH' },
    { section: 'TECH_CARD_SIGNOFF_SECTION_MATERIALS', digest: 'MATCH' },
  ],
  colorways: [
    {
      colorwayId: 10,
      colorCode: 'BLK',
      baseSku: 'GR-0001-BLK',
      pantone: '19-4005 TCX',
      usages: [{ bomLineKey: 'B1', consumption: dec('1.4'), lineTotal: dec('12.00') }],
    },
    { colorwayId: 11, colorCode: 'OLV', usages: [] },
  ],
  markers: [
    { id: 1, name: 'norm M', colorwayId: 0, sizeId: 2, bomItemName: 'shell fabric', fabricWidthCm: dec('150'), usedLengthCm: dec('180'), efficiencyPct: dec('82'), consumptionPerUnitCm: dec('180') },
    // Смешанная раскладка: скаляра нет намеренно, норма живёт per-size.
    { id: 2, name: 'mixed', colorwayId: 10, sizeId: 0, bomItemName: 'shell fabric', composition: [{ sizeId: 1, consumptionPerUnitCm: dec('170') }, { sizeId: 3, consumptionPerUnitCm: dec('195') }] },
  ],
  careEntries: [{ code: 'M30', name: 'machine wash 30' }, { code: 'F', name: 'do not tumble dry' }],
} as unknown as common_TechCard;

const run = {
  id: 5,
  lockVersion: 3,
  run: {
    techCardId: 1,
    status: 'PRODUCTION_RUN_STATUS_IN_PROGRESS',
    supplierId: 7,
    lines: [
      { productId: 10, sizeId: 1, plannedQty: 30 },
      { productId: 10, sizeId: 2, plannedQty: 50 },
      { productId: 11, sizeId: 2, plannedQty: 20 },
      // Линия без назначенного колорвея — её остаток обязан быть назван, а не вычтен молча.
      { productId: 0, sizeId: 3, plannedQty: 5 },
    ],
  },
} as unknown as common_ProductionRun;

export function PrintSmokePage() {
  const [searchParams] = useSearchParams();
  const query = useMemo(() => parsePrintQuery(searchParams), [searchParams.toString()]);
  const scope = useMemo(
    () => buildPrintScope({ techCard, query, run: query.runId ? run : undefined }),
    [query],
  );

  return (
    <div className='mx-auto flex max-w-[230mm] flex-col gap-8 bg-white p-4 text-black'>
      <p className='border-2 border-black p-2 text-sm uppercase'>
        print smoke — synthetic data, no backend. add ?run=5&amp;colorway=10&amp;profile=factory to
        exercise the scoped path.
      </p>
      <TechPackDocument techCard={techCard} scope={scope} />
      <RunPackDocument run={run} printQuery={query} />
    </div>
  );
}
