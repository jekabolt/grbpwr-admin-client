#!/usr/bin/env node
// Прогон общих кейсов сборочного графа через КЛИЕНТСКИЙ порт движка.
//
// Зачем он есть. Правила фронтира существуют в двух реализациях — Go на сервере и TS здесь, —
// и разойтись им нельзя: пикер обязан предлагать ровно то, что примет запись, иначе клиент
// разрешает то, что сервер отвергнет. Единственное, что их держит вместе, — общий файл кейсов,
// побайтная копия бэкендного `internal/entity/testdata/assembly_cases.json`.
//
// Раннера тестов в этом репозитории нет (см. CLAUDE.md), поэтому — probe по домовой идиоме:
// esbuild бандлит TS-модуль во временный файл, скрипт его импортирует и сверяет.
//
//   node scripts/assembly-cases-probe.mjs
//
// Копия кейсов сверяется с бэкендной ЗДЕСЬ ЖЕ, если бэкенд лежит рядом: разъехавшиеся наборы —
// это и есть тот дефект, ради предотвращения которого файл общий.

import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const modulePath = resolve(root, 'src/components/managers/tech-card/components/assembly-frontier.ts');
const casesPath = resolve(root, 'src/components/managers/tech-card/components/assembly_cases.json');
const backendCases = resolve(
  root,
  '../grbpwr-wt-assembly/internal/entity/testdata/assembly_cases.json',
);

const outfile = resolve(tmpdir(), `assembly-frontier-${process.pid}.mjs`);
await build({
  entryPoints: [modulePath],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
});
const mod = await import(pathToFileURL(outfile).href);

const raw = JSON.parse(await readFile(casesPath, 'utf8'));

// --- сверка копии с бэкендной ------------------------------------------------------------------
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
let hashNote = 'бэкенд рядом не найден — сверка копии пропущена';
try {
  const mine = sha(await readFile(casesPath));
  const theirs = sha(await readFile(backendCases));
  hashNote =
    mine === theirs
      ? 'копия кейсов совпадает с бэкендной побайтно'
      : `РАСХОЖДЕНИЕ КОПИЙ: ${mine.slice(0, 12)} против ${theirs.slice(0, 12)} — наборы разъехались`;
  if (mine !== theirs) process.exitCode = 1;
} catch {
  /* бэкенд не рядом — не повод падать */
}

// --- прогон -------------------------------------------------------------------------------------
// Счётчик считает КЕЙСЫ, а не отказы: у одного кейса их может быть несколько, и «17/17» при
// трёх падениях внутри одного было бы отчётом, который врёт.
const failedCases = new Set();
const fail = (name, msg) => {
  failedCases.add(name);
  console.log(`FAIL  ${name}\n      ${msg}`);
};
const eqArr = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

for (const c of raw.cases) {
  const pieces = (c.pieces ?? []).map((p) => ({ lineKey: p.lineKey, name: p.name }));
  const pieceKeys = new Set(pieces.map((p) => p.lineKey));
  const steps = (c.steps ?? []).map((s) => ({
    inputs: mod.classifyAssemblyInputs(pieceKeys, s.inputs ?? []),
    outputUnitKey: s.output ?? '',
    outputUnitName: s.outputName ?? '',
  }));

  const res = mod.assemblySweep(pieces, steps);

  const wantV = c.expectViolations ?? [];
  if (res.violations.length !== wantV.length) {
    fail(
      c.name,
      `нарушений ${res.violations.length}, ожидалось ${wantV.length}: ` +
        res.violations.map((v) => `${v.rule}/${v.detail}@${v.step}`).join(', '),
    );
  } else {
    wantV.forEach((w, i) => {
      const g = res.violations[i];
      if (g.rule !== w.rule || g.step !== w.step || g.input !== w.input) {
        fail(c.name, `нарушение ${i}: {${g.rule},${g.step},${g.input}} против {${w.rule},${w.step},${w.input}}`);
      } else if (g.detail !== w.detail) {
        // Ветка — то, ради чего detail вообще существует: координаты у «такого нет» и
        // «появится позже» одинаковые.
        fail(c.name, `нарушение ${i}: ветка ${g.detail}, ожидалась ${w.detail}`);
      } else if (!g.message) {
        fail(c.name, `нарушение ${i} без сообщения`);
      }
    });
  }

  if (!eqArr(res.frontier, c.expectFrontier)) {
    fail(c.name, `фронтир ${JSON.stringify(res.frontier)}, ожидался ${JSON.stringify(c.expectFrontier)}`);
  }

  if (c.expectFrontierBefore) {
    c.expectFrontierBefore.forEach((want, i) => {
      if (!eqArr(res.frontierBefore[i], want)) {
        fail(
          c.name,
          `фронтир перед шагом ${i}: ${JSON.stringify(res.frontierBefore[i])}, ожидался ${JSON.stringify(want)}`,
        );
      }
    });
  }

  if (c.expectUnits) {
    if (res.units.size !== c.expectUnits.length) {
      fail(c.name, `узлов ${res.units.size}, ожидалось ${c.expectUnits.length}`);
    }
    for (const want of c.expectUnits) {
      const got = res.units.get(want.key);
      if (!got) {
        fail(c.name, `узел ${want.key} не создан`);
        continue;
      }
      if (got.name !== want.name) fail(c.name, `узел ${want.key}: имя «${got.name}», ожидалось «${want.name}»`);
      if (got.producedAt !== want.producedAt)
        fail(c.name, `узел ${want.key}: производитель ${got.producedAt}, ожидался ${want.producedAt}`);
      if (!eqArr(got.absorbedAt, want.absorbedAt))
        fail(c.name, `узел ${want.key}: поглощения ${JSON.stringify(got.absorbedAt)}`);
      if (!eqArr(got.leaves, want.leaves))
        fail(c.name, `узел ${want.key}: замыкание ${JSON.stringify(got.leaves)}, ожидалось ${JSON.stringify(want.leaves)}`);
    }
  }

  const rel = mod.assemblyReleaseCheck(pieces, steps, res);
  const wantR = c.expectRelease ?? [];
  if (rel.length !== wantR.length) {
    fail(c.name, `отказов релиза ${rel.length}, ожидалось ${wantR.length}: ${rel.map((v) => v.detail).join(', ')}`);
  } else {
    wantR.forEach((w, i) => {
      if (rel[i].rule !== w.rule) fail(c.name, `отказ релиза ${i}: правило ${rel[i].rule}`);
      else if (rel[i].detail !== w.detail)
        fail(c.name, `отказ релиза ${i}: ветка ${rel[i].detail}, ожидалась ${w.detail}`);
    });
  }
}

console.log(`\n${hashNote}`);
console.log(`${raw.cases.length - failedCases.size}/${raw.cases.length} кейсов прошло`);
if (failedCases.size) process.exitCode = 1;
