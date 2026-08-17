import {
  common_ProductionLayCheck,
  common_ProductionRunLay,
  common_ProductionRunLayQtyEntry,
  common_ProductionRunLaySection,
  googletype_Decimal,
} from 'api/proto-http/admin';
import { Fragment } from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import {
  ClothReport,
  FROZEN_FACT_NOTE,
  clothRefusalText,
  fmtDeltaPct,
  fmtQty,
  normBasisText,
  normRefusalText,
} from '../utils/cloth-per-unit';
import {
  LAY_ACTUAL_METHOD_LABEL,
  MATERIAL_UNIT_LABEL,
  allLayChecks,
  VERDICT_GLYPH,
  VERDICT_PILL,
  VERDICT_TEXT,
  VERDICT_WORD,
  layActualQty,
  layLotState,
  layVerdict,
  stampWhen,
  worstVerdict,
} from './useLays';

// Переэкспорт для соседей, которые импортировали отметку отсюда: определение переехало в useLays,
// чтобы её мог читать и склад, не утаскивая к себе карточку настила.
export { stampWhen };

export const LAY_MODE_LABEL: Record<string, string> = {
  PRODUCTION_LAY_MODE_FACE_UP: 'face up',
  PRODUCTION_LAY_MODE_FACE_TO_FACE: 'face to face',
  PRODUCTION_LAY_MODE_UNSPECIFIED: 'mode not set',
};

// Сантиметры проводом, метры на экране: цех считает настил в метрах ткани, а хранится он в см,
// потому что маркер измеряется в см. '' (а не '0') на отсутствующем значении — «—» рисует
// вызывающий, чтобы пустое не читалось как ноль.
export function cmToM(d?: googletype_Decimal): string {
  const n = Number(d?.value);
  if (!d?.value || !Number.isFinite(n)) return '';
  return (n / 100).toFixed(2);
}

function cmValue(d?: googletype_Decimal): number | null {
  const n = Number(d?.value);
  return d?.value && Number.isFinite(n) ? n : null;
}

// Один настил в режиме ЧТЕНИЯ. Состояния не держит вовсе: раскрытие дифа количеств — нативный
// <details>, а не useState, поэтому карточка остаётся чистой функцией от настила. Всё, что она
// умеет менять, она просит сделать родителя (onEdit / onDelete / onReaffirm).
//
// И это НЕ белый блок: карточка живёт внутри секции «шаг 3», а блок в блоке запрещён. Структура —
// GroupLabel + Row, то есть ruled weights, ровно как велит DESIGN.md.
export function LayCard({
  lay,
  index,
  colorwayLabel,
  sizeLabel,
  canEdit,
  onEdit,
  onDelete,
  onReaffirm,
  reaffirming,
  onPlotter,
  plottingKey,
  cloth,
}: {
  lay: common_ProductionRunLay;
  index: number;
  colorwayLabel: (colorwayId: number) => string;
  sizeLabel: (sizeId: number) => string;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReaffirm: () => void;
  reaffirming: boolean;
  /** Выпустить плоттерный файл секции. Отсутствует ⇒ кнопки нет (просмотр без права выпускать). */
  onPlotter?: (section: common_ProductionRunLaySection, key: string) => void;
  /** Ключ секции, которая сейчас готовится. Блокирует ТУ ЖЕ кнопку, а не все сразу. */
  plottingKey?: string;
  /**
   * Ткань на изделие (Ф4): факт полотна против выкроенного/принятого этого настила, посчитанный
   * РОДИТЕЛЕМ через utils/cloth-per-unit (та же арифметика, что в блоке приёмки кроя — двух копий
   * формулы не существует). undefined = строки приёмки ещё читаются: карточка молчит, а не
   * отказывает — отказ «кроя нет» на недогруженном списке был бы ложью.
   */
  cloth?: ClothReport;
}) {
  const checks = lay.checks ?? [];
  const sections = lay.sections ?? [];
  // ВЕРДИКТ СЧИТАЕТСЯ ПО ВСЕМ ОДИННАДЦАТИ проверкам, а не по семи настиловым: четыре маркерные
  // (`lay_marker_scope`, `lay_marker_width`, `lay_lot_width`, `lay_mirror_expansion`) приезжают в
  // секциях. Пока их не складывали, настил с маркером ШИРЕ РУЛОНА — то есть тот, который не
  // выкроится ни в один проход, — носил зелёный пилл «годен».
  const verdict = worstVerdict(allLayChecks(lay));
  const stale = lay.quantitiesStale === true;

  const totalPlies = lay.totalPlies ?? 0;
  const clothLen = cmToM(lay.clothLengthCm);
  const endLoss = cmToM(lay.endLossTotalCm);
  const planned = cmToM(lay.plannedLengthCm);

  const title = [
    colorwayLabel(lay.colorwayId ?? 0),
    lay.bomItemName || 'slot not named',
    lay.materialName || '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className='flex flex-col'>
      <GroupLabel
        flush={index === 0}
        action={
          <div className='flex flex-wrap items-center gap-1.5'>
            {/* Бейдж устаревания ЗАМЕЩАЕТ статусный пилл, а не встаёт рядом — тот же приём, что у
                подписей тех-карты (signoffs-field.tsx:126-137). «Годен» рядом с «количества
                изменились» были бы двумя ответами на один вопрос, и оператор поверил бы первому.
                Тон attention: в словаре тонов (ui/components/pill.tsx:5-13) именно он и значит
                «changed, stale». */}
            {stale ? (
              <Pill tone='attention'>quantities changed</Pill>
            ) : (
              <Pill tone={VERDICT_PILL[verdict]}>{VERDICT_WORD[verdict]}</Pill>
            )}
            {canEdit ? (
              <>
                <Button type='button' variant='secondary' size='xs' onClick={onEdit}>
                  edit
                </Button>
                <Button
                  type='button'
                  variant='secondary'
                  size='xs'
                  aria-label={`delete lay ${lay.name || title}`}
                  onClick={onDelete}
                >
                  ✕
                </Button>
              </>
            ) : null}
          </div>
        }
      >
        {title}
        {lay.name ? ` — ${lay.name}` : ''}
      </GroupLabel>

      {/* Незаданные концевые потери печатаются как «—», а НЕ как «0 см»: ноль здесь означал бы
          «потерь нет», то есть занижение потребности, выданное за измерение. */}
      <Row
        label={`${LAY_MODE_LABEL[lay.mode ?? ''] ?? 'mode not set'} · end losses ${
          cmValue(lay.endLossCm) ?? '—'
        } cm per ply end`}
        value={`${sections.length} sect. · ${totalPlies} plies`}
      />
      <Row
        label='fabric + end losses = lay plan'
        value={
          planned
            ? `${clothLen || '—'} + ${endLoss || '—'} = ${planned} m`
            : '— will be recomputed on the server'
        }
      />
      <StackHeightRow lay={lay} checks={checks} />
      <LotAndFactRows lay={lay} cloth={cloth} sizeLabel={sizeLabel} />

      {/* ПЛОТТЕР — НА СЕКЦИЮ, А НЕ НА НАСТИЛ. Три секции это три РАЗНЫЕ раскладки, которые режут по
          очереди своими проходами; один файл «на настил» пришлось бы либо склеить из трёх (такой
          геометрии не существует), либо молча выбрать одну — и раскройщик получил бы файл, режущий
          не то, что он настелил. */}
      {sections.map((s, i) => {
        const key = s.sectionKey || `${s.markerId}-${i}`;
        return (
          <Fragment key={key}>
            <Row
              tone='label'
              label={`${i + 1}. ${s.markerName || `marker #${s.markerId ?? 0}`}`}
              value={
                <span className='inline-flex items-center gap-2'>
                  <span className='tabular-nums'>
                    {s.plies ?? 0} plies · {cmValue(s.sectionLengthCm) ?? '—'} cm
                  </span>
                  {onPlotter && (s.markerId ?? 0) > 0 && (
                    <Button
                      type='button'
                      variant='underline'
                      size='xs'
                      disabled={plottingKey === key}
                      title='DXF for the cutting plotter: contours, selvedge and the HEADER (run, colour, article, plies, composition, length). WITHOUT the seam line and notches — those are restored from the patterns, and there are no patterns on the run page'
                      onClick={() => onPlotter(s, key)}
                    >
                      {plottingKey === key ? 'preparing…' : 'plotter'}
                    </Button>
                  )}
                </span>
              }
            />
            {/* МАРКЕРНЫЕ проверки стоят ПОД СВОЕЙ секцией, а не в общем списке внизу: они говорят
                про ЭТУ раскладку («шире рулона», «чужой маркер»), и в общем списке из трёх секций
                оператору пришлось бы угадывать, к какой из них относится каждая. */}
            {(s.checks ?? []).map((c, j) => (
              <CheckLine key={c.key || j} check={c} indent />
            ))}
          </Fragment>
        );
      })}

      {/* «Проверки не приехали» — про ВЕСЬ настил, поэтому спрашивается по обоим местам: секционные
          находки уже нарисованы выше, и говорить «вердикта нет», когда четыре из них на экране,
          значило бы спорить с собственной страницей. */}
      <div className='mt-1 flex flex-col'>
        {allLayChecks(lay).length === 0 ? (
          <Text size='micro' variant='label'>
            ? the fitness checks didn't arrive — there is no verdict on this lay
          </Text>
        ) : (
          checks.map((c, i) => <CheckLine key={c.key || i} check={c} />)
        )}
      </div>

      {stale ? (
        <StaleDisclosure
          lay={lay}
          sizeLabel={sizeLabel}
          canEdit={canEdit}
          onEdit={onEdit}
          onReaffirm={onReaffirm}
          reaffirming={reaffirming}
        />
      ) : null}
    </div>
  );
}

// Высота стопки — трёхзначна, как и всё остальное (§11).
//
// Сервер НЕ отдаёт stack_height_cm вовсе, когда толщина ткани на артикуле не задана: «нет толщины
// — нет проверки, не догадка». Поэтому отсутствие числа рисуется словами «не считается» вместе с
// причиной из чека, и ни при каких условиях не как «0 см» — «0 см из 15» означало бы «влезает».
function StackHeightRow({
  lay,
  checks,
}: {
  lay: common_ProductionRunLay;
  checks: common_ProductionLayCheck[];
}) {
  const check = checks.find((c) => c.key === 'lay_stack_height');
  const verdict = check ? layVerdict(check.status) : 'unknown';
  const height = cmValue(lay.stackHeightCm);

  if (height == null || verdict === 'unknown') {
    return (
      <Row
        tone='label'
        label='stack height'
        value={`${VERDICT_GLYPH.unknown} not computed`}
        className={VERDICT_TEXT.unknown}
      />
    );
  }
  return (
    <Row
      label='stack height'
      value={`${VERDICT_GLYPH[verdict]} ${height} cm`}
      className={VERDICT_TEXT[verdict]}
    />
  );
}

// ЛОТ И ФАКТ РАСХОДА — то, что знает ЦЕХ, а не планировщик (Ф5б.1 / Ф5б.2).
//
// Пока цех не отчитался, обе строки схлопываются в ОДНУ приглушённую: два пустых поля подряд
// («рулон не назван», «факт не введён») занимали бы половину карточки, ничего при этом не сообщая.
// Как только появляется хоть одна половина, поля разъезжаются и каждое отвечает за себя.
function LotAndFactRows({
  lay,
  cloth,
  sizeLabel,
}: {
  lay: common_ProductionRunLay;
  cloth?: ClothReport;
  sizeLabel: (sizeId: number) => string;
}) {
  const lot = layLotState(lay);
  const raw = layActualQty(lay);
  const hasFact = raw !== '';
  // DECIMAL(12,3) приезжает как «12.400»; хвостовые нули — артефакт колонки, а не точность замера.
  // Значение при этом НЕ округляется: убираются только нули, которых человек не вводил.
  const qty = hasFact ? String(Number(raw)) : '';

  if (lot === 'none' && !hasFact) {
    return (
      <>
        <Row
          tone='label'
          label='roll and actual consumption'
          value="the workshop hasn't reported yet"
        />
        {/* Даже под схлопнутой строкой «на изделие» обязано сказать про необратимость: на закрытой
            партии невнесённый замер не внести уже никогда, и молчание здесь заставило бы оператора
            искать кнопку, которой нет. На открытой партии ClothRows молчит сам (см. его гейт). */}
        <ClothRows cloth={cloth} sizeLabel={sizeLabel} />
      </>
    );
  }

  // UNKNOWN — это «единицу не распознали», а не «единицы нет»: число с нераспознанной единицей всё
  // равно показывается, но названо словами, потому что сложить его пока не с чем.
  const unit =
    lay.actualUom && lay.actualUom !== 'MATERIAL_UNIT_UNKNOWN'
      ? MATERIAL_UNIT_LABEL[lay.actualUom]
      : '';
  const method =
    lay.actualMethod && lay.actualMethod !== 'PRODUCTION_LAY_ACTUAL_METHOD_UNSPECIFIED'
      ? LAY_ACTUAL_METHOD_LABEL[lay.actualMethod]
      : '';
  const when = stampWhen(lay.actualAt);

  return (
    <>
      {/* ТРИ состояния лота, и второе — не разновидность первого. «Удалён из справочника» это
          история: снимок кода на настиле NOT NULL ровно затем, чтобы настил мог НАЗВАТЬ пропавший
          рулон. Незаполненное поле выглядит серым, названный рулон — обычным текстом, а причина
          отрыва идёт приглушённой припиской, чтобы не спорить с самим кодом. */}
      <Row
        label='roll'
        tone={lot === 'none' ? 'label' : undefined}
        value={
          lot === 'named' ? (
            lay.lotCode || `#${lay.lotId}`
          ) : lot === 'detached' ? (
            <span>
              {lay.lotCode}{' '}
              <span className='text-labelColor'>· deleted from the stock directory</span>
            </span>
          ) : (
            'not named'
          )
        }
      />

      <Row
        label={hasFact && method ? `actual consumption · ${method}` : 'actual consumption'}
        tone={hasFact ? undefined : 'label'}
        value={
          !hasFact ? (
            'not entered'
          ) : unit ? (
            `${qty} ${unit}`
          ) : (
            <span>
              {qty} <span className='text-labelColor'>· unit not recognized</span>
            </span>
          )
        }
      />

      {/* КТО И КОГДА назвал число — это то, что делает факт фактом. Сервер штампует обе половины
          сам и НЕ обновляет их, когда сохранение лишь повторило прежний замер, поэтому подпись
          принадлежит замерщику, а не последнему, кто открыл форму. */}
      {hasFact ? (
        <Row
          tone='label'
          label='measurement'
          value={`${lay.actualBy || 'author not recorded'}${when ? ` · ${when}` : ''}`}
        />
      ) : null}

      {/* ДРЕЙФ рисуется ТОЛЬКО при наличии факта: без факта его пустота уже объяснена строкой выше,
          и «нечего сравнить» под «факт не введён» было бы вторым ответом на тот же вопрос. А ВОТ
          при наличии факта пустой дрейф — самостоятельная новость: сравнить не с чем, потому что
          нет плана или единицы несводимы, и это НЕ «сошлось, 0%». */}
      {hasFact ? <DriftRow drift={lay.actualDriftPercent} /> : null}

      {/* ТКАНЬ НА ИЗДЕЛИЕ (Ф4) — буквально следующая строка того же рассказа: рулон → факт →
          дрейф к плану настила → во что этот факт обошёлся НА ИЗДЕЛИЕ. */}
      <ClothRows cloth={cloth} sizeLabel={sizeLabel} />
    </>
  );
}

// ТКАНЬ НА ИЗДЕЛИЕ. Это НЕ ПЕРЕСКАЗ ДРЕЙФА: DriftRow выше — факт против ГЕОМЕТРИЧЕСКОГО плана
// НАСТИЛА (владелец — сервер, actualDriftPercent); здесь другая пара чисел — факт НА ИЗДЕЛИЕ
// против выкроенного/принятого и НОРМЫ на изделие из рецептуры. Оба процента законны одновременно
// и потому подписаны разными словами: «дрейф к плану настила» и «к норме на изделие».
//
// Каждый отказ называет СЕБЯ, и ни один не подставляет ноль; арифметика и слова — из
// utils/cloth-per-unit, общие с блоком приёмки кроя.
function ClothRows({
  cloth,
  sizeLabel,
}: {
  cloth?: ClothReport;
  sizeLabel: (sizeId: number) => string;
}) {
  if (!cloth) return null; // строки приёмки ещё читаются — молчим, а не отказываем
  const { perUnit, norm } = cloth;

  if (!perUnit.ok) {
    const r = perUnit.refusal;
    if (r.kind === 'no-fact') {
      // На открытой партии строка «факт расхода — не введён» выше уже ответила, и вторая строка
      // была бы вторым ответом на тот же вопрос (тот же принцип, что у DriftRow). А вот
      // НЕОБРАТИМОСТЬ — новость, которой больше негде прозвучать.
      if (!r.frozen) return null;
      return (
        <>
          <Row
            tone='label'
            label='per garment'
            value="there is no measurement — it won't be computed anymore"
          />
          <Text size='nano' variant='label'>
            {FROZEN_FACT_NOTE}
          </Text>
        </>
      );
    }
    if (r.kind === 'no-receipts') {
      return (
        <>
          <Row tone='label' label='per garment' value='the cutting is not reported' />
          <Text size='nano' variant='label'>
            the cut receipt is in the block below; an empty cell there means “not counted”, not
            zero, so there is nothing to divide by yet.
          </Text>
        </>
      );
    }
    if (r.kind === 'zero-cut') {
      return (
        <>
          <Row className='text-error' label='per garment — 0 cut' value="doesn't divide" />
          {/* «Посчитанный ноль» не утверждается: cut_qty NOT NULL, пустое поле формы уезжает нулём,
              и сохранённая строка не различает «посчитали, вышло 0» и «не заполнили». */}
          <Text size='nano' variant='label'>
            the cloth is spent, no garments are recorded; the zero may not have been entered at all
            — the saved row doesn't distinguish a counted zero from an unfilled field
          </Text>
        </>
      );
    }
    // mixed-units в карточке ОДНОГО настила недостижим (у замера одна единица) — защита на случай
    // будущего вызова с несколькими настилами.
    return <Row tone='label' label={`per garment — ${clothRefusalText(r)}`} value='not computed' />;
  }

  const u = perUnit.unitLabel;
  return (
    <>
      <Row
        label={`per garment · cutting${perUnit.mixed ? ' — average over the lay composition' : ''}`}
        value={`${fmtQty(perUnit.perCut)} ${u}/garment`}
      />
      {perUnit.missingSizes.length > 0 ? (
        // Направление ошибки называется вместе с числом: неполный знаменатель ЗАВЫШАЕТ «на
        // изделие», и оператор обязан знать, куда число поедет при дозаполнении.
        <Text size='nano' className='text-warning'>
          the receipt does not cover all sizes of the lay (missing:{' '}
          {perUnit.missingSizes.map(sizeLabel).join(', ')}) — the denominator is understated, “per
          garment” is overstated and will go down as the entry is filled in
        </Text>
      ) : null}
      <Row
        label='per garment · good'
        // «Принято 0» НЕ ГОВОРИТ «годных нет», и утверждать это нельзя: колонка accepted_qty —
        // NOT NULL DEFAULT 0, а сохранённая строка с незаполненной приёмкой возвращается нулём,
        // неотличимым от посчитанного нуля (различие «пусто ≠ ноль» живёт только на НЕсохранённом
        // черновике). Данные двух этих состояний не различают — значит и экран не должен.
        className={perUnit.perAccepted == null ? 'text-error' : undefined}
        value={
          perUnit.perAccepted == null
            ? "0 accepted — either there are no good ones or the receipt into sewing isn't filled in"
            : `${fmtQty(perUnit.perAccepted)} ${u}/garment`
        }
      />
      {/* «Принято больше выкроенного» — невозможное состояние данных: принять в пошив больше, чем
          выкроили, нельзя. Его не красит НИКАКАЯ другая строка (цепочка чисел в приёмке отмечает
          только принято < выкроено), поэтому аномалия называется здесь, рядом со своим числом. */}
      {perUnit.acceptedOverCut ? (
        <Text size='nano' className='text-error'>
          {perUnit.acceptedTotal} accepted against {perUnit.cutTotal} cut — that doesn't happen:
          one of the numbers is lying, check the receipt rows
        </Text>
      ) : null}
      {perUnit.scrapPerGood != null ? (
        <Row
          className='text-error'
          label='the price of cutting scrap in fabric'
          value={`+${fmtQty(perUnit.scrapPerGood)} ${u} per good one`}
        />
      ) : null}
      {/* «Принято меньше выкроенного» имеет ДВЕ причины, и данные их не различают: брак кроя и
          незаполненная приёмка (accepted_qty — NOT NULL DEFAULT 0). Признак считается по ОТДЕЛЬНЫМ
          строкам (настил + размер), а не по сумме на размер — сумма прятала бы незаполненную
          строку за принятыми соседнего настила. Настил здесь один (карточка и есть он), поэтому
          называются только размеры; таблица пар называет и настил. Полностью нулевую приёмку
          (perAccepted == null) уже объяснила строка «годное» — второй раз не говорим. */}
      {perUnit.acceptedZeroRows.length > 0 && perUnit.perAccepted != null ? (
        <Text size='nano' className='text-warning'>
          sizes {perUnit.acceptedZeroRows.map((z) => sizeLabel(z.sizeId)).join(', ')} have exactly 0
          accepted — if the receipt into sewing was simply not filled in there, the good count is
          understated and the “price of scrap” is overstated
        </Text>
      ) : null}
      <NormRow norm={norm} sizeLabel={sizeLabel} />
    </>
  );
}

// Сравнение с нормой. Норма гроссится процентом раскроя слота ТОЛЬКО для источников без отходов
// внутри (manual/dxf) — правило костинга (wastageApplies); cutting_coefficient не применяется
// нигде на пути настилов (см. шапку utils/cloth-per-unit).
function NormRow({
  norm,
  sizeLabel,
}: {
  norm: ClothReport['norm'];
  sizeLabel: (sizeId: number) => string;
}) {
  if (!norm) return null; // карточка ещё читается — молчим, а не отказываем
  if (!norm.ok) {
    return (
      <>
        <Row
          tone='label'
          label={`against the norm per garment — ${normRefusalText(norm.refusal, sizeLabel)}`}
          value='? not computed'
        />
        {/* И отказ обязан говорить, в ЧЬЕЙ рецептуре искали: «нормы нет» в ревизии прогона —
            не то же, что в живой карточке. Молчит только 'card-failed' — там неизвестно, какая
            карточка вообще была бы. */}
        {norm.basis ? (
          <Text
            size='nano'
            className={
              norm.basis.kind === 'live-broken-snapshot' ? 'text-warning' : 'text-labelColor'
            }
          >
            {normBasisText(norm.basis)}
          </Text>
        ) : null}
      </>
    );
  }
  const d = fmtDeltaPct(norm.deltaPct);
  return (
    <>
      <Row
        label='against the norm per garment'
        value={`norm ${fmtQty(norm.normPerUnit)} ${norm.unitLabel}/garment · ${d.text}`}
        // Красный — потому что расход выше нормы это ПОТЕРЯ; минус зелёным не красится по той же
        // причине, что у дрейфа: «меньше нормы» — повод спросить, всё ли отчитано.
        className={d.over ? 'text-error' : undefined}
      />
      {/* При смешанном источнике (partlyGrossed) подпись обязана говорить, что процент начислен
          ТОЛЬКО на слагаемые без отходов внутри: «по раскладке + руками · догроссена процентом»
          читалось бы как (0.6 + 0.4) × 1.1, тогда как посчитано 0.6 + 0.4 × 1.1. */}
      <Text size='nano' variant='label'>
        norm {norm.sourceLabel}
        {norm.grossed
          ? norm.partlyGrossed
            ? ` · the slot wastage percent ${fmtQty(norm.wastagePct ?? 0)}% is charged only on the part without waste inside, “by the marker” is taken as is`
            : ` · grossed up by the slot wastage percent ${fmtQty(norm.wastagePct ?? 0)}%`
          : ' · the cutting waste is already inside the norm'}
        {norm.weighted ? ' · weighted by the cut composition' : ''}
      </Text>
      {/* С ЧЕМ сравнивали (Ф: ревизия прогона / живая карточка). Отдельной строкой и с тревожным
          тоном на нечитаемом снапшоте: молчаливый фолбэк на живую карту выдавал бы её за
          замороженную ревизию — ровно то, от чего print-page защищается тем же третьим
          состоянием. */}
      <Text
        size='nano'
        className={norm.basis.kind === 'live-broken-snapshot' ? 'text-warning' : 'text-labelColor'}
      >
        {normBasisText(norm.basis)}
      </Text>
    </>
  );
}

// Дрейф = факт / план настила − 1, в процентах, СО ЗНАКОМ.
//
// Плюс — ушло БОЛЬШЕ плана, то есть перерасход, и он красный: красный в этой системе значит потерю.
// Минус зелёным не красится: «ушло меньше геометрии» — это не победа, а повод спросить, весь ли
// настил настелили и тем ли мерили.
//
// Классификация делается по УЖЕ ОКРУГЛЁННОМУ числу, иначе дрейф 0.04% печатался бы как «+0.0%
// перерасход» — знак без величины, то есть тревога ни о чём.
function DriftRow({ drift }: { drift?: googletype_Decimal }) {
  const raw = Number(drift?.value);
  if (!drift?.value || !Number.isFinite(raw)) {
    return (
      <Row
        tone='label'
        label='drift against the lay plan — there is nothing to compare with: either there is no lay plan or the unit of the actual does not reduce to it'
        value={`${VERDICT_GLYPH.unknown} not computed`}
        className={VERDICT_TEXT.unknown}
      />
    );
  }
  const shown = Number(raw.toFixed(1));
  const sign = shown > 0 ? '+' : shown < 0 ? '−' : '';
  const word = shown > 0 ? 'overrun' : shown < 0 ? 'under the plan' : 'matched';
  return (
    <Row
      label='drift against the lay plan'
      value={`${sign}${Math.abs(shown).toFixed(1)}% ${word}`}
      // Красный — потому что перерасход это ПОТЕРЯ, а не потому что это вердикт проверки: дрейф
      // ничего не запрещает, он кормит калибровку коэффициента.
      className={shown > 0 ? 'text-error' : undefined}
    />
  );
}

function CheckLine({ check, indent }: { check: common_ProductionLayCheck; indent?: boolean }) {
  const verdict = layVerdict(check.status);
  return (
    <Text size='micro' className={`${VERDICT_TEXT[verdict]}${indent ? ' pl-2.5' : ''}`}>
      {VERDICT_GLYPH[verdict]}{' '}
      {/* «не проверено» произносится ВСЛУХ перед названием проверки: молчаливый серый глиф
          прочитался бы как приглушённое «ок». */}
      {verdict === 'unknown' ? 'not checked: ' : ''}
      {check.label || check.key}
      {check.detail ? ` — ${check.detail}` : ''}
    </Text>
  );
}

// Диф снимка количеств. Раскрытие — <details>, чтобы карточка осталась без состояния.
//
// Два действия, и оба явные:
//   «пересобрать»          — открывает редактор: слои/секции меняет человек, снимок обновится
//                            вместе с секциями;
//   «количества проверены» — reaffirm_quantities без правки секций. Нужен, когда количество ушло
//                            ВНИЗ или изменилось в размере, которого настил не режет: перекрой
//                            законен, и требовать пересборки настила ради этого — вранье в другую
//                            сторону.
function StaleDisclosure({
  lay,
  sizeLabel,
  canEdit,
  onEdit,
  onReaffirm,
  reaffirming,
}: {
  lay: common_ProductionRunLay;
  sizeLabel: (sizeId: number) => string;
  canEdit: boolean;
  onEdit: () => void;
  onReaffirm: () => void;
  reaffirming: boolean;
}) {
  const diff = qtyDiff(lay.qtySnapshot ?? [], lay.qtyCurrent ?? []);
  return (
    <details className='mt-1'>
      <summary className='cursor-pointer text-micro uppercase tracking-label text-warning'>
        the run lines changed after the lay was built
      </summary>
      <div className='mt-1 flex flex-col gap-1'>
        <Text size='small' className='tabular-nums'>
          {diff.length === 0
            ? 'the snapshot and the current lines do not diverge in any size'
            : diff
                .map(
                  (d) =>
                    `${sizeLabel(d.sizeId)}: ${d.before == null ? '—' : d.before} → ${
                      d.after == null ? '—' : d.after
                    }`,
                )
                .join(' · ')}
        </Text>
        {canEdit ? (
          <div className='flex flex-wrap items-center gap-1.5'>
            <Button type='button' variant='secondary' size='xs' onClick={onEdit}>
              rebuild
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='xs'
              disabled={reaffirming}
              onClick={onReaffirm}
            >
              {reaffirming ? 'confirming…' : 'quantities checked'}
            </Button>
          </div>
        ) : null}
      </div>
    </details>
  );
}

type QtyDelta = { sizeId: number; before: number | null; after: number | null };

// Объединение размеров обеих сторон: размер, ПОЯВИВШИЙСЯ в прогоне после построения настила,
// обязан быть виден («L: — → 4»), иначе диф покажет только то, что настил и так кроит.
export function qtyDiff(
  snapshot: common_ProductionRunLayQtyEntry[],
  current: common_ProductionRunLayQtyEntry[],
): QtyDelta[] {
  const before = new Map(snapshot.map((e) => [e.sizeId ?? 0, e.qty ?? 0]));
  const after = new Map(current.map((e) => [e.sizeId ?? 0, e.qty ?? 0]));
  const sizes = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a - b);
  return sizes.map((sizeId) => ({
    sizeId,
    before: before.has(sizeId) ? before.get(sizeId)! : null,
    after: after.has(sizeId) ? after.get(sizeId)! : null,
  }));
}
