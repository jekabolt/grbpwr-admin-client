import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useMemo, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { mediaFullToViewerItem, mediaFullViewerSrc } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { useDesignWrites } from '../use-design-band';
import { viewLabel } from '../views';
import {
  SELECT_MARK_NOT_STATED,
  outputsOfKind,
  pictureIsSelected,
  pictureThumb,
  serverStatesSelected,
  stripProvenance,
} from './model';
import { Strip, StripCell } from './strip-cell';

/**
 * ═══ THE OUTPUTS OF ONE KIND, AND THE MARK «CHOSEN» ON THEM — W-12 ════════════════════════════
 *
 * ONE SECTION FOR BOTH GENERATIVE SCREENS. The owner's sentence names 3D («мы так же можем маркать
 * 3д рендеры как выбранные»), but the mark is one notion across the band: ARTIFACTS narrows each
 * of its representations to the chosen pictures of that kind (W-14), so a kind whose outputs had
 * no place to BE chosen would carry a switch position that filters on a mark nobody can set. So
 * the turntable frames get this section on 3D and the fabric renders get the same section on
 * FABRIC RENDER — same cells, same doors, same rules, because two copies would drift by a word.
 * FLATS deliberately have no such section: the bench slot IS the choice for a flat (a slot holds
 * at most one plate), and a second mark there would be two registries of one election.
 *
 * WHY THE VERDICT LIVES BESIDE THE MENU THAT PRODUCES IT. A run comes back as a handful of
 * pictures of ONE ask, and the owner's requirement is to be able to say which of them is THE one.
 * The run history lists every run of the card, of every kind, folded — it answers «what has this
 * card cost», not «which picture did we settle on».
 *
 * THE WRITE GOES THROUGH THE BAND'S ONE SEAM (`useDesignWrites().setPictureSelected`), like every
 * other write of the band. `selected` and `hidden` stay two unrelated statements: hiding says «do
 * not show me this», choosing says «this is the one», a chosen picture may later be hidden, and
 * nothing here folds one gesture into the other. Nothing is exclusive either — the owner speaks
 * in the plural, so the doors toggle each picture on its own and never un-mark a neighbour.
 */
export function OutputsSection({
  band,
  techCardId,
  kind,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  kind: 'render' | 'threed';
  disabled?: boolean;
}): JSX.Element | null {
  // HOOKS ABOVE THE EARLY RETURN, unconditionally — a hook below it would change the hook count
  // between renders and take the whole tree down (React #310; this screen has paid for it once).
  const speaks = serverSpeaksDesign();
  const { setPictureSelected } = useDesignWrites(techCardId);
  const outputs = useMemo(() => outputsOfKind(band, kind), [band, kind]);

  if (!outputs.length) return null;

  // Does the binary that answered state the mark at all? With `EmitUnpopulated` a server that
  // knows the field sends it on EVERY picture (as `false` when unset), so one picture is a
  // truthful sample for all of them — and `undefined` means «rolled-back binary», against which
  // the verb's own route would 404 too, so the doors are drawn inert rather than collecting it.
  const carries = serverStatesSelected(outputs[0].picture);
  const marked = outputs.filter((o) => pictureIsSelected(o.picture)).length;
  const writesOff = !!disabled || !speaks;

  /**
   * ⚠ «FRAME» И «TURNTABLE» БЫЛИ НЕПРАВДОЙ, И ЭТО ПРОВЕРЕНО ПО ЗАДЕПЛОЕННОМУ БЭКЕНДУ, А НЕ ПО
   * ПАМЯТИ. Маршрут 3D — `hitem3d/…/multi-view-to-3d` через fal, и его `Produces` называет ровно
   * два предмета: САМУ МОДЕЛЬ (`.glb`) и растровую миниатюру, которая стоит вместо неё там, где
   * список обязан нарисовать плитку (`internal/designgen/threedfal.go` на origin/beta). Кадров
   * оборота не возвращается ни одного и не возвращалось с тех пор, как поворотный стол сменился
   * сборкой объёма из видов. Слово «кадр» звало человека искать ряд картинок, которого нет.
   */
  const noun = kind === 'threed' ? 'model' : 'render';

  return (
    <Section
      title={kind === 'threed' ? '3D models of this card' : 'renders of this card'}
      question={
        kind === 'threed'
          ? '— the models that came back, and which of them is the chosen one'
          : '— the coloured plates that came back, and which of them are chosen'
      }
      action={
        <Text size='micro' variant='label' component='span' className='uppercase'>
          {outputs.length} {noun}
          {outputs.length === 1 ? '' : 's'}
          {carries ? ` · ${marked} selected` : ''}
        </Text>
      }
    >
      {!carries && (
        <CalloutBox tone='note'>
          <Text size='micro' component='p'>
            <b>this server does not state the mark at all.</b> `DesignPicture.selected` is on this
            contract, and a server that knows it sends it on every picture — this one sent nothing,
            which means a binary older than the field. Nothing is broken; the card simply has no
            record of which {noun} was chosen, and the doors below stay shut until the server
            catches up.
          </Text>
        </CalloutBox>
      )}

      <Strip>
        {outputs.map(({ picture, run }) => {
          const chosen = pictureIsSelected(picture);
          const view = viewLabel((picture.ghostView ?? '').trim());
          const shape =
            kind === 'threed'
              ? `model ${picture.ordinal ?? '—'}`
              : [view, run.rrev ? `r${run.rrev}` : ''].filter(Boolean).join(' · ') ||
                `picture ${picture.ordinal ?? '—'}`;
          return (
            <StripCell
              key={picture.id}
              emphasis={chosen}
              src={pictureThumb(picture)}
              alt={`${noun} ${picture.ordinal ?? ''}`}
              /* Выход прогона встаёт в ОБЩИЙ ряд просмотрщика студии. Без этой строки плитка
                 рисовалась общим примитивом, но кадра в ряд не клала — то есть зума у неё не было
                 вовсе, и «листать по всем картинкам» (T-8) обрывалось ровно на готовых рендерах,
                 ради которых экран и открывают. */
              gallery={
                picture.media && mediaFullViewerSrc(picture.media)
                  ? mediaFullToViewerItem(picture.media)
                  : undefined
              }
              badge={chosen ? 'selected' : undefined}
              lines={[`run ${run.id ?? '—'} · ${shape}`, stripProvenance(band, picture)]}
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
                    /* ПОДПИСЬ НАЗЫВАЕТ ПОСЛЕДСТВИЕ, И У ДВУХ РОДОВ ОНО РАЗНОЕ. Владелец пометил
                       рендер здесь и ждал его в 3D; пока подпись говорила только про ARTIFACTS,
                       пометка выглядела обещанием, которого экран не давал. */
                    title={
                      chosen
                        ? 'take the mark off — with none chosen, ARTIFACTS goes back to listing every picture of this kind'
                        : kind === 'render'
                          ? // ЦЕНА ВТОРОЙ ПОМЕТКИ НА ТУ ЖЕ СТОРОНУ НАЗЫВАЕТСЯ ЗДЕСЬ, ГДЕ ЕЁ И
                            // СТАВЯТ (Д-4). Помечать нескольких кандидатов законно — экран 3D
                            // теперь говорит, кто из них забрал сторону, — но узнавать об этом
                            // только там значит ставить вердикт вслепую.
                            'mark this render as chosen — ARTIFACTS offers the chosen ones for markup, and 3D puts the chosen renders into their sides with one door; if two of them name the same side, that side goes to the newer'
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

      <Text size='nano' variant='label' component='p' className='normal-case'>
        This is the page of the feed the band shipped, newest run first — not every {noun} this
        card has ever produced. The mark is a verdict about a picture and is <b>not</b> the same
        thing as hiding one: a hidden picture is out of sight and can come back, a chosen one is
        what the card is going with — and what ARTIFACTS narrows its list to. More than one may be
        chosen.
        {/* КУДА ВЕДЁТ ПОМЕТКА — СКАЗАНО ТАМ, ГДЕ ЕЁ СТАВЯТ. Она никого никуда не двигает сама:
            сторона поворотного стола исключительна, а помеченных может быть много. */}
        {kind === 'render' && (
          <>
            {' '}
            On <b>3D</b>, the input strip offers to put the renders you chose here into the sides
            they declare — one door, one gesture; the mark itself moves nothing.
          </>
        )}
      </Text>
    </Section>
  );
}
