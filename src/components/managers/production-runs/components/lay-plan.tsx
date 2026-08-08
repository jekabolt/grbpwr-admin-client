import {
  common_ProductionRun,
  common_ProductionRunLay,
  common_ProductionRunLaySection,
} from 'api/proto-http/admin';
import { cardMarkers } from 'components/managers/tech-card/components/nesting/marker-io';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { wireInt } from 'components/managers/tech-card/components/schema';
import { LayCard } from './lay-card';
import { buildLaySectionPlotterFile } from './lay-plotter';
import { LayCoverageTable } from './lay-coverage-table';
import { LayEditor, LaySlotOption } from './lay-editor';
import { layErrorMessage, useDeleteLay, useRunLays, useSaveLay } from './useLays';

// Слоты, которые вообще можно настелить: рулонные секции BOM. Фурнитура, нитки и упаковка настила
// не имеют, и предлагать их в выборе слота значило бы приглашать в отказ сервера (§4.3 шаг 5).
const ROLL_SECTIONS = new Set([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
]);

// ШАГ 3 «как раскроить» — план настилов прогона (Ф4.3).
//
// Держит РОВНО одно состояние: какой настил открыт на правку (и какой предложен к удалению —
// то же «какой настил сейчас предмет открытой поверхности»). Ни одного поля формы здесь нет: они
// живут в `LayEditor`, который монтируется с `key` по цели правки. Аддитивен — связи прогон↔
// раскладка до Ф4 не существовало ни в каком виде, поэтому ничего не вытесняет.
export function LayPlan({
  run,
  canEdit,
  locked,
  id,
}: {
  run: common_ProductionRun;
  canEdit: boolean;
  locked: boolean;
  /**
   * Якорь блока. Страница прогона — конвейер по статусу: шаг «раскрой» схлопывается в строку с
   * кнопкой «раскрыть», и этой кнопке нужен `aria-controls`, а прокрутке — цель. Блок рисует свою
   * `Section` сам, поэтому id приходит снаружи; `Section` вешает на него ещё и `scroll-mt`.
   */
  id?: string;
}) {
  const runId = run.id ?? 0;
  const techCardId = run.run?.techCardId ?? 0;
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const { data, isLoading, isError } = useRunLays(runId, runId > 0);
  const { data: techCard } = useTechCard(techCardId || undefined);

  const del = useDeleteLay();
  const reaffirm = useSaveLay();

  // ПЛОТТЕРНЫЙ ФАЙЛ СЕКЦИИ (Ф4.7). Ключ готовящейся секции, а не булев флаг: настил из трёх секций
  // даёт три кнопки, и общий флаг погасил бы все три, пока грузится геометрия одной.
  const [plottingKey, setPlottingKey] = useState<string>('');
  const downloadLayPlotter = async (
    lay: common_ProductionRunLay,
    section: common_ProductionRunLaySection,
    key: string,
  ) => {
    if (plottingKey) return;
    setPlottingKey(key);
    try {
      const out = await buildLaySectionPlotterFile(
        lay,
        section,
        {
          runId,
          colorway: colorwayLabel(lay.colorwayId ?? 0),
          sizeLabel,
          season: techCard?.techCard?.skuSeason ? String(techCard.techCard.skuSeason) : undefined,
          styleNumber: techCard?.techCard?.styleNumber || undefined,
        },
        // Дата берётся здесь, в момент нажатия: это дата ВЫПУСКА ЛИСТА, а не дата настила. Лист
        // печатают и перепечатывают, и раскройщику важно, та ли распечатка у него в руках.
        new Date().toISOString(),
      );
      if (!out.ok) {
        showMessage(`Плоттерный файл не собрался — ${out.reason}`, 'error');
        return;
      }
      const url = URL.createObjectURL(new Blob([out.dxf], { type: 'application/dxf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = out.filename;
      a.click();
      // Отложенный отзыв: Safari и Firefox могут не начать скачивание к моменту возврата click().
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setPlottingKey('');
    }
  };

  const [editing, setEditing] = useState<{
    layKey?: string;
    colorwayId: number;
    bomLineKey: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<common_ProductionRunLay | null>(null);

  const lays = useMemo(() => data?.lays ?? [], [data?.lays]);
  const coverage = useMemo(() => data?.coverage ?? [], [data?.coverage]);
  const pieceYields = useMemo(() => data?.pieceYields ?? [], [data?.pieceYields]);
  const runMarkers = useMemo(() => data?.runMarkers ?? [], [data?.runMarkers]);
  // Источники копирования — только КАРТОЧНЫЕ раскладки, и фильтр берётся готовым (Ф4.2), а не
  // пишется здесь заново: правило «раскройная не показывается как карточная» объявлено один раз
  // именно затем, чтобы четвёртая копия условия `productionRunId === 0` не разъехалась с тремя
  // первыми. Копировать раскройную раскладку этого же прогона и незачем — она уже в нём.
  const cardOnlyMarkers = useMemo(() => cardMarkers(techCard?.markers), [techCard?.markers]);
  const bomItems = useMemo(() => techCard?.techCard?.bomItems ?? [], [techCard?.techCard?.bomItems]);

  // Колорвей = продукт (R1), имя резолвится из словаря по коду цвета — тем же способом, что
  // lines-grid.tsx и material-plan.tsx, чтобы три блока одной страницы не называли цвет по-разному.
  const colorwayLabel = useMemo(() => {
    const byId = new Map<number, string>();
    for (const cw of techCard?.colorways ?? []) {
      const dc = dictionary?.colors?.find((c) => c.code === cw.colorCode);
      const name = dc?.name ?? cw.colorCode ?? '';
      byId.set(cw.colorwayId ?? 0, `${cw.colorCode ? `${cw.colorCode} · ` : ''}${name}`);
    }
    return (id: number) => byId.get(id) || (id > 0 ? `#${id}` : '(без колорвея)');
  }, [techCard?.colorways, dictionary?.colors]);

  const sizeLabel = useMemo(
    () => (id: number) => findInDictionary(dictionary, id, 'size') || String(id),
    [dictionary],
  );

  // bom_item_id → line_key. Клетка покрытия и разбор по деталям называют слот ЧИСЛОВЫМ id, а
  // запись настила требует стабильного line_key — мост между ними тут, и он двусторонний: у
  // сохранённого настила есть обе половины, у ещё не построенной пары — только id, и его надо
  // сопоставить со строкой BOM карточки.
  const slotByItemId = useMemo(() => {
    const m = new Map<number, { lineKey: string; name: string }>();
    for (const b of bomItems) {
      const id = wireInt(b.id);
      if (id > 0 && b.lineKey) m.set(id, { lineKey: b.lineKey, name: b.name || `слот #${id}` });
    }
    for (const l of lays) {
      const id = wireInt(l.bomItemId);
      if (id > 0 && l.bomLineKey && !m.has(id))
        m.set(id, { lineKey: l.bomLineKey, name: l.bomItemName || `слот #${id}` });
    }
    return m;
  }, [bomItems, lays]);

  // `materialId` едет вместе со слотом ради выбора РУЛОНА (Ф5б.1): лоты спрашиваются по артикулу,
  // а у ещё не сохранённого настила артикул известен только через слот, который для него выбрали.
  // 0 = строка BOM не связана с каталогом (свободный текст) — редактор говорит это вслух, вместо
  // того чтобы показать пустой список рулонов.
  const slotOptions = useMemo<LaySlotOption[]>(
    () =>
      bomItems
        .filter((b) => ROLL_SECTIONS.has(b.section ?? '') && !!b.lineKey)
        .map((b) => ({
          lineKey: b.lineKey!,
          name: b.name || b.lineKey!,
          materialId: wireInt(b.materialId),
        })),
    [bomItems],
  );

  // Пары (колорвей, слот), которые ОБЯЗАНЫ быть раскроены. Источник — разбор по деталям: он
  // говорит, какая деталь какого колорвея из какого слота режется, то есть это измерение, а не
  // догадка по списку BOM. Клетки покрытия добавляют слоты, давшие минимум, — на случай, когда
  // разбор по деталям для клетки не приехал.
  const neededPairs = useMemo(() => {
    const pairs = new Map<string, { colorwayId: number; bomItemId: number }>();
    const add = (colorwayId: number, bomItemId: number) => {
      if (colorwayId > 0 && bomItemId > 0)
        pairs.set(`${colorwayId}:${bomItemId}`, { colorwayId, bomItemId });
    };
    for (const y of pieceYields) add(wireInt(y.colorwayId), wireInt(y.bomItemId));
    for (const c of coverage)
      for (const b of c.blockingBomItemIds ?? []) add(wireInt(c.colorwayId), wireInt(b));
    for (const l of lays) add(wireInt(l.colorwayId), wireInt(l.bomItemId));
    return [...pairs.values()];
  }, [pieceYields, coverage, lays]);

  const coveredPairs = useMemo(
    () => new Set(lays.map((l) => `${wireInt(l.colorwayId)}:${wireInt(l.bomItemId)}`)),
    [lays],
  );

  const uncoveredPairs = useMemo(
    () => neededPairs.filter((p) => !coveredPairs.has(`${p.colorwayId}:${p.bomItemId}`)),
    [neededPairs, coveredPairs],
  );

  const colorwayIds = useMemo(() => {
    const ids = new Set<number>();
    for (const c of coverage) ids.add(wireInt(c.colorwayId));
    for (const l of lays) ids.add(wireInt(l.colorwayId));
    return [...ids].filter((id) => id > 0);
  }, [coverage, lays]);

  // Колонки — градация карточки в её порядке, плюс любой размер, встретившийся в клетках.
  const sizeIds = useMemo(() => {
    const grade = techCard?.techCard?.sizeIds ?? [];
    const extra = coverage
      .map((c) => wireInt(c.sizeId))
      .filter((s) => s > 0 && !grade.includes(s));
    return [...grade, ...new Set(extra)];
  }, [techCard?.techCard?.sizeIds, coverage]);

  const slotSummary = useMemo(() => {
    const byColorway = new Map<number, Set<string>>();
    for (const p of neededPairs) {
      const name = slotByItemId.get(p.bomItemId)?.name ?? `слот #${p.bomItemId}`;
      const set = byColorway.get(p.colorwayId) ?? new Set<string>();
      set.add(name);
      byColorway.set(p.colorwayId, set);
    }
    return (colorwayId: number) => [...(byColorway.get(colorwayId) ?? [])].join(' + ');
  }, [neededPairs, slotByItemId]);

  // aux-карточка: сервер отдаёт applicable = false с причиной, и блок не рисуется ВОВСЕ. Пустой
  // список настилов читался бы как «настилов пока нет», то есть как приглашение их построить, — а
  // у aux-прогона нет ни колорвеев, ни деталей, ни раскладок, и строить нечего.
  if (data && data.applicable === false) return null;

  const editable = canEdit && !locked;
  // НАСТЕЛЕНО, а не «покрыто»: этот счётчик знает лишь, есть ли у пары настил, — хватает ли его
  // слоёв на план, отвечает матрица клеток, и назвать его «покрытием» значило бы зачесть
  // недостаточный настил за достаточный. Разница ровно в том слове.
  const layedPairs = neededPairs.length - uncoveredPairs.length;
  const unknownCount = data?.unknownCount ?? 0;
  const caveats = data?.caveats ?? [];
  const colorwayOptions = colorwayIds.map((id) => ({ colorwayId: id, label: colorwayLabel(id) }));

  // «Количества проверены»: снимок обновляется БЕЗ единой правки секций. Отправляем ровно то, что
  // сервер только что отдал, — единственное, что меняет этот вызов, это флаг переподтверждения.
  const reaffirmQuantities = (lay: common_ProductionRunLay) => {
    if (!lay.layKey) return;
    reaffirm.mutate(
      {
        runId,
        lay: {
          layKey: lay.layKey,
          colorwayId: wireInt(lay.colorwayId),
          bomLineKey: lay.bomLineKey ?? '',
          mode: lay.mode,
          endLossCm: lay.endLossCm,
          name: lay.name ?? '',
          note: lay.note ?? '',
          displayOrder: lay.displayOrder ?? 0,
          // ЛОТ И ФАКТ НЕ ТРОГАЮТСЯ ВОВСЕ — оба флага очистки СНЯТЫ, и это здесь главное. Кнопка
          // «количества проверены» меняет ОДИН флаг, и всё остальное обязано доехать обратно
          // нетронутым. Подними она clear_lot или clear_actual — нажатие планировщика стёрло бы
          // замер цеха, то есть кнопка, которая по названию ничего не меняет, уничтожала бы данные
          // другого человека. Значения при этом всё равно возвращаются эхом: молчание сервер читает
          // как «не трогай», а эхо делает это верным и на случай, если чтение поля когда-нибудь
          // станет обязательным.
          lotId: lay.lotId ?? 0,
          clearLot: false,
          actualQty: lay.actualQty,
          actualUom: lay.actualUom,
          actualMethod: lay.actualMethod,
          clearActual: false,
          sections: (lay.sections ?? []).map((s, i) => ({
            sectionKey: s.sectionKey ?? '',
            markerId: s.markerId ?? 0,
            plies: s.plies ?? 0,
            // Позиция сервера возвращается как есть; порядковый номер — запасной вариант на
            // случай строки без позиции, чтобы переподтверждение не схлопнуло секции в 0.
            position: s.position ?? i + 1,
          })),
        },
        // Версия та, что приехала с настилом на экран, — переподтверждение конкурирует за настил
        // ровно так же, как правка.
        expectedLockVersion: lay.lockVersion ?? 0,
        reaffirmQuantities: true,
      },
      {
        onSuccess: () => showMessage('Количества подтверждены — настил перекрывает план', 'success'),
        onError: (e) => showMessage(layErrorMessage(e), 'error'),
      },
    );
  };

  return (
    <Section
      id={id}
      title='шаг 3 · как раскроить'
      question='Настилы: сколько слоёв какой раскладкой стелим, и покрывают ли они план партии.'
      action={
        neededPairs.length > 0 ? (
          <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
            настелено: {layedPairs} из {neededPairs.length} пар
          </Text>
        ) : null
      }
    >
      {isLoading ? (
        <Text size='small'>загрузка…</Text>
      ) : isError ? (
        <Text size='small'>План настилов недоступен.</Text>
      ) : (
        <>
          <LayCoverageTable
            cells={coverage}
            pieceYields={pieceYields}
            colorwayIds={colorwayIds}
            sizeIds={sizeIds}
            colorwayLabel={colorwayLabel}
            slotSummary={slotSummary}
            sizeLabel={sizeLabel}
          />

          {/* Непроверенные клетки объявляются ОТДЕЛЬНОЙ строкой, а не растворяются в покрытии:
              «не смогли посчитать» и «посчитали, не хватает» — разные новости, и вторая требует
              ткани, а первая — разметки. */}
          {unknownCount > 0 ? (
            <CalloutBox tone='note'>
              <Text size='small'>
                <b>{unknownCount}</b> дет. в клетках покрытия посчитать не удалось — симметрия кроя
                не размечена, деталь неатрибутируема к карточке или её слот не резолвится. Такие
                клетки НЕ засчитаны ни как покрытые, ни как нехватка.
              </Text>
            </CalloutBox>
          ) : null}

          {lays.length === 0 ? (
            <Text size='small' variant='inactive'>
              настилов ещё нет — потребность в материалах считается по нормам тех-карты
            </Text>
          ) : (
            <div className='flex flex-col'>
              {lays.map((lay, i) => (
                <LayCard
                  key={lay.layKey || lay.id}
                  lay={lay}
                  index={i}
                  colorwayLabel={colorwayLabel}
                  sizeLabel={sizeLabel}
                  canEdit={editable}
                  onEdit={() =>
                    setEditing({
                      layKey: lay.layKey || '',
                      colorwayId: wireInt(lay.colorwayId),
                      bomLineKey: lay.bomLineKey || '',
                    })
                  }
                  onDelete={() => setDeleting(lay)}
                  reaffirming={
                    reaffirm.isPending && reaffirm.variables?.lay?.layKey === lay.layKey
                  }
                  onPlotter={(section, key) => void downloadLayPlotter(lay, section, key)}
                  plottingKey={plottingKey}
                  onReaffirm={() => reaffirmQuantities(lay)}
                />
              ))}
            </div>
          )}

          {/* КНОПКА НА КАЖДУЮ непокрытую пару, а не одна общая «добавить». Это и превращает
              «покрытие красное» в «нажми сюда»: оператору не приходится переводить строку матрицы
              в «какой ещё настил я должен построить». */}
          {editable && uncoveredPairs.length > 0 ? (
            <div className='flex flex-wrap items-center gap-1.5'>
              {uncoveredPairs.map((p) => {
                const slot = slotByItemId.get(p.bomItemId);
                if (!slot) {
                  // Слот, который не резолвится в строку BOM карточки (например, удалён —
                  // fk SET NULL): настил на него построить нечем, и молчаливое исчезновение пары
                  // было бы хуже, чем сказанное вслух.
                  return (
                    <Text key={`${p.colorwayId}:${p.bomItemId}`} size='micro' className='text-error'>
                      {colorwayLabel(p.colorwayId)} · слот #{p.bomItemId} удалён из BOM — настил на
                      него не построить
                    </Text>
                  );
                }
                return (
                  <Button
                    key={`${p.colorwayId}:${p.bomItemId}`}
                    type='button'
                    variant='secondary'
                    size='sm'
                    onClick={() =>
                      setEditing({ colorwayId: p.colorwayId, bomLineKey: slot.lineKey })
                    }
                  >
                    + настил: {colorwayLabel(p.colorwayId)} · {slot.name}
                  </Button>
                );
              })}
            </div>
          ) : null}

          {/* Общая кнопка — только когда непокрытых пар не осталось (иначе она конкурировала бы с
              адресными) И есть из чего выбрать обе половины пары. Без колорвеев или без рулонных
              слотов она открыла бы форму, которую невозможно отправить. */}
          {editable &&
          uncoveredPairs.length === 0 &&
          slotOptions.length > 0 &&
          colorwayIds.length > 0 ? (
            <div>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                onClick={() => setEditing({ colorwayId: colorwayIds[0], bomLineKey: '' })}
              >
                + ещё настил
              </Button>
            </div>
          ) : null}

          {locked && canEdit ? (
            <Text size='small' variant='inactive'>
              партия закрыта — настил это план, а не история, и правится только на открытой партии
            </Text>
          ) : null}

          {caveats.length > 0 ? (
            <div className='flex flex-col gap-0.5'>
              {caveats.map((c, i) => (
                <Text key={i} variant='inactive' size='small'>
                  · {c}
                </Text>
              ))}
            </div>
          ) : null}
        </>
      )}

      {/* `key` по цели правки — редактор РЕМОНТИРУЕТСЯ при смене настила, поэтому засев состояния
          формы делают ленивые инициализаторы useState, и никакого эффекта-пересева не нужно. */}
      {editing ? (
        <LayEditor
          key={editing.layKey || `new:${editing.colorwayId}:${editing.bomLineKey}`}
          open
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          runId={runId}
          techCardId={techCardId}
          existing={
            editing.layKey ? lays.find((l) => l.layKey === editing.layKey) : undefined
          }
          seedColorwayId={editing.colorwayId}
          seedBomLineKey={editing.bomLineKey}
          colorwayLabel={colorwayLabel}
          colorwayOptions={colorwayOptions}
          slotOptions={slotOptions}
          runMarkers={runMarkers}
          cardMarkers={cardOnlyMarkers}
          nextDisplayOrder={lays.length + 1}
        />
      ) : null}

      <ConfirmationModal
        open={deleting != null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={`удалить настил ${deleting?.name || deleting?.bomItemName || ''}?`}
        confirmLabel={del.isPending ? 'удаляю…' : 'удалить'}
        confirmDisabled={del.isPending}
        closeOnConfirm={false}
        onConfirm={() => {
          if (!deleting?.layKey) return;
          del.mutate(
            { runId, layKey: deleting.layKey },
            {
              onSuccess: () => {
                setDeleting(null);
                showMessage('Настил удалён', 'success');
              },
              onError: (e) => showMessage(layErrorMessage(e), 'error'),
            },
          );
        }}
      >
        <Text size='small'>
          Секции настила удалятся вместе с ним. Раскройные раскладки прогона останутся — их можно
          будет переиспользовать в другом настиле. Потребность в материалах по этой паре вернётся к
          норме тех-карты.
        </Text>
      </ConfirmationModal>
    </Section>
  );
}
