import type {
  GetDesignBandResponse,
  common_Color,
  common_DesignColourRecipe,
  common_MediaFull,
  common_Model,
} from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, type JSX } from 'react';
import { useFormContext, type UseFormReturn } from 'react-hook-form';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../../schema';
import { assetById, assetThumb } from '../assets/model';
import {
  CopyWords,
  InventoryLine,
  NotSent,
  WmgGroup,
  WmgShell,
  WordsAsSent,
  latestRunOfKind,
} from '../core';
import { openDoor, openDoorAcrossKind } from '../doors';
import { viewLabel } from '../views';
import type { ThreedDraft } from './drafts';
import { Swatch } from './field-row';
import {
  fabricAuthority,
  benchSides,
  colourLabel,
  colourSubtitle,
  colourSwatchHex,
  fabricStatement,
  mediaThumb,
  pictureThumb,
  renderSheetViews,
  runOfPicture,
  slotOrigin,
  slotOriginLine,
  stripProvenance,
  threedSides,
} from './model';

/**
 * ═══ WHAT THE MODEL GETS — THE FABRIC RENDER AND 3D BRANCHES ══════════════════════════════════
 *
 * THE PROTOTYPE'S MODAL BRANCHES BY KIND (`wmgModal`, three arms), AND SO DOES THIS BAND — but the
 * arms live in two files, not one, and that is a decision rather than an accident. The FLAT arm is
 * a reader of the FORM: references, their roles, their notes, the moodboard, the concept. These two
 * are readers of the BAND: which plates stand on the bench, which renders exist at which revision,
 * and the submission draft sitting in the menu three lines below the button. Folding them into one
 * component would give it two unrelated dependency sets and one prop bag that is half-empty in
 * either direction; the shared thing between the arms is the SHAPE of the panel, and that is what
 * `core/wmg.tsx` carries — ONE markup for every step (contract §B), supplied here with the band's
 * parts and in `modals/what-model-gets-modal.tsx` with the form's. This file draws nothing of its
 * own: every row is an `InventoryLine`, every exclusion a `NotSent` item with its reason.
 *
 * ═══ WHY IT MAY BE OPENED AT ALL, GIVEN THAT THE PROFILE IS SERVER-SIDE ════════════════════════
 *
 * `generate-row.tsx` used to refuse this door outright, on the ground that «what the model is shown
 * is assembled server-side from a prompt profile». That sentence is true and it is still printed —
 * at the foot of this modal, where it belongs. What it is NOT is a reason to hide the panel: the
 * profile is the WRAPPER, and everything the wrapper is wrapped AROUND is on this card and is
 * knowable exactly. A person about to spend money on a render is entitled to see which four
 * drawings are going in, which colour recipe rides with them, and — the half that is easy to forget
 * — what is NOT going in, which for a render is every reference photograph on the card.
 *
 * That last group is the reason this panel earns its place on these two screens specifically. On
 * FLAT the references ARE the input and they are on screen. On FABRIC RENDER and 3D they are one
 * click away on another view, and the intuition «the model has seen my references» is wrong and
 * expensive. The panel says so in as many words.
 *
 * ═══ NOTHING HERE IS EDITABLE, AND EVERY LINE IS A DOOR ════════════════════════════════════════
 *
 * Same rule as the flat arm: an edit happens at the field's home, and a second writer for the same
 * value is a second opinion about it. Where an address exists the line walks to it (`openDoor`);
 * where the organ is on another view of the band the line SAYS which view, because a button that
 * cannot lead anywhere is worse than a sentence that can be read.
 */

/**
 * `recolor` IS THE THIRD ARM (K-17) AND IT IS THE SHORTEST, because a recolour is told the least:
 * one photograph per paid call and a target colour. That shortness is exactly why the panel earns
 * its place here — the intuition «the model can see the other shots, so it will keep them
 * consistent» is wrong and is bought one call at a time.
 */
export type WhatModelGetsKind = 'render' | 'threed' | 'recolor';

/** The screen's own name, spelled ONCE — the title and the copied text must not diverge. */
function kindLabel(kind: WhatModelGetsKind): string {
  if (kind === 'threed') return '3D';
  if (kind === 'recolor') return 'on model';
  return 'fabric render';
}

/**
 * The slice of a form callout the band reads. Deliberately a STRUCTURAL subset of `CalloutForm`
 * rather than the schema type itself: every organ here only ever reads these seven fields, and
 * naming the whole zod type would make this module refuse a callout that merely grew one.
 *
 * `posX` / `posY` are STRINGS on purpose — they are decimals on the wire and the form keeps them as
 * typed, so the reader parses rather than assuming a number arrived.
 *
 * IT LIVES HERE BECAUSE ITS READERS DO. The type was declared in `mint-dialog.tsx`, a file that was
 * only half about the mint; when the mint was removed the type would have gone down with it,
 * although it never had anything to do with minting. The «what the model gets» pair — this module
 * and its modal — are the only two readers left, so the type sits with them. A shared module for a
 * single type would be the same mistake with a better name.
 */
export type CalloutLike = {
  number?: number;
  mediaId?: number;
  description?: string;
  part?: string;
  dimensions?: string;
  posX?: string;
  posY?: string;
};

/** The dictionaries the two arms consult, resolved once by the caller's own hooks. */
type Resolved = {
  colors: readonly common_Color[] | undefined;
  models: readonly common_Model[] | undefined;
  sizeName: (id: number) => string;
};

export function WhatModelGetsRenderModal({
  open,
  onOpenChange,
  band,
  kind,
  recipe,
  threed,
  sources,
  cardFit,
  models,
  sizeName,
  colorwayId,
  colorwayLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  band: GetDesignBandResponse;
  kind: WhatModelGetsKind;
  /** The colour the menu currently states. Read by the render arm and by the recolour arm. */
  recipe?: common_DesignColourRecipe;
  /** The turntable draft the 3D menu currently states. Ignored by the other arms. */
  threed?: ThreedDraft;
  /** The photographs the ON MODEL menu currently holds — one paid call each. Recolour arm only. */
  sources?: readonly common_MediaFull[];
  cardFit: string;
  models?: readonly common_Model[];
  sizeName?: (id: number) => string;
  /**
   * ЧЕЙ ВЕРСТАК ЧИТАЕТ 3D (L-3). Инвентарь обязан называть РОВНО те плиты, которые уедут в сборку,
   * а уедут слоты `kind: render` ЭТОГО колорвея — так их отбирает сервер. Панель без колорвея
   * показывала бы соседний цвет и обещала бы его перед тратой денег. Рендерная рука поля не
   * читает: её вход — флэтовый верстак, а он один на карточку (L-4).
   */
  colorwayId?: number;
  colorwayLabel?: string;
}): JSX.Element {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();

  // The card's own words. Read defensively: the studio is also mounted by composers that are not
  // inside a form (a print root, a harness), and `useFormContext` answers `null` there while its
  // type promises it never does. There is no error boundary over this tab.
  const form = useFormContext<TechCardFormData>() as UseFormReturn<TechCardFormData> | null;
  // `garmentDescription` (W-3), НЕ `concept`. Здесь стояло `concept`, и это разные документы:
  // `concept` — проза, которая печатается для цеха и входит в подпись DESIGN, а `garmentDescription`
  // — предложение, которое человек пишет ДЛЯ МОДЕЛИ и которое уходит в каждый прогон. Показывать
  // одно под именем другого значит утверждать РЯДОМ С ЦЕНОЙ, что модель получит слова, которых она
  // не получит, и одновременно прятать те, которые получит. Соседняя модалка это уже починила у
  // себя (`modals/what-model-gets-modal.tsx:101`), а этот носитель остался с дефектом — и после
  // V-16, где `concept` стал общей запиской доски, стал врать заметнее прежнего.
  const garment = ((form?.getValues('garmentDescription') as string) ?? '').trim();

  const resolved: Resolved = {
    colors: dictionary?.colors,
    models,
    sizeName: sizeName ?? ((id: number) => (id ? `size ${id}` : '')),
  };

  const body =
    kind === 'render' ? (
      <RenderBody band={band} recipe={recipe} garment={garment} resolved={resolved} />
    ) : kind === 'recolor' ? (
      <RecolorBody band={band} sources={sources} recipe={recipe} garment={garment} resolved={resolved} />
    ) : (
      <ThreedBody
        band={band}
        threed={threed}
        cardFit={cardFit}
        garment={garment}
        resolved={resolved}
        colorwayId={colorwayId ?? 0}
        colorwayLabel={colorwayLabel ?? ''}
      />
    );

  const words = useMemo(
    () =>
      plainText({
        kind,
        band,
        recipe,
        threed,
        sources,
        cardFit,
        garment,
        resolved,
        colorwayId: colorwayId ?? 0,
        colorwayLabel: colorwayLabel ?? '',
      }),
    // `resolved` is rebuilt each render by design (it is three references, not state); the text is
    // recomputed from the same inputs the panel draws from, so the dictionaries are named here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      kind,
      band,
      recipe,
      threed,
      sources,
      cardFit,
      garment,
      dictionary?.colors,
      models,
      colorwayId,
      colorwayLabel,
    ],
  );

  /**
   * THE TEXT AS THE SERVER KEPT IT — the newest run of THIS kind. `kind` here is also the wire's
   * `run.kind` (`render` / `threed` / `recolor`), so no map is needed between the two.
   */
  const lastRun = useMemo(() => latestRunOfKind(band.runs, kind), [band.runs, kind]);

  return (
    /**
     * ДИАЛОГ НИЧЕГО НЕ РЕШАЕТ — ЗНАЧИТ И КНОПОК РЕШЕНИЯ У НЕГО НЕТ (L-7). Оболочка общая
     * (`WmgShell`): `hideActions`, ✕ в шапке, подпись подвала — одна на все руки.
     */
    <WmgShell
      open={open}
      onOpenChange={onOpenChange}
      kindWord={kindLabel(kind)}
      intro={
        /* THE PROFILE SENTENCE, KEPT AND MOVED RATHER THAN DELETED. It was the whole reason this
           door was dead; it is true, and it belongs beside the inventory instead of in place of
           it — a person reading this list must know it is the PAYLOAD and not the whole prompt. */
        <>
          <b>this is what this CARD contributes.</b> The prompt itself is assembled server-side
          from a prompt PROFILE — server configuration, not a card field — and the profile's name
          and version reach this screen only as the stamp on a run that has already happened. So
          the wording around these facts is not shown here, because it is not knowable here. The
          facts are, and they are the part you are paying for.
        </>
      }
    >
      {body}

      <CopyWords
        words={words}
        say={showMessage}
        doors={[
          {
            label: 'edit the description ▸',
            onClick: () =>
              /* ЧЕРЕЗ ВИД, А НЕ НА МЕСТЕ. Панель открыта со стороны FABRIC RENDER или 3D, а
                 описание изделия живёт в INPUT — REFERENCES, то есть на FLAT: отсюда блок
                 размонтирован, и `openDoor` честно ответил бы «не на этой вкладке», оставив
                 переход человеку. Дверь закрывает панель, переводит студию и ждёт монтажа. */
              openDoorAcrossKind(
                'garmentDescription',
                'flat',
                'the garment description is in INPUT — REFERENCES, on FLAT',
                showMessage,
                () => onOpenChange(false),
              ),
          },
          {
            label: 'edit the fit ▸',
            onClick: () => openDoor('fit', 'the fit is on the card header', showMessage),
          },
        ]}
      />

      <WordsAsSent
        run={lastRun}
        text={(lastRun?.prompt ?? '').trim()}
        kindWord={kindLabel(kind)}
        caveat='stored at dispatch — the text the provider received, profile wording included'
      />
    </WmgShell>
  );
}

/* ─────────────────────────── the fabric render arm ─────────────────────────── */

/**
 * INPUTS ARE THE PLATES IN THE SLOTS, and the panel counts them out of four rather than listing
 * only the ones that exist. A render is asked for exactly the FILLED slots, so an empty side is not
 * a footnote — it is a side that will not be in the sheet, and the count is what says so before the
 * money moves.
 *
 * THE FABRIC IS SHOWN AS THREE SOURCES AND A RANKING, not as one colour. Since the owner allowed
 * them to be combined they can contradict each other, and the panel exists precisely so a person
 * about to spend money sees what was actually said — including which of two disagreeing statements
 * the model is instructed to obey. The ranking is quoted from the prompt, never recomputed here.
 */
function RenderBody({
  band,
  recipe,
  garment,
  resolved,
}: {
  band: GetDesignBandResponse;
  recipe?: common_DesignColourRecipe;
  garment: string;
  resolved: Resolved;
}): JSX.Element {
  const sides = useMemo(() => benchSides(band), [band]);
  const filled = sides.filter((side) => !!side.picture);
  /** Ткани этого прогона — то самое поле провода, а не второй список рядом с ним. */
  const cloths = recipe?.fabrics ?? [];
  /** The sheet's own left-to-right order — the same list the run sends and the splitter labels. */
  const views = useMemo(() => renderSheetViews(band), [band]);
  const stated = fabricStatement(recipe);
  const references = (band.references ?? []).length;

  return (
    <>
      <WmgGroup
        flush
        label='inputs — the plates in the slots'
        aside={`${filled.length} of 4 sides`}
        note={
          <>
            {views.length > 1 ? (
              <>
                One picture comes back: <b>{views.length} views in a row</b> on one sheet, left to
                right — {views.map(viewLabel).join(', ')} — split into the slots afterwards.
              </>
            ) : (
              <>One picture comes back. </>
            )}{' '}
            A slot is filled on the input strip of this very screen —
            <b> input — flats of this card</b>, above the menu.
          </>
        }
      >
        {sides.map((side) => (
          <InventoryLine
            key={side.view}
            name={viewLabel(side.view)}
            thumb={pictureThumb(side.picture)}
            origin={side.picture ? 'linked' : undefined}
            text={
              side.picture ? (
                stripProvenance(band, side.picture)
              ) : (
                <span className='text-labelColor'>
                  empty — this side is not in the sheet and does not come back
                </span>
              )
            }
          />
        ))}
      </WmgGroup>

      <div>
        {/* ⚠ ЭТА ПОДПИСЬ — ПОСЛЕДНЯЯ ПОВЕРХНОСТЬ ПЕРЕД ДЕНЬГАМИ, И ДО ЭТОГО КРУГА ОНА ЗДЕСЬ ЛГАЛА.
            Строки ранга (`data-words-rank`) в модалке нет ПО ПОСТРОЕНИЮ: единственный вызывающий
            `clothWordsRank` стоит на странице. Значит безусловное «the words state what neither of
            them states — sheerness, weight, hand, drape» звучало здесь и при живой фотографии
            ткани, которая ровно эти три свойства и заявляет, — а поправки, которую страница даёт
            двумя рядами ниже, тут не было НИГДЕ.
            Починка — не второй вызов ранга, а ОДИН ИСТОЧНИК: текст сам является функцией рецепта.
            `data-fabric-authority` даёт пробе сверить эту поверхность СО СТРАНИЦЕЙ, а не каждую с
            ожидаемым текстом по отдельности — расхождение двух поверхностей ловится только так. */}
        <GroupLabel
          action={
            <Text
              size='micro'
              variant='label'
              component='span'
              data-fabric-authority={fabricAuthority(recipe).state}
              className='normal-case'
            >
              {fabricAuthority(recipe).text}
            </Text>
          }
        >
          fabric
        </GroupLabel>
        <InventoryLine
          name='colour'
          lead={<Swatch hex={colourSwatchHex(recipe, resolved.colors)} size={22} />}
          origin='recipe'
          text={
            <>
              <b>{colourLabel(recipe, resolved.colors)}</b> —{' '}
              {colourSubtitle(recipe, resolved.colors)}
            </>
          }
        />
        {/* ═══ ТКАНИ ЭТОГО ПРОГОНА — СТРОКА, КОТОРОЙ ЗДЕСЬ НЕ БЫЛО ВОВСЕ ═══════════════════════
            Опись перечисляла входы ЗАКРЫТЫМ списком («fabric photo · picked colour · fabric in
            words · garment») и закрывала его утвердительной фразой «not sent: …». `recipe.fabrics`
            в этом списке не было НИ В ОДНОМ из двух написаний — ни на экране, ни в копируемом
            тексте. А бэкенд при ДВУХ И БОЛЕЕ тканях прикладывает ПО КАРТИНКЕ НА ТКАНЬ
            (`snapshot.go`, `len(statedCloths) >= 2`) и печатает список тканей (`renderprompt.go`).
            То есть прогон о двух тканях покупал две входные картинки и список, которых панель не
            показывала, — при строке `photo` с ОДНИМ номером медиа и при закрывающем «not sent»,
            который был просто неверен.
            Строка читает то самое поле, которое уезжает, поэтому список больше не «перечислен», а
            ВЫВЕДЕН: ось, добавленная в `fabrics`, появится здесь сама. */}
        {cloths.length > 0 && (
          /* `data-sent-cloths` — ЯКОРЬ ДЛЯ ЗАМЕРА, И ОН НУЖЕН. Модалка несёт ВТОРОГО носителя того
             же факта — блок COPY AS TEXT, который тоже лежит в DOM. Утверждение по тексту ВСЕГО
             диалога проходило бы за счёт копируемой строки и молчало бы о снятом ряде: ровно та
             ложная зелень, что уже случилась здесь однажды. Замерено мутацией M8. */
          <InventoryLine
            data-sent-cloths=''
            name='cloths'
            origin='recipe'
            text={
              <>
                {cloths
                  .map(
                    (f) =>
                      /* ⚠ «→ the whole garment» БОЛЬШЕ НЕ УТВЕРЖДАЕТСЯ. Части выводились из
                         меток на флэтах; экрана меток нет с J-21, и печатать «каждая ткань кроет
                         всё изделие» там, где провод говорит «разделение за вами», — это панель,
                         противоречащая телу запроса, на котором стоит цена.
                         ⚠ У ПОЛЯ СНОВА ЕСТЬ АВТОР, И ИХ ДВА РАЗНЫХ (фича A). `map_hex` — МЕТКА НА
                         КАРТЕ, то есть размещение картинкой; `parts` — человечьи слова про ту же
                         деталь. Строка печатает то, что уедет, и в том же порядке, в каком это
                         печатает сервер: сначала слова, потом краска. */
                      `${(f.name ?? '').trim() || 'cloth'}${
                        (f.parts ?? '').trim() ? ` → ${(f.parts ?? '').trim()}` : ''
                      }${(f.mapHex ?? '').trim() ? ` → painted ${(f.mapHex ?? '').trim()}` : ''}`,
                  )
                  .join(' · ')}
                {cloths.length > 1 ? (
                  <>
                    {' '}
                    — <b>each travels as its own image</b>, and the prompt carries the list
                  </>
                ) : null}
              </>
            }
          />
        )}
        {/* ═══ КАРТЫ ЦВЕТОВ — ОТДЕЛЬНОЙ СТРОКОЙ ОПИСИ, ПОТОМУ ЧТО ЭТО ОТДЕЛЬНЫЕ КАРТИНКИ ═════
            Опись обязана называть ВСЁ, что уезжает. Карта едет в РЕЦЕПТЕ, а не среди референсов,
            и подпись у неё своя («colour map of the front flat — those colours label which cloth
            covers which part»); прочитанная под общей подписью референса, она была бы чертежом
            вещи в неправдоподобных цветах. Строка рисуется только когда карты есть: пустая
            говорила бы про прогон то, чего в нём нет. */}
        {(recipe?.colourMaps ?? []).length > 0 && (
          <InventoryLine
            data-sent-colour-maps={(recipe?.colourMaps ?? []).length}
            name='colour maps'
            origin='recipe'
            text={
              <>
                {(recipe?.colourMaps ?? [])
                  .map((m) => `${viewLabel((m.view ?? '').trim())} · media ${m.mediaId ?? 0}`)
                  .join(' · ')}{' '}
                — <b>each travels as its own image</b>, and the prompt says which flat it labels
              </>
            }
          />
        )}
        <InventoryLine
          name='photo'
          origin={stated.photo ? 'recipe' : undefined}
          text={
            stated.photo ? (
              <>
                media {recipe?.fabricMediaId} — goes out as an image; the weave, texture and drape
                are read from it
              </>
            ) : (
              <span className='text-labelColor'>none — no material is stated by a picture</span>
            )
          }
        />
        <InventoryLine
          name='words'
          origin={(recipe?.words ?? '').trim() ? 'recipe' : undefined}
          text={
            (recipe?.words ?? '').trim() || (
              <span className='text-labelColor'>none — nothing is added beyond the two above</span>
            )
          }
        />
        <InventoryLine
          name='garment'
          origin='linked'
          text={
            garment || (
              <span className='text-error'>
                the card states no description; the render goes in unexplained
              </span>
            )
          }
        />
      </div>

      <NotSent
        items={[
          {
            label: `references · ${references}`,
            reason:
              'a fabric render is coloured over the FLATS of this card — the reference photographs ' +
              'were read once, when the flats were drawn, and the render never sees them. They are ' +
              'on the FLAT view of the strip above',
          },
          {
            label: 'moodboard',
            reason: 'mood is for the human — it is never instruction, on any of the three views',
          },
          { label: 'callouts', reason: 'the callouts on the sheet live on ARTIFACTS' },
        ]}
      />
    </>
  );
}

/* ─────────────────────────── the recolour arm ─────────────────────────── */

/**
 * A RECOLOUR IS TOLD VERY LITTLE, AND THE SHORTNESS OF THIS LIST IS THE POINT.
 *
 * ONE PHOTOGRAPH PER PAID CALL, AND THE MODEL SEES ONLY THAT ONE. It is not shown the other shots,
 * it is not told they are the same garment, and it cannot make them agree by looking at them. The
 * thing that keeps four pictures the same shade is the COLOUR NAMED — which is why that line sits
 * directly under the count of calls rather than in a section of its own.
 *
 * THE CARD CONTRIBUTES ALMOST NOTHING HERE, and that is worth reading before paying per shot: no
 * bench plate, no reference, no moodboard, no fit. A recolour is about a photograph that already
 * exists; the card's drawings would be a second, contradictory description of the same garment.
 */
function RecolorBody({
  band,
  sources,
  recipe,
  garment,
  resolved,
}: {
  band: GetDesignBandResponse;
  sources?: readonly common_MediaFull[];
  recipe?: common_DesignColourRecipe;
  garment: string;
  resolved: Resolved;
}): JSX.Element {
  const shots = sources ?? [];
  const stated = fabricStatement(recipe);

  /**
   * ⚠ ЧИТАЕТСЯ ИЗ `params.colour.fabrics`, А НЕ ИЗ ЧЕРНОВИКА ЭКРАНА, И ЭТО ВЕСЬ СМЫСЛ ЭТОЙ
   * ПАНЕЛИ. Она называется «what the model gets» и обязана перечислять картинки ВЫЗОВА; рецепт,
   * который ей передан, — тот самый объект, который уедет. Миниатюра берётся у ассета карточки по
   * `asset_id` (сам рецепт — замороженная копия и адреса картинки не несёт); нет ассета — строка
   * всё равно печатается, потому что ЕДЕТ она по `media_id`, а не по полке.
   */
  const cloth = useMemo(() => {
    const use = (recipe?.fabrics ?? []).find((f) => (f.mediaId ?? 0) > 0);
    if (!use) return null;
    const asset = assetById(band).get(use.assetId ?? 0);
    return {
      name: (use.name ?? '').trim() || 'the cloth',
      mediaId: use.mediaId ?? 0,
      repeatMm: use.repeatMm ?? 0,
      thumb: assetThumb(asset),
    };
  }, [band, recipe]);

  return (
    <>
      <WmgGroup
        flush
        label='inputs — the photographs, one call each'
        aside={`${shots.length} photograph${shots.length === 1 ? '' : 's'} · ${shots.length} paid call${
          shots.length === 1 ? '' : 's'
        }`}
      >
        {shots.length === 0 ? (
          <Text size='micro' variant='inactive' component='p' className='py-1 normal-case'>
            No photograph is in the menu, so there is nothing to recolour and nothing to buy.
          </Text>
        ) : (
          shots.map((media, index) => (
            <InventoryLine
              key={media.id ?? index}
              name={`photo ${index + 1}`}
              thumb={mediaThumb(media)}
              origin='linked'
              text={
                <>
                  media <b>{media.id ?? '—'}</b> — its own paid call, recoloured on its own. The
                  model is not shown the other {shots.length === 1 ? 'shots' : 'photographs'}.
                </>
              }
            />
          ))
        )}
      </WmgGroup>

      <div>
        {/* ⚠ ЗАГОЛОВОК НАЗЫВАЕТ ТО, ЧТО ПОД НИМ, И НЕ БОЛЬШЕ. Ткань добавилась В БЛОК ЦВЕТА, а не
            вместо него: ниже по-прежнему живут образец, слова и изделие. Заголовок «the cloth»
            над ними один означал бы, что панель, на которой стоит цена, называет свои строки
            чужим именем — а когда ткань не названа, блок и вовсе был бы озаглавлен тканью,
            которой нет. */}
        <GroupLabel>{cloth ? 'the cloth and the target colour' : 'the target colour'}</GroupLabel>
        {/* ═══ ПЛИТКА ТКАНИ — ВТОРАЯ КАРТИНКА КАЖДОГО ПЛАТНОГО ВЫЗОВА (J-31) ═══════════════════
            Опись обязана называть ВСЕ картинки вызова, а не только фотографии: с плиткой вызов
            несёт две, и промпт называет их номерами («image 1 … image 2»). Строки нет, когда
            ткани нет, — тогда вызов действительно об одной картинке. */}
        {cloth && (
          <InventoryLine
            name='the cloth'
            thumb={cloth.thumb}
            origin='recipe'
            text={
              <>
                <b>{cloth.name}</b> — media {cloth.mediaId}, <b>image 2 of every call</b>: the
                garment is re-made in this cloth
                {cloth.repeatMm > 0 ? `, and its pattern repeats every ${cloth.repeatMm} mm` : ''}.
                {stated.colour
                  ? ' The picked colour re-tints it and keeps its motif, weave and scale.'
                  : ''}
              </>
            }
          />
        )}
        <InventoryLine
          name='colour'
          lead={<Swatch hex={colourSwatchHex(recipe, resolved.colors)} size={32} />}
          origin='recipe'
          text={
            <>
              <b>{colourLabel(recipe, resolved.colors)}</b>
              <br />
              <span className='text-labelColor'>{colourSubtitle(recipe, resolved.colors)}</span>
            </>
          }
        />
        <InventoryLine
          name='in words'
          origin={stated.words ? 'recipe' : undefined}
          text={
            stated.words ? (
              (recipe?.words ?? '').trim()
            ) : (
              <span className='text-labelColor'>nothing said in words</span>
            )
          }
        />
        <InventoryLine
          name='garment'
          origin='linked'
          text={
            garment || <span className='text-labelColor'>the card states no description</span>
          }
        />
      </div>

      <NotSent
        items={[
          {
            label: 'the flats',
            reason:
              'a recolour repaints a photograph that exists — the card\u2019s drawings would be a second, contradictory description of the same garment',
          },
          {
            label: 'the bench',
            reason:
              'the bench is what a fabric render is built from; a recolour is built from the photograph you handed it',
          },
          {
            label: 'the other photographs',
            reason:
              'each shot is its own paid call and the model sees only that one — what keeps them the same shade is the colour you named, not that they went together',
          },
          { label: 'references', reason: 'reference photographs belong to FLAT and never reach this run' },
          { label: 'moodboard', reason: 'mood is for the human — it is never instruction' },
          {
            label: 'the fit',
            reason: 'fit describes a garment being drawn; this one has already been photographed on a body',
          },
        ]}
      />
    </>
  );
}

/* ─────────────────────────── the 3D arm ─────────────────────────── */

/**
 * INPUTS ARE THE RENDERS BY VIEW, AND A MISSING SIDE IS NAMED IN RED. 3D turns the renders and not
 * the drawings, so a side without a render is not «one fewer angle» — it is the gate, and the panel
 * uses the gate's own words so the two cannot disagree.
 */
function ThreedBody({
  band,
  threed,
  cardFit,
  garment,
  resolved,
  colorwayId,
  colorwayLabel,
}: {
  band: GetDesignBandResponse;
  threed?: ThreedDraft;
  cardFit: string;
  garment: string;
  resolved: Resolved;
  colorwayId: number;
  colorwayLabel: string;
}): JSX.Element {
  /**
   * ⚠ ЧИТАЕТСЯ РЕНДЕР-ВЕРСТАК, А НЕ ЛЕНТА (V-14). Инвентарь обязан называть ровно те картинки,
   * которые уедут в сборку, а уедут плиты слотов `kind: render` — это отбирает сервер
   * (`designSelectBench`). Панель, считавшая «последний рендер каждой стороны» по ленте, обещала
   * человеку перед тратой денег не тот набор.
   */
  const sides = useMemo(() => threedSides(band, colorwayId), [band, colorwayId]);
  const present = sides.filter((side) => !!side.picture).length;

  return (
    <>
      <WmgGroup
        flush
        label={`inputs — renders by view${
          colorwayLabel.trim() ? ` · ${colorwayLabel.trim()}` : ' · no colourway'
        }`}
        aside={`${present} of 4 marked · front required`}
      >
        {sides.map((side) => {
          /**
           * ⚠ РЕВИЗИЯ И РОД ПРОГОНА — СО ШТАМПА СЛОТА, А НЕ ИЗ ПОСТРАНИЧНОГО ПОИСКА.
           *
           * Это ПОСЛЕДНЯЯ поверхность перед деньгами, и до круга 15 она печатала здесь `r{rrev}`
           * из `runOfPicture(band, side.picture)` — поиска по первой странице ленты. Плита слота
           * законно старше её, поиск отвечал `null`, и инвентарь молча не показывал ревизию ровно
           * на тех карточках, где она и важна: там, где сторон много и они разных прогонов.
           * Тот же нуль ломал сторож смешения (см. `threedRevisions`).
           *
           * `run` при этом ЧИТАЕТСЯ ДАЛЬШЕ и только ради ЦВЕТА прогона: `params.colour` живёт на
           * строке прогона и на слот не едет. Молчание о цвете на плите старше страницы — честное
           * «не знаем», а не подставленный ноль.
           */
          const run = side.picture ? runOfPicture(band, side.picture) : null;
          const origin = slotOrigin(band, side);
          return (
            <InventoryLine
              key={side.view}
              name={viewLabel(side.view)}
              thumb={pictureThumb(side.picture)}
              origin={side.picture ? 'linked' : undefined}
              text={
                side.picture ? (
                  <span
                    data-input-side={`${side.view}:${origin.runKind || 'none'}:${origin.rrev}`}
                    className={origin.foreign ? 'text-warning' : undefined}
                  >
                    {[
                      slotOriginLine(origin),
                      run ? colourLabel(run.params?.colour, resolved.colors) : '',
                      stripProvenance(band, side.picture),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                ) : side.view === 'front' ? (
                  /* ОДНА СТОРОНА ОБЯЗАТЕЛЬНА, И ЭТО ФРОНТ (K-10/K-11): без него прогон отвергается
                     бесплатно. Красным было помечено ВСЁ пустое, пока это был поворотный стол. */
                  <span className='text-error'>not marked — blocks 3D</span>
                ) : (
                  /* КОРОТКО, КАК НА САМОЙ ПОЛОСЕ (круг 17, F-14): «each extra side makes the
                     model better» было тем же пояснением, что «one more angle = a better model»
                     на пустой ячейке входа, — снято там, снято и здесь, чтобы две поверхности
                     не разошлись словами. */
                  <span className='text-labelColor'>not marked — optional</span>
                )
              }
            />
          );
        })}
      </WmgGroup>

      <WmgGroup label='how it sits'>
        <InventoryLine
          name='presentation'
          origin='typed'
          text={
            threed?.presentation === 'model'
              ? `on ${bodyLine(resolved.models, threed)} · garment ${
                  resolved.sizeName(threed?.garmentSizeId ?? 0) || '— no size chosen —'
                }`
              : 'in the air — no figure'
          }
        />
        {threed?.presentation === 'model' && (
          /* ЧТО ИЗ ЭТОГО ДОХОДИТ ДО МОДЕЛИ, СКАЗАНО ЗДЕСЬ, потому что ради этого панель и
             открывают: слово о телосложении уезжает в промпт, а `model_id` — нет, у снимка нет
             поля ни под имя модели, ни под её мерки. Человек, тратящий деньги, обязан знать,
             какая половина его выбора управляет картинкой, а какая только записывает факт. */
          <InventoryLine
            name='the body'
            origin={(threed?.bodyType ?? '').trim() ? 'typed' : undefined}
            text={
              <>
                {(threed?.bodyType ?? '').trim() ? (
                  <>
                    build <b>{threed?.bodyType}</b> — travels to the model as a word.{' '}
                  </>
                ) : (
                  <>no build stated — the generator picks one. </>
                )}
                {threed?.modelId ? (
                  <span className='text-labelColor'>
                    the chosen model is recorded on the run and is not described to the generator
                  </span>
                ) : (
                  <span className='text-labelColor'>no model named</span>
                )}
              </>
            }
          />
        )}
        <InventoryLine
          name='fit'
          origin={(threed?.fitOverride ?? '').trim() ? 'typed' : 'linked'}
          text={
            (threed?.fitOverride ?? '').trim() ? (
              <>
                <b>{threed?.fitOverride}</b> — an override; what it produces carries the badge,
                and the card still says {cardFit || '—'}
              </>
            ) : (
              `${cardFit || '—'} (from the card)`
            )
          }
        />
        <InventoryLine
          name='garment'
          origin='linked'
          text={
            garment || <span className='text-labelColor'>the card states no description</span>
          }
        />
      </WmgGroup>

      <NotSent
        items={[
          {
            label: 'references',
            reason:
              'a 3D model is built out of the marked RENDERS — the reference photographs are two ' +
              'steps upstream and are not shown to it. They are on the FLAT view of the strip',
          },
          { label: 'moodboard', reason: 'mood is for the human — it is never instruction' },
          {
            label: 'the flats',
            reason: '3D is built from the renders, not from the drawings underneath them',
          },
          { label: 'notes', reason: 'notes are internal and reach neither the factory nor a model' },
        ]}
      />
    </>
  );
}

/* ─────────────────────────── the shared shapes live in core/wmg.tsx ─────────────────────────── */

function modelCaptionOf(
  models: readonly common_Model[] | undefined,
  modelId?: number,
): string {
  if (!modelId) return '';
  const model = (models ?? []).find((m) => m.id === modelId);
  return (model?.model?.name ?? '').trim() || `model ${modelId}`;
}

/**
 * «Vera K., a curvy build» / «a curvy build» / «Vera K.» / «— no body stated —».
 *
 * ОДИН ВОПРОС, ДВА РЕГИСТРА ОТВЕТА (V-15), поэтому и строка одна: панель повторяет то, что человек
 * только что сказал на экране, а два отдельных поля здесь читались бы как два независимых решения.
 */
function bodyLine(
  models: readonly common_Model[] | undefined,
  threed?: ThreedDraft,
): string {
  const who = modelCaptionOf(models, threed?.modelId);
  const build = (threed?.bodyType ?? '').trim();
  if (who && build) return `${who}, a ${build} build`;
  if (who) return who;
  if (build) return `a ${build} build`;
  return '— no body stated —';
}

/**
 * THE SAME FACTS AS PLAIN TEXT — what «copy as text» hands to a studio outside.
 *
 * ASSEMBLED FROM THE SAME VALUES THE PANEL DRAWS FROM, never from the DOM: a text built by walking
 * the rendered nodes would silently change whenever a label was reworded, and would carry «missing
 * — blocks 3D» into a brief as if it were an instruction.
 */
function plainText({
  kind,
  band,
  recipe,
  threed,
  sources,
  cardFit,
  garment,
  resolved,
  colorwayId,
  colorwayLabel,
}: {
  kind: WhatModelGetsKind;
  band: GetDesignBandResponse;
  recipe?: common_DesignColourRecipe;
  threed?: ThreedDraft;
  sources?: readonly common_MediaFull[];
  cardFit: string;
  garment: string;
  resolved: Resolved;
  colorwayId: number;
  colorwayLabel: string;
}): string {
  const lines: string[] = [
    `what the model gets — ${kindLabel(kind)}`,
    `garment: ${garment || '—'}`,
    `fit: ${cardFit || '—'} (from the card)`,
  ];

  if (kind === 'recolor') {
    const shots = sources ?? [];
    return [
      // `fit` НЕ ПЕЧАТАЕТСЯ У РЕКОЛА, и строка выше его уже поставила: посадка описывает вещь,
      // которую рисуют, а эта уже снята на человеке. Поэтому текст рекола собирается своим
      // списком, а не дописывается к общему.
      `what the model gets — ${kindLabel(kind)}`,
      `garment: ${garment || '—'}`,
      `inputs: ${shots.length} photograph${shots.length === 1 ? '' : 's'} — ${
        shots.map((m) => `media ${m.id ?? '—'}`).join(', ') || 'none'
      }`,
      `paid calls: ${shots.length} (one per photograph; each call sees only its own picture)`,
      `target colour: ${colourLabel(recipe, resolved.colors)}`,
      `colour in words: ${(recipe?.words ?? '').trim() || '—'}`,
      'not sent: the flats, the bench, the other photographs, references, moodboard, the fit',
    ].join('\n');
  }

  if (kind === 'render') {
    const sides = benchSides(band);
    lines.push(
      `inputs: ${sides
        .map((side) => `${viewLabel(side.view)}=${side.picture ? 'plate' : 'empty'}`)
        .join(', ')}`,
      `sheet: ${renderSheetViews(band).map(viewLabel).join(', ') || '—'} (one picture, split afterwards)`,
      // ⚠ ТКАНИ — ОТДЕЛЬНОЙ СТРОКОЙ, И ЭТО НЕ ДУБЛИРОВАНИЕ `fabric photo`. Скаляр называет ОДНУ
      // главную фотографию; при двух и более тканях бэкенд прикладывает по картинке на каждую и
      // печатает список. Текст уезжает в буфер и живёт дальше без экрана — закрытый перечень
      // входов, в котором этой строки нет, там просто неверен.
      `cloths: ${
        (recipe?.fabrics ?? [])
          .map(
            (f) =>
              // ⚠ МЕТКА ПЕЧАТАЕТСЯ И ЗДЕСЬ. Текст уезжает в буфер и живёт дальше без экрана; список
              // тканей без сказанного «на какой детали» читался бы там как прогон, у которого
              // разделение отдано модели, — а купленный промпт говорит обратное.
              `${(f.name ?? '').trim() || 'cloth'}${
                (f.mapHex ?? '').trim() ? ` (painted ${(f.mapHex ?? '').trim()})` : ''
              }`,
          )
          .join(', ') || '—'
      }`,
      `colour maps: ${
        (recipe?.colourMaps ?? [])
          .map((m) => `${viewLabel((m.view ?? '').trim())} media ${m.mediaId ?? 0}`)
          .join(', ') || '—'
      }`,
      `fabric photo: ${(recipe?.fabricMediaId ?? 0) > 0 ? `media ${recipe?.fabricMediaId}` : '—'}`,
      `picked colour: ${colourLabel(recipe, resolved.colors)}`,
      `fabric in words: ${(recipe?.words ?? '').trim() || '—'}`,
      `order of authority: ${fabricAuthority(recipe).text}`,
      'not sent: references, moodboard, callouts',
    );
    return lines.join('\n');
  }

  const sides = threedSides(band, colorwayId);
  lines.push(
    // ЧЕЙ ЭТО ВЕРСТАК — ПЕРВОЙ СТРОКОЙ 3D-БЛОКА. Текст уезжает в буфер и живёт дальше без экрана,
    // а колорвей — единственное, чего по списку сторон восстановить нельзя.
    `colourway: ${colorwayLabel.trim() || 'none (the unattributed render bench)'}`,
    `inputs: ${sides
      .map((side) => {
        if (!side.picture) {
          return `${viewLabel(side.view)}=${side.view === 'front' ? 'NOT MARKED (required)' : 'not marked (optional)'}`;
        }
        // ТЕКСТ УЕЗЖАЕТ В БУФЕР И ЖИВЁТ ДАЛЬШЕ БЕЗ ЭКРАНА, поэтому он обязан нести те же два
        // факта, что и строка на экране, и из того же источника — штампа слота. Прежняя
        // редакция брала `rrev` постраничным поиском и на карточке с историей писала «marked»
        // всем четырём сторонам, то есть теряла ровно тот факт, ради которого список копируют.
        const origin = slotOrigin(band, side);
        const said = slotOriginLine(origin);
        return `${viewLabel(side.view)}=${said || 'filled'}`;
      })
      .join(', ')}`,
    threed?.presentation === 'model'
      ? `presentation: on ${bodyLine(resolved.models, threed)} · garment ${
          resolved.sizeName(threed?.garmentSizeId ?? 0) || '—'
        }`
      : 'presentation: in the air',
    threed?.presentation === 'model'
      ? `build sent as a word: ${(threed?.bodyType ?? '').trim() || 'none — the generator picks'}`
      : 'build: not applicable in the air',
    (threed?.fitOverride ?? '').trim()
      ? `fit override: ${threed?.fitOverride} (the result is badged)`
      : 'fit override: none',
    'not sent: references, moodboard, the flats, notes',
  );
  return lines.join('\n');
}
