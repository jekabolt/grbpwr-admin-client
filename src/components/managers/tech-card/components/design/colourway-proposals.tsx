import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { useTechCard, techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useMemo, useState, type JSX } from 'react';
import { useFormContext, useFormState } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../schema';
import {
  createColorwayErrorMessage,
  recipeSaveErrorMessage,
  useCreateColorway,
  useUpdateColorwayRecipe,
} from '../useColorwayRecipe';
import { InertDoor } from './bench-slot';
import {
  bindSlots,
  confirmRefusal,
  usagesForColourway,
  type BoundSlot,
  type ProposedColourway,
} from './colourway-proposals-model';
import { useCardMemory, useDraftMemory, type ColourwayVerdict } from './head/use-draft-fills';

/**
 * КОЛОРВЕИ, ПРЕДЛОЖЕННЫЕ ЧЕРНОВИКОМ (B-25 круга 20).
 *
 * Владелец: «я хочу что бы DRAFT OF THE CONSTRUCTION могло предложить мне создать несколько
 * колорвеев и это было отдельным блоком где мы могли бы выбрать какие цвета по пантонам может
 * что-то еще и что бы если мы вконфирмили этот колорвей появлялся далее уже во вкладке колорвей».
 *
 * ═══ ЭТО СВОЙ БЛОК, И ОБЁРТКУ ОН ДЕРЖИТ САМ ════════════════════════════════════════════════
 *
 * Владелец сказал «отдельным блоком» (D5 плана). Одну ночь орган простоял ПОДСТРУКТУРОЙ внутри
 * черновика — не по замыслу, а потому что `design/studio-tab.tsx` держала другая рука, — и это
 * было нарушением системы: черновик сам стоит внутри блока мудборда, то есть колорвеи оказывались
 * блоком в блоке (прямой запрет DESIGN.md). Теперь орган смонтирован своей секцией в стопке
 * STUDIO, сразу под таблицей слотов: цвета назначаются ПО СЛОТАМ, и соседство читается как фраза.
 *
 * `Section`-ОБЁРТКА ЖИВЁТ ЗДЕСЬ, А НЕ У ВЫЗЫВАЮЩЕГО, И ЭТО НЕ СТИЛЬ — тем же приёмом, каким её
 * держит соседняя таблица слотов. Причина в условности: блока НЕТ ВОВСЕ, пока нечего сказать
 * (ранний возврат ниже), а решает это состояние модульного стора, которое знает только орган.
 * Обёртка у вызывающего означала бы либо пустую белую рамку с подписью на каждой карточке, либо
 * второй читатель того же стора в композиторе — то есть второй ответ на один вопрос.
 *
 * ═══ ЗДЕСЬ КЛИК ОБЯЗАТЕЛЕН, И ЭТО НЕ ПРОТИВОРЕЧИТ B-14 ═════════════════════════════════════
 *
 * Всё остальное черновик теперь пишет сам, потому что запись в форму отменяется формой же: `✕`
 * возвращает то, что стояло. Подтверждение колорвея — НЕ запись в форму. `CreateColorway` создаёт
 * ПРОДУКТ, немедленно и на сервере; ни `✕`, ни отказ от сохранения карточки его не уберут — его
 * придётся удалять руками на вкладке продуктов. Само-заполнение здесь означало бы, что платный
 * прогон молча наплодил до четырёх продуктов, о которых человека не спросили.
 */

/** Квадратик цвета. Своя копия на четыре строки — импортировать из `colorway-recipe.tsx`
 *  (4 700 строк редактора рецепта) значило бы затащить сюда его половину ради рамки 12×12. */
function Swatch({ hex, title }: { hex?: string; title?: string }): JSX.Element {
  return (
    <span
      aria-hidden
      title={title ?? hex ?? undefined}
      className='inline-block size-3 shrink-0 border border-textColor'
      style={hex ? { backgroundColor: hex } : undefined}
    />
  );
}

const cell =
  'block min-h-[22px] w-full appearance-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize focus:border-textColor focus:outline-none disabled:bg-bgZebra disabled:text-labelColor';

/**
 * ТРЁХШАГОВАЯ ЗАПИСЬ, ТОЧНО ТА ЖЕ, КАКОЙ ЕЁ ДЕЛАЕТ ВКЛАДКА: сперва личность, потом рецепт.
 *
 * ⚠ ВЕРСИЯ ЗАМКА ЧИТАЕТСЯ ПЕРЕД САМОЙ ЗАПИСЬЮ, А НЕ НА РЕНДЕРЕ. `expected_colorway_version` —
 * это общий `tech_card.lock_version`, и его двигает ЛЮБАЯ запись по карточке, включая только что
 * сделанный нами `CreateColorway`. Версия, взятая раньше, гарантированно устарела бы о нашу же
 * первую половину — то есть каждый confirm отвечал бы 409 на собственный второй шаг.
 *
 * ⚠ ОТКАТА У ПОЛОВИНЫ НЕТ, И ОН ЗДЕСЬ БЫЛ БЫ ХУЖЕ САМОЙ ПОЛОВИНЫ. Упавший второй шаг оставляет
 * СОЗДАННЫЙ колорвей без рецепта; удалять его в ответ значило бы стирать продукт из-за сетевой
 * ошибки. Поэтому квитанция говорит правду обеими половинами и уводит доделать рецепт руками.
 */
function useConfirmColourway(techCardId: number) {
  const create = useCreateColorway(techCardId);
  const recipe = useUpdateColorwayRecipe(techCardId);
  const qc = useQueryClient();

  async function confirm(p: ProposedColourway, bound: BoundSlot[]): Promise<ColourwayVerdict> {
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
    const colorwayId = res?.colorwayId ?? 0;
    if (!colorwayId) throw new Error('the server created no colourway id');
    if (usages.length === 0) return { status: 'confirmed', colorwayId };
    try {
      const fresh = await adminService.GetTechCard({ id: techCardId, vatCountryCode: undefined });
      const ref = fresh.techCard?.colorways?.find((c) => c.colorwayId === colorwayId);
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

export function ColourwayProposals({
  techCardId,
  readOnly,
}: {
  techCardId: number;
  readOnly: boolean;
}): JSX.Element | null {
  /* ⚠ ЧИТАЕТСЯ ТОЛЬКО `isDirty`, И ЭТО ПОДПИСКА, А НЕ ПРОСМОТР: прокси `useFormState` подписывает
     на прочитанные свойства, и один булев переключается редко. Читает его ОРГАН, а не композитор,
     и это довод про место: подписка обязана жить там же, где её единственный потребитель, — иначе
     первая клавиша на карточке перерисовывала бы всю стопку STUDIO ради ворот одной кнопки.
     Сами ворота — `confirmRefusal` в `colourway-proposals-model.ts`. */
  const { control } = useFormContext<TechCardFormData>();
  const { isDirty: dirty } = useFormState({ control });
  const { proposals, verdicts } = useCardMemory(techCardId);
  const setVerdict = useDraftMemory((s) => s.setVerdict);
  const patchProposal = useDraftMemory((s) => s.patchProposal);
  const patchSlot = useDraftMemory((s) => s.patchSlot);
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const { data: techCard } = useTechCard(techCardId);
  const { confirm, pending } = useConfirmColourway(techCardId);
  const [busy, setBusy] = useState<string | null>(null);
  const [, setParams] = useSearchParams();

  const savedSlots = useMemo(
    () => (techCard?.techCard?.bomItems ?? []).map((b) => ({ name: b.name, lineKey: b.lineKey })),
    [techCard?.techCard?.bomItems],
  );
  const usedCodes = useMemo(
    () => new Set((techCard?.colorways ?? []).map((c) => c.colorCode ?? '').filter(Boolean)),
    [techCard?.colorways],
  );
  /**
   * ═══ ВЫБРАННОЕ ЗНАЧЕНИЕ ОБЯЗАНО БЫТЬ СРЕДИ ПУНКТОВ — ВСЕГДА, БЕЗ ИСКЛЮЧЕНИЙ ═══════════════
   *
   * Список — ЖИВОЙ КАТАЛОГ, а `colorCode` предложения — то, что сервер сверил со словарём В МОМЕНТ
   * ПРОГОНА. Между прогоном и этим экраном цвет успевают снять в архив, и тогда пункта у него нет:
   * триггер рисуется ПУСТЫМ («— select colour —»), а в сторе лежит код, и ворота, спрашивающие
   * только `!colorCode`, пропускают `CreateColorway` с цветом, которого экран не показывает.
   * Продукт заводится с невидимым цветом, и узнаётся это уже на вкладке COLORWAYS.
   *
   * ЛЕЧИТСЯ ТЕМ ЖЕ, ЧЕМ У СОСЕДА (`pattern/pattern-library.tsx`, «носимый архивный остаётся в
   * списке, а сирота дописывается своим пунктом»), И ДОВОД ТОТ ЖЕ И ДВОЙНОЙ:
   *   (а) ДОСТИЖИМОСТЬ: спрятав имя, мы спрятали бы ровно то, что человек пришёл поправить;
   *   (б) КОНСТРУКЦИЯ ВМЕСТО ОБЕЩАНИЯ: значение среди пунктов держится построением списка, а не
   *       тем, что «архивных не бывает».
   *
   * ЧТО ЗДЕСЬ У́ЖЕ, ЧЕМ У СОСЕДА, И ПОЧЕМУ. Там список — выбор привязки, и архивный носимый пункт
   * ВЫБИРАЕМ. Здесь список — выбор цвета БУДУЩЕГО ПРОДУКТА, а новая работа под снятым именем —
   * ровно то, что архив закрывает; поэтому такой пункт стоит `disabled` и НАЗЫВАЕТ факт, а ворота
   * ниже отказывают словами. Показать и не дать — это не полумера, а две разные обязанности:
   * первая перед глазами, вторая перед сервером.
   *
   * КЛЮЧ БЕРЁТСЯ У ВСЕХ ПРЕДЛОЖЕНИЙ СРАЗУ (`held`), а не у одного: список тут один на блок, а
   * предложений до четырёх, и мемо на каждое строило бы четыре каталога ради одной строки.
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

  // ⚠ БЛОКА НЕТ ВОВСЕ, ПОКА ЕМУ НЕЧЕГО СКАЗАТЬ, И ВОЗВРАТ СТОИТ ВЫШЕ `Section` ИМЕННО ПОЭТОМУ.
  // Пустое состояние здесь было бы обещанием экрана, который появляется только после платного
  // прогона: рамка с подписью «колорвеев не предложено» стоит на карточке всегда и учит, что
  // кнопка сломана. Вместе с блоком уходит и отступ — стопка STUDIO разделяет соседей полем
  // грунта, а не правилом, и несмонтированный ребёнок не оставляет в ней дыры.
  const visible = proposals.filter((p) => verdicts[p.id]?.status !== 'dismissed');
  if (visible.length === 0) return null;

  const goToColorways = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'colorways');
        next.delete('sample');
        next.delete('fits');
        return next;
      },
      { replace: true },
    );

  return (
    <Section
      title='colourways'
      question='— proposed by the draft; a confirmed one lives on the COLORWAYS tab'
    >
      <div data-b25-colourways=''>
        {visible.map((p) => {
          const verdict = verdicts[p.id];
          const bound = bindSlots(p.slots, savedSlots);
          const boundCount = bound.filter((s) => !!s.bomLineKey).length;

          if (verdict?.status === 'confirmed') {
            return (
              <div
                key={p.id}
                className='mt-1.5 flex flex-wrap items-baseline gap-2 border-b border-hairline py-1'
                data-b25-receipt={p.id}
              >
                <Text size='micro' component='span' className='uppercase'>
                  {p.name || p.colorCode}
                </Text>
                <Pill tone='ok'>confirmed</Pill>
                {verdict.recipeFailed && (
                  <Text size='nano' variant='label' component='span'>
                    colourway created · recipe not saved — {verdict.recipeFailed}
                  </Text>
                )}
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  className='ml-auto'
                  data-b25-go={p.id}
                  onClick={goToColorways}
                >
                  see it on COLORWAYS ▸
                </Button>
              </div>
            );
          }

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
            boundCount,
          });

          return (
            <div key={p.id} className='mt-2' data-b25-cw={p.id}>
              <div className='flex flex-wrap items-end gap-2'>
                <label className='flex min-w-0 flex-1 flex-col gap-0.5'>
                  <Text size='micro' variant='label' component='span' className='uppercase'>
                    name
                  </Text>
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
                      onChange={(e) => patchProposal(techCardId, p.id, { colorCode: e.target.value })}
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
                      {/* СИРОТА — СВОИМ ПУНКТОМ, И ЭТО НЕ КОСМЕТИКА: без него у селекта нет пункта
                          под своё же значение, триггер пуст, а код лежит в сторе и уезжает на
                          сервер. Пункт показывает ровно то, что лежит, — и называет, что этого
                          кода в словаре больше нет. */}
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
                          const v = await confirm(p, bound);
                          setVerdict(techCardId, p.id, v);
                          showMessage(
                            v.status === 'confirmed' && v.recipeFailed
                              ? 'colourway created — its recipe did not save'
                              : 'colourway created',
                            v.status === 'confirmed' && v.recipeFailed ? 'error' : 'success',
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

              {bound.map((s, i) => (
                <div
                  key={`${p.id}:${s.slot}`}
                  className='flex flex-wrap items-center gap-2 border-b border-hairline py-1'
                  data-b25-slot={`${p.id}:${s.slot}`}
                  data-bound={s.bomLineKey ? 'yes' : 'no'}
                >
                  <Text
                    size='nano'
                    variant='label'
                    component='span'
                    className='w-28 shrink-0 truncate'
                  >
                    {s.slot}
                  </Text>
                  <Swatch hex={s.hex || undefined} title={s.pantone || undefined} />
                  <Input
                    className='w-32'
                    value={s.pantone}
                    maxLength={64}
                    disabled={readOnly}
                    placeholder='pantone'
                    data-b25-pantone={`${p.id}:${s.slot}`}
                    onChange={(e: { target: { value: string } }) =>
                      patchSlot(techCardId, p.id, i, { pantone: e.target.value })
                    }
                  />
                  <Input
                    className='w-32'
                    value={s.colour}
                    maxLength={64}
                    disabled={readOnly}
                    placeholder='colour'
                    data-b25-colour={`${p.id}:${s.slot}`}
                    onChange={(e: { target: { value: string } }) =>
                      patchSlot(techCardId, p.id, i, { colour: e.target.value })
                    }
                  />
                  {/* НЕ ПРИВЯЗАННЫЙ СЛОТ НАЗЫВАЕТСЯ, А НЕ ПРЯЧЕТСЯ. Он не поедет в рецепт, и человек
                      обязан знать, ПОЧЕМУ: имени такого слота на СОХРАНЁННОЙ карточке нет. Тихо
                      выброшенная строка выглядела бы как потерянный цвет. */}
                  {!s.bomLineKey && <Pill tone='mut'>not on the card</Pill>}
                </div>
              ))}
              <Text size='nano' variant='label' component='p' data-b25-bound={p.id}>
                {boundCount} of {bound.length} slot{bound.length === 1 ? '' : 's'} bound to the saved
                card
              </Text>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
