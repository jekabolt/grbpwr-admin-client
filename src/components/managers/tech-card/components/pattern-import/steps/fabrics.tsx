// Step 7 · FABRICS — one DXF per fabric PURPOSE of the card (owner decision 13, Codex C5): the
// sheet's own words ("ПОДКЛАДКА", a cut layout) propose which pieces are cut from what; the
// operator ticks the matrix. A piece in two fabrics goes into both files. Interlining that is not
// in the BOM is not a file at all — its pieces get `fused` (decision 14).
import { useMemo, useState } from 'react';
import type { FabricAssignment, SeedId } from 'lib/pattern-import/types';
import { cn } from 'lib/utility';
import CheckboxCommon from 'ui/components/checkbox';
import { Chip, ChipRow } from 'ui/components/chip';
import { DataTable } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import type { CardContext } from '../client';
import { SHEET_INK, SheetViewport, ptsAttr } from '../sheet-viewport';
import type { ImportSessionApi } from '../use-import-session';
import { Panel, SplitStage, fmtPct } from '../ui-bits';

const INTERLINING = 'TECH_CARD_BOM_PURPOSE_INTERFACING';

export function FabricsStep({ api, card }: { api: ImportSessionApi; card: CardContext }) {
  const { session } = api;
  const a = session.fabrics;
  const sem = session.semantics;
  const [focusScope, setFocusScope] = useState<string | null>(card.scopes[0]?.scopeKey ?? null);
  const families = useMemo(() => session.pieces?.families ?? [], [session.pieces]);
  if (!a || !sem || !session.sheet) return null;

  const seeds = [...new Set(sem.pieces.map((p) => p.seed))];
  const nameOf = (seed: SeedId) =>
    session.names.find((n) => n.seed === seed)?.displayName || `piece ${seed}`;
  const idsOf = (seed: SeedId) => sem.pieces.filter((p) => p.seed === seed).map((p) => p.identity);
  const interliningProposal = a.proposals.find((p) => p.purpose === INTERLINING);
  const fusedSet = new Set(a.interliningInBom ? [] : interliningProposal?.seeds ?? []);

  const set = (next: FabricAssignment) => void api.dispatch({ type: 'fabrics', assignment: next });
  const toggle = (scopeKey: string, seed: SeedId, on: boolean) => {
    const cur = new Set(a.byPurpose[scopeKey] ?? []);
    if (on) cur.add(seed);
    else cur.delete(seed);
    set({ ...a, byPurpose: { ...a.byPurpose, [scopeKey]: [...cur] } });
  };
  const toggleFused = (seed: SeedId, on: boolean) => {
    const proposals = a.proposals.map((p) =>
      p.purpose === INTERLINING
        ? { ...p, seeds: on ? [...new Set([...p.seeds, seed])] : p.seeds.filter((s) => s !== seed) }
        : p,
    );
    if (!interliningProposal)
      proposals.push({
        label: 'fused',
        purpose: INTERLINING,
        seeds: [seed],
        evidence: [],
        confidence: 1,
      });
    set({ ...a, proposals });
  };
  const inScope = new Set(focusScope ? a.byPurpose[focusScope] ?? [] : []);
  const rank = Math.min(2, (families[0]?.candidates.length ?? 1) - 1);

  return (
    <SplitStage
      sideWidth={420}
      canvas={
        <Panel title='fabric → pieces' bodyClassName='flex flex-col gap-2'>
          <div>
            <GroupLabel flush>what the sheet says</GroupLabel>
            <DataTable>
              <thead>
                <tr>
                  <th data-align='left'>on the sheet</th>
                  <th data-align='left'>purpose</th>
                  <th data-align='left'>card scope</th>
                  <th>pieces</th>
                  <th>sure</th>
                </tr>
              </thead>
              <tbody>
                {a.proposals.map((p) => {
                  const target = card.scopes.find((s) => s.fabricPurpose === p.purpose);
                  const fusedHere = p.purpose === INTERLINING && !a.interliningInBom;
                  return (
                    <tr key={p.purpose + p.label}>
                      <td data-align='left'>“{p.label}”</td>
                      <td data-align='left' className='text-labelColor'>
                        {p.purpose.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase()}
                      </td>
                      <td data-align='left'>
                        {target ? (
                          target.label
                        ) : fusedHere ? (
                          <Pill
                            tone='attention'
                            title='interlining is not in the BOM: these pieces get the fused flag instead of a DXF'
                          >
                            not in BOM → fused
                          </Pill>
                        ) : (
                          <Pill tone='warn' title='add this fabric to the BOM to export its DXF'>
                            not in BOM
                          </Pill>
                        )}
                      </td>
                      <td>{p.seeds.length}</td>
                      <td>{fmtPct(p.confidence, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </div>

          <div>
            <GroupLabel>one DXF per fabric scope · tick what is cut from it</GroupLabel>
            <DataTable>
              <thead>
                <tr>
                  <th>piece</th>
                  <th data-align='left'>blocks</th>
                  {card.scopes.map((s) => (
                    <th
                      key={s.scopeKey}
                      data-align='left'
                      className={cn(focusScope === s.scopeKey && 'text-textColor')}
                    >
                      {s.label}
                    </th>
                  ))}
                  {!a.interliningInBom && <th data-align='left'>fused</th>}
                </tr>
              </thead>
              <tbody>
                {seeds.map((seed) => {
                  const none = card.scopes.every(
                    (s) => !(a.byPurpose[s.scopeKey] ?? []).includes(seed),
                  );
                  return (
                    <tr key={seed}>
                      <td className={none ? 'text-error' : undefined}>
                        {none ? '! ' : ''}
                        {nameOf(seed)}
                      </td>
                      <td data-align='left' className='text-labelColor'>
                        {idsOf(seed).join(' + ')}
                      </td>
                      {card.scopes.map((s) => (
                        <td key={s.scopeKey} data-align='left'>
                          <CheckboxCommon
                            name={`fab-${s.scopeKey}-${seed}`}
                            aria-label={`${nameOf(seed)} cut from ${s.label}`}
                            checked={(a.byPurpose[s.scopeKey] ?? []).includes(seed)}
                            onChange={(v) => toggle(s.scopeKey, seed, v)}
                          />
                        </td>
                      ))}
                      {!a.interliningInBom && (
                        <td data-align='left'>
                          <CheckboxCommon
                            name={`fused-${seed}`}
                            aria-label={`${nameOf(seed)} is fused`}
                            checked={fusedSet.has(seed)}
                            onChange={(v) => toggleFused(seed, v)}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
            <Text size='micro' variant='label' component='p' className='mt-1'>
              {a.interliningInBom
                ? 'interlining is in the BOM — it gets its own DXF like any other fabric.'
                : 'interlining is not in the BOM — no DXF for it; ticked pieces carry the fused flag on the card.'}
            </Text>
          </div>
        </Panel>
      }
      side={
        <Panel
          title='scope on the sheet'
          bodyClassName='p-0 flex flex-col'
          aside={
            <ChipRow>
              {card.scopes.map((s) => (
                <Chip
                  quiet
                  key={s.scopeKey}
                  selected={focusScope === s.scopeKey}
                  pressed={focusScope === s.scopeKey}
                  onClick={() => setFocusScope(s.scopeKey)}
                >
                  {s.label.split(' · ')[0]}
                </Chip>
              ))}
            </ChipRow>
          }
        >
          <div className='min-h-0 flex-1'>
            <SheetViewport bbox={session.sheet.sheet.bbox}>
              {({ unit }) => (
                <g pointerEvents='none'>
                  {families.map((f) => {
                    const c = f.candidates[rank];
                    if (!c) return null;
                    const on = inScope.has(f.seed);
                    return (
                      <polygon
                        key={f.seed}
                        points={ptsAttr(c.outer)}
                        fill={on ? SHEET_INK.ink : '#ffffff'}
                        fillOpacity={on ? 0.18 : 1}
                        stroke={on ? SHEET_INK.ink : '#d5d5d5'}
                        strokeWidth={unit * (on ? 1.6 : 1)}
                        strokeDasharray={on ? undefined : `${unit * 6} ${unit * 4}`}
                      />
                    );
                  })}
                </g>
              )}
            </SheetViewport>
          </div>
          <Text
            size='micro'
            variant='label'
            component='p'
            className='shrink-0 border-t border-hairline p-2'
          >
            {focusScope
              ? `${inScope.size} ${inScope.size === 1 ? 'piece' : 'pieces'} in this file. a scope with no ticks writes no DXF.`
              : 'the BOM has no fabric lines — add them on the BOM tab.'}
          </Text>
        </Panel>
      }
    />
  );
}
