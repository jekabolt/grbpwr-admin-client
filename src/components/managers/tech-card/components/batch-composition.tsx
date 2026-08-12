import {
  common_ProductionRun,
  common_ProductionRunInsert,
  common_ProductionRunLine,
  common_TechCard,
} from 'api/proto-http/admin';
import {
  runDetailPath,
  runStatusLabel,
} from 'components/managers/production-runs/components/options';
import { pluralRu } from 'components/managers/production-runs/components/run-readiness';
import {
  runColorwayRows,
  runGridColumns,
  runGridKey,
} from 'components/managers/production-runs/components/run-composition';
import {
  updateRunErrorMessage,
  useSaveProductionRun,
} from 'components/managers/production-runs/components/useProductionRuns';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';
import { ulid } from 'utils/ulid';

// СОСТАВ ПАРТИИ ПРЯМО В КОСТИНГЕ — колорвей × размер × количество, без ухода с вкладки.
//
// Вопрос, ради которого это здесь: «сколько каких размеров каждого колорвея» — это и есть вопрос о
// ДЕНЬГАХ, а не о цехе. Средняя по размерному ряду отвечает на него неправильно всегда, когда микс
// не равномерный, и ошибается ровно на разницу градации. Чтобы посчитать партию, её надо сначала
// описать, а чтобы описать — не уходить со страницы, где стоит цифра, ради которой всё и затевалось.
//
// ═══ АСИММЕТРИЯ, РАДИ КОТОРОЙ НАПИСАН ЭТОТ КОМПОНЕНТ ════════════════════════════════════════════
//
// ЧЕРНОВИК здесь правится свободно. НЕ-ЧЕРНОВИК — только читается, со ссылкой на страницу партии.
//
// Это не осторожность и не разделение прав. Правка состава НЕ-черновика ДВИГАЕТ РЕЗЕРВЫ ТКАНИ:
// сервер приводит резерв к текущей потребности на каждом обновлении не-черновой партии. То есть
// цифра, набранная в клетке «прикинуть, а если сошьём двадцать XL», молча пере-заняла бы рулоны под
// другую партию — и узнал бы об этом раскройщик, а не тот, кто набирал.
//
// Двигать ткань — производственное решение, и принимается оно там, где рядом виден вердикт
// готовности и материальный план: на странице партии. Костинг вправе СОЗДАВАТЬ и ЛЕПИТЬ ЧЕРНОВИК
// как угодно ровно потому, что черновик НИЧЕГО НЕ ДЕРЖИТ: ни резерва, ни наряда, ни гейта. Все три
// обязательства навешиваются на переходе draft → planned — там же, где им и место.

// Клетка сетки. hairline (#e6e6e6) — это ВНУТРЕННЯЯ линейка между строками; внешний контур здесь
// уже нарисован калаутом, в котором сетка живёт, и второй контур на клетках дал бы коробку в
// коробке (DESIGN.md).
const cellBox = 'border border-hairline px-2 py-1';

export function BatchComposition({
  techCard,
  run,
  canPlan,
  onCreated,
  onCancel,
}: {
  techCard?: common_TechCard;
  /**
   * Партия-база, ОДИНОЧНЫМ чтением (с линиями и lock_version). undefined = составляем новую.
   *
   * Компонент НЕ сбрасывает своё состояние сам при смене партии: родитель монтирует его с
   * `key={run?.id ?? 'new'}`, и смена базы — это размонтирование. Так набранное для одной партии не
   * может перетечь в другую, и об этом не нужно помнить в трёх эффектах.
   */
  run?: common_ProductionRun;
  /** production:write. Без него сетка только читается — даже черновик. */
  canPlan: boolean;
  /** Созданный черновик становится базой расчёта. */
  onCreated?: (id: number) => void;
  /** Закрыть редактор новой партии. Для существующей базы не показывается. */
  onCancel?: () => void;
}) {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const save = useSaveProductionRun();

  const isNew = !run;
  const isDraft = run?.run?.status === 'PRODUCTION_RUN_STATUS_DRAFT';

  const colorways = useMemo(
    () => runColorwayRows(techCard?.colorways, dictionary?.colors),
    [techCard?.colorways, dictionary?.colors],
  );
  const cardSizeIds = useMemo(() => techCard?.techCard?.sizeIds ?? [], [techCard]);
  const lines = useMemo(() => run?.run?.lines ?? [], [run]);
  const columns = useMemo(() => runGridColumns(cardSizeIds, lines), [cardSizeIds, lines]);

  // Строки: живые колорвеи карточки ПЛЮС продукты, которые уже стоят на линиях партии.
  // Вторая половина — та же защита, что и у колонок: запись партии есть полная замена линий, и
  // линия, которой сетка не показала, при сохранении исчезнет. Колорвей, архивированный уже ПОСЛЕ
  // планирования партии, — обычный случай, и потерять по нему количество молча нельзя.
  const rows = useMemo(() => {
    const out = [...colorways];
    for (const l of lines) {
      const pid = l.productId ?? 0;
      if (pid > 0 && !out.some((r) => r.id === pid)) out.push({ id: pid, label: `#${pid}` });
    }
    return out;
  }, [colorways, lines]);

  // Сетка адресует линию парой (product_id, size_id). Линия без продукта или без размера — это
  // выпуск вспомогательной карточки (он ключуется output_variant_id и ни того, ни другого не
  // имеет), и полная замена по сетке просто удалила бы её. Такой состав правится только на
  // странице партии, и сказать об этом надо словами, а не молча погасить кнопку.
  const gridCoversRun = lines.every((l) => (l.productId ?? 0) > 0 && (l.sizeId ?? 0) > 0);

  const editable = canPlan && (isNew || (isDraft && gridCoversRun));

  const [qty, setQty] = useState<Record<string, string>>({});
  // Соседние сохранения (карточка, другая партия, приёмка) инвалидируют прогон, и без этого флага
  // свежий ответ сервера затирал бы клетки, которые оператор набрал и ещё не сохранил.
  const [dirty, setDirty] = useState(false);
  // Отказ живёт на экране до следующей попытки, а не уезжает тостом: 409 значит «наберите ещё раз,
  // глядя на чужую правку», и сообщение обязано дожить до этого «ещё раз».
  const [error, setError] = useState('');

  useEffect(() => {
    if (dirty) return;
    const next: Record<string, string> = {};
    for (const l of lines) {
      if ((l.plannedQty ?? 0) <= 0) continue;
      next[runGridKey(l.productId ?? 0, l.sizeId ?? 0)] = String(l.plannedQty);
    }
    setQty(next);
  }, [lines, dirty]);

  const cellValue = (colorwayId: number, sizeId: number) =>
    Number(qty[runGridKey(colorwayId, sizeId)]) || 0;
  const rowTotal = (colorwayId: number) =>
    columns.reduce((sum, s) => sum + cellValue(colorwayId, s), 0);
  const colTotal = (sizeId: number) => rows.reduce((sum, r) => sum + cellValue(r.id, sizeId), 0);
  const grandTotal = rows.reduce((sum, r) => sum + rowTotal(r.id), 0);

  const setCell = (colorwayId: number, sizeId: number, v: string) => {
    setDirty(true);
    setError('');
    setQty((prev) => ({ ...prev, [runGridKey(colorwayId, sizeId)]: v.replace(/[^0-9]/g, '') }));
  };

  // Пустая клетка — это НЕ ноль, а «этот размер не шьём»: линии у неё нет. Ветки «сохранить
  // строку с нулём, если по ней уже что-то принято» здесь нет НАМЕРЕННО — она живёт в сетке на
  // странице партии, где правят принимаемые партии. Сюда попадают только черновики, у которых
  // приёмок не бывает по устройству.
  const buildLines = (): common_ProductionRunLine[] => {
    const next: common_ProductionRunLine[] = [];
    for (const r of rows) {
      for (const s of columns) {
        const raw = qty[runGridKey(r.id, s)];
        const planned = Number(raw);
        if (!raw?.trim() || !Number.isFinite(planned) || planned <= 0) continue;
        const prev = lines.find((l) => (l.productId ?? 0) === r.id && (l.sizeId ?? 0) === s);
        next.push({
          productId: r.id,
          sizeId: s,
          plannedQty: planned,
          receivedQty: prev?.receivedQty,
          defectQty: prev?.defectQty,
          // Продуктовая линия никогда не несёт цветового варианта — он только у aux-карточек,
          // а их состав сюда не попадает (см. gridCoversRun).
          outputVariantId: undefined,
          // Ключ линии сервер СВЕРЯЕТ, а не выдаёт заново: перевыпустить пришедший ключ значит
          // «эту строку сняли, завели другую» — и снять вместе с ней всё, что на неё ссылается.
          lineKey: prev?.lineKey || ulid(),
        });
      }
    }
    return next;
  };

  const create = () => {
    const next = buildLines();
    if (next.length === 0 || !techCard?.id) return;
    setError('');
    // Все поля инсерта присутствуют явно: контракт объявляет их `T | undefined`, а не
    // необязательными, и «забытое» поле — это не «оставить как есть», а отсутствие ключа.
    const insert: common_ProductionRunInsert = {
      techCardId: techCard.id,
      // Релиз не выбираем: партия планируется от ЖИВОЙ карточки — это законный выбор, и именно он
      // нужен прикидке, которую делают, пока карточку ещё правят.
      releaseId: undefined,
      status: 'PRODUCTION_RUN_STATUS_DRAFT',
      startedAt: undefined,
      plannedStartAt: undefined,
      promisedAt: undefined,
      receivedAt: undefined,
      supplierId: 0,
      notes: '',
      lines: next,
      costs: [],
      markerEfficiencyPct: undefined,
      markerNotes: undefined,
      actualWastagePercent: undefined,
    };
    save.mutate(
      { run: insert },
      {
        onSuccess: (res) => {
          setDirty(false);
          showMessage('Черновик партии создан — ткань не занята', 'success');
          const id = (res as { id?: number })?.id ?? 0;
          if (id) onCreated?.(id);
        },
        onError: (e) => setError(updateRunErrorMessage(e)),
      },
    );
  };

  const update = () => {
    const base = run?.run;
    const next = buildLines();
    if (!run?.id || !base || next.length === 0) return;
    setError('');
    save.mutate(
      {
        id: run.id,
        // ПРИСУТСТВИЕ, А НЕ ВЕЛИЧИНА: само наличие поля включает оптимистичную блокировку, его
        // отсутствие — легаси-режим «побеждает последний». Версия берётся из той партии, которую
        // оператор видел, набирая цифры, — перечитать её здесь значило бы сверять ответ сервера
        // сам с собой.
        lockVersion: run.lockVersion ?? 0,
        // Полная замена: инсерт партии едет целиком, меняются только линии. Заметки, даты и
        // процент раскроя обязаны доехать назад нетронутыми.
        run: { ...base, lines: next },
      },
      {
        onSuccess: () => {
          setDirty(false);
          showMessage('Состав черновика сохранён', 'success');
        },
        onError: (e) => setError(updateRunErrorMessage(e)),
      },
    );
  };

  const sizeLabel = (id: number) => String(findInDictionary(dictionary, id, 'size') || id || '—');

  // Почему кнопка погашена — словами и рядом с ней. Пустую партию не создаём: партия без единого
  // количества ничего не считает и ничего не значит, а удалять её потом придётся руками.
  const blockedReason =
    columns.length === 0
      ? 'у карточки пустой размерный ряд — количества вводить не по чему'
      : rows.length === 0
        ? 'у карточки нет живых колорвеев с продуктом — составлять партию не из чего'
        : grandTotal === 0
          ? 'ни одной клетки не заполнено — пустую партию создавать нечего'
          : '';

  const title = isNew
    ? 'новая партия — черновик расчёта'
    : `состав партии #${run?.id} · ${runStatusLabel(run?.run?.status)}`;

  return (
    <div className='flex w-full min-w-0 flex-col gap-1.5'>
      <GroupLabel
        flush
        action={
          isNew && onCancel ? (
            <Button type='button' variant='underline' size='xs' onClick={onCancel}>
              отмена
            </Button>
          ) : !isNew && run?.id ? (
            // Ссылка, а не кнопка: на released-карточке вкладка лежит в `<fieldset disabled>`,
            // который глушит любую <button>, но не <a>.
            <Button asChild variant='underline' size='xs'>
              <Link to={runDetailPath(run.id)}>страница партии ↗</Link>
            </Button>
          ) : undefined
        }
      >
        {title}
      </GroupLabel>

      {rows.length > 0 && columns.length > 0 ? (
        // Широкая сетка прокручивается ВНУТРИ своего контейнера — страница вбок не едет.
        <div className='w-full overflow-x-auto'>
          <table className='border-collapse'>
            <thead>
              <tr>
                <th className={`${cellBox} text-left uppercase`}>колорвей</th>
                {columns.map((s) => (
                  <th key={s} className={`${cellBox} text-right uppercase`}>
                    {sizeLabel(s)}
                  </th>
                ))}
                <th className={`${cellBox} text-right uppercase`}>Σ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={cellBox}>{r.label}</td>
                  {columns.map((s) => (
                    <td key={s} className={`${cellBox} text-right tabular-nums`}>
                      {editable ? (
                        <input
                          className='w-14 border border-borderColor bg-bgColor px-1 text-right text-textBaseSize'
                          inputMode='numeric'
                          aria-label={`${r.label} · ${sizeLabel(s)}`}
                          value={qty[runGridKey(r.id, s)] ?? ''}
                          onChange={(e) => setCell(r.id, s, e.target.value)}
                        />
                      ) : (
                        qty[runGridKey(r.id, s)] || '—'
                      )}
                    </td>
                  ))}
                  {/* Итог КОЛОРВЕЯ — ровно тот вопрос, ради которого экран и просили: сколько
                      размеров каждого цвета уходит в эту партию. */}
                  <td className={`${cellBox} text-right font-bold tabular-nums`}>
                    {rowTotal(r.id)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className={`${cellBox} text-right uppercase`}>Σ</td>
                {columns.map((s) => (
                  <td key={s} className={`${cellBox} text-right tabular-nums`}>
                    {colTotal(s)}
                  </td>
                ))}
                <td className={`${cellBox} text-right font-bold tabular-nums`}>{grandTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
        <Text size='micro' variant='label' component='span'>
          {grandTotal > 0
            ? `${grandTotal} ${pluralRu(grandTotal, 'изделие', 'изделия', 'изделий')} в партии`
            : editable
              ? // Причина, по которой нечего сохранять, — только там, где сохраняют.
                blockedReason || 'количества не введены'
              : 'в партии нет ни одного количества'}
        </Text>
        {editable ? (
          <Button
            type='button'
            size='xs'
            variant='secondary'
            disabled={!!blockedReason || save.isPending}
            title={blockedReason || undefined}
            onClick={isNew ? create : update}
          >
            {save.isPending ? 'сохраняем…' : isNew ? 'создать черновик' : 'сохранить состав'}
          </Button>
        ) : null}
      </div>

      {/* ПОЧЕМУ ЧИТАЕТСЯ, А НЕ ПРАВИТСЯ. Погашенная сетка без причины читается как поломка, а
          причина здесь содержательная: за правкой состава не-черновика стоит движение ткани. */}
      {!editable && !isNew ? (
        <Text size='micro' variant='label'>
          {!canPlan
            ? 'состав партии правит роль с доступом к производству'
            : !gridCoversRun
              ? 'в партии есть строки без продукта или размера (выпуск вспомогательной карточки) — такой состав правится только на странице партии'
              : 'у не-черновой партии правка состава двигает РЕЗЕРВЫ ТКАНИ: сервер приводит резерв к новой потребности при каждом сохранении. Это производственное решение, и принимается оно на странице партии, где рядом виден вердикт готовности, — а не побочным эффектом прикидки в костинге. Здесь можно создать черновик и считать по нему.'}
        </Text>
      ) : null}

      {editable && !isNew ? (
        <Text size='micro' variant='label'>
          черновик ничего не занимает — ни резерва ткани, ни наряда; резерв, гейт готовности и наряд
          навешиваются при переводе в план
        </Text>
      ) : null}

      {error ? (
        <Text size='micro' className='text-error'>
          {error}
        </Text>
      ) : null}
    </div>
  );
}
