// Step 7 · FABRICS — one DXF per fabric PURPOSE of the card (owner decision 13, Codex C5): the
// sheet's own words ("ПОДКЛАДКА", a cut layout) propose which pieces are cut from what; the
// operator ticks the matrix. A piece in two fabrics goes into both files. Interlining that is not
// in the BOM is not a file at all — its pieces get `fused` (decision 14).
import { useMemo, useState } from 'react';
import type { FabricAssignment, FabricEvidence, SeedId } from 'lib/pattern-import/types';
import { PURPOSE, isLiningScope, planScopes } from 'lib/pattern-import/fabrics/scope';
import { cn } from 'lib/utility';
import { CalloutBox } from 'ui/components/callout-box';
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

const INTERLINING = PURPOSE.interfacing;

/** One short line per kind of evidence: what the sheet (or the AI) said about this fabric. */
function evidenceLine(ev: readonly FabricEvidence[]): string {
  const labels = ev.filter((e) => e.kind === 'label').length;
  const layouts = ev.flatMap((e) => (e.kind === 'cut-layout' ? [e] : []));
  const ai = ev.some((e) => e.kind === 'ai');
  const parts: string[] = [];
  if (labels) parts.push(`${labels} ${labels === 1 ? 'label' : 'labels'} on the pieces`);
  const seen = new Set<string>();
  for (const l of layouts) {
    if (seen.has(l.text)) continue;
    seen.add(l.text);
    parts.push(
      `cut list «${l.text.slice(0, 32)}»${l.widthCm ? ` ${l.widthCm} cm` : ''}: ${l.pieces.join(', ')}`,
    );
  }
  if (ai) parts.push('AI');
  return parts.join(' · ') || 'nothing named: main fabric by default';
}

export function FabricsStep({ api, card }: { api: ImportSessionApi; card: CardContext }) {
  const { session } = api;
  const a = session.fabrics;
  const sem = session.semantics;
  const [focusScope, setFocusScope] = useState<string | null>(card.scopes[0]?.scopeKey ?? null);
  const families = useMemo(() => session.pieces?.families ?? [], [session.pieces]);
  if (!a || !sem || !session.sheet) return null;

  const seeds = [...new Set(sem.pieces.map((p) => p.seed))];
  const idsOf = (seed: SeedId) => sem.pieces.filter((p) => p.seed === seed).map((p) => p.identity);
  const nameOf = (seed: SeedId) =>
    session.names.find((n) => n.seed === seed)?.displayName ||
    sem.pieces.find((p) => p.seed === seed)?.displayName ||
    idsOf(seed)[0] ||
    `piece ${seed}`;
  const interliningProposal = a.proposals.find((p) => p.purpose === INTERLINING);
  const fusedSet = new Set(a.interliningInBom ? [] : interliningProposal?.seeds ?? []);
  // the planner the write stage cuts the files with: what it refuses is said here, per piece
  const problems = planScopes(sem.pieces, a, card.scopes).problems;
  const blockedSeed = new Set(problems.flatMap((p) => p.seeds));
  const refusedOf = (seed: SeedId) => (a.refused ?? []).filter((r) => r.seeds.includes(seed));
  const scopeLabel = (key: string | null | undefined) =>
    card.scopes.find((s) => s.scopeKey === key)?.label ?? null;

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
                  <th data-align='left'>fabric</th>
                  <th data-align='left'>card scope</th>
                  <th data-align='left'>evidence</th>
                  <th>pieces</th>
                  <th>sure</th>
                </tr>
              </thead>
              <tbody>
                {a.proposals.map((p) => {
                  const target = scopeLabel(p.scopeKey);
                  const fusedHere = p.purpose === INTERLINING && !a.interliningInBom;
                  const refused = (a.refused ?? []).find((r) => r.purpose === p.purpose);
                  return (
                    <tr key={(p.scopeKey ?? p.purpose) + p.label}>
                      <td data-align='left'>
                        “{p.label}”
                        <span className='ml-1 text-labelColor'>
                          {p.purpose.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase()}
                        </span>
                      </td>
                      <td data-align='left'>
                        {target ? (
                          target
                        ) : fusedHere ? (
                          <Pill
                            tone='attention'
                            title='interlining is not in the BOM: these pieces get the fused flag instead of a DXF'
                          >
                            not in BOM → fused
                          </Pill>
                        ) : (
                          <Pill tone='warn' title={refused?.reason ?? 'add this fabric to the BOM'}>
                            not in BOM · no DXF
                          </Pill>
                        )}
                      </td>
                      <td data-align='left' className='max-w-[360px] text-labelColor'>
                        {evidenceLine(p.evidence)}
                      </td>
                      <td>{p.seeds.length}</td>
                      <td>{fmtPct(p.confidence, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
            {problems.length > 0 && (
              <CalloutBox tone='error' className='mt-2'>
                {problems.map((p, i) => (
                  <Text key={i} size='micro' component='p'>
                    <b>! {p.seeds.map(nameOf).join(', ')}:</b> {p.message}
                  </Text>
                ))}
              </CalloutBox>
            )}
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
                      {isLiningScope(s) && (
                        <span
                          className='block text-labelColor'
                          title='lining copies are written LIN_<name> and become their own card pieces, never the shell piece'
                        >
                          as LIN_…
                        </span>
                      )}
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
                  const refused = refusedOf(seed);
                  const blocked = none || blockedSeed.has(seed);
                  return (
                    <tr key={seed}>
                      <td
                        className={blocked ? 'text-error' : undefined}
                        title={refused.map((r) => r.reason).join('\n') || undefined}
                      >
                        {blocked ? '! ' : ''}
                        {nameOf(seed)}
                        {refused.length > 0 && (
                          <span className='ml-1 text-labelColor'>
                            (also {refused.map((r) => r.label).join(', ')}: not in BOM)
                          </span>
                        )}
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
                ? 'interlining is in the BOM: its pieces get their own DXF and stay the same card piece as the shell, marked fused.'
                : 'interlining is not in the BOM: no DXF for it; ticked pieces carry the fused flag on the card.'}
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
