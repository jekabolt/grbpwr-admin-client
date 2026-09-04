import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useAllModels } from 'components/managers/models/components/useModelQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo, useState, type JSX } from 'react';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import SelectComponent from 'ui/components/select';
import { ViewSwitch } from 'ui/components/view-switch';

import { useCardFit, useThreedDraft } from './drafts';
import { FieldRow, Hint } from './field-row';
import { GenerateRow, LockBar } from './generate-row';
import {
  PRESENTATIONS,
  fitChoices,
  threedGate,
  threedRunViews,
  threedSides,
  turntableSourceIds,
  type Gate,
  type Presentation,
} from './model';
import { BodyPicker } from './model-picker';
import { OutputsSection } from './outputs';
import { ThreedInputStrip } from './threed-input-strip';
import { useStartDesignRun } from './use-design-run';
import { WhatModelGetsRenderModal } from './what-model-gets';

/**
 * THE 3D STUDIO — the turntable, and the four sides it is turned from.
 *
 * 3D IS BUILT FROM THE RENDERS, NOT FROM THE DRAWINGS. That single sentence is the whole shape of
 * this screen: its input strip lists RENDERS by view, not flats, and the screen is locked until the
 * FRONT is marked and every marked side comes from ONE revision. The second half of that condition
 * is the one worth stating out loud — sides of different revisions are different colours, and a
 * model stitched out of them looks right up until somebody notices the back is the wrong green.
 *
 * ⚠ «СТОРОНА» — ЭТО СЛОТ ВЕРСТАКА, А НЕ «ПОСЛЕДНИЙ РЕНДЕР» (V-14). Экран считал вход сам, из ленты
 * прогонов, а сервер собирал тот же прогон из слотов `kind: render` — два списка без единого общего
 * писателя. Полоса входа теперь показывает ровно тот верстак, который читает сервер, и marking в
 * неё — явный жест человека; довод целиком в `./threed-input-strip.tsx`.
 *
 * «ON A MODEL» IS A WINDOW INTO AN EXISTING DICTIONARY. The models are the admin's own fit-model
 * profiles (`ListModels`), not a second list invented for this menu — and they are picked BY THEIR
 * PHOTOGRAPH (V-15), on the same `Tile` the models manager draws them with. Beside them stands the
 * other half of the same question, the BUILD: a person names a model when they know whose
 * photographs they want and a build when they only know the shape, and a run may state both.
 *
 * LOCKED IS A STATE OF THE SCREEN, NOT ITS ABSENCE. A missing side draws a dashed cell that says
 * `required · blocks 3D` and offers the way out, and the bar under the strip names what is
 * missing. A technologist must be able to see why 3D is not available without pressing anything.
 *
 * ⚠ ОБЯЗАТЕЛЬНА ОДНА СТОРОНА — ФРОНТ (K-10/K-11). Четыре требовались, пока это был поворотный
 * стол; `multi-view-to-3d` строит объём из ВИДОВ, и бесплатный отказ провайдера ставится ровно на
 * отсутствие фронта. Остальные три делают объём лучше и названы поощрением, а не условием.
 *
 * THE FIT OVERRIDE IS A STATED DEVIATION. It applies to this submission only, and the contract
 * stamps whatever it produces — the card stays the single place of truth about the garment's
 * fit, which is why the override is worded as a badge rather than as a setting.
 *
 * ЗУМ ЗДЕСЬ ТОТ ЖЕ, ЧТО ВЕЗДЕ (T-8): плита объявляет кадр (`gallery`), а ряд собирает и показывает
 * общий `PictureGalleryProvider` студии. Своего просмотрщика этот экран не держит.
 */

/** Radix forbids an empty item value, so every «nothing chosen» option here is a sentinel. */
const CARD_FIT = '__card__';
const NO_SIZE = '__nosize__';

export function ThreedStudio({
  band,
  techCardId,
  disabled,
  /**
   * Switch the band's strip to another representation — what the input strip's `ask for it ▸` and
   * the doors of the lock bar do. The studio does not own the strip, so when the composer does not
   * hand this in the doors become inert WITH THEIR REASON rather than vanishing.
   */
  onGoToKind,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  onGoToKind?: (kind: 'flat' | 'render') => void;
}): JSX.Element {
  /**
   * ═══ СКОУП СБОРКИ — ПОСТОЯННЫЙ НОЛЬ ПОСЛЕ E-16 ═══════════════════════════════════════════
   *
   * До J-27 колорвей выбирали ЗДЕСЬ; владелец пикер снял, и осталось чтение общего состояния
   * студии. Кругом 16 он снял и само состояние («в GENERATION — FABRIC RENDER мы полностью
   * убираем колорвеи»), поэтому проп `colorway` ушёл вместе с ним.
   *
   * ⚠ ЭТО ЗНАЧЕНИЕ НЕСУЩЕЕ, И ИМЕННО ПОЭТОМУ ОНО НОЛЬ. Оно адресует верстак, который прочитает
   * сервер (`designSelectBench`) и по членству в котором откроется дверь (`no_fabric_render`).
   * FABRIC RENDER теперь пишет ТОЛЬКО безколорвейный верстак — значит читать здесь любой другой
   * значило бы показывать пустой вход над карточкой с готовыми рендерами и отправлять прогон,
   * собранный из пустоты. Одно число на обе половины, потому что выбора больше нет вовсе.
   */
  const colorwayId = 0;
  const colorwayName = '';
  const { draft, patch } = useThreedDraft();
  const cardFit = useCardFit();
  const { dictionary } = useDictionary();
  const { data: models, isLoading: modelsLoading } = useAllModels();
  const run = useStartDesignRun(techCardId);
  /** The prompt inventory. A modal is its own surface, so it is mounted beside the blocks. */
  const [inspecting, setInspecting] = useState(false);

  const sides = useMemo(() => threedSides(band, colorwayId), [band, colorwayId]);

  const sizes = dictionary?.sizes ?? [];
  const sizeName = (id: number) =>
    (sizes.find((s) => s.id === id)?.name ?? '').trim() || (id ? `size ${id}` : '');

  /**
   * ДВА ОТКАЗА, А НЕ ОДИН, И РАЗНИЦА НЕ СЛОВЕСНАЯ: `input` — про то, чего не хватает НА ВХОДЕ (его
   * полоса стоит под входом, где глаз), `gate` — весь отказ целиком, включая вопросы меню, и его
   * читает кнопка. Одной полосой они выглядели бы одинаково и стояли бы не там: «pick a body» под
   * полосой картинок — это указание не на тот орган.
   */
  const input: Gate = useMemo(
    () => threedGate(band, colorwayId, colorwayName),
    [band, colorwayId, colorwayName],
  );

  const gate: Gate = useMemo(() => {
    const base = input;
    if (!base.ok) return base;
    if (draft.presentation === 'model') {
      // ОДИН ВОПРОС — «на каком теле», — и ответить на него можно ЛЮБОЙ из двух половин. Требовать
      // именно строку картотеки значило бы отказывать в законном прогоне «на атлетичном теле,
      // человек не важен», который контракт разрешает прямым текстом.
      if (!draft.modelId && !draft.bodyType) {
        return {
          ok: false,
          reason:
            'say what body it sits on — pick one of our models, or name a build; or turn it in the air instead',
        };
      }
      if (!draft.garmentSizeId) {
        return {
          ok: false,
          reason: 'pick which garment size sits on that body — a fit on a figure has to name one',
        };
      }
    }
    return { ok: true };
  }, [input, draft.presentation, draft.modelId, draft.bodyType, draft.garmentSizeId]);

  /**
   * ЧТО БУДЕТ КУПЛЕНО — В ЧИСЛЕ ВИДОВ, А НЕ КАДРОВ (K-11). «12 frames» описывало поворотный стол,
   * которого больше нет; покупается ОДИН объём, собранный из отмеченных сторон, и единственное
   * число, которое человеку тут полезно, — сколько сторон он в него положил.
   */
  const marked = useMemo(() => threedRunViews(sides), [sides]);
  const shape =
    marked.length === 1
      ? '1 model · from the front alone'
      : `1 model · from ${marked.length} marked sides`;

  const fitOptions = useMemo(() => fitChoices(cardFit), [cardFit]);

  const generate = () => {
    const sourcePictureIds = turntableSourceIds(sides);
    // The gate already refuses an incomplete set; this is the second, cheap guard, because sending
    // a turntable with no sources would freeze a run nobody can ever read back.
    if (!sourcePictureIds.length) return;
    run.start({
      kind: 'threed',
      ask: '',
      params: {
        // ТОЛЬКО ОТМЕЧЕННЫЕ СТОРОНЫ. Здесь стоял полный список четырёх видов — заявление, что
        // прогон просит все четыре, — и оно перестало быть правдой, когда обязательным остался
        // один фронт: `views` замораживается в истории как «что просили», и четыре вида над двумя
        // плитами были бы записью о запросе, которого не было.
        views: marked,
        // Деталей этот прогон не просит, и список пуст ЯВНО: сервер сверяет его длину с числом
        // элементов `detail` в `views`, и «поле не задано» здесь означало бы то же, что пустой
        // список, только молча.
        detailSlotIds: [],
        // КОЛОРВЕЙ СБОРКИ (L-3). Сервер читает ТОЛЬКО верстак этого колорвея (`designSelectBench`)
        // и отказывает прогону, чей колорвей не значится в `render_bench_colorway_ids`. `0` —
        // безколорвейный верстак: легаси-карточка собирается ровно как вчера, и смеси колорвеев
        // не бывает ни при каком значении поля.
        colorwayId,
        layout: '',
        colour: undefined,
        threed: {
          // ЯВНЫЙ НОЛЬ — «не сказано» (K-11). Поле контракта живо, органа за ним больше нет, и
          // отправлять 12 после того, как никто не поворачивает вещь на 12 кадров, значило бы
          // заморозить в истории число, которого никто не просил.
          frames: 0,
          presentation: draft.presentation,
          modelId: draft.presentation === 'model' ? draft.modelId : 0,
          garmentSizeId: draft.presentation === 'model' ? draft.garmentSizeId : 0,
          fitOverride: draft.fitOverride,
          // ТЕЛОСЛОЖЕНИЕ — ВЫБОР ЧЕЛОВЕКА, А НЕ ЗАГЛУШКА (V-15). Пустая строка на проводе читается
          // ровно как «не сказано»: генератор тогда выбирает сам. Как и `model_id`, оно принадлежит
          // подаче на фигуре — «в воздухе» тела нет, и говорить о его форме было бы ложью в
          // замороженной истории.
          bodyType: draft.presentation === 'model' ? draft.bodyType : '',
          sourcePictureIds,
        },
        fixTarget: '',
        extraInputMediaIds: [],
        // NOT A FIX, AND SAID EXPLICITLY IN BOTH SPELLINGS. `fix_target` is the frozen scalar the
        // history already states; `fix_targets`/`fix_slot_ids` are the selection a new run uses.
        // Empty in all three is «this run corrects nothing», which is what these two screens do.
        fixTargets: [],
        fixSlotIds: [],
        // `auto_split` is only meaningful with layout = one, and neither of these screens produces
        // a composite: a render comes back one picture per filled slot, a turntable frame by frame.
        autoSplit: false,
        pattern: undefined,
        useFlatSlots: false,
        // Поле НАРАЩИВАЕТ `use_flat_slots` и осмысленно только на kind=flat; здесь оно ИГНОРИРУЕТСЯ
        // сервером, а пустой список и так значит «все заполненные». Стоит явно, потому что
        // контракт требует назвать поле, а не потому, что этому прогону есть что им сказать.
        flatSlotIds: [],
      },
    });
  };

  return (
    <>
      {/* ═══ У ПОЛОСЫ СНОВА ЕСТЬ ОДНА ЗАПИСЬ, И ЭТО СЛОВО ВЛАДЕЛЬЦА (E-6) ═══════════════════════
          Здесь стояла записка «`techCardId` и `disabled` больше не передаются»: полоса была
          ЗЕРКАЛОМ верстака (J-26), у неё не осталось ни одной записи, и карточка, которую нечем
          править, не нуждалась в слове «read-only».

          Владелец: «в 3д INPUT — RENDERS BY VIEW мультивью карточек тоже должно отображаться и
          если его расколапсить под мультивью кнока аплай сплитед и они уходят в инпут». Это
          ЗАПИСЬ, и она возвращает пропы.

          ⚠ ЧЕГО J-26 БОЯЛСЯ И ПОЧЕМУ ЭТОГО БОЛЬШЕ НЕТ. Он боялся ВТОРОГО ПИСАТЕЛЯ ОДНОГО СЛОТА на
          двух вкладках: два экрана, две прочитанные полосы, два CAS-токена одной строки и ДВА
          РАЗНЫХ СКОУПА — тот колорвей, что выбран здесь, и тот, что выбран там. Третьего из
          четырёх больше не существует: колорвей снят со всей студии (E-1/E-16), и обе вкладки
          адресуют ОДИН верстак, `0`. Остальные три — обычная цена любых двух писателей, и обе
          записи идут одним и тем же вызовом одной и той же функции (`ApplySplitDoor`), а не
          двумя похожими. */}
      <ThreedInputStrip
        band={band}
        techCardId={techCardId}
        disabled={disabled}
        lock={input}
        onGoToKind={onGoToKind}
        colorwayId={colorwayId}
        colorwayLabel={colorwayName}
      />

      <Section
        title='generation — 3D'
        question='— what body it sits on, and how it is worn'
        /* ОБЪЯВЛЕННЫЙ ЯКОРЬ МЕНЮ — тем же приёмом, что `id='design-bench'` у верстака. Проба
           утверждает ОТСУТСТВИЕ органа («в этом меню нет выбора колорвея»), а утверждение об
           отсутствии обязано быть скоуплено объявленной коробкой: без скоупа оно одинаково
           зеленело бы и на снятом органе, и на пробе, смотрящей не туда. Класс для этого не
           годится — он переживает правку смысла. */
        id='design-threed-generation'
      >
        {/* ═══ ПИКЕР КОЛОРВЕЯ СНЯТ (J-27) ══════════════════════════════════════════════════════
            Владелец, дословно: «GENERATION — 3D не должно быть поля колорвей тк мы и так уже туда
            передаем все что нужно в такой ткани как нужно все готово для рендера».

            И это правда РОВНО В ТОМ СМЫСЛЕ, в каком он её говорит: ткань в 3D-прогон уезжает
            ПИКСЕЛЯМИ — четырьмя рендерами верстака, — а `colorway_id` до модели не доходит ни
            одним байтом (`Job.SurfaceSteer` собирается из `p.Colour` и подачи, и колорвея в нём
            нет). То есть поле спрашивало про выбор, которого прогон не делает.

            ⚠ ЗНАЧЕНИЕ ПРИ ЭТОМ ОСТАЁТСЯ, И СНЯТЬ ЕГО БЫЛО НЕЛЬЗЯ. `colorway_id` решает ДВЕ вещи,
            обе денежные: какой верстак сервер прочитает (`designSelectBench`) и по членству в
            каком множестве откроется дверь (`no_fabric_render`, бесплатный отказ ДО резерва).
            Прибить его нулём значило бы убить 3D на всякой карточке, чьи рендер-слоты лежат под
            колорвеем. Поэтому уходит ОРГАН, а на проводе — ноль изменений: то же `colorwayId`
            скоупа студии, только теперь у него один источник и разъехаться ему не с чем.

            ⚠ И МОЛЧАНИЯ ИЗ ЭТОГО НЕ ВЫШЛО. Прогон стоит $1.20, и экран, не называющий, ИЗ ЧЕГО
            он собирается, продавал бы сборку вслепую. Название верстака осталось там, где стоит
            сам верстак, — в вопросе полосы входа над этой секцией («the render bench of ROSSO»).
            Это УТВЕРЖДЕНИЕ о том, что уедет, а не поле выбора; сменить колорвей по-прежнему можно
            на FABRIC RENDER, где меняются и сами слоты. */}
        {/* ТОЛЬКО ПРИЧИНЫ МЕНЮ: то, чего не хватает на входе, уже названо под входной полосой, и
            повторять это здесь значило бы показать один отказ дважды. */}
        {input.ok && !gate.ok && <LockBar reason={gate.reason} />}

        <FieldRow label='presentation'>
          {/* A SEGMENTED STRIP, NOT A SELECT. Both options are on screen at all times, so the strip
              states where you are rather than naming where you could go. */}
          <ViewSwitch<Presentation>
            className='shrink-0'
            label='presentation'
            value={draft.presentation}
            disabled={disabled}
            options={PRESENTATIONS.map((p) => ({ value: p.value, label: p.label }))}
            onChange={(next) => patch({ presentation: next })}
          />
          <Hint>
            {draft.presentation === 'model'
              ? 'a figure wears it — say whose body, or what build, below'
              : 'no figure — the garment stands alone'}
          </Hint>
        </FieldRow>

        {/* ТЕЛО И РАЗМЕР ПОКАЗЫВАЮТСЯ ТОЛЬКО ДЛЯ «ON A MODEL». Пикер фигуры, которой нет в кадре, —
            орган без действия, а снимок прогона заморозил бы модель, которой никто не пользовался. */}
        {draft.presentation === 'model' && (
          <>
            <FieldRow label='the body' className='items-start'>
              <BodyPicker
                models={models}
                loading={modelsLoading}
                modelId={draft.modelId}
                bodyType={draft.bodyType}
                sizeName={sizeName}
                disabled={disabled}
                onModel={(id) => patch({ modelId: id })}
                onBodyType={(value) => patch({ bodyType: value })}
              />
            </FieldRow>

            <FieldRow label='garment size'>
              <div className='w-[130px] shrink-0'>
                <SelectComponent
                  name='design-threed-size'
                  value={draft.garmentSizeId ? String(draft.garmentSizeId) : NO_SIZE}
                  placeholder='which size'
                  disabled={disabled}
                  items={[
                    { value: NO_SIZE, label: '— size —' },
                    ...sizes
                      .filter((s) => (s.id ?? 0) > 0)
                      .map((s) => ({
                        value: String(s.id),
                        label: `size ${(s.name ?? '').trim() || s.id}`,
                      })),
                  ]}
                  onValueChange={(value: string) =>
                    patch({ garmentSizeId: value === NO_SIZE ? 0 : Number(value) || 0 })
                  }
                  fullWidth
                />
              </div>
              <Hint>
                how it SITS: this garment size on that body — free to try, changes nothing on the
                card
              </Hint>
            </FieldRow>
          </>
        )}

        <FieldRow label='fit'>
          <div className='w-[210px] shrink-0'>
            <SelectComponent
              name='design-threed-fit'
              value={draft.fitOverride || CARD_FIT}
              placeholder={`card · ${cardFit || 'not stated'}`}
              disabled={disabled}
              items={[
                { value: CARD_FIT, label: `card · ${cardFit || 'not stated'}` },
                ...fitOptions.map((fit) => ({ value: fit, label: fit })),
              ]}
              onValueChange={(value: string) =>
                patch({ fitOverride: value === CARD_FIT ? '' : value })
              }
              fullWidth
            />
          </div>
          {draft.fitOverride ? (
            <Pill tone='attention'>≠ card — the result will carry the badge</Pill>
          ) : (
            <Pill>from classification</Pill>
          )}
          <Hint>
            a one-run override for this submission only — the card stays the single place of truth
          </Hint>
        </FieldRow>

        <GenerateRow
          gate={gate}
          shape={shape}
          pending={run.isPending}
          disabled={disabled}
          onGenerate={generate}
          onInspect={() => setInspecting(true)}
        />
      </Section>

      {/* The turntables this page of the band holds — the outputs, where the mark «chosen» lives
          and is SET (W-12). One shared section with FABRIC RENDER; see `./outputs`. */}
      <OutputsSection
        band={band}
        techCardId={techCardId}
        kind='threed'
        disabled={disabled}
        colorwayId={colorwayId}
        colorwayLabel={colorwayName}
      />

      <WhatModelGetsRenderModal
        open={inspecting}
        onOpenChange={setInspecting}
        band={band}
        kind='threed'
        threed={draft}
        cardFit={cardFit}
        models={models}
        sizeName={sizeName}
        colorwayId={colorwayId}
        colorwayLabel={colorwayName}
      />
    </>
  );
}
