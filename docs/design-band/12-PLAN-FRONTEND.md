# 12 — План внедрения: ФРОНТЕНД (grbpwr-admin-client)

Редакция 2. Клон admin-client синхронен с `origin/master` и `origin/beta` (обе на
`3ccaeb3c`), поэтому цитаты ниже — из рабочего дерева и они верны. Сабмодуль `proto/` стоит
на `de1767f`, на два коммита позади `origin/files-wave2` — бампается в F-0.

Поведенческий образец — прототип `tmp/design-band/proto.html` (спека `03-PROTOTYPE-SPEC.md`
+ круг I `04-ROUND-I.md`) с поправками на тринадцать находок `05-GAPS-FLOW.md` (§6).
`DESIGN.md` в корне нормативен. Типы не гейтят деплой: Vercel собирает голым `vite build`,
`tsc` гоняется руками ([[admin-client-types-never-gate-deploy]]).

---

## 1. Рельс табов — и почему одного алиаса мало

Полоса живёт внутри карточки: `src/components/managers/tech-card/`. Новые ключи —
**`studio`** и **`artifacts`**. Складывается **не одна старая вкладка, а две**.

Что есть сейчас (`src/components/managers/tech-card/components/index.tsx`):

- `TABS` `:123-139` содержит и `sketch`, и **`moodboard`** — это две самостоятельные
  вкладки, обе в группе `design: ['header','moodboard','sketch']` (`TAB_GROUPS:146`);
- обе рендерят **один компонент в двух режимах**: `:2022-2039` монтирует
  `<SketchTab view='sketch'>` и `<SketchTab view='moodboard'>` одновременно, каждую в своём
  `<div hidden>`; сигнатура — `sketch-tab.tsx:791-812`, ветка мудборда `:835`;
- `FOLDED_TABS` `:177` сейчас `{ dev: 'costing', pieces: 'patterns' }`; алиас резолвится при
  чтении URL `:345` и переписывает адресную строку на канонический таб `:699-704`;
- `ERROR_TAB` `:180-205` маршрутизирует отказ валидации: `moodboardMedia → 'moodboard'`
  (`:181`), `technicalMedia → 'sketch'` (`:182`), `callouts → 'sketch'` (`:183`), фолбэк
  `:660` — `'header'`. Комментарий `:186-187` называет цену промаха дословно: «a toast naming
  a field nobody can see»;
- рядом живёт вторая такая карта — `RELEASE_BLOCKER_TAB` `:211+`.

Отсюда обязательный список для F-9, а не одна строка:

1. `FOLDED_TABS` получает **`sketch: 'studio'` и `moodboard: 'studio'`** — старые deep links
   обоих видов живут;
2. `TABS`/`TAB_GROUPS`: `design` становится `['header','studio','artifacts']`;
3. `ERROR_TAB`: `moodboardMedia`, `technicalMedia`, `callouts` → `'studio'`;
   проверить весь остальной словарь на ключи, ведущие в снятые вкладки;
4. `RELEASE_BLOCKER_TAB` — тот же проход;
5. `revealField` **уже существует** (`src/utils/field-errors.ts:226-234` — querySelector по
   `[data-field]`, scroll + пульс, возвращает `false`, если поля нет; роутер отказа
   `index.tsx:721-746` с ретраем 4 кадра). Новые органы обязаны носить `data-field` с тем
   же путём формы — тогда «отказ ведёт в место» (Д9) не строится, а наследуется;
6. `sketch-tab.tsx` живёт до конца переезда и умирает последним куском.

Структура **STUDIO** (сверху вниз, J5/F8): шапка (существующие органы) → moodboard →
references → garment description → полоса вида артефакта (KINDS) → студия (входная полоса по
kind → параметры → GENERATE) → bench + sheetbar + mixwarn → generation history → uploads
shelf → concept & construction.

Структура **ARTIFACTS** (три состояния корня): чек-лист предусловий | живой верстак
`draft — no version yet` | полоса представлений + лист vN + полоса указаний + журнал +
плашка расхождения.

Новый код — в `tech-card/components/design/` (плоская папка по образцу соседей).

---

## 2. Какую правду показывает ARTIFACTS

В редакции 1 этого не было сказано, и без ответа экран и бумага могли разойтись под одной
подписью. Правило:

- **Документ живой.** Выноски карточки остаются в RHF-форме и сохраняются обычным
  `UpdateTechCard`. Сейв версию не минтит (H1).
- **ARTIFACTS показывает ДОКУМЕНТ**, а не последнюю версию, и несёт плашку
  `differs from v3` со списком отличий, когда они есть.
- **Печать vN печатает ЗАМОРОЖЕННОЕ**: `GetDesignSheetVersion(card, N)` → плиты и выноски
  версии. QR ведёт на **свою** версию, а не на latest — того требует 02-DECISIONS:504-510.
- Правка выноски после v1 **не требует** v2. Новая версия рождается актом (`minted_via`:
  callout / print / release / share), а расхождение до тех пор видно плашкой.

Адрес версии строится тем же приёмом, что уже работает для выкроек и наряда:
`viewerOrigin()` (`src/utils/viewer-origin.ts:21-25`, переменная
`VITE_PATTERN_VIEWER_ORIGIN`) + токен + `?v=<номер>` (образцы —
`tech-pack-document.tsx:2204-2206` и `:1794`, `run-pack-document.tsx:460`). Рендер QR —
`src/ui/components/pattern-qr.tsx:5-16`.

---

## 3. Переиспользуется из `src/ui` — поимённо (проверено)

| что | путь | зачем здесь |
|---|---|---|
| реестр видов выносок + грамматики | `src/ui/components/annotation/kinds.ts` (`kindDef:213`, `ANNOTATION_KIND_KEYS:33`) | 8 видов, 4 грамматики — единственная система рисования |
| редактор указаний | `annotation/editor.tsx:59`, высота `ANNOTATION_EDITOR_H` `:49` | полоса указаний листа и мудборда без скачков (П1) |
| зум-разметчик | `annotation/zoom-dialog.tsx:35` (`AnnotationZoomDialog`) | единый зум = та же пишущая поверхность (П3) |
| сцена/фигуры/история/провод | `annotation/{surface.tsx:286, canvas.tsx:304,119, shapes.tsx, geometry.ts, history.ts:37, wire.ts:43-61, style-row.tsx:16, toolbar.tsx:22}` | постановка, отмена, сериализация |
| «кадр + разметчик» | `src/ui/components/focused-annotator.tsx` | лист ARTIFACTS и плитка мудборда — один орган |
| блоки страницы | `section.tsx:29,115` (`Section`,`SectionStack`), `group-label.tsx`, `row.tsx`, `section-header.tsx` | вся вертикаль; локальных обёрток не писать (DESIGN.md) |
| контролы | `button/input/text-area/select/selector/combobox/checkbox/chip/pill/toggle-switch/view-switch` | матрица видов, сегменты, чипы истории цвета |
| модалки | `confirmation-modal.tsx`, `overlay.tsx`, `drawer.tsx`, `popover.tsx`, `tooltip.tsx` | минт-диалог — на overlay, не на confirm |
| плитки | `tiles.tsx:5,34` | ленты и полки; примитив уже чинён ([[tile-button-shrink-to-fit]]) |
| прогресс | `progress.tsx:2` | полоса `today $X of $Y`; заливку делать видимой ([[progressbg-fill-invisible]]) |
| скелеты/пустоты | `skeleton.tsx:22,36,61`, `loader.tsx`, `placeholder.tsx:27` | §5 |
| просмотр медиа | `media-viewer.tsx:194,158`, `media-viewer-zoom.tsx` | там, где поверхность не пишущая |
| слот-приёмник | `media/components/media-slot.tsx:90` | пустой слот верстака: плейсхолдер + ⌘V/бросок ([[media-slot-module]]) |
| приёмная модалка | `files/components/paste-intake-modal.tsx:71` | intake пачки: один жест = одна пачка |
| выбор существующего медиа | `media/components/media-gallery-selector.tsx:51` | дверь «из библиотеки» у референсов |
| роутер отказа | `src/utils/field-errors.ts:226` + `index.tsx:721-746` | «отказ ведёт в место» уже написан |
| QR | `src/ui/components/pattern-qr.tsx:5` + `src/utils/viewer-origin.ts:21` | адрес версии листа |
| снекбар | `snackbar.tsx` + `useSnackBarStore` | тосты `printed v2`, ошибки CAS |
| API | `src/api/api.ts` + генерённые типы `src/api/proto-http/admin` | никаких ручных типов серверных форм |

**Две поправки к редакции 1, обе фактические.** `src/ui/components/cropper.tsx` **не
существует** — отвергать его в Д14 было нечего; клиентская crop-логика живёт в
`media-viewer-zoom.tsx` / `focused-annotator.tsx`, и серверный разрез отвергает **её**, а не
несуществующий файл. `three` **не мёртвый вес**: он используется — динамическим импортом в
`src/ui/components/dxf-quick-view-modal.tsx:47`, специально вынесенным из основного бандла.
Не выкидывать; 3D-выход полосы всё равно рисуется плитками кадров, а не сценой.

---

## 4. Пишется новым (папка `design/`)

| компонент | что делает | ест RPC |
|---|---|---|
| `design-band-provider.tsx` | React Query-обвязка полосы + контекст транзиентного UI (§5) | GetDesignBand |
| `kinds-band.tsx` | ОДИН орган, три состояния flat/render/threed | — |
| `input-strip-{flat,render,threed}.tsx` | входные полосы по kind; композиты исключены | — |
| `params-form.tsx` | матрица видов без замков, layout, ask, цена, бюджет | — |
| `generate-button.tsx` | гейты (профиль/бюджет/пояса) + StartDesignRun с `client_request_id` | StartDesignRun |
| `generation-history.tsx` | строки прогонов, пагинация, свёртка, архив; **счётчики шапки читаются из агрегатов ответа, а не считаются по загруженной странице** | ListDesignRuns, ArchiveDesignRun |
| `run-row.tsx` / `run-panel.tsx` | жёлоб строки + инлайн-панель со снимком входов; **строка попыток** (`failed · попытка 2 из 3 · $0.04`) | CancelDesignRun |
| `uploads-shelf.tsx` | полка пачек; `client_request_id` на пачку | RegisterDesignUpload |
| `bench.tsx` / `bench-slot.tsx` | слоты 4 сторон + детали, CAS-ошибки, fix-bars и под ПУСТЫМ слотом | SetDesignBenchSlot, DeleteDesignDetailSlot |
| `sheet-bar.tsx` / `mixwarn.tsx` | состояние листа + трёхзначная проверка смеси | — |
| `split-modal.tsx` | рамки разреза; резка серверная | SplitDesignPicture |
| `palette.tsx` | 4 источника цвета, lab dip бейджи из `AdminColorwayRef` (`dev_hex`, `lab_dip_*` — уже на проводе), история рецептов из агрегатов | — |
| `threed-menu.tsx` | frames, presentation, модель (`ListModels` + рост из `measurements['height']` — **уже отдаётся**), размер, fit-override со сбросом по прилёту | — |
| `mood-board.tsx` | плитки + полоса указаний + дверь добавления + ✕ с цитатой указаний. **Указания — это `callouts` формы**, отфильтрованные по мудбордным `mediaId`; второго поля нет | — |
| `mood-note-draft.tsx` | `moodNote` + `draft the idea ▸` + квитанции `src:'mood'` | DraftDesignIdea |
| `concept-receipts.tsx` | read sheet vN (клиентская дерривация из выносок) + квитанции обоих src | — |
| `artifacts-tab.tsx` | три состояния корня; чек-лист-двери через `revealField` | GetDesignSheetVersion |
| `sheet-view.tsx` | лист: focused-annotator + полоса указаний + правый список; переключатель `документ / v1..vN` | GetDesignSheetVersion |
| `mint-dialog.tsx` | состав, согласия, fit-гейты, перепиновка, строки-двери. **Отправляет документ целиком** (§6) | MintDesignSheetVersion |
| `version-journal.tsx` | журнал выдач | RecordDesignSheetIssue |
| `vector-editor.tsx` | модалка слоя правок поверх annotation-движка; кисти = машины; **пустая база — законное состояние** | SaveDesignEditLayer, FlattenDesignEditLayer |
| `provenance.ts` / `visibility.ts` | ЕДИНСТВЕННЫЕ селекторы провенанса и видимости (Д1) | — |
| `handles.ts` | хэндлы `run 5 · b`, подписи пачек | — |

Печать: `src/components/managers/tech-card/print-page.tsx` дополняется листом vN
(замороженный состав из `GetDesignSheetVersion` + QR на версию).

---

## 5. Форма состояния и граница с серверной

Правило одно: **кандидаты и всё, что переживает сейв, — не состояние формы.**

- **Серверная полоса** (runs, attempts, pictures, batches, bench, versions, journal, budget,
  layers) — React Query, ключи `['design-band', cardId]`, `['design-runs', cardId, page]`,
  `['design-sheet', cardId, versionNumber]`. В RHF-форму карточки эти данные не попадают
  **никогда**; постановка в слот не делает форму dirty.
- **Документ** (moodboard-строки, refs, `mood_note`, garment description, **callouts**,
  concept, aspects) — как сейчас, в RHF-форме; сейв — существующий `UpdateTechCard`.
  Новое: `client_ref` минтится клиентом при добавлении выноски, номер уходит нулём.
  Ловушки, уже стрелявшие и обязательные к обходу: черновик/restore не должен стирать
  отсутствующие поля ([[techcard-draft-restore-wipes-absent-fields]]); **два `useFieldArray`
  на одно имя не синхронятся** — и это не гипотеза, а текущее состояние
  (`sketch-tab.tsx:170,174,292-301`: запись идёт в корень массива в обход `append/remove`)
  ([[rhf-fieldarray-mutations-dont-broadcast]]); Radix Select шлёт фантомную пустоту
  ([[radix-select-emits-phantom-empty]]).
- **Транзиентный UI** (tool, placing, pickMode, fixCtx, paramsOpen, runOpen, bandPage, zoom) —
  контекст `design-band-provider` + `useReducer`; не zustand (состояние умирает с карточкой);
  не переживает перезагрузку по построению.
- **Derived** — только функции от (server, form, ui): mixState, benchDiff, pastline,
  устарелость рендеров, доступность GENERATE, состояния concept-списка. Хранить — ложь двух
  источников.

Граница одной фразой: форма владеет тем, что подписывается и печатается; query-слой — тем,
что генерится, лежит и стоит в слотах; UI-контекст — тем, что умирает по Esc.

### 5.1 Timestamp: принимать оба написания

Генерённый TS объявляет `createdAt: wellKnownTimestamp | undefined`
(`src/api/proto-http/admin/index.ts:414,472,895`), а JSON-гейтвей с `EmitUnpopulated` кладёт
в незаполненное поле **явный `null`** ([[wire-null-message-vs-zod]]). Оба написания реальны,
поэтому zod-схемы полосы обязаны быть `.nullish()`, а не `.optional()`. Схема, принимающая
только одно из двух, отвергнет живой ответ — и это не гипотеза: в репо уже есть поля
`createdAt`, объявленные вообще другим типом (`index.ts:3788-3789`, `number | undefined`).

---

## 6. Сейв, минт и серверные назначения

Существующая граница, которую **нельзя ломать** (она сложнее, чем выглядит):

- PUT `UpdateTechCard` с `expectedLockVersion` — `index.tsx:901-908`;
- сразу после — `withServerAssignedValues(data)` `:918`, внутри которого `GetTechCard`
  `:797` и `queryClient.setQueryData(...)` `:807` с комментарием, объясняющим зачем: «so the
  detail this reset is built from is the same one the NEXT save reads its
  `expectedLockVersion` from»;
- в `sent` вливаются серверные значения **по ключам**: sign-off digests `:812-825`, ревизии
  выкроек `:826-835`, id BOM **по `lineKey`** `:837-843`, `construction` целиком `:845-868`.

Отсюда два решения редакции 2:

1. **Перечитывание остаётся.** Обещание редакции 1 «влить назначения без перечитывания»
   несовместимо с этим кодом: без `GetTechCard` следующий сейв пойдёт со старым
   `expectedLockVersion` и получит ложный `Aborted`.
2. **Номера выносок вливаются тем же приёмом, что id BOM** — по ключу строки. Ключ —
   `client_ref` (`10` §4.2), хранимый и круглорейсовый: он приходит обратно в `GetTechCard`,
   и `withServerAssignedValues` сопоставляет им `callouts[].number`, как сейчас сопоставляет
   `bomItems[].id` по `lineKey`. Расширения `UpdateTechCardResponse` не требуется вовсе.

**Минт — это разновидность сейва, а не действие рядом с ним.** `MintDesignSheetVersion`
несёт документ и `expected_lock_version` (`11` §2.1), поэтому `mint-dialog` не жмёт «Save»,
а вызывает тот же сборщик payload, что и обычный сейв, и по успеху проходит тот же
`withServerAssignedValues`. Человека через два шага вести не нужно: шаг один.

---

## 7. То, чего сервер ещё не отдал; пустые состояния; ушедший человек

- **Идущий прогон**: StartDesignRun возвращает строку сразу; лента рисует плитки-заглушки по
  `requested_outputs` — место зарезервировано, прилёт не двигает вёрстку. Пока есть строка
  `running` — `refetchInterval` 3 с; нет — поллинг выключен. Счётчик `0:14 / ~25 s` тикает от
  серверного `started_at`.
- **Оптимизм**: слоты — оптимистичная постановка с откатом по `Aborted` (snackbar «Б. уже
  поставил front из run 8» + refetch); hide/archive — оптимистично; **GENERATE и MINT — не
  оптимистичны** (деньги и подпись: строка появляется только с ответом).
- **Отмена**: у строк `pending`/`running` — дверь `cancel`. Для `running` пилюля
  `cancelling…` и честный текст: результат, пришедший после отмены, всё равно оплачен и
  будет показан.
- **Пустые состояния**: пустая студия = четыре слота-цели + две равновесные двери; формы
  параметров нет до первой строки; секция generation history **отсутствует** (не пустая
  шапка) без прогонов; пик-мод при нуле кандидатов — inert-note; ARTIFACTS без предусловий —
  чек-лист-двери.
- **Человек ушёл**: истина на сервере, размонтирование останавливает поллинг, возврат =
  обычный GetDesignBand. Никакого localStorage для полосы. Строки `running` с сервера
  рисуются как идущие независимо от того, кто их запустил.
- **Скелеты**: первый GetDesignBand — `skeleton.tsx` на секции; ошибка сети — ретрай-плашка
  на секции, остальная карточка живёт.

---

## 8. Определение готовности: тринадцать находок 05

| находка | где чинится |
|---|---|
| Г1 указания мудборда: читатель, стейл, ✕, дверь добавления | mood-board + mood-note-draft; **указания = `callouts` формы**, отдельного дома не заводится |
| Г2 архив прячет одну проекцию | generation-history + `visibility.ts`: архив = свёртка строки, бейдж `run 8 · archived` на несущей плите |
| Г3 сторож ✕ референса по (role,note) | references: считать по `mediaId` из снимков (контракт это гарантирует — `inputs.refs`) |
| Г4 фикс-полосы только в заполненном слоте | bench-slot: fixBars и под пустым |
| Г5 3D fit-override липнет + ложная угроза листа | threed-menu: сброс по прилёту; текст пиллы без «cannot enter the sheet» |
| Г6 diff-модалка слепа к деталям | mint-dialog: строки деталей из плит версии × bench |
| Г7 отказ concept одной причиной | concept-receipts: вторая причина «sheet vN has no callouts» |
| Г8 литералы 'brief' в wmg | what-model-gets: переходы всегда с kind |
| Г9 счётчик приписывает листу чужое | concept-receipts: счёт по src |
| Г10 замок минта называет STUDIO без двери | mint-dialog: строки-двери через `revealField` |
| Г11 первая выноска обязана быть pin | sheet-view: полоса видов и на черновике, kind едет в минт |
| Г12 пик-мод при нуле кандидатов | bench-slot |
| Г13 пик-мод × взведённый инструмент | ui-reducer: взвод одного гасит другой |

Плюс мелочи 05: рецепт fabric photo несёт `fabric_media_id`; Esc-приоритеты (первый Esc
снимает инструмент, второй — взведённую перепиновку; сейчас модалка секунду врёт о режиме);
повторный выбор fabric photo не плодит референсы.

---

## 9. Резка на параллельные куски

```
F-0  бамп сабмодуля proto + make proto + design-band-provider
     + visibility/provenance/handles                          ← контракт К-1..К-4 на бете
F-1  studio: kinds-band, params-form, generate, input strips   ← F-0, B-3
F-2  generation-history + run-panel (+попытки, отмена)
     + uploads-shelf + split                                   ← F-0, B-2/B-3
F-3  bench + sheetbar + mixwarn + fix-flow                      ← F-0, B-2
F-4  moodboard: полоса указаний (на callouts), note, draft      ← F-0, B-3 (draft_idea)
F-5  artifacts: три состояния, лист, переключатель версий,
     минт одним актом, журнал                                   ← F-3, B-4; нули выносок ← B-5
F-6  palette + threed-menu                                      ← F-1
F-7  vector-editor + флэттен (пустая база!)                     ← F-2, B-2
F-8  печать vN + QR на версию                                   ← F-5
F-9  рельс табов: FOLDED_TABS ×2, TAB_GROUPS, ERROR_TAB,
     RELEASE_BLOCKER_TAB, смерть sketch-tab, прогулки П1–П8      ← всё выше
```

F-1..F-4 и F-6 — параллельны после F-0. Шов между параллельными агентами —
`design-band-provider` и селекторы: пишутся первыми и замораживаются; ревью **объединённого**
диффа обязательно ([[parallel-agents-seam-defects]]). Работать в основном клоне, без ворктри
с сабмодулем ([[admin-client-worktree-submodule-trap]]); при живых параллельных агентах —
никакого `git stash` и `git add -A` по общему дереву
([[parallel-agents-shared-worktree]]).

Гейты каждого куска: `yarn build:check` руками (CI типы не гонит), прогулка соответствующего
П-сценария мышью на бете, пробы — цитата + мутация с отрицательным контролем. Помнить, что
зелёная разметка не доказывает работающий жест ([[probes-hold-markup-not-gestures]]), а
закрытый `<details>` меряется как видимый ([[closed-details-measures-as-visible]]).
