import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useMemo, useState, type JSX } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import { mediaFullToViewerItem, mediaFullViewerSrc } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { serverStatesOutputs } from '../bench-kinds';
import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { isRunLive, runOutcomeNote } from '../generation/run-state';
import { VectorModal } from '../modals';
import {
  SELECT_MARK_NOT_STATED,
  pictureIsSelected,
  pictureThumb,
  serverStatesSelected,
} from '../render/model';
import { Strip, StripCell } from '../render/strip-cell';
import { useDesignWrites } from '../use-design-band';
import { recolorOutputs, recolorRuns } from './model';

/**
 * ON-MODEL PICTURES OF THIS CARD — то, что вернулось, и который из них выбран.
 *
 * ⚠ ЗАГОЛОВОК СМЕНИЛСЯ ВМЕСТЕ С ТЕМ, ЧТО ЭКРАН ДЕЛАЕТ (J-31). «Recoloured» описывало ровно один
 * из двух платных промптов маршрута; с тех пор как прогон умеет ПЕРЕОДЕВАТЬ вещь в названную
 * ткань (`reclothCraft`), это слово стало неверным ровно для половины строк — и неверным молча,
 * потому что по картинке одно от другого не отличить.
 *
 * ═══ ПОЧЕМУ ЭТО НЕ `render/outputs.tsx`, ХОТЯ ОРГАН ТОТ ЖЕ ══════════════════════════════════════
 *
 * `OutputsSection` типизирована родом `'render' | 'threed'` и читает `outputsOfKind`, который
 * фильтрует ленту по роду ПРОГОНА. Рекол — третий род, и расширить ту функцию этой волной нельзя:
 * файл держит другой агент. Копия здесь минимальна и намеренно одноразовая: те же примитивы
 * (`Strip`, `StripCell`), тот же шов записи (`useDesignWrites().setPictureSelected`), те же два
 * правила про пометку. Обязанность свести их обратно передана списком — расширить союз родов в
 * `outputsOfKind`/`OutputsSection` и снести этот файл.
 *
 * ═══ И ЧЕМ ОН ВСЁ-ТАКИ ОТЛИЧАЕТСЯ ══════════════════════════════════════════════════════════════
 *
 *  · ПОДПИСЬ НЕ НАЗЫВАЕТ ВИД. `ghost_view` у перекраски пуст — сторона снимка неизвестна никому, и
 *    сервер её нарочно не выдумывает. Подпись говорит то, что правда: чей это прогон и какая по
 *    счёту картинка в нём.
 *  · ОТКАЗ ПРОГОНА СТОИТ ЗДЕСЬ, А НЕ ТОЛЬКО В ИСТОРИИ. Новые причины провайдера
 *    (`provider_model_retired`, `provider_bad_request`) приходят на строку прогона, и человек,
 *    только что нажавший GENERATE, смотрит СЮДА, а не в свёрнутую историю ниже. Слова берутся с
 *    сервера дословно: подменять код провайдера своей прозой значит терять единственное, по чему
 *    отличается «модель сняли с публикации» от «мы отправили негодный запрос».
 *
 * ═══ ОРГАНЫ ПЛИТКИ — ТЕ ЖЕ И ТАМ ЖЕ, ЧТО У RENDERS (F-15) ═════════════════════════════════════
 *
 * Владелец, дословно: «в ON-MODEL PICTURES OF THIS CARD на ховер должен быть эдит мод и надо
 * как-то более гармонично сделать селект там а то это хуйня полная выглядит этот селект
 * чужеродно».
 *
 * ЗАМЕР ДО ПРАВКИ (стенд `w3-stand.html?organ=onmodel`, снимок геометрии): ячейка 132×223, под
 * кадром РЯД ДВЕРЕЙ высотой 22px с кнопкой SELECT 60×20, а на ховере кадра — ОДИН угол, `zoom`.
 * Соседний раздел RENDERS к этому времени уже перенёс живую пометку НА КАДР (E-25), и разница
 * читалась именно так, как её назвал владелец: одна и та же полоса, один и тот же примитив
 * `StripCell`, а орган пометки в двух разных РОДАХ МЕСТ. «Чужеродно» — это не про оформление
 * кнопки, это про то, что она СТОИТ НЕ ТАМ, ГДЕ ЕЁ ИЩУТ, и тащит за собой лишние 22 пикселя
 * подвала, которых у соседа нет.
 *
 * ЧТО СТОИТ ТЕПЕРЬ: живая пометка — угол `select`/`un-select` примитива, правка — угол `edit`
 * рядом с ней, и оба появляются по наведению вместе с `zoom`. Раскладку выбирает `PictureTile`,
 * а не этот файл: у него нет пропа «где рисовать».
 *
 * ⚠ ПОД КАДРОМ ОСТАЁТСЯ ТОЛЬКО ОТКАЗ, И ЭТО ЗАКОН, ЗАПИСАННЫЙ ДО НАС (`strip-cell.tsx`, проп
 * `onSelect`): «Угол — ТИХИЙ орган: он появляется по наведению, то есть отказ называл бы орган,
 * которого на экране не видно». Поэтому оба неживых состояния — сервер не знает пометки и
 * карточка только для чтения — остаются `InertDoor` ПОД кадром, словами и всегда видимыми.
 */
export function OnModelOutputs({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element | null {
  // ХУКИ ВЫШЕ ЛЮБОГО РАННЕГО ВОЗВРАТА: ниже него их число менялось бы между рендерами, а React
  // отвечает на это ошибкой 310 и сносит всё дерево — границы ошибок над этой вкладкой нет.
  const speaks = serverSpeaksDesign();
  const { setPictureSelected } = useDesignWrites(techCardId);
  const outputs = useMemo(() => recolorOutputs(band), [band]);
  const runs = useMemo(() => recolorRuns(band), [band]);
  /* КАКУЮ ИМЕННО КАРТИНКУ ПРАВИМ (F-15). Не булево: плиток в полосе много, а редактор один, и
     флаг открыл бы его сразу над всеми. Ноль — закрыто. Тот же приём, что в `render/outputs.tsx`. */
  const [editingId, setEditingId] = useState(0);
  /* ЗАНЯТОСТЬ ПОМЕТКИ — АДРЕСНАЯ. `setPictureSelected.isPending` истинен для ВСЕЙ секции, и на
     нём гасли бы все углы разом: человек, нажавший на одной плитке, читает это как «сломалось
     везде». Здесь же занят ровно тот угол, по которому нажали. */
  const [selecting, setSelecting] = useState(0);

  /** Прогоны, о которых есть что сказать помимо картинок: живые и те, что кончились плохо. */
  const noteworthy = runs.filter(
    (run) => isRunLive(run) || (run.status ?? '').trim().toLowerCase() === 'failed',
  );

  if (!outputs.length && !noteworthy.length) return null;

  // Знает ли ответивший бинарь про пометку вообще. С `EmitUnpopulated` сервер, у которого поле
  // есть, шлёт его на КАЖДОЙ картинке (как `false`), поэтому одна картинка — правдивая проба за
  // всех; `undefined` — это откаченный бинарь, и глагол пометки ответил бы ему 404.
  const carries = outputs.length ? serverStatesSelected(outputs[0].picture) : true;
  const marked = outputs.filter((o) => pictureIsSelected(o.picture)).length;
  const writesOff = !!disabled || !speaks;

  return (
    <Section
      title='on-model pictures of this card'
      /* ═══ ОХВАТ СПИСКА ЖИВЁТ ЗДЕСЬ, А НЕ В СНОСКЕ ПОД ПЛИТКАМИ (F-16) ═══════════════════════
         Владелец снял абзац целиком. Из него уцелел ровно один факт, которого не говорит ни один
         орган экрана: ЧТО ИМЕННО перечислено — все перекраски карточки или только те, что
         приехали страницей ленты. Он и переехал сюда, в обеих редакциях: вопрос секции — то
         место, где DESIGN.md велит говорить, ДЛЯ ЧЕГО блок, и он виден всегда, а не отдельной
         строкой прозы под полосой. Тот же приём, которым J-19 снял сноску у RENDERS. */
      question={
        serverStatesOutputs(band)
          ? '— every recolour this card holds, newest first, one picture per photograph, and which are chosen'
          : '— the recolours on this page of the feed, one picture per photograph, and which are chosen'
      }
      action={
        <Text size='micro' variant='label' component='span' className='uppercase'>
          {outputs.length} picture{outputs.length === 1 ? '' : 's'}
          {carries && outputs.length ? ` · ${marked} selected` : ''}
        </Text>
      }
    >
      {/* ═══ СОСТОЯНИЕ ПРОГОНОВ — ДОСЛОВНО С СЕРВЕРА ═══════════════════════════════════════════
          `runOutcomeNote` печатает `run.error_code`, а если его нет — текст последней ошибки, и
          НИЧЕГО от себя. Именно поэтому здесь появляются новые слова провайдера, которых этот
          бандл никогда не видел: экран не обязан их знать, чтобы правдиво показать. */}
      {noteworthy.map((run) => {
        const note = runOutcomeNote(run);
        const live = isRunLive(run);
        return (
          <CalloutBox key={run.id} tone={live ? 'note' : 'error'}>
            <Text size='micro' component='p' className='normal-case'>
              <b>run {run.id ?? '—'} — {note}.</b>{' '}
              {live
                ? 'The pictures land here when the provider answers; the history below reads the same row.'
                : 'The words above are the server’s own, not this screen’s. Nothing was filed for this run.'}
            </Text>
          </CalloutBox>
        );
      })}

      {!carries && (
        <CalloutBox tone='note'>
          <Text size='micro' component='p'>
            <b>this server does not state the mark at all.</b> `DesignPicture.selected` is on this
            contract, and a server that knows it sends it on every picture — this one sent nothing,
            which means a binary older than the field. Nothing is broken; the card simply has no
            record of which picture was chosen, and the doors below stay shut.
          </Text>
        </CalloutBox>
      )}

      {outputs.length > 0 && (
        <Strip>
          {outputs.map(({ picture, run }) => {
            const chosen = pictureIsSelected(picture);
            /* «ИЗ N» СТАВИТСЯ ТОЛЬКО ТОГДА, КОГДА N ИЗВЕСТНО. У выхода, чей прогон вытеснен со
               страницы ленты, рядом стоит штамп, а у штампа `pictures` нет вовсе — то есть 0, и
               подпись честно сокращается до «picture 2». Не потеря: единственная альтернатива —
               назвать «из 1», сосчитав по себе, а это выдуманное число о чужом прогоне. */
            const total = (run.pictures ?? []).length;
            const shape = total > 1
              ? `picture ${picture.ordinal ?? '—'} of ${total}`
              : `picture ${picture.ordinal ?? '—'}`;
            return (
              <StripCell
                key={picture.id}
                /* ЯКОРЬ ЯЧЕЙКИ. Проп у примитива был, а эта полоса его не ставила — то есть
                   назвать ячейку в пробе было нечем, кроме вёрстки, а вёрстка переживает правку
                   смысла и делает пробу зелёной над сломанным экраном. */
                cellPictureId={picture.id}
                emphasis={chosen}
                src={pictureThumb(picture)}
                alt={`on-model picture ${picture.ordinal ?? ''}`}
                gallery={
                  picture.media && mediaFullViewerSrc(picture.media)
                    ? mediaFullToViewerItem(picture.media)
                    : undefined
                }
                badge={chosen ? 'selected' : undefined}
                /* ВИДА ЗДЕСЬ НЕТ, И ЭТО ЧЕСТНО: `ghost_view` перекраски пуст — сторона снимка не
                   объявлена ни файлом, ни сервером, и подставить её значило бы выдумать факт. */
                lines={[`run ${run.id ?? '—'} · ${shape}`, 'on model · no view declared']}
                /* ═══ ЖИВАЯ ПОМЕТКА — УГЛОМ КАДРА (F-15) ═════════════════════════════════════
                   «More than one may be chosen» из снятой сноски (F-16) переехало СЮДА, в слова
                   самого органа: множественность — это свойство ПОМЕТКИ, и человек спрашивает о
                   ней ровно тогда, когда собирается пометить вторую. Счёт «· N selected» в шапке
                   говорит то же самое числом, как только помечена вторая. */
                onSelect={
                  carries && !writesOff
                    ? {
                        onClick: () => {
                          const id = picture.id ?? 0;
                          setSelecting(id);
                          setPictureSelected.mutate(
                            { pictureId: id, selected: !chosen },
                            { onSettled: () => setSelecting(0) },
                          );
                        },
                        pending: selecting === (picture.id ?? 0),
                        ariaLabel: chosen
                          ? `take the chosen mark off on-model picture ${picture.ordinal ?? ''}`.trim()
                          : `mark on-model picture ${picture.ordinal ?? ''} as chosen`.trim(),
                        title: chosen
                          ? 'take the mark off — with none chosen, ARTIFACTS goes back to listing every picture of this kind'
                          : 'mark this picture as chosen — ARTIFACTS offers the chosen ones for markup, and more than one picture may carry the mark',
                      }
                    : undefined
                }
                selectLabel={chosen ? 'un-select' : 'select'}
                /* ═══ ПРАВКА — ТОТ ЖЕ УГОЛ, ЧТО У RENDERS (F-15) ═════════════════════════════
                   Условие короче, чем у рендеров, и разница не в небрежности: у выхода рекола не
                   бывает `.glb` — прогон возвращает фотографию, — поэтому проверять нечего, кроме
                   того, что растр вообще приехал. Без него редактор открылся бы над пустотой.
                   `slot` не передаётся: плитка полосы не слот верстака (машинная векторизация
                   внутри честно откажет, рисование поверх работает целиком). */
                onEdit={
                  !writesOff && pictureThumb(picture)
                    ? {
                        onClick: () => setEditingId(picture.id ?? 0),
                        ariaLabel:
                          `edit on-model picture ${picture.ordinal ?? ''} — draw over this picture`.trim(),
                        title:
                          'draw over this picture — saving makes a NEW picture; the original is never overwritten',
                      }
                    : undefined
                }
                /* ⚠ ПОД КАДРОМ — ТОЛЬКО ОТКАЗ. Живая дверь уехала на кадр (разбор в шапке файла),
                   и ряд рисуется лишь тогда, когда в нём есть что сказать: пустой `<div>` — это
                   всё-таки орган, он получает свою отбивку, и ячейки разъезжаются по высоте от
                   того, у какой из них дверь жива. */
                action={
                  !carries ? (
                    <InertDoor label='select' reason={SELECT_MARK_NOT_STATED} />
                  ) : writesOff ? (
                    <InertDoor
                      label={chosen ? 'un-select' : 'select'}
                      reason={
                        disabled
                          ? 'this card is read-only for you — the mark is an edit of the card'
                          : 'this server does not answer the design routes'
                      }
                    />
                  ) : undefined
                }
              />
            );
          })}
        </Strip>
      )}

      {/* ОДИН РЕДАКТОР НА ВЕСЬ РАЗДЕЛ, ПО ИМЕНИ ЦЕЛИ (F-15). Держать его внутри ячейки значило бы
          столько модалок, сколько плиток; булев флаг открыл бы их разом над всеми. Проверка
          «цель ещё в списке» — не педантизм: полоса перечитывается после каждой записи, и
          картинка, исчезнувшая из ответа, оставила бы открытое окно без основы. */}
      {editingId > 0 && outputs.some((o) => (o.picture.id ?? 0) === editingId) && (
        <VectorModal
          open
          onOpenChange={(next: boolean) => !next && setEditingId(0)}
          techCardId={techCardId}
          band={band}
          base={outputs.find((o) => (o.picture.id ?? 0) === editingId)!.picture}
          slot={null}
          disabled={disabled}
        />
      )}

      {/* F-16 (владелец, дословно): сноска «Every recolour this card holds, newest first…» снята
          целиком — вместе с редакцией про страницу ленты, фразой «The mark is a verdict…» и
          предложением «More than one may be chosen». Что из неё уцелело и где:
            · ОХВАТ («вся карточка» против «страницы ленты») — в `question` шапки, обе редакции;
              там же он читает БИНАРЬ, а не длину списка, и это по-прежнему несущее: раздел
              рисуется и с нулём картинок (живой или павший прогон), то есть «список пуст» и
              «сервер поля не знает» встречаются здесь одновременно, а фраза про страницу ленты
              над полным ответом сервера сказала бы владельцу, что часть ОПЛАЧЕННЫХ перекрасок
              потерялась, тогда как не пришло ни одной;
            · МНОЖЕСТВЕННОСТЬ ПОМЕТКИ — в словах угла `select`, то есть там, где её и ставят, и в
              счёте шапки («· N selected»), как только помечена вторая.
          ЧТО УШЛО НАСОВСЕМ: различение «помечено ≠ скрыто» и слова про свёрнутые скрытые. Тем же
          доводом, что у RENDERS (J-19): скрывать картинки по одной этот клиент больше не умеет —
          `hidePicture` жив в шве записи и не вызывается НИ ОДНИМ экраном, — поэтому объяснение
          отличало пометку от жеста, которого на полосе не существует. */}
    </Section>
  );
}
