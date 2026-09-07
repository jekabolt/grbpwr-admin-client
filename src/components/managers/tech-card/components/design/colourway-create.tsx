import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useMemo, useRef, useState, type JSX } from 'react';
import { useFormContext, useFormState } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../schema';
import { findPantone, normalizePantone } from '../pantone-swatches';
import { PantonePicker } from '../pantone-picker';
import { createColorwayErrorMessage, useCreateColorway } from '../useColorwayRecipe';
import {
  createRefusal,
  freeDictionaryColours,
  nearestFreeDictionaryColour,
  normalizeColourwayName,
  pantoneSystemOf,
} from './colourway-create-model';
import { GROUP_SEAM, Reason } from './core';

/**
 * ═══ ОДИН ОРГАН РОЖДЕНИЯ КОЛОРВЕЯ НА ВСЮ СТУДИЮ (G2-4, решения D1–D12) ══════════════════════════
 *
 * Владелец: «именование колорвея — не из пула предефайн, мы всегда можем создать кастомный колорвей
 * сами… колорвей появляется только на этапе FABRIC RENDER, но не каждый фабрик-рендер значит, что у
 * нас будет такой колорвей в итоге». Отсюда весь замысел: колорвей РОЖДАЕТСЯ ЖЕСТОМ на рендере, а
 * не выбирается заранее из списка, и жест этот — ОДИН на четыре двери (заголовок столбца в SIDES,
 * пункт `+ colourway…` в цели GENERATE, он же в цели mark/apply, ручная строка у предложений MOOD).
 *
 * ЧЕТЫРЕ ДВЕРИ, ОДНА КОМНАТА — И ЭТО ГЛАВНОЕ ЗДЕСЬ ПРАВИЛО. До этого круга колорвей заводился в
 * двух местах двумя РАЗНЫМИ формами (`CreateColorwayForm` вкладки COLOURWAYS — только словарный
 * код, без имени; ручная строка `colourway-proposals` — имя плюс словарный `<select>`), и человек,
 * заведший его слева, не находил своего поля справа. Здесь форма одна: кто бы её ни открыл, вопросы
 * те же и в том же порядке.
 *
 * ⚠ ЭТО МОДАЛКА, ХОТЯ ЗОВЁТСЯ POPOVER, И ПРИЧИНА НЕ В ИМЕНИ. Две двери из четырёх — ПУНКТЫ СЕЛЕКТА
 * (`+ colourway…`): к моменту, когда окно открывается, пункт уже исчез вместе со списком, и
 * якориться поповеру не к чему. Второе: внутри стоит `PantonePicker`, а он сам — поповер; поповер в
 * поповере уводит слой закрытия в спор о том, кто из них верхний. `ConfirmationModal` — «одна
 * модалка приложения» (`ui/components/confirmation-modal.tsx`), она открывается СОСТОЯНИЕМ, без
 * триггера, и одинаково служит всем четырём дверям. Имя экспорта оставлено тем, каким его ждут
 * соседние зоны.
 *
 * ЧТО ЭТОТ ОРГАН ПИШЕТ, И ЧЕГО НЕ ПИШЕТ. Ровно `CreateColorway{colorCode, development{name,
 * pantone, pantone_system, dev_hex}}` — те самые поля, что уже есть на проводе (D-факт: ничего
 * нового для «имя + пантон» заводить не нужно). Рецепт (`UpdateColorwayRecipe`) НЕ пишется: ткань —
 * свойство изделия, и назначать её здесь значило бы выдумать метраж, которого никто не считал.
 *
 * ⚠ ТРЕТЬЯ СТРОКА — НЕ УКРАШЕНИЕ, А ЧЕСТНОСТЬ (D3). `product.color` NOT NULL заполняется по
 * СЛОВАРНОМУ коду, то есть у колорвея всегда будет буква из словаря, хочет того человек или нет.
 * Спрятать её за автоподбором значило бы записать в SKU то, чего никто не выбирал; поэтому подбор
 * ВИДЕН, назван и переназначается одной дверью «change». Снять обязательность кода — задача
 * бэкенда (B2), и до неё эта строка остаётся.
 */
export function ColourwayCreatePopover({
  techCardId,
  open,
  onOpenChange,
  onCreated,
  anchor,
  readOnly = false,
}: {
  techCardId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Новый колорвей заведён — вызывающий делает его целью прогона. */
  onCreated: (colorwayId: number) => void;
  /**
   * Дверь, если она у вызывающего одна и её удобно отдать сюда: клик по ней открывает окно. Узел
   * рисуется КАК ЕСТЬ и своего обработчика открытия нести не обязан. Двери-пункты селекта его не
   * передают вовсе — они держат `open` сами.
   */
  anchor?: React.ReactNode;
  readOnly?: boolean;
}): JSX.Element {
  /* ⚠ ЧИТАЕТСЯ ТОЛЬКО `isDirty`, И ЭТО ПОДПИСКА, А НЕ ПРОСМОТР — тот же довод, что у соседа
     (`colourway-proposals.tsx`): прокси `useFormState` подписывает на прочитанные свойства, и один
     булев переключается редко.

     ⚠ ЗДЕСЬ СТОЯЛ ПРОП `isCardDirty` «для вызывающего ВНЕ формы», и вызывающих у него не было ни
     одного: оба монтирования окна (`render-studio.tsx`, `colourway-proposals.tsx`) живут внутри
     `<Form>` тех-карты. Снят, а не оставлен на будущее: необязательный проп, старший контекста,
     это готовая дверь мимо единственного источника истины — первый же, кто передал бы в неё своё
     значение, получил бы окно, отказывающее по одной «грязности», пока сохраняет другую. */
  const { control } = useFormContext<TechCardFormData>();
  const { isDirty: dirty } = useFormState({ control });

  const { data: techCard } = useTechCard(techCardId);
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const create = useCreateColorway(techCardId);

  const [name, setName] = useState('');
  const [pantone, setPantone] = useState('');
  /** Код словаря, выбранный РУКОЙ. Пусто = «как подобралось». */
  const [handCode, setHandCode] = useState('');
  const [changing, setChanging] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const clear = () => {
    setName('');
    setPantone('');
    setHandCode('');
    setChanging(false);
    setFailed(null);
  };

  /**
   * ═══ ДВА СБРОСА, ОБА В ТЕЛЕ РЕНДЕРА (инвариант 12) ═══════════════════════════════════════════
   *
   * КАРТОЧКА. `StudioTab` при смене карточки НЕ размонтируется, а это окно висит рядом с дверью —
   * значит набранное имя и выбранный пантон уехали бы в `CreateColorway` уже под ЧУЖОЙ карточкой,
   * и человек узнал бы об этом на её вкладке COLOURWAYS. Довод и образец — тот же `shownCard` у
   * соседа.
   *
   * ЗАКРЫТИЕ. Окно закрывают четыре разных пути (✕, cancel, Esc, клик мимо), и все они идут одним
   * `onOpenChange(false)` МИМО нашего кода. Без этой пары строк следующая дверь открыла бы форму с
   * половиной прошлого ответа — и, что хуже, с прошлым отказом под кнопкой.
   *
   * Эффектом это делать нельзя: остаётся закоммиченный кадр, в котором карточка уже новая, а поля
   * ещё чужие, — и по нему успевают нажать.
   */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (name || pantone || handCode || changing || failed) clear();
  }
  const wasOpen = useRef(open);
  if (wasOpen.current !== open) {
    wasOpen.current = open;
    if (!open && (name || pantone || handCode || changing || failed)) clear();
  }

  const colorways = techCard?.colorways ?? [];
  /** Занятые коды — по ВСЕМ колорвеям карточки: `UNIQUE(style_id, color_code)` архива не знает. */
  const usedCodes = useMemo(
    () => new Set(colorways.map((c) => c.colorCode ?? '').filter(Boolean)),
    [colorways],
  );
  /**
   * ИМЕНА, УЖЕ ЗАНЯТЫЕ НА КАРТОЧКЕ (D12). Архивные считаются: имя архивного колорвея всё ещё стоит
   * в спецификациях и в разговоре, и второй «ROSSO» рядом с ним читался бы как тот же самый.
   *
   * Безымянный колорвей на экране зовётся своим кодом (`p.name || p.colorCode` у соседа) — значит
   * и занимает он это имя: «BLK», набранное поверх безымянного BLK, дало бы два одинаковых ярлыка.
   */
  const takenNames = useMemo(
    () =>
      new Set(
        colorways
          .map((c) => normalizeColourwayName(c.devName || c.colorCode))
          .filter(Boolean),
      ),
    [colorways],
  );

  const colours = dictionary?.colors;
  const free = useMemo(() => freeDictionaryColours(colours, usedCodes), [colours, usedCodes]);
  const swatch = findPantone(pantone);
  const auto = useMemo(
    () => nearestFreeDictionaryColour(swatch?.hex, colours, usedCodes),
    [swatch?.hex, colours, usedCodes],
  );
  /** Что реально уедет в `product.color_code`: рука старше подбора. */
  const picked = handCode || auto?.code || '';
  const pickedColour = free.find((c) => c.code === picked) ?? colours?.find((c) => c.code === picked);

  const named = name.trim();
  const refusal = createRefusal({
    readOnly,
    dirty,
    name: named,
    nameTaken: !!named && takenNames.has(normalizeColourwayName(named)),
    pantone,
    pantoneHex: swatch?.hex ?? '',
    colorCode: picked,
    usedCodes,
    dictionaryHasAny: (colours ?? []).length > 0,
    dictionaryHasColours: (colours ?? []).some((c) => !c.archived),
    freeCount: free.length,
    codeChoosable: !picked || free.some((c) => c.code === picked),
    codeKnown: !picked || (colours ?? []).some((c) => c.code === picked),
  });

  async function submit() {
    if (refusal || create.isPending) return;
    setFailed(null);
    try {
      const res = await create.mutateAsync({
        colorCode: picked,
        development: {
          devCode: undefined,
          name: named,
          labDipStatus: undefined,
          comment: undefined,
          pantone,
          // Система названа только когда назван код — ровно как у соседа: «TCX» при пустом пантоне
          // было бы утверждением о системе цвета, которого никто не делал.
          pantoneSystem: pantone ? pantoneSystemOf(pantone) : undefined,
          devHex: swatch?.hex ?? '',
          swatchMediaId: undefined,
          labDipRound: undefined,
          labDipSubmittedAt: undefined,
          labDipDecidedAt: undefined,
          labDipDecidedBy: undefined,
          labDipRejectReason: undefined,
          // Вложенный рецепт сервер отвергает прямым текстом — и этому окну он не нужен вовсе.
          usages: undefined,
          displayOrder: undefined,
        },
      });
      const colorwayId = res?.colorwayId ?? 0;
      if (!colorwayId) throw new Error('the server created no colourway id');
      showMessage('colourway created', 'success');
      clear();
      onOpenChange(false);
      /* ⚠ ЦЕЛЬ ВСТАЁТ НА НОВЫЙ КОЛОРВЕЙ ТОЛЬКО ПОТОМУ, ЧТО `useCreateColorway.onSuccess` ВОЗВРАЩАЕТ
         промис `qc.invalidateQueries` (`useColorwayRecipe.ts`): v5 ждёт его до резолва
         `mutateAsync`, поэтому к этой строке карточка УЖЕ перечитана и новый id есть в
         `techCard.colorways`. Убери там `return` (или перепиши на `mutate`) — и дрейф-эффект
         `useColorwayChoice` не найдёт пункта под только что выбранным числом и молча отправит
         цель обратно в `sample`, а следующий прогон уедет семплом. Связь неявная — поэтому
         названа здесь, у потребителя. */
      onCreated(colorwayId);
    } catch (e) {
      /* ⚠ ОКНО НЕ ЗАКРЫВАЕТСЯ НА ОШИБКЕ (`closeOnConfirm={false}`): закрыть его значило бы стереть
         набранное имя вместе с отказом сервера — человек набирал бы его заново, чтобы получить тот
         же отказ. Квитанция стоит там же, где кнопка. */
      setFailed(createColorwayErrorMessage(e));
    }
  }

  return (
    <>
      {/* Дверь рисуется КАК ЕСТЬ, а открывает окно обёртка: `display:contents` не заводит своей
          коробки, поэтому раскладка вызывающего не меняется ни на пиксель. */}
      {anchor && (
        <span className='contents' onClick={() => !readOnly && onOpenChange(true)}>
          {anchor}
        </span>
      )}
      <ConfirmationModal
        open={open}
        onOpenChange={onOpenChange}
        onConfirm={submit}
        onCancel={clear}
        title='new colourway'
        confirmLabel='create colourway'
        confirmDisabled={!!refusal || create.isPending}
        closeOnConfirm={false}
        /* `md` — ЭТО ПОЛ, А НЕ ШИРИНА (шелл говорит так сам): в `sm` (340px) строка «sku colour»
           переносилась вместе со своей причиной в три строки мелкого текста, и три спокойных ряда
           читались теснее, чем один. Владелец в этом круге просит ровно обратного. */
        width='md'
      >
        {/* ТРИ СТРОКИ ОДНОГО ВОПРОСА И НИ ОДНОЙ ЛИШНЕЙ КНОПКИ. Шов между ними — `GROUP_SEAM`
            студии (20px): владелец в этом круге просит «дай больше спейсинга», и своё число здесь
            развело бы окно с остальными экранами. */}
        <div className={GROUP_SEAM} data-cw-create=''>
          <label className='flex flex-col gap-0.5'>
            <Text size='micro' variant='label' component='span' className='uppercase'>
              name
            </Text>
            <Input
              value={name}
              maxLength={64}
              autoFocus
              placeholder='name this colourway'
              data-cw-name=''
              onChange={(e: { target: { value: string } }) => setName(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                // Enter отправляет — клавиатура здесь первична (PRODUCT.md). Сравнение по имени
                // клавиши, не по букве: буквы мертвы на кириллической раскладке.
                if (e.key !== 'Enter') return;
                e.preventDefault();
                void submit();
              }}
            />
          </label>

          <div className='flex flex-col gap-0.5'>
            <Text size='micro' variant='label' component='span' className='uppercase'>
              pantone
            </Text>
            {/* ОДИН ОРГАН, А НЕ ПОЛЕ ПЛЮС ПИКЕР: `PantonePicker` сам печатает свотч и код на
                триггере и сам решает, что считается ссылкой (`normalizePantone`). Написание, в
                котором пантон уедет на провод, — ровно то, что стоит на кнопке. */}
            <span className='flex flex-wrap items-center gap-2'>
              <PantonePicker
                name='colourway-create'
                value={pantone}
                label='pick the pantone'
                disabled={readOnly}
                onPick={(code) => setPantone(normalizePantone(code) || code.trim())}
              />
              {!!swatch && (
                <Text size='micro' variant='label' component='span' data-cw-pantone-name=''>
                  {swatch.name}
                </Text>
              )}
            </span>
          </div>

          {/* ═══ ТРЕТЬЯ СТРОКА: ЧТО ЗАПИШЕТСЯ В SKU ═══════════════════════════════════════════
              Мелко и словами, потому что это не выбор, а следствие: словарный код обязателен де-факто
              (`product.color` NOT NULL), а пантон словарю неизвестен. `change` не добавляет второго
              органа рядом — он ЗАМЕНЯЕТ строку списком, и список уходит, как только выбор сделан. */}
          <div className='flex flex-col gap-0.5' data-cw-sku=''>
            {changing ? (
              <label className='flex flex-col gap-0.5'>
                <Text size='micro' variant='label' component='span' className='uppercase'>
                  sku colour
                </Text>
                <select
                  className={cn(
                    'block min-h-[22px] w-full appearance-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize focus:border-textColor focus:outline-none',
                  )}
                  value={picked}
                  data-cw-sku-select=''
                  onChange={(e) => {
                    setHandCode(e.target.value);
                    setChanging(false);
                  }}
                >
                  {/* Значение ВСЕГДА среди пунктов — правило Radix-селекта держится и здесь, и
                      держится ПОСТРОЕНИЕМ: подобранный код свободен по определению, а выбранный
                      рукой берётся из этого же списка. Пустой пункт стоит только пока выбирать
                      нечего — иначе он читался бы как «без цвета», которого у продукта не бывает. */}
                  {!picked && <option value=''>— select colour —</option>}
                  {free.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} · {c.name}
                      {c.code === auto?.code ? ' (nearest)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : swatch ? (
              <>
                <span className='flex flex-wrap items-center gap-2'>
                  <Text size='micro' variant='label' component='span'>
                    sku colour:
                  </Text>
                  {!!pickedColour?.hex && (
                    <span
                      aria-hidden
                      className='size-3 shrink-0 border border-borderColor'
                      style={{ background: pickedColour.hex }}
                    />
                  )}
                  <Text size='micro' component='span' className='uppercase' data-cw-sku-code=''>
                    {picked || '—'}
                  </Text>
                  <Button
                    type='button'
                    variant='secondary'
                    size='xs'
                    data-cw-sku-change=''
                    disabled={readOnly || free.length === 0}
                    onClick={() => setChanging(true)}
                  >
                    change
                  </Button>
                </span>
                <Reason>the dictionary colour the SKU is cut from</Reason>
              </>
            ) : (
              /* ДО ПАНТОНА СТРОКА НИЧЕГО НЕ ЗНАЕТ — И ГОВОРИТ ИМЕННО ЭТО, одной фразой и без
                 органов. Прочерк рядом с живой кнопкой «change» отвечал бы на вопрос, которого
                 ещё не задавали: менять там нечего, а кнопка звала бы нажать. */
              <Text size='micro' variant='label' component='span' data-cw-sku-later=''>
                sku colour: picked from the pantone swatch
              </Text>
            )}
          </div>

          {/* ОТКАЗ — ПОД ПОЛЯМИ, А НЕ В ПОДВАЛЕ: подвал этой модалки отдан подсказке о клавишах, и
              довод про место у него свой. Причина стоит там, где её чинят. */}
          {(refusal || failed) && (
            <div data-cw-refusal=''>
              <Reason>{failed ?? refusal}</Reason>
            </div>
          )}
        </div>
      </ConfirmationModal>
    </>
  );
}
