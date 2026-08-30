# 03 — Спецификация кликабельного прототипа полосы DESIGN

Владелец: «делай готовый прототип кликабельный, а не пелену экранов». Этот файл — полная
спецификация для сборщика: один живой HTML, по которому флоу проходится мышкой от и до.
Сборщик не должен ничего додумывать; где макет и решения противоречат друг другу, здесь
записано, кто прав и почему. **Где этот файл противоречит `build-full.mjs` — прав этот файл;
где противоречит `02-DECISIONS.md` разделам G–J — правы G–J, и такие места названы явно.**

Термины: **band / лента** — секция «pictures on this card»; **bench / верстак** — слоты;
**sheet / лист** — сминченная версия Rev.N; **plate / плита** — картинка, стоящая в слоте.

---

## 0. Найденные логические разрывы и решения по ним

Это самая важная часть. Каждый пункт: разрыв → решение → почему.

**Р1. Кадры 05–08 (ARTIFACTS) собраны по устаревшей модели круга F.**
В них живут матрица версий `v1..v4`, две строки «изменить изделие / изменить подачу»,
кнопка «Принять как лист» и статус «принят как лист v3». Круг G прямо говорит: «Там версию
рождал прогон. Здесь — нет»; круг H убрал акт принятия («кнопку убрали»); круг I провёл
границу «BRIEF — верстак, ARTIFACTS — чистовик». → **Прототип НЕ переносит матрицу версий,
строки изменения и кнопку принятия.** ARTIFACTS строится заново из H/I: полоса представлений →
лист Rev.N (или черновик/чек-лист) → выноски → журнал выдач → расхождение верстака.
Экраны «сверка рендера» и «замена листа файлом» — вне прототипа (см. §5), их место занимают
честные двери с объяснением.

**Р2. У прогона есть подпись («higher stand»), но в макете BRIEF нет места, где её печатают.**
Строки дельты стояли на ARTIFACTS (круг F) и умерли вместе с ним. → **В форму генерации
добавляется одно необязательное поле `ask`** (placeholder: `what to change — becomes the run's
caption`). Пустое → подпись прогона `run N` без фразы; первый прогон карточки получает
подпись `from references`. Это единственный источник фраз в жёлобе ленты.

**Р3. Глагол `remove` на слоте с загруженной плитой противоречит J1/J2.**
Хинт кадра 01 («на загруженном флэте слот — единственное место, где он живёт») написан до J1;
кадр 02 сам себя опровергает: загрузки лежат строкой в ленте И несут `remove` на слоте.
→ **Глагол `remove` на слотах умирает. На любом заполненном слоте: `fix ▸` · `edit ▸` ·
`unmark`.** Удаление картинки — только на плитке ленты, глаголом «скрыть» (I3), с проверкой
зависимостей.

**Р4. Кадр 02 показывает полную форму параметров на карточке без прогонов — J5 это запрещает.**
→ **Форма параметров (матрица видов, layout, ask, fit, цена, бюджет) видима ⇔ в ленте есть
хоть одна строка `generated` ИЛИ нажата дверь `GENERATE ▸`** (`ui.paramsOpen`, транзиентный,
не переживает перезагрузку — «правило выводимое, без липкого состояния»). Пустая студия =
четыре пустых слота-цели + две равновесные двери `+ add files` и `GENERATE ▸`. Плашка
`.zerorun` из кадра 02 сливается с этим состоянием (её текст становится подписью студии).

**Р5. Дверь починки говорит от лица прогона (`generate BACK from run 5 ▸`) — J9.6 (MAJOR).**
→ Дверь формулируется от слота: **`fix BACK ▸`** — это режим фикса I6: вход = слоты, тот же
GENERATE, та же лента, та же цена. Отдельной кнопки «перегенерировать» нет нигде (G4).

**Р6. Вид, назначенный рамке в split-модалке: призрак или поставленная метка?**
G2: метку ставит клик в слот; но в инструменте разделения человек явно называет вид рамки.
→ **Разделение именует РАЗРЕЗ, а не постановку: кропы приходят в ленту с призрачной меткой
(`probably FRONT`), слот по-прежнему заполняется только кликом.** Иначе ломается инвариант
«сплошная метка ⇔ картинка в слоте» и запись в слот без штампа автора (G6.3).

**Р7. Перепиновка при минте Rev.N+1 нигде не была кликабельной, хотя это сердце C4/H3.8.**
→ Встраивается в диалог минта: если у новой ревизии есть выноски на ЗАМЕНЁННЫХ картинках,
диалог разворачивает список перепиновки; выноски на не изменившихся картинках переезжают
сами (та же картинка = тот же адрес, геометрия валидна). «Завершить» заперто, пока список
не пройден. Геометрия никогда не переносится между разными картинками.

**Р8. Блоку concept нечего читать до минта.** Кнопка «read sheet Rev.3 ▸» предполагает лист.
→ До первого минта кнопка задизейблена с причиной: `no sheet yet — the first callout on
ARTIFACTS mints Rev.1`. Предложения строятся ИЗ выносок текущей ревизии (см. §2.10), поэтому
источник у них честный и видимый. J7 (смерть блока диффа) касается прод-решения; прототип
сохраняет вариант «по явному действию» — вопрос владельцу из J7 остаётся открытым и записан.

**Р9. Номера выносок после удаления.** Перенумерация противоречила бы всей идее неподвижного
адреса. → **Номер минтится один раз (`calloutSeq++`), никогда не переиспользуется; после
удаления в списке остаётся дыра.** Список сортируется по номеру.

**Р10. `oversized` отсутствует в продовом `FIT_OPTIONS`** (H6.7, вопрос владельцу открыт).
→ Прототип оставляет значение макета и добавляет его в свой словарь фитов; словарь прототипа:
`regular | slim | loose | relaxed | oversized`. В спеке зафиксировано, что это НЕ ответ на
вопрос владельцу.

**Р11. Провенанс «нарисованного» флэта не выразим закрытым словарём** (`AI · uploaded ·
AI + edits · imported SVG`). → Словарь расширяется пятым членом **`drawn`**. Словарь всё ещё
закрыт — просто на один член больше, и это записано здесь, а не молча.

**Р12. Layout `one` при одном отмеченном виде вырождается.** Композит из одного вида —
бессмыслица. → Если отмечен ровно один вид, оба положения переключателя дают одинаковый
результат: обычная картинка с призраком, без двери `split`. Строка следствия под
переключателем говорит об этом: `only one view is asked — both layouts return one picture`.

**Р13. Призрак на загрузке («probably FRONT») не имеет источника.** В проде он придёт из
имени файла/vision. → В прототипе призрак следует выбору стенд-ина в модалке приёма, и модалка
говорит это словами (см. §2.14). Ничего не угадывается молча.

**Р14. Загрузка не тратит бюджет** (J10.2): строка `added` показывает мегабайты, не деньги;
знаменатель «цены за флэт» — только сгенерированные. В прототипе это инвариант И-17.

**Р15. Бросок файла в пустой слот — один жест, два факта** (J1): строка в ленте всегда +
пометка в слот со штампом автора. Дверь одна — лента; слот это та же дверь с бесплатной
пометкой.

**Р16. Фикс из смешанных слотов отмывает смесь** (I6). → Картинка-результат фикса, чей вход
был смешанным, несёт флаг `mixedInput`; встав в слот, она глушит красное предупреждение, но
оставляет серую пометку `from mixed input` в подвале слота. Ложной зелени нет.

**Р17. «Текущие» прогоны против «прежних»** (I8.3): дивайдер `pastline` ставится перед самой
новой строкой `generated`, чей снимок входов НЕ совпадает с нынешними входами; подпись
дивайдера несёт причину: `earlier — inputs have changed since`. Совпадение считается по
отпечатку: garmentNote + (role, note) референсов в порядке промпта + views + layout.

---

## 1. Архитектура прототипа (обвязка, не поведение)

- **Файлы**: `tmp/design-band/build-proto.mjs` → `tmp/design-band/proto.html`. Стили:
  существующие `style.css` + `full.css` подключаются как есть; всё новое — в `proto.css`
  (bar пресетов, inert-note, pick-mode, стенд-ин модалка). Ничего в `full.css` не редактировать.
- **Один `<div class="app">`** (не восемь), рельс/шапка/лайфцикл — те же органы `frame()`.
- **Рендер**: чистые функции макета (`refCell`, `vrow`, `runTile`, `runRow`, `slotFilled`,
  `drop`, `prv`, `conceptRow`) переносятся в клиентский `<script>` почти дословно — они уже
  функции от данных. `render(state)` пересобирает innerHTML контента целиком после каждого
  зафиксированного действия.
- **События**: делегирование на `document`; каждый живой контрол несёт `data-act="…"` (+
  `data-arg`); каждый намеренно мёртвый — `data-inert="причина"`. Клик по `data-inert`
  показывает плавающую однострочную заметку у курсора (2.5 с), например
  `not in this prototype — BOM lives on its own tab`. **Молча мёртвых контролов нет** (И-21).
- **Текстовые поля** коммитятся в state на blur/Enter (Esc — откат); во время набора
  ре-рендера нет. Тикающий счётчик идущего прогона обновляет только свой текстовый узел по id,
  полный рендер — по прилёте.
- **Пресеты**: полоса в `pagehead` (вне рамки приложения): `clean card` · `worked card` ·
  `reset`. `clean` = карточка, заполненная руками до картинок (идентификация, мудборд,
  референсы, записка), лента пуста, слоты пусты, Rev нет. `worked` = состояние кадра 01
  (см. пресеты в §1.2). Reset = повторная загрузка текущего пресета. Перезагрузка страницы =
  `clean`. Персистентности нет — и это сказано подсказкой на полосе пресетов.
- **Модалки**: один контейнер поверх приложения (`.mbackdrop` фиксированный), Esc и «cancel»
  закрывают; `state.ui.modal` — единственный источник того, что открыто.
- **Симуляция времени**: прогон «идёт» 5 секунд с тикающим счётчиком; в плашке написано
  `prototype: simulated · real ~25 s`. Прототип нигде не притворяется, что зовёт модель.

### 1.1 Гейт `qa-proto.mjs`

Наследует проверки `qa-full.mjs` (JS-ошибки, переполнение, горизонтальный скролл, хром,
рельс 150px, 13 табов, кегли) для обоих пресетов, плюс скриптованные пробы — по одной на
инвариант из §3, где это возможно (список обязательных проб — в §3, колонка «проба»).
Каждая проба — цитата + мутация: сначала утверждение о наличии органа, потом действие и
утверждение об изменении. Пустой список падений при упавшей сборке = провал гейта
(положительный контроль: проба №0 кликает по пресету `worked` и требует `SHEET Rev.1` в DOM).

### 1.2 Пресеты

`presetClean()`: карточка кадра 02 до первой загрузки — `runs:[]`, `pictures:[]`, слоты пусты,
`sheet.rev=0`, `concept.readAt=null`, `budget.spent=0`, refs — четыре штуки с ролями
front/back/side L/detail и записками из макета, мудборд — 4 плитки.

`presetWorked()`: состояние кадра 01, сведённое к минимуму, достаточному для плотных состояний:
- runs: `#1 added` (2 картинки: side L, front-призрак; 12.4 MB), `#2 generated «wider collar»`
  (back, front), `#4 generated «drop the hood»` (front, back, side, detail-cuff),
  `#5 generated «higher stand»` (front, side-призрак, back-призрак), `#7 generated
  «single-layer hood»` — композит `3 views`, не разделён. Цены по 0.04.
- slots: front←№5.front, back←№2.back, sideL←№1.sideL, sideR←null; details:
  `cuff`←№4.cuff, `kangaroo pocket`←картинка из №1.
- sheet: `rev:1`, состав = текущим слотам (верстак НЕ разошёлся), `mixedConsent:true`;
  callouts: №1 на front («neckline: 20 mm binding, split»), №2 на back («hem: 30 mm, double
  needle»). journal: `minted Rev.1`.
- mixwarn при этом горит: front из №5, back из №2 → «BACK is behind». budget.spent=0.41.
- concept.readAt=null (кнопка активна: лист и выноски есть).

---

## 2. Форма состояния

Копируется в код без правок. Обоснование каждого поля — комментарий одной фразой:
какой экранный факт без него нельзя честно нарисовать.

```js
const state = {
  tab: 'brief',            // рельс: какая вкладка активна (brief | artifacts)
  kind: 'flat',            // полоса вида артефакта: ОДИН орган в трёх состояниях (flat | render | threed)

  card: {                                  // шапка + идентификация/классификация
    styleNumber: 'GRB-26-SS-014',          // заголовок шапки и поле identification
    name: 'oversized hoodie',              // второй токен заголовка
    season: 'SS26', collection: '26/1 — winter garden', brand: 'grbpwr', // поля identification
    purpose: 'sellable', category: 'knitwear › hoodie › oversized',      // classification
    targetGender: 'unisex',
    fit: 'oversized',      // ЕДИНСТВЕННОЕ место правки fit; прогоны копируют его на старте (Р10, H6.5/H6.7)
    origin: 'PL — Poland', // read-only окно в LABELS (I7) — рисуется с подсказкой «edit on labels ▸»
    roles: [ { k: 'designer', v: 'Т. Ковалёва' }, { k: 'tech designer', v: 'А. Мирный' },
             { k: 'pattern maker', v: null }, { k: 'merch', v: 'Д. Соло' } ], // блок responsible roles, «not assigned» при null
    linked: ['HOOD-BLK-26', 'HOOD-GRY-26'], // блок linked products
  },

  media: {},               // { id: {shape:'front'|'back'|'side'|'photo'|'fabric', label} } —
                           // одна картинка в двух ролях (мудборд→референс, свотч ткани) без дублей (H5, J10.3)

  moodboard: [],           // [{id, mediaId, name, w}] — плитки рельса; счётчик «N / 12»; ✕ и zoom на каждой

  garmentNote: '',         // глобальная записка: одна на карточку, «read with all N pictures», уходит в каждый прогон (J7)

  refs: [],                // [{id, mediaId, role, note}] — role: 'front'|'back'|'side L'|'side R'|'detail'|null;
                           // null = «не в промпте»; НОМЕР НЕ ХРАНИТСЯ — присваивается сканом
                           // по порядку массива с пропуском role:null (плотность номеров = инвариант И-3)

  views: { front: true, back: true, sideL: false, sideR: false, detail: false },
                           // галки матрицы видов: что просим у следующего прогона
  layout: 'per-view',      // 'one' | 'per-view' — в какой форме вернётся (композит или по-видово)
  ask: '',                 // фраза дельты — станет подписью прогона (Р2); очищается после запуска

  profiles: {              // минимум объявляет профиль, а не интерфейс (G3)
    flat:   { name: 'flat-3view',    ver: 'v4', required: ['front', 'back'] },   // замок на галках front/back
    render: { name: 'flat-to-fabric', ver: 'v2', required: ['front', 'back'] },  // гейт GENERATE рендера
    threed: { name: '3D turntable',  ver: 'v2', required: ['front', 'back', 'sideL', 'sideR'] }, // запирающая полоса 3D
  },
  price: { flat: 0.04, render: 0.06, threed: 0.31 },  // строка цены у GENERATE и денежный реестр (H6.11)
  budget: { spent: 0, cap: 2.00 },                    // «today $X of $2.00»; GENERATE запирается у потолка

  renderParams: {          // палитра рендера — рецепт подачи (H5)
    source: 'dictionary',  // 'dictionary' | 'own' | 'photo' — сегмент источника цвета
    code: 'OLV',           // выбранный словарный цвет (имя+hex уходят в промпт вместе)
    ownHex: '#4a5a3c',     // свободный hex — «визуализационный override», канон закрыт
    fabricMediaId: null,   // фото ткани; его выбор молча заводит референс-свотч (H5) — нужен id, чтобы связать оба окна
    words: '',             // «in words» — добавляется к любому источнику
  },
  colorways: [             // чем палитра рисует бейджи: бейдж читает lab dip, а не факт колорвея (H6.4)
    { code: 'OLV', hex: '#3f4a33', labDip: 'REJECTED', round: 2 },
    { code: 'BLK', hex: '#0a0a0a', labDip: 'APPROVED', round: 1 },
  ],
  threedParams: { frames: 'turntable 12', body: 'mannequin · no figure', metrics: 'height 178 · size M' },
                           // параметры 3D-меню; кадры-чипы и два пикера

  runSeq: 0,               // счётчик строк ленты: ОБЩИЙ для generated и added (J2 — иначе run 5 и upload 3 несравнимы)
  runs: [],                // строка ленты. НИКОГДА не удаляется (I3).
  // { id, type:'generated'|'added', kind:'flat'|'render'|'threed',
  //   ask: string|null,            // что просили; null у added — у загрузки нет запроса
  //   price: number|null,          // null у added — цена загрузки не деньги (Р14)
  //   sizeMB: number|null,         // мегабайты строки added — её реальная «цена»
  //   author: 'Т.', time: '14:22', // штамп на каждой строке — без него гонка авторов невидима (G6.3)
  //   status: 'running'|'done', startedAt: ms|null, eta: 25,   // бегущая плитка и счётчик
  //   fitAtLaunch: 'oversized'|null,   // копия fit на старте; расхождение с card.fit → пометка на картинке (H6.7);
  //                                    // null у added = «fit не заявлен», минт спросит (J10.6)
  //   rrev: 1|null,                // r-ревизия подачи (только kind render) — подписи «r1..rN» в истории цвета
  //   colour: {source, value, words}|null,  // рецепт подачи прогона рендера — история цвета рисуется из него
  //   inputs: {                    // СНИМОК входов на момент запуска — история хранит копию, не ссылку (G6.4, I8.2)
  //     note: string,              // garmentNote на момент запуска
  //     refs: [{role, note}],      // референсы ролью и запиской, НЕ номером (I8.2)
  //     slots: {front: picId, ...}|null,  // вход рендера/фикса — какие плиты стояли
  //     fixTarget: 'back'|null,    // фикс из слота (I6): и колонка «вход = слоты (back)» в истории
  //     views: [...], layout: '…', // отпечаток для дивайдера «current / earlier» (Р17)
  //   } }

  pictures: [],            // плоская лента картинок
  // { id, mediaId, runId,          // каждая картинка сидит под строкой, которая её произвела (J1)
  //   src: 'AI'|'uploaded'|'AI + edits'|'imported SVG'|'drawn',  // закрытый словарь провенанса (Р11)
  //   kind: 'flat'|'render'|'threed',
  //   ghost: 'front'|…|null,       // призрачная метка-гипотеза (G2); у кропов — вид рамки (Р6)
  //   composite: { views: ['front','back','side L'], splitInto: [] } | null,
  //                                // склейка не имеет вида и не кликается в слот (I4); splitInto держит ✕ запертым
  //   derivedFrom: picId|null,     // кроп/правка — сиблинг, а не прогон: денег не тратили (I4, I8.4)
  //   strokes: n|0,                // счётчик ручных штрихов — «AI + edits · 4 strokes» в провенансе (I5)
  //   mixedInput: false,           // выход фикса из смешанных слотов — метка не даёт отмыть смесь (Р16)
  //   hidden: false }              // ✕ = скрыть, обратимо; строка прогона пишет «· k hidden» (I3)

  slots: {                 // верстак: по одной картинке на вид; слот эксклюзивен, метка — нет (G2/H4)
    front: null, back: null, sideL: null, sideR: null,   // picId | null
    details: [],           // [{slotId, name, picId|null}] — ключ минтуется, имя только представление (H4)
  },
  detailSeq: 0,            // минт slotId — «деталь 1/2» как ключ запрещён (H4)

  sheet: {
    rev: 0,                // 0 = версии нет вовсе, подпись пуста честно (H1)
    revs: [],              // [{rev, comp:{front:picId,…,details:[{slotId,name,picId}]}, by, time, mixedConsent}]
                           // СНИМОК состава, не ссылка на слоты — иначе клик по слоту разподписывает лист (H2);
                           // «верстак ушёл вперёд» рисуется сравнением revs[last].comp со slots
  },
  calloutSeq: 0,           // минт номера выноски; номер не переиспользуется (Р9)
  callouts: [],            // [{n, picId, x, y, text}] — x,y нормализованы 0..1 (I5); picId ∈ comp последней ревизии
  journal: [],             // [{action:'minted'|'printed', rev, time}] — повторная печать не рождает ревизию,
                           // а пишет строку сюда (H1); рисуется под sheetbar на ARTIFACTS

  concept: {
    text: 'Oversized hoodie in heavy loopback. Dropped shoulder.',  // поле, которое печатается и подписывается
    readAt: null,          // null → состояние 'never'; иначе штамп «read 15:06 · sheet Rev.N» (три состояния списка)
    readRev: null,         // с какой ревизии читали — «read … again ▸» честно называет источник
    sugs: [],              // [{id, text, srcLabel, state:'offered'|'added'|'dismissed'}] —
                           // 'added' рисует квитанцию с undo; счётчик «2 left · 1 added» derived
  },
  aspects: [ { k: 'fit', v: 'oversized, drop shoulder', media: 0 },
             { k: 'sleeve', v: 'raglan', media: 2 } ],   // блок details-aspects и печатный превью
  notes: 'Check whether the rib pulls after washing — the last batch went out of shape.',
                           // internal notes — превью печати обязан их НЕ показывать (инвариант И-14b)

  ui: {                    // транзиентное: не переживает reset, ничего из этого нет в «данных карточки»
    modal: null,           // {type:'intake'|'whatModelGets'|'split'|'vector'|'mint'|'confirm'|'zoom'|'compare'|'diff', …}
    paramsOpen: false,     // дверь GENERATE ▸ развернула форму параметров (Р4/J5)
    pickMode: null,        // {target:'slot:sideR'|'slot:d1'|'ref'|'repin:3'} — режим «кликни картинку/место»
    fixCtx: null,          // {slot:'back'} — чип контекста фикса над формой генерации (I6)
    editingCallout: null,  // n выноски в редакторе (полоса 148px)
    selectedStroke: null,  // вектор-редактор: какой штрих в полосе редактора
    hiddenShown: {},       // {runId:true} — «показать скрытые» по строке
    moodMode: 'strip',     // strip | grid мудборда
  },
};
```

Derived-значения (не хранятся, вычисляются при рендере; хранить их — ложь двух источников):
номера промпта референсов; счётчики шапок секций; правая колонка матрицы видов; состояние
mixwarn (`coherent | behind | provenance-unknown`); положение `pastline` (Р17); расхождение
верстака с Rev; бейдж «из Rev.N · устарел» на рендерах (сравнение `run.inputs.slots` с
текущими слотами); доступность GENERATE (профиль + бюджет); состояние concept-списка
(`never | found | empty` из `readAt` + `sugs`).

---

## 3. Таблица взаимодействий

Формат: **место → событие → переход состояния → что перерисовывается → что видно/невидимо.**
Полный рендер после каждого действия; колонка «перерисовка» называет, что ИЗМЕНИТСЯ на экране.

### 3.1 Хром приложения (шапка, лайфцикл)

| место | событие | состояние | перерисовка / видимость |
|---|---|---|---|
| `menu`, `grbpwr`, `admin ▾`, `my profile`, `logout`, `←` | click | — | inert-note `chrome only — not in this prototype` |
| `tasks 3`, `staged: 2`, `SAVE` | click | — | inert-note `the prototype has no save — everything is live state` |
| `print ▸` (шапка) | click | см. §3.12 «Печать» | диалог минта/печати — печать знает предусловия (J9.4) |
| `release ▸`, пиллы блокеров, `stage`/`approval` | click | — | inert-note `release is a mint trigger in production; not wired here` |
| стадии лайфцикла, `импорт 24.08 …` | click | — | inert-note |

### 3.2 Рельс слева

| место | событие | состояние | перерисовка / видимость |
|---|---|---|---|
| таб `brief` | click | `tab='brief'` | контент вкладки целиком; активный таб жирный |
| таб `artifacts` | click | `tab='artifacts'` | контент ARTIFACTS в одном из трёх состояний (§3.11) |
| прочие табы (patterns, BOM, …) | click | — | inert-note `PATTERNS lives outside this prototype` (имя таба подставляется) |
| пилла на табе artifacts | — | derived | счётчик выносок последней ревизии; `!` если верстак разошёлся |

### 3.3 Полоса вида артефакта (KINDS) — один орган, три состояния

| место | событие | состояние | перерисовка / видимость |
|---|---|---|---|
| ячейка `flat` / `fabric render` / `3D` | click | `kind=…` | секции ниже полосы: вход, параметры, GENERATE — вся студия перестраивается; лента и слоты остаются (они общие) |
| ячейка 3D при неполных рендерах | click | `kind='threed'` | состояние всё равно открывается и ЧЕСТНО показывает запирающую полосу — замок объясняют, а не прячут |
| подстрока ячейки (`input: references`) | — | derived | `flat`: references; `render`: flats of this card (Р-J9.3: НЕ «from the runs»); `threed`: renders by view |

### 3.4 Идентификация / классификация / роли / продукты

| место | событие | состояние | перерисовка / видимость |
|---|---|---|---|
| инпуты style number / name / brand | blur/Enter | `card.*` | заголовок шапки повторяет style number + name |
| `suggest`, `pick ▸`, селекты season/collection/purpose/category/gender | click | — | inert-note (реальных словарей в прототипе нет) |
| пикер `fit` | change | `card.fit` | ЕДИНСТВЕННОЕ пишущее окно fit; строки fit в меню flat/render/3D — read-only с подсказкой; картинки прогонов с `fitAtLaunch≠card.fit` получают бейдж `fit X ≠ card Y` |
| `origin` | click | — | inert-note `origin lives on the ORIGIN label — edit on LABELS ▸` (I7: окно read-only) |
| `▸ base model & sample size` | click | — | inert-note |
| `+ link a product`, роли | click | — | inert-note |

### 3.5 Мудборд

| место | событие | состояние | перерисовка / видимость |
|---|---|---|---|
| сегмент `strip / grid` | click | `ui.moodMode` | рельс ↔ сетка (класс контейнера) |
| ✕ на плитке | click | удалить из `moodboard` (медиа остаётся в `media`, если на него смотрит референс) | счётчик `N / 12`; если референс ссылается на это медиа — confirm `a reference reads this picture — it stays there` и удаляется только плитка мудборда |
| `zoom` | click | `ui.modal={type:'zoom',mediaId}` | просмотрщик (read-only) |
| чипы указаний (pin/label/…), `.aeditor` (delete / make it a point / done), свотчи | click | — | inert-note `moodboard annotation is out of this prototype's scope` |
| ручка ⠿, ресайз | — | — | inert (без заметки — не выглядят кнопками) |

### 3.6 Референсы

| место | событие | состояние | перерисовка / видимость |
|---|---|---|---|
| глобальная записка `.ta3` | blur/Enter | `garmentNote` | превью «what the model gets» и отпечаток входов (Р17): старые прогоны уезжают под `pastline` |
| пикер роли на ячейке | change | `refs[i].role` (включая `null` = «— not in prompt —») | номера промпта пересчитываются сканом (плотные, И-3); призрак `not in prompt` и приглушение кадра при `null`; счётчик `N pictures · K in the prompt` |
| записка ячейки `.ta2` | blur/Enter | `refs[i].note` | модалка запроса покажет новую записку; пустая — placeholder `+ what this picture adds` |
| ✕ на ячейке | click | если `mediaId` встречается в `runs[].inputs.refs` того же медиа → confirm `took part in N runs — history keeps its copy; remove the picture, its role and note together?`; иначе удаляем сразу | ячейка исчезает; номера пересчитываются; истории прогонов НЕ меняются (снимок — копия, G6.4) |
| `zoom` | click | modal zoom | — |
| плитка `+ reference` (drop-зона) | click / drop / ⌘V | `ui.modal={type:'intake', dest:'ref'}` (§3.14) | после подтверждения: новый ref c `role:null` в конец массива |
| `or from the moodboard` | click | `ui.pickMode={target:'ref'}` | мудборд-плитки подсвечены, баннер `pick a moodboard picture · esc to cancel`; клик по плитке → новый ref с ТЕМ ЖЕ `mediaId` (одна картинка, два окна — H5), мудборд не теряет плитку; Esc отменяет |

### 3.7 Форма генерации — состояние FLAT

Видимость всей формы — по Р4 (J5). Дверь `GENERATE ▸` в пустой студии ставит `ui.paramsOpen=true`.

| место | событие | состояние | перерисовка / видимость |
|---|---|---|---|
| строка матрицы видов (галка) | click | `views[v]=!views[v]` | галка; счётчик «N views in this run»; строка цены |
| запертые строки (front, back) | click | — | inert-note `required by profile flat-3view @ v4` — галка с замком не снимается |
| строка `detail` | click | `views.detail` toggle | результат прогона получит картинку-призрак `detail`; её пометка создаст новый слот детали (§3.10) |
| правая колонка строки | — | derived | `slot filled` (серым — результат ничего не вытеснит) · `slot empty` · `slot empty · 3D needs it` красным ТОЛЬКО если вид требуется профилем render/threed и пуст · `new detail slot` |
| сегмент layout `one picture / a picture per view` | click | `layout` | строка следствия `sgmwhy` меняется на текст выбранного положения; при одном отмеченном виде — текст Р12 |
| поле `ask` | blur/Enter | `ask` | подпись будущего прогона |
| строка `fit` | click | — | read-only: inert-note `fit changes the GARMENT — edit it in classification` |
| `GENERATE` | click | см. §3.15 «Прогон» | — |
| `what the model gets ▸` | click | `ui.modal={type:'whatModelGets'}` | модалка ИЗ ТЕКУЩЕГО состояния (§3.13) |
| `upload a flat ▸` | click | `ui.modal={type:'intake', dest:'band'}` | стенд-ин приём (§3.14) |
| `draw it ▸` | click | `ui.modal={type:'vector', base:null}` | векторный редактор с пустой векторной базой (§3.16); сохранение → картинка `src:'drawn'` строкой `added` |
| строка цены | — | derived | `one`: `1 picture · N views inside · $0.04 · ~25 s`; `per-view`: `N pictures · $0.04 · ~25 s`; справа `today $X of $2.00` |

### 3.8 Лента картинок (band)

| место | событие | состояние | перерисовка / видимость |
|---|---|---|---|
| заголовок секции | — | derived | `run N now · K runs · M uploads · P pictures`; на пустой ленте секция НЕ рисуется (Р4) |
| бегущая плитка | — | тик 1 с | `running · Т. · 0:04 / ~25 s · prototype: simulated`; место зарезервировано — прилёт не двигает вёрстку (C3) |
| пикер слота на плитке | change | `slots[v]=picId` (или `details[i].picId`); прежний обитатель ВЫТЕСНЕН — остаётся в ленте | плитка получает рамку и `setv`-метку; прежняя плита теряет её; mixwarn/sheetbar/матрица видов пересчитываются; опции пикера: 4 стороны + именованные детали + `+ new detail…` (спросит имя, §3.10); призрачная догадка стоит первой; **композитов в пикере нет вовсе** |
| ✕ на плитке | click | `hidden=true`, если картинку НЕ читает слот, она НЕ в comp ни одной Rev, НЕ вход идущего прогона, НЕ родитель живого кропа | плитка исчезает; в жёлобе строки появляется `· 1 hidden ▸`; у защищённых картинок ✕ НЕ РИСУЕТСЯ (не disabled — отсутствует) |
| `· k hidden ▸` в жёлобе | click | `ui.hiddenShown[runId]` toggle | скрытые плитки видны пунктиром, на каждой `unhide` |
| `unmark` на помеченной плитке | click | соответствующий слот → null | метка и рамка сняты; у плитки снова пикер и ✕; слот пустеет (две двери); sheetbar/mixwarn пересчитаны |
| `zoom` | click | modal zoom | просмотрщик; для листовых картинок на ARTIFACTS — см. §3.11 |
| `split into views ▸` (композит) | click | `ui.modal={type:'split', picId}` | §3.17 |
| дивайдер `pastline` | — | derived (Р17) | `earlier — inputs have changed since · K runs · M uploads · P pictures` |
| жёлоб строки | — | derived | `run N` / `upload` + фраза ask + `prv`; у added: `N files · 12.4 MB` вместо цены (Р14); подпись бейджа `fit X ≠ card Y` на картинках с расхождением fit |

### 3.9 Слоты (bench) + sheetbar + mixwarn

| место | событие | состояние | перерисовка / видимость |
|---|---|---|---|
| sheetbar | — | derived | `rev=0`, слоты не полны: `SHEET — not issued yet: … front and back required` + `what is missing ▸`; `rev=0`, полны: `SHEET — not issued yet · the first callout, print or release will mint Rev.1`; `rev≥1`, верстак == comp: `SHEET Rev.N · matches the bench`; разошёлся: `SHEET Rev.N · the bench has moved on: BACK` + `what would change ▸` |
| `what is missing ▸` | click | modal `mint-preconditions` (read-only список) | те же строки, что чек-лист ARTIFACTS (§3.11), каждая — ссылка на орган |
| `what would change ▸` | click | modal diff | по видам/деталям: миниатюра из comp против миниатюры верстака, `unchanged` строки серым |
| mixwarn | — | derived | правило (H4/J3/J10.4): участвуют только силуэтные стороны (front/back/sideL/sideR). Все плиты из одного `generated`-прогона ИЛИ одной строки `added` → предупреждения нет. Плиты из разных generated-прогонов → красный `X is behind` (вид с меньшим runId) + дверь `fix X ▸`. Смесь added+generated → СЕРАЯ строка `provenance mixed — hand files sit outside the run ladder; coherence is on you` (не красная, ничего не утверждает). Плита с `mixedInput` глушит красное, но несёт свою пометку (Р16) |
| `fix X ▸` (в mixwarn) | click | `ui.fixCtx={slot:'x'}`; скролл к форме генерации | чип `fix: BACK — inputs: the slots (front, side L)` + кнопка `cancel fix`; GENERATE теперь запускает фикс (§3.15) |
| `fix ▸` на слоте | click | то же самое | — |
| `edit ▸` на слоте | click | `ui.modal={type:'vector', base:picId, fromSlot:v}` | векторный редактор поверх плиты (§3.16) |
| `unmark` на слоте | click | слот → null | как unmark в ленте |
| fixbar «идёт» | — | derived (есть running-прогон с `fixTarget=v`) | пунктирная приписка `fix is running · 0:14` ПОД плитой — плита не заменяется, карточка печатаема (I6) |
| fixbar «пришёл» | — | derived (есть done-прогон с `fixTarget=v`, картинка не в слоте и не скрыта) | `fix is in · «ask» · time · author` + `compare ▸` + `put it in`; результат НИКОГДА не вытесняет сам (I6) |
| `compare ▸` | click | modal compare | старая плита и новая рядом, подписи «in the slot now» / «the fix» |
| `put it in` | click | `slots[v]=newPicId` (акт человека, штамп) | fixbar исчезает; mixwarn пересчитан; если вход фикса был смешан — плита несёт `from mixed input` (Р16) |
| пустой слот: drop-зона `+ add a picture` | click/drop/⌘V | `ui.modal={type:'intake', dest:'slot:v'}` | приём; по подтверждению — строка `added` В ЛЕНТЕ + пометка в этот слот одним актом (Р15) |
| пустой слот: `or mark a picture from a run` | click | `ui.pickMode={target:'slot:v'}` | баннер `choosing for SIDE R — click a picture in the band · esc`; плитки ленты (подходящего kind, не композиты, не скрытые) подсвечены; клик — пометка; Esc — отмена |
| подвал пустого слота | — | derived | `empty · 3D needs it` красным только если вид требуется профилем следующего вида артефакта |

### 3.10 Слоты деталей

| место | событие | состояние | перерисовка / видимость |
|---|---|---|---|
| `+ detail` (drop / mark / из пикера ленты) | попытка положить картинку | если имя пусто — картинка НЕ кладётся: поле имени получает `.bad` и фокус, подсказка `name it, then fill it` (H4: имя ДО картинки) | — |
| поле имени нового слота | Enter при непустом | `details.push({slotId:'d'+(++detailSeq), name, picId:null})` | появился именованный пустой слот с двумя дверями |
| поле имени существующего | blur/Enter | `details[i].name` | коллизия имён законна; отображение добавляет суффикс `(2)`, хранимое имя не мутируется (H4) |
| ✕ / unmark / remove на детали | click | unmark: `picId=null`, слот остаётся; ✕ на ПУСТОМ слоте детали: слот удаляется (confirm, если slotId цитируется comp какой-либо Rev — тогда запрещено, объяснение) | глагол `remove` не существует (Р3) |

### 3.11 ARTIFACTS

Три состояния корня (derived):

1. **`rev=0` и предусловия минта НЕ собраны** → чек-лист предусловий (J10.5), а не пустая
   страница: строки `front slot — filled ✓ / empty ✗`, `back slot …`, `fit declared on N
   uploaded plates`, `mixed composition — consent will be asked at mint`; каждая строка —
   ссылка: клик переключает на BRIEF и скроллит к органу.
2. **`rev=0`, предусловия собраны** → живой верстак с плашкой `draft — no version yet ·
   the first callout will mint Rev.1` (I1). Картинки кликабельны для выноски, но ПЕРВЫЙ клик
   сначала открывает диалог минта; выноска ставится в замороженную comp после подтверждения —
   в точке клика.
3. **`rev≥1`** → полоса представлений + лист + выноски + журнал + (если есть) плашка
   расхождения верстака.

| место | событие | состояние | перерисовка / видимость |
|---|---|---|---|
| полоса представлений (reps) | — | derived | `флэт — чертёж`: `Rev.N · K callouts` или `draft`; `ткань — рендер`: `N renders` или `none — generate from the slots ▸`; `3D`: аналогично; `на модели`: `not in this prototype` |
| reps: строка рендера/3D с дверью | click | `tab='brief'; kind='render'|'threed'` | переход в соответствующее состояние студии |
| reps: `профиль промпта ▾` | click | — | inert-note `prompt profiles are server config — F5` |
| лист: клик по свободному месту картинки | click | `rev=0` → диалог минта (см. ниже), затем выноска; `rev≥1` → `callouts.push({n:++calloutSeq, picId, x, y, text:''})`, `ui.editingCallout=n` | маркер-номер в точке клика (полый — текста нет); редактор 148px открыт |
| редактор выноски: текст | blur/Enter | `callouts[n].text` | маркер становится залитым; строка в правом списке |
| редактор: `delete` | click | выноска удаляется; номер в дыру (Р9) | список и маркеры |
| редактор: `done` | click | `ui.editingCallout=null` | полоса редактора сворачивается в idle |
| клик по существующему маркеру | click | `ui.editingCallout=n` | правка ровно одна на экране |
| правый список выносок | click по строке | `ui.editingCallout=n` | маркер подсвечен (outline) |
| `Скачать SVG` | click | — | реальная загрузка: SVG собирается из comp текущей Rev + маркеры выносок (blob + `a[download]`) |
| `Править выноски` | click | — | inert-note `you are already editing them — click the sheet` |
| `заменить лист файлом ▸` | click | — | modal-объяснение: `in production this opens the repin procedure (C4). In the prototype: change the bench on BRIEF and press print — the mint dialog will walk the repin` |
| плашка расхождения | — | derived | `the bench has moved on: BACK — pieces and print stay on Rev.N until a new one is minted` + `mint Rev.N+1 ▸` |
| `mint Rev.N+1 ▸` | click | диалог минта | — |
| журнал | — | derived из `journal` | строки `Rev.1 · minted · 15:04`, `Rev.1 · printed · 15:12` |

**Диалог минта** (единый — из первой выноски, из печати, из плашки расхождения):
- показывает состав (миниатюры по видам + детали), каждая с провенансом;
- если состав смешанный (красное правило §3.9) — чек-бокс согласия `I accept the mixed
  composition (front — run 5, back — run 2)`; без галки `MINT` заперт (H6.1);
- если плита от прогона с `fitAtLaunch≠card.fit` — минт ЗАПЕРТ, строка
  `fit slim ≠ card oversized — carry it to the card first` (H6.7), кнопки нет, только выход;
- если плиты `uploaded` без fit — строка-вопрос `uploaded plates: drawn at fit? — confirm
  card's "oversized"` с галкой (J10.6);
- при минте Rev.N+1 с выносками: выноски на картинках, оставшихся в составе, переезжают
  молча (тот же picId); на заменённых — список перепиновки (Р7): строка `№3 · «низ: подгиб
  30 мм» · was on BACK` + мини-контекст; клик по строке → `ui.pickMode={target:'repin:3'}` →
  клик по новой картинке состава ставит №3 в точке клика; `FINISH MINT` заперт, пока есть
  неперепинованные (или явное `drop callout №k` с confirm);
- подтверждение: `sheet.revs.push(снимок slots)`, `rev++`, journal `minted`; рендеры, чей
  `inputs.slots` совпадал со СТАРОЙ comp, получают derived-бейдж `из Rev.N-1 · устарел` —
  видно сразу (H3.7).

### 3.12 Печать (`print ▸` в шапке)

| состояние | что происходит |
|---|---|
| `rev=0`, верстак не собран | modal: чек-лист предусловий (тот же, что §3.11-1) |
| `rev=0`, собран | диалог минта → по подтверждению `minted Rev.1` + `printed Rev.1` в журнал; toast `printed Rev.1 · prototype: no paper` |
| `rev≥1`, верстак == comp | `printed Rev.N` в журнал + toast — новой ревизии НЕ рождается (H1) |
| `rev≥1`, разошёлся | modal-развилка: `print Rev.N as it is` (журнал) ИЛИ `mint Rev.N+1 first ▸` (диалог минта с перепиновкой) — кнопка переехала от дизайнера к потребителю листа (H3.8) |

### 3.13 Модалка `what the model gets ▸` — всегда ИЗ ТЕКУЩЕГО состояния

Три инвентаря по `kind` (J9.11):
- **flat**: `pictures K of N on the card` — референсы с ролями в порядке промпта, записки
  дословно; ref без записки → `note is missing; the picture goes unexplained` красным;
  `not sent` — безролевые; `not sent at all` — чипы `moodboard · N`, `callouts`, `notes`,
  `BOM`, `colorways`; `words` — garmentNote + `fit: oversized (from the card)` + строка видов
  и layout.
- **render**: входы = плиты слотов (миниатюры с провенансом), цвет как `OLV · deep olive ·
  #3f4a33` (имя и hex вместе — H5), words, garmentNote; `not sent`: референсы, mudboard.
- **threed**: рендеры по видам + frames/body; `not sent`: всё остальное.

Каждая строка — ссылка: закрывает модалку, переключает вкладку/kind при нужде и скроллит к
дому поля с миганием outline. Ничего не редактируется (`edits happen on the card, not here`).
Кнопка `copy as text` пишет плоский текст в клипборд.

### 3.14 Модалка приёма файлов (стенд-ин) — честная подмена файловой системы

Открывается из ЛЮБОЙ drop-зоны (клик, drop реального файла, ⌘V). Заголовок:
`add files — prototype stand-in`. Тело: чек-боксы стенд-инов `front · back · side · detail ·
fabric photo` (мультивыбор, счётчик). Обязательная строка честности:
`no file system in this prototype — pick what the files would depict. The «probably …» hint
below follows this choice; in production it comes from the file itself` (Р13).
Подтверждение: ОДНА строка `added` (`{type:'added', sizeMB: 3.1×n, author:'Т.'}`) + по
картинке на выбор (`src:'uploaded'`, `ghost:'probably X'`). Если приём вызван из пустого
слота `dest:'slot:v'` — соответствующая картинка сразу помечается в этот слот (Р15), прочие
ложатся неразмеченными. Если из `dest:'ref'` — вместо строки ленты создаётся референс
(`role:null`). Drop реального файла НЕ читается — открывается эта же модалка.

### 3.15 GENERATE — единственная дверь запуска (все виды, включая фикс)

1. Гейт: у render — `front` и `back` слоты заполнены (иначе кнопка `.dis` + причина);
   у threed — рендеры всех четырёх сторон (иначе `.dis` + lockbar); у всех —
   `budget.spent + price ≤ cap`, иначе `.dis` + `daily budget reached`.
2. `runs.push({id:++runSeq, type:'generated', kind, ask: ask||null, price, author:'Т.',
   time: now, status:'running', eta, fitAtLaunch: card.fit, rrev (render: следующий r),
   colour (render: снимок renderParams), inputs: снимок})`; `ask=''`; `budget.spent+=price`;
   `ui.fixCtx` учтён в `inputs.fixTarget` и очищен.
3. Лента: строка встаёт наверх с бегущей плиткой (места зарезервированы по числу ожидаемых
   картинок); тикает 5 с (`prototype: simulated`).
4. Прилёт: `status='done'`; картинки: flat/per-view → по картинке на отмеченный вид с
   призраком вида; flat/one и ≥2 видов → ОДИН композит (`composite.views`), призраки всех
   видов на нём, пикера слота нет, только `split into views ▸`; фикс → одна картинка с
   призраком `fixTarget`; render → по картинке на заполненный требуемый вид (`render · front`),
   без пикера слотов (рендер в слоты флэта не кликается), с `rrev`-подписью; threed → одна
   плитка `turntable · 12 frames`.
5. Ничего не крадёт фокус, не скроллит, не модалит (C3).

### 3.16 Векторный редактор (модалка)

Двери: `draw it ▸` (пустая векторная база), `edit ▸` на слоте (растровая база = плита).
- чипы `line · freehand · stitch · erase`: line/freehand рисуют pointer-драгом полилинии в
  оверлейном SVG; erase удаляет штрих под кликом; выбор штриха открывает полосу редактора
  148px (`stitch · line N · K points`).
- пикер кисти: список из макета — plain line, straight lockstitch 301, double needle 401×2,
  zigzag 304, coverstitch 406, 5-thread flatlock 516, overlock 504, blind hem 103, bartack.
  Выбор меняет stroke-паттерн выбранного штриха. Кисти — виды машин, не классы шва (I5);
  список выбирают глазами по образцу штриха.
- `weight` сегмент + чип `dashed`: атрибуты штриха. `delete` / `make it a plain line` /
  `done` — на полосе редактора.
- панель слоёв: `vector` (счётчик штрихов) и `raster` (провенанс базы) с чек-боксами
  видимости; у пустой базы слой raster не рисуется, и шапка НЕ пишет `from run N` (J9.9 —
  для нарисованного база своя: «векторная база сама и есть слой», J6).
- `download SVG`: реальная загрузка blob (вектор + вложенный растр-силуэт).
- `upload SVG back`: СИМУЛЯЦИЯ — confirm `prototype: applies a canned outside edit`; по
  согласию добавляет канонический штрих-набор и штамп `edited outside · Illustrator · Т.` в
  шапку модалки. Реальный файл не читается.
- `SAVE AS A NEW PICTURE`: новая картинка в ленте (`derivedFrom: base`, `strokes: n`,
  `src`: база AI → `AI + edits`, база пустая → `drawn`), строкой `added`-типа? — НЕТ:
  сиблингом под строкой родителя, если база из прогона (I4-аналогия), отдельной строкой
  `added`, если база пустая. Если редактор открыт с `fromSlot:v` — картинка СРАЗУ встаёт в
  этот слот (человек действовал на этом слоте, штамп его; прежняя плита остаётся в ленте).
  `discard` — закрыть без следа.

### 3.17 Модалка split — разрез композита

- Вход: композитная картинка (`composite`), N призрачных видов. Сцена: рамки поверх.
- чипы `3 across` / `2 across`: пресеты равных рамок; `+ frame`: добавляет рамку 20% в
  свободном месте; `reset`: пресет по числу видов композита.
- рамка: drag за тело — горизонтальный сдвиг; drag за левую/правую кромку — ресайз
  (границы 0..100%, min 5%); клик — выбрать (`on`); ✕ — удалить рамку; пикер `view ▾` на
  рамке и в списке строк — front/back/side L/side R/detail.
- строки-дубли рамок под сценой: пикер вида + проценты + пилла `will be cut` / красная
  `no view — not cut`; warnbox называет безвидовые рамки словами.
- Кнопка `SPLIT INTO K PICTURES`: K = число рамок С видом; 0 → `.dis`. По клику: на каждую
  рамку с видом → картинка `{runId: родительский, src: родительский, derivedFrom: composite,
  ghost: вид рамки (Р6), caption 'split i of K'}`; `composite.splitInto` пополняется;
  композит остаётся с подписью `source · split into K`, двери `split again ▸` и БЕЗ ✕, пока
  жив хоть один кроп в слоте или в comp (И-5); отдельной строки прогона кропы НЕ заводят —
  реестр денег пишет `1 generation → K pictures` (I8.4).

### 3.18 Состояние RENDER (kind='render')

| место | событие | состояние | перерисовка / видимость |
|---|---|---|---|
| входная полоса | — | derived | слева от линии — плиты слотов (`in slot · front`, unmark действует как §3.9); справа — прочие ФЛЭТЫ КАРТОЧКИ (J9.3: любые, не только из прогонов), не скрытые, не композиты; `mark ▸` на них → пикер слота; плитка `+ flat` → intake |
| сегмент источника цвета | click | `renderParams.source` | тело палитры: словарная сетка / колор-инпут / фото ткани |
| свотч словаря | click | `renderParams.code` | заголовок `.cur` (имя+hex); бейдж colorway читает `labDip`: REJECTED → красная строка `lab dip rejected, round 2` (H6.4) |
| own colour | change | `ownHex` | пометка `visualisation override — cannot become canonical` |
| fabric photo | click | intake (стенд-ин `fabric`) → `fabricMediaId`; ОДНОВРЕМЕННО создаётся референс-свотч с тем же mediaId | inline-строка `also added to references — show ▸` (H5: один объект, два окна) |
| `in words` | blur | `words` | — |
| история цвета | — | derived из render-прогонов | чипы `OLV · now`, `r4 · 2 pictures`, …; чип с `inputs.slots ≠ текущим` — приглушён `устарел` |
| чип истории | click | `renderParams` ← рецепт прогона | палитра перенастроена; toast `recipe restored — the picture is not: press GENERATE` («мигрирует рецепт, а не картинка», H5) |
| строка `fit` | click | — | read-only, inert-note `fit is a property of the garment — presentation cannot change it` (H6.5) |
| GENERATE | click | §3.15 | — |

### 3.19 Состояние 3D (kind='threed')

Входная полоса: рендеры по видам (последний rrev на вид); недостающий вид — пунктирная
плитка `side R · no render` + `required` + красное `blocks 3D`. lockbar называет профиль и
даёт двери `generate a flat ▸` / `generate a render ▸` (переключают kind). Чипы frames и два
пикера — пишут `threedParams` (пикеры — из двух канонических значений, без словаря — click
циклит). GENERATE активен только при четырёх сторонах ОДНОЙ `rrev` (I2: turntable в
разноцветных видах бессмыслен) — иначе `.dis` + причина в lockbar.

### 3.20 Concept & construction description

| место | событие | состояние | перерисовка / видимость |
|---|---|---|---|
| поле concept | blur/Enter | `concept.text` | правый превью-лист «how it prints» повторяет текст; пилла `an edit changes the DESIGN signature` |
| `read sheet Rev.N ▸` | click, если `rev≥1` и есть выноски | `readAt=now, readRev=rev`; `sugs` пересобираются: кандидаты = тексты выносок текущей Rev, которых нет подстрокой в `concept.text` и которые не в состоянии added/dismissed | список: `found` (есть offered) / `empty` («Nothing new: every construction fact on the sheet is already in this text»); подпись `read 15:06 · sheet Rev.N and its K callouts` |
| `read sheet ▸` при `rev=0` | click | — | inert-note `no sheet yet — the first callout on ARTIFACTS mints Rev.1` (Р8) |
| `add` на строке | click | `sug.state='added'`; текст дописывается в `concept.text` через пробел | строка становится квитанцией (`undo`, серый фон, `added to concept · time`); превью печати обновлён |
| `dismiss` | click | `state='dismissed'` | строка исчезает; счётчик `K left · M added` |
| `undo` на квитанции | click | `state='offered'`; текст вырезается из `concept.text` (точное вхождение) | строка снова с add/dismiss |
| `+ add aspect`, пиллы `N media` | click | — | inert-note |
| `notes` | blur | `notes` | превью печати ОБЯЗАН его не содержать (И-14b) |

---

## 4. Инварианты — верны после ЛЮБОГО действия

Формулировка проверяемая; «проба» — что делает qa-proto.

| № | инвариант | проба |
|---|---|---|
| И-1 | У картинки, которую читает какой-либо слот, нет ✕ и нет пикера слота в ленте — только `unmark` | worked: `.tl.mark .del` count == 0; после unmark ✕ появляется |
| И-2 | Сплошная метка вида (`setv`) стоит ровно на картинках, находящихся в слоте; на прочих — только призрак или ничего | сверка множества picId слотов с множеством плиток с `setv` |
| И-3 | Номера промпта референсов плотные (1..K), порядок = порядок добавления, безролевые пропущены | тексты `.posn` == 1..K; после role→null пересчёт |
| И-4 | Первый токен провенанса каждой плитки ∈ {AI, uploaded, AI + edits, imported SVG, drawn} | скан `.prv b` |
| И-5 | Композит: не встречается в опциях ни одного пикера слота и ни в одной входной полосе; при живом кропе в слоте/Rev не имеет ✕ | после split: пикеры не содержат id композита |
| И-6 | Одна картинка стоит максимум в одном слоте | скан `slots` |
| И-7 | `sheet.revs[i].comp` после минта не мутирует ничем, кроме следующего `push`; выноски ссылаются только на picId состава последней ревизии | deep-freeze в dev-режиме + проба: смена слота не меняет comp |
| И-8 | `rev ≥ 1` ⇔ был акт минта (выноска/печать); ни одна выноска не существует при `rev = 0` | clean: `.cal` отсутствует до минта |
| И-9 | Пустой обязательный слот (front/back) ⇒ sheetbar `not issued` (или чек-лист на ARTIFACTS) и минт недостижим; красная строка `empty` в подвале слота ⇔ вид нужен профилю следующего вида артефакта | unmark front на worked → print открывает чек-лист |
| И-10 | fit редактируется ровно в одном месте — classification; строки fit в меню flat/render/3D read-only | в render-состоянии нет живого контрола fit |
| И-11 | mixwarn трёхзначен: красный только при ≥2 разных generated-прогонах на силуэтных слотах; одна строка added никогда не даёт красного; смесь added+generated даёт серое «provenance …», которое не утверждает когерентность | worked: красный BACK; после «put it in» — чисто или серо |
| И-12 | `budget.spent` = Σ цен generated-прогонов сессии; строки added не меняют его и не показывают $ | счёт по DOM == счёт по state |
| И-13 | Полный ре-рендер идемпотентен: `render(state)` дважды подряд даёт одинаковый DOM | сравнение innerHTML |
| И-14 | Текст каждой added-квитанции concept встречается в `concept.text` ровно один раз; dismissed и offered — ни разу. **И-14b**: `notes` не встречается в превью печати | строковый поиск |
| И-15 | Номер выноски минтится один раз и не переиспользуется; после удаления №2 следующая выноска получает max+1 | скрипт: place, delete, place |
| И-16 | При минте Rev.N+1 выноски на неизменённых картинках сохранили и номер и координаты; на заменённых — либо перепинованы кликом, либо явно удалены; `FINISH MINT` недоступен при неразрешённых | скриптованная прогулка №4 |
| И-17 | Денежный реестр: `1 generation → K pictures` при split; кропы не заводят строк прогона | после split число строк ленты не выросло |
| И-18 | Скрытая картинка не встречается ни в пикерах, ни во входных полосах; её строка прогона пишет `· k hidden` | hide → скан опций |
| И-19 | `unmark` ничего не теряет: картинка остаётся в ленте с прежним runId и провенансом | count pictures до/после |
| И-20 | Слот детали с картинкой всегда имеет непустое имя | скан `details` |
| И-21 | Каждый интерактивно выглядящий элемент несёт `data-act` или `data-inert`; молча мёртвых нет | скан `[role=button], .btn, .chip, .pick, .tab, .kd, .sw, .swg, .mk, .del, .zbtn` |
| И-22 | Пока прогон идёт: его плитка-заглушка стоит на месте будущих картинок и прилёт не меняет геометрию ленты (±2px) | bbox ленты до/после прилёта |
| И-23 | Плита от прогона с `fitAtLaunch ≠ card.fit` не может войти в минт (диалог заперт с причиной) | сменить fit → print |

---

## 5. Прогулки (сценарии от и до)

Каждый шаг: клик → ожидаемый результат. Гейт исполняет №1–№4 скриптом.

**П1 — полностью ручная карточка (пресет clean).**
1. `+ add files` в пустой студии → модалка стенд-инов; выбрать front, back, side → строка
   `#1 added · 3 files`, три плитки с призраками, форма параметров НЕ появилась (Р4).
2. Пикер на front-плитке → `front` → метка, слот front занят, матрица видов (если открыть
   GENERATE ▸ — не открываем) не нужна: sheetbar `not issued … back required`— нет, back тоже
   есть: после шагов пометки back и sideL sheetbar = `not issued yet · the first callout,
   print or release will mint Rev.1`.
3. Слот sideR пуст: клик `+ add a picture` → intake c предвыбранным side → строка `#2 added`
   + слот sideR помечен сразу (Р15).
4. mixwarn: НЕ красный; серой строки тоже нет (нет generated вовсе) — подпись под слотами
   честно говорит, что проверка молчит не от здоровья.
5. ARTIFACTS → живой верстак `draft — no version yet`.
6. Клик по картинке front → диалог минта: строка fit-вопроса для загрузок (галка) →
   подтвердить → `SHEET Rev.1`, выноска №1 в точке клика, редактор открыт → текст → done.
7. Ни одного прогона на карточке не было. Подпись прогона нигде не встречается.

**П2 — композит → разрез → слоты (продолжение П1 или clean).**
1. BRIEF, `GENERATE ▸` → форма развернулась; отметить front+back+side L; layout `one picture`.
2. `GENERATE` → строка `#N generated`, бегущая плитка 5 с → композит `3 views`, пикера нет.
3. `split into views ▸` → пресет `3 across`; рамки уже с видами (по призракам композита);
   у третьей снять вид → warnbox + кнопка `SPLIT INTO 2 PICTURES`; вернуть вид → 3.
4. SPLIT → три кропа `split 1..3 of 3` с призраками; композит `source · split into 3`, без ✕.
5. Пикеры кропов → соответствующие слоты (вытесненные загрузки остались в ленте, И-19).
6. mixwarn молчит: все три плиты — один прогон.

**П3 — слот отстал → фикс.**
1. (worked) mixwarn красный: `BACK is behind` (front run 5, back run 2).
2. `fix BACK ▸` → чип фикса над формой; ask `higher stand on the back`.
3. GENERATE → прогон с `inputs: слоты`; на слоте back пунктирная приписка `fix is running` —
   плита НЕ исчезла.
4. Прилёт → fixbar `fix is in` на слоте; `compare ▸` → две картинки рядом; закрыть.
5. `put it in` → плита заменена, прежняя в ленте; mixwarn пересчитан → погас (front run 5,
   back — фикс из тех же слотов… вход фикса был смешанным → плита несёт `from mixed input`,
   красного нет, серая пометка есть — Р16).

**П4 — верстак разошёлся → печать → минт Rev.2 с перепиновкой (после П3 на worked).**
1. sheetbar: `SHEET Rev.1 · the bench has moved on: BACK`.
2. `print ▸` → развилка: `print Rev.1 as it is` / `mint Rev.2 first ▸` → минт.
3. Диалог: выноска №1 (front, не менялся) — `carries over`; №2 (back, заменён) — строка
   перепиновки; `FINISH MINT` заперт.
4. Клик строки №2 → режим `repin` → клик по новой back-картинке → №2 поставлена, координаты
   новые (геометрия не переносится).
5. FINISH → `Rev.2`, журнал `minted Rev.2`, затем `printed Rev.2`; рендеры (если были)
   получили `из Rev.1 · устарел`.

**П5 — рендер.**
1. (worked) KINDS → `fabric render`; входная полоса: слева три плиты, справа прочие флэты.
2. Палитра: свотч OLV → красная строка lab dip; переключить на BLK.
3. words: `matte, brushed` → GENERATE → строка `render r1`, две картинки `render · front/back`.
4. История цвета: чип `BLK · r1`. Сменить slots (unmark front) → чип r1 получает `устарел`;
   вернуть front.
5. fit read-only — клик даёт заметку.

**П6 — concept.**
1. (после П4) `read sheet Rev.2 ▸` → список `found`: строки из текстов выносок, счётчик.
2. `add` первой → квитанция + текст дописан + превью печати обновился.
3. `undo` → текст вырезан, строка вернулась. `add` снова; `dismiss` второй.
4. `read sheet Rev.2 again ▸` → `empty`: «Nothing new…».

**П7 — модалка запроса.**
1. flat: стереть записку у референса №3 → `what the model gets ▸` → строка №3 красная
   `note is missing…`; безролевые в `not sent`; garmentNote в `words`.
2. Клик по строке №3 → модалка закрыта, ячейка референса подсвечена и на экране.
3. kind=render → модалка показывает плиты и цвет `имя · hex`, референсов во входах нет.

**П8 — жизнь референса.**
1. `+ reference` → intake → ячейка без роли (призрак `not in prompt`), номера нет.
2. Роль `detail` → номер появился в конце; у прочих не изменился (И-3).
3. У референса №2 роль → `— not in prompt —` → номера уплотнились.
4. ✕ на референсе, чьё медиа было во входах прогона → confirm `took part in N runs…` →
   удалить → история прогона не изменилась (снимок).
5. `or from the moodboard` → pick-mode → клик по плитке мудборда → референс с тем же медиа,
   мудборд не потерял плитку.

---

## 6. Что осознанно НЕ делаем

| граница | причина |
|---|---|
| Реальные файлы, модель, сервер, персистентность | статический прототип; каждая подмена говорит о себе словами в месте подмены (§3.14, §3.15, §3.16), а не притворяется |
| Экран сверки рендера с листом (кадр 07) и каналы публикации | требует выносок-чеклиста и понятия «принятый рендер», которых в G–J-модели прототипа нет; сверка упомянута бейджем `не сверено` на рендер-плитках — без двери |
| Полная процедура «замена листа файлом» | дорогая часть — перепиновка, и она ЕСТЬ в минте Rev.N+1 (П4); отдельная дверь объясняет это модалкой (§3.11) |
| Матрица версий, строки «изменить изделие/подачу», «Принять как лист» | мертвы по Р1 — модель круга F, отменённая G/H |
| Вкладка «на модели», профили промптов как объект, release-флоу | F5/F7: серверный конфиг и каналы — не решены и в прототипе честно инертны |
| Второй автор и гонки (G6.3, I8.8) | однопользовательский прототип; штампы автора рисуются везде, но автор всегда «Т.» |
| Стирание байтов, реестр надгробий (I3 ярус 1) | в прототипе есть только глагол «скрыть»; стирание — пакетная серверная операция |
| Реальный парсинг SVG/AI/DXF, санитайз, layer_rev, подписи метаданных | I5/J6 — серверная механика; upload-back симулируется канонической правкой со штампом |
| Аннотации мудборда (чипы, aeditor) | самостоятельная система (`callout-geometry-one-system`) уже живёт в проде; прототипу полосы DESIGN она ничего не доказывает |
| Лимит хранилища, политика хранения кандидатов (G6.5) | серверная политика; в UI есть только денежная полоса дня |
| Единый зум-просмотрщик = разметчик (H6.12) | в прототипе zoom read-only, выноски ставятся на листе inline; унификация — прод-обязательство, записано здесь, чтобы не потерялось |
| Ответы на открытые вопросы владельцу | fit-словарь (H6.7), кнопка «собрать описание из выносок» (J7), фото сшитого семпла (J10.7), care picker в шапке (I7), «удалить = скрыть?» (I3) — прототип выбирает рабочие значения (Р10, Р8, — , — , «скрыть») и НЕ закрывает вопросы |
