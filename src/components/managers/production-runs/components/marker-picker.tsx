import { common_TechCardMarkerSummary } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';

export type MarkerFitness = { eligible: boolean; reason: string };

// Годность маркера для ЭТОЙ секции — клиентская половина предиката `lay_marker_scope` (§8).
// Серверная половина ОТКАЗЫВАЕТ на записи; здесь она нужна затем, чтобы не предложить выбор,
// который заведомо будет отвергнут.
//
// Два случая заслуживают отдельных слов, а не общего «не подходит»:
//   · маркер потерял слот (fk_tcm_bom = SET NULL, §14 п.6) — геометрия жива, привязка нет;
//   · маркер «общий» (colorway_id = 0, fk_tcm_colorway = SET NULL, §14 п.7) — он ГОДЕН любому
//     цвету, и показать его как «этого колорвея» было бы ложью: маркер мог потерять свой цвет,
//     а не быть снятым для всех.
export function markerFitness(
  m: common_TechCardMarkerSummary,
  bomLineKey: string,
  colorwayId: number,
): MarkerFitness {
  // Слот настила ещё не выбран: годность неизвестна, и предлагать выбор наугад значило бы
  // готовить отказ сервера. Это не «не подходит», а «нечем сравнивать» — так и сказано.
  if (!bomLineKey) return { eligible: false, reason: 'сначала выберите ткань настила' };
  // ЧЕРНОВИК (0299) В СЕКЦИЮ НЕ ВСТАЁТ — сервер отказывает, и правильно: у такой раскладки не
  // легла часть деталей, то есть настил по ней выкроил бы неполное изделие. Причина названа здесь
  // же, потому что во всём остальном черновик выглядит обычной раскладкой этого слота и цвета.
  if (m.isDraft === true)
    return {
      eligible: false,
      reason: 'черновик — уложены не все детали; пересчитайте раскладку с бо́льшим бюджетом',
    };
  const mk = (m.bomLineKey ?? '').trim();
  if (!mk) return { eligible: false, reason: 'раскладка потеряла слот BOM — перепривяжите её' };
  if (mk !== bomLineKey) return { eligible: false, reason: 'снята для другой ткани настила' };
  const mcw = m.colorwayId ?? 0;
  if (mcw !== 0 && colorwayId > 0 && mcw !== colorwayId)
    return { eligible: false, reason: 'снята для другого колорвея' };
  return { eligible: true, reason: mcw === 0 ? 'общая — годна любому цвету' : '' };
}

function markerLine(m: common_TechCardMarkerSummary): string {
  const len = decimalToInput(m.usedLengthCm);
  const width = decimalToInput(m.fabricWidthCm);
  const eff = decimalToInput(m.efficiencyPct);
  const units = m.totalUnits ?? 0;
  return [
    len ? `${len} см` : '',
    width ? `ш ${width}` : '',
    units ? `${units} изд.` : '',
    eff ? `${eff}%` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

// Выбор раскладки для одной секции настила. Состояния не держит НИЧЕГО, кроме открытости
// поповера — список кандидатов, признак занятости и все действия приходят пропсами, а решение о
// том, что произойдёт при копировании, принимает редактор.
export function MarkerPicker({
  value,
  runMarkers,
  bomLineKey,
  colorwayId,
  copySources,
  onChange,
  onCopy,
  copying,
  disabled,
}: {
  value: number;
  /** Раскройные маркеры ЭТОГО прогона — единственное, на что секция вправе ссылаться. */
  runMarkers: common_TechCardMarkerSummary[];
  bomLineKey: string;
  colorwayId: number;
  /** Карточные раскладки этого слота (норма среди них) — источники для копии в прогон. */
  copySources: common_TechCardMarkerSummary[];
  onChange: (markerId: number) => void;
  onCopy: (sourceMarkerId: number) => void;
  copying: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = runMarkers.find((m) => (m.id ?? 0) === value);

  return (
    <GenericPopover
      open={open && !disabled}
      onOpenChange={setOpen}
      noTail
      title='раскладка секции'
      className='w-[300px]'
      triggerProps={{
        disabled,
        'aria-label': 'выбрать раскладку',
        className: cn(
          'flex w-[200px] items-center gap-2 border bg-bgColor px-[7px] py-[3px] text-left',
          // Секция без раскладки не сохранится — поле краснеет сразу, а не после отказа сервера.
          selected ? 'border-borderColor' : 'border-error',
        ),
      }}
      openElement={(isOpen) => (
        <>
          <span className='min-w-0 flex-1'>
            <Text component='span' size='control' className='block truncate'>
              {selected ? selected.name || `#${selected.id}` : '— выбрать раскладку —'}
            </Text>
            {selected ? (
              <Text component='span' size='micro' variant='label' className='block truncate'>
                {markerLine(selected)}
              </Text>
            ) : null}
          </span>
          <Text component='span' variant='inactive' className='shrink-0'>
            {isOpen ? '▴' : '▾'}
          </Text>
        </>
      )}
    >
      {/* Список во всю ширину поповера — тот же приём, что у пикера слота в рецепте колорвея:
          текущий вариант помечается зеброй и галочкой, а не заливкой чернилами (заливка — контракт
          Chip, кликабельного токена, а не строки списка). */}
      <div role='listbox' aria-label='раскладка секции' className='-mx-2 -my-1.5'>
        {runMarkers.length === 0 ? (
          <div className='px-2 py-2.5'>
            <Text size='micro' variant='label'>
              у этого прогона ещё нет ни одной раскройной раскладки
            </Text>
          </div>
        ) : (
          runMarkers.map((m) => {
            const fit = markerFitness(m, bomLineKey, colorwayId);
            const current = (m.id ?? 0) === value;
            return (
              <button
                key={m.id}
                type='button'
                role='option'
                aria-selected={current}
                disabled={!fit.eligible}
                onClick={() => {
                  onChange(m.id ?? 0);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 border-b border-hairline px-2 py-1 text-left',
                  current && 'bg-bgZebra',
                  !fit.eligible && 'cursor-not-allowed',
                )}
              >
                <span className='min-w-0 flex-1'>
                  <Text component='span' size='control' className='block truncate'>
                    {m.name || `#${m.id}`}
                  </Text>
                  <Text component='span' size='micro' variant='label' className='block truncate'>
                    {markerLine(m)}
                  </Text>
                  {fit.reason ? (
                    <Text
                      component='span'
                      size='micro'
                      className={cn(
                        'block truncate',
                        fit.eligible ? 'text-labelColor' : 'text-error',
                      )}
                    >
                      {fit.reason}
                    </Text>
                  ) : null}
                </span>
                {current ? (
                  <Text component='span' variant='inactive' className='shrink-0'>
                    ✓
                  </Text>
                ) : null}
              </button>
            );
          })
        )}
      </div>

      <div className='flex flex-col gap-1'>
        <GroupLabel>взять готовую геометрию</GroupLabel>
        {/* Секция НЕ МОЖЕТ ссылаться на карточный маркер — поэтому не «выбрать норму», а
            «скопировать норму в прогон»: копия фиксирует условия ЭТОГО прогона и умирает вместе с
            ним, тогда как ссылка на норму молча пересняла бы условия при её следующей пересъёмке
            (§5.5). Цена — дубликат блоба, и она названа. */}
        {copySources.length === 0 ? (
          <Text size='micro' variant='label'>
            у этого слота нет карточных раскладок, которые можно скопировать
          </Text>
        ) : (
          copySources.map((m) => (
            <Button
              key={m.id}
              type='button'
              variant='secondary'
              size='xs'
              disabled={copying || disabled}
              className='w-full'
              onClick={() => {
                onCopy(m.id ?? 0);
                setOpen(false);
              }}
            >
              {copying ? 'копирую…' : `копировать «${m.name || `#${m.id}`}»`}
              {m.isNorm ? ' — норма' : ''}
            </Button>
          ))
        )}

        {/* Третий путь появления раскройного маркера — «снять новую» в модалке раскладки. Она
            живёт в тех-карте и получает проп production_run_id отдельной задачей; до тех пор
            путь описан словами, а не кнопкой, которая никуда не ведёт. */}
        <Text size='micro' variant='label'>
          Новую раскладку снимают в разделе «раскладки» тех-карты — снятая для этого прогона, она
          появится здесь.
        </Text>
      </div>
    </GenericPopover>
  );
}
