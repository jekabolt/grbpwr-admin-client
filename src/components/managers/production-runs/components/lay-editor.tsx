import {
  common_ProductionLayMode,
  common_ProductionRunLay,
  common_ProductionRunLayInsert,
  common_TechCardMarkerSummary,
} from 'api/proto-http/admin';
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
import { inputToDecimal, sanitizeDecimal } from 'utils/decimal';
import { ulid } from 'utils/ulid';
import { LAY_MODE_LABEL } from './lay-card';
import { LaySectionRows, SectionDraft, newSectionDraft, sectionPlies } from './lay-section-rows';
import {
  VERDICT_GLYPH,
  VERDICT_TEXT,
  layErrorMessage,
  layVerdict,
  useCopyMarkerToRun,
  useSaveLay,
} from './useLays';

export type LaySlotOption = { lineKey: string; name: string };
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
              onValueChange={(v: string) => setBomLineKey(v)}
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

        {existing && (existing.checks ?? []).length > 0 ? (
          <>
            <GroupLabel>проверки на последнем чтении</GroupLabel>
            <div className='flex flex-col'>
              {(existing.checks ?? []).map((c, i) => {
                const v = layVerdict(c.status);
                return (
                  <Text key={c.key || i} size='micro' className={VERDICT_TEXT[v]}>
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
