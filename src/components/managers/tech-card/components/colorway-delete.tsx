import { ColorwayDeletionEntry } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { generatePath, Link } from 'react-router-dom';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { extractFieldViolations } from 'utils/field-errors';
import { useColorwayDeletionPreview, useDeleteColorway } from './useColorwayRecipe';

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
          {entry.text?.trim() || entry.reason || '—'}
        </Text>
      }
      value={
        <Text size='micro' variant='label' component='span'>
          {count > 0 ? count : '—'}
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
}: {
  colorwayId: number;
  /** Слово оператора для этого колорвея — оно же строка, которую он печатает в подтверждении. */
  code: string;
  techCardId: number;
  lockVersion: number;
  /** Удаляем последний колорвей стиля — карточка останется без единого продукта. */
  isLastColorway: boolean;
  onDeleted: () => void;
}) {
  const { showMessage } = useSnackBarStore();
  const preview = useColorwayDeletionPreview();
  const del = useDeleteColorway(techCardId);
  const [open, setOpen] = useState(false);
  // Блокеры, которых в сухом прогоне ЕЩЁ НЕ БЫЛО: мир изменился между двумя вызовами. Это отдельное
  // состояние, а не перезапись вердикта, — оператор должен видеть, что отказ пришёл ПОСЛЕ «да».
  const [lateBlockers, setLateBlockers] = useState<string[]>([]);

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
          setOpen(false);
          showMessage(`product ${code} deleted`, 'success');
          onDeleted();
        },
        onError: (e) => {
          // FailedPrecondition несёт по одному field violation НА КАЖДЫЙ блокер, и в description
          // лежит та же серверная фраза. Показываем ИХ, а не «не удалось удалить»: следующий вопрос
          // оператора — «почему», и ответ уже приехал.
          const fresh = extractFieldViolations(e).map((v) => v.description);
          if (fresh.length > 0) setLateBlockers(fresh);
          else showMessage(e instanceof Error ? e.message : "couldn't delete the product", 'error');
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
        className='cursor-pointer self-start underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
      >
        <Text size='micro' variant='error' tracking='label' component='span'>
          delete the product
        </Text>
      </span>

      <ConfirmationModal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setLateBlockers([]);
        }}
        title={`delete product ${code}`}
        // Футера нет во всех состояниях, кроме «сервер разрешил»: см. offerDelete. Закрывается
        // крестом в шапке — единственное действие, которое там вообще осмысленно.
        hideActions={!offerDelete}
        confirmLabel='delete the product'
        confirmDisabled={del.isPending}
        // Печатать нужно КОД КОЛОРВЕЯ, а не «delete»: слово, которое оператор видит на плитке,
        // заставляет его сверить, тот ли продукт он сейчас сотрёт.
        typeToConfirm={offerDelete ? code : undefined}
        // Модалка НЕ закрывается по клику: удаление может отказать (мир изменился), и закрытая
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
                this product can't be deleted — it has already left traces that can't be erased
                after the fact.
              </Text>
              <GroupLabel flush>what holds it</GroupLabel>
              <EntryList entries={verdict.blockers} />
              {/* Архивирование живёт на странице самого продукта (LifecycleControls) и здесь
                  НЕ дублируется: две кнопки «архивировать» в разных местах разъезжаются в первый же
                  раз, когда одна из них научится чему-то новому. Отсюда — ссылка туда. */}
              <Text size='micro' variant='label'>
                instead of deleting it you can archive it — it leaves the storefront, while the
                history of orders, runs and stock stays intact.
              </Text>
              <Link
                to={productPath}
                className='underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
              >
                <Text size='micro' variant='uppercase' tracking='label' component='span'>
                  product page ↗
                </Text>
              </Link>
            </>
          )}

          {verdict && deletable && (
            <>
              <Text size='micro'>
                product <b>{code}</b> will be deleted physically and irreversibly — not archived and
                not hidden. it won't be possible to restore it.
              </Text>
              {/* ПОЧЕМУ удаление вообще разрешено — отдельной строкой и серым: это факт сервера
                  (граница удаляемости), а не обещание, что архивировать нечего. Заархивировать
                  такой колорвей по-прежнему можно, и на странице продукта эта кнопка на месте. */}
              <Text size='micro' variant='label'>
                deleting is allowed because it was never sold and never produced.
              </Text>

              {isLastColorway && (
                <Text size='micro' variant='label'>
                  this is the last colourway of the style — after the deletion the card will have no
                  products left at all.
                </Text>
              )}

              {/* КАСКАД — умрёт ВМЕСТЕ с колорвеем. */}
              {(verdict.cascade?.length ?? 0) > 0 && (
                <>
                  <GroupLabel flush>will be deleted along with it</GroupLabel>
                  <EntryList entries={verdict.cascade} />
                </>
              )}

              {/* СИРОТЫ — ТРЕТЬЯ КАТЕГОРИЯ, и она отделена намеренно. Это не блокер и не каскад:
                  записи ПЕРЕЖИВУТ удаление и потеряют колорвей. Раскладка, снятая под этот артикул,
                  останется длиной, померенной ни на чём. Отказать не за что, но узнать это оператор
                  обязан ДО подтверждения, а не после — потому у группы своя рамка и свой заголовок,
                  а не общий список с каскадом. */}
              {(verdict.orphans?.length ?? 0) > 0 && (
                <CalloutBox tone='warning' className='mt-1.5'>
                  <GroupLabel flush>will survive the deletion and lose the colourway</GroupLabel>
                  <EntryList entries={verdict.orphans} />
                </CalloutBox>
              )}
            </>
          )}

          {/* ОТКАЗ ПОСЛЕ «ДА»: сухой прогон разрешил, а транзакция отказала — между двумя вызовами
              кто-то запланировал партию, отгрузил остаток или снял настил. Печатаем свежие фразы
              сервера, а не «не удалось»: они и есть ответ на «почему». */}
          {lateBlockers.length > 0 && (
            <CalloutBox tone='error' className='mt-1.5'>
              <GroupLabel flush>deletion cancelled — the card changed</GroupLabel>
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
