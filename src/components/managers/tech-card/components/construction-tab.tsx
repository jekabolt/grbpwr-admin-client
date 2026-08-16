import { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { useWorkshopSettings } from 'components/managers/workshop/useWorkshopSettings';
import { techCardMediaKindOptions } from 'constants/filter';
import { useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { CalloutBox } from 'ui/components/callout-box';
import { Canvas, Pin } from 'ui/components/canvas';
import { Chip, ChipRow } from 'ui/components/chip';
import { Section } from 'ui/components/section';
import { SectionHeader } from 'ui/components/section-header';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import DecimalField from 'ui/form/fields/decimal-field';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import { SEAM_ALLOWANCE_MAX_MM } from 'utils/seam-allowance';
import { ConstructionField } from './construction-field';
import { zoneOptions } from './operation-options';
import { ColorwayArticles, OPERATION_EXPECTED_SECTIONS, OperationsField } from './operations-field';
import { PieceLegend } from './piece-legend';
import { TechCardFormData, wireInt } from './schema';
import { useCrossHighlight } from './useCrossHighlight';
import { usePieceShapes, type PieceShapes } from './use-piece-shapes';

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
type SummaryBom = { lineKey?: string; name?: string; section?: string };

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
// It sits next to `construction.seamAllowances` deliberately: that field is a free-text note («5
// мм») written for the factory, this one is a decimal the readiness gate compares against, and the
// two are exactly the pair an operator would otherwise conflate. On the wire it is a CARD field, not
// part of `construction` — anything added to a section's digest projection instantly marks every
// signed-off CONSTRUCTION approval as «edited since signing», on every card at once.
//
// THREE VALUES, NOT TWO. Empty means «эта карточка не требует конкретного припуска» and the workshop
// default applies; a number OVERRIDES the workshop default; and 0 is a number like any other, saying
// «кроим по линии как нарисована». The readout below spells out which of the three is in force,
// because a blank field next to a configured workshop default otherwise reads as «ничего не задано»
// when in fact a standard IS in force — just not this card's.
function RequiredSeamAllowanceField() {
  const { control } = useFormContext<TechCardFormData>();
  const cardValue = (
    (useWatch({ control, name: 'requiredSeamAllowanceMm' }) ?? '') as string
  ).trim();
  // The workshop singleton, on the shared query key — the раскладка modal reads the same row for its
  // allowance prefill, so this is a cache hit rather than a second fetch on the usual path.
  const { data } = useWorkshopSettings();
  const shopDefault = decimalToInput(data?.settings?.defaultSeamAllowanceMm).trim();

  const verdict = cardValue
    ? `эталон этой карточки: ${cardValue} мм${shopDefault ? ` (цеховой ${shopDefault} мм перебит)` : ''}`
    : shopDefault
      ? `у карточки эталона нет — действует цеховой: ${shopDefault} мм`
      : 'эталона нет ни у карточки, ни у цеха — сравнивать не с чем';

  return (
    <div className='flex flex-col gap-1'>
      <DecimalField
        name='requiredSeamAllowanceMm'
        label='required seam allowance, mm'
        maxDecimals={1}
        placeholder={shopDefault ? `workshop: ${shopDefault}` : 'not set'}
      />
      <Text size='micro' variant='label'>
        {verdict}
      </Text>
      {/* THE ONE THING THAT CANNOT BE SHOWN ANY OTHER WAY: пусто ≠ 0. Пусто = наследуем; 0 = «кроим
          по линии как нарисована». Всё остальное, что здесь стояло абзацем, теперь видно само —
          каскад показан плейсхолдером и вердиктом, а текстового двойника, от которого поле надо
          было отличать, больше нет. */}
      <Text size='micro' variant='label'>
        Пусто = наследуется. 0 — другое: «кроим по линии как нарисована». Чтобы снять требование,
        очистите поле, а не ставьте ноль.
      </Text>
    </div>
  );
}

// СТАНДАРТЫ КАРТОЧКИ — одна полоса вместо блока на каждое число. Требуемый припуск перестал быть
// отдельным Section: он больше не защищается от текстового двойника (тот удалён вместе с разрывом)
// и не объясняет каскад словами (каскад теперь виден плейсхолдером в самом шаге). Осталось одно,
// что показать иначе нельзя, — разница между пустым полем и нулём.
function CardStandards() {
  return (
    <Section title='standards' question='— what every step inherits unless it says otherwise'>
      {/* The narrow column belongs to the ONE number above, not to the block: a single decimal in a
          640px-wide box reads as an unfinished layout. The defaults accordion below it now carries
          the card's equipment park — two lists of tiles and a grid of settings — and capped at
          `max-w-sm` every one of those grids collapsed to a single column with the tiles stacked
          under each other, on a screen with room for four. */}
      <div className='flex flex-col gap-2.5'>
        <div className='sm:max-w-sm'>
          <RequiredSeamAllowanceField />
        </div>
        <ConstructionField />
      </div>
    </Section>
  );
}

// Summary lead (config pick: Summary B) — the at-a-glance overview the tab lacked: how many
// operations, total SAM (feeds costing), how many assembly zones are tagged, and how many steps
// still have no place on the sketch. Sits above the assembly workspace.
//
// The SAM → money line underneath connects the minutes to the only rate the card actually holds:
// costing.cmt_cost is a per-GARMENT CMT figure, so the derived number is the implied €/min rather
// than a stored rate. Read-only, and rendered only when that cost exists (it is nulled on read for
// an account without costing:read, so this line simply does not appear for them).
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
  const unpinned = operations.filter((o) => !(o.calloutNumber && o.calloutNumber > 0)).length;

  // Completeness in the other direction: which materials the card BUYS but no step CONSUMES. The
  // per-step checks catch a step missing its material; this catches a material missing its step —
  // фурнитура that gets costed, ordered and issued to the floor with nothing telling anyone where
  // it goes. Labels are excluded (they ride tech_card_label / the assembly bill), which is what
  // OPERATION_EXPECTED_SECTIONS encodes.
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as SummaryBom[];
  const attachedKeys = new Set(operations.flatMap((o) => o.bomLineKeys ?? []));
  const unattached = bomItems.filter((b) => {
    if (!OPERATION_EXPECTED_SECTIONS.has(b.section ?? '')) return false;
    const key = b.lineKey?.trim();
    // A line with no key yet (just added, not saved) is by definition on no step.
    return !key || !attachedKeys.has(key);
  });

  // ПРИШИВ ЭТИКЕТОК — РАБОТА, КОТОРОЙ НЕТ В МАРШРУТЕ.
  //
  // Строки секции «этикетки» намеренно исключены из проверки выше: этикетка попадает на изделие
  // через `tech_card_label` и сборочную ведомость, поэтому строка без операции — норма, а не
  // пропуск. Верно для СТРОКИ, но не для КАРТОЧКИ: кто-то этикетку пришивает, это занимает время,
  // и если такого шага нет ни одного, его минуты не попадают ни в маршрут для цеха, ни в SAM —
  // себестоимость занижена ровно на этот труд.
  //
  // Проверка КАРТОЧНАЯ, а не построчная, именно поэтому: одна фраза о пропущенной работе читается,
  // а список «эта этикетка не на шаге, и эта, и эта» — то самое обучение игнорировать проверки,
  // от которого исключение и защищало.
  const labels = (useWatch({ control, name: 'labels' }) ?? []) as Array<{
    content?: string;
    placement?: string;
    attachment?: string;
    size?: string;
    note?: string;
  }>;
  // Заполненная этикетка, а не пустая строка на дефолтном типе — тот же предикат, что у чек-листа.
  const usedLabels = labels.filter((l) =>
    [l.content, l.placement, l.attachment, l.size, l.note].some((v) => !!v?.trim()),
  ).length;
  const labelsOnSomeStep = bomItems.some(
    (b) =>
      (b.section ?? '') === 'TECH_CARD_BOM_SECTION_LABEL' &&
      !!b.lineKey?.trim() &&
      attachedKeys.has(b.lineKey.trim()),
  );
  const labelsOffRoute = opCount > 0 && usedLabels > 0 && !labelsOnSomeStep;

  // The SAM → money readout (implied ₽/min from cmt_cost) moved to the costing tab's labour band
  // (Phase 3, plan 11): money reads next to the CMT input it derives from, minutes stay here.
  return (
    <div>
      <StatGrid min={130}>
        <Stat label='operations' value={opCount} />
        {/* One number, and the rail below sums the same column. The sub used to explain which of
            two time fields won, because there were two; there is one. */}
        <Stat label='total SMV' value={`${totalSam.toFixed(1)} min`} sub='feeds costing' />
        <Stat label='zones covered' value={`${zonesCovered} / ${TOTAL_CONSTRUCTION_ZONES}`} />
        <Stat
          label='unpinned ops'
          value={unpinned}
          sub='no sketch pin'
          tone={unpinned > 0 ? 'down' : 'default'}
        />
        <Stat
          label='off-step materials'
          value={unattached.length}
          sub='not consumed by any step'
          tone={unattached.length > 0 ? 'down' : 'default'}
        />
      </StatGrid>
      {/* Named, not merely counted: «3 материала вне шагов» sends the operator hunting through the
          BOM, and the point of the check is that they already know which zip they forgot.
          Suppressed while the card has NO operations at all — there every material is trivially
          off-step, so the callout would greet every new card with a list of its own BOM. */}
      {opCount > 0 && unattached.length > 0 && (
        <CalloutBox tone='note' className='mt-2.5'>
          <Text size='micro'>
            не привязаны ни к одной операции:{' '}
            {unattached.map((b) => b.name?.trim() || 'unnamed').join(' · ')}
          </Text>
        </CalloutBox>
      )}
      {labelsOffRoute && (
        <CalloutBox tone='note' className='mt-2.5'>
          <Text size='micro'>
            этикеток задано {usedLabels}, но ни один шаг их не пришивает — этой работы нет ни в
            маршруте для цеха, ни в SAM. Заведите шаг, который их ставит, и свяжите с ним строку
            этикетки из BOM.
          </Text>
        </CalloutBox>
      )}
    </div>
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
            нет тех. эскиза
          </Text>
        </Canvas>
        <Text size='micro' variant='label'>
          добавьте технический эскиз на вкладке sketch и расставьте на нём пины — здесь он покажется
          рядом с операциями
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
                used ? '' : ' · не привязан к операции'
              }`}
              onMouseEnter={() => num > 0 && onActivePinChange(num)}
              onMouseLeave={() => onActivePinChange(null)}
            />
          );
        })}
      </div>

      <Text size='micro' variant='label'>
        наведите на операцию — её пин подсветится (и наоборот)
      </Text>
    </div>
  );
}

// ПРИГЛАШЕНИЕ РАЗОБРАТЬ ВЫКРОЙКИ — единственная реакция вкладки на наличие DXF, одна микро-строка
// в шапке блока операций.
//
// Возвращает `undefined`, а не пустой узел, там, где сказать нечего, и это обязательно: карточка
// БЕЗ выкроек не должна узнать, что силуэты вообще бывают (ни ссылки, ни плейсхолдера, ни пустого
// бокса — выглядит ровно как вчера), а карточка, у которой контуры уже нарисованы, не нуждается в
// приглашении нажать то, что и так видно. Молчание — только в этих двух случаях: разобранная
// пачка, не давшая ни одного контура, и упавший разбор говорят о себе сами.
//
// Ошибка говорится ОДИН раз и не превращается в повтор: useDxfGeometry заведён с `retry: false`,
// потому что недоступный CDN — это ответ, а не повод скачать всё второй раз.
function shapesAffordance(shapes: PieceShapes): React.ReactNode | undefined {
  if (!shapes.hasDxf) return undefined;
  // РАЗБОР ЕСТЬ, А КОНТУРОВ НЕТ — это ответ, и он обязан прозвучать. Иначе экран выглядит
  // поломкой: мегабайты скачались, а детали остались теми же именами. Причина всегда одна и
  // чинится не здесь — деталь кроя не связана с блоком чертежа, — поэтому строка называет
  // вкладку, на которой это делают.
  if (shapes.shapeByKey) {
    return shapes.foundCount === 0 ? (
      <Text size='micro' variant='label' component='span'>
        детали не сопоставлены с блоками выкроек — вкладка PATTERNS
      </Text>
    ) : undefined;
  }
  if (shapes.error) {
    return (
      <Text size='micro' variant='error' component='span' title={shapes.error.message}>
        выкройки не разобрались
      </Text>
    );
  }
  if (shapes.isLoading) {
    return (
      <Text size='micro' variant='label' component='span'>
        разбираю выкройки…
      </Text>
    );
  }
  // Кнопки «показать силуэты» здесь больше НЕТ. Силуэт — не украшение и не опция: сборку
  // размечают по формам деталей, и экран, спрашивающий разрешения показать то, ради чего на него
  // пришли, перекладывает на человека решение, которого у него нет данных принять. Цена честная и
  // остаётся: пачка DXF скачивается и разбирается при открытии вкладки. Запрос один на карточку
  // (React Query кэширует пачку между вкладками), `retry: false` не даёт недоступному CDN
  // превратиться в повтор, а состояния разбора остаются здесь же строкой.
  return undefined;
}

// Construction workspace: the sketch (assembly map) on the left, the general finishing defaults
// and the ordered operations on the right — so a step and its place on the drawing are visible
// together, without switching tabs. Colourway / material selection lives on the colorways tab;
// this tab is about HOW the garment goes together, not which fabric or colour.
export function ConstructionTab({
  techCard,
  active = false,
}: {
  techCard?: common_TechCard;
  /** Вкладка открыта. Вкладки смонтированы все сразу — без этого разбор заказывался бы всегда. */
  active?: boolean;
}) {
  // Deliberately NOT watching `operations` here. The summary and the sketch each hold their own
  // subscription, so a keystroke in the assembly editor re-renders those two leaves instead of
  // this whole workspace (and with it every row of the sequence rail).

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
  const colorwayArticles = useMemo<ColorwayArticles>(() => {
    // EVERY id here goes through wireInt. material_id and id are int64 in techcard.proto, and
    // grpc-gateway serialises int64 as a STRING while the generated TS type claims `number` — so
    // an unnormalised Map keyed by the raw value type-checks and then misses on every lookup
    // (schema.ts:846 documents the same trap on the form side). The slot default already arrives
    // wireInt'd through mapBomItemToForm, so without this the two sides are different runtime
    // types and a colourway inheriting the default would read as diverging from one that pins it.
    const materialNameById = new Map<number, string>();
    for (const material of materialsData?.materials ?? []) {
      const id = wireInt(material.id);
      if (id > 0) materialNameById.set(id, material.name?.trim() || `#${id}`);
    }
    // Legacy usages carry no bom_line_key, only the resolved bom_item_id. Both come from the same
    // read payload, so mapping id → line_key here is exact — unlike guessing by position, which is
    // the bug 0200's read path was written to avoid.
    const lineKeyByBomId = new Map<number, string>();
    for (const line of techCard?.techCard?.bomItems ?? []) {
      const id = wireInt(line.id);
      const key = line.lineKey?.trim();
      if (id > 0 && key) lineKeyByBomId.set(id, key);
    }
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
  }, [techCard?.colorways, techCard?.techCard?.bomItems, materialsData?.materials]);

  // The assembly map pins onto the technical sketches (callouts live there).
  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const rm of techCard?.resolvedTechnicalMedia ?? []) {
      if (rm.media?.id != null) m.set(rm.media.id, rm.media);
    }
    return m;
  }, [techCard?.resolvedTechnicalMedia]);

  return (
    <div className='flex flex-col gap-3.5'>
      <ConstructionSummary />

      {/* The sketch is a reference, not the work: a fixed 320px column reads it fine and leaves the
          assembly sequence the rest of the screen. At 2/5 the drawing was 640px wide on a 1600px
          display with ~3000px of empty ground under it, while the operations were squeezed. */}
      <div className='flex flex-col gap-3.5 lg:flex-row lg:items-start'>
        <div className='w-full space-y-2.5 lg:sticky lg:top-36 lg:w-[320px] lg:shrink-0'>
          <section className='border border-borderColor bg-bgColor p-4'>
            <SectionHeader
              title='sketch — assembly map'
              question='— hovering an operation lights its pin, and the other way round'
            />
            <ConstructionSketch
              mediaById={mediaById}
              activePin={pin.active}
              onActivePinChange={pin.setActive}
            />
          </section>
          <PieceLegend />
        </div>

        <div className='flex w-full min-w-0 flex-col gap-2.5 lg:flex-1'>
          <CardStandards />
          <section className='border border-borderColor bg-bgColor p-4'>
            <SectionHeader
              title='operations — assembly order'
              question='— what each step does, where, on which pieces, and how long it takes'
              action={shapesAffordance(pieceShapes)}
            />
            <OperationsField
              activePin={pin.active}
              onActivePinChange={pin.setActive}
              activeBom={bom.active}
              onActiveBomChange={bom.setActive}
              colorwayArticles={colorwayArticles}
              pieceShapes={pieceShapes.shapeByKey}
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
            />
          </section>
        </div>
      </div>
    </div>
  );
}
