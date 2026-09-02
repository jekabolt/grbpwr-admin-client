import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useMemo, type JSX } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';

import { assetLabel, assetThumb, clothShelf } from '../assets/model';
import { CELL_WIDTH } from '../render/strip-cell';

/**
 * ═══ ВХОД ПЛИТКИ — РОВНО ОДНА КАРТИНКА, И ЭТО НЕ НАСТРОЙКА ════════════════════════════════════
 *
 * Контракт называет число прямо: `pattern` требует РОВНО ОДНУ картинку в
 * `params.extra_input_media_ids`, и отказывает `one_source_picture` на любое другое — бесплатно,
 * до резервации. Довод там же и он физический: «плитка, склеенная из двух лоскутов, не может
 * состыковаться сама с собой».
 *
 * ПОЭТОМУ ЗДЕСЬ ОДИН СЛОТ, А НЕ СПИСОК С ВАЛИДАЦИЕЙ. Список, который потом ругается «выберите
 * одну», сначала предлагает сделать неправильное и лишь затем это запрещает; слот на один кадр
 * делает неправильное состояние невыразимым. Отказ `one_source_picture` при этом всё равно
 * нарисован экраном — прийти он может только с сервера (другая вкладка, другой клиент), и молчать
 * о нём нельзя.
 *
 * ДВЕ ДВЕРИ, ОДИН РЕЗУЛЬТАТ (K-16: «можно выбрать из библиотеки или же оно должно предлагать
 * сделать это как паттерн»).
 *   · `MediaSlot` — библиотека, ⌘V и бросок файла. Один модуль на все точки загрузки админки, и
 *     переписывать его здесь было бы четвёртой раскладкой одного и того же жеста.
 *   · РЯД ТКАНЕЙ КАРТОЧКИ — то, что уже лежит на её полке. Это половина K-16, повёрнутая к
 *     человеку, который пришёл СЮДА: лоскут, заведённый в FABRIC RENDER, становится источником
 *     плитки в один клик, и ему не надо искать тот же файл в библиотеке заново.
 *
 * ⚠ ЧТО ЭТОТ РЯД НЕ ДЕЛАЕТ: он не заводит ассетов и ничего не удаляет. Полкой управляет ряд CLOTH
 * в INPUT фабрик-рендера; два писателя одной полки — ровно тот разрыв, который уже был оплачен
 * однажды (см. шапку `clothShelf`).
 *
 * ═══ СВОЕЙ СЕКЦИИ У НЕГО БОЛЬШЕ НЕТ, И ЭТО ГЛАВНАЯ ПРАВКА РЕДИЗАЙНА (G-15) ════════════════════
 *
 * Владелец: «переделай юай создания паттернов сделай его максимально простым сейчас там хуй пойми
 * что». Экран стоял четырьмя секциями, из которых ТРИ описывали один жест: вход, меню и
 * мета-объяснение про полку. Три белых блока на сером грунте читаются как три равновесных
 * заявления — а заявление здесь одно: «одна картинка внутрь, повторяющаяся ткань наружу». Поэтому
 * вход стал ПЕРВЫМ РЯДОМ одной секции: `SectionStack` разделяет блоки 24-пиксельным грунтом, и
 * ставить туда разрыв внутри одного действия значит рвать действие пополам.
 */
export function PatternInput({
  band,
  source,
  onPick,
  onClear,
  disabled,
}: {
  band: GetDesignBandResponse;
  /** Что сейчас поедет в прогон. `null` — ничего, и ворота GENERATE это скажут. */
  source: common_MediaFull | null;
  onPick: (media: common_MediaFull) => void;
  onClear: () => void;
  disabled?: boolean;
}): JSX.Element {
  const shelf = useMemo(() => clothShelf(band).filter((a) => (a.mediaId ?? 0) > 0), [band]);
  const sourceUrl = source?.media?.fullSize?.mediaUrl || source?.media?.thumbnail?.mediaUrl || '';
  const sourceId = source?.id ?? 0;

  return (
    <div
      data-pattern-act='make'
      className='flex flex-wrap items-start gap-3 border-b border-hairline pb-2'
    >
      <div className={`flex flex-col gap-1 ${CELL_WIDTH}`}>
        {disabled && !sourceUrl ? (
          <span
            data-inert='this card is read-only for you — a run spends money, so attaching its input stops here too'
            title='this card is read-only for you — a run spends money, so attaching its input stops here too'
            className='block w-full'
          >
            <Placeholder
              label='+ picture'
              dashed
              style={{ aspectRatio: '132/148' }}
              className='w-full'
            />
          </span>
        ) : (
          <MediaSlot
            aspectRatio={['Custom']}
            frameAspect='132/148'
            label='+ picture'
            hint={null}
            purpose='design · the picture a repeating tile is built from'
            showVideos={false}
            editMode={!disabled}
            mediaUrl={sourceUrl || undefined}
            alt='pattern source'
            onSelect={(media) => {
              const first = media[0];
              if (first?.id) onPick(first);
            }}
            onClear={sourceUrl && !disabled ? onClear : undefined}
          />
        )}
        <Text size='nano' variant='label' component='span' className='normal-case'>
          {sourceId ? `media ${sourceId}` : 'required · exactly one'}
        </Text>
        <Text size='nano' variant='label' component='span'>
          {disabled ? 'read-only' : '⌘V · drop · browse'}
        </Text>
      </div>

      {/* ─── ТКАНИ КАРТОЧКИ КАК ИСТОЧНИК, В ОДИН КЛИК ─────────────────────────────────────── */}
      <div className='min-w-0 flex-1 space-y-1'>
        {shelf.length > 0 ? (
          <div className='flex flex-wrap items-center gap-2'>
            <Text
              size='micro'
              variant='label'
              tracking='label'
              component='span'
              className='shrink-0 uppercase'
            >
              or a cloth
            </Text>
            <ChipRow>
              {shelf.map((a) => {
                const mediaId = a.mediaId ?? 0;
                const on = mediaId === sourceId;
                const url = assetThumb(a);
                return (
                  <Chip
                    key={a.id}
                    nonForm
                    selected={on}
                    pressed={on}
                    disabled={disabled}
                    /* ⚠ ИМЯ АТРИБУТА — `data-source-cloth`, А НЕ `data-cloth-source`. Одно имя на
                       два разных смысла — тот самый тихий разрыв, который замечают через месяц по
                       неверно позеленевшей пробе. */
                    data-source-cloth={a.id}
                    title={
                      on
                        ? `${assetLabel(a)} is the source of the next tile`
                        : `build the tile out of ${assetLabel(a)}`
                    }
                    onClick={() => {
                      if (disabled) return;
                      if (on) {
                        onClear();
                        return;
                      }
                      /* АССЕТ ДЕРЖИТ РАЗРЕШЁННОЕ МЕДИА ЦЕЛИКОМ (`asset.media`), поэтому источник
                         ставится без второго чтения. Ассет без разрешённого медиа сюда не попадает
                         — ряд отфильтрован по `mediaId > 0` выше. */
                      if (a.media) onPick(a.media);
                    }}
                  >
                    <span className='flex items-center gap-1'>
                      {url ? (
                        <img
                          src={url}
                          alt=''
                          aria-hidden='true'
                          className='size-[12px] object-cover'
                        />
                      ) : null}
                      {assetLabel(a)}
                      {a.repeatMm ? ` · ${a.repeatMm} mm` : ''}
                    </span>
                  </Chip>
                );
              })}
            </ChipRow>
          </div>
        ) : null}

        {/* ОДНА СТРОКА ВМЕСТО АБЗАЦА. Здесь стояли четыре предложения о том, почему картинка одна;
            запрет и так невыразим — слот держит один кадр. Осталось то, чего из слота не видно:
            что годится в источники. */}
        <Text size='nano' variant='label' component='p' className='normal-case'>
          a photograph of real cloth works as well as a drawn motif — the model is asked to make
          this picture repeat, not to invent one.
        </Text>
      </div>
    </div>
  );
}
