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
// issue со ссылкой на несуществующую операцию.

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
    construction: { defaultSeamClass: 'TECH_CARD_SEAM_CLASS_SSA', hemFinish: 'blind hem' },
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
