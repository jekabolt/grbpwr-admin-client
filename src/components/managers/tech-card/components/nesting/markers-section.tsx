// Сохранённые раскладки (маркеры) карточки — the fourth Section of the patterns tab.
// Summaries ride GetTechCard; the geometry blob is fetched only when a marker is opened
// (GetTechCardMarker → NestingModal in view mode, same lazy chunk as the nesting itself).
import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { common_TechCard, common_TechCardMarker } from 'api/proto-http/admin';
import { useSizeNames } from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { colorwayLabelOf } from './colorway-widths';
import { formatTechCardDate } from 'components/managers/tech-cards/components/utils';
import { useSnackBarStore } from 'lib/stores/store';
import { Suspense, lazy, useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import {
  cardMarkers,
  compositionLabel,
  compositionOf,
  conditionsOf,
  consumptionCm,
  decNum,
  isLegacyNorm,
  pieceSetChanged,
  scalarNormRefusal,
  totalUnitsOf,
  type MarkerConditions,
} from './marker-io';
// Правило «какие листы выкроек относятся к ЭТОЙ раскладке» живёт в marker-rebuild вместе с самой
// пересборкой — второй его копии здесь быть не должно. Модуль зависит только от типов и от чистой
// geom/, так что импорт в НЕленивый чанк не тащит ни clipper, ни dxf-parser.
import { patternSourcesForMarker, type MarkerPatternRow } from './marker-rebuild';
import {
  fabricScopes,
  isRollGoodsSection,
  markerScopeDirection,
  type ScopeDirection,
} from '../bom-purpose';
import type { TechCardFormData } from '../schema';

const NestingModal = lazy(() =>
  import('./nesting-modal').then((m) => ({ default: m.NestingModal })),
);

const SOURCE_LABEL: Record<string, string> = {
  auto: 'авто',
  manual: 'ручная',
  imported: 'импорт',
};

// ── УСЛОВИЯ СЪЁМКИ В СТРОКЕ (Ф3) ────────────────────────────────────────────────────────
//
// «НЕ ЗАПИСАНО» — ЭТО ОТВЕТ, А НЕ ПРОБЕЛ, и печатать вместо него 0 запрещено. Ноль припуска —
// законное значение и означает «клали линию как нарисована», то есть УТВЕРЖДЕНИЕ о замере;
// незаписанный припуск означает, что замера не делал никто. Ровно этим «старая норма» и
// отличается от свежей раскладки с нулевым припуском, а на глаз они выглядели бы одинаково.
const NOT_RECORDED = 'не записано';

const cm2 = (n: number) => n.toFixed(2);

// Припуск, который РЕАЛЬНО лежит между линией шва и линией кроя, = наложенный раскладкой плюс
// уже сидевший в контуре файла (их СУММА — определение сервера, см. TechCardMarkerInsert). Пару
// «оба > 0» сервер отвергает, так что слагаемое всегда одно; но КАКОЕ именно — оператору и надо
// сказать: «1.00 наложили» и «1.00 уже было в выкройке» — две разные съёмки с одним числом.
//
// null = условия не записаны вовсе. Отдельная ветка, а не «0.00 см», по причине выше.
function allowanceText(c: MarkerConditions): { total: string; origin: string } | null {
  if (!c.recorded) return null;
  const seam = c.seamAllowanceMm ?? 0;
  const contour = c.contourAllowanceMm;
  return {
    total: `${cm2(seam + (contour ?? 0))} см`,
    origin:
      contour == null
        ? // Замерить было нечем (один замкнутый контур в блоке). Сумма поэтому неполная, и
          // молчать об этом нельзя: припуск может сидеть в контуре и не быть посчитанным.
          'в контуре не замерен'
        : contour > 0
          ? 'припуск уже в контуре'
          : seam > 0
            ? 'наложен на линию шва'
            : 'контур = линия шва',
  };
}

// Слои и политика переворота — по одной строке на факт. Пустой список = не записано НИЧЕГО, и
// тогда печатается одно слово вместо трёх одинаковых.
function conditionLines(c: MarkerConditions): string[] {
  if (!c.recorded && c.contourLayer == null && c.grainLayer == null && c.allowFlip == null) {
    return [];
  }
  const contour =
    c.contourLayer == null
      ? NOT_RECORDED
      : c.contourLayer === ''
        ? 'слоёв не было'
        : c.contourLayer;
  // ПУСТАЯ СТРОКА У ДОЛЕВОЙ — ЗНАЧЕНИЕ, а не пропуск: оператор мог осознанно выключить разворот.
  // Склеить её с «не записано» значило бы при пересборке чертежа развернуть детали, которые он
  // запретил разворачивать, — поэтому прото и держит поле optional.
  const grain =
    c.grainLayer == null ? NOT_RECORDED : c.grainLayer === '' ? 'не разворачивать' : c.grainLayer;
  const flip = c.allowFlip == null ? NOT_RECORDED : c.allowFlip ? 'разрешён' : 'запрещён';
  return [`контур: ${contour}`, `долевая: ${grain}`, `переворот: ${flip}`];
}

const PIECE_SET_MATCHES = 'TECH_CARD_MARKER_PIECE_SET_STATUS_MATCHES';

// Как назвать скоуп эксклюзивности словами. Скоуп — (карточка, строка BOM), то есть «одна норма
// на ТКАНЬ»; непривязанная раскладка попадает в собственный скоуп «без ткани», и он тоже скоуп.
const scopeWord = (slot: string) => (slot ? `ткани «${slot}»` : 'скоупа «без ткани»');

export function MarkersSection({
  techCard,
  techCardId,
  canEdit,
}: {
  techCard?: common_TechCard;
  techCardId: number;
  canEdit: boolean;
}) {
  // ТОЛЬКО КАРТОЧНЫЕ РАСКЛАДКИ (Ф4.2). Раскройные маркеры прогонов приезжают в том же поле
  // `techCard.markers` — отдельного списка у клиента нет, — и этот экран ими не заведует: их
  // видно на странице прогона, у них нет самостоятельной жизни, и удалять/назначать нормой их
  // отсюда нельзя (норма прогонной раскладке запрещена CHECK'ом на схеме). Фильтр — один на
  // клиент, из marker-io; здесь он ставится НА ИСТОЧНИК, поэтому карточными оказываются и
  // таблица, и сводка конфликтов, и пустое состояние, и поиск прежней нормы ниже.
  const markers = useMemo(() => cardMarkers(techCard?.markers), [techCard?.markers]);
  // Колорвей маркера — имя, а не id. Без него две раскладки одного слота на разных ширинах
  // различаются только числом в колонке «ширина», и понять, которая из них чья, нельзя.
  const colorwayLabelById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of techCard?.colorways ?? []) {
      const id = Number(c.colorwayId ?? 0);
      if (id) m.set(id, colorwayLabelOf(c));
    }
    return m;
  }, [techCard?.colorways]);
  const sizeById = useSizeNames();
  // Имя размера по id — одно на весь экран: и в колонке состава, и в подписи открытого маркера.
  const sizeName = (id: number) => formatSizeName(sizeById.get(id) ?? `#${id}`);
  const season = (useWatch<TechCardFormData>({ name: 'season' }) ?? '') as string;
  const styleNumber = (useWatch<TechCardFormData>({ name: 'styleNumber' }) ?? '') as string;
  // НАПРАВЛЕНИЕ ТКАНИ ОТКРЫТОГО МАРКЕРА. Раньше сюда не передавалось ничего, и модалка вдобавок
  // подменяла его на 'unknown' в режиме просмотра — то есть ручной редактор ПРЕДЛАГАЛ поставить
  // деталь на 180° на ворсовой ткани. Правка старого маркера с таким поворотом уходила в базу:
  // сервер милует строки, чьё поколение политики младше 3, и поколение при этом не двигает, так
  // что строка остаётся помилованной навсегда. Помилование, заведённое защищать старые ЗАМЕРЫ,
  // начинало узаконивать новый брак — и именно на старых строках, ради которых и заводилось.
  //
  // Скоуп резолвится тут, а не в модалке: BOM карточки под рукой только здесь.
  const bomItems = (useWatch<TechCardFormData>({ name: 'bomItems' }) ?? []) as Array<{
    section?: string;
    lineKey?: string;
    purpose?: string;
    fabricDirection?: string;
    isSample?: boolean;
  }>;
  const rollGoodsLines = useMemo(
    () =>
      bomItems
        .filter((b) => isRollGoodsSection(b.section) && b.lineKey)
        .map((b) => ({
          lineKey: b.lineKey as string,
          purpose: b.purpose ?? '',
          fabricDirection: b.fabricDirection ?? '',
          isSample: !!b.isSample,
        })),
    [bomItems],
  );
  // СТРОКИ ВЫКРОЕК КАРТОЧКИ — источник файлов для пересборки чертежа при экспорте (§7.5). Сервер
  // стирает source_url на сохранении маркера (объекты CDN собираются сборщиком мусора, как только
  // на них не ссылается ни одна строка), поэтому единственный законный источник — СЕГОДНЯШНИЕ
  // строки, а «сегодняшний файл тот же самый» доказывает сверка контура внутри пересборки.
  const patternRows = (useWatch<TechCardFormData>({ name: 'patterns' }) ??
    []) as MarkerPatternRow[];
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();

  const [view, setView] = useState<common_TechCardMarker | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // Назначение нормы: подтверждение, занятость и ПЕРЕЖИВАЮЩАЯ строка о последствиях.
  const [norming, setNorming] = useState<{
    id: number;
    name: string;
    slot: string;
    on: boolean;
    refusal: string;
  } | null>(null);
  const [normBusy, setNormBusy] = useState(false);
  // Почему это НЕ тост. Переназначение нормы рецепты не пересчитывает, и починка (применить новую
  // норму) делается на ДРУГОЙ вкладке — тост до неё не доживёт, а несделанное применение значит,
  // что костинг продолжает считать по прежнему числу. Плашка висит, пока её не закроют.
  const [normNote, setNormNote] = useState<string | null>(null);
  // ДВЕ НОРМЫ В ОДНОМ СКОУПЕ — состояние, которое сервер сообщает ЯВНО (norm_conflict на каждой
  // строке скоупа). Схема его не запрещает намеренно: уникальный индекс на норме превращает
  // удаление строки BOM в ошибку 1761 и роняет сохранение всей карточки. Читатели разрешают
  // конфликт детерминированно (самая свежая), поэтому экран обязан сказать о нём вслух — молчащий
  // читатель, который «сам разобрался», хуже двух норм.
  const conflicts = useMemo(() => {
    const seen = new Set<string>();
    for (const m of markers) {
      const t = (m.normConflict ?? '').trim();
      if (t) seen.add(t);
    }
    return [...seen];
  }, [markers]);
  // Непривязанная раскладка — 'unknown': ткани у неё нет, спрашивать не у чего, и с белым списком
  // allowsFlip это значит «переворот не предлагаем», что для геометрии без цели и правильно.
  const viewDirection: ScopeDirection = useMemo(
    () => markerScopeDirection(view?.summary?.bomLineKey ?? '', rollGoodsLines),
    [view?.summary?.bomLineKey, rollGoodsLines],
  );

  // ── §7.5: ВЫКРОЙКИ ОТКРЫТОГО МАРКЕРА ──────────────────────────────────────────────────
  //
  // Здесь стояло files={null}, и из-за этого экспорт переоткрытого маркера выдавал файл без
  // линии шва и надсечек: чертёж детали в блоб не пишется (он производный), а пересобрать его
  // не из чего, если модалке не дать сегодняшние выкройки.
  //
  // ПРИВЯЗКА ЛИСТА — НЕ ТОЛЬКО СТРОКА BOM. С 0267 у листа есть ещё и НАЗНАЧЕНИЕ (fabricPurpose),
  // и оно резолвится ПЕРЕД bomLineKey: лист «основного материала» обслуживает ВСЕ строки этого
  // назначения и своего bomLineKey не несёт вовсе. Фильтр `row.bomLineKey === summary.bomLineKey`
  // такие листы теряет — и карточка, у которой выкройки загружены, отвечает «выкройки не
  // загружены». Резолвер строится здесь, потому что BOM карточки есть только здесь; сам отбор
  // строк живёт в marker-rebuild рядом с пересборкой.
  const scopes = useMemo(() => fabricScopes(rollGoodsLines), [rollGoodsLines]);
  const viewSources = useMemo(() => {
    if (!view) return [];
    const key = (view.summary?.bomLineKey ?? '').trim();
    // Скоуп СТРОКИ маркера, а не сырой ключ: строку могли разложить в назначение уже после
    // съёмки, и сравнение сырых ключей потеряло бы листы ровно в тот момент, когда оператор
    // навёл порядок в BOM (то же правило, что scopeKeyOfBinding на панели выкроек).
    const scope = key ? scopes.find((s) => s.lines.some((l) => l.lineKey === key)) : undefined;
    return patternSourcesForMarker(patternRows, {
      bomLineKey: key,
      purposeOwnsLine: (p) => !!scope?.byPurpose && scope.key === p,
    });
  }, [view, scopes, patternRows]);
  // ЗАВИСИМОСТЬ ПО СОДЕРЖИМОМУ, А НЕ ПО ССЫЛКЕ. useWatch отдаёт свежий клон массива при ЛЮБОМ
  // изменении формы, а новый массив `files` — это новый прогон эффекта useNesting, то есть
  // повторное скачивание выкроек с CDN и повторный разбор в воркере. Со ссылочной зависимостью
  // правка соседнего поля карточки перекачивала бы десятки мегабайт при открытой модалке.
  const viewFilesKey = useMemo(
    () => viewSources.map((f) => `${f.name} -> ${f.url}`).join(' | '),
    [viewSources],
  );
  const viewFiles = useMemo(
    () => (viewSources.length > 0 ? viewSources : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ключ содержимого, см. комментарий
    [viewFilesKey],
  );

  const openMarker = async (id: number) => {
    setOpeningId(id);
    try {
      const r = await adminService.GetTechCardMarker({ id });
      if (r.marker) setView(r.marker);
      else showMessage('маркер не найден', 'error');
    } catch (e) {
      showMessage(e instanceof Error && e.message ? e.message : 'не удалось открыть маркер', 'error');
    } finally {
      setOpeningId(null);
    }
  };

  // ПЕРЕНАЗНАЧЕНИЕ НОРМЫ НЕ СЧИТАЕТ НИЧЕГО. Рецепт хранит СКОПИРОВАННОЕ число с провенансом
  // consumption_source='marker' и ссылки на маркер не держит; серверного «применить маркер» не
  // существует вовсе. Поэтому переназначение меняет только то, КАКАЯ раскладка авторитетна, а
  // применённый расход остаётся прежним — и экран обязан сказать это вслух, иначе оператор
  // решит, что костинг переехал сам.
  const setNorm = async () => {
    if (!norming) return;
    setNormBusy(true);
    try {
      const r = await adminService.SetTechCardMarkerNorm({ id: norming.id, isNorm: norming.on });
      const prevId = Number(r.previousNormMarkerId ?? 0);
      const prev = prevId ? markers.find((x) => Number(x.id ?? 0) === prevId) : undefined;
      // Читается ПОЛЕ, а не подразумевается: сервер отвечает recipes_not_recalculated = true
      // именно затем, чтобы это не было домыслом экрана. Отсутствие поля читаем как «не
      // пересчитаны» — пересчитывать некому ни на одной версии сервера.
      const notRecalculated = r.recipesNotRecalculated !== false;
      setNormNote(
        norming.on
          ? `норма ${scopeWord(norming.slot)} теперь «${norming.name}»${
              prev ? `, прежней была «${prev.name ?? ''}»` : ''
            }.${
              notRecalculated
                ? ' Рецепты НЕ пересчитаны: расход, применённый в рецепт из прежней нормы, остался прежним числом. Если он должен измениться — примените новую раскладку в расходе колорвея вручную.'
                : ''
            }`
          : `«${norming.name}» больше не норма ${scopeWord(norming.slot)}. Другой нормы вместо неё не появилось — назначьте её, иначе костингу и гейту готовности нечего спрашивать.${
              notRecalculated ? ' Рецепты не пересчитаны: применённый расход остался прежним.' : ''
            }`,
      );
      showMessage(norming.on ? 'норма назначена' : 'норма снята', 'success');
      qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
      qc.invalidateQueries({ queryKey: techCardKeys.lists() });
      setNorming(null);
    } catch (e) {
      showMessage(
        e instanceof Error && e.message ? e.message : 'не удалось изменить норму',
        'error',
      );
    } finally {
      setNormBusy(false);
    }
  };

  const deleteMarker = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await adminService.DeleteTechCardMarker({ id: deleting.id });
      showMessage('маркер удалён', 'success');
      qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
      qc.invalidateQueries({ queryKey: techCardKeys.lists() });
      setDeleting(null);
    } catch (e) {
      showMessage(e instanceof Error && e.message ? e.message : 'не удалось удалить маркер', 'error');
    } finally {
      setDeleteBusy(false);
    }
  };

  if (markers.length === 0) {
    return (
      <Text size='micro' variant='label'>
        сохранённых раскладок нет — запустите «⌗ раскладка» на плитке размера и нажмите
        «сохранить раскладку»
      </Text>
    );
  }

  return (
    <div className='space-y-2'>
      {conflicts.map((t) => (
        <CalloutBox key={t} tone='error'>
          <Text size='micro' component='p'>
            <b>две нормы на одной ткани.</b> {t} Костинг и гейт берут самую свежую из них, то есть
            ответ везде один — но выбран он датой, а не человеком. Нажмите «сделать нормой» на той
            раскладке, по которой мерить: назначение снимет признак со второй.
          </Text>
        </CalloutBox>
      ))}
      {normNote && (
        // Плашка, а не тост: применять новую норму надо на другой вкладке, и сообщение обязано
        // дожить до туда.
        <CalloutBox tone='warning'>
          <div className='flex items-start justify-between gap-2'>
            <Text size='micro' component='p'>
              {normNote}
            </Text>
            <Button type='button' variant='secondary' size='xs' onClick={() => setNormNote(null)}>
              понятно
            </Button>
          </div>
        </CalloutBox>
      )}
      <div className='overflow-x-auto'>
        <DataTable variant='grid' className='[&_td]:text-micro [&_th]:text-nano'>
          <thead>
            <tr>
              <th>название</th>
              {/* СОСТАВ вместо размера: раскладка больше не «один размер», она называет, сколько
                  изделий какого размера кроит один настил. У снятых до Ф2 состав ровно один
                  размер, и колонка выглядит как прежняя. */}
              <th>состав</th>
              <th>слот BOM</th>
              <th>ширина</th>
              <th>длина</th>
              <th>изделий</th>
              <th>расход / ед</th>
              <th>эфф.</th>
              {/* УСЛОВИЯ СЪЁМКИ (Ф3). Без них длина настила — число без правил: раскладка по
                  линии шва и раскладка по линии кроя отличаются на припуск по всему периметру
                  КАЖДОЙ детали, а в колонке «длина» выглядят одинаково. */}
              <th>припуск</th>
              <th>слои / переворот</th>
              <th>обновлён</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {markers.map((m) => {
              const cons = consumptionCm(m);
              // Отказ выдать скалярную норму. Он ЗАМЕЩАЕТ число в колонке расхода, а не
              // приписывается к нему: на смешанном составе средняя по составу выглядит как
              // обычная норма, и глазом её не отличить.
              const refusal = scalarNormRefusal(m);
              const comp = compositionOf(m);
              const cond = conditionsOf(m);
              const allow = allowanceText(cond);
              const lines = conditionLines(cond);
              const legacy = isLegacyNorm(m);
              const conflict = (m.normConflict ?? '').trim();
              // НЕИЗВЕСТНОСТЬ — НЕ ИЗМЕНЕНИЕ, и поле поэтому трёхзначное: маркер, снятый до Ф3,
              // отпечатка не несёт, и объявить его «изменившимся» значило бы разом пометить ВСЕ
              // старые раскладки — шум там, где нужен сигнал. Поэтому у неизвестности бейджа нет.
              const setUnknown = !pieceSetChanged(m) && m.pieceSetStatus !== PIECE_SET_MATCHES;
              return (
                <tr key={m.id}>
                  <td>
                    <span className='inline-flex items-center gap-1.5'>
                      <span className='max-w-[180px] truncate'>{m.name}</span>
                      <Pill tone='mut'>{SOURCE_LABEL[m.source ?? ''] ?? m.source}</Pill>
                    </span>
                    {(m.isNorm || pieceSetChanged(m) || legacy || conflict || setUnknown) && (
                      <span className='mt-0.5 flex flex-wrap items-center gap-1'>
                        {m.isNorm && (
                          // ЧЁРНАЯ, а не цветная: назначение нормы — РЕШЕНИЕ человека, а не
                          // состояние «сломано / в полёте / готово», и цвет в этой системе несёт
                          // только состояние.
                          <Pill
                            tone='ink'
                            title='нормировочная раскладка ЭТОЙ ткани на карточке: по ней считает костинг и её спрашивает гейт готовности. Норма одна на ткань, а не одна на карточку.'
                          >
                            норма
                          </Pill>
                        )}
                        {pieceSetChanged(m) && (
                          <Pill
                            tone='attention'
                            title='набор деталей КАРТОЧКИ изменился с момента съёмки — раскладку надо перепроверить. Отпечаток карточный, поэтому деталь, добавленная на ДРУГУЮ ткань, поднимает признак и здесь: это «перепроверьте», а не «раскладка неверна».'
                          >
                            набор изменился
                          </Pill>
                        )}
                        {legacy && (
                          // Категория ПРОИЗВОДНАЯ: своего флага у неё нет и не будет — непомеченное
                          // само остаётся старым. Серая, потому что сегодня такова КАЖДАЯ строка,
                          // снятая до Ф3, и красить их все значило бы закрасить весь список.
                          <Pill
                            tone='mut'
                            title='условия съёмки не записаны: по какой линии мерено и с каким припуском — неизвестно. Костинг не отличит раскладку по линии шва от раскладки по линии кроя, а различаются они на припуск по всему периметру каждой детали. Пересними раскладку, чтобы норма стала сравнимой.'
                          >
                            старая норма
                          </Pill>
                        )}
                        {conflict && (
                          // Сервер сообщает конфликт ЯВНО и одним текстом на КАЖДОЙ строке
                          // скоупа: увидеть его с одной строки и пропустить с другой нельзя.
                          <Pill tone='warn' title={conflict}>
                            конфликт норм
                          </Pill>
                        )}
                        {setUnknown && !legacy && (
                          // Условия записаны, а отпечаток посчитать не удалось: тихая серая
                          // подпись, а не бейдж. У старой нормы её не показываем — там про набор
                          // и так ничего не известно, и второе слово об одном и том же лишнее.
                          <Text size='nano' variant='label' component='span'>
                            набор не сверялся
                          </Text>
                        )}
                      </span>
                    )}
                  </td>
                  <td>
                    {compositionLabel(comp, sizeName) || (
                      <Text size='nano' variant='label' component='span'>
                        состав не читается
                      </Text>
                    )}
                  </td>
                  <td>
                    {/* The wire cannot tell «never linked» from «slot deleted» (both come
                        from the same LEFT JOIN going NULL) — one honest label, no fake pill. */}
                    {m.bomItemName || (
                      <Text size='nano' variant='label' component='span'>
                        не привязан / удалён
                      </Text>
                    )}
                    {/* «общая» — это НЕ отсутствие данных: маркер снят до 0264 или ширина у всех
                        колорвеев одна, и такая раскладка законно предлагается каждому. Пустая
                        ячейка читалась бы как недозаполненная. */}
                    <span className='block text-nano text-labelColor'>
                      {colorwayLabelById.get(Number(m.colorwayId ?? 0)) ??
                        (Number(m.colorwayId ?? 0) ? 'колорвей не в карточке' : 'общая')}
                    </span>
                  </td>
                  <td>{decNum(m.fabricWidthCm)} см</td>
                  <td>{decNum(m.usedLengthCm)} см</td>
                  <td>{totalUnitsOf(m) || <EmptyCell />}</td>
                  <td className='font-semibold'>
                    {cons != null ? (
                      `${cons} см`
                    ) : refusal ? (
                      // Слово, а не пустая ячейка: пустая читается как «ещё не посчитали», тогда
                      // как здесь считать НЕЧЕГО — и причина висит подсказкой на самой пилюле.
                      <Pill tone='warn' title={refusal}>
                        {comp.length > 1 ? 'смешанный состав' : 'состав не читается'}
                      </Pill>
                    ) : (
                      <EmptyCell />
                    )}
                  </td>
                  <td>{decNum(m.efficiencyPct) ? `${decNum(m.efficiencyPct)} %` : <EmptyCell />}</td>
                  <td>
                    {/* НИКОГДА не «0 см» вместо незаписанного: ноль — это утверждение о замере
                        («клали линию как нарисована»), а здесь замера не делал никто. */}
                    {allow ? (
                      <>
                        {allow.total}
                        <span className='block text-nano text-labelColor'>{allow.origin}</span>
                      </>
                    ) : (
                      <Text size='nano' variant='label' component='span'>
                        {NOT_RECORDED}
                      </Text>
                    )}
                  </td>
                  <td>
                    {lines.length > 0 ? (
                      lines.map((l) => (
                        <span key={l} className='block text-nano text-labelColor'>
                          {l}
                        </span>
                      ))
                    ) : (
                      <Text size='nano' variant='label' component='span'>
                        {NOT_RECORDED}
                      </Text>
                    )}
                  </td>
                  <td>
                    <span title={m.updatedBy || ''}>{formatTechCardDate(m.updatedAt)}</span>
                  </td>
                  <td>
                    <span className='inline-flex gap-1'>
                      <Button
                        type='button'
                        variant='secondary'
                        size='xs'
                        disabled={openingId === m.id}
                        onClick={() => openMarker(m.id ?? 0)}
                      >
                        {openingId === m.id ? 'открываем…' : 'открыть'}
                      </Button>
                      {canEdit && (
                        // Отдельное действие, а не поле сохранения: пересохранение геометрии не
                        // должно уметь перехватить норму, а стейлый бандл — снять её, не зная о
                        // признаке. Снятие оставлено рядом с назначением: без него ошибочно
                        // назначенную норму нечем убрать, когда назначать вместо неё нечего.
                        <Button
                          type='button'
                          variant='secondary'
                          size='xs'
                          onClick={() =>
                            setNorming({
                              id: m.id ?? 0,
                              name: m.name ?? '',
                              slot: m.bomItemName ?? '',
                              on: !m.isNorm,
                              refusal,
                            })
                          }
                        >
                          {m.isNorm ? 'снять норму' : 'сделать нормой'}
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          type='button'
                          variant='secondary'
                          size='xs'
                          aria-label='удалить маркер'
                          onClick={() => setDeleting({ id: m.id ?? 0, name: m.name ?? '' })}
                        >
                          ✕
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>

      {view && (
        <Suspense
          fallback={
            <Text size='micro' variant='label'>
              загрузка модуля раскладки…
            </Text>
          }
        >
          <NestingModal
            // §7.5: сегодняшние выкройки ЭТОЙ ткани — то, из чего пересобирается чертёж детали
            // при экспорте. null здесь означал «пересобрать не из чего», и модалка обязана
            // сказать это словами, а не выдать DXF без линии шва.
            files={viewFiles}
            view={view}
            techCardId={techCardId}
            canEdit={canEdit}
            // Подпись маркера — его СОСТАВ, а не размер: у раскладки с составом size_id = 0, и
            // прежняя строка печатала бы «#0» в заголовке модалки и в имени экспортируемого файла.
            sizeLabel={view.summary ? compositionLabel(compositionOf(view.summary), sizeName) : ''}
            season={season}
            styleNumber={styleNumber}
            // Направление РЕАЛЬНОЙ ткани этого маркера. Ручной редактор предлагает повороты по
            // нему, поэтому на ворсовой строке 180° он больше не предложит. Уже лежащий в блобе
            // поворот при этом никуда не денется — rotsFor всегда держит текущий в цикле.
            fabricDirection={viewDirection}
            onClose={() => setView(null)}
          />
        </Suspense>
      )}

      <ConfirmationModal
        open={deleting != null}
        onOpenChange={(o) => {
          if (!o && !deleteBusy) setDeleting(null);
        }}
        onConfirm={deleteMarker}
        onCancel={() => {
          if (!deleteBusy) setDeleting(null);
        }}
        title='удалить маркер?'
        confirmLabel={deleteBusy ? 'удаляем…' : 'удалить'}
        confirmDisabled={deleteBusy}
        closeOnConfirm={false}
      >
        <Text size='micro' component='p'>
          «{deleting?.name}» будет удалён насовсем. Записанный в рецепты расход не изменится —
          пропадёт только сам маркер и его подсказка в костинге.
        </Text>
      </ConfirmationModal>

      <ConfirmationModal
        open={norming != null}
        onOpenChange={(o) => {
          if (!o && !normBusy) setNorming(null);
        }}
        onConfirm={setNorm}
        onCancel={() => {
          if (!normBusy) setNorming(null);
        }}
        title={norming?.on === false ? 'снять норму?' : 'сделать нормой?'}
        confirmLabel={
          norming?.on === false
            ? normBusy
              ? 'снимаем…'
              : 'снять норму'
            : normBusy
              ? 'назначаем…'
              : 'сделать нормой'
        }
        confirmDisabled={normBusy}
        closeOnConfirm={false}
      >
        <div className='space-y-2'>
          {norming?.on === false ? (
            <Text size='micro' component='p'>
              «{norming?.name}» перестанет быть нормой {scopeWord(norming?.slot ?? '')}. Другой
              нормы вместо неё не появится: снятие ничего не назначает, и до следующего назначения
              ткань останется ненормированной — гейт готовности это увидит.
            </Text>
          ) : norming?.slot ? (
            <Text size='micro' component='p'>
              «{norming?.name}» станет нормировочной раскладкой {scopeWord(norming?.slot ?? '')}: по
              ней считает костинг и её спрашивает гейт готовности. Прежняя норма ЭТОЙ ЖЕ ткани
              признак потеряет — норма одна на ткань, а не одна на карточку, и норм других тканей
              это не касается.
            </Text>
          ) : (
            <Text size='micro' component='p'>
              «{norming?.name}» не привязана к ткани, поэтому попадёт в собственный скоуп «без
              ткани» — одна такая норма на карточку. Гейт готовности её всё равно не примет: он
              спрашивает про ткань. Привяжите раскладку к слоту BOM, если она должна нормировать.
            </Text>
          )}
          <Text size='micro' component='p'>
            Рецепты не пересчитываются. Число, уже применённое в рецепт из прежней нормы, останется
            прежним: применение — отдельное осознанное действие (расход колорвея → применить
            раскладку). Признак говорит только, ПО КАКОЙ раскладке мерить, и сам ничего не считает.
          </Text>
          {norming?.on !== false && !!norming?.refusal && (
            <Text size='micro' variant='label' component='p'>
              {norming.refusal} Нормой такую раскладку назначить можно — она остаётся замером
              настила, — но применить её в рецепт одним числом нельзя.
            </Text>
          )}
        </div>
      </ConfirmationModal>
    </div>
  );
}
