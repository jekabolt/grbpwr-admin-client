import { common_DesignPicture, common_MediaFull } from 'api/proto-http/admin';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useEffect, useId, useMemo, useState } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { AnnotationEditor, ANNOTATION_EDITOR_H_COMPACT } from 'ui/components/annotation/editor';
import { leaderTarget, type ShapePoint } from 'ui/components/annotation/geometry';
import { effectiveCaps, kindDef } from 'ui/components/annotation/kinds';
import { AnnotationDefs, CalloutShape } from 'ui/components/annotation/shapes';
import { rememberPen, type SurfaceCallout } from 'ui/components/annotation/surface';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { FocusedAnnotator, type FocusedView } from 'ui/components/focused-annotator';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Section, SectionStack } from 'ui/components/section';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { create } from 'zustand';

import type { TechCardFormData } from '../schema';
import { serverSpeaksDesign } from './capability';
import { CONCEPT_MAX, MoodDraft } from './head/mood-draft';
import { VectorModal } from './modals';
import { useMoodCallouts } from './mood-callouts';
import { TILE_CORNER } from './picture-tile';
import { useDesignBand } from './use-design-band';

/**
 * МУДБОРД — первый пункт процесса и единственная доска, которую человек наполняет руками.
 *
 * ЧТО ЗДЕСЬ ЛЕЖИТ И ГДЕ ОНО ЖИВЁТ. Плитки — это `moodboardMedia` ДОКУМЕНТА (карточка знает свои
 * картинки и без полосы DESIGN); указания на плитках — `callouts` того же документа, отфильтрованные
 * по мудбордным `media_id` (см. `./mood-callouts`); записка доски — `concept` (V-16: «CONCEPT &
 * CONSTRUCTION DESCRIPTION это и есть SHARED NOTE», редактор ровно один и стоит здесь), легаси
 * `moodNote` показывается read-only до слияния или сноса. Полоса DESIGN сюда не приходит вовсе, и
 * подпись органа это утверждает: доска не зависит от того, отвечает ли сервер новые маршруты.
 *
 * ПОЧЕМУ ЭТО НЕ ПРОМПТ. Мудборд читает человек и черновик идеи; в генерацию не уходит ничего
 * (`B2`). Оговорка стоит прямо в подписи блока, потому что «картинки, которые я собрал» и «картинки,
 * которые увидит модель» — два разных предмета, и второй живёт в блоке референсов ниже.
 *
 * ДОСКА И ВХОД — ДВА СПИСКА, А НЕ ОДИН СПИСОК С ЯРЛЫКОМ (U-5). Один массив `moodboardMedia` держит
 * обе половины, но РАЗДЕЛЬНЫМИ СТРОКАМИ: строка со `kind = REFERENCE` принадлежит входу и на доске
 * не рисуется НИКОГДА, всё остальное — доска. Раньше это был один ярлык на одной строке, и смена
 * ярлыка уносила картинку с доски вместе с её указаниями: они адресуются по `media_id`, но рисуются
 * только на кадре, а кадра больше не было. Теперь плитку берут во вход ЖЕСТОМ (см. `takeIntoInput`),
 * который заводит ВТОРУЮ строку на тот же `media_id`: доска сохраняет и плитку, и указания, а вход
 * получает собственную запись со своей ролью и своей запиской.
 *
 * ✕ ПЛИТКИ — ЕДИНСТВЕННАЯ НЕВОЗВРАТНАЯ ДВЕРЬ ВО ВСЕЙ ПОЛОСЕ, поэтому она называет цену вслух
 * (Г1/R7): сколько указаний умрёт вместе с плиткой — они не живут больше нигде. Молчащий ✕ уже
 * стоил звонка «а куда делись мои пометки на мудборде».
 */

export const REFERENCE_KIND = 'TECH_CARD_MEDIA_KIND_REFERENCE';

/**
 * ПИКЕРА mood/swatch НА ПЛИТКЕ БОЛЬШЕ НЕТ (слова владельца: «пикер mood & swatch не нужны в
 * мудборде») — вместе с ним умерли `BOARD_KINDS`/`KIND_ITEMS`/`kindOf`/`setKind`. Новые плитки
 * рождаются `MOODBOARD`; ярлык ничего не делил и ничего не гейтил, он только просил выбора.
 * СТАРЫЕ swatch-строки ПРИ ЭТОМ ЖИВЫ: `isBoardRow` ниже определён отрицанием входа, а не списком
 * видов, поэтому строка с любым не-REFERENCE видом рисуется на доске как рисовалась — снятие
 * пикера не имеет права терять чужие данные с экрана.
 */

/**
 * Потолок доски. Счётчик «N / 12» обещает рост, поэтому дверь добавления существует ВСЕГДА и при
 * полной доске честно отказывает словами, а не исчезает (Д19): исчезнувшая дверь читается как
 * «добавлять сюда нельзя вообще», и человек идёт искать её в другом месте.
 */
export const MOOD_MAX = 12;

/**
 * Потолок ВХОДА — свой, а не общий с доской. Общий потолок означал, что двенадцатая картинка на
 * доске запрещала тринадцатую в промпте и наоборот: два разных предмета делили одно число, и
 * отказ говорил про доску там, где человек наполнял вход. Число то же, счёт раздельный.
 */
export const INPUT_MAX = 12;

/** Одна строка `moodboardMedia` как её видит форма. Мудборд и референсы правят ОДИН этот список. */
export type BoardItem = NonNullable<TechCardFormData['moodboardMedia']>[number];

/** Строка ВХОДА — та, что рисуется в блоке референсов. */
export const isInputRow = (item: BoardItem) => item.kind === REFERENCE_KIND;
/**
 * Строка ДОСКИ. Определена ОТРИЦАНИЕМ входа, а не перечислением видов: карточка из клона, из
 * импорта или из легаси-разбиения несёт виды, которых сегодняшний словарь не знает, и список
 * «доска = mood | swatch» тихо ронял бы такую строку в НИ ОДИН из двух блоков — то есть терял бы
 * картинку с экрана, сохраняя её в payload.
 */
export const isBoardRow = (item: BoardItem) => !isInputRow(item);

/**
 * ВЗВЕДЁННЫЙ ВЫБОР ПЛИТКИ — единственное состояние, которое делят два соседних блока: ссылку
 * «or from the moodboard» жмут в РЕФЕРЕНСАХ, а выбирают на ДОСКЕ. Ни один из блоков не может им
 * владеть — доска не знает про вход, вход не рисует плиток доски, — а общего родителя править
 * нельзя (`studio-tab.tsx` принадлежит другой задаче). Поэтому состояние живёт здесь, вне обоих
 * деревьев, ровно как соседний `pick-mode.tsx` для верстака.
 *
 * Не в форме и не в React Query: это не свойство карточки, и оно ОБЯЗАНО умирать на Esc и при
 * уходе со страницы. Взвод, переживший перезагрузку, — это карточка, которая выглядит сломанной
 * по причине, которую не объясняет ни одно поле.
 */
type InputPickState = { armed: boolean; arm: () => void; disarm: () => void };
export const useInputPick = create<InputPickState>((set) => ({
  armed: false,
  arm: () => set({ armed: true }),
  disarm: () => set({ armed: false }),
}));

/**
 * Приём картинок в ОДИН из двух ящиков карточки — общая функция на обе двери («+ picture» здесь и
 * «+ reference» в блоке референсов). Чистая: форму она не знает, вызывающий передаёт живой список
 * и получает новый.
 *
 * Заведена общей не для красоты: два отдельных приёма разошлись бы по трём правилам сразу — по
 * дедупликации против ВТОРОГО списка карточки (`technicalMedia`), по потолку и по словам отказа.
 * Разъехавшись, они дали бы дубль медиа, который стоит формуле дайджеста дороже, чем весь блок.
 *
 * ДЕДУПЛИКАЦИЯ СЧИТАЕТСЯ ПО ЯЩИКУ, А НЕ ПО ВСЕМУ СПИСКУ. Одна картинка ИМЕЕТ ПРАВО стоять и на
 * доске, и во входе — это ровно тот жест, ради которого вход отделили; чего она не имеет права —
 * стоять в своём ящике дважды.
 */
export function appendBoardPictures(input: {
  /** Весь `moodboardMedia`: он и возвращается, чтобы соседний ящик не пострадал. */
  live: BoardItem[];
  /** Какие строки принадлежат ящику, куда кладут. */
  inScope: (item: BoardItem) => boolean;
  /** id второго списка карточки (`technicalMedia`): медиа не имеет права стоять в обоих. */
  otherListIds: number[];
  added: common_MediaFull[];
  kind: string;
  max: number;
  /** Как ящик зовут в словах отказа — «board» или «input». */
  scopeLabel: string;
}): { next: BoardItem[]; accepted: common_MediaFull[]; refusal: string | null } {
  const scoped = input.live.filter(input.inScope);
  const taken = new Set<number>([...scoped.map((i) => i.mediaId), ...input.otherListIds]);
  const fresh = input.added.filter((it) => it.id != null && !taken.has(it.id));
  if (!fresh.length) return { next: input.live, accepted: [], refusal: null };

  const room = input.max - scoped.length;
  if (room <= 0) {
    return {
      next: input.live,
      accepted: [],
      refusal: `the ${input.scopeLabel} is full — ${input.max} of ${input.max}; remove a picture first`,
    };
  }
  const accepted = fresh.slice(0, room);
  return {
    next: [
      ...input.live,
      ...accepted.map((it) => ({ mediaId: it.id as number, kind: input.kind, caption: '' })),
    ],
    accepted,
    refusal:
      accepted.length < fresh.length
        ? `only ${accepted.length} of ${fresh.length} fit — the ${input.scopeLabel} holds ${input.max}`
        : null,
  };
}

/**
 * Плитка доски заводит СВОЮ запись во входе: строка новая, `media_id` тот же, плитка остаётся на
 * месте вместе со всеми своими указаниями. Второй записи на тот же `media_id` во входе не бывает —
 * роль хранится в полосе по `media_id`, и двум записям её было бы нечем различить.
 */
export function takeIntoInput(
  live: BoardItem[],
  mediaId: number,
): { next: BoardItem[]; refusal: string | null } {
  const input = live.filter(isInputRow);
  if (input.some((i) => i.mediaId === mediaId)) {
    return { next: live, refusal: 'this picture is already in the input' };
  }
  if (input.length >= INPUT_MAX) {
    return {
      next: live,
      refusal: `the input is full — ${INPUT_MAX} of ${INPUT_MAX}; remove a reference first`,
    };
  }
  return { next: [...live, { mediaId, kind: REFERENCE_KIND, caption: '' }], refusal: null };
}

/**
 * ═══ БОКОВОЕ МЕНЮ УКАЗАНИЙ ДОСКИ (D-27, круг 18) ═════════════════════════════════════════════
 *
 * Владелец, дословно: «мудборд должен получить такое же боковое меню колаутов как в артефактах».
 * В ARTIFACTS это блок `callouts` справа от листа (`artifacts-panel.tsx`, `CalloutPanel`): строка
 * на выноску, рядом — на какой плите она стоит. Здесь ТА ЖЕ РАСКЛАДКА (`SectionStack row`: доска
 * `flex-1`, справа блок в 340px) и та же грамматика строки.
 *
 * ⚠ ЭТО ВРЕМЕННЫЙ ОРГАН ИЗ ОБЩИХ ПРИМИТИВОВ, А НЕ КОПИЯ `CalloutPanel`. Меню артефактов живёт
 * внутри чужого файла и прямо сейчас переписывается (круг 19: только выноски текущего листа,
 * подсветка выноски по наведению на строку, пиктограмма вида в каждой строке). Скопировать его
 * тело сюда значило бы завести два места, где правила расходятся. Поэтому строка собрана из
 * примитивов указаний (`CalloutShape` рисует пиктограмму, реестр `kindDef` называет вид), а
 * извлечение ОДНОГО общего `CalloutRail` из `artifacts-panel.tsx` названо в отчёте волны.
 *
 * ЧТО ЗДЕСЬ ЕСТЬ И ЧЕГО ПОКА НЕТ.
 *   есть  — только указания ДОСКИ (по построению: `useMoodCallouts` фильтрует по `media_id`
 *           плиток доски; строка с `media_id = 0` и строка входа сюда не попадают);
 *   есть  — пиктограмма вида: не иконка из словаря, а САМА фигура, нарисованная общим
 *           `CalloutShape` в 22×14 — с её цветом, пунктиром и наконечниками, то есть регистр видов
 *           здесь не перечисляется, читается реестр;
 *   есть  — на какой картинке стоит (номер плитки доски, тот же, что печатается в её углу);
 *   нет   — выбор указания кликом по строке и подсветка выноски по наведению: выбор и наведение
 *           принадлежат `FocusedAnnotator`/`AnnotationSurface`, у которых нет управляемых пропов
 *           (`selectedKey`/`onSelectedChange`, `hoveredKey`). Строка поэтому НЕ кнопка: орган,
 *           который ничего не делает по клику, обещал бы жест, которого нет. Пропы названы в отчёте.
 */

/**
 * ПИКТОГРАММА ВИДА — фигура указания, нарисованная тем же `CalloutShape`, что рисует её на кадре,
 * в коробке 22×14 (координаты — в 44×28, чтобы засечки, скоба и стрелки, чьи размеры заданы
 * пикселями в `geometry.ts`, вошли в коробку вдвое мельче). Опорные точки выбираются ПО ГРАММАТИКЕ
 * реестра (`grammar`, `capped`, `tool`), а не по списку ключей: новый вид с известной грамматикой
 * получит пиктограмму без правки этого места; неизвестный, как всюду, читается пином.
 *
 * Подпись у фигуры ставится в ЦЕЛЬ ЛИДЕРА (`leaderTarget`), поэтому лидер нулевой длины и в
 * пиктограмме не виден: пиктограмма показывает фигуру, а не её плашку.
 */
const GLYPH_W = 44;
const GLYPH_H = 28;

function glyphGeometry(kind: string, caps: string): { pts: ShapePoint[]; label: ShapePoint } {
  const d = kindDef(kind);
  if (d.grammar === 'ink') {
    return {
      pts: [
        { x: 4, y: 20 },
        { x: 12, y: 8 },
        { x: 20, y: 20 },
        { x: 28, y: 8 },
        { x: 36, y: 20 },
        { x: 40, y: 14 },
      ],
      label: { x: 22, y: 14 },
    };
  }
  if (d.grammar === 'arc') {
    const pts = [
      { x: 4, y: 22 },
      { x: 22, y: 6 },
      { x: 40, y: 22 },
    ];
    return { pts, label: leaderTarget(d.key, pts, effectiveCaps(d.key, caps)) ?? pts[1] };
  }
  if (d.grammar === 'polygon') {
    const pts = [
      { x: 6, y: 4 },
      { x: 38, y: 4 },
      { x: 38, y: 24 },
      { x: 6, y: 24 },
    ];
    return { pts, label: leaderTarget(d.key, pts, '') ?? { x: 22, y: 14 } };
  }
  if (d.tool === 'label') {
    // Записка: стрелка от плашки к месту; у записки с лучами — два луча.
    const pts =
      d.points[0] >= 2
        ? [
            { x: 38, y: 22 },
            { x: 38, y: 6 },
          ]
        : [{ x: 38, y: 22 }];
    return { pts, label: { x: 8, y: d.points[0] >= 2 ? 14 : 6 } };
  }
  if (d.capped) {
    // Линия: две точки, наконечники — какие хранятся (`effectiveCaps` раскрывает «не задано»).
    const pts = [
      { x: 6, y: 14 },
      { x: 38, y: 14 },
    ];
    return { pts, label: leaderTarget(d.key, pts, effectiveCaps(d.key, caps)) ?? { x: 22, y: 14 } };
  }
  // Пин и всё неизвестное: одна точка.
  return { pts: [{ x: 22, y: 14 }], label: { x: 22, y: 14 } };
}

function CalloutGlyph({
  kind,
  caps,
  color,
  dashed,
  filled,
}: {
  kind: string;
  caps?: string;
  color?: string;
  dashed?: boolean;
  filled?: boolean;
}) {
  const d = kindDef(kind);
  const { pts, label } = glyphGeometry(kind, caps ?? '');
  return (
    <svg
      role='img'
      aria-label={d.label}
      width={GLYPH_W / 2}
      height={GLYPH_H / 2}
      viewBox={`0 0 ${GLYPH_W} ${GLYPH_H}`}
      className='shrink-0 overflow-visible text-textColor'
      data-mood-glyph={d.key}
    >
      {/* Маркеры стрелок и штриховка — те же определения, что кладёт в `<defs>` сам кадр; в каждой
          пиктограмме свои, потому что она рисуется и там, где ни одного кадра на экране нет. */}
      <defs>
        <AnnotationDefs />
      </defs>
      {d.key === 'pin' ? (
        // Пин на кадре — HTML-кружок с номером, а не SVG-фигура (`CalloutShape` рисует ему только
        // точку привязки), поэтому его пиктограмма — тот же кружок.
        <circle cx={22} cy={14} r={6} fill='none' stroke='currentColor' strokeWidth={2} />
      ) : (
        <CalloutShape
          kind={kind}
          pts={pts}
          label={label}
          color={color || undefined}
          dashed={dashed}
          filled={filled}
          caps={caps}
          strokeWidth={2}
        />
      )}
    </svg>
  );
}

/** Строка меню: указание доски вместе с номером плитки, на которой оно стоит. */
type RailRow = SurfaceCallout & { picture: number };

function MoodCalloutRail({ rows }: { rows: RailRow[] }): JSX.Element {
  if (rows.length === 0) {
    return (
      <Text size='micro' variant='label' component='p' data-mood-rail=''>
        none yet. A note is put on the picture itself — arm a kind above the board and click a
        picture; the row appears here the moment it exists.
      </Text>
    );
  }
  return (
    <div data-mood-rail=''>
      {rows.map((row) => {
        const text = (row.text ?? '').trim();
        return (
          <div
            key={row.key}
            data-mood-callout={row.key}
            data-mood-callout-kind={kindDef(row.kind).key}
            className='flex items-center gap-2 border-b border-hairline py-1'
          >
            <CalloutGlyph
              kind={row.kind}
              caps={row.caps}
              color={row.color}
              dashed={row.dashed}
              filled={row.filled}
            />
            <Text
              size='micro'
              component='span'
              className={cn('min-w-0 flex-1 truncate', !text && 'text-labelColor')}
            >
              {text || 'no text'}
            </Text>
            <Pill tone='mut'>picture {row.picture}</Pill>
          </div>
        );
      })}
    </div>
  );
}

/**
 * ═══ ПРАВКА КАРТИНКИ ДОСКИ ПО НАВЕДЕНИЮ (C-3, круг 18) ═══════════════════════════════════════
 *
 * Владелец, дословно: «MOODBOARD — должна быть возможность редактировать на ховер картинки».
 *
 * ЗАМЕРЕНО ДО ПРАВКИ: по наведению на плитку доски не происходило ничего — в её углу всегда стояли
 * `zoom` и `✕` (органы кадра, не тихие), а двери «править картинку» у доски не было вовсе. Во всей
 * полосе DESIGN «edit» на картинке означает одно: открыть редактор (`VectorModal`) на этой
 * картинке — так у истории прогонов, у плит листа (K-7) и у верстака. Доска была единственной
 * поверхностью с картинками без этой двери; вторая сущность здесь не выдумывается.
 *
 * ДВЕРЬ ТИХАЯ — ПОЯВЛЯЕТСЯ ПО НАВЕДЕНИЮ ИЛИ ФОКУСУ ВНУТРИ ПЛИТКИ И ВСЕГДА НА УСТРОЙСТВЕ БЕЗ
 * НАВЕДЕНИЯ — та же формула, что у угловых органов `PictureTile` (`TILE_QUIET`), и та же кожа
 * (`TILE_CORNER`). Формула переписана через `:hover > &`, потому что плитку доски рисует
 * `FocusedAnnotator`, и класса `group` на ней нет; орган ставится в её угол через
 * `renderFocusedFooter` — единственный слот, который галерея отдаёт вызывающему на плитке.
 * Правильное место этой двери — нижний ряд органов кадра (`cornerSlotBottom` поверхности), и проп
 * для него у `FocusedAnnotator` назван в отчёте волны.
 *
 * РЕЗУЛЬТАТ ПРАВКИ ВСТАЁТ НА ДОСКУ РЯДОМ С ОРИГИНАЛОМ, А НЕ ВМЕСТО НЕГО. Указания приколоты долями
 * кадра оригинала, и подмена картинки под ними увела бы каждое не туда; оригинал остаётся со своими
 * пометками, а снять его — отдельный ✕, который называет цену.
 */
const MOOD_QUIET =
  'opacity-0 transition-opacity duration-100 [:hover>&]:opacity-100 [:focus-within>&]:opacity-100 ' +
  'focus-visible:opacity-100 [@media(hover:none)]:opacity-100 motion-reduce:transition-none';

/**
 * Основа редактора для картинки ДОСКИ. У доски нет картинки полосы — это медиа библиотеки, — и
 * редактору нужен ровно его файл: слой и склейка адресуются по `base_media_id`.
 * ⚠ НИ ОДНО ДРУГОЕ ПОЛЕ НЕ ВЫДУМЫВАЕТСЯ (тот же довод, что у `plateAsPicture` в
 * `artifacts-panel.tsx`): про файл известно только то, что он на доске.
 */
function pictureOfMedia(full: common_MediaFull): common_DesignPicture {
  return {
    id: undefined,
    techCardId: undefined,
    media: full,
    runId: undefined,
    batchId: undefined,
    ordinal: undefined,
    kind: undefined,
    ghostView: undefined,
    compositeViews: undefined,
    derivedFrom: undefined,
    derivation: undefined,
    sourceClass: undefined,
    mixedInput: undefined,
    layerRev: undefined,
    hiddenAt: undefined,
    hiddenBy: undefined,
    createdAt: undefined,
    selected: undefined,
    colorwayId: undefined,
    displayOnly: undefined,
  };
}

export function MoodBoard({
  techCardId,
  disabled,
}: {
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();

  const all = (useWatch({ control, name: 'moodboardMedia' }) ?? []) as BoardItem[];
  const items = useMemo(() => all.filter(isBoardRow), [all]);
  const inputIds = useMemo(() => new Set(all.filter(isInputRow).map((i) => i.mediaId)), [all]);
  // V-16 · ЗАПИСКА ДОСКИ — ЭТО `concept`, И НИКАКОЕ ДРУГОЕ ПОЛЕ. Владелец дословно: «CONCEPT &
  // CONSTRUCTION DESCRIPTION это и есть SHARED NOTE в MOODBOARD». По коду это были ДВА поля —
  // `moodNote` (не печатается, вне подписи DESIGN, читал только черновик) и `concept` (печатается
  // в тех-паке, входит в подпись) — и два органа над ними читались как два разных предмета.
  // Редактор теперь ровно один и пишет `concept`; `moodNote` больше не редактируется нигде.
  const concept = useController({ control, name: 'concept' });
  // Легаси-содержимое `moodNote`. Поле живёт по протоколу «отсутствует = сохрани хранимое»,
  // поэтому НЕ рисовать его — не значит стереть; но спрятать текст, который черновик всё ещё
  // читает, значило бы завести невидимый вход в промпт. Непустая легаси-записка показывается
  // ниже read-only, с двумя дверьми: забрать в описание или выбросить (обе пишут '' — команду
  // «очисти» — и орган исчезает навсегда).
  const legacyNote = (((useWatch({ control, name: 'moodNote' }) as string | null) ?? '') || '')
    .trim();
  const noteId = useId();
  const bodyId = useId();

  // ЗАПИСЬ СОСТАВА ДОСКИ — ПО КОРНЮ МАССИВА, и по той же причине, что у указаний: блок референсов
  // тоже правит эти строки (он держит вторую половину того же списка), а мутаторы поля-массива
  // до соседнего читателя не доходят. Корневая запись событие эмитит.
  const writeItems = (next: BoardItem[]) =>
    setValue('moodboardMedia', next as TechCardFormData['moodboardMedia'], { shouldDirty: true });

  // Свежевыбранные медиа разрешаются локально: без этого только что добавленную картинку нельзя
  // разметить до сохранения и перезагрузки.
  const [picked, setPicked] = useState<common_MediaFull[]>([]);
  // БИБЛИОТЕКА, А НЕ `resolvedMoodboardMedia`. Подпись органа даёт только `techCardId`, карточки у
  // него нет, и это намеренно: доска не должна знать про полосу. Цена названа честно — картинка
  // старше последних пятисот файлов библиотеки не разрешится, и кадр останется в ряду пустым,
  // сохранив свои указания (`FocusedAnnotator` рисует неразрешённый кадр, а не выбрасывает его).
  const libraryMap = useMediaMap();
  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>(libraryMap);
    for (const p of picked) if (p.id != null) m.set(p.id, p);
    return m;
  }, [libraryMap, picked]);

  const moodMediaIds = useMemo(
    () => new Set(items.map((i) => i.mediaId).filter((id): id is number => !!id)),
    [items],
  );
  const callouts = useMoodCallouts(moodMediaIds);

  // ── правка картинки (C-3) ───────────────────────────────────────────────────────────────────
  //
  // Полоса читается ТОЛЬКО ради редактора: доска по-прежнему не зависит от того, отвечает ли
  // сервер её маршруты (шапка файла), и без полосы теряет одну дверь, а не себя. Ключ запроса тот
  // же, что у студии, — второго чтения полосы не возникает.
  const speaks = serverSpeaksDesign();
  const { band } = useDesignBand(techCardId);
  const [editing, setEditing] = useState<{ mediaId: number; full: common_MediaFull } | null>(
    null,
  );

  const views: FocusedView[] = items.map((i) => ({
    // Ключ — сам id медиа: он уникален ПО ДОСКЕ (во входе на тот же id стоит отдельная строка,
    // но её рисует другой блок) и переживает удаление соседа, в отличие от позиции в ряду.
    key: String(i.mediaId),
    mediaId: i.mediaId,
    full: mediaById.get(i.mediaId),
  }));

  // ── как я смотрю на доску: strip | grid ─────────────────────────────────────────────────────
  //
  // ВЫСОТА КАДРА ФИКСИРОВАНА В ОБОИХ РЕЖИМАХ, ШИРИНА ГУЛЯЕТ (U-4). Это инверсия прежнего
  // поведения: доска стояла шириной в 300px на кадр, и высота считалась от пропорций снимка —
  // портрет рядом с панорамой давал ряд, в котором ничего не сравнивается. Кадр НЕ обрезается ни в
  // одном из режимов, поэтому пины по-прежнему ложатся на снимок один в один.
  // Стрип — умолчание (владелец: «стрип мод по дефолту в мудборде»): доску чаще читают лентой.
  const [mode, setMode] = useState<'strip' | 'grid'>('strip');
  // 380 в стрипе — «высоту картинок сделать чуть больше» (R-7). Ровно на эти же 40px ужата
  // полоса редактора (148 → ANNOTATION_EDITOR_H_COMPACT = 108): рост отдан КАРТИНКЕ, а суммарная
  // высота блока не выросла. Двигая одно из двух чисел, двигай оба — иначе блок снова растёт.
  const rowHeight = mode === 'strip' ? 380 : 280;

  // ── дверь добавления ────────────────────────────────────────────────────────────────────────
  function handleAddMedia(added: common_MediaFull[]): number[] {
    const result = appendBoardPictures({
      live: (getValues('moodboardMedia') ?? []) as BoardItem[],
      inScope: isBoardRow,
      otherListIds: ((getValues('technicalMedia') ?? []) as BoardItem[]).map((i) => i.mediaId),
      added,
      kind: 'TECH_CARD_MEDIA_KIND_MOODBOARD',
      max: MOOD_MAX,
      scopeLabel: 'board',
    });
    // ОТКАЗ ГОВОРИТСЯ ВСЛУХ. Дверь при полной доске остаётся на месте и объясняет себя (Д19):
    // исчезнувшая дверь читается как «сюда добавлять нельзя вообще».
    if (result.refusal) showMessage(result.refusal, 'error');
    if (!result.accepted.length) return [];
    setPicked((prev) => [...prev, ...result.accepted]);
    writeItems(result.next);
    return result.accepted.map((it) => it.id as number);
  }

  /**
   * Отредактированная картинка встаёт на доску СРАЗУ ЗА ОРИГИНАЛОМ (C-3). Приём — тот же
   * `appendBoardPictures`, что у двери «+ picture»: те же потолок, дедупликация и слова отказа;
   * меняется только место строки в ряду, потому что «рядом с тем, что правил» — единственное
   * место, где результат правки находят глазами.
   */
  function placeEditedNextTo(originalId: number, full: common_MediaFull) {
    const result = appendBoardPictures({
      live: (getValues('moodboardMedia') ?? []) as BoardItem[],
      inScope: isBoardRow,
      otherListIds: ((getValues('technicalMedia') ?? []) as BoardItem[]).map((i) => i.mediaId),
      added: [full],
      kind: 'TECH_CARD_MEDIA_KIND_MOODBOARD',
      max: MOOD_MAX,
      scopeLabel: 'board',
    });
    if (result.refusal) showMessage(result.refusal, 'error');
    if (!result.accepted.length) return;
    setPicked((prev) => [...prev, ...result.accepted]);
    const next = [...result.next];
    const fresh = next.pop() as BoardItem;
    const at = next.findIndex((i) => isBoardRow(i) && i.mediaId === originalId);
    next.splice(at < 0 ? next.length : at + 1, 0, fresh);
    writeItems(next);
    showMessage(
      'the edited picture is on the board, right after the original — the original keeps its notes',
      'success',
    );
  }

  // ── взведённый выбор: плитка доски заводит запись во входе ──────────────────────────────────
  const pick = useInputPick();
  const readOnly = !!disabled;
  const picking = pick.armed && !readOnly;

  // Esc снимает взвод. Полоса обещает это словами, поэтому обещание должно исполняться и тогда,
  // когда фокус нигде в частности, — отсюда слушатель на документе, а не на баннере.
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        pick.disarm();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [picking, pick]);

  // Взвод не переживает уход с экрана: он не свойство карточки.
  useEffect(() => () => useInputPick.getState().disarm(), []);

  function pickIntoInput(mediaId: number) {
    const result = takeIntoInput((getValues('moodboardMedia') ?? []) as BoardItem[], mediaId);
    if (result.refusal) {
      showMessage(result.refusal, 'error');
      return;
    }
    writeItems(result.next);
    // Один жест — одна запись. Взвод снимается сразу: он назывался «pick a picture», в
    // единственном числе, и оставленный взведённым он читался бы как «жду ещё».
    pick.disarm();
    showMessage('the picture is in the input — give it a role there', 'success');
  }

  // ── ✕ плитки: цитата перед уничтожением ─────────────────────────────────────────────────────
  const [pendingRemove, setPendingRemove] = useState<number | null>(null);
  const pendingCallouts = pendingRemove == null ? 0 : callouts.countOn(pendingRemove);
  const pendingAlsoInInput = pendingRemove != null && inputIds.has(pendingRemove);

  function confirmRemove() {
    const mediaId = pendingRemove;
    setPendingRemove(null);
    if (mediaId == null) return;
    // УКАЗАНИЯ УМИРАЮТ ВМЕСТЕ С ПЛИТКОЙ, а не открепляются. Доли кадра осмысленны только на СВОЁМ
    // снимке, номера у мудбордного указания нет, и открепившееся оно не показывается нигде — то
    // есть «сохранили» означало бы «оставили сиротой в payload». Поэтому ✕ и обязан назвать число.
    callouts.removeOn(mediaId);
    // Снимается ТОЛЬКО строка доски. Запись входа на тот же `media_id` — отдельная сущность со
    // своей ролью и своей запиской, и её сносит собственный ✕ в блоке референсов, который тоже
    // называет свою цену. Одна дверь, уносящая две вещи в разных блоках, — это дверь, о цене
    // которой человек узнаёт после.
    writeItems(
      ((getValues('moodboardMedia') ?? []) as BoardItem[]).filter(
        (i) => !(i.mediaId === mediaId && isBoardRow(i)),
      ),
    );
  }

  // ── легаси-записка → описание (V-16) ────────────────────────────────────────────────────────
  //
  // Перенос уважает потолок поля: молча обрезанное описание — это предложение, потерявшее хвост
  // без единого слова об этом. Отказ говорится вслух, текст остаётся на месте.
  function takeLegacyNote() {
    const current = ((getValues('concept') ?? '') as string).trim();
    const next = current ? `${current}\n${legacyNote}` : legacyNote;
    if (next.length > CONCEPT_MAX) {
      showMessage(
        `the note does not fit — the description holds ${CONCEPT_MAX} characters and it is already ${current.length}; shorten it first`,
        'error',
      );
      return;
    }
    setValue('concept', next, { shouldDirty: true, shouldValidate: true });
    // '' — КОМАНДА «очисти» по трёхсостоянийному протоколу поля; отсутствие значило бы «сохрани».
    setValue('moodNote', '', { shouldDirty: true });
  }

  function dropLegacyNote() {
    setValue('moodNote', '', { shouldDirty: true });
  }

  // ── колапс блока (U-3) ──────────────────────────────────────────────────────────────────────
  //
  // Стрелка стоит РОВНО ТАМ, где стоял счётчик «4 / 12», как и просил владелец, а сам счёт уехал в
  // серую оговорку рядом с именем блока: свёрнутый блок, который не говорит, сколько в нём лежит,
  // отвечает на вопрос «стоит ли разворачивать» молчанием.
  const [open, setOpen] = useState(true);

  // ── строки бокового меню (D-27) — в порядке доски, с номером плитки ─────────────────────────
  //
  // `calloutsFor` уже отдаёт вью-модель поверхности — ту же, что видит кадр, — поэтому меню и кадр
  // не могут разойтись ни в цвете, ни в наконечнике, ни в тексте: один источник на оба.
  const railRows: RailRow[] = views.flatMap((v, i) =>
    callouts.calloutsFor(v.mediaId).map((c) => ({ ...c, picture: i + 1 })),
  );

  const canEdit = !readOnly && speaks;

  return (
    <SectionStack row>
    <Section
      title='moodboard'
      question={`— the mood, not the prompt: nothing here is sent to generation · ${items.length} / ${MOOD_MAX}`}
      className='min-w-0 flex-1'
      action={
        <button
          type='button'
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? 'collapse the moodboard' : 'expand the moodboard'}
          className='cursor-pointer px-1 text-labelColor hover:text-textColor'
        >
          <Text size='micro' component='span'>
            {open ? '▲' : '▼'}
          </Text>
        </button>
      }
    >
      <div id={bodyId} className={open ? 'space-y-stack' : 'hidden'}>
        {/* ПОЛОСА ВЗВОДА. Стоит НАД доской, а не под ней: она объясняет, почему плитки вдруг
            обведены пунктиром, и объяснение обязано попасться на глаза раньше следствия. */}
        {picking && (
          <div className='flex flex-wrap items-center gap-2 border border-textColor px-2.5 py-1.5'>
            <Text size='micro' variant='label' component='span'>
              pick a moodboard picture — it becomes a reference too, the tile stays here
            </Text>
            <Chip onClick={() => pick.disarm()} className='ml-auto'>
              esc to cancel
            </Chip>
          </div>
        )}

        <FocusedAnnotator
          layout='grid'
          // U-4: ВЫСОТА ОДНА НА ВСЕ КАДРЫ. `railWrap` (перенос по строкам ценой разной высоты)
          // снят; его место занимает пара `gridRowHeight` + `wrapRows`, которая переносит по
          // строкам, НЕ отпуская высоту.
          railWrap={false}
          gridRowHeight={rowHeight}
          wrapRows={mode === 'grid'}
          // U-3: виды указаний — слева, переключатель strip/grid — справа, на одном уровне.
          kindsFirst
          // Стрелки ‹ › в стрипе сняты по слову владельца; прокрутка остаётся жестом и
          // скроллбаром. У эскиза рельса живёт со стрелками — потому это проп, а не правка рельсы.
          railArrows={false}
          // Кроп запрещён словами владельца: у медиа без записанных размеров кадр берёт пропорции
          // самой картинки после загрузки, а не фолбэка, — иначе `object-cover` резал бы снимок.
          preferNaturalAspect
          // Текст пина — по наведению или фокусу на маркер, не постоянной легендой (R-9).
          pinText='hover'
          // Узкая полоса редактора (R-2) и тот же резерв в зуме (R-6): одно число на резерв и
          // корпус, см. `heightPx` у AnnotationEditor ниже — разъехавшись, они возвращают дёрганье.
          editorHeight={ANNOTATION_EDITOR_H_COMPACT}
          zoomEditorReserve
          viewControls={
            <ChipRow>
              {(['strip', 'grid'] as const).map((m) => (
                <Chip
                  key={m}
                  nonForm
                  selected={mode === m}
                  pressed={mode === m}
                  onClick={() => setMode(m)}
                >
                  {m}
                </Chip>
              ))}
            </ChipRow>
          }
          tilePick={{
            active: picking,
            onPick: (view) => pickIntoInput(view.mediaId),
            taken: (mediaId) => inputIds.has(mediaId),
            label: (view, i) => `take picture ${i + 1} into the input`,
            takenLabel: 'in the input',
          }}
          views={views}
          // ПОДЛОЖКА ПОД ЛИНИЯМИ УКАЗАНИЙ — ЭТО ФОТОГРАФИИ. Чернильная линия на пёстром снимке
          // тонет, и указание перестаёт быть видно ровно там, где его поставили.
          halo
          calloutsFor={callouts.calloutsFor}
          onAddCallout={callouts.add}
          onEditPoints={callouts.editPoints}
          onMoveCallout={callouts.moveLabel}
          onRemoveCallout={callouts.removeByKey}
          onPickMedia={handleAddMedia}
          onRemoveMedia={(view) => setPendingRemove(view.mediaId)}
          readOnly={readOnly}
          addLabel='+ picture'
          purpose='moodboard reference'
          carouselLabel='moodboard'
          emptyLabel='nothing on the board yet. drop a picture, paste one with ⌘V, or browse the library — then pin notes on it'
          mediaLabel={(view, i) => `moodboard picture ${i + 1}`}
          // ПОДВАЛА У ПЛИТКИ НЕТ — ЕСТЬ НИЖНИЙ РЯД ОРГАНОВ НА САМОМ КАДРЕ (C-3). Слот подвала
          // галерея отдаёт вызывающему, и он единственный, где можно встать на плитку; строка ПОД
          // кадром при этом не рисуется — оба органа стоят накладкой на нижнем крае кадра, как на
          // плитах листа (`PLATE_BADGE_BAR`): факт «эта картинка уже и во входе» — слева (R-5,
          // единственный факт, который человеку нужен у плитки, — на непрозрачной подложке, потому
          // что под ним снимок), тихая дверь `edit` — справа, там же, где у `PictureTile`.
          // `bottom-2` = зазор колонки поверхности под кадром (4px) плюс отступ органа от края (4px).
          renderFocusedFooter={(view, i) => (
            <>
              {inputIds.has(view.mediaId) && (
                <span className='pointer-events-none absolute bottom-2 left-1 z-[6] inline-block bg-bgColor'>
                  <Pill tone='ink'>in the input</Pill>
                </span>
              )}
              {canEdit && view.full && (
                <button
                  type='button'
                  data-mood-edit={view.mediaId}
                  aria-label={`edit moodboard picture ${i + 1}`}
                  title='edit — open the picture editor on this picture; the result joins the board right after it'
                  onClick={() => setEditing({ mediaId: view.mediaId, full: view.full as common_MediaFull })}
                  // Нажатие не доходит до кадра: иначе оно завело бы там жест панорамы или
                  // постановки — тот же довод, что у `FrameButton` поверхности.
                  onPointerDown={(e) => e.stopPropagation()}
                  className={cn(TILE_CORNER, MOOD_QUIET, 'absolute bottom-2 right-1 z-[6]')}
                >
                  edit
                </button>
              )}
            </>
          )}
          renderEditor={(key, { close, arrows }) => {
            const row = callouts.at(key);
            if (!row) return null;
            const { index, value } = row;
            return (
              <AnnotationEditor
                // Узкий корпус (R-2): у мудбордной выноски нет ни номера, ни деталей, ни размера —
                // полная полоса стояла бы наполовину пустой. То же число уходит в `editorHeight`
                // выше: резерв и корпус обязаны совпадать, иначе возвращается сдвиг кадров.
                heightPx={ANNOTATION_EDITOR_H_COMPACT}
                kind={value.kind ?? 'pin'}
                // НОМЕРА НЕТ И В РЕДАКТОРЕ: мудбордную пометку не адресует ни деталь, ни операция,
                // ни дефект, и нарисованный номер обещал бы адрес, которого не существует.
                text={value.description ?? ''}
                color={value.color ?? ''}
                dashed={!!value.dashed}
                filled={!!value.filled}
                caps={value.caps ?? ''}
                // Деталей кроя у мудбордной пометки нет: она про настроение, а не про изделие.
                pieceKeys={[]}
                onPieces={() => {}}
                onText={(v) => callouts.setText(index, v)}
                onColor={(v) => {
                  rememberPen({ color: v });
                  callouts.setColor(index, v);
                }}
                // НАКОНЕЧНИКИ (D-19/D-20) — пара «вид хранения + caps» пишется целиком; перо
                // помнит ВЫБРАННОЕ (`chosen`), потому что скоба в хранении — `bracket` без caps.
                onCaps={(next, chosen) => {
                  rememberPen({ caps: chosen });
                  callouts.setCaps(index, next);
                }}
                onDashed={(v) => {
                  rememberPen({ dashed: v });
                  callouts.setDashed(index, v);
                }}
                onFilled={(v) => {
                  rememberPen({ filled: v });
                  callouts.setFilled(index, v);
                }}
                // ЛУЧИ ЗАПИСКИ приходят от поверхности: взвод «жду клик по кадру» принадлежит
                // кадру, а не форме. Здесь стояла «make it a point» — владелец её убрал (E-27), и
                // вместе с ней ушёл единственный смысл разжалования: пина в палитре больше нет.
                arrows={arrows}
                onRemove={() => {
                  callouts.removeByKey(key);
                  close();
                }}
                onClose={close}
              />
            );
          }}
        />

        {/* ОДНА ЗАПИСКА НА ДОСКУ — И ЭТО `concept` (V-16). Текст печатается в тех-паке и входит в
            подпись DESIGN, поэтому подпись под полем называет обе судьбы вслух. Это по-прежнему НЕ
            описание изделия для генерации: то — `garment description` блока референсов, уходит в
            каждый прогон; этот текст генерация не видит (W-15), его читают человек, бумага и
            черновик ниже. */}
        {/* `data-field` — ЯКОРЬ ДВЕРИ, А НЕ УКРАШЕНИЕ. `revealField` (`utils/field-errors.ts:226`)
            ищет поле по `[data-field="<путь>"]`, и этот штамп ставит `FormItem` из `ui/form`. Здесь
            стоит ГОЛАЯ `Textarea`, потому что поле переехало из формы на доску (V-16) — вместе с
            переездом якорь и пропал, а с ним онемели ОБЕ двери «what the model gets» (`edit the
            description ▸` и `edit the concept ▸`): они отвечали «it is not on this tab», стоя на той
            самой вкладке, где поле видно. Штамп возвращён руками ровно потому, что примитив формы
            больше не участвует. */}
        <div data-field='concept'>
          <GroupLabel>concept & construction description</GroupLabel>
          <label htmlFor={noteId} className='sr-only'>
            concept & construction description
          </label>
          <Textarea
            {...concept.field}
            id={noteId}
            disabled={readOnly}
            value={concept.field.value ?? ''}
            rows={4}
            maxLength={CONCEPT_MAX}
            placeholder='what this thing is — the idea, the reference, the purpose'
            className='resize-none'
          />
          <Text size='micro' variant='label' className='mt-px'>
            printed for the factory · part of the DESIGN signature · read by «draft the idea» below
            — the garment description for generation is a different field, in the input block
          </Text>
        </div>

        {/* ЛЕГАСИ-ЗАПИСКА ДОСКИ. Существует только на карточках, писавших `moodNote` до слияния
            V-16; после любой из двух дверей поле уезжает '' (командой «очисти») и орган исчезает.
            Цитата стоит на экране целиком, поэтому «discard» не спрашивает второй раз. */}
        {legacyNote !== '' && (
          // CalloutBox, а не пунктирная рамка: пунктир в этой системе означает «добавить», а это —
          // сообщение, которое стоит, пока его не разрешили одной из двух дверей (DESIGN.md §5).
          <CalloutBox>
            <div className='flex items-baseline justify-between gap-2'>
              <Text size='micro' variant='label' component='span'>
                the board’s old shared note — this field is retired; the description above is the
                one note now
              </Text>
              {!readOnly && (
                <ChipRow className='shrink-0'>
                  <Chip nonForm onClick={takeLegacyNote} title='append it to the description above'>
                    add to the description
                  </Chip>
                  <Chip nonForm onClick={dropLegacyNote} title='clear it — the text above is it'>
                    discard
                  </Chip>
                </ChipRow>
              )}
            </div>
            <Text size='micro' component='p' className='mt-1 whitespace-pre-wrap'>
              {legacyNote}
            </Text>
          </CalloutBox>
        )}

        {/* ЧЕРНОВИК ИДЕИ — `moodDraftHtml` прототипа, который зовёт его ПОСЛЕДНИМ внутри доски
            (`proto.html:3271`), поэтому и здесь он стоит внизу этой же секции.
            Здесь стоял черновик, собиравшийся В БРАУЗЕРЕ: он склеивал общую записку с текстами
            указаний и называл это «read the board». Слова были честные, но органом прототипа это
            не было — тот просит прозу у модели. Бэкенд отдаёт `DraftDesignIdea`, и теперь зовётся
            он. */}
        <MoodDraft techCardId={techCardId} disabled={readOnly} />
      </div>

      <ConfirmationModal
        open={pendingRemove != null}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
        title='remove the picture'
        confirmLabel='remove it'
        width='sm'
      >
        <div className='space-y-2'>
          {pendingCallouts > 0 && (
            <Text size='control'>
              {pendingCallouts} note{pendingCallouts === 1 ? '' : 's'} pinned on this picture{' '}
              {pendingCallouts === 1 ? 'dies' : 'die'} with it — they live nowhere else.
            </Text>
          )}
          {pendingAlsoInInput && (
            <Text size='control'>
              The same picture also stands in the input — that reference is its own entry and stays
              there, with its role and its note.
            </Text>
          )}
          {pendingCallouts === 0 && !pendingAlsoInInput && (
            <Text size='control'>
              The picture comes off the board. The file itself stays in the library.
            </Text>
          )}
        </div>
      </ConfirmationModal>

      {/* РЕДАКТОР КАРТИНКИ ДОСКИ (C-3) — тот же `VectorModal`, что открывает `edit` на плитке
          истории, на плите листа и на верстаке: один редактор, вызванный с четвёртого экрана.
          Монтируется только раскрытым: у модалки свои оконные слушатели клавиш. `slot` не
          передаётся — доске некуда «поставить» результат, он входит строкой доски через
          `placeEditedNextTo`. */}
      {editing && (
        <VectorModal
          open
          onOpenChange={(v) => !v && setEditing(null)}
          techCardId={techCardId}
          band={band}
          base={pictureOfMedia(editing.full)}
          slot={null}
          disabled={readOnly}
          onFlattened={(picture) => {
            // Медиа берётся ИЗ ОТВЕТА СЕРВЕРА, а не из того, что клиент только что загрузил:
            // строку доски заводит `appendBoardPictures` по `common_MediaFull`.
            const full = picture.media;
            if (full) placeEditedNextTo(editing.mediaId, full);
          }}
        />
      )}
    </Section>

      {/* БОКОВОЕ МЕНЮ УКАЗАНИЙ (D-27) — тот же блок, что стоит справа от листа в ARTIFACTS:
          заголовок `callouts`, счётчик пилюлей, строка на указание. Сворачивается вместе с доской:
          меню про то, что на доске, и без доски ему не о чем. */}
      {open && (
        <Section
          title='callouts'
          question='— pinned on the board, not numbered'
          action={
            <Pill tone='mut'>
              {railRows.length} on the board
            </Pill>
          }
          className='lg:w-[340px] lg:shrink-0'
        >
          <MoodCalloutRail rows={railRows} />
        </Section>
      )}
    </SectionStack>
  );
}
