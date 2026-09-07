import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';

import { ASSETS_PER_CARD_MAX, ASSET_PATTERN } from '../assets/model';
import { useAssetWrites } from '../assets/use-assets';
import { serverSpeaksDesign } from '../capability';
import { Counter, GROUP_GAP, Money, Reason } from '../core';
import { stepById } from '../core/chain';
import { isRunLive } from '../generation';
import { GenerateRow, RunRefusal } from '../render/generate-row';
import { useStartDesignRun } from '../render/use-design-run';
import { PatternColourRow } from './colourways';
import {
  nextPatternName,
  patternColourRecipe,
  patternGate,
  patternRuns,
  recentPatternColours,
  refusalAdvice,
  shelfIsFull,
  type PatternColour,
} from './model';
import { PatternInput } from './pattern-input';
import { PatternLibrary } from './pattern-library';

/**
 * ═══ STEP 3 · PATTERN — ONE BLOCK: the input, the colour, the run, the shelf ═══════════════════
 *
 * The screen of the prototype (`_step-pattern.js`), in the product's skin. ONE `Section`
 * titled `PATTERN · a repeating tile`, its sub-structure drawn with `GroupLabel` rules and never
 * with a second box; the generation history stands as its own block after it (mounted by the
 * studio, shared with every generative step).
 *
 *   SOURCE PICTURE   the cell on the left (one picture, exactly) · NAME * on the right
 *   COLOUR           one door `+ colour` (the product's pantone picker) · the recent colours of
 *                    this card's own runs · the pick standing as ONE tile with `✕`
 *   the run          GENERATE (dimmed, with its reason, until the gate opens) · the money line
 *   TILES ON THIS CARD   the shelf; and under it MADE EARLIER, NOT KEPT when there is such a thing
 *
 * ═══ THE CONTRACT OF CREATION — three fields, and each knows whether it TRAVELS ══════════════════
 *
 *     picture   required, exactly one   INPUT of the run   (the gate)
 *     name      REQUIRED, unique        NOT SENT           (the name is yours, not the model's)
 *     colour    optional                INPUT of the run   (it paints the tile itself)
 *
 * ⚠ ТРИ ПИЛЮЛИ, КОТОРЫЕ ЭТО ОБЪЯВЛЯЛИ, СНЯТЫ (владелец, r3 пп.12 и 14): `in the prompt` на
 * заполненной ячейке, `not sent` под именем и `goes to the model` на линейке цвета. Сведения не
 * потеряны — они переехали туда, где на них смотрят: под именем стоит одна серая строка, а цвет
 * признаётся кодом на самой выбранной плитке. Сам факт при этом не меняется: цвет едет как
 * `params.colour` — тем же полем, каким называет свой цвет рендер, и сервер пишет его в промпт
 * любого рода (`designgen/snapshot.go`), так что выбранный цвет есть факт оплаченного прогона.
 *
 * ═══ NO COLOURWAY ON CREATION (owner, E-1) — and no prompt inventory door (owner) ═════════════
 *
 * ⚠ И НА ПОЛКЕ ТОЖЕ БОЛЬШЕ НЕТ КОЛОРВЕЯ (владелец, r3 п.18: «TILES ON THIS CARD: никакой связи с
 * колорвеями — убрать WORN BY и NOT BOUND»). Ряд чипов `worn by` под каждой плиткой и пилюля
 * `not bound` сняты вместе с вызовом `SetDesignAssetColorway`: связь плитки с колорвеем решается
 * на оси колорвеев, а не на экране, где плитку делают. `what the model gets ▸` на этом шаге не
 * рисуется по решению владельца: всё, что уезжает, — два органа, стоящих на этом экране.
 *
 * ⚠ И ЦВЕТ ТЕПЕРЬ ТОЖЕ НЕ КОЛОРВЕЙ (владелец, r2 §26: «выбор цвета, который нас ни к чему не
 * обязывает»). Ряд COLOUR читал КОЛОРВЕИ КАРТОЧКИ — то есть на карточке без колорвеев он показывал
 * пустоту с дверью на соседний шаг, и покрасить пробную плитку было нельзя, не заведя запись о
 * продукте. Цвет — ничья пара «код + hex» (`PatternColour`), выбирается пантон-пикером продукта и
 * живёт ровно один прогон. `usePatternColourways` больше не зовётся отсюда вовсе: он стоял ради
 * полки, а полка колорвеев не знает (п.18) — то есть экран перестал ходить в `GetTechCard`.
 *
 * ═══ NOTHING HERE OWNS A SAVE. A named run lands on the shelf by itself (`keepPatternTx`). ═════
 */
export function PatternStudio({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const run = useStartDesignRun(techCardId);
  const { upsertAsset } = useAssetWrites(techCardId);
  const speaks = serverSpeaksDesign();
  const [source, setSource] = useState<common_MediaFull | null>(null);
  const sourceId = source?.id ?? 0;
  const [name, setName] = useState('');
  /* ЦВЕТ НИЧЕЙ (владелец, r2 §26): пара «код + hex», а не ссылка на колорвей карточки. `null` —
     законное и обычное состояние: плитка генерится и без цвета. */
  const [colour, setColour] = useState<PatternColour | null>(null);
  /**
   * ═══ ЧЬЮ ПЛИТКУ ОТКРЫТЬ НА ПЕРЕИМЕНОВАНИЕ, КОГДА ОНА ПРИЕДЕТ С ПОЛОСОЙ ═══════════════════════
   *
   * Состояние жило ВНУТРИ `PatternLibrary` и обслуживало одну дверь — `keep it`. Теперь тем же
   * жестом («картинка уже есть, заведи её плиткой») пользуется нижняя половина ячейки, стоящая в
   * ДРУГОМ поддереве, и второй такой счётчик рядом с первым — это два ответа на вопрос «какую
   * плитку сейчас переименовывают»: один из них молча проиграл бы. Поэтому ответ один и лежит
   * там, где обе двери его видят.
   */
  const [renameMedia, setRenameMedia] = useState(0);
  /**
   * ОТКАЗ ПОСАДКИ — СВОИМ СОСТОЯНИЕМ, А НЕ `upsertAsset.isError`, И РАЗНИЦА В ЖИЗНИ, А НЕ В ФОРМЕ.
   * Ошибка react-query живёт до СЛЕДУЮЩЕЙ мутации, а `PatternStudio` при смене карточки не
   * размонтируется (инвариант 12): отказ по чужому снимку карточки A стоял бы под ячейкой
   * карточки B, где ему нечего объяснять. Здесь он гаснет вместе со всей заготовкой.
   */
  const [fileRefusal, setFileRefusal] = useState('');

  /**
   * ═══ КАРТОЧКА СМЕНИЛАСЬ — ЗАГОТОВКА ПРОГОНА НАЧИНАЕТСЯ ЗАНОВО ═════════════════════════════
   *
   * ⚠ СБРОСА ЗДЕСЬ НЕ БЫЛО ВОВСЕ, И ЭТО СТОИЛО БЫ ДЕНЕГ. Три состояния выше — заготовка ПЛАТНОГО
   * прогона, а `PatternStudio` не ключуется `techCardId` и `StudioTab` при смене карточки не
   * размонтируется (инвариант 12). Картинка-источник, имя и цвет карточки A встают на экран
   * карточки B, ворота открываются, и GENERATE уходит с ЧУЖИМ входом — плитка из чужого снимка,
   * под чужим именем, на счёт этой карточки. Имя вдобавок проверяется на двойника по `band`
   * ТЕКУЩЕЙ карточки, так что «имя занято» ловилось бы не там, где имя занято.
   *
   * ⚠⚠ ПРОВЕРЯТЬ ЭТО НА ХОЛОДНОЙ КАРТОЧКЕ БЕСПОЛЕЗНО, И ИМЕННО ТАК ЭТОТ СБРОС СНЕСУТ. У карточки,
   * которую в этой сессии ещё не открывали, `useDesignBand` отдаёт `isLoading: true`, `StudioTab`
   * подменяет весь шаг на «loading…» (`decided !== 'card' && techCardId && isLoading`), и блок
   * размонтируется САМ — состояние пропадает без всякого сброса. Опасен обычный ход человека
   * «A → B → A»: у уже посещённой карточки данные в кэше, `isLoading` ложно, экран не
   * подменяется, узел живёт. ЗАМЕРЕНО на стенде: сцена E в `probe-pattern.mjs` прогревает обе
   * карточки и без этих трёх строк показывает имя и цвет карточки 7 на карточке 8 при
   * `sameNode: true`.
   *
   * В ТЕЛЕ РЕНДЕРА, А НЕ В ЭФФЕКТЕ (инвариант 12): эффект оставил бы один закоммиченный кадр с
   * новой карточкой и старым входом — а один кадр это одно нажатие GENERATE. Образец —
   * `generation/generation-history.tsx` (`shownCard`).
   *
   * `wasPending` НЕ ТРОГАЕТСЯ: он про ЖИЗНЬ МУТАЦИИ, а не про карточку, и обнуление здесь
   * стёрло бы память о запросе, который ещё летит.
   */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (source) setSource(null);
    if (name) setName('');
    if (colour) setColour(null);
    /* И АДРЕС ОТКРЫТОГО ПЕРЕИМЕНОВАНИЯ ТОЖЕ: он назван МЕДИА, а полка новой карточки ищется по
       тому же числу. Оставленный, он открыл бы поле имени на чужой плитке — той, что случайно
       собрана из того же файла (один лоскут законно лежит на десяти карточках). */
    if (renameMedia) setRenameMedia(0);
    if (fileRefusal) setFileRefusal('');
  }

  /* История цвета уже лежит на проводе — она заморожена в `params.colour` прошлых прогонов. */
  const recentColours = useMemo(() => recentPatternColours(band), [band]);

  const live = useMemo(() => patternRuns(band).filter(isRunLive), [band]);
  const shelf = (band.assets ?? []).length;
  const step = stepById('pattern');

  /* THE GATE, in the order of the prototype: the source, the name, a twin of the name. The full
     shelf is NOT a gate — the run goes and is paid for, and the tile falls into «made earlier,
     not kept», where `keep it` is dimmed under its own bar.
     ⚠ ПОЛОСЫ LOCKED БОЛЬШЕ НЕТ (владелец, r3 п.16: «LOCKED “a repeating tile is made out of
     exactly one picture · + PICTURE ›” — удалить полностью»). Ворота живы и остались ОДНИ: их
     ответ носит сам `GenerateRow` — при закрытых он рисует `InertDoor` с этим же поводом в
     `title` и в `data-inert`, то есть GENERATE просто погашен, а причина стоит на нём. Полоса
     говорила третьим органом то же, что дверь и погашенная кнопка, и вела на ту же ячейку,
     которая и так стоит первой на экране. */
  const gate = patternGate(band, sourceId, name);

  /* THE NAME IS SPENT BY THE RUN: once a run has started (the mutation settled with no refusal)
     the field empties, and the next tile has to be named anew — the twin gate catches a repeat at
     once. The source stays: a second tile out of the same picture is a legitimate ask. */
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !run.isPending && !run.refusal) setName('');
    wasPending.current = run.isPending;
  }, [run.isPending, run.refusal]);

  const advice = run.refusal ? refusalAdvice(run.refusal.words) : '';

  /**
   * ═══ ГОТОВАЯ ПЛИТКА ВСТАЁТ НА ПОЛКУ БЕЗ ПРОГОНА — И ЭТО НЕ НОВЫЙ ГЛАГОЛ ═══════════════════════
   *
   * Владелец (2026-09-07): «если выбираешь из галереи, то можно добавить без генерации через AI».
   * Сервер это УМЕЕТ И УМЕЛ: `UpsertDesignAsset` с `asset_id = 0` заводит строку полки из медиа —
   * `internal/store/design/assets.go:285` (`UpsertAsset`), граница медиа отрицательная («не чужой
   * карточки», `layer.go:710`), так что ничейный файл библиотеки проходит. Ровно этим вызовом на
   * этом же экране живёт дверь `keep it` в полосе «made earlier, not kept». Второго глагола
   * заводить не надо — и не надо изобретать: `keepPatternTx` (посадка прогона) от этого пути
   * отличается только тем, что там за картинку заплачено.
   *
   * ИМЯ МИНТИТСЯ, А НЕ БЕРЁТСЯ ИЗ ПОЛЯ `NAME`, И ЭТО РЕШЕНИЕ. Поле рядом — имя БУДУЩЕГО ПРОГОНА:
   * его читают ворота GENERATE, его же прогон тратит (`setName('')` после старта). Прочитать его
   * второй дверью значило бы дать одному полю два смысла — тот самый шов, на котором в этом
   * репозитории уже разъезжались `words` и `scope_key`. Поэтому здесь тот же ход, что у `keep it`:
   * `nextPatternName` даёт свободное `pattern N`, а поле имени открывается НА САМОЙ ПЛИТКЕ, когда
   * полоса привезёт её обратно — имя спрашивается там, где его будут печатать, а не отказом над
   * дверью. Новых полей формы при этом не заводится ни одного.
   *
   * `repeatMm: 0` — «раппорт не назван», единственное честное чтение: этот снимок никто не мерил,
   * а выдуманное число уехало бы в промпт ткани как факт о ней.
   */
  const fileFromGallery = (media: common_MediaFull) => {
    const mediaId = media.id ?? 0;
    if (mediaId <= 0) return;
    setFileRefusal('');
    upsertAsset.mutate(
      {
        assetId: 0,
        kind: ASSET_PATTERN,
        name: nextPatternName(band),
        mediaId,
        repeatMm: 0,
      },
      {
        /* АДРЕС ПЕРЕИМЕНОВАНИЯ СТАВИТСЯ ПО ФАКТУ ПОСАДКИ, А НЕ ДО НЕЁ. Дверь `keep it` метит его
           заранее и может себе это позволить — она стоит НАД оплаченной картинкой, и отказ там
           почти невозможен. Здесь снимок берут из общей библиотеки, и `foreign_media` — обычный
           исход: помеченный заранее адрес пережил бы отказ и открыл бы поле имени на первой же
           плитке, собранной из того же файла. Полоса перечитывается хуком (`onSuccess:
           invalidate`) и приезжает ПОЗЖЕ этой строки, так что окна «плитка есть, метки нет» нет. */
        onSuccess: () => setRenameMedia(mediaId),
        /* ДОСЛОВНО И РЯДОМ С ДВЕРЬЮ. Всплывашку рисует сам хук; она живёт секунды, а этот отказ
           человек обязан прочитать и на него подействовать (выбрать другой снимок). */
        onError: (error: unknown) =>
          setFileRefusal(
            (error as Error)?.message?.trim() || 'the tile did not go onto the shelf',
          ),
      },
    );
  };

  /* ЧЕСТНАЯ ДВЕРЬ ИЛИ НИКАКОЙ: половина гаснет ровно там, где сервер откажет. Потолок полки —
     серверный (`refuseFullShelf` в той же транзакции), и нарисовать за ним живую дверь значило бы
     обещать посадку, которой не будет. Выпущенная карточка (`disabled`) сюда не попадает: у неё
     ячейка целиком инертна ещё до половин. */
  const galleryInert = !speaks
    ? 'this server does not answer the design routes'
    : shelfIsFull(band)
      ? `this card already holds its ${ASSETS_PER_CARD_MAX} assets · delete a tile below first`
      : '';

  return (
    <Section
      id='design-pattern'
      title='pattern'
      question='— a repeating tile'
      action={
        <>
          <Pill tone='ink' data-step-pill=''>
            {`step ${step.n}`}
          </Pill>
          {/* ПИЛЮЛЯ `OPTIONAL` СНЯТА ОБЕИМИ СВОИМИ КОПИЯМИ (владелец, r3 п.14). На этом экране она
              стояла ДВАЖДЫ — здесь про шаг и ниже про цвет, — и второе прочтение первой («что
              именно тут необязательно?») стоило человеку взгляда. Что шаг можно пропустить,
              говорит рельс цепочки, а не шапка блока. */}
          <span data-assets-count=''>
            <Counter n={shelf} noun='asset' total={ASSETS_PER_CARD_MAX} />
          </span>
        </>
      }
    >
      {/* ─── SOURCE PICTURE · NAME ────────────────────────────────────────────────────────── */}
      <GroupLabel
        flush
        className={GROUP_GAP}
        action={
          <span data-source-count=''>
            <Counter n={sourceId > 0 ? 1 : 0} noun='picture' total={1} />
          </span>
        }
      >
        source picture
      </GroupLabel>
      <PatternInput
        source={source}
        onPick={setSource}
        onClear={() => setSource(null)}
        onPickFromGallery={fileFromGallery}
        galleryInert={galleryInert}
        galleryPending={upsertAsset.isPending}
        name={name}
        onName={setName}
        disabled={disabled}
      />
      {fileRefusal && (
        <span data-gallery-refusal=''>
          <Reason>{fileRefusal}</Reason>
        </span>
      )}

      {/* ─── COLOUR ─────────────────────────────────────────────────────────────────────── */}
      {/* ⚠ ПИЛЮЛЬ НА ЭТОЙ ЛИНЕЙКЕ БОЛЬШЕ НЕТ (владелец, r3 п.14: «убрать “GOES TO THE MODEL” и
          “OPTIONAL”»). Их было три, потом две; обе оставшиеся называли не то, что видно на ряду
          под ними, а ПРАВИЛА — и ровно поэтому читались как шум над каждым заголовком студии.
          Ни один факт при этом не потерян: что цвет уезжает в промпт КОДОМ, сказано на самой
          выбранной плитке («code only — the model is told “…”»), где на это и смотрят; что цвет
          необязателен — тем, что ворота GENERATE его не спрашивают. */}
      <GroupLabel className={GROUP_GAP}>colour</GroupLabel>
      <PatternColourRow
        colour={colour}
        recent={recentColours}
        onPick={setColour}
        disabled={disabled}
      />

      {/* ─── the run: GENERATE and the money ─────────────────────────────────────────────── */}
      <GenerateRow
        gate={gate}
        pending={run.isPending}
        disabled={disabled}
        /* THE MONEY LINE, and only it: no price exists on the wire before a run is asked for, so
           the organ says so in the band's own words instead of inventing a number. */
        trailing={<Money data-probe='run-price' />}
        onGenerate={() =>
          run.start({
            kind: 'pattern',
            ask: '',
            params: {
              // A tile has no side of a garment: the list is empty EXPLICITLY, and the server
              // checks its length.
              views: [],
              // NO COLOURWAY ON CREATION (E-1): zero is the legal value «nobody's», and the
              // kept tile lands on the shelf unbound — `worn by` binds it afterwards.
              colorwayId: 0,
              layout: '',
              // THE COLOUR THAT PAINTS THE TILE — the same field every other kind states its
              // colour in, and the server writes it into the prompt for every kind.
              colour: colour ? patternColourRecipe(colour) : undefined,
              threed: undefined,
              fixTarget: '',
              // The field says «extra»; here it carries the ONE input a tile is built from,
              // and the server refuses any other count.
              extraInputMediaIds: [sourceId],
              fixTargets: [],
              fixSlotIds: [],
              autoSplit: false,
              detailSlotIds: [],
              // THE REPEAT TRAVELS AS A LITERAL ZERO: the density is the model's (owner, J-12).
              // THE NAME IS THE FIELD'S, and the gate has made sure it is there and unique.
              // `sourceAssetId` is 0: the only door is the library/paste, which has no parent.
              pattern: { repeatMm: 0, name: name.trim(), sourceAssetId: 0 },
              useFlatSlots: false,
              flatSlotIds: [],
            },
          })
        }
      />
      {/* THE REFUSAL STAYS ON SCREEN AND IS QUOTED VERBATIM (Ф4): the server's words name the
          cause; our half is the advice under them, never instead of them. */}
      <RunRefusal refusal={run.refusal} onDismiss={run.dismissRefusal} />
      {run.refusal && advice && (
        <span data-refusal-advice=''>
          <Reason>{advice}</Reason>
        </span>
      )}

      {/* ─── TILES ON THIS CARD · MADE EARLIER, NOT KEPT ────────────────────────────────── */}
      <PatternLibrary
        band={band}
        techCardId={techCardId}
        disabled={disabled}
        live={live}
        hasSource={sourceId > 0}
        renameMedia={renameMedia}
        onRenameMedia={setRenameMedia}
      />
    </Section>
  );
}
