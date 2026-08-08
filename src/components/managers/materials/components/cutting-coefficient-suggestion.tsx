import {
  common_MaterialCoefficientLayDrift,
  common_MaterialCoefficientSuggestionStatus,
  googletype_Decimal,
} from 'api/proto-http/admin';
import {
  MATERIAL_UNIT_LABEL,
  stampWhen,
} from 'components/managers/production-runs/components/useLays';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { useCuttingCoefficientSuggestion } from './useMaterials';

// ПРЕДЛОЖЕНИЕ КОЭФФИЦИЕНТА РАСКРОЯ ПО ФАКТУ НАСТИЛОВ (Ф5б.3).
//
// Коэффициент рядом заводят «на глазок». Эта панель выводит его из ФАКТА: цех замеряет реальный
// расход на настилах, сервер берёт медиану дрейфа план↔факт по настилам ЭТОГО артикула и предлагает
// множитель. Панель ничего не сохраняет и ничего не решает — она показывает измерение и, когда его
// можно сохранить, кладёт число в поле по нажатию. Сохраняет карточку человек.
//
// ДВА ЧИСЛА, И ЭТО НЕ ИЗБЫТОЧНОСТЬ. median_drift_percent — ИЗМЕРЕНИЕ в процентах (+3.00 = «уходит
// на 3% больше плана»); suggested_coefficient — МНОЖИТЕЛЬ (1.0300), ровно то, что ложится в поле.
// Ни одно НЕ ВЫВОДИТСЯ здесь из другого: забытый «+1» дал бы коэффициент 0.03, а всё, что меньше
// единицы, сервер читает как «не задано» — калибровка молча обнулила бы себя.

// Порог сервера: медиана считается по настилам, где есть И план, И факт, и их должно быть не меньше
// трёх. Число названо вслух, потому что при TOO_FEW_FACTS ответом является именно «сколько нашлось
// из скольких нужных».
const LAY_THRESHOLD = 3;

// Ветвление ПО ЯВНОМУ СПИСКУ статусов, а не «всё, что не TOO_FEW_FACTS, — предложение».
// _UNSPECIFIED — это ноль перечисления, зарезервированный за «поле не заполнено», и он обязан
// читаться как ОТСУТСТВИЕ предложения. Прочитай его как READY — и панель предложила бы пустое
// число как готовое к подстановке.
type View = 'ready' | 'outOfRange' | 'tooFew' | 'none';

function viewFor(status?: common_MaterialCoefficientSuggestionStatus): View {
  switch (status) {
    case 'MATERIAL_COEFFICIENT_SUGGESTION_STATUS_READY':
      return 'ready';
    case 'MATERIAL_COEFFICIENT_SUGGESTION_STATUS_OUT_OF_RANGE':
      return 'outOfRange';
    case 'MATERIAL_COEFFICIENT_SUGGESTION_STATUS_TOO_FEW_FACTS':
      return 'tooFew';
    // Явный ноль перечисления и всё, чего клиент не знает (новое значение с более свежего сервера),
    // читаются одинаково: предложения нет.
    case 'MATERIAL_COEFFICIENT_SUGGESTION_STATUS_UNSPECIFIED':
    default:
      return 'none';
  }
}

// Проценты СО ЗНАКОМ, строкой сервера как есть: единица названа в имени поля, а не в значении, и
// округлять здесь нечего — сервер уже прислал ту точность, которую сам считает осмысленной.
// Пустое остаётся пустым: '' (а не '0%') — «не посчитано» и «ноль» разные утверждения.
function signedPercent(d?: googletype_Decimal): string {
  const raw = d?.value?.trim();
  if (!raw || !Number.isFinite(Number(raw))) return '';
  if (raw.startsWith('-')) return `−${raw.slice(1)}%`;
  return Number(raw) > 0 ? `+${raw}%` : `${raw}%`;
}

// DECIMAL(12,3) приезжает как «12.400»; хвостовые нули — артефакт колонки, а не точность замера.
// Значение НЕ округляется: убираются только нули, которых человек не вводил.
function trimQty(d?: googletype_Decimal): string {
  const raw = d?.value?.trim();
  if (!raw || !Number.isFinite(Number(raw))) return '';
  return String(Number(raw));
}

// Одна строка разбора. Настил НАЗЫВАЕТ СЕБЯ (карточка, прогон, имя) — не ради красоты: медиана по
// построению ПРЯЧЕТ выброс, а выброс — это скорее всего опечатка замерщика («ввели 500 вместо 50»).
// Показать только медиану значило бы починить арифметику и оставить неверную строку в базе
// навсегда. Найти и починить её должен человек, поэтому здесь есть, за что зацепиться.
function DriftTile({ drift }: { drift: common_MaterialCoefficientLayDrift }) {
  const card =
    drift.techCardName ||
    (drift.techCardId ? `карта #${drift.techCardId}` : 'карточка не названа');
  const lay =
    drift.layName || drift.layKey || (drift.layId ? `настил #${drift.layId}` : 'настил не назван');
  // UNKNOWN — это «единицу не распознали», а НЕ «единицы нет»: число показывается всё равно, но без
  // подписи, которой нельзя доверять.
  const unit =
    drift.actualUom && drift.actualUom !== 'MATERIAL_UNIT_UNKNOWN'
      ? MATERIAL_UNIT_LABEL[drift.actualUom]
      : '';
  const planned = trimQty(drift.plannedQty);
  const actual = trimQty(drift.actualQty);
  const driftText = signedPercent(drift.driftPercent);
  const skipped = drift.skipped?.trim() ?? '';
  const when = stampWhen(drift.actualAt);
  const suffix = unit ? ` ${unit}` : '';

  return (
    <div
      // Пунктир у невошедших: настил, не попавший в медиану, обязан отличаться от попавшего ещё до
      // чтения текста. Цветом это не красится — красный в системе значит потерю, а невхождение
      // потерей не является.
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
        {/* План уже пересчитан сервером в единицу факта — два числа встают рядом без второго
            перевода здесь. Пусто у плана значит «несводим либо его нет», а не ноль. */}
        {planned ? `план ${planned}${suffix}` : 'план не сведён'}
        {' → '}
        {actual ? `факт ${actual}${suffix}` : 'факт не введён'}
      </Text>
      {driftText ? (
        <Text size='micro' className='tabular-nums'>
          дрейф {driftText}
        </Text>
      ) : null}
      {skipped ? (
        <Text size='micro' variant='label'>
          {/* Причина — дословно с сервера: перевранная или обобщённая, она перестаёт быть подсказкой
              о том, что именно чинить. */}
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

// Заголовок панели: подпись + вердикт одним словом. Вердикт — не украшение: у трёх из четырёх
// состояний числа в панели вовсе нет, и глазу нужно понять это раньше, чем он начнёт искать цифру.
function Head({ badge }: { badge: React.ReactNode }) {
  return (
    <div className='flex flex-wrap items-baseline gap-2'>
      <Text variant='label' size='micro' tracking='label' className='uppercase'>
        предложение по факту настилов
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

export function CuttingCoefficientSuggestion({
  materialId,
  isFabric,
  onApply,
}: {
  materialId: number;
  isFabric: boolean;
  // Кладёт множитель в ЖИВОЕ поле формы, а не в базу: панель не знает про UpdateMaterial и не
  // должна знать. Человек видит число в инпуте и сохраняет карточку сам.
  onApply: (coefficient: string) => void;
}) {
  const enabled = isFabric && materialId > 0;
  const { data, isLoading, isError, error } = useCuttingCoefficientSuggestion(materialId, enabled);

  // На фурнитуре коэффициента раскроя нет вовсе — панели тоже нет.
  if (!isFabric) return null;

  // Артикул ещё не создан: настилов у него нет по построению, и запрос не уходил. Строка стоит
  // здесь не ради симметрии — иначе про калибровку по факту узнать неоткуда.
  if (materialId <= 0) {
    return <Quiet>артикул ещё не сохранён — предложение считается по его настилам</Quiet>;
  }

  if (isLoading) return <Quiet>считаем по настилам…</Quiet>;

  // 403 — НЕ ОШИБКА. RPC классифицирован production:read, а карточку артикула открывает и тот, у
  // кого этого права нет: для него предложения просто не существует, и красная плашка сообщила бы
  // о поломке там, где всё работает как задумано.
  if (isError) {
    const forbidden = (error as { status?: number } | null)?.status === 403;
    return (
      <Quiet>
        {forbidden
          ? 'предложение недоступно на этом доступе'
          : 'предложение не загрузилось — коэффициент можно поставить рукой'}
      </Quiet>
    );
  }

  const view = viewFor(data?.status);
  const layCount = data?.layCount ?? 0;
  const drifts = data?.drifts ?? [];
  const counted = drifts.filter((d) => !!d.driftPercent?.value).length;
  const skippedCount = drifts.length - counted;
  const median = signedPercent(data?.medianDriftPercent);
  // Множитель берётся строкой сервера как есть. Пусто = «коэффициента нет», и это НЕ «1.0».
  const suggested = data?.suggestedCoefficient?.value?.trim() ?? '';
  const detail = data?.detail?.trim() ?? '';

  // READY без числа — противоречие ответа, а не готовое предложение: подставлять нечего, и говорить
  // «готово» над прочерком значило бы соврать. Отдельного статуса под это нет, поэтому оно читается
  // как отсутствие предложения — так же, как _UNSPECIFIED.
  const applicable = view === 'ready' && suggested !== '';

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

  return (
    <div className='flex flex-col gap-1.5'>
      <Head badge={badge} />

      {view === 'ready' || view === 'outOfRange' ? (
        <StatGrid min={170}>
          <Stat
            label='медиана дрейфа план↔факт'
            value={median || '—'}
            sub={`измерение · по ${layCount} настилам`}
          />
          {/* Второе число — то самое, что ложится в поле. При OUT_OF_RANGE его нет, и на его месте
              стоит «—», а НЕ единица и не ближайшая граница: зажать −12% в 1.0 значило бы подменить
              измерение ближайшим сохраняемым значением и выдать подмену за замер. */}
          <Stat
            label='коэффициент к подстановке'
            value={applicable ? suggested : '—'}
            sub={view === 'ready' ? 'множитель · как в поле выше' : 'поле принимает 1–3'}
          />
        </StatGrid>
      ) : null}

      {view === 'tooFew' ? (
        <StatGrid min={170}>
          <Stat
            label='настилов с планом и фактом'
            value={`${layCount} из ${LAY_THRESHOLD}`}
            sub='нужно три'
          />
        </StatGrid>
      ) : null}

      {/* Фраза сервера непуста всегда, включая READY: она объясняет ЧИСЛО, а не повторяет статус. */}
      {detail ? (
        <Text size='micro' variant='label'>
          {detail}
        </Text>
      ) : null}

      {view === 'outOfRange' ? (
        <Text size='micro' variant='label'>
          измерение показано как есть и не подогнано под границу поля: подставлять нечего — разберите
          настилы ниже, такой разброс обычно значит неверный замер.
        </Text>
      ) : null}

      {view === 'tooFew' ? (
        <Text size='micro' variant='label'>
          медиана из одного-двух замеров ничего не значит — пусть цех отчитается о расходе ещё на
          настилах этого артикула, и предложение появится само.
        </Text>
      ) : null}

      {applicable ? (
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            type='button'
            variant='secondary'
            size='xs'
            onClick={() => onApply(suggested)}
          >
            подставить в поле
          </Button>
          <Text size='micro' variant='label'>
            число встанет в «коэффициент раскроя» — карточку сохраняете вы, не сервер
          </Text>
        </div>
      ) : null}

      {/* РАЗБОР ЦЕЛИКОМ — и вошедшие, и невошедшие. Вошедшие нужны не меньше невошедших: опечатка,
          прошедшая все проверки («500 вместо 50»), лежит именно среди них, а медиана её прячет.
          Сводка в заголовке называет обе половины, поэтому за закрытым «разбором» ничего не
          скрывается — там ровно то, что обещано. */}
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
