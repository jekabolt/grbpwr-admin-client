import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useMemo, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { mediaFullToViewerItem, mediaFullViewerSrc } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { serverStatesOutputs } from '../bench-kinds';
import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { isRunLive, runOutcomeNote } from '../generation/run-state';
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
 * RECOLOURED PICTURES OF THIS CARD — то, что вернулось, и который из них выбран.
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
      title='recoloured pictures of this card'
      question='— what came back, one picture per photograph, and which of them are chosen'
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
                emphasis={chosen}
                src={pictureThumb(picture)}
                alt={`recoloured picture ${picture.ordinal ?? ''}`}
                gallery={
                  picture.media && mediaFullViewerSrc(picture.media)
                    ? mediaFullToViewerItem(picture.media)
                    : undefined
                }
                badge={chosen ? 'selected' : undefined}
                /* ВИДА ЗДЕСЬ НЕТ, И ЭТО ЧЕСТНО: `ghost_view` перекраски пуст — сторона снимка не
                   объявлена ни файлом, ни сервером, и подставить её значило бы выдумать факт. */
                lines={[`run ${run.id ?? '—'} · ${shape}`, 'recoloured · no view declared']}
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
                  ) : (
                    <Button
                      variant='secondary'
                      size='xs'
                      disabled={setPictureSelected.isPending}
                      onClick={() =>
                        setPictureSelected.mutate({
                          pictureId: picture.id ?? 0,
                          selected: !chosen,
                        })
                      }
                      title={
                        chosen
                          ? 'take the mark off — with none chosen, ARTIFACTS goes back to listing every picture of this kind'
                          : 'mark this picture as chosen — ARTIFACTS offers the chosen ones for markup'
                      }
                    >
                      {chosen ? 'un-select' : 'select'}
                    </Button>
                  )
                }
              />
            );
          })}
        </Strip>
      )}

      {/* ⚠ ЧИТАЕТСЯ БИНАРЬ, А НЕ ДЛИНА СПИСКА, И ЗДЕСЬ ЭТО ЕДИНСТВЕННОЕ МЕСТО ПОЛОСЫ, ГДЕ РАЗНИЦА
          ВИДНА. Раздел рисуется и с нулём картинок — когда на странице есть живой или павший
          прогон, — то есть «список пуст» и «сервер поля не знает» встречаются здесь одновременно.
          Фраза про страницу ленты над полным ответом сервера говорила бы владельцу, что часть
          ОПЛАЧЕННЫХ перекрасок где-то потерялась, тогда как не пришло ни одной. */}
      <Text
        size='nano'
        variant='label'
        component='p'
        /* Тот же контракт значений, что у RENDERS: `whole` | `page`. */
        data-outputs-note={serverStatesOutputs(band) ? 'whole' : 'page'}
        className='normal-case'
      >
        {serverStatesOutputs(band)
          ? 'Every recolour this card holds, newest first; hidden ones are folded away.'
          : 'This is the page of the feed the band shipped, newest run first — not every recolour this card has ever produced.'}{' '}
        The mark is a verdict about a picture and is <b>not</b> the same thing as hiding one. More
        than one may be chosen.
      </Text>
    </Section>
  );
}
