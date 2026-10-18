// Step 8 · CHECK — the gate (08-CONTRACT §5), per DXF: thirteen checks, blocking vs warning, each
// naming the blocks it failed and the step where the answer lives. Beside it, the pieces drawn
// by the card's OWN sheet component (nesting/piece-sheet.tsx) under their block names — what the
// card will see once the files land, not a second opinion about it.
// Owner 16.10: the card's preview on the LEFT, the one question on the RIGHT.
// CHECK-QUIZ (owner OK 18.10, 05-CHECK-QUIZ.md): the side panel is a quiz — one question at a time
// from every held size of a shape check, every other failing check, then every open grade question
// (check-quiz.ts words them: ≤ 6 words, piece names, answers ≤ 3 words, the likely one bordered);
// progress is dots; an answer moves on by itself (an answered question leaves the open list). A
// shape question zooms the sheet onto the place (a red ring); a grade question shows the sizes side
// by side instead of the sheet. No question left: «ready» — the storage choice, the files written,
// the passing checks folded, and «N answers · change» back to the first question. Warnings, what the
// files leave out and every other blocking check are the header's `! N warnings`; values and limits
// are each check's tooltip; the run time and the report are diagnostics.
import { useContext, useEffect, useMemo, useState } from 'react';
import type {
  DraftScope,
  GateCheck,
  GateCheckId,
  GradeAnswer,
  GradeAsk,
  PieceSpec,
  ShapeIssue,
  WizardStep,
} from 'lib/pattern-import/types';
import { PATIMPORT, shapeFixKey } from 'lib/pattern-import/types';
import type { PieceDTO } from 'lib/nesting/types';
import {
  Button,
  Chip,
  ChipRow,
  DataTable,
  HeaderWarnings,
  type HeaderWarning,
  Pill,
  Row,
  Text,
  EmptyCell,
} from 'ui';
import { cn } from 'lib/utility';
import { PieceSheet } from '../../nesting/piece-sheet';
import type { ImportSessionApi } from '../use-import-session';
import { STEPS } from '../use-import-session';
import { plural } from '../stages';
import { DebugFold, Fold, Panel, SplitStage, ask, fmtBytes, useQuizSlot } from '../ui-bits';
import { focusFromGate, type PieceFocus } from '../piece-focus';
import { DroppedLabels, leftOut } from './not-in-file';
import { GradeSizes, gradeRefusal, openGradeAsks } from './details-grade';
import {
  CHECK_ASK,
  checkSubject,
  gradeChoices,
  gradeQuestion,
  openQuestions,
  pieceName,
  shapeFocus,
  type CheckQ,
} from './check-quiz';
import { writtenTokens } from '../write-storage';

const CHECK: Record<GateCheckId, { what: string; fix: WizardStep | null }> = {
  'G1-roundtrip': { what: 'reads back through the card parser', fix: null },
  'G2-square': { what: '100 mm probe square', fix: null },
  'G3-coverage': { what: 'cut line follows the drawn walls', fix: 'pieces' },
  'G4-hausdorff': { what: 'distance to the drawn walls', fix: 'pieces' },
  'G5-features': { what: 'notches, drills, one grainline', fix: 'meaning' },
  'G6-offset': { what: 'allowance offset is clean', fix: 'meaning' },
  'G7-overview': { what: 'matches the overview page', fix: 'scale' },
  'G8-monotone': { what: 'area grows with size', fix: 'pieces' },
  'G9-sizes': { what: 'block sizes = card sizes', fix: 'sizes' },
  'G10-uni': { what: 'no UNI conflicts', fix: 'sizes' },
  'G11-grammar': { what: 'block names pass the grammar', fix: 'meaning' },
  'G12-pair': { what: '_R mirrors _L', fix: 'meaning' },
  'G13-manifest': { what: 'manifest complete', fix: 'fabrics' },
  'G14-prologue': { what: 'manifest fits in front of the drawing', fix: null },
  'G15-derived': { what: 'closed gaps land on drawn lines and stay short', fix: 'pieces' },
  // A8 safety net: nothing in the wizard removes lines inside a piece yet — the note says why
  'G16-glyphs': { what: 'no lettering or watermark inside the pieces', fix: null },
  'G18-grain-source': { what: 'grainline not read from lettering', fix: 'meaning' },
  'G19-chrome': {
    what: 'no cut line traced around a registration mark or tile chrome',
    fix: 'files',
  },
  'G20-nested-piece': { what: 'no piece drawn inside another piece', fix: 'pieces' },
  'G21-continuity': {
    what: 'a size closed through another line keeps its proof (the line, the rule, the check)',
    fix: 'pieces',
  },
  'G22-identity': { what: "each size lies on its own size line (the key's pen)", fix: 'sizes' },
  'G24-one-piece': { what: 'one outline holds one piece', fix: 'pieces' },
  'G23-sheets': {
    what: 'every tile sheet of the file is in the export — no piece left out, twice or in halves',
    fix: 'pieces',
  },
};

/**
 * G9's second report (the card derives no size WITHOUT the manifest — a single-size file, a rare
 * size) is a note about the card's fallback, not about this file. On a run that passes it only
 * read as a problem with a "fix in sizes" link that fixes nothing (FLY-final copy 14).
 */
const isG9Fallback = (c: GateCheck) => c.id === 'G9-sizes' && c.severity === 'warn';

/** One answer: full width, 44 px, the likely one bordered in ink. */
const ANSWER = 'h-11 w-full justify-center';
const SUGGESTED = 'border-2 !border-textColor';

export function CheckStep({
  api,
  onFixInPieces,
}: {
  api: ImportSessionApi;
  /** "fix in pieces": the pieces step with the named blocks selected and the reason (M1). */
  onFixInPieces?: (f: PieceFocus) => void;
}) {
  const { session, inputs } = api;
  const scopes = session.draft?.scopes ?? [];
  const [key, setKey] = useState<string | null>(scopes[0]?.target.scopeKey ?? null);
  const scope = scopes.find((s) => s.target.scopeKey === key) ?? scopes[0];
  const report = scope ? session.gate[scope.target.scopeKey] : undefined;
  const tokens = scope?.manifest.sizes.map((s) => s.token) ?? [];
  // the size and the block the operator picked, kept only for the question they were picked on
  const [tokenPick, setTokenPick] = useState<{ q: string | null; t: string } | null>(null);
  const [pick, setPick] = useState<{ q: string | null; b: string | null } | null>(null);
  // a question opened again from a dot or «change» (else: the first open one)
  const [revisit, setRevisit] = useState<string | null>(null);
  // why the last move on a question was refused (shown under its answers)
  const [moveErr, setMoveErr] = useState<{ q: string; why: string } | null>(null);

  const allPieces = useMemo(() => session.semantics?.pieces ?? [], [session.semantics]);
  const specs = useMemo(
    () => allPieces.filter((p) => scope?.identities.includes(p.identity)),
    [allPieces, scope],
  );

  const { labels } = useContext(DroppedLabels);

  const blocking = (r = report) => r?.checks.filter((c) => !c.ok && c.severity === 'block') ?? [];
  const failing = blocking();
  const gradeOpen = session.semantics ? openGradeAsks(session.semantics) : [];
  const open = openQuestions(scope?.target.scopeKey ?? null, failing, gradeOpen);
  const openKeys = new Set(open.map((q) => q.key));

  // every question asked on this visit, in the order first asked (the dots), with its last shape
  // (the wizard's quiz slot: the step unmounts while the files are written again)
  const seen = useQuizSlot('check-quiz-seen', () => new Map<string, CheckQ>());
  for (const q of open) seen.set(q.key, q);
  const scopeKey = scope?.target.scopeKey ?? '';
  const order = [...seen.values()].filter((q) => q.kind === 'grade' || q.scopeKey === scopeKey);
  const isDone = (q: CheckQ) => !openKeys.has(q.key);
  const answered = order.filter(isDone).length;
  // only a reversible answer (shape move, grade answer) is opened again, and only while nothing
  // blocks: a blocking question stays the coach's and the footer primary's target (open[0])
  const blocked = open.some((q) => q.kind !== 'grade');
  const canRevisit = (q: CheckQ) => q.kind !== 'check' && !blocked;
  const revisited = revisit ? order.find((q) => q.key === revisit && canRevisit(q)) ?? null : null;
  const firstReversible = order.find(canRevisit) ?? null;
  const current = revisited ?? open[0] ?? null;
  const qKey = current?.key ?? null;
  // a revisit whose question vanished from the list falls back to the open ones
  useEffect(() => {
    if (revisit && !revisited) setRevisit(null);
  }, [revisit, revisited]);

  const shape = current?.kind === 'shape' ? current.issue : null;
  const activeCheck = current && current.kind !== 'grade' ? current.check : null;
  const askedBlock = shape ? `${shape.identity}_${shape.size}` : activeCheck?.blocks[0] ?? null;
  const blockSize = (b: string) =>
    tokens.find((t) => b.toLowerCase().endsWith(`_${t.toLowerCase()}`)) ?? null;
  const picked = pick && pick.q === qKey ? pick.b : askedBlock?.toLowerCase() ?? null;
  const token = tokenPick && tokenPick.q === qKey ? tokenPick.t : null;
  const size =
    token && tokens.includes(token)
      ? token
      : (shape && tokens.includes(shape.size) ? shape.size : null) ??
        (askedBlock && blockSize(askedBlock)) ??
        tokens[Math.floor(tokens.length / 2)] ??
        null;
  const dtos = useMemo(() => (size ? piecesForCard(specs, size) : []), [specs, size]);
  const focus = shape && size === shape.size ? shapeFocus(shape, dtos, scope, allPieces) : null;

  if (!scopes.length)
    return (
      <Panel title='check'>
        <Text size='micro' variant='label'>
          nothing was written — no fabric scope has pieces
        </Text>
      </Panel>
    );

  const busy = !!session.busy || api.writeStorage.rewriting;
  const quiet = (c: GateCheck) => !!report?.passed && isG9Fallback(c);
  const warns = report?.checks.filter((c) => !c.ok && c.severity === 'warn' && !quiet(c)) ?? [];
  const fix = (c: GateCheck, to: WizardStep) => {
    const f = to === 'pieces' && onFixInPieces ? focusFromGate(c, CHECK[c.id].what, specs) : null;
    if (f) onFixInPieces!(f);
    else void api.dispatch({ type: 'back', to });
  };
  const stepWord = (to: WizardStep) => STEPS.find((s) => s.id === to)?.label ?? to;
  // a check that passes, or the G9 single-size note on a passing run: one count line
  const passing = report?.checks.filter((c) => c.ok || quiet(c)) ?? [];
  const limitOf = (c: GateCheck) =>
    c.value != null ? `${c.value}${c.threshold != null ? ` · limit ${c.threshold}` : ''}` : '';

  // what is true but blocks nothing: the header's `! N warnings`, each text the door to its fix
  const left = leftOut(api, labels);
  const warnings: HeaderWarning[] = [
    ...warns.map((c): HeaderWarning => {
      const to = CHECK[c.id].fix;
      return {
        text: `${CHECK[c.id].what}${c.note ? ` — ${c.note}` : ''}${c.blocks.length ? ` (${c.blocks.join(', ')})` : ''}`,
        action: to ? { label: `fix in ${stepWord(to)}`, onClick: () => fix(c, to) } : undefined,
      };
    }),
    // FLY-final M2: what the written files leave out must be seen before the download
    ...left.pieces.map(
      (p): HeaderWarning => ({
        text: `not in this file: ${p.what} (${p.why})`,
        action: {
          label: 'back to pieces',
          onClick: () => void api.dispatch({ type: 'back', to: 'pieces' }),
        },
      }),
    ),
    ...(left.sizes.length
      ? [
          {
            text: `not in this file: card ${left.sizes.length === 1 ? 'size' : 'sizes'} ${left.sizes.join(', ')} (no source)`,
            action: {
              label: 'back to sizes',
              onClick: () => void api.dispatch({ type: 'back', to: 'sizes' as WizardStep }),
            },
          },
        ]
      : []),
    // every blocking check stays readable here, its note and its blocks
    ...failing
      .filter((c) => c !== activeCheck)
      .map(
        (c): HeaderWarning => ({
          text: `${c.id.split('-')[0]} ${CHECK[c.id].what} — blocks the export${c.note ? ` · ${c.note}` : ''}`,
          error: true,
        }),
      ),
  ];

  /** One check as a row of the passing fold / the diagnostics table. */
  const checkRow = (c: GateCheck, i: number, full: boolean) => {
    const meta = CHECK[c.id];
    return (
      <tr
        key={`${c.id}-${i}`}
        title={[c.note, limitOf(c)].filter(Boolean).join(' · ') || undefined}
      >
        <td className='whitespace-nowrap'>{c.id.split('-')[0]}</td>
        <td data-align='left'>{meta.what}</td>
        {full && (
          <>
            <td data-align='left'>
              {c.ok ? (
                <Pill tone='ok'>ok</Pill>
              ) : quiet(c) ? (
                <Pill tone='mut' title={c.note}>
                  note
                </Pill>
              ) : c.severity === 'block' ? (
                <Pill tone='warn'>blocks export</Pill>
              ) : (
                <Pill tone='attention'>warning</Pill>
              )}
            </td>
            <td>{c.value ?? <EmptyCell />}</td>
            <td className='text-labelColor'>{c.threshold ?? <EmptyCell />}</td>
          </>
        )}
      </tr>
    );
  };

  /** After an answer: the next open question (a revisit ends). */
  const moved = (q: string, r: { ok: boolean; reason: string | null } | void) => {
    if (r && !r.ok) {
      setMoveErr({ q, why: r.reason ?? 'not possible' });
      return;
    }
    setMoveErr(null);
    setRevisit(null);
  };

  /**
   * GRADE P1: the answer re-runs semantics with `gradeAnswers[key]`, as the details step does
   * (details.tsx `answerGrade` / `rerun`), then writes the draft again so the files, the gate and the
   * .rul package carry it. A refused answer keeps the question open, its reason under the answer.
   */
  const answerGrade = async (g: GradeAsk, a: GradeAnswer) => {
    const i = { ...inputs, gradeAnswers: { ...(inputs.gradeAnswers ?? {}), [g.key]: a } };
    await api.dispatch({
      type: 'semantics',
      input: {
        ...api.semanticsInput(i),
        fileAllowance:
          i.fileAllowance?.origin === 'operator'
            ? i.fileAllowance
            : {
                meaning: 'seam',
                allowanceMm: PATIMPORT.defaultAllowanceMm,
                origin: 'default',
                evidence: [],
              },
      },
    });
    await api.retryWrite();
    moved(`g:${g.key}`);
  };

  const sem = session.semantics;
  const rulOn = api.writeStorage.storage === 'rul';
  const rulWants = (askKey: string) =>
    rulOn &&
    scopes.some((s) => s.rul && !s.rul.ok && s.rul.refusals?.some((x) => x.gradeAskKey === askKey));

  /** An operator shape move recorded for this size (seed unknown: let clearShapeFix decide). */
  const applied = (i: ShapeIssue) =>
    i.seed == null
      ? Object.keys(api.shapeFixes).length > 0
      : !!api.shapeFixes[shapeFixKey(i.seed, i.size)];
  const undos = order.flatMap((q) =>
    q.kind === 'shape' && isDone(q) && applied(q.issue) ? [q] : [],
  );

  /** The question asked now, worded and with its answers. */
  const quiz = (q: CheckQ) => {
    const done = isDone(q);
    const err = moveErr && moveErr.q === q.key ? moveErr.why : null;
    let text: string;
    let tip: string | undefined;
    let answers: React.ReactNode = null;
    if (q.kind === 'shape') {
      const s = q.issue;
      const who = pieceName(s.identity, allPieces);
      text = `${who}: ${s.size} bends off`;
      tip = [s.why, q.check.note].filter(Boolean).join(' · ') || undefined;
      const asked = applied(s);
      answers = done ? (
        asked && (
          <Button
            variant='secondary'
            size='sm'
            className={ANSWER}
            disabled={busy}
            onClick={async () => moved(q.key, await api.clearShapeFix(s.identity, s.size))}
          >
            as drawn
          </Button>
        )
      ) : (
        <>
          {s.fixable && (
            <Button
              {...ask('check-shape-fix', true, 'straighten it')}
              variant='secondary'
              size='sm'
              data-suggested
              className={cn(ANSWER, SUGGESTED)}
              disabled={busy}
              onClick={async () => moved(q.key, await api.fixShape(s.identity, s.size))}
            >
              straighten {s.size}
            </Button>
          )}
          <Button
            {...ask('check-shape-drop', !s.fixable, 'export without this size')}
            variant='secondary'
            size='sm'
            {...(!s.fixable ? { 'data-suggested': true } : {})}
            className={cn(ANSWER, !s.fixable && SUGGESTED)}
            disabled={busy}
            onClick={async () => moved(q.key, await api.dropSize(s.identity, s.size))}
          >
            leave {s.size} out
          </Button>
        </>
      );
    } else if (q.kind === 'check') {
      const c = q.check;
      const who = checkSubject(c, allPieces);
      text = `${who ? `${who}: ` : ''}${CHECK_ASK[c.id]}`;
      tip = [CHECK[c.id].what, c.note, limitOf(c)].filter(Boolean).join(' · ') || undefined;
      const to = CHECK[c.id].fix;
      answers = done ? null : to && c.door !== 'check' ? (
        // a door back, not a fix: the answer is given on that step (coached)
        <Button
          {...ask('check-fix', 'open that step')}
          variant='secondary'
          size='sm'
          data-suggested
          className={cn(ANSWER, SUGGESTED)}
          title={
            to === 'pieces' && c.blocks.length
              ? `opens pieces with ${c.blocks.length === 1 ? c.blocks[0] : `${c.blocks.length} blocks`} selected`
              : undefined
          }
          onClick={() => fix(c, to)}
        >
          fix in {stepWord(to)}
        </Button>
      ) : (
        // no step fixes it (round trip, probe square, …): the report is the door
        <Button
          {...ask('check-report', 'download the report')}
          variant='secondary'
          size='sm'
          data-suggested
          className={cn(ANSWER, SUGGESTED)}
          title='JSON report'
          onClick={api.downloadReport}
        >
          download report
        </Button>
      );
    } else {
      const fresh = sem?.gradeAsks?.find((a) => a.key === q.ask.key) ?? q.ask;
      text = gradeQuestion(fresh, allPieces);
      tip = fresh.question;
      const refusal = sem ? gradeRefusal(sem, fresh) : null;
      const sent = inputs.gradeAnswers?.[fresh.key] ?? null;
      answers = gradeChoices(fresh, refusal ? sent : null).map((c) => (
        <span key={c.answer} className='flex flex-col items-stretch gap-0.5'>
          <Button
            {...ask('check-grade', c.suggested && !done)}
            variant='secondary'
            size='sm'
            {...(c.suggested ? { 'data-suggested': true } : {})}
            className={cn(ANSWER, c.suggested && SUGGESTED)}
            disabled={busy}
            data-testid={`grade-answer-${c.answer}`}
            onClick={() => void answerGrade(fresh, c.answer)}
          >
            {c.label}
          </Button>
          {refusal && sent === c.answer && (
            <Text size='micro' variant='label' component='p' data-testid='grade-refused'>
              {refusal}
            </Text>
          )}
        </span>
      ));
      if (rulWants(fresh.key))
        answers = (
          <>
            {answers}
            <Text size='micro' variant='label' component='p' data-testid='check-grade-rul'>
              .rul needs an answer
            </Text>
          </>
        );
    }
    return (
      // the question and its answers: the coach's zone
      <div
        data-ask-zone=''
        data-ask-label={text}
        data-testid='check-question'
        className='flex min-w-0 flex-col gap-3'
      >
        <Text size='micro' component='p' title={tip}>
          {text}
          {done && (
            <Text size='micro' variant='label' component='span'>
              {' '}
              ✓
            </Text>
          )}
        </Text>
        <span className='flex flex-col items-stretch gap-2'>{answers}</span>
        {/* the operator's own shape moves stay undoable while another check blocks (a
            straightened size may surface a new blocker); the coach keeps this card's answer */}
        {blocked && q.key === open[0]?.key && undos.length > 0 && (
          <span className='flex flex-col items-stretch gap-2'>
            {undos.map((u) => (
              <Button
                key={u.key}
                variant='secondary'
                size='sm'
                className={ANSWER}
                disabled={busy}
                data-testid='check-shape-undo'
                onClick={async () =>
                  moved(q.key, await api.clearShapeFix(u.issue.identity, u.issue.size))
                }
              >
                undo {pieceName(u.issue.identity, allPieces)} {u.issue.size}
              </Button>
            ))}
          </span>
        )}
        {err && (
          <Text size='micro' variant='label' component='p'>
            {err}
          </Text>
        )}
      </div>
    );
  };

  const dots = order.length > 0 && (
    <span className='flex items-center gap-1.5' data-testid='check-dots'>
      {order.map((q) => (
        <Button
          key={q.key}
          aria-label={isDone(q) ? 'answered' : 'open'}
          aria-current={q.key === qKey ? 'step' : undefined}
          disabled={!canRevisit(q) && q.key !== open[0]?.key}
          className={cn(
            'size-2 border border-textColor',
            isDone(q) && 'bg-textColor',
            q.key === qKey && 'outline outline-1 outline-offset-2 outline-textColor',
          )}
          onClick={() => {
            setMoveErr(null);
            setRevisit(q.key === open[0]?.key ? null : q.key);
          }}
        >
          {null}
        </Button>
      ))}
    </span>
  );

  const gradeSpec = (g: GradeAsk): PieceSpec | undefined =>
    allPieces.find((p) => p.identity === g.identity) ?? allPieces.find((p) => p.seed === g.seed);
  const gradeAsk = current?.kind === 'grade' ? current.ask : null;

  return (
    <SplitStage
      sideWidth={380}
      canvas={
        gradeAsk ? (
          <Panel
            title={pieceName(gradeAsk.identity, allPieces)}
            bodyClassName='flex flex-col gap-2'
          >
            <span className='[&_svg]:size-40'>
              <GradeSizes ask={gradeAsk} spec={gradeSpec(gradeAsk)} />
            </span>
          </Panel>
        ) : (
          <Panel
            title='what the card will see'
            bodyClassName='flex flex-col gap-2'
            aside={
              <ChipRow>
                {tokens.map((t) => (
                  <Chip
                    key={t}
                    quiet
                    selected={t === size}
                    onClick={() => setTokenPick({ q: qKey, t })}
                  >
                    {t}
                  </Chip>
                ))}
              </ChipRow>
            }
          >
            {scope && <ScopeSummary scope={scope} />}
            {dtos.length > 0 && (
              <PieceSheet
                pieces={dtos}
                keyOf={(p) => (p.blockName ?? '').toLowerCase()}
                markOf={() => 'mapped'}
                labelOf={(p) => p.blockName ?? p.name}
                selectedKey={picked}
                onPick={(k) => setPick({ q: qKey, b: k === picked ? null : k })}
                grainLayer='7'
                innerLayers={new Set(['14'])}
                focus={focus?.box ?? null}
                focusMark={focus?.mark ?? null}
              />
            )}
          </Panel>
        )
      }
      side={
        <Panel
          title='check'
          bodyClassName='flex flex-col gap-4'
          aside={<HeaderWarnings items={warnings} />}
        >
          {scopes.length > 1 && (
            <span data-ask-zone=''>
              <ChipRow>
                {scopes.map((s) => {
                  const bad = blocking(session.gate[s.target.scopeKey]).length;
                  const here = s.target.scopeKey === scope?.target.scopeKey;
                  return (
                    <Chip
                      // this file's own failing checks answer first; another file's chip only
                      // when this one is clean
                      {...ask(
                        'check-scope',
                        !!bad && !here && !failing.length,
                        'open the file whose checks block',
                      )}
                      key={s.target.scopeKey}
                      quiet
                      selected={here}
                      tone={bad ? 'error' : 'default'}
                      title={s.target.label}
                      onClick={() => {
                        setKey(s.target.scopeKey);
                        setRevisit(null);
                      }}
                    >
                      {bad ? '! ' : ''}
                      {s.filename}
                    </Chip>
                  );
                })}
              </ChipRow>
            </span>
          )}
          {scope && report && (
            <>
              {current ? (
                <>
                  {dots}
                  {quiz(current)}
                </>
              ) : (
                <>
                  <Text size='micro' component='p' data-testid='check-ready'>
                    ready
                  </Text>
                  <WriteStorageChoice
                    api={api}
                    scope={scope}
                    onGrade={(k) => setRevisit(`g:${k}`)}
                  />
                  <span className='flex flex-col gap-1'>
                    {scopes
                      .flatMap((s) => [
                        s.filename,
                        ...(rulOn && s.rul?.ok
                          ? [`${s.rul.dxfFilename} + ${s.rul.rulFilename}`]
                          : []),
                      ])
                      .map((f) => (
                        <Text
                          key={f}
                          size='micro'
                          variant='label'
                          component='p'
                          className='break-words'
                        >
                          {f}
                        </Text>
                      ))}
                  </span>
                  {passing.length > 0 && (
                    <Fold label={`${plural(passing.length, 'check')} pass`}>
                      <DataTable>
                        <tbody>{passing.map((c, i) => checkRow(c, i, false))}</tbody>
                      </DataTable>
                    </Fold>
                  )}
                  {answered > 0 && firstReversible && (
                    <button
                      type='button'
                      data-testid='check-change'
                      className='self-start text-left'
                      onClick={() => setRevisit(firstReversible.key)}
                    >
                      <Text size='micro' variant='label' component='span' className='underline'>
                        {plural(answered, 'answer')} · change
                      </Text>
                    </button>
                  )}
                </>
              )}
              <DebugFold>
                <Text size='micro' variant='label' component='p'>
                  {report.durationMs} ms
                </Text>
                <Button variant='underline' size='xs' onClick={api.downloadReport}>
                  download report
                </Button>
                <DataTable>
                  <thead>
                    <tr>
                      <th>check</th>
                      <th data-align='left'>what</th>
                      <th data-align='left'>result</th>
                      <th>value</th>
                      <th>limit</th>
                    </tr>
                  </thead>
                  {/* the gate may report one id twice (G9: the block check + the card-split warning) */}
                  <tbody>{report.checks.map((c, i) => checkRow(c, i, true))}</tbody>
                </DataTable>
              </DebugFold>
            </>
          )}
        </Panel>
      }
    />
  );
}

/**
 * RULHOOK (RUL-SPEC §6): how the DXF is written — per size (the default) or ALSO as a base-size DXF
 * + .rul grade table. The operator's choice only: the autopilot never sets it. Picking it writes
 * the draft again at once (the session's `write-storage` event); the base is one of the written
 * card sizes, the middle one unless picked. An asked base the run does not write → one quiet line
 * (`ignored`); a scope that cannot be graded point for point → its first reason, the per-size DXF
 * stays the file.
 */
function WriteStorageChoice({
  api,
  scope,
  onGrade,
}: {
  api: ImportSessionApi;
  scope: DraftScope;
  /** CHECK-QUIZ: open the grade question a refusal names, here on the check step. */
  onGrade?: (askKey: string) => void;
}) {
  const ws = api.writeStorage;
  const rul = ws.storage === 'rul';
  // STOPFIX: a re-write in flight holds the choice; a failed one says why, once, with a retry
  const busy = !!api.session.busy || ws.rewriting;
  const written = writtenTokens(api.session.sizes);
  const tokens = written.length ? written : scope.manifest.sizes.map((s) => s.token);
  const r = scope.rul;
  // the base in force: the package's own when written, else the asked one, else the writer's middle
  const base =
    (r?.ok ? r.base : null) ?? ws.rulBase ?? tokens[Math.floor((tokens.length - 1) / 2)] ?? null;
  const set = (storage: 'blocks' | 'rul', rulBase?: string) =>
    void api.dispatch({ type: 'write-storage', storage, ...(rulBase ? { rulBase } : {}) });
  return (
    <div data-testid='check-storage' className='flex flex-col gap-1'>
      <ChipRow className='-ml-1.5'>
        <Chip
          quiet
          selected={!rul}
          pressed={!rul}
          disabled={busy}
          title='one DXF, every size drawn as its own blocks'
          onClick={() => rul && set('blocks')}
          data-testid='check-storage-blocks'
        >
          per-size DXF
        </Chip>
        <Chip
          quiet
          selected={rul}
          pressed={rul}
          disabled={busy}
          title='also a DXF of the base size + a .rul grade table (the per-size DXF stays the file)'
          onClick={() => !rul && set('rul')}
          data-testid='check-storage-rul'
        >
          base + .rul
        </Chip>
      </ChipRow>
      {rul && tokens.length > 0 && (
        <ChipRow>
          <Text size='micro' variant='label' component='span'>
            base
          </Text>
          {tokens.map((t) => (
            <Chip
              key={t}
              quiet
              selected={t === base}
              pressed={t === base}
              disabled={busy}
              onClick={() => t !== base && set('rul', t)}
              data-testid='check-storage-base'
            >
              {t}
            </Chip>
          ))}
        </ChipRow>
      )}
      {ws.rewriting && (
        <Text size='micro' variant='label' component='p' data-testid='check-storage-writing'>
          writing…
        </Text>
      )}
      {!ws.rewriting && ws.rewriteError && (
        <Text
          size='micro'
          variant='label'
          component='p'
          className='break-words'
          data-testid='check-storage-rewrite-error'
        >
          files not written for this choice: {ws.rewriteError} ·{' '}
          <button
            type='button'
            className='cursor-pointer underline decoration-current/40 underline-offset-2 hover:text-textColor hover:decoration-current'
            onClick={() => void api.retryWrite()}
          >
            try again
          </button>
        </Text>
      )}
      {rul && ws.ignored && (
        <Text size='micro' variant='label' component='p' data-testid='check-storage-ignored'>
          {ws.ignored}
        </Text>
      )}
      {rul && r && !r.ok && (
        <Text
          size='micro'
          variant='label'
          component='p'
          className='break-words'
          title={r.reasons.slice(0, 3).join('\n')}
          data-testid='check-storage-refused'
        >
          {plainRul(r.reasons[0])}
          {/* SHAPE-KINK: a refusal a GRADE P1 answer lifts is a link to that question */}
          {r.refusals?.some((x) => x.gradeAskKey) && (
            <>
              {' · '}
              <button
                type='button'
                data-ask-fix='check-storage'
                data-testid='check-storage-grade'
                className='cursor-pointer underline decoration-current/40 underline-offset-2 hover:text-textColor hover:decoration-current'
                onClick={() => {
                  const k = r.refusals?.find((x) => x.gradeAskKey)?.gradeAskKey;
                  if (k && onGrade) onGrade(k);
                  else void api.dispatch({ type: 'back', to: 'meaning' });
                }}
              >
                answer{' '}
                {plural(
                  new Set(r.refusals.flatMap((x) => (x.gradeAskKey ? [x.gradeAskKey] : []))).size,
                  'grade question',
                )}{' '}
                (
                {[
                  ...new Set(
                    r.refusals.flatMap((x) =>
                      x.gradeAskKey && x.identity ? [x.identity.replace(/_[LR]$/, '')] : [],
                    ),
                  ),
                ].join(', ')}
                )
              </button>
            </>
          )}
        </Text>
      )}
    </div>
  );
}

/** One line per file; the manifest's make-up is diagnostics. */
function ScopeSummary({ scope }: { scope: DraftScope }) {
  const m = scope.manifest;
  const bytes = new Blob([scope.dxfText]).size;
  const pairs = m.pieces.filter((p) => p.pairHand === 'L').length;
  return (
    <div>
      <Text size='micro' variant='label' component='p' title={scope.target.label}>
        {scope.filename} · {plural(m.blocks.length, 'block')} · {fmtBytes(bytes)}
      </Text>
      <DebugFold className='mt-1'>
        <Row label='fabric scope' value={scope.target.label} />
        <Row label='blocks' value={blockSum(m.blocks)} />
        <Row label='pairs as _L + _R' value={pairs || <EmptyCell />} />
        <Row
          label='layers'
          value='1 cut (final) · 14 seam · 7 grain · 4 notch · 8 internal'
          className='[&>span:first-child]:shrink-0 [&>span:last-child]:shrink [&>span:last-child]:text-right'
        />
      </DebugFold>
    </div>
  );
}

/**
 * "82 blocks · 10 pieces × 8 sizes + 2 one-size": blocks grouped by how many sizes each piece is
 * written in. "12 pieces × 8 sizes" was wrong whenever a piece is one-size (UNI) — copy 8.
 */
function blockSum(blocks: readonly { identity: string }[]): string {
  const per = new Map<string, number>();
  for (const b of blocks) per.set(b.identity, (per.get(b.identity) ?? 0) + 1);
  const bySizes = new Map<number, number>();
  for (const n of per.values()) bySizes.set(n, (bySizes.get(n) ?? 0) + 1);
  const parts = [...bySizes]
    .sort((a, b) => b[0] - a[0])
    .map(([sizes, pieces]) =>
      sizes === 1
        ? `${pieces} one-size`
        : `${pieces} ${pieces === 1 ? 'piece' : 'pieces'} × ${sizes} sizes`,
    );
  return `${blocks.length} = ${parts.join(' + ')}`;
}

/** Specs of one size → PieceDTO (cm, y-up, bbox-normalised) laid out in a row, as the parser would. */
function piecesForCard(specs: PieceSpec[], token: string): PieceDTO[] {
  const out: PieceDTO[] = [];
  // Rows about as wide as the set is tall, so the sheet fills the frame instead of a thin strip.
  const boxes = specs.flatMap((s) =>
    s.sizes.filter((q) => q.sizeToken === token).map((q) => q.bbox),
  );
  const sumArea = boxes.reduce(
    (a, b) => a + ((b.maxX - b.minX) / 10) * ((b.maxY - b.minY) / 10),
    0,
  );
  const rowWidth = Math.max(...boxes.map((b) => (b.maxX - b.minX) / 10), Math.sqrt(sumArea) * 1.8);
  let x = 0;
  let rowTop = 0;
  let rowH = 0;
  specs.forEach((s, i) => {
    const z = s.sizes.find((q) => q.sizeToken === token);
    if (!z) return;
    const b = z.bbox;
    const w = (b.maxX - b.minX) / 10;
    const h = (b.maxY - b.minY) / 10;
    if (x > 0 && x + w > rowWidth) {
      rowTop -= rowH + 4;
      x = 0;
      rowH = 0;
    }
    rowH = Math.max(rowH, h);
    const rel = (p: { x: number; y: number }) => ({
      x: (p.x - b.minX) / 10,
      y: (p.y - b.minY) / 10,
    });
    const origin = { x, y: rowTop - h };
    const abs = (p: { x: number; y: number }) => ({
      x: origin.x + rel(p).x,
      y: origin.y + rel(p).y,
    });
    out.push({
      id: i + 1,
      name: s.displayName,
      blockName: `${s.identity}_${token}`,
      layer: '1',
      source: s.identity,
      poly: z.cut.map(rel),
      bboxW: w,
      bboxH: h,
      areaCm2: z.areaMm2 / 100,
      originX: origin.x,
      originY: origin.y,
      grain: z.grain
        ? [
            {
              layer: '7',
              angleDeg: z.grain.angleDeg,
              lengthCm: Math.hypot(z.grain.b.x - z.grain.a.x, z.grain.b.y - z.grain.a.y) / 10,
              a: abs(z.grain.a),
              b: abs(z.grain.b),
            },
          ]
        : [],
      inner: z.seam ? [{ layer: '14', closed: true, pts: z.seam.map(rel) }] : [],
    });
    x += w + 4;
  });
  return out;
}

/**
 * The SHAPE note of G5 in plain words: «FP_L: one piece, one shape across sizes — XS's cut line
 * turns where S's does not (1.5mm convex …)» → piece FP, size XS, 1.5 mm.
 */
function shapeKink(c: GateCheck): { piece: string; size: string; mm: string } | null {
  if (c.id !== 'G5-features' || !c.note) return null;
  const m =
    /(\w+?)(?:_[LR])?: one piece, one shape across sizes \S+ (\w+)'s cut line turns where \w+'s does not \(([\d.]+) ?mm/.exec(
      c.note,
    );
  return m ? { piece: m[1], size: m[2], mm: m[3] } : null;
}

/** «FP_L: POLYLINE on layer 14 (closed) has 50 points in M but 52 in XS …» in plain words. */
function plainRul(reason: string | undefined) {
  const m =
    reason && /^(\w+?)(?:_[LR])?: .* has (\d+) points in (\w+) but (\d+) in (\w+)/.exec(reason);
  if (m)
    return `no grading table: piece ${m[1]} is drawn differently in size ${m[5]} than in ${m[3]}; the per-size DXF is the file`;
  return `no grading table: ${reason ?? 'the sizes do not match point for point'}; the per-size DXF is the file`;
}
