# 11 — План внедрения: БЭКЕНД (grbpwr-products-manager)

Редакция 2. Все цитаты — по `origin/master` (`git show origin/master:<path>`), не по
рабочему дереву: локальный клон стоит на `feat/operation-kinds` и отстал на 115 коммитов.
Что изменилось против редакции 1 — [`16-PLAN-REVISION.md`](./16-PLAN-REVISION.md).

## 0. Опора — перепроверенная

`UpdateTechCard` = DELETE+INSERT тринадцати дочерних таблиц; список
`internal/store/techcard/techcard.go:515-521`, сам DELETE `:525-529`. Исключения из
full-replace — три, и все три с доводами прямо в коде `:485-508`:

- **append-only**: `tech_card_revision` (`:495-496` — «intentionally ABSENT … the
  append-only auto-journal»); вставка — `techcard.go:1930-1947`;
- **keyed-upsert по `line_key`**: `tech_card_bom_item` (`internal/store/techcard/materials.go:679`)
  и `tech_card_piece` (`materials.go:187`); довод — `techcard.go:488-494`;
- **presence-aware секции**: `preserveAbsentSection` `techcard.go:509-514`, проверка `:522-524`;
  и на уровень глубже — парк оборудования, где **сигнал присутствия это ОБЁРТКА, а не
  секция** (`:503-508`).

Ключевое для полосы: **`tech_card_media` не имеет ключа строки вовсе.** Вставка —
`techcard.go:1852-1871`, шесть колонок `:1858-1865`
(`tech_card_id, media_id, category, kind, caption, display_order`), `display_order` = индекс
в payload. В схеме (`0067_add_tech_card_core.sql:98-107`) у таблицы нет ни одного
`KEY`/`UNIQUE` кроме PK и FK. Поэтому редакция 1 и не могла честно «перенести сохранённые
поля на пересланную строку»: переносить не на что. Все четыре существующих переноса в этом
репо ключевые, и репо прямо называет позиционный матч опасностью:

> «Matching by POSITION would be the real hazard, and is why this is keyed at all: a piece's
> pairing must never be inferred from a neighbour» — `internal/apisrv/admin/costing_rbac.go:638-639`.

Вывод редакции 2: **на `tech_card_media` не заводится ни одного нового поля.** Ось «вид» —
существующий `kind`; «принятый рендер» — значение того же словаря; указания мудборда уже
живут выносками. Вместе с этим исчезают `line_key`, keyed-upsert медиа, легаси-merge и
весь класс дефектов, который обе рецензии назвали самым тонким местом плана.

---

## 1. Миграции

### 1.0 Нумерация — как получить и как ловить разъезд

- Занято по `origin/master` и `origin/beta` включительно **`0339`**
  (`0339_task_comment_author.sql`). Дыра `0336` **закрыта**: файл на месте.
- `internal/store/sql/README-pending-drops.md:59-108` — координационный файл волны; на
  сегодня он говорит «следующий свободный номер — 0340». Это и есть база.
- **Первым коммитом волны** в этот файл пишется бронь `0340–0346 — DESIGN band`. Это
  единственный работающий канал координации: шапка `0336_techcard_archive_import.sql`
  формулирует правило дословно — номер, взятый параллельно, становится дублем навсегда,
  потому что `sql-migrate` держит Id = **имя файла**
  ([[sql-migrate-renumber-orphan]]).
- **Детектор разъезда уже написан**: `internal/store/migrationlint/numbering_test.go:69`
  краснеет на любом номере, встретившемся дважды и не внесённом в
  `knownDuplicateMigrationNumbers` (`:15-40`: `0003`, `0195`, `0278` — по два, и в каждом
  комментарии «ТРЕТЬЕГО файла с этим номером быть не должно»). Гейт волны:
  `go test ./internal/store/migrationlint/...` на **свежерибейзенном** дереве, перед каждым
  пушем.
- **Окно перенумерации.** Наши файлы можно двигать свободно до того, как их применит первый
  деплой беты. После — никогда. Отсюда дисциплина: вся волна миграций уходит на бету
  **одним деплоем**, и непосредственно перед ним делается `git fetch && git rebase
  origin/master && go test ./internal/store/migrationlint/...`. Если master ушёл вперёд —
  сдвигаем весь блок и правим бронь в README.

### 1.1 Правила дома, действующие на каждый файл

- `CREATE TABLE **IF NOT EXISTS**` обязателен — это не осторожность, а **красный тест**:
  `internal/store/migrationlint/idempotency_test.go:41` требует его для всех миграций
  выше `grandfatheredMigrationMax = 92` (`:25`) и запрещает `DROP CHECK <table>_chk_<n>` по
  авто-имени (`:72-74`). MySQL коммитит DDL пооператорно, и файл, упавший на второй
  таблице, не запишется в журнал миграций — следующий старт зайдёт с начала и упрётся в уже
  созданную первую. Образец — `0272_workshop_settings.sql:43,64-66`
  (`CREATE TABLE IF NOT EXISTS` + `INSERT IGNORE` + комментарий «MySQL DDL auto-commits, so
  the next boot re-runs this from the top»).
- Guarded-ALTER через `information_schema`, `PREPARE/EXECUTE/DEALLOCATE` **по одному на
  строку** ([[migration-multistatements-gotcha]]); образец —
  `0313_task_media_annotations.sql:35-44`.
- Ретроактивные CHECK/UNIQUE на живых таблицах — только с замером (§1.7),
  [[add-check-is-copy-algorithm]], [[retroactive-check-halts-deploy]].
- Потолок всего прогона — 5 минут ([[migration-chain-rehearsal]]).
- На свежих таблицах CHECK легален, но словарные колонки всё равно `VARCHAR` без CHECK:
  словари полосы будут расти (`source_class` уже расширялся на `drawn`), и каждый поздний
  ADD CHECK на потолстевшей таблице стал бы COPY.

### 1.2 `0340_design_runs.sql` — прогоны, попытки, пачки, картинки

Таблицы: `design_run`, `design_run_attempt`, `design_batch`, `design_picture`.

`design_run` — как в редакции 1, минус `price_actual` как единственный носитель цены, плюс:

```
    provider_idempotency_key CHAR(36) NOT NULL COMMENT 'ключ, уходящий ПРОВАЙДЕРУ; один на прогон, стабилен между попытками',
    cancel_requested_at DATETIME(6) NULL COMMENT 'пилюля cancelling… на идущей строке',
    UNIQUE KEY uq_design_run_client_request (client_request_id),
    KEY idx_design_run_ready (status, next_attempt_at, id),
    KEY idx_design_run_claim (status, claim_expires_at),
    CONSTRAINT fk_design_run_card FOREIGN KEY (tech_card_id) REFERENCES tech_card(id) ON DELETE CASCADE
```

`design_run_attempt` — **новая, и вот факт, который без неё не нарисовать честно**: строка
истории обязана уметь сказать «попытка 1 оплачена, ответ не доехал; попытка 2 привезла
картинки». Без неё `price_actual` показывает цену последней попытки, полоса бюджета
недосчитывает ретраи, а фича «сколько мы тратим на ИИ» отвечает неправдой.

```
CREATE TABLE IF NOT EXISTS design_run_attempt (
    id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    run_id INT UNSIGNED NOT NULL,
    attempt_no TINYINT UNSIGNED NOT NULL,
    provider VARCHAR(32) NOT NULL,
    provider_request_id VARCHAR(128) NULL COMMENT 'сверка с биллингом провайдера',
    state VARCHAR(24) NOT NULL COMMENT 'dispatching|accepted|delivered|failed|unknown — unknown = деньги, возможно, списаны',
    price DECIMAL(8,4) NULL COMMENT 'цена ИМЕННО этой попытки',
    error_code VARCHAR(64) NULL,
    started_at DATETIME(6) NOT NULL,
    finished_at DATETIME(6) NULL,
    UNIQUE KEY uq_design_run_attempt (run_id, attempt_no),
    CONSTRAINT fk_design_run_attempt_run FOREIGN KEY (run_id) REFERENCES design_run(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

`design_batch` — плюс `client_request_id CHAR(36) NOT NULL` + `UNIQUE`: повтор после
сетевого таймаута иначе заводит вторую пачку и второй набор картинок.

`design_picture` — с исправленной FK-политикой (§1.5) и:
- `ordinal SMALLINT UNSIGNED` (было TINYINT: 255 кадров турнтейбла — решение, принятое
  типом молча);
- `content_hash CHAR(64) NULL` **не заводится**: хеш живёт на `media.content_hash` (0336),
  вторая колонка была бы ложным расщеплением. Картинка отдаёт хеш джойном.

`design_batch.files_count` — `SMALLINT UNSIGNED` по тому же доводу.

### 1.3 `0341_design_bench.sql` — верстак

`design_bench_slot` как в редакции 1, плюс:

```
    UNIQUE KEY uq_design_bench_view (tech_card_id, exclusive_key),
    UNIQUE KEY uq_design_bench_picture (tech_card_id, picture_id),   -- одна плита максимум в одном слоте (03-SPEC:639)
    CONSTRAINT fk_design_bench_picture FOREIGN KEY (picture_id)
        REFERENCES design_picture(id) ON DELETE SET NULL
```

`uq_design_bench_picture` терпит несколько пустых слотов: в MySQL несколько NULL в UNIQUE
законны.

**Чего схема выразить не может** и что поэтому проверяет Go в той же транзакции:
`picture.tech_card_id = slot.tech_card_id`. Композитный FK
`(tech_card_id, picture_id) → design_picture(tech_card_id, id)` это выразил бы, но его
`ON DELETE` пришлось бы делать CASCADE (обе колонки NOT NULL), а слот детали обязан пережить
исчезновение своей плиты. Отказ — `foreign_card_plate`.

Четыре стороны рождаются лениво первым касанием. **Ленивое рождение делается одним
upsert-ом**, не «SELECT → нет строки → INSERT»: двое, одновременно кладущие `front`, оба
увидят «строки нет», оба вставят, и второй получит 1062, которого нет в таксономии ошибок
и который клиент не откатит (он ждёт `Aborted: slot_rev_mismatch`). Прецедент дословный —
[[fitting-round-not-unique]]. Форма:

```sql
INSERT INTO design_bench_slot (tech_card_id, view_key, exclusive_key, detail_name, picture_id, slot_rev, set_by, set_at)
VALUES (:card, :view, :excl, :name, :pic, 1, :who, UTC_TIMESTAMP(6))
ON DUPLICATE KEY UPDATE
    picture_id = IF(slot_rev = :expected_rev, VALUES(picture_id), picture_id),
    slot_rev   = IF(slot_rev = :expected_rev, slot_rev + 1,       slot_rev),
    set_by     = IF(slot_rev = :expected_rev, VALUES(set_by),     set_by),
    set_at     = IF(slot_rev = :expected_rev, VALUES(set_at),     set_at);
```

затем перечитать строку в той же Tx и, если `slot_rev` не вырос, вернуть
`Aborted: slot_rev_mismatch` с текущим состоянием слота в details. Остаточный 1062 всё равно
мапится в тот же отказ — пояс, а не механизм.

### 1.4 `0342_design_sheet.sql` — версии листа

Четыре таблицы: `design_sheet_version`, `design_sheet_version_plate`,
`design_sheet_version_callout`, `design_sheet_issue`.

**Почему плиты и выноски — строки, а не JSON внутри `comp`.** Экранный факт: лист v3
печатается через год, и медиатека обязана сказать «этот файл держит версия листа»,
а не «свободен». Ссылка на `media(id)` внутри JSON этого не даёт: `GetMediaUsage`
(`internal/store/content/media_usage.go:67-188`) — чисто реляционный `UNION ALL` по
семнадцати колонкам-ссылкам, без единого JSON-скана, и добавление источника туда —
**обязанность**: `TestMediaUsageRegistryCoversSchema`
(`internal/store/media_usage_integration_test.go:148`) диффит
`MediaRefRegistryTargets()` (`media_usage.go:219-227`) против живых FK в `media(id)` и
краснеет на незарегистрированной колонке.

```
CREATE TABLE IF NOT EXISTS design_sheet_version (
    id, tech_card_id, version_number,
    client_request_id CHAR(36) NOT NULL COMMENT 'потерянный ответ не рождает фантомную vN+1',
    mixed_consent, minted_via, minted_by, minted_at,
    UNIQUE KEY uq_design_sheet_version (tech_card_id, version_number),
    UNIQUE KEY uq_design_sheet_version_request (client_request_id),
    CONSTRAINT fk_design_sheet_card FOREIGN KEY (tech_card_id) REFERENCES tech_card(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS design_sheet_version_plate (
    id, version_id, ordinal, view_key,
    slot_id INT UNSIGNED NULL,           -- адрес слота на момент минта
    detail_name VARCHAR(120) NULL,       -- КОПИЯ имени: удалённый слот не уносит имя с бумаги
    media_id INT NOT NULL,
    content_hash CHAR(64) NULL, layer_rev INT NOT NULL DEFAULT 0,
    source_class VARCHAR(16) NOT NULL, run_id INT UNSIGNED NULL,
    fit_stamp VARCHAR(50) NULL, mixed_input TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uq_design_sheet_plate (version_id, ordinal),
    KEY idx_design_sheet_plate_media (media_id),
    KEY idx_design_sheet_plate_slot (slot_id),
    CONSTRAINT fk_design_sheet_plate_version FOREIGN KEY (version_id) REFERENCES design_sheet_version(id) ON DELETE CASCADE,
    CONSTRAINT fk_design_sheet_plate_media   FOREIGN KEY (media_id)  REFERENCES media(id) ON DELETE RESTRICT,
    CONSTRAINT fk_design_sheet_plate_slot    FOREIGN KEY (slot_id)   REFERENCES design_bench_slot(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS design_sheet_version_callout ( … version_id, number, media_id FK RESTRICT, annotation JSON, text … );
CREATE TABLE IF NOT EXISTS design_sheet_issue ( … version_id FK CASCADE, action, actor, created_at … );  -- append-only, как tech_card_revision
```

`media_id → RESTRICT` — намеренно: байты версии стереть нельзя, и медиатека это покажет.
`slot_id → SET NULL` — намеренно: слот удаляется только через `DeleteDesignDetailSlot`,
который **сам** отказывает, если слот процитирован любой версией
(`slot_in_version {versions}`); FK RESTRICT тут стоять не может, потому что и слот, и версия
каскадятся от карточки, и удаление карточки уперлось бы в 1451 (§1.5).

### 1.5 FK-политика и `DeleteTechCard` — почему редакция 1 ломала удаление карточки

`DeleteTechCard` в этом репо — **один голый `DELETE FROM tech_card`**
(`internal/store/techcard/techcard.go:697-733`, сам `DELETE` — `:725`), всё остальное делают
каскады. Шапка
(`:683-685`) говорит прямо: любой не перечисленный явно RESTRICT всё равно поднимет 1451, и
вызывающий покажет человеку `«still referenced by another record — remove the referencing
record first»`. Удалить ему нечего: ссылающиеся строки — собственная полоса карточки, а RPC
удаления `DesignPicture` в контракте нет вовсе.

Правило волны: **ни одного RESTRICT между двумя таблицами, каждая из которых каскадится от
`tech_card`.**

| ребро | действие | почему |
|---|---|---|
| `design_run.tech_card_id → tech_card` | CASCADE | прогоны без карточки бессмысленны |
| `design_run_attempt.run_id → design_run` | CASCADE | попытка — часть прогона |
| `design_batch.tech_card_id → tech_card` | CASCADE | |
| `design_picture.tech_card_id → tech_card` | CASCADE | |
| `design_picture.run_id → design_run` | CASCADE | обе каскадятся от карточки; RESTRICT дал бы 1451 по порядку обхода |
| `design_picture.batch_id → design_batch` | CASCADE | то же |
| `design_picture.media_id → media` | **RESTRICT** | `media` от карточки НЕ каскадится; это осознанный сторож, и он обязан быть виден в `GetMediaUsage` |
| `design_picture.derived_from → design_picture` | **FK нет вовсе**, только `KEY` | самоссылка на таблице, которая сама принимает входящий каскад, — единственная комбинация здесь, которую нельзя доказать на бумаге. Целостность держит Go; выигрыш от FK меньше риска 1451 в единственной операции удаления карточки |
| `design_bench_slot.picture_id → design_picture` | **SET NULL** | слот детали переживает исчезновение плиты; и обе таблицы каскадятся от карточки |
| `design_sheet_version_plate.media_id → media` | **RESTRICT** | байты версии не стираются |
| `design_sheet_version_plate.slot_id → design_bench_slot` | **SET NULL** | см. §1.4 |
| `design_edit_layer.tech_card_id → tech_card` | CASCADE | |

**Замер вместо рассуждения.** Рецензия A вывела фатальность самоссылки из порядка обхода
InnoDB — вывод правдоподобный, но недоказанный. Поэтому в определение готовности B-0 входит
не рассуждение, а прогон на бете:

> завести карточку → прогон → композит → разрез (кроп) → флэттен слоя → поставить в слот →
> сминтить версию → `DELETE FROM tech_card WHERE id = …` → **должно пройти**.
> Отрицательный контроль: временно вернуть `derived_from` в RESTRICT и показать 1451.
> Зелёный прогон без отрицательного контроля — сторож у мёртвого кода
> ([[probe-exit-code-is-not-verdict]]).

### 1.6 `0343_design_edit_layer.sql`, `0344_design_budget.sql`

`design_edit_layer`: `base_media_id INT **NULL**` (0/NULL = чистая векторная база — дверь
`draw it` из пустой студии), уникальность **`(tech_card_id, base_media_id)`** сохраняется,
но пустых баз на карточке может быть несколько (NULL в UNIQUE не конфликтуют), поэтому слой
адресуется своим `id`. Истории ревизий слоя нет намеренно: vN пиннит `content_hash` уже
растеризованного файла.

`design_settings` (singleton по образцу `0272_workshop_settings.sql:43-66`):

```
    daily_budget DECIMAL(8,2) NOT NULL DEFAULT 2.00,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    budget_timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Warsaw'
        COMMENT 'чей «сегодня» обнуляет полосу; org-решение, а не MySQL-сессия',
    ...
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO design_settings (id) VALUES (1);
```

`design_budget_day` — **счётчик дня отдельной строкой**, а не `SUM` по прогонам:

```
CREATE TABLE IF NOT EXISTS design_budget_day (
    day DATE PRIMARY KEY COMMENT 'ключ дня, посчитанный в budget_timezone В GO, а не в MySQL',
    reserved DECIMAL(10,4) NOT NULL DEFAULT 0 COMMENT 'оценки запущенного и ещё не завершённого',
    spent    DECIMAL(10,4) NOT NULL DEFAULT 0 COMMENT 'факт по попыткам — включая оплаченные провалы',
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Три вещи, которые эта строка чинит разом:
1. **Дедлок.** `SELECT SUM(...) WHERE created_at >= today` под SERIALIZABLE берёт next-key
   S-блокировки открытого диапазона, и обе транзакции затем хотят вставить в этот же
   диапазон — это 1213, который спасает не изоляция, а ретрай
   (`internal/store/db.go:107-141`, `IsErrorRepeat` `:215-225` — только 1213/1205). Формулировка
   редакции 1 «сериализуются бесплатно» неверна. Точечный `UPDATE … WHERE day = :d` берёт
   одну строку.
2. **Не каскадится от карточки.** Удаление карточки больше не «освобождает» бюджет дня.
   Цена, которую принимаем и называем: постатейная история трат ПО карточке уходит вместе с
   карточкой; дневная и месячная суммы живут здесь и не уходят.
3. **Часовой пояс назван.** «`created_at >= today`» не отвечало, чей today. Ключ считает Go
   в `budget_timezone`. При другом ответе владельца меняется одна строка конфига.

### 1.7 `0345_techcard_design_columns.sql` — аддитив на живых таблицах

Все guarded-ALTER, nullable/DEFAULT, INSTANT:

- `tech_card.mood_note TEXT NULL` — общее поле мудборда (П8); шапка живёт UPDATE-ом;
- `tech_card.callout_seq INT NOT NULL DEFAULT 0` — монотонный источник номера (Д8);
- `tech_card_callout.client_ref VARCHAR(64) NULL` — ключ строки выноски (`10` §4.2);
  индекс не нужен: сопоставление идёт в памяти по payload.

И **одно расширение словаря**, требующее замера:

```sql
ALTER TABLE tech_card_media
  DROP CHECK chk_tech_card_media_kind,
  ADD CONSTRAINT chk_tech_card_media_kind
    CHECK (kind REGEXP '^(front|back|detail|lining|preview|moodboard|reference|swatch|side_l|side_r|render)$');
```

`DROP CHECK` идёт по **явному** имени, а не по авто-имени `tech_card_media_chk_N`, —
`idempotency_test.go:72-74` запрещает второе. ADD CHECK = COPY таблицы
([[add-check-is-copy-algorithm]]), поэтому **до написания файла** снимается замер на проде:

```sql
SELECT COUNT(*) FROM tech_card_media;
SELECT ROUND(DATA_LENGTH/1024/1024,1) mb FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tech_card_media';
```

Порог решения: если копия не укладывается в минуту при пятиминутном потолке всего
прогона — расширение словаря переносится в отдельную миграцию тихого окна, а `side_l/side_r/
render` до тех пор живут только на проводе и отвергаются валидацией Go с внятным отказом.
Проверка «сузится ли что-то» не нужна: набор только расширяется, ни одна существующая строка
проверку не провалит.

Ретроактивно **нельзя и не делаем**: UNIQUE на `tech_card_callout.callout_number`
(легаси-нули дублируются — `0067:113`), CHECK ролей `0161`, CHECK на `tech_card.fit`
(его и нет).

### 1.8 `0346_design_backstops.sql` — резерв

Пустой слот под находки адверсарного прохода ([[phase-review-gate]]). Если не понадобится —
не рождается, и бронь в README сокращается до 0345.

---

## 2. Стор: `internal/store/design/`

Сессии — те же фабрики `store/db.go`: каждая пишущая транзакция уже SERIALIZABLE
(`db.go:63`, `:165`), читающая — REPEATABLE READ read-only (`:69`), ретрай транзиентных
ошибок — `:107-141`. «Прочитал → проверил → записал» внутри одной Tx честен без ручных
блокировок ([[store-write-tx-is-serializable]]) — но **изоляция не заменяет логическую
идемпотентность и не отличает устаревшее намерение от свежего**; это и есть работа
`client_request_id`, `slot_rev` и `expected_lock_version`.

| метод | транзакция | что закрывает |
|---|---|---|
| `StartRun(ctx, cardID, req)` | одна Tx: `UPDATE design_budget_day SET reserved = reserved + :est WHERE day = :d` (upsert строки) → проверка `reserved + spent <= cap` → снимок входов (SELECT документа и верстака) → INSERT run + INSERT attempt(0, state='pending') | дубль `client_request_id` ловится UNIQUE → SELECT существующей строки → OK; резерв дня точечный, без next-key блокировки |
| `ClaimRuns(ctx, n)` | **дословно прецедент** `internal/store/campaign/recipient.go:438-464`: `SELECT … WHERE status='pending' AND kind <> 'draft_idea' AND next_attempt_at <= UTC_TIMESTAMP(6) AND (claim_token IS NULL OR claim_expires_at < UTC_TIMESTAMP(6)) ORDER BY id LIMIT :n FOR UPDATE SKIP LOCKED`, затем `UPDATE … SET status='running', claim_token=…, claim_expires_at=DATE_ADD(UTC_TIMESTAMP(6), INTERVAL :lease MICROSECOND) WHERE id=:id AND` **тот же предикат повторён** | редакция 1 предикат лизы не имела вовсе: второй claim перехватывал живой токен, и первый воркер не мог завершить свой прогон |
| `ReviveExpiredRuns(ctx)` | `UPDATE design_run SET status='pending', claim_token=NULL WHERE status='running' AND claim_expires_at < UTC_TIMESTAMP(6)` | без него «истёкший claim — та же дорога» была дорогой без ног: `ClaimRuns` берёт только `pending` |
| `StartAttempt / FinishAttempt` | одна Tx: INSERT/UPDATE `design_run_attempt` + `UPDATE design_budget_day SET spent = spent + :price, reserved = reserved - :est_share` | ретрай платит второй раз — и полоса бюджета это **видит** |
| `CompleteRun(runID, claimToken, outputs)` | сверка `claim_token` + идемпотентная вставка `design_picture` по `uq_design_picture_run_ordinal` + `status='done'` + `price_actual = (SELECT SUM(price) FROM design_run_attempt WHERE run_id=…)` | частичный ответ = меньше картинок, статус всё равно `done` |
| `FailRun(runID, claimToken, errCode, retryable)` | `attempt_count++`, `next_attempt_at` по экспоненте ЛИБО терминальный `failed` | таксономия ретрая — §3 |
| `SetBenchSlot(...)` | одна Tx: проверка `picture.tech_card_id = :card` → upsert §1.3 → перечитать → сравнить rev | явный CAS обязателен: SERIALIZABLE закрывает гонку записи, но не «А. смотрел на старый экран» |
| `MintSheetVersion(...)` | **см. §2.1** | |
| `HidePicture / ArchiveRun` | одна Tx: сторож (слот, плиты версий, вход живого прогона, родитель кропа) → UPDATE | сторож читает в той же Tx, иначе TOCTOU |
| `RegisterBatch(cardID, items, target)` | одна Tx: INSERT batch (UNIQUE по `client_request_id`) + pictures + опц. `SetBenchSlot` тем же CAS | один жест, два факта, одна транзакция |
| `SplitPicture` | байтовая работа до транзакции; Tx только на INSERT производных, идемпотентно по `client_request_id` | |
| `SaveEditLayer / FlattenEditLayer` | CAS по `rev` — **оба** | флэттен без CAS материализует чужой r4 под намерением того, кто видел r3 |
| `GetBand / ListRuns / GetSheetVersion` | читающая Tx | агрегаты считаются **в ней же**: `total_runs`, `archived_runs`, `MAX(rrev)`, различные `params->colour` последних N render-прогонов, `hidden` по прогонам. Иначе пагинация молча усекает чипы истории цвета и счётчики шапки до загруженной страницы |

### 2.1 Атомарный минт (Д7 пересмотрен)

`MintSheetVersion` получает **документ целиком** (`TechCardInsert`) + `expected_lock_version`
+ ожидаемый верстак + согласия, и в **одной** SERIALIZABLE-транзакции:

1. пишет документ **тем же кодом**, что `UpdateTechCard` (см. ниже про рефактор);
2. сверяет `expected_plates` со слотами по `slot_rev`;
3. `version_number = MAX+1` (приём `0162`), INSERT версии + плит + замороженных выносок
   **из того документа, который эта же транзакция только что записала**;
4. INSERT `design_sheet_issue('minted')`.

Почему не «сохрани, потом минти» (принято в редакции 1): H1 говорит, что первая выноска на
черновике листа **рождает v1**, а инвариант прототипа — «rev ≥ 1 ⇔ был акт минта; ни одной
выноски при rev = 0» (`03-PROTOTYPE-SPEC.md:639-641`). Двухшаговый путь оставляет ровно
запрещённое состояние: документ с выноской и без версии, видимый другим, неотличимый от
осознанного черновика. Плюс окно между шагами, в которое влезает чужой `UpdateTechCard`.

Почему это **не** «второй писатель выносок» (страх, которым альтернатива отвергалась):
второго пути записи не появляется. Тело `UpdateTechCardAndListOrphanedPatternURLs`
(`techcard.go:287-296` — открывает свою `txFunc`) выносится в
`updateTechCardTx(ctx, rep, id, tc, expectedLockVersion)`, и его зовут **оба** хендлера.
Транзакция общая по построению: `txFunc(ctx, func(ctx, rep dependency.Repository) error)`
отдаёт callback'у полный репозиторий, так что `rep.TechCards()` и `rep.Design()` живут в
одной Tx. Это единственный новый рефактор в документном пути, и он не добавляет ни одной
новой записи — только вторую точку входа в существующую.

Цена: payload минта — вся карточка (клиент её и так шлёт на каждом сейве, и она у него в
форме). Конфликт — явный `Aborted: lock_version_mismatch`, диалог повторяется.
`client_request_id` c UNIQUE закрывает потерянный ответ: повтор возвращает уже созданную
версию, а не рождает фантомную vN+1.

### 2.2 Минт номера выноски — в хендлере, а не в сторе

Место: `internal/apisrv/admin/techcard.go`, **до** `carryOmitted*` и **до**
`restampFreshSignoffDigests` (обоснование — `10` §5.2). Алгоритм:

- `number == 0 && client_ref != ""` → `++seq`, номер присвоен, `client_ref` сохранён;
- `number == 0 && client_ref == ""` → легаси-ноль, **не трогать**;
- `seq = GREATEST(stored.CalloutSeq, MAX(входящих номеров), присвоенные)`;
- новый `seq` едет в тот же UPDATE `tech_card`, что бампает `lock_version`. Взаимное
  исключение уже стоит: сейв идёт под `expected_lock_version`
  (`admin.proto:8349`, `techcard.go:428-429`), так что два сейва не сминтят один номер;
- ремапа переиспользованных номеров нет (`10` §5.1).

### 2.3 Одна починка ниже по течению: `calloutSync` разъезжается сам с собой

Найдено при проверке, обеими рецензиями не названо. Номер выноски **не уникален по
карточке**: эскиз и мудборд нумеруются независимо
(`admin-client src/components/managers/tech-card/components/sketch-tab.tsx:188-221`,
`referencedNumbers()` возвращает `[]` для мудборда), а схема дубли не запрещает
(`0067:113`, UNIQUE нет). И два потребителя «выноски по номеру» решают коллизию **в разные
стороны**:

- `internal/store/techcard/materials.go:90` — `cs.byNumber[c.Number] = …` без условия,
  **последний выигрывает**;
- `internal/dto/techcard_annotations.go:~560` — явное `if _, seen := byNumber[c.Number]; !seen`,
  **первый выигрывает**.

Следствие: мудбордная выноска с номером технической молча делает деталь кроя `detached`
(`materials.go:99-113` требует `ref.pinned && cs.technicalMedia[ref.mediaID]`), а перенос
геометрии при этом смотрит на другую выноску. Починка минимальная и самостоятельная:
`buildCalloutSync` строит `byNumber` **только из технических запиненных выносок** (что
`apply` и так требует), а множество «номер существует» — из всех. Отдельный кусок B-5a,
ни от чего не зависит, и он же закрывает настоящую форму дыры Г4 — которая в редакции 1
была описана неверно (клиент дыры **не** переиспользует: `nextNumber()` берёт максимум и по
живым выноскам, и по всем ещё ссылающимся номерам).

---

## 3. Воркер, провайдер, деньги

Пакет `internal/design/worker` + адаптер `internal/genimg`. Образец тикер-воркера —
`internal/campaigndispatch/worker.go:71` (он же гоняет claim-машину из §2).

### 3.1 Машина состояний и лиза

`pending → (claim, status='running', lease) → done | failed | cancelled`. Истёкшая лиза
возвращается в `pending` **отдельным подметальщиком** `ReviveExpiredRuns` (§2), который
крутится тем же тикером.

`draft_idea` **исключён из очереди предикатом** `kind <> 'draft_idea'` и, сверх того,
получает `claim_token` прямо в `StartRun` хендлера с коротким `claim_expires_at`. Без этого
воркер забирает строку, пока хендлер зовёт текстовую модель: двойной платный вызов и
навечно `running` строка.

### 3.2 Идемпотентность платного вызова — то, чего не было

`client_request_id` закрывает ровно один сценарий: двойной клик человека. Ретраит **воркер**,
и таймаут — канонический случай, когда провайдер работу сделал и деньги списал, а ответ не
доехал. Политика:

1. **Ключ идемпотентности уходит провайдеру.** `design_run.provider_idempotency_key`
   минтится на `StartRun`, один на прогон, стабилен между попытками, и кладётся в заголовок
   провайдера. Поддержка ключа — свойство профиля (Д12): профиль объявляет
   `supports_idempotency: true|false`, и это проверяется probe'ом на старте воркера.
2. **Таксономия ретрая — по фазе, а не по коду.** Ретраятся только ошибки, про которые
   известно, что запрос **не был принят**: DNS, connect refused, TLS handshake, 429 и 503 до
   отправки тела. **Таймаут ответа и обрыв соединения после отправки — не ретраятся**, если
   профиль не поддерживает ключ идемпотентности: попытка закрывается
   `state='unknown'`, прогон — терминальным `failed` с
   `error_code='provider_result_unknown'`, и строка истории так и говорит: «деньги, возможно,
   списаны, результата нет». Это честнее, чем молча заплатить трижды.
3. **Сверка.** Если попытка получила `provider_request_id` до обрыва — следующий шаг не
   повторный вызов, а `Lookup(provider_request_id)`; результат либо забирается, либо
   попытка закрывается `unknown`.
4. **Деньги считаются по попыткам.** `spent` дня растёт на каждой закрытой попытке, включая
   оплаченный провал; `price_actual` прогона = `SUM(attempt.price)`. Оценка резервируется на
   старте и снимается с резерва по мере закрытия попыток.

### 3.3 Пояса перед вызовом — переиспользуем написанное

В репо уже есть «денежный забор» перед вызовом модели: `analysisRunGuard`
(`internal/apisrv/admin/techcard_analysis.go:216-297`) — три пояса в порядке, при котором
отказ ничего не стоит: in-flight по (админ, карточка), затем минимальный интервал, затем
почасовое окно на админа (`ratelimit.NewLimiter`). Полоса берёт эту форму дословно и
добавляет **четвёртый, персистентный** пояс — `design_budget_day`: процессная память
рестарт не переживает, а деньги переживают.

### 3.4 Выход и отмена

Выход: байты → `UploadContentImageVerbatim` (уже написан) → строка `media` c
`content_hash` → `CompleteRun` вставляет `design_picture` с `ghost_view` из запрошенных
видов по порядку.

Отмена (Д20): `pending` → `cancelled`, резерв дня освобождается. `running` → ставится
`cancel_requested_at`; воркер проверяет его перед отправкой (тогда прогон `cancelled`
бесплатно) и после ответа (тогда результат **сохраняется и оплачивается**, статус `done`,
строка несёт пометку «пришло после отмены»). Молчаливое выбрасывание оплаченного результата
запрещено.

### 3.5 Провайдер-адаптер

```go
type Provider interface {
    Generate(ctx context.Context, spec Spec) (Result, error)   // spec несёт IdempotencyKey
    Lookup(ctx context.Context, providerRequestID string) (Result, error)
}
```

Первая реализация — image-модели через выбранного в профиле провайдера.
**Мультимодальность `internal/openrouter` — отдельная, заметная работа, а не «расширить
поле»**: `chatMessage.Content` там сегодня **плоская строка**
(`internal/openrouter/openrouter.go:447-450`), `image_url` не встречается в `internal/`
нигде. Переделка `Content` в `any`/`[]contentPart` — изменение проводного типа существующего
клиента, которым уже пользуются `techcard_ai`, `techcard_analysis`, `files_ai` и перевод
кампаний. Это кусок B-3a с собственным ревью.

Что при этом **не** пишется заново: разбор usage — `openrouter.Usage`
(`openrouter.go:500`) и `CompleteWithMeta` (`:567`), возвращающий usage; и явное задание
reasoning-бюджета (`:456-469`, [[reasoning-tokens-eat-the-answer-budget]]).

### 3.6 Что уходит провайдеру — и чего не уходит

Входные картинки — неопубликованные модели одежды. Правила:

- изображения уходят **байтами в теле запроса**, не ссылкой: подписанный URL на приватный
  бакет живёт дольше запроса и утекает вместе с логом;
- в промпт не кладутся артикул, имя коллекции и цены — только то, что нужно модели;
- профиль (Д12) объявляет провайдера, модель, срок хранения у провайдера и флаг
  «данные не используются для обучения»; панель прогона печатает эту строку — человек
  видит, куда ушла его картинка;
- ответы провайдера сырьём не хранятся: сохраняются производные изображения, usage и
  усечённый текст ошибки.

---

## 4. Медиа — что осталось сделать

Почти всё уже есть (`10` §0). Остаётся:

1. **RPC-поверхность**: `preserve_original` в `UploadContentImage` → ветка на
   `UploadContentImageVerbatim` (`internal/bucket/image.go:297`). Метод уже на интерфейсе
   зависимостей, покрыт тестами и вызывается из прода
   (`internal/apisrv/admin/techcard_archive_files.go:282`).
2. **Вызов из воркера и из полки**: все писатели флэтов ходят verbatim-путём. Проба —
   наличие `media.content_hash` у каждой картинки полосы.
3. **`SplitPicture`**: сервер читает полноразмерный объект композита, режет по рамкам 0..1,
   каждый кроп — тем же verbatim-путём. Клиентского canvas-кропа в этой фиче нет.
4. **Реестр использования**: `design_picture.media_id`, `design_sheet_version_plate.media_id`
   и `design_sheet_version_callout.media_id` регистрируются в `mediaRefRegistry`
   (`internal/store/content/media_usage.go:67-188`), иначе краснеет
   `TestMediaUsageRegistryCoversSchema`.
5. **Чего в реестр НЕ кладём и почему**: `design_run.inputs` — снимок, а не владение.
   Медиа, процитированное только снимком прогона, честно считается свободным; его стирание
   гасит миниатюру в истории (`deleted=true` в снимке — `10` §2.4), но не ломает ни одного
   фабричного документа. Иначе каждая мудбордная картинка становилась бы неудаляемой
   навсегда, а `GetMediaUsage` — JSON-сканом по всей истории организации.

SVG/.ai — не в Ф0: дом оригинала есть (`library_file`, 0312), но поле без экранного факта не
заводим.

---

## 5. Счётчики

| счётчик | дом | двигает |
|---|---|---|
| номер выноски | `tech_card.callout_seq` | хендлер, до дайджеста; взаимное исключение — `expected_lock_version` |
| номер версии листа | `MAX(version_number)+1` по `design_sheet_version` | сервер в Tx минта; UNIQUE — второй страж (приём 0162) |
| ключ слота детали | `design_bench_slot.id` AUTO_INCREMENT | СУБД |
| ordinal картинки | позиция в выдаче/пачке | сервер при Complete/RegisterBatch |
| rrev подачи | `MAX(rrev)+1` по render-прогонам карточки | сервер в StartRun |
| номер попытки | `MAX(attempt_no)+1` по прогону | воркер |
| `client_ref` выноски | UUID | клиент при рождении строки (нужен ему до первого сейва) |

---

## 6. Права

Полоса живёт в admin-скоупе существующего JWT; отдельных ролей не заводим. Автор всюду —
username из JWT (приём 0312). Публичная ссылка на лист — токен с эпохой по образцу
`0288_tech_card_pattern_viewer_access.sql` / `0293`, **отдельным куском после минта**; в Ф0
действие `shared` пишется в журнал, публичного вьюера нет.

---

## 7. Откат — то, чего в редакции 1 не было вовсе

План был описан только вперёд. Матрица:

| сценарий | что происходит | что делаем |
|---|---|---|
| откат бинаря бэкенда **после** миграций | новые таблицы никто не читает; `mood_note`, `callout_seq`, `client_ref` — колонки, которые старый стор просто не вставляет. `tech_card_media` **не менялась вовсе** (это и есть главный выигрыш редакции 2: в редакции 1 откат превращал любой сейв в безвозвратное стирание `annotations/line_key`) | ничего; откат безопасен |
| откат бинаря + кешированный новый SPA | новые RPC отвечают `Unimplemented` | клиент гейтится наличием метода (`10` §5.3) и рисует «server does not speak design yet» |
| откат **миграций** | `sql-migrate` Down у 0340-0346 написан и обязан быть проверен; `0345` Down возвращает узкий CHECK — и **упадёт**, если к тому моменту есть строки с `side_l/side_r/render` | Down `0345` сначала `UPDATE tech_card_media SET kind='detail' WHERE kind IN ('side_l','side_r','render')`, и это записано в шапке файла как осознанная потеря |
| rolling deploy: воркер старой версии рядом с новым | старый воркер не знает про `design_run_attempt` | воркер выкатывается **после** стора, и claim-предикат новой версии совместим со строками старой |
| DO откатил деплой сам при провале миграции | `readyz` врёт ([[operations-field-simplification]]) | логи брать **во время** падения ([[beta-deploy-fails-on-slow-migration-check]]); сначала перезапустить тот же коммит |

---

## 8. Что уходит на прод раньше клиента

Правило репо: бэкенд всегда раньше. Содержательные причины редакции 2 (их **две**, а не
три — третья, «verbatim-путь должен появиться», отпала: он уже на проде):

1. Новые RPC должны существовать раньше, чем клиент их зовёт.
2. Расширенный словарь `kind` должен приниматься раньше, чем клиент начнёт присылать
   `side_l`.

Причина «минт номеров чинит дыру Г4 для старого клиента» **снята**: минт гейтится
`client_ref`, которого старый клиент не шлёт, и это правильно (`10` §5.1).

Инертность на проде до клиента: новых таблиц никто не читает, новых RPC никто не зовёт,
дайджест не трогается вовсе (Д4 отозван).

Деплой-дисциплина: прод-бек — ручной `doctl apps create-deployment`
([[prod-backend-manual-deploy]]); промоушен master — **слиянием**, не fast-forward
([[backend-master-promotes-by-merge]]); гейт сборки — `go build ./...`, не `make build`
([[makefile-gnu-sed-mocks-gotcha]]); store-тесты — только `CI=1` + одноразовый контейнер
([[store-tests-safe-container-method]]), **никогда** локально
([[store-tests-drop-prod-db]]); базлайн падений снимать на пиненной mockery v2
([[mockery-v3-mocks-fake-red]]) и считать **число исходов**, а не список строк `--- FAIL`
([[go-test-grep-reads-setup-failure-as-clean]]).

---

## 9. Резка на параллельные куски

```
B-0   миграции 0340-0346 (один PR, инертны) + бронь в README-pending-drops  ← ничего
B-1   RPC-поверхность verbatim: preserve_original → UploadContentImageVerbatim  ← К-4
B-2   store/design: чтение полосы + агрегаты, bench CAS/upsert, пачки,
      hide/archive, split                                                   ← B-0, К-1
B-3   run-машина: StartRun/Claim/Revive/Attempt/Complete/Fail/Cancel,
      деньги (design_budget_day), genimg-адаптер, воркер, draft_idea        ← B-0, B-1, К-2
B-3a  мультимодальный Content в internal/openrouter                         ← ничего (общий код!)
B-4   минт: атомарный путь, версии + плиты + выноски + журнал,
      GetDesignSheetVersion, рефактор updateTechCardTx                      ← B-0, B-2
B-5   документный путь: mood_note (verbatim-протокол), client_ref,
      минт номера в хендлере, расширение словаря kind                       ← B-0, К-3
B-5a  починка calloutSync (byNumber только из технических)                  ← ничего
B-6   mediaRefRegistry: три новых источника + тест реестра                  ← B-0
B-7   репетиция DeleteTechCard на бете (§1.5) с отрицательным контролем     ← B-0, B-2, B-4
```

B-1, B-3a и B-5a независимы вообще ни от чего и режутся первыми. После B-0 параллельны
B-2, B-5, B-6. B-3 ждёт B-1 (verbatim-путь для выходов). B-4 — единственный, кому нужны
двое (B-2 за верстак, и он же трогает документный путь, поэтому **шов B-4 × B-5 ревьюится
объединённым диффом** — дефекты живут на швах ([[parallel-agents-seam-defects]])).
B-3a трогает файл, которым пользуются четыре чужие фичи: его дифф ревьюится отдельно и
первым.

**Гейты каждого куска.** Цитата + мутация, обе ([[quote-plus-mutation-is-the-pair]]), с
отрицательным контролем: сломать по одному три места и показать, что покраснела именно та
проба. Смоук на бете доказывает только рендер, не данные: на бете **ноль прогонов и ноль
раскладок**, поэтому для B-3/B-4 обязателен сидированный прогон руками с проверкой строк в
таблицах, а не 200 от гейтвея ([[beta-deploy-verification-method]],
[[beta-has-no-operations-material]]).
