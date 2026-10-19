// Step 7 · FABRICS — one DXF per fabric PURPOSE of the card (owner decision 13, Codex C5): the
// sheet's own words ("ПОДКЛАДКА", a cut layout) propose which pieces are cut from what; the
// operator answers what the proposal cannot settle. A piece in two fabrics goes into both files.
// Interlining that is not in the BOM is not a file at all — its pieces get `fused` (decision 14).
// Owner 16.10: the sheet (left) zooms to the piece asked about, the one question and its 2–3
// answers sit on the right; the full piece × fabric matrix is a fold below the question. Order of
// the questions = the footer's: AI-only cloth first, then what the planner refuses, then the
// offer (pieces main only because nothing names a fabric). The sheet's evidence is diagnostics.
import { useMemo, useState } from 'react';
import type { FabricAssignment, FabricEvidence, SeedId } from 'lib/pattern-import/types';
import { PURPOSE, isLiningScope, planScopes } from 'lib/pattern-import/fabrics/scope';
import { cn } from 'lib/utility';
import {
  Button,
  CheckboxCommon,
  Chip,
  ChipRow,
  DataTable,
  HeaderWarnings,
  type HeaderWarning,
  Pill,
  Text,
} from 'ui';
import type { CardContext } from '../client';
import { SHEET_INK, SheetViewport, ptsAttr } from '../sheet-viewport';
import type { ImportSessionApi } from '../use-import-session';
import { defaultedFabrics } from '../auto-advance';
import { plural } from '../stages';
import {
  DebugFold,
  Fold,
  Panel,
  SplitStage,
  ask,
  fmtPct,
  SkipQuiz,
  useAnsweredAndGo,
  useAutoAnswer,
  useLikelySlot,
  useQuizSlot,
} from '../ui-bits';

const INTERLINING = PURPOSE.interfacing;

const purposeName = (p: string) =>
  p.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase().replace('interfacing', 'interlining');

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

/** One question of the step: the pieces it is about, its words, why it is asked (the hover). */
type FabricQuestion = {
  key: string;
  kind: 'ai' | 'no-fabric' | 'duplicate' | 'refused' | 'defaulted';
  seeds: SeedId[];
  label: string;
  why: string;
  /** duplicate: the file both pieces would land in. */
  scopeKey?: string;
};

type Answer = {
  label: string;
  title?: string;
  /** The one safe one-click fix of this question (ui-bits ONE-CLICK FIX). */
  fix?: boolean;
  run: () => Promise<unknown>;
  /** The answer resolves exactly what the step's offer is about. */
  pastOffer?: boolean;
};

export function FabricsStep({ api, card }: { api: ImportSessionApi; card: CardContext }) {
  const { session } = api;
  const a = session.fabrics;
  const sem = session.semantics;
  const [focusScope, setFocusScope] = useState<string | null>(card.scopes[0]?.scopeKey ?? null);
  const families = useMemo(() => session.pieces?.families ?? [], [session.pieces]);
  const go = useAnsweredAndGo();
  // every question seen on this run (the wizard owns it): "question k of n" only grows
  const seen = useQuizSlot('fabrics', () => new Set<string>());
  const [other, setOther] = useState<string | null>(null);
  // LIKELY ANSWERS (ui-bits): skip keeps the defaulted pieces on the main fabric
  const autoAnswer = useAutoAnswer(api);
  const likelyMain = useLikelySlot('fabrics-defaulted');
  if (!a || !sem || !session.sheet) return null;

  const seeds = [...new Set(sem.pieces.map((p) => p.seed))];
  const idsOf = (seed: SeedId) => sem.pieces.filter((p) => p.seed === seed).map((p) => p.identity);
  const nameOf = (seed: SeedId) =>
    session.names.find((n) => n.seed === seed)?.displayName ||
    sem.pieces.find((p) => p.seed === seed)?.displayName ||
    idsOf(seed)[0] ||
    `piece ${seed}`;
  const namesOf = (sds: readonly SeedId[]) =>
    sds.length === 1 ? nameOf(sds[0]) : `${sds.length} pieces`;
  const interliningProposal = a.proposals.find((p) => p.purpose === INTERLINING);
  const fusedSet = new Set(a.interliningInBom ? [] : interliningProposal?.seeds ?? []);
  // the planner the write stage cuts the files with: what it refuses is asked here, per problem
  const problems = planScopes(sem.pieces, a, card.scopes).problems;
  const refusedOf = (seed: SeedId) => (a.refused ?? []).filter((r) => r.seeds.includes(seed));
  const scopeLabel = (key: string | null | undefined) =>
    card.scopes.find((s) => s.scopeKey === key)?.label ?? null;
  const short = (label: string) => label.split(' · ')[0];

  const set = (next: FabricAssignment) => api.dispatch({ type: 'fabrics', assignment: next });
  // C7: a cloth other than main on the AI's word alone waits for the operator; confirming it, or
  // changing that piece's ticks, is their answer
  const aiPending = new Map(
    (a.aiOnly ?? []).filter((x) => x.needsConfirm).map((x) => [x.seed, x.purposes]),
  );
  const answered = (sds: readonly SeedId[], from: FabricAssignment = a): FabricAssignment =>
    sds.some((sd) => aiPending.has(sd))
      ? {
          ...from,
          aiOnly: (from.aiOnly ?? []).map((x) =>
            sds.includes(x.seed) ? { ...x, needsConfirm: false } : x,
          ),
        }
      : from;
  const toggle = (scopeKey: string, seed: SeedId, on: boolean) => {
    const cur = new Set(a.byPurpose[scopeKey] ?? []);
    if (on) cur.add(seed);
    else cur.delete(seed);
    void set(answered([seed], { ...a, byPurpose: { ...a.byPurpose, [scopeKey]: [...cur] } }));
  };
  /** These pieces are (also) cut from this fabric. */
  const tickAll = (scopeKey: string, sds: readonly SeedId[]) =>
    set(
      answered(sds, {
        ...a,
        byPurpose: {
          ...a.byPurpose,
          [scopeKey]: [...new Set([...(a.byPurpose[scopeKey] ?? []), ...sds])],
        },
      }),
    );
  /** These pieces are cut from this fabric only. */
  const onlyIn = (scopeKey: string, sds: readonly SeedId[]) =>
    set(
      answered(sds, {
        ...a,
        byPurpose: Object.fromEntries(
          [...new Set([...Object.keys(a.byPurpose), scopeKey])].map((k) => [
            k,
            k === scopeKey
              ? [...new Set([...(a.byPurpose[k] ?? []), ...sds])]
              : (a.byPurpose[k] ?? []).filter((s) => !sds.includes(s)),
          ]),
        ),
      }),
    );
  const untick = (scopeKey: string, seed: SeedId) =>
    set(
      answered([seed], {
        ...a,
        byPurpose: {
          ...a.byPurpose,
          [scopeKey]: (a.byPurpose[scopeKey] ?? []).filter((s) => s !== seed),
        },
      }),
    );
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
    void set(answered([seed], { ...a, proposals }));
  };

  // ── the questions, in the footer's order: AI-only, the planner's problems, then the offer ──
  const defaulted = defaultedFabrics(a, card.scopes.length, api.inputs.assignment != null, seeds);
  const questions: FabricQuestion[] = [];
  if (card.scopes.length) {
    for (const [seed, purposes] of aiPending) {
      const words = purposes.map(purposeName).join(' + ');
      questions.push({
        key: `ai:${seed}`,
        kind: 'ai',
        seeds: [seed],
        label: `${nameOf(seed)}: cut from ${words}?`,
        why: `the sheet says nothing about this piece's fabric; the AI says ${words}`,
      });
    }
    for (const p of problems) {
      const sds = p.seeds.filter((sd) => !aiPending.has(sd));
      if (!sds.length) continue;
      const fusedOnly = p.kind === 'no-fabric' && sds.every((sd) => fusedSet.has(sd));
      questions.push({
        key: `${p.kind}:${p.kind === 'duplicate' ? `${p.scopeKey}:` : ''}${sds.join(',')}`,
        kind: p.kind,
        seeds: sds,
        scopeKey: p.kind === 'duplicate' ? p.scopeKey : undefined,
        label:
          p.kind === 'duplicate'
            ? `${p.identity} twice in ${short(scopeLabel(p.scopeKey) ?? 'one file')}?`
            : p.kind === 'refused'
              ? `${namesOf(sds)}: which fabric on the BOM?`
              : fusedOnly
                ? `${namesOf(sds)}: also cut from?`
                : `${namesOf(sds)}: which fabric?`,
        why: p.message,
      });
    }
    if (defaulted.length)
      questions.push({
        key: `defaulted:${defaulted.join(',')}`,
        kind: 'defaulted',
        seeds: defaulted,
        label: `${namesOf(defaulted)}: main fabric?`,
        why: `nothing on the sheet names a fabric for ${defaulted.map(nameOf).join(', ')}: main by default`,
      });
  }
  for (const q of questions) seen.add(q.key);
  const mainScope = card.scopes[0];
  likelyMain.current =
    defaulted.length && mainScope && !session.busy
      ? {
          key: 'fabrics-defaulted',
          what: `fabric of ${defaulted.length === 1 ? nameOf(defaulted[0]) : `${defaulted.length} pieces`}`,
          answer: `${short(mainScope.label)} (main)`,
          sig: defaulted.join(','),
          pastOffer: true,
          likely: () => autoAnswer({ type: 'fabrics', assignment: a }),
        }
      : null;
  const active = questions[0] ?? null;
  const asked = new Set(active?.seeds ?? []);

  const main = card.scopes[0];
  const answers: Answer[] = (() => {
    if (!active) return [];
    const sds = active.seeds;
    switch (active.kind) {
      case 'ai': {
        const purposes = aiPending.get(sds[0]) ?? [];
        return [
          {
            label: `yes, ${purposes.map(purposeName).join(' + ')}`,
            title: 'keep the AI fabric for this piece',
            // an AI guess: confirmed by a direct click on this answer only, never from the footer
            run: () => set(answered(sds)),
          },
          ...(main
            ? [
                {
                  label: `${short(main.label)} only`,
                  title: `cut from ${main.label} alone`,
                  run: () => onlyIn(main.scopeKey, sds),
                },
              ]
            : []),
        ];
      }
      case 'duplicate':
        // which of the two goes: both are the operator's pieces — never a one-click fix
        return sds.slice(0, 3).map((sd) => ({
          label: `untick ${nameOf(sd)}`,
          title: `${nameOf(sd)} is not cut from ${scopeLabel(active.scopeKey) ?? 'this fabric'}`,
          run: () => untick(active.scopeKey!, sd),
        }));
      case 'no-fabric':
      case 'refused':
        return card.scopes.slice(0, 3).map((s) => ({
          label: short(s.label),
          title: `cut from ${s.label}`,
          run: () => tickAll(s.scopeKey, sds),
        }));
      case 'defaulted':
        // the offer: keeping what is ticked is going on as is — safe, every tick stays editable
        return main
          ? [
              {
                label: `yes, ${short(main.label)} for all`,
                title: 'keep every piece on the main fabric',
                fix: true,
                pastOffer: true,
                run: () => set(a),
              },
            ]
          : [];
    }
  })();
  const askKey = active
    ? active.kind === 'ai'
      ? 'fabrics-ai-confirm'
      : active.kind === 'defaulted'
        ? 'fabrics-defaulted'
        : 'fabrics-assign'
    : '';
  const hint =
    active?.kind === 'ai'
      ? 'confirm the AI fabric, or change it'
      : active?.kind === 'defaulted'
        ? 'keep main, or tick another fabric'
        : active?.kind === 'duplicate'
          ? 'untick one of the two, or rename'
          : 'pick the fabric';

  // what is true but not the question: the header list (every stop reason stays readable here)
  const warnings: HeaderWarning[] = [
    ...(a.refused ?? []).map(
      (r) => `${r.label}: not in the BOM — no DXF for ${plural(r.seeds.length, 'piece')}`,
    ),
    ...problems
      .filter((p) => !active || p.message !== active.why)
      .map((p) => `${p.seeds.map(nameOf).join(', ')}: ${p.message}`),
  ];

  const matrix = (rows: SeedId[]) => (
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
                  ? `${s.label} · lining copies are written LIN_<name> and become their own card pieces, never the shell piece`
                  : s.label
              }
            >
              {short(s.label)}
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
        {rows.map((seed) => (
          <tr key={seed} className={cn(asked.has(seed) && 'bg-pageBg')}>
            <td
              title={
                [idsOf(seed).join(' + '), ...refusedOf(seed).map((r) => r.reason)].join('\n') ||
                undefined
              }
            >
              {nameOf(seed)}
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
        ))}
      </tbody>
    </DataTable>
  );

  // the sheet zooms to the asked pieces; with nothing asked it shows the whole sheet
  const rank = Math.min(2, (families[0]?.candidates.length ?? 1) - 1);
  const boxOf = (sd: SeedId) => families.find((f) => f.seed === sd)?.candidates[rank]?.bbox;
  const focusBox = (() => {
    const bs = [...asked].flatMap((sd) => {
      const b = boxOf(sd);
      return b ? [b] : [];
    });
    if (!bs.length) return null;
    return {
      minX: Math.min(...bs.map((b) => b.minX)),
      minY: Math.min(...bs.map((b) => b.minY)),
      maxX: Math.max(...bs.map((b) => b.maxX)),
      maxY: Math.max(...bs.map((b) => b.maxY)),
    };
  })();
  const inScope = new Set(focusScope ? a.byPurpose[focusScope] ?? [] : []);
  const k = seen.size - questions.length + 1;

  return (
    <SplitStage
      sideWidth={380}
      canvas={
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
                  title={`${s.label} · ${plural((a.byPurpose[s.scopeKey] ?? []).length, 'piece')} in this file (a fabric with no ticks writes no DXF)`}
                  onClick={() => setFocusScope(s.scopeKey)}
                >
                  {short(s.label)}
                </Chip>
              ))}
            </ChipRow>
          }
        >
          <div className='min-h-0 flex-1'>
            <SheetViewport bbox={session.sheet.sheet.bbox} focus={focusBox}>
              {({ unit }) => (
                <g pointerEvents='none'>
                  {families.map((f) => {
                    const c = f.candidates[rank];
                    if (!c) return null;
                    const hot = asked.has(f.seed);
                    const on = inScope.has(f.seed);
                    return (
                      <polygon
                        key={f.seed}
                        points={ptsAttr(c.outer)}
                        fill={hot ? SHEET_INK.blue : on ? SHEET_INK.ink : '#ffffff'}
                        fillOpacity={hot ? 0.12 : on ? 0.18 : 1}
                        stroke={hot ? SHEET_INK.blue : on ? SHEET_INK.ink : '#d5d5d5'}
                        strokeWidth={unit * (hot ? 2.4 : on ? 1.6 : 1)}
                        strokeDasharray={hot || on ? undefined : `${unit * 6} ${unit * 4}`}
                      />
                    );
                  })}
                </g>
              )}
            </SheetViewport>
          </div>
        </Panel>
      }
      side={
        <Panel
          title='fabrics'
          aside={<HeaderWarnings items={warnings} />}
          bodyClassName='flex flex-col gap-2'
        >
          {!card.scopes.length ? (
            <Text size='micro' variant='label' component='p'>
              the BOM has no fabric line
            </Text>
          ) : active ? (
            <>
              <Text size='micro' variant='label' component='p'>
                question {k} of {seen.size}
              </Text>
              <div
                data-ask-zone=''
                data-ask-label={active.label}
                data-testid='fabrics-question'
                className='flex min-w-0 flex-col gap-2'
              >
                <Text size='micro' component='p' title={active.why}>
                  {active.label}
                </Text>
                <span className='flex flex-col items-stretch gap-1.5'>
                  {answers.map((x, i) => (
                    <Button
                      key={x.label}
                      {...ask(askKey, i === 0, hint)}
                      {...(x.fix ? { 'data-ask-fix': askKey } : {})}
                      variant='secondary'
                      size='xs'
                      disabled={!!session.busy}
                      title={x.title}
                      onClick={() => {
                        setOther(null);
                        go(x.run(), x.pastOffer ? { pastOffer: true } : undefined);
                      }}
                    >
                      {x.label}
                    </Button>
                  ))}
                  {other === active.key ? (
                    matrix(active.seeds)
                  ) : (
                    <Button
                      {...ask(askKey, answers.length === 0, hint)}
                      variant='secondary'
                      size='xs'
                      disabled={!!session.busy}
                      title='tick the fabrics piece by piece'
                      onClick={() => setOther(active.key)}
                    >
                      other…
                    </Button>
                  )}
                </span>
                <SkipQuiz />
              </div>
            </>
          ) : (
            <Text size='micro' variant='label' component='p'>
              {seen.size ? 'all fixed ✓' : 'every piece has its fabric ✓'}
            </Text>
          )}
          {card.scopes.length > 0 && seeds.length > 0 && (
            <Fold
              label={`all pieces · ${seeds.length}`}
              defaultOpen={!active && seeds.length <= 12}
            >
              {matrix(seeds)}
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
    />
  );
}
