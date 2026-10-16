// Step 7 · FABRICS — one DXF per fabric PURPOSE of the card (owner decision 13, Codex C5): the
// sheet's own words ("ПОДКЛАДКА", a cut layout) propose which pieces are cut from what; the
// operator ticks the matrix. A piece in two fabrics goes into both files. Interlining that is not
// in the BOM is not a file at all — its pieces get `fused` (decision 14).
// import-ux PR5: only the rows that ask (AI-only cloth to confirm, a piece the planner refuses or
// that no file carries, a main-by-default piece on a multi-fabric card) are on screen; every other
// piece folds into one count line; the sheet's evidence is diagnostics (?debug=1).
import { useMemo, useState } from 'react';
import type { FabricAssignment, FabricEvidence, SeedId } from 'lib/pattern-import/types';
import { PURPOSE, isLiningScope, planScopes } from 'lib/pattern-import/fabrics/scope';
import { cn } from 'lib/utility';
import CheckboxCommon from 'ui/components/checkbox';
import { Chip, ChipRow } from 'ui/components/chip';
import { DataTable } from 'ui/components/data-table';
import { HeaderWarnings } from 'ui/components/header-warnings';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import type { CardContext } from '../client';
import { SHEET_INK, SheetViewport, ptsAttr } from '../sheet-viewport';
import type { ImportSessionApi } from '../use-import-session';
import { defaultedFabrics } from '../auto-advance';
import { plural } from '../stages';
import { DebugFold, Fold, Panel, SplitStage, ask, fmtPct } from '../ui-bits';

const INTERLINING = PURPOSE.interfacing;

const purposeName = (p: string) => p.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase();

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
  // C7: a cloth other than main on the AI's word alone waits for the operator; confirming it, or
  // changing that piece's ticks, is their answer
  const aiPending = new Map(
    (a.aiOnly ?? []).filter((x) => x.needsConfirm).map((x) => [x.seed, x.purposes]),
  );
  const answered = (seed: SeedId, from: FabricAssignment = a): FabricAssignment =>
    aiPending.has(seed)
      ? {
          ...from,
          aiOnly: (from.aiOnly ?? []).map((x) =>
            x.seed === seed ? { ...x, needsConfirm: false } : x,
          ),
        }
      : from;
  const toggle = (scopeKey: string, seed: SeedId, on: boolean) => {
    const cur = new Set(a.byPurpose[scopeKey] ?? []);
    if (on) cur.add(seed);
    else cur.delete(seed);
    set(answered(seed, { ...a, byPurpose: { ...a.byPurpose, [scopeKey]: [...cur] } }));
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
    set(answered(seed, { ...a, proposals }));
  };
  const inScope = new Set(focusScope ? a.byPurpose[focusScope] ?? [] : []);
  const rank = Math.min(2, (families[0]?.candidates.length ?? 1) - 1);

  // ── which rows ask: the blocker's order (AI-only first, then the planner), then the offer ──
  const unassigned = (seed: SeedId) =>
    card.scopes.length > 0 &&
    card.scopes.every((s) => !(a.byPurpose[s.scopeKey] ?? []).includes(seed));
  const defaulted = new Set(
    defaultedFabrics(a, card.scopes.length, api.inputs.assignment != null, seeds),
  );
  const why = (seed: SeedId): 'ai' | 'blocked' | 'defaulted' | null =>
    aiPending.has(seed)
      ? 'ai'
      : unassigned(seed) || blockedSeed.has(seed)
        ? 'blocked'
        : defaulted.has(seed)
          ? 'defaulted'
          : null;
  const ORDER = { ai: 0, blocked: 1, defaulted: 2 } as const;
  const asking = seeds.filter((sd) => why(sd)).sort((x, y) => ORDER[why(x)!] - ORDER[why(y)!]);
  const settled = seeds.filter((sd) => !why(sd));
  // the coach's how (THE ASK CONTRACT, ui-bits) for a row that asks, and the box that answers it
  // (a duplicate is answered in its own fabric's column, everything else in the first)
  const problemOf = (seed: SeedId) => problems.find((p) => p.seeds.includes(seed));
  const askScopeOf = (seed: SeedId) => {
    const p = problemOf(seed);
    return p?.kind === 'duplicate' ? p.scopeKey : card.scopes[0]?.scopeKey;
  };
  const hintOf = (seed: SeedId, w: 'ai' | 'blocked' | 'defaulted' | null): string | undefined => {
    if (w === 'ai') return 'confirm the AI fabric, or change ticks';
    if (w === 'defaulted') return 'tick another fabric, or go on';
    if (w !== 'blocked') return undefined;
    const p = problemOf(seed);
    if (p?.kind === 'duplicate') return 'untick one of the two, or rename';
    if (p?.kind === 'refused') return 'tick a fabric that is in the BOM';
    if (p && fusedSet.has(seed)) return 'tick the fabric it is also cut from';
    return 'tick the fabric for each piece';
  };

  // the sheet named a fabric the BOM does not have: true, but not the question — the header list
  const warnings = (a.refused ?? []).map(
    (r) => `${r.label}: not in the BOM — no DXF for ${plural(r.seeds.length, 'piece')}`,
  );

  const matrix = (rows: SeedId[], answering: boolean) => (
    <DataTable>
      <thead>
        <tr>
          <th>piece</th>
          {card.scopes.map((s) => (
            <th
              key={s.scopeKey}
              data-align='left'
              className={cn(focusScope === s.scopeKey && 'text-textColor')}
              title={
                isLiningScope(s)
                  ? 'lining copies are written LIN_<name> and become their own card pieces, never the shell piece'
                  : undefined
              }
            >
              {s.label}
            </th>
          ))}
          {!a.interliningInBom && (
            <th
              data-align='left'
              title='interlining is not in the BOM: no DXF for it; ticked pieces carry the fused flag on the card'
            >
              fused
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((seed) => {
          const w = answering ? why(seed) : null;
          const refused = refusedOf(seed);
          const firstBox = w === 'blocked' || w === 'defaulted';
          return (
            <tr key={seed}>
              <td
                className={w === 'blocked' ? 'text-error' : undefined}
                title={
                  [idsOf(seed).join(' + '), ...refused.map((r) => r.reason)].join('\n') || undefined
                }
              >
                {w === 'blocked' ? '! ' : ''}
                {nameOf(seed)}
                {aiPending.has(seed) && (
                  <Chip
                    {...ask('fabrics-ai-confirm', hintOf(seed, w) ?? true)}
                    tone='attention'
                    className='ml-1'
                    onClick={() => set(answered(seed))}
                    title={`the sheet says nothing about this piece's fabric; the AI says ${aiPending
                      .get(seed)!
                      .map(purposeName)
                      .join(' + ')}. Confirm it, or change the ticks.`}
                  >
                    ! AI only · confirm
                  </Chip>
                )}
              </td>
              {card.scopes.map((s) => (
                <td key={s.scopeKey} data-align='left'>
                  <CheckboxCommon
                    {...ask(
                      w === 'blocked' ? 'fabrics-assign' : 'fabrics-defaulted',
                      firstBox && s.scopeKey === askScopeOf(seed),
                      hintOf(seed, w),
                    )}
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
  );

  return (
    <SplitStage
      sideWidth={360}
      canvas={
        <Panel
          title='fabric → pieces'
          bodyClassName='flex flex-col gap-2'
          aside={<HeaderWarnings items={warnings} />}
        >
          {card.scopes.length > 0 && asking.length > 0 && (
            // the rows that ask and the planner's reasons: the coach's zone
            <div data-ask-zone=''>
              {/* every planner refusal stays readable (the footer says only the first) */}
              {problems.map((p, i) => (
                <Text key={i} size='micro' component='p' className='text-error'>
                  ! {p.seeds.map(nameOf).join(', ')}: {p.message}
                </Text>
              ))}
              {matrix(asking, true)}
            </div>
          )}
          {card.scopes.length > 0 && settled.length > 0 && (
            <Fold
              className={asking.length ? undefined : 'mt-0'}
              label={`${plural(settled.length, 'piece')} assigned`}
              defaultOpen={asking.length === 0 && settled.length <= 12}
            >
              {matrix(settled, false)}
            </Fold>
          )}
          <DebugFold label='what the sheet says'>
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
                {a.proposals.map((p) => (
                  <tr key={(p.scopeKey ?? p.purpose) + p.label}>
                    <td data-align='left'>
                      “{p.label}” <span className='text-labelColor'>{purposeName(p.purpose)}</span>
                    </td>
                    <td data-align='left'>
                      {scopeLabel(p.scopeKey) ??
                        (p.purpose === INTERLINING && !a.interliningInBom ? (
                          <Pill tone='attention'>not in BOM → fused</Pill>
                        ) : (
                          <Pill tone='warn'>not in BOM · no DXF</Pill>
                        ))}
                    </td>
                    <td data-align='left' className='max-w-[360px] text-labelColor'>
                      {evidenceLine(p.evidence)}
                    </td>
                    <td>{p.seeds.length}</td>
                    <td>{fmtPct(p.confidence, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </DebugFold>
        </Panel>
      }
      side={
        <Panel
          title='on the sheet'
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
          {focusScope && (
            <Text
              size='micro'
              variant='label'
              component='p'
              className='shrink-0 border-t border-hairline p-2'
              title='a scope with no ticks writes no DXF'
            >
              {plural(inScope.size, 'piece')} in this file
            </Text>
          )}
        </Panel>
      }
    />
  );
}
