import { ColorwayDeletionEntry } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { notify } from 'lib/stores/store';
import { useState, type ReactNode } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';
import { CalloutBox, ConfirmationModal, GroupLabel, Row, Text, EmptyCell, Close } from 'ui';
import { extractFieldViolations } from 'utils/field-errors';
import { useColorwayDeletionPreview, useDeleteColorway } from './useColorwayRecipe';
import { failureClassOfError } from './useTechCardAutosave';

/**
 * УДАЛЕНИЕ КОЛОРВЕЯ С ПЛИТКИ ТЕХ-КАРТЫ.
 *
 * Колорвей — это ПРОДУКТ (R1), а не «цвет в карточке»: у него свой SKU, своя цена, свои медиа, свой
 * остаток и своя страница в каталоге. Поэтому здесь ни одного слова «убрать цвет» — контрол
 * называется «удалить продукт», подтверждение просит напечатать код колорвея, а диалог перечисляет,
 * что именно умрёт. Оператору, который завёл колорвей опечаткой, нужен ровно этот жест, и он ищет
 * его там, где видит ошибку, — на плитке.
 *
 * ОДНА ФОРМУЛИРОВКА НА СИСТЕМУ. Каждая строка вердикта приходит с сервера готовой русской фразой
 * (`text`) и стабильным кодом (`reason`). Клиент печатает `text` ДОСЛОВНО и не заводит второго
 * словаря: перевод, собранный здесь, разошёлся бы с серверным в первый же день, и два экрана стали
 * бы называть один факт по-разному. `reason` тут ни на что не влияет и намеренно не показывается —
 * это код для логов, а не текст для человека.
 */

// ── ФАКТ, КАК ЕГО НАПИСАЛ СЕРВЕР ────────────────────────────────────────────────────────────────
//
// count = 0 приходит ТОЛЬКО с reason = referenced: MySQL сообщает имя ограничения, а не мощность, и
// напечатать там «0» значило бы сказать «ничего», когда сказано «отсюда не видно». Поэтому ноль
// вырождается в «—» — тот же приём, что и везде в системе: отсутствие числа честнее выдуманного.
function EntryRow({ entry }: { entry: ColorwayDeletionEntry }) {
  const count = entry.count ?? 0;
  return (
    <Row
      label={
        <Text size='micro' component='span'>
          {entry.text?.trim() || entry.reason || <EmptyCell />}
        </Text>
      }
      value={
        <Text size='micro' variant='label' component='span'>
          {count > 0 ? count : <EmptyCell />}
        </Text>
      }
    />
  );
}

function EntryList({ entries }: { entries?: ColorwayDeletionEntry[] }) {
  if (!entries?.length) return null;
  return (
    <div>
      {entries.map((e, i) => (
        <EntryRow key={`${e.reason ?? 'entry'}-${i}`} entry={e} />
      ))}
    </div>
  );
}

export function ColorwayDeleteControl({
  colorwayId,
  code,
  techCardId,
  lockVersion,
  isLastColorway,
  onDeleted,
  trigger,
  triggerClassName,
}: {
  colorwayId: number;
  /** Слово оператора для этого колорвея — оно же строка, которую он печатает в подтверждении. */
  code: string;
  techCardId: number;
  lockVersion: number;
  /** Удаляем последний колорвей стиля — карточка останется без единого продукта. */
  isLastColorway: boolean;
  onDeleted: () => void;
  /** Свой вид триггера (например, ✕ на плитке колорвея). Без него — красное `delete product`. */
  trigger?: ReactNode;
  /** Классы триггера вместо подчёркнутого по умолчанию; триггер остаётся span role=button. */
  triggerClassName?: string;
}) {
  const preview = useColorwayDeletionPreview();
  const del = useDeleteColorway(techCardId);
  const [open, setOpen] = useState(false);
  // Блокеры, которых в сухом прогоне ЕЩЁ НЕ БЫЛО: мир изменился между двумя вызовами. Это отдельное
  // состояние, а не перезапись вердикта, — оператор должен видеть, что отказ пришёл ПОСЛЕ «да».
  const [lateBlockers, setLateBlockers] = useState<string[]>([]);

  const navigate = useNavigate();
  const productPath = generatePath(ROUTES.singleProduct, { id: String(colorwayId) });

  function openDialog() {
    preview.reset();
    del.reset();
    setLateBlockers([]);
    setOpen(true);
    // Спрашиваем ВСЕГДА и заново — вердикт живёт секунды, см. useColorwayDeletionPreview.
    preview.mutate({ colorwayId, expectedVersion: lockVersion });
  }

  function confirmDelete() {
    setLateBlockers([]);
    del.mutate(
      { colorwayId, expectedVersion: lockVersion },
      {
        onSuccess: () => {
          // The product leaving the card is the receipt.
          setOpen(false);
          onDeleted();
        },
        onError: (e) => {
          // FailedPrecondition несёт по одному field violation НА КАЖДЫЙ блокер, и в description
          // лежит та же серверная фраза. Показываем ИХ, а не «не удалось удалить»: следующий вопрос
          // оператора — «почему», и ответ уже приехал.
          const fresh = extractFieldViolations(e).map((v) => v.description);
          if (fresh.length > 0) setLateBlockers(fresh);
          else
            notify({
              sev: 'error',
              subject: `PRODUCT ${code}`,
              text: 'not deleted',
              detail: e instanceof Error ? e.message : undefined,
              action:
                failureClassOfError(e) === 'transient'
                  ? { label: 'retry', onClick: confirmDelete }
                  : undefined,
            });
        },
      },
    );
  }

  const verdict = preview.data;
  const deletable = verdict?.deletable === true;
  // Удалять предлагаем ТОЛЬКО когда сервер сказал «да» и пока не прилетел свежий отказ. Во всех
  // остальных состояниях (считаем / отказ / блокеры) футер модалки скрыт целиком: диалог, который
  // показывает «нельзя» и рядом кнопку «удалить», предлагает поспорить с фактом.
  const offerDelete = deletable && lateBlockers.length === 0;

  return (
    <>
      {/* НЕ <button>. На выпущенной (RELEASED) карточке вкладка целиком лежит внутри
          `<fieldset disabled>`, и любая кнопка там умирает молча. `<span role="button">` не
          является form control, поэтому fieldset до него не дотягивается — тот же побег, что у
          SortHeader в dev-expenses-field и у HelpMark в costing-vocab; keydown делает его настоящим
          контролом, а не мышиным. Сама модалка портирована в document.body и к фризу отношения не
          имеет, так что подтверждение работает и на замороженной карточке.

          РЕШЕНИЕ ПО RELEASED: выпущенная карточка колорвей УДАЛЯТЬ МОЖЕТ, и это осознанно. Сервер
          намеренно не требует изменяемой карточки — ровно чтобы брошенный черновой колорвей можно
          было убрать с уже утверждённой карточки, а это самый частый случай мусора. Фриз защищает
          СПЕЦИФИКАЦИЮ стиля (BOM, детали, операции), а удаление ничего в спецификации не трогает:
          оно убирает продукт, который на неё ссылается. Поэтому гейт здесь — право на ПРОДУКТЫ, а
          не canEdit тех-карты (тот содержит `!frozen` и закрыл бы ровно нужный случай). */}
      {trigger === '✕' ? (
        <Close
          asChild
          size='sm'
          tabIndex={0}
          aria-label={`delete product ${code} irreversibly`}
          onClick={openDialog}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openDialog();
            }
          }}
          className={triggerClassName}
        />
      ) : (
        <span
          role='button'
          tabIndex={0}
          aria-label={`delete product ${code} irreversibly`}
          onClick={openDialog}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openDialog();
            }
          }}
          className={
            triggerClassName ??
            'cursor-pointer self-start underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
          }
        >
          {trigger ?? (
            <Text size='micro' variant='error' tracking='label' component='span'>
              delete product
            </Text>
          )}
        </span>
      )}

      <ConfirmationModal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setLateBlockers([]);
        }}
        // Не удаляемый (продан или произведён) — диалог становится дверью к архивированию: оно
        // живёт на странице продукта (LifecycleControls) и здесь НЕ дублируется.
        title={verdict && !deletable ? `archive product ${code}` : `delete product ${code}`}
        // Кнопок нет, пока вердикта нет и после отказа «после да»; закрывает только ✕ в шапке.
        hideActions={!verdict || lateBlockers.length > 0}
        hideCancel
        footerHint={
          lateBlockers.length > 0
            ? 'card changed · reopen to recheck'
            : verdict && !deletable
              ? 'sold or produced: archive instead'
              : undefined
        }
        confirmLabel={offerDelete ? 'delete product' : 'archive ›'}
        confirmDisabled={del.isPending}
        // Печатать нужно КОД КОЛОРВЕЯ, а не «delete»: слово, которое оператор видит на плитке,
        // заставляет его сверить, тот ли продукт он сейчас сотрёт.
        typeToConfirm={offerDelete ? code : undefined}
        // Модалка НЕ закрывается по клику: удаление может отказать (мир изменился), и закрытая
        // форма унесла бы с собой единственное место, где видно почему.
        closeOnConfirm={false}
        onConfirm={() => (offerDelete ? confirmDelete() : navigate(productPath))}
      >
        <div className='flex flex-col gap-1.5'>
          {preview.isPending && (
            <Text size='micro' variant='label'>
              checking…
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
              <GroupLabel flush>held by</GroupLabel>
              <EntryList entries={verdict.blockers} />
            </>
          )}

          {verdict && deletable && (
            <>
              {isLastColorway && (
                <Row
                  label={
                    <Text size='micro' component='span'>
                      last colourway of the style
                    </Text>
                  }
                />
              )}

              {/* КАСКАД — умрёт ВМЕСТЕ с колорвеем. */}
              {(verdict.cascade?.length ?? 0) > 0 && (
                <>
                  <GroupLabel flush>deleted with it</GroupLabel>
                  <EntryList entries={verdict.cascade} />
                </>
              )}

              {/* СИРОТЫ — ТРЕТЬЯ КАТЕГОРИЯ, и она отделена намеренно. Это не блокер и не каскад:
                  записи ПЕРЕЖИВУТ удаление и потеряют колорвей. Раскладка, снятая под этот артикул,
                  останется длиной, померенной ни на чём. Отказать не за что, но узнать это оператор
                  обязан ДО подтверждения, а не после — потому у группы свой заголовок,
                  а не общий список с каскадом. */}
              {(verdict.orphans?.length ?? 0) > 0 && (
                <>
                  <GroupLabel flush>kept, unlinked</GroupLabel>
                  <EntryList entries={verdict.orphans} />
                </>
              )}
            </>
          )}

          {/* ОТКАЗ ПОСЛЕ «ДА»: сухой прогон разрешил, а транзакция отказала — между двумя вызовами
              кто-то запланировал партию, отгрузил остаток или снял настил. Печатаем свежие фразы
              сервера, а не «не удалось»: они и есть ответ на «почему». */}
          {lateBlockers.length > 0 && (
            <CalloutBox tone='error' className='mt-1.5'>
              <GroupLabel flush>not deleted · held by</GroupLabel>
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
            </CalloutBox>
          )}
        </div>
      </ConfirmationModal>
    </>
  );
}
