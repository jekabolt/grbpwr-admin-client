import type {
  GetDesignBandResponse,
  common_DesignPicture,
  common_MediaFull,
} from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useMemo } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';

import {
  CompositeBadge,
  CompositeMarks,
  compositeTail,
  readComposite,
} from './generation/composite';
import { pictureHandle, shelfBatchOrdinals } from './handles';
import { usePickMode } from './pick-mode';
import { mixedInputNote, provenanceLabel, readProvenance } from './provenance';
import { isComposite } from './split-modal';
import {
  isPictureHidden,
  selectVisiblePictures,
  type HideGuard,
} from './visibility';
import { viewLabel } from './views';

/**
 * ЧТО ОСТАЛОСЬ ОТ ЛЕНТЫ. Колонка UPLOADS снесена решением владельца (R-18: «нам в принципе не
 * нужна колонка UPLOADS»), и снос стал возможен только потому, что результат сплита больше не
 * НУЖДАЕТСЯ в полке: кадры уезжают прямо во вход референсов с ролью вида (R-17/R-11 — роли пишет
 * СЕРВЕР в транзакции разреза), а принесённое руками живёт строками входа. Пять функций полки
 * разъехались по своим местам:
 *   1. дверь ручной загрузки → слот «+ reference» блока INPUT — REFERENCES и слоты «+ add …»
 *      пустых мест верстака;
 *   2. витрина принесённого → те же строки входа (и плиты верстака);
 *   3. ОТВЕЧАЮЩАЯ СТОРОНА РЕЖИМА ВЫБОРА → `PickTray` ниже, и это единственный орган, который
 *      здесь ещё рисует плитки;
 *   4. дверь сплита → угловая кнопка split на ячейке входа и на плите верстака
 *      (`split-to-input.tsx`);
 *   5. hide/зум/провенанс пачек → зум остался у входа, верстака и истории; ✕/unhide — у плиток
 *      истории прогонов; учёт пачек (автор·часы·счёт файлов) снесён вместе с полкой — он
 *      бухгалтерил гезту загрузки, а жест теперь оставляет след строкой входа.
 *
 * Читающие хелперы (`bandPictures`, `isPickablePicture`, `buildHideGuard`) остаются здесь: их
 * читают история прогонов и панель прогона, и перевозить их значило бы дёргать чужие файлы ради
 * переезда без смысла.
 */

/* ────────────────────────────── reading the band ────────────────────────────── */

/** Every picture the band shipped, runs and batches alike, hidden ones included. */
export function bandPictures(band: GetDesignBandResponse): common_DesignPicture[] {
  const out: common_DesignPicture[] = [];
  (band.runs ?? []).forEach((run) => out.push(...(run.pictures ?? [])));
  (band.batches ?? []).forEach((batch) => out.push(...(batch.pictures ?? [])));
  return out;
}

/**
 * May this picture be dropped into a bench slot?
 *
 * TWO rules, and only one of them belongs to `visibility.ts`. A hidden picture is unreachable from
 * every picker — that is the frozen module's rule. A COMPOSITE is a second, unrelated refusal: it
 * holds several views at once, a slot holds one, and the contract says it «is not clickable into a
 * slot and must be split first». Folding compositeness into the visibility module would put a
 * second, non-visibility register into the one file that exists to keep invisibility singular.
 */
export function isPickablePicture(picture: common_DesignPicture): boolean {
  return !isPictureHidden(picture) && !isComposite(picture);
}

/**
 * The four preconditions of `HideDesignPicture`, gathered from the band that is already on screen.
 *
 * TWO OF THE FOUR ARE ADDRESSED BY MEDIA, NOT BY PICTURE. A frozen sheet plate carries
 * `media`, and a run's input snapshot carries `media_id` — neither carries a picture id, because
 * both froze a FILE rather than a row. So they are resolved the only way they can be: media id →
 * every picture standing on that media.
 *
 * AND THE VERSION HALF IS DELIBERATELY UNDER-APPROXIMATE. The band ships only the LATEST version in
 * full (`version_numbers` is a list of integers), so a plate frozen in v1 but absent from v3 is not
 * seen here and its picture will be offered a ✕ that the server then refuses with `in_version`.
 * That refusal names the same reason this guard would have named — which is exactly why the codes
 * in `visibility.ts` are the server's own strings and not a second vocabulary.
 */
export function buildHideGuard(band: GetDesignBandResponse): HideGuard {
  const pictures = bandPictures(band);

  const byMedia = new Map<number, number[]>();
  pictures.forEach((picture) => {
    const mediaId = picture.media?.id ?? 0;
    const pictureId = picture.id ?? 0;
    if (mediaId <= 0 || pictureId <= 0) return;
    const bucket = byMedia.get(mediaId);
    if (bucket) bucket.push(pictureId);
    else byMedia.set(mediaId, [pictureId]);
  });
  const picturesOfMedia = (mediaId?: number) =>
    mediaId && mediaId > 0 ? byMedia.get(mediaId) ?? [] : [];

  const slotPictureIds = new Set<number>();
  (band.bench ?? []).forEach((slot) => {
    const id = slot.pictureId ?? 0;
    if (id > 0) slotPictureIds.add(id);
  });

  const versionPlatePictureIds = new Set<number>();
  (band.latestVersion?.plates ?? []).forEach((plate) => {
    picturesOfMedia(plate.media?.id).forEach((id) => versionPlatePictureIds.add(id));
  });

  const liveRunInputPictureIds = new Set<number>();
  (band.runs ?? [])
    .filter((run) => run.status === 'pending' || run.status === 'running')
    .forEach((run) => {
      (run.inputs?.slots ?? []).forEach((slot) => {
        picturesOfMedia(slot.mediaId || slot.media?.id).forEach((id) =>
          liveRunInputPictureIds.add(id),
        );
      });
      (run.inputs?.refs ?? []).forEach((ref) => {
        picturesOfMedia(ref.mediaId || ref.media?.id).forEach((id) =>
          liveRunInputPictureIds.add(id),
        );
      });
    });

  const cropParentPictureIds = new Set<number>();
  pictures.forEach((picture) => {
    const parent = picture.derivedFrom ?? 0;
    if (parent > 0) cropParentPictureIds.add(parent);
  });

  return {
    slotPictureIds,
    versionPlatePictureIds,
    liveRunInputPictureIds,
    cropParentPictureIds,
  };
}

/** Which bench slot this picture stands in, spoken the way the slot is spoken. */
function slotNameOfPicture(band: GetDesignBandResponse, pictureId: number): string {
  const slot = (band.bench ?? []).find((s) => (s.pictureId ?? 0) === pictureId);
  if (!slot) return '';
  return (slot.detailName ?? '').trim() || viewLabel(slot.viewKey) || 'a slot';
}

function thumbOf(media?: common_MediaFull): string {
  const m = media?.media;
  return m?.thumbnail?.mediaUrl || m?.compressed?.mediaUrl || m?.fullSize?.mediaUrl || '';
}

/* ────────────────────────────── the answering tray ────────────────────────────── */

/**
 * ПЛИТКА ТОЛЬКО ДЛЯ ВЗВЕДЁННОГО ВЫБОРА. У неё нет подвала глаголов (zoom/split/✕): пока слот
 * взведён, плитка отвечает ровно на один жест — «поставить эту», и любая вторая кнопка внутри
 * кликабельной плитки была бы кнопкой в кнопке. Непригодная плитка не прячется, а стоит
 * притушенной со СЛОВАМИ причины: пропавшая из виду картинка неотличима от сломанного режима.
 */
function TrayTile({
  band,
  picture,
  shelfOrdinal,
  onResolve,
  targetLabel,
}: {
  band: GetDesignBandResponse;
  picture: common_DesignPicture;
  shelfOrdinal?: number | null;
  onResolve: (pictureId: number) => void;
  targetLabel: string;
}) {
  const facts = readComposite(band, picture);
  const composite = facts.declared;
  const provenance = readProvenance(picture);
  const handle = pictureHandle(picture, { shelfOrdinal });
  const pictureId = picture.id ?? 0;
  const inSlot = slotNameOfPicture(band, pictureId);
  const pickable = isPickablePicture(picture);
  const mixed = mixedInputNote(provenance);

  const thumb = thumbOf(picture.media);
  const media = (
    <div
      // МАТ БЕЛЫЙ (bg-bgColor), НЕ СЕРЫЙ (R-12). Кадр навязан 4:5 c object-contain, и всё, что не
      // покрыто снимком, — мат; серый bg-bgSecondary делал «белый фон стал серым» на каждом кропе
      // не-4:5, а у PNG с честной прозрачностью просвечивал СКВОЗЬ картинку.
      className='relative w-full bg-bgColor'
      style={{ aspectRatio: '4 / 5' }}
    >
      {thumb ? (
        <img
          src={thumb}
          alt={handle}
          loading='lazy'
          className='absolute inset-0 block h-full w-full'
          style={{ objectFit: 'contain' }}
        />
      ) : (
        <span className='absolute inset-0 flex items-center justify-center'>
          <Text size='nano' variant='label' component='span'>
            no image
          </Text>
        </span>
      )}
      {/* Одна метка на каждый склеенный вид у композита; иначе — слот или догадка о виде.
          Взаимоисключимо по построению: композит не может стоять в слоте. */}
      {composite ? (
        <CompositeMarks facts={facts} />
      ) : inSlot ? (
        <span className='absolute left-0 top-0 bg-textColor px-1 text-nano uppercase text-bgColor'>
          {inSlot}
        </span>
      ) : picture.ghostView ? (
        <span className='absolute left-0 top-0 bg-bgColor px-1 text-nano uppercase text-labelColor'>
          probably {viewLabel(picture.ghostView)}
        </span>
      ) : null}
      <CompositeBadge facts={facts} />
    </div>
  );

  const sub = (
    <>
      {provenanceLabel(provenance)}
      {compositeTail(facts)}
      {mixed ? ` · ${mixed}` : ''}
    </>
  );

  return (
    <Tile
      media={media}
      name={handle}
      sub={sub}
      selected={pickable}
      onClick={pickable ? () => onResolve(pictureId) : undefined}
      title={
        pickable
          ? `put ${handle} into ${targetLabel}`
          : 'a composite holds several views — split it first'
      }
      className={cn(!pickable && 'opacity-40')}
    >
      {!pickable && (
        <Text size='nano' variant='label' component='span' className='mt-1 truncate'>
          split it first
        </Text>
      )}
    </Tile>
  );
}

/**
 * ОТКАЗ РЕЖИМА ВЫБОРА, СЛОВАМИ — и только отказ. Пока кандидаты есть, орган молчит: баннер «choosing
 * for …» уже висит у композитора. Говорит он ровно тогда, когда взведённый слот смотрит на полосу,
 * которой нечего предложить, — иначе это неотличимо от сломанного режима. С дверей верстака сюда
 * почти не попасть (пустая полоса делает дверь инертной с причиной), но полоса живая: последний
 * кандидат может спрятаться или уйти под разрез, пока выбор взведён.
 */
function PickModeNote({ band }: { band: GetDesignBandResponse }) {
  const pick = usePickMode();
  if (!pick.target) return null;

  const pictures = bandPictures(band);
  if (pictures.some(isPickablePicture)) return null;

  const hidden = pictures.filter(isPictureHidden).length;
  const composites = pictures.filter(isComposite).length;
  // Дверь «+ add files» умерла вместе с полкой (R-18) — учим живые двери, а не снесённую.
  const why = !pictures.length
    ? 'there is not a single picture on this card yet — bring files in with «+ reference» in the input block, or straight onto an empty slot.'
    : [
        composites
          ? `${composites} composite${composites === 1 ? '' : 's'} must be split first`
          : '',
        hidden ? `${hidden} hidden` : '',
      ]
        .filter(Boolean)
        .join(' · ');

  return (
    <CalloutBox tone='error'>
      <b>nothing here can go into {pick.target.label}.</b> {why} Esc cancels.
    </CalloutBox>
  );
}

/**
 * ЛОТОК ВЫБОРА — отвечающая сторона режима выбора для принесённого руками, и НАСЛЕДНИК ПОЛКИ
 * (R-18) в единственной её роли, которую больше некому играть.
 *
 * ПОЧЕМУ ОН НУЖЕН, ХОТЯ КОЛОНКИ НЕТ. Кандидатов выбора собирает `pickableFlats` — прогоны И пачки.
 * Прогоны отвечают плитками истории; пачечные картинки (кропы сплита, старые ручные загрузки)
 * после сноса полки не рисует НИКТО. Без лотка дверь «or mark a picture from the band» взводила бы
 * режим над экраном, где нечего нажать, — живая дверь в никуда, ровно Г12. Проверять «есть ли
 * поверхность» внутри чужого `pickEmptyReason` нельзя (файл верстака не наш), значит поверхность
 * обязана быть.
 *
 * ПОЧЕМУ ОН ВИДЕН ТОЛЬКО ПРИ ВЗВЕДЁННОМ ВЫБОРЕ. Владелец снёс ПОСТОЯННУЮ колонку: вне выбора эти
 * картинки живут строками входа и плитами верстака, и вторая постоянная витрина вернула бы снесённое
 * под другим именем. Лоток — орган РЕЖИМА, как баннер: появился со взводом, ушёл с Esc.
 *
 * ТОЛЬКО ПАЧКИ. Прогоны здесь не рисуются — их плитки в истории уже отвечают выбору, и одна
 * картинка на двух поверхностях резолвила бы один клик двумя местами.
 */
export function PickTray({ band }: { band: GetDesignBandResponse }): JSX.Element | null {
  const pick = usePickMode();

  const ordinals = useMemo(() => shelfBatchOrdinals(band.batches ?? []), [band.batches]);
  const rows = useMemo(
    () =>
      (band.batches ?? [])
        .map((batch) => ({
          ordinal: ordinals.get(batch.id ?? 0),
          // Спрятанное не предлагается ни из одного пикера — правило visibility, без люка.
          pictures: selectVisiblePictures(batch.pictures ?? []),
        }))
        .filter((row) => row.pictures.length > 0)
        // Свежее — первым: часовой порядок уже тотален в ординале (fallback на id).
        .sort((a, b) => (b.ordinal ?? 0) - (a.ordinal ?? 0)),
    [band.batches, ordinals],
  );

  if (!pick.target) return null;

  const count = rows.reduce((n, row) => n + row.pictures.length, 0);
  const label = pick.target.label;

  return (
    <>
      <PickModeNote band={band} />
      {count > 0 && (
        <Section
          id='design-pick-tray'
          title='brought by hand'
          question={`— click a picture to put it into ${label}; run outputs answer in the history above`}
          action={
            <Text size='micro' variant='label' component='span'>
              {count} picture{count === 1 ? '' : 's'}
            </Text>
          }
        >
          <Tiles min={140}>
            {rows.flatMap((row) =>
              row.pictures.map((picture) => (
                <TrayTile
                  key={picture.id}
                  band={band}
                  picture={picture}
                  shelfOrdinal={row.ordinal}
                  targetLabel={label}
                  onResolve={(pictureId) => pick.resolve(pictureId)}
                />
              )),
            )}
          </Tiles>
        </Section>
      )}
    </>
  );
}
