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
import { isBoardRow, type BoardItem } from './mood-board';
import { flatInputBusy, useFlatInput, wordsLocked } from './flat-input';
import { FlatRunRow } from './flat-run-row';
import { RecalledRunPrompt } from './history-recall';
import { GROUP_GAP } from './core';
import { useStepAddress } from './playground/address';
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
 *   · строка-дверь `from the moodboard · N pictures ›` — к доске, где картинки и их слова;
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

  const all = (useWatch({ control, name: 'moodboardMedia' }) ?? []) as BoardItem[];
  /** Картинки доски, из которых флэт выбирает: назначение `target` или `detail`. */
  const sources = useMemo(
    () =>
      all.filter(
        (i) => isBoardRow(i) && (i.role === 'target' || i.role === 'detail') && i.mediaId > 0,
      ).length,
    [all],
  );

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
        !readOnly && (
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
        )
      }
      className='space-y-block'
    >
      {/* ДВЕРЬ К ДОСКЕ — одна строка: картинки флэта живут там, со своими словами (101 §2.9). */}
      <button
        type='button'
        data-input-door=''
        onClick={() => goStep('mood')}
        className='group flex cursor-pointer items-baseline gap-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
      >
        <Text size='nano' variant='label' component='span' className='uppercase tracking-label'>
          from the moodboard
        </Text>
        <Text
          size='nano'
          component='span'
          className='uppercase tracking-label underline-offset-2 group-hover:underline'
        >
          {sources} picture{sources === 1 ? '' : 's'} ›
        </Text>
      </button>

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
      <FlatRunRow band={band} techCardId={techCardId} disabled={disabled} thumbOf={thumbOf} />

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
