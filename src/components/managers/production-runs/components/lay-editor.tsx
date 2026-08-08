import {
  common_MaterialUnit,
  common_ProductionLayActualMethod,
  common_ProductionLayMode,
  common_ProductionRunLay,
  common_ProductionRunLayInsert,
  common_TechCardMarkerSummary,
} from 'api/proto-http/admin';
import { useMaterialLots } from 'components/managers/materials/components/useWarehouse';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import SelectComponent from 'ui/components/select';
import { inputToDecimal, parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';
import { ulid } from 'utils/ulid';
import { LAY_MODE_LABEL, stampWhen } from './lay-card';
import { LaySectionRows, SectionDraft, newSectionDraft, sectionPlies } from './lay-section-rows';
import {
  FACT_UNIT_OPTIONS,
  LAY_ACTUAL_METHODS,
  LAY_ACTUAL_METHOD_LABEL,
  MATERIAL_UNIT_LABEL,
  VERDICT_GLYPH,
  VERDICT_TEXT,
  allLayChecks,
  layErrorMessage,
  layLotState,
  layVerdict,
  useCopyMarkerToRun,
  useSaveLay,
} from './useLays';

/**
 * Слот BOM, на который можно настелить. `materialId` — артикул склада за слотом (0 = слот не
 * привязан к каталогу): по нему спрашиваются рулоны, и без него выбирать лот не из чего.
 */
export type LaySlotOption = { lineKey: string; name: string; materialId: number };
export type LayColorwayOption = { colorwayId: number; label: string };

// ЕДИНСТВЕННОЕ место во всём плане настилов, где живёт состояние формы.
//
// `LayPlan` знает только «какой настил открыт», `LayCard` не знает ничего, `MarkerPicker` — только
// открыт ли поповер. Это не вкусовщина: соседний `detail-page.tsx` держит всё сразу на 963 строках,
// и цена этого видна на каждой его правке.
//
// Состояние засевается ЛЕНИВЫМИ инициализаторами `useState`, а не эффектом по пропсам. Родитель
// монтирует редактор с `key`, зависящим от цели правки, поэтому смена настила — это РЕМОНТ
// компонента, а не пересев. Тем самым здесь физически не может появиться грабля `lines-grid.tsx`,
// которой понадобился отдельный флаг `dirty`, чтобы фоновый рефетч не стёр набранное.
export function LayEditor({
  open,
  onOpenChange,
  runId,
  techCardId,
  existing,
  seedColorwayId,
  seedBomLineKey,
  colorwayLabel,
  colorwayOptions,
  slotOptions,
  runMarkers,
  cardMarkers,
  nextDisplayOrder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: number;
  techCardId: number;
  /** undefined = новый настил. */
  existing?: common_ProductionRunLay;
  seedColorwayId: number;
  seedBomLineKey: string;
  colorwayLabel: (colorwayId: number) => string;
  /** Колорвеи прогона — обе половины идентичности нового настила выбираются здесь. */
  colorwayOptions: LayColorwayOption[];
  /** Рулонные слоты карточки. */
  slotOptions: LaySlotOption[];
  runMarkers: common_TechCardMarkerSummary[];
  cardMarkers: common_TechCardMarkerSummary[];
  nextDisplayOrder: number;
}) {
  const { showMessage } = useSnackBarStore();
  const save = useSaveLay();
  const copy = useCopyMarkerToRun();

  // Ключ настила минтится клиентом ОДИН раз за открытие редактора (§4.1: «клиент; пустой ⇒
  // сервер»). Повтор сохранения после обрыва сети тогда попадает в тот же ключ и обновляет тот же
  // настил, вместо того чтобы создать второй.
  const [layKey] = useState(() => existing?.layKey || ulid());
  // ВЕРСИЯ ПИННИТСЯ ПРИ ОТКРЫТИИ, а не читается из свежего пропса на сабмите. Это ровно та
  // ошибка, которую useUpdateRunSection уже один раз совершил и задокументировал
  // (useProductionRuns.ts:17-23): версия, перечитанная непосредственно перед записью, всегда
  // совпадает, и блокировка превращается в last-write-wins, который лишь ВЫГЛЯДИТ блокировкой.
  // Сравнивать надо с тем, что оператор видел, когда делал правку.
  const [pinnedLockVersion] = useState<number | undefined>(() =>
    existing ? existing.lockVersion ?? 0 : undefined,
  );
  const [colorwayId, setColorwayId] = useState(() => existing?.colorwayId ?? seedColorwayId);
  const [bomLineKey, setBomLineKey] = useState(() => existing?.bomLineKey || seedBomLineKey);
  const [mode, setMode] = useState<common_ProductionLayMode>(
    () => existing?.mode ?? 'PRODUCTION_LAY_MODE_FACE_UP',
  );
  // 2 см на конец — калибровка из модели («20 слоёв × 3 м ⇒ ~1.3%»). Значение проставлено ЯВНО и
  // названо в подсказке: тихий ноль занижал бы потребность, а занижение потерь дороже завышения.
  // У СУЩЕСТВУЮЩЕГО настила подставлять его нельзя: тогда правка примечания молча переписала бы
  // цифру, которую оператор осознанно оставил незаполненной.
  const [endLoss, setEndLoss] = useState(() =>
    existing ? existing.endLossCm?.value ?? '' : '2',
  );
  const [name, setName] = useState(() => existing?.name ?? '');
  const [note, setNote] = useState(() => existing?.note ?? '');
  const [sections, setSections] = useState<SectionDraft[]>(() =>
    (existing?.sections ?? []).length > 0
      ? (existing?.sections ?? []).map((s) => ({
          sectionKey: s.sectionKey || ulid(),
          markerId: s.markerId ?? 0,
          plies: String(s.plies ?? ''),
        }))
      : [newSectionDraft()],
  );

  // ── ЛОТ И ФАКТ РАСХОДА (Ф5б.1 / Ф5б.2) ─────────────────────────────────────
  // Всё это цеховая половина настила, и она заводится тем же ленивым засевом: правка настила —
  // ПОЛНАЯ ЗАМЕНА состояния, поэтому форма обязана держать текущие значения даже тогда, когда
  // человек их не трогает.
  const [lotId, setLotId] = useState(() => existing?.lotId ?? 0);
  const [actualQty, setActualQty] = useState(() => existing?.actualQty?.value ?? '');
  // UNKNOWN / UNSPECIFIED в форму НЕ садятся: «единицу не распознали» — это ответ сервера о
  // хранимой строке, а не выбор человека, и предложить его как вариант значило бы дать выбрать
  // «не знаю» вместо единицы.
  const [actualUom, setActualUom] = useState<common_MaterialUnit | ''>(() =>
    existing?.actualUom && existing.actualUom !== 'MATERIAL_UNIT_UNKNOWN' ? existing.actualUom : '',
  );
  const [actualMethod, setActualMethod] = useState<common_ProductionLayActualMethod | ''>(() =>
    existing?.actualMethod &&
    existing.actualMethod !== 'PRODUCTION_LAY_ACTUAL_METHOD_UNSPECIFIED'
      ? existing.actualMethod
      : '',
  );

  // Артикул, чьи рулоны предлагаются. У сохранённого настила он приезжает с сервера (это то, что
  // колорвей пинит СЕГОДНЯ), у нового — резолвится из выбранного слота. 0 = слот вообще не связан с
  // каталогом (свободный текст в BOM): тогда список рулонов взять неоткуда, и это говорится вслух.
  const materialId =
    (existing?.materialId ?? 0) ||
    slotOptions.find((s) => s.lineKey === bomLineKey)?.materialId ||
    0;

  // `includeArchived: true` СОЗНАТЕЛЬНО. Архивный рулон нельзя прятать из списка: если настил уже
  // на него ссылается, выбор молча показал бы пустоту вместо привязки, которая никуда не делась.
  // Архив помечен в подписи — видно, что рулон отработан, но переписать историю список не может.
  const lots = useMaterialLots(materialId, true, materialId > 0);
  const lotItems = (lots.data?.lots ?? []).map((l) => {
    const width = (l.measuredWidthCm?.value ?? '').trim();
    return {
      value: l.id ?? 0,
      // Ширина стоит рядом с кодом, потому что раскройщик выбирает рулон по коду, а сверка ширины —
      // то, ради чего выбор вообще существует (Р8): маркер шире рулона не выкроится ни в один
      // проход. «Не замерена» пишется словами — пустое место прочиталось бы как «совпадает с
      // номиналом», а это ровно то, чего measured_width_cm не утверждает.
      label: `${l.lotCode || `#${l.id}`} · ${width ? `${width} см` : 'ширина не замерена'}${
        l.archived ? ' · архив' : ''
      }`,
    };
  });
  const lotState = layLotState({ lotId, lotCode: existing?.lotCode });

  const isNew = !existing;
  const busy = save.isPending;

  // Кандидаты на копирование — карточные раскладки ЭТОГО слота. Норма выносится вперёд: она
  // и есть тот самый «скопировать норму в прогон».
  const copySources = cardMarkers
    .filter((m) => (m.bomLineKey ?? '') === bomLineKey && bomLineKey !== '')
    .sort((a, b) => Number(b.isNorm ?? false) - Number(a.isNorm ?? false));

  // ── живые итоги, §7.1 ──────────────────────────────────────────────────────
  // cloth = Σ (used_length × plies);  end_loss_total = 2 × end_loss × Σ plies;  planned = сумма.
  // Считаются ровно по тем числам, что оператор видит на экране, поэтому расходиться с сервером им
  // не на чем — кроме высоты стопки, у которой на клиенте нет входных данных (см. ниже).
  const totalPlies = sections.reduce((s, x) => s + sectionPlies(x), 0);
  const clothCm = sections.reduce((sum, x) => {
    const m = runMarkers.find((mm) => (mm.id ?? 0) === x.markerId);
    const len = Number(m?.usedLengthCm?.value);
    return sum + (Number.isFinite(len) ? len * sectionPlies(x) : 0);
  }, 0);
  const endLossNum = Number(endLoss);
  const endLossTotalCm = Number.isFinite(endLossNum) ? 2 * endLossNum * totalPlies : 0;
  const plannedCm = clothCm + endLossTotalCm;

  const problems: string[] = [];
  if (!bomLineKey) problems.push('не выбрана ткань (слот BOM), которую этот настил кроит');
  if (colorwayId <= 0) problems.push('настил не привязан к колорвею — класть его не на что');
  if (sections.length === 0) problems.push('нет ни одной секции');
  if (sections.some((s) => s.markerId <= 0)) problems.push('в какой-то секции не выбрана раскладка');
  if (sections.some((s) => sectionPlies(s) <= 0)) problems.push('в какой-то секции не задано число слоёв');
  if (
    mode === 'PRODUCTION_LAY_MODE_FACE_TO_FACE' &&
    sections.some((s) => sectionPlies(s) > 0 && sectionPlies(s) % 2 !== 0)
  ) {
    problems.push('лицом к лицу слои складываются парами — нечётное число слоёв неисполнимо');
  }
  // «ФАКТ ЦЕЛИКОМ ИЛИ НИКАК», и импликация ОДНОСТОРОННЯЯ: количество ⇒ единица И метод. Обратное
  // не требуется — единица, выбранная раньше количества, это наполовину заполненная форма, а не
  // ошибка, поэтому строк про «выбрана единица без количества» здесь нет и быть не должно.
  //
  // Проверяется ЗДЕСЬ, до отправки. В схеме это CHECK (chk_prlay_actual_complete), но CHECK — пол
  // под прямым SQL-писателем: он отвечает именем ограничения, из которого цех не узнает, какого из
  // трёх полей не хватило.
  const factQtyTyped = actualQty.trim() !== '';
  if (factQtyTyped && !(parseDecimalNumber(actualQty) > 0)) {
    problems.push(
      'факт расхода — положительное число; чтобы отозвать замер, очистите поле целиком',
    );
  }
  if (factQtyTyped && !actualUom) {
    problems.push('введено количество факта, но не сказано, в чём оно измерено');
  }
  if (factQtyTyped && !actualMethod) {
    problems.push('введено количество факта, но не сказано, как его замерили');
  }

  const submit = () => {
    if (problems.length > 0) return;
    // Генерированные типы запроса НЕ опциональны: каждое поле перечислено явно, включая те, что
    // уезжают пустыми (§14 п.15). Пропуск поля здесь — ошибка компиляции, и это ровно то, чего мы
    // от неё хотим.
    const lay: common_ProductionRunLayInsert = {
      layKey,
      colorwayId,
      bomLineKey,
      mode,
      endLossCm: inputToDecimal(endLoss),
      name: name.trim(),
      note: note.trim(),
      displayOrder: existing?.displayOrder ?? nextDisplayOrder,
      // ЛОТ И ФАКТ — ТЕПЕРЬ ИЗ ФОРМЫ, А НЕ ЭХОМ. Эхо стояло здесь ровно до тех пор, пока форма их
      // не редактировала; теперь она редактирует, и значения приходят из её состояния — которое
      // засеяно из `existing`, поэтому нетронутые поля по-прежнему уезжают такими, какими пришли.
      // Сохранение настила остаётся ПОЛНОЙ ЗАМЕНОЙ состояния, и это единственная причина, по
      // которой оба поля обязаны быть здесь названы.
      lotId,
      // ОТВЯЗКА ПРОИЗНОСИТСЯ ФЛАГОМ, а не нулём в lotId: голым int32 «не трогай» и «отвяжи» не
      // различить, и сервер читает ноль как молчание. Без этого выбор «— рулон не назван —»
      // сохранялся бы молча ничего не меняя, и оператор не смог бы снять ошибочно выбранный рулон.
      // Эта форма — полный редактор лота, поэтому её «не назван» и есть намерение отвязать; на
      // новом настиле это отвязка того, чего нет, то есть ничего.
      clearLot: lotId <= 0,
      // Пустое количество отзывает факт ЦЕЛИКОМ — вместе с единицей, методом и подписью замерщика.
      // Единица без числа не отправляется: наполовину заполненная ФОРМА законна (импликация
      // односторонняя), но наполовину заполненная СТРОКА в базе — это единица при несуществующем
      // замере, то есть подпись под числом, которого нет.
      actualQty: factQtyTyped ? inputToDecimal(actualQty) : undefined,
      actualUom: factQtyTyped ? actualUom || undefined : undefined,
      actualMethod: factQtyTyped ? actualMethod || undefined : undefined,
      clearActual: !factQtyTyped,
      sections: sections.map((s, i) => ({
        sectionKey: s.sectionKey,
        markerId: s.markerId,
        plies: sectionPlies(s),
        // Позиция ВЫВОДИТСЯ из порядка строк ровно здесь и больше нигде.
        position: i + 1,
      })),
    };
    save.mutate(
      {
        runId,
        lay,
        // PRESENCE, А НЕ ВЕЛИЧИНА. На создании поле обязано отсутствовать; у существующего настила
        // отсутствие — это отказ, а не last-write-wins. Отправляется ЗАПИННЕННАЯ при открытии
        // версия (см. выше), поэтому чужое сохранение, случившееся пока форма открыта, даёт
        // конфликт, а не тихую перезапись.
        expectedLockVersion: pinnedLockVersion,
        // Правка секций сама обновляет снимок на сервере; переподтверждение — отдельная кнопка на
        // карточке, и смешивать их значило бы отмывать бейдж случайной правкой примечания.
        reaffirmQuantities: false,
      },
      {
        onSuccess: () => {
          showMessage(isNew ? 'Настил создан' : 'Настил сохранён', 'success');
          onOpenChange(false);
        },
        onError: (e) => showMessage(layErrorMessage(e), 'error'),
      },
    );
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={submit}
      // Форма закрывается САМА в onSuccess: автозакрытие стёрло бы набранное на любом отказе
      // сервера — а отказ здесь штатен (конфликт версии, нечётные слои, чужой маркер).
      closeOnConfirm={false}
      width='lg'
      title={`${isNew ? 'новый настил' : 'настил'} · ${colorwayLabel(colorwayId)}`}
      confirmLabel={busy ? 'сохраняю…' : isNew ? 'создать настил' : 'сохранить'}
      confirmDisabled={busy || problems.length > 0}
      cancelLabel='закрыть'
    >
      <div className='flex flex-col gap-2.5'>
        <GroupLabel flush>что и чем кроим</GroupLabel>

        {/* Идентичность настила — пара (колорвей, СЛОТ). У нового выбираются ОБЕ половины, даже
            когда обе приехали засевом с кнопки «+ настил»: показать выбор и дать его поправить
            дешевле, чем запереть оператора в форме с чужой парой. У существующего настила пара
            только читается — сменить её значит сделать другой настил. */}
        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            колорвей
          </Text>
          {isNew ? (
            <SelectComponent
              name='lay-colorway'
              items={colorwayOptions.map((c) => ({ value: c.colorwayId, label: c.label }))}
              value={colorwayId || ''}
              onValueChange={(v: string) => setColorwayId(Number(v) || 0)}
              placeholder='— выберите колорвей —'
              fullWidth
            />
          ) : (
            <Text size='small'>{colorwayLabel(colorwayId)}</Text>
          )}
        </div>

        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            ткань настила
          </Text>
          {isNew ? (
            <SelectComponent
              name='lay-slot'
              items={slotOptions.map((s) => ({ value: s.lineKey, label: s.name }))}
              value={bomLineKey}
              // Смена слота — это смена АРТИКУЛА, а значит и списка рулонов. Выбранный до неё лот
              // принадлежит прежней ткани, и оставить его значило бы отправить на сервер заведомый
              // отказ («lot_of_another_article») или, хуже, привязать настил к чужому рулону.
              onValueChange={(v: string) => {
                setBomLineKey(v);
                setLotId(0);
              }}
              placeholder='— выберите слот —'
              fullWidth
            />
          ) : (
            <Text size='small'>
              {existing?.bomItemName || bomLineKey || '—'}
              {existing?.materialName ? ` · ${existing.materialName}` : ''}
            </Text>
          )}
        </div>

        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            режим настилания
          </Text>
          <ChipRow>
            {(
              ['PRODUCTION_LAY_MODE_FACE_UP', 'PRODUCTION_LAY_MODE_FACE_TO_FACE'] as const
            ).map((m) => (
              <Chip key={m} selected={mode === m} pressed={mode === m} onClick={() => setMode(m)}>
                {LAY_MODE_LABEL[m]}
              </Chip>
            ))}
          </ChipRow>
          <Text size='micro' variant='label'>
            {mode === 'PRODUCTION_LAY_MODE_FACE_TO_FACE'
              ? 'слои ложатся парами: число слоёв в каждой секции обязано быть чётным, а направленную ткань так стелить нельзя — нижние слои разворачивают ворс.'
              : 'все слои лицом вверх: чётность не требуется, направленная ткань допустима, зеркальные детали обязаны лежать в раскладке парами.'}
          </Text>
        </div>

        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            концевые потери, см на ОДИН конец ОДНОГО слоя
          </Text>
          <Input
            name='lay-end-loss'
            className='w-24'
            inputMode='decimal'
            value={endLoss}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEndLoss(sanitizeDecimal(e.target.value, 2))
            }
          />
          <Text size='micro' variant='label'>
            типовое значение 2–5 см; полные потери = 2 × это число × сумма слоёв. Значение 2
            проставлено по умолчанию — поправьте под свой цех.
          </Text>
        </div>

        <GroupLabel>секции</GroupLabel>
        <LaySectionRows
          sections={sections}
          onChange={setSections}
          mode={mode}
          runMarkers={runMarkers}
          copySources={copySources}
          bomLineKey={bomLineKey}
          colorwayId={colorwayId}
          copying={copy.isPending}
          disabled={busy}
          onCopyMarker={(sourceMarkerId) =>
            copy.mutate(
              { runId, techCardId, sourceMarkerId },
              {
                onSuccess: () =>
                  showMessage(
                    'Раскладка скопирована в прогон — выберите её в секции',
                    'success',
                  ),
                onError: (e) => showMessage(layErrorMessage(e), 'error'),
              },
            )
          }
        />

        <GroupLabel>сколько ткани это съест</GroupLabel>
        <StatGrid>
          <Stat label='слоёв всего' value={totalPlies > 0 ? String(totalPlies) : '—'} />
          <Stat label='ткань' value={clothCm > 0 ? `${(clothCm / 100).toFixed(2)} м` : '—'} />
          <Stat
            label='концевые'
            value={endLossTotalCm > 0 ? `${(endLossTotalCm / 100).toFixed(2)} м` : '—'}
          />
          <Stat
            label='план настила'
            value={plannedCm > 0 ? `${(plannedCm / 100).toFixed(2)} м` : '—'}
          />
          {/* Высота стопки НЕ СЧИТАЕТСЯ на клиенте, и это не лень: толщина ткани живёт на артикуле
              и по проводу сюда не едет. Показать «0 см» значило бы сказать «влезает», а это
              третий, отдельный ответ — «не проверено». */}
          <Stat label='высота стопки' value='—' sub='считается на сервере при сохранении' />
        </StatGrid>

        {/* ЦЕХОВАЯ ПОЛОВИНА НАСТИЛА. Всё выше — план, который строит планировщик; всё ниже знает
            только тот, кто стоял у стола: с какого рулона стелили и сколько ткани реально ушло. */}
        <GroupLabel>рулон и факт расхода</GroupLabel>

        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            с какого рулона стелили
          </Text>
          {materialId > 0 ? (
            <SelectComponent
              name='lay-lot'
              // «Рулон не назван» стоит ПЕРВЫМ пунктом, а не отсутствует: это законное состояние
              // настила, а не пропуск в форме, и вернуться в него надо уметь так же, как в него
              // попасть. Заставлять выбирать рулон значило бы требовать от планировщика знания,
              // которое появляется только у стола.
              items={[{ value: 0, label: '— рулон не назван —' }, ...lotItems]}
              value={String(lotId)}
              onValueChange={(v: string) => setLotId(Number(v) || 0)}
              placeholder={lots.isLoading ? 'рулоны загружаются…' : '— рулон не назван —'}
              disabled={busy || lots.isLoading}
              fullWidth
            />
          ) : (
            <Text size='small' variant='inactive'>
              артикул этого слота не определяется (строка BOM не связана с каталогом либо слот
              удалён) — рулоны выбирать не из чего
            </Text>
          )}
          <Text size='micro' variant='label'>
            Рядом с кодом стоит ИЗМЕРЕННАЯ ширина рулона: маркер шире неё не выкроится ни в один
            проход, и сервер отвечает на это запретом (проверка «ширина рулона»). Рулон без замера
            даёт «не проверено», а не «влезает».
          </Text>
          {lots.isError ? (
            <Text size='micro' className='text-error'>
              список рулонов не читается — сохранить настил всё равно можно, рулон останется
              прежним
            </Text>
          ) : null}
          {/* Рулон, которого больше нет в справочнике. Настил называет его по снимку кода — это
              история, и она здесь показывается, а не прячется за пустым выбором. */}
          {lotState === 'detached' ? (
            <CalloutBox tone='note'>
              <Text size='small'>
                Рулон <b>{existing?.lotCode}</b> удалён из складского справочника. Настил называет
                его по снимку кода; выбрать его заново в списке нельзя — только назвать другой
                живой рулон.
              </Text>
            </CalloutBox>
          ) : null}
        </div>

        <div className='flex flex-wrap items-end gap-2.5'>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              сколько реально ушло
            </Text>
            <Input
              name='lay-actual-qty'
              className='w-28'
              inputMode='decimal'
              value={actualQty}
              disabled={busy}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setActualQty(sanitizeDecimal(e.target.value, 3))
              }
            />
          </div>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              единица
            </Text>
            <SelectComponent
              name='lay-actual-uom'
              items={FACT_UNIT_OPTIONS.map((u) => ({ value: u, label: MATERIAL_UNIT_LABEL[u] }))}
              value={actualUom}
              onValueChange={(v: string) => setActualUom(v as common_MaterialUnit)}
              placeholder='— единица —'
              disabled={busy}
              customWidth={200}
            />
          </div>
        </div>

        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            чем замеряли
          </Text>
          <ChipRow>
            {LAY_ACTUAL_METHODS.map((m) => (
              <Chip
                key={m}
                selected={actualMethod === m}
                pressed={actualMethod === m}
                disabled={busy}
                onClick={() => setActualMethod(actualMethod === m ? '' : m)}
              >
                {LAY_ACTUAL_METHOD_LABEL[m]}
              </Chip>
            ))}
          </ChipRow>
          <Text size='micro' variant='label'>
            Количество, единица и метод едут ВМЕСТЕ: число без единицы нечем сложить, а число без
            метода — число, о точности которого нечего сказать. Пустое количество отзывает замер
            целиком. Дрейф к плану настила пересчитает сервер.
          </Text>
          {existing?.actualBy || existing?.actualAt ? (
            <Text size='micro' variant='label'>
              последний замер: {existing?.actualBy || 'автор не записан'}
              {stampWhen(existing?.actualAt) ? ` · ${stampWhen(existing?.actualAt)}` : ''}. Подпись
              переписывается только тогда, когда меняется само измерение.
            </Text>
          ) : null}
        </div>

        {/* Проверки берутся из ОБОИХ мест провода (allLayChecks): маркерные — в том числе «маркер
            шире рулона» — приезжают в секциях, и форма, где рулон как раз и выбирают, обязана
            показать причину отказа, а не отправлять за ней обратно на карточку. */}
        {existing && allLayChecks(existing).length > 0 ? (
          <>
            <GroupLabel>проверки на последнем чтении</GroupLabel>
            <div className='flex flex-col'>
              {allLayChecks(existing).map((c, i) => {
                const v = layVerdict(c.status);
                return (
                  // Ключ несёт ИНДЕКС, а не только `c.key`: одна и та же маркерная проверка
                  // приезжает по разу на КАЖДУЮ секцию, и трёхсекционный настил дал бы три
                  // одинаковых ключа.
                  <Text key={`${c.key || 'check'}-${i}`} size='micro' className={VERDICT_TEXT[v]}>
                    {VERDICT_GLYPH[v]} {v === 'unknown' ? 'не проверено: ' : ''}
                    {c.label || c.key}
                    {c.detail ? ` — ${c.detail}` : ''}
                  </Text>
                );
              })}
            </div>
          </>
        ) : null}

        <GroupLabel>подпись</GroupLabel>
        <div className='flex flex-col gap-1'>
          <Input
            name='lay-name'
            placeholder='имя настила (для цеха)'
            value={name}
            disabled={busy}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          />
          <textarea
            className='min-h-[44px] w-full resize-y border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize focus:border-textColor focus:outline-none'
            rows={2}
            placeholder='примечание'
            disabled={busy}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Text size='micro' variant='label'>
            Правка имени, примечания или порядка снимок количеств НЕ трогает — иначе бейдж
            «количества изменились» отмывался бы случайно.
          </Text>
        </div>

        {problems.length > 0 ? (
          <CalloutBox tone='error'>
            {problems.map((p) => (
              <Text key={p} size='small'>
                <b>!</b> {p}
              </Text>
            ))}
          </CalloutBox>
        ) : null}
      </div>
    </ConfirmationModal>
  );
}
