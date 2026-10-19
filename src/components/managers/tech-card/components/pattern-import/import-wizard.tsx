// IMPORT PATTERN — the full-screen wizard (F13 shell, 08-CONTRACT §4.2; import-ux PR1).
//
// Lives only in the card's Patterns tab (owner decision 15). Shape = the assembly fullscreen's:
// a Radix dialog over the whole viewport on the grey ground, a chrome strip on top, the stage in
// the middle, an action strip below. The nine internal steps read as FIVE stages (stages.tsx), one
// glyph each; a stage behind is a door back (contract: `back{to}` keeps that step's inputs, drops
// the outputs after it). The footer is three things only: ← back · the one question (a link to
// the control that answers it, `data-ask` in ui-bits.tsx) · the one primary, named by what it does.
import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ImportSession, SeedId, WizardStep } from 'lib/pattern-import/types';
import { cn } from 'lib/utility';
import {
  BackLink,
  Button,
  CalloutBox,
  Chip,
  ConfirmationModal,
  Progress,
  HeaderWarnings,
  type HeaderWarning,
  HeaderNote,
  Stepper,
  Text,
} from 'ui';
import {
  forRun,
  type ApplyDraftFn,
  type CardContext,
  type DraftBuilder,
  type ImportClient,
  type NameSuggester,
} from './client';
import { apiPageRoleDeps } from './ai-page-roles';
import { createAiNamer } from './ai-namer';
import { cardBuildDraft } from './card-apply';
import { ApplyStep } from './steps/apply';
import type { FollowUpRow, FollowUpStep } from 'lib/pattern-import/fabrics/followup';
import { CheckStep } from './steps/check';
import { DetailsStep, firstBlockedSeed } from './steps/details';
import { FabricsStep } from './steps/fabrics';
import { FilesStep } from './steps/files';
import { PiecesStep } from './steps/pieces';
import { ScaleStep } from './steps/scale';
import { SheetStep } from './steps/sheet';
import { SizesStep } from './steps/sizes';
import { ImportWorkerClient } from 'lib/pattern-import/worker/client';
import { STEPS, stepIndex, useImportSession, type ImportSessionApi } from './use-import-session';
import type { PieceFocus } from './piece-focus';
import { DroppedLabels } from './steps/not-in-file';
import { autopilotApply, resolverFor } from './autopilot/run';
import {
  GuessesPill,
  readAutopilotPref,
  writeAutopilotPref,
  type SkipGuess,
} from './autopilot/view';
import {
  PHASE_OF,
  plural,
  STAGE_GLYPH,
  STAGE_OF_STEP,
  STAGE_WORD,
  STAGES,
  WizardPrimaryContext,
  type PrimaryOverride,
  type StageState,
} from './stages';
import {
  AnsweredAndGoContext,
  AutopilotOnContext,
  AskCoach,
  AutoAnswerContext,
  LikelyContext,
  QuizHistoryContext,
  SkipQuiz,
  SkipQuizContext,
  clickAskFix,
  currentAskKey,
  firstAsk,
  focusAsk,
  useAskLabel,
  type AutoAnswer,
  type CoachTarget,
  type LikelyGuess,
  type LikelyRegistry,
  type QuizHistory,
} from './ui-bits';
import { priorOf, replayDrive, type Prior, type ReplayMiss } from './autopilot/replay';
import { isReplayed } from './autopilot/replay-record';

/** Two frames: React has rendered what the last move changed (the autopilot reads it after). */
const nextFrames = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

type WizardProps = {
  card: CardContext;
  onClose: () => void;
  client?: ImportClient;
  namer?: NameSuggester;
  buildDraft?: DraftBuilder;
  applyDraft?: ApplyDraftFn;
  /** MF-C: piece areas + size index after the apply (run by the card, shown on the apply step). */
  followUp?: FollowUpRow[] | null;
  onRetryFollowUp?: (only?: { scopeKey?: string; step?: FollowUpStep }) => void;
  /** MF-C: close the wizard and open the piece-match modal of this scope (vanished pieces). */
  onReviewPieces?: (scopeKey: string) => void;
  /** Files dropped on a pattern slot: the run starts reading them at once. */
  initialFiles?: File[];
  /** The slot the files were dropped on: every piece defaults to this fabric scope. */
  initialScopeKey?: string;
};

/**
 * Fixture mode (the F13 stub: fixture data, writes nothing) is for building the later steps before
 * their stages land. `VITE_PATTERN_IMPORT_STUB=1` starts in it; dev builds can switch on the files
 * step. Everything else runs the real worker.
 */
const STUB_BY_DEFAULT = import.meta.env.VITE_PATTERN_IMPORT_STUB === '1';
/**
 * Fixture mode exists only in dev builds and where `VITE_PATTERN_IMPORT_STUB=1` is set at build
 * time. Both are compile-time constants, so in a production build the dynamic import below is dead
 * code and the fixture (fixture.ts, stub-client.ts) never reaches a chunk.
 */
const STUB_AVAILABLE = import.meta.env.DEV || STUB_BY_DEFAULT;

type StubKit = typeof import('./stub-client');

export function ImportWizard(props: WizardProps) {
  const [stub, setStub] = useState(STUB_AVAILABLE && STUB_BY_DEFAULT);
  const [kit, setKit] = useState<StubKit | null>(null);
  useEffect(() => {
    if (!STUB_AVAILABLE || !stub || kit) return;
    let live = true;
    void import('./stub-client').then((m) => live && setKit(m));
    return () => {
      live = false;
    };
  }, [stub, kit]);
  // fixture mode waits for its chunk (dev only; a few ms)
  if (stub && !kit) return null;
  // A new mode is a new run: the keyed body drops its client and session with it.
  return (
    <WizardBody
      key={stub ? 'stub' : 'worker'}
      {...props}
      onToggleStub={props.client || !import.meta.env.DEV ? undefined : () => setStub((v) => !v)}
      kit={stub ? kit : null}
    />
  );
}

/** Names when there is no AI to ask (VITE_PATTERN_IMPORT_AI=stub on real data): none, honestly. */
const noNames: NameSuggester = async () => [];

/** The real worker opened without a card form behind it (a stand, a test): apply refuses honestly. */
const noCardApply: ApplyDraftFn = async (draft) => ({
  ok: false,
  failedScope: draft.scopes[0]?.target.label ?? '—',
  message: 'this import was opened without a card form — download the files instead',
  uploaded: [],
});

function WizardBody({
  card: cardProp,
  onClose,
  client: clientProp,
  namer: namerProp,
  buildDraft: buildDraftProp,
  applyDraft: applyDraftProp,
  followUp,
  onRetryFollowUp,
  onReviewPieces,
  initialFiles,
  initialScopeKey,
  kit,
  onToggleStub,
}: WizardProps & { kit: StubKit | null; onToggleStub?: () => void }) {
  // No fabric line in the BOM: the run still converts, into one main file that is downloaded.
  const card = useMemo(() => forRun(cardProp), [cardProp]);
  // One client per wizard run. useState, not useMemo: the client owns the worker session and must
  // outlive any re-render (React may drop a memo; fast refresh re-runs one).
  const [client] = useState<ImportClient>(
    () => clientProp ?? (kit ? kit.createStubClient() : new ImportWorkerClient()),
  );
  // Fixture mode keeps the fixture draft and the simulated apply (it writes nothing); the real
  // worker gets F7's draft and the card's apply (patterns-field passes it with the form inside).
  const buildDraft =
    buildDraftProp ?? (client.kind === 'stub' && kit ? kit.stubBuildDraft : cardBuildDraft);
  const applyDraft =
    client.kind === 'stub' && kit ? kit.stubApplyDraft : applyDraftProp ?? noCardApply;
  const latest = useRef<ImportSession | null>(null);
  // The real AI namer (F10) needs real renders, so it rides with the real worker; the stub client's
  // render-som draws nothing and keeps the fixture namer. VITE_PATTERN_IMPORT_AI=stub turns the AI
  // off on the worker (no paid calls while the pipeline is tuned): no names, never fixture names
  // on a real file.
  const namer = useMemo(
    () =>
      namerProp ??
      (client.kind === 'worker'
        ? import.meta.env.VITE_PATTERN_IMPORT_AI === 'stub'
          ? noNames
          : createAiNamer()
        : kit
          ? kit.createStubNamer(
              () => latest.current?.pieces?.seeds ?? [],
              () => latest.current?.pieces?.families ?? [],
            )
          : noNames),
    [namerProp, client, kit],
  );
  // A9: the AI page roles ride with the real worker and the real namer (its renders are real);
  // VITE_PATTERN_IMPORT_AI=stub turns them off with the names
  const pageRoles = useMemo(
    () =>
      client.kind === 'worker' && import.meta.env.VITE_PATTERN_IMPORT_AI !== 'stub'
        ? apiPageRoleDeps
        : undefined,
    [client],
  );
  const api = useReplayable(
    useImportSession({
      client,
      card,
      namer,
      buildDraft,
      applyDraft,
      pageRoles,
      pinScopeKey: initialScopeKey,
    }),
  );
  latest.current = api.session;
  const { session, blocker } = api;
  // files dropped on a pattern slot: read them once, as if picked on the files step
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !initialFiles?.length) return;
    seeded.current = true;
    void api.dispatch({ type: 'files', files: initialFiles });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── A10 autopilot: read files → the drive with the autopilot's resolver → on a green gate the
  // explicit gated apply. A stop says why on the footer's ask line; the primary resumes it.
  const [autopilot, setAutopilot] = useState(readAutopilotPref);
  const apiRef = useRef(api);
  apiRef.current = api;
  const resolve = useMemo(() => resolverFor(card, () => apiRef.current), [card]);
  // ── AP-replay: a re-import of the same files reuses the previous import's answers (on by
  // default when every file matches by sha256), in both modes — the autopilot's questions go to
  // the replay first, and the operator's "next" carries it (the hook's standing drive)
  const prior = useMemo(
    () => priorOf(card, session.files),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card.techCardId, card.existingPatterns, session.files],
  );
  const [replayPick, setReplayPick] = useState<Record<string, boolean>>({});
  const replayOn = !!prior && (replayPick[prior.key] ?? prior.exact);
  const priorRef = useRef<Prior | null>(null);
  priorRef.current = replayOn ? prior : null;
  const [misses, setMisses] = useState<ReplayMiss[]>([]);
  useEffect(() => setMisses([]), [session.sessionId]);
  const replay = useMemo(() => {
    const src = () => ({
      prior: priorRef.current,
      card: apiRef.current.runCard,
      baseSeeds: apiRef.current.baseSeeds,
      presegmented: !!apiRef.current.extracted.presegmented,
    });
    const log = {
      miss: (m: ReplayMiss) =>
        setMisses((xs) => (xs.some((x) => x.key === m.key) ? xs : [...xs, m])),
    };
    return { manual: replayDrive(src, undefined, log), auto: replayDrive(src, resolve, log) };
  }, [resolve]);
  api.setStanding(replay.manual);
  const replayed = api.inputs.autopilot.filter(isReplayed).length;
  const started = useRef<number | null>(null);
  const applying = useRef<number | null>(null);
  const [apStop, setApStop] = useState<string | null>(null);
  useEffect(() => {
    // a new run (files read) starts the autopilot once
    if (!autopilot || session.busy || session.error || session.sessionId == null) return;
    if (!session.scale.candidates.length || started.current === session.sessionId) return;
    started.current = session.sessionId;
    setApStop(null);
    api.advance(replay.auto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopilot, session.busy, session.error, session.sessionId, session.scale.candidates.length]);
  useEffect(() => {
    // the drive stops on check: a green gate goes to the card by the explicit gated path
    const d = api.driveStop;
    if (!autopilot || !d || d.why !== 'auto-stop' || session.step !== 'check' || session.busy)
      return;
    if (applying.current === session.sessionId) return;
    applying.current = session.sessionId;
    void autopilotApply(() => apiRef.current, card, nextFrames).then((o) => {
      if (!o.ok) setApStop(o.reason);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopilot, api.driveStop, session.step, session.busy, session.sessionId]);
  const autopilotStop =
    autopilot && started.current === session.sessionId
      ? apStop ??
        // the drive's stop speaks only while its question is still open on this step: an operator
        // answer (the garment picked, the row confirmed) leaves no blocker / offer behind, and the
        // old reason must not linger in the footer next to a step that is already fine
        (api.driveStop &&
        api.driveStop.why !== 'auto-stop' &&
        api.driveStop.step === session.step &&
        (blocker || api.offer)
          ? api.driveStop.reason
          : null)
      : null;
  const resumeAutopilot = () => {
    setApStop(null);
    applying.current = null;
    api.advance(replay.auto);
  };
  // ── AUTOMATIC ANSWERS (ui-bits): a step's own answer (the garment the file cannot tell apart,
  // the sizes mapped in order) is dispatched like the operator's — which disarms the drive — and
  // the autopilot, when it was driving this run (started here, not stopped by a failed apply), is
  // resumed once the answer has landed: it never sits stopped with no reason on screen ──
  const autopilotRef = useRef(autopilot);
  autopilotRef.current = autopilot;
  const apStopRef = useRef(apStop);
  apStopRef.current = apStop;
  const resumeRef = useRef(resumeAutopilot);
  resumeRef.current = resumeAutopilot;
  const autoAnswer = useCallback<AutoAnswer>(async (ev) => {
    const sid = apiRef.current.session.sessionId;
    const driving = autopilotRef.current && started.current === sid && apStopRef.current == null;
    await apiRef.current.dispatch(ev);
    if (driving && autopilotRef.current && started.current === sid) resumeRef.current();
  }, []);
  // ── SKIP — DECIDE FOR ME (ui-bits LIKELY ANSWERS): the steps register the answer they already
  // pre-select for each open question; skip turns the autopilot on and, on every stop of the drive
  // on a step that asks, applies ONE such guess (the question asked now first), then resumes. A
  // step with no safe guess left stops with its reason, as without skip. Every guess is listed in
  // the header's «auto · N to check», by step, with a door back (D5: nothing silent) ──
  const likelyReg = useRef(new Map<string, () => LikelyGuess | null>());
  const likelyCtx = useMemo<LikelyRegistry>(
    () => ({
      register: (id, get) => {
        likelyReg.current.set(id, get);
        return () => {
          if (likelyReg.current.get(id) === get) likelyReg.current.delete(id);
        };
      },
    }),
    [],
  );
  const [skipSid, setSkipSid] = useState<number | null>(null);
  const skipOn = autopilot && skipSid != null && skipSid === session.sessionId;
  const [guesses, setGuesses] = useState<SkipGuess[]>([]);
  const skipTried = useRef(new Set<string>());
  const skipBusy = useRef(false);
  const skipAt = useRef<unknown>(null);
  useEffect(() => {
    setGuesses([]);
    skipTried.current.clear();
  }, [session.sessionId]);
  const noteGuess = (g: SkipGuess) =>
    setGuesses((xs) => [...xs.filter((x) => !(x.step === g.step && x.what === g.what)), g]);
  /** One likely answer applied on the step on screen; false = no safe guess left there. */
  const skipStep = async (): Promise<boolean> => {
    await nextFrames();
    const a = apiRef.current;
    const s = a.session;
    if (s.busy || s.error || s.sessionId == null) return false;
    const step = s.step;
    const now = currentAskKey(mainRef.current);
    const all = [...likelyReg.current.entries()].flatMap(([id, get]) => {
      const g = get();
      return g ? [{ id, g }] : [];
    });
    all.sort((x, y) => Number(y.g.key === now) - Number(x.g.key === now));
    for (const { id, g } of all) {
      const token = `${s.sessionId}|${step}|${id}|${g.sig ?? ''}`;
      if (skipTried.current.has(token)) continue;
      const p = g.likely();
      if (!p) continue;
      skipTried.current.add(token);
      noteGuess({ step, what: g.what, answer: g.answer });
      try {
        await p;
      } catch {
        /* the step says what failed; the drive stops there with its reason */
      }
      if (g.pastOffer) {
        await nextFrames();
        const b = apiRef.current;
        if (b.session.step === step && !b.blocker && !b.session.busy && !b.session.error)
          await b.next();
      }
      return true;
    }
    // nothing blocks, only an offer is left: going on as it is (the primary's «go on») is the guess
    if (!a.blocker && a.offer) {
      const token = `${s.sessionId}|${step}|offer|${a.offer}`;
      if (!skipTried.current.has(token)) {
        skipTried.current.add(token);
        noteGuess({ step, what: a.offer, answer: 'left as it is' });
        await a.next();
        return true;
      }
    }
    return false;
  };
  const runSkip = async (always: boolean) => {
    if (skipBusy.current) return;
    skipBusy.current = true;
    let did = false;
    try {
      did = await skipStep();
    } finally {
      skipBusy.current = false;
    }
    if (did || always) resumeRef.current();
  };
  /** The button: the autopilot on, this step's guess applied, the drive goes on. */
  const skipQuiz = () => {
    const sid = apiRef.current.session.sessionId;
    if (sid == null || apiRef.current.session.busy) return;
    setSkipSid(sid);
    if (!autopilotRef.current) {
      autopilotRef.current = true;
      setAutopilot(true);
    }
    started.current = sid;
    setCoach(null);
    void runSkip(true);
  };
  useEffect(() => {
    // every later stop of the drive on a step that asks: its likely answer, then on
    const d = api.driveStop;
    if (!skipOn || !d || d.why === 'auto-stop' || d.why === 'error' || d.why === 'notice') return;
    if (session.busy || session.error || d.step !== session.step || skipAt.current === d) return;
    skipAt.current = d;
    void runSkip(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipOn, api.driveStop, session.step, session.busy, session.error]);
  /** A guess's door: back to its step, skip off (the operator answers there now). */
  const guessDoor = (step: WizardStep) => {
    setSkipSid(null);
    void api.dispatch({ type: 'back', to: step });
  };
  /** AP-replay: turn the previous import's answers on — they answer from where the run stands. */
  const reuse = () => {
    if (!prior) return;
    setReplayPick((p) => ({ ...p, [prior.key]: true }));
    priorRef.current = prior;
    if (autopilot) resumeAutopilot();
    else api.advance(replay.manual);
  };
  /** AP-replay: the way out — answers already reused are undone by reading the files again. */
  const dontReuse = () => {
    if (!prior) return;
    setReplayPick((p) => ({ ...p, [prior.key]: false }));
    priorRef.current = null;
    if (!replayed) return;
    started.current = null;
    applying.current = null;
    void api.dispatch({ type: 'files', files: api.inputs.fileList });
  };
  const [askClose, setAskClose] = useState(false);
  // "fix in pieces" from check / details: the piece and size to show, and why (M1, M5). It lives
  // while the pieces step is open and is dropped when the operator leaves it.
  const [focus, setFocus] = useState<PieceFocus | null>(null);
  // the footer's "N pieces are blocked" → the details step selects the first blocked row
  const [detailsJump, setDetailsJump] = useState<{ seed: SeedId; n: number } | null>(null);
  const jumpSeed =
    session.step === 'meaning'
      ? firstBlockedSeed(session.semantics, session.pieces?.families ?? [])
      : null;
  useEffect(() => {
    if (session.step !== 'pieces') setFocus(null);
  }, [session.step]);
  const [dropped, setDropped] = useState<Record<number, string>>({});
  const droppedCtx = useMemo(
    () => ({
      labels: dropped,
      remember: (seed: number, label: string) => setDropped((d) => ({ ...d, [seed]: label })),
    }),
    [dropped],
  );
  // The steps' quiz histories: one per wizard mount, emptied whenever the run's session changes
  // (a new file read, a reset) — never shared between imports, cards or re-imports of one name.
  const [quizHistory] = useState<QuizHistory>(() => new Map());
  const quizSid = useRef<number | null>(session.sessionId);
  if (quizSid.current !== session.sessionId) {
    quizSid.current = session.sessionId;
    quizHistory.clear();
  }
  const fixInPieces = (f: PieceFocus) => {
    setFocus(f);
    void api.dispatch({ type: 'back', to: 'pieces' });
  };

  const at = stepIndex(session.step);
  const nextStep = STEPS[at + 1];
  const applied = api.apply.phase === 'done' && api.apply.result.ok;
  const applyRunning = api.apply.phase === 'running';
  // Leaving discards the run. Nothing is on the card yet (apply is the only writer), but a run
  // with a sheet assembled and pieces named is work — so leaving past the first step asks.
  const requestClose = () => {
    if (at === 0 || applied) onClose();
    else setAskClose(true);
  };

  // ── the five stages (stages.tsx): one glyph per state ─────────────────────────────────────
  const stageAt = STAGES.indexOf(STAGE_OF_STEP[session.step]);
  const stageLabel = (st: (typeof STAGES)[number]) =>
    st.key === 'card' && card.downloadOnly ? 'download' : st.label;
  /** A step the wizard went through without the operator (N1 'auto'/'skipped', A0.2 one page). */
  const byItself = (s: WizardStep) => !!api.passed[s] || (s === 'sheet' && api.sheetSkipped);

  // ── what the footer asks (D5: every stop reason stays visible — here or in the popover) ──
  const offWizard = (t: string) => /on the card first|on the BOM tab/.test(t);
  // STOPFIX: a failed re-write after a storage change is said once, by the toggle on the check
  // step (with its retry) — the footer keeps the step's own question, not a red block
  const footerError =
    session.error && !(session.step === 'check' && api.writeStorage.rewriteError)
      ? session.error
      : null;
  const askText = footerError ? null : blocker ?? autopilotStop ?? api.offer ?? null;
  const askKind: 'blocker' | 'stop' | 'offer' | null = footerError
    ? null
    : blocker
      ? 'blocker'
      : autopilotStop
        ? 'stop'
        : api.offer
          ? 'offer'
          : null;
  const stageState = (i: number): StageState => {
    if (i > stageAt) return 'ahead';
    if (i < stageAt) return STAGES[i].steps.every(byItself) ? 'auto' : 'done';
    if (session.busy) return 'working';
    if (applied) return 'done';
    if (askKind === 'blocker' || askKind === 'stop' || footerError) return 'asks';
    return 'current';
  };
  const subSteps = STAGE_OF_STEP[session.step].steps;

  const mainRef = useRef<HTMLElement | null>(null);
  // the step's plain wording of the question asked now (ui-bits PLAIN WORDS), else the sentence
  const askLabel = useAskLabel(mainRef, `${session.step}|${askText ?? ''}`);
  const askShown = askText && !offWizard(askText) ? askLabel ?? askText : askText;
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  // ── COACH MODE: a click that cannot advance shows WHERE and HOW instead (ui-bits ASK COACH) ──
  const [coach, setCoach] = useState<CoachTarget | null>(null);
  // the question changed (answered, another step): the old picture goes
  useEffect(() => setCoach(null), [askText, session.step, session.busy]);
  const onAsk = () => {
    // an ask fixed on the card closes the wizard only when nothing in the wizard answers it
    // (fabrics' interlining-only blocker names the BOM tab and is answered by a tick here)
    if (askText && offWizard(askText) && !firstAsk(mainRef.current)) return requestClose();
    const text = askShown ?? '';
    const show = (el: HTMLElement, bare = false) =>
      setCoach((c) => ({ el, text, n: (c?.n ?? 0) + 1, bare }));
    const bare = () => primaryRef.current && show(primaryRef.current, true);
    // a blocked piece: its row selected, its actions focused in the side panel (details' own
    // door) — the coach lights what details focused, else its first answer
    if (askKind === 'blocker' && jumpSeed != null) {
      setDetailsJump((j) => ({ seed: jumpSeed, n: (j?.n ?? 0) + 1 }));
      void nextFrames().then(() => {
        const main = mainRef.current;
        const a = document.activeElement;
        const el = a instanceof HTMLElement && main?.contains(a) && a !== main ? a : firstAsk(main);
        if (el) show(el);
        else bare();
      });
      return;
    }
    if (!focusAsk(mainRef.current, (el) => show(el))) bare();
  };

  /**
   * The ask line clicked (footer link, or its sentence in the warnings): the one-click fix bound to
   * the question asked now (ui-bits ONE-CLICK FIX: `data-ask-fix` keyed by the ask), else the coach.
   */
  const fixOrCoach = () => {
    const main = mainRef.current;
    if (!clickAskFix(main, currentAskKey(main))) onAsk();
  };

  // ── the one primary: action + count, derived from the session ──────────────────────────────
  const [override, setOverride] = useState<PrimaryOverride | null>(null);
  const draft = session.draft;
  const created = draft ? draft.pieces.filter((p) => !p.existingLineKey).length : 0;
  const continueAnyway = async () => {
    if (autopilot) {
      // the primary IS "resume autopilot": the drive runs on past every step that asks nothing.
      // A step that only OFFERS (or where the autopilot stopped) is the operator's explicit «go on
      // as is»: resuming alone would stop again on the same offer and the click looked dead
      // (owner, 16.10: «I press use 8 pieces, nothing happens») — step past it first, then resume.
      started.current = session.sessionId;
      if (askKind === 'offer' || askKind === 'stop') await api.next();
      resumeAutopilot();
    } else void api.next();
  };
  // ── ANSWERED AND GO (ui-bits): a quiz answer that leaves nothing asked moves on by itself ──
  const stepRef = useRef(session.step);
  stepRef.current = session.step;
  const goPending = useRef<{ step: WizardStep; pastOffer: boolean } | null>(null);
  const [goTick, setGoTick] = useState(0);
  const answeredAndGo = useCallback((answer?: Promise<unknown>, opts?: { pastOffer?: boolean }) => {
    const step = stepRef.current;
    void Promise.resolve(answer).then(() => {
      goPending.current = { step, pastOffer: !!opts?.pastOffer };
      setGoTick((t) => t + 1);
    });
  }, []);
  useEffect(() => {
    const go = goPending.current;
    if (go == null || session.busy) return;
    goPending.current = null;
    if (go.step !== session.step || session.error || blocker || !nextStep) return;
    if (api.offer && !go.pastOffer) return;
    void continueAnyway();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goTick, session.busy, session.step]);
  const primary = ((): PrimaryOverride & { loading?: boolean } => {
    const nextStage = nextStep ? stageLabel(STAGE_OF_STEP[nextStep.id]) : '';
    const nextTitle = nextStep ? `next: ${nextStep.label}` : undefined;
    if (session.busy)
      return {
        label: `${STAGE_WORD[session.busy.stage] ?? session.busy.stage}…`,
        onClick: () => {},
        disabled: true,
        loading: true,
      };
    if (override) return override;
    // a blocker never greys the primary out: the click coaches (shows where and how) instead
    const blocked = !!blocker && !footerError;
    if (session.step === 'apply') {
      if (card.downloadOnly)
        return {
          label: `download .dxf (${draft?.downloads.length ?? 0})`,
          onClick: () => void api.dispatch({ type: 'download' }),
          disabled: !draft,
        };
      if (applied) return { label: 'back to the card', onClick: onClose };
      return {
        label: `apply ${plural(created, 'piece')} to the card`,
        onClick: blocked ? onAsk : () => void api.dispatch({ type: 'apply' }),
        disabled: !draft || applyRunning,
        loading: applyRunning,
        title: draft
          ? `uploads ${plural(draft.scopes.filter((s) => !s.alreadyOnCard).length, 'file')}, then adds the pieces`
          : undefined,
      };
    }
    // check: the way to the apply screen (replace / add, what goes up) — the ellipsis says one
    // more screen comes before anything is written
    if (session.step === 'check')
      return {
        label: card.downloadOnly
          ? `download .dxf (${draft?.downloads.length ?? 0})…`
          : `apply ${plural(created, 'piece')} to the card…`,
        onClick: blocked ? onAsk : () => void api.next(),
        disabled: !nextStep,
        title: blocked
          ? `${blocker} — click to see where`
          : 'review what goes to the card, then apply',
      };
    if (blocked)
      return {
        label: 'next',
        onClick: onAsk,
        disabled: !nextStep,
        title: `${blocker} — click to see where and how`,
      };
    return {
      label: actionLabel() ?? `continue: ${nextStage}`,
      onClick: continueAnyway,
      disabled: !nextStep,
      title: autopilot ? `${nextTitle ?? ''} · resumes the autopilot after your answer` : nextTitle,
    };
  })();
  /** What "continue" commits on this step, with its count; null = no honest count yet. */
  function actionLabel(): string | null {
    const s = session;
    switch (s.step) {
      case 'files': {
        if (!s.scale.candidates.length) return null;
        const tiles = s.pages.filter((p) => p.cls === 'tile').length;
        return tiles ? `use ${plural(tiles, 'page')}` : `use ${plural(s.files.length, 'file')}`;
      }
      case 'scale': {
        const f = api.scaleDecision()?.factor;
        if (f == null) return null;
        return Math.abs(f - 1) < 5e-4 ? 'use scale 1:1' : `use scale ×${f.toFixed(3)}`;
      }
      case 'sheet': {
        if (api.sheetSkipped) return 'use 1 page';
        const n = s.sheet?.sheet.poses.length ?? 0;
        return n ? `accept ${plural(n, 'tile')}` : null;
      }
      case 'sizes': {
        const n = (s.sizes?.map.entries ?? []).filter((e) => e.card).length;
        return n ? `map ${plural(n, 'size')}` : null;
      }
      case 'pieces': {
        // the regions closed in every size: what goes on as pieces (a leak / tiny one does not)
        const n = (s.pieces?.families ?? []).filter((f) =>
          f.candidates.every((c) => c.outcome === 'closed'),
        ).length;
        return n ? `use ${plural(n, 'piece')}` : null;
      }
      case 'meaning': {
        const n = s.semantics?.pieces.length ?? 0;
        return n ? `use ${plural(n, 'named piece')}` : null;
      }
      case 'fabrics': {
        const n = card.downloadOnly ? 1 : api.runCard.scopes.length;
        return n ? `write ${plural(n, 'dxf file')}` : null;
      }
      default:
        return null;
    }
  }

  // STOPFIX: the stop's own line (not a red error): the run is as it was before the move.
  // A stop that lands between two stages is the hook's too (UX-HOOKS §3): it sets `api.stopped`
  // at once, so the press needs no remembering here.
  const stoppedLine =
    !session.busy && (api.errorCode === 'cancelled' || (!!api.stopped && !session.error));

  // ── header warnings: what is true but is not the one question (D5: nothing is dropped) ────
  const warnings: HeaderWarning[] = [];
  // every line is a link that fixes it (ui-bits ONE-CLICK FIX): the step's marked fix, else the coach
  // only the ask line's own sentence takes its bound fix; every other line coaches (never a fix
  // of something else: an old replay miss must not click «accept residuals»)
  const fix = { label: 'fix it', onClick: () => fixOrCoach() };
  const coachOnly = { label: 'show where', onClick: () => onAsk() };
  if (api.notice && !footerError && api.notice !== askText)
    warnings.push({ text: api.notice, action: coachOnly });
  // the footer shows the step's plain question: the session's own sentence stays visible here
  if (askText && askShown !== askText)
    warnings.push({
      text: askKind === 'stop' ? `autopilot stopped · ${askText}` : askText,
      action: fix,
    });
  if (autopilotStop && autopilotStop !== askText)
    warnings.push({ text: `autopilot stopped · ${autopilotStop}`, action: coachOnly });
  if (card.downloadOnly)
    warnings.push({
      text: 'download only: the BOM has no fabric line, so the run ends in a DXF download — add a fabric line on the BOM tab to apply an import',
      action: { label: 'close the import and add it on the BOM tab', onClick: requestClose },
    });
  if (replayOn)
    for (const m of misses) warnings.push({ text: `not replayed · ${m.why}`, action: coachOnly });

  const body = (() => {
    switch (session.step) {
      case 'files':
        return <FilesStep api={api} stub={client.kind === 'stub'} onToggleStub={onToggleStub} />;
      case 'scale':
        return <ScaleStep api={api} />;
      case 'sheet':
        // Keyed by sheet: the hand-grid form starts from THIS sheet's tiles.
        // A10: the card's choice is read off the run's snapshot of the card (Codex #5)
        return <SheetStep key={session.sheet?.sheet.id ?? -1} api={api} card={api.runCard} />;
      case 'sizes':
        return <SizesStep api={api} card={card} />;
      case 'pieces':
        return (
          <PiecesStep
            api={api}
            card={api.runCard}
            focus={focus}
            onDismissFocus={() => setFocus(null)}
          />
        );
      case 'meaning':
        return <DetailsStep api={api} card={card} onFixInPieces={fixInPieces} jump={detailsJump} />;
      case 'fabrics':
        return <FabricsStep api={api} card={card} />;
      case 'check':
        return <CheckStep api={api} onFixInPieces={fixInPieces} />;
      case 'apply':
        return (
          <ApplyStep
            api={api}
            card={card}
            stub={client.kind === 'stub'}
            onClose={onClose}
            followUp={followUp ?? null}
            onRetryFollowUp={onRetryFollowUp}
            onReviewPieces={onReviewPieces}
          />
        );
    }
  })();

  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (!o) requestClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-[var(--z-modal)] bg-overlay' />
        <Dialog.Content
          className='fixed inset-0 z-[var(--z-modal)] bg-pageBg p-4 focus:outline-none'
          data-testid='pattern-import-wizard'
          data-step={session.step}
          // The screen itself takes the focus, not the first control: "close" lit up as the
          // focused thing on open read as a prompt to leave.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          onEscapeKeyDown={(e) => {
            // Esc during a stage cancels the stage, not the wizard.
            if (session.busy) {
              e.preventDefault();
              api.cancel();
            }
          }}
        >
          <Dialog.Title className='sr-only'>import pattern</Dialog.Title>
          <Dialog.Description className='sr-only'>
            convert a pattern file of any format into a DXF with named pieces and the card sizes
          </Dialog.Description>
          <div className='grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] gap-2 [&>*]:min-h-0 [&>*]:min-w-0'>
            {/* ── chrome: what, where in five words, the quiet switches ─────────────────── */}
            <header className='flex flex-wrap items-center gap-x-4 gap-y-1 border border-borderColor bg-bgColor px-2 py-1.5'>
              <span className='flex min-w-0 items-baseline gap-2'>
                <Text
                  size='micro'
                  variant='uppercase'
                  tracking='label'
                  component='span'
                  className='whitespace-nowrap font-bold'
                >
                  import pattern
                </Text>
                {(session.files.length > 0 || card.styleLabel) && (
                  <Text
                    size='micro'
                    variant='label'
                    component='span'
                    className='min-w-0 max-w-[28ch] truncate'
                    title={[card.styleLabel, ...session.files.map((f) => f.name)]
                      .filter(Boolean)
                      .join(' · ')}
                  >
                    {session.files.length > 0
                      ? session.files.map((f) => f.name).join(', ')
                      : card.styleLabel}
                  </Text>
                )}
              </span>
              <Stepper
                steps={STAGES.map((st, i) => {
                  const state = stageState(i);
                  const glyph = STAGE_GLYPH[state];
                  const word = (
                    <>
                      {stageLabel(st)}
                      {glyph && (
                        <span
                          aria-hidden
                          className={cn(
                            'ml-1',
                            state === 'auto' && 'text-labelColor',
                            state === 'asks' && 'text-warning',
                          )}
                        >
                          {glyph}
                        </span>
                      )}
                    </>
                  );
                  const door = (state === 'done' || state === 'auto') && !session.busy && !applied;
                  const says =
                    state === 'auto'
                      ? 'passed by itself'
                      : state === 'asks'
                        ? 'needs you'
                        : state === 'working'
                          ? 'working'
                          : state === 'done'
                            ? 'done'
                            : '';
                  return {
                    done: i < stageAt,
                    current: i === stageAt,
                    label: door ? (
                      <button
                        type='button'
                        aria-label={`${stageLabel(st)}: ${says} — open`}
                        className={cn(
                          'uppercase underline decoration-borderColor underline-offset-2 hover:decoration-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                          state === 'auto' && 'text-labelColor',
                        )}
                        onClick={() => void api.dispatch({ type: 'back', to: st.steps[0] })}
                        title={
                          state === 'auto'
                            ? 'passed by itself — open to check'
                            : `back to ${stageLabel(st)} — its answers are kept, later steps re-run`
                        }
                      >
                        {word}
                      </button>
                    ) : (
                      <span aria-label={says ? `${stageLabel(st)}: ${says}` : undefined}>
                        {word}
                      </span>
                    ),
                  };
                })}
              />
              {subSteps.length > 1 && (
                // inside a stage of several steps: which one, quietly (not in the stepper)
                <HeaderNote title={subSteps.map((s) => STEPS[stepIndex(s)].label).join(' › ')}>
                  {STEPS[at].label} · {subSteps.indexOf(session.step) + 1} of {subSteps.length}
                </HeaderNote>
              )}
              <span className='ml-auto flex items-center gap-3'>
                {client.kind === 'stub' && (
                  <HeaderNote
                    tone='attention'
                    title='the importer core is not wired yet: every step shows fixture data and nothing reaches the card'
                  >
                    stub · fixture data
                  </HeaderNote>
                )}
                {prior && !applied && (
                  // AP-replay: one quiet line; what was not replayed is in the warnings
                  <span className='flex items-center gap-1.5' data-replay={replayOn ? 'on' : 'off'}>
                    <HeaderNote
                      title={`the previous import of ${prior.exact ? 'these files' : `${prior.matched} of ${prior.of} files`} (${prior.label})`}
                    >
                      {replayOn ? `replayed ${plural(replayed, 'answer')}` : 'imported before'}
                    </HeaderNote>
                    <Chip
                      quiet
                      nonForm
                      onClick={replayOn ? dontReuse : reuse}
                      title={
                        replayOn
                          ? 'read the files again and answer without the previous import'
                          : 'reuse the answers of the previous import'
                      }
                    >
                      {replayOn ? "don't reuse" : 'reuse answers'}
                    </Chip>
                  </span>
                )}
                <HeaderWarnings items={warnings} />
                {guesses.length > 0 && <GuessesPill guesses={guesses} onDoor={guessDoor} />}
                <Chip
                  quiet
                  nonForm
                  pressed={autopilot}
                  aria-label='autopilot'
                  title={
                    autopilot
                      ? 'the run answers what it can by itself and stops where it cannot — click to turn off'
                      : 'every step waits for you — click to let the run answer by itself'
                  }
                  onClick={() => {
                    const on = !autopilot;
                    if (!on) setSkipSid(null);
                    // switched on mid-run: it drives from the next "continue", not at once
                    if (on && session.step !== 'files') started.current = session.sessionId;
                    setAutopilot(on);
                    writeAutopilotPref(on);
                  }}
                >
                  autopilot {autopilot ? 'on' : 'off'}
                </Chip>
                <Chip
                  nonForm
                  onClick={requestClose}
                  title='close the import (the card is not changed)'
                >
                  close
                </Chip>
              </span>
            </header>

            {/* ── stage ────────────────────────────────────────────────────────────────── */}
            <main ref={mainRef} className='relative min-h-0 min-w-0'>
              <WizardPrimaryContext.Provider value={setOverride}>
                <DroppedLabels.Provider value={droppedCtx}>
                  <QuizHistoryContext.Provider value={quizHistory}>
                    <AutopilotOnContext.Provider value={autopilot}>
                      <AnsweredAndGoContext.Provider value={answeredAndGo}>
                        <AutoAnswerContext.Provider value={autoAnswer}>
                          <LikelyContext.Provider value={likelyCtx}>
                            <SkipQuizContext.Provider value={skipQuiz}>
                              {session.busy ? (
                                // the last picture the run has, dimmed and out of reach while it works
                                <div className='h-full opacity-40' inert aria-hidden>
                                  {body}
                                </div>
                              ) : (
                                body
                              )}
                            </SkipQuizContext.Provider>
                          </LikelyContext.Provider>
                        </AutoAnswerContext.Provider>
                      </AnsweredAndGoContext.Provider>
                    </AutopilotOnContext.Provider>
                  </QuizHistoryContext.Provider>
                </DroppedLabels.Provider>
              </WizardPrimaryContext.Provider>
              {session.busy && <Working busy={session.busy} onStop={api.cancel} />}
            </main>

            {/* ── actions: back · the one question · the one button ────────────────────── */}
            <footer className='flex items-center gap-3 border border-borderColor bg-bgColor px-2 py-1.5'>
              {at > 0 && !applied ? (
                <BackLink
                  className='shrink-0'
                  disabled={!!session.busy || applyRunning}
                  onClick={() => void api.dispatch({ type: 'back', to: STEPS[at - 1].id })}
                />
              ) : null}
              <div className='min-w-0 flex-1'>
                {stoppedLine ? (
                  // STOPFIX: a stop is the operator's own — one quiet line, the run is kept
                  <Text
                    size='micro'
                    component='p'
                    className='text-labelColor'
                    data-testid='pattern-import-stopped'
                    data-stage={api.stopped?.stage ?? undefined}
                    title={session.error ?? undefined}
                  >
                    stopped ·{' '}
                    <button
                      type='button'
                      className='cursor-pointer underline decoration-current/40 underline-offset-2 hover:text-textColor hover:decoration-current'
                      title={
                        api.stopped && api.lastMove ? `repeats: ${api.lastMove}` : primary.title
                      }
                      onClick={() => void api.runAgain(primary.onClick)}
                    >
                      run again
                    </button>
                  </Text>
                ) : footerError ? (
                  <StageMessage
                    code={api.errorCode}
                    message={footerError}
                    onReport={api.downloadReport}
                  />
                ) : askText && !session.busy ? (
                  <Text
                    component='p'
                    variant={askKind === 'offer' ? 'label' : undefined}
                    className={askKind === 'offer' ? undefined : 'text-warning'}
                    data-testid='pattern-import-blocker'
                    data-ask-kind={askKind}
                    {...(askShown !== askText ? { 'data-ask-text': askText } : {})}
                    {...(autopilotStop ? { 'data-autopilot-stop': '' } : {})}
                  >
                    <button
                      type='button'
                      className='cursor-pointer text-left underline decoration-current/40 underline-offset-2 hover:decoration-current'
                      title={
                        offWizard(askText) && !firstAsk(mainRef.current)
                          ? 'close the import and fix it on the card'
                          : askShown !== askText
                            ? `${askText} — click to see where`
                            : 'show the control that answers this'
                      }
                      onClick={fixOrCoach}
                    >
                      {askKind === 'offer' ? askShown : `! ${askShown}`}
                    </button>
                    {!applied && session.step !== 'check' && session.step !== 'apply' && (
                      <>
                        {' · '}
                        <SkipQuiz onSkip={skipQuiz} />
                      </>
                    )}
                  </Text>
                ) : null}
              </div>
              {(session.step === 'apply' || (session.step === 'check' && !blocker)) &&
                draft &&
                !(card.downloadOnly && session.step === 'apply') && (
                  <Button
                    variant='secondary'
                    size='sm'
                    className='shrink-0'
                    disabled={applyRunning || !!session.busy}
                    onClick={() => void api.dispatch({ type: 'download' })}
                  >
                    download .dxf ({draft.downloads.length})
                  </Button>
                )}
              {(nextStep || session.step === 'apply') && (
                <Button
                  ref={primaryRef}
                  variant='main'
                  size='sm'
                  className='shrink-0'
                  data-testid='pattern-import-primary'
                  data-coach={blocker && !footerError && !session.busy ? '' : undefined}
                  disabled={!!primary.disabled}
                  loading={!!primary.loading}
                  title={primary.title}
                  onClick={primary.onClick}
                >
                  {primary.label}
                </Button>
              )}
            </footer>
          </div>

          {coach && !session.busy && (
            <AskCoach target={coach} area={mainRef.current} onClose={() => setCoach(null)} />
          )}

          <ConfirmationModal
            open={askClose}
            onOpenChange={setAskClose}
            onConfirm={() => {
              setAskClose(false);
              onClose();
            }}
            title='discard this import?'
            confirmLabel='discard and close'
            cancelLabel='keep working'
            width='sm'
          >
            <Text size='micro' component='p'>
              the run is not kept: the next import starts from the files again. the card is not
              changed — nothing was applied.
            </Text>
          </ConfirmationModal>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * The parsing state: which of four phases, the engine's own word for the stage, done / total of
 * THIS stage (never one percentage across stages), and a quiet stop — over the dimmed last
 * preview of the run.
 */
function Working({
  busy,
  onStop,
}: {
  busy: NonNullable<ImportSession['busy']>;
  onStop: () => void;
}) {
  const counted = busy.total > 1;
  // a note that counts by itself (the restore after a stop: "… · k/n") is not counted twice
  const ownCount = !!busy.note && /\d+\s*\/\s*\d+\s*$/.test(busy.note);
  // STOPFIX: the restore after a stop replays stages quietly — say that first, the stage second
  const restoring = !!busy.note && /^restoring\b/.test(busy.note);
  const stageWord = STAGE_WORD[busy.stage] ?? busy.stage;
  return (
    <div className='pointer-events-none absolute inset-0 flex items-center justify-center p-4'>
      <section
        className='pointer-events-auto flex w-[min(420px,100%)] flex-col gap-1.5 border border-borderColor bg-bgColor px-3 py-2.5'
        data-testid='pattern-import-progress'
        aria-live='polite'
      >
        <span className='flex items-baseline gap-2'>
          <Text
            size='micro'
            variant='uppercase'
            tracking='label'
            component='span'
            className='font-bold'
          >
            {restoring ? 'restoring' : PHASE_OF[busy.stage] ?? 'working'}
          </Text>
          <Button
            variant='underline'
            size='xs'
            className='ml-auto text-labelColor hover:text-textColor'
            onClick={onStop}
            title='stop this stage (esc)'
          >
            stop
          </Button>
        </span>
        <Text size='micro' variant='label' component='p' className='min-w-0 truncate'>
          {restoring ? (
            `${busy.note} · ${stageWord}`
          ) : (
            <>
              {stageWord}
              {busy.note ? ` · ${busy.note}` : ''}
              {counted && !ownCount ? ` · ${busy.done} / ${busy.total}` : ''}
            </>
          )}
        </Text>
        {counted && <Progress value={(busy.done / busy.total) * 100} />}
      </section>
    </div>
  );
}

/**
 * The footer's word on a failed request. A stage that is not built yet is not a failure of the
 * file: it reads as a note (where the import stops today), not as red. A stop is the operator's own.
 */
function StageMessage({
  code,
  message,
  onReport,
}: {
  code: string | null;
  message: string;
  onReport: () => void;
}) {
  if (code === 'stage-unavailable')
    return (
      <CalloutBox tone='note' className='py-1'>
        <Text size='micro' component='p'>
          <b>not built yet:</b> {message}
        </Text>
      </CalloutBox>
    );
  if (code === 'cancelled')
    return (
      <Text size='micro' component='p' className='text-labelColor'>
        {message}
      </Text>
    );
  const head =
    code === 'unsupported-format'
      ? 'cannot read the files'
      : code === 'corrupt'
        ? 'the file is damaged'
        : code === 'crashed'
          ? 'the importer stopped'
          : code === 'no-session'
            ? 'the run was lost'
            : code === 'too-large'
              ? 'too large to import'
              : 'stage failed';
  return (
    <CalloutBox tone='error' className='py-1'>
      <div className='flex items-start justify-between gap-3'>
        <Text size='micro' component='p'>
          <b>! {head}:</b> {message}
        </Text>
        {/* a refusal of the file's size is not a defect: nothing to report */}
        {code !== 'too-large' && (
          <Button
            variant='underline'
            size='xs'
            className='shrink-0 whitespace-nowrap'
            title='saves a JSON file: versions, file names, sizes and checksums, the failed stage, the gate and your answers; never the files themselves'
            onClick={onReport}
          >
            download report
          </Button>
        )}
      </div>
    </CalloutBox>
  );
}

/** The session calls that start a move (UX-HOOKS §3): what "run again" repeats after a stop. */
const MOVES = [
  'dispatch',
  'next',
  'advance',
  'addSeed',
  'promoteAside',
  // PROMOTE-BATCH: run again repeats the whole set-aside batch (it was undone whole)
  'promoteAsides',
  'editPieces',
  'editName',
  'editNames',
  'answerOutline',
  'acceptMissing',
  'confirmSize',
  'setSize',
  'drawnAnyway',
  'setDrawnSizes',
  'confirmShown',
  'reviewAsides',
  'retryWrite',
] as const;
type Move = (typeof MOVES)[number];
/** Events that start no stage: never what a stop interrupted. */
const NOT_A_MOVE = new Set(['download', 'apply', 'reset']);

/**
 * STOPFIX "run again": the session api with every move-starting call remembered when it is made
 * while the run is idle. The first stage that starts afterwards binds it as the move in flight, so
 * a stop (which undoes that whole move) can be followed by the same call on the same state.
 * Stages of one move after the first (busy drops between them) keep the binding.
 */
function useReplayable(api: ImportSessionApi) {
  const busyRef = useRef(api.session.busy);
  busyRef.current = api.session.busy;
  const pending = useRef<{ name: Move; args: unknown[] } | null>(null);
  const [move, setMove] = useState<{ name: Move; args: unknown[] } | null>(null);
  const wasBusy = useRef(false);
  useEffect(() => {
    const busy = !!api.session.busy;
    if (busy && !wasBusy.current && pending.current) {
      setMove(pending.current);
      pending.current = null;
    }
    wasBusy.current = busy;
  }, [api.session.busy]);
  // a new run (files read again, reset) forgets the old run's move
  useEffect(() => {
    if (api.session.sessionId == null) {
      setMove(null);
    }
  }, [api.session.sessionId]);

  const wrapped = { ...api } as ImportSessionApi;
  const rec = wrapped as unknown as Record<Move, (...a: unknown[]) => unknown>;
  const raw = api as unknown as Record<Move, (...a: unknown[]) => unknown>;
  for (const name of MOVES) {
    const fn = raw[name];
    if (typeof fn !== 'function') continue;
    rec[name] = (...args: unknown[]) => {
      const ev = name === 'dispatch' ? (args[0] as { type?: string } | undefined) : undefined;
      if (!busyRef.current && !(ev?.type && NOT_A_MOVE.has(ev.type)))
        pending.current = { name, args };
      return fn(...args);
    };
  }
  const describe = (m: typeof move) =>
    !m
      ? null
      : m.name === 'dispatch'
        ? String((m.args[0] as { type?: string } | undefined)?.type ?? 'event')
        : m.name;
  return Object.assign(wrapped, {
    /** The call the stopped move began with (its name), null = none recorded. */
    lastMove: describe(move),
    /** Repeat the stopped move's call (recorded again as the new move); none → `fallback`. */
    // only an undone move (`stopped`) is repeated: a stop that undid nothing would apply it twice
    runAgain: (fallback: () => unknown) =>
      api.stopped && move ? rec[move.name](...move.args) : fallback(),
  });
}
