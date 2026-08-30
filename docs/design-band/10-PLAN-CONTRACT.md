# 10 — План внедрения: КОНТРАКТ (proto)

Редакция 2 (после `14-CRITIQUE-A.md` / `15-CRITIQUE-B.md`). Что изменилось и почему —
[`16-PLAN-REVISION.md`](./16-PLAN-REVISION.md). Решения Д1–Д21 — в
[`13-PLAN-DECISIONS.md`](./13-PLAN-DECISIONS.md).

**Где живёт контракт.** Источник истины — `proto/` в `grbpwr-products-manager`
(`proto/admin/admin/admin.proto`, `proto/common/common/*.proto`). `grbpwr-proto` — зеркало;
на 29.08.2026 живая ветка зеркала — **`files-wave2`**, а не `main` (`origin/main` отстаёт на
30 коммитов). `proto/contracts/mirror-git-ref.txt` на `origin/master` бэкенда указывает на
`d1b06c7` = tip `origin/files-wave2`. Сабмодуль `proto/` в admin-client стоит на `de1767f`,
на два коммита позади. Порядок правки: бэкенд-репо → зеркало (та ветка, на которую смотрит
`mirror-git-ref.txt`) → бамп сабмодуля клиента → `make proto`.

Принцип раздела прежний: **всё новое аддитивно**. Ни одно существующее поле не меняет ни
номера, ни типа, ни семантики чтения.

---

## 0. Что из редакции 1 вычеркнуто как уже существующее

Проверено по `origin/master`, не по рабочему дереву.

| было в плане | что на самом деле | вывод |
|---|---|---|
| `media.content_sha256` (новая колонка + поле) | `media.content_hash CHAR(64)` + `idx_media_content_hash` заведены `0336_techcard_archive_import.sql:122-130`; пишется на всех путях (`internal/bucket/image.go:218`, `:415`); читается `FindMediaByContentHash` | вторая колонка вычеркнута; на провод выносится **существующая** |
| «обобщить `uploadRawImageObj` до PNG» | `Bucket.UploadContentImageVerbatim` (`internal/bucket/image.go:297`) уже принимает **JPEG, PNG, WebP и GIF** побайтово, HEIC отказывает явно; вызывается из `internal/apisrv/admin/techcard_archive_files.go:282`; тесты `internal/bucket/media_content_hash_test.go:292,368,388,414` | работа сделана; остаётся **только RPC-поверхность** |
| `ListModelsResponse.height_mm` | рост живёт строкой словаря `model_measurement` (`0064:25-31`, ключ `height` — `internal/entity/model.go:29`) и уже отдаётся `ListModels` через enrich (`internal/store/model/model.go:186,301`) | вычеркнуто целиком |
| `AdminColorwayRef.color_hex_override` + `effective_hex` | `AdminColorwayRef.dev_hex = 24` (`techcard.proto:541`, «screen approximation #RRGGBB») уже есть, и это ровно тот факт | вычеркнуто как ложное расщепление |
| `TechCardMediaItem.view_key` | ось «вид» — это существующий `TechCardMediaKind` (`techcard.proto:45-55`: FRONT/BACK/DETAIL/LINING/PREVIEW) | вычеркнуто; словарь **расширяется**, а не дублируется |
| `TechCardMediaItem.artifact_role` | «принятый рендер» выражается парой `category='technical'` + новым значением словаря `RENDER` | вычеркнуто |
| `TechCardMediaItem.annotations` + `line_key` | указания мудборда **уже существуют** как `TechCardCallout` с `media_id` на мудбордную картинку; клиент рисует их той же поверхностью (`sketch-tab.tsx:835`, `view='moodboard'`) | вычеркнуто; второй дом не заводится ([[callout-geometry-one-system]]) |
| `CalloutNumberAssignment` / `CalloutNumberRemap` в ответе | у выноски на проводе нет клиентского ключа, сопоставить ответ нечем; и клиент после сейва **всё равно перечитывает карточку** (`index.tsx:797,807,918`) и сливает серверные значения по ключу (BOM — по `lineKey`, `:837-843`) | вычеркнуто; вместо ответа — **хранимый `client_ref`** (§4.2) |

---

## 1. Где живут новые сообщения

Новый файл **`common/common/design.proto`** (package `common`): полоса — отдельная
подсистема со своим жизненным циклом вне документа карточки, и её сообщения не должны
тянуть 4000-строчный `techcard.proto` при каждой правке. RPC — в существующем
`AdminService` (`admin/admin/admin.proto`); второй сервис дал бы второй канал авторизации
без выгоды.

Переиспользуется, а не дублируется:
- `common.MediaFull` (`common/common/media.proto:9-17`) — везде, где отдаётся картинка;
- `common.TechCardAnnotation` (`common/common/techcard.proto:2387`) — для замороженных
  выносок версии; вторая система видов запрещена.

---

## 2. Новые сообщения

Колонка «кто пишет»: **S** — только сервер, **C** — клиент при создании, дальше read-only.

### 2.1 `DesignRun` — строка задания генерации

| поле | тип | кто | экранный факт, без которого нельзя нарисовать честно |
|---|---|---|---|
| id | int32 | S | адрес строки истории; хэндл `run 5` |
| tech_card_id | int32 | C | принадлежность полосе карточки |
| kind | string | C | `flat\|render\|threed\|draft_idea` — какое состояние студии породило строку |
| status | string | S | `pending\|running\|done\|failed\|cancelled` — бегущая плитка против готовой |
| client_request_id | string (UUID) | C | двойной клик GENERATE = один платёж (Д11) |
| profile_name, profile_version | string | S | подпись `flat-3view @ v4` в истории; пин версии профиля (F5, Д12) |
| ask | string | C | фраза дельты — подпись строки в истории (Р2) |
| params | DesignRunParams | C | что просили: без него панель прогона нема |
| inputs | DesignInputSnapshot | S | «какими входы были на момент запуска» (G4, I8.3); сервер снимает сам — подделка провенанса клиентом невозможна |
| fit_at_launch | string | S | бейдж `fit slim ≠ card oversized` (H6.7) |
| rrev | int32 | S | подпись `r4` в истории цвета (H5); MAX+1 по карточке для kind=render |
| requested_outputs | int32 | S | `done · 2 of 3` при частичном ответе |
| attempts | repeated DesignRunAttempt | S | `failed · попытка 2 из 3 · $0.04 всё равно списано` — без этого реестр денег врёт (§2.2) |
| price_estimate, price_actual | string (decimal) | S | цена до запуска и по факту; `price_actual` = сумма попыток |
| currency | string | S | «$» в полосе бюджета не захардкожен |
| author | string | S | штамп автора на строке — без него гонка авторов невидима (G6.3) |
| cancel_requested_at | Timestamp | S | пилюля `cancelling…` на идущей строке (Д20) |
| archived_at, archived_by | Timestamp, string | S | свёрнутая строка `· K archived` + кто свернул (Д2) |
| error_code, last_error | string | S | строка `failed · provider timeout` вместо молчаливой дыры |
| output_text | string | S | результат текстового прогона (kind=draft_idea) |
| created_at, started_at, completed_at | Timestamp | S | `0:14 / ~25 s`; сортировка истории |
| pictures | repeated DesignPicture | S | плитки под строкой — отдаются вместе со строкой, не отдельным плоским списком (§3, пагинация) |

### 2.2 `DesignRunAttempt` — одна попытка платного вызова

`{attempt_no, provider, provider_request_id, provider_idempotency_key, state, price, started_at, finished_at, error_code}`.

Экранный факт: строка истории обязана уметь сказать **«первая попытка оплачена, ответ не
доехал»**. Без отдельной попытки `price_actual` показывает цену последней, полоса бюджета
недосчитывает ретраи, а на вопрос «куда ушли деньги» реестр отвечает неправдой. Прецедент
уже в репо: `internal/apisrv/admin/techcard_analysis.go` пишет usage и у провалившегося
прогона — «usage says whether a failed run was also a paid one».

### 2.3 `DesignRunParams`

| поле | тип | экранный факт |
|---|---|---|
| views | repeated string | какие виды просили — резерв плиток-заглушек (И-22) |
| layout | string | `one\|per_view` — композит против по-видовых (I4) |
| colour | DesignColourRecipe | чипы истории цвета восстанавливают рецепт (H5) |
| threed | DesignThreedParams | панель прогона 3D |
| fix_target | string | `fix: back` — столбец «вход = слоты (back)» (I6) |
| extra_input_media_ids | repeated int32 | неразмеченный флэт как доп. вход рендера (I2) |

`DesignColourRecipe`: `source` (`dictionary\|own\|photo`), `code`, `hex`, `words`,
`fabric_media_id` — последний обязателен, иначе фото-рецепт не восстановим чипом (05, «мелочи»).
`DesignThreedParams`: `frames`, `presentation` (`air\|model`), `model_id`, `garment_size`,
`fit_override`, **`source_picture_ids` (repeated int32)** — четыре конкретные render-плиты
одного `rrev`, которые 3D берёт входом (03-SPEC:604-611): без них панель прогона 3D не может
показать, из чего собран поворот.

### 2.4 `DesignInputSnapshot` — снимок входов (собирает только сервер)

| поле | тип | экранный факт |
|---|---|---|
| garment_note | string | панель прогона: слова, ушедшие модели |
| mood | DesignMoodSnapshot `{note, callouts(repeated {media_id, text})}` | `draft the idea` читает мудборд (§3) — без снимка нельзя показать, ЧТО он прочитал |
| refs | repeated DesignInputRef `{media, role, note, deleted}` | миниатюры входов панели; `media` — **разрешённый сервером `MediaFull`**, `deleted=true` когда строка медиа стёрта |
| slots | repeated DesignInputSlot `{view_key, media, content_hash, layer_rev, deleted}` | вход рендера/фикса; сравнение с текущими слотами даёт бейдж `устарел` |
| fit | string | что видела модель |
| views, layout | repeated string, string | отпечаток дивайдера `current / earlier` (Р17) |

**Хранится id, отдаётся `MediaFull`.** В БД снимок морозит `media_id` (замораживать URL
нельзя — объекты переезжают); на чтении сервер джойнит `media` и отдаёт готовую картинку.
Иначе панель прогона нечем нарисовать: во всём `AdminService` нет ни одного RPC, читающего
медиа по id (`admin.proto:45,73,78,90` — Upload, Delete, ListObjectsPaged, GetMediaUsage;
`GetMediaUsageResponse:3314-3333` отдаёт ссылки, не `MediaFull`).

### 2.5 `DesignPicture`

`{id, tech_card_id, media(MediaFull), run_id, batch_id, ordinal, kind, ghost_view,
composite_views, derived_from, source_class, mixed_input, layer_rev, content_hash,
hidden_at, hidden_by, created_at}` — экранные факты те же, что в редакции 1, с одной
заменой: `content_sha256` → **`content_hash`** (та же колонка `media.content_hash`, 0336).

### 2.6 `DesignBatch`

`{id, tech_card_id, client_request_id, author, files_count, size_bytes, created_at}` —
штамп полки `uploaded · Т. · 14:41 · 12.4 MB` и носитель когерентности пачки (J10.4).
`client_request_id` — потому что повтор после сетевого таймаута иначе заводит вторую пачку
и второй набор картинок (B4).

### 2.7 `DesignBenchSlot`

`{id, view_key, detail_name, picture_id, slot_rev, set_by, set_at}` — как в редакции 1.
`id` минтуемый: «деталь 1/2» как ключ запрещён (H4).

### 2.8 Версия листа

- `DesignSheetVersion` — `{id, version_number, client_request_id, mixed_consent,
  minted_via, minted_by, minted_at, plates, callouts}`.
- `DesignSheetPlate` — `{view_key, slot_id, detail_name, media(MediaFull), content_hash,
  layer_rev, source_class, run_id, fit_stamp, mixed_input, ordinal}`. **Плиты и выноски —
  не JSON-ком, а собственные строки** (см. `11` §1): версия обязана печататься через год,
  значит её байты нельзя стереть, а это выражается FK, который видит медиатека.
- `DesignSheetCallout` — `{number, media(MediaFull), annotation(TechCardAnnotation), text}`.
- `DesignSheetIssue` — `{id, version_number, action('minted'|'printed'|'shared'), actor, created_at}`,
  append-only.

### 2.9 `DesignEditLayer`

`{id, tech_card_id, base_media_id (0 = чистая векторная база), rev, strokes(bytes JSON),
updated_by, updated_at}`. Адресуется **своим `id`**, а не `base_media_id`: дверь `draw it`
из пустой студии рождает слой без базы (03-SPEC:546-569), и модель «слой = калька поверх
картинки» её не выражает вовсе (B6).

### 2.10 `DesignBudget`

`{day(string YYYY-MM-DD), day_spent, cap, currency, timezone}` — полоса
`today $0.41 of $2.00`. `timezone` на проводе, потому что «сегодня» — решение организации,
а не MySQL-сессии (Д10).

---

## 3. Новые RPC в AdminService

| RPC | семантика | ошибки |
|---|---|---|
| `GetDesignBand(tech_card_id)` | одно чтение полосы: bench + версии (номера + comp последней) + журнал + бюджет + слои + **агрегаты** (`total_runs`, `archived_runs`, `max_rrev`, `colour_recipes[]`, `hidden_by_run{}`) + первая страница runs с их картинками. Скрытое и архивное отдаётся С флагами — фильтрует клиент (Д1) | NotFound |
| `ListDesignRuns(tech_card_id, limit, page_token, include_archived)` | страница истории вместе с картинками страницы (П10) | NotFound, InvalidArgument (limit > 24) |
| `GetDesignSheetVersion(tech_card_id, version_number)` | полная замороженная версия: плиты + выноски + журнал. **Без него печать старой Rev.N, QR на конкретный выпуск и сверка фабричной бумаги невозможны** (B1; 02-DECISIONS:504-510 требует, чтобы QR Rev.3 вёл на Rev.3) | NotFound |
| `StartDesignRun(tech_card_id, client_request_id, kind, ask, params)` | одна SERIALIZABLE-Tx: пояса гейта (§ниже) + резерв бюджета дня + снимок входов + вставка строки. Дубль `client_request_id` возвращает существующую строку с OK | FailedPrecondition: `budget_exceeded`, `profile_requirements_unmet`, `composite_input`, `run_in_flight`, `hourly_limit`; InvalidArgument |
| `CancelDesignRun(run_id)` | `pending` → `cancelled`, резерв дня освобождается; `running` → ставит `cancel_requested_at`, воркер честит его до отправки и после ответа. Результат, пришедший после отмены, всё равно оплачен и записан — строка так и говорит (Д20) | FailedPrecondition: `already_terminal` |
| `ArchiveDesignRun(run_id, archived)` | презентационный флаг строки, обратимый; картинки не прячет (Д2) | NotFound |
| `HideDesignPicture(picture_id, hidden)` | единственный персистентный глагол невидимости (Д1); сторож: не в слоте, не в comp ни одной версии, не вход идущего прогона, не родитель живого кропа | FailedPrecondition: `in_slot`, `in_version`, `live_run_input`, `live_crop_parent` |
| `RegisterDesignUpload(tech_card_id, client_request_id, items[{media_id, ghost_view}], target?, expected_slot_rev?)` | один жест = одна пачка + картинки; `target` дополнительно ставит первую картинку в слот **тем же CAS**, что и обычная постановка (B4). Формат не гейтится: принимается всё, что принял upload; «~1200px — печать будет мылом» — метка на клиенте, не отказ | InvalidArgument: пустой список, неизвестный ghost_view; Aborted: `slot_rev_mismatch` |
| `SplitDesignPicture(picture_id, client_request_id, frames[{x,y,w,h,view_key}])` | серверный лослесс-разрез композита из оригинальных байт (Д14); кропы — сиблинги под той же строкой | FailedPrecondition: `not_composite`; InvalidArgument |
| `SetDesignBenchSlot(tech_card_id, slot(view_key либо slot_id), picture_id, expected_slot_rev, new_detail_name?)` | постановка/вытеснение/unmark; CAS по `slot_rev`; ленивое рождение слота — тем же актом | Aborted: `slot_rev_mismatch` (+ текущее состояние слота в details); FailedPrecondition: `composite_plate`, `hidden_plate`, `wrong_kind`, `foreign_card_plate`, `picture_already_in_slot`, `detail_name_required` |
| `DeleteDesignDetailSlot(slot_id)` | удаление ПУСТОГО слота детали, **не процитированного ни одной версией** (B16) | FailedPrecondition: `slot_filled`, `slot_in_version {versions}` |
| `MintDesignSheetVersion(tech_card_id, client_request_id, tech_card(TechCardInsert), expected_lock_version, expected_plates[], mixed_consent, uploaded_fit_confirmed, minted_via)` | **атомарный минт** (Д7): в ОДНОЙ SERIALIZABLE-Tx выполняется обычная запись документа (тем же кодом, что `UpdateTechCard`) и рождение версии. Замороженные выноски берутся из документа, который эта же транзакция записала, — состояния «перепиновано, но версии нет» не существует | Aborted: `lock_version_mismatch`, `bench_moved` (+что); FailedPrecondition: `mixed_needs_consent`, `fit_mismatch {view, fit, card_fit}`, `uploaded_fit_unconfirmed`, `sheet_min_unmet {missing views}` |
| `RecordDesignSheetIssue(tech_card_id, version_number, action, client_request_id)` | строка журнала printed/shared; ничего не минтит (H1) | NotFound |
| `SaveDesignEditLayer(tech_card_id, layer_id, base_media_id, expected_rev, strokes)` | CAS-сохранение слоя; `layer_id=0` + `base_media_id=0` рождает чистую векторную базу | Aborted: `layer_rev_mismatch {current_rev}`; InvalidArgument: `strokes_too_large` |
| `FlattenDesignEditLayer(tech_card_id, layer_id, expected_rev)` | растеризация база+слой → медиа + `DesignPicture{derived_from, source_class, layer_rev}`. `expected_rev` обязателен: без него коллега сохраняет r4, а флэттен материализует его под намерением того, кто видел r3 (B-мелочь 3) | Aborted: `layer_rev_mismatch`; FailedPrecondition: `empty_layer` |
| `DraftDesignIdea(tech_card_id, client_request_id)` | текстовый прогон через ту же машину денег и идемпотентности (Д6); исполняется инлайн, ответ несёт готовую строку со `status=done` и `output_text` | FailedPrecondition: `budget_exceeded`, `no_moodboard` |

**Чего в контракте нет и почему.** RPC «read sheet vN» есть (см. выше — в редакции 1 его
не было, и это был блокер). Нет: RPC «принять состав» — акта принятия не существует (H0);
«профили промптов» как объект — Д12, серверный конфиг; счётчик variants — J8, удалён;
удаления `DesignPicture` — невидимость и стирание байтов это разные ярусы (Д1).

---

## 4. Изменения существующих сообщений (все аддитивные)

### 4.1 `TechCardInsert.mood_note` — `optional string`

Verbatim-протокол «absent = сохранить» дословно по образцу `cutting_coefficient`
(`techcard.proto:1112`) и purpose/kind (`:829`). Экранный факт: общее поле мудборда (П8),
которое вкладка со старым бандлом не сотрёт.

### 4.2 `TechCardCallout.client_ref` — `string`

**Хранимый и круглорейсовый** ключ строки, который минтит клиент при рождении выноски
(UUID). Экранный факт: после сейва форма обязана понять, какой её строке достался какой
серверный номер, — иначе фокус, подсветка и «отказ ведёт в место» показывают чужую выноску.
Сегодня у `TechCardCallout` (`techcard.proto:81-122`) нет ни одного клиентского ключа, и
единственная идентичность — номер.

Три свойства, каждое обязательно:
1. **В дайджест не входит.** `designProjection` перечисляет поля явно
   (`internal/dto/techcard_section_digest.go:282-286`); `client_ref` — адрес, не содержание,
   ровно как цвет выноски, который туда не входит по тому же доводу.
2. **Управляет минтом номера.** `number == 0 && client_ref != ""` ⇒ «сминти».
   `number == 0 && client_ref == ""` ⇒ легаси-ноль, **не трогать** (Д8).
3. **Не обязателен.** Старые строки читаются с пустым `client_ref`; ни один старый клиент
   его не пришлёт и не потеряет.

### 4.3 `TechCardMediaKind` — три новых значения

`TECH_CARD_MEDIA_KIND_SIDE_L = 9`, `SIDE_R = 10`, `RENDER = 11`.

Экранные факты: боковые виды нужны матрице видов студии (без них флэт бок некуда положить);
`RENDER` — принятый рендер, лежащий в `category='technical'`, то есть уходящий наружу (F6).
Это **расширение существующего словаря**, а не вторая ось: `kind` уже несёт
FRONT/BACK/DETAIL/LINING/PREVIEW (`techcard.proto:45-55`).

Цена: `chk_tech_card_media_kind` (`0073_tech_card_materials_depth.sql:44-45`,
`kind REGEXP '^(front|back|detail|lining|preview|moodboard|reference|swatch)$'`) обязан быть
расширен, а ADD CHECK = COPY таблицы. Обязательный замер до миграции (`11` §1.7).

Круглый рейс старого бандла **проверен и безопасен**: клиентская схема объявляет вид открытой
строкой — `kind: z.string().optional().default(DEFAULT_MEDIA_KIND)`
(`admin-client src/components/managers/tech-card/components/schema.ts:232`), а нормализация
подменяет только `…_UNKNOWN` (`:2133`). Вкладка со старым бандлом прочитает `side_l` как
строку, покажет сырым значением в пикере и **вернёт неизменной**. Закрытый zod-enum сделал бы
расширение словаря невозможным до выката клиента — его здесь нет.

### 4.4 `MediaFull.content_hash` — `string`

Выносит на провод **существующую** колонку `media.content_hash` (0336). Экранный факт: что
именно морозит версия листа; пусто = «медиа старше 0336», честно.

### 4.5 `UploadContentImageRequest.preserve_original` — `bool`

Открывает RPC-поверхность к **уже написанному** `Bucket.UploadContentImageVerbatim`
(`internal/bucket/image.go:297`). Экранный факт: флэт печатается 1:1 теми байтами, что
загрузили. Обещание держится для JPEG/PNG/WebP/GIF; HEIC verbatim-путь отказывает явно —
это и есть честная формулировка вместо «1:1 для всего» (B14).

### 4.6 `MediaUsageRef.kind` — два новых значения словаря

`design_picture`, `design_sheet_version`. Proto не меняется (`kind` — строка,
`admin.proto:3329`), меняется документация значения. Это **обязанность, а не опция**:
`TestMediaUsageRegistryCoversSchema`
(`internal/store/media_usage_integration_test.go:148`) диффит реестр против живых FK в
`media(id)` и краснеет на незарегистрированной колонке.

---

## 5. Совместимость: что меняется в поведении

Проводных поломок нет. Поведенческих подвижек **две** (в редакции 1 было три; смена
проекции дайджеста снята — Д4).

### 5.1 Минт номера выноски (Д8)

Сервер присваивает номер только выноске, у которой `number == 0` **и непустой
`client_ref`**. Такую комбинацию умеет прислать только новый клиент. Отсюда:

- **легаси-нули не трогаются никогда.** В `tech_card_callout` лежит
  `callout_number INT NOT NULL DEFAULT 0` без UNIQUE (`0067_add_tech_card_core.sql:113`), и
  дублирующиеся нули там законны. Правило «`number<=0` = минти» из редакции 1 перенумеровало
  бы их первым же сейвом с любого клиента — то есть сдвинуло бы DESIGN-дайджест массово, на
  всём проде, в момент выката (`c.Number` хешируется явно: `techcard_section_digest.go:283`);
- **старый клиент ничего не замечает**: он не шлёт `client_ref`, его номера остаются его;
- `tech_card.callout_seq` монотонен: `GREATEST(callout_seq, MAX(входящих))` каждым сейвом,
  так что номер, сминченный после выката клиента, не столкнётся ни с одним прошлым.

Ремапа переиспользованных номеров **нет** (в редакции 1 был). Причина — цена, посчитанная
по коду: на номер выноски в том же payload ссылаются трое, и двое из них ломаются молча или
жёстко. Операция с ссылкой на исчезнувший номер **молча теряет пин**
(`internal/dto/techcard_production.go:279-283`: «a reference to a callout that no longer
exists DETACHES»); дефект с такой ссылкой **роняет сейв**
(`:1015-1018`: `does not reference a callout in this payload`). Ремапить чужие номера
значит устраивать это старым клиентам без единого слова на их экране.

### 5.2 Место минта в конвейере сейва

Минт исполняется **в хендлере `UpdateTechCard`, до всего остального**, а не в сторе.
Порядок на `origin/master` (`internal/apisrv/admin/techcard.go`):

```
:389  carryOmittedFabricDirectionFrom
:397  carryOmittedPieceCutSymmetryFrom
:401  carryOmittedPieceUngradedFrom
:405  carryOmittedPieceFusingFrom
:410  dto.CarryOmittedCalloutGeometry(stored, tc)     ← перенос геометрии по НОМЕРУ
:423  s.restampFreshSignoffDigests(ctx, id, tc, …)    ← постановка подписи
:428  UpdateTechCardAndListOrphanedPatternURLs        ← стор
```

Минт в сторе (редакция 1) означал бы: дайджест считается по payload с нулём, а стор пишет
семёрку — **свежая подпись DESIGN рождается протухшей** и не лечится переутверждением, тот
самый дефект, о котором предупреждает шапка `techcard_section_digest.go:250-251` и
[[digest-write-vs-read-asymmetry]].

Минт обязан стоять и **до** `:410`: `CarryOmittedCalloutGeometry` сопоставляет по номеру
(`techcard_annotations.go:552`), и выноска с номером `0` подцепила бы геометрию легаси-нуля.

### 5.3 Порядок выкатки

**Контракт → бэкенд → клиент.** Правило репо; здесь оно содержательно по двум причинам:
новые RPC должны существовать раньше, чем клиент их зовёт, и расширенный словарь `kind`
должен приниматься раньше, чем клиент начнёт присылать `side_l`.

Клиент старше сервера (штатное окно между 2 и 3):
- новых RPC не зовёт — полосы просто нет, `sketch`/`moodboard` работают как раньше;
- `mood_note` не шлёт → absent → сохранён;
- `client_ref` не шлёт → минта не происходит → его номера остаются его;
- новых значений `kind` не производит;
- дайджест не трогается вовсе.

Клиент новее сервера запрещён порядком; на всякий случай каждый новый RPC на клиенте
гейтится: `Unimplemented`/404 от гейтвея → полоса рисует «server does not speak design yet»,
не падает.

---

## 6. Пределы, объявленные контрактом

Без чисел контракт не проверяем, а `GetDesignBand` за один рейс тянет всю полосу.

| предел | значение | почему |
|---|---|---|
| `ListDesignRuns.limit` | ≤ 24, по умолчанию 12 | страница истории — 4 строки на экран, три экрана запаса |
| `GetDesignBand` | bench + версии + журнал (≤ 50 строк) + первая страница runs | картинки едут **под своими строками**, а не плоским списком: карточка с 40 прогонами по 3 выхода иначе отдаёт 120 `MediaFull` на каждое чтение |
| `params` | ≤ 8 KB | |
| `inputs` | ≤ 64 KB; refs ≤ 24, slots ≤ 8 | снимок обязан помещаться в строку и в глаз |
| `strokes` | ≤ 512 KB | одна векторная правка; сверх — «слишком много штрихов, разбейте» |
| замороженных выносок в версии | ≤ 200 | тот же потолок читаемости, что у `maxAnnotationPieces` |
| точность координат | как у `TechCardAnnotation` | защита точности уже написана и уже была атакой ([[annotation-coordinate-precision-guard]]) |

---

## 7. Резка на параллельные куски

| кусок | содержимое | зависит от |
|---|---|---|
| **К-1** | `design.proto`: сообщения §2 | — |
| **К-2** | RPC §3 в `admin.proto` | К-1 |
| **К-3** | `mood_note` + `client_ref` + `TechCardMediaKind` +3 значения | — |
| **К-4** | `MediaFull.content_hash` + `UploadContentImageRequest.preserve_original` | — |

К-1, К-3, К-4 независимы; К-2 ждёт К-1. Мержится одним PR в бэкенд-репо (один цикл
`buf generate`), но пишется тремя руками. Дальше — зеркало на ветку из
`mirror-git-ref.txt`, бамп сабмодуля клиента, `make proto` с обеих сторон. Свежий ворктри
бэкенда требует `buf generate` до `go build` — `proto/gen` под `.gitignore`
([[fresh-worktree-needs-codegen]]).
