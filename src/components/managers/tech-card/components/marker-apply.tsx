// «Из раскладки» — the marker → costing bridge (Ф4, design §3).
//
// Two surfaces, one write path:
// - MarkerApplyHint sits under a recipe usage's consumption editor and APPLIES a marker's
//   measured consumption into the draft via the usage's own onChange — i.e. through the
//   already-staged UpdateColorwayRecipe flow. No parallel write path exists.
// - MarkerConsumptionBand on the costing tab is DISPLAY-ONLY: the measured figure beside
//   what the recipes currently say, with a delta. Applying happens in the recipe editor,
//   where consumption is edited — the band says so.
//
// The two traps the design names are both honoured here:
// №1 usagePerGarmentQty ignores the scalar once size_consumptions is non-empty — so the
//    scalar mode explicitly CLEARS size_consumptions, and the per-size mode is enabled
//    only at FULL size coverage (a marker for every size of the card range).
// №2 wastage_percent grosses on top of measured consumption, which already includes
//    inter-piece waste — the dialog warns and names the number, but never rewrites it.
import type { common_TechCard, common_TechCardMarkerSummary } from 'api/proto-http/admin';
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import { parseDecimalNumber } from 'utils/decimal';
import { consumptionCm, latestPerSize, markersForLine, toBomUnit } from './nesting/marker-io';

// ── recipe-side apply ───────────────────────────────────────────────────────────────────

export function MarkerApplyHint({
  markers,
  lineKey,
  unit,
  wastagePercent,
  sizeIds,
  sizeNameById,
  canEdit,
  onApply,
}: {
  markers: common_TechCardMarkerSummary[] | undefined;
  lineKey: string;
  unit: string;
  wastagePercent: string;
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  onApply: (patch: {
    consumption?: string;
    sizeConsumptions?: { sizeId: number; consumption: string }[];
  }) => void;
}) {
  const lineMarkers = markersForLine(markers, lineKey);
  const [open, setOpen] = useState(false);
  const [markerId, setMarkerId] = useState<number>(0);
  const [mode, setMode] = useState<'scalar' | 'perSize'>('scalar');

  const newest = useMemo(
    () =>
      [...lineMarkers].sort((a, b) =>
        String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')),
      )[0],
    [lineMarkers],
  );
  if (lineMarkers.length === 0 || !newest) return null;

  const chosen = lineMarkers.find((m) => m.id === markerId) ?? newest;
  const conv = toBomUnit(consumptionCm(chosen), unit);
  const bySize = latestPerSize(lineMarkers);
  const fullCoverage = sizeIds.length > 0 && sizeIds.every((id) => bySize.has(id));
  const wastage = parseDecimalNumber(wastagePercent);

  const sizeName = (id?: number) => sizeNameById.get(id ?? 0) ?? `#${id}`;
  const preview = conv ? `${conv.value} ${conv.unit}` : `${consumptionCm(newest)} см`;

  const apply = () => {
    if (mode === 'scalar') {
      if (!conv) return;
      // The scalar mode CLEARS per-size grading (trap №1): a lone per-size row would make
      // the server ignore this very scalar.
      onApply({ consumption: String(conv.value), sizeConsumptions: [] });
    } else {
      const rows: { sizeId: number; consumption: string }[] = [];
      for (const id of sizeIds) {
        const m = bySize.get(id);
        const c = m ? toBomUnit(consumptionCm(m), unit) : null;
        if (!c) return;
        rows.push({ sizeId: id, consumption: String(c.value) });
      }
      onApply({ sizeConsumptions: rows });
    }
    setOpen(false);
  };

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Text size='nano' variant='label' component='span'>
        из раскладки: {preview} · «{newest.name}» ({sizeName(newest.sizeId)})
      </Text>
      {canEdit && (
        <Button type='button' variant='secondary' size='xs' onClick={() => setOpen(true)}>
          применить…
        </Button>
      )}

      <ConfirmationModal
        open={open}
        onOpenChange={setOpen}
        onConfirm={apply}
        onCancel={() => setOpen(false)}
        title='применить расход из раскладки'
        confirmLabel='применить'
        confirmDisabled={mode === 'scalar' ? !conv : !fullCoverage}
        closeOnConfirm={false}
      >
        <div className='space-y-2'>
          {lineMarkers.length > 1 && mode === 'scalar' && (
            <Selector
              label='маркер'
              value={chosen.id ?? 0}
              options={lineMarkers.map((m) => ({
                value: m.id ?? 0,
                label: `«${m.name}» · ${sizeName(m.sizeId)} · ${consumptionCm(m)} см/ед`,
              }))}
              onChange={(v: string | number) => setMarkerId(Number(v))}
            />
          )}
          <ChipRow>
            <Chip selected={mode === 'scalar'} pressed={mode === 'scalar'} onClick={() => setMode('scalar')}>
              единой нормой
            </Chip>
            <Chip
              selected={mode === 'perSize'}
              pressed={mode === 'perSize'}
              disabled={!fullCoverage}
              title={
                fullCoverage
                  ? undefined
                  : 'нужен маркер на каждый размер карточки — иначе непокрытые размеры дадут ноль и занизят расход'
              }
              onClick={() => fullCoverage && setMode('perSize')}
            >
              по размерам
            </Chip>
          </ChipRow>

          {mode === 'scalar' && !conv && (
            <CalloutBox tone='error'>
              единица линии BOM ({unit || '—'}) не поддерживает раскладку — расход измерен в
              сантиметрах длины
            </CalloutBox>
          )}
          {mode === 'perSize' && (
            <Text size='nano' variant='label' component='p'>
              {sizeIds
                .map((id) => {
                  const m = bySize.get(id);
                  const c = m ? toBomUnit(consumptionCm(m), unit) : null;
                  return `${sizeName(id)}: ${c ? `${c.value} ${c.unit}` : '—'}`;
                })
                .join(' · ')}
            </Text>
          )}
          {Number.isFinite(wastage) && wastage > 0 && (
            <CalloutBox tone='warning'>
              линия несёт {wastage}% отходов сверху, а длина раскладки уже включает межлекальные
              выпады — проверьте, что процент покрывает только концы рулона и брак полотна, иначе
              отходы посчитаются дважды
            </CalloutBox>
          )}
          <Text size='nano' variant='label' component='p'>
            запись уйдёт при сохранении карточки (рецепт колорвея staged-сейвом)
          </Text>
        </div>
      </ConfirmationModal>
    </div>
  );
}

// ── costing-side display band ───────────────────────────────────────────────────────────

export function MarkerConsumptionBand({ techCard }: { techCard?: common_TechCard }) {
  const markers = techCard?.markers ?? [];
  const bomLines = techCard?.techCard?.bomItems ?? [];
  const colorways = techCard?.colorways ?? [];

  const rows = useMemo(() => {
    return bomLines
      .filter((b) => b.lineKey && markersForLine(markers, b.lineKey).length > 0)
      .map((b) => {
        const lineMarkers = markersForLine(markers, b.lineKey!);
        const newest = [...lineMarkers].sort((x, y) =>
          String(y.updatedAt ?? '').localeCompare(String(x.updatedAt ?? '')),
        )[0];
        const conv = toBomUnit(consumptionCm(newest), b.unit ?? '');
        // What the recipes currently say for this slot: distinct non-empty scalars across
        // colourways (a per-size graded usage shows as «по размерам»).
        const scalars = new Set<string>();
        let perSize = false;
        for (const cw of colorways) {
          for (const u of cw.usages ?? []) {
            if ((u.bomLineKey ?? '') !== b.lineKey) continue;
            if ((u.sizeConsumptions ?? []).length > 0) perSize = true;
            else if (u.consumption?.value) scalars.add(u.consumption.value);
          }
        }
        const current = perSize
          ? 'по размерам'
          : scalars.size === 0
            ? '—'
            : scalars.size === 1
              ? [...scalars][0]
              : `расходятся (${[...scalars].join(' / ')})`;
        const delta =
          conv && !perSize && scalars.size === 1 && Number([...scalars][0]) > 0
            ? ((conv.value - Number([...scalars][0])) / Number([...scalars][0])) * 100
            : null;
        return { line: b, newest, conv, current, delta };
      });
  }, [bomLines, markers, colorways]);

  if (rows.length === 0) return null;

  return (
    <div className='space-y-1'>
      <Text size='nano' variant='label' component='p'>
        расход из раскладок (маркеров) — применяется в рецепте колорвея, вкладка colourways
      </Text>
      {rows.map(({ line, newest, conv, current, delta }) => (
        <div key={line.lineKey} className='flex flex-wrap items-center gap-1.5'>
          <Text size='micro' component='span' className='min-w-0 truncate'>
            {line.name?.trim() || 'ткань'}
          </Text>
          <Pill tone='mut'>
            из раскладки: {conv ? `${conv.value} ${conv.unit}` : `${consumptionCm(newest)} см`}
          </Pill>
          <Text size='nano' variant='label' component='span'>
            в рецептах: {current}
          </Text>
          {delta != null && Math.abs(delta) > 5 && (
            <Pill tone='warn'>{delta > 0 ? `+${delta.toFixed(0)}%` : `${delta.toFixed(0)}%`}</Pill>
          )}
        </div>
      ))}
    </div>
  );
}
