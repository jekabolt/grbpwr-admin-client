import type {
  GetDesignBandResponse,
  common_DesignAsset,
  common_DesignPicture,
} from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { Placeholder } from 'ui/components/placeholder';
import { Section } from 'ui/components/section';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';

import {
  ASSET_FABRIC,
  ASSETS_PER_CARD_MAX,
  assetFull,
  assetIsPattern,
  assetLabel,
  assetThumb,
  clothShelf,
  placementsOfAsset,
  unmanagedAssets,
} from '../assets/model';
import { useAssetWrites } from '../assets/use-assets';
import { PictureTile } from '../picture-tile';
import { newClientRequestId, useDesignWrites } from '../use-design-band';
import { SILHOUETTE_VIEWS, viewLabel } from '../views';
import { benchSides, feedIsTruncated, pictureThumb, stripProvenance, unmarkedFlats } from './model';
import { CELL_WIDTH, Strip, StripCell, StripDivider } from './strip-cell';

/**
 * INPUT — FLATS OF THIS CARD. What a fabric render is actually made from.
 *
 * THE LINE DOWN THE MIDDLE IS THE WHOLE ORGAN. Left of it: the drawings the render reads, one per
 * view, each with its provenance — which is the bench, seen from the render's side rather than the
 * sheet's. Right of it: every other flat this card holds, generated or brought by hand, each with a
 * `mark ▸` that puts it in a slot. The two halves are the same pictures under two different
 * questions, and the prototype's own footnote says the thing that makes the screen safe to use:
 * marking one DISPLACES the picture that held the slot, and nothing is deleted.
 *
 * THE TWO HALVES ARE GATHERED FROM DIFFERENT PLACES, and they have to be. A bench slot carries its
 * RESOLVED plate however old the picture is, so the left side is always complete. The right side
 * can only list what the band shipped — one page of the feed — so when there is more, the strip
 * says so rather than letting a technologist conclude that a drawing he uploaded last week has
 * disappeared.
 *
 * THE SECTION HOLDS A SECOND INPUT, AND IT STANDS IN THE SAME LINE (Y-12, then K-9). After the four
 * view slots come the CLOTHS: the fabric textures of this card. A render is made FROM the drawings
 * and OF the cloth, and both are read by the same run, so both stand left of the line, in one
 * strip, in one glance. They were two labelled rows for one wave and the owner had them joined —
 * see `useClothRun` for what that argument got right and what it got wrong. The door moved here
 * because the ASSETS section that used to hold it was removed (Y-11), and its reader — the CLOTHS
 * row of the render menu — was not.
 *
 * A HAND FILE WAS ALWAYS LEGAL INPUT HERE. Nothing on this card requires a run: an uploaded flat
 * sits on the right of the line exactly like a generated one, marks into a slot exactly like one,
 * and feeds the render exactly like one. That is why the classification refuses a picture only on
 * positive evidence that it is an OUTPUT of the machine (see `isFlatCandidate`), and admits
 * everything else.
 *
 * ЭТОТ ЭКРАН БОЛЬШЕ НЕ ДЕРЖИТ СВОЕГО ПРОСМОТРЩИКА (T-8). Здесь стоял свой `MediaViewer` со своим
 * рядом, собранным из плит ЭТОЙ полосы, и своя угловая кнопка `zoom`, нарисованная руками. Значит
 * зум листал четыре флэта и упирался в край — до референсов, истории генераций и верстака из него
 * было не добраться, хотя владелец просил ровно обратного: «что бы можно было в зум вью по всем
 * картинкам из всех генераций итерироваться не только этой».
 *
 * Теперь ячейка объявляет только КАДР (`gallery`), а показывает его ОДИН `PictureGalleryProvider`
 * на всю студию (смонтирован в `studio-tab.tsx`). Ряд собирают сами плитки и сортируются по
 * порядку в документе, поэтому человек листает ровно то, что видит.
 */

/** Radix forbids an empty item value, and an empty one reaching `Select.Root` shows a placeholder
 *  where a label should be — so «mark ▸» is a sentinel, never `''`. */
const MARK_PROMPT = '__mark__';

/**
 * ═══ CLOTH — ВТОРОЙ ВХОД ЭТОЙ СЕКЦИИ, И ОН ПРИЕХАЛ СЮДА ИЗ СНЯТЫХ ПОЛОК (Y-11 + Y-12) ══════════
 *
 * Владелец: «в INPUT — FLATS OF THIS CARD добавь ещё одно поле загружаемое: это фактура ткани».
 * Секция ASSETS, где фактуру заводили раньше, снята целиком — а ряд CLOTHS в меню FABRIC RENDER
 * по-прежнему берёт ткани с полки карточки. То есть дверь нельзя было просто закрыть: закрытая,
 * она оставила бы читателя без единственного писателя, и CLOTHS навсегда остался бы пуст.
 *
 * ЧТО ЭТА ДВЕРЬ ПИШЕТ — ТО ЖЕ САМОЕ, ЧТО ПИСАЛА ПОЛКА: `UpsertDesignAsset` рода `fabric`. Ни одного
 * нового поля, ни одной новой ручки; цепочка «загрузили → чип в CLOTHS → `params.colour.fabrics`»
 * та же, что была, и история прогонов остаётся читаемой.
 *
 * ⚠ ЗДЕСЬ СТОЯЛ ДОВОД «ПОЧЕМУ ЭТО ОТДЕЛЬНАЯ ГРУППА, А НЕ ЯЧЕЙКА В ПОЛОСЕ ФЛЭТОВ». ОН ОТМЕНЁН
 * ВЛАДЕЛЬЦЕМ (K-9), И ОТМЕНЁН ПО ДЕЛУ — записываю обе половины, чтобы следующий читатель не
 * восстановил снятое как «было же написано».
 *
 * Довод был: флэт — ЧЕРТЁЖ, который рендер раскрашивает, фактура — МАТЕРИАЛ, которым он красит;
 * в одном ряду они читались бы как один список с одним вопросом, а «отметить в слот front» у
 * лоскута ткани смысла не имеет вовсе. Первая половина верна и сегодня: ТКАНЬ — НЕ ВИД. Виды это
 * четыре проекции ОДНОГО изделия, каждая занимает слот (`SetDesignBenchSlot`, `view_key`, ровно
 * один снимок на слот); ткань — материал, её пишет `UpsertDesignAsset`, слота у неё нет, число не
 * ограничено четырьмя, и «отметить в front» ей нечем.
 *
 * Ошибка была во второй половине — в том, ЧТО ИМЕННО спрашивает эта лента. Она спрашивает не «под
 * каким углом снято», а «из чего собирается рендер», и на этот вопрос чертёж и ткань — два ответа
 * одного рода. Ряд, разорванный надвое абзацем прозы, заставлял читать один ответ в два приёма.
 * Владелец ходит по этому экрану каждый день и увидел это раньше, чем довод успел устареть на
 * бумаге.
 *
 * КАДР РЕЖЕТСЯ (`cover`), А НЕ ВПИСЫВАЕТСЯ. Флэты стоят `contain`, потому что у чертежа обрезанный
 * край — потерянный контур изделия. У лоскута края нет: это образец плетения, и поля вокруг него
 * показывали бы фактуру мельче, чем она есть.
 *
 * ИМЯ ЧЕКАНИТСЯ ЗДЕСЬ, И ЭТО СОЗНАТЕЛЬНАЯ ПОТЕРЯ. Сервер безымянный ассет отвергает, а полка
 * спрашивала имя отдельным редактором — редактора больше нет, и заводить его заново значило бы
 * вернуть полку под другим названием. Имени файла на проводе нет (`common_MediaFull` его не
 * несёт), так что «IMG_4471» не грозит; ассет получает `cloth N`, а СКАЗАТЬ, что это за ткань,
 * человек по-прежнему может словами в поле IN WORDS того же прогона.
 *
 * ═══ РЯД ПОКАЗЫВАЕТ ОБЕ ПОЛКИ, А ЗАВОДИТ ОДНУ (Д-1) ═══════════════════════════════════════════
 *
 * Этот ряд был писателем ОДНОЙ полки (`fabric`), а его читатель — ряд CLOTHS в меню FABRIC RENDER
 * — брал ДВЕ (`fabric` + `pattern`). Значит на карточке, размеченной до снятия секции ASSETS,
 * ассет-паттерн стоял чипом, выбирался и уезжал в промпт, но плитки не имел: увидеть и удалить его
 * было НЕЛЬЗЯ НИГДЕ во всей админке. Замер: одна ткань и один паттерн давали два чипа и одну
 * плитку.
 *
 * Разрыв закрыт в сторону ПОКАЗА: состав ряда теперь называет `clothShelf` — та же функция, что
 * читает палитра, — и паттерн получает свою плитку, свой «✕» и слово `pattern` под именем. Обратный
 * ход (сузить читателя) молча изменил бы промпт выпущенных карточек и оставил бы строки в базе без
 * единого органа. Полный довод — в шапке `clothShelf` (`../assets/model`).
 *
 * НОВЫЙ ПАТТЕРН ЗДЕСЬ НЕ ЗАВОДИТСЯ: он ткань ПЛЮС раппорт и поворот, а редактора этих чисел не
 * осталось. Дверь честно шлёт `fabric`, и это сказано на самих плитках паттернов, а не только тут.
 */
function nextClothName(taken: common_DesignAsset[]): string {
  // `taken` — ВЕСЬ ряд, ткани и паттерны вместе (Д-1). Имя должно быть уникально по тому, что
  // ВИДНО и что уезжает в промпт: паттерн, названный когда-то «cloth 3», занимает это слово, и
  // выдать его второй раз значило бы отправить модели две разные вещи под одним именем.
  const names = new Set(taken.map((a) => (a.name ?? '').trim().toLowerCase()));
  // Первое свободное, а не «сколько есть + 1»: после удаления второй из трёх счётчик выдал бы
  // имя, которое уже занято, и две разные ткани уехали бы в промпт под одним словом.
  for (let n = 1; n <= ASSETS_PER_CARD_MAX + 1; n += 1) {
    if (!names.has(`cloth ${n}`)) return `cloth ${n}`;
  }
  return `cloth ${taken.length + 1}`;
}

/**
 * ═══ CLOTH ВЕРНУЛСЯ В ЛИНИЮ, И ПОЭТОМУ ЭТО ХУК, А НЕ КОМПОНЕНТ (K-9) ══════════════════════════
 *
 * Владелец: «CLOTH должен быть дальше в линии с фронт бэк сайд л р и т д а не снизу». Ткани стояли
 * ВТОРЫМ рядом под первым, отделённые от него абзацем прозы, — то есть человек, читающий вход
 * рендера, читал его в два приёма и в двух местах.
 *
 * Одна лента не даётся компонентом: ячейки обязаны стать ДЕТЬМИ того же `<Strip>`, что и виды
 * (иначе это снова два ряда), а подпись потолка, прозу и вопрос удаления рисовать внутри ленты
 * нельзя — они не ячейки. Значит орган отдаёт свои части врозь, а состояние (`pendingRemove`) и
 * писателей держит у себя, в одном месте. Компонент, отрендеренный дважды, держал бы два разных
 * `pendingRemove`, и «ok» в одном не закрыл бы вопрос в другом.
 *
 * ЛИНИЯ (`StripDivider`) НЕ СДВИНУЛАСЬ, И ЭТО НЕ СЛУЧАЙНОСТЬ. Она отделяет «что рендер читает» от
 * «всё остальное на карточке». Ткань рендер читает — значит ткани стоят СЛЕВА от неё, сразу за
 * видами, а не в конце ленты. Поставить их справа значило бы сохранить слово владельца и потерять
 * смысл линии.
 */
function useClothRun({
  band,
  techCardId,
  disabled,
  onMakePattern,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /** K-16: увести на вкладку PATTERN. Не задан — второй двери у плейсхолдера нет. */
  onMakePattern?: () => void;
}): { cells: JSX.Element; count: number; notes: JSX.Element; modal: JSX.Element } {
  const writes = useAssetWrites(techCardId);
  const { showMessage } = useSnackBarStore();
  // ОДНА ФУНКЦИЯ НА ЧИТАТЕЛЯ И ПИСАТЕЛЯ (Д-1) — ткани И паттерны, ровно то, что берёт CLOTHS.
  const cloths = useMemo(() => clothShelf(band), [band]);
  const [pendingRemove, setPendingRemove] = useState<common_DesignAsset | null>(null);

  /**
   * ПОТОЛОК СЧИТАЕТСЯ ПО ВСЕЙ КАРТОЧКЕ, И ЭТО ЧЕСТНО ДАЖЕ ТЕПЕРЬ, КОГДА УПРАВЛЯТЬ МОЖНО НЕ ВСЕМ.
   *
   * Он ЗЕРКАЛО СЕРВЕРНОГО: `UpsertDesignAsset` отвергает 41-й ассет карточки независимо от полки,
   * и считать здесь только ткани значило бы обещать дверь, которую отвергнет провод. Но у зеркала
   * была цена, и она и есть Д-2: место могло быть занято родом, у которого на этом экране нет ни
   * одной плитки (`hardware` легаси-карточки), — и человек читал «the card holds 40 assets», не
   * имея НИ ОДНОГО способа его освободить и ни одного слова о том, чем оно занято.
   *
   * Поэтому потолок остался общим, а ОТЧЁТ стал раздельным: сколько мест держит этот ряд и сколько
   * — то, чего он не показывает. Числа собираются здесь, слова — у самой двери.
   */
  const totalAssets = (band.assets ?? []).length;
  const unmanaged = useMemo(() => unmanagedAssets(band), [band]);
  const full = totalAssets >= ASSETS_PER_CARD_MAX;
  const marksOnPending = pendingRemove ? placementsOfAsset(band, pendingRemove.id ?? 0).length : 0;

  /**
   * ПОЧЕМУ ДВЕРЬ ЗАКРЫТА — СЛОВАМИ, А НЕ ЧИСЛОМ. Причина стоит и в `data-inert`, и в `title`: это
   * единственное, что человек прочтёт, обнаружив, что плейсхолдер не кликается.
   */
  const fullReason =
    unmanaged.length === 0
      ? `the card is at its limit of ${ASSETS_PER_CARD_MAX} assets, all of them in this row — remove one below to make room`
      : cloths.length === 0
        ? `the card is at its limit of ${ASSETS_PER_CARD_MAX} assets, and every one of them is hardware from the removed ASSETS shelves — nothing on this screen can free a place, so this card cannot take a cloth`
        : `the card is at its limit of ${ASSETS_PER_CARD_MAX} assets: ${cloths.length} in this row and ${unmanaged.length} hardware from the removed ASSETS shelves, which no screen can remove any more — free a place by removing a cloth below`;

  /* ПОДПИСИ ГРУППЫ ЗДЕСЬ БОЛЬШЕ НЕТ: `GroupLabel` — строка НАД лентой, а лента теперь одна на
     виды и ткани, и второй заголовок над ней подписывал бы чужую половину. Счёт тканей уехал в
     `action` самой секции, к двум другим числам входа; род каждой плитки называет её собственная
     подпись («CLOTH 1»), а не заголовок над рядом. */
  const cells = (
    <>
        {cloths.map((a) => {
          const id = a.id ?? 0;
          const name = assetLabel(a);
          const url = assetThumb(a);
          const marks = placementsOfAsset(band, id).length;
          const pattern = assetIsPattern(a);
          /* ВТОРАЯ СТРОКА — ТОЛЬКО ФАКТЫ, КОТОРЫХ НЕ ВИДНО НА КАДРЕ. Род называется словом лишь у
             паттерна: ткань — умолчание этого ряда, и подписывать её «fabric» под группой CLOTH
             значило бы повторять подпись. Паттерн же ОТЛИЧАЕТСЯ и судьбой (нового такого здесь не
             завести), и числом (раппорт), а на глаз лоскут от набивки не отличить. */
          const notes = [
            pattern ? ['pattern', a.repeatMm ? `${a.repeatMm} mm` : ''].filter(Boolean).join(' · ') : '',
            marks > 0 ? `${marks} marked` : '',
          ].filter(Boolean);
          return (
            <div key={`cloth-${id}`} className={`flex flex-col gap-1 ${CELL_WIDTH}`}>
              <PictureTile
                url={url}
                alt={name}
                aspect='132/148'
                fit='cover'
                className='w-full bg-bgColor'
                gallery={
                  url ? { src: assetFull(a), thumbnail: url, type: 'image', alt: name } : undefined
                }
                /* ✕ ПРИМИТИВА ЗДЕСЬ ЗНАЧИТ ИМЕННО «УБРАТЬ», и это не то же самое, что «unmark»
                   слева от линии. Там пустеет слот, а плита остаётся на карточке; здесь ткань
                   уходит с карточки совсем. Убрать эту кнопку было бы дешевле — и оставило бы
                   единственного писателя тканей БЕЗ отката: ошибочная загрузка висела бы чипом в
                   CLOTHS вечно, потому что снять её больше негде во всей админке. */
                onRemove={
                  disabled
                    ? undefined
                    : {
                        onClick: () => setPendingRemove(a),
                        ariaLabel: `remove ${name}`,
                        title: pattern
                          ? 'remove this pattern from the card'
                          : 'remove this cloth from the card',
                      }
                }
              />
              <Text size='nano' component='span' className='min-w-0 truncate font-bold uppercase'>
                {name}
              </Text>
              {/* ВТОРАЯ СТРОКА ТОЛЬКО ТОГДА, КОГДА ЕЙ ЕСТЬ ЧТО СКАЗАТЬ. Здесь стояло слово
                  «texture» на каждой ячейке — под группой, которая и так называется CLOTH, оно
                  повторяло подпись и читалось как украшение. Метки же — настоящий факт, и на
                  карточке, размеченной до снятия ASSETS, это единственное место, где их вообще
                  видно; они же назовут цену удаления в вопросе ниже. */}
              {notes.length > 0 && (
                <Text size='nano' variant='label' component='span'>
                  {notes.join(' · ')}
                </Text>
              )}
            </div>
          );
        })}

        {!disabled && (
          <div className={`flex flex-col gap-1 ${CELL_WIDTH}`}>
            {/* ═══ ДВЕРЬ НА ПОТОЛКЕ ГАСНЕТ, А НЕ ГЛОТАЕТ (Д-2) ═════════════════════════════════
                Здесь стоял живой `MediaSlot`, а отказ жил ПОСЛЕДНЕЙ строкой обработчика:
                `if (!first?.id || full) return`. Человек проходил приёмную модалку целиком —
                превью, кроп, подтверждение — и не происходило НИЧЕГО, без единого слова. Это
                худший из возможных отказов: он неотличим от поломки.

                Теперь на потолке рисуется мёртвый кадр с причиной (`data-inert` + `title`),
                ровно по общему закону полосы: вырезанное — инертно и с доводом, а не отсутствует.
                Тот же кадр, те же пропорции; исчезает только жест, который всё равно ничего не
                делал. */}
            {full ? (
              <span data-inert={fullReason} title={fullReason} className='block w-full'>
                <Placeholder
                  label='+ cloth'
                  dashed
                  style={{ aspectRatio: '132/148' }}
                  className='w-full'
                />
              </span>
            ) : (
              <MediaSlot
                aspectRatio={['Custom']}
                frameAspect='132/148'
                label='+ cloth'
                hint={null}
                purpose='design · cloth texture of this tech card'
                showVideos={false}
                editMode
                onSelect={(media) => {
                  const first = media[0];
                  if (!first?.id) return;
                  /* ВТОРАЯ ПРОВЕРКА ПОТОЛКА, И ОНА ГОВОРИТ ВСЛУХ. Дверь погашена по полосе,
                     прочитанной ЭТИМ рендером, а между её отрисовкой и подтверждением модалки
                     стоит целая прогулка человека: соседняя вкладка успевает добрать потолок.
                     Молчать в этом случае — тот же дефект под другим именем, поэтому здесь не
                     `return`, а сообщение. Сам вызов не отправляется: сервер отказал бы, и отказ
                     пришёл бы теми же словами, но на секунду позже и без числа. */
                  if (totalAssets >= ASSETS_PER_CARD_MAX) {
                    showMessage(fullReason, 'error');
                    return;
                  }
                  writes.upsertAsset.mutate({
                    // `assetId: 0` заводит. Род — УТВЕРЖДЕНИЕ этой двери: она стоит под подписью
                    // CLOTH, значит через неё приходит ткань. По пикселям это не восстановимо.
                    assetId: 0,
                    kind: ASSET_FABRIC,
                    name: nextClothName(cloths),
                    mediaId: first.id,
                  });
                }}
              />
            )}
            <Text size='nano' variant='label' component='span' className='normal-case'>
              {/* ПОДПИСЬ НАЗЫВАЕТ ЧИСЛА, А НЕ ТОЛЬКО ФАКТ. «the card holds 40 assets» не отвечало
                  на единственный вопрос человека — что убрать; при потолке, добранном фурнитурой,
                  оно ещё и звало убирать то, чего на экране нет. */}
              {!full
                ? 'optional'
                : unmanaged.length === 0
                  ? `${ASSETS_PER_CARD_MAX} of ${ASSETS_PER_CARD_MAX} — remove one below`
                  : `${ASSETS_PER_CARD_MAX} of ${ASSETS_PER_CARD_MAX} — ${cloths.length} here, ${unmanaged.length} hardware`}
            </Text>
            <Text size='nano' variant='label' component='span'>
              {full ? 'at the limit' : '⌘V · drop · browse'}
            </Text>
            {/* ═══ ВТОРАЯ ДВЕРЬ ПЛЕЙСХОЛДЕРА (K-16) ══════════════════════════════════════════
                Дословно владелец: «на плейсхолдере фабрик можно выбрать из библиотеки или же оно
                должно предлагать сделать это как паттерн». Две двери, «или же» — и обе стоят на
                одной ячейке: слева взять готовую ткань, ниже — уйти делать повторяемую плитку.

                ДВЕРЬ РИСУЕТСЯ, ТОЛЬКО КОГДА ЕЙ ЕСТЬ КУДА ВЕСТИ. Без `onMakePattern` монтирующий
                экран не умеет переключать представление — кнопка, которая никуда не ведёт, хуже
                её отсутствия. И она НЕ гаснет на потолке активов: сделать плитку можно всегда,
                упрётся только `KEEP AS CLOTH`, и упрётся своими словами. */}
            {onMakePattern && (
              <Button variant='secondary' size='xs' onClick={onMakePattern}>
                make a pattern
              </Button>
            )}
          </div>
        )}
    </>
  );

  const notes = (
    <>
      {/* ОДНА СТРОКА, А НЕ АБЗАЦ. Владелец только что снял объяснение из CLOTHS (Y-13); написать
          здесь абзац значило бы перенести ту же прозу на два блока выше. Остаётся ровно то, чего
          из картинок не видно: что рендер читает с этого снимка и где им пользуются. */}
      {/* ПРИЧИНА ПОТОЛКА — ВИДИМОЙ СТРОКОЙ, А НЕ ТОЛЬКО ПОДСКАЗКОЙ. В `title` она есть, но
          подсказка требует НАВЕСТИ на кадр, а человек, у которого дверь погасла, смотрит на неё и
          уходит. На карточке, где потолок добран фурнитурой, это к тому же ТУПИК: сказать про него
          мышью — почти то же молчание, ради которого этот дефект и заводили. */}
      {full && (
        <Text size='micro' variant='label' component='p' className='normal-case'>
          {fullReason}.
        </Text>
      )}

      <Text size='micro' variant='label' component='p' className='normal-case'>
        The render reads weave, sheen and drape off these; pick which one a run uses under FABRIC →
        CLOTHS below.
        {/* ПАТТЕРНЫ НАЗЫВАЮТСЯ ТОЛЬКО ТОГДА, КОГДА ОНИ ЕСТЬ (Д-1).
            ⚠ ЭТА СТРОКА БЫЛА ЛОЖЬЮ С МОМЕНТА, КАК ПОЯВИЛАСЬ ВКЛАДКА PATTERN (K-13). Она говорила,
            что плитки «были сделаны на снятых полках ASSETS» и «новую завести нельзя, потому что
            её редактор ушёл вместе с полками», — а завести теперь можно, и дверь стоит прямо над
            этим абзацем. Утверждение о снятом органе переживает свою причину молча: ничего не
            падает, экран просто начинает врать. */}
        {cloths.some(assetIsPattern) && (
          <>
            {' '}
            The ones marked <b>pattern</b> are repeating tiles, made on STUDIO → PATTERN and kept
            here with <b>keep as cloth</b>.
          </>
        )}
      </Text>
    </>
  );

  return {
    cells,
    count: cloths.length,
    notes,
    modal: (
      <ConfirmationModal
        open={!!pendingRemove}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        title={`remove ${pendingRemove ? assetLabel(pendingRemove) : 'this cloth'}?`}
        confirmLabel='remove'
        onConfirm={() => {
          const id = pendingRemove?.id ?? 0;
          if (id > 0) writes.deleteAsset.mutate(id);
          setPendingRemove(null);
        }}
      >
        <div className='flex flex-col gap-2'>
          {/* ЦЕНА НАЗЫВАЕТСЯ ЧИСЛОМ, А НЕ ОБЩИМИ СЛОВАМИ. Удаление ткани КАСКАДОМ сносит её метки
              на флэтах, а поставить их заново после снятия секции ASSETS нечем — так что здесь
              это не «переделаете», а «потеряете». Молчать об этом на карточке, размеченной до
              снятия, значило бы дать человеку нажать «ok» на необратимом. */}
          {marksOnPending > 0 && (
            <Text size='control'>
              {marksOnPending} mark{marksOnPending === 1 ? '' : 's'} drawn on the flats go with it,
              and they cannot be drawn again — the marking screen is gone.
            </Text>
          )}
          {/* УДАЛЕНИЕ ПАТТЕРНА ДОРОЖЕ УДАЛЕНИЯ ТКАНИ, И ЭТО НАДО СКАЗАТЬ ДО «ok». Ткань заводится
              этой же дверью заново из той же картинки; паттерн — нет: его раппорт и поворот
              задавались редактором, снятым вместе с секцией ASSETS. Одинаковый вопрос на два
              разных по цене жеста учил бы нажимать не глядя. */}
          {assetIsPattern(pendingRemove ?? undefined) && (
            <Text size='control'>
              This one is a <b>pattern</b>: it cannot be made again here — the repeat and rotation
              had their own editor, and it went with the removed ASSETS shelves.
            </Text>
          )}
          <Text size='control'>
            The picture file stays in the library. Runs already made keep their own frozen copy of
            this cloth, so their history stays readable.
          </Text>
        </div>
      </ConfirmationModal>
    ),
  };
}

export function RenderInputStrip({
  band,
  techCardId,
  disabled,
  onMakePattern,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /** K-16: уход на вкладку PATTERN со второй двери плейсхолдера тканей. */
  onMakePattern?: () => void;
}): JSX.Element {
  const writes = useDesignWrites(techCardId);

  const sides = useMemo(() => benchSides(band), [band]);
  const others = useMemo(() => unmarkedFlats(band), [band]);
  const marked = sides.filter((side) => !!side.picture);
  /* Ткани отдаются частями (см. довод у `useClothRun`): ячейки уходят в ту же ленту, что и виды,
     подписи и вопрос удаления — под неё. */
  const cloth = useClothRun({ band, techCardId, disabled, onMakePattern });

  /** Which cell a write is in flight for — a shared `isPending` would say «saving» on all of them. */
  const [busy, setBusy] = useState<string | null>(null);

  /** Кадр одной картинки для общего ряда студии, или ничего — у безадресной плиты зума нет. */
  const frameOf = (picture: common_DesignPicture) =>
    picture.media ? mediaFullToViewerItem(picture.media) : undefined;

  const mark = (picture: common_DesignPicture, view: string) => {
    const side = sides.find((s) => s.view === view);
    const pictureId = picture.id ?? 0;
    if (!side || pictureId <= 0) return;
    setBusy(`p${pictureId}`);
    writes.setBenchSlot.mutate(
      // `kind: 'flat'` — WHICH BENCH, not which slot. The bench grew a second axis (view × kind),
      // and a render front and a flat front are now two different slots BOTH addressed by
      // `view_key: 'front'`. This strip marks DRAWINGS into the flat bench; leaving the field empty
      // would still mean flat today, and would silently mean whatever the default becomes later.
      { slot: { viewKey: side.view, kind: 'flat' }, pictureId, expectedSlotRev: side.slotRev },
      { onSettled: () => setBusy(null) },
    );
  };

  const unmark = (view: string, slotRev: number) => {
    setBusy(`v${view}`);
    writes.setBenchSlot.mutate(
      // `picture_id = 0` is UNMARK — empty the slot without deleting it. A different act from
      // deleting a slot, and it has to stay different.
      { slot: { viewKey: view, kind: 'flat' }, pictureId: 0, expectedSlotRev: slotRev },
      { onSettled: () => setBusy(null) },
    );
  };

  return (
    <Section
      title='input — flats of this card'
      question='— the drawings the render is made from, and the cloth it is made of'
      action={
        <Text size='micro' variant='label' component='span' className='uppercase'>
          {/* Одной строкой, а не двумя: JSX схлопывает перенос в ПРОБЕЛ, и «0 cloth s» вылезло бы
              ровно из аккуратного форматирования. */}
          {marked.length} marked · {others.length} not marked ·{' '}
          {`${cloth.count} cloth${cloth.count === 1 ? '' : 's'}`}
        </Text>
      }
    >
      {/* ═══ ОДНА ЛЕНТА, ТРИ ПРОБЕГА (K-9) ═══════════════════════════════════════════════════
          Владелец: «CLOTH должен быть дальше в линии с фронт бэк сайд л р и т д а не снизу».
          Порядок ленты: виды в слотах → ткани → ЛИНИЯ → всё прочее, чем карточка располагает.

          ДВУХ `GroupLabel` НАД ЛЕНТОЙ БОЛЬШЕ НЕТ. Они появились, когда рядов было два, и каждый
          подписывал свой; над ОДНОЙ лентой «flats» подписывал бы и ткани тоже, то есть врал бы.
          Кто есть кто, лента говорит сама: у вида — ярлык вида на кадре и толстая рамка слота, у
          ткани — её собственное имя строкой под кадром. Числа обеих групп стоят в `action`
          секции, одной строкой, где их и читают вместе. */}
      <Strip>
        {marked.map((side) => {
          const picture = side.picture!;
          return (
            <StripCell
              key={`slot-${side.view}`}
              emphasis
              src={pictureThumb(picture)}
              alt={viewLabel(side.view)}
              badge={viewLabel(side.view)}
              gallery={frameOf(picture)}
              lines={[`in slot · ${viewLabel(side.view)}`, stripProvenance(band, picture)]}
              /* «unmark» ОСТАЁТСЯ СЛОВОМ В ПОДВАЛЕ, А НЕ УГЛОВЫМ ✕ ПРИМИТИВА, и это не отступление
                 от общего закона углов. ✕ примитива означает «убрать картинку», а здесь картинка
                 никуда не девается: пустеет СЛОТ, а плита остаётся на карточке, справа от линии.
                 Глифом эти два акта неразличимы, и на выпущенной карточке цена ошибки — потерянная
                 работа. */
              action={
                disabled ? undefined : (
                  <Button
                    variant='secondary'
                    size='xs'
                    loading={busy === `v${side.view}`}
                    onClick={() => unmark(side.view, side.slotRev)}
                  >
                    unmark
                  </Button>
                )
              }
            />
          );
        })}

        {/* ТКАНИ — ВТОРЫМ ПРОБЕГОМ ТОЙ ЖЕ ЛЕНТЫ, СРАЗУ ЗА ВИДАМИ И ЛЕВЕЕ ЛИНИИ. Рендер читает и
            чертёж, и ткань; линия отделяет читаемое от остального, поэтому обе группы стоят по
            одну её сторону. Разделителя между видами и тканями нет намеренно: второй такой же
            штрих сравнял бы его с линией и отнял бы у неё значение. */}
        {cloth.cells}

        {/* The line. It stands even when one side is empty: it separates two QUESTIONS, not two
            non-empty lists, and a divider that comes and goes stops reading as a boundary. */}
        <StripDivider />

        {/* THE HAND DOOR, equal in weight to the machine. A flat brought here lands on the upload
            shelf UNMARKED — `RegisterDesignUpload` with no target — because the human has not yet
            said which view it is, and a ghost guess is not an answer. It appears on the right of
            the line a moment later, with the same `mark ▸` as everything else. */}
        {!disabled && (
          <div className={`flex flex-col gap-1 ${CELL_WIDTH}`}>
            <MediaSlot
              aspectRatio={['Custom']}
              frameAspect='132/148'
              label='+ flat'
              hint={null}
              purpose='design · flat for the render'
              showVideos={false}
              editMode
              onSelect={(media) => {
                const items = media
                  .map((m) => m.id ?? 0)
                  .filter((id) => id > 0)
                  // `kind: 'flat'` is a STATEMENT, not a guess (unlike `ghostView`): this door
                  // sits under «input — flats of this card», so what comes through it is a drawing.
                  // Nothing downstream could recover that from the pixels.
                  .map((mediaId) => ({ mediaId, ghostView: '', kind: 'flat' }));
                if (!items.length) return;
                writes.registerUpload.mutate({
                  // Minted once per human intent and NOT inside the mutation: a retry carrying a
                  // fresh id would make the server honestly file a second batch.
                  clientRequestId: newClientRequestId(),
                  items,
                });
              }}
              allowMultiple
            />
            <Text size='nano' variant='label' component='span'>
              bring your own
            </Text>
            <Text size='nano' variant='label' component='span'>
              ⌘V · drop · browse
            </Text>
          </div>
        )}

        {others.map((picture) => {
          const provenance = stripProvenance(band, picture);
          return (
            <StripCell
              key={`pic-${picture.id}`}
              src={pictureThumb(picture)}
              alt={provenance}
              gallery={frameOf(picture)}
              lines={['not marked', provenance]}
              action={
                disabled ? undefined : (
                  <SelectComponent
                    name={`mark-${picture.id}`}
                    value={MARK_PROMPT}
                    placeholder='mark ▸'
                    disabled={busy === `p${picture.id}`}
                    items={[
                      { value: MARK_PROMPT, label: 'mark ▸' },
                      ...SILHOUETTE_VIEWS.map((view) => ({
                        value: view,
                        label: viewLabel(view),
                      })),
                    ]}
                    onValueChange={(value: string) => {
                      if (!value || value === MARK_PROMPT) return;
                      mark(picture, value);
                    }}
                    fullWidth
                  />
                )
              }
            />
          );
        })}

        {!marked.length && !others.length && (
          <Text size='micro' variant='inactive' component='span' className='py-6'>
            no flats on this card yet — bring one in, or generate one on FLAT.
          </Text>
        )}
      </Strip>

      <Text size='micro' variant='label' component='p' className='normal-case'>
        Left of the line — what the render actually reads: one drawing per view with its
        provenance, then the cloths it is made of. Right of the line — every other flat of this
        card; a hand file was always legal input here. Marking one displaces the picture that held
        the slot; nothing is deleted.
      </Text>

      {/* THE PAGE IS ADMITTED, NOT HIDDEN. The band ships one page of the feed, so a card with a
          long history has flats this strip cannot see. An operator who is not told that concludes
          his file was lost. */}
      {feedIsTruncated(band) && (
        <Text size='nano' variant='label' component='p' className='normal-case'>
          This card has more history than one page. The right of the line lists the flats of the
          newest page; older ones are still on the card and still in their slots.
        </Text>
      )}

      {/* Подписи ткани и вопрос удаления — ПОД лентой: ячейки уехали в неё, а прозе и модалке в
          прокручиваемом ряду места нет. Один орган, две точки монтирования — см. `useClothRun`. */}
      {cloth.notes}
      {cloth.modal}
    </Section>
  );
}
