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

// Русское склонение по счётчику. Своего хелпера в utils нет, а числительные здесь несут смысл:
// «по 1 настилу» против «по 3 настилам» — разница между единичным замером и выборкой.
function pluralRu(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// ЕДИНСТВЕННЫЙ составитель фразы провенанса «lays» — им пользуются бейдж у поля (bom-field) и
// ячейка костинга (cost-estimate-field), чтобы две подписи одного факта не разъехались словами.
// Дату добавляет только при штампе: свежеприменённое (ещё не сохранённое) значение даты не имеет,
// и выдумывать её здесь значило бы датировать применение, которого сервер ещё не видел.
export function laysProvenancePhrase(layCount?: number, appliedAtStamp?: string): string {
  const n = layCount ?? 0;
  const base =
    n > 0
      ? `медиана по ${n} ${pluralRu(n, 'раскрою', 'раскроям', 'раскроям')}`
      : 'медиана по факту раскроев';
  return appliedAtStamp ? `${base}, применено ${appliedAtStamp}` : base;
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
    drift.techCardName || (drift.techCardId ? `карта #${drift.techCardId}` : 'карточка не названа');
  const lay =
    drift.layName || drift.layKey || (drift.layId ? `настил #${drift.layId}` : 'настил не назван');
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
        {drift.runId ? ` · прогон #${drift.runId}` : ''}
      </Text>
      <Text size='control'>{lay}</Text>
      <Text size='micro' variant='label' className='tabular-nums'>
        {/* Netto уже в единице факта (actual_uom) — два числа встают рядом без перевода здесь.
            Пусто у netto значит «взять неоткуда», а не ноль; причина — в skipped. */}
        {netto ? `netto ${netto}${suffix}` : 'netto не из чего взять'}
        {' → '}
        {actual ? `факт ${actual}${suffix}` : 'факт не введён'}
      </Text>
      {driftText ? (
        <Text size='micro' className='tabular-nums'>
          сверх netto {driftText}
        </Text>
      ) : null}
      {/* Штамп netto — это надёжный случай, о нём молчим. Голос — только у пересчёта по живой
          норме: карточка могла уйти от нормы, при которой мерили, и число надо читать с этой
          поправкой. */}
      {netto && drift.nettoStamped === false ? (
        <Text size='micro' variant='label'>
          netto пересчитан по текущей норме карточки — она могла измениться после замера
        </Text>
      ) : null}
      {skipped ? (
        <Text size='micro' variant='label'>
          {/* Причина — дословно с сервера: перевранная или обобщённая, она перестаёт быть
              подсказкой о том, что именно чинить. */}
          не вошёл в медиану — {skipped}
        </Text>
      ) : null}
      {!driftText && !skipped ? (
        <Text size='micro' variant='label'>
          дрейф не посчитан, и причина не названа
        </Text>
      ) : null}
      {when ? (
        <Text size='nano' variant='label'>
          замер {when}
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
        процент по факту настилов
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
        строка не привязана к артикулу — медиана по факту считается по его настилам; привяжите
        артикул, и предложение появится здесь
      </Quiet>
    );
  }

  if (isLoading) return <Quiet>считаем по настилам артикула…</Quiet>;

  // 403 — НЕ ошибка: RPC классифицирован production:read, а вкладку BOM открывает и тот, у кого
  // этого права нет. Для него предложения просто не существует.
  if (isError) {
    const forbidden = (error as { status?: number } | null)?.status === 403;
    return (
      <Quiet>
        {forbidden
          ? 'предложение недоступно на этом доступе'
          : 'предложение не загрузилось — процент можно оценить руками'}
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
        <Pill tone='ok'>предложение готово</Pill>
      ) : (
        <Pill tone='mut'>число не пришло</Pill>
      )
    ) : view === 'outOfRange' ? (
      <Pill tone='attention'>поле такого не примет</Pill>
    ) : view === 'tooFew' ? (
      <Pill tone='mut'>мало замеров</Pill>
    ) : (
      <Pill tone='mut'>предложения нет</Pill>
    );

  const modelsText = `${techCardCount} ${pluralRu(techCardCount, 'модель', 'модели', 'моделей')}`;

  return (
    <div className='flex flex-col gap-1.5'>
      <Head badge={badge} />

      {view === 'ready' || view === 'outOfRange' ? (
        <StatGrid min={170}>
          {/* ОДНО число, и это отличие от панели коэффициента сознательное: там поле хранит
              множитель и ответ несёт измерение И множитель; здесь поле хранит тот же процент,
              что и измерение, — вторая плитка была бы тем же числом дважды. Состав выборки стоит
              прямо под числом: «по 3 из 5 замеренных, 1 модель» и «по 5 из 5, 3 модели» — разные
              основания применять медиану к СВОЕЙ модели, число без состава непроверяемо. */}
          <Stat
            label='уходит сверх netto'
            value={median || '—'}
            sub={`медиана · по ${layCount} ${pluralRu(layCount, 'раскрою', 'раскроям', 'раскроям')}${
              drifts.length > layCount ? ` из ${drifts.length} замеренных` : ''
            } · ${modelsText}`}
          />
        </StatGrid>
      ) : null}

      {view === 'tooFew' ? (
        <StatGrid min={170}>
          <Stat
            label='раскроев с фактом и netto'
            value={`${layCount} из ${LAY_THRESHOLD}`}
            sub='нужно три'
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
          Факт появляется, когда на настиле прогона снята раскладка и внесён замер полотна, а netto
          — когда у карточки настила есть норма «по выкройкам». Наберётся три — медиана появится
          здесь сама; до тех пор процент оценивается руками, и умолчаний панель не подставляет.
          {skippedCount > 0
            ? ` Замеренных настилов больше (${drifts.length}), но не у всех есть netto — причины в разборе ниже.`
            : ''}
        </Text>
      ) : null}

      {view === 'outOfRange' ? (
        <Text size='micro' variant='label'>
          Медиана не помещается в поле (оно живёт в 0–100%), поэтому подставить нечего — и к границе
          число не прижато: подмена измерения ближайшим сохраняемым значением выдала бы подмену за
          замер. Такой разброс обычно значит неверный замер или потерянный netto — разберите настилы
          ниже.
        </Text>
      ) : null}

      {/* Вся медиана на одной модели — сказано ДО кнопки: межлекальные выпады — свойство модели
          (форма деталей, размерный микс, ширина), и число, снятое целиком с чужой, применяется к
          своей осознанно, а не по зелёному бейджу. */}
      {applicable && techCardCount === 1 ? (
        <Text size='micro' variant='label'>
          вся выборка — настилы одной модели: проверьте в разборе, что это ваша, прежде чем
          применять её процент к этой карточке
        </Text>
      ) : null}

      {speakUp ? (
        <CalloutBox tone='warning'>
          {currentSource === 'lays'
            ? `Применено ${currentPercent}%, а медиана с тех пор ушла: сейчас ${median} по ${layCount} ${pluralRu(layCount, 'раскрою', 'раскроям', 'раскроям')} — добавились замеры. Сверьте разбор и, если согласны, подставьте свежее число.`
            : `Введено ${currentPercent}%, а по ${layCount} ${pluralRu(layCount, 'раскрою', 'раскроям', 'раскроям')} медиана ${median} — проверьте, чья правда: замеры или оценка. Само ничего не меняется.`}
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
            подставить {suggested}%
          </Button>
          <Text size='micro' variant='label'>
            встанет в поле вместе со счётчиком раскроев — по этой паре сервер отличает применение
            предложения от ручного ввода; карточку сохраняете вы
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
            разбор по настилам: {counted} в медиане
            {skippedCount > 0 ? `, ${skippedCount} не вошли` : ''}
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
