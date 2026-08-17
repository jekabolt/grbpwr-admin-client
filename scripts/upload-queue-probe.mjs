#!/usr/bin/env node
// Ф2 · ЗОНД ОЧЕРЕДИ ЗАГРУЗКИ — против очереди, которая врёт молча.
//
// Вопрос зонда: доказать восемь исходов строки и переходы между ними БЕЗ браузера.
// Половина исходов на живой бете не воспроизводится по требованию: обрыв связи ровно на 41%,
// отказ сервера ровно на 88%, дубликат, файл на 412 МБ. Их проверяют выдёргиванием кабеля и
// верой — то есть не проверяют. Поэтому сеть у очереди — инъектируемая зависимость, и здесь
// на подделке гоняется НАСТОЯЩАЯ машина: тот же `createUploadEngine`, что в сторе.
//
// Что доказывается:
//   1. постановка в очередь   — три исхода назначаются до единого отправленного байта;
//   2. предел 95 MiB          — `big` режется на клиенте и в сеть не уходит; предел один
//                               и тот же у машины и у сервисного модуля;
//   3. превью                 — свой канал: строится параллельно чужой отправке, провал
//                               рендера не мешает файлу уехать;
//   4. один канал сети        — файлы уходят по одному, в порядке постановки;
//   5. дубликат               — вскрывается ТОЛЬКО на 100% и НИ РАЗУ раньше;
//   6. обрыв ≠ отказ          — status 0 против кода сервера, разные тексты;
//   7. повтор                 — всегда с нуля, попытка считается;
//   8. отмена                 — обрывает XHR, не оставляет ложного «обрыва», очередь едет;
//   9. действия строк         — ровно те, что осмысленны в состоянии;
//  10. слова                  — сводка несёт все исходы, склонение честное;
//  11. наследование тем       — пачка забирает чипы холста, вторая пачка первую не трогает;
//  12. опоздавшие события     — ответ по убранной строке ничего не ломает.
import { build as esbuild } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `upload-queue-probe-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'upload-queue-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  alias: {
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'),
    utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'),
    constants: resolve(REPO, 'src/constants'),
  },
});
const m = await import(pathToFileURL(outfile).href);

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const eq = (a, b, what) => ck(JSON.stringify(a) === JSON.stringify(b), what, JSON.stringify(a));

/* ── стенд ────────────────────────────────────────────────────────────────────────────── */

const MB = 1024 * 1024;
const src = (name, size, type = '') => ({ name, size, type });
const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Подделка сети: ничего не отправляет, но отдаёт ровно тот контракт, что и XHR — прогресс,
 * успех, отказ с кодом и реакцию на abort. Каждый вызов остаётся под рукой, поэтому исход
 * назначается ЗОНДОМ, а не таймером: состояния стоят на месте, пока их рассматривают.
 */
function fakeNet() {
  const uploads = [];
  const previews = [];
  return {
    uploads,
    previews,
    buildPreview(source) {
      let settle;
      const p = new Promise((res, rej) => {
        settle = { ok: res, no: rej };
      });
      previews.push({ source, ...settle });
      return p;
    },
    upload(req) {
      const rec = { req, aborted: false };
      const p = new Promise((res, rej) => {
        rec.ok = res;
        rec.no = rej;
      });
      req.signal.addEventListener('abort', () => {
        rec.aborted = true;
        rec.no(new m.UploadError(0, 'aborted'));
      });
      uploads.push(rec);
      return p;
    },
  };
}

function harness(opts = {}) {
  const net = fakeNet();
  const snaps = [];
  const engine = m.createUploadEngine({
    transport: net,
    cap: opts.cap ?? m.DEFAULT_MAX_UPLOAD_BYTES,
    onChange: (s) => snaps.push(JSON.parse(JSON.stringify(s))),
  });
  return {
    net,
    engine,
    snaps,
    rows: () => engine.state().rows,
    at: (i) => engine.state().rows[i],
    st: () => engine.state().rows.map((r) => r.status),
  };
}

const NO_TOPICS = { topicIds: [], newTopics: [] };

/* ── 1 · ПОСТАНОВКА В ОЧЕРЕДЬ ─────────────────────────────────────────────────────────── */

console.log('\n1 · постановка в очередь: исход назначен до единого отправленного байта');
{
  const h = harness();
  h.engine.enqueue(
    [
      src('IMG_4821 (1).jpg', 2 * MB, 'image/jpeg'),
      src('bracket.step', 700 * 1024, 'application/step'),
      src('archive.zip', 412 * MB, 'application/zip'),
    ],
    { topicIds: [7, 3], newTopics: [] },
  );
  eq(h.st(), ['prev', 'run', 'big'], 'картинка строит превью, .step уже едет, 412 МБ отрезан');
  // Имя не «причёсывается»: `tidyFileName` съедает числовой хвост камеры (IMG_4821 → IMG), а
  // в полосе нет поля, где человек это увидел бы и поправил.
  ck(h.at(0).name === 'IMG_4821 (1).jpg', 'имя файла взято буквально', h.at(0).name);
  ck(h.net.uploads.length === 1, 'в сеть ушла ровно одна строка', String(h.net.uploads.length));
  ck(
    h.net.uploads.every((u) => u.req.source.name !== 'archive.zip'),
    'слишком большой файл в сеть не уходил ни разу',
  );
  eq(h.at(2).topicIds, [7, 3], 'темы пачки достались и отрезанной строке — она видна в полосе');
  ck(h.at(2).progress === 0 && m.barFraction(h.at(2)) === 0, 'у big полоска пуста: байт не ушёл');
  eq(m.rowActions(h.at(2)), ['dismiss'], 'у big одно действие — убрать');
}

/* ── 2 · ПРЕДЕЛ ───────────────────────────────────────────────────────────────────────── */

console.log('\n2 · предел 95 MiB: один и тот же у машины и у сервисного модуля');
{
  ck(m.DEFAULT_MAX_UPLOAD_BYTES === 95 * 1024 * 1024, 'предел машины — 95 MiB');
  eq(m.classifySize(95 * MB, m.DEFAULT_MAX_UPLOAD_BYTES), 'ok', 'ровно предел проходит');
  eq(m.classifySize(95 * MB + 1, m.DEFAULT_MAX_UPLOAD_BYTES), 'big', 'предел + 1 байт — не проходит');

  // Предел живёт в двух местах: у машины (значение по умолчанию) и в filesService, откуда его
  // берёт стор. Разъехавшись, они дадут отказ 413 после минут отправки — то самое, ради чего
  // проверка вообще стоит на клиенте.
  const service = await readFile(
    resolve(REPO, 'src/components/managers/files/api/filesService.ts'),
    'utf8',
  );
  const mb = service.match(/MAX_UPLOAD_BYTES\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/);
  ck(Boolean(mb), 'в filesService нашёлся MAX_UPLOAD_BYTES');
  if (mb) {
    ck(
      Number(mb[1]) * MB === m.DEFAULT_MAX_UPLOAD_BYTES,
      'предел filesService совпал с пределом машины',
      `${mb[1]} MiB`,
    );
  }
}

/* ── 3 · ПРЕВЬЮ — СВОЙ КАНАЛ ──────────────────────────────────────────────────────────── */

console.log('\n3 · превью: строится параллельно чужой отправке и не держит очередь');
{
  const h = harness();
  h.engine.enqueue(
    [src('look.pdf', 4 * MB, 'application/pdf'), src('part.step', 1 * MB, '')],
    NO_TOPICS,
  );
  eq(h.st(), ['prev', 'run'], 'pdf рисуется, .step едет — каналы независимы');
  ck(h.net.previews.length === 1 && h.net.uploads.length === 1, 'по одному занятому каналу');

  h.net.previews[0].ok({ preview: true });
  await tick();
  eq(h.st(), ['wait', 'run'], 'превью готово — строка встала в очередь, но сеть занята');
  ck(h.net.uploads.length === 1, 'вторая отправка не началась: файлы уходят по одному');

  h.net.uploads[0].ok({ fileId: 51, duplicates: [] });
  await tick();
  eq(h.st(), ['run', 'done'], 'освободилась сеть — поехал pdf');
  ck(h.net.uploads[1].req.preview !== null, 'превью уехало вместе с файлом');
  ck(h.at(0).hasPreview === true, 'строка помнит, что превью есть');
}
{
  const h = harness();
  h.engine.enqueue([src('broken.pdf', 3 * MB, 'application/pdf')], NO_TOPICS);
  h.net.previews[0].no(new Error('pdfjs не осилил'));
  await tick();
  eq(h.st(), ['run'], 'провал рендера превью не отменяет отправку — файл годен и без картинки');
  ck(h.at(0).hasPreview === false, 'строка честно говорит, что превью нет');
  ck(h.net.uploads[0].req.preview === null, 'в запрос уехал null, а не мусор');
}

/* ── 4 · ОДИН КАНАЛ СЕТИ ──────────────────────────────────────────────────────────────── */

console.log('\n4 · сеть: по одному файлу, в порядке постановки');
{
  const h = harness();
  h.engine.enqueue([src('a.step', 1), src('b.step', 1), src('c.step', 1)], NO_TOPICS);
  eq(h.st(), ['run', 'wait', 'wait'], 'едет только первый');
  ck(m.UPLOAD_CONCURRENCY === 1, 'канал объявлен один');
  const order = [];
  for (let i = 0; i < 3; i++) {
    order.push(h.net.uploads[i].req.source.name);
    h.net.uploads[i].ok({ fileId: 100 + i, duplicates: [] });
    await tick();
  }
  eq(order, ['a.step', 'b.step', 'c.step'], 'порядок отправки — порядок постановки');
  eq(h.st(), ['done', 'done', 'done'], 'вся пачка уехала');
  ck(m.isQueueSettled(h.engine.state()), 'очередь в покое');
  ck(m.canHideBar(h.engine.state()), 'полосу можно убрать только теперь');
}

/* ── 5 · ДУБЛИКАТ ─────────────────────────────────────────────────────────────────────── */

console.log('\n5 · дубликат: вскрывается только на 100% — sha256 считает сервер');
{
  const h = harness();
  h.engine.enqueue([src('same.jpg', 2 * MB, 'image/jpeg')], { topicIds: [4], newTopics: ['съёмка'] });
  h.net.previews[0].ok({ preview: true });
  await tick();
  // Последнее событие прогресса до 100% может и не прийти — XHR его не гарантирует. Ответ
  // сервера приходит на 40%: если строка так и останется на 40%, полоска будет говорить,
  // что файл не доехал, хотя доехал целиком.
  h.net.uploads[0].req.onProgress(0.4);
  eq(h.st(), ['run'], 'пока ответа сервера нет — строка «идёт», что бы ни говорил прогресс');
  h.net.uploads[0].ok({ fileId: 12, duplicates: [{ id: 9, name: 'IMG_4821.jpg' }] });
  await tick();
  eq(h.st(), ['dup'], 'ответ сервера вскрыл дубликат');
  ck(h.at(0).progress === 1, 'дубликат стоит ровно на 100%', String(h.at(0).progress));
  eq(h.at(0).duplicateOf, { id: 9, name: 'IMG_4821.jpg' }, 'оригинал назван — «показать тот файл»');
  eq(h.at(0).topicIds, [4], 'темы пачки при строке остались — «дать ему темы» есть что дать');
  eq(h.at(0).newTopics, ['съёмка'], 'и новые темы тоже');
  eq(
    m.rowActions(h.at(0)),
    ['reveal', 'assignTopics', 'dismiss'],
    'три действия дубликата',
  );
  ck(m.statusTone(h.at(0)) === 'ink', 'дубликат нейтрального тона, не тревожного');

  // Главное утверждение раздела — про ВСЮ историю, а не про конечное состояние.
  const early = h.snaps.flatMap((s) => s.rows).filter((r) => r.status === 'dup' && r.progress < 1);
  ck(early.length === 0, 'ни в одном кадре дубликат не показан раньше 100%', String(early.length));
}

/* ── 6 · ОБРЫВ ≠ ОТКАЗ ────────────────────────────────────────────────────────────────── */

console.log('\n6 · обрыв связи и отказ сервера — разные исходы с разными текстами');
{
  eq(m.failureKind(0), 'lost', 'status 0 — связь');
  eq(m.failureKind(500), 'fail', '500 — сервер');
  eq(m.failureKind(413), 'fail', '413 — сервер');
  eq(m.failureKind(403), 'fail', '403 — сервер');
  eq(m.statusOf(new m.UploadError(500, 'x')), 500, 'код достаётся из ошибки транспорта');
  eq(m.statusOf(new Error('оборвалось')), 0, 'ошибка без кода читается как обрыв');

  // Без превью у обеих строк — тогда порядок отправки совпадает с порядком строк и «первый
  // вызов сети» означает «первая строка».
  const h = harness();
  h.engine.enqueue([src('scan.step', 8 * MB), src('clip.mp4', 20 * MB, 'video/mp4')], NO_TOPICS);
  h.net.uploads[0].req.onProgress(0.41);
  h.net.uploads[0].no(new m.UploadError(0, 'connection dropped'));
  await tick();
  eq(h.st(), ['lost', 'run'], 'обрыв на первой, очередь поехала дальше');
  ck(h.at(0).progress === 0.41, 'проценты обрыва сохранены — человек их видел', String(h.at(0).progress));
  eq(h.at(0).failure.kind, 'lost', 'исход записан');

  h.net.uploads[1].req.onProgress(0.88);
  h.net.uploads[1].no(new m.UploadError(500, 'internal'));
  await tick();
  eq(h.st(), ['lost', 'fail'], 'отказ сервера — другой исход');
  eq(h.at(1).failure.status, 500, 'код ответа сохранён — по нему пишется текст');

  const lost = m.rowWhy(h.at(0));
  const fail = m.rowWhy(h.at(1));
  ck(lost.includes('связь оборвалась на 41%'), 'текст обрыва называет проценты', lost);
  ck(lost.includes('сервер файл не получил'), 'и говорит, что на сервере файла нет');
  ck(fail.includes('сервер ответил 500'), 'текст отказа называет код', fail);
  ck(lost !== fail, 'тексты разные');
  eq(m.rowActions(h.at(0)), ['retry'], 'у обрыва одно действие');
  eq(m.rowActions(h.at(1)), ['retry'], 'и у отказа то же');
  ck(m.canHideBar(h.engine.state()), 'отказы не держат полосу: живого ничего не осталось');
}

/* ── 7 · ПОВТОР ───────────────────────────────────────────────────────────────────────── */

console.log('\n7 · повтор всегда с нуля: докачки у multipart нет');
{
  const h = harness();
  h.engine.enqueue([src('IMG_4830.jpg', 8 * MB, 'image/jpeg')], NO_TOPICS);
  h.net.previews[0].ok(null);
  await tick();
  h.net.uploads[0].req.onProgress(0.41);
  h.net.uploads[0].no(new m.UploadError(0, 'dropped'));
  await tick();
  ck(h.at(0).tries === 1, 'попытка засчитана', String(h.at(0).tries));

  h.engine.retry(h.at(0).id);
  eq(h.st(), ['run'], 'повтор сразу поехал: сеть свободна');
  ck(h.at(0).progress === 0, 'проценты обнулены — 41% никуда не «сохранились»', String(h.at(0).progress));
  ck(h.at(0).tries === 2, 'вторая попытка засчитана', String(h.at(0).tries));
  ck(h.at(0).failure === undefined, 'прошлый отказ стёрт — иначе строка носила бы два исхода');
  ck(h.net.uploads.length === 2, 'ушёл второй запрос');
  // Ни в одном кадре после повтора не было «идёт» с процентами прошлой попытки.
  const after = h.snaps.slice(h.snaps.findIndex((s) => s.rows[0].status === 'lost') + 1);
  ck(
    after.every((s) => !(s.rows[0].status === 'run' && s.rows[0].progress > 0.4)),
    'после повтора проценты не подскочили к прошлым',
  );
  h.net.uploads[1].ok({ fileId: 77, duplicates: [] });
  await tick();
  eq(h.st(), ['done'], 'со второй попытки уехало');
}
{
  const h = harness();
  h.engine.enqueue([src('a.step', 1), src('b.step', 1)], NO_TOPICS);
  h.net.uploads[0].no(new m.UploadError(500, 'x'));
  await tick();
  h.net.uploads[1].no(new m.UploadError(0, 'x'));
  await tick();
  eq(h.st(), ['fail', 'lost'], 'оба не ушли');
  h.engine.retryAll();
  eq(h.st(), ['run', 'wait'], 'повторить всё — снова по одному, а не оба разом');
  eq(
    h.engine.state().rows.map((r) => r.progress),
    [0, 0],
    'обе строки с нуля',
  );
}

/* ── 8 · ОТМЕНА ───────────────────────────────────────────────────────────────────────── */

console.log('\n8 · отмена: обрывает отправку, не оставляет ложного отказа, очередь едет');
{
  const h = harness();
  h.engine.enqueue([src('a.step', 1), src('b.step', 1)], NO_TOPICS);
  h.net.uploads[0].req.onProgress(0.6);
  const id = h.at(0).id;
  h.engine.cancel(id);
  await tick();
  ck(h.net.uploads[0].aborted, 'XHR получил abort — байты перестали уходить');
  eq(
    h.engine.state().rows.map((r) => r.name),
    ['b.step'],
    'отменённая строка исчезла',
  );
  eq(h.st(), ['run'], 'следующая поехала сама');
  const ghost = h.snaps.flatMap((s) => s.rows).filter((r) => r.id === id && m.isFailed(r.status));
  ck(ghost.length === 0, 'отмена НЕ показана как обрыв связи', String(ghost.length));
}
{
  const h = harness();
  h.engine.enqueue([src('look.pdf', 2 * MB, 'application/pdf')], NO_TOPICS);
  h.engine.cancel(h.at(0).id);
  eq(h.rows(), [], 'строку можно отменить и на стадии превью');
  h.net.previews[0].ok({ preview: true });
  await tick();
  eq(h.rows(), [], 'опоздавшее превью не воскрешает строку');
  ck(h.net.uploads.length === 0, 'отменённая на превью строка в сеть не ушла');
}

/* ── 8b · ОТМЕНА НЕ ОТКРЫВАЕТ ВТОРОЙ PDFJS ────────────────────────────────────────────── */

// ЗАМЕРЕНО НА ЖИВОМ ЭКРАНЕ: три pdf давали один рендер, после отмены первой строки — два
// параллельных, после второй — три. Рендер отменённой строки продолжает крутиться (pdfjs не
// умеет отменяться), а занятость канала считалась по строкам ОЧЕРЕДИ — которых уже нет.
// Десять тяжёлых pdf и пять отмен подряд кладут вкладку колом.
console.log('\n8b · отмена строки не снимает ограничение «один pdfjs за раз»');
{
  const h = harness();
  const pdf = (n) => src(`${n}.pdf`, 3 * MB, 'application/pdf');
  h.engine.enqueue([pdf('a'), pdf('b'), pdf('c')], NO_TOPICS);
  ck(h.net.previews.length === 1, 'три pdf — один рендер', String(h.net.previews.length));

  h.engine.cancel(h.at(0).id);
  await tick();
  ck(
    h.net.previews.length === 1,
    'отмена строки, чей рендер ещё крутится, НЕ запускает второй параллельно',
    String(h.net.previews.length),
  );
  h.engine.cancel(h.at(0).id);
  await tick();
  ck(h.net.previews.length === 1, 'и вторая отмена тоже: канал занят, пока рендер не кончится',
    String(h.net.previews.length));

  // Но канал обязан ОТПУСТИТЬСЯ, когда рендер отменённой строки всё-таки доедет: иначе
  // очередь встала бы навсегда, что не лучше трёх параллельных.
  h.net.previews[0].ok({ preview: true });
  await tick();
  ck(h.net.previews.length === 2, 'доехавший рендер отменённой строки отпустил канал',
    String(h.net.previews.length));
  eq(h.st(), ['prev'], 'осталась одна строка — она и рисуется');
}

/* ── 9 · ДЕЙСТВИЯ СТРОК ───────────────────────────────────────────────────────────────── */

console.log('\n9 · действия строки — ровно те, что осмысленны');
{
  const row = (status, extra = {}) => ({
    id: 'q1',
    name: 'x',
    size: 1,
    contentType: '',
    status,
    progress: 0,
    tries: 0,
    topicIds: [],
    newTopics: [],
    hasPreview: false,
    ...extra,
  });
  eq(m.rowActions(row('wait')), ['cancel'], 'ждущую — отменить');
  eq(m.rowActions(row('prev')), ['cancel'], 'строящую превью — отменить');
  eq(m.rowActions(row('run')), ['cancel'], 'едущую — отменить');
  eq(m.rowActions(row('done')), ['dismiss'], 'уехавшую — убрать');
  eq(m.rowActions(row('big')), ['dismiss'], 'слишком большую — убрать');
  eq(m.rowActions(row('lost')), ['retry'], 'обрыв — повторить');
  eq(m.rowActions(row('fail')), ['retry'], 'отказ — повторить');
  eq(m.rowActions(row('dup')), ['reveal', 'assignTopics', 'dismiss'], 'дубликат — три');
  eq(m.barFraction(row('done')), 1, 'у done полоска полная');
  eq(m.barFraction(row('dup')), 1, 'у dup тоже: файл уехал целиком');
  eq(m.barFraction(row('big')), 0, 'у big пустая');
  eq(m.barFraction(row('run', { progress: 0.63 })), 0.63, 'у run — сколько ушло');
}

/* ── 10 · СЛОВА ───────────────────────────────────────────────────────────────────────── */

console.log('\n10 · сводка: свёрнутая полоса несёт все исходы словами');
{
  const mk = (status, i) => ({
    id: `q${i}`,
    name: `f${i}`,
    size: 1,
    contentType: '',
    status,
    progress: status === 'run' ? 0.63 : 0,
    tries: 1,
    topicIds: [],
    newTopics: [],
    hasPreview: false,
  });
  const all = {
    rows: ['done', 'done', 'done', 'run', 'prev', 'wait', 'big', 'dup', 'lost', 'fail'].map(mk),
    seq: 10,
  };
  const line = m.summaryLine(all);
  ck(
    line === 'готово 4 из 9 · идёт 1 · превью 1 · в очереди 1 · 1 обрыв · 1 отказ · 1 дубликат · 1 не пролезет',
    'все восемь исходов в одной строке; из знаменателя вынут только big — он в сеть не уходил',
    line,
  );
  ck(m.summaryLine(m.createQueue()) === 'очередь пуста', 'пустая очередь говорит это прямо');

  eq(m.plural(1, 'обрыв', 'обрыва', 'обрывов'), 'обрыв', '1 обрыв');
  eq(m.plural(2, 'обрыв', 'обрыва', 'обрывов'), 'обрыва', '2 обрыва');
  eq(m.plural(5, 'обрыв', 'обрыва', 'обрывов'), 'обрывов', '5 обрывов');
  eq(m.plural(11, 'обрыв', 'обрыва', 'обрывов'), 'обрывов', '11 обрывов — не «обрыв»');
  eq(m.plural(21, 'обрыв', 'обрыва', 'обрывов'), 'обрыв', '21 обрыв');

  ck(m.statusLabel(mk('run', 1)) === 'отправка 63%', 'проценты в метке', m.statusLabel(mk('run', 1)));
  ck(m.statusLabel(mk('dup', 1)) === 'дубликат', 'дубликат назван словом');
  const sum = m.batchSummary(all, ['съёмка', 'лукбук']);
  ck(sum.includes('отправлено 4 из 9'), 'итог считает всю пачку', sum);
  ck(sum.includes('темы: съёмка, лукбук'), 'итог называет темы');

  // ОДИН РЕЗУЛЬТАТ — ОДНА ПАРА ЧИСЕЛ. Свёрнутая полоса печатает сводку, а ушедшему со страницы
  // тот же исход достаётся тостом. Разойтись им нельзя: «готово 3 из 8» против «отправлено
  // 3 из 10» — это два разных ответа на один вопрос, и оба видит один и тот же человек за
  // одну минуту. Дубликат при этом СОХРАНЁН второй копией — значит он доехал и считается.
  const pair = (s) => (s.match(/(\d+) из (\d+)/) ?? []).slice(1).join('/');
  ck(
    pair(line) !== '' && pair(line) === pair(sum),
    'сводка полосы и итог пачки называют одни и те же числа',
    `полоса ${pair(line)} против итога ${pair(sum)}`,
  );
  ck(pair(sum) === '4/9', 'дубликат посчитан доехавшим, слишком большой — нет', pair(sum));
  ck(
    m.batchSummary(all, []).includes('без тем — уехало в «разобрать»'),
    'пачка без тем сказана словами',
  );
  const strings = [
    line,
    sum,
    m.statusLabel(mk('wait', 1)),
    m.actionLabel('retry'),
    m.actionLabel('assignTopics'),
    m.rowWhy(mk('wait', 1)),
  ];
  ck(
    strings.every((s) => !/[A-Za-z]/.test(s.replace(/\d/g, ''))),
    'ни одной латинской буквы в словах для человека',
    strings.find((s) => /[A-Za-z]/.test(s.replace(/\d/g, ''))) ?? '',
  );
  ck(
    strings.every((s) => s === s.toLocaleLowerCase('ru')),
    'всё строчными',
    strings.find((s) => s !== s.toLocaleLowerCase('ru')) ?? '',
  );

  // ЕДИНИЦЫ РАЗМЕРА — ТОЖЕ СЛОВА ДЛЯ ЧЕЛОВЕКА. На одном экране стояли плитка «500 KB», оверлей
  // «до 95 мб» и строка «412 MB при пределе 95 MB»: три написания одной величины в одном
  // разделе. Р4 говорит по-русски и строчными — значит и «мб».
  const heavy = { ...mk('big', 11), size: 412 * MB };
  const flying = { ...mk('run', 12), size: 8 * MB, progress: 0.5 };
  const sized = [m.rowWhy(heavy), m.rowWhy(flying)];
  ck(
    sized.every((s) => !/[A-Za-z]/.test(s)),
    'ни KB, ни MB: единицы размера русские',
    sized.find((s) => /[A-Za-z]/.test(s)) ?? '',
  );
  ck(
    sized.every((s) => s === s.toLocaleLowerCase('ru')),
    'и они строчные, как весь раздел',
    sized.find((s) => s !== s.toLocaleLowerCase('ru')) ?? '',
  );
  ck(m.rowWhy(heavy).includes('412 мб'), 'размер назван целиком', m.rowWhy(heavy));
}

/* ── 11 · НАСЛЕДОВАНИЕ ТЕМ ────────────────────────────────────────────────────────────── */

console.log('\n11 · темы: пачка забирает чипы холста, вторая пачка первую не трогает');
{
  eq(
    m.inheritTopics([7, 7, 0, -1, 3], ['  съёмка ', 'Съёмка', '', 'лукбук']),
    { topicIds: [7, 3], newTopics: ['съёмка', 'лукбук'] },
    'повторы, нули и регистр схлопнуты',
  );
  ck(m.isUnsorted(m.inheritTopics([], [])), 'пустой выбор — «разобрать»');
  ck(!m.isUnsorted(m.inheritTopics([], ['новая'])), 'одна новая тема — уже не «разобрать»');

  const h = harness();
  h.engine.enqueue([src('a.step', 1), src('b.step', 1)], { topicIds: [7, 3], newTopics: [] });
  h.engine.enqueue([src('c.step', 1)], { topicIds: [9], newTopics: ['ткани'] });
  eq(
    h.engine.state().rows.map((r) => r.topicIds),
    [[7, 3], [7, 3], [9]],
    'у каждой строки темы СВОЕЙ пачки',
  );
  eq(h.at(2).newTopics, ['ткани'], 'новые темы второй пачки не протекли в первую');
  ck(h.net.uploads[0].req.topicIds.join() === '7,3', 'в запрос уехали темы своей пачки');

  h.engine.setTopics(h.at(1).id, [5], ['образцы']);
  eq(h.at(1).topicIds, [5], 'до отправки темы строки правятся (⌘V-модалка)');
  h.engine.setTopics(h.at(0).id, [1], []);
  eq(h.at(0).topicIds, [7, 3], 'у уехавшей строки темы уже не поменять');
  h.engine.rename(h.at(1).id, '  вставка 17.08 13:40.png ');
  ck(h.at(1).name === 'вставка 17.08 13:40.png', 'имя правится до отправки и обрезается');
  h.engine.rename(h.at(0).id, 'поздно');
  ck(h.at(0).name === 'a.step', 'имя уехавшей строки не переписать');
  h.net.uploads[0].ok({ fileId: 1, duplicates: [] });
  await tick();
  ck(h.net.uploads[1].req.name === 'вставка 17.08 13:40.png', 'уехало правленое имя');
}

/* ── 12 · ОПОЗДАВШИЕ СОБЫТИЯ ──────────────────────────────────────────────────────────── */

console.log('\n12 · опоздавшие и незаконные события не ломают состояние');
{
  const s0 = m.reduce(m.createQueue(), {
    type: 'enqueue',
    sources: [src('a.step', 1)],
    topics: NO_TOPICS,
    cap: m.DEFAULT_MAX_UPLOAD_BYTES,
  });
  const before = JSON.stringify(s0);
  ck(m.reduce(s0, { type: 'progress', id: 'нет-такой', fraction: 0.5 }) === s0, 'чужой id — то же состояние');
  ck(m.reduce(s0, { type: 'uploaded', id: 'q1', fileId: 1, duplicates: [] }) === s0, 'ответ по неотправленной строке отвергнут');
  ck(m.reduce(s0, { type: 'retry', id: 'q1' }) === s0, 'повторять нечего — состояние то же');
  ck(JSON.stringify(s0) === before, 'reduce ничего не мутировал по дороге');

  const running = m.reduce(s0, { type: 'start', id: 'q1' });
  ck(running !== s0, 'старт дал новое состояние');
  ck(s0.rows[0].status === 'wait', 'старое состояние не тронуто — reduce чист');
  const clamped = m.reduce(running, { type: 'progress', id: 'q1', fraction: 7 });
  ck(clamped.rows[0].progress === 1, 'проценты зажаты сверху');
  const nan = m.reduce(running, { type: 'progress', id: 'q1', fraction: NaN });
  ck(nan.rows[0].progress === 0, 'NaN не протёк в полоску');

  // «убрать всё отстоявшееся» не трогает ни живое, ни отказы: их ещё повторяют.
  const mixed = {
    rows: ['done', 'dup', 'big', 'lost', 'run'].map((status, i) => ({
      id: `q${i}`,
      name: `f${i}`,
      size: 1,
      contentType: '',
      status,
      progress: 0,
      tries: 0,
      topicIds: [],
      newTopics: [],
      hasPreview: false,
    })),
    seq: 5,
  };
  eq(
    m.reduce(mixed, { type: 'removeSettled' }).rows.map((r) => r.status),
    ['lost', 'run'],
    'убрано только отстоявшееся',
  );
  ck(m.hasLiveUploads(mixed), 'живая отправка видна стражу beforeunload');
  ck(!m.canHideBar(mixed), 'пока идёт отправка — полосу не убрать');
}

console.log(bad ? `\n${bad} расхождений\n` : '\nвсё сошлось\n');
process.exit(bad ? 1 : 0);
