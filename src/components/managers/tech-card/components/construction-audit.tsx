import {
  AnalyzeTechCardConstructionResponse,
  common_TechCardIssueSeverity,
  TechCardAnalysisFinding,
} from 'api/proto-http/admin';
import {
  ANALYZE_ABORTED_BY_CLIENT,
  ANALYZE_CLIENT_BUDGET_MS,
  useAddTechCardIssue,
  useAnalyzeTechCardConstruction,
  useTechCardConstructionAudit,
} from 'components/managers/tech-cards/components/useTechCardQuery';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Accordion } from 'ui/components/accordion';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { ViewSwitch } from 'ui/components/view-switch';
import { FingerprintableOperation, formOperationFingerprints } from './analysis-fp';
import { assignUids, loadAnalysis, saveAnalysis, StoredAnalysis } from './analysis-identity';
import { DEFAULT_ISSUE_SEVERITY, DEFAULT_ISSUE_STATUS, TechCardFormData } from './schema';

// CONSTRUCTION AUDIT — the machine layer's report on the SAVED card, sitting above everything it is
// a report ABOUT. Advisory throughout: nothing here disables a control or refuses a save.
//
// EVERY TAXONOMY ON THIS SCREEN IS RENDERED AS TEXT, NEVER MATCHED AGAINST A CLOSED LIST. `severity`
// and `category` travel as strings precisely because the taxonomy grows without a client
// regeneration, so a finding that arrives with a category this bundle has never heard of must reach
// the screen — the only thing a known value buys here is a tone and a plural, and both fall back.
//
// THE `notChecked` LIST IS NOT A DISCLOSURE. It is the point of the feature: a clean report with a
// hidden «and here is what I never looked at» reads as «checked and clean», which is the one lie an
// audit must not tell. It renders always, expanded, under the findings — including when there are no
// findings at all, where it is the ONLY honest content on the panel.
//
// THE AI REVIEW BLOCK IS A SEPARATE BLOCK BELOW, NOT A SECOND HALF OF THE LIST. The two layers fail
// independently: a suppressed model half (`invalid_output`) must never read as an all-clear over the
// machine section, and a machine section full of findings must not be quieted by a model that
// answered nothing. Same finding ROW on both sides — one renderer, so the chips, the expansion and
// «file as issue» cannot drift apart — but two headers, two statuses, two stories.

// Severities in the order they are shown, and the only ones this bundle knows a tone for. An
// unknown severity is counted and drawn like the rest, just at the default tone and after these.
const SEVERITY_ORDER = ['blocker', 'error', 'warning'];
const SEVERITY_IS_LOUD = new Set(['blocker', 'error']);

// THE MODEL HALF COUNTS AND GROUPS ON ONE AXIS, AND `question` IS ON IT. `question` is a CATEGORY,
// not a severity — but the pill header the gold-standard review is written to has four buckets, the
// fourth being «спорное». Counting it on the category axis while GROUPING it by its severity is how
// a header reading «0 warnings» ends up sitting above a group headed «1 warning»: two true numbers
// that contradict each other on one screen. So both use this, and neither can drift.
const MODEL_BUCKETS = [...SEVERITY_ORDER, 'question'];
function modelBucket(f: TechCardAnalysisFinding): string {
  if ((f.category ?? '').trim() === 'question') return 'question';
  return (f.severity ?? '').trim() || 'finding';
}

// A ref is an anchor string the server mints: "op:460" | "unit:base" | "piece:SL_INS_L" |
// "bom:подкладка" | "card". WHERE each one is fixed is this admin's navigation and can never come
// from the API, so the mapping stays here — the same split lifecycle-strip makes for its checklist.
//
// `piece:` lands on PATTERNS and `bom:` on BOM by their real TabId, not by the name in the anchor:
// cut pieces moved off their own tab (?tab=pieces is a folded alias now), so «the pieces tab» is
// `patterns`. Neither carries a query param — nothing on either tab consumes one, and a param no
// reader clears would just sit in the address bar forever.
//
// `card` and any anchor kind this bundle does not know resolve to null and render as plain text: a
// link that navigates nowhere is worse than a label, and an unknown anchor is still evidence.
type RefTarget = { tab: string; extra?: Record<string, string> };

function refTarget(ref: string): RefTarget | null {
  const at = ref.indexOf(':');
  const kind = at < 0 ? ref : ref.slice(0, at);
  const value = at < 0 ? '' : ref.slice(at + 1).trim();
  if (!value) return null;
  switch (kind) {
    case 'op':
      return { tab: 'construction', extra: { op: value } };
    case 'unit':
      return { tab: 'construction', extra: { unit: value } };
    case 'piece':
      return { tab: 'patterns' };
    case 'bom':
      return { tab: 'bom' };
    default:
      return null;
  }
}

// The first operation an anchor names, for the issue this finding files. 0 = «no operation», which
// is a legal issue exactly as it is anywhere else in the card — an issue about the card as a whole.
function firstOpNumber(refs: string[]): number {
  for (const r of refs) {
    if (!r.startsWith('op:')) continue;
    const n = parseInt(r.slice(3).trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** The step number an `op:` anchor names, or null for anything else. */
function opNumber(ref: string): number | null {
  if (!ref.startsWith('op:')) return null;
  const n = parseInt(ref.slice(3).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ─── ANCHOR RESOLUTION, THE THREE BRANCHES OF §9 ───────────────────────────────────────────────
//
// `operation_number` is the anchor currency of the whole system, and its ONE weakness is that the
// server re-stamps numbers positionally on every save: while somebody reads a run, another save can
// move #460 onto a different step. The fingerprint closes exactly that hole, and the resolution has
// three outcomes, no more:
//
//   ok      — the number is on the card and its fingerprint is the one the run read → jump, silently.
//   changed — the number is on the card and its fingerprint is NOT → STILL JUMP, plus a per-finding
//             note. Refusing the jump would be worse than useless: the reader wants to look.
//   missing — the number is not on the card at all → a grey label, no jump. The one case where
//             navigating would land somewhere arbitrary.
//
// NOTHING IS HASHED TO DECIDE THIS. Both halves arrive as maps: the run's snapshot is mirrored into
// the session at the moment of the run, and the CURRENT map comes back on every audit refetch — and
// the audit query is keyed under the card detail, so a save invalidates it and the amber appears by
// itself. Hashing enters only for the FORM (see `AnchorStaleNote`), which no server map can know.
//
// THERE IS NO GLOBAL STALE BANNER, deliberately (§10). Findings are answered by editing the card,
// and a banner that greys out the whole run the moment one step is touched would punish exactly the
// person who acted on it. Staleness is per finding because the fingerprint machinery already knows
// it per finding.
type AnchorState = 'ok' | 'changed' | 'missing' | 'unknown';

/**
 * `unknown` IS THE SAFE FALLBACK AND IS RENDERED EXACTLY LIKE `ok`. Two ways to reach it, both of
 * them «this bundle cannot tell», never «nothing is wrong»:
 *
 *  · THE CURRENT MAP IS ABSENT OR EMPTY — an older server that does not send
 *    `operation_fingerprints` yet. Reading that as «no number is on the card» would paint EVERY
 *    anchor of every finding grey «not found», on a deployment where nothing at all is wrong.
 *  · THE RUN CARRIES NO SNAPSHOT for this number — a run mirrored by an older bundle, or a step
 *    that did not exist when the run happened. There is nothing to compare against, and inventing
 *    a verdict from one side of a comparison is how false amber gets shipped.
 */
function anchorState(
  n: number,
  atRun: Record<string, string>,
  now: Record<string, string> | undefined,
): AnchorState {
  if (!now || Object.keys(now).length === 0) return 'unknown';
  const current = now[String(n)];
  // Decided by the CURRENT map alone: whether the run knew this step or not, a number that is no
  // longer on the card is a jump to nowhere.
  if (current === undefined) return 'missing';
  const then = atRun[String(n)];
  if (!then) return 'unknown';
  return then === current ? 'ok' : 'changed';
}

/** «op #200» / «op #200, #300» — the numbers a note is about, named rather than counted. */
function opList(numbers: number[]): string {
  return numbers.length === 0 ? '' : `op #${numbers.join(', #')}`;
}

/**
 * THE PER-FINDING AMBER, and the one organ in this panel that hashes anything.
 *
 * «AMBER» IS THE SEMANTIC, `warning` IS THE TOKEN. This system has no amber: `warning` is BLUE here
 * and means «mid-flight, needs a human» (see `CalloutBox`), which is precisely this state. Inventing
 * a literal amber would be a colour outside the palette, and `error` red would say «broken», which a
 * step someone legitimately edited is not.
 *
 * TWO REASONS, ONE SLOT, AND THE SAVED ONE WINS. If the SAVED card already moved under the run, the
 * form having moved too adds nothing — one line per finding, naming the reason that is furthest
 * along.
 *
 * THE FORM HALF IS GATED ON `dirty`. A pristine form must hash to exactly what the server stored, so
 * any disagreement there would be a bug in the hydration, not an edit — and it would render as a
 * permanent «unsaved edits» on a card nobody touched. Gating on `isDirty` removes that entire class:
 * the note can only appear where there genuinely are unsaved changes.
 *
 * THE WATCH LIVES IN THIS LEAF AND NOWHERE ELSE — the `StepNumberDrift` precedent in
 * operations-field.tsx. `useWatch({ name: 'operations' })` re-renders its component on every
 * keystroke in any step; in the panel body that would redraw every finding of every group on every
 * letter typed into a 48-step card. Here it redraws one line.
 */
function AnchorStaleNote({
  opNumbers,
  resolveOp,
  runFingerprints,
  dirty,
}: {
  opNumbers: number[];
  resolveOp: (n: number) => AnchorState;
  runFingerprints: Record<string, string>;
  dirty: boolean;
}) {
  const ops = useWatch({ name: 'operations' }) as FingerprintableOperation[] | undefined;

  const changed = opNumbers.filter((n) => resolveOp(n) === 'changed');
  // ONLY THE STEPS THIS NOTE IS ABOUT ARE HASHED. There is one of these per finding and the watch
  // fires on every keystroke in any step; hashing all 48 rows in each of fifteen notes would be
  // seven hundred digests per letter typed, to answer a question about one or two of them.
  const formFingerprints = dirty
    ? formOperationFingerprints(
        (ops ?? []).filter((o) => opNumbers.includes(o?.operationNumber ?? 0)),
      )
    : null;
  const edited = formFingerprints
    ? opNumbers.filter((n) => {
        if (changed.includes(n)) return false;
        const then = runFingerprints[String(n)];
        const inForm = formFingerprints[String(n)];
        // Both halves must be present: a step the run never fingerprinted, or one the form has no
        // number for yet, is «cannot tell», and «cannot tell» is not «changed».
        return !!then && !!inForm && then !== inForm;
      })
    : [];

  if (changed.length === 0 && edited.length === 0) return null;
  // The marker is for the probe, which has to prove this note is INSIDE its finding and not a
  // banner over the run — the same job `data-ai-review` does one block up.
  return (
    <div data-stale-note className='mt-1'>
      <CalloutBox tone='warning'>
        <Text size='micro'>
          {changed.length > 0
            ? `${opList(changed)} changed since the run — the anchor still goes there, but that step is no longer the one the model read. Re-run to have it read again.`
            : `${opList(edited)} has unsaved edits since the run — the run read the SAVED step. Save the card, then re-run.`}
        </Text>
      </CalloutBox>
    </div>
  );
}

// WHERE A FINDING SITS ON THE ROUTE. The technologist works either in batches of one kind of edit
// (that is `category`) or top-to-bottom through the sequence — this key is the second one, and the
// gold-standard review is ordered by it.
//
// `missing_step` is keyed by its INSERT POINT, not by its refs: the step it talks about does not
// exist yet, so its anchors point at the neighbours, and sorting by those would file «add a step
// after 120» next to whatever op:460 it happened to cite. `start` sorts before every real step;
// «no op anchor at all» sorts last rather than first — a finding about the card as a whole is not
// step zero.
const ROUTE_LAST = Number.MAX_SAFE_INTEGER;
function routeKey(f: TechCardAnalysisFinding): number {
  const refs = (f.refs ?? []).filter((r): r is string => !!r?.trim());
  if ((f.category ?? '').trim() === 'missing_step') {
    const ins = (f.insertAfter ?? '').trim();
    if (ins === 'start') return -1;
    const n = opNumber(ins);
    if (n !== null) return n;
  }
  const nums = refs.map(opNumber).filter((n): n is number => n !== null);
  return nums.length ? Math.min(...nums) : ROUTE_LAST;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// TWO VOCABULARIES FOR ONE WORD, and the boundary between them runs exactly through this panel.
// The FORM speaks the proto enum (`TECH_CARD_ISSUE_SEVERITY_MEDIUM`) because that is what the card
// message carries. `AddTechCardIssueRequest.severity` is a plain STRING, and the handler accepts
// only HIGH | MEDIUM | LOW — anything else is InvalidArgument, by design (the column's own CHECK
// is `^(low|medium|high)$`, and the handler maps the wire token onto it rather than passing the
// spelling through). Sending the enum name would have failed EVERY direct filing, and no amount of
// stubbed-network testing could have shown it: the stub accepts whatever it is handed.
const ISSUE_SEVERITY_WIRE: Record<string, string> = {
  TECH_CARD_ISSUE_SEVERITY_HIGH: 'HIGH',
  TECH_CARD_ISSUE_SEVERITY_MEDIUM: 'MEDIUM',
  TECH_CARD_ISSUE_SEVERITY_LOW: 'LOW',
};
function wireSeverity(formSeverity: string): string {
  return ISSUE_SEVERITY_WIRE[formSeverity] ?? 'MEDIUM';
}

// THE FINDING'S SEVERITY DECIDES THE ISSUE'S — design §11: blocker/error → HIGH, warning → MEDIUM,
// question → LOW.
//
// FILING EVERYTHING AT ONE LEVEL IS THE FAILURE THIS REPLACES. A blocker filed as MEDIUM arrives on
// the issues tab indistinguishable from a note about a typo, and the whole reason the panel sorts
// findings by severity is that the difference is what someone acts on first. The constant default
// stays as the fallback for a severity this bundle has never heard of — the taxonomy grows without a
// client regeneration (see the header), and an unknown word must file SOMETHING rather than nothing.
//
// `question` IS READ OFF THE CATEGORY AXIS, through the same modelBucket the pills and the grouping
// use. It is not a severity, and asking `f.severity` for it would file «спорное» at whatever
// severity the model happened to attach — that is exactly the two-numbers-that-disagree failure the
// bucket function exists to prevent, only landing in a row someone answers for.
const ISSUE_SEVERITY_BY_BUCKET: Record<string, common_TechCardIssueSeverity> = {
  blocker: 'TECH_CARD_ISSUE_SEVERITY_HIGH',
  error: 'TECH_CARD_ISSUE_SEVERITY_HIGH',
  warning: 'TECH_CARD_ISSUE_SEVERITY_MEDIUM',
  question: 'TECH_CARD_ISSUE_SEVERITY_LOW',
};
function issueSeverityOf(f: TechCardAnalysisFinding): common_TechCardIssueSeverity {
  return ISSUE_SEVERITY_BY_BUCKET[modelBucket(f)] ?? DEFAULT_ISSUE_SEVERITY;
}

// THE DESCRIPTION A FILED ISSUE CARRIES — one mapping for both sources and both paths (the live
// card's form write and the released card's direct call), so the frozen path cannot drift from the
// live one and the model tail cannot be forgotten on one of them.
//
// A MODEL FINDING NAMES ITS MODEL. The issue outlives the run that produced it by months; without
// the slug, a claim the reader is about to act on has no provenance at all, and «the AI said so» is
// unfalsifiable in a way «gpt-x said so on the 24th» is not. A machine finding gets no such tail —
// it was produced by code in this repo, and a version tail there would be noise.
export function issueDescription(f: TechCardAnalysisFinding, modelSlug?: string): string {
  const title = (f.title ?? '').trim();
  const detail = (f.detail ?? '').trim();
  const suggestion = (f.suggestion ?? '').trim();
  if ((f.source ?? '').trim() === 'model') {
    const slug = (modelSlug ?? '').trim();
    const head = '[AI review] ' + [title, detail].filter(Boolean).join(' — ');
    return slug ? `${head} (model ${slug})` : head;
  }
  return [title, detail, suggestion].filter(Boolean).join('\n\n') || 'construction audit finding';
}

// One anchor. `Chip nonForm` and not a `<Button>`, and that is load-bearing rather than styling:
// the construction tab lives inside `<fieldset disabled={frozen}>`, which kills every native
// control under it on a RELEASED card — the exact case where somebody reads the audit and cannot
// change a thing, so the read-only jump has to survive.
function RefChip({
  refString,
  onGo,
  state = 'unknown',
}: {
  refString: string;
  onGo?: (r: string) => void;
  /** §9's resolution for this anchor. `unknown` renders exactly like `ok` — see `anchorState`. */
  state?: AnchorState;
}) {
  const target = refTarget(refString);
  // A NUMBER THAT IS NO LONGER ON THE CARD IS A LABEL, NOT A LINK, and it says so in full. The
  // established spelling on the issues tab is «#N — not found (removed?)»; here the reader has
  // something to do about it, so the sentence ends with it. Checked FIRST: a missing anchor must
  // stop navigating whether or not a handler was passed.
  if (state === 'missing') {
    // Only an `op:` anchor can reach `missing` (see `refState`), but the fallback costs one
    // expression and keeps a future caller from rendering «op #null» at a reader.
    const n = opNumber(refString);
    return (
      <Text size='micro' variant='label' component='span' tracking='label' className='uppercase'>
        {n === null ? refString : `op #${n}`} — not found; re-run the analysis
      </Text>
    );
  }
  if (!target || !onGo) {
    return (
      <Text size='micro' variant='label' component='span' tracking='label' className='uppercase'>
        {refString}
      </Text>
    );
  }
  return (
    <Chip nonForm dashed onClick={() => onGo(refString)} title={`go to ${refString}`}>
      → {refString}
    </Chip>
  );
}

// «FILE AS ISSUE», IN TWO SHAPES, BY THE ONE THING THAT ACTUALLY DIFFERS: where the write lands.
//
// On a LIVE card the gesture writes into the form and is persisted by the ordinary save — a real
// `<button>`, so the surrounding `<fieldset disabled>` can stop it. That fieldset is never disabled
// on a live card, so nothing is lost; what is gained is that the control cannot outlive the rule.
//
// On a RELEASED card there is no save to ride on, and this is precisely where acceptance happens:
// the finding goes to the server directly (`AddTechCardIssue`). A native control there would be
// dead — `disabled` is inherited from the disabled fieldset and no prop of its own undoes it — so
// the frozen shape is a `Chip nonForm` span whose gate is THIS COMPONENT'S OWN `frozen` prop, not
// the fieldset. Freezing writers by prop rather than by fieldset is the established rule here; the
// fieldset stays the guard for form organs, and this one stopped being a form organ.
function FileControl({
  frozen,
  busy,
  onFile,
}: {
  frozen: boolean;
  busy: boolean;
  onFile: () => void;
}) {
  if (frozen) {
    return (
      <Chip
        nonForm
        dashed
        className='shrink-0'
        disabled={busy}
        onClick={onFile}
        title='file this on the issues tab of the released card'
      >
        {busy ? 'filing…' : 'file as issue'}
      </Chip>
    );
  }
  return (
    <Button
      type='button'
      variant='underline'
      size='xs'
      className='shrink-0'
      onClick={() => onFile()}
    >
      file as issue
    </Button>
  );
}

function Finding({
  finding,
  onGo,
  onFile,
  frozen = false,
  filing = false,
  delta,
  dismissed = false,
  onDismiss,
  onRestore,
  resolveOp,
  runFingerprints,
  dirty = false,
}: {
  finding: TechCardAnalysisFinding;
  onGo?: (r: string) => void;
  onFile: (f: TechCardAnalysisFinding) => void;
  /** RELEASED card: filing goes straight to the server instead of into the form. */
  frozen?: boolean;
  /** A direct filing call is in flight — the control says so and refuses a second press. */
  filing?: boolean;
  /** Only ever set on a RE-RUN, and only on the model side. */
  delta?: 'new' | 'still open';
  dismissed?: boolean;
  /** Offered on MODEL findings only: a machine finding disappears when its cause does. */
  onDismiss?: () => void;
  onRestore?: () => void;
  /**
   * §9's anchor resolution — PASSED ON MODEL FINDINGS ONLY, and its absence is what keeps the
   * machine section untouched.
   *
   * A MACHINE FINDING CANNOT BE STALE AGAINST THESE FINGERPRINTS. It is recomputed by the very
   * request that produced the current map — the same `GetTechCardConstructionAudit` response
   * carries both — so its anchors and the map are the same instant by construction. Resolving
   * them would burn cycles to prove `ok` on every row, and the first time the two ever disagreed
   * it would mean the server contradicted itself, which is not a thing to report as amber.
   */
  resolveOp?: (n: number) => AnchorState;
  /** The run's fingerprint snapshot, for the FORM half of the note. Model findings only. */
  runFingerprints?: Record<string, string>;
  /** The form has unsaved changes — gates the form half of the note. */
  dirty?: boolean;
}) {
  const severity = (finding.severity ?? '').trim();
  const category = (finding.category ?? '').trim();
  const confidence = (finding.confidence ?? '').trim();
  const title = (finding.title ?? '').trim();
  const detail = (finding.detail ?? '').trim();
  const suggestion = (finding.suggestion ?? '').trim();
  const evidence = (finding.evidence ?? []).filter((e) => !!e?.trim());
  const refs = (finding.refs ?? []).filter((r) => !!r?.trim());
  // `insert_after` is meaningful on ONE category and reads as noise anywhere else, so it is gated on
  // that category rather than on being non-empty.
  const insertAfter = category === 'missing_step' ? (finding.insertAfter ?? '').trim() : '';

  // Every step this finding points at, the insert point included — it is an `op:` anchor like any
  // other, and a `missing_step` whose neighbour has been deleted is exactly as unmoored as one
  // whose subject has.
  const refState = (r: string): AnchorState => {
    const n = opNumber(r);
    return n !== null && resolveOp ? resolveOp(n) : 'unknown';
  };
  const anchoredOps = resolveOp
    ? [...new Set([...refs, insertAfter].map(opNumber).filter((n): n is number => n !== null))]
    : [];

  // A DISMISSED FINDING IS COLLAPSED, NOT REMOVED. Removing it would make the next re-run's «N
  // dismissed» a claim about something invisible, and the reader could never check what they once
  // waved through. One line, greyed, with the way back on it.
  if (dismissed) {
    return (
      <div className='flex flex-wrap items-center gap-1 border-b border-hairline py-1 last:border-b-0 opacity-60'>
        <Text size='micro' variant='label' component='span' tracking='label' className='uppercase'>
          dismissed
        </Text>
        {severity && (
          <Text size='micro' variant='label' component='span'>
            {severity} ·
          </Text>
        )}
        <Text size='micro' variant='label' component='span'>
          {title || category || 'finding'}
        </Text>
        {onRestore && (
          <Chip nonForm dashed className='ml-auto shrink-0' onClick={onRestore}>
            restore
          </Chip>
        )}
      </div>
    );
  }

  return (
    <div className='border-b border-hairline py-2 last:border-b-0'>
      <ChipRow>
        {severity && (
          <Chip tone={SEVERITY_IS_LOUD.has(severity) ? 'error' : 'default'}>{severity}</Chip>
        )}
        {category && <Chip>{category.replace(/_/g, ' ')}</Chip>}
        {/* Any non-empty confidence is badged, not just the one value this bundle knows a sentence
            for: the machine says "" or "heuristic" today, the model layer says three other things,
            and a confidence silently dropped is a guess presented as a fact. */}
        {confidence && (
          <Chip dashed>{confidence === 'heuristic' ? 'heuristic — may be wrong' : confidence}</Chip>
        )}
        {delta && <Chip dashed>{delta}</Chip>}
      </ChipRow>

      {title && <Text className='mt-1'>{title}</Text>}
      {detail && (
        <Text size='micro' variant='label' className='mt-0.5'>
          {detail}
        </Text>
      )}
      {suggestion && (
        <Text size='micro' className='mt-0.5'>
          → {suggestion}
        </Text>
      )}

      {evidence.length > 0 && (
        <div className='mt-1 space-y-px'>
          {evidence.map((e, i) => (
            <Text key={i} size='micro' variant='label'>
              · {e}
            </Text>
          ))}
        </div>
      )}

      {insertAfter && (
        <div className='mt-1 flex flex-wrap items-center gap-1'>
          <Text size='micro' variant='label' component='span'>
            {insertAfter === 'start' ? 'insert at the start of the sequence' : 'insert after'}
          </Text>
          {insertAfter !== 'start' && (
            <RefChip refString={insertAfter} onGo={onGo} state={refState(insertAfter)} />
          )}
        </div>
      )}

      {/* THE NOTE SITS INSIDE ITS FINDING, above the anchors it is about. Not over the block and
          not over the run: staleness here is a property of one finding (§10). */}
      {resolveOp && anchoredOps.length > 0 && (
        <AnchorStaleNote
          opNumbers={anchoredOps}
          resolveOp={resolveOp}
          runFingerprints={runFingerprints ?? {}}
          dirty={dirty}
        />
      )}

      <div className='mt-1.5 flex flex-wrap items-center gap-1'>
        {refs.map((r) => (
          <RefChip key={r} refString={r} onGo={onGo} state={refState(r)} />
        ))}
        {/* THE TWO ACTIONS ARE ONE GROUP, pushed right together. `ml-auto` on each of them
            separately put «dismiss» in the middle of the row, reading as a third anchor rather than
            as the other half of the pair it belongs to. */}
        <div className='ml-auto flex shrink-0 items-center gap-2'>
          {onDismiss && (
            <Chip
              nonForm
              dashed
              onClick={onDismiss}
              title='hide this finding from later runs of this session'
            >
              dismiss
            </Chip>
          )}
          <FileControl frozen={frozen} busy={filing} onFile={() => onFile(finding)} />
        </div>
      </div>
    </div>
  );
}

// ─── THE MODEL HALF ────────────────────────────────────────────────────────────────────────────

type Grouping = 'severity' | 'route' | 'category';

const GROUPINGS: readonly { value: Grouping; label: string; hint: string }[] = [
  { value: 'severity', label: 'severity', hint: 'blockers first, then errors, then warnings' },
  { value: 'route', label: 'route', hint: 'in the order the garment is assembled' },
  { value: 'category', label: 'category', hint: 'batched by the kind of edit each one needs' },
];

/** One rendered group: a heading (empty for the flat route view) and the findings under it. */
type Group = { key: string; heading: string; items: number[] };

// GROUPING IS A CLIENT-SIDE VIEW OF ONE RUN, never a second ranking of it. Every branch is a
// permutation of the same array — nothing is filtered out by the toggle, so a finding cannot hide
// in a view the reader does not happen to be in.
function groupFindings(findings: TechCardAnalysisFinding[], grouping: Grouping): Group[] {
  const index = findings.map((_, i) => i);
  if (grouping === 'route') {
    // A FLAT, SORTED LIST — not groups of one step. `sort` is stable in every engine this ships
    // to, so two findings on the same step keep the order the server ranked them in.
    const ordered = [...index].sort((a, b) => routeKey(findings[a]) - routeKey(findings[b]));
    return [{ key: 'route', heading: '', items: ordered }];
  }
  const buckets = new Map<string, number[]>();
  for (const i of index) {
    const f = findings[i];
    const key =
      grouping === 'severity' ? modelBucket(f) : (f.category ?? '').trim() || 'uncategorised';
    const at = buckets.get(key);
    if (at) at.push(i);
    else buckets.set(key, [i]);
  }
  const keys =
    grouping === 'severity'
      ? [
          // The known order first, then whatever else arrived — an unfamiliar severity gets a group
          // of its own rather than being folded into a known one.
          ...MODEL_BUCKETS.filter((s) => buckets.has(s)),
          ...[...buckets.keys()].filter((s) => !MODEL_BUCKETS.includes(s)),
        ]
      : // Category has no canonical order and inventing one would be a second ranking; first
        // appearance in the server's own order is the honest tie-break.
        [...buckets.keys()];
  return keys.map((k) => ({
    key: k,
    heading: grouping === 'severity' ? plural(buckets.get(k)!.length, k) : k.replace(/_/g, ' '),
    items: buckets.get(k)!,
  }));
}

// THE STATUS LINE, WORDED PER §12. Three rules are load-bearing and are the reason this is a table
// of sentences rather than a `status.replace('_', ' ')`:
//   · `model_unavailable` NAMES THE SLUG and never says «try again later» — it is a configuration
//     fault, and «later» is a lie that costs a week of nobody looking at the config.
//   · `failed` is the ONLY status that offers a retry: it is genuinely weather.
//   · `invalid_output` must not read as an all-clear — the model was paid and answered nothing
//     usable, which is the opposite of «nothing is wrong with this card».
function statusLine(
  status: string,
  model: string,
): { tone: 'error' | 'warning' | 'note'; text: string } | null {
  const slug = model.trim() || '(no slug on the wire)';
  switch (status) {
    case 'ok':
      return null;
    case 'not_configured':
      return { tone: 'note', text: 'AI review is not available on this deployment.' };
    case 'model_unavailable':
      return {
        tone: 'error',
        text:
          `the provider does not serve «${slug}». This is a configuration fault, not a busy ` +
          `moment — waiting changes nothing. Point OPENROUTER_MODEL_ANALYSIS at a slug this key ` +
          `can reach.`,
      };
    case 'failed':
      return {
        tone: 'warning',
        text: 'the run did not complete — a timeout or a transport fault. This one is weather: retry.',
      };
    // СОСЕД ПО СМЫСЛУ — model_unavailable, А НЕ failed. Рассуждающая модель списывает размышление
    // в тот же бюджет ответа, поэтому потолок, посчитанный под нерассуждающую, кончается ДО
    // первого символа ответа. Следующее нажатие кончится так же и стоит столько же: именно это
    // уехало на прод под словами «this one is weather: retry».
    case 'budget_exhausted':
      return {
        tone: 'error',
        text:
          `«${slug}» spent its entire token budget and returned nothing at all. This is a ` +
          `configuration fault, not a busy moment: retrying costs the same money and ends the ` +
          `same way. A reasoning model bills its thinking to the answer's budget — either the ` +
          `analysis pass must switch thinking off, or the token ceiling must be raised to hold ` +
          `both. Tell an engineer; there is nothing to do on this card.`,
      };
    case 'invalid_output':
      return {
        tone: 'error',
        text:
          `«${slug}» answered something unusable — cut off by the token ceiling, not JSON, or too ` +
          `much of it failed verification to trust the rest. THIS IS NOT AN ALL-CLEAR: the model ` +
          `did not report a clean card, it failed to report at all. There is no auto-retry; ` +
          `paying twice for the same fault without a diagnosis is the same fault twice.`,
      };
    case 'skipped':
      return {
        tone: 'note',
        text: 'this card carries no assembly to analyse — nothing was sent and nothing was spent.',
      };
    default:
      // An ai_status this bundle has never heard of still reaches the screen, verbatim. Silence
      // would be indistinguishable from «ok», which is the one thing it is certainly not.
      return { tone: 'warning', text: `the run came back with an unfamiliar status: «${status}».` };
  }
}

export function ConstructionAudit({
  techCardId,
  active,
  onGoTab,
  frozen = false,
  operationCount,
}: {
  techCardId?: number;
  /**
   * Вкладка сборки открыта ПРЯМО СЕЙЧАС. Не украшение: страница монтирует все вкладки разом, и без
   * этого разбор уходил бы на сервер при открытии ЛЮБОЙ тех-карты — включая те, где на сборку никто
   * не заглянет. Тот же гейт, что у `usePieceShapes(active)` в этом же файле.
   */
  active: boolean;
  /**
   * Навигация внутри карточки — ПРОПОМ, как `onGoTab` у ленты жизненного цикла. Об идентичности
   * вкладок (`TabId`, свёрнутые псевдонимы, что из них вообще есть на этой карточке) знает только
   * `index.tsx`; здесь живёт лишь правило «какой якорь куда ведёт», которое из API прийти не может.
   */
  onGoTab?: (tab: string, extra?: Record<string, string>) => void;
  /**
   * RELEASED card. The one thing it changes here is WHERE a filed finding is written: straight to
   * the server instead of into the form. The predicate is the caller's, and it is the same one that
   * disables the tab's fieldset — a card that is frozen for editing but not here would file issues
   * into a form that can never be saved, and the operator would never learn they vanished.
   */
  frozen?: boolean;
  /** Steps on the SAVED card — for the in-flight line. Missing = say it without a number. */
  operationCount?: number;
}) {
  const { getValues, setValue, formState } = useFormContext<TechCardFormData>();
  const showMessage = useSnackBarStore((st) => st.showMessage);
  const { data, isPending, isError } = useTechCardConstructionAudit(techCardId, active);
  const analyze = useAnalyzeTechCardConstruction();
  const addIssue = useAddTechCardIssue();

  const [grouping, setGrouping] = useState<Grouping>('severity');
  // РАСКРЫТИЕ УПРАВЛЯЕМОЕ РАДИ ОДНОГО: ШАПКА СЧИТАЕТ ТОЛЬКО ПОКА ЗАКРЫТО. Счёт в шапке существует
  // против одной ошибки — свёрнутый блок, прячущий «1 blocker», читается как чистая карточка. Над
  // РАСКРЫТЫМ блоком тот же счёт — просто вторая копия строки, которая и так стоит первой строкой
  // отчёта; две копии одного числа умеют разойтись, одна не умеет.
  const [auditOpen, setAuditOpen] = useState(false);
  // THE LAST RUN LIVES IN sessionStorage, and the component is only its reader. F5 must not burn a
  // run that cost money and forty seconds; nothing here may outlive the session.
  const [stored, setStored] = useState<StoredAnalysis>(() => loadAnalysis(techCardId));
  const loadedFor = useRef(techCardId);
  useEffect(() => {
    if (loadedFor.current === techCardId) return;
    loadedFor.current = techCardId;
    setStored(loadAnalysis(techCardId));
  }, [techCardId]);

  const persist = (next: StoredAnalysis) => {
    setStored(next);
    saveAnalysis(techCardId, next);
  };

  const findings = data?.findings ?? [];
  const notChecked = (data?.notChecked ?? []).filter((n) => !!n?.trim());

  // Counted in a declared order first, then whatever else arrived, in the order it arrived — an
  // unfamiliar severity has to appear in the headline too, or the headline disagrees with the list.
  const counts = new Map<string, number>();
  for (const f of findings) {
    const s = (f.severity ?? '').trim() || 'finding';
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const ordered = [
    ...SEVERITY_ORDER.filter((s) => counts.has(s)),
    ...[...counts.keys()].filter((s) => !SEVERITY_ORDER.includes(s)),
  ];
  const summary = ordered.map((s) => plural(counts.get(s) ?? 0, s)).join(' · ');

  const goRef = (r: string) => {
    const target = refTarget(r);
    if (!target || !onGoTab) return;
    onGoTab(target.tab, target.extra);
  };

  // FILING, BOTH PATHS. `modelSlug` is passed by the AI block and by nothing else — that is what
  // puts the `(model …)` tail on a model finding and keeps it off a machine one.
  const fileAsIssue = (f: TechCardAnalysisFinding, modelSlug?: string) => {
    const description = issueDescription(f, modelSlug);
    const operationNumber = firstOpNumber((f.refs ?? []).filter((r) => !!r?.trim()));
    if (frozen) {
      // A RELEASED CARD HAS NO SAVE TO RIDE ON. Straight to the server, and the card query is
      // invalidated on success so the row appears on the issues tab without a reload.
      if (!techCardId) return;
      addIssue.mutate(
        {
          techCardId,
          operationNumber,
          severity: wireSeverity(issueSeverityOf(f)),
          description,
        },
        {
          onSuccess: () => showMessage('filed on the issues tab', 'success'),
          onError: (e: unknown) =>
            showMessage(
              `could not file the issue: ${e instanceof Error ? e.message : 'unknown error'}`,
              'error',
            ),
        },
      );
      return;
    }
    const issue = {
      operationNumber,
      calloutNumber: 0,
      // Пусто намеренно: заявитель — человек, а не отчёт, и подставленное сюда «audit» сделало бы
      // машинную находку неотличимой от снятой кем-то претензии.
      raisedBy: '',
      severity: issueSeverityOf(f),
      status: DEFAULT_ISSUE_STATUS,
      description,
      resolutionNote: '',
    };
    // `setValue`, НЕ `append` ИЗ ВТОРОГО `useFieldArray`. Два field array на одно имя не вещают
    // мутации друг другу: добавленная отсюда строка была бы невидима собственному массиву вкладки
    // issues до перемонтирования, то есть претензия «подана» и не видна там, где её ищут.
    // Запись через состояние формы видят оба.
    setValue('issues', [...(getValues('issues') ?? []), issue], { shouldDirty: true });
    // Никакой навигации: человек читает отчёт сверху вниз, и уводить его со списка на середине —
    // ровно тот способ подать одну претензию вместо пяти.
    showMessage('filed on the issues tab — save the card to keep it', 'success');
  };

  // ─── the Analyze control ─────────────────────────────────────────────────────────────────────
  const aiUnavailable = data?.aiEnabled === false;
  const inFlight = analyze.isPending;
  const dirty = formState.isDirty;
  const canAnalyze = !!techCardId && !aiUnavailable && !inFlight && !isError;

  const runAnalysis = () => {
    if (!canAnalyze || !techCardId) return;
    analyze.mutate(techCardId, {
      onSuccess: (res: AnalyzeTechCardConstructionResponse) => {
        const got = res.findings ?? [];
        persist({
          v: 1,
          run: {
            findings: got,
            uids: assignUids(got),
            model: (res.model ?? '').trim(),
            aiStatus: (res.aiStatus ?? '').trim(),
            droppedBadRef: res.droppedBadRef ?? 0,
            droppedContradiction: res.droppedContradiction ?? 0,
            notChecked: (res.notChecked ?? []).filter((n): n is string => !!n?.trim()),
            summary: (res.summary ?? '').trim(),
            fingerprints: res.operationFingerprints ?? {},
            at: Date.now(),
          },
          // The uids of the run being replaced — the material the delta is computed from. Read
          // BEFORE the write, or every re-run would compare a run against itself.
          previousUids: stored.run?.uids ?? [],
          dismissed: stored.dismissed,
        });
      },
    });
  };

  const run = stored.run;
  const dismissed = useMemo(() => new Set(stored.dismissed), [stored.dismissed]);
  const previous = useMemo(() => new Set(stored.previousUids), [stored.previousUids]);
  const modelFindings = run?.findings ?? [];
  const groups = useMemo(
    () => (run ? groupFindings(modelFindings, grouping) : []),
    [run, modelFindings, grouping],
  );

  // The pill header — the same four buckets the grouping toggle uses (see `modelBucket`), so the
  // header and the group headings can never disagree. Unknown severities get their own pills after
  // these, same rule as the machine headline: a value this bundle never heard of must still be
  // counted somewhere the reader can see.
  const modelCounts = useMemo(() => {
    const byBucket = new Map<string, number>();
    for (const f of modelFindings) {
      const b = modelBucket(f);
      byBucket.set(b, (byBucket.get(b) ?? 0) + 1);
    }
    const extras = [...byBucket.keys()].filter((s) => !MODEL_BUCKETS.includes(s));
    const pills = [
      // All four ALWAYS, zeros included: «0 blockers» is a result, and a header that shows only
      // what is non-empty cannot be told from a header that forgot a bucket.
      ...MODEL_BUCKETS.map((s) => plural(byBucket.get(s) ?? 0, s)),
      ...extras.map((s) => plural(byBucket.get(s) ?? 0, s)),
    ];
    return pills.join(' · ');
  }, [modelFindings]);

  // The re-run delta. Only ever drawn when there IS a previous run: on a first run every finding is
  // trivially «new», and a wall of «new» badges would say nothing while looking like it did.
  const uids = run?.uids ?? [];
  const delta = useMemo(() => {
    if (!run || previous.size === 0) return null;
    let fresh = 0;
    let still = 0;
    for (const u of uids) {
      if (dismissed.has(u)) continue;
      if (previous.has(u)) still++;
      else fresh++;
    }
    const gone = uids.filter((u) => dismissed.has(u)).length;
    return { fresh, still, gone };
  }, [run, uids, previous, dismissed]);

  // §9'S ANCHOR RESOLUTION, BUILT FROM THE TWO SERVER MAPS AND NOTHING ELSE. The run's snapshot was
  // mirrored into the session when it landed; the CURRENT map arrives with every audit response, and
  // the audit query is keyed under the card detail — so a save invalidates it, the refetch brings a
  // new map, and the amber appears on its own the moment someone changes a step. No polling, no
  // banner, no second source of truth.
  const currentFingerprints = data?.operationFingerprints;
  const runFingerprints = run?.fingerprints;
  const resolveOp = useMemo(() => {
    const atRun = runFingerprints ?? {};
    return (n: number) => anchorState(n, atRun, currentFingerprints);
  }, [runFingerprints, currentFingerprints]);

  const status = run ? statusLine(run.aiStatus, run.model) : null;
  const dropped = (run?.droppedBadRef ?? 0) + (run?.droppedContradiction ?? 0);

  // The model's own «not checked» list, MINUS anything the machine section already said above. The
  // two lists are shown merged in the sense that matters — the reader sees each caveat once — but
  // the machine's stays where its own report is, and only the model's remainder lands here.
  const modelNotChecked = (run?.notChecked ?? []).filter(
    (n) => !notChecked.some((m) => m.trim().toLowerCase() === n.trim().toLowerCase()),
  );

  const analyzeCaption = aiUnavailable
    ? 'AI review is not available on this deployment'
    : dirty
      ? 'unsaved changes are not analyzed — save first'
      : '';

  const analyzeControl = techCardId ? (
    <div className='flex items-center gap-2'>
      {analyzeCaption && (
        <Text size='micro' variant='label' component='span' className='normal-case'>
          {analyzeCaption}
        </Text>
      )}
      {/* A `Chip nonForm`, like the anchors and for the same reason: acceptance happens on a
          RELEASED card, whose fieldset would kill a native button — and this control writes nothing
          to the card. It spends money, which the server's own RBAC and rate limits govern; the
          fieldset is not, and never was, the organ that guards spending. */}
      {/* `onClick` IS PASSED EVEN WHEN DISABLED, and that is not redundancy. `Chip` decides it is
          interactive by whether a handler arrived; hand it `undefined` and it renders an inert
          <span> with no role, no `aria-disabled` and a plain cursor — a control that LOOKS like
          prose rather than like a disabled button, on the one screen whose job is to explain why
          it cannot run. The gate is `disabled`, which Chip honours by dropping the handler itself
          (measured: without this the probe read cursor:auto and no aria-disabled). */}
      <Chip
        nonForm
        dashed
        disabled={!canAnalyze}
        onClick={runAnalysis}
        title={
          aiUnavailable
            ? 'this deployment has no model configured'
            : `runs the model over the SAVED card — about 30–60 s, client budget ${Math.round(ANALYZE_CLIENT_BUDGET_MS / 1000)} s`
        }
      >
        {inFlight ? 'analyzing…' : run ? 're-run (ai)' : 'analyze (ai)'}
      </Chip>
    </div>
  ) : null;

  // ШАПКА СВЁРНУТОГО БЛОКА. Всё, что человек обязан увидеть НЕ ОТКРЫВАЯ: сколько нашла машина,
  // сколько модель, идёт ли прогон прямо сейчас и не отвалился ли отчёт вовсе. Порядок ветвлений
  // тот же, что и у тела, потому что расхождение между шапкой и телом — это два разных отчёта об
  // одном прогоне.
  const headerMeta = !techCardId ? (
    <Text size='micro' variant='label' component='span'>
      not saved
    </Text>
  ) : isError ? (
    // НЕ «0 находок». Упавший запрос и чистая карточка обязаны выглядеть по-разному и в шапке —
    // иначе свёрнутый блок над несостоявшимся отчётом читается как «проверено, всё хорошо».
    <Pill tone='warn'>report did not arrive</Pill>
  ) : isPending ? (
    <Text size='micro' variant='label' component='span'>
      auditing…
    </Text>
  ) : (
    <>
      {findings.length === 0 ? (
        <Text size='micro' variant='label' component='span'>
          machine: clean
        </Text>
      ) : (
        <Pill tone='warn'>{plural(findings.length, 'finding')}</Pill>
      )}
      {inFlight ? (
        <Pill tone='attention'>analyzing…</Pill>
      ) : run ? (
        // ПУСТОЙ ПРОГОН И ПРОВАЛИВШИЙСЯ — ДВЕ РАЗНЫЕ НОВОСТИ, и в шапке тоже. «ai: none» под
        // отказом читается как «модель проверила и ничего не нашла» — ровно та тишина, ради
        // которой счёт в шапке и стоит; тело эту границу уже держит («not an all-clear»), и шапка
        // не имеет права снимать её строкой выше. Любой статус, кроме ok, — не отчёт.
        run.aiStatus !== 'ok' ? (
          <Pill tone='warn'>ai: no report</Pill>
        ) : modelFindings.length === 0 ? (
          <Text size='micro' variant='label' component='span'>
            ai: none
          </Text>
        ) : (
          <Pill tone='warn'>{`ai: ${modelFindings.length}`}</Pill>
        )
      ) : null}
    </>
  );

  return (
    <Accordion
      title={
        <Text size='control' variant='uppercase' tracking='label' component='span'>
          construction audit
        </Text>
      }
      meta={auditOpen ? undefined : headerMeta}
      open={auditOpen}
      onOpenChange={setAuditOpen}
      // ЗАКРЫТ ПРИ ОТКРЫТИИ ВКЛАДКИ — тем же органом и с тем же видом, что и соседний «generate
      // operations from description (ai)». Вкладка CONSTRUCTION несёт под аудитом ещё и сто
      // двадцать шагов маршрута; развёрнутый отчёт, прочитанный час назад, отодвигает вниз всё,
      // ради чего вкладку открыли.
      //
      // РАСКРЫТИЕ НЕУПРАВЛЯЕМОЕ, И ЭТО РЕШЕНИЕ. Кнопка разбора живёт в теле, поэтому свёрнутым
      // блок во время прогона может быть только если человек СВЕРНУЛ ЕГО САМ — а раскрывать его
      // обратно под руками значит спорить с тем, кто только что нажал. Новости он не теряет:
      // шапка показывает «analyzing…», а потом счёт.
    >
      {/* ПОДПИСЬ И ОРГАН ЗАПУСКА ЖИВУТ В ТЕЛЕ, А НЕ В ШАПКЕ. Шапка аккордеона — ОДНА кликабельная
          область: чип, положенный в неё, сворачивал бы блок тем же нажатием, которым тратит
          деньги, и человек видел бы схлопнувшуюся панель вместо начавшегося прогона. Цена решения
          честная и небольшая: чтобы заказать разбор, блок нужно раскрыть. */}
      <div className='mb-2 flex items-start justify-between gap-2'>
        <Text size='micro' variant='label'>
          what the machine checked on the saved card, and what it did not
        </Text>
        {analyzeControl}
      </div>

      {/* НЕСОХРАНЁННАЯ КАРТОЧКА — ОТДЕЛЬНАЯ ВЕТКА, А НЕ ЗАГРУЗКА. Вкладка сборки открыта и на
          `/add-tech-card` (`isTabVisible` не гейтит её на `isEditMode`), а отключённый запрос
          React Query отдаёт `isPending: true` вечно — то есть плашка «идёт разбор» висела бы над
          пустой новой карточкой до конца сеанса, обещая отчёт, который никто не заказывал.
          Аудит читает СОХРАНЁННЫЕ факты, и сказать об этом прямо дешевле, чем изображать работу. */}
      {!techCardId ? (
        <Text size='micro' variant='label'>
          the audit reads the saved card — save this one first, and it will run on every save after
          that.
        </Text>
      ) : /* Ошибка и пустота ОБЯЗАНЫ выглядеть по-разному. Пустой список находок на упавшем запросе
             читается как «всё чисто» — та самая тишина, от которой защищает `not checked`. */
      isError ? (
        <CalloutBox tone='error'>
          <Text size='micro'>
            the construction audit could not be run — this is not a clean card, it is a report that
            did not arrive.
          </Text>
        </CalloutBox>
      ) : isPending ? (
        <Placeholder label='auditing the saved assembly' className='h-8' />
      ) : (
        <div className='flex flex-col gap-2'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            {findings.length === 0
              ? 'no findings — every check this run ran came back clean'
              : summary}
          </Text>

          {/* Порядок сервера — как пришёл. Он ранжирован там, и пересортировка на клиенте развела
              бы два отчёта об одном прогоне. */}
          {/* NO `resolveOp` HERE, AND THAT IS THE POINT. A machine finding is recomputed by the very
              request that produced the current fingerprint map — one response carries both — so it
              cannot be stale against them: its anchors and the map are the same instant. Amber and
              the grey «not found» belong to the MODEL half, whose findings were minted seconds or
              minutes ago against a card that may since have moved. */}
          {findings.length > 0 && (
            <div className='border-t border-hairline'>
              {findings.map((f, i) => (
                <Finding
                  key={i}
                  finding={f}
                  onGo={goRef}
                  onFile={fileAsIssue}
                  frozen={frozen}
                  filing={addIssue.isPending}
                />
              ))}
            </div>
          )}

          {notChecked.length > 0 && (
            <div className='space-y-px'>
              <Text size='micro' variant='label' tracking='label' className='uppercase'>
                not checked this run
              </Text>
              {notChecked.map((n, i) => (
                <Text key={i} size='micro' variant='label'>
                  · {n}
                </Text>
              ))}
            </div>
          )}

          {/* ═══ AI REVIEW — its own block, with its own header, status and footer ═══ */}
          {(inFlight || run || analyze.isError) && (
            <div data-ai-review>
              {/* СКЛАДКА ОДНА, И ОНА СНАРУЖИ. Здесь стоял свой чип «show N findings», пока весь
                  блок был развёрнут по умолчанию; с аккордеоном он стал второй складкой внутри
                  первой — два раскрытия подряд ради одного списка. Осталась группировка. */}
              <GroupLabel
                lead={
                  run && modelFindings.length > 0 ? (
                    <ViewSwitch
                      value={grouping}
                      options={GROUPINGS}
                      onChange={setGrouping}
                      label='group the model findings by'
                    />
                  ) : undefined
                }
              >
                ai review
              </GroupLabel>

              {inFlight && (
                <Placeholder
                  label={
                    operationCount
                      ? `reviewing ${plural(operationCount, 'operation')}… ~30–60 s`
                      : 'reviewing the saved assembly… ~30–60 s'
                  }
                  className='h-8'
                />
              )}

              {/* THE CLIENT'S OWN ABORT IS SAID IN THE FIRST PERSON. Attributing it to the server
                  would be a guess, and the wrong one: at 55 s the server is still working. */}
              {!inFlight && analyze.isError && (
                <CalloutBox tone='error'>
                  <Text size='micro'>
                    {analyze.error instanceof Error &&
                    analyze.error.message === ANALYZE_ABORTED_BY_CLIENT
                      ? `the client stopped waiting after ${Math.round(ANALYZE_CLIENT_BUDGET_MS / 1000)} s. That is THIS SCREEN giving up, not the model failing — the server's own budget is longer, so the run may well have finished after we stopped listening. Press re-run to ask again.`
                      : // NOT «did not reach the server»: the commonest failure here is a REFUSAL
                        // that reached it perfectly — the run is already in flight for this card,
                        // or the hourly ceiling is spent (both arrive as ResourceExhausted with a
                        // sentence worth reading). Naming the transport would send the reader to
                        // debug a network that is fine.
                        `the analyze run did not complete: ${analyze.error instanceof Error ? analyze.error.message : 'unknown error'}`}
                  </Text>
                </CalloutBox>
              )}

              {!inFlight && run && (
                <div className='flex flex-col gap-2'>
                  <Text size='micro' variant='label' tracking='label' className='uppercase'>
                    {modelCounts}
                  </Text>

                  <Text size='micro' variant='label'>
                    {(run.model || 'model not named').trim()} ·{' '}
                    {new Date(run.at).toLocaleString('en-GB')}
                  </Text>

                  {status && (
                    <CalloutBox tone={status.tone}>
                      <Text size='micro'>{status.text}</Text>
                    </CalloutBox>
                  )}

                  {/* THE DROP COUNTERS ARE NOT AN ASIDE. A run that discarded half its findings
                      looks, without this line, exactly like a run that found half as many. */}
                  {dropped > 0 && (
                    <Text size='micro' variant='label'>
                      {plural(dropped, 'finding')} dropped before this list: {run.droppedBadRef}{' '}
                      whose anchors resolved nowhere on this card, {run.droppedContradiction}{' '}
                      contradicting the recomputed facts or repeating a machine finding above.
                    </Text>
                  )}

                  {delta && (
                    <Text size='micro' variant='label' tracking='label' className='uppercase'>
                      re-run: {delta.fresh} new · {delta.still} still open · {delta.gone} dismissed
                    </Text>
                  )}

                  {modelFindings.length === 0 ? (
                    <Text size='micro' variant='label'>
                      {run.aiStatus === 'ok'
                        ? 'the model found nothing to report on this card.'
                        : 'no model findings arrived — read the status above before reading this as clean.'}
                    </Text>
                  ) : (
                    groups.map((g) => (
                      <div key={g.key}>
                        {g.heading && (
                          <Text size='micro' variant='label' tracking='label' className='uppercase'>
                            {g.heading}
                          </Text>
                        )}
                        <div className='border-t border-hairline'>
                          {g.items.map((i) => {
                            const uid = uids[i] ?? String(i);
                            const isDismissed = dismissed.has(uid);
                            return (
                              <Finding
                                key={uid}
                                finding={modelFindings[i]}
                                onGo={goRef}
                                onFile={(f) => fileAsIssue(f, run.model)}
                                frozen={frozen}
                                filing={addIssue.isPending}
                                resolveOp={resolveOp}
                                runFingerprints={run.fingerprints}
                                dirty={dirty}
                                delta={
                                  previous.size === 0 || isDismissed
                                    ? undefined
                                    : previous.has(uid)
                                      ? 'still open'
                                      : 'new'
                                }
                                dismissed={isDismissed}
                                onDismiss={
                                  isDismissed
                                    ? undefined
                                    : () =>
                                        persist({
                                          ...stored,
                                          dismissed: [...new Set([...stored.dismissed, uid])],
                                        })
                                }
                                onRestore={
                                  isDismissed
                                    ? () =>
                                        persist({
                                          ...stored,
                                          dismissed: stored.dismissed.filter((d) => d !== uid),
                                        })
                                    : undefined
                                }
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}

                  {/* A QUIET FOOTER, per §11 — what the model says it did not check, and its own
                      one-paragraph verdict. Quiet because neither is a finding; present because a
                      report that hides what it skipped is the lie this whole panel exists against. */}
                  {(modelNotChecked.length > 0 || run.summary) && (
                    <div className='space-y-px border-t border-hairline pt-1'>
                      {modelNotChecked.length > 0 && (
                        <>
                          <Text size='micro' variant='label' tracking='label' className='uppercase'>
                            the model did not check
                          </Text>
                          {modelNotChecked.map((n, i) => (
                            <Text key={i} size='micro' variant='label'>
                              · {n}
                            </Text>
                          ))}
                        </>
                      )}
                      {run.summary && (
                        <Text size='micro' variant='label' className='pt-1'>
                          {run.summary}
                        </Text>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Accordion>
  );
}
