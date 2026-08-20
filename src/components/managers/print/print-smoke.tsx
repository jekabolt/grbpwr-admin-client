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
      // ДВА ВИДА BOM ИЗ ВОЛНЫ. Их подписи живут в Partial-картах с фолбэком «?? kind», то есть tsc
      // о пропуске молчит, а на бумагу для цеха уходит сырой токен. Обе строки здесь ровно затем,
      // чтобы этот токен было видно глазами: «TECH_CARD_BOM_KIND_…» на листе = подпись не завели.
      {
        id: 102,
        lineKey: 'B3',
        name: 'seam tape 20 mm',
        kind: 'TECH_CARD_BOM_KIND_SEAM_SEALING_TAPE',
        section: 'TECH_CARD_BOM_SECTION_TRIM',
        unit: 'm',
      },
      {
        id: 103,
        lineKey: 'B4',
        name: 'cut-away backing',
        kind: 'TECH_CARD_BOM_KIND_EMBROIDERY_STABILIZER',
        section: 'TECH_CARD_BOM_SECTION_INTERLINING',
        unit: 'm',
      },
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
      // ── СЕМЕЙСТВА СВОЙСТВ ШАГА (волна operation-kinds) ───────────────────────────────────────
      //
      // Каждый блок обязан ДОЙТИ ДО БУМАГИ, и проверить это может только рендер: ячейка «seam»
      // собирается перечислением фактов руками, колонка «machine / mode» — резолвером, который
      // знает ровно те семейства, что в него вписали, и tsc не видит ни одного пропуска в обоих.
      // Ниже — по шагу на семейство плюс те деградации, о которых бумага обязана говорить честно.
      {
        // СТРОЧКА: две иглы с расстоянием между ними, «без закрепки» как ЯВНЫЙ ответ (не молчание),
        // шаг между рядами и посадка отношением. Иглы уходят в колонку машинки — к точке и номеру
        // с профиля, потому что игольница одна; остальное — в колонку шва.
        operationNumber: 70,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH_DOUBLE_NEEDLE',
        zone: 'TECH_CARD_GARMENT_ZONE_BACK',
        pieceLineKeys: ['P1'],
        stitching: {
          needleCount: 2,
          needleGaugeMm: dec('6.4'),
          seamSecuring: 'TECH_CARD_SEAM_SECURING_NONE',
          rowSpacingMm: dec('6'),
          fullnessRatio: dec('1.15'),
        },
        smv: dec('0.8'),
      },
      {
        // Бейка и этикетка — тоже строчка, но факты про шов: как сложена окантовка, какой схемой
        // пришита этикетка. Обе подписи самостоятельны: в списке настроек над ними ничего не
        // говорит, о чём речь.
        operationNumber: 80,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_BINDING_TAPING',
        zone: 'TECH_CARD_GARMENT_ZONE_NECKLINE',
        stitching: {
          bindingStyle: 'TECH_CARD_BINDING_STYLE_DOUBLE_FOLD',
          labelAttachStitch: 'TECH_CARD_LABEL_ATTACH_STITCH_CAUGHT_IN_SEAM',
        },
      },
      {
        // ПЕТЕЛЬНЫЙ АВТОМАТ: расстановка (шесть штук через 90 мм) + цикловая тройка фурнитуры,
        // законная на MACHINE (подготовка отверстия, усилитель, стежков в цикле), + сама петля.
        // Петля печатается ОДНИМ фактом: направление и форма — прилагательные к одной прорези.
        operationNumber: 90,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
        zone: 'TECH_CARD_GARMENT_ZONE_CLOSURE',
        placementLayout: { count: 6, pitchMm: dec('90') },
        hardware: {
          holePrep: 'TECH_CARD_HOLE_PREP_PUNCH',
          reinforcement: 'TECH_CARD_REINFORCEMENT_FUSIBLE_PATCH',
          cycleStitchCount: 42,
        },
        fastening: {
          buttonholeStyle: 'TECH_CARD_BUTTONHOLE_STYLE_ROUND_END',
          buttonholeOrientation: 'TECH_CARD_BUTTONHOLE_ORIENTATION_HORIZONTAL',
          cutLengthMm: dec('18'),
          bartackLengthMm: dec('6'),
        },
        smv: dec('0.4'),
      },
      {
        // Пуговицы и молния — те же FA-поля, но каждое отвечает своей машинке. Расстановка здесь
        // ЕДИНИЦА, и она не печатается: контракт говорит, что незаполненный счётчик и значит один
        // повтор, то есть два способа сказать одно и то же, а чернил стоит один.
        operationNumber: 100,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
        zone: 'TECH_CARD_GARMENT_ZONE_CLOSURE',
        placementLayout: { count: 1 },
        fastening: { attachPattern: 'TECH_CARD_BUTTON_ATTACH_PATTERN_CROSS_X' },
      },
      {
        operationNumber: 110,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_ZIPPER_SETTING',
        zone: 'TECH_CARD_GARMENT_ZONE_CLOSURE',
        bomLineKeys: ['B2'],
        fastening: { zipperApplication: 'TECH_CARD_ZIPPER_APPLICATION_INVISIBLE' },
      },
      {
        // СВАРКА. Деградация §6.5: у проклейки НЕТ номера стежка по ISO 4915 — она соединяет
        // теплом, а не ниткой. На бумаге обязано стоять «seam-sealing tape (hot air)» БЕЗ номера, и
        // это не «машинку не назвали», а «стежка не существует». Горячий воздух — только у неё.
        operationNumber: 120,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_SEAM_TAPING',
        zone: 'TECH_CARD_GARMENT_ZONE_SHOULDER',
        bomLineKeys: ['B3'],
        weld: { airTemperatureC: 550, feedSpeedMMin: dec('4.5') },
        smv: dec('1.2'),
      },
      {
        // Ультразвук: горячего воздуха у него нет вовсе, и в строке остаётся одна подача. Пустая
        // половина здесь — правда о машине, а не недозаполненная карточка.
        operationNumber: 130,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_ULTRASONIC_WELDER',
        zone: 'TECH_CARD_GARMENT_ZONE_HEM',
        weld: { feedSpeedMMin: dec('2.8') },
      },
      {
        // ФУРНИТУРА. Дискриминатор («press-set») встаёт туда, где швейный шаг называет машинку:
        // колонка «machine / mode» у этих глаголов иначе печатала бы прочерк при заполненном шаге.
        operationNumber: 140,
        operationType: 'TECH_CARD_OPERATION_TYPE_HARDWARE_SET',
        zone: 'TECH_CARD_GARMENT_ZONE_POCKET',
        placementLayout: { count: 4, pitchMm: dec('120') },
        hardware: {
          attachMethod: 'TECH_CARD_HARDWARE_ATTACH_METHOD_PRESS_SET',
          holePrep: 'TECH_CARD_HOLE_PREP_PUNCH',
          reinforcement: 'TECH_CARD_REINFORCEMENT_FABRIC_STAY',
        },
        smv: dec('0.6'),
      },
      {
        // Стропа через пряжку: подгиб печатается только у этого способа крепления.
        operationNumber: 150,
        operationType: 'TECH_CARD_OPERATION_TYPE_HARDWARE_SET',
        zone: 'TECH_CARD_GARMENT_ZONE_WAIST',
        hardware: {
          attachMethod: 'TECH_CARD_HARDWARE_ATTACH_METHOD_THREADED',
          foldbackMm: dec('40'),
        },
      },
      {
        // ПЕЧАТЬ БЕРЁТ ПРЕСС ВЗАЙМЫ. Термотрансфер прижимают температурой, выдержкой, давлением и
        // силиконовой бумагой — ВТО-блок здесь законен, хотя шаг не «утюжка», и до этой волны все
        // четыре числа не печатались нигде: колонка спрашивала isPressStepType, а он на PRINT ложь.
        operationNumber: 160,
        operationType: 'TECH_CARD_OPERATION_TYPE_PRINT',
        zone: 'TECH_CARD_GARMENT_ZONE_CHEST',
        printMethod: 'TECH_CARD_PRINT_METHOD_HEAT_TRANSFER',
        placementLayout: { count: 2, pitchMm: dec('60') },
        print: {
          peelMode: 'TECH_CARD_PEEL_MODE_HOT',
          secondPressSec: 5,
          pressureScale: 'TECH_CARD_PRESSURE_SCALE_FIRM',
        },
        pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_PRESS',
        pressTemperatureC: 165,
        pressDwellSec: 12,
        pressCloth: 'TECH_CARD_PRESS_CLOTH_SILICONE_PAPER',
        smv: dec('0.9'),
      },
      {
        // Шелкография: носителя нет ВООБЩЕ, и «no carrier to peel» — ответ, а не пустота.
        operationNumber: 170,
        operationType: 'TECH_CARD_OPERATION_TYPE_PRINT',
        zone: 'TECH_CARD_GARMENT_ZONE_BACK',
        printMethod: 'TECH_CARD_PRINT_METHOD_SCREEN',
        print: { peelMode: 'TECH_CARD_PEEL_MODE_NONE' },
      },
      {
        // ПОДРЕЗКА. Остаток припуска стоит в колонке шва, прямо под тем припуском, с которым
        // кроили: «12 mm» и «trim back to 5 mm» — одно указание, разорванное на две строки было бы
        // двумя разными числами про один срез.
        operationNumber: 180,
        operationType: 'TECH_CARD_OPERATION_TYPE_TRIM',
        zone: 'TECH_CARD_GARMENT_ZONE_ARMHOLE',
        seamAllowanceMm: dec('12'),
        trim: {
          action: 'TECH_CARD_TRIM_ACTION_GRADE_LAYERS',
          residualAllowanceMm: dec('5'),
        },
        smv: dec('0.5'),
      },
      {
        operationNumber: 190,
        operationType: 'TECH_CARD_OPERATION_TYPE_THREAD_TRIM',
        zone: 'TECH_CARD_GARMENT_ZONE_OTHER',
        threadTrim: { residualTailMaxMm: dec('3') },
      },
      {
        operationNumber: 200,
        operationType: 'TECH_CARD_OPERATION_TYPE_CLEAN',
        zone: 'TECH_CARD_GARMENT_ZONE_OTHER',
        clean: { kind: 'TECH_CARD_CLEANING_KIND_ADHESIVE_REMOVAL' },
      },
      {
        operationNumber: 210,
        operationType: 'TECH_CARD_OPERATION_TYPE_INSPECT',
        zone: 'TECH_CARD_GARMENT_ZONE_OTHER',
        inspect: { coverageMode: 'TECH_CARD_INSPECT_COVERAGE_AQL_PLAN' },
        smv: dec('1.0'),
      },
      {
        // МОКРАЯ ОБРАБОТКА — вид лежит ПОЛЕМ шага, а не блоком: семейство из одного факта.
        operationNumber: 220,
        operationType: 'TECH_CARD_OPERATION_TYPE_WET_PROCESS',
        zone: 'TECH_CARD_GARMENT_ZONE_OTHER',
        wetProcessKind: 'TECH_CARD_WET_PROCESS_KIND_ENZYME',
      },
      {
        // СЛОЖИТЬ И УПАКОВАТЬ — полей у них НЕТ, и это находка волны, а не пропуск. Здесь они
        // держат другую проверку: карточная плотность («4 st/cm») — ШВЕЙНЫЙ дефолт, и до этой
        // волны она наследовалась на любой не-ВТО шаг, то есть каждая такая строка печатала бы в
        // колонке шва число, которому на упаковке нечего описывать.
        operationNumber: 230,
        operationType: 'TECH_CARD_OPERATION_TYPE_FOLD',
        zone: 'TECH_CARD_GARMENT_ZONE_OTHER',
      },
      {
        operationNumber: 240,
        operationType: 'TECH_CARD_OPERATION_TYPE_PACK',
        zone: 'TECH_CARD_GARMENT_ZONE_OTHER',
        smv: dec('0.3'),
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
