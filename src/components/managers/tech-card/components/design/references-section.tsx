import { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { useResolvedMedia } from 'components/managers/media/utils/useMediaQuery';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { cn } from 'lib/utility';
import { useId, useMemo, useState, type ChangeEvent } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../schema';
import { type BoardItem } from './mood-board';
import { flatInputBusy, useFlatInput, wordsLocked } from './flat-input';
import { FlatInputPictures } from './flat-input-pictures';
import { FlatRunRow, type FlatSelection } from './flat-run-row';
import { RecalledRunPrompt } from './history-recall';
import { useStepAddress } from './playground/address';
import { GROUP_GAP } from './core';
import { useWordsSeeding } from './use-words-seeding';
import { WordsField } from './words-field';
import { dropWords, omittedOf, pickShownWords, settleWords, useWordsSeed } from './words-seed';

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
 *   · WORDS — один текст на весь промпт (`garmentDescription`), засев фактами карточки (D-20'''');
 *   · ряд GENERATE (`./flat-run-row.tsx`) и приёмник рекола (`RecalledRunPrompt`).
 * `clear the words ✕` в шапке чистит ТОЛЬКО слова: картинки и их ярлыки живут на доске.
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
  const { control, setValue } = useFormContext<TechCardFormData>();
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
     ответа, рекол пишет слова — поле и `clear` заперты. */
  const flatInput = useFlatInput(techCardId);
  const inputBusy = flatInputBusy(flatInput);
  const wordsBusy = wordsLocked(flatInput);

  const garment = useController({ control, name: 'garmentDescription' });
  const garmentId = useId();
  const { wordsLive, factsContext, rewrite, rewriting } = useWordsSeeding(
    techCardId,
    band,
    readOnly,
  );
  const seed = useWordsSeed(techCardId);
  const shown = pickShownWords(seed, garment.field.value, wordsLive);
  const garmentChars = shown.trim().length;
  const omittedShown = omittedOf(seed, shown);

  const [clearAsk, setClearAsk] = useState(false);
  function clearWords() {
    setClearAsk(false);
    setValue('garmentDescription', '', { shouldDirty: true });
    dropWords(techCardId);
  }

  return (
    <Section
      title='input'
      action={
        <span className='flex items-baseline gap-4'>
          {/* ОДНА ДВЕРЬ К ДОСКЕ (M13): картинки входа и их слова правятся там. */}
          <Button
            variant='underline'
            size='xs'
            className='text-labelColor hover:text-textColor'
            data-input-door=''
            onClick={() => goStep('mood')}
          >
            moodboard ›
          </Button>
          {!readOnly && (
            <Button
              variant='underline'
              size='xs'
              className='text-labelColor hover:text-textColor'
              data-clear-prompt=''
              disabled={inputBusy || wordsBusy || garmentChars === 0}
              onClick={() => setClearAsk(true)}
            >
              clear the words ✕
            </Button>
          )}
        </span>
      }
      className='space-y-block'
    >
      {/* M13 · КАРТИНКИ, КОТОРЫЕ УЙДУТ В ПРОМПТ — плитками доски, по нажатиям (виды, детали), из
          ответа сервера; выбранная цель target ▾ — в полный тон. Дверь к доске — в шапке блока. */}
      <FlatInputPictures techCardId={techCardId} band={band} selection={selection} />

      <div>
        {/* T56: мудборд сменился, а WORDS правлены руками — тихая ссылка переписать. */}
        {rewrite ? (
          <div className={cn('flex items-baseline justify-between gap-2', GROUP_GAP)}>
            <Text size='nano' variant='label' component='span' className='uppercase tracking-label'>
              words
            </Text>
            <Button
              variant='underline'
              size='xs'
              className='text-labelColor hover:text-textColor'
              data-words-rewrite=''
              disabled={rewriting}
              title='the moodboard changed since these words were written — rewrite them from it'
              onClick={rewrite}
            >
              {rewriting ? 'rewriting…' : 'moodboard changed · rewrite ✦'}
            </Button>
          </div>
        ) : (
          <Text
            size='nano'
            variant='label'
            component='span'
            className={cn('block uppercase tracking-label', GROUP_GAP)}
          >
            words
          </Text>
        )}
        <WordsField
          {...garment.field}
          data-field='garmentDescription'
          id={garmentId}
          label='words for the model'
          disabled={readOnly}
          readOnly={wordsBusy}
          value={shown}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
            garment.field.onChange(event);
            settleWords(techCardId, event.target.value);
          }}
          placeholder='what this flat has to show'
          omitted={omittedShown}
          aiContext={factsContext}
          aiDisabled={readOnly || wordsBusy}
          onApply={(text) => {
            setValue('garmentDescription', text, { shouldDirty: true });
            settleWords(techCardId, text);
          }}
        />
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

      <ConfirmationModal
        open={clearAsk}
        onOpenChange={(open) => !open && setClearAsk(false)}
        onConfirm={clearWords}
        onCancel={() => setClearAsk(false)}
        title='clear the words'
        confirmLabel='clear the words'
        width='sm'
      >
        <Text size='control' data-clear-scope={`${garmentChars}:0`}>
          Clears the words ({garmentChars} characters); they leave the card with its next save. The
          moodboard is not touched.
        </Text>
      </ConfirmationModal>
    </Section>
  );
}
