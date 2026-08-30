import { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { useId, useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';

import type { TechCardFormData } from '../schema';
import { MOOD_MAX, appendBoardPictures, type BoardItem } from './mood-board';
import { useDesignWrites } from './use-design-band';

/**
 * РЕФЕРЕНСЫ — ВХОД, а не доска. Мудборд собирает настроение для человека; здесь лежит то, что
 * увидит модель, когда будет рисовать флэт, и в каком порядке.
 *
 * РОЛЬ ЖИВЁТ В ПОЛОСЕ, А НЕ В ДОКУМЕНТЕ, И ЭТО ВЫНУЖДЕНО (Р-1). В документе референс — это
 * `TechCardMediaItem{media_id, kind, caption}`, где `kind` УЖЕ занят тем, чем картинка ЯВЛЯЕТСЯ
 * (`MOODBOARD | REFERENCE | SWATCH`). Колонкой на `tech_card_media` роль тоже не положишь: у той
 * таблицы нет ключа строки вовсе, она переписывается целиком каждым сейвом, и перенести атрибут на
 * пересланную строку не на что. Поэтому роль — это `design_reference`, и пишется она ровно одним
 * глаголом, `SetDesignReferenceRole`, где пустая роль означает «убрать».
 *
 * ЧТО СЧИТАЕТСЯ РЕФЕРЕНСОМ. Две половины, и обе нужны:
 *   • ДОКУМЕНТНАЯ — строка карточки с `kind = REFERENCE`. Она переживает перезагрузку и существует
 *     до того, как человек назвал роль: иначе «добавил картинку во вход» было бы действием без
 *     следа до второго действия.
 *   • ПОЛОСНАЯ — роль в `band.references`. Она и есть «в промпте».
 * Членство — ОБЪЕДИНЕНИЕ: картинка с ролью показывается здесь, даже если её `kind` разошёлся
 * (дрейф данных, карточка из клона). Роль — более сильное утверждение, и прятать носителя роли
 * значило бы завести запись, которую не видно ни на одном экране и которую нечем снять.
 *
 * ОДНА КАРТИНКА, ДВА ОКНА, БЕЗ ДУБЛЕЙ. Мудбордная картинка становится референсом сменой `kind` —
 * строка остаётся ОДНА и остаётся на доске (мудборд рисует весь `moodboardMedia`), поэтому плитка
 * никуда не девается. Вторая строка на тот же `media_id` была бы вторым домом для одной картинки.
 *
 * ✕ ЗДЕСЬ НИЧЕГО НЕ УНИЧТОЖАЕТ, и это отличие от прототипа названо вслух: он выводит картинку из
 * входа (роль снимается, `kind` возвращается в `mood`), а сама картинка остаётся на доске. Одна
 * невозвратная дверь на полосу — ✕ плитки мудборда, и она называет цену. Второй такой двери здесь
 * не заводится: сторож прототипа, сверявший «участвовала ли картинка в прогонах», всё равно
 * сравнивал ярлык вместо предмета (Г3), а прогонов в этой волне нет вовсе.
 */

/**
 * Роли промпта. Значения — проводные (`front | back | side_l | side_r | detail`, см.
 * `common.DesignReference`); пустая строка это ПУНКТ СПИСКА, а не отсутствие пункта, и потому
 * законный выбор: примитив селекта пропускает пустоту только когда её кто-то предложил, иначе
 * гасит фантомную пустоту скрытого нативного `<select>`.
 */
const ROLE_ITEMS = [
  { value: '', label: '— not in prompt —' },
  { value: 'front', label: 'front' },
  { value: 'back', label: 'back' },
  { value: 'side_l', label: 'side L' },
  { value: 'side_r', label: 'side R' },
  { value: 'detail', label: 'detail' },
];

const REFERENCE_KIND = 'TECH_CARD_MEDIA_KIND_REFERENCE';
const MOODBOARD_KIND = 'TECH_CARD_MEDIA_KIND_MOODBOARD';

const roleLabel = (role: string) => ROLE_ITEMS.find((r) => r.value === role)?.label ?? role;

const mediaAspect = (full?: common_MediaFull): string => {
  const dim = full?.media?.fullSize ?? full?.media?.thumbnail;
  return dim?.width && dim?.height ? `${dim.width}/${dim.height}` : '4/5';
};

const thumbUrl = (full?: common_MediaFull): string =>
  full?.media?.thumbnail?.mediaUrl || full?.media?.fullSize?.mediaUrl || '';

export function ReferencesSection({
  techCardId,
  band,
  disabled,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  disabled?: boolean;
}): JSX.Element {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { setReferenceRole } = useDesignWrites(techCardId);
  const readOnly = !!disabled;

  const items = (useWatch({ control, name: 'moodboardMedia' }) ?? []) as BoardItem[];
  const [picked, setPicked] = useState<common_MediaFull[]>([]);
  const libraryMap = useMediaMap();
  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>(libraryMap);
    for (const p of picked) if (p.id != null) m.set(p.id, p);
    return m;
  }, [libraryMap, picked]);

  // Запись состава карточки — ПО КОРНЮ массива, как и на доске: два экземпляра поля-массива на одно
  // имя не синхронизируются, а мудборд смонтирован рядом и читает те же строки.
  const writeItems = (next: BoardItem[]) =>
    setValue('moodboardMedia', next as TechCardFormData['moodboardMedia'], { shouldDirty: true });

  const roleOf = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of band.references ?? []) {
      if (r.mediaId != null && (r.role ?? '').trim()) m.set(r.mediaId, (r.role as string).trim());
    }
    return m;
  }, [band.references]);

  // ЧЛЕНСТВО И ПОРЯДОК. Порядок — это порядок добавления на карточку, то есть позиция в
  // `moodboardMedia`; картинка, несущая роль, но выпавшая из списка (дрейф), встаёт в хвост, чтобы
  // её было чем снять.
  const members = useMemo(() => {
    const onCard = items
      .filter((i) => i.kind === REFERENCE_KIND || roleOf.has(i.mediaId))
      .map((i) => ({ mediaId: i.mediaId, onBoard: true }));
    const seen = new Set(onCard.map((m) => m.mediaId));
    const strays = [...roleOf.keys()]
      .filter((id) => !seen.has(id))
      .map((mediaId) => ({ mediaId, onBoard: false }));
    return [...onCard, ...strays];
  }, [items, roleOf]);

  /**
   * НОМЕРА ПРОМПТА ПЛОТНЫЕ И НЕ ХРАНЯТСЯ (И-3). Они присваиваются сканом по порядку с пропуском
   * безролевых — поэтому снятая роль пере-нумеровывает соседей САМА, без единой лишней записи, и
   * дырки «1, 3, 4» не бывает по построению. Хранимый номер потребовал бы N записей на каждое
   * снятие роли и разъезжался бы при первой же гонке двух вкладок.
   */
  const promptNumber = useMemo(() => {
    const m = new Map<number, number>();
    let n = 0;
    for (const member of members) {
      if (roleOf.has(member.mediaId)) m.set(member.mediaId, ++n);
    }
    return m;
  }, [members, roleOf]);

  const inPrompt = promptNumber.size;

  const boardCandidates = items.filter((i) => i.kind !== REFERENCE_KIND && !roleOf.has(i.mediaId));

  function setRole(mediaId: number, role: string) {
    // ORDINAL — ЭТО ПОЗИЦИЯ НА ДОСКЕ, а не номер промпта. Номер промпта выводится сканом (см.
    // выше), и класть его в хранимое поле значило бы завести второй источник одной величины,
    // который расходится с первым при каждом снятии роли.
    const ordinal = Math.max(1, items.findIndex((i) => i.mediaId === mediaId) + 1);
    setReferenceRole.mutate({ mediaId, role, ordinal });
  }

  /** Мудбордная картинка входит во вход. Строка ОДНА и остаётся на доске — меняется только `kind`. */
  function promote(mediaId: number) {
    writeItems(
      ((getValues('moodboardMedia') ?? []) as BoardItem[]).map((i) =>
        i.mediaId === mediaId ? { ...i, kind: REFERENCE_KIND } : i,
      ),
    );
  }

  /** Вывести из входа: роль снимается, картинка возвращается в мудбордные плитки. */
  function withdraw(mediaId: number) {
    if (roleOf.has(mediaId)) setReferenceRole.mutate({ mediaId, role: '', ordinal: 0 });
    writeItems(
      ((getValues('moodboardMedia') ?? []) as BoardItem[]).map((i) =>
        i.mediaId === mediaId ? { ...i, kind: MOODBOARD_KIND } : i,
      ),
    );
  }

  function setNote(mediaId: number, note: string) {
    writeItems(
      ((getValues('moodboardMedia') ?? []) as BoardItem[]).map((i) =>
        i.mediaId === mediaId ? { ...i, caption: note } : i,
      ),
    );
  }

  function addReferences(added: common_MediaFull[]) {
    const result = appendBoardPictures({
      live: (getValues('moodboardMedia') ?? []) as BoardItem[],
      otherListIds: ((getValues('technicalMedia') ?? []) as BoardItem[]).map((i) => i.mediaId),
      added,
      kind: REFERENCE_KIND,
    });
    if (!result.accepted.length) return [];
    setPicked((prev) => [...prev, ...result.accepted]);
    writeItems(result.next);
    return result.accepted.map((it) => it.id as number);
  }

  return (
    <Section
      title='input — references'
      question='— what the model is shown when it draws a flat'
      action={
        <Text size='micro' variant='label' component='span'>
          {members.length} picture{members.length === 1 ? '' : 's'} · {inPrompt} in the prompt
        </Text>
      }
    >
      <GroupLabel flush>the pictures</GroupLabel>
      {members.length === 0 && (
        <Text size='micro' variant='label'>
          nothing in the input yet. add a picture below, or take one off the moodboard — a reference
          is one thing: a picture, a role and a note.
        </Text>
      )}

      <div className='flex flex-wrap items-start gap-2.5'>
        {members.map((member) => (
          <ReferenceCell
            key={member.mediaId}
            mediaId={member.mediaId}
            full={mediaById.get(member.mediaId)}
            role={roleOf.get(member.mediaId) ?? ''}
            number={promptNumber.get(member.mediaId)}
            note={items.find((i) => i.mediaId === member.mediaId)?.caption ?? ''}
            onBoard={member.onBoard}
            readOnly={readOnly}
            onRole={(role) => setRole(member.mediaId, role)}
            onNote={(note) => setNote(member.mediaId, note)}
            onWithdraw={() => withdraw(member.mediaId)}
          />
        ))}

        {!readOnly && (
          <MediaSlot
            frameAspect='4/5'
            sizeClassName='w-[160px]'
            label='+ reference'
            purpose='design reference'
            allowMultiple
            showVideos={false}
            onSelect={addReferences}
          />
        )}
      </div>

      {/* ПИКЕР ЖИВЁТ ЗДЕСЬ, А НЕ РЕЖИМОМ ПОДСВЕТКИ НА ДОСКЕ, и это осознанное расхождение с
          прототипом. У прототипа плитка мудборда — просто картинка, а у нас это ПОВЕРХНОСТЬ
          РАЗМЕТКИ: клик по ней ставит указание. Взведённый пик-мод поверх взведённого вида выноски
          означал бы один клик — два факта, ровно ту неоднозначность, которую прототип сам записал
          себе в дефекты (Г13). Полоса ниже даёт тот же жест в одно нажатие и ни с чем не спорит. */}
      {!readOnly && boardCandidates.length > 0 && (
        <div>
          <GroupLabel>from the moodboard</GroupLabel>
          <Text size='micro' variant='label' className='mb-1'>
            one picture, two windows: it stays a moodboard tile and gains a role in the input.
          </Text>
          <div className='flex flex-wrap gap-1.5'>
            {boardCandidates.map((i) => {
              const full = mediaById.get(i.mediaId);
              const url = thumbUrl(full);
              return (
                <button
                  key={i.mediaId}
                  type='button'
                  onClick={() => promote(i.mediaId)}
                  title='take this moodboard picture into the input'
                  className='block h-[72px] w-[56px] shrink-0 border border-borderColor bg-bgColor hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                >
                  {url ? (
                    <img src={url} alt='' className='h-full w-full object-cover' />
                  ) : (
                    <Text size='nano' variant='inactive' component='span'>
                      #{i.mediaId}
                    </Text>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {members.length >= MOOD_MAX && (
        <Text size='micro' variant='label'>
          the board holds {MOOD_MAX} pictures in total — references included.
        </Text>
      )}
    </Section>
  );
}

/**
 * Одна ячейка: картинка, номер промпта, роль, записка. Без своей рамки-блока — ячейка это ПЛИТКА
 * внутри блока, а блок в блоке в этой системе запрещён; разделяет ячейки промежуток.
 */
function ReferenceCell({
  mediaId,
  full,
  role,
  number,
  note,
  onBoard,
  readOnly,
  onRole,
  onNote,
  onWithdraw,
}: {
  mediaId: number;
  full?: common_MediaFull;
  role: string;
  number?: number;
  note: string;
  onBoard: boolean;
  readOnly: boolean;
  onRole: (role: string) => void;
  onNote: (note: string) => void;
  onWithdraw: () => void;
}) {
  const noteId = useId();
  const url = thumbUrl(full);
  const off = !role;

  return (
    <div className='w-[160px] shrink-0 space-y-1'>
      {/* КАДР В ПРОПОРЦИЯХ САМОГО СНИМКА. Навязанное соотношение обрезало бы картинку под её же
          подписью; `aspectRatio` без `self-start` — рамка, схлопнутая в 0×0, читается как
          «фотографии не показываются», хотя данные на месте. */}
      <div
        className='relative w-full border border-borderColor bg-bgColor'
        style={{ aspectRatio: mediaAspect(full) }}
      >
        {url ? (
          <img
            src={url}
            alt={`reference ${number ?? mediaId}`}
            className='h-full w-full object-cover'
          />
        ) : (
          <div className='flex h-full w-full items-center justify-center'>
            <Text size='nano' variant='inactive' component='span'>
              media #{mediaId} not resolved
            </Text>
          </div>
        )}
        {number != null && (
          <span className='absolute left-0 top-0 bg-textColor px-1 text-nano tabular-nums text-bgColor'>
            {number}
          </span>
        )}
        {/* ПРИЗРАК «НЕ В ПРОМПТЕ» — СЛОВАМИ, А НЕ ПРИГЛУШЕНИЕМ. Приглушённый кадр читается как
            «картинка сломана»; строка говорит, чего именно не хватает. Плашка непрозрачная: в этой
            системе прозрачности нет вовсе, а полупрозрачная подложка на пёстром снимке даёт серый
            текст на сером — то есть не читается ровно там, где нужна. */}
        {off && (
          <span className='absolute bottom-0 left-0 right-0 border-t border-borderColor bg-bgColor px-1 text-center text-nano uppercase tracking-label text-labelColor'>
            not in prompt
          </span>
        )}
      </div>

      <div className='flex items-center gap-1'>
        <Select
          name={`ref-role-${mediaId}`}
          items={ROLE_ITEMS}
          value={role}
          placeholder='— not in prompt —'
          readOnly={readOnly}
          onValueChange={onRole}
          className='w-[118px]'
        />
        <button
          type='button'
          disabled={readOnly}
          onClick={onWithdraw}
          title='take it out of the input — the picture stays on the moodboard'
          className='px-1 text-labelColor hover:text-textColor disabled:text-textInactiveColor'
        >
          ✕
        </button>
      </div>

      {!onBoard && (
        <Pill tone='warn' title='this picture carries a role but is not on the card any more'>
          off the card
        </Pill>
      )}
      {role && (
        <Text size='nano' variant='label' component='span' className='uppercase tracking-label'>
          {roleLabel(role)}
        </Text>
      )}

      <label htmlFor={noteId} className='sr-only'>
        what this picture adds
      </label>
      <Textarea
        name={`ref-note-${mediaId}`}
        id={noteId}
        disabled={readOnly || !onBoard}
        value={note}
        rows={2}
        maxLength={500}
        autoGrow={false}
        placeholder='+ what this picture adds'
        className='resize-none'
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onNote(e.target.value)}
      />
    </div>
  );
}
