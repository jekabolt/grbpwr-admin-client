import { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { useResolvedMedia } from 'components/managers/media/utils/useMediaQuery';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { cn } from 'lib/utility';
import { useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../schema';
import { type BoardItem } from './mood-board';
import { useFlatInput, wordsLocked } from './flat-input';
import { FlatInputPictures } from './flat-input-pictures';
import { FlatRunRow, type FlatSelection } from './flat-run-row';
import { RecalledRunPrompt } from './history-recall';
import { useStepAddress } from './playground/address';
import { GROUP_GAP } from './core';
import { FlatWordsField } from './flat-words-field';
import { useWordsSeeding } from './use-words-seeding';

/**
 * ═══ ВХОД ФЛЭТА — С МУДБОРДА (101-MOODBOARD-ROLES, волна 11) ═══════════════════════════════════
 *
 * Сетки «INPUT — REFERENCES» больше нет: картинки флэт берёт с МУДБОРДА по их назначению и ярлыку
 * сервера — вид (`front`, `back`, `side L/R`) или деталь, по два самых свежих на вид, до четырёх на
 * деталь (`designFlatPickFromBoard`). Отдельного списка, своих ролей и своих ✕ у входа нет, и
 * второго места, где лежит «то, что увидит модель», тоже: что именно уедет, говорит сервер —
 * «what the model gets ▸» (`PreviewDesignRunInputs`).
 *
 * В блоке остались:
 *   · M13 (владелец 07.10): картинки, которые уйдут в промпт, — плитками доски по нажатиям (виды,
 *     детали) из того же ответа сервера (`./flat-input-pictures.tsx`); дверь `moodboard ›` к доске
 *     — в шапке блока, рядом с `clear the words ✕` (прежняя строка `from the moodboard · N pictures`
 *     осталась только словами — если сервер не ответил);
 *   · WORDS (M14, владелец 07.10: «показывай в WORDS только то, что уходит») — ровно слова прогона:
 *     строка «garment: <класс>» (идёт за категорией) и под ней строки ЧЕЛОВЕКА (`flatWords`), которые
 *     уходят как напечатаны (`./flat-words-field.tsx`). Описание карточки (`garmentDescription`,
 *     засев брифом модели) здесь больше не показывается и во флэт не уходит; оно живёт для рендера и
 *     3D, его засев и догон идут как прежде (`useWordsSeeding` зовётся и здесь — GENERATE отдаёт
 *     засев в форму, и строка класса уезжает с ним);
 *   · ряд GENERATE (`./flat-run-row.tsx`) и приёмник рекола (`RecalledRunPrompt`).
 *
 * Легаси-строки `kind = REFERENCE` (старый вход) здесь не рисуются: миграция данных Ф4 переносит их
 * на доску с назначением по ярлыку.
 */

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
  const { control } = useFormContext<TechCardFormData>();
  const readOnly = !!disabled;
  const goStep = useStepAddress();
  /** На чём стоит ряд GENERATE (target ▾) — картинки входа подсвечивают его группу (M13). */
  const [selection, setSelection] = useState<FlatSelection | null>(null);

  const all = (useWatch({ control, name: 'moodboardMedia' }) ?? []) as BoardItem[];

  // Миниатюры для вопросов ряда GENERATE (`thumbOf`): карточка, затем картинки полосы, затем
  // библиотека за окном (`useResolvedMedia`), как у доски.
  const [picked, setPicked] = useState<common_MediaFull[]>([]);
  const { data: savedCard } = useTechCard(techCardId > 0 ? techCardId : undefined);
  const known = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const rm of [
      ...(savedCard?.resolvedTechnicalMedia ?? []),
      ...(savedCard?.resolvedMoodboardMedia ?? []),
    ])
      if (rm.media?.id != null) m.set(rm.media.id, rm.media);
    for (const batch of band.batches ?? [])
      for (const p of batch.pictures ?? [])
        if (p.media?.id != null && !m.has(p.media.id)) m.set(p.media.id, p.media);
    for (const run of band.runs ?? [])
      for (const p of run.pictures ?? [])
        if (p.media?.id != null && !m.has(p.media.id)) m.set(p.media.id, p.media);
    for (const p of picked) if (p.id != null) m.set(p.id, p);
    return m;
  }, [
    savedCard?.resolvedTechnicalMedia,
    savedCard?.resolvedMoodboardMedia,
    picked,
    band.batches,
    band.runs,
  ]);
  const libraryMap = useResolvedMedia(
    all.map((i) => i.mediaId),
    known,
  );
  const thumbOf = (id: number) => thumbUrl(known.get(id) ?? libraryMap.get(id));

  /* ВХОД ЗАНЯТ — из модульного хранилища карточки (`useFlatInput`): GENERATE ждёт сохранения или
     ответа — поле слов заперто. */
  const flatInput = useFlatInput(techCardId);
  const wordsBusy = wordsLocked(flatInput);

  /* Засев и догон ОПИСАНИЯ карточки (для рендера и 3D, и строка класса, которую GENERATE сохраняет
     с ним) идут как прежде; на экране флэта описания больше нет (M14). */
  useWordsSeeding(techCardId, band, readOnly);

  return (
    <Section
      title='input'
      action={
        /* ОДНА ДВЕРЬ К ДОСКЕ (M13): картинки входа и их ярлыки правятся там. */
        <Button
          variant='underline'
          size='xs'
          className='text-labelColor hover:text-textColor'
          data-input-door=''
          onClick={() => goStep('mood')}
        >
          moodboard ›
        </Button>
      }
      className='space-y-block'
    >
      {/* M13 · КАРТИНКИ, КОТОРЫЕ УЙДУТ В ПРОМПТ — плитками доски, по нажатиям (виды, детали), из
          ответа сервера; выбранная цель target ▾ — в полный тон. Дверь к доске — в шапке блока. */}
      <FlatInputPictures
        techCardId={techCardId}
        band={band}
        selection={selection}
        disabled={readOnly}
      />

      <div>
        <Text
          size='nano'
          variant='label'
          component='span'
          className={cn('block uppercase tracking-label', GROUP_GAP)}
        >
          words
        </Text>
        {/* M14: ровно то, что уйдёт — строка класса и строки человека. */}
        <FlatWordsField techCardId={techCardId} disabled={readOnly} readOnly={wordsBusy} />
      </div>

      {/* ⚠ НЕ ЗАВОРАЧИВАТЬ В СВОРАЧИВАНИЕ: ниже смонтирован приёмник рекола `RecalledRunPrompt`, при
          размонтировании реестр стирает выбор, и жест теряется молча. */}
      <FlatRunRow
        band={band}
        techCardId={techCardId}
        disabled={disabled}
        thumbOf={thumbOf}
        onSelection={setSelection}
      />

      <RecalledRunPrompt
        techCardId={techCardId}
        band={band}
        disabled={disabled}
        onAccepted={(media) => setPicked((prev) => [...prev, ...media])}
      />
    </Section>
  );
}
