// Сохранённые раскладки (маркеры) карточки — the fourth Section of the patterns tab.
// Summaries ride GetTechCard; the geometry blob is fetched only when a marker is opened
// (GetTechCardMarker → NestingModal in view mode, same lazy chunk as the nesting itself).
import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type {
  common_TechCard,
  common_TechCardMarker,
  common_TechCardMarkerSummary,
} from 'api/proto-http/admin';
import { useSizeNames } from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { colorwayLabelOf } from './colorway-widths';
import { formatTechCardDate } from 'components/managers/tech-cards/components/utils';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';
import {
  Button,
  CalloutBox,
  ConfirmationModal,
  GroupLabel,
  Pill,
  Row,
  Text,
  EmptyCell,
  Close,
} from 'ui';
import {
  cardMarkers,
  compositionLabel,
  compositionOf,
  conditionsOf,
  consumptionCm,
  decNum,
  isDraftMarker,
  isLegacyNorm,
  pieceSetChanged,
  refusalWord,
  scalarNormRefusal,
  totalUnitsOf,
  type MarkerConditions,
} from './marker-io';
// Правило «какие листы выкроек относятся к ЭТОЙ раскладке» живёт в marker-rebuild вместе с самой
// пересборкой — второй его копии здесь быть не должно. Модуль зависит только от типов и от чистой
// geom/, так что импорт в НЕленивый чанк не тащит ни clipper, ни dxf-parser.
import { patternSourcesForMarker, type MarkerPatternRow } from './marker-rebuild';
import { planAutoNorm } from './auto-norm';
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
  auto: 'auto',
  manual: 'manual',
  imported: 'imported',
};

// ── УСЛОВИЯ СЪЁМКИ В СТРОКЕ (Ф3) ────────────────────────────────────────────────────────
//
// «НЕ ЗАПИСАНО» — ЭТО ОТВЕТ, А НЕ ПРОБЕЛ, и печатать вместо него 0 запрещено. Ноль припуска —
// законное значение и означает «клали линию как нарисована», то есть УТВЕРЖДЕНИЕ о замере;
// незаписанный припуск означает, что замера не делал никто. Ровно этим «старая норма» и
// отличается от свежей раскладки с нулевым припуском, а на глаз они выглядели бы одинаково.
const NOT_RECORDED = 'not recorded';

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
    total: `${(seam + (contour ?? 0)).toFixed(1)} mm`,
    origin:
      contour == null
        ? // Замерить было нечем (один замкнутый контур в блоке). Сумма поэтому неполная, и
          // молчать об этом нельзя: припуск может сидеть в контуре и не быть посчитанным.
          'not measured in the contour'
        : contour > 0
          ? 'allowance already in the contour'
          : seam > 0
            ? 'applied onto the seam line'
            : 'contour = seam line',
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
        ? 'there were no layers'
        : c.contourLayer;
  // ПУСТАЯ СТРОКА У ДОЛЕВОЙ — ЗНАЧЕНИЕ, а не пропуск: оператор мог осознанно выключить разворот.
  // Склеить её с «не записано» значило бы при пересборке чертежа развернуть детали, которые он
  // запретил разворачивать, — поэтому прото и держит поле optional.
  const grain =
    c.grainLayer == null ? NOT_RECORDED : c.grainLayer === '' ? "don't rotate" : c.grainLayer;
  const flip = c.allowFlip == null ? NOT_RECORDED : c.allowFlip ? 'allowed' : 'forbidden';
  return [`contour: ${contour}`, `grainline: ${grain}`, `flip: ${flip}`];
}

const PIECE_SET_MATCHES = 'TECH_CARD_MARKER_PIECE_SET_STATUS_MATCHES';

// Состав словами строки: 'xs ×1' для одного размера, 'xs 1 · s 2' для смешанного настила.
// Число изделий (бывшая колонка «garments») сидит здесь же — отдельной колонки больше нет.
function compositionText(
  comp: readonly { sizeId: number; quantity: number }[],
  sizeName: (id: number) => string,
): string {
  if (comp.length === 0) return '';
  if (comp.length === 1) return `${sizeName(comp[0].sizeId)} ×${comp[0].quantity}`;
  return comp.map((c) => `${sizeName(c.sizeId)} ${c.quantity}`).join(' · ');
}

// АВТОИМЯ НЕ ПОКАЗЫВАЕМ: оно склеено из размера, колорвея и ткани (baseMarkerName) и повторяет то,
// что строка и так говорит составом и группой. Показываем только имя, которое дал человек.
function isAutoName(m: common_TechCardMarkerSummary, sizeLabels: readonly string[]): boolean {
  // Только имя, совпадающее с генерированным образцом «размер · …» — переименованная человеком
  // раскладка (даже автоматическая по происхождению) остаётся видна по имени (Codex r5).
  const name = (m.name ?? '').trim();
  if (!name.includes(' · ')) return false;
  const head = name
    .split(' · ')[0]
    .trim()
    .toLowerCase()
    .replace(/\s*[×x]\s*\d+$/, '');
  return sizeLabels.some((l) => l.trim().toLowerCase() === head);
}

// Всё, что сняли со строки, уезжает в её подсказку — ничего не теряется.
function rowTooltip(m: common_TechCardMarkerSummary, colorway: string): string {
  const cond = conditionsOf(m);
  const allow = allowanceText(cond);
  const lines = conditionLines(cond);
  const units = totalUnitsOf(m);
  const updated = formatTechCardDate(m.updatedAt);
  return [
    m.name ?? '',
    `source: ${SOURCE_LABEL[m.source ?? ''] ?? m.source ?? ''}`,
    `BOM slot: ${m.bomItemName || 'not linked / deleted'}`,
    `colourway: ${colorway || 'shared'}`,
    units ? `garments: ${units}` : '',
    `seam allowance: ${allow ? `${allow.total} (${allow.origin})` : NOT_RECORDED}`,
    ...(lines.length > 0 ? lines : [`layers / flip: ${NOT_RECORDED}`]),
    isLegacyNorm(m) ? 'legacy norm: capture conditions not recorded' : '',
    !pieceSetChanged(m) && !isLegacyNorm(m) && m.pieceSetStatus !== PIECE_SET_MATCHES
      ? 'piece set not checked'
      : '',
    updated ? `updated ${updated}${m.updatedBy ? ` by ${m.updatedBy}` : ''}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// Как назвать скоуп эксклюзивности словами. Скоуп — (карточка, строка BOM), то есть «одна норма
// на ТКАНЬ»; непривязанная раскладка попадает в собственный скоуп «без ткани», и он тоже скоуп.
const scopeWord = (slot: string) => (slot ? `fabric “${slot}”` : 'the “no fabric” scope');

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
  // Удаление нормы: куда она переедет (тот же план, что у автоматики, без удаляемой раскладки).
  const deletingNorm =
    deleting != null && markers.some((m) => Number(m.id) === deleting.id && m.isNorm);
  const nextNorm = useMemo(() => {
    if (!deleting || !deletingNorm) return undefined;
    const gone = markers.find((m) => Number(m.id) === deleting.id);
    const scope = (gone?.bomLineKey ?? '').trim();
    const rest = markers.filter((m) => Number(m.id) !== deleting.id);
    return (
      planAutoNorm(rest).find((st) => st.scope === scope)?.marker ??
      rest.find((m) => m.isNorm && (m.bomLineKey ?? '').trim() === scope)
    );
  }, [deleting, deletingNorm, markers]);
  // НОРМА НАЗНАЧАЕТСЯ САМА (auto-norm.ts): последняя созданная годная раскладка ткани. Попытки
  // помнятся по ключу id@updated_at — одна и та же версия раскладки не назначается дважды, и отказ
  // сервера не превращается в ретрай на каждом рендере. `normRunning` не пускает второй проход,
  // пока идёт первый: записи идут строго по одной, значит и на строку BOM — одна в полёте.
  // `normPass` перезапускает эффект после прохода — шаги, пришедшие, пока он шёл, не теряются.
  const normTried = useRef(new Set<string>());
  const normRunning = useRef(false);
  const [normPass, setNormPass] = useState(0);
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
      else showMessage('marker not found', 'error');
    } catch (e) {
      showMessage(
        e instanceof Error && e.message ? e.message : "couldn't open the marker",
        'error',
      );
    } finally {
      setOpeningId(null);
    }
  };

  // ПЕРЕНАЗНАЧЕНИЕ НОРМЫ НЕ СЧИТАЕТ НИЧЕГО. Рецепт хранит СКОПИРОВАННОЕ число с провенансом
  // consumption_source='marker'; серверного «применить маркер» не существует вовсе — применяет
  // клиент, сервер только записывает присланное. Поэтому переназначение меняет только то, КАКАЯ
  // раскладка авторитетна, а применённый расход остаётся прежним — и экран обязан сказать это
  // вслух, иначе оператор решит, что костинг переехал сам.
  //
  // Ф6.8 добавила строке рецепта norm_marker_id — но это ШТАМП АУДИТА, а не живая связь: он
  // говорит, из какой раскладки число когда-то взяли, и ничего не пересчитывает. Ровно поэтому
  // предупреждение ниже остаётся верным и после Ф6.8, а расхождение «раскладку с тех пор
  // перемеряли» показывается на строке рецепта, а не здесь.
  //
  // Поэтому назначение — автоматическое, а последствие — нет: если норма ткани СМЕНИЛАСЬ (была
  // прежняя), плашка говорит, что рецепты держат старое число и применить новое надо руками.
  // Первое назначение (прежней нормы не было) плашки не даёт: устаревать в рецептах нечему.
  const autoSteps = useMemo(() => (canEdit ? planAutoNorm(markers) : []), [canEdit, markers]);
  useEffect(() => {
    if (normRunning.current) return;
    const steps = autoSteps.filter((s) => !normTried.current.has(s.key));
    if (steps.length === 0) return;
    normRunning.current = true;
    for (const s of steps) normTried.current.add(s.key);
    (async () => {
      const notes: string[] = [];
      let changed = false;
      for (const s of steps) {
        const id = Number(s.marker.id ?? 0);
        try {
          // ПЕРЕЧИТАТЬ ПЕРЕД ЗАПИСЬЮ. План посчитан по кэшу карточки (staleTime 5 мин), а рядом
          // может идти параллельное сохранение/назначение. Пишем, только если план по СВЕЖЕМУ
          // списку для этой ткани тот же самый (та же раскладка, она ещё не норма); иначе —
          // пропуск: инвалидация ниже принесёт свежий список, и следующий проход решит по нему.
          const fresh = await adminService.GetTechCard({
            id: techCardId,
            vatCountryCode: undefined,
          });
          const freshStep = planAutoNorm(cardMarkers(fresh.techCard?.markers)).find(
            (x) => x.scope === s.scope,
          );
          if (!freshStep || Number(freshStep.marker.id ?? 0) !== id) {
            changed = true; // кэш устарел — перечитать
            continue;
          }
          const r = await adminService.SetTechCardMarkerNorm({ id, isNorm: true });
          changed = true;
          const prevId = Number(r.previousNormMarkerId ?? 0);
          const prev = prevId
            ? cardMarkers(fresh.techCard?.markers).find((x) => Number(x.id ?? 0) === prevId)
            : undefined;
          // Поле читается, а не подразумевается: отсутствие = «не пересчитаны».
          if (prevId && r.recipesNotRecalculated !== false) {
            notes.push(
              `the norm of ${scopeWord(s.marker.bomItemName ?? '')} is now the newest complete marker “${
                s.marker.name ?? ''
              }”${prev ? ` (was “${prev.name ?? ''}”)` : ''}. recipes were NOT recalculated: the consumption already applied from the previous norm stays the same number — if it has to change, apply the new marker in the colourway consumption.`,
            );
          }
        } catch (e) {
          // Тихо не глотаем: оператор должен знать, что у ткани осталась прежняя норма (или никакой).
          showMessage(
            `couldn't make “${s.marker.name ?? ''}” the norm: ${
              e instanceof Error && e.message ? e.message : 'unknown error'
            }`,
            'error',
          );
        }
      }
      if (notes.length > 0) setNormNote(notes.join('\n'));
      if (changed) {
        await qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
        qc.invalidateQueries({ queryKey: techCardKeys.lists() });
      }
      normRunning.current = false;
      setNormPass((n) => n + 1);
    })();
  }, [autoSteps, normPass, qc, showMessage, techCardId]);

  const deleteMarker = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await adminService.DeleteTechCardMarker({ id: deleting.id });
      showMessage('marker deleted', 'success');
      qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
      qc.invalidateQueries({ queryKey: techCardKeys.lists() });
      setDeleting(null);
    } catch (e) {
      showMessage(
        e instanceof Error && e.message ? e.message : "couldn't delete the marker",
        'error',
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  // Группы по строке BOM — только когда тканей больше одной; иначе заголовок группы повторял бы
  // секцию.
  const groups = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string; markers: typeof markers }>();
    for (const m of markers) {
      const label = (m.bomItemName ?? '').trim();
      const key = label || '\u0000';
      let g = byKey.get(key);
      if (!g) {
        g = { key, label: label || 'not linked', markers: [] };
        byKey.set(key, g);
      }
      g.markers.push(m);
    }
    return [...byKey.values()];
  }, [markers]);

  if (markers.length === 0) {
    return (
      <Text size='micro' variant='label'>
        no saved markers
      </Text>
    );
  }

  const renderRow = (m: common_TechCardMarkerSummary, last: boolean) => {
    const id = Number(m.id ?? 0);
    const cons = consumptionCm(m);
    // Отказ выдать скалярную норму ЗАМЕЩАЕТ число, а не приписывается к нему: на смешанном составе
    // средняя по составу выглядит как обычная норма, и глазом её не отличить.
    const refusal = scalarNormRefusal(m);
    const comp = compositionOf(m);
    const draft = isDraftMarker(m);
    const conflict = (m.normConflict ?? '').trim();
    const changed = pieceSetChanged(m);
    const name = (m.name ?? '').trim();
    const custom =
      name &&
      !isAutoName(
        m,
        comp.map((c) => sizeName(c.sizeId)),
      );
    const colorway = Number(m.colorwayId ?? 0)
      ? colorwayLabelById.get(Number(m.colorwayId)) ?? 'colourway not on the card'
      : '';
    const width = decNum(m.fabricWidthCm);
    const length = decNum(m.usedLengthCm);
    const eff = decNum(m.efficiencyPct);
    return (
      <li
        key={id}
        title={rowTooltip(m, colorway)}
        onClick={() => openingId == null && openMarker(id)}
        className={cn(
          'grid cursor-pointer grid-cols-[minmax(0,1fr)_140px_80px_110px_80px_160px] items-baseline gap-x-4 py-1.5 tabular-nums hover:bg-pageBg',
          !last && 'border-b border-hairline',
        )}
      >
        <button
          type='button'
          className='min-w-0 truncate text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
          disabled={openingId === id}
          onClick={(e) => {
            e.stopPropagation();
            openMarker(id);
          }}
        >
          {custom ? (
            <>
              {name} · {compositionText(comp, sizeName)}
            </>
          ) : (
            compositionText(comp, sizeName) || (
              <Text size='micro' variant='label' component='span'>
                composition unreadable
              </Text>
            )
          )}
          {openingId === id && (
            <Text size='micro' variant='label' component='span'>
              {' '}
              opening…
            </Text>
          )}
        </button>
        <span className='text-right'>
          {cons != null ? (
            `${cons} cm / unit`
          ) : refusal ? (
            // Смешанный состав — не поломка: у такого маркера просто нет одной цифры на изделие.
            // Красный здесь врал бы (красный = убыток/поломка), поэтому серый текст, причина в title.
            <span className='text-labelColor' title={refusal}>
              {refusalWord(m)}
            </span>
          ) : (
            <EmptyCell />
          )}
        </span>
        <span className='text-right text-labelColor'>{width ? `${width} cm` : <EmptyCell />}</span>
        <span className='text-right text-labelColor'>
          {length ? `${length} cm` : <EmptyCell />}
        </span>
        <span className='text-right text-labelColor'>{eff ? `${eff} %` : <EmptyCell />}</span>
        <span className='inline-flex items-baseline justify-end gap-2'>
          {m.isNorm && (
            <Pill
              tone='ok'
              title='the norm: the marker costing and the readiness gate measure this fabric by. chosen automatically — the newest complete single-size marker of the fabric.'
            >
              norm
            </Pill>
          )}
          {draft && (
            <Pill tone='warn' title={refusal}>
              draft
              {Number(m.totalCount ?? 0) > Number(m.placedCount ?? 0)
                ? ` · ${m.placedCount ?? 0} of ${m.totalCount ?? 0}`
                : ''}
            </Pill>
          )}
          {changed && (
            <Pill
              tone='attention'
              title='the piece set on the card changed since the capture — recheck'
            >
              set changed
            </Pill>
          )}
          {conflict && (
            <Pill tone='warn' title={conflict}>
              norm conflict
            </Pill>
          )}
          {canEdit && (
            <Close
              size='sm'
              aria-label='delete marker'
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setDeleting({ id, name: m.name ?? '' });
              }}
            />
          )}
        </span>
      </li>
    );
  };

  return (
    <div className='space-y-2'>
      {conflicts.map((t) => (
        <CalloutBox key={t} tone='error'>
          <Text size='micro' component='p'>
            <b>two norms on one fabric.</b> {t} the next complete marker saved for this fabric
            becomes its only norm; or delete the marker you don't want.
          </Text>
        </CalloutBox>
      ))}
      {normNote && (
        // Плашка, а не тост: применять новую норму надо на другой вкладке, и сообщение обязано
        // дожить до туда.
        <CalloutBox tone='warning'>
          <div className='flex items-start justify-between gap-2'>
            <Text size='micro' component='p' className='whitespace-pre-line'>
              {normNote}
            </Text>
            <Button type='button' variant='underline' size='xs' onClick={() => setNormNote(null)}>
              got it
            </Button>
          </div>
        </CalloutBox>
      )}
      {groups.map((g) => (
        <div key={g.key}>
          {groups.length > 1 && <GroupLabel>{g.label}</GroupLabel>}
          <div className='grid grid-cols-[minmax(0,1fr)_140px_80px_110px_80px_160px] gap-x-4 border-b border-borderColor pb-1 text-micro uppercase tracking-label text-labelColor'>
            <span>marker</span>
            <span className='text-right'>per unit</span>
            <span className='text-right'>width</span>
            <span className='text-right'>length</span>
            <span className='text-right'>eff.</span>
            <span />
          </div>
          <ul>{g.markers.map((m, i) => renderRow(m, i === g.markers.length - 1))}</ul>
        </div>
      ))}

      {view && (
        <Suspense
          fallback={
            <Text size='micro' variant='label'>
              loading the marker module…
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
        title={`delete marker ${deleting?.name ?? ''}?`}
        confirmLabel={deleteBusy ? 'deleting…' : 'delete marker'}
        confirmDisabled={deleteBusy}
        closeOnConfirm={false}
        hideCancel
      >
        {deletingNorm && (
          <Row
            label='norm moves to'
            value={nextNorm ? nextNorm.name ?? '' : 'none'}
            tone={nextNorm ? undefined : 'error'}
          />
        )}
      </ConfirmationModal>
    </div>
  );
}
