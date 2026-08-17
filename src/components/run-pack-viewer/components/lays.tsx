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
          'this run never has lays — the card is auxiliary, it has no cut pieces and no markers.'}
      </Text>
    );
  }
  if (lays.length === 0) {
    return (
      <Text component='p'>
        {filtered
          ? 'not a single lay fell into the selected subset — clear the filter to see the rest.'
          : 'no lays yet — cutting is not driven by them.'}
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
            <GroupLabel flush={i === 0}>{(l.name ?? '').trim() || `lay ${i + 1}`}</GroupLabel>
            <Row
              label='colourway'
              value={(l.colorway_name ?? '').trim() || `#${l.colorway_id ?? 0}`}
            />
            {/* Слот, удалённый из BOM, приезжает пустым именем при живом line_key. Настил, потерявший
                слот, обязан уметь НАЗВАТЬ потерянное, а не замолчать. */}
            <Row
              label='slot'
              value={slot || (lineKey ? `slot deleted (${lineKey})` : 'slot not named')}
            />
            <Row label='spreading mode' value={layModeWord(l.mode)} />
            <Row label='plies in total' value={l.total_plies ?? 0} />
            {(l.sections ?? []).map((sec, j) => (
              <Row
                key={`${sec.marker_name || j}`}
                label={
                  <span>
                    {(sec.marker_name ?? '').trim() || `marker ${j + 1}`}
                    <Text size='nano' variant='label' component='span' className='ml-1.5 uppercase'>
                      {(sec.sizes ?? []).length === 0
                        ? 'composition not named'
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
                value={`${sec.plies ?? 0} ${(sec.plies ?? 0) === 1 ? 'ply' : 'plies'}`}
              />
            ))}
          </div>
        );
      })}
      <Text size='micro' variant='label' component='p'>
        the marker composition is how many garments of each size lie in ONE ply; it is not
        multiplied by the number of plies. the size filter does not cut lays down: the stack on the
        table is physical, a size can't be subtracted from it.
      </Text>
    </div>
  );
}

export function MaterialBlockers({ blockers }: { blockers: RpMaterialBlocker[] }) {
  if (blockers.length === 0) {
    return (
      <Text size='micro' variant='label' component='p'>
        the material plan was computed in full — there are no slots without an article or a norm.
      </Text>
    );
  }
  return (
    <CalloutBox tone='error' className='space-y-1'>
      <Text component='p' className='uppercase'>
        <b>not computed — {blockers.length} slot × colourway</b>
      </Text>
      {blockers.map((b, i) => (
        <Text key={`${b.slot_name || i}-${b.colorway_id ?? 0}-${i}`} component='p'>
          {(b.slot_name ?? '').trim() || 'slot'} ·{' '}
          {(b.colorway_name ?? '').trim() || `colourway #${b.colorway_id}`} — {b.planned_qty ?? 0}{' '}
          garments: {(b.reason ?? '').trim() || 'reason not named'}
        </Text>
      ))}
      <Text size='micro' variant='label' component='p'>
        this is “nothing to cut from”, not “too expensive”: the run pack does not deal with
        purchasing or money. blockers are shown across the WHOLE run — no filter hides them.
      </Text>
    </CalloutBox>
  );
}
