import { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Canvas, Pin } from 'ui/components/canvas';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';
import { ulid } from 'utils/ulid';
import { bomPurposeLabel, type FabricScope, type RollGoodsLine } from './bom-purpose';
import { uniOf } from './nesting/block-code';
import { useCardDxfPack } from './nesting/card-dxf-pack';
import { cardHasDxf, type PatternSheetRow } from './nesting/card-has-dxf';
import {
  findPiece,
  fmtCm,
  PieceShape,
  useDxfGeometry,
  useDxfIndex,
  type FoundPiece,
} from './nesting/dxf-geometry';
import { pieceBlockRefs, rollGoodsScopes, type PieceAliasRow } from './piece-block-refs';
import {
  UNSET_CUT_SYMMETRY,
  fusingHint,
  fusingModeOptionsFor,
  fusingTakesWidth,
  grainlineArrow,
  grainlineOptionsFor,
  pieceCodeOptions,
  UNSET_FUSING_MODE,
} from './piece-codes';
import { derivePieceLayerRole, pieceLayerRoleLabel } from './piece-layer-role';
import { normalizePieceName } from './piece-picker';
// Счёт «что уедет вместе с деталью» — общий с модалкой «↔ детали кроя»; локальное имя оставлено
// прежним, чтобы читателям панели детали ничего не пришлось переучивать.
import { recipeHoldersByPiece as buildRecipeHolders } from './piece-recipe-hold';
import { TechCardFormData, wireInt } from './schema';
import { useCrossHighlight } from './useCrossHighlight';

type FormPiece = NonNullable<TechCardFormData['pieces']>[number];
type FormCallout = {
  number?: number;
  mediaId?: number;
  part?: string;
  posX?: string;
  posY?: string;
};

// Panel controls sit at the same metrics as `Input` (1px edge box, 3px/7px, 22px min height) —
// DESIGN.md §5. A native select, not the Radix one: this panel is dense, and Radix's Select cannot
// carry an empty-string option, which is exactly the value a piece that has never been given a
// grainline holds.
const selectCls =
  'block min-h-[22px] w-full appearance-none rounded-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize transition-colors focus:border-textColor focus:outline-none';

// Выпущенная карточка заморожена целиком: тот же ответ, каким родительская страница выключает
// `<fieldset disabled={frozen}>` вокруг этой вкладки (index.tsx). Нужен здесь ОТДЕЛЬНО, потому что
// fieldset глушит контролы, а не эффекты.
const RELEASED_STATE = 'TECH_CARD_APPROVAL_STATE_RELEASED';

// The piece-count word for a group summary: “1 piece · 2 pieces”.
const ruPieces = (n: number): string => (n === 1 ? 'piece' : 'pieces');

// The marker diagram inside the selected-piece panel (13.1). Grainline is GEOMETRY — a picture
// verifies it faster than a column of words — so the callout number each piece already carries is
// drawn where the sketch says it lives. Pins are positioned against the image's own box (not a
// fixed-aspect frame) because callout posX/posY are fractions OF THE IMAGE: letterboxing a 4:3
// sketch inside a 3:4 frame would slide every pin off the part it names.
function PieceDiagram({
  techCard,
  pinnedNumbers,
  labelForPin,
  activePin,
  onActivePinChange,
}: {
  techCard?: common_TechCard;
  pinnedNumbers: Set<number>;
  labelForPin: (n: number) => string;
  activePin: number | null;
  onActivePinChange: (n: number | null) => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];

  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const rm of techCard?.resolvedTechnicalMedia ?? []) {
      if (rm.media?.id != null) m.set(rm.media.id, rm.media);
    }
    return m;
  }, [techCard?.resolvedTechnicalMedia]);

  const urlFor = (mediaId: number) => {
    const f = mediaById.get(mediaId);
    return f?.media?.fullSize?.mediaUrl || f?.media?.thumbnail?.mediaUrl || '';
  };

  // Only callouts a piece actually points at are drawn — an unreferenced pin belongs to the sketch
  // tab, not to the cut list. The view shown is whichever technical sketch hosts the most of them.
  const drawable = callouts.filter((c) => {
    const n = c.number ?? 0;
    if (n <= 0 || !pinnedNumbers.has(n)) return false;
    if (!urlFor(c.mediaId ?? 0)) return false;
    return !Number.isNaN(parseFloat(c.posX ?? '')) && !Number.isNaN(parseFloat(c.posY ?? ''));
  });

  const bestMediaId = useMemo(() => {
    const counts = new Map<number, number>();
    for (const c of drawable) {
      const id = c.mediaId ?? 0;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    let best = 0;
    let bestN = 0;
    for (const [id, n] of counts) if (n > bestN) [best, bestN] = [id, n];
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawable.map((c) => `${c.mediaId}:${c.number}`).join(',')]);

  const shown = drawable.filter((c) => (c.mediaId ?? 0) === bestMediaId);
  const url = bestMediaId ? urlFor(bestMediaId) : '';

  if (!url || shown.length === 0) {
    return (
      <div className='flex flex-col gap-1'>
        <Canvas aspect='3/4' className='flex items-center justify-center'>
          <Text
            size='micro'
            variant='label'
            component='span'
            className='px-2 text-center uppercase'
          >
            no callouts
          </Text>
        </Canvas>
        {/* Инструкция обязана называть ТО МЕСТО, где действие есть. Прежняя звала «проставить
            callout # у детали» — контрол, которого в этом блоке нет с 30.07; связь ставится
            выбором детали в самой выноске на вкладке sketch. */}
        <Text size='micro' variant='label'>
          place a callout on the sketch (the sketch tab) and pick this piece in its “part” field —
          the pin shows up here
        </Text>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-1'>
      <div className='relative w-full border border-borderColor'>
        <img src={url} alt='piece diagram' draggable={false} className='block w-full select-none' />
        {shown.map((c) => {
          const n = c.number as number;
          return (
            <Pin
              key={`${c.mediaId}-${n}`}
              x={parseFloat(c.posX ?? '0') * 100}
              y={parseFloat(c.posY ?? '0') * 100}
              label={n}
              title={labelForPin(n)}
              highlighted={activePin === n}
              onMouseEnter={() => onActivePinChange(n)}
              onMouseLeave={() => onActivePinChange(null)}
            />
          );
        })}
      </div>
      <Text size='micro' variant='label'>
        hover a tile — its pin lights up
      </Text>
    </div>
  );
}

// Cut-piece details (детали кроя) — a tile per pattern part, grouped by fabric scope.
//
// This block lives on the PATTERNS tab, directly under «выкройки (DXF)», because a cut piece is a
// property of the PATTERN, not of a colour: every colourway cuts the same pieces. The pieces
// themselves arrive from the DXF through «↔ детали кроя» on the panel above, so the dialog and the
// list it writes into are now on one screen. What stays on COLORWAYS is the per-colourway fabric
// map — which BOM line each piece is cut from in that colourway, and its fusing — because that IS
// per-colourway data.
//
// The 7-column table this used to be forced a horizontal scroll on every monitor (min 860px inside
// a 1fr track beside a 200px rail) and let one row grow five lines tall, because three independent
// warning channels lived in three different columns. A real card is 20–40 rows. The tiles carry
// what an operator scans FOR (shape, name, size); everything editable lives in ONE selected-piece
// panel below, a peer block — a block never contains a block (DESIGN.md).
//
// The `pieces` field array is owned HERE and nowhere else. `PieceMatchModal` writes through a ROOT
// `setValue('pieces', …)` on purpose: measured against react-hook-form 7.62, `append`/`remove` emit
// only on `_subjects.state`, never `_subjects.array`, so a second `useFieldArray('pieces')` anywhere
// would not resync and a piece created from the DXF dialog would be invisible until a save+refetch.
export function PiecesTab({
  techCard,
  active,
}: {
  techCard?: common_TechCard;
  // Вкладка PATTERNS открыта — тот же обязательный ответ, что у панели выкроек, и по той же
  // причине: вкладки карточки смонтированы все сразу и спрятаны через `hidden`, а разбор стоит
  // скачивания DXF. См. patterns-field.tsx.
  active: boolean;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'pieces' });
  const pieces = (useWatch({ control, name: 'pieces' }) ?? []) as FormPiece[];
  // `isSubmitting` нужен предзаполнению галки UNI ниже: сохранение забирает СНИМОК формы и по
  // успеху делает `reset` тем, что уехало (index.tsx), — значит запись, сделанная во время рейса,
  // молча пропадает вместе с ним.
  const { errors, isSubmitting } = useFormState({ control });
  // DXF block → piece aliases (0262). They are what lets this block say where a piece came from:
  // a piece with an alias is drawn in a real CAD file, and that file — not the word in the `grain`
  // field — is what the раскладка orients the piece by.
  const aliases = (useWatch({ control, name: 'pieceDxfAliases' }) ?? []) as PieceAliasRow[];
  // Скоупы ткани карточки — то, ПО ЧЕМУ хранится и связь блока с деталью, и привязка листа
  // выкройки (0267: назначение, а где карточка ещё не разложена — строка BOM). Нужны здесь и для
  // предпросмотра (одно и то же имя блока в файле верха и в файле подклада — РАЗНЫЕ детали), и для
  // группировки плиток: деталь лежит в группе той ткани, из чьего файла она нарисована.
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as Array<{
    lineKey?: string;
    section?: string;
    purpose?: string;
    name?: string;
  }>;
  // Привязан ли к карточке хоть один DXF — это и есть ответ, можно ли ещё заводить детали руками:
  // с чертежом единственный автор деталей — модалка «↔ детали кроя», и вторая, ручная дверь молча
  // расхаживала бы карточку с чертежом. Смотрим ФОРМУ, а не сохранённую карточку (почему — в
  // card-has-dxf.ts): лист, добавленный в этой сессии, закрывает ручное заведение сразу.
  const patterns = (useWatch({ control, name: 'patterns' }) ?? []) as PatternSheetRow[];
  const hasDxf = cardHasDxf(patterns);
  // Tile ↔ pin cross-highlight, the same hook the construction tab drives its sketch with.
  const pin = useCrossHighlight<number>();
  // Разбор включён. Латч по открытой вкладке — ровно как на панели выкроек: там же написано,
  // почему это не зеркало `active`. Кнопки «⌕ показать формы» больше нет: имя блока формы не
  // несёт, то есть без разбора плитки не отвечают на свой единственный вопрос, а геометрия всё
  // равно идёт из общего кэша карточки (dxf-geometry.tsx) — панель выкроек над этим блоком
  // просит ТУ ЖЕ пачку, так что скачивание одно на двоих.
  const [armed, setArmed] = useState(active);
  useEffect(() => {
    if (active) setArmed(true);
  }, [active]);
  // Выбранная плитка — её поля редактирует панель ниже. Ключ — стабильный id строки RHF; пустой
  // или потерянный (деталь удалена, массив переписан диалогом сопоставления) откатывается к
  // первой детали, чтобы панель с полями не исчезала, пока детали есть.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Фильтр плиток: чип скоупа ткани («все» по умолчанию).
  const [filter, setFilter] = useState<string>('all');

  const scopes = useMemo(() => rollGoodsScopes(bomItems), [bomItems]);

  // Подпись скоупа для чипа фильтра и заголовка группы: у назначения — само назначение, у
  // неразобранной строки — её название (то же правило, что у панели выкроек, без списка артикулов
  // — чип должен оставаться коротким).
  const scopeLabel = (s: FabricScope<RollGoodsLine>): string => {
    if (!s.byPurpose) return s.lines[0]?.name?.trim() || 'unnamed';
    return bomPurposeLabel(s.key);
  };

  // Which DXF blocks each piece is drawn as, by lineKey — ОБЩЕЙ функцией (piece-block-refs.ts),
  // той же, что строит карту силуэтов рецепт колорвея: ключ, порядок refs и резолв скоупа входят
  // в контракт показа, и своя копия этой арифметики рисовала бы одну деталь двумя контурами.
  const blocksByPiece = useMemo(() => pieceBlockRefs(aliases, scopes), [aliases, scopes]);

  // ВСЯ пачка DXF карточки, посчитанная ОБЩЕЙ функцией (card-dxf-pack.ts) — той же самой, что
  // читает панель выкроек над этим блоком. Список обязан совпасть побайтово: ключ кэша разбора —
  // это и есть содержимое пачки, и своя, «почти такая же» сборка означала бы второе скачивание
  // тех же файлов, которого никто не заметит (см. комментарий в card-dxf-pack.ts).
  const dxfCardPack = useCardDxfPack();

  // Общий разбор карточки (React Query, ключ по содержимому пачки): второй читатель той же пачки —
  // панель выкроек или раскладка — получает геометрию мгновенно, и наоборот.
  const geometry = useDxfGeometry(dxfCardPack, armed);
  const index = useDxfIndex(geometry.data);

  // Контур каждой привязанной детали — один раз на рендер геометрии, а не на плитку.
  const foundByKey = useMemo(() => {
    if (!index) return null;
    const m = new Map<string, FoundPiece | null>();
    for (const [key, refs] of blocksByPiece) m.set(key, findPiece(index, refs));
    return m;
  }, [index, blocksByPiece]);

  // ЧТО УЕДЕТ ВМЕСТЕ С ДЕТАЛЬЮ — по ключу детали: колорвеи, чей рецепт её держит, сколько строк и
  // сколько из них несут ЧИСЛО (норму). Само правило и объяснение, почему сервер сносит эти строки
  // вместе с деталью, — в `piece-recipe-hold.ts`: тот же счёт потерь нужен модалке «↔ детали кроя»,
  // а две копии правила разъехались бы молча.
  const recipeHoldersByPiece = useMemo(
    () => buildRecipeHolders(techCard?.colorways),
    [techCard?.colorways],
  );

  // Детали, КОТОРЫЕ УЖЕ ЛЕЖАТ НА СЕРВЕРЕ, по их ключу. Ими гейтится предзаполнение галки ниже:
  // у такой детали ответ про градацию ХРАНИМЫЙ, и переспрашивать его не у кого.
  const savedPieceKeys = useMemo(() => {
    const set = new Set<string>();
    for (const p of techCard?.techCard?.pieces ?? []) {
      const key = (p.lineKey ?? '').trim().toLowerCase();
      if (key) set.add(key);
    }
    return set;
  }, [techCard?.techCard?.pieces]);

  // ПРЕДЗАПОЛНЕНИЕ ГАЛКИ «НЕ ГРАДУИРУЕТСЯ» ПО ТОКЕНУ `UNI` В ИМЕНИ БЛОКА.
  //
  // Лекальщик отвечает на этот вопрос прямо в чертеже (`PCK_L_UNI_M`), и переспрашивать оператора
  // незачем: ответ уже дан, его надо перенести в карточку и НАЗВАТЬ ИСТОЧНИК — подпись под галкой.
  //
  // ПРЕДЗАПОЛНЯЕТСЯ ТОЛЬКО ТО, ЧЕГО ОПЕРАТОР ЕЩЁ НЕ РЕШАЛ, — деталь, которой нет в сохранённой
  // карточке (она заведена в этой сессии: диалогом сопоставления или руками). ХРАНИМОЕ значение не
  // трогается НИКОГДА, и это главное правило здесь. Реф «уже обработано» жил ровно столько, сколько
  // маунт вкладки, и потому обещание «снял галку — она не вернётся» держалось только до
  // перезагрузки: снятый и сохранённый false карточка читала снова, эффект видел живой токен и
  // ставил пометку обратно — сохранение возвращало то, что оператор снял, и объяснить это было
  // нечем. Тот же реф пачкал форму на КАЖДОМ открытии вкладки у любой карточки с uni-именами:
  // непрошеный unsaved-prompt и замороженная публикация площадей (useUnsavedAreaSource) без
  // единого действия человека.
  //
  // ГЕЙТ ЗАМОРОЗКИ ОБЯЗАТЕЛЕН, и это не перестраховка. Вкладка целиком лежит внутри
  // `<fieldset disabled={frozen}>`, но fieldset глушит КОНТРОЛЫ, а не эффекты: на выпущенной
  // карточке этот `setValue` прошёл бы сквозь него и молча пометил деталь замороженной карточки —
  // правку, которой никто не делал и которую негде увидеть.
  //
  // Ждём разбор (`index`): предзаполнять по связям, пока чертежи не прочитаны, значит отвечать за
  // файлы, которых мы ещё не видели. И ждём КОНЦА СОХРАНЕНИЯ: карточка уезжает снимком формы, а по
  // успеху `form.reset` возвращает форму к тому, что уехало (index.tsx). Разбор, дочитавшийся во
  // время рейса, ставил галку в форму, помечал деталь обработанной — и reset стирал её обратно в
  // false. Повторно эффект уже не срабатывал, и деталь уезжала непомеченной при живом токене в
  // чертеже. Поэтому во время рейса не пишем ничего, а после него ПОВТОРЯЕМ решение по тем
  // деталям, чью пометку reset откатил: снять её в этот момент оператор не мог — контролы были в
  // рейсе вместе с формой.
  const frozen = techCard?.techCard?.approvalState === RELEASED_STATE;
  const uniPrefilled = useRef(new Set<string>());
  const uniWritten = useRef(new Set<string>());
  const sawSubmitting = useRef(false);
  useEffect(() => {
    if (isSubmitting) {
      sawSubmitting.current = true;
      return;
    }
    if (!index || frozen) return;
    // Флаг снимается только на прогоне, который реально принимает решения: разбор мог быть ещё не
    // готов в момент, когда сохранение закончилось.
    const afterSubmit = sawSubmitting.current;
    sawSubmitting.current = false;
    // Значения читаются императивно, а не из `pieces`: иначе эффект пересчитывался бы на каждое
    // нажатие клавиши в любом поле карточки, а решает он ровно два входа — разбор и связи.
    const rows = (getValues('pieces') ?? []) as FormPiece[];
    rows.forEach((p, pi) => {
      const key = (p.lineKey ?? '').trim().toLowerCase();
      if (!key) return;
      if (afterSubmit && !p.ungraded && uniWritten.current.has(key)) {
        // Наша пометка не пережила сохранение — решение считается непринятым и принимается заново.
        uniPrefilled.current.delete(key);
        uniWritten.current.delete(key);
      }
      if (uniPrefilled.current.has(key)) return;
      // Деталь есть на сервере — её ответ уже дан и хранится. Даже если это `false` от карточки,
      // сохранённой до 0302: отличить «оператор снял» от «никто не спрашивал» отсюда нечем, а
      // цена ошибки несимметрична — во втором случае человек поставит галку сам и один раз, в
      // первом мы молча отменяем его решение при каждом открытии.
      if (savedPieceKeys.has(key)) return;
      const refs = blocksByPiece.get(key) ?? [];
      // ВСЕ блоки детали, а не первый: деталь, у которой один чертёж помечен, а другой нет, —
      // это расхождение чертежей, и отвечать за автора здесь нечем.
      if (refs.length === 0 || !refs.every((r) => uniOf(r.block))) return;
      uniPrefilled.current.add(key);
      if (p.ungraded) return;
      setValue(`pieces.${pi}.ungraded`, true, { shouldDirty: true });
      // Запомнить, что пометку поставили МЫ: только по этому признаку выше отличается откат
      // сохранением от снятия галки человеком. Снятое человеком остаётся снятым.
      uniWritten.current.add(key);
    });
  }, [index, blocksByPiece, frozen, isSubmitting, savedPieceKeys, getValues, setValue]);

  // Usage.pieceIndex renumbering on piece removal now belongs to the colourway recipe (server-owned,
  // edited via UpdateColorwayRecipe) — the RHF `colorways` array is always empty, so the old
  // form-state renumbering loop was dead. Just drop the piece row here.
  // Release the piece's referrers before dropping it, the same contract the BOM's removeArticle
  // keeps. An operation still naming a deleted piece fails the save server-side
  // (operations[N].piece_line_key: no cut-piece "…" in this style) and rolls the whole transaction
  // back — on a key the operator cannot see, from a row they did not touch.
  const removePiece = (pi: number) => {
    const removedKey = (getValues(`pieces.${pi}.lineKey`) as string) || '';
    if (removedKey) {
      const operations = (getValues('operations') ?? []) as TechCardFormData['operations'];
      (operations ?? []).forEach((o, oi) => {
        const keys = (o.inputKeys ?? []).filter(Boolean);
        if (keys.includes(removedKey)) {
          setValue(
            `operations.${oi}.inputKeys`,
            keys.filter((k) => k !== removedKey),
            { shouldDirty: true },
          );
        }
      });
    }
    remove(pi);
  };

  // Duplicate CODE / NAME rows, case-insensitively. A piece name is how a human addresses the part
  // in the operation picker, the recipe norm and the factory sheet, so two pieces called «полочка»
  // make every one of those references ambiguous. Flagged here on the field (the server rejects the
  // save with the same rule, so catching it at the source beats a blocked save later).
  const duplicateRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of pieces) {
      const key = normalizePieceName(p.name ?? '');
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(
      pieces
        .map((p, i) => ((counts.get(normalizePieceName(p.name ?? '')) ?? 0) > 1 ? i : -1))
        .filter((i) => i >= 0),
    );
  }, [pieces]);

  // `detached` is OUTPUT-ONLY (S8 orphan control): the store raises it when a piece's
  // callout_number stops resolving to a callout on the card — the sketch callout it was pinned to
  // was deleted. The piece survives on purpose rather than being dropped, which is exactly why it
  // has to be VISIBLE here: until now it only appeared on the printed tech pack, so the one screen
  // that can re-pin it was the one screen that never mentioned it. Keyed by lineKey, off the SAVED
  // card — a row added since the last save has no server verdict yet and simply carries none.
  const detachedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const p of techCard?.techCard?.pieces ?? []) {
      const key = p.lineKey?.trim();
      if (key && p.detached) set.add(key);
    }
    return set;
  }, [techCard?.techCard?.pieces]);

  // Which callout numbers the pieces reference, and what to call each pin in its tooltip.
  const pinnedNumbers = useMemo(
    () => new Set(pieces.map((p) => p.calloutNumber || 0).filter((n) => n > 0)),
    [pieces],
  );
  const labelForPin = (n: number) =>
    pieces
      .filter((p) => (p.calloutNumber || 0) === n)
      .map((p) => p.name?.trim() || 'unnamed')
      .join(' · ') || `#${n}`;

  // Переименование детали, ПРИКРЕПЛЁННОЙ к выноске, обязано дописаться в саму выноску.
  //
  // Имя такой детали хранится один раз — в `callout.part`, — и сервер при каждом сохранении
  // переписывает имя детали оттуда (calloutSync.apply, S8). Написать новое имя только в поле
  // панели значит показать оператору переименование, которое сохранение молча откатит: поле
  // выглядит принятым, карточка после перезагрузки снова со старым именем, и объяснения нет
  // нигде. Номер выноски отсюда НЕ правится — его ставит выбор детали на вкладке sketch.
  const renamePiece = (pi: number, value: string) => {
    setValue(`pieces.${pi}.name`, value, { shouldDirty: true });
    const n = (getValues(`pieces.${pi}.calloutNumber`) as number) || 0;
    if (!n) return;
    const cs = (getValues('callouts') ?? []) as Array<{ number?: number }>;
    cs.forEach((c, ci) => {
      if ((c.number ?? 0) === n)
        setValue(`callouts.${ci}.part`, value.trim(), { shouldDirty: true });
    });
  };

  // A new row is minted with its stable lineKey up front, NOT left for the save mapper: the
  // operation and recipe pickers can only offer a piece that already has one, so without it a part
  // added here stayed unlinkable until the card had been saved and reloaded.
  const [pendingSelectLast, setPendingSelectLast] = useState(false);
  const addPiece = () => {
    // Дверь одна: на карточке с чертежом деталь заводит только сопоставление блоков. Кнопки здесь
    // уже нет, но путь закрыт и в коде — чтобы новый вызов не открыл её обратно незаметно.
    if (hasDxf) return;
    append({
      name: '',
      lineKey: ulid(),
      // ЦЕНА РЕШЕНИЯ «× убран из интерфейса»: число живёт в данных и на проводе (кат-лист,
      // костинг, маркеры, печать, слот №2 дайджеста подписи), но спросить его здесь больше негде.
      // Значит на карточке БЕЗ чертежа парная деталь уходит ×1, и кат-лист с костингом
      // недоучитывают её до прихода DXF (модалка сопоставления пересчитает × по экземплярам
      // блока); легаси-деталь с неверным хранимым числом через интерфейс уже не исправить.
      // Принято владельцем осознанно: на карточке с чертежом число считает чертёж, а ручной ввод
      // ровно там и врал чаще всего.
      piecesPerGarment: 1,
      // Явно, а не через дефолт схемы: новая строка стартует «не размечено», и это состояние —
      // ответ «никто не спрашивал», а не отсутствие поля. Ответ теперь ставит модалка
      // сопоставления, а поле обязано быть в строке ФОРМЫ: сериализация шлёт `cutSymmetry`
      // безусловно, и строка без него уехала бы явным UNKNOWN — командой сервера СТЕРЕТЬ разметку.
      cutSymmetry: UNSET_CUT_SYMMETRY,
      grainline: '',
      fused: false,
      calloutNumber: 0,
      note: '',
      materials: [],
    });
    // Новая деталь редактируется в панели, и панель обязана открыться на ней: id строки появится
    // только на следующем рендере, поэтому выбор откладывается флагом.
    setPendingSelectLast(true);
  };
  useEffect(() => {
    if (!pendingSelectLast || fields.length === 0) return;
    setSelectedId(fields[fields.length - 1].id);
    setPendingSelectLast(false);
  }, [pendingSelectLast, fields]);

  // Плитки, разложенные по скоупам ткани. Скоуп детали — скоуп её первой привязки с ЖИВЫМ скоупом:
  // findPiece при поиске контура молча пропускает привязку, чья ткань никуда не резолвится (её
  // файлы даже не качаются), поэтому брать безусловно refs[0] значило бы положить деталь с
  // привязками [потерянная, живая] в группу «связь без ткани», пока картинка рисуется из живой.
  // Деталь без привязки — в хвостовой группе «без блока DXF»; деталь, у которой НИ ОДНА связь не
  // ведёт к живой ткани (строку BOM удалили или переклассифицировали), — в группе «связь без
  // ткани», а не в «без блока»: сказать «блока нет» тут значило бы обвинить чертёж в том, чего он
  // не делал.
  const groups = useMemo(() => {
    const byScope = new Map<string, number[]>();
    const unbound: number[] = [];
    fields.forEach((_, pi) => {
      const p = pieces[pi] ?? {};
      const refs = blocksByPiece.get((p.lineKey ?? '').trim().toLowerCase()) ?? [];
      if (refs.length === 0) {
        unbound.push(pi);
        return;
      }
      const sk = refs.find((r) => !!r.scopeKey)?.scopeKey ?? '';
      byScope.set(sk, [...(byScope.get(sk) ?? []), pi]);
    });
    const out: Array<{ key: string; label: string; indices: number[] }> = [];
    for (const s of scopes) {
      const idx = byScope.get(s.key);
      if (idx?.length) out.push({ key: `s:${s.key}`, label: scopeLabel(s), indices: idx });
      byScope.delete(s.key);
    }
    // scopeKeyOfBinding резолвит либо в живой скоуп, либо в '' — единственный возможный остаток.
    for (const [, idx] of byScope) {
      out.push({ key: 's:', label: 'link without a fabric', indices: idx });
    }
    if (unbound.length) out.push({ key: 'unbound', label: 'no DXF block', indices: unbound });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, pieces, blocksByPiece, scopes]);

  // Фильтр, чей чип исчез (скоуп опустел), обязан сброситься сам — иначе плитки остаются
  // отфильтрованными контролом, которого больше нет.
  useEffect(() => {
    if (filter !== 'all' && !groups.some((g) => g.key === filter)) setFilter('all');
  }, [filter, groups]);

  const visibleGroups = useMemo(
    () => groups.filter((g) => filter === 'all' || filter === g.key),
    [groups, filter],
  );

  // Выбранная деталь. Потерянный выбор (удаление, перезапись массива диалогом сопоставления)
  // откатывается к первой детали — панель с полями не должна пропадать, пока детали есть.
  const selIndex = useMemo(() => {
    const i = selectedId ? fields.findIndex((f) => f.id === selectedId) : -1;
    if (i >= 0) return i;
    return fields.length > 0 ? 0 : -1;
  }, [selectedId, fields]);

  // Ошибка валидации (своя или серверная) на детали, которой нет в панели, обязана эту панель
  // переключить: якоря `data-field` полей живут только у ВЫБРАННОЙ детали, а revealField умеет
  // подождать несколько кадров (index.tsx) — ровно столько, сколько стоит это переключение. Тот же
  // приём, каким sketch-tab силой раскрывает свёрнутый блок выносок под ошибкой (19.8). Фильтр
  // сбрасывается вместе с выбором: деталь с ошибкой, скрытая чипом скоупа, оставила бы плитки БЕЗ
  // выбранной детали — панель называет себя «выбранная на плитках выше» и обязана этому
  // соответствовать.
  const pieceErrors = errors.pieces;
  useEffect(() => {
    if (!pieceErrors || typeof pieceErrors !== 'object') return;
    const first = Object.keys(pieceErrors)
      .filter((k) => /^\d+$/.test(k))
      .map(Number)
      .sort((a, b) => a - b)[0];
    if (first == null) return;
    const id = fields[first]?.id;
    if (id) {
      setSelectedId(id);
      setFilter('all');
    }
    // fields намеренно вне зависимостей: прыгать надо на НОВУЮ ошибку, а не на каждый рендер массива.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceErrors]);

  const sel = selIndex >= 0 ? pieces[selIndex] ?? ({} as FormPiece) : null;
  const selKey = (sel?.lineKey ?? '').trim();
  const selRefs = sel ? blocksByPiece.get(selKey.toLowerCase()) ?? [] : [];
  const selFound = sel && foundByKey ? foundByKey.get(selKey.toLowerCase()) ?? null : null;
  const selCallout = sel?.calloutNumber || 0;
  const selDup = selIndex >= 0 && duplicateRows.has(selIndex);
  const selArrow = grainlineArrow(sel?.grainline);
  // ВСЕ блоки детали помечены токеном UNI — источник, из которого галка предзаполнилась. Подпись
  // говорит именно «откуда взялось», а не «стоит»: при живом токене снятие галки законно, и
  // выглядеть оно должно осознанным действием, а не случайным кликом по контролу без объяснения.
  const selUniByToken = selRefs.length > 0 && selRefs.every((r) => uniOf(r.block));

  // СЛОИ ВЫБРАННОЙ ДЕТАЛИ ПО КОЛОРВЕЯМ (T4) — read-only проекция РЕЦЕПТА: вкладка деталей
  // показывает, рецепт (COLORWAYS) редактирует — направление T3. Связь живёт в детальных строках
  // tech_card_colorway_usage (замороженная tech_card_piece_material не читается), роль слоя —
  // вывод из строки BOM (piece-layer-role.ts, зеркало entity.DerivePieceLayerRole).
  const selLayerRows = useMemo(() => {
    if (!selKey) return [] as Array<{ colorway: string; layers: string }>;
    const bomItems = techCard?.techCard?.bomItems ?? [];
    const resolveSlot = (u: { bomItemId?: number; bomLineKey?: string; bomItemIndex?: number }) => {
      const id = wireInt(u.bomItemId);
      if (id > 0) {
        const byId = bomItems.find((b) => wireInt(b.id) === id);
        if (byId) return byId;
      }
      if (u.bomLineKey) {
        const byKey = bomItems.find((b) => b.lineKey === u.bomLineKey);
        if (byKey) return byKey;
      }
      return u.bomItemIndex != null && u.bomItemIndex >= 0 ? bomItems[u.bomItemIndex] : undefined;
    };
    const out: Array<{ colorway: string; layers: string }> = [];
    for (const c of techCard?.colorways ?? []) {
      const bound = (c.usages ?? []).filter((u) => (u.pieceLineKey ?? '').trim() === selKey);
      if (bound.length === 0) continue;
      const parts: string[] = [];
      const seen = new Set<string>();
      for (const u of bound) {
        const slot = resolveSlot(u);
        if (!slot || seen.has(slot.lineKey ?? `${slot.id}`)) continue;
        seen.add(slot.lineKey ?? `${slot.id}`);
        const role = derivePieceLayerRole(slot.section, slot.purpose);
        const caption = role.rollGoods ? pieceLayerRoleLabel(role) : '';
        parts.push(caption ? `${slot.name?.trim() || '—'} · ${caption}` : slot.name?.trim() || '—');
      }
      if (parts.length === 0) continue;
      const cwName = c.colorCode?.trim() || c.baseSku?.trim() || `#${c.colorwayId ?? ''}`;
      out.push({ colorway: cwName, layers: parts.join(', ') });
    }
    return out;
  }, [selKey, techCard?.colorways, techCard?.techCard?.bomItems]);

  // Удаление выбранной детали передаёт выбор СОСЕДУ (предыдущему по индексу, иначе следующему), а
  // не первой детали списка: при чистке хвоста в 40 строк панель, прыгающая каждый раз в начало,
  // заставляла бы заново прокручивать плитки после каждого удаления. Сосед берётся из снимка
  // `fields` ДО remove — id выживших строк useFieldArray сохраняет.
  // Что уедет вместе с ВЫБРАННОЙ деталью. undefined — рецепт её не держит, удаление ничего не уносит.
  const selRecipeHold = selKey ? recipeHoldersByPiece.get(selKey.toLowerCase()) : undefined;

  // ЖИВЁТ ЛИ ДЕТАЛЬ В ЧЕРТЕЖЕ — от этого зависит, есть ли здесь ручное удаление. Деталь с привязкой
  // заведена сопоставлением блоков, и удалять её надо там же: блок из файла никуда не денется, и
  // следующее сопоставление заведёт деталь заново — а операции и строки рецепта, уехавшие с ней,
  // уже не вернутся. Ответ берётся из ФОРМЫ (`pieceDxfAliases` → blocksByPiece), а не из
  // сохранённой карточки: алиас, записанный модалкой в этой сессии, делает деталь деталью чертежа
  // сразу, ещё до сохранения. Ключ свёрнут тем же trim + нижним регистром, каким его фолдят модалка
  // и сервер, — легаси-ключи бывают не-ULID и приходят в другом регистре.
  const selBoundToDxf = selRefs.length > 0;

  const dropSelected = () => {
    if (selIndex < 0) return;
    const neighbour = fields[selIndex - 1]?.id ?? fields[selIndex + 1]?.id ?? null;
    removePiece(selIndex);
    setSelectedId(neighbour);
  };

  // ПОДТВЕРЖДЕНИЕ — ТОЛЬКО КОГДА ЕСТЬ ЧТО УНОСИТЬ. Деталь без строк рецепта удаляется одним кликом,
  // как раньше: лишний диалог на пустом месте учит жать «да» не глядя, и тогда он не работает там,
  // где нужен.
  const [confirmDrop, setConfirmDrop] = useState(false);
  const removeSelected = () => {
    if (selIndex < 0) return;
    // Дверь закрыта и в коде, а не только в разметке: у детали с привязкой к блоку DXF кнопки нет,
    // но обработчик обязан отказать сам — иначе следующий вызов (горячая клавиша, рефактор,
    // повторное использование) молча вернёт вторую, тихую дверь. Тот же приём, что у `addPiece`.
    if (selBoundToDxf) return;
    if (selRecipeHold) {
      setConfirmDrop(true);
      return;
    }
    dropSelected();
  };

  return (
    <>
      <Section
        title='cut pieces'
        question='— what gets cut from these patterns. the same pieces for every colourway. which fabrics (layers) a piece is cut from in a particular colourway is edited by the piece rows in the recipe on the colorways tab; here it is visible in the selected-piece panel'
        action={
          <div className='flex flex-wrap items-center gap-2'>
            {duplicateRows.size > 0 && (
              <Pill
                tone='warn'
                title='two or more pieces have been given the same name. the name is what a piece is called in operations, in the recipe and on the factory sheet; the server refuses a save with a duplicate — the name must be unique.'
              >
                duplicate name: {duplicateRows.size}
              </Pill>
            )}
            {geometry.isFetching && (
              <Text
                size='nano'
                variant='label'
                component='span'
                className='uppercase tracking-label'
              >
                parsing dxf…
              </Text>
            )}
            {/* Ручное заведение — последняя лазейка, и живёт она ровно до первого DXF: пока
                конструктор рисует, на деталь уже вешают операции и строки рецепта. Дальше автор
                деталей один — модалка «↔ детали кроя» над этим блоком. */}
            {!hasDxf && (
              <Button
                type='button'
                variant='main'
                size='sm'
                data-field='pieces.add'
                onClick={addPiece}
              >
                + piece
              </Button>
            )}
          </div>
        }
      >
        <datalist id='piece-code-suggestions'>
          {pieceCodeOptions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        {fields.length === 0 ? (
          // Пустой список читается по-разному в двух режимах, и звать к ручной кнопке, которой на
          // карточке с чертежом больше нет, значит отправить оператора её искать.
          <Text size='micro' variant='label'>
            {hasDxf
              ? 'no pieces yet — on a card with a drawing they come from it: pick a material on the shelf above and press “↔ cut pieces”, and the DXF blocks become pieces'
              : 'no pieces yet — create them from a DXF with the “↔ cut pieces” button above this block, or add them by hand (front, back, collar…)'}
          </Text>
        ) : (
          <>
            <ChipRow>
              <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>
                all {fields.length}
              </Chip>
              {groups.map((g) => (
                <Chip key={g.key} selected={filter === g.key} onClick={() => setFilter(g.key)}>
                  {g.key === 'unbound' ? 'no block' : g.label} {g.indices.length}
                </Chip>
              ))}
            </ChipRow>

            {geometry.isError && (
              <div className='flex flex-wrap items-center gap-2'>
                <Text size='nano' component='span' className='break-words text-error'>
                  {geometry.error?.message || "couldn't parse the files"}
                </Text>
                <Button
                  type='button'
                  variant='secondary'
                  size='xs'
                  onClick={() => geometry.refetch()}
                >
                  again
                </Button>
              </div>
            )}
            {/* Недокачанный лист — это молча пропавшие детали: их блоки просто «не найдены», что
                читается как отсутствие привязки. Поэтому о нём говорится вслух. */}
            {(geometry.data?.warnings ?? []).map((w, i) => (
              <Text key={i} size='nano' component='span' className='break-words text-error'>
                {w}
              </Text>
            ))}

            <div className='flex flex-col gap-5'>
              {visibleGroups.map((g) => (
                <div key={g.key} className='flex flex-col gap-2'>
                  <GroupLabel
                    flush
                    action={
                      <Text size='micro' variant='label'>
                        {g.indices.length} {ruPieces(g.indices.length)}
                      </Text>
                    }
                  >
                    {g.label}
                  </GroupLabel>
                  <Tiles min={118}>
                    {g.indices.map((pi) => {
                      const p = pieces[pi] ?? ({} as FormPiece);
                      const key = (p.lineKey ?? '').trim();
                      const refs = blocksByPiece.get(key.toLowerCase()) ?? [];
                      const found =
                        foundByKey && refs.length > 0
                          ? foundByKey.get(key.toLowerCase()) ?? null
                          : null;
                      const lostScope = refs.length > 0 && refs.every((r) => !r.scopeKey);
                      // «Нет в разобранных файлах» существует только ПОСЛЕ разбора: пока
                      // геометрия грузится, отсутствие контура — не диагноз.
                      const missing = !!index && refs.length > 0 && !found;
                      const dup = duplicateRows.has(pi);
                      const detached = detachedKeys.has(key);
                      const callout = p.calloutNumber || 0;
                      const isSelected = pi === selIndex;
                      // Цвет канта ВСЕГДА в паре со словом на самой плитке (DESIGN.md: состояние
                      // не сообщается одним цветом): красные слова — «дубль имени» в подписи,
                      // «нет в файлах» / «ткань потеряна» в окне контура; синее — «откреплена»
                      // (той же тревоги, что её пилюля в панели, — откреплённость канта не
                      // красит).
                      const flags: Array<{ k: string; cls: string; word: string }> = [];
                      if (dup) flags.push({ k: 'dup', cls: 'text-error', word: 'duplicate name' });
                      if (detached)
                        flags.push({ k: 'det', cls: 'text-warning', word: 'detached' });
                      return (
                        <div key={fields[pi]?.id ?? pi} {...pin.bind(callout > 0 ? callout : null)}>
                          <button
                            type='button'
                            aria-pressed={isSelected}
                            onClick={() => setSelectedId(fields[pi]?.id ?? null)}
                            className={cn(
                              'flex h-full w-full flex-col bg-bgColor text-left transition-colors hover:border-textColor',
                              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                              // Вес несёт выбор, цвет — здоровье (контракт Tile): выбранная
                              // плитка утолщает кант до 2px с компенсацией паддинга, чтобы
                              // контент не дёргался. Тень элементу в потоке DESIGN.md запрещает.
                              isSelected ? 'border-2 p-[5px]' : 'border p-1.5',
                              dup || missing
                                ? 'border-error'
                                : isSelected
                                  ? 'border-textColor'
                                  : 'border-borderColor',
                              pin.isActive(callout) && 'bg-bgZebra',
                            )}
                          >
                            <div className='flex h-[84px] w-full items-center justify-center bg-bgZebra p-1'>
                              {found ? (
                                <PieceShape
                                  piece={found.piece}
                                  grainLayer={index?.grainLayer ?? ''}
                                  outlineOnly
                                />
                              ) : (
                                <Text
                                  size='nano'
                                  component='span'
                                  variant={missing ? undefined : 'label'}
                                  className={cn(
                                    'px-1 text-center uppercase',
                                    missing && 'text-error',
                                  )}
                                >
                                  {/* Отсутствие привязки и потерянная ткань известны СТАТИЧЕСКИ —
                                      до всякого скачивания, поэтому они стоят раньше состояний
                                      разбора: сказать про такую деталь «разбор идёт» значило бы
                                      обещать форму, которой в файлах нет и не будет. */}
                                  {refs.length === 0
                                    ? 'no DXF block'
                                    : lostScope
                                      ? 'fabric lost'
                                      : geometry.isError
                                        ? 'parse error'
                                        : !index
                                          ? 'parsing DXF…'
                                          : 'not in the files'}
                                </Text>
                              )}
                            </div>
                            <Text size='micro' className='mt-1 w-full truncate font-bold uppercase'>
                              {p.name?.trim() || 'unnamed'}
                            </Text>
                            {found && (
                              <Text size='micro' variant='label' className='w-full truncate'>
                                {fmtCm(found.piece.bboxW)} × {fmtCm(found.piece.bboxH)} cm
                              </Text>
                            )}
                            {flags.length > 0 && (
                              <Text size='nano' component='p' className='w-full truncate uppercase'>
                                {flags.map((f, i) => (
                                  <Fragment key={f.k}>
                                    {i > 0 && ' · '}
                                    <span className={f.cls}>{f.word}</span>
                                  </Fragment>
                                ))}
                              </Text>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </Tiles>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* Панель выбранной детали — БЛОК-РОВНЯ под плитками, не вложенный: блок никогда не содержит
          блок (DESIGN.md). Здесь живёт всё редактирование и все объяснения; плитки только
          показывают и выбирают. */}
      {sel && selIndex >= 0 && (
        <Section
          title='piece'
          question='— the one selected on the tiles above: the shape from the drawing, the row fields and where the name comes from'
          action={
            // Ручное удаление осталось ровно там, где деталь заводили руками, — у детали без
            // чертежа. У привязанной вместо кнопки адрес двери: удаление по факту чертежа живёт в
            // сопоставлении блоков, и оно же показывает состав потерь. Кнопка здесь была второй,
            // тихой дверью — ею деталь уходила из карточки при живом блоке в файле.
            selBoundToDxf ? (
              <Text
                size='micro'
                variant='label'
                component='span'
                title='the piece is drawn in the drawing (it has a DXF block link). deleting it from here would diverge from the file: the block has not gone anywhere, and the next matching would create the piece again — this time without the operations and recipe lines that leave with it. the “↔ cut pieces” modal offers deletion when the block has DISAPPEARED from the drawing, and it names what is lost with it.'
              >
                deleted through “↔ cut pieces” on the patterns panel above this block
              </Text>
            ) : (
              <Button
                type='button'
                variant='secondary'
                size='xs'
                aria-label='remove piece'
                title={
                  selRecipeHold
                    ? `the piece's recipe lines leave with it (${selRecipeHold.colorways.join(', ')})`
                    : undefined
                }
                onClick={removeSelected}
              >
                ✕ delete the piece
              </Button>
            )
          }
        >
          <div className='grid gap-2.5 lg:grid-cols-[240px_minmax(0,1fr)]'>
            {/* Две проекции одной и той же детали, одна под другой: КАКОЙ она формы (контур из
                DXF — единственное место в карточке, где виден её реальный габарит, посчитанный по
                файлу, а не введённый руками) и ГДЕ она на изделии (выноска на скетче). */}
            <div className='flex flex-col gap-1'>
              <div className='flex h-40 w-full items-center justify-center border border-borderColor bg-bgColor p-1'>
                {selFound ? (
                  <PieceShape piece={selFound.piece} grainLayer={index?.grainLayer ?? ''} />
                ) : (
                  <Text size='nano' variant='label' component='span' className='px-1 text-center'>
                    {/* Отсутствие привязки и потерянная ткань известны СТАТИЧЕСКИ — до всякого
                        скачивания, поэтому они стоят раньше состояний разбора. Сказать «блока нет
                        в файлах» про связь, чья ткань ни к чему живому не ведёт (строку BOM
                        удалили или переклассифицировали), значило бы обвинить чертёж в том, чего
                        он не делал. */}
                    {selRefs.length === 0
                      ? 'this piece has no DXF block linked'
                      : selRefs.every((r) => !r.scopeKey)
                        ? `the link to “${selRefs[0].block}” has lost its fabric — re-bind the sheet on the patterns panel`
                        : geometry.isError
                          ? geometry.error?.message || "couldn't parse the files"
                          : !index
                            ? 'parsing DXF…'
                            : `block “${selRefs[0].block}” is not in the parsed files — was the file re-uploaded without it?`}
                  </Text>
                )}
              </div>
              {selFound && (
                <>
                  <Text size='nano' variant='label' component='span' className='break-words'>
                    {selFound.block}
                    {selFound.size
                      ? ` · size ${selFound.size}${selFound.sizes.length > 1 ? ` of ${selFound.sizes.length}` : ''}`
                      : ''}
                  </Text>
                  <Text size='nano' variant='label' component='span'>
                    {fmtCm(selFound.piece.bboxW)}×{fmtCm(selFound.piece.bboxH)} cm
                    {selFound.instances > 1 ? ` · ×${selFound.instances} in the drawing` : ''}
                  </Text>
                </>
              )}
              {index && (
                <Text size='nano' variant='label' component='span'>
                  layer {(selFound ? selFound.layer : index.contourLayer) || '—'}
                  {index.grainLayer ? `, grainline in red (layer ${index.grainLayer})` : ''}
                </Text>
              )}
              <PieceDiagram
                techCard={techCard}
                pinnedNumbers={pinnedNumbers}
                labelForPin={labelForPin}
                activePin={pin.active}
                onActivePinChange={pin.setActive}
              />
            </div>

            {/* Наведение или фокус в полях зажигает пин детали на эскизе слева — то же поведение,
                что несла строка старой таблицы: клавиатурный обход полей не должен терять связь
                «поле → место на изделии». */}
            <div
              className='flex flex-col gap-2.5'
              {...pin.bind(selCallout > 0 ? selCallout : null)}
            >
              <div>
                <Text size='micro' variant='label' component='label' className='uppercase'>
                  code / name
                </Text>
                <Input
                  className='w-full'
                  data-field={`pieces.${selIndex}.name`}
                  aria-invalid={selDup}
                  list='piece-code-suggestions'
                  value={sel.name ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    renamePiece(selIndex, e.target.value)
                  }
                  placeholder='FP front piece'
                />
                {selDup && (
                  <Text size='micro' variant='error'>
                    a piece with this name already exists — the name must be unique
                  </Text>
                )}
              </div>

              {/* Происхождение: из какого чертежа деталь и откуда приходит её имя. Связь с
                  выноской — только показ: ставится она на вкладке SKETCH, выбором детали в самой
                  выноске. Два места записи одного значения разошлись бы на первом же
                  переименовании. */}
              {(selRefs.length > 0 || selCallout > 0 || detachedKeys.has(selKey)) && (
                <div className='flex flex-wrap items-center gap-2'>
                  {selRefs.length > 0 && (
                    <Pill
                      tone='mut'
                      title={`the piece is linked to DXF blocks: ${selRefs.map((b) => b.block).join(', ')}. IF the block in the file carries a grainline, the marker rotates the piece by it and the word here does not affect the placement; if there is no line — the piece lies as drawn. the word is printed in the tech pack either way. the shape of this block is visible on the tile and in this panel.`}
                    >
                      DXF block linked
                    </Pill>
                  )}
                  {selCallout > 0 && !detachedKeys.has(selKey) && (
                    <Text size='micro' variant='label' component='span'>
                      callout #{selCallout} — the name comes from it
                    </Text>
                  )}
                  {detachedKeys.has(selKey) && (
                    <Pill
                      tone='attention'
                      title='the callout the piece referenced has been deleted from the sketch (or stopped being a technical sketch) — pick this piece in the right callout on the sketch tab'
                    >
                      detached from the callout
                    </Pill>
                  )}
                </div>
              )}

              {/* Слои детали по колорвеям — read-only проекция рецепта (T4): из каких тканей она
                  кроится и в какой роли каждая. Правится НЕ здесь: строками детали в рецепте
                  колорвея (вкладка COLORWAYS). */}
              {selLayerRows.length > 0 && (
                <div className='flex flex-col gap-0.5'>
                  <Text size='micro' variant='label' component='span' className='uppercase'>
                    piece layers — from the recipe
                  </Text>
                  {selLayerRows.map((r, i) => (
                    <Text key={i} size='micro' component='p'>
                      <span className='font-medium'>{r.colorway}</span>: {r.layers}
                    </Text>
                  ))}
                  <Text size='nano' variant='label' component='p'>
                    edited on the colorways tab — by this piece's rows in the colourway recipe.
                    deleting the piece takes those rows with it
                  </Text>
                </div>
              )}

              {/* Рецепт держит деталь, а слой назвать нечем: строка рецепта ссылается на строку BOM,
                  которой в карточке уже нет. Для блока выше это «нечего показать», и он молчит —
                  тогда об уезжающих строках сказать больше некому. */}
              {selRecipeHold && selLayerRows.length === 0 && (
                <Text size='nano' variant='label' component='p'>
                  {`the piece is held by recipe rows of colourways ${selRecipeHold.colorways.join(', ')} (there is nothing to name the layer with — the row references a BOM line that is no longer on the card). deleting the piece takes them with it`}
                </Text>
              )}

              {/* «× на изделие» и «как кроится» в этой панели больше не спрашиваются: и то, и
                  другое приходит из чертежа — количество считает модалка сопоставления по числу
                  экземпляров блока, симметрию она же проставляет «одинаковыми копиями» там, где
                  ответа не было. В ДАННЫХ и на проводе оба поля живут дальше (кат-лист, костинг,
                  раскладка, печать; `piecesPerGarment` — слот дайджеста подписи), схема и
                  сериализация не тронуты — убран только вопрос к человеку. */}
              <div className='grid grid-cols-2 gap-2.5 lg:grid-cols-3'>
                <div>
                  <Text size='micro' variant='label' component='label' className='uppercase'>
                    fused
                  </Text>
                  <div className='flex min-h-[22px] items-center'>
                    <input
                      type='checkbox'
                      aria-label='fused'
                      checked={!!sel.fused}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setValue(`pieces.${selIndex}.fused`, on, { shouldDirty: true });
                        // СНЯТАЯ ГАЛКА ГАСИТ РАЗМЕТКУ ТУТ ЖЕ. Сервер всё равно её обнулит (0304:
                        // режим законен только у fused-детали), но если оставить её на экране, форма
                        // покажет «полосой 25 мм» под снятой галкой и отправит это на сохранение —
                        // а вернётся карточка уже без разметки. Расхождение экрана с тем, что
                        // сохранилось, дороже одной строки.
                        if (!on) {
                          setValue(`pieces.${selIndex}.fusingMode`, UNSET_FUSING_MODE, {
                            shouldDirty: true,
                          });
                          setValue(`pieces.${selIndex}.fusingWidthMm`, '', { shouldDirty: true });
                        }
                      }}
                    />
                  </div>
                </div>
                {/* КАК ИМЕННО ДУБЛИРУЕТСЯ (0304) — только у дублируемой детали: у остальных вопроса
                    не существует, и пустой селект рядом со снятой галкой читался бы как незаполненное
                    поле. Занимает всю ширину ряда, потому что несёт ещё и число. */}
                {!!sel.fused && (
                  <div className='col-span-2 lg:col-span-3'>
                    <Text size='micro' variant='label' component='label' className='uppercase'>
                      how it's fused
                    </Text>
                    <div className='flex items-start gap-2.5'>
                      <select
                        className={`${selectCls} flex-1`}
                        aria-label="how it's fused"
                        data-field={`pieces.${selIndex}.fusingMode`}
                        value={sel.fusingMode ?? UNSET_FUSING_MODE}
                        onChange={(e) => {
                          const mode = e.target.value;
                          setValue(`pieces.${selIndex}.fusingMode`, mode, { shouldDirty: true });
                          // Число живёт только у «полосой». Уходя с него, число убираем: у «целиком»
                          // ширине не к чему принадлежать, а сервер отверг бы такую пару по имени
                          // поля. ВНУТРИ «полосой» пустое число законно и значит «по эталону».
                          if (!fusingTakesWidth(mode)) {
                            setValue(`pieces.${selIndex}.fusingWidthMm`, '', { shouldDirty: true });
                          }
                        }}
                      >
                        {fusingModeOptionsFor(sel.fusingMode).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {fusingTakesWidth(sel.fusingMode) && (
                        <div className='w-28'>
                          <Input
                            type='number'
                            min='0.5'
                            max='100'
                            step='0.5'
                            placeholder='mm'
                            aria-label='fusing strip width, mm'
                            data-field={`pieces.${selIndex}.fusingWidthMm`}
                            value={sel.fusingWidthMm ?? ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              setValue(`pieces.${selIndex}.fusingWidthMm`, e.target.value, {
                                shouldDirty: true,
                              })
                            }
                          />
                        </div>
                      )}
                    </div>
                    {/* Подпись говорит, ОТКУДА берётся ширина, когда ячейка пуста — иначе пустая
                        ячейка выглядит как незаполненное поле, и первый же вопрос оператора будет
                        «а сколько это». */}
                    <Text size='nano' variant='label' component='p'>
                      {fusingHint(sel.fusingMode)}
                    </Text>
                  </div>
                )}
                <div>
                  <Text size='micro' variant='label' component='label' className='uppercase'>
                    ungraded
                  </Text>
                  <div className='flex min-h-[22px] items-center'>
                    <input
                      type='checkbox'
                      aria-label='ungraded — the same in every size'
                      checked={!!sel.ungraded}
                      onChange={(e) =>
                        setValue(`pieces.${selIndex}.ungraded`, e.target.checked, {
                          shouldDirty: true,
                        })
                      }
                    />
                  </div>
                  {selUniByToken && (
                    // Подпись обязана говорить правду в ОБОИХ состояниях. При снятой галке живой
                    // токен никуда не делся, и молчание об этом читалось бы как «UNI в файле нет»;
                    // а прежний текст «определено по имени блока» под пустым чекбоксом обещал бы
                    // пометку, которой нет. Снятие — законное решение оператора, и подпись его
                    // именно так и называет.
                    <Text size='nano' variant='label'>
                      {sel.ungraded
                        ? 'determined from the block name in the DXF (UNI)'
                        : 'the block name carries UNI — the mark was cleared by hand'}
                    </Text>
                  )}
                </div>
              </div>
              <div className='grid grid-cols-2 gap-2.5'>
                <div>
                  <Text size='micro' variant='label' component='label' className='uppercase'>
                    grain
                  </Text>
                  <div className='flex items-center gap-1'>
                    <select
                      className={selectCls}
                      aria-label='grainline'
                      value={sel.grainline ?? ''}
                      onChange={(e) =>
                        setValue(`pieces.${selIndex}.grainline`, e.target.value, {
                          shouldDirty: true,
                        })
                      }
                    >
                      {grainlineOptionsFor(sel.grainline).map((o) => (
                        <option key={o.value || '(unset)'} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <span aria-hidden className='shrink-0'>
                      {selArrow}
                    </span>
                  </div>
                  {/* Where the direction ACTUALLY comes from. A piece drawn in a DXF carries its
                      долевая as a line on its own layer, and that line — not this word — is what
                      the раскладка rotates the piece by. Saying so is the point: a word that
                      contradicts the file is worse than no word at all. */}
                  <Text size='micro' variant='label'>
                    the word goes into the tech pack; the line from the file does the cutting
                  </Text>
                </div>
                <div>
                  <Text size='micro' variant='label' component='label' className='uppercase'>
                    note
                  </Text>
                  <Input
                    className='w-full'
                    value={sel.note ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setValue(`pieces.${selIndex}.note`, e.target.value, { shouldDirty: true })
                    }
                  />
                </div>
              </div>

              <div className='flex flex-col gap-1'>
                {/* Что означает «не градуируется» и чем это отличается от «размера в имени не
                    нашлось». Сказано здесь же, одним абзацем: галка отвечает на вопрос про
                    ДЕТАЛЬ, а не про файл. */}
                <Text size='micro' variant='label'>
                  ungraded — one piece for the whole size range: a pocket, a belt loop, a facing are
                  drawn once and go into the set of EVERY size in full. cutting has always behaved
                  that way, but the consumption norm for a scope made only of such pieces refused to
                  compute, saying “looks like only one size was exported” — because “sizeless” and
                  “the size wasn't recognised” were one and the same thing to the parser. the
                  checkbox turns this into a statement. the UNI token in a DXF block name answers the
                  same question and pre-fills the checkbox for a piece created from a drawing; for a
                  piece already saved on the card the answer is taken from the piece itself — the
                  token won't put a cleared checkbox back. an area measurement on a marked piece is
                  only ever a common one: the server refuses per-size rows.
                </Text>
                {/* Said once, under the fields. The four values are the ones the server's CHECK
                    accepts — anything else fails the whole card save, which is why this stopped
                    being a free-text field with suggestions. */}
                <Text size='micro' variant='label'>
                  grainline is a closed list (lengthwise / crosswise / bias / any): the server
                  refuses any other value and fails the save of the whole card. for a piece created
                  from a DXF the real direction is set by the grainline in the file itself — the
                  marker rotates the piece by it, while the word here is only printed in the tech
                  pack and must not contradict it.
                </Text>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* УДАЛЕНИЕ ДЕТАЛИ, КОТОРУЮ ДЕРЖИТ РЕЦЕПТ, — ОДНО ДЕЙСТВИЕ, А НЕ ЗАПРЕТ. Раньше здесь стоял
          отказ, и он запирал карточку: снять строку рецепта можно только на другой вкладке, по
          одной, в каждом колорвее. Теперь строки уезжают вместе с деталью (сервер удаляет их в той
          же транзакции), а диалог называет, что именно уедет, — потому что назначение ткани без
          детали не жалко, а вписанную норму жалко, и разницу должен видеть человек. */}
      {confirmDrop && sel && selRecipeHold && (
        <ConfirmationModal
          open
          onOpenChange={(o: boolean) => {
            if (!o) setConfirmDrop(false);
          }}
          onConfirm={() => {
            setConfirmDrop(false);
            dropSelected();
          }}
          onCancel={() => setConfirmDrop(false)}
          title={`delete piece “${sel.name?.trim() || '—'}”?`}
          confirmLabel='delete the piece and its recipe rows'
        >
          <div className='space-y-2'>
            <CalloutBox tone='warning'>
              {`its rows in the recipe will be deleted along with the piece: ${selRecipeHold.rows} pcs in colourways ${selRecipeHold.colorways.join(', ')} (and in archived ones, if there are any — the card doesn't show them). these are fabric assignments onto this piece: without the piece itself they are part of nothing.`}
            </CalloutBox>
            {selRecipeHold.withNorm > 0 && (
              <CalloutBox tone='warning'>
                {`${selRecipeHold.withNorm} of them carry a written-in consumption NORM — those are numbers somebody computed, and there will be nowhere to restore them from. if the piece is being deleted by mistake, cancel and check the recipe on the colorways tab.`}
              </CalloutBox>
            )}
            <Text size='nano' variant='label' component='p'>
              the deletion is applied when the card is SAVED — until then nothing is lost, and it
              can be undone by re-reading the card
            </Text>
          </div>
        </ConfirmationModal>
      )}
    </>
  );
}
