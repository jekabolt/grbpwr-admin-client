// Step 4 · SIZES — the legend (which line style is which size / role) and the map from the
// source's size run onto the CARD's run (owner decision 6). Guesses are marked as guesses: a
// recovered dash motif or an auto-aligned size is blue until the operator looks at it.
import { useState } from 'react';
import type { ChainRole, SizeMapEntry } from 'lib/pattern-import/types';
import { Chip } from 'ui/components/chip';
import { DataTable } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import type { CardContext } from '../client';
import { SHEET_INK, SheetViewport, f32Attr } from '../sheet-viewport';
import type { ImportSessionApi, LegendEdit } from '../use-import-session';
import { DashSample, NativeSelect, Panel, SplitStage, fmtPct } from '../ui-bits';

const ROLES: { value: ChainRole; label: string }[] = [
  { value: 'size', label: 'size line' },
  { value: 'common', label: 'common (all sizes)' },
  { value: 'seam', label: 'seam line' },
  { value: 'grain', label: 'grainline' },
  { value: 'notch', label: 'notch' },
  { value: 'internal', label: 'internal' },
  { value: 'ignore', label: 'ignore' },
];

export function SizesStep({ api, card }: { api: ImportSessionApi; card: CardContext }) {
  const { session, inputs, patchInputs } = api;
  const chains = session.chains;
  const sizes = session.sizes;
  const [hover, setHover] = useState<number | null>(null);
  if (!chains || !sizes || !session.sheet) return null;

  const legendOf = (): LegendEdit[] =>
    chains.classes.map((c) => ({ classId: c.id, role: c.role, sizeLabel: c.sizeLabel }));
  const edit = (classId: number, p: Partial<LegendEdit>) =>
    void api.dispatch({
      type: 'legend',
      edits: legendOf().map((e) => (e.classId === classId ? { ...e, ...p } : e)),
    });
  const setMap = (i: number, sizeId: string) => {
    const entries: SizeMapEntry[] = sizes.map.entries.map((e, j) =>
      j === i
        ? {
            ...e,
            card: card.sizes.find((c) => String(c.sizeId) === sizeId) ?? null,
            origin: 'operator',
          }
        : e,
    );
    void api.dispatch({ type: 'size-map', entries });
  };
  const hot =
    hover != null ? new Set(chains.classes.find((c) => c.id === hover)?.chains ?? []) : null;
  const motifOf = (id: number) => {
    const ev = chains.classes.find((c) => c.id === id)?.evidence ?? [];
    for (const e of ev) {
      if (e.kind === 'declared-dash') return e.dash;
      if (e.kind === 'recovered-motif') return e.motif;
    }
    return null;
  };
  const evidenceText = (id: number) =>
    (chains.classes.find((c) => c.id === id)?.evidence ?? [])
      .map((e) => {
        switch (e.kind) {
          case 'ocg':
            return `layer “${e.name}”`;
          case 'declared-dash':
            return `dash ${e.dash.join('/')}`;
          case 'recovered-motif':
            return `motif ${e.motif.join('/')} (recovered)`;
          case 'color':
            return `colour rgb(${e.rgb.join(',')})`;
          case 'file':
            return `file ${e.label}`;
          case 'text-label':
            return `text “${e.text}” ${e.distanceMm} mm away`;
          case 'nesting-order':
            return `nesting rank ${e.rank}`;
        }
      })
      .join(' · ');
  const dupe = (sizeId: number | undefined) =>
    sizeId != null && sizes.map.entries.filter((e) => e.card?.sizeId === sizeId).length > 1;

  return (
    <SplitStage
      sideWidth={580}
      canvas={
        <Panel
          title='lines by class'
          aside={
            <Text size='micro' variant='label' component='span'>
              hover a legend row to see its lines
            </Text>
          }
          bodyClassName='p-0'
        >
          <SheetViewport bbox={session.sheet.sheet.bbox}>
            {({ unit }) => (
              <g fill='none' pointerEvents='none'>
                {chains.chainPreview.map((a, i) => (
                  <polyline
                    key={i}
                    points={f32Attr(a)}
                    stroke={hot ? (hot.has(i) ? SHEET_INK.ink : '#dddddd') : SHEET_INK.mut}
                    strokeWidth={unit * (hot?.has(i) ? 1.6 : 0.8)}
                  />
                ))}
              </g>
            )}
          </SheetViewport>
        </Panel>
      }
      side={
        <Panel title='legend and size map'>
          <GroupLabel flush>legend · line style → meaning</GroupLabel>
          <DataTable>
            <thead>
              <tr>
                <th data-align='left'>line</th>
                <th data-align='left'>meaning</th>
                <th data-align='left'>size</th>
                <th>sure</th>
              </tr>
            </thead>
            <tbody>
              {chains.classes.map((c) => {
                const low = c.confidence < 0.6;
                const confirmed = inputs.legendConfirmed.includes(c.id);
                return (
                  <tr
                    key={c.id}
                    onMouseEnter={() => setHover(c.id)}
                    onMouseLeave={() => setHover(null)}
                    className={hover === c.id ? 'bg-bgZebra' : undefined}
                  >
                    <td data-align='left' title={evidenceText(c.id)}>
                      <DashSample dash={motifOf(c.id)} width={48} />
                      <Text
                        size='nano'
                        variant='label'
                        component='span'
                        className='block max-w-48 truncate'
                      >
                        {evidenceText(c.id)}
                      </Text>
                    </td>
                    <td data-align='left'>
                      <NativeSelect
                        value={c.role}
                        onChange={(v) =>
                          edit(c.id, {
                            role: v as ChainRole,
                            sizeLabel: v === 'size' ? c.sizeLabel ?? '' : null,
                          })
                        }
                        options={ROLES}
                        aria-label={`meaning of line class ${c.id}`}
                        className='w-32'
                      />
                    </td>
                    <td data-align='left'>
                      {c.role === 'size' ? (
                        <Input
                          defaultValue={c.sizeLabel ?? ''}
                          key={c.sizeLabel ?? ''}
                          className='h-[22px] w-16'
                          aria-label={`size label of line class ${c.id}`}
                          onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                            const v = e.currentTarget.value.trim();
                            if (v !== (c.sizeLabel ?? '')) edit(c.id, { sizeLabel: v || null });
                          }}
                        />
                      ) : (
                        <span className='text-labelColor'>—</span>
                      )}
                    </td>
                    <td>
                      {low && !confirmed ? (
                        <Chip
                          tone='attention'
                          onClick={() =>
                            patchInputs((i) => ({ legendConfirmed: [...i.legendConfirmed, c.id] }))
                          }
                          title={`${fmtPct(c.confidence, 0)} sure — recognised from a recovered motif only`}
                        >
                          ! confirm
                        </Chip>
                      ) : (
                        <span className={low ? 'text-labelColor' : undefined}>
                          {fmtPct(c.confidence, 0)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          {chains.warnings.map((w) => (
            <Text key={w} size='micro' component='p' className='mt-1 text-warning'>
              ! {w}
            </Text>
          ))}

          <GroupLabel>sizes · source → card</GroupLabel>
          <Text size='micro' variant='label' component='p' className='mb-1'>
            run read from {sizes.run.encoding.replace('-', ' ')} · {sizes.run.evidence.join(' · ')}
          </Text>
          <DataTable>
            <thead>
              <tr>
                <th>in the file</th>
                <th data-align='left'>card size</th>
                <th data-align='left'>by</th>
              </tr>
            </thead>
            <tbody>
              {sizes.map.entries.map((e, i) => (
                <tr key={e.source.label + i}>
                  <td className='font-bold'>{e.source.label}</td>
                  <td data-align='left'>
                    <NativeSelect
                      value={e.card ? String(e.card.sizeId) : ''}
                      onChange={(v) => setMap(i, v)}
                      invalid={dupe(e.card?.sizeId)}
                      aria-label={`card size for source size ${e.source.label}`}
                      className='w-40'
                      options={[
                        { value: '', label: '— not exported —' },
                        ...card.sizes.map((c) => ({ value: String(c.sizeId), label: c.name })),
                      ]}
                    />
                  </td>
                  <td data-align='left'>
                    {e.origin === 'auto' ? (
                      <Pill
                        tone='attention'
                        title='proposed automatically — change it if it is wrong'
                      >
                        auto
                      </Pill>
                    ) : (
                      <Pill tone='ink'>set</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {sizes.map.unmapped.length > 0 && (
            <Text size='micro' component='p' className='mt-1 text-warning'>
              ! card sizes with no source: {sizes.map.unmapped.map((c) => c.name).join(', ')} — the
              card will show them missing
            </Text>
          )}
          {card.sizes.length === 0 && (
            <Text size='micro' component='p' className='mt-1 text-error'>
              ! the card has no size range — block names need card sizes. set the range on the card
              first.
            </Text>
          )}
        </Panel>
      }
    />
  );
}
