import { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { useWorkshopSettings } from 'components/managers/workshop/useWorkshopSettings';
import { techCardMediaKindOptions } from 'constants/filter';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import {
  Canvas,
  Pin,
  Chip,
  ChipRow,
  Section,
  HeaderWarnings,
  HeaderNote,
  Stat,
  StatGrid,
  Text,
  DecimalField,
} from 'ui';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import { SEAM_ALLOWANCE_MAX_MM } from 'utils/seam-allowance';
import { ConstructionAudit } from './construction-audit';
import { ConstructionField } from './construction-field';
import { zoneOptions } from './operation-options';
import { ColorwayArticles, ColorwayCloth, OperationsField } from './operations-field';
import { pieceClothMap, type ClothSlot, type PieceCloth } from './piece-cloth';
import { PieceLegend } from './piece-legend';
import { TechCardFormData, wireInt } from './schema';
import { useCrossHighlight } from './useCrossHighlight';
import { usePieceShapes, type PieceShapes } from './use-piece-shapes';
import { useSkeletonDoor } from './assembly-skeleton-panel';
import { CardUnitPicturesProvider, renderProposalUnit } from './card-unit-pictures';
import { useCardCategoryNames } from './skeleton-card-inputs';
import { ActiveStepProvider } from './assembly-map/active-step';
import { AssemblyMap } from './assembly-map/assembly-map';
import { SeamsDoor } from './assembly-seams/seams-door';
import { useSeamReview } from './assembly-seams/use-seam-decisions';
import { CalloutsPanel, PanelCollapseDoor, useCalloutsPanel } from './design/callouts-panel';
import { ASSEMBLY_MAP_PREFS_KEY } from './design/use-callouts-prefs';

const mediaKindLabels: Record<string, string> = Object.fromEntries(
  techCardMediaKindOptions.map((o) => [o.value, o.label]),
);

// Only technical views belong on the construction assembly map; mood / reference / cover /
// swatch images stay on the Sketch tab.
const CONSTRUCTION_VIEW_KINDS = new Set([
  'TECH_CARD_MEDIA_KIND_FRONT',
  'TECH_CARD_MEDIA_KIND_BACK',
  'TECH_CARD_MEDIA_KIND_DETAIL',
  'TECH_CARD_MEDIA_KIND_LINING',
]);

// The four real construction zones (UNKNOWN is the untagged default, not a zone to cover).
// Zones the card could cover, minus the «— zone —» placeholder. It is derived from the options list
// rather than typed as a number: the vocabulary went from four values to eighteen in the operations
// break, and a hardcoded denominator would have gone on reporting «7 / 4».
const TOTAL_CONSTRUCTION_ZONES = zoneOptions.length - 1;

export type SummaryOp = {
  calloutNumber?: number;
  smv?: string;
  zone?: string;
  bomLineKeys?: string[];
};

// The minutes ONE operation contributes to total SAM, exactly as the server computes it
// (dto.operationMinutes: SMV when the operation carries one, else the time norm). This summary
// used to sum `timeNorm` alone, so every operation with a measured SMV was counted at its estimate
// — or, with only an SMV entered, at nothing at all — and the implied €/min derived from it was
// wrong in the direction that flatters the rate.
//
// parseDecimalNumber, not parseFloat: these fields are typed through DecimalField, which accepts a
// comma decimal separator. parseFloat('1,8') is 1, so a card entered in the Russian layout lost
// ~44% of every such operation's minutes here while the operations editor's own total (which
// already used parseDecimalNumber) showed 1.8. Two totals for one column, one of them silently low.
export function operationMinutes(o: SummaryOp): number {
  // "Set" means parseable, exactly as SMV.Valid means non-NULL server-side — an explicit 0 SMV
  // counts as zero minutes there and here. The legacy `timeNorm` fallback went with the column:
  // one time field, one total, no rule to remember about which of two inputs wins.
  const smv = parseDecimalNumber(o.smv);
  return Number.isFinite(smv) ? smv : 0;
}

// ТРЕБУЕМЫЙ ПРИПУСК (Ф3.2) — the standard a раскладка's recorded allowance is judged against, and
// the one number on this tab a machine reads rather than a human.
//
// On the wire it is a CARD field, not part of `construction` — anything added to a section's digest
// projection instantly marks every signed-off CONSTRUCTION approval as «edited since signing».
//
// THREE VALUES, NOT TWO. Empty = the workshop default applies (the placeholder names it); a number
// overrides it; 0 is a number like any other («кроим по линии как нарисована»). The distinction
// lives in the field's `title`, not in a paragraph under it.
function RequiredSeamAllowanceField() {
  // The workshop singleton, on the shared query key — the раскладка modal reads the same row for its
  // allowance prefill, so this is a cache hit rather than a second fetch on the usual path.
  const { data } = useWorkshopSettings();
  const shopDefault = decimalToInput(data?.settings?.defaultSeamAllowanceMm).trim();
  return (
    <div title='empty inherits the workshop value; 0 means cut along the line as drawn'>
      <DecimalField
        name='requiredSeamAllowanceMm'
        label='required seam allowance, mm'
        maxDecimals={1}
        placeholder={shopDefault ? `inherited · ${shopDefault} mm` : 'not set'}
      />
    </div>
  );
}

// СТАНДАРТЫ КАРТОЧКИ — the required allowance and the card defaults (workmanship + equipment park)
// in ONE block, folded by default: they are what every step inherits, set once and rarely looked
// at again. The block opens itself on any error under it, so the error router's revealField finds
// the control; it is keyed on the submit count while an error stands, so a fold the user closed by
// hand is reopened by the next failed save rather than hiding the failing field.
function CardStandards() {
  const {
    formState: { errors, submitCount },
  } = useFormContext<TechCardFormData>();
  const hasError = !!errors.construction || !!errors.requiredSeamAllowanceMm;
  return (
    <Section
      key={hasError ? `err-${submitCount}` : 'ok'}
      title='standards'
      collapsible
      defaultOpen={hasError}
    >
      {/* The narrow column belongs to the ONE number, not to the block: the equipment park below
          needs the full width for its tile grids. */}
      <div className='flex flex-col gap-2.5'>
        <div className='sm:max-w-sm'>
          <RequiredSeamAllowanceField />
        </div>
        <ConstructionField />
      </div>
    </Section>
  );
}

// Summary lead: how many operations, total SMV (feeds costing) and how many assembly zones are
// tagged. Defects (steps without a pin, materials on no step, labels no step sews) are not counted
// here any more: they are the operations block's header warnings.
//
// It subscribes to the whole `operations` array ITSELF rather than taking it as a prop: that array
// changes on every keystroke in the assembly editor, and holding the subscription in the tab
// re-rendered the sketch, the legend and the entire operations rail along with it.
function ConstructionSummary() {
  const { control } = useFormContext<TechCardFormData>();
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as SummaryOp[];

  const opCount = operations.length;
  const totalSam = operations.reduce((s, o) => s + operationMinutes(o), 0);
  const zonesCovered = new Set(
    operations.map((o) => o.zone).filter((z) => z && z !== 'TECH_CARD_GARMENT_ZONE_UNKNOWN'),
  ).size;

  return (
    <StatGrid min={130}>
      <Stat label='operations' value={opCount} />
      <Stat label='total SMV' value={`${totalSam.toFixed(1)} min`} />
      <Stat label='zones covered' value={`${zonesCovered} / ${TOTAL_CONSTRUCTION_ZONES}`} />
    </StatGrid>
  );
}

type FormCallout = {
  number?: number;
  mediaId?: number;
  part?: string;
  posX?: string;
  posY?: string;
};

// Read-only sketch with numbered pins, shown beside the operations list so the assembly
// map and the steps live on one screen. Pins are positioned against the IMAGE's own box, not a
// fixed-aspect frame: callout posX/posY are fractions of the image, so letterboxing would slide
// every pin off the detail it names.
function ConstructionSketch({
  mediaById,
  activePin,
  onActivePinChange,
}: {
  mediaById: Map<number, common_MediaFull>;
  activePin: number | null;
  onActivePinChange: (n: number | null) => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  // Which pins an operation actually claims — computed here, for the same reason the summary
  // watches its own array: this subscription must not sit in the tab above the operations editor.
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as SummaryOp[];
  const usedPins = useMemo(
    () => new Set(operations.map((o) => o.calloutNumber || 0).filter((n) => n > 0)),
    [operations],
  );
  // Assembly map draws on the technical sketches (front/back/detail), not the moodboard.
  const media = (useWatch({ control, name: 'technicalMedia' }) ?? []) as Array<{
    mediaId: number;
    kind?: string;
  }>;
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];

  const views = media.filter((m) => {
    if (!CONSTRUCTION_VIEW_KINDS.has(m.kind ?? '')) return false;
    const f = mediaById.get(m.mediaId);
    return !!(f?.media?.fullSize?.mediaUrl || f?.media?.thumbnail?.mediaUrl);
  });
  const [viewId, setViewId] = useState<number | null>(null);

  const pinnedViewId = (() => {
    if (!activePin) return null;
    const c = callouts.find((cl) => (cl.number || 0) === activePin);
    const mid = c?.mediaId || 0;
    return mid && views.some((v) => v.mediaId === mid) ? mid : null;
  })();
  const activeViewId = pinnedViewId ?? viewId ?? views[0]?.mediaId ?? null;
  const full = activeViewId != null ? mediaById.get(activeViewId) : undefined;
  const url = full?.media?.fullSize?.mediaUrl || full?.media?.thumbnail?.mediaUrl || '';

  if (views.length === 0) {
    return (
      <div className='flex flex-col gap-1'>
        <Canvas aspect='3/4' className='flex items-center justify-center'>
          <Text
            size='micro'
            variant='label'
            component='span'
            className='px-2 text-center uppercase'
          >
            no technical sketch
          </Text>
        </Canvas>
        <Text size='micro' variant='label'>
          add a flat on STUDIO, pin it in ARTIFACTS
        </Text>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-1.5'>
      {views.length > 1 && (
        <ChipRow>
          {views.map((v) => (
            <Chip
              key={v.mediaId}
              // `nonForm`: переключение проекции (перёд / спинка / деталь) — ЧТЕНИЕ, оно ничего не
              // пишет. Обычный Chip рендерится нативной кнопкой, а та внутри `<fieldset disabled>`
              // выпущенной карточки клика не получает: на подписанной карточке было видно только
              // первое изображение, а спинку посмотреть было нельзя.
              nonForm
              selected={v.mediaId === activeViewId}
              pressed={v.mediaId === activeViewId}
              onClick={() => setViewId(v.mediaId)}
            >
              {mediaKindLabels[v.kind ?? ''] ?? 'view'}
            </Chip>
          ))}
        </ChipRow>
      )}

      <div className='relative w-full border border-borderColor'>
        <img src={url} alt='sketch' draggable={false} className='block w-full select-none' />
        {callouts.map((c, idx) => {
          if (c.mediaId !== activeViewId) return null;
          const x = parseFloat(c.posX ?? '');
          const y = parseFloat(c.posY ?? '');
          if (Number.isNaN(x) || Number.isNaN(y)) return null;
          const num = c.number || 0;
          const used = num > 0 && usedPins.has(num);
          return (
            <Pin
              key={idx}
              x={x * 100}
              y={y * 100}
              label={num || idx + 1}
              highlighted={!!activePin && num === activePin && num > 0}
              title={`#${num || idx + 1}${c.part?.trim() ? ` · ${c.part.trim()}` : ''}${
                used ? '' : ' · not bound to an operation'
              }`}
              onMouseEnter={() => num > 0 && onActivePinChange(num)}
              onMouseLeave={() => onActivePinChange(null)}
            />
          );
        })}
      </div>
    </div>
  );
}

// THE PATTERN'S STATE IN THE OPERATIONS HEADER — the tab's only reaction to a DXF on the card.
//
// Silent (`undefined`) where there is nothing to say: a card WITHOUT patterns must not learn that
// silhouettes exist, and a card whose outlines are drawn needs no word about them. While the batch
// is being read: one quiet note (the skeleton door stays silent meanwhile, so the state is named
// once). A parse that gave no outline, or failed, is a defect of the block: a header warning, with
// the door to PATTERNS where pieces are matched to blocks.
//
// The error is said ONCE: useDxfGeometry runs with `retry: false`, an unreachable CDN is an answer.
function shapesAffordance(
  shapes: PieceShapes,
  onGoTab?: (tab: string) => void,
): React.ReactNode | undefined {
  if (!shapes.hasDxf) return undefined;
  const toPatterns = onGoTab
    ? { label: 'open patterns', onClick: () => onGoTab('patterns') }
    : undefined;
  if (shapes.shapeByKey) {
    return shapes.foundCount === 0 ? (
      <HeaderWarnings
        items={[{ text: 'pieces not matched to pattern blocks', action: toPatterns }]}
      />
    ) : undefined;
  }
  if (shapes.error) {
    return (
      <HeaderWarnings
        items={[{ text: `the patterns didn't parse: ${shapes.error.message}`, error: true }]}
      />
    );
  }
  if (shapes.isLoading) return <HeaderNote>reading the pattern…</HeaderNote>;
  return undefined;
}

/**
 * Отпечаток строк BOM по ЧЕТЫРЁМ полям, из которых выводится ткань детали.
 *
 * Функция модуля, а не тело хука: её зовут из двух мест — ленивый инициализатор состояния (один
 * счёт при монтировании) и колбэк подписки, — и вторая копия формулы разошлась бы с первой молча,
 * дав «отпечаток не изменился» там, где он изменился.
 */
function clothFingerprintOf(lines: TechCardFormData['bomItems'] | undefined): string {
  return (lines ?? [])
    .map((l) => [l.lineKey, l.purpose, l.section, l.materialId].join('|'))
    .join('~');
}

/**
 * Одна и та же ткань детали или уже другая.
 *
 * Нужна РОВНО для переиспользования прежнего объекта: `pieceClothMap` — чистая функция и на каждом
 * прогоне мастерит новые `PieceCloth`, а плитка сравнивает пропы по ссылке. Без этого сравнения
 * любая правка любого поля BOM перерисовывала бы все силуэты карточки, ничего в них не изменив.
 *
 * Сравнивается не только `state` + `article.id`, но и подпись артикула: каталог материалов
 * приезжает ОТДЕЛЬНЫМ запросом и позже карточки, поэтому первый прогон резолвит артикул в «#1234»
 * (кода и имени ещё нет), а второй — уже в «CORD-14 · вельвет». По id эти два объекта неотличимы,
 * и сравнение только по нему навсегда заморозило бы подпись на числе.
 */
function sameCloth(a: PieceCloth, b: PieceCloth): boolean {
  return (
    a.state === b.state &&
    (a.article?.id ?? 0) === (b.article?.id ?? 0) &&
    (a.article?.code ?? '') === (b.article?.code ?? '') &&
    (a.article?.name ?? '') === (b.article?.name ?? '')
  );
}

// Construction workspace: the sketch (assembly map) on the left, the general finishing defaults
// and the ordered operations on the right — so a step and its place on the drawing are visible
// together, without switching tabs. Colourway / material selection lives on the colorways tab;
// this tab is about HOW the garment goes together, not which fabric or colour.
export function ConstructionTab({
  techCard,
  active = false,
  onSave,
  saving = false,
  onGoTab,
}: {
  techCard?: common_TechCard;
  /** Вкладка открыта. Вкладки смонтированы все сразу — без этого разбор заказывался бы всегда. */
  active?: boolean;
  /**
   * Сохранение карточки и его состояние — ПРОКЛАДКА ДО ФУЛСКРИНА. Хром полноэкранной схемы несёт
   * свою кнопку save: оверлей закрывает шапку карточки целиком, и без неё единственным выходом из
   * фулскрина к сохранению был бы выход из фулскрина.
   */
  onSave?: () => void;
  saving?: boolean;
  /**
   * Переход по якорю находки аудита. ПРОКЛАДКА ДО `navTo`, ровно как `onSave` — прокладка до
   * сохранения: об идентичности вкладок (`TabId`, свёрнутые псевдонимы, какие из них вообще есть
   * на этой карточке) знает только `index.tsx`, и второй список вкладок здесь разъехался бы с ним
   * первой же сверткой.
   */
  onGoTab?: (tab: string, extra?: Record<string, string>) => void;
}) {
  // Deliberately NOT watching `operations` here. The summary and the sketch each hold their own
  // subscription, so a keystroke in the assembly editor re-renders those two leaves instead of
  // this whole workspace (and with it every row of the sequence rail).
  //
  // `bomItems` тоже НЕ смотрится через useWatch — по той же причине и с тем же исходом: вкладки
  // тех-карты смонтированы ВСЕ СРАЗУ и лишь спрятаны, так что рендерящая подписка отсюда
  // реконсилировала бы спрятанную вкладку сборки целиком (эскиз, Canvas, редактор операций со
  // всеми строками рельса) на каждый символ, набранный в любом поле BOM на соседней вкладке.
  // Подписка на ткань живёт ниже, в `useEffect` через `watch(cb)`, и рендер вызывает только на
  // смене отпечатка — см. там же.
  const { getValues, watch } = useFormContext<TechCardFormData>();

  // ЗДЕСЬ ЧИТАЛИСЬ `purpose` / `isAux` / `canWriteCard` / `frozen` — ГЕЙТЫ БЛОКА C-5, и они сняты
  // вместе с ним: подписка на `purpose` и запрос прав, которые никто больше не спрашивает, — это
  // лишний рендер вкладки и лишний вопрос к правам на каждое открытие. Признак выпущенной карточки
  // ниже по-прежнему считается там, где потребляется (`OperationsField`, `ConstructionAudit`) — он
  // и раньше писался у них выражением, а не через эту переменную.

  // Sketch pin ↔ operation and BOM line ↔ operation are the same mechanism, so both come from the
  // shared hook the pieces tab reuses for its mini-diagram.
  const pin = useCrossHighlight<number>();
  const bom = useCrossHighlight<string>();

  // СИЛУЭТЫ ДЕТАЛЕЙ — ПАССИВНО ПО УМОЛЧАНИЮ, разбор только по явному клику.
  //
  // Вкладка не качает НИЧЕГО сама: `enabled` стартует false, поэтому тёплый кэш (вкладка PATTERNS,
  // модалка раскладки, пересчёт нормы) рисует силуэты мгновенно и бесплатно, а холодная карточка
  // не платит ни одного запроса за картинки, которых никто не просил — сборку открывают, чтобы
  // править операции, а не разглядывать выкройки, и десятки мегабайт с CDN за вход на вкладку были
  // бы платой в чужой карман. Кому силуэты нужны здесь и сейчас — нажимает ссылку в шапке блока.
  //
  // ЛАТЧ, а не зеркало «вкладка открыта»: уход на соседнюю вкладку не имеет права отменить уже
  // идущее скачивание (React Query бросил бы запрос на полпути, и следующий заход начал бы его
  // заново), поэтому обратной дороги у флага нет — он живёт до перемонтирования карточки.
  //
  // Хук держится ЗДЕСЬ, а не внутри редактора операций: карта контуров одна на карточку и
  // стабильна по ссылке, а редактор перерисовывается на каждый введённый символ.
  // Словарь «media_id → адрес» для операционных снимков. Приходит с чтения карточки: во форме
  // лежит только id, потому что именно он уходит на сервер.
  const operationMediaUrls = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of techCard?.resolvedOperationMedia ?? []) {
      const id = wireInt(r.media?.id);
      const url = r.media?.media?.fullSize?.mediaUrl ?? r.media?.media?.thumbnail?.mediaUrl ?? '';
      if (id > 0 && url) m.set(id, url);
    }
    return m;
  }, [techCard?.resolvedOperationMedia]);

  // Разбор заказывается САМ, как только вкладку открыли: силуэты здесь — рабочий материал, а не
  // опция, и спрашивать разрешения показать то, ради чего на экран пришли, незачем. Но и качать
  // мегабайты за того, кто вкладку не открывал, тоже: вкладки смонтированы все сразу.
  const pieceShapes = usePieceShapes(active);

  // Which concrete article each colourway takes for the slots an operation consumes. Assembled here
  // because the two halves come from different places: the recipe (usages + their pins) rides the
  // card READ, while the slot's default article is edited in the form on the BOM tab — so a freshly
  // picked, not-yet-saved default still resolves. The catalog query is the exact one the colorways
  // tab already holds ('', true), so this is a React Query cache hit rather than a second fetch.
  const { data: materialsData } = useMaterials('', true);
  // ДВА СЛОВАРЯ, ОБЩИЕ НА ДВУХ ЧИТАТЕЛЕЙ — `colorwayArticles` (артикул слота на шаге) и
  // `pieceClothByColorway` (ткань детали). Собранные в каждом по разу, они разъехались бы первой же
  // правкой одного из них, а расходиться им есть где: и нормализация int64, и гард `id > 0 && key`
  // ниже нужны обоим одинаково и одинаково молча ломаются.
  //
  // EVERY id here goes through wireInt. material_id and id are int64 in techcard.proto, and
  // grpc-gateway serialises int64 as a STRING while the generated TS type claims `number` — so
  // an unnormalised Map keyed by the raw value type-checks and then misses on every lookup
  // (schema.ts:846 documents the same trap on the form side). The slot default already arrives
  // wireInt'd through mapBomItemToForm, so without this the two sides are different runtime
  // types and a colourway inheriting the default would read as diverging from one that pins it.
  const materialCatalog = useMemo(() => {
    const nameById = new Map<number, string>();
    // Артикул для штриховки везёт код и имя РАЗДЕЛЬНО и без фолбэков: подписью распоряжается
    // `pieceClothMap`, и подставленное здесь «#1234» вместо пустого имени заставило бы его
    // напечатать id там, где он рассчитывает напечатать имя.
    const articleById = new Map<number, { code: string; name: string }>();
    for (const material of materialsData?.materials ?? []) {
      const id = wireInt(material.id);
      if (id <= 0) continue;
      nameById.set(id, material.name?.trim() || `#${id}`);
      articleById.set(id, { code: material.code?.trim() ?? '', name: material.name?.trim() ?? '' });
    }
    return { nameById, articleById };
  }, [materialsData?.materials]);

  // Legacy usages carry no bom_line_key, only the resolved bom_item_id. Both come from the same
  // read payload, so mapping id → line_key here is exact — unlike guessing by position, which is
  // the bug 0200's read path was written to avoid.
  const lineKeyByBomId = useMemo(() => {
    const m = new Map<number, string>();
    for (const line of techCard?.techCard?.bomItems ?? []) {
      const id = wireInt(line.id);
      const key = line.lineKey?.trim();
      // ГАРД ОБЯЗАТЕЛЕН И ЦЕЛИКОМ. Ещё не сохранённая строка BOM приходит с `id: 0`; попав в мост
      // ключом 0, она поймала бы ЛЮБОЙ легаси-usage с пустым `bomItemId` (wireInt даёт из него тот
      // же 0) и привязала бы деталь к строке, которой на сервере ещё нет. Экран при этом остаётся
      // правдоподобным: деталь просто заштрихована не той тканью.
      if (id > 0 && key) m.set(id, key);
    }
    return m;
  }, [techCard?.techCard?.bomItems]);

  const colorwayArticles = useMemo<ColorwayArticles>(() => {
    const materialNameById = materialCatalog.nameById;
    const colorways = (techCard?.colorways ?? []).map((cw) => {
      const pinsByLineKey = new Map<string, number[]>();
      for (const usage of cw.usages ?? []) {
        const key = usage.bomLineKey?.trim() || lineKeyByBomId.get(wireInt(usage.bomItemId)) || '';
        if (!key) continue;
        const pin = wireInt(usage.materialId);
        const bucket = pinsByLineKey.get(key);
        if (bucket) bucket.push(pin);
        else pinsByLineKey.set(key, [pin]);
      }
      return {
        // The operator's word for a colourway, never its numeric id (same rule as colorwayTitle
        // on the colorways tab).
        label: cw.colorCode?.trim() || cw.baseSku?.trim() || `#${cw.colorwayId}`,
        pinsByLineKey,
      };
    });
    return { colorways, materialNameById };
  }, [techCard?.colorways, lineKeyByBomId, materialCatalog]);

  // ТКАНЬ ДЕТАЛЕЙ — ДВА ИСТОЧНИКА, И ЭТО НЕ НЕБРЕЖНОСТЬ (та же развилка, что у соседа сверху).
  //
  // СЛОТЫ — ИЗ ФОРМЫ. Назначение строки BOM правят на соседней вкладке, и несохранённая правка
  // обязана менять штриховку сразу: «поменял purpose — штриховка та же» читается как поломка, а не
  // как «сохрани сначала». USAGES — С ЧТЕНИЯ: рецепта колорвея в форме нет вовсе, и брать его
  // оттуда значит получить пустую карту на живой карточке.
  //
  // ПОДПИСКА ЧЕРЕЗ ОТПЕЧАТОК, а не на сам массив: `bomItems` меняет идентичность на каждый символ в
  // любом поле любой строки (имя, расход, примечание), а на штриховку влияют ровно четыре поля.
  // Без отпечатка карта пересоздавалась бы на каждое нажатие и перерисовывала все силуэты
  // карточки — ровно та ловушка memo, ради которой контуры считаются один раз на вкладке.
  //
  // И ПОДПИСКА НЕ РЕНДЕРЯЩАЯ. `useWatch` защищал бы только ПЕРЕСЧЁТ карты: сам он рендерит эту
  // вкладку на каждое изменение массива, то есть на каждый символ, — а вкладки смонтированы все
  // сразу, так что спрятанная сборка реконсилировалась бы целиком (эскиз, Canvas, редактор
  // операций на все строки рельса) ради отпечатка, который в 99 нажатиях из 100 тот же самый.
  // `watch(cb)` рендера не вызывает вовсе; рендер здесь делает ровно один функциональный сеттер, и
  // только когда одно из четырёх полей действительно изменилось.
  //
  // Пустое `name` — это `reset()` (восстановление черновика, приезд карточки с сервера): оно
  // меняет весь массив разом и обязано пересчитать отпечаток, поэтому под гардом стоит именно
  // «имя есть И оно не про bomItems».
  const [clothFingerprint, setClothFingerprint] = useState(() =>
    clothFingerprintOf(getValues('bomItems')),
  );
  useEffect(() => {
    const sub = watch((_, { name }) => {
      if (name && !name.startsWith('bomItems')) return;
      const next = clothFingerprintOf(getValues('bomItems'));
      setClothFingerprint((prev) => (prev === next ? prev : next));
    });
    return () => sub.unsubscribe();
  }, [watch, getValues]);
  // Прошлый результат — для ПЕРЕИСПОЛЬЗОВАНИЯ ССЫЛОК. Отпечаток решает, считать ли заново; этот
  // кэш решает, менять ли идентичность посчитанного. Смена отпечатка почти всегда меняет ткань
  // одной строки из двадцати, и без него девятнадцать нетронутых деталей всё равно перерисовались
  // бы: пропы плиток сравниваются по ссылке.
  const clothCache = useRef<ColorwayCloth[]>([]);
  const pieceClothByColorway = useMemo<ColorwayCloth[]>(() => {
    // Через getValues, а не через значение из подписки: зависимостью остаётся отпечаток — то есть
    // memo пересчитывается ровно тогда, когда изменилось влияющее поле, а не тогда, когда RHF выдал
    // новый массив. Свежесть при этом не страдает: сеттер отпечатка уже отработал, и `getValues`
    // читает текущее состояние формы, а не снимок момента подписки.
    //
    // Проекция, а не приведение: строка формы возит два десятка полей, из которых ткань выводят
    // ровно четыре, и `ClothSlot` перечисляет их именно затем, чтобы пятое нельзя было прочитать
    // молча. Строка без ключа доезжает как есть — её отбрасывает сам `pieceClothMap`.
    const slots: ClothSlot[] = (getValues('bomItems') ?? []).map((l) => ({
      lineKey: l.lineKey ?? '',
      purpose: l.purpose,
      section: l.section,
      materialId: l.materialId,
    }));
    const prev = clothCache.current;
    const list = techCard?.colorways ?? [];
    let allSame = prev.length === list.length;
    const next = list.map((cw, i) => {
      // Правило имени — то же, что у `colorwayArticles` и у печатного комплекта: слово оператора,
      // никогда не числовой id колорвея. Словаря цветов на этой вкладке нет, и заводить ради
      // подписи второй запрос незачем — код колорвея и есть то, чем его называют в цехе.
      const label = cw.colorCode?.trim() || cw.baseSku?.trim() || `#${cw.colorwayId}`;
      const map = pieceClothMap(
        slots,
        cw.usages ?? [],
        materialCatalog.articleById,
        lineKeyByBomId,
      );
      const before = prev[i];
      if (!before) {
        allSame = false;
        return { label, map };
      }
      // Обход идёт ВСЕГДА, даже когда карта выросла: заведённая двадцать первая деталь не повод
      // менять ссылки у двадцати прежних. Размер участвует только в вердикте «карта та же».
      let same = before.label === label && before.map.size === map.size;
      for (const [key, cloth] of map) {
        const was = before.map.get(key);
        if (was && sameCloth(was, cloth)) map.set(key, was);
        else same = false;
      }
      if (!same) allSame = false;
      // Размеры равны и каждый ключ новой карты нашёлся прежним — значит карты совпадают целиком,
      // и прежнюю пару можно вернуть как есть: тогда не меняется и идентичность массива.
      return same ? before : { label, map };
    });
    if (allSame) return prev;
    clothCache.current = next;
    return next;
  }, [clothFingerprint, techCard?.colorways, materialCatalog, lineKeyByBomId, getValues]);

  // The assembly map pins onto the technical sketches (callouts live there).
  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const rm of techCard?.resolvedTechnicalMedia ?? []) {
      if (rm.media?.id != null) m.set(rm.media.id, rm.media);
    }
    return m;
  }, [techCard?.resolvedTechnicalMedia]);

  // КАРКАС СБОРКИ ПО ВЫКРОЙКЕ: две двери (шапка блока операций и пустое состояние), панель
  // предложения и запрос записи, который уезжает в `OperationsField`. Хук сам ни на что в форме не
  // подписан: панель читает форму, только пока открыта.
  const frozen = techCard?.techCard?.approvalState === 'TECH_CARD_APPROVAL_STATE_RELEASED';
  const categoryNames = useCardCategoryNames();
  const skeleton = useSkeletonDoor({
    frozen,
    shapes: pieceShapes,
    cloth: pieceClothByColorway[0]?.map ?? null,
    categoryNames,
    renderUnit: renderProposalUnit,
    techCardId: techCard?.id,
  });

  return (
    <div className='flex flex-col gap-3.5'>
      {/* ═══ ЗДЕСЬ СТОЯЛИ ТРИ БЛОКА КРУГА 20 — И ОНИ УЕХАЛИ В СТУДИЮ ═══════════════════════════
          C-5 GENERAL INFORMATION, C-7 таблица указаний и C-8 спецификация были смонтированы на
          ЭТОЙ вкладке. Адрес был неверный: владелец назвал цель цитатой заголовка и подзаголовка
          — «в CONSTRUCTION — described aspect by aspect; prints after the concept», — а это
          секция ВКЛАДКИ STUDIO, где живут аспекты сборки, а не одноимённая вкладка. Блоки
          переехали туда целиком (`design/studio-tab.tsx`, довод у самого блока).

          МОНТАЖ ОСТАЛСЯ ОДИН НА КАЖДЫЙ. Оставить их и здесь «на всякий случай» значило бы
          завести двух всегда-смонтированных писателей над одной формой: `bomItems`, `callouts` и
          `details` правятся через `useFormContext`, и второй экземпляр разошёлся бы с первым
          ровно так, как разошлись два `DetailsEditor` (U-9).

          ЧТО ОСТАЛОСЬ НА ЭТОЙ ВКЛАДКЕ: сводка, эскиз-схема сборки с легендой деталей, разбор
          (`ConstructionAudit`), стандарты карточки (`CardStandards` — припуск и оборудование,
          пункт C-6 их не двигал) и сам рельс операций. То есть вкладка стала тем, чем и
          называлась: КАК это собирают. */}
      <ConstructionSummary />

      {/* The sketch is a reference, not the work: a fixed 320px column reads it fine and leaves the
          assembly sequence the rest of the screen. At 2/5 the drawing was 640px wide on a 1600px
          display with ~3000px of empty ground under it, while the operations were squeezed. */}
      {/* КАРТА СБОРКИ И РЕЛЬС ЧИТАЮТ ОДИН ГРАФ И ОДИН АКТИВНЫЙ ШАГ: провайдер пиктограмм (он же — граф
          швов карты) и стор активного шага стоят над ОБЕИМИ колонками. Без DXF граф null, и
          колонка — сегодняшний эскиз байт в байт. */}
      <ActiveStepProvider>
        <CardUnitPicturesProvider
          shapes={pieceShapes.shapeByKey}
          cloth={pieceClothByColorway[0]?.map ?? null}
          categoryNames={categoryNames}
        >
          <div className='flex flex-col gap-3.5 lg:flex-row lg:items-start'>
            <AssemblyColumn
              techCard={techCard}
              frozen={frozen}
              shapes={pieceShapes.shapeByKey}
              sketch={
                <ConstructionSketch
                  mediaById={mediaById}
                  activePin={pin.active}
                  onActivePinChange={pin.setActive}
                />
              }
            />

            <div className='flex w-full min-w-0 flex-col gap-2.5 lg:flex-1'>
              {/* СНАЧАЛА ОТЧЁТ, ПОТОМ ТО, О ЧЁМ ОН. Аудит говорит и про стандарты карточки, и про весь
              рельс операций под ними, поэтому стоит НАД обоими: под списком из ста двадцати шагов
              его бы не нашёл никто, а найденное в конце экрана читается как приложение. */}
              <ConstructionAudit
                techCardId={techCard?.id}
                active={active}
                onGoTab={onGoTab}
                // ТОТ ЖЕ ПРЕДИКАТ, ЧТО ГЛУШИТ ВКЛАДКУ ФИЛДСЕТОМ (ниже, у OperationsField, и в
                // index.tsx). Панель по нему решает, КУДА уходит поданная претензия: на живой
                // карточке — в форму, обычным сохранением; на выпущенной сохранения нет вовсе, и
                // претензия идёт на сервер напрямую. Разойдись этот признак с филдсетом — на
                // замороженной карточке претензии писались бы в форму, которую уже не сохранить,
                // и исчезали бы молча.
                frozen={techCard?.techCard?.approvalState === 'TECH_CARD_APPROVAL_STATE_RELEASED'}
                // Шагов на СОХРАНЁННОЙ карточке — для строки «reviewing N operations…». Не из формы:
                // разбор гоняется по сохранённым фактам, и число из формы обещало бы разбор
                // несохранённых правок.
                operationCount={(techCard?.techCard?.operations ?? []).length}
              />
              <CardStandards />
              <section className='border border-borderColor bg-bgColor p-4'>
                {/* The block header (title, warnings, the pattern's state, the skeleton door) is drawn
                    by OperationsField: its warnings read the rail's own subscriptions. */}
                <OperationsField
                  activePin={pin.active}
                  onActivePinChange={pin.setActive}
                  activeBom={bom.active}
                  onActiveBomChange={bom.setActive}
                  colorwayArticles={colorwayArticles}
                  pieceClothByColorway={pieceClothByColorway}
                  pieceShapes={pieceShapes.shapeByKey}
                  orphanBlocks={pieceShapes.unlinkedBlocks ?? []}
                  // Размечена ли СОХРАНЁННАЯ карточка. Предикат тот же, что у маппера: сервер
                  // принимает намерение «снять разметку» только против карточки, которая её несёт,
                  // и кнопка обязана быть на экране ровно в этом случае — даже если форма уже
                  // распакована (восстановленный черновик).
                  storedHasUnits={(techCard?.techCard?.operations ?? []).some(
                    (o) => (o?.outputUnitKey ?? '').trim() !== '',
                  )}
                  // Выпущенная карточка. Предикат тот же, что в index.tsx: серверное состояние
                  // замораживает тело. Схема получает его ЯВНО, а не через внешний
                  // `<fieldset disabled>`: тот глушит кнопки, но не pointer-жесты на div.
                  frozen={techCard?.techCard?.approvalState === 'TECH_CARD_APPROVAL_STATE_RELEASED'}
                  // Адреса операционных снимков: форма возит только media_id, а URL — read-данные.
                  operationMediaUrls={operationMediaUrls}
                  // Несёт ли СОХРАНЁННАЯ карточка снимки: предикат тот же, что у серверного щита, и
                  // от него зависит, показывать ли путь отступления «снять фотографии шагов».
                  storedHasMedia={(techCard?.techCard?.operations ?? []).some(
                    (o) => (o?.media ?? []).length > 0,
                  )}
                  onSave={onSave}
                  saving={saving}
                  applyRequest={skeleton.applyRequest}
                  onSkeletonApplied={skeleton.onSkeletonApplied}
                  skeletonUndoRequest={skeleton.skeletonUndoRequest}
                  onSkeletonUndone={skeleton.onSkeletonUndone}
                  onSkeletonUndoable={skeleton.onSkeletonUndoable}
                  emptyAction={skeleton.emptyAction}
                  headerAction={
                    <>
                      {shapesAffordance(pieceShapes, onGoTab)}
                      {skeleton.headerAction}
                    </>
                  }
                  // ЭСКИЗ В ФУЛСКРИН ЕДЕТ ЭЛЕМЕНТОМ, а не вторым таким же компонентом внутри оверлея:
                  // подписки на `operations`, `callouts` и `technicalMedia` остаются в этом листе, и
                  // обе поверхности читают ОДИН активный пин — тот же `useCrossHighlight`, что у
                  // инлайна. `operations-field.tsx` узел только прокидывает и о содержимом не знает.
                  //
                  // ПЛАТА, КОТОРУЮ ЗДЕСЬ ЗАПЛАТИТЬ НЕЧЕМ: пока фулскрин открыт, инлайновая колонка
                  // остаётся смонтированной под оверлеем, то есть эскиза в дереве два. Про открытость
                  // фулскрина знает `operations-field.tsx` (URL `?fs=1` живёт там), и погасить
                  // колонку отсюда нельзя, не заведя ещё одного писателя этого состояния. Оба
                  // экземпляра ЧИТАЮЩИЕ — расходиться им нечем, кроме выбранной проекции.
                  sketchNote={
                    <ConstructionSketch
                      mediaById={mediaById}
                      activePin={pin.active}
                      onActivePinChange={pin.setActive}
                    />
                  }
                />
                {skeleton.panel}
              </section>
            </div>
          </div>
        </CardUnitPicturesProvider>
      </ActiveStepProvider>
    </div>
  );
}

/** Ширина открытой колонки карты сборки — та же, что до свёртки. */
const ASSEMBLY_COLUMN_W = 320;

/**
 * КОЛОНКА КАРТЫ СБОРКИ — СВОРАЧИВАЕТСЯ, КАК ПАНЕЛЬ CALLOUTS СТУДИИ (T11). Тот же орган
 * (`CalloutsPanel`), только слева и без жеста ширины: свёрнутая — полоска «assembly map · N», где
 * N — швы, которые ещё решать; открытая — прежние 320px (карта, SEAMS, PIECE CODES), шеврон ‹ в
 * шапке карты. Без предпочтения колонка свёрнута. Правая колонка не меняется — только шире.
 *
 * Свёрнутая колонка ПРЯЧЕТСЯ АТРИБУТОМ, а не размонтируется: `SeamsDoor` гидрирует стор решений
 * швов при монтировании, и без него N на полоске не узнать (и граф швов карты, пиктограмм и куклы
 * читает тот же стор). Число неизвестно (нет графа) — полоска пишет одно имя.
 */
function AssemblyColumn({
  techCard,
  frozen,
  shapes,
  sketch,
}: {
  techCard: common_TechCard | undefined;
  frozen: boolean;
  shapes: PieceShapes['shapeByKey'];
  sketch: ReactNode;
}) {
  const { review } = useSeamReview();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panel = useCalloutsPanel({
    count: review ? review.counts.decide : null,
    holdKey: techCard?.id ?? 0,
    panelRef,
    prefsBase: ASSEMBLY_MAP_PREFS_KEY,
    defaultCollapsed: true,
    fixedWidth: ASSEMBLY_COLUMN_W,
  });
  return (
    <CalloutsPanel
      panel={panel}
      tag='amap'
      where='seams to decide'
      side='left'
      label='assembly map'
      resizable={false}
      bare
      openClassName='lg:sticky lg:top-36 lg:w-[var(--cw)] lg:self-start'
      className='w-full space-y-2.5'
    >
      <AssemblyMap
        sketch={sketch}
        action={<PanelCollapseDoor panel={panel} tag='amap' side='left' label='assembly map' />}
      />
      <SeamsDoor techCard={techCard} frozen={frozen} shapes={shapes} />
      <PieceLegend />
    </CalloutsPanel>
  );
}
