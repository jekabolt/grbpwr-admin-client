import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { common_AdminColorwayRef, common_Color } from 'api/proto-http/admin';
import {
  useTechCard,
  techCardKeys,
} from 'components/managers/tech-cards/components/useTechCardQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX } from 'react';
import { useFormContext, useFormState } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { PantonePicker } from '../pantone-picker';
import {
  ensurePantoneLibrary,
  findPantone,
  pantoneVersion,
  subscribePantone,
} from '../pantone-swatches';
import type { TechCardFormData } from '../schema';
import {
  createColorwayErrorMessage,
  recipeSaveErrorMessage,
  useCreateColorway,
  useUpdateColorwayRecipe,
} from '../useColorwayRecipe';
import { wireInt } from '../wire-int';
import { InertDoor } from './bench-slot';
import { archivedRef, colorwayLabel } from './colorway-picker';
import { GROUP_SEAM } from './core';
import { DRAFTED_CLASS, DraftedPill } from './core/drafted-field';
import { ColourwayCreatePopover } from './colourway-create';
import {
  confirmRefusal,
  usagesForColourway,
  type BoundSlot,
  type ProposedColourway,
  type ProposedSlotColour,
} from './colourway-proposals-model';
import {
  cardSlots,
  pantonePatch,
  patchRow,
  proposalRows,
  recipeSlots,
  savedSlotRows,
  type CardSlot,
} from './colourway-rows';
import { useCardMemory, useDraftMemory, type ColourwayVerdict } from './head/use-draft-fills';

/**
 * КОЛОРВЕИ СТИЛЯ: СОХРАНЁННЫЕ И ПРЕДЛОЖЕННЫЕ ЧЕРНОВИКОМ (B-25 круга 20; O-44, 26.09).
 *
 * Владелец (B-25): «я хочу что бы DRAFT OF THE CONSTRUCTION могло предложить мне создать несколько
 * колорвеев и это было отдельным блоком где мы могли бы выбрать какие цвета по пантонам может
 * что-то еще и что бы если мы вконфирмили этот колорвей появлялся далее уже во вкладке колорвей».
 * И поверх (O-44 п.3): «после конфирма колорвея он не должен пропадать он должен оставатся в этой
 * же карточке».
 *
 * ═══ ОДИН СПИСОК: СОХРАНЁННЫЕ → ПРЕДЛОЖЕНИЯ → «+ COLOURWAY» ══════════════════════════════════
 *
 * Сохранённые колорвеи карточки (`useTechCard(...).colorways`, порядок карточки) стоят рядами того
 * же вида, что и предложения: имя, цвет, и под ними — все слоты карточки с цветом каждого. Ниже —
 * синие предложения черновика, ещё ниже — дверь «+ colourway». Подтверждённое предложение не
 * превращается в квитанцию и не уходит смотреть себя на вкладку COLORWAYS: оно становится
 * сохранённым рядом ЗДЕСЬ ЖЕ, а синее предложение прячется, как только этот ряд пришёл с сервера.
 * Дверь на вкладку осталась — тихой `open ›` у каждого сохранённого ряда.
 *
 * ═══ ЭТО СВОЙ БЛОК, И ОБЁРТКУ ОН ДЕРЖИТ САМ ════════════════════════════════════════════════
 *
 * Владелец сказал «отдельным блоком» (D5 плана): орган смонтирован своей секцией в стопке STUDIO,
 * сразу под таблицей слотов — цвета назначаются ПО СЛОТАМ, и соседство читается как фраза.
 * `Section`-обёртка живёт здесь, потому что условие «рисоваться или нет» знает только орган
 * (состояние модульного стора, карточка и права): обёртка у вызывающего потребовала бы второго
 * читателя того же стора в композиторе.
 *
 * ⚠ БЛОК СТОИТ НА КАРТОЧКЕ ВСЕГДА (r2 п.15: снизу плейсхолдер «+ colourway»). Единственное
 * исключение — карточка только для чтения, у которой нечего показать: ни сохранённых, ни
 * предложений; рамка с одним заголовком не сказала бы ничего (ранний возврат ниже).
 *
 * ═══ ЗДЕСЬ КЛИК ОБЯЗАТЕЛЕН, И ЭТО НЕ ПРОТИВОРЕЧИТ B-14 ═════════════════════════════════════
 *
 * Всё остальное черновик пишет сам, потому что запись в форму отменяется формой же: `✕` возвращает
 * то, что стояло. Подтверждение колорвея — НЕ запись в форму. `CreateColorway` создаёт ПРОДУКТ,
 * немедленно и на сервере; ни `✕`, ни отказ от сохранения карточки его не уберут. Само-заполнение
 * здесь означало бы, что платный прогон молча наплодил до четырёх продуктов.
 */

/**
 * Квадратик цвета. Своя копия на несколько строк — импортировать из `colorway-recipe.tsx`
 * (4 700 строк редактора рецепта) значило бы затащить сюда его половину ради рамки 12×12.
 * Без цвета квадрат ПУНКТИРНЫЙ: сплошная пустая рамка читалась бы белым цветом, которого нет.
 */
function Swatch({ hex, title }: { hex?: string; title?: string }): JSX.Element {
  return (
    <span
      aria-hidden
      title={title ?? hex ?? undefined}
      className={cn(
        'inline-block size-3 shrink-0 border',
        hex ? 'border-textColor' : 'border-dashed border-borderColor',
      )}
      style={hex ? { backgroundColor: hex } : undefined}
    />
  );
}

const cell =
  'block min-h-[22px] w-full appearance-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize focus:border-textColor focus:outline-none disabled:bg-bgZebra disabled:text-labelColor';

/**
 * ═══ СЕТКА КОЛОРВЕЯ — ДВЕ КОЛОНКИ, ОДНИ НА ВСЕ РЯДЫ ═════════════════════════════════════════
 *
 * Первая колонка — имя: колорвея в его строке и слота в строках под ним; вторая — цвет: колорвея
 * и каждого слота. Ширина первой колонки одна на сохранённые ряды и на предложения, поэтому цвета
 * стоят одной вертикалью по всему блоку, и два колорвея сравниваются глазом сверху вниз.
 */
const NAME_COL = 'w-36 shrink-0 sm:w-44';
const LINE = 'flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5';
/**
 * ЛИНЕЙКИ ТОЛЬКО МЕЖДУ РЯДАМИ (владелец, O-43 и O-48): «после последнего чилда в списке не делать
 * подчеркивание» — последний ряд кончается воздухом, а не линейкой; воздух под ним даёт шов списка
 * колорвеев (20px) или отступ двери «+ colourway» (16px).
 */
const RULED = '[&>*+*]:border-t [&>*+*]:border-hairline';

/**
 * ТРЁХШАГОВАЯ ЗАПИСЬ, ТОЧНО ТА ЖЕ, КАКОЙ ЕЁ ДЕЛАЕТ ВКЛАДКА: сперва личность, потом рецепт.
 *
 * ⚠ ПЕРЕДАЧА СОХРАНЁННОМУ РЯДУ — СРАЗУ ПОСЛЕ ЛИЧНОСТИ. `create.mutateAsync` возвращается ПОСЛЕ
 * своего `onSuccess`, а тот ждёт `invalidateQueries` — то есть перечитывания живой карточки
 * (react-query 5: `Mutation.execute` ждёт `options.onSuccess`, `refetchQueries` ждёт `fetch`).
 * К этой строке новый колорвей уже лежит в кэше карточки, и `onCreated` отдаёт вердикт стору:
 * синее предложение уходит в тот же кадр, в каком пришёл его сохранённый ряд, а не через шаг
 * рецепта. Если перечитывание упало молча, ряда нет — и предложение остаётся живым: второй
 * `confirm ▸` сервер отвергнет уникальностью `(style, color_code)`, продукт не задвоится.
 *
 * ⚠ ВЕРСИЯ ЗАМКА ЧИТАЕТСЯ ПЕРЕД САМОЙ ЗАПИСЬЮ, А НЕ НА РЕНДЕРЕ. `expected_colorway_version` —
 * это общий `tech_card.lock_version`, и его двигает ЛЮБАЯ запись по карточке, включая только что
 * сделанный нами `CreateColorway`.
 *
 * ⚠ ОТКАТА У ПОЛОВИНЫ НЕТ, И ОН ЗДЕСЬ БЫЛ БЫ ХУЖЕ САМОЙ ПОЛОВИНЫ. Упавший второй шаг оставляет
 * СОЗДАННЫЙ колорвей без рецепта; удалять его в ответ значило бы стирать продукт из-за сетевой
 * ошибки. Поэтому под сохранённым рядом стоит правда словами, а `open ›` ведёт доделать рецепт.
 *
 * `colorwayId` — int64 с провода, то есть СТРОКА в JSON при объявленном `number`; сравнивается
 * только через `wireInt`, иначе `"42" === 42` молча не находит только что созданный колорвей.
 */
function useConfirmColourway(techCardId: number) {
  const create = useCreateColorway(techCardId);
  const recipe = useUpdateColorwayRecipe(techCardId);
  const qc = useQueryClient();

  async function confirm(
    p: ProposedColourway,
    bound: BoundSlot[],
    onCreated: (colorwayId: number) => void,
  ): Promise<ColourwayVerdict> {
    const usages = usagesForColourway(bound);
    const res = await create.mutateAsync({
      colorCode: p.colorCode,
      development: {
        devCode: undefined,
        name: p.name,
        labDipStatus: undefined,
        comment: undefined,
        pantone: p.pantone,
        // Система названа только когда назван код: «TCX» при пустом пантоне — это утверждение о
        // системе цвета, которого никто не делал.
        pantoneSystem: p.pantone ? 'TCX' : undefined,
        devHex: p.hex,
        swatchMediaId: undefined,
        labDipRound: undefined,
        labDipSubmittedAt: undefined,
        labDipDecidedAt: undefined,
        labDipDecidedBy: undefined,
        labDipRejectReason: undefined,
        // Вложенный рецепт сервер отвергает прямым текстом — он пишется отдельным шагом ниже.
        usages: undefined,
        displayOrder: undefined,
      },
    });
    const colorwayId = wireInt(res?.colorwayId);
    if (!colorwayId) throw new Error('the server created no colourway id');
    onCreated(colorwayId);
    if (usages.length === 0) return { status: 'confirmed', colorwayId };
    try {
      const fresh = await adminService.GetTechCard({ id: techCardId, vatCountryCode: undefined });
      const ref = fresh.techCard?.colorways?.find((c) => wireInt(c.colorwayId) === colorwayId);
      const expectedColorwayVersion = ref?.lockVersion ?? fresh.techCard?.lockVersion ?? 0;
      await recipe.mutateAsync({ colorwayId, expectedColorwayVersion, usages });
    } catch (e) {
      return { status: 'confirmed', colorwayId, recipeFailed: recipeSaveErrorMessage(e) };
    } finally {
      await qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
    }
    return { status: 'confirmed', colorwayId };
  }

  return { confirm, pending: create.isPending || recipe.isPending };
}

/**
 * ═══ СОХРАНЁННЫЙ КОЛОРВЕЙ — ЧТЕНИЕ, А НЕ РЕДАКТОР (O-44 п.3, фаза 1) ═════════════════════════
 *
 * Имя — `colorwayLabel` (одно определение на всю студию). Цвет — экранный `dev_hex`, при его
 * отсутствии — приближение пантона, при отсутствии и его — hex словарного цвета SKU; подпись —
 * пантон, а без него — имя словарного цвета. Слоты — строки рецепта УРОВНЯ ИЗДЕЛИЯ
 * (`savedSlotRows`): ровно то, что пишет `confirm ▸`, и ровно то, что вкладка COLORWAYS больше
 * не рисует ни одним полем (она возит `color`/`pantone` строки только ради старых записей).
 *
 * Правка здесь не живёт: писатель рецепта — вкладка COLORWAYS (полная замена строк, с артикулами и
 * нормами), и второй писатель той же записи разошёлся бы с ним молча. `open ›` ведёт туда, сразу
 * на этот колорвей (`?colorway=`). Архивный — тем же рядом, серым и со словом «(archived)»: цвет
 * без слова не несёт состояния (DESIGN.md).
 */
function SavedColourway({
  cw,
  card,
  dictionaryColour,
  recipeFailed,
  onOpen,
}: {
  cw: common_AdminColorwayRef;
  card: readonly CardSlot[];
  dictionaryColour?: common_Color;
  recipeFailed?: string;
  onOpen: (colorwayId: number) => void;
}): JSX.Element {
  const id = wireInt(cw.colorwayId);
  const archived = archivedRef(cw);
  const pantone = (cw.pantone ?? '').trim();
  const hex =
    (cw.devHex ?? '').trim() || findPantone(pantone)?.hex || (dictionaryColour?.hex ?? '').trim();
  const colourWords =
    pantone || (dictionaryColour?.name ?? '').trim() || (cw.colorCode ?? '').trim();
  const rows = savedSlotRows(cw.usages, card);
  const name = colorwayLabel(cw);
  return (
    <div data-cw-saved={id} data-archived={archived ? '' : undefined}>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
        <span className={cn(NAME_COL, 'flex min-w-0 items-baseline gap-1.5')} title={name}>
          <Text
            component='span'
            className={cn('min-w-0 truncate font-bold uppercase', archived && 'text-labelColor')}
          >
            {name}
          </Text>
          {archived && (
            <Text size='micro' variant='label' component='span' className='shrink-0'>
              (archived)
            </Text>
          )}
        </span>
        <span className='flex min-w-0 items-center gap-2' data-cw-colour={id}>
          <Swatch hex={hex || undefined} title={colourWords || undefined} />
          <Text
            size='micro'
            component='span'
            className={cn('uppercase', archived && 'text-labelColor')}
          >
            {colourWords || '—'}
          </Text>
        </span>
        <Button
          type='button'
          variant='underline'
          size='xs'
          className='ml-auto text-labelColor hover:text-textColor'
          data-cw-open={id}
          title='open this colourway on the COLORWAYS tab'
          aria-label={`open ${name} on the colorways tab`}
          onClick={() => onOpen(id)}
        >
          open ›
        </Button>
      </div>
      {recipeFailed && (
        <Text size='micro' variant='label' className='mt-1 normal-case' data-cw-recipe-failed={id}>
          created, but its slot colours did not save — {recipeFailed}
        </Text>
      )}
      <div className={cn('mt-1', RULED)}>
        {rows.map((r) => (
          <div key={r.key} className={LINE} data-cw-slot={`${id}:${r.key}`}>
            <Text
              size='micro'
              variant='label'
              component='span'
              className={cn(NAME_COL, 'truncate')}
              title={r.slot || undefined}
            >
              {r.slot || 'unnamed'}
            </Text>
            {r.pantone || r.colour ? (
              <span className='flex min-w-0 items-center gap-2' data-slot-pantone={r.pantone}>
                <Swatch hex={findPantone(r.pantone)?.hex} title={r.pantone || undefined} />
                {r.pantone && (
                  <Text
                    size='micro'
                    component='span'
                    className={cn('uppercase', archived && 'text-labelColor')}
                  >
                    {r.pantone}
                  </Text>
                )}
                {r.colour && (
                  <Text size='micro' variant='label' component='span'>
                    {r.colour}
                  </Text>
                )}
              </span>
            ) : (
              /* «—», А НЕ ПУСТОТА (DESIGN.md): слот есть, цвета у него в рецепте нет. Строка,
                 чей цвет живёт на пришпиленном артикуле, так и говорит — прочерк там был бы
                 неправдой. */
              <Text size='micro' variant='label' component='span' data-slot-pantone=''>
                {r.article ? 'set by its article' : '—'}
              </Text>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ColourwayProposals({
  techCardId,
  readOnly,
}: {
  techCardId: number;
  readOnly: boolean;
}): JSX.Element | null {
  /* ⚠ ЧИТАЕТСЯ ТОЛЬКО `isDirty`, И ЭТО ПОДПИСКА, А НЕ ПРОСМОТР: прокси `useFormState` подписывает
     на прочитанные свойства, и один булев переключается редко. Читает его ОРГАН, а не композитор:
     подписка обязана жить там же, где её единственный потребитель, — иначе первая клавиша на
     карточке перерисовывала бы всю стопку STUDIO ради ворот одной кнопки. */
  const { control } = useFormContext<TechCardFormData>();
  const { isDirty: dirty } = useFormState({ control });
  const { proposals, verdicts } = useCardMemory(techCardId);
  const setVerdict = useDraftMemory((s) => s.setVerdict);
  const patchProposal = useDraftMemory((s) => s.patchProposal);
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const { data: techCard } = useTechCard(techCardId);
  const { confirm, pending } = useConfirmColourway(techCardId);
  const [busy, setBusy] = useState<string | null>(null);
  const [, setParams] = useSearchParams();
  /* Полная библиотека пантонов догружается в чужом такте (первое открытие любого пикера); свотчи
     сохранённых рядов узнают об этом этой подпиской, а не следующим случайным рендером. */
  useSyncExternalStore(subscribePantone, pantoneVersion, pantoneVersion);
  /* Дверь «завести руками» — своё окно; в сторе черновика её нет и быть не должно: она не
     предложение модели, а действие человека. Имя, пантон, подбор словарного цвета и все отказы
     держит само окно (`ColourwayCreatePopover`) — здесь остаётся только «открыто ли». Заведённый
     им колорвей приходит в список сам: окно пишет через `useCreateColorway`, а тот перечитывает
     карточку — своих квитанций у двери больше нет. */
  const [creatingByHand, setCreatingByHand] = useState(false);

  /**
   * ═══ КАРТОЧКА СМЕНИЛАСЬ — ДВЕРЬ «+ COLOURWAY» ЗАКРЫВАЕТСЯ ════════════════════════════════
   *
   * `ColourwayProposals` не ключуется `techCardId`, а `StudioTab` при смене карточки НЕ
   * размонтируется (инвариант 12). Открытое окно рождения карточки A на карточке B завело бы
   * колорвей уже под чужой карточкой. Всё остальное, что здесь рисуется, читается ПО КАРТОЧКЕ
   * (`useCardMemory`, `useTechCard`) и переезжать не может по построению.
   *
   * В ТЕЛЕ РЕНДЕРА, А НЕ В ЭФФЕКТЕ: эффект оставил бы один закоммиченный кадр, в котором карточка
   * уже новая, а окно ещё старое. Образец — `generation/generation-history.tsx` (`shownCard`).
   * `busy` НЕ СБРАСЫВАЕТСЯ НАРОЧНО: он снимается в `finally` уже идущего запроса.
   */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (creatingByHand) setCreatingByHand(false);
  }

  /* Слоты СОХРАНЁННОЙ карточки в порядке MATERIAL SLOTS — из них строятся ряды каждого колорвея
     (`colourway-rows.ts`). `cardRead` отличает «слотов нет» от «карточку ещё не прочитали». */
  const card = useMemo(
    () => cardSlots(techCard?.techCard?.bomItems),
    [techCard?.techCard?.bomItems],
  );
  const cardRead = techCard !== undefined;
  const saved = useMemo(() => techCard?.colorways ?? [], [techCard?.colorways]);

  /**
   * ПРАВКА РЯДА — ПО КЛЮЧУ РЯДА И НАД СЛОТАМИ ИЗ СТОРА В МОМЕНТ ЗАПИСИ. Ряды — слоты карточки, а не
   * слоты ответа, поэтому индекс ряда в `slots` предложения не адрес (индексный `patchSlot` писал
   * бы в соседа). Слоты берутся из стора, а не из рендера: две записи подряд без перерисовки между
   * ними не должны затирать друг друга.
   */
  const writeRow = (
    id: string,
    rowKey: string,
    patch: Partial<Pick<ProposedSlotColour, 'pantone' | 'hex' | 'colour'>>,
  ) => {
    const cur = useDraftMemory.getState().byCard[techCardId]?.proposals.find((x) => x.id === id);
    if (!cur) return;
    patchProposal(techCardId, id, { slots: patchRow(cur.slots, card, rowKey, patch) });
  };
  const usedCodes = useMemo(
    () => new Set(saved.map((c) => c.colorCode ?? '').filter(Boolean)),
    [saved],
  );
  /**
   * ═══ ВЫБРАННОЕ ЗНАЧЕНИЕ ОБЯЗАНО БЫТЬ СРЕДИ ПУНКТОВ — ВСЕГДА, БЕЗ ИСКЛЮЧЕНИЙ ═══════════════
   *
   * Список — ЖИВОЙ КАТАЛОГ, а `colorCode` предложения — то, что сервер сверил со словарём В МОМЕНТ
   * ПРОГОНА. Между прогоном и этим экраном цвет успевают снять в архив, и тогда пункта у него нет:
   * триггер рисуется ПУСТЫМ, а в сторе лежит код, и ворота, спрашивающие только `!colorCode`,
   * пропускают `CreateColorway` с цветом, которого экран не показывает.
   *
   * ЛЕЧИТСЯ ТЕМ ЖЕ, ЧЕМ У СОСЕДА (`pattern/pattern-library.tsx`): носимый архивный остаётся в
   * списке, а сирота дописывается своим пунктом. Здесь список — выбор цвета БУДУЩЕГО ПРОДУКТА,
   * поэтому такой пункт стоит `disabled` и НАЗЫВАЕТ факт, а ворота отказывают словами.
   *
   * КЛЮЧ БЕРЁТСЯ У ВСЕХ ПРЕДЛОЖЕНИЙ СРАЗУ (`held`): список тут один на блок.
   */
  const held = useMemo(
    () => new Set(proposals.map((p) => (p.colorCode ?? '').trim()).filter(Boolean)),
    [proposals],
  );
  const colours = useMemo(
    () => (dictionary?.colors ?? []).filter((c) => !!c.code && (!c.archived || held.has(c.code))),
    [dictionary?.colors, held],
  );
  /** Живой каталог — ТО, ИЗ ЧЕГО МОЖНО ВЫБРАТЬ. Архивные в `colours` есть, но выбирать их нельзя. */
  const choosable = useMemo(
    () => new Set(colours.filter((c) => !c.archived).map((c) => c.code ?? '')),
    [colours],
  );
  /** Словарь целиком, включая архив: подпись сохранённого колорвея ищет свой код и там. */
  const dictionaryByCode = useMemo(
    () => new Map((dictionary?.colors ?? []).map((c) => [c.code ?? '', c])),
    [dictionary?.colors],
  );

  /**
   * ПОДТВЕРЖДЁННОЕ ПРЕДЛОЖЕНИЕ ПРЯЧЕТСЯ, КОГДА ЕГО СОХРАНЁННЫЙ РЯД УЖЕ СТОИТ, — и только тогда.
   * Вердикт `confirmed` без ряда (колорвей удалили на вкладке COLORWAYS, перечитывание не
   * доехало) не прячет ничего: предложение снова живо, а задвоение закрывает сервер.
   */
  const savedIds = useMemo(
    () => new Set(saved.map((c) => wireInt(c.colorwayId)).filter((n) => n > 0)),
    [saved],
  );
  const visible = proposals.filter((p) => {
    const v = verdicts[p.id];
    if (v?.status === 'dismissed') return false;
    return !(v?.status === 'confirmed' && savedIds.has(wireInt(v.colorwayId)));
  });
  /** «Колорвей заведён, а рецепт не записался» — правда, которая стоит под его сохранённым рядом. */
  const recipeFailedById = useMemo(() => {
    const out = new Map<number, string>();
    for (const v of Object.values(verdicts))
      if (v.status === 'confirmed' && v.recipeFailed)
        out.set(wireInt(v.colorwayId), v.recipeFailed);
    return out;
  }, [verdicts]);

  /**
   * ПОЛНАЯ БИБЛИОТЕКА ПАНТОНОВ — КОГДА НА ЭКРАНЕ ЕСТЬ КОД, КОТОРОГО НЕТ В ОТОБРАННЫХ 274. Штатно она
   * догружается при первом открытии пикера (платит тот, кто выбирает цвет); здесь её платит тот,
   * кто СМОТРИТ на коды: модель называет TCX-номера из всей книги, и без библиотеки их свотчи
   * рисовались бы пустыми квадратами до первого открытия любого пикера. Ни одного незнакомого кода —
   * ни одного запроса.
   */
  const unknownCode =
    visible.some((p) => p.slots.some((s) => !!s.pantone.trim() && !findPantone(s.pantone))) ||
    saved.some(
      (c) =>
        (!!(c.pantone ?? '').trim() && !findPantone(c.pantone)) ||
        (c.usages ?? []).some((u) => !!(u.pantone ?? '').trim() && !findPantone(u.pantone)),
    );
  useEffect(() => {
    if (unknownCode) void ensurePantoneLibrary();
  }, [unknownCode]);

  /* ⚠ ОДНО ИСКЛЮЧЕНИЕ ИЗ «БЛОК СТОИТ ВСЕГДА»: карточка только для чтения, у которой нет ни
     сохранённых колорвеев, ни предложений. Читателю пустая рамка не сообщает ничего. */
  if (readOnly && visible.length === 0 && saved.length === 0) return null;

  /* ⚠ ВОРОТА РУЧНОЙ ДВЕРИ ЗДЕСЬ НЕ СЧИТАЮТСЯ, И ЭТО НЕ ОСЛАБЛЕНИЕ: их считает `createRefusal`
     внутри окна, поверх тех же прав, того же словаря и того же `isDirty` формы карточки. */

  /* `?colorway=` выбирает свотч на вкладке (`colorway-recipe.tsx` читает его, только когда `?tab=`
     называет её), поэтому дверь ведёт прямо к этому колорвею, а не на вкладку вообще. */
  const openOnColorways = (colorwayId: number) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'colorways');
        next.set('colorway', String(colorwayId));
        next.delete('sample');
        next.delete('fits');
        return next;
      },
      { replace: true },
    );

  const listed = saved.length + visible.length > 0;

  return (
    <Section
      title='colourways'
      question='— what colours it comes in'
      /* ШОВ БЛОКА — ТОТ ЖЕ ТОКЕН, ЧТО У СОСЕДЕЙ ШАГА MOODBOARD (r3 п.3-токен): `Section` разводит
         своих прямых детей штатными 10px, шаг набран швом в 20px, и число берётся у `GROUP_SEAM`,
         а не пишется здесь второй раз. */
      className={GROUP_SEAM}
    >
      <div data-b25-colourways=''>
        {listed && (
          /* Шов между колорвеями — 20px, число `GROUP_SEAM`: колорвей в этом блоке и есть группа. */
          <div className='flex flex-col gap-5' data-cw-list=''>
            {saved.map((cw, i) => (
              <SavedColourway
                key={`saved:${wireInt(cw.colorwayId) || `#${i}`}`}
                cw={cw}
                card={card}
                dictionaryColour={dictionaryByCode.get((cw.colorCode ?? '').trim())}
                recipeFailed={recipeFailedById.get(wireInt(cw.colorwayId))}
                onOpen={openOnColorways}
              />
            ))}

            {visible.map((p) => {
              // Ряды — все слоты сохранённой карточки, потом слоты модели, которых на ней нет (O-44 п.2).
              const rows = proposalRows(p.slots, card);
              const bound = recipeSlots(rows);
              /* Сирота — код, которого в словаре нет ВОВСЕ (цвет удалили, а не сняли в архив). Он
                 тоже обязан получить свой пункт: иначе триггер снова пуст, а стор снова не пуст. */
              const orphanCode = !!p.colorCode && !colours.some((c) => c.code === p.colorCode);
              const refusal = confirmRefusal({
                readOnly,
                dirty,
                colorCode: p.colorCode,
                usedCodes,
                // Словарь «есть» ровно тогда, когда из него есть ЧТО ВЫБРАТЬ: архивный пункт,
                // оставленный ради видимости своего же значения, выбором не является.
                dictionaryHasAny: colours.length > 0,
                dictionaryHasColours: choosable.size > 0,
                codeChoosable: !p.colorCode || choosable.has(p.colorCode),
                codeKnown: !p.colorCode || !orphanCode,
                cardRead,
                cardSlotCount: card.length,
                boundCount: bound.length,
              });

              /* ═══ ПРЕДЛОЖЕНИЕ — ЧЕРНОВИК, И ВЫГЛЯДИТ ОНО ЧЕРНОВИКОМ (владелец, O-44 п.1) ═══════
                 Дословно: «после генерации колорвеи не отображались синими драфтами». Пометку
                 остального черновика считает журнал записей (`use-draft-fills`), а колорвей в
                 журнал не пишется и писаться не должен — он не значение поля, а продукт, и
                 принимает его `confirm ▸`, а не пилюля. Рамка здесь ПРЕДСТАВЛЕНИЕ, без журнала и
                 без «accept all»; пилюля глухая — второй двери «принять» рядом быть не должно.
                 Рамка выступает за колонку на свои поля (`-mx-2 px-2`): содержимое предложения
                 стоит в той же сетке, что и сохранённые ряды над ним. */
              return (
                <div
                  key={p.id}
                  className={cn('-mx-2 px-2 py-2', DRAFTED_CLASS)}
                  data-b25-cw={p.id}
                  data-drafted=''
                >
                  <div className='flex flex-wrap items-end gap-x-3 gap-y-2'>
                    <label className={cn(NAME_COL, 'flex flex-col gap-0.5')}>
                      <span className='flex items-center gap-2'>
                        <Text size='micro' variant='label' component='span' className='uppercase'>
                          name
                        </Text>
                        <DraftedPill live data-b25-drafted={p.id} />
                      </span>
                      <Input
                        value={p.name}
                        maxLength={64}
                        disabled={readOnly}
                        data-b25-name={p.id}
                        onChange={(e: { target: { value: string } }) =>
                          patchProposal(techCardId, p.id, { name: e.target.value })
                        }
                      />
                    </label>
                    <label className='flex flex-col gap-0.5'>
                      <Text size='micro' variant='label' component='span' className='uppercase'>
                        colour
                      </Text>
                      <span className='flex items-center gap-2'>
                        <Swatch
                          hex={colours.find((c) => c.code === p.colorCode)?.hex ?? undefined}
                          title={p.colorCode || undefined}
                        />
                        <select
                          className={cn(cell, 'w-56')}
                          value={p.colorCode}
                          disabled={readOnly}
                          data-b25-code={p.id}
                          onChange={(e) =>
                            patchProposal(techCardId, p.id, { colorCode: e.target.value })
                          }
                        >
                          <option value=''>— select colour —</option>
                          {colours.map((c) => (
                            <option
                              key={c.code}
                              value={c.code}
                              disabled={usedCodes.has(c.code ?? '') || !!c.archived}
                            >
                              {c.code} · {c.name}
                              {c.archived ? ' (archived)' : ''}
                              {usedCodes.has(c.code ?? '') ? ' (already on this style)' : ''}
                            </option>
                          ))}
                          {/* СИРОТА — СВОИМ ПУНКТОМ: без него у селекта нет пункта под своё же
                              значение, триггер пуст, а код лежит в сторе и уезжает на сервер. */}
                          {orphanCode && (
                            <option value={p.colorCode} disabled>
                              {p.colorCode} (not in the dictionary)
                            </option>
                          )}
                        </select>
                      </span>
                    </label>
                    <span className='ml-auto flex items-center gap-2'>
                      {refusal ? (
                        <InertDoor label='confirm ▸' reason={refusal} size='sm' />
                      ) : (
                        <Button
                          type='button'
                          variant='main'
                          size='sm'
                          data-b25-confirm={p.id}
                          disabled={pending || busy === p.id}
                          loading={busy === p.id}
                          onClick={async () => {
                            setBusy(p.id);
                            try {
                              const v = await confirm(p, bound, (colorwayId) =>
                                setVerdict(techCardId, p.id, { status: 'confirmed', colorwayId }),
                              );
                              setVerdict(techCardId, p.id, v);
                              const half = v.status === 'confirmed' && !!v.recipeFailed;
                              showMessage(
                                half
                                  ? 'colourway created — its slot colours did not save'
                                  : 'colourway created',
                                half ? 'error' : 'success',
                              );
                            } catch (e) {
                              showMessage(createColorwayErrorMessage(e), 'error');
                            } finally {
                              setBusy(null);
                            }
                          }}
                        >
                          confirm ▸
                        </Button>
                      )}
                      <Button
                        type='button'
                        variant='secondary'
                        size='sm'
                        data-b25-dismiss={p.id}
                        disabled={busy === p.id}
                        onClick={() => setVerdict(techCardId, p.id, { status: 'dismissed' })}
                      >
                        dismiss
                      </Button>
                    </span>
                  </div>

                  <div className={cn('mt-1', RULED)}>
                    {rows.map((s) => (
                      <div
                        key={`${p.id}:${s.key}`}
                        className={LINE}
                        data-b25-slot={`${p.id}:${s.key}`}
                        data-bound={s.lineKey ? 'yes' : 'no'}
                        data-family={s.family ?? undefined}
                      >
                        <Text
                          size='micro'
                          variant='label'
                          component='span'
                          className={cn(NAME_COL, 'truncate')}
                          title={s.slot || undefined}
                        >
                          {s.slot || 'unnamed'}
                        </Text>
                        {/**
                         * ═══ ПАНТОН СЛОТА — ИЗ СВОТЧЕЙ, ОДНИМ ОРГАНОМ (владелец, O-44 п.4) ═══════
                         *
                         * Свободное поле кода стало домашним `PantonePicker` — тем же, что у окна
                         * «+ colourway» и у палитры: поиск по коду и имени, сетка свотчей двух
                         * семей, любой код можно набрать. Пикер пишет в слот код, hex и имя свотча
                         * (`pantonePatch`); слова рядом остаются полем — их можно поправить.
                         *
                         * Свотч рисует сам триггер пикера, когда знает код. Свой квадрат стоит
                         * только там, где пикер не может: кода нет в библиотеке, а hex прислала
                         * модель, — иначе квадратов было бы два. Колонка пикера фиксирована, чтобы
                         * слова стояли одной вертикалью, какой бы длины ни был код.
                         */}
                        <span
                          className='flex w-40 shrink-0 items-center gap-2'
                          data-slot-pantone={s.pantone}
                        >
                          {!findPantone(s.pantone) && !!s.hex && (
                            <Swatch hex={s.hex} title={s.pantone || undefined} />
                          )}
                          <PantonePicker
                            name={`${p.id}:${s.key}`}
                            value={s.pantone}
                            label='pantone'
                            disabled={readOnly}
                            onPick={(code) =>
                              writeRow(p.id, s.key, pantonePatch(s, code, findPantone))
                            }
                          />
                        </span>
                        <Input
                          className='w-40'
                          value={s.colour}
                          maxLength={64}
                          disabled={readOnly}
                          placeholder='colour name'
                          aria-label={`colour name · ${s.slot || 'unnamed'}`}
                          data-b25-colour={`${p.id}:${s.key}`}
                          onChange={(e: { target: { value: string } }) =>
                            writeRow(p.id, s.key, { colour: e.target.value })
                          }
                        />
                        {/* НЕ ПРИВЯЗАННЫЙ СЛОТ НАЗЫВАЕТСЯ, А НЕ ПРЯЧЕТСЯ: он не поедет в рецепт, и
                            человек обязан знать почему. Пока карточку не прочитали, «нет на
                            карточке» значит «ещё не знаем» — пилюли нет. */}
                        {!s.lineKey && cardRead && <Pill tone='mut'>not on the card</Pill>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/**
         * ═══ «+ COLOURWAY» — ОДНА ДВЕРЬ, И ОКНО ЗА НЕЙ ОБЩЕЕ СО СТУДИЕЙ (r2 п.15, G2-4) ════════
         *
         * Своей формы здесь нет: за дверью стоит `ColourwayCreatePopover` — имя, пантон и видимый
         * подбор словарного цвета под SKU, то же окно, что у остальных дверей студии. Писатель один
         * (`useCreateColorway`) на всё дерево. Заведённый колорвей встаёт сохранённым рядом выше
         * сам — перечитыванием карточки, без квитанций у двери.
         *
         * `mt-4` — только под списком (O-48): дверь отступает от последнего ряда на шаг, а в пустом
         * блоке стоит сразу под шапкой.
         */}
        {!readOnly && (
          <div
            data-b25-add-row=''
            className={cn(
              'flex flex-wrap items-center gap-2 border border-dashed border-borderColor px-2.5 py-2',
              listed && 'mt-4',
            )}
          >
            <Text size='micro' variant='label' component='span' className='min-w-0 normal-case'>
              a colourway of this style — its own name and its pantone
            </Text>
            <span className='ml-auto'>
              <ColourwayCreatePopover
                techCardId={techCardId}
                open={creatingByHand}
                onOpenChange={setCreatingByHand}
                readOnly={readOnly}
                onCreated={() => {}}
                anchor={
                  <Button type='button' variant='main' size='sm' data-b25-add=''>
                    + colourway
                  </Button>
                }
              />
            </span>
          </div>
        )}
      </div>
    </Section>
  );
}
