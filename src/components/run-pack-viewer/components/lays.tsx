// НАСТИЛЫ ПАРТИИ и БЛОКЕРЫ МАТЕРИАЛЬНОГО ПЛАНА.
//
// Настил — инструкция настильщику: что настилаем, из какого слота, сколько слоёв и что лежит в
// одном слое. Режим («лицом вверх» / «лицом к лицу») стоит рядом с числом слоёв, потому что это
// указание, а не аналитика.
//
// СОСТАВ РАСКЛАДКИ НЕ УМНОЖЕН НА СЛОИ. Выход настила считает сервер с учётом режима настилания, и
// вторая арифметика того же числа разошлась бы с первой ровно тогда, когда это дороже всего.
import { CalloutBox } from 'ui/components/callout-box';
import { GroupLabel } from 'ui/components/group-label';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { layModeWord } from './labels';
import { RpLay, RpMaterialBlocker } from './manifest';

export function Lays({
  lays,
  applicable,
  notApplicableReason,
  filtered,
}: {
  lays: RpLay[];
  applicable?: boolean;
  notApplicableReason?: string;
  /** Список сужен фильтром — пустота тогда значит «в вашем выборе», а не «в партии». */
  filtered: boolean;
}) {
  // «Настилов тут не бывает» — ЯВНОЕ утверждение сервера (aux-карта), а не пустой список: пустой
  // список читается как приглашение их завести.
  if (applicable === false) {
    return (
      <Text component='p'>
        {(notApplicableReason ?? '').trim() ||
          'настилов у этой партии не бывает — карта вспомогательная, деталей кроя и раскладок в ней нет.'}
      </Text>
    );
  }
  if (lays.length === 0) {
    return (
      <Text component='p'>
        {filtered
          ? 'в выбранное подмножество не попал ни один настил — снимите фильтр, чтобы увидеть остальные.'
          : 'настилов ещё нет — раскроем по ним не управляют.'}
      </Text>
    );
  }

  return (
    <div className='space-y-block'>
      {lays.map((l, i) => {
        const slot = (l.slot_name ?? '').trim();
        const lineKey = (l.slot_line_key ?? '').trim();
        return (
          <div key={`${l.name || i}-${lineKey || i}`}>
            <GroupLabel flush={i === 0}>{(l.name ?? '').trim() || `настил ${i + 1}`}</GroupLabel>
            <Row
              label='колорвей'
              value={(l.colorway_name ?? '').trim() || `#${l.colorway_id ?? 0}`}
            />
            {/* Слот, удалённый из BOM, приезжает пустым именем при живом line_key. Настил, потерявший
                слот, обязан уметь НАЗВАТЬ потерянное, а не замолчать. */}
            <Row
              label='слот'
              value={slot || (lineKey ? `слот удалён (${lineKey})` : 'слот не назван')}
            />
            <Row label='режим настилания' value={layModeWord(l.mode)} />
            <Row label='слоёв всего' value={l.total_plies ?? 0} />
            {(l.sections ?? []).map((sec, j) => (
              <Row
                key={`${sec.marker_name || j}`}
                label={
                  <span>
                    {(sec.marker_name ?? '').trim() || `раскладка ${j + 1}`}
                    <Text size='nano' variant='label' component='span' className='ml-1.5 uppercase'>
                      {(sec.sizes ?? []).length === 0
                        ? 'состав не назван'
                        : (sec.sizes ?? [])
                            .map(
                              (z) =>
                                `${(z.size_name ?? '').trim() || `#${z.size_id}`}×${
                                  z.garments_per_ply ?? 0
                                }`,
                            )
                            .join(' · ')}
                    </Text>
                  </span>
                }
                value={`${sec.plies ?? 0} сл.`}
              />
            ))}
          </div>
        );
      })}
      <Text size='micro' variant='label' component='p'>
        состав раскладки — сколько изделий каждого размера лежит в ОДНОМ слое; на число слоёв он не
        умножен. Фильтр по размерам настилы не режет: стопка на столе физическая, размер из неё не
        вычесть.
      </Text>
    </div>
  );
}

export function MaterialBlockers({ blockers }: { blockers: RpMaterialBlocker[] }) {
  if (blockers.length === 0) {
    return (
      <Text size='micro' variant='label' component='p'>
        материальный план посчитался целиком — слотов без артикула или без нормы нет.
      </Text>
    );
  }
  return (
    <CalloutBox tone='error' className='space-y-1'>
      <Text component='p' className='uppercase'>
        <b>не посчитано — {blockers.length} слот × колорвей</b>
      </Text>
      {blockers.map((b, i) => (
        <Text key={`${b.slot_name || i}-${b.colorway_id ?? 0}-${i}`} component='p'>
          {(b.slot_name ?? '').trim() || 'слот'} ·{' '}
          {(b.colorway_name ?? '').trim() || `колорвей #${b.colorway_id}`} — {b.planned_qty ?? 0}{' '}
          изд.: {(b.reason ?? '').trim() || 'причина не названа'}
        </Text>
      ))}
      <Text size='micro' variant='label' component='p'>
        это «кроить не из чего», а не «дорого»: закупкой и деньгами наряд не занимается. Блокеры
        показаны по ВСЕЙ партии — их не прячет ни один фильтр.
      </Text>
    </CalloutBox>
  );
}
