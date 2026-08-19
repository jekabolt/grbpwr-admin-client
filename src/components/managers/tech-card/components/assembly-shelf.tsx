// ПОЛКА ДЕТАЛЕЙ ФУЛСКРИНА — горизонтальная полоса всех деталей карточки, сгруппированная по одной
// из ДВУХ осей: по узлу-потребителю или по ткани.
//
// ПОЛКА — НЕ ЛОТОК. `AssemblyTray` (`operations-field.tsx`) остаётся инлайну и в фулскрине не
// рендерится; здесь новый компонент, а не переиспользованный лоток, потому что у них РАЗНАЯ
// семантика клика. У лотка клик значил «добавить деталь в открытый шаг», у полки клик — ВСЕГДА
// «выбрать и довести панорамой»; добавление в шаг живёт отдельным режимом добора (`addMode`), в
// который экран входит явно, кнопкой «＋ piece» в доке. Две поверхности одного факта с разной
// семантикой клика — это ровно тот сорт расхождения, который не виден в диффе и который узнают на
// фабрике.
//
// АНАЛОГИЯ С ЛОТКОМ НЕ ПЕРЕНОСИТСЯ И В ДРУГОМ: лоток прячется при нуле операций («с нечем, к чему
// прикрепить деталь, каждый чип в нём тупик»). У полки клик = выбор, и это не тупик — полка живёт
// при нуле операций, все её детали просто стоят в ведущей группе `on the table`. Прятать её там
// значило бы закрыть первое состояние любой тех-карты.
//
// ОБЕ ОСИ — ОДИН ПРОХОД. Группировка по узлу отвечает «не забыли ли что-то собрать» (ведущая группа
// `on the table`), группировка по ткани — «правильные ли детали получили правильную ткань». Обе —
// сплошные обходы набора, поэтому вложенность (7 узлов × 4 ткани = до 28 групп в полосе высотой
// 90px) неверна, а фильтр `all | on the table | in units` ортогонален оси и только сворачивает
// длинную полосу.
//
// КОМПОНЕНТ ПРЕЗЕНТАЦИОННЫЙ. Ни формы, ни предпочтений, ни мутаторов: ось, фильтр, колорвей,
// свёрнутость, выделение и режим добора приходят пропами и уходят колбэками. Ничего из этого не
// касается RHF — иначе перегруппировка полки взводила бы `isDirty` на карточке, которую никто не
// менял; и ничего не читает из хранилища браузера — предпочтения персистит владелец состояния.
import { useMemo } from 'react';

import { cn } from 'lib/utility';
import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';
import { ViewSwitch } from 'ui/components/view-switch';

import { ClothSwatch } from './cloth-hatch';
import type { FoundPiece } from './nesting/dxf-geometry';
import { pieceRefKey } from './piece-block-refs';
import {
  CLOTH_RAMP,
  clothGroupKey,
  type PieceCloth,
  type PieceClothArticle,
  type PieceClothState,
} from './piece-cloth';
import { PieceTile } from './piece-silhouette';
import type { PieceShapeMap } from './use-piece-shapes';

/** Ось группировки полки. Взаимоисключающая: не фильтр и не вложенность. */
export type ShelfAxis = 'unit' | 'cloth';

/** Фильтр полосы. ОРТОГОНАЛЕН оси: сворачивает длинную полосу, а не заменяет группировку. */
export type ShelfFilter = 'all' | 'table' | 'units';

/**
 * ВНЕШНИЙ CSS-бокс плитки полки. Передаётся в `PieceTile` ЯВНО и никогда не оставляется на дефолт.
 *
 * Дефолт `TILE_BOX` (56×56) описывает СОБСТВЕННУЮ плитку `piece-silhouette.tsx`, а не плитку этой
 * полосы, и молчаливо принятый он даёт другой `u` («сколько user units в одном CSS-пикселе»), то
 * есть другой шаг решётки штриховки. Ровно на этом Ф1 поймала MAJOR: лоток штриховал ту же ткань на
 * четверть грубее полотна. Словарь различает роли ЧАСТОТОЙ (contrast 3.5 против main 6), поэтому
 * «одна ткань, две плотности» на одном экране ломает его выучиваемость.
 *
 * Семантика — та же, что у полотна (`TileView` в `assembly-node-views.tsx`): это ВНЕШНИЙ бокс
 * элемента `PieceTile`, паддинги своей обёртки плитка вычитает сама. Поэтому коробка ниже задана
 * этими же числами, а сама плитка растянута в неё `size-full`: пока эти два места совпадают,
 * переданный `pxBox` описывает то, что нарисовано, а не то, что предполагалось.
 */
export const SHELF_BOX = { w: 54, h: 58 };

/**
 * Порядок групп режима cloth. НЕОТВЕЧЕННОЕ ВЕДЁТ — так же, как `on the table` ведёт в режиме unit:
 * `no cloth yet` → `unsorted` → рампа.
 *
 * Хвост выведен ФИЛЬТРОМ по `CLOTH_RAMP`, а не написан вторым литералом: рампу читают штриховка,
 * свёртка словами и ключ шапки, и четвёртый её экземпляр разошёлся бы с остальными первой же
 * правкой одного из них.
 */
const CLOTH_GROUP_ORDER: readonly PieceClothState[] = [
  'unbound',
  'unsorted',
  ...CLOTH_RAMP.filter((s) => s !== 'unbound' && s !== 'unsorted'),
];

/** Деталь без записи в карте — это `unbound`: отсутствие ответа, а не ответ по умолчанию. */
const NO_CLOTH: PieceCloth = { state: 'unbound' };

/**
 * Слово ткани в ЗАГОЛОВКЕ ГРУППЫ. Два не-ответа называются фразами, а не терминами рампы: в одном
 * ряду с ролями они читались бы как ещё две ткани.
 */
function groupWord(state: PieceClothState): string {
  return state === 'unbound' ? 'no cloth yet' : state;
}

/**
 * Слово ткани во ВТОРОЙ СТРОКЕ ПЛИТКИ (режим unit). Прочерк перед «нет ткани» — из спеки: строка
 * несёт ось, по которой НЕ сгруппированы, и отсутствие ответа обязано читаться как отсутствие, а не
 * как ещё одна роль.
 */
function tileClothWord(state: PieceClothState): string {
  return state === 'unbound' ? '— no cloth' : state;
}

/**
 * Ткань фразой для `title`. Словарь ТОТ ЖЕ, что у `clothWords` в `piece-silhouette.tsx`
 * (`cloth not assigned` / `purpose not set`): у плитки два title — свой, от `PieceTile`, и этот, от
 * полки, добавляющий узел-потребитель, — и говорить они обязаны на одном языке.
 */
function clothPhrase(cloth: PieceCloth): string {
  const word =
    cloth.state === 'unsorted'
      ? 'purpose not set'
      : cloth.state === 'unbound'
        ? 'cloth not assigned'
        : cloth.state;
  const article = articleWords(cloth.article);
  return article ? `${word} · ${article}` : word;
}

/** Артикул словами: `4412 navy twill`. Пустой — когда артикула нет нигде. */
function articleWords(article?: PieceClothArticle): string {
  if (!article) return '';
  return `${article.code} ${article.name}`.trim();
}

/**
 * Готовые пропы кликабельного элемента, НЕ являющегося формой (R4).
 *
 * Полка живёт в портале, куда внешний `<fieldset disabled>` карточки не достаёт вовсе, но
 * дисциплина одна на экран: настоящая `<button>` умирает под задизейбленным предком, и своими
 * пропами этого не исправить. Отсюда роль, tabindex и клавиатура руками.
 *
 * СВОЕГО ГАРДА ДРАГА ЗДЕСЬ НЕТ намеренно: pointer-жест плитки ведёт родитель (`onTilePointerDown`),
 * и второй сторож клик-эха, не знающий про начатый жест, гасил бы клики, которые родитель считает
 * живыми.
 */
function activate(fn: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      // Автоповтор удерживаемой клавиши не должен срабатывать по разу на каждое событие — нативная
      // кнопка так себя не ведёт.
      if (e.repeat) return;
      e.preventDefault();
      fn();
    },
  };
}

/** Деталь, как её видит полоса: имя, ткань активного колорвея и узел-потребитель. */
type ShelfPiece = {
  lineKey: string;
  name: string;
  cloth: PieceCloth;
  /** Ключ узла, съевшего деталь; `null` — деталь на столе. */
  into: string | null;
};

/** Группа полосы. `state`/`article` заполнены в режиме cloth, `unitKey` — в режиме unit. */
type ShelfGroup = {
  key: string;
  pieces: ShelfPiece[];
  state?: PieceClothState;
  article?: PieceClothArticle;
  /** `null` = ведущая группа `on the table`. */
  unitKey?: string | null;
};

/** Пара ключа-легенды: знак роли и число артикулов под ним на ЭТОЙ карточке. */
type KeyEntry = { state: PieceClothState; articles: number };

export function AssemblyShelf({
  pieces,
  pieceShapes,
  pieceClothByColorway,
  colorwayIndex,
  onColorwayIndex,
  axis,
  onAxis,
  filter,
  onFilter,
  collapsed,
  onToggleCollapsed,
  intoOf,
  unitOrder,
  unitNameOf,
  selection,
  onPick,
  addMode,
  onAddToStep,
  onExitAddMode,
  onTilePointerDown,
  frozen,
}: {
  pieces: { lineKey: string; name: string }[];
  pieceShapes: PieceShapeMap | undefined;
  pieceClothByColorway: { label: string; map: Map<string, PieceCloth> }[];
  colorwayIndex: number;
  onColorwayIndex: (i: number) => void;
  axis: ShelfAxis;
  onAxis: (a: ShelfAxis) => void;
  filter: ShelfFilter;
  onFilter: (f: ShelfFilter) => void;
  /** Свёрнутая полка = ТОЛЬКО 24px шапка. Полного скрытия полки не существует. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Ключ узла-потребителя детали или `null` — деталь на столе. */
  intoOf: (lineKey: string) => string | null;
  /**
   * Порядок узлов ТАК, КАК ИХ КЛАДЁТ ПОЛОТНО — то есть в порядке шагов, а не выкроек.
   * Без него полка сортирует по первому появлению узла среди деталей, и на одном экране
   * полотно показывает CUFF→SHELL, а полка под ним SHELL→CUFF: мотивировка дефолтной оси
   * («группы зеркалят боксы узлов») перестаёт быть правдой. Родитель отдаёт `[...units.keys()]`
   * — Map фронтира хранит порядок вставки, а он и есть `producedAt`. Опционален: узлы, которых
   * в списке нет, встают следом в прежнем порядке первого появления.
   */
  unitOrder?: readonly string[];
  unitNameOf: (unitKey: string) => string;
  selection: ReadonlySet<string>;
  /** Клик по плитке ВНЕ режима добора: выбрать и довести панорамой. Всегда. */
  onPick: (lineKey: string) => void;
  addMode: null | { stepIndex: number; stepLabel: string; frontier: ReadonlySet<string> };
  /** Зовётся ТОЛЬКО в режиме добора и только по годной (входящей во фронтир) плитке. */
  onAddToStep: (lineKey: string) => void;
  onExitAddMode: () => void;
  /** Драг плитки на полотно: жест целиком ведёт родитель, полка только отдаёт событие. */
  onTilePointerDown?: (lineKey: string, e: React.PointerEvent) => void;
  frozen: boolean;
}) {
  // Индекс колорвея КЛАМПИТСЯ: карточка могла потерять колорвей, пока индекс жил в состоянии
  // владельца, и `undefined.map` уронил бы весь фулскрин ради выбора цвета.
  const cwCount = pieceClothByColorway.length;
  const cwIndex = colorwayIndex >= 0 && colorwayIndex < cwCount ? colorwayIndex : 0;
  const activeCloth = pieceClothByColorway[cwIndex]?.map ?? null;

  const rows = useMemo<ShelfPiece[]>(
    () =>
      pieces.map((p) => ({
        lineKey: p.lineKey,
        name: p.name,
        // ДВА ПРОСТРАНСТВА КЛЮЧЕЙ, и путать их нельзя: ткань ключуется СЫРЫМ `lineKey`, контур
        // чертежа — `pieceRefKey(lineKey)`. Перепутанные, они дают пустую штриховку при живом
        // рецепте, ничего не сломав на глаз.
        cloth: activeCloth?.get(p.lineKey) ?? NO_CLOTH,
        into: intoOf(p.lineKey),
      })),
    [pieces, activeCloth, intoOf],
  );

  // --- счётчики словами -------------------------------------------------------------------------
  //
  // Состояние НИКОГДА не несётся одной лишь текстурой (DESIGN.md): оба не-ответа посчитаны словами
  // в шапке. `without cloth` — детали, про которые рецепт активного колорвея молчит вовсе;
  // `unsorted` — те, у кого строка есть, секция рулонная, а назначение не поставлено. Слить их
  // значило бы заставить аудит врать в обе стороны сразу.
  const onTable = rows.filter((r) => r.into === null).length;
  const withoutCloth = rows.filter((r) => r.cloth.state === 'unbound').length;
  const unsorted = rows.filter((r) => r.cloth.state === 'unsorted').length;

  /**
   * Сколько деталей выведены ПО-РАЗНОМУ в разных колорвеях.
   *
   * Единственный указатель на то, что заливка скоуплена активным колорвеем и для остальных «врёт»:
   * роль детали законно расходится между колорвеями (пин артикула живёт на уровне колорвея), и
   * визуального состояния для этого не изобретается — только счёт словами. Сравниваются оба
   * признака сразу, `state` и `article.id`, тем же ключом, которым полоса группируется, — иначе
   * «та же роль, другой артикул» осталось бы незамеченным.
   */
  const differByColourway = useMemo(() => {
    if (cwCount < 2) return 0;
    const sign = (cw: { map: Map<string, PieceCloth> }, lineKey: string) =>
      clothGroupKey(cw.map.get(lineKey) ?? NO_CLOTH);
    return pieces.filter((p) => {
      const first = sign(pieceClothByColorway[0], p.lineKey);
      return pieceClothByColorway.some((cw) => sign(cw, p.lineKey) !== first);
    }).length;
  }, [pieces, pieceClothByColorway, cwCount]);

  // --- инлайновый ключ --------------------------------------------------------------------------
  //
  // Рисуется только при ≥2 РАЗЛИЧНЫХ ролях на карточке: при одной различать нечего. `unbound` в
  // ключ не входит — это не роль, а её отсутствие, знака у неё нет, и в ряду знаков она учила бы
  // читателя несуществующему различию. Счёт словами про неё уже сказал.
  //
  // Порядок — рампы; максимум четыре пары, дальше `+N`. Роль, под которой на карточке лежат ДВА
  // артикула, получает `×2`: знак на карточке неоднозначен, и режим cloth разделит их по имени.
  const keyEntries = useMemo<KeyEntry[]>(() => {
    const articlesByState = new Map<PieceClothState, Set<number>>();
    for (const r of rows) {
      if (r.cloth.state === 'unbound') continue;
      const bucket = articlesByState.get(r.cloth.state);
      const id = r.cloth.article?.id ?? 0;
      if (bucket) bucket.add(id);
      else articlesByState.set(r.cloth.state, new Set([id]));
    }
    return CLOTH_RAMP.filter((s) => articlesByState.has(s)).map((s) => ({
      state: s,
      articles: articlesByState.get(s)?.size ?? 1,
    }));
  }, [rows]);

  // --- группы -----------------------------------------------------------------------------------

  const visible = useMemo(
    () =>
      rows.filter((r) =>
        filter === 'table' ? r.into === null : filter === 'units' ? r.into !== null : true,
      ),
    [rows, filter],
  );

  const groups = useMemo<ShelfGroup[]>(() => {
    if (axis === 'unit') {
      // Ведущая группа `on the table` — ядровый неотвеченный вопрос экрана. Порядок остальных —
      // `unitOrder`, то есть порядок ШАГОВ, в котором узлы кладёт полотно: полка обязана их
      // зеркалить, иначе два соседних органа рассказывают о карточке разное. Узлы вне списка
      // (и весь случай, когда родитель порядка не дал) падают на прежний фолбэк — первое
      // появление узла в порядке деталей: стабильный и выводимый, просто не тот же самый.
      const table: ShelfPiece[] = [];
      const byUnit = new Map<string, ShelfPiece[]>();
      for (const r of visible) {
        if (r.into === null) {
          table.push(r);
          continue;
        }
        const bucket = byUnit.get(r.into);
        if (bucket) bucket.push(r);
        else byUnit.set(r.into, [r]);
      }
      const out: ShelfGroup[] = [];
      if (table.length > 0) out.push({ key: 'table', unitKey: null, pieces: table });
      const rank = new Map<string, number>();
      (unitOrder ?? []).forEach((k, i) => {
        if (!rank.has(k)) rank.set(k, i);
      });
      const seen = [...byUnit.keys()];
      const ordered = seen
        .map((k, i) => ({ k, r: rank.get(k) ?? Number.POSITIVE_INFINITY, i }))
        // Сортировка стабильная и без обращения к float-NaN: равные ранги (в том числе оба
        // «не названы») сохраняют прежний порядок первого появления через запасной ключ `i`.
        .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r))
        .map((x) => x.k);
      for (const unitKey of ordered) {
        out.push({ key: `unit:${unitKey}`, unitKey, pieces: byUnit.get(unitKey)! });
      }
      return out;
    }

    // Группа режима cloth = НАЗНАЧЕНИЕ × ЭФФЕКТИВНЫЙ АРТИКУЛ (`clothGroupKey`: там пин колорвея уже
    // выигран у дефолта слота). Два артикула под одним purpose дают ДВЕ группы с одним знаком, —
    // заголовок различает их именем. Свернуть группу по слоту без пина значило бы подписать её
    // чужим артикулом.
    const byKey = new Map<string, ShelfGroup>();
    for (const r of visible) {
      const key = clothGroupKey(r.cloth);
      const bucket = byKey.get(key);
      if (bucket) bucket.pieces.push(r);
      else byKey.set(key, { key, state: r.cloth.state, article: r.cloth.article, pieces: [r] });
    }
    // Внутри одного состояния группы идут в порядке первого появления — тем же правилом, что узлы.
    const seen = [...byKey.values()];
    return CLOTH_GROUP_ORDER.flatMap((s) => seen.filter((g) => g.state === s));
  }, [visible, axis, unitOrder]);

  // --- органы шапки -----------------------------------------------------------------------------

  const caret = (
    <span
      {...activate(onToggleCollapsed)}
      aria-expanded={!collapsed}
      title={collapsed ? 'expand the pieces shelf ([)' : 'collapse the shelf to its header ([)'}
      aria-label={collapsed ? 'expand the pieces shelf' : 'collapse the pieces shelf'}
      className='cursor-pointer select-none text-micro leading-none text-labelColor transition-colors hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
    >
      {collapsed ? '▸' : '▾'}
    </span>
  );

  const clickTile = (lineKey: string) => {
    if (addMode) {
      // Отказ по негодной плитке ПРОИЗНОСИТ РОДИТЕЛЬ — словами движка, там же, где стоит гейт
      // фронтира. Здесь плитка приглушена заранее, а клик по ней просто не происходит.
      if (!addMode.frontier.has(lineKey)) return;
      // Пояс и подтяжки: у мутатора добавления есть свой гейт, но дыра здесь самая тихая — портал
      // выносит полку из-под `<fieldset disabled>` карточки целиком.
      if (frozen) return;
      onAddToStep(lineKey);
      return;
    }
    onPick(lineKey);
  };

  return (
    <section
      className='flex min-h-0 flex-col border border-borderColor bg-bgColor'
      aria-label='pieces shelf'
    >
      {/* ── шапка: 24px, и в свёрнутом виде она — вся полка ─────────────────────────────────── */}
      <div className='flex h-6 shrink-0 items-center gap-2 overflow-hidden px-2'>
        {caret}
        {addMode ? (
          // ОРГАНЫ ШАПКИ УСТУПАЮТ МЕСТО СООБЩЕНИЮ: пока идёт добор, шапка занята одним — сказать, в
          // какой шаг кладут и чем это кончается.
          <>
            <Text
              size='micro'
              variant='uppercase'
              tracking='label'
              component='span'
              className='min-w-0 truncate font-bold'
            >
              adding to step {addMode.stepLabel} — click pieces · esc to finish
            </Text>
            <span className='ml-auto shrink-0'>
              <Chip nonForm onClick={onExitAddMode} title='finish adding pieces (esc)'>
                done
              </Chip>
            </span>
          </>
        ) : (
          <>
            <Text
              size='micro'
              variant='uppercase'
              tracking='label'
              component='span'
              className='shrink-0 font-bold'
            >
              pieces
            </Text>
            {/* СЧЁТЧИКИ — ТЕКСТ, А НЕ ОРГАНЫ: нажимать здесь не на что. Ужимаются ПЕРВЫМИ (`shrink`
                при `shrink-0` у переключателей): на узком окне обрезанная фраза лучше, чем
                выдавленный за край орган, которым не переключить ось. */}
            <Text
              size='micro'
              variant='label'
              component='span'
              className='min-w-0 shrink truncate tabular-nums'
              title='what the shelf holds: how many pieces the card declares, how many are still on the table, and the two kinds of unanswered cloth'
            >
              — {pieces.length} total · {onTable} on the table · {withoutCloth} without cloth ·{' '}
              {unsorted} unsorted
              {differByColourway > 0 ? ` · ${differByColourway} differ by colourway` : ''}
            </Text>
            <InlineKey entries={keyEntries} />
            <span className='ml-auto flex shrink-0 items-center gap-2'>
              <ColorwayName
                colorways={pieceClothByColorway}
                index={cwIndex}
                onIndex={onColorwayIndex}
              />
              <Text size='micro' variant='label' component='span' className='shrink-0'>
                group by
              </Text>
              <ViewSwitch<ShelfAxis>
                value={axis}
                onChange={onAxis}
                label='group pieces by'
                options={[
                  {
                    value: 'unit',
                    label: 'unit',
                    hint: 'group by the unit that consumed the piece',
                  },
                  {
                    value: 'cloth',
                    label: 'cloth',
                    hint: 'group by purpose and catalogue article',
                  },
                ]}
              />
              <ViewSwitch<ShelfFilter>
                value={filter}
                onChange={onFilter}
                label='filter pieces'
                options={[
                  { value: 'all', label: 'all', hint: 'every piece the card declares' },
                  { value: 'table', label: 'on the table', hint: 'pieces no unit has taken yet' },
                  { value: 'units', label: 'in units', hint: 'pieces already consumed by a unit' },
                ]}
              />
            </span>
          </>
        )}
      </div>

      {/* СВЁРНУТАЯ ПОЛКА ОСТАЁТСЯ ПОЛКОЙ: счётчики и оба переключателя видны и работают. Полного
          скрытия не существует — иначе «где мои детали» отвечалось бы только памятью. */}
      {!collapsed && (
        <div
          className='flex min-h-0 flex-1 items-stretch gap-5 overflow-x-auto overflow-y-hidden border-t border-hairline px-2 py-1'
          role='group'
          aria-label={axis === 'unit' ? 'pieces grouped by unit' : 'pieces grouped by cloth'}
        >
          {pieces.length === 0 ? (
            <Text size='micro' variant='label' component='span' className='self-center'>
              no pieces yet — pieces come from the patterns
            </Text>
          ) : groups.length === 0 ? (
            <Text size='micro' variant='label' component='span' className='self-center'>
              no pieces under this filter
            </Text>
          ) : (
            groups.map((g) => (
              <div key={g.key} className='flex shrink-0 flex-col gap-1'>
                <GroupHead group={g} unitNameOf={unitNameOf} />
                <div className='flex items-start gap-2'>
                  {g.pieces.map((p) => (
                    <ShelfTile
                      key={p.lineKey}
                      piece={p}
                      axis={axis}
                      found={pieceShapes?.get(pieceRefKey(p.lineKey)) ?? null}
                      picked={selection.has(p.lineKey)}
                      addMode={addMode}
                      onClick={() => clickTile(p.lineKey)}
                      onPointerDown={
                        onTilePointerDown
                          ? (e: React.PointerEvent) => onTilePointerDown(p.lineKey, e)
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Активный колорвей словами и, при >1, переключатель.
 *
 * Заливка показывает назначение АКТИВНОГО колорвея, и читатель обязан знать, какого именно: пин
 * артикула живёт на уровне колорвея, поэтому деталь законно кроится из разного в разных цветах.
 * Ноль колорвеев — не ошибка, а «рецепта ещё нет»: карточка без рецепта штрихуется пусто, и сказать
 * это прямо честнее, чем оставить пустую шапку.
 *
 * Чипы — `nonForm`: орган ЧТЕНИЯ (переключить вид), он обязан работать и на выпущенной карточке.
 */
function ColorwayName({
  colorways,
  index,
  onIndex,
}: {
  colorways: { label: string }[];
  index: number;
  onIndex: (i: number) => void;
}) {
  if (colorways.length === 0) {
    return (
      <Text size='micro' variant='label' component='span' className='shrink-0'>
        cloth — no recipe yet
      </Text>
    );
  }
  if (colorways.length === 1) {
    return (
      <Text size='micro' variant='label' component='span' className='min-w-0 shrink-0 truncate'>
        cloth — ▸ {colorways[0].label}
      </Text>
    );
  }
  return (
    <span className='flex shrink-0 items-center gap-1'>
      <Text size='micro' variant='label' component='span'>
        cloth —
      </Text>
      <ChipRow>
        {colorways.map((cw, i) => (
          <Chip
            key={`${cw.label}:${i}`}
            nonForm
            selected={i === index}
            onClick={() => onIndex(i)}
            title={`show the cloth of colourway ${cw.label}`}
          >
            {cw.label}
          </Chip>
        ))}
      </ChipRow>
    </span>
  );
}

/**
 * Инлайновый ключ штриховок — ТОЧНЫЙ набор ролей этой карточки, а не весь словарь.
 *
 * Переключение полки в режим cloth и есть основной жест легенды (каждый заголовок группы несёт свой
 * образец); ключ — подпорка для режима unit: он инлайновый, занимает свободную ширину шапки
 * и не стоит ни одной строки. Образец зовёт ту же `clothPatternDefs`, что и плитка: легенда со
 * знаком — это не легенда.
 */
function InlineKey({ entries }: { entries: KeyEntry[] }) {
  if (entries.length < 2) return null;
  const shown = entries.slice(0, 4);
  const rest = entries.length - shown.length;
  return (
    <span className='flex min-w-0 shrink items-center gap-1.5 overflow-hidden'>
      {shown.map((e, i) => (
        <span key={e.state} className='flex shrink-0 items-center gap-1'>
          {i > 0 && (
            <Text size='micro' variant='label' component='span' className='text-labelColor'>
              ·
            </Text>
          )}
          <ClothSwatch state={e.state} />
          <Text
            size='micro'
            variant='label'
            component='span'
            title={
              e.articles > 1
                ? `${e.state} ×${e.articles} under one mark — that many different cloths share this fill on this card; group by cloth to tell them apart`
                : e.state
            }
          >
            {e.state}
            {e.articles > 1 ? ` ×${e.articles}` : ''}
          </Text>
        </span>
      ))}
      {rest > 0 && (
        <Text size='micro' variant='label' component='span'>
          +{rest}
        </Text>
      )}
    </span>
  );
}

/**
 * Заголовок группы.
 *
 * Режим unit — ключ узла и его имя (`▣ SHELL · shell`), ведущая группа называется `on the table`.
 * Режим cloth — образец, назначение и артикул (`▣ main · 4412 navy twill`). ИМЯ АРТИКУЛА РЕЖЕТСЯ,
 * КОД — НИКОГДА: по коду артикул опознают, имя — украшение, и обрезанный код превратил бы заголовок
 * в загадку.
 */
function GroupHead({
  group,
  unitNameOf,
}: {
  group: ShelfGroup;
  unitNameOf: (unitKey: string) => string;
}) {
  const count = `${group.pieces.length} ${group.pieces.length === 1 ? 'piece' : 'pieces'}`;

  if (group.unitKey !== undefined) {
    if (group.unitKey === null) {
      return (
        <Head title={`${count} that no unit has taken yet`}>
          <span className='uppercase'>on the table</span>
        </Head>
      );
    }
    const name = unitNameOf(group.unitKey).trim();
    return (
      <Head title={`unit ▣ ${group.unitKey}${name ? ` — ${name}` : ''} · ${count}`}>
        {/* КЛЮЧ И ИМЯ ОБА, даже когда имя — это ключ строчными: ключ пишут в поле «produces», имя
            даёт человек, и совпадают они не всегда. Прятать имя по совпадению значило бы заводить
            правило, которое молча перестаёт работать, как только имя разошлось с ключом. Ключ
            обрезке не подлежит — режется имя. */}
        <span className='shrink-0 uppercase'>▣ {group.unitKey}</span>
        {name && <span className='min-w-0 truncate normal-case'>· {name}</span>}
      </Head>
    );
  }

  const state = group.state ?? 'unbound';
  const article = articleWords(group.article);
  return (
    <Head title={`${groupWord(state)}${article ? ` · ${article}` : ''} · ${count}`}>
      <ClothSwatch state={state} />
      <span className='shrink-0 uppercase'>{groupWord(state)}</span>
      {group.article && (
        <>
          {/* Код — своим спаном без `truncate`: обрезается ТОЛЬКО имя. */}
          <span className='shrink-0 uppercase'>· {group.article.code}</span>
          {group.article.name && (
            <span className='min-w-0 truncate normal-case'>{group.article.name}</span>
          )}
        </>
      )}
    </Head>
  );
}

/** Общая коробка заголовка группы: 10px прописными над волосяной линией. */
function Head({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div
      title={title}
      className='flex max-w-[280px] items-center gap-1 border-b border-hairline pb-0.5 text-micro tracking-label text-labelColor'
    >
      {children}
    </div>
  );
}

/**
 * ПЛИТКА ПОЛКИ: контур со штриховкой ткани и вторая строка с ДРУГОЙ осью.
 *
 * Вторая строка всегда несёт ту ось, по которой НЕ сгруппированы: в режиме unit — слово ткани, в
 * режиме cloth — узел-потребитель. Это убирает дублирование заголовка группы и делает оба аудита
 * однопроходными.
 *
 * `pxBox` передаётся ЯВНО и равен коробке, в которую плитка растянута (`size-full`): дефолт
 * `TILE_BOX` описывает другую плитку и увёл бы шаг решётки штриховки от полотна.
 */
function ShelfTile({
  piece,
  axis,
  found,
  picked,
  addMode,
  onClick,
  onPointerDown,
}: {
  piece: ShelfPiece;
  axis: ShelfAxis;
  /** Контур детали из общего разбора; `null` — привязки нет или кэш холодный. */
  found: FoundPiece | null;
  picked: boolean;
  addMode: null | { stepIndex: number; stepLabel: string; frontier: ReadonlySet<string> };
  onClick: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const eligible = !addMode || addMode.frontier.has(piece.lineKey);
  const second =
    axis === 'unit' ? tileClothWord(piece.cloth.state) : piece.into ? `▣ ${piece.into}` : 'free';
  const where = piece.into ? `in ▣ ${piece.into}` : 'on the table';
  const title = eligible
    ? `${piece.name} — ${clothPhrase(piece.cloth)} — ${where}`
    : `${piece.name} — not on the frontier of step ${addMode?.stepLabel ?? ''}: it has already gone into a unit`;

  return (
    <div
      {...activate(onClick)}
      aria-disabled={eligible ? undefined : true}
      aria-pressed={picked}
      title={title}
      aria-label={title}
      onPointerDown={onPointerDown}
      className={cn(
        'flex shrink-0 select-none flex-col gap-0.5',
        eligible ? 'cursor-pointer' : 'cursor-not-allowed opacity-40',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
      )}
      // `pan-x`, а не `none`: полоса прокручивается браузером ПО ГОРИЗОНТАЛИ, и глухая
      // `touch-action: none` убила бы её прокрутку пальцем на всей площади плиток. Вертикальные
      // жесты при этом остаются приложению — а полотно лежит ровно под полкой, то есть драг детали
      // на схему как раз вертикальный.
      style={{ width: SHELF_BOX.w, touchAction: 'pan-x' }}
    >
      {/* Коробка ровно `SHELF_BOX`, плитка растянута в неё: переданный `pxBox` обязан описывать то,
          что нарисовано. Кольцо выделения — то же, что у ноды полотна: 2px чернил с отступом,
          снаружи плитки; заливка живёт внутри контура, общих пикселей у них нет. */}
      <div
        className={cn(
          'flex items-center justify-center overflow-hidden border border-borderColor transition-colors',
          picked && 'border-textColor outline outline-2 outline-offset-2 outline-textColor',
          eligible && !picked && 'hover:border-textColor',
        )}
        style={{ width: SHELF_BOX.w, height: SHELF_BOX.h }}
      >
        <PieceTile
          found={found}
          name={piece.name}
          cloth={piece.cloth}
          pxBox={SHELF_BOX}
          className='size-full'
        />
      </div>
      <span className='block truncate text-nano uppercase leading-[1.35] tracking-pill text-labelColor'>
        {second}
      </span>
    </div>
  );
}
