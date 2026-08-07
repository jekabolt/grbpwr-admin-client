import { common_TechCardMarkerSummary } from 'api/proto-http/admin';
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
  const mk = (m.bomLineKey ?? '').trim();
  if (!mk) return { eligible: false, reason: 'раскладка потеряла слот BOM — перепривяжите её' };
  if (bomLineKey && mk !== bomLineKey)
    return { eligible: false, reason: 'снята для другой ткани настила' };
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
      open={open}
      onOpenChange={setOpen}
      title='раскладка секции'
      className='w-[320px]'
      triggerProps={{ disabled, 'aria-label': 'выбрать раскладку' }}
      openElement={
        <span
          className={`block max-w-[220px] truncate border px-[7px] py-[3px] text-left text-textBaseSize ${
            selected ? 'border-borderColor' : 'border-error text-error'
          }`}
        >
          {selected ? selected.name || `#${selected.id}` : 'выбрать раскладку…'}
        </span>
      }
    >
      <div className='flex flex-col gap-1'>
        {runMarkers.length === 0 ? (
          <Text size='small' variant='inactive'>
            у этого прогона ещё нет ни одной раскройной раскладки
          </Text>
        ) : (
          runMarkers.map((m) => {
            const fit = markerFitness(m, bomLineKey, colorwayId);
            return (
              <button
                key={m.id}
                type='button'
                disabled={!fit.eligible}
                onClick={() => {
                  onChange(m.id ?? 0);
                  setOpen(false);
                }}
                className={`flex flex-col border px-1.5 py-1 text-left ${
                  (m.id ?? 0) === value
                    ? 'border-textColor bg-textColor text-bgColor'
                    : 'border-borderColor disabled:opacity-60'
                }`}
              >
                <Text size='small' component='span'>
                  {m.name || `#${m.id}`}
                </Text>
                <Text size='micro' variant='label' component='span'>
                  {markerLine(m)}
                </Text>
                {fit.reason ? (
                  <Text
                    size='micro'
                    component='span'
                    className={fit.eligible ? 'text-labelColor' : 'text-error'}
                  >
                    {fit.reason}
                  </Text>
                ) : null}
              </button>
            );
          })
        )}

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
              className='justify-start text-left'
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
