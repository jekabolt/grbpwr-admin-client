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
import { useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import { parseDecimalNumber } from 'utils/decimal';
import {
  compositionLabel,
  compositionOf,
  consumptionCm,
  decNum,
  betterMarker,
  latestPerSize,
  markersForLine,
  markerWasteDecomposition,
  scalarNormRefusal,
  toBomUnit,
} from './nesting/marker-io';
import type { TechCardFormData } from './schema';

// ── recipe-side apply ───────────────────────────────────────────────────────────────────

export function MarkerApplyHint({
  markers,
  colorwayId = 0,
  lineKey,
  unit,
  wastagePercent,
  articleWidth,
  sizeIds,
  sizeNameById,
  canEdit,
  onApply,
}: {
  markers: common_TechCardMarkerSummary[] | undefined;
  // Колорвей, чей рецепт редактируется. Список уже отфильтрован (свои + общие), но выбирать
  // ЛУЧШИЙ надо тоже с оглядкой на принадлежность, иначе свежий общий маркер перебьёт
  // собственный — см. betterMarker.
  colorwayId?: number;
  lineKey: string;
  unit: string;
  wastagePercent: string;
  // Effective article's CUTTING width in cm (roll − 2×кромка) — the same quantity a marker
  // records in fabricWidthCm, so the two are comparable. '' = unknown.
  articleWidth: string;
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  onApply: (patch: {
    consumption?: string;
    sizeConsumptions?: { sizeId: number; consumption: string }[];
    // Wastage provenance (0261) — always sent with the number so the two can never drift.
    consumptionSource?: string;
    wasteSelvedgePct?: string;
    wasteCutPct?: string;
  }) => void;
}) {
  const lineMarkers = markersForLine(markers, lineKey);
  const [open, setOpen] = useState(false);
  const [markerId, setMarkerId] = useState<number>(0);
  const [mode, setMode] = useState<'scalar' | 'perSize'>('scalar');

  // Лучший ПРИМЕНИМЫЙ маркер, а если применимых нет — просто лучший.
  //
  // С Ф2 у раскладки может не быть скалярной нормы вовсе (смешанный состав — среднее по составу,
  // в рецепт такое не пишется). Брать сюда просто «самый свежий» значило бы: одна смешанная
  // раскладка, снятая последней, гасит кнопку «применить» на строке, где рядом лежит совершенно
  // годная однородная. Порядок предпочтения (свой колорвей → свежесть) при этом не меняется —
  // применимость проверяется ПЕРВОЙ, потому что неприменимое число не лучше любой давности.
  const newest = useMemo(() => {
    const ranked = [...lineMarkers].sort(betterMarker(colorwayId));
    return ranked.find((m) => !scalarNormRefusal(m)) ?? ranked[0];
  }, [lineMarkers, colorwayId]);
  // The card's fit reference — a scalar norm taken from a non-base size deserves a callout.
  const baseSampleSizeId = (useWatch<TechCardFormData>({ name: 'baseSampleSizeId' }) ??
    0) as number;
  if (lineMarkers.length === 0 || !newest) return null;

  const chosen = lineMarkers.find((m) => m.id === markerId) ?? newest;
  // ОТКАЗ ИДЁТ ПЕРЕД АРИФМЕТИКОЙ. Смешанная раскладка не выдаёт расход на изделие: её длина —
  // средняя по составу, и записанная в рецепт она завышает мелкие размеры и занижает крупные —
  // ровно та ошибка, ради устранения которой Ф2 и заводилась. Дальше по коду `chosenCons === null`
  // означает «числа нет», и каждая ветка обязана это пережить, а не подставить ноль.
  const chosenRefusal = scalarNormRefusal(chosen);
  const chosenCons = consumptionCm(chosen);
  const conv = chosenCons != null ? toBomUnit(chosenCons, unit) : null;
  const bySize = latestPerSize(lineMarkers, colorwayId);
  const fullCoverage = sizeIds.length > 0 && sizeIds.every((id) => bySize.has(id));
  const wastage = parseDecimalNumber(wastagePercent);

  const sizeName = (id?: number) => sizeNameById.get(id ?? 0) ?? `#${id}`;
  const compLabel = (m: common_TechCardMarkerSummary) =>
    compositionLabel(compositionOf(m), (id) => sizeName(id)) || 'состав не читается';
  // Label and number from the same marker — the CHOSEN one (the hint used to number by
  // `chosen` and label by `newest`, which diverged the moment the selector was touched).
  const preview = conv
    ? `${conv.value} ${conv.unit}`
    : chosenCons != null
      ? `${chosenCons} см`
      : '—';

  // Width honesty (design §1): a marker computed for another width is a different norm. Both
  // sides are CUTTING widths — the article's roll minus its кромка, and the width the layout
  // actually ran on. Comparing the roll against the layout would flag every fabric that has a
  // кромка as a mismatch.
  const artW = parseDecimalNumber(articleWidth);
  const chosenW = decNum(chosen.fabricWidthCm);
  const widthMismatch =
    Number.isFinite(artW) && artW > 0 && chosenW > 0 && Math.abs(artW - chosenW) > 0.5;
  // The markers the per-size mode would actually apply — the card's sizes, not every size that
  // happens to carry a marker (a leftover marker for a size since dropped from the card must
  // not colour a warning, or an average, about what will be written).
  const appliedPerSize = sizeIds.map((id) => bySize.get(id)).filter((m) => m != null);
  const perSizeWidths = appliedPerSize.map((m) => decNum(m!.fabricWidthCm)).filter((w) => w > 0);
  const mixedWidths =
    perSizeWidths.length > 1 && Math.max(...perSizeWidths) - Math.min(...perSizeWidths) > 0.5;

  // Scalar-mode spread: a flat norm silently taken from one size understates/overstates the
  // run when sizes diverge — or when the chosen size is not the base sample size.
  const perSizeCons = appliedPerSize
    .map((m) => consumptionCm(m!))
    .filter((c): c is number => c != null && c > 0);
  const spreadPct =
    perSizeCons.length > 1
      ? ((Math.max(...perSizeCons) - Math.min(...perSizeCons)) / Math.min(...perSizeCons)) * 100
      : 0;
  // Размер, С КОТОРОГО снята единая норма, — из состава, а не из легаси-поля size_id (на маркере
  // с составом сервер шлёт там 0). Вопрос имеет смысл только для однородной раскладки: у
  // смешанной нормы нет одного размера, и она сюда не доходит — её гасит отказ.
  const chosenComp = compositionOf(chosen);
  const chosenSizeId = chosenComp.length === 1 ? chosenComp[0].sizeId : 0;
  const offBaseSize =
    baseSampleSizeId > 0 && chosenSizeId > 0 && chosenSizeId !== baseSampleSizeId;

  // Provenance stamped with the number (0261): «marker» tells costing this figure ALREADY
  // contains the cutting waste, so the article's wastage_percent must not gross it up a second
  // time. The decomposition is display only. In per-size mode the applied norms come from
  // several markers, so the split is their plain mean — the components are near-identical
  // across a size run (same geometry, same cloth) and the number is never multiplied by
  // anything; a marker with no recorded efficiency contributes nothing and the split stays
  // blank rather than invented.
  const provenance = (used: common_TechCardMarkerSummary[]) => {
    const parts = used.map(markerWasteDecomposition).filter((d) => d != null);
    if (parts.length === 0) return { consumptionSource: 'marker', wasteSelvedgePct: '', wasteCutPct: '' };
    const mean = (pick: (d: { selvedgePct: number; cutPct: number }) => number) =>
      String(Math.round((parts.reduce((s, d) => s + pick(d!), 0) / parts.length) * 100) / 100);
    return {
      consumptionSource: 'marker',
      wasteSelvedgePct: mean((d) => d.selvedgePct),
      wasteCutPct: mean((d) => d.cutPct),
    };
  };

  const apply = () => {
    if (mode === 'scalar') {
      if (!conv || chosenRefusal) return;
      // The scalar mode CLEARS per-size grading (trap №1): a lone per-size row would make
      // the server ignore this very scalar.
      onApply({ consumption: String(conv.value), sizeConsumptions: [], ...provenance([chosen]) });
    } else {
      const rows: { sizeId: number; consumption: string }[] = [];
      const used: common_TechCardMarkerSummary[] = [];
      for (const id of sizeIds) {
        const m = bySize.get(id);
        // latestPerSize держит только ОДНОРОДНЫЕ раскладки, так что отказа здесь быть не может;
        // null всё равно проверяется — молча записать в рецепт ноль хуже, чем не записать ничего.
        const cons = m ? consumptionCm(m) : null;
        const c = cons != null ? toBomUnit(cons, unit) : null;
        if (!c || !m) return;
        rows.push({ sizeId: id, consumption: String(c.value) });
        used.push(m);
      }
      onApply({ sizeConsumptions: rows, ...provenance(used) });
    }
    setOpen(false);
  };

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Text size='nano' variant='label' component='span'>
        из раскладки: {chosenRefusal ? '—' : preview} · «{chosen.name}» ({compLabel(chosen)})
      </Text>
      {chosenRefusal && (
        <Pill tone='warn' title={chosenRefusal}>
          {compositionOf(chosen).length > 1 ? 'смешанный состав' : 'состав не читается'}
        </Pill>
      )}
      {canEdit && (
        <Button type='button' variant='secondary' size='xs' onClick={() => setOpen(true)}>
          применить…
        </Button>
      )}

      <ConfirmationModal
        open={open}
        onOpenChange={(o: boolean) => {
          setOpen(o);
          if (!o) {
            setMarkerId(0);
            setMode('scalar');
          }
        }}
        onConfirm={apply}
        onCancel={() => {
          setOpen(false);
          setMarkerId(0);
          setMode('scalar');
        }}
        title='применить расход из раскладки'
        confirmLabel='применить'
        confirmDisabled={
          (mode === 'scalar' && (!conv || !!chosenRefusal)) ||
          (mode === 'perSize' && !fullCoverage)
        }
        closeOnConfirm={false}
      >
        <div className='space-y-2'>
          {lineMarkers.length > 1 && mode === 'scalar' && (
            <Selector
              label='маркер'
              value={chosen.id ?? 0}
              options={lineMarkers.map((m) => {
                const c = consumptionCm(m);
                return {
                  value: m.id ?? 0,
                  // Неприменимая раскладка остаётся В СПИСКЕ и подписана словом. Спрятать её
                  // значило бы ответить на «а где раскладка, которую я только что снял»
                  // молчанием; подписать «— смешанный состав» — назвать причину там, где её ищут.
                  label: `«${m.name}» · ${compLabel(m)} · ${
                    c != null ? `${c} см/ед` : 'нормы нет — смешанный состав'
                  }`,
                };
              })}
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
                  : 'нужна ОДНОРОДНАЯ раскладка на каждый размер карточки — иначе непокрытые размеры дадут ноль и занизят расход. Смешанная раскладка сюда не годится: её длина общая на весь настил, и поделить её по размерам нечем до пер-размерного расхода (Ф2.4)'
              }
              onClick={() => fullCoverage && setMode('perSize')}
            >
              по размерам
            </Chip>
          </ChipRow>

          {/* Отказ сервера, слово в слово. Он длинный намеренно: называет и правило, и что
              делать — применить однородную раскладку либо дождаться Ф2.4. Показывается ВМЕСТО
              «единица не поддерживает»: когда числа нет вовсе, единица уже не при чём. */}
          {mode === 'scalar' && chosenRefusal ? (
            <CalloutBox tone='error'>{chosenRefusal}</CalloutBox>
          ) : (
            mode === 'scalar' &&
            !conv && (
              <CalloutBox tone='error'>
                единица линии BOM ({unit || '—'}) не поддерживает раскладку — расход измерен в
                сантиметрах длины
              </CalloutBox>
            )
          )}
          {mode === 'perSize' && (
            <Text size='nano' variant='label' component='p'>
              {sizeIds
                .map((id) => {
                  const m = bySize.get(id);
                  const cons = m ? consumptionCm(m) : null;
                  const c = cons != null ? toBomUnit(cons, unit) : null;
                  return `${sizeName(id)}: ${c ? `${c.value} ${c.unit}` : '—'}`;
                })
                .join(' · ')}
            </Text>
          )}
          {mode === 'scalar' && widthMismatch && (
            <CalloutBox tone='warning'>
              маркер «{chosen.name}» посчитан для полотна {chosenW} см, артикул слота — {artW} см:
              расход не переносится между ширинами без пересчёта
            </CalloutBox>
          )}
          {mode === 'perSize' && mixedWidths && (
            <CalloutBox tone='warning'>
              маркеры разных размеров посчитаны на разной ширине полотна (
              {Math.min(...perSizeWidths)}–{Math.max(...perSizeWidths)} см) — нормы смешивают
              разные ткани
            </CalloutBox>
          )}
          {mode === 'scalar' && (offBaseSize || spreadPct > 5) && (
            <CalloutBox tone='note'>
              {offBaseSize
                ? `единая норма взята с размера ${sizeName(chosenSizeId)}, а базовый размер карточки — ${sizeName(baseSampleSizeId)}`
                : ''}
              {offBaseSize && spreadPct > 5 ? '; ' : ''}
              {spreadPct > 5
                ? `расход по размерам расходится на ${spreadPct.toFixed(0)}% — рассмотрите режим «по размерам»`
                : ''}
            </CalloutBox>
          )}
          {Number.isFinite(wastage) && wastage > 0 && (
            <CalloutBox tone='note'>
              у линии стоит {wastage}% отходов, но на применённой из раскладки норме костинг их
              НЕ начисляет: измеренная длина уже содержит и межлекальные выпады, и кромку. Процент
              снова начнёт работать, если норму перебить вручную
            </CalloutBox>
          )}
          {(() => {
            // Exactly the markers apply() would use — the preview and the value written must be
            // the same number.
            const used = mode === 'scalar' ? [chosen] : appliedPerSize;
            const parts = used.map((m) => markerWasteDecomposition(m!)).filter((d) => d != null);
            if (parts.length === 0) {
              return (
                <Text size='nano' variant='label' component='p'>
                  раскладка без записанной эффективности — отходы не разложить на кромку и выпады
                </Text>
              );
            }
            const avg = (pick: (d: { selvedgePct: number; cutPct: number }) => number) =>
              parts.reduce((s, d) => s + pick(d!), 0) / parts.length;
            const sv = avg((d) => d.selvedgePct);
            const cut = avg((d) => d.cutPct);
            return (
              <Text size='nano' variant='label' component='p'>
                в норме уже сидят отходы: кромка {sv.toFixed(1)}% + межлекальные выпады{' '}
                {cut.toFixed(1)}% (от площади деталей)
                {sv === 0 ? ' — кромка артикула не задана' : ''}
              </Text>
            );
          })()}
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
        // Та же поправка, что в подсказке рецепта: полоса показывает ПРИМЕНИМУЮ раскладку, а
        // смешанная не гасит её собой только потому, что снята последней.
        const ranked = [...lineMarkers].sort((x, y) =>
          String(y.updatedAt ?? '').localeCompare(String(x.updatedAt ?? '')),
        );
        const newest = ranked.find((m) => !scalarNormRefusal(m)) ?? ranked[0];
        const refusal = scalarNormRefusal(newest);
        const cons = consumptionCm(newest);
        const conv = cons != null ? toBomUnit(cons, b.unit ?? '') : null;
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
        return { line: b, newest, conv, cons, refusal, current, delta };
      });
  }, [bomLines, markers, colorways]);

  if (rows.length === 0) return null;

  return (
    <div className='space-y-1'>
      <Text size='nano' variant='label' component='p'>
        расход из раскладок (маркеров) — применяется в рецепте колорвея, вкладка colourways
      </Text>
      {rows.map(({ line, newest, conv, cons, refusal, current, delta }) => (
        <div key={line.lineKey} className='flex flex-wrap items-center gap-1.5'>
          <Text size='micro' component='span' className='min-w-0 truncate'>
            {line.name?.trim() || 'ткань'}
          </Text>
          {refusal ? (
            <Pill tone='warn' title={refusal}>
              из раскладки: нормы нет —{' '}
              {compositionOf(newest).length > 1 ? 'смешанный состав' : 'состав не читается'}
            </Pill>
          ) : (
            <Pill tone='mut'>
              из раскладки: {conv ? `${conv.value} ${conv.unit}` : `${cons} см`}
            </Pill>
          )}
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
