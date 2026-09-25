#!/usr/bin/env node
// АВТОСЕЙВ КАРТОЧКИ, АВТО-СТЕЙДЖ И ОТКАТ ТЕКСТА — ТРИ ОБЕЩАНИЯ ВОЛНЫ 25.09 (зона CL-A).
//
//   (1) автосейв пишет через 2 с после ПОСЛЕДНЕЙ правки — не раньше — и НЕ пишет невалидную форму;
//   (2) авто-стейдж не поднимает стейдж, если хоть одна строка готовности `unknown` (Codex B-01);
//   (3) откат из истории меняет ТОЛЬКО текстовые секции, картинки аспектов остаются текущими (B-04).
//
// Каждое обещание проверено дважды: на настоящем коде (всё зелёное) и на МУТАНТЕ — копии того же
// модуля с вырезанной ровно той строкой, которая обещание держит. На мутанте соответствующая проверка
// ОБЯЗАНА покраснеть: иначе она сторожит мёртвый код. Подмена утверждает, что случилась (строка
// найдена), — совпавшие «до» и «после» без подмены ничего бы не доказали. Ничего на диске не трогается.
//
//   node scripts/techcard-autosave-probe.mjs

import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const C = 'src/components/managers/tech-card/components';

// ─── мутанты ──────────────────────────────────────────────────────────────────────────────────
const MUTANTS = {
  none: [],
  // (1a) дебаунс выключен: запись уходит сразу, а не через 2 с
  debounce0: [
    [`${C}/useTechCardAutosave.ts`, "arm(deps.debounceMs, 'debounce');", "arm(0, 'debounce');"],
  ],
  // (1b) проверка валидности выключена: невалидная форма уходит на сервер
  noValidate: [[`${C}/useTechCardAutosave.ts`, 'if (!v.ok) {', 'if (false) {']],
  // (2) строка `unknown` больше не держит стейдж
  noUnknownGuard: [
    [`${C}/stage-progress.tsx`, 'if (all.some((x) => x.unknown === true)) return null;', ''],
  ],
  // (3a) откат переписывает строку аспекта из снимка — картинки строки теряются
  restoreDropsPictures: [
    [`${C}/save-history.ts`, 'details.push({ ...d, text });', 'details.push({ key, text, mediaIds: [] });'],
  ],
  // (3b) аспект без текста и без картинок больше не снимается
  restoreKeepsEmptyRows: [
    [`${C}/save-history.ts`, 'if (!text.trim() && (d.mediaIds?.length ?? 0) === 0) continue;', ''],
  ],
};

async function load(mutant) {
  const edits = MUTANTS[mutant];
  const hits = new Set();
  const outfile = resolve(root, `scripts/.techcard-autosave-${mutant}-${process.pid}.mjs`);
  await build({
    entryPoints: [resolve(root, 'scripts/techcard-autosave-probe-entry.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    absWorkingDir: root,
    outfile,
    logLevel: 'silent',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'text', '.png': 'dataurl' },
    define: {
      'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
      'process.env.NODE_ENV': '"production"',
    },
    plugins: [
      {
        name: 'mutate',
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const mine = edits.filter(([rel]) => args.path.endsWith(rel));
            if (mine.length === 0) return null;
            let text = readFileSync(args.path, 'utf8');
            for (const [rel, from, to] of mine) {
              if (!text.includes(from)) throw new Error(`mutant ${mutant}: «${from}» not found in ${rel}`);
              text = text.split(from).join(to);
              hits.add(rel + from);
            }
            return { contents: text, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
          });
        },
      },
    ],
  });
  if (hits.size !== edits.length) throw new Error(`mutant ${mutant}: ${edits.length - hits.size} edit(s) did not apply`);
  const mod = await import(pathToFileURL(outfile).href);
  rmSync(outfile, { force: true });
  return mod;
}

// ─── поддельные часы: setTimeout/clearTimeout/now, advance прогоняет таймеры и микрозадачи ──────
function fakeClock() {
  let t = 0;
  let seq = 0;
  const q = new Map();
  const drain = async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve();
  };
  return {
    now: () => t,
    setTimer: (fn, ms) => {
      const id = ++seq;
      q.set(id, { at: t + ms, fn });
      return id;
    },
    clearTimer: (id) => q.delete(id),
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [id, e] of q) if (e.at <= end && (!next || e.at < next[1].at)) next = [id, e];
        if (!next) break;
        q.delete(next[0]);
        t = next[1].at;
        next[1].fn();
        await drain();
      }
      t = end;
      await drain();
    },
  };
}

function machineRig(mod, { valid = true } = {}) {
  const clock = fakeClock();
  const rig = { clock, saves: [], states: [], dirty: false, valid };
  rig.m = mod.createAutosaveMachine({
    debounceMs: 2000,
    retryDelaysMs: [5000, 15000, 45000],
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    now: clock.now,
    isEnabled: () => true,
    isPaused: () => false,
    hasWork: () => rig.dirty,
    validate: async () => ({ ok: rig.valid, errors: rig.valid ? 0 : 2 }),
    save: async (mode, reason) => {
      rig.saves.push({ at: clock.now(), mode, reason });
      rig.dirty = false;
      return { outcome: 'complete' };
    },
    countErrors: () => (rig.valid ? 0 : 2),
    onState: (s) => rig.states.push(s),
  });
  rig.edit = () => {
    rig.dirty = true;
    rig.m.notifyChange();
  };
  return rig;
}

// ─── обещания ───────────────────────────────────────────────────────────────────────────────
async function promise1(mod) {
  const out = {};
  // one edit at t=0: nothing at 1999 ms, exactly one write at 2000 ms
  let r = machineRig(mod);
  r.edit();
  await r.clock.advance(1999);
  out.notBefore2s = r.saves.length === 0;
  await r.clock.advance(1);
  out.firesAt2s = r.saves.length === 1 && r.saves[0].at === 2000 && r.saves[0].mode === 'silent';
  out.savedStatus = r.m.state().status === 'saved' && r.m.state().lastSavedAt === 2000;

  // the debounce restarts on every edit: edits at 0 / 1500 / 3000 → one write at 5000
  r = machineRig(mod);
  r.edit();
  await r.clock.advance(1500);
  r.edit();
  await r.clock.advance(1500);
  r.edit();
  await r.clock.advance(1999);
  out.restartsOnEachEdit = r.saves.length === 0;
  await r.clock.advance(1);
  out.oneWriteAfterQuiet = r.saves.length === 1 && r.saves[0].at === 5000;

  // not while invalid — and the status says why
  r = machineRig(mod, { valid: false });
  r.edit();
  await r.clock.advance(10_000);
  out.noWriteWhileInvalid = r.saves.length === 0;
  out.invalidStatus = r.m.state().status === 'invalid' && r.m.state().errorsCount === 2;
  // …and the same card, once valid, is written 2 s after the fix
  r.valid = true;
  r.edit();
  await r.clock.advance(2000);
  out.writesOnceFixed = r.saves.length === 1;

  // flush: immediate, awaited, answers ok
  r = machineRig(mod);
  r.edit();
  const res = await r.m.flush('probe');
  out.flushImmediate = res === 'ok' && r.saves.length === 1 && r.saves[0].at === 0;
  await r.clock.advance(5000);
  out.flushCancelsDebounce = r.saves.length === 1;
  return out;
}

function promise2(mod) {
  const base = {
    currentStage: 'TECH_CARD_STAGE_IDEA',
    nextStage: 'TECH_CARD_STAGE_PROTO',
    nextStageReady: true,
    releaseRequirements: [],
    releaseReady: false,
    advisories: [],
  };
  const decide = (rows, extra = {}) =>
    mod.decideAutoStage({
      readiness: { ...base, nextStageRequirements: rows, ...extra.readiness },
      savedStage: extra.saved ?? 'TECH_CARD_STAGE_IDEA',
      formStage: extra.form ?? 'TECH_CARD_STAGE_IDEA',
      isAux: extra.isAux ?? false,
    });
  const met = { key: 'style_number', label: 'style number', met: true, unknown: false };
  return {
    // the server's own shape of an unverified row (met=false, unknown=true) with nextStageReady=true
    unknownRowHolds: decide([met, { key: 'patterns', met: false, unknown: true }]) === null,
    // even a row the server marks met AND unknown holds the milestone — the guard itself, not `met`
    unknownFlagItselfHolds: decide([met, { key: 'patterns', met: true, unknown: true }]) === null,
    // control: the same card with every row verified DOES advance, one step
    advancesWhenVerified: decide([met, { key: 'patterns', met: true, unknown: false }]) === 'TECH_CARD_STAGE_PROTO',
    // stale readiness (scored for a stage the card has left) never advances
    staleReadinessHolds: decide([met], { saved: 'TECH_CARD_STAGE_PROTO', form: 'TECH_CARD_STAGE_PROTO' }) === null,
    // already raised in the form, waiting for its save
    raisedInFormHolds: decide([met], { form: 'TECH_CARD_STAGE_PROTO' }) === null,
    // never two steps, never down
    neverSkips:
      decide([met], { readiness: { nextStage: 'TECH_CARD_STAGE_FIT' } }) === null &&
      decide([met], {
        saved: 'TECH_CARD_STAGE_FIT',
        form: 'TECH_CARD_STAGE_FIT',
        readiness: { currentStage: 'TECH_CARD_STAGE_FIT', nextStage: 'TECH_CARD_STAGE_PROTO' },
      }) === null,
    // an unmet row holds, whatever nextStageReady says
    unmetHolds: decide([met, { key: 'bom_fabric', met: false }]) === null,
    // aux card: its colourway row can never be met — it is dropped, not failed
    auxDropsColourwayRow:
      decide([met, { key: 'colorway_linked', met: false }], { isAux: true, readiness: { nextStageReady: false } }) ===
      'TECH_CARD_STAGE_PROTO',
  };
}

function promise3(mod) {
  const cur = {
    ...mod.techCardDefaultData,
    name: 'parka NOW',
    concept: 'concept NOW',
    notes: 'note NOW',
    garmentDescription: 'words NOW',
    stage: 'TECH_CARD_STAGE_FIT',
    styleNumber: 'ST-042',
    details: [
      { key: 'silhouette', text: 'boxy NOW', mediaIds: [5, 6] },
      { key: 'collar', text: 'added after the save', mediaIds: [] },
      { key: 'pockets', text: 'pockets NOW', mediaIds: [9] },
    ],
    bomItems: [{ id: 7, lineKey: 'L1', name: 'shell' }],
    callouts: [{ number: 1, text: 'callout' }],
  };
  const snap = mod.textSnapshotOf({
    name: 'parka THEN',
    concept: 'concept THEN',
    notes: 'note THEN',
    garmentDescription: 'words THEN',
    details: [
      { key: 'silhouette', text: 'boxy THEN', mediaIds: [1] },
      { key: 'hem', text: 'raw hem THEN', mediaIds: [2] },
    ],
  });
  const { next, changed } = mod.restoreTextSections(cur, snap);
  const TEXT = new Set(mod.TEXT_SECTIONS);
  const nonText = Object.keys(cur).filter((k) => !TEXT.has(k));
  const byKey = (k) => (next.details ?? []).find((d) => d.key === k);
  const out = {
    textRestored:
      next.name === 'parka THEN' &&
      next.concept === 'concept THEN' &&
      next.notes === 'note THEN' &&
      next.garmentDescription === 'words THEN',
    nonTextUntouched: nonText.every((k) => next[k] === cur[k]),
    changedIsText: changed.every((k) => TEXT.has(k)) && changed.length === 5,
    // the aspect's pictures stay CURRENT — the snapshot's picture list is not restored
    picturesStayCurrent:
      byKey('silhouette')?.text === 'boxy THEN' &&
      JSON.stringify(byKey('silhouette')?.mediaIds) === '[5,6]',
    // an aspect added after the snapshot: its text goes back to empty; with no pictures the row goes
    addedTextOnlyRowDropped: byKey('collar') === undefined,
    // an aspect with pictures keeps its row and pictures, only the text goes back
    rowWithPicturesKeepsThem:
      byKey('pockets')?.text === '' && JSON.stringify(byKey('pockets')?.mediaIds) === '[9]',
    // a text-only aspect deleted since the snapshot comes back, without pictures
    deletedAspectReturns: byKey('hem')?.text === 'raw hem THEN' && JSON.stringify(byKey('hem')?.mediaIds) === '[]',
  };
  // An absent WORDS (null in the snapshot) is never turned into a command to clear it.
  const absent = mod.restoreTextSections(cur, { ...snap, garmentDescription: null });
  out.absentWordsNotWritten = absent.next.garmentDescription === 'words NOW';
  // Restoring the current text is a no-op.
  const same = mod.restoreTextSections(cur, mod.textSnapshotOf(cur));
  out.currentIsNoop = same.changed.length === 0;
  return out;
}

// ─── прогон ─────────────────────────────────────────────────────────────────────────────────
let fail = 0;
const report = (title, results, mustFail = []) => {
  for (const [name, ok] of Object.entries(results)) {
    const expected = !mustFail.includes(name);
    const good = ok === expected;
    if (!good) fail++;
    const tag = mustFail.includes(name) ? (ok ? '✗ STILL GREEN on mutant' : '✓ red on mutant') : ok ? '✓' : '✗';
    if (!good || mustFail.includes(name)) console.log(`${tag}  ${title} · ${name}`);
    else console.log(`${tag}  ${title} · ${name}`);
  }
};

const real = await load('none');
report('(1) autosave', await promise1(real));
report('(2) auto-stage', promise2(real));
report('(3) restore', promise3(real));
// sanity for the shortcut: ⌘S on a Russian layout gives e.key 'ы' — the physical key decides
const kb = real.isSaveShortcut;
report('keyboard', {
  cmdS: kb({ metaKey: true, ctrlKey: false, altKey: false, code: 'KeyS', key: 's' }),
  ctrlS: kb({ metaKey: false, ctrlKey: true, altKey: false, code: 'KeyS', key: 's' }),
  cmdS_ruLayout: kb({ metaKey: true, ctrlKey: false, altKey: false, code: 'KeyS', key: 'ы' }),
  plainS_isNot: !kb({ metaKey: false, ctrlKey: false, altKey: false, code: 'KeyS', key: 's' }),
});

console.log('\n── negative controls (mutants): the named check MUST turn red ──');
report('(1) mutant debounce0', await promise1(await load('debounce0')), ['notBefore2s', 'firesAt2s', 'savedStatus', 'restartsOnEachEdit', 'oneWriteAfterQuiet']);
report('(1) mutant noValidate', await promise1(await load('noValidate')), ['noWriteWhileInvalid', 'invalidStatus', 'writesOnceFixed']);
report('(2) mutant noUnknownGuard', promise2(await load('noUnknownGuard')), ['unknownFlagItselfHolds']);
report('(3) mutant restoreDropsPictures', promise3(await load('restoreDropsPictures')), ['picturesStayCurrent', 'rowWithPicturesKeepsThem']);
report('(3) mutant restoreKeepsEmptyRows', promise3(await load('restoreKeepsEmptyRows')), ['addedTextOnlyRowDropped']);

console.log(fail === 0 ? '\nALL GREEN (real code) · ALL MUTANTS CAUGHT' : `\n${fail} UNEXPECTED RESULT(S)`);
process.exit(fail === 0 ? 0 : 1);
