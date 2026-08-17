import { SampleDeletionEntry } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { extractFieldViolations } from 'utils/field-errors';
import { useDeleteSample, useSampleDeletionPreview } from './useSamples';

/**
 * УДАЛЕНИЕ СЕМПЛА ИЗ ТЕХ-КАРТЫ.
 *
 * Кнопка здесь была и раньше — и почти никогда не срабатывала: мастер создания семпла списывает
 * ткань по BOM тем же жестом, а сервер отказывал при ЛЮБОМ движении материала. То есть оператор
 * жал «удалить» и получал «нельзя» на каждом семпле, который вообще что-то съел.
 *
 * Теперь граница проходит по ВОЗВРАЩЁННОСТИ материала, а не по факту движения, и цена этого —
 * отказ обязан быть выполнимым. Поэтому диалог не спрашивает «точно?», а СНАЧАЛА читает сухой
 * прогон и печатает три вещи: что держит удаление (и что с этим сделать), что уйдёт вместе с
 * семплом и что его переживёт.
 *
 * ОДНА ФОРМУЛИРОВКА НА СИСТЕМУ. И факт (`text`), и выход из него (`howToFix`) приходят с сервера
 * готовыми русскими фразами; клиент печатает их ДОСЛОВНО и не заводит второго словаря. Тот же
 * `howToFix` сервер кладёт в field violation настоящего отказа — поэтому диалог и ошибка не могут
 * начать советовать разное. `reason` — код для логов, человеку он не показывается.
 */

function EntryRow({ entry }: { entry: SampleDeletionEntry }) {
  const count = entry.count ?? 0;
  return (
    <Row
      label={
        <Text size='micro' component='span'>
          {entry.text?.trim() || entry.reason || '—'}
        </Text>
      }
      // count = 0 приходит только с reason = referenced: сервер сообщает, что связь есть, но не
      // сколько её. Ноль вырождается в «—» — отсутствие числа честнее выдуманного.
      value={
        <Text size='micro' variant='label' component='span'>
          {count > 0 ? count : '—'}
        </Text>
      }
    />
  );
}

function EntryList({ entries }: { entries?: SampleDeletionEntry[] }) {
  if (!entries?.length) return null;
  return (
    <div>
      {entries.map((e, i) => (
        <EntryRow key={`${e.reason ?? 'entry'}-${i}`} entry={e} />
      ))}
    </div>
  );
}

// Выход из блокера — отдельной строкой под фактом, а не в общем списке: список отвечает «что
// держит», а это единственное на экране, что отвечает «и что теперь делать».
function Fixes({ blockers }: { blockers?: SampleDeletionEntry[] }) {
  const fixes = Array.from(
    new Set((blockers ?? []).map((b) => b.howToFix?.trim()).filter((f): f is string => !!f)),
  );
  if (fixes.length === 0) return null;
  return (
    <div className='mt-1.5 flex flex-col gap-1'>
      <GroupLabel flush>what to do</GroupLabel>
      {fixes.map((f) => (
        <Text key={f} size='micro'>
          {f}
        </Text>
      ))}
    </div>
  );
}

export function SampleDeleteControl({
  sampleId,
  label,
  techCardId,
  onDeleted,
}: {
  sampleId: number;
  /** Как семпл назван на экране — «#3». Он же в заголовке диалога и в сообщении об успехе. */
  label: string;
  /** Карточка семпла — её примерки и dev-расходы вердикт трогает, и их кэш надо сбросить. */
  techCardId: number;
  onDeleted: () => void;
}) {
  const { showMessage } = useSnackBarStore();
  const preview = useSampleDeletionPreview();
  const del = useDeleteSample(techCardId);
  const [open, setOpen] = useState(false);
  // Блокеры, которых в сухом прогоне ЕЩЁ НЕ БЫЛО: мир изменился между двумя вызовами. Отдельное
  // состояние, а не перезапись вердикта, — оператор должен видеть, что отказ пришёл ПОСЛЕ «да».
  const [lateBlockers, setLateBlockers] = useState<string[]>([]);

  function openDialog() {
    preview.reset();
    del.reset();
    setLateBlockers([]);
    setOpen(true);
    // Спрашиваем ВСЕГДА и заново: между двумя открытиями диалога на семпл могли списать ткань или
    // записать примерку, и показанное из кэша «удаляемо» было бы враньём в самом дорогом месте.
    preview.mutate(sampleId);
  }

  function confirmDelete() {
    setLateBlockers([]);
    del.mutate(sampleId, {
      onSuccess: () => {
        setOpen(false);
        showMessage(`sample ${label} deleted`, 'success');
        onDeleted();
      },
      onError: (e) => {
        // FailedPrecondition несёт по одному field violation НА КАЖДЫЙ блокер, и в description
        // лежит та же серверная фраза вместе с советом. Печатаем ИХ, а не «не удалось удалить».
        const fresh = extractFieldViolations(e).map((v) => v.description);
        if (fresh.length > 0) setLateBlockers(fresh);
        else showMessage(e instanceof Error ? e.message : "couldn't delete the sample", 'error');
      },
    });
  }

  const verdict = preview.data;
  const deletable = verdict?.deletable === true;
  // Удалять предлагаем ТОЛЬКО когда сервер сказал «да» и пока не прилетел свежий отказ. В
  // остальных состояниях футер скрыт целиком: диалог, который показывает «нельзя» и рядом кнопку
  // «удалить», предлагает поспорить с фактом.
  const offerDelete = deletable && lateBlockers.length === 0;

  return (
    <>
      <Button type='button' variant='secondary' size='sm' onClick={openDialog}>
        delete the sample
      </Button>

      <ConfirmationModal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setLateBlockers([]);
        }}
        width='sm'
        title={`delete sample ${label}`}
        hideActions={!offerDelete}
        confirmLabel='delete the sample'
        confirmDisabled={del.isPending}
        // Модалка НЕ закрывается по клику «да»: удаление может отказать (мир изменился), и закрытая
        // форма унесла бы с собой единственное место, где видно почему.
        closeOnConfirm={false}
        onConfirm={confirmDelete}
      >
        <div className='flex flex-col gap-1.5'>
          {preview.isPending && (
            <Text size='micro' variant='label'>
              working out what will be deleted…
            </Text>
          )}

          {preview.isError && (
            <CalloutBox tone='error'>
              <Text size='micro'>
                {preview.error instanceof Error
                  ? preview.error.message
                  : "couldn't get the verdict"}
              </Text>
            </CalloutBox>
          )}

          {verdict && !deletable && (
            <>
              <Text size='micro'>
                this sample can't be deleted — things are still charged to it that deleting would
                wipe silently.
              </Text>
              <GroupLabel flush>what holds it</GroupLabel>
              <EntryList entries={verdict.blockers} />
              <Fixes blockers={verdict.blockers} />
            </>
          )}

          {verdict && deletable && (
            <>
              <Text size='micro'>
                sample <b>{label}</b> will be deleted irreversibly.
              </Text>
              {/* ПОЧЕМУ удаление разрешено — отдельной строкой и серым: это факт сервера, а не
                  обещание, что за семплом ничего не было. */}
              <Text size='micro' variant='label'>
                deleting is allowed because all the material is back in stock and the sample has no
                fittings.
              </Text>

              {(verdict.cascade?.length ?? 0) > 0 && (
                <>
                  <GroupLabel flush>will be deleted along with it</GroupLabel>
                  <EntryList entries={verdict.cascade} />
                </>
              )}

              {/* ТРЕТЬЯ КАТЕГОРИЯ, и она отделена намеренно: эти записи ПЕРЕЖИВУТ удаление и
                  потеряют семпл. Движения склада остаются в ленте — учёт не переписывают задним
                  числом, — а dev-расходы остаются деньгами карточки и теряют только адрес.
                  Отказать не за что, но узнать это оператор обязан ДО подтверждения. */}
              {(verdict.orphans?.length ?? 0) > 0 && (
                <CalloutBox tone='warning' className='mt-1.5'>
                  <GroupLabel flush>will survive the deletion and lose the sample</GroupLabel>
                  <EntryList entries={verdict.orphans} />
                </CalloutBox>
              )}
            </>
          )}

          {/* ОТКАЗ ПОСЛЕ «ДА»: сухой прогон разрешил, а транзакция отказала — между двумя вызовами
              на семпл списали ткань или записали примерку. Печатаем свежие фразы сервера. */}
          {lateBlockers.length > 0 && (
            <CalloutBox tone='error' className='mt-1.5'>
              <GroupLabel flush>deletion cancelled — the data changed</GroupLabel>
              {lateBlockers.map((text, i) => (
                <Row
                  key={i}
                  label={
                    <Text size='micro' component='span'>
                      {text}
                    </Text>
                  }
                />
              ))}
              <Text size='micro' variant='label' className='mt-1'>
                these facts appeared after the check had already allowed the deletion. close and
                reopen the dialog to recompute the verdict.
              </Text>
            </CalloutBox>
          )}
        </div>
      </ConfirmationModal>
    </>
  );
}
