#!/usr/bin/env node
// CONSTRUCTION AUDIT — a component harness over the REAL `construction-audit.tsx`.
//
// WHAT IT IS. Not a snapshot of markup and not a contract with the server: it mounts the shipped
// component in a browser, with the shipped CSS, and MEASURES what a reader of the CONSTRUCTION tab
// would see and what the controls on it actually do. Wave 1 checked the machine section; wave 2
// adds the model half — the Analyze control, the AI REVIEW block, grouping, finding identity, the
// session mirror, and the two DIFFERENT things «file as issue» does on a live and a released card.
//
// WHAT IT CANNOT DO — SAID FIRST, SO NOTHING HERE IS READ AS MORE THAN IT IS. It holds MARKUP and
// the handlers reachable from markup. A green run does not prove a real user's click lands, does
// not prove the server accepts any of these payloads, and does not prove one line of the wire
// format: the network layer is stubbed on purpose. Everything about the actual backend — that
// `AnalyzeTechCardConstruction` returns this shape, that `AddTechCardIssue` files what we send —
// is verified elsewhere or not at all.
//
// FIVE TRAPS, EVERY ONE OF WHICH PRODUCES A SILENT FALSE GREEN (see the harness note):
//   1. `nodePaths` missing → `ui/…`, `components/…` and react itself do not resolve.
//   2. `plugins: [stub]` declared and not passed → the REAL api layer lands in the bundle, the
//      stand goes to the network, everything 404s, and the measurements «pass» against an error
//      screen. Guarded below by grepping the built bundle for a stub-only marker AND for a string
//      that only the real `api/api.ts` contains; either verdict aborts the run.
//   3. The built admin CSS not loaded → no tailwind class exists and every geometry measurement is
//      a measurement of bare HTML. Guarded by a live check of `--color-error` and of a computed
//      `text-transform: uppercase`.
//   4. `innerText` reads AFTER `text-transform`, and half this admin is uppercase — every text
//      comparison here is case-insensitive and whitespace-normalised.
//   5. `sessionStorage` SURVIVES `page.goto` on the same origin — which is exactly what makes the
//      «F5 must not burn a paid run» case measurable, and exactly what leaks one case's dismissals
//      into the next. Every mount clears it unless the case explicitly asks to keep it.
//
// EVERY CHECK IS SHOWN ABLE TO FAIL. Each `--mutate-…` flag patches the SOURCE IN MEMORY at build
// time (esbuild `onLoad`) — no file on disk is touched — and must redden its own checks and no
// others. A mutation that breaks the build is a false red and proves nothing, so a patch whose
// anchor is not found aborts the run with «did not run» rather than failing a check.

const dieNotRun = (why) => {
  console.log(`\nDID NOT RUN: ${why}`);
  console.log('a green OR a red run in this state would prove nothing.');
  process.exit(2);
};
process.on('uncaughtException', (e) => dieNotRun(e?.stack ?? e?.message ?? String(e)));
process.on('unhandledRejection', (e) => dieNotRun(e?.stack ?? e?.message ?? String(e)));

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const SCRATCH =
  '/private/tmp/claude-501/-Users-jekabolt-go-src-github-com-jekabolt/bedb1cec-7c30-47c5-a5f0-92bb7aea38d0/scratchpad';

// ─── MUTATION FLAGS ────────────────────────────────────────────────────────────────────────────
// An UNKNOWN --mutate flag means NO mutation was applied, and the run would then print a perfectly
// honest «GREEN» that proves nothing about the mutation the caller thought they ran.
const KNOWN_MUTATIONS = new Set([
  '--mutate-mute-detail', // 1
  '--mutate-notchecked-collapsed', // 2
  '--mutate-notchecked-gone', // 2
  '--mutate-known-severity-only', // 3
  '--mutate-piece-tab', // 4
  '--mutate-card-anchored', // 4
  '--mutate-file-navigates', // 5
  '--mutate-file-silent', // 5
  '--mutate-file-as-chip', // 6
  '--mutate-chip-as-button', // 6
  '--mutate-error-as-empty', // 7
  '--mutate-gate-off', // 8
  '--mutate-insert-after-ungated', // 9
  // ── wave 2 ──
  '--mutate-analyze-ignores-ai-flag', // 10
  '--mutate-analyze-blocked-when-dirty', // 10
  '--mutate-analyze-repeatable', // 10
  '--mutate-budget-over-server', // 11
  '--mutate-pills-drop-questions', // 12
  '--mutate-drops-hidden', // 12
  '--mutate-status-try-later', // 13
  '--mutate-invalid-as-clear', // 13
  '--mutate-route-by-refs', // 14
  '--mutate-model-tail-gone', // 15
  '--mutate-machine-gets-tail', // 15
  '--mutate-frozen-filer-native', // 16
  '--mutate-frozen-uses-setvalue', // 16
  '--mutate-frozen-sends-enum', // 16
  '--mutate-abort-blames-everything', // 11
  '--mutate-uid-includes-title', // 17
  '--mutate-session-write-off', // 18
  '--mutate-dismiss-on-machine', // 18
  // ── wave 3: the amber anchor state and the fingerprint port ──
  '--mutate-anchor-ignores-fingerprints', // 19
  '--mutate-missing-anchor-navigates', // 19
  '--mutate-stale-blocks-navigation', // 19
  '--mutate-stale-banner-global', // 19
  '--mutate-fp-sorts-inputs', // 19 + 21
  '--mutate-fp-trims-keys', // 21
  '--mutate-fp-lowercases', // 21
  '--mutate-unsaved-ignores-hash', // 20
  '--mutate-unsaved-note-off', // 20
  '--mutate-absent-map-is-empty', // 19
  // ── wave 4: the ai block opens closed ──
  '--mutate-ai-opens-expanded', // 22
  '--mutate-ai-no-auto-open', // 22
  '--mutate-ai-hides-the-count', // 22
]);
const stray = process.argv.slice(2).find((a) => a.startsWith('--mutate') && !KNOWN_MUTATIONS.has(a));
if (stray) {
  console.error(
    `UNKNOWN MUTATION FLAG: ${stray}\n` +
      `the probe DID NOT RUN — a green run under that flag would have proved nothing.\n` +
      `known: ${[...KNOWN_MUTATIONS].join(', ')}`,
  );
  process.exit(2);
}
const on = (f) => process.argv.includes(f);
// `--shot` writes a full-page PNG of the populated panel into the scratchpad. Not a check and never
// a verdict — geometry the probe measures is asserted, not eyeballed — but a rendered picture is the
// only way to notice that a correct panel is laid out badly.
const SHOT = on('--shot');
const MUTATIONS_ON = [...KNOWN_MUTATIONS].filter(on);

let bad = 0;
let total = 0;
const ck = (ok, what, detail = '') => {
  total++;
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

// ─── SOURCE PATCHES ────────────────────────────────────────────────────────────────────────────
const AUDIT = /construction-audit\.tsx$/;
const QUERY = /useTechCardQuery\.ts$/;
const IDENT = /analysis-identity\.ts$/;
const FPMOD = /analysis-fp\.ts$/;

const DETAIL_FIX = `      {detail && (
        <Text size='micro' variant='label' className='mt-0.5'>
          {detail}
        </Text>
      )}`;
const DETAIL_BROKEN = `      {null}`;

const NOTCHECKED_FIX = `          {notChecked.length > 0 && (
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
          )}`;
const NOTCHECKED_COLLAPSED = `          {notChecked.length > 0 && (
            <details className='space-y-px'>
              <summary className='text-micro uppercase tracking-label'>not checked this run</summary>
              {notChecked.map((n, i) => (
                <Text key={i} size='micro' variant='label'>
                  · {n}
                </Text>
              ))}
            </details>
          )}`;
const NOTCHECKED_GONE = `          {false && notChecked.length > 0 && (
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
          )}`;

const ORDERED_FIX = `  const ordered = [
    ...SEVERITY_ORDER.filter((s) => counts.has(s)),
    ...[...counts.keys()].filter((s) => !SEVERITY_ORDER.includes(s)),
  ];`;
const ORDERED_BROKEN = `  const ordered = SEVERITY_ORDER.filter((s) => counts.has(s));`;

const PIECE_FIX = `    case 'piece':
      return { tab: 'patterns' };`;
const PIECE_BROKEN = `    case 'piece':
      return { tab: 'construction' };`;

const CARD_FIX = `  if (!value) return null;`;
const CARD_BROKEN = `  if (!value) return { tab: 'construction' };`;

const FILE_WRITE_FIX = `    setValue('issues', [...(getValues('issues') ?? []), issue], { shouldDirty: true });`;
const FILE_WRITE_NAVIGATES = `    setValue('issues', [...(getValues('issues') ?? []), issue], { shouldDirty: true });
    onGoTab?.('issues');`;
const FILE_WRITE_SILENT = `    void issue;
    void getValues;
    void setValue;`;

const CHIP_FIX = `  return (
    <Chip nonForm dashed onClick={() => onGo(refString)} title={\`go to \${refString}\`}>
      → {refString}
    </Chip>
  );`;
const CHIP_BROKEN = `  return (
    <Button
      type='button'
      variant='underline'
      size='xs'
      onClick={() => onGo(refString)}
      title={\`go to \${refString}\`}
    >
      → {refString}
    </Button>
  );`;

// The LIVE card's filer. It writes into the form, so it stays a form organ — the mutation turns it
// into a span, which on a live card changes nothing a user could feel and everything about whether
// the rule survives to the next release.
const FILER_FIX = `  return (
    <Button type='button' variant='underline' size='xs' className='shrink-0' onClick={() => onFile()}>
      file as issue
    </Button>
  );`;
const FILER_BROKEN = `  return (
    <Chip nonForm dashed className='shrink-0' onClick={() => onFile()}>
      file as issue
    </Chip>
  );`;

const ERROR_FIX = `        <CalloutBox tone='error'>
          <Text size='micro'>
            the construction audit could not be run — this is not a clean card, it is a report that
            did not arrive.
          </Text>
        </CalloutBox>`;
const ERROR_BROKEN = `        <Text size='micro' variant='label' tracking='label' className='uppercase'>
          no findings — every check this run ran came back clean
        </Text>`;

const GATE_FIX = `    enabled: !!techCardId && active,`;
const GATE_BROKEN = `    enabled: !!techCardId,`;

const INSERT_FIX = `  const insertAfter = category === 'missing_step' ? (finding.insertAfter ?? '').trim() : '';`;
const INSERT_BROKEN = `  const insertAfter = (finding.insertAfter ?? '').trim();`;

// ── wave 2 ─────────────────────────────────────────────────────────────────────────────────────

const CAN_ANALYZE_FIX = `  const canAnalyze = !!techCardId && !aiUnavailable && !inFlight && !isError;`;
const CAN_ANALYZE_IGNORES_FLAG = `  const canAnalyze = !!techCardId && !inFlight && !isError;`;
const CAN_ANALYZE_DIRTY_BLOCKS = `  const canAnalyze = !!techCardId && !aiUnavailable && !inFlight && !isError && !dirty;`;
const CAN_ANALYZE_REPEATABLE = `  const canAnalyze = !!techCardId && !aiUnavailable && !isError;`;

const BUDGET_FIX = `export const ANALYZE_CLIENT_BUDGET_MS = 55_000;`;
const BUDGET_OVER_SERVER = `export const ANALYZE_CLIENT_BUDGET_MS = 90_000;`;

// The pill header drops the `question` bucket — the one bucket that is not a severity, and the one
// a «just map the severities» rewrite would lose.
const PILLS_FIX = `      ...MODEL_BUCKETS.map((s) => plural(byBucket.get(s) ?? 0, s)),`;
const PILLS_BROKEN = `      ...SEVERITY_ORDER.map((s) => plural(byBucket.get(s) ?? 0, s)),`;

const DROPS_FIX = `                  {dropped > 0 && (`;
const DROPS_BROKEN = `                  {false && dropped > 0 && (`;

const UNAVAILABLE_FIX = `        text:
          \`the provider does not serve «\${slug}». This is a configuration fault, not a busy \` +
          \`moment — waiting changes nothing. Point OPENROUTER_MODEL_ANALYSIS at a slug this key \` +
          \`can reach.\`,`;
const UNAVAILABLE_BROKEN = `        text: 'the ai review is temporarily unavailable, please try again later.',`;

const INVALID_FIX = `        text:
          \`«\${slug}» answered something unusable — cut off by the token ceiling, not JSON, or too \` +
          \`much of it failed verification to trust the rest. THIS IS NOT AN ALL-CLEAR: the model \` +
          \`did not report a clean card, it failed to report at all. There is no auto-retry; \` +
          \`paying twice for the same fault without a diagnosis is the same fault twice.\`,`;
const INVALID_BROKEN = `        text: 'the model reported nothing on this card.',`;

const ROUTE_FIX = `  if ((f.category ?? '').trim() === 'missing_step') {`;
const ROUTE_BROKEN = `  if (false && (f.category ?? '').trim() === 'missing_step') {`;

const MODEL_TAIL_FIX = `    return slug ? \`\${head} (model \${slug})\` : head;`;
const MODEL_TAIL_GONE = `    return head;`;

const MACHINE_TAIL_FIX = `  return [title, detail, suggestion].filter(Boolean).join('\\n\\n') || 'construction audit finding';`;
const MACHINE_TAIL_BROKEN = `  return ([title, detail, suggestion].filter(Boolean).join('\\n\\n') || 'construction audit finding') + ' (model sneaky/slug-1)';`;

const FROZEN_FILER_FIX = `    return (
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
    );`;
const FROZEN_FILER_NATIVE = `    return (
      <Button
        type='button'
        variant='underline'
        size='xs'
        className='shrink-0'
        onClick={() => onFile()}
      >
        file as issue
      </Button>
    );`;

// Blames the client's own budget for EVERY failure — including a server refusal that arrived
// instantly and said exactly why.
const ABORT_BRANCH_FIX = `                    {analyze.error instanceof Error &&
                    analyze.error.message === ANALYZE_ABORTED_BY_CLIENT`;
const ABORT_BRANCH_BLAMES_ALL = `                    {analyze.error instanceof Error &&
                    (true || analyze.error.message === ANALYZE_ABORTED_BY_CLIENT)`;

const WIRE_SEVERITY_FIX = `  return ISSUE_SEVERITY_WIRE[formSeverity] ?? 'MEDIUM';`;
const WIRE_SEVERITY_ENUM = `  return formSeverity;`;

const FROZEN_PATH_FIX = `    if (frozen) {
      // A RELEASED CARD HAS NO SAVE TO RIDE ON. Straight to the server, and the card query is
      // invalidated on success so the row appears on the issues tab without a reload.`;
const FROZEN_PATH_BROKEN = `    if (frozen && false) {
      // A RELEASED CARD HAS NO SAVE TO RIDE ON. Straight to the server, and the card query is
      // invalidated on success so the row appears on the issues tab without a reload.`;

const MACHINE_ROW_FIX = `                <Finding
                  key={i}
                  finding={f}
                  onGo={goRef}
                  onFile={fileAsIssue}
                  frozen={frozen}
                  filing={addIssue.isPending}
                />`;
const MACHINE_ROW_DISMISSABLE = `                <Finding
                  key={i}
                  finding={f}
                  onGo={goRef}
                  onFile={fileAsIssue}
                  frozen={frozen}
                  filing={addIssue.isPending}
                  onDismiss={() => undefined}
                />`;

const UID_PLAIN_FIX = `  const plain = findings.map((f) =>
    findingUid((f.category ?? '').trim(), (f.refs ?? []).filter((r): r is string => !!r?.trim())),
  );`;
const UID_PLAIN_TITLED = `  const plain = findings.map((f) =>
    findingUid(
      (f.category ?? '').trim(),
      (f.refs ?? []).filter((r): r is string => !!r?.trim()),
      (f.title ?? '').trim(),
    ),
  );`;

const SESSION_WRITE_FIX = `    s.setItem(KEY(cardId), JSON.stringify(value));`;
const SESSION_WRITE_OFF = `    void s;
    void value;`;

// ── wave 3 ─────────────────────────────────────────────────────────────────────────────────────

// A RESOLVER THAT NEVER RESOLVES. Everything below the patched line becomes unreachable, which is
// the point: `unknown` is the safe fallback, so this is what a bundle looks like when the
// fingerprint comparison is quietly not happening. It must NOT redden the green checks — a blind
// resolver still navigates — and that asymmetry is what proves the green checks alone are blind
// to it and the amber/grey ones are not.
const ANCHOR_STATE_FIX = `  if (!now || Object.keys(now).length === 0) return 'unknown';`;
const ANCHOR_STATE_BLIND = `  return 'unknown';`;

// The grey branch, switched off two different ways: gone entirely (a deleted step navigates again),
// and applied to `changed` as well (the amber anchor stops navigating — the exact over-reaction §9
// rejects, because the reader still wants to look).
const MISSING_BRANCH_FIX = `  if (state === 'missing') {`;
const MISSING_BRANCH_OFF = `  if (state === 'missing' && false) {`;
const MISSING_BRANCH_GREEDY = `  if (state === 'missing' || state === 'changed') {`;

// THE BANNER §10 FORBIDS. The per-finding note is silenced and one sentence is hoisted over the
// whole run instead — same words, same count, one box. Only the CONTAINMENT check can tell the two
// apart, which is why that check exists in the shape it does.
const STALE_NOTE_FIX = `      {resolveOp && anchoredOps.length > 0 && (
        <AnchorStaleNote
          opNumbers={anchoredOps}
          resolveOp={resolveOp}
          runFingerprints={runFingerprints ?? {}}
          dirty={dirty}
        />
      )}`;
const STALE_NOTE_OFF = `      {resolveOp && anchoredOps.length > 0 && false && <AnchorStaleNote
          opNumbers={anchoredOps}
          resolveOp={resolveOp}
          runFingerprints={runFingerprints ?? {}}
          dirty={dirty}
        />}`;
// Якорь берётся ПОСЛЕ гейта раскрытия (`{aiOpen &&`) намеренно: баннер, вставленный ВНУТРЬ
// свёрнутого блока, на закрытом отчёте не отрисуется вовсе, и мутация прошла бы зелёной — сторож у
// кода, которого на экране нет.
const GROUPS_FIX = `                  {aiOpen &&
                    (modelFindings.length === 0 ? (`;
const GROUPS_WITH_BANNER = `                  <div data-stale-note>
                    <CalloutBox tone='warning'>
                      <Text size='micro'>
                        op #200 changed since the run — the anchor still goes there, but that step
                        is no longer the one the model read. Re-run to have it read again.
                      </Text>
                    </CalloutBox>
                  </div>
                  {aiOpen &&
                    (modelFindings.length === 0 ? (`;

// THE FORM HALF, DECIDED BY THE DIRTY FLAG INSTEAD OF BY THE HASH. This is the plausible bug: it
// looks right on a card somebody edited and is a lie on every step they did not touch.
const UNSAVED_HASH_FIX = `        return !!then && !!inForm && then !== inForm;`;
const UNSAVED_HASH_BLIND = `        return !!then && !!inForm;`;
// The other direction: the form half never fires at all. Without this, «swapping two inputs is an
// edit» is only ever reddened by mutations aimed at something else — a check nobody has watched
// fail for its OWN reason is a check nobody has watched fail.
const UNSAVED_HASH_MUTE = `        return false && !!then && !!inForm && then !== inForm;`;

// AN ABSENT MAP READ AS AN EMPTY ONE — the false grey that would hit a lagging backend, where every
// anchor of every finding reads «not found» and nothing whatsoever is wrong.
// ── 22. THE AI BLOCK OPENS CLOSED ──
// Закрыт при монтировании, открывается сам только у прогона, заказанного в этом же взаимодействии,
// и НИКОГДА не прячет счёт: свёрнутый блок, скрывший «1 blocker», читается как чистая карточка.
const AI_OPEN_FIX = `  const [aiOpen, setAiOpen] = useState(false);`;
const AI_OPEN_EXPANDED = `  const [aiOpen, setAiOpen] = useState(true);`;
const AI_AUTO_FIX = `        setAiOpen(true);
        const got = res.findings ?? [];`;
const AI_AUTO_OFF = `        const got = res.findings ?? [];`;
const AI_COUNT_FIX = `                  <Text size='micro' variant='label' tracking='label' className='uppercase'>
                    {modelCounts}
                  </Text>`;
const AI_COUNT_HIDDEN = `                  {aiOpen && (
                    <Text size='micro' variant='label' tracking='label' className='uppercase'>
                      {modelCounts}
                    </Text>
                  )}`;

const ABSENT_MAP_FIX = `  if (!now || Object.keys(now).length === 0) return 'unknown';
  const current = now[String(n)];`;
const ABSENT_MAP_TRUSTED = `  const current = (now ?? {})[String(n)];`;

// ── THE THREE «TIDINESS» NORMALISATIONS §9 NAMES AS FORBIDDEN ──────────────────────────────────
// Each one is a change somebody would make in good faith, each one diverges from Go silently, and
// each one paints false amber on every card of beta. They patch the same line, so they cannot be
// combined — a second patch would not find its anchor and the run would abort rather than lie.
const FP_PAYLOAD_FIX = `  return sha256Hex([FP_PREFIX, outputUnitKey, ...inputKeys].join(SEP)).slice(0, FP_LEN);`;
const FP_PAYLOAD_SORTED = `  return sha256Hex([FP_PREFIX, outputUnitKey, ...[...inputKeys].sort()].join(SEP)).slice(0, FP_LEN);`;
const FP_PAYLOAD_TRIMMED = `  return sha256Hex(
    [FP_PREFIX, outputUnitKey.trim(), ...inputKeys.map((k) => k.trim())].join(SEP),
  ).slice(0, FP_LEN);`;
const FP_PAYLOAD_LOWERED = `  return sha256Hex(
    [FP_PREFIX, outputUnitKey.toLowerCase(), ...inputKeys.map((k) => k.toLowerCase())].join(SEP),
  ).slice(0, FP_LEN);`;

const patcher = (name, filter, pairs, loader) => ({
  name,
  setup(b) {
    b.onLoad({ filter }, async (args) => {
      let src = await readFile(args.path, 'utf8');
      for (const [fixed, broken] of pairs) {
        if (!src.includes(fixed))
          throw new Error(`mutation ${name} did not find its anchor in ${args.path}`);
        src = src.replace(fixed, broken);
      }
      return { contents: src, loader };
    });
  },
});

const mutations = () => {
  const out = [];
  const auditPairs = [];
  const queryPairs = [];
  const identPairs = [];
  const fpPairs = [];
  const add = (flag, bucket, pair) => {
    if (on(flag)) bucket.push(pair);
  };

  add('--mutate-mute-detail', auditPairs, [DETAIL_FIX, DETAIL_BROKEN]);
  add('--mutate-notchecked-collapsed', auditPairs, [NOTCHECKED_FIX, NOTCHECKED_COLLAPSED]);
  add('--mutate-notchecked-gone', auditPairs, [NOTCHECKED_FIX, NOTCHECKED_GONE]);
  add('--mutate-known-severity-only', auditPairs, [ORDERED_FIX, ORDERED_BROKEN]);
  add('--mutate-piece-tab', auditPairs, [PIECE_FIX, PIECE_BROKEN]);
  add('--mutate-card-anchored', auditPairs, [CARD_FIX, CARD_BROKEN]);
  add('--mutate-file-navigates', auditPairs, [FILE_WRITE_FIX, FILE_WRITE_NAVIGATES]);
  add('--mutate-file-silent', auditPairs, [FILE_WRITE_FIX, FILE_WRITE_SILENT]);
  add('--mutate-chip-as-button', auditPairs, [CHIP_FIX, CHIP_BROKEN]);
  add('--mutate-file-as-chip', auditPairs, [FILER_FIX, FILER_BROKEN]);
  add('--mutate-error-as-empty', auditPairs, [ERROR_FIX, ERROR_BROKEN]);
  add('--mutate-insert-after-ungated', auditPairs, [INSERT_FIX, INSERT_BROKEN]);
  add('--mutate-analyze-ignores-ai-flag', auditPairs, [CAN_ANALYZE_FIX, CAN_ANALYZE_IGNORES_FLAG]);
  add('--mutate-analyze-blocked-when-dirty', auditPairs, [CAN_ANALYZE_FIX, CAN_ANALYZE_DIRTY_BLOCKS]);
  add('--mutate-analyze-repeatable', auditPairs, [CAN_ANALYZE_FIX, CAN_ANALYZE_REPEATABLE]);
  add('--mutate-pills-drop-questions', auditPairs, [PILLS_FIX, PILLS_BROKEN]);
  add('--mutate-drops-hidden', auditPairs, [DROPS_FIX, DROPS_BROKEN]);
  add('--mutate-status-try-later', auditPairs, [UNAVAILABLE_FIX, UNAVAILABLE_BROKEN]);
  add('--mutate-invalid-as-clear', auditPairs, [INVALID_FIX, INVALID_BROKEN]);
  add('--mutate-route-by-refs', auditPairs, [ROUTE_FIX, ROUTE_BROKEN]);
  add('--mutate-model-tail-gone', auditPairs, [MODEL_TAIL_FIX, MODEL_TAIL_GONE]);
  add('--mutate-machine-gets-tail', auditPairs, [MACHINE_TAIL_FIX, MACHINE_TAIL_BROKEN]);
  add('--mutate-frozen-filer-native', auditPairs, [FROZEN_FILER_FIX, FROZEN_FILER_NATIVE]);
  add('--mutate-frozen-uses-setvalue', auditPairs, [FROZEN_PATH_FIX, FROZEN_PATH_BROKEN]);
  add('--mutate-frozen-sends-enum', auditPairs, [WIRE_SEVERITY_FIX, WIRE_SEVERITY_ENUM]);
  add('--mutate-abort-blames-everything', auditPairs, [ABORT_BRANCH_FIX, ABORT_BRANCH_BLAMES_ALL]);
  add('--mutate-dismiss-on-machine', auditPairs, [MACHINE_ROW_FIX, MACHINE_ROW_DISMISSABLE]);

  add('--mutate-gate-off', queryPairs, [GATE_FIX, GATE_BROKEN]);
  add('--mutate-budget-over-server', queryPairs, [BUDGET_FIX, BUDGET_OVER_SERVER]);

  add('--mutate-anchor-ignores-fingerprints', auditPairs, [ANCHOR_STATE_FIX, ANCHOR_STATE_BLIND]);
  add('--mutate-missing-anchor-navigates', auditPairs, [MISSING_BRANCH_FIX, MISSING_BRANCH_OFF]);
  add('--mutate-stale-blocks-navigation', auditPairs, [MISSING_BRANCH_FIX, MISSING_BRANCH_GREEDY]);
  add('--mutate-stale-banner-global', auditPairs, [STALE_NOTE_FIX, STALE_NOTE_OFF]);
  add('--mutate-stale-banner-global', auditPairs, [GROUPS_FIX, GROUPS_WITH_BANNER]);
  add('--mutate-unsaved-ignores-hash', auditPairs, [UNSAVED_HASH_FIX, UNSAVED_HASH_BLIND]);
  add('--mutate-unsaved-note-off', auditPairs, [UNSAVED_HASH_FIX, UNSAVED_HASH_MUTE]);
  add('--mutate-absent-map-is-empty', auditPairs, [ABSENT_MAP_FIX, ABSENT_MAP_TRUSTED]);
  add('--mutate-ai-opens-expanded', auditPairs, [AI_OPEN_FIX, AI_OPEN_EXPANDED]);
  add('--mutate-ai-no-auto-open', auditPairs, [AI_AUTO_FIX, AI_AUTO_OFF]);
  add('--mutate-ai-hides-the-count', auditPairs, [AI_COUNT_FIX, AI_COUNT_HIDDEN]);

  add('--mutate-uid-includes-title', identPairs, [UID_PLAIN_FIX, UID_PLAIN_TITLED]);
  add('--mutate-session-write-off', identPairs, [SESSION_WRITE_FIX, SESSION_WRITE_OFF]);

  add('--mutate-fp-sorts-inputs', fpPairs, [FP_PAYLOAD_FIX, FP_PAYLOAD_SORTED]);
  add('--mutate-fp-trims-keys', fpPairs, [FP_PAYLOAD_FIX, FP_PAYLOAD_TRIMMED]);
  add('--mutate-fp-lowercases', fpPairs, [FP_PAYLOAD_FIX, FP_PAYLOAD_LOWERED]);

  if (auditPairs.length) out.push(patcher('audit', AUDIT, auditPairs, 'tsx'));
  if (queryPairs.length) out.push(patcher('query', QUERY, queryPairs, 'ts'));
  if (identPairs.length) out.push(patcher('ident', IDENT, identPairs, 'ts'));
  if (fpPairs.length) out.push(patcher('fp', FPMOD, fpPairs, 'ts'));
  return out;
};

// THE SECOND BUNDLE: the same code with the client budget cut to 250 ms, and nothing else changed.
// It exists for ONE case — the abort. 55 seconds is not a thing a probe can wait for, and mocking
// the timer would test the mock; shrinking the constant tests the real `AbortController` race, the
// real rejection, and the real sentence the panel says about who gave up.
//
// BY REGEX, not by the literal, because `--mutate-budget-over-server` rewrites the same line: an
// exact-match patch would abort the run whenever the two were combined.
const FAST_BUDGET_RE = /ANALYZE_CLIENT_BUDGET_MS = [0-9_]+;/;
const fastBudget = {
  name: 'fast-budget',
  setup(b) {
    b.onLoad({ filter: QUERY }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!FAST_BUDGET_RE.test(src))
        throw new Error('fast-budget did not find ANALYZE_CLIENT_BUDGET_MS');
      return {
        contents: src.replace(FAST_BUDGET_RE, 'ANALYZE_CLIENT_BUDGET_MS = 250;'),
        loader: 'ts',
      };
    });
  },
};

// ─── THE STUBBED NETWORK LAYER ─────────────────────────────────────────────────────────────────
// BY PATH SUFFIX, because `api/api` is reached both as an alias and (from generated code) as a
// relative import, and a relative import cannot be aliased. The marker string below is what the
// bundle is grepped for afterwards: without that grep, forgetting `plugins:` here would leave the
// real client in the bundle and every measurement would be taken against an error screen.
//
// ONE ENTRY PER RPC, and an unconfigured RPC REJECTS LOUDLY rather than hanging: a case that forgot
// to arm `analyze` would otherwise sit in the in-flight state forever and read as «still working».
const STUB_MARKER = 'PROBE_STUB_CONSTRUCTION_AUDIT_NETWORK_LAYER';
const REAL_API_MARKER = 'Grpc-Metadata-Authorization';
const STUB_SOURCE = `
// ${STUB_MARKER}
const serve = (cfg, method, fallback) => {
  if (!cfg) return Promise.reject(new Error('${STUB_MARKER}: no stub armed for ' + method));
  if (cfg.mode === 'error') return Promise.reject(new Error('${STUB_MARKER}: refused ' + method));
  if (cfg.mode === 'hang') return new Promise(() => {});
  return Promise.resolve(cfg.response || fallback || {});
};
const call = (method) => (req) => {
  (globalThis.__auditNetCalls || (globalThis.__auditNetCalls = [])).push(method);
  const stub = globalThis.__auditStub || {};
  if (method === 'GetTechCardConstructionAudit') return serve(stub.audit, method);
  if (method === 'AnalyzeTechCardConstruction') return serve(stub.analyze, method);
  if (method === 'AddTechCardIssue') {
    (globalThis.__auditIssueCalls || (globalThis.__auditIssueCalls = [])).push(req);
    return serve(stub.addIssue, method, { issueId: 777 });
  }
  return Promise.reject(new Error('${STUB_MARKER}: no such call ' + method + ' ' + JSON.stringify(req)));
};
const service = new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? call(k) : undefined) });
export const adminService = service;
export const authService = service;
export const frontendService = service;
export const requestHandler = () => Promise.reject(new Error('${STUB_MARKER}'));
`;
const stub = {
  name: 'stub-network-layer',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({
      path: 'probe-stub-api',
      namespace: 'probe-stub',
    }));
    b.onLoad({ filter: /.*/, namespace: 'probe-stub' }, () => ({
      contents: STUB_SOURCE,
      loader: 'js',
    }));
  },
};

// ─── PLAYWRIGHT ────────────────────────────────────────────────────────────────────────────────
function resolvePlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return req.resolve('playwright');
  } catch {
    /* fall through to the npx cache */
  }
  try {
    const root = `${homedir()}/.npm/_npx`;
    if (!existsSync(root)) return null;
    const found = execFileSync(
      'find',
      [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)[0];
    return found ? `${found}/index.js` : null;
  } catch {
    return null;
  }
}
const pwPath = resolvePlaywright();
if (!pwPath) dieNotRun('playwright not found — there is no live stand, and nothing to prove with');
const pw = await import(pwPath);
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) dieNotRun('playwright found, but without chromium');

// ─── BUILD ─────────────────────────────────────────────────────────────────────────────────────
async function bundleWith(extraPlugins, tag) {
  const outfile = resolve(SCRATCH, `construction-audit-${tag}-${process.pid}.js`);
  await esbuild({
    entryPoints: [resolve(HERE, 'construction-audit-probe-entry.tsx')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    outfile,
    logLevel: 'warning',
    absWorkingDir: REPO,
    // WITHOUT THIS NEITHER `ui/…`/`components/…` NOR REACT ITSELF RESOLVE.
    nodePaths: [resolve(REPO, 'src'), resolve(REPO, 'node_modules')],
    jsx: 'automatic',
    loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
    alias: { '@': resolve(REPO, 'src') },
    // THE STUB IS ACTUALLY PASSED. Declaring it and forgetting this line is the documented trap.
    plugins: [stub, ...extraPlugins],
    define: {
      'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
      'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
      'process.env.NODE_ENV': '"production"',
    },
  });
  const text = readFileSync(outfile, 'utf8');
  rmSync(outfile, { force: true });
  if (!text.includes(STUB_MARKER))
    dieNotRun(`the built bundle carries no «${STUB_MARKER}» — the network layer was NOT stubbed`);
  if (text.includes(REAL_API_MARKER))
    dieNotRun(`the built bundle still carries «${REAL_API_MARKER}» — the real api layer is in it`);
  return text;
}

const bundle = await bundleWith(mutations(), 'main');
const bundleFast = await bundleWith([...mutations(), fastBudget], 'fast');

// THE BUILT ADMIN CSS. Without it no tailwind class exists and every measurement below is a
// measurement of bare html.
const cssName = readdirSync(resolve(REPO, 'dist/assets')).find((f) => /^index-.*\.css$/.test(f));
if (!cssName) dieNotRun('dist/assets/index-*.css is missing — run `yarn build` first');
const CSS = readFileSync(resolve(REPO, 'dist/assets', cssName), 'utf8');

// ─── FIXTURE ───────────────────────────────────────────────────────────────────────────────────
const FINDINGS = [
  {
    source: 'machine',
    category: 'missing_step',
    severity: 'blocker',
    title: 'the side panel is never closed',
    detail: 'SL_INS_L is joined at the shoulder and no later step closes it at the side seam.',
    evidence: ['op:440 joins SL_INS_L at the shoulder', 'no step after 440 names SL_INS_L'],
    refs: ['op:460', 'piece:SL_INS_L'],
    insertAfter: 'op:120',
    suggestion: 'add an overlock step after op:460',
    confidence: '',
  },
  {
    source: 'machine',
    category: 'bom_mismatch',
    severity: 'error',
    title: 'a lining named in a step is not on the bom',
    detail: 'step 480 consumes подкладка, which no bom row provides.',
    evidence: ['op:480 → bom key «подкладка»'],
    refs: ['bom:подкладка', 'card'],
    insertAfter: '',
    suggestion: 'add the lining row to the bom, or drop it from the step',
    confidence: 'heuristic',
  },
  {
    source: 'machine',
    category: 'sequence',
    severity: 'warning',
    title: 'the base unit is assembled twice',
    detail: 'two steps declare unit base as their output.',
    evidence: ['op:200 outputs base', 'op:520 outputs base'],
    refs: ['unit:base'],
    // insert_after is meaningful on ONE category. On this one it must NOT reach the screen.
    insertAfter: 'op:999',
    suggestion: 'name the second output something else',
    confidence: 'likely',
  },
  {
    // A SEVERITY AND A CATEGORY THIS BUNDLE HAS NEVER HEARD OF. Both must reach the screen, and the
    // severity must be counted in the headline — an unknown value silently dropped is exactly the
    // failure protojson enums were avoided for.
    source: 'machine',
    category: 'thermodynamics',
    severity: 'catastrophe',
    title: 'the press would melt the shell',
    detail: 'the shell is 100% polyamide and step 610 presses it at 200°C.',
    evidence: ['op:610 presses at 200°C'],
    refs: ['mystery:7'],
    insertAfter: '',
    suggestion: 'drop the press temperature to 110°C',
    confidence: 'needs_owner',
  },
];
const NOT_CHECKED = [
  'seam allowances — no pattern is attached to this card',
  'thread consumption — the bom carries no thread rows',
  'the model layer did not run on this card',
];

// THE MODEL RUN. Server order is deliberately NOT route order and NOT severity order — otherwise
// the grouping toggle would be unfalsifiable: every view would look the same.
const MODEL_SLUG = 'anthropic/claude-probe-1';
const M_QUESTION = {
  source: 'model',
  category: 'question',
  severity: 'warning',
  title: 'is the hem meant to be blind-stitched?',
  detail: 'the hem step names no stitch class and the standards block is silent on hems.',
  evidence: ['op:100 «подшить низ»'],
  refs: ['op:100'],
  insertAfter: '',
  suggestion: 'ask the owner, then write the stitch class into the step',
  confidence: 'needs_owner',
};
const M_MISSING = {
  source: 'model',
  category: 'missing_step',
  severity: 'blocker',
  title: 'nothing closes the underarm',
  detail: 'the sleeve is set in and no later step joins the underarm seam.',
  evidence: ['op:300 sets the sleeve'],
  refs: ['op:300'],
  insertAfter: 'op:120',
  suggestion: 'add an underarm closing step',
  confidence: 'certain',
};
const M_METHOD = {
  source: 'model',
  category: 'method',
  severity: 'error',
  title: 'the collar is topstitched before it is turned',
  detail: 'topstitching at op:200 precedes the turning step, which cannot be done afterwards.',
  evidence: ['op:200 topstitch', 'op:210 turn'],
  refs: ['op:200'],
  insertAfter: '',
  suggestion: 'swap the two steps',
  confidence: 'likely',
};
// SERVER ORDER IS DELIBERATELY NONE OF THE THREE VIEWS. If it matched any of them, a toggle that
// did nothing at all would still pass that view's check.
//   severity → MISSING(blocker), METHOD(error), QUESTION(question)
//   route    → QUESTION(op:100), MISSING(insert after op:120), METHOD(op:200)
//   category → METHOD, QUESTION, MISSING (first appearance in this array)
const MODEL_FINDINGS = [M_METHOD, M_QUESTION, M_MISSING];

// THE RE-RUN. The same two defects, REPHRASED — which is exactly what a model does between runs and
// exactly what the uid must survive — plus one genuinely new finding.
const MODEL_FINDINGS_RERUN = [
  { ...M_MISSING, title: 'the underarm seam is left open' },
  { ...M_METHOD, title: 'collar topstitching happens too early' },
  {
    source: 'model',
    category: 'parameter',
    severity: 'warning',
    title: 'the seam allowance at the hem is not stated',
    detail: 'no allowance is given for the hem, and the card standard does not cover it.',
    evidence: [],
    refs: ['op:520'],
    insertAfter: '',
    suggestion: 'state the hem allowance',
    confidence: 'likely',
  },
];

// ─── THE TWO FINGERPRINT MAPS §9 RESOLVES ANCHORS WITH ─────────────────────────────────────────
//
// Every anchor of the model run: op:100 (question), op:200 (method), op:300 (missing_step, whose
// insert point is op:120). Keys are given unquoted on purpose — a JS object literal turns them into
// the same STRING keys protojson puts on the wire for a `map<int32, string>`, which is the shape the
// component has to cope with.
//
// THE DEFAULT PAIR AGREES ON EVERY NUMBER. That is not laziness: it means every case that is not
// about staleness renders exactly as it did before this wave, and the ordinary mount IS the
// «a matching fingerprint stays green» measurement rather than a separate fixture that could drift.
const FP_AT_RUN = { 100: 'aaaa1111', 120: 'eeee0000', 200: 'bbbb2222', 300: 'cccc3333' };
// The same card AFTER somebody saved: 100 and 120 untouched, 200 edited, 300 deleted outright.
const FP_NOW_MOVED = { 100: 'aaaa1111', 120: 'eeee0000', 200: 'dddd9999' };

const analyzeRun = (over = {}) => ({
  findings: MODEL_FINDINGS,
  aiStatus: 'ok',
  model: MODEL_SLUG,
  droppedBadRef: 0,
  droppedContradiction: 0,
  notChecked: [],
  summary: '',
  operationFingerprints: FP_AT_RUN,
  ...over,
});

const auditOk = (over = {}) => ({
  mode: 'ok',
  response: {
    findings: FINDINGS,
    notChecked: NOT_CHECKED,
    aiEnabled: false,
    operationFingerprints: FP_AT_RUN,
    ...over,
  },
});

const OK = { audit: auditOk() };
const EMPTY = { audit: auditOk({ findings: [] }) };
const BROKEN = { audit: { mode: 'error' } };
const AI_ON = (analyze = { mode: 'ok', response: analyzeRun() }) => ({
  audit: auditOk({ aiEnabled: true }),
  analyze,
  addIssue: { mode: 'ok' },
});

// ─── BROWSER ───────────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 2400 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
// EVERYTHING ELSE IS CUT OFF. If the stub ever failed to take, the request would not quietly 404 —
// it would abort, the query would error, and the measurements below would go red rather than pass
// against an error screen.
await page.route('**/*', (route) => {
  const url = route.request().url();
  if (url === 'http://probe.local/')
    return route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><meta charset="utf-8"><style>${CSS}</style><body class="bg-pageBg"><div id="root"></div>`,
    });
  if (url.startsWith('http://probe.local/')) return route.fulfill({ status: 200, body: '' });
  return route.abort();
});

let clicks = 0;
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

// `techCardId: null` = the UNSAVED card. Not `undefined`: a js default parameter swallows that and
// the case would silently run on id 42 — which is exactly how this probe first reported a red.
async function mount({
  stub: s,
  techCardId = 42,
  active = true,
  frozen = false,
  noGoTab = false,
  dirty = false,
  operationCount = 48,
  keepSession = false,
  fast = false,
  operations = undefined,
}) {
  await page.goto('http://probe.local/');
  // sessionStorage OUTLIVES `goto` — that is the mechanism the F5 case measures, and the leak
  // every other case has to be protected from.
  if (!keepSession) await page.evaluate(() => sessionStorage.clear());
  await page.addScriptTag({ content: fast ? bundleFast : bundle });
  await page.evaluate(
    ([st, o]) => {
      window.__auditStub = st;
      window.__audit.mount(o);
    },
    [
      s,
      { techCardId: techCardId ?? undefined, active, frozen, noGoTab, dirty, operationCount, operations },
    ],
  );
  await page.waitForSelector('[data-probe-panel]', { timeout: 15000 });
  await page.waitForTimeout(350);
  await inject();
}

const panelText = () =>
  page.evaluate(() => norm2(document.querySelector('[data-probe-panel]')?.innerText || ''));

// Helpers injected into the page once per mount (innerText is read AFTER text-transform, so every
// comparison here is lowercased).
const INJECT = `
window.norm2 = (s) => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
window.leaves = (root) => [...(root || document).querySelectorAll('span,button,a,p,div,summary')]
  .filter((n) => n.children.length === 0);
window.findLeaf = (want) => {
  const root = document.querySelector('[data-probe-panel]');
  if (!root) return [];
  return window.leaves(root).filter((n) => window.norm2(n.textContent).replace(/^→\\s*/, '') === want);
};
window.aiText = () => window.norm2(document.querySelector('[data-ai-review]')?.innerText || '');
`;
const inject = () => page.evaluate(INJECT);

/** One anchor, by its label: is it there, is it a control, does it carry a live handler. */
const anchor = (label) =>
  page.evaluate((lab) => {
    document.querySelectorAll('[data-probe-hit]').forEach((n) => n.removeAttribute('data-probe-hit'));
    const hits = window.findLeaf(lab);
    if (hits.length !== 1) return { n: hits.length };
    const el = hits[0];
    el.setAttribute('data-probe-hit', '');
    const r = el.getBoundingClientRect();
    return {
      n: 1,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      tabindex: el.getAttribute('tabindex'),
      // A native control under a disabled fieldset matches :disabled however its own props read.
      disabled: el.matches(':disabled'),
      ariaDisabled: el.getAttribute('aria-disabled') || '',
      cursor: getComputedStyle(el).cursor,
      visible: r.width > 0 && r.height > 0,
    };
  }, label);

/** Mark the nth leaf carrying this label, so `clickHit` can press it. */
const pick = (label, index = 0) =>
  page.evaluate(
    ([lab, i]) => {
      document
        .querySelectorAll('[data-probe-hit]')
        .forEach((n) => n.removeAttribute('data-probe-hit'));
      const el = window.findLeaf(lab)[i];
      if (!el) return false;
      el.setAttribute('data-probe-hit', '');
      return true;
    },
    [label, index],
  );

const clickHit = async () => {
  clicks++;
  await page.locator('[data-probe-hit]').click({ force: true });
  await page.waitForTimeout(150);
};

/**
 * OPEN THE AI BLOCK. Its body renders CLOSED on mount — a run restored from the session must not
 * shove a hundred-and-twenty-step route off the screen — so every case that reads the body has to
 * open it first. A run finished in THIS interaction opens itself, which is why the analyze cases
 * need no call here.
 *
 * IT ASSERTS THE PRESS TOOK. A silent no-op would leave every caller measuring an empty block and
 * reporting «the finding is not on screen» about a component that is working — the same shape as
 * the in-flight mutation that first passed green because its label had changed underneath.
 */
const ensureAiOpen = async () => {
  const picked = await page.evaluate(() => {
    document.querySelectorAll('[data-probe-hit]').forEach((n) => n.removeAttribute('data-probe-hit'));
    const root = document.querySelector('[data-probe-panel]');
    if (!root) return false;
    const el = window.leaves(root).find((n) => /^show \d+ finding/.test(window.norm2(n.textContent)));
    if (!el) return false;
    el.setAttribute('data-probe-hit', '');
    return true;
  });
  if (picked) await clickHit();
};

const openAiReview = async () => {
  const picked = await page.evaluate(() => {
    document.querySelectorAll('[data-probe-hit]').forEach((n) => n.removeAttribute('data-probe-hit'));
    const root = document.querySelector('[data-probe-panel]');
    if (!root) return false;
    const el = window.leaves(root).find((n) => /^show \d+ finding/.test(window.norm2(n.textContent)));
    if (!el) return false;
    el.setAttribute('data-probe-hit', '');
    return true;
  });
  ck(picked, 'THE STAND: the ai block offered its «show N findings» control');
  if (picked) await clickHit();
};

const gone = () => page.evaluate(() => window.__audit.gone());
const issues = () => page.evaluate(() => window.__audit.issues());
const alerts = () => page.evaluate(() => window.__audit.alerts());
const netCalls = () => page.evaluate(() => window.__auditNetCalls || []);
const issueCalls = () => page.evaluate(() => window.__auditIssueCalls || []);
const aiText = () => page.evaluate(() => window.aiText());

// EVERY LABEL THE ONE CONTROL WEARS. Pressing it by «analyze (ai)» alone is a FALSE GREEN on the
// repeat-press check, measured: in flight the label becomes «analyzing…», so a probe that looks for
// the idle label simply finds nothing, clicks nothing, and reports «no second call left» about a
// press that never happened. `--mutate-analyze-repeatable` passed green until this was fixed.
const ANALYZE_LABELS = ['analyze (ai)', 're-run (ai)', 'analyzing…'];

async function pickAnalyze() {
  for (const label of ANALYZE_LABELS) if (await pick(label)) return label;
  return null;
}

/** Press whichever label the control is wearing, and wait for the run to land. */
async function pressAnalyze() {
  const label = await pickAnalyze();
  if (!label) return false;
  await clickHit();
  await page.waitForTimeout(250);
  await inject();
  return true;
}

console.log(
  `construction-audit probe — real component, built admin CSS, stubbed network layer` +
    (MUTATIONS_ON.length ? `\nMUTATIONS: ${MUTATIONS_ON.join(' ')}` : '\nMUTATIONS: none (baseline)'),
);

// ═══ CASE A: a run with findings ═══════════════════════════════════════════════════════════════
await mount({ stub: OK });
await inject();

// PRECONDITION: the stand is actually a stand. Without the built CSS every geometry check below is
// a check of bare html, and without the stub every text check is a check of an error screen.
head('0. the stand itself');
const pre = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const up = window
    .leaves(document.querySelector('[data-probe-panel]'))
    .some((n) => getComputedStyle(n).textTransform === 'uppercase' && n.textContent.trim());
  return { errorToken: cs.getPropertyValue('--color-error').trim(), uppercase: up };
});
if (!pre.errorToken || !pre.uppercase)
  dieNotRun(
    `the built admin CSS is not live (--color-error=«${pre.errorToken}», uppercase=${pre.uppercase})`,
  );
ck(true, 'built admin css is live', `--color-error=${pre.errorToken}`);
const calls = await netCalls();
ck(
  calls.length === 1 && calls[0] === 'GetTechCardConstructionAudit',
  'exactly one call left the component, and it was the audit',
  JSON.stringify(calls),
);
ck(pageErrors.length === 0, 'no page errors', pageErrors.join(' | '));

// ═══ 1. every finding reaches the screen ═══════════════════════════════════════════════════════
head('1. every finding reaches the screen — title, detail, suggestion, evidence');
const textA = await panelText();
for (const f of FINDINGS) {
  const miss = [];
  if (!textA.includes(norm(f.title))) miss.push('title');
  if (!textA.includes(norm(f.detail))) miss.push('detail');
  if (!textA.includes(norm(f.suggestion))) miss.push('suggestion');
  for (const e of f.evidence) if (!textA.includes(norm(e))) miss.push(`evidence «${e}»`);
  if (!textA.includes(norm(f.severity))) miss.push('severity badge');
  if (!textA.includes(norm(f.category.replace(/_/g, ' ')))) miss.push('category badge');
  ck(miss.length === 0, `«${f.title}» is on screen whole`, miss.join(', '));
}
ck(
  textA.includes('heuristic — may be wrong') && textA.includes('needs_owner'),
  'confidence is badged for the value the bundle knows AND for one it does not',
);

// ═══ 2. not checked, visible, without a click ══════════════════════════════════════════════════
head('2. «not checked this run» is visible WITHOUT any click');
ck(clicks === 0, 'nothing has been clicked yet on this mount', `clicks=${clicks}`);
const nc = await page.evaluate((lines) => {
  const root = document.querySelector('[data-probe-panel]');
  return lines.map((ln) => {
    const want = window.norm2('· ' + ln);
    const hits = window.leaves(root).filter((n) => window.norm2(n.textContent) === want);
    if (!hits.length) return { line: ln, present: false, visible: false };
    const el = hits[0];
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // GEOMETRY ALONE IS A FALSE GREEN HERE, MEASURED: a line inside a CLOSED <details> still
    // reports a full-width 18px box, `display: block`, `visibility: visible` and a live
    // `offsetParent` in current Chrome. Only `checkVisibility()` and `innerText` (which is the
    // RENDERED text, so it is empty for a skipped subtree) tell it from a line a reader can see.
    const cv = el.checkVisibility({
      contentVisibilityAuto: true,
      opacityProperty: true,
      visibilityProperty: true,
    });
    const rendered = window.norm2(el.innerText).length > 0;
    return {
      line: ln,
      present: true,
      visible:
        r.height > 0 && r.width > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cv && rendered,
      h: Math.round(r.height),
      cv,
      rendered,
      collapsed: !!el.closest('details:not([open])'),
    };
  });
}, NOT_CHECKED);
for (const r of nc)
  ck(
    r.present && r.visible,
    `«${r.line.slice(0, 42)}…» is drawn and visible`,
    r.present
      ? `visible=${r.visible} h=${r.h ?? 0} checkVisibility=${r.cv} renderedText=${r.rendered}` +
        (r.collapsed ? ' INSIDE A CLOSED <details>' : '')
      : 'not in the dom at all',
  );
const textNC = await panelText();
ck(
  NOT_CHECKED.every((l) => textNC.includes(norm(l))),
  'every not-checked line is in the panel’s RENDERED text (innerText, not textContent)',
);
ck(textNC.includes('not checked this run'), 'the «not checked this run» heading is on screen');

// ═══ 3. the headline agrees with the list ══════════════════════════════════════════════════════
head('3. the headline count agrees with what is drawn (unknown severity included)');
const lines = await page.evaluate(() =>
  (document.querySelector('[data-probe-panel]')?.innerText || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean),
);
const headline = lines.map((l) => l.toLowerCase()).find((l) => /^\d+\s+\S+(\s*·\s*\d+\s+\S+)*$/.test(l)) || '';
const parsed = [...headline.matchAll(/(\d+)\s+([^\s·]+)/g)].map(([, n, w]) => [w, Number(n)]);
const sum = parsed.reduce((a, [, n]) => a + n, 0);
const drawn = await page.evaluate(() => window.findLeaf('file as issue').length);
ck(!!headline, 'a headline count line is on screen', headline || '(none found)');
ck(sum === FINDINGS.length, `the headline adds up to ${FINDINGS.length}`, `${headline} → ${sum}`);
ck(drawn === FINDINGS.length, `${FINDINGS.length} findings are actually drawn`, `drawn=${drawn}`);
ck(
  parsed.some(([w, n]) => w.startsWith('catastrophe') && n === 1),
  'the severity this bundle never heard of is COUNTED in the headline',
  headline,
);
ck(
  (await page.evaluate(() => window.findLeaf('catastrophe').length)) === 1,
  'the unknown severity is DRAWN as its own badge',
);
ck(
  (await panelText()).includes('thermodynamics'),
  'the category this bundle never heard of reaches the screen',
);

// ═══ 9. insert_after is gated on its one category ══════════════════════════════════════════════
head('9. insert_after is gated on missing_step, not on being non-empty');
const tA = await panelText();
ck(tA.includes('insert after') && tA.includes('op:120'), 'it is shown on the missing_step finding');
ck(!tA.includes('op:999'), 'it is NOT shown on the sequence finding', 'op:999 leaked onto the screen');

// ═══ 4. anchors ════════════════════════════════════════════════════════════════════════════════
head('4. clicking a ref anchor calls onGoTab with the right (tab, extra)');
const CASES = [
  ['op:460', 'construction', { op: '460' }],
  ['unit:base', 'construction', { unit: 'base' }],
  ['piece:sl_ins_l', 'patterns', undefined],
  ['bom:подкладка', 'bom', undefined],
];
for (const [label, tab, extra] of CASES) {
  const a = await anchor(label);
  if (a.n !== 1) {
    ck(false, `«${label}» is exactly one anchor on screen`, `found ${a.n}`);
    continue;
  }
  const before = (await gone()).length;
  await clickHit();
  const after = await gone();
  const last = after[after.length - 1];
  ck(
    after.length === before + 1 &&
      last[0] === tab &&
      JSON.stringify(last[1] ?? null) === JSON.stringify(extra ?? null),
    `«${label}» → onGoTab(${tab}, ${JSON.stringify(extra ?? null)})`,
    JSON.stringify(last ?? null),
  );
}
{
  const a = await anchor('card');
  ck(a.n === 1, '«card» is on screen', `found ${a.n}`);
  ck(
    a.n === 1 && a.tag === 'span' && a.role !== 'button' && a.tabindex === null,
    '«card» is PLAIN TEXT — no role, no tab stop, no handler',
    JSON.stringify(a),
  );
  const before = (await gone()).length;
  if (a.n === 1) await clickHit();
  ck((await gone()).length === before, 'clicking «card» navigates nowhere');
}
{
  const a = await anchor('mystery:7');
  ck(
    a.n === 1 && a.tag === 'span' && a.role !== 'button',
    'an anchor KIND this bundle never heard of also degrades to plain text',
    JSON.stringify(a),
  );
}

// ═══ 5. file as issue ══════════════════════════════════════════════════════════════════════════
head('5. «file as issue» writes into the form and does NOT navigate');
await mount({ stub: OK });
await inject();
{
  const before = await issues();
  const a = await anchor('file as issue');
  ck(a.n === 1 || a.n > 1, 'the filer is on screen', `found ${a.n}`);
  // The FIRST finding's filer: refs op:460 → operationNumber 460.
  await pick('file as issue', 0);
  await clickHit();
  const after = await issues();
  const added = after[after.length - 1];
  ck(after.length === before.length + 1, 'exactly one issue was appended', `${before.length} → ${after.length}`);
  ck(added?.operationNumber === 460, 'operationNumber came from the first op: anchor', String(added?.operationNumber));
  ck(added?.raisedBy === '', 'raisedBy is left empty — the reporter is a human, not a report');
  // §11: blocker/error → HIGH, warning → MEDIUM, question → LOW. FINDINGS[0] is a BLOCKER, so
  // filing it MEDIUM — which is what the shared default used to do to every finding alike — would
  // put the loudest thing the audit found on the issues tab looking like a note about a typo.
  ck(
    added?.severity === 'TECH_CARD_ISSUE_SEVERITY_HIGH' &&
      added?.status === 'TECH_CARD_ISSUE_STATUS_OPEN',
    'a BLOCKER files at HIGH, and the status is OPEN',
    `${added?.severity} / ${added?.status}`,
  );
  const d = norm(String(added?.description ?? ''));
  ck(
    d.includes(norm(FINDINGS[0].title)) &&
      d.includes(norm(FINDINGS[0].detail)) &&
      d.includes(norm(FINDINGS[0].suggestion)),
    'the description carries title + detail + suggestion',
  );

  // THE OTHER TWO ARMS OF THE §11 MAP. One arm on its own passes against a function that returns
  // HIGH for everything — which is the same failure as the constant it replaced, only louder. So
  // every visible machine filer is pressed and each appended row is matched back to the finding it
  // came from BY ITS TITLE, not by position: the list is grouped, and an index would be measuring
  // the fixture's order rather than the mapping.
  {
    const expect = { blocker: 'HIGH', error: 'HIGH', warning: 'MEDIUM', question: 'LOW' };
    const filers = await anchor('file as issue');
    const beforeAll = await issues();
    for (let i = 0; i < filers.n; i++) {
      await pick('file as issue', i);
      await clickHit();
    }
    const afterAll = await issues();
    const fresh = afterAll.slice(beforeAll.length);
    let matched = 0;
    let wrong = [];
    for (const row of fresh) {
      const text = norm(String(row?.description ?? ''));
      const f = FINDINGS.find((x) => text.includes(norm(x.title)));
      if (!f) continue;
      const bucket = (f.category ?? '').trim() === 'question' ? 'question' : (f.severity ?? '').trim();
      const want = expect[bucket];
      // An unfamiliar severity has no arm and legitimately falls back — skip it rather than
      // asserting a value the map was never asked to produce.
      if (!want) continue;
      matched++;
      if (row?.severity !== `TECH_CARD_ISSUE_SEVERITY_${want}`) {
        wrong.push(`${f.severity}/${f.category} → ${row?.severity}, want ${want}`);
      }
    }
    ck(matched >= 3, 'at least three findings of different severities were filed', `matched ${matched}`);
    ck(wrong.length === 0, 'every filed issue took the severity §11 gives its finding', wrong.join('; '));
    const gotMedium = fresh.some((r) => r?.severity === 'TECH_CARD_ISSUE_SEVERITY_MEDIUM');
    const gotHigh = fresh.some((r) => r?.severity === 'TECH_CARD_ISSUE_SEVERITY_HIGH');
    ck(gotHigh && gotMedium, 'the map produced MORE THAN ONE level — a constant would produce one',
      `high=${gotHigh} medium=${gotMedium}`);
  }
  ck(
    !d.includes('(model'),
    'a MACHINE finding carries no «(model …)» tail — it was produced by code in this repo',
    d.slice(-60),
  );
  ck((await gone()).length === 0, 'filing did NOT navigate', JSON.stringify(await gone()));
  ck((await alerts()).some((m) => /filed on the issues tab/i.test(m)), 'the operator was told');
  const filer = await anchor('file as issue');
  ck(
    filer.n >= 1 &&
      (await page.evaluate(() => window.findLeaf('file as issue')[0].tagName.toLowerCase())) ===
        'button',
    'on a LIVE card the filer is a native <button> — it writes into the form, so the fieldset owns it',
  );
}

// ═══ 6. under <fieldset disabled> — anchors live, filing goes to the server ════════════════════
head('6. RELEASED card: the anchor still navigates, and «file as issue» files DIRECTLY');
await mount({ stub: AI_ON(), frozen: true });
await inject();
{
  const chip = await anchor('op:460');
  ck(chip.n === 1, 'the anchor is still on screen on a released card', `found ${chip.n}`);
  ck(chip.n === 1 && !chip.disabled, 'the anchor is not a native control, so the fieldset cannot kill it', JSON.stringify(chip));
  const beforeGo = (await gone()).length;
  if (chip.n === 1) await clickHit();
  ck((await gone()).length === beforeGo + 1, 'THE ANCHOR STILL NAVIGATES under a disabled fieldset', JSON.stringify(await gone()));

  const filer = await page.evaluate(() => {
    document.querySelectorAll('[data-probe-hit]').forEach((n) => n.removeAttribute('data-probe-hit'));
    const el = window.findLeaf('file as issue')[0];
    if (!el) return { n: 0 };
    el.setAttribute('data-probe-hit', '');
    return {
      n: 1,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      disabled: el.matches(':disabled'),
    };
  });
  ck(filer.n === 1, 'the filer is still on screen', JSON.stringify(filer));
  ck(
    filer.disabled === false && filer.tag !== 'button',
    'ON A FROZEN CARD THE FILER IS ALIVE — it is not a form organ, so the fieldset cannot kill it',
    JSON.stringify(filer),
  );
  const beforeIssues = (await issues()).length;
  if (filer.n === 1) await clickHit();
  await page.waitForTimeout(200);
  const filed = await issueCalls();
  ck(
    filed.length === 1 && filed[0]?.techCardId === 42,
    'clicking it called AddTechCardIssue on the server',
    JSON.stringify(filed),
  );
  ck(
    filed[0]?.operationNumber === 460 &&
      norm(String(filed[0]?.description ?? '')).includes(norm(FINDINGS[0].title)),
    'with the same operation and description mapping as the live path',
    JSON.stringify(filed[0] ?? null),
  );
  // THE WIRE VOCABULARY IS NOT THE FORM'S. `AddTechCardIssueRequest.severity` takes HIGH | MEDIUM |
  // LOW and the handler refuses anything else with InvalidArgument; the form carries the proto enum
  // name. Sending the enum name failed every direct filing on the real server and looked perfect
  // against the stub — which is why the token, not the mapping, is what is asserted here.
  ck(
    ['HIGH', 'MEDIUM', 'LOW'].includes(String(filed[0]?.severity ?? '')),
    'and a severity the SERVER accepts — HIGH | MEDIUM | LOW, not the form’s enum name',
    String(filed[0]?.severity ?? '(none)'),
  );
  ck(
    (await issues()).length === beforeIssues,
    'and wrote NOTHING into the form — a frozen card can never be saved',
    `issues=${(await issues()).length}`,
  );
  ck((await alerts()).some((m) => /filed on the issues tab/i.test(m)), 'the operator was told');
}

// ═══ 7. the error state and the empty state are different screens ══════════════════════════════
head('7. the error state and the empty state are visibly different');
await mount({ stub: EMPTY });
await inject();
const emptyText = await panelText();
const emptyBox = await page.evaluate(() => {
  const root = document.querySelector('[data-probe-panel]');
  const hits = [...root.querySelectorAll('div')].filter((n) =>
    window.norm2(n.textContent).includes('no findings'),
  );
  const el = hits[hits.length - 1];
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { border: cs.borderTopWidth, color: cs.borderTopColor };
});
const emptyNotChecked = emptyText.includes('not checked this run');

await mount({ stub: BROKEN });
await inject();
const errText = await panelText();
const errBox = await page.evaluate(() => {
  const root = document.querySelector('[data-probe-panel]');
  const hits = [...root.querySelectorAll('div')].filter((n) =>
    window.norm2(n.textContent).includes('could not be run'),
  );
  const el = hits[hits.length - 1];
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { border: cs.borderTopWidth, color: cs.borderTopColor };
});
ck(emptyText.includes('no findings'), 'the empty state says every check came back clean');
ck(emptyNotChecked, 'the empty state STILL lists what was not checked — the only honest content on it');
ck(errText.includes('could not be run'), 'the error state says the report did not arrive');
ck(!errText.includes('no findings'), 'the error state does NOT read as clean', errText.slice(0, 120));
ck(emptyText !== errText, 'the two screens are not the same screen');
ck(
  !!errBox && parseFloat(errBox.border) >= 1,
  'the error state is drawn in a bordered callout',
  JSON.stringify(errBox),
);
ck(
  !!errBox && !!emptyBox && errBox.color !== emptyBox.color,
  'and in a different colour from the empty state',
  `${JSON.stringify(errBox)} vs ${JSON.stringify(emptyBox)}`,
);

// ═══ 8. the gate ═══════════════════════════════════════════════════════════════════════════════
head('8. the query is gated — no id, or the tab not open, and nothing leaves');
await mount({ stub: OK, techCardId: null });
ck((await netCalls()).length === 0, 'an unsaved card makes no request', JSON.stringify(await netCalls()));
ck(
  (await panelText()).includes('the audit reads the saved card'),
  'and says so instead of pretending to load',
);
await mount({ stub: OK, active: false });
ck(
  (await netCalls()).length === 0,
  'the construction tab closed makes no request',
  JSON.stringify(await netCalls()),
);

// ═══ 10. the Analyze control ═══════════════════════════════════════════════════════════════════
head('10. Analyze (AI) — off deployment, dirty form, in flight, repeat press');
await mount({ stub: OK }); // aiEnabled: false
await inject();
{
  const a = await anchor('analyze (ai)');
  ck(a.n === 1, 'the control is on screen even when the deployment has no model', `found ${a.n}`);
  ck(
    a.ariaDisabled === 'true' && a.cursor === 'not-allowed',
    'and it is DISABLED, not hidden — the reader learns the feature exists and why it cannot run',
    JSON.stringify(a),
  );
  ck(
    (await panelText()).includes('ai review is not available on this deployment'),
    'the quiet caption says why',
  );
  const before = (await netCalls()).length;
  if (a.n === 1) await clickHit();
  ck(
    (await netCalls()).length === before,
    'pressing it spends nothing — no call leaves',
    JSON.stringify(await netCalls()),
  );
}

await mount({ stub: AI_ON(), dirty: true });
await inject();
{
  const a = await anchor('analyze (ai)');
  ck(
    a.n === 1 && a.ariaDisabled !== 'true',
    'ON A DIRTY FORM THE BUTTON STAYS ACTIVE — the saved card is analysable, and refusing would',
    'read as «fix your form» rather than «this reads the saved card»',
  );
  ck(
    (await panelText()).includes('unsaved changes are not analyzed — save first'),
    'and the caption says which card is actually being read',
  );
}

await mount({ stub: AI_ON({ mode: 'hang' }) });
await inject();
{
  await pressAnalyze();
  await ensureAiOpen();
  const t = await panelText();
  ck(
    t.includes('reviewing 48 operations') && t.includes('~30–60 s'),
    'in flight: the operator is told what is being reviewed and how long it takes',
    t.slice(0, 200),
  );
  const after1 = (await netCalls()).filter((c) => c === 'AnalyzeTechCardConstruction').length;
  ck(after1 === 1, 'one press, one run', `analyze calls = ${after1}`);
  // THE SECOND PRESS IS PRESSED ON THE IN-FLIGHT LABEL, not on the idle one — see ANALYZE_LABELS.
  const inFlightControl = await anchor('analyzing…');
  ck(
    inFlightControl.n === 1 && inFlightControl.ariaDisabled === 'true',
    'in flight the control reports itself disabled',
    JSON.stringify(inFlightControl),
  );
  const pressedAgain = await pickAnalyze();
  ck(pressedAgain === 'analyzing…', 'and the probe really did find a control to press again', String(pressedAgain));
  if (pressedAgain) await clickHit();
  const after2 = (await netCalls()).filter((c) => c === 'AnalyzeTechCardConstruction').length;
  ck(after2 === 1, 'a SECOND press while in flight spends nothing', `analyze calls = ${after2}`);
}

// ═══ 11. the client budget ═════════════════════════════════════════════════════════════════════
head('11. the 55 s client budget, and what the screen says when it fires');
{
  const budget = await page.evaluate(() => window.__audit.budgetMs());
  // The server's own ceiling: `defaultTimeout = 60 * time.Second` in internal/openrouter, with no
  // env override on beta. The client MUST give up first, or the panel would blame the wrong party.
  const SERVER_CEILING_MS = 60_000;
  ck(
    budget < SERVER_CEILING_MS && SERVER_CEILING_MS - budget >= 2000,
    `the client budget (${budget} ms) is below the server ceiling (${SERVER_CEILING_MS} ms) with a real margin`,
    'above it, the SERVER would abort first and the screen would attribute it to the client',
  );
}
await mount({ stub: AI_ON({ mode: 'hang' }), fast: true });
await inject();
{
  // The same code with the constant cut to 250 ms — the real AbortController, the real race.
  await pressAnalyze();
  await ensureAiOpen();
  await page.waitForTimeout(700);
  await inject();
  const t = await panelText();
  ck(
    t.includes('the client stopped waiting'),
    'when the budget fires, the panel says THE CLIENT gave up',
    t.slice(0, 240),
  );
  ck(
    !t.includes('reviewing 48 operations'),
    'and the in-flight line is gone — the screen is not still pretending to work',
  );
}

// A SERVER REFUSAL IS NOT THE CLIENT GIVING UP. The commonest failure on this path is
// ResourceExhausted — the same card is already being analysed, or the hourly ceiling is spent — and
// it arrives instantly with a sentence worth reading. Reporting it as «the client stopped waiting»
// would send the reader to debug a network that is perfectly healthy.
await mount({ stub: AI_ON({ mode: 'error' }) });
await inject();
{
  await pressAnalyze();
  await ensureAiOpen();
  const t = await panelText();
  ck(t.includes('refused'), 'a refused run carries the SERVER’s own words to the screen', t.slice(-200));
  ck(
    !t.includes('the client stopped waiting'),
    'and is NOT reported as the client’s own budget firing',
    t.slice(-200),
  );
}

// ═══ 12. the AI REVIEW block ═══════════════════════════════════════════════════════════════════
head('12. the AI REVIEW block — pills, stamp, findings, drop counters');
await mount({ stub: AI_ON() });
await inject();
{
  const ran = await pressAnalyze();
  ck(ran, 'the analyze control was pressable');
  const ai = await aiText();
  ck(!!ai, 'an AI REVIEW block exists, separate from the machine section', ai.slice(0, 80));
  ck(ai.includes('ai review'), 'and it is labelled');
  ck(
    ai.includes('1 blocker · 1 error · 0 warnings · 1 question'),
    'the pill header counts blockers/errors/warnings/questions — question is a CATEGORY, counted on its own axis',
    ai.slice(0, 200),
  );
  ck(ai.includes(norm(MODEL_SLUG)), 'the stamp names the model that was actually asked', ai.slice(0, 200));
  ck(/\d{2}\/\d{2}\/\d{4}/.test(ai), 'and when it was asked', ai.slice(0, 200));
  for (const f of MODEL_FINDINGS)
    ck(ai.includes(norm(f.title)) && ai.includes(norm(f.detail)), `«${f.title}» is drawn in the AI block`);
  const machineStill = (await panelText()).includes(norm(FINDINGS[0].title));
  ck(machineStill, 'the machine section is still on screen above it — two blocks, not one list');
  if (SHOT) {
    const shot = resolve(SCRATCH, 'construction-audit-ai-review.png');
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`  shot  ${shot}`);
  }
}

await mount({ stub: AI_ON({ mode: 'ok', response: analyzeRun({ droppedBadRef: 3, droppedContradiction: 2 }) }) });
await inject();
{
  await pressAnalyze();
  await ensureAiOpen();
  const ai = await aiText();
  ck(
    ai.includes('5 findings dropped') && ai.includes('3 whose anchors') && ai.includes('2 contradicting'),
    'a run that discarded findings SAYS SO — without it, a gutted run looks like a small one',
    ai.slice(0, 300),
  );
}

// ═══ 13. degradation is worded per §12 ═════════════════════════════════════════════════════════
head('13. ai_status — model_unavailable names the slug, invalid_output is not an all-clear');
await mount({
  stub: AI_ON({
    mode: 'ok',
    response: analyzeRun({ findings: [], aiStatus: 'model_unavailable' }),
  }),
});
await inject();
{
  await pressAnalyze();
  await ensureAiOpen();
  const ai = await aiText();
  ck(ai.includes(norm(MODEL_SLUG)), 'model_unavailable NAMES THE SLUG', ai.slice(0, 260));
  ck(
    !ai.includes('try again later') && !ai.includes('temporarily'),
    'and does NOT offer «later» — it is a configuration fault, and waiting fixes nothing',
    ai.slice(0, 260),
  );
  ck(
    ai.includes('configuration fault'),
    'it says what kind of fault it is',
    ai.slice(0, 260),
  );
}

await mount({
  stub: AI_ON({
    mode: 'ok',
    response: analyzeRun({
      findings: [],
      aiStatus: 'invalid_output',
      droppedContradiction: 4,
    }),
  }),
});
await inject();
{
  await pressAnalyze();
  await ensureAiOpen();
  const ai = await aiText();
  ck(
    ai.includes('not an all-clear'),
    'invalid_output SAYS it is not an all-clear — an empty list under a failure is not a clean card',
    ai.slice(0, 300),
  );
  ck(ai.includes('4 contradicting') || ai.includes('4 findings dropped'), 'and the drop counters are visible');
  ck(
    !ai.includes('the model found nothing to report'),
    'and it never uses the clean-card sentence',
    ai.slice(0, 300),
  );
}

await mount({ stub: AI_ON({ mode: 'ok', response: analyzeRun({ findings: [], aiStatus: 'failed' }) }) });
await inject();
{
  await pressAnalyze();
  await ensureAiOpen();
  const ai = await aiText();
  ck(ai.includes('retry'), 'failed IS weather, and offers a retry', ai.slice(0, 240));
  const rerun = await anchor('re-run (ai)');
  ck(rerun.n === 1 && rerun.ariaDisabled !== 'true', 'and the control is live to press again', JSON.stringify(rerun));
}

// ═══ 14. grouping ══════════════════════════════════════════════════════════════════════════════
head('14. grouping — severity | route | category, one run seen three ways');
await mount({ stub: AI_ON() });
await inject();
{
  await pressAnalyze();
  await ensureAiOpen();
  const titlesIn = async () =>
    page.evaluate(
      (wanted) => {
        const root = document.querySelector('[data-ai-review]');
        const txt = window.norm2(root?.innerText || '');
        // Positions of each known title in the rendered text = the order they are drawn in.
        return wanted
          .map((t) => [t, txt.indexOf(window.norm2(t))])
          .filter(([, i]) => i >= 0)
          .sort((a, b) => a[1] - b[1])
          .map(([t]) => t);
      },
      MODEL_FINDINGS.map((f) => f.title),
    );

  const bySeverity = await titlesIn();
  ck(
    JSON.stringify(bySeverity) ===
      JSON.stringify([M_MISSING.title, M_METHOD.title, M_QUESTION.title]),
    'severity (the default): blocker, then error, then warning',
    JSON.stringify(bySeverity),
  );
  ck((await aiText()).includes('1 blocker'), 'and the group headings are counted');

  await pick('route');
  await clickHit();
  await inject();
  const byRoute = await titlesIn();
  // op:100 < op:120 (the missing step's INSERT point, NOT its op:300 ref) < op:200.
  ck(
    JSON.stringify(byRoute) === JSON.stringify([M_QUESTION.title, M_MISSING.title, M_METHOD.title]),
    'route: by the step each one sits at — and missing_step by its INSERT point, not by its refs',
    JSON.stringify(byRoute),
  );
  ck(
    JSON.stringify(byRoute) !== JSON.stringify(bySeverity),
    'and route is genuinely a different order from severity — a dead toggle could not pass both',
    JSON.stringify(byRoute),
  );

  await pick('category');
  await clickHit();
  await inject();
  const byCategory = await titlesIn();
  ck(
    JSON.stringify(byCategory) ===
      JSON.stringify([M_METHOD.title, M_QUESTION.title, M_MISSING.title]),
    'category: batched, in the order the categories first appear',
    JSON.stringify(byCategory),
  );
  ck(
    JSON.stringify(byCategory) !== JSON.stringify(byRoute),
    'and it is a third order, not a repeat of the second',
    JSON.stringify(byCategory),
  );
  const aiCat = await aiText();
  ck(
    aiCat.includes('missing step') && aiCat.includes('method') && aiCat.includes('question'),
    'and the headings are the categories themselves',
  );
  ck(
    byRoute.length === MODEL_FINDINGS.length && byCategory.length === MODEL_FINDINGS.length,
    'NO VIEW LOSES A FINDING — the toggle is a permutation, never a filter',
    `${byRoute.length} / ${byCategory.length} of ${MODEL_FINDINGS.length}`,
  );
}

// ═══ 15. filing a MODEL finding ════════════════════════════════════════════════════════════════
head('15. a filed model finding names its model');
await mount({ stub: AI_ON() });
await inject();
{
  await pressAnalyze();
  await ensureAiOpen();
  const before = (await issues()).length;
  // The AI block's filers come after the machine section's four.
  const total = await page.evaluate(() => window.findLeaf('file as issue').length);
  ck(total === FINDINGS.length + MODEL_FINDINGS.length, 'every finding on both sides can be filed', String(total));
  await pick('file as issue', FINDINGS.length);
  await clickHit();
  const after = await issues();
  ck(after.length === before + 1, 'one issue was appended', `${before} → ${after.length}`);
  const d = String(after[after.length - 1]?.description ?? '');
  ck(d.startsWith('[AI review] '), 'the description is marked as coming from the AI review', d.slice(0, 40));
  ck(
    d.endsWith(`(model ${MODEL_SLUG})`),
    'AND IT ENDS WITH THE MODEL SLUG — an issue outlives the run, and a claim without provenance cannot be checked',
    d.slice(-60),
  );

  // THE «question → LOW» ARM, AND IT IS THE ONE THAT DISCRIMINATES. M_QUESTION carries
  // category=question WITH severity=warning: a mapping that read `severity` would file it MEDIUM
  // and look right on every other finding in the fixture. `question` is not a severity — it is
  // read off the category axis, by the same bucket function the pills and the grouping use.
  //
  // EVERY MODEL FILER IS PRESSED AND THE ROWS ARE MATCHED BACK BY TITLE. Not by index: the AI
  // block GROUPS its findings, so a positional pick measures the fixture's order, not the map —
  // which is how the first version of this check filed the wrong finding and said so.
  {
    const expectM = { blocker: 'HIGH', error: 'HIGH', warning: 'MEDIUM', question: 'LOW' };
    const beforeQ = (await issues()).length;
    const allFilers = await page.evaluate(() => window.findLeaf('file as issue').length);
    for (let i = FINDINGS.length; i < allFilers; i++) {
      await pick('file as issue', i);
      await clickHit();
    }
    const rows = (await issues()).slice(beforeQ);
    const wrongM = [];
    let sawQuestion = false;
    for (const row of rows) {
      const text = norm(String(row?.description ?? ''));
      const f = MODEL_FINDINGS.find((x) => text.includes(norm(x.title)));
      if (!f) continue;
      const bucket = (f.category ?? '').trim() === 'question' ? 'question' : (f.severity ?? '').trim();
      const want = expectM[bucket];
      if (!want) continue;
      if (bucket === 'question') sawQuestion = true;
      if (row?.severity !== `TECH_CARD_ISSUE_SEVERITY_${want}`) {
        wrongM.push(`${f.severity}/${f.category} → ${row?.severity}, want ${want}`);
      }
    }
    ck(sawQuestion, 'the question finding is among the filed rows', `${rows.length} rows`);
    ck(
      wrongM.length === 0,
      'a QUESTION files at LOW even though its severity says warning — the map reads the category axis',
      wrongM.join('; '),
    );
  }
}

// ═══ 16. identity, dismiss, delta, and F5 ══════════════════════════════════════════════════════
head('16. finding identity — sha256, uid, the re-run delta, dismiss, and surviving F5');
{
  // The digest is checked against node's own, on the inputs that break naive implementations:
  // empty, the 55/56-byte padding boundary, and non-ASCII.
  const inputs = ['', 'abc', 'op:460', 'подкладка', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(1000)];
  const got = await page.evaluate((xs) => xs.map((x) => window.__audit.sha256(x)), inputs);
  const want = inputs.map((x) => createHash('sha256').update(x, 'utf8').digest('hex'));
  ck(
    JSON.stringify(got) === JSON.stringify(want),
    'the bundled sha256 agrees with node’s crypto on every input',
    got.map((g, i) => (g === want[i] ? '' : `«${inputs[i].slice(0, 8)}»`)).filter(Boolean).join(' '),
  );
  const idn = await page.evaluate(() => ({
    sortedRefs: [
      window.__audit.uid('bom_mismatch', ['card', 'bom:x']),
      window.__audit.uid('bom_mismatch', ['bom:x', 'card']),
    ],
    otherCategory: window.__audit.uid('sequence', ['card', 'bom:x']),
    collide: window.__audit.uidsOf([
      { category: 'x', refs: ['op:1'], title: 'A' },
      { category: 'x', refs: ['op:1'], title: 'B' },
      { category: 'y', refs: ['op:2'], title: 'C' },
    ]),
    len: window.__audit.uid('x', ['op:1']).length,
  }));
  ck(idn.sortedRefs[0] === idn.sortedRefs[1], 'anchor ORDER cannot rename a finding', JSON.stringify(idn.sortedRefs));
  ck(idn.otherCategory !== idn.sortedRefs[0], 'a different category is a different finding');
  ck(idn.len === 16, 'the uid is 16 hex characters', String(idn.len));
  ck(
    idn.collide[0] !== idn.collide[1] && idn.collide[2] !== idn.collide[0],
    'two findings of ONE run colliding on (category, refs) are separated by their titles',
    JSON.stringify(idn.collide),
  );
}

await mount({ stub: AI_ON() });
await inject();
{
  await pressAnalyze();
  await ensureAiOpen();
  ck(!(await aiText()).includes('re-run:'), 'a FIRST run shows no delta — everything is trivially new');

  // Re-run: the same two defects REPHRASED, plus one new one.
  await page.evaluate((r) => {
    window.__auditStub.analyze = { mode: 'ok', response: r };
  }, analyzeRun({ findings: MODEL_FINDINGS_RERUN }));
  await pressAnalyze();
  await ensureAiOpen();
  const ai = await aiText();
  ck(
    ai.includes('re-run: 1 new · 2 still open · 0 dismissed'),
    'THE RE-RUN IS A DELTA, and a rephrased title is still the same finding',
    ai.slice(0, 300),
  );
  ck(ai.includes('still open') && ai.includes('new'), 'and each row is badged with which it is');

  // Dismiss the new one.
  const dismissable = await page.evaluate(() => window.findLeaf('dismiss').length);
  ck(dismissable === MODEL_FINDINGS_RERUN.length, 'dismiss is offered on every MODEL finding', String(dismissable));
  await pick('dismiss', 0);
  await clickHit();
  await inject();
  const afterDismiss = await aiText();
  ck(afterDismiss.includes('dismissed'), 'a dismissed finding collapses to one line, not to nothing');
  ck(
    (await page.evaluate(() => window.findLeaf('restore').length)) === 1,
    'with the way back on it',
  );
  const stored = await page.evaluate(() => window.__audit.session(42));
  ck((stored?.dismissed ?? []).length === 1, 'the dismissal is mirrored into sessionStorage', JSON.stringify(stored?.dismissed));

  // F5. Same tab, same session — the run must come back WITHOUT a second call.
  await mount({ stub: AI_ON(), keepSession: true });
  await openAiReview();
  await inject();
  const afterReload = await aiText();
  const analyzeCalls = (await netCalls()).filter((c) => c === 'AnalyzeTechCardConstruction').length;
  ck(analyzeCalls === 0, 'F5 DOES NOT BURN A PAID RUN — no analyze call left the page', String(analyzeCalls));
  ck(
    afterReload.includes(norm(MODEL_FINDINGS_RERUN[1].title)),
    'the run is back on screen from the session mirror',
    afterReload.slice(0, 200),
  );
  ck(afterReload.includes('dismissed'), 'and the dismissal survived with it');
}

// A machine finding is NOT dismissable: it disappears when its cause does, and a dismissal that
// cannot be honoured is a promise the panel cannot keep.
await mount({ stub: OK });
await inject();
ck(
  (await page.evaluate(() => window.findLeaf('dismiss').length)) === 0,
  'the machine section offers no dismiss at all',
);

// ═══ 19. §9 ANCHOR RESOLUTION ══════════════════════════════════════════════════════════════════
head('19. anchors: matching → green, differing → amber AND still navigating, absent → grey');

/** The text of every per-finding staleness note on screen, in document order. */
const staleNotes = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-stale-note]')].map((n) => window.norm2(n.textContent || '')),
  );

// The card AFTER somebody saved: op:200 edited, op:300 deleted. The run in the session mirror still
// carries FP_AT_RUN, which is exactly the production sequence — run, save, audit refetch, amber.
const AI_MOVED = {
  audit: auditOk({ aiEnabled: true, operationFingerprints: FP_NOW_MOVED }),
  analyze: { mode: 'ok', response: analyzeRun() },
  addIssue: { mode: 'ok' },
};

await mount({ stub: AI_ON() });
{
  await pressAnalyze();
  await ensureAiOpen();
  ck(
    (await staleNotes()).length === 0,
    'a run whose fingerprints all match says NOTHING about staleness',
    JSON.stringify(await staleNotes()),
  );
  for (const label of ['op:100', 'op:200', 'op:300']) {
    const a = await anchor(label);
    if (a.n !== 1) {
      ck(false, `«${label}» is exactly one live anchor`, `found ${a.n}`);
      continue;
    }
    const before = (await gone()).length;
    await clickHit();
    const after = await gone();
    ck(
      a.role === 'button' && after.length === before + 1 && after[after.length - 1][0] === 'construction',
      `«${label}» matches the run and navigates, unremarked`,
      JSON.stringify(after[after.length - 1] ?? null),
    );
  }
}

// The same session, the card moved underneath it.
await mount({ stub: AI_MOVED, keepSession: true });
await openAiReview();
{
  const notes = await staleNotes();
  ck(notes.length === 1, 'EXACTLY ONE finding is marked stale — not the block, not the run', JSON.stringify(notes));
  ck(
    (notes[0] ?? '').includes('op #200 changed since the run'),
    'and the note names the step that moved',
    notes[0] ?? '(none)',
  );

  const a200 = await anchor('op:200');
  ck(a200.n === 1 && a200.role === 'button', 'the amber anchor is still a live control', JSON.stringify(a200));
  const before = (await gone()).length;
  if (a200.n === 1) await clickHit();
  const after = await gone();
  const last = after[after.length - 1];
  ck(
    after.length === before + 1 && last?.[0] === 'construction' && last?.[1]?.op === '200',
    'AMBER STILL NAVIGATES — §9 refuses to withhold the jump from someone who wants to look',
    JSON.stringify(last ?? null),
  );

  const grey = await anchor('op #300 — not found; re-run the analysis');
  ck(grey.n === 1, 'a number that is no longer on the card renders the §9 grey label', `found ${grey.n}`);
  ck(
    grey.n === 1 && grey.tag === 'span' && grey.role !== 'button' && grey.tabindex === null,
    'and it is a LABEL — no role, no tab stop, nothing to press',
    JSON.stringify(grey),
  );
  const beforeGrey = (await gone()).length;
  if (grey.n === 1) await clickHit();
  ck((await gone()).length === beforeGrey, 'clicking the grey label navigates nowhere');
  ck(
    (await page.evaluate(() => window.findLeaf('op:300').length)) === 0,
    'and the live «op:300» chip is gone with it — a jump to a deleted step is not offered twice',
  );

  const a100 = await anchor('op:100');
  ck(
    a100.n === 1 && a100.role === 'button',
    'the finding on the step nobody touched is untouched on screen too',
    JSON.stringify(a100),
  );

  // NO GLOBAL STALE BANNER (§10). A banner would also produce exactly one box with exactly these
  // words — the COUNT cannot tell them apart, and containment is the only thing that can: the
  // smallest box holding both the note and its own finding's title must hold no OTHER finding.
  const containment = await page.evaluate(
    ([mt, qt]) => {
      const note = document.querySelector('[data-stale-note]');
      if (!note) return { found: false };
      let node = note.parentElement;
      while (node) {
        const t = window.norm2(node.textContent || '');
        if (t.includes(mt)) return { found: true, alsoOther: t.includes(qt) };
        node = node.parentElement;
      }
      return { found: false };
    },
    [norm(M_METHOD.title), norm(M_QUESTION.title)],
  );
  ck(
    containment.found && !containment.alsoOther,
    'THE NOTE IS INSIDE ITS FINDING — no global stale banner, because reacting to findings must not be punished',
    JSON.stringify(containment),
  );
  const outsideAi = await page.evaluate(() => {
    const root = document.querySelector('[data-probe-panel]');
    if (!root) return '';
    const clone = root.cloneNode(true);
    clone.querySelector('[data-ai-review]')?.remove();
    return window.norm2(clone.textContent || '');
  });
  ck(
    !outsideAi.includes('changed since the run') && !outsideAi.includes('not found; re-run'),
    'the MACHINE section carries no staleness at all — it cannot be stale against a map its own response produced',
  );
}

// A DEPLOYMENT THAT SENDS NO MAP AT ALL. «Cannot tell» must not render as «not found»: reading an
// absent map as an empty one would grey EVERY anchor of every finding on a lagging backend.
await mount({
  stub: {
    audit: auditOk({ aiEnabled: true, operationFingerprints: undefined }),
    analyze: { mode: 'ok', response: analyzeRun() },
    addIssue: { mode: 'ok' },
  },
  keepSession: true,
});
await openAiReview();
{
  ck(
    (await page.evaluate(() => window.findLeaf('op #300 — not found; re-run the analysis').length)) === 0,
    'a server that sends NO fingerprint map greys nothing',
  );
  ck((await staleNotes()).length === 0, 'and marks nothing amber either', JSON.stringify(await staleNotes()));
  const a = await anchor('op:300');
  ck(a.n === 1 && a.role === 'button', 'every anchor stays live where the question cannot be answered', JSON.stringify(a));
}

// ═══ 20. THE FORM HALF ═════════════════════════════════════════════════════════════════════════
head('20. «unsaved edits since the run» — decided by the hash, not by the dirty flag');
{
  // 200's stored fingerprint is the REAL fp8 of the step planted into the form below (canonical
  // vector 1), so «the form agrees with the run» is a hash agreement rather than two fixtures that
  // happen to carry the same string.
  const FP_FORM = { ...FP_AT_RUN, 200: '1bd85c4d' };
  const AI_FORM = {
    audit: auditOk({ aiEnabled: true, operationFingerprints: FP_FORM }),
    analyze: { mode: 'ok', response: analyzeRun({ operationFingerprints: FP_FORM }) },
    addIssue: { mode: 'ok' },
  };
  const STEP_200 = {
    operationNumber: 200,
    outputUnitKey: 'Back',
    inputKeys: ['Back panels bottom', 'Back Panels Upper'],
  };

  await mount({ stub: AI_FORM });
  await pressAnalyze();
  await ensureAiOpen();

  // `dirty: true` IS A STAND ARTEFACT AND IS SPELLED OUT AS ONE. In the product an operation field
  // is a registered input, so typing in it dirties the form by itself; a `setValue` into an array
  // no input is bound to does not, so the stand makes the form dirty the way case 10 does — a real
  // edit to an unrelated field. That is also the sharper test: the note must follow the HASH, and
  // here the dirty flag is true for a reason that has nothing to do with the step.
  await mount({ stub: AI_FORM, keepSession: true, dirty: true, operations: [STEP_200] });
  await openAiReview();
  // THE STAND FIRST. Both halves of this case read «no note» when the plant silently did not take,
  // and would then pass as a pair while measuring nothing at all.
  const planted = await page.evaluate(() => ({
    ops: window.__audit.ops(),
    dirty: window.__audit.isDirty(),
  }));
  ck(
    planted.ops.length === 1 && planted.ops[0]?.operationNumber === 200 && planted.dirty,
    'THE STAND: the step really is in the form, and the form really is dirty',
    JSON.stringify(planted).slice(0, 200),
  );
  const dirtyMatch = await staleNotes();
  ck(
    dirtyMatch.length === 0,
    'a DIRTY form whose step hashes to exactly what the run read says nothing',
    JSON.stringify(dirtyMatch),
  );

  // The same two inputs, in the other order. Nothing else about the step is different.
  await mount({
    stub: AI_FORM,
    keepSession: true,
    dirty: true,
    operations: [{ ...STEP_200, inputKeys: [...STEP_200.inputKeys].reverse() }],
  });
  await openAiReview();
  const swapped = await staleNotes();
  ck(
    swapped.length === 1 && (swapped[0] ?? '').includes('op #200 has unsaved edits since the run'),
    'SWAPPING TWO INPUTS IS AN EDIT — and the hash noticed it, not the dirty flag',
    JSON.stringify(swapped),
  );
  const a = await anchor('op:200');
  ck(a.n === 1 && a.role === 'button', 'an unsaved edit does not take the jump away either', JSON.stringify(a));

  // AND THE GATE ITSELF. The same swapped step on a PRISTINE form must say nothing, or the note
  // stops meaning «you have unsaved edits» and starts meaning «the form and the server disagree» —
  // which on an untouched card is a hydration bug, not an edit, and would render as a permanent
  // false warning on cards nobody has opened twice. Without this half the `dirty` gate is dead code
  // wearing a comment: removing it entirely leaves every other check in this case green.
  await mount({
    stub: AI_FORM,
    keepSession: true,
    dirty: false,
    operations: [{ ...STEP_200, inputKeys: [...STEP_200.inputKeys].reverse() }],
  });
  await openAiReview();
  const pristinePlant = await page.evaluate(() => ({
    ops: window.__audit.ops(),
    dirty: window.__audit.isDirty(),
  }));
  ck(
    pristinePlant.ops.length === 1 && pristinePlant.ops[0]?.operationNumber === 200 && !pristinePlant.dirty,
    'THE STAND: the diverging step is in the form and the form is NOT dirty',
    JSON.stringify(pristinePlant).slice(0, 200),
  );
  const pristine = await staleNotes();
  ck(
    pristine.length === 0,
    'a PRISTINE form says nothing even when its hash diverges — the gate, not the hash, decides here',
    JSON.stringify(pristine),
  );
}

// ═══ 21. THE FINGERPRINT PORT ══════════════════════════════════════════════════════════════════
head('21. the fingerprint port — the nine canonical vectors of fingerprint_test.go are the oracle');
{
  // NUL BY CODE POINT. A raw 0x00 in this file would make grep call it binary and quietly return
  // nothing on every future search — the same trap the module's own comment names.
  const NUL = String.fromCharCode(0);
  // Copied from internal/techcardanalysis/fingerprint_test.go. THESE ARE A CONTRACT, NEVER A
  // SNAPSHOT: a disagreement means the port is wrong, and the value is not updated to match it.
  const VECTORS = [
    ['Back', ['Back panels bottom', 'Back Panels Upper'], '1bd85c4d', 'a join with two unit inputs'],
    ['', ['blazer'], '5c14ea94', 'a processing step: the empty output serializes as an EMPTY STRING'],
    ['pocket base', ['01ARZ3NDEKTSV4RRFFQ69G5FAV', 'pocket base'], '9bd4f24a', 'an absorbing step: the piece ULID goes in raw, with no kind prefix'],
    ['', [], '2b1f7919', 'no output and no inputs — the payload is still «tcfp1» and one separator'],
    ['Плечевая', ['плечевая'], '46e2eab4', 'utf-8 leaves as bytes and case is preserved'],
    ['Base', [' x'], '4e795fdf', 'a leading space is PART OF THE KEY'],
    ['Base', ['x'], 'dc4d7be7', '…and the same step without it is a different fingerprint'],
    ['base', [' x'], 'e31589b1', 'the OUTPUT key’s case distinguishes two units'],
    ['Back', ['Back Panels Upper', 'Back panels bottom'], '75569dd3', 'input ORDER is a fact of the step and is never sorted away'],
  ];
  const got = await page.evaluate(
    (vs) => vs.map(([o, i]) => window.__audit.fp(o, i)),
    VECTORS.map((v) => [v[0], v[1]]),
  );
  for (let i = 0; i < VECTORS.length; i++) {
    const [o, ins, want, why] = VECTORS[i];
    ck(
      got[i] === want,
      `fp(${JSON.stringify(o)}, ${JSON.stringify(ins)}) = ${want} — ${why}`,
      got[i] === want ? '' : `got ${got[i]}`,
    );
  }
  // The table's own guard, mirroring TestFingerprintVectorsAreDistinct: a table where two rows
  // shared an expectation would pass while proving nothing about the pair it exists to separate.
  ck(
    new Set(VECTORS.map((v) => v[2])).size === VECTORS.length,
    'the nine expectations are nine DIFFERENT values',
  );
  // A second, independent oracle for the payload itself. It cannot vouch for the table — that came
  // from Go — but it does catch a port that agrees with a mistyped table.
  const byNode = VECTORS.map(([o, ins]) =>
    createHash('sha256').update(['tcfp1', o, ...ins].join(NUL), 'utf8').digest('hex').slice(0, 8),
  );
  ck(
    JSON.stringify(byNode) === JSON.stringify(VECTORS.map((v) => v[2])),
    'and node’s own sha256 over the §9 payload agrees with all nine',
    JSON.stringify(byNode),
  );

  const mapped = await page.evaluate(() =>
    window.__audit.formFps([
      { operationNumber: 30, outputUnitKey: 'Back', inputKeys: ['Back panels bottom', 'Back Panels Upper'] },
      { operationNumber: 0, outputUnitKey: 'Back', inputKeys: ['Back panels bottom'] },
      { outputUnitKey: 'X', inputKeys: [] },
      { operationNumber: 470, outputUnitKey: '', inputKeys: ['blazer'] },
    ]),
  );
  ck(
    mapped['30'] === '1bd85c4d' && mapped['470'] === '5c14ea94',
    'the map builder keys by the STRING number — the shape protojson sends a map<int32,string> in',
    JSON.stringify(mapped),
  );
  ck(
    Object.keys(mapped).length === 2,
    'and a step with no number is skipped: it has no anchor anyone could ask about',
    JSON.stringify(Object.keys(mapped)),
  );
}

// ═══ 22. THE AI BLOCK OPENS CLOSED ════════════════════════════════════════════════════════════
head('22. the ai block opens closed — but a closed block never reads as a clean card');
{
  // A run that finished in THIS interaction opens itself: a button you waited forty seconds for
  // and then saw nothing appear reads as broken.
  await mount({ stub: AI_ON() });
  await pressAnalyze();
  const afterRun = await page.evaluate(() => window.aiText());
  ck(
    afterRun.includes(norm(M_MISSING.title)),
    'a run finished right now shows its findings without being asked',
    afterRun.slice(0, 120),
  );
  ck(
    (await page.evaluate(() => window.findLeaf('hide').length)) === 1,
    'and the control offers to hide them',
  );

  // F5 — the same run, restored from the session. THIS is the state that opens closed.
  await mount({ stub: AI_ON(), keepSession: true });
  const restored = await page.evaluate(() => window.aiText());
  ck(
    !restored.includes(norm(M_MISSING.title)) && !restored.includes(norm(M_METHOD.title)),
    'a run restored from the session renders CLOSED — no finding body on screen',
    restored.slice(0, 160),
  );
  // THE HALF THAT MATTERS MORE. A collapsed block that hid «1 blocker» would read exactly like a
  // card with nothing wrong on it — the silence this whole panel exists to refuse. The count, the
  // model stamp and any degraded status stay on screen at all times.
  ck(
    restored.includes('1 blocker') && restored.includes('1 error'),
    'THE COUNT STAYS VISIBLE WHILE CLOSED — «closed» must never be readable as «clean»',
    restored.slice(0, 160),
  );
  ck(
    restored.includes(norm(MODEL_SLUG)),
    'and so does the model stamp — a closed report still says who wrote it',
    restored.slice(0, 160),
  );
  ck(
    (await page.evaluate(() => window.findLeaf('show 3 findings').length)) === 1,
    'the control names how many are behind it, not just «show»',
  );

  // Opening and closing again, by the control.
  await openAiReview();
  const opened = await page.evaluate(() => window.aiText());
  ck(opened.includes(norm(M_MISSING.title)), 'pressing it opens the body', opened.slice(0, 120));
  await pick('hide', 0);
  await clickHit();
  const closedAgain = await page.evaluate(() => window.aiText());
  ck(
    !closedAgain.includes(norm(M_MISSING.title)),
    'and pressing it again closes the body',
    closedAgain.slice(0, 120),
  );
  const foldCalls = (await netCalls()).filter((c) => c === 'AnalyzeTechCardConstruction').length;
  ck(
    foldCalls === 0,
    'OPENING AND CLOSING SPENDS NOTHING — it is a fold, not a re-run',
    `analyze calls on this mount = ${foldCalls}`,
  );
}

// ─── VERDICT ───────────────────────────────────────────────────────────────────────────────────
ck(pageErrors.length === 0, 'no page errors over the whole run', pageErrors.join(' | '));
await browser.close();
console.log(
  `\n${bad === 0 ? `GREEN — ${total} checks` : `RED: ${bad} of ${total} checks failed`}` +
    (MUTATIONS_ON.length ? `   [mutations: ${MUTATIONS_ON.join(' ')}]` : ''),
);
process.exit(bad === 0 ? 0 : 1);
