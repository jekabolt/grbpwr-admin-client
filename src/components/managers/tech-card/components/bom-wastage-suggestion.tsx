import {
  common_BomWastageLayDrift,
  common_BomWastageSuggestionStatus,
  googletype_Decimal,
} from 'api/proto-http/admin';
import { useBomWastageSuggestion } from 'components/managers/materials/components/useMaterials';
import {
  MATERIAL_UNIT_LABEL,
  stampWhen,
} from 'components/managers/production-runs/components/useLays';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Pill } from 'ui/components/pill';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { parseDecimalNumber } from 'utils/decimal';

// ПРЕДЛОЖЕНИЕ ПРОЦЕНТА РАСКРОЯ ПО ФАКТУ НАСТИЛОВ (T7, волна 2).
//
// Поле «est. cutting wastage %» рядом заполняли «из головы» — и владелец прямо сказал, что не
// понимает, из чего его выводить. Эта панель выводит его из ФАКТА: сервер берёт медиану
// «факт ÷ netto − 1» по настилам этого артикула, где есть И замер полотна, И netto-знаменатель
// (норма «по выкройкам» состава раскладки), и отдаёт её вместе с разбором. Панель ничего не
// сохраняет: по нажатию число ложится в ЖИВОЕ поле формы вместе со счётчиком настилов, а карточку
// сохраняет человек.
//
// ЭТО НЕ ПАНЕЛЬ КОЭФФИЦИЕНТА. У соседа в карточке артикула (cutting-coefficient-suggestion)
// внешне такая же медиана по тем же настилам — но с ДРУГИМ знаменателем: там факт делится на
// план-геометрию (длина раскладки × слои + концевые), где межлекальные выпады уже внутри, и
// медиана меряет только усадку/пороки (2–6%). Здесь факт делится на NETTO — выпадов в знаменателе
// нет, и медиана меряет всё, чего нет в безотходной норме (15–30%). Структура повторена
// сознательно (человек уже умеет её читать), но ни один текст и ни один хелпер с соседом не
// общий: общая строка — это приглашение однажды унести число не в то поле.

// Порог сервера, названный вслух: медиана считается по настилам с фактом И netto, и их должно
// быть не меньше трёх. При TOO_FEW_FACTS ответом является именно «сколько нашлось из скольких».
const LAY_THRESHOLD = 3;

// ПОРОГ ПОКАЗА РАСХОЖДЕНИЯ «в поле одно — медиана говорит другое»: 1 процентный пункт.
// Спецификация оставила порог открытым; выбор обоснован так:
//  - медиана ползёт с каждым новым замером — предупреждение, загорающееся на каждую сотую,
//    обучает себя игнорировать, и к содержательному расхождению глаз уже слеп;
//  - люди вводят проценты целыми (8, 10), медиана приходит с сотыми (8.33) — расхождения
//    меньше пункта чаще всего означают «то же самое число, сказанное с разной точностью»,
//    а не разногласие замеров с оценкой;
//  - процент входит в закупку линейно: 1 п.п. — это 1% денег на ткань, порог, с которого
//    ошибка стоит дороже минуты на проверку разбора.
// Ниже порога панель о расхождении молчит, но живая медиана всё равно на экране — сравнить
// можно глазом.
const DRIFT_SPEAKUP_PP = 1;

// Ветвление ПО ЯВНОМУ СПИСКУ статусов, а не «всё, что не TOO_FEW_FACTS, — предложение»:
// ноль перечисления зарезервирован за «поле не заполнено» и обязан читаться как ОТСУТСТВИЕ
// предложения, иначе пустой ответ предложил бы пустое число как готовое.
type View = 'ready' | 'outOfRange' | 'tooFew' | 'none';

function viewFor(status?: common_BomWastageSuggestionStatus): View {
  switch (status) {
    case 'BOM_WASTAGE_SUGGESTION_STATUS_READY':
      return 'ready';
    case 'BOM_WASTAGE_SUGGESTION_STATUS_OUT_OF_RANGE':
      return 'outOfRange';
    case 'BOM_WASTAGE_SUGGESTION_STATUS_TOO_FEW_FACTS':
      return 'tooFew';
    // Явный ноль и всё, чего этот клиент не знает (новое значение с более свежего сервера),
    // читаются одинаково: предложения нет.
    case 'BOM_WASTAGE_SUGGESTION_STATUS_UNSPECIFIED':
    default:
      return 'none';
  }
}

// Two-form plural on the counter. There is no shared helper in utils, and the numerals here carry
// meaning: «across 1 lay» against «across 3 lays» is the difference between a single measurement
// and a sample.
function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

// ЕДИНСТВЕННЫЙ составитель фразы провенанса «lays» — им пользуются бейдж у поля (bom-field) и
// ячейка костинга (cost-estimate-field), чтобы две подписи одного факта не разъехались словами.
// Дату добавляет только при штампе: свежеприменённое (ещё не сохранённое) значение даты не имеет,
// и выдумывать её здесь значило бы датировать применение, которого сервер ещё не видел.
export function laysProvenancePhrase(layCount?: number, appliedAtStamp?: string): string {
  const n = layCount ?? 0;
  const base = n > 0 ? `median across ${n} ${plural(n, 'lay')}` : 'median over actual lays';
  return appliedAtStamp ? `${base}, applied ${appliedAtStamp}` : base;
}

// Проценты СО ЗНАКОМ, строкой сервера как есть: округлять нечего — сервер уже прислал точность,
// которую считает осмысленной. Пустое остаётся пустым: «не посчитано» и «ноль» — разные
// утверждения о ткани.
function signedPercent(d?: googletype_Decimal): string {
  const raw = d?.value?.trim();
  if (!raw || !Number.isFinite(Number(raw))) return '';
  if (raw.startsWith('-')) return `−${raw.slice(1)}%`;
  return Number(raw) > 0 ? `+${raw}%` : `${raw}%`;
}

// DECIMAL приезжает как «12.400»; хвостовые нули — артефакт колонки, а не точность замера.
function trimQty(d?: googletype_Decimal): string {
  const raw = d?.value?.trim();
  if (!raw || !Number.isFinite(Number(raw))) return '';
  return String(Number(raw));
}

// Одна строка разбора. Настил называет себя (карточка, прогон, имя) не ради красоты: медиана по
// построению ПРЯЧЕТ выброс, а выброс — скорее всего опечатка замерщика; починить её должен
// человек, и ему нужно, за что зацепиться. Карточка в заголовке важнее прочего: медиана «по 3
// настилам» может целиком стоять на одной ЧУЖОЙ модели, а межлекальные выпады — свойство модели.
function DriftTile({ drift }: { drift: common_BomWastageLayDrift }) {
  const card =
    drift.techCardName || (drift.techCardId ? `card #${drift.techCardId}` : 'card not named');
  const lay =
    drift.layName || drift.layKey || (drift.layId ? `lay #${drift.layId}` : 'lay not named');
  // UNKNOWN — «единицу не распознали», а не «единицы нет»: число показывается, но без подписи,
  // которой нельзя доверять.
  const unit =
    drift.actualUom && drift.actualUom !== 'MATERIAL_UNIT_UNKNOWN'
      ? MATERIAL_UNIT_LABEL[drift.actualUom]
      : '';
  const netto = trimQty(drift.nettoQty);
  const actual = trimQty(drift.actualQty);
  const driftText = signedPercent(drift.driftPercent);
  const skipped = drift.skipped?.trim() ?? '';
  const when = stampWhen(drift.actualAt);
  const suffix = unit ? ` ${unit}` : '';

  return (
    <div
      // Пунктир у невошедших: настил вне медианы обязан отличаться ещё до чтения текста. Цветом
      // не красится — красный в системе значит потерю, а невхождение потерей не является.
      className={`flex flex-col gap-0.5 border px-2 py-1.5 ${
        driftText ? 'border-borderColor' : 'border-dashed border-borderColor'
      }`}
    >
      <Text size='micro' variant='label' tracking='label' className='uppercase'>
        {card}
        {drift.runId ? ` · run #${drift.runId}` : ''}
      </Text>
      <Text size='control'>{lay}</Text>
      <Text size='micro' variant='label' className='tabular-nums'>
        {/* Netto уже в единице факта (actual_uom) — два числа встают рядом без перевода здесь.
            Пусто у netto значит «взять неоткуда», а не ноль; причина — в skipped. */}
        {netto ? `netto ${netto}${suffix}` : 'nothing to take netto from'}
        {' → '}
        {actual ? `actual ${actual}${suffix}` : 'actual not entered'}
      </Text>
      {driftText ? (
        <Text size='micro' className='tabular-nums'>
          over netto {driftText}
        </Text>
      ) : null}
      {/* Штамп netto — это надёжный случай, о нём молчим. Голос — только у пересчёта по живой
          норме: карточка могла уйти от нормы, при которой мерили, и число надо читать с этой
          поправкой. */}
      {netto && drift.nettoStamped === false ? (
        <Text size='micro' variant='label'>
          netto recomputed against the card's current norm — it could have changed after the
          measurement
        </Text>
      ) : null}
      {skipped ? (
        <Text size='micro' variant='label'>
          {/* Причина — дословно с сервера: перевранная или обобщённая, она перестаёт быть
              подсказкой о том, что именно чинить. */}
          not in the median — {skipped}
        </Text>
      ) : null}
      {!driftText && !skipped ? (
        <Text size='micro' variant='label'>
          drift not computed, and no reason given
        </Text>
      ) : null}
      {when ? (
        <Text size='nano' variant='label'>
          measured {when}
        </Text>
      ) : null}
    </div>
  );
}

// Заголовок панели: подпись + вердикт одним словом. У трёх из четырёх состояний числа в панели
// нет вовсе, и глазу нужно понять это раньше, чем он начнёт искать цифру.
function Head({ badge }: { badge: React.ReactNode }) {
  return (
    <div className='flex flex-wrap items-baseline gap-2'>
      <Text variant='label' size='micro' tracking='label' className='uppercase'>
        percent from actual lays
      </Text>
      {badge}
    </div>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex flex-col gap-1'>
      <Head badge={null} />
      <Text size='micro' variant='label'>
        {children}
      </Text>
    </div>
  );
}

export function BomWastageSuggestion({
  materialId,
  currentPercent,
  currentSource,
  onApply,
}: {
  /** Артикул слота (bom_item.material_id). 0 = строка не привязана — считать не по чему. */
  materialId: number;
  /** Живое значение поля «est. cutting wastage %» — для голоса о расхождении с медианой. */
  currentPercent: string;
  /** Провенанс живого значения ('lays' | 'manual' | пусто) — расхождение формулируется по-разному
   *  для применённого числа, от которого уехала медиана, и для оценки руками. */
  currentSource?: string;
  /** Кладёт ПАРУ (процент, счётчик настилов) в живое поле формы. Пара неразделима: по её
   *  совпадению с текущей медианой сервер отличает применение предложения от ручного ввода —
   *  прислать один процент значило бы применить число и не получить за это провенанс. */
  onApply: (percent: string, layCount: number) => void;
}) {
  // Ленивость живёт этажом выше: панель монтируется только в открытом редакторе ОДНОЙ строки BOM
  // (модалка BomItemRow), поэтому «enabled по монтированию» и означает «по запросу человека».
  const { data, isLoading, isError, error } = useBomWastageSuggestion(materialId, materialId > 0);

  // Строка без артикула: настилов нет по построению, и запрос не уходил. Строка стоит здесь не
  // ради симметрии — иначе про расчёт по факту узнать неоткуда.
  if (materialId <= 0) {
    return (
      <Quiet>
        the line isn't linked to an article — the median over actuals is computed across that
        article's lays; link an article and the suggestion will appear here
      </Quiet>
    );
  }

  if (isLoading) return <Quiet>computing across the article's lays…</Quiet>;

  // 403 — НЕ ошибка: RPC классифицирован production:read, а вкладку BOM открывает и тот, у кого
  // этого права нет. Для него предложения просто не существует.
  if (isError) {
    const forbidden = (error as { status?: number } | null)?.status === 403;
    return (
      <Quiet>
        {forbidden
          ? "the suggestion isn't available with this access"
          : "the suggestion didn't load — the percent can be estimated by hand"}
      </Quiet>
    );
  }

  const view = viewFor(data?.status);
  const layCount = data?.layCount ?? 0;
  const techCardCount = data?.techCardCount ?? 0;
  const drifts = data?.drifts ?? [];
  const counted = drifts.filter((d) => !!d.driftPercent?.value).length;
  const skippedCount = drifts.length - counted;
  const median = signedPercent(data?.medianOverNettoPercent);
  // Число для поля — строкой сервера КАК ЕСТЬ: его же панель отправит обратно при применении, и
  // любое переформатирование здесь рискнуло бы разминуться с медианой при серверной сверке пары.
  const suggested = data?.suggestedWastagePercent?.value?.trim() ?? '';
  const detail = data?.detail?.trim() ?? '';

  // READY без числа — противоречие ответа, а не предложение: говорить «готово» над прочерком
  // значило бы соврать. Читается как отсутствие предложения, так же как UNSPECIFIED.
  const applicable = view === 'ready' && suggested !== '';

  // РАСХОЖДЕНИЕ поля с медианой. Голос есть только когда есть ОБА числа: измерение (READY или
  // OUT_OF_RANGE — измерение остаётся фактом, даже когда поле его не принимает) и непустое поле.
  const fieldNum = parseDecimalNumber(currentPercent);
  const medianNum = parseDecimalNumber(data?.medianOverNettoPercent?.value);
  const driftPP =
    (view === 'ready' || view === 'outOfRange') &&
    Number.isFinite(fieldNum) &&
    Number.isFinite(medianNum)
      ? Math.abs(fieldNum - medianNum)
      : 0;
  const speakUp = driftPP >= DRIFT_SPEAKUP_PP;

  const badge =
    view === 'ready' ? (
      applicable ? (
        <Pill tone='ok'>suggestion ready</Pill>
      ) : (
        <Pill tone='mut'>no number came back</Pill>
      )
    ) : view === 'outOfRange' ? (
      <Pill tone='attention'>the field won't take this</Pill>
    ) : view === 'tooFew' ? (
      <Pill tone='mut'>not enough measurements</Pill>
    ) : (
      <Pill tone='mut'>no suggestion</Pill>
    );

  const modelsText = `${techCardCount} ${plural(techCardCount, 'model')}`;

  return (
    <div className='flex flex-col gap-1.5'>
      <Head badge={badge} />

      {view === 'ready' || view === 'outOfRange' ? (
        <StatGrid min={170}>
          {/* ОДНО число, и это отличие от панели коэффициента сознательное: там поле хранит
              множитель и ответ несёт измерение И множитель; здесь поле хранит тот же процент,
              что и измерение, — вторая плитка была бы тем же числом дважды. Состав выборки стоит
              прямо под числом: «across 3 of 5 measured, 1 model» и «across 5 of 5, 3 models» —
              разные основания применять медиану к СВОЕЙ модели, число без состава непроверяемо. */}
          <Stat
            label='goes over netto'
            value={median || '—'}
            sub={`median · across ${layCount} ${plural(layCount, 'lay')}${
              drifts.length > layCount ? ` of ${drifts.length} measured` : ''
            } · ${modelsText}`}
          />
        </StatGrid>
      ) : null}

      {view === 'tooFew' ? (
        <StatGrid min={170}>
          <Stat
            label='lays with an actual and netto'
            value={`${layCount} of ${LAY_THRESHOLD}`}
            sub='three needed'
          />
        </StatGrid>
      ) : null}

      {/* Фраза сервера непуста всегда, включая READY: она объясняет число, а не повторяет статус. */}
      {detail ? (
        <Text size='micro' variant='label'>
          {detail}
        </Text>
      ) : null}

      {view === 'tooFew' ? (
        <Text size='micro' variant='label'>
          An actual appears once a marker is captured on the run's lay and the cloth measurement is
          entered, and netto — once the lay's card has a norm “from patterns”. Three will add up and
          the median will appear here on its own; until then the percent is estimated by hand, and
          the panel substitutes no defaults.
          {skippedCount > 0
            ? ` There are more measured lays (${drifts.length}), but not all of them have netto — the reasons are in the breakdown below.`
            : ''}
        </Text>
      ) : null}

      {view === 'outOfRange' ? (
        <Text size='micro' variant='label'>
          The median doesn't fit the field (it lives in 0–100%), so there is nothing to substitute —
          and the number isn't pinned to the boundary either: replacing a measurement with the
          nearest storable value would pass the substitution off as a measurement. A deviation like
          that usually means a wrong measurement or a lost netto — go through the lays below.
        </Text>
      ) : null}

      {/* Вся медиана на одной модели — сказано ДО кнопки: межлекальные выпады — свойство модели
          (форма деталей, размерный микс, ширина), и число, снятое целиком с чужой, применяется к
          своей осознанно, а не по зелёному бейджу. */}
      {applicable && techCardCount === 1 ? (
        <Text size='micro' variant='label'>
          the whole sample is lays of one model: check in the breakdown that it is yours before
          applying its percent to this card
        </Text>
      ) : null}

      {speakUp ? (
        <CalloutBox tone='warning'>
          {currentSource === 'lays'
            ? `${currentPercent}% was applied, and the median has moved since: now ${median} across ${layCount} ${plural(layCount, 'lay')} — measurements were added. Check the breakdown and, if you agree, substitute the fresh number.`
            : `${currentPercent}% was entered, and across ${layCount} ${plural(layCount, 'lay')} the median is ${median} — check whose truth it is: the measurements or the estimate. Nothing changes on its own.`}
        </CalloutBox>
      ) : null}

      {applicable ? (
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            type='button'
            variant='secondary'
            size='xs'
            onClick={() => onApply(suggested, layCount)}
          >
            substitute {suggested}%
          </Button>
          <Text size='micro' variant='label'>
            goes into the field together with the lay count — by this pair the server tells applying
            the suggestion apart from manual entry; you save the card yourself
          </Text>
        </div>
      ) : null}

      {/* РАЗБОР ЦЕЛИКОМ — вошедшие и невошедшие. Вошедшие нужны не меньше: опечатка, прошедшая
          все проверки, лежит именно среди них, а медиана её прячет. <details> — сознательно: на
          выпущенной карте вкладка живёт в <fieldset disabled>, который глушит любую раскрывашку
          на кнопке, а раскрывашка на <details> переживает заморозку. */}
      {drifts.length > 0 ? (
        <details>
          <summary className='cursor-pointer text-micro uppercase tracking-label text-labelColor'>
            lay breakdown: {counted} in the median
            {skippedCount > 0 ? `, ${skippedCount} left out` : ''}
          </summary>
          <div className='mt-1.5 grid gap-1.5 sm:grid-cols-2'>
            {drifts.map((d, i) => (
              <DriftTile key={d.layId || `drift-${i}`} drift={d} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
