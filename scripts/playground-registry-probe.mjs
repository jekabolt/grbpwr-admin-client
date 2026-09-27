#!/usr/bin/env node
// РЕЕСТР PLAYGROUND: ТЕЛО, КОТОРОЕ УЕЗЖАЕТ, ОТКАЗЫ ДО ДЕНЕГ, СТАРЫЙ АДРЕС, ВОРОТА, РЕКОЛ (C-05).
//
// Зачем проба. `wire()` плитки — единственный писатель платного запроса (registry/types.ts), и
// ломается он молча: форма рисуется, кнопка жмётся, а на провод уезжает другое тело — не та
// обрезка слов, не тот список картинок, не тот пресет. Ни типы, ни сборка этого не видят.
//
// ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ (все утверждения — о РЕЗУЛЬТАТЕ настоящих модулей, ожидаемые тела написаны
// РУКАМИ, а не собраны из тех же функций):
//   A · wire(): тело на заполненный черновик у трёх плиток — change_color (recolor), remove_background
//       (cutout), create_edit (freeform/free) — равно ожидаемому ЦЕЛИКОМ, каждое поле
//       DesignRunParams;
//   B · validate(): отказы до денег — нет фото, больше 24 фото, нет Pantone, пустой промпт,
//       ноль референсов у create_edit; и заполненный черновик проходит (без этого «отказывает
//       всегда» было бы зелёным);
//   C · legacyStep('aside') → playground + change_color; прочие значения — не старые шаги;
//   D · возможности: freeformPresets отсутствует / без 'cutout' / без 'free' → эти плитки
//       приглушены В РАЗМЕТКЕ сетки (не кнопка, без data-workflow-live, со словами причины),
//       openWorkflow их не открывает, история не сужается; change_color открыт всегда;
//       сужение истории: матчер открытой плитки — та же ссылка при каждом вызове (стабильность),
//       и он отбирает свои прогоны;
//   E · рекол: recolor → change_color, cutout → remove_background, freeform free → create_edit,
//       freeform add_hardware → честные слова, без падения; прочие роды → null.
//   F · (C-08) ворота фазы 2: playgroundWorkflows ЕСТЬ → живы ровно перечисленные плитки, и
//       freeformPresets не читается вовсе; пустой список гасит всё; ключа нет → «not wired»;
//   G · (C-08) params.image: тело create_edit на новом сервере (модель, качество, формат, фон),
//       auto → '', фон только у модели, которая его перечисляет, текст → картинка без референсов;
//       старый сервер (imageModels нет / пуст) — image не уезжает вовсе и ≥1 референс; плитка без
//       пикера (D6, плитки 2/3) — модель по умолчанию, quality '', и ничего при auto;
//   H · (C-08) защёлкивание формата: смена модели сносит выбор к ближайшей пропорции новой модели,
//       начальный 4:5 у модели без 4:5 показывается, печатается и уезжает как 3:4, уровень
//       переносится, если он есть у новой модели, иначе medium; строка шапки «<label> · <tier>»;
//   I · (C-08) разметка формы create_edit: сворачиваемые секции AI model и Format есть только на
//       сервере с моделями, строка «needs at least one» — только на старом.
//   J · (C-07) wire(): тела плиток 2, 3, 5, 6, 7 целиком — fabric_extract / ghost_mannequin с
//       моделью по умолчанию и форматом плитки, swap_fabrics = recolor с fabrics[] И эхом
//       fabric_media_id (картинка не с полки и ткань полки), add_logo = subject + logo + logo_size,
//       variations = creativity + движок; старый сервер — без image;
//   K · (C-07) validate(): отказы до денег у пяти плиток; слова плиток 2/3 необязательны;
//   L · (C-07) ворота: пять плиток живы ровно по playgroundWorkflows;
//   M · (C-07) прогон → плитка по правилу сервера (пресет, recolor + ткань с картинкой), штамп
//       run_workflow у заглушки вне страницы, матчеры результатов не делят картинку на две плитки;
//   N · (C-07) разметка форм пяти плиток (заголовки, REQUIRED, плейсхолдеры владельца, Logo size,
//       Creative booster «Off», складки AI model / Format только где им место);
//   O · (C-07) рекол: тело → черновик → то же тело у всех пяти плиток.
//   P · (C-09) плитка 1 Virtual Try-On: тело freeform/tryon целиком (роли model → product → scene,
//       options словарём сервера, image), сцена уезжает только «with reference», отказы до денег в
//       порядке двери (модель, продукт, 1..4, сцена, повтор картинки, чужой рендер колорвея),
//       ворота по playground_workflows, пулы пикеров (фото профиля = thumbnail ∪ media; рендеры
//       колорвея = выходы kind=render этого колорвея + его рендер-верстак), рекол, разметка формы.
//   Q · (C-11) Retouch a Zone: тело из набора мазков — оболочка кисти (диски, выпуклая оболочка,
//       4 знака) в items[0].regions[0], слова в texts[0], ask '', без image/options; оболочка
//       больше 12 углов — описанный 12-угольник, покрывающий всю краску; слишком мелкая — null;
//   R · (C-11) отказы маски до денег: не нарисовано → «paint the zone», мелко → «too small», нет
//       слов, картинка меньше 64 px; не нарисовано — items пуст (такое тело не уходит);
//   S · (C-11) ворота: плитка 10 жива только в playgroundWorkflows; угол mask в итогах — только
//       там же; панель плитки — объяснение и честная строка, без GENERATE; итоги под плиткой 10 —
//       все картинки комнаты.
//   V · (C-12) интеграция полос: заглушка вне страницы (без params) со штампом run_workflow стоит
//       под своей плиткой и только под ней — у всех десяти плиток комнаты; рекол 3D-прогона
//       открывает плитку 12 (workflowOfRun → image_to_3d, recallTargetKind → playground на новом
//       сервере, STEP 5 на старом) с её референсом и опциями; у плитки 12 «Realistic materials»
//       и Texture по умолчанию ON, где сервер их перечисляет; surface_hint в списке — поля нет,
//       подсказка уезжает пустой; каждая растущая секция картинки считает слоты («0/N»).
//
// МУТАЦИИ ЖИВУТ В ПАМЯТИ, А НЕ В ФАЙЛЕ (приём colour-plan-probe): одна строка настоящего модуля
// подменяется в бандле, исходник не трогается. Каждая обязана уронить СВОЮ группу:
//   node scripts/playground-registry-probe.mjs                     прогон
//   node scripts/playground-registry-probe.mjs --mutate-wire        change_color перестаёт обрезать
//                                                                   слова `ask` → краснеет A
//   node scripts/playground-registry-probe.mjs --mutate-validate    потолок фото change_color +1
//                                                                   → краснеет B (25 фото)
//   node scripts/playground-registry-probe.mjs --mutate-legacy      'aside' ведёт в create_edit
//                                                                   → краснеет C
//   node scripts/playground-registry-probe.mjs --mutate-capability  «нет freeformPresets» читается
//                                                                   как «всё можно» → краснеет D
//   node scripts/playground-registry-probe.mjs --mutate-recall      cutout теряет свою плитку
//                                                                   → краснеет E
//   node scripts/playground-registry-probe.mjs --mutate-preset-match create_edit снова сверяет
//                                                                   пресет (G-01 m-3) → краснеет D
//   node scripts/playground-registry-probe.mjs --mutate-gate-legacy плитки фазы 1 читают
//                                                                   freeformPresets и при новом
//                                                                   списке → краснеет F
//   node scripts/playground-registry-probe.mjs --mutate-image-absent «нет imageModels» читается как
//                                                                   «есть модель по умолчанию»
//                                                                   → краснеет G
//   node scripts/playground-registry-probe.mjs --mutate-quality     тир не уезжает (quality '')
//                                                                   → краснеет G
//   node scripts/playground-registry-probe.mjs --mutate-snap        смена модели не защёлкивает
//                                                                   формат → краснеет H
//   node scripts/playground-registry-probe.mjs --mutate-snap-read   формат читается без
//                                                                   защёлкивания → краснеет H
//   node scripts/playground-registry-probe.mjs --mutate-drawn      сетка рисует и то, чего не
//                                                                   делает ни одна модель → краснеет H
//   node scripts/playground-registry-probe.mjs --mutate-sections    секции модели/формата рисуются
//                                                                   всегда → краснеет I
//   node scripts/playground-registry-probe.mjs --mutate-swap-echo   swap_fabrics теряет эхо
//                                                                   fabric_media_id → краснеет J
//   node scripts/playground-registry-probe.mjs --mutate-logo-role   логотип уезжает role=subject
//                                                                   → краснеет J
//   node scripts/playground-registry-probe.mjs --mutate-creativity  шаг бустера не уезжает
//                                                                   → краснеет J
//   node scripts/playground-registry-probe.mjs --mutate-format-default формат плитки 2 по умолчанию
//                                                                   снова 1:1, а не 9:16 (4.png)
//                                                                   → краснеет J, N
//   node scripts/playground-registry-probe.mjs --mutate-c07-validate swap пускает одну картинку в
//                                                                   оба слота → краснеет K
//   node scripts/playground-registry-probe.mjs --mutate-c07-gate    add_logo открыт без списка
//                                                                   → краснеет L
//   node scripts/playground-registry-probe.mjs --mutate-run-workflow recolor с тканью читается как
//                                                                   change_color → краснеет M
//   node scripts/playground-registry-probe.mjs --mutate-stamp       штамп run_workflow у заглушки
//                                                                   не читается → краснеет M
//   node scripts/playground-registry-probe.mjs --mutate-tryon-role  продукт уезжает без роли
//                                                                   → краснеет P
//   node scripts/playground-registry-probe.mjs --mutate-tryon-scene картинка сцены уезжает и в
//                                                                   режиме edit → краснеет P
//   node scripts/playground-registry-probe.mjs --mutate-tryon-validate отказ «сцена без картинки»
//                                                                   снят → краснеет P
//   node scripts/playground-registry-probe.mjs --mutate-tryon-colourway рендеры любого колорвея
//                                                                   → краснеет P
//   node scripts/playground-registry-probe.mjs --mutate-tryon-photos фото профиля без thumbnail
//                                                                   → краснеет P
//   node scripts/playground-registry-probe.mjs --mutate-tryon-gate  плитка открыта и без списка
//                                                                   → краснеет P
//   node scripts/playground-registry-probe.mjs --mutate-tryon-vocab слово кадра не из словаря
//                                                                   сервера → краснеет P
//   node scripts/playground-registry-probe.mjs --mutate-mask-hull   точка мазка без диска кисти
//                                                                   → краснеет Q (тело)
//   node scripts/playground-registry-probe.mjs --mutate-mask-ring   оболочка >12 углов не
//                                                                   описывается → краснеет Q
//   node scripts/playground-registry-probe.mjs --mutate-mask-refusal «не нарисовано» не отказывает
//                                                                   само → краснеет R
//   node scripts/playground-registry-probe.mjs --mutate-mask-gate   ретушь «предложена» без
//                                                                   playgroundWorkflows → краснеет S
//
// C-10 (плитка 12 Image to 3D, STEP 5 уходит с рельса):
//   T · wire() / validate() / ворота / разметка / рекол плитки image_to_3d: тело режима референса
//       ЦЕЛИКОМ; опции уезжают только объявленные сервером (threed_options), иначе ''; pbr без
//       текстуры не уезжает никогда; follow — только если объявлен; колорвей — только у плиты
//       рендер-верстака; результаты — свой блок моделей, история — threed-прогоны, слово «3D runs»;
//   U · рельс: STEP 5 есть ровно у отвечающего сервера без playground_workflows (6 ячеек, «N of 6»),
//       у нового — 5 ячеек и «N of 5», пока сервер молчит — тоже 5; `?step=threed` переписывается
//       только у нового; defaultStep/nearestBlock на новом не называют threed.
//   node scripts/playground-registry-probe.mjs --mutate-threed-options  опции рисуются и уезжают без
//                                                                   слова сервера → краснеет T
//   node scripts/playground-registry-probe.mjs --mutate-threed-pbr  pbr уезжает и без текстуры
//                                                                   → краснеет T
//   node scripts/playground-registry-probe.mjs --mutate-threed-gate ворота не ждут threed_options
//                                                                   → краснеет T
//   node scripts/playground-registry-probe.mjs --mutate-threed-colorway колорвей плиты не
//                                                                   привязывается → краснеет T
//   node scripts/playground-registry-probe.mjs --mutate-rail-threed STEP 5 на рельсе всегда
//                                                                   → краснеет U
//   node scripts/playground-registry-probe.mjs --mutate-legacy-threed `?step=threed` переписывается
//                                                                   и у старого сервера → краснеет U
//   node scripts/playground-registry-probe.mjs --mutate-step-first  композитор спрашивает шаг раньше
//                                                                   старого адреса → краснеет U
//
// C-12 (интеграция):
//   node scripts/playground-registry-probe.mjs --mutate-stub-tryon  try-on снова сверяет только
//                                                                   пресет (штамп заглушки не
//                                                                   читается) → краснеет V
//   node scripts/playground-registry-probe.mjs --mutate-threed-run  threed не отдаётся плитке 12
//                                                                   → краснеет E, V
//   node scripts/playground-registry-probe.mjs --mutate-threed-recall рекол 3D всегда в STEP 5
//                                                                   → краснеет V
//   node scripts/playground-registry-probe.mjs --mutate-pbr-default материалы по умолчанию OFF
//                                                                   → краснеет T, V
//
// G-02 client fix (W · каждая починка ревью — своей проверкой и своей мутацией):
//   W · плитка 10: слот картинки на панели (M-1), слова владельца, строка цены без суммы (m-3), рекол
//       ретуши — картинка + слова + маска открыта (Codex 5); источник ретуши; приколотые прогоны —
//       свои у плитки 10 и живая ретушь картинки этой плитки у других (Codex 8, m-2); подпись окна по
//       workflow (m-1, Codex 2); рекол 3D хранит presentation и немые поля, говорит о снятых опциях
//       (Codex 4); строка про модель, которой больше нет (Codex 7); цена 3D без суммы (Codex 3);
//       одна подпись двери «Reuse»; Scene открыта (2.png); surface_hint — решение, поле не рисуется.
//   node scripts/playground-registry-probe.mjs --mutate-retouch-slot   слот картинки плитки 10 не
//                                                                   рисуется → краснеет W
//   node scripts/playground-registry-probe.mjs --mutate-retouch-recall рекол ретуши не открывает
//                                                                   маску → краснеет W
//   node scripts/playground-registry-probe.mjs --mutate-pin-room     приколоты все прогоны комнаты,
//                                                                   как до починки → краснеет W
//   node scripts/playground-registry-probe.mjs --mutate-retouch-pin  живая ретушь картинки плитки не
//                                                                   видна под ней → краснеет W
//   node scripts/playground-registry-probe.mjs --mutate-workflow-caption подпись окна плитки снова
//                                                                   по колорвею 0 → краснеет W
//   node scripts/playground-registry-probe.mjs --mutate-threed-carry  рекол 3D снова шлёт air
//                                                                   → краснеет W
//   node scripts/playground-registry-probe.mjs --mutate-threed-reconcile снятая опция маршрута не
//                                                                   названа → краснеет W
//   node scripts/playground-registry-probe.mjs --mutate-engine-note  подмена модели молчит
//                                                                   → краснеет W
//   node scripts/playground-registry-probe.mjs --mutate-threed-price снова «about $1.20»
//                                                                   → краснеет T, W
//   node scripts/playground-registry-probe.mjs --mutate-reuse-label  дверь снова «reuse»
//                                                                   → краснеет W
//   node scripts/playground-registry-probe.mjs --mutate-scene-fold   Scene снова свёрнута
//                                                                   → краснеет W
//
// P-06 (регенерация под контракт фазы 3):
//   X · новые обязательные ключи сгенерированных типов стоят `undefined`, провод НЕ меняется:
//       emptyParams() несёт ключи inpaint/extend, а тело плитки их не везёт; пустая полоса
//       НЕ утверждает поля 32/33 (runKinds / suggestPromptsModel отсутствуют, а не пусты).
//   node scripts/playground-registry-probe.mjs --mutate-p06-params  emptyParams шлёт inpaint
//                                                                   → краснеет X (и A)
//   node scripts/playground-registry-probe.mjs --mutate-p06-band    пустая полоса утверждает
//                                                                   runKinds: [] → краснеет X
//
// C-15 (Ideas от сервера; живое меню — scripts/playground-prompt-probe.mjs):
//   Y · ideasFrom каждой плитки даёт ≤ 2 положительных id (и первые картинки формы); тело
//       SuggestPrompts обрезано по двери (2 картинки, 2000 рун контекста и текста); чистка фраз;
//       меню как данные (сервер выше, повтор уходит из статических, сбой — только статические);
//       ключи PROMPT_IDEAS печатаются для сверки с таблицей сервера (B-15).
//   node scripts/playground-registry-probe.mjs --mutate-ideas-media-cap  потолок картинок 3
//                                                                   → краснеет Y
//
// C-16 (Recently used «on this card»; живое меню — scripts/playground-prompt-probe.mjs, группа H):
//   Z · cardRecentTexts по полосе с try-on, ретушью (оба маршрута), заглушками и чужими плитками:
//       ожидаемые списки по полям, новые сверху, без повторов, не больше восьми; неизвестная пара
//       — []; recentMenu отдаёт повтор браузерной группе.
//   node scripts/playground-registry-probe.mjs --mutate-recent-scene   сцена читается из ask
//                                                                   → краснеет Z
//   node scripts/playground-registry-probe.mjs --mutate-recent-inpaint ретушь по маске не читает
//                                                                   ask → краснеет Z
//
// C-13 (плитка 9 Extend Image, фаза 3):
//   AA · тело kind=extend целиком (одна картинка в extra_input_media_ids, params.extend.aspect_ratio,
//        ask '', без image/freeform); ворота СТРОГО по run_kinds: нет списка → «not on this server
//        yet» и приглушена в разметке сетки, список без extend → «not wired», с extend → живая;
//        отказы до денег в порядке двери (картинка, формат, 64 px, «уже 2:3» с допуском 0.5 %
//        сервера); форма 11.png (Image to expand REQUIRED, New final format открыт, 9 форматов без
//        auto, с 9:21, без моделей тоже); workflowOfRun/runRepresentation/recallTargetKind для
//        extend и inpaint; рекол тело → черновик → то же тело.
//   node scripts/playground-registry-probe.mjs --mutate-extend-tolerance допуск «тот же формат» 5 %
//                                                                   → краснеет AA
//   node scripts/playground-registry-probe.mjs --mutate-extend-gate  нет run_kinds читается как
//                                                                   «всё можно» → краснеет AA
//   node scripts/playground-registry-probe.mjs --mutate-extend-run   extend не отдаётся плитке 9
//                                                                   → краснеет AA
//   node scripts/playground-registry-probe.mjs --mutate-extend-wire  формат не уезжает в
//                                                                   params.extend → краснеет AA
//
// C-14 (плитка 10: маршрут маски, kind=inpaint):
//   AB · один RetouchInput → два тела: окно (freeform/retouch, как в фазе 2) и маска (inpaint:
//        ask = слова, params.inpaint = {source, mask}, без freeform/extra/image); маршрут: маска
//        только где run_kinds перечисляет inpaint И картинка знает свой размер, иначе окно и строка
//        цены «states no size»; отказы маски без оболочки; загрузчик маски — одна загрузка на одну
//        краску (повтор, параллельные нажатия), новая краска — новая, сбой забывается; честная
//        строка по маршруту (панель и редактор — одна функция); retouchSourceId и рекол inpaint;
//        maskableRun(extend|inpaint); угол Mask без retouch_zone не рисуется и при inpaint.
//   node scripts/playground-registry-probe.mjs --mutate-inpaint-route маршрут маски без слова
//                                                                   сервера → краснеет AB
//   node scripts/playground-registry-probe.mjs --mutate-mask-once    загрузчик не помнит краску
//                                                                   → краснеет AB
//   AC · (G-03 client fix) бюджет холста маски (M-1: сверх 4096² — окно и строка «cannot draw»;
//        canDraw=false — то же), повёрнутый файл (m-1: отказ RETOUCH_TURNED на обоих маршрутах),
//        хранилище id маски (BLOCKER: новый загрузчик с тем же хранилищем отдаёт ту же маску без
//        загрузки), слова панели (m-2, n-2).
//   node scripts/playground-registry-probe.mjs --mutate-canvas-cap   бюджета холста нет → AC
//   node scripts/playground-registry-probe.mjs --mutate-exif-blind   повёрнутый файл не видим → AC
//   node scripts/playground-registry-probe.mjs --mutate-mask-store   загрузчик не читает хранилище
//                                                                   → краснеет AC
//   node scripts/playground-registry-probe.mjs --mutate-ideas-first-ref Create/Edit снова шлёт
//                                                                   Ideas одну картинку → Y
//   AD · (G-03, бэкенд d8b7bca) submit_unconfirmed словами: исход прогона (история, пин
//        итогов), пилюля, выноска панели; прочие коды — как есть.
//   node scripts/playground-registry-probe.mjs --mutate-unconfirmed-words код без слов → AD
//   node scripts/playground-registry-probe.mjs --mutate-recent-kind  «on this card» без правила
//                                                                   inpaint в workflowOfRun → Z
//   AE · (G-03 Codex r2) ориентация EXIF из байтов (JPEG II/MM, PNG eXIf, WebP EXIF, мусор → 1) и
//        отказ по ней (квадратный 1000×995 с 6 — отказ, 1011×1000 без тега — нет, 3 — отказ);
//        черновик краски: сравни-и-удали (поздний A не трогает B), адрес с оператором, взятый при
//        нажатии; сбой sessionStorage виден (false); перезагрузка и старый формат v1 отдают ту же
//        маску; зависшая загрузка маски бросается по сроку и поздний id не хранится; отказ двери
//        по маске (mask_invalid …) забывает маску; журнал говорит «ключ освобождён».
//   node scripts/playground-registry-probe.mjs --mutate-draft-cas    удаление без сравнения → AE
//   node scripts/playground-registry-probe.mjs --mutate-save-silent  сбой хранилища молчит → AE
//   node scripts/playground-registry-probe.mjs --mutate-exif-parse   big-endian читается как II → AE
//   node scripts/playground-registry-probe.mjs --mutate-exif-moves   отказ только при 5–8 → AE
//   node scripts/playground-registry-probe.mjs --mutate-upload-deadline срока загрузки маски нет → AE
//   node scripts/playground-registry-probe.mjs --mutate-late-mask    поздний id хранится → AE
//   node scripts/playground-registry-probe.mjs --mutate-mask-forget  отказанная маска помнится → AE
//   node scripts/playground-registry-probe.mjs --mutate-ledger-freed журнал не говорит «освобождён» → AE
//   AF · (G-03 Codex r3) журнал закрывает ключ только по его id и оператору отправки (поздний id1 не
//        трогает id2 того же запроса); ledgerSend говорит «записан ли»; отказ маски, решённый по её
//        байтам, освобождает ключ и после тишины («маски нет» — нет); чтение EXIF со сроком и без
//        кэша сбоя; брошенная загрузка маски оборвана.
//   node scripts/playground-registry-probe.mjs --mutate-settle-any-id  закрытие без сравнения id → AF
//   node scripts/playground-registry-probe.mjs --mutate-ledger-stored-lie журнал всегда «записан» → AF
//   node scripts/playground-registry-probe.mjs --mutate-orientation-hang у чтения EXIF нет срока → AF
//   node scripts/playground-registry-probe.mjs --mutate-mask-void    «маски нет» тоже «не заведён» → AF
//   node scripts/playground-registry-probe.mjs --mutate-upload-no-abort брошенная загрузка не обрывается → AF
//   node scripts/playground-registry-probe.mjs --mutate-extend-list  Extend снова только по run_kinds → AA
//   node scripts/playground-registry-probe.mjs --mutate-source-cap   18 МП не отказывается даром → AA, AE
//   node scripts/playground-registry-probe.mjs --mutate-waiting-words paid_collect_waiting без слов → AD
//
// 20-PROMPTS (PR-03, слова, которые уезжают в модель; живой Improve — playground-prompt-probe.mjs, K):
//   AG · §3.5 статические идеи ретуши описывают РЕЗУЛЬТАТ: ровно шесть фраз документа, ни одна не
//        начинается с remove/delete/fix/straighten, zone и change_text читают один список;
//        §3.7 плитка 4 везёт ИМЯ свотча в colour.words: знакомый код — «Classic Blue», незнакомый и
//        огрызок кода — ''; строка цены и «what the model gets» называют имя; рекол имени не
//        жалуется, чужие слова — жалуется.
//   node scripts/playground-registry-probe.mjs --mutate-retouch-ideas  в списке снова «remove the
//                                                                   crease» → краснеет AG
//   node scripts/playground-registry-probe.mjs --mutate-pantone-name   имя не уезжает (words '')
//                                                                   → краснеет A, AG
//   node scripts/playground-registry-probe.mjs --mutate-pantone-prefix имя по префиксу кода
//                                                                   → краснеет AG
//
// Проба СЧИТАЕТ ПРОВАЛЫ и печатает число исходов всегда: ноль провалов при упавшей сборке — это
// молчание, а не зелень.

import { build as esbuild } from 'esbuild';
import { rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const MUT = {
  wire: process.argv.includes('--mutate-wire'),
  validate: process.argv.includes('--mutate-validate'),
  legacy: process.argv.includes('--mutate-legacy'),
  capability: process.argv.includes('--mutate-capability'),
  recall: process.argv.includes('--mutate-recall'),
  presetMatch: process.argv.includes('--mutate-preset-match'),
  gateLegacy: process.argv.includes('--mutate-gate-legacy'),
  imageAbsent: process.argv.includes('--mutate-image-absent'),
  quality: process.argv.includes('--mutate-quality'),
  snap: process.argv.includes('--mutate-snap'),
  snapRead: process.argv.includes('--mutate-snap-read'),
  sections: process.argv.includes('--mutate-sections'),
  drawn: process.argv.includes('--mutate-drawn'),
  swapEcho: process.argv.includes('--mutate-swap-echo'),
  logoRole: process.argv.includes('--mutate-logo-role'),
  creativity: process.argv.includes('--mutate-creativity'),
  formatDefault: process.argv.includes('--mutate-format-default'),
  c07Validate: process.argv.includes('--mutate-c07-validate'),
  c07Gate: process.argv.includes('--mutate-c07-gate'),
  runWorkflow: process.argv.includes('--mutate-run-workflow'),
  stamp: process.argv.includes('--mutate-stamp'),
  tryonRole: process.argv.includes('--mutate-tryon-role'),
  tryonScene: process.argv.includes('--mutate-tryon-scene'),
  tryonValidate: process.argv.includes('--mutate-tryon-validate'),
  tryonColourway: process.argv.includes('--mutate-tryon-colourway'),
  tryonPhotos: process.argv.includes('--mutate-tryon-photos'),
  tryonGate: process.argv.includes('--mutate-tryon-gate'),
  tryonVocab: process.argv.includes('--mutate-tryon-vocab'),
  maskHull: process.argv.includes('--mutate-mask-hull'),
  maskRing: process.argv.includes('--mutate-mask-ring'),
  maskRefusal: process.argv.includes('--mutate-mask-refusal'),
  maskGate: process.argv.includes('--mutate-mask-gate'),
  threedOptions: process.argv.includes('--mutate-threed-options'),
  threedPbr: process.argv.includes('--mutate-threed-pbr'),
  threedGate: process.argv.includes('--mutate-threed-gate'),
  threedColorway: process.argv.includes('--mutate-threed-colorway'),
  railThreed: process.argv.includes('--mutate-rail-threed'),
  legacyThreed: process.argv.includes('--mutate-legacy-threed'),
  stepFirst: process.argv.includes('--mutate-step-first'),
  stubTryon: process.argv.includes('--mutate-stub-tryon'),
  threedRun: process.argv.includes('--mutate-threed-run'),
  threedRecall: process.argv.includes('--mutate-threed-recall'),
  pbrDefault: process.argv.includes('--mutate-pbr-default'),
  retouchSlot: process.argv.includes('--mutate-retouch-slot'),
  retouchRecall: process.argv.includes('--mutate-retouch-recall'),
  pinRoom: process.argv.includes('--mutate-pin-room'),
  retouchPin: process.argv.includes('--mutate-retouch-pin'),
  workflowCaption: process.argv.includes('--mutate-workflow-caption'),
  threedCarry: process.argv.includes('--mutate-threed-carry'),
  threedReconcile: process.argv.includes('--mutate-threed-reconcile'),
  engineNote: process.argv.includes('--mutate-engine-note'),
  threedPrice: process.argv.includes('--mutate-threed-price'),
  reuseLabel: process.argv.includes('--mutate-reuse-label'),
  sceneFold: process.argv.includes('--mutate-scene-fold'),
  p06Params: process.argv.includes('--mutate-p06-params'),
  p06Band: process.argv.includes('--mutate-p06-band'),
  ideasMediaCap: process.argv.includes('--mutate-ideas-media-cap'),
  recentScene: process.argv.includes('--mutate-recent-scene'),
  recentInpaint: process.argv.includes('--mutate-recent-inpaint'),
  extendTolerance: process.argv.includes('--mutate-extend-tolerance'),
  extendGate: process.argv.includes('--mutate-extend-gate'),
  extendRun: process.argv.includes('--mutate-extend-run'),
  extendWire: process.argv.includes('--mutate-extend-wire'),
  inpaintRoute: process.argv.includes('--mutate-inpaint-route'),
  maskOnce: process.argv.includes('--mutate-mask-once'),
  canvasCap: process.argv.includes('--mutate-canvas-cap'),
  exifBlind: process.argv.includes('--mutate-exif-blind'),
  maskStore: process.argv.includes('--mutate-mask-store'),
  ideasFirstRef: process.argv.includes('--mutate-ideas-first-ref'),
  recentKind: process.argv.includes('--mutate-recent-kind'),
  unconfirmedWords: process.argv.includes('--mutate-unconfirmed-words'),
  draftCas: process.argv.includes('--mutate-draft-cas'),
  saveSilent: process.argv.includes('--mutate-save-silent'),
  exifParse: process.argv.includes('--mutate-exif-parse'),
  exifMoves: process.argv.includes('--mutate-exif-moves'),
  uploadDeadline: process.argv.includes('--mutate-upload-deadline'),
  lateMask: process.argv.includes('--mutate-late-mask'),
  maskForget: process.argv.includes('--mutate-mask-forget'),
  ledgerFreed: process.argv.includes('--mutate-ledger-freed'),
  settleAnyId: process.argv.includes('--mutate-settle-any-id'),
  ledgerStoredLie: process.argv.includes('--mutate-ledger-stored-lie'),
  orientationHang: process.argv.includes('--mutate-orientation-hang'),
  maskVoid: process.argv.includes('--mutate-mask-void'),
  uploadNoAbort: process.argv.includes('--mutate-upload-no-abort'),
  extendList: process.argv.includes('--mutate-extend-list'),
  sourceCap: process.argv.includes('--mutate-source-cap'),
  waitingWords: process.argv.includes('--mutate-waiting-words'),
  retouchIdeas: process.argv.includes('--mutate-retouch-ideas'),
  pantoneName: process.argv.includes('--mutate-pantone-name'),
  pantonePrefix: process.argv.includes('--mutate-pantone-prefix'),
};
const MUTATED = Object.values(MUT).some(Boolean);

let bad = 0;
let total = 0;
const failedIn = new Set();
let group = '';
const ck = (ok, what, detail = '') => {
  total++;
  if (!ok) {
    bad++;
    failedIn.add(group);
  }
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${!ok && detail ? `  — ${detail}` : ''}`);
};
const head = (id, s) => {
  group = id;
  console.log(`\n${id} · ${s}`);
};

// ─── мутации: одна строка НАСТОЯЩЕГО модуля подменяется в бандле ─────────────────────────────
const swap = (name, file, needle, replacement) => ({
  name,
  setup(b) {
    b.onLoad({ filter: file }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(needle))
        throw new Error(`мутация ${name} не нашла свою строку в ${args.path}`);
      return {
        contents: src.replace(needle, replacement),
        loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts',
      };
    });
  },
});
const plugins = [];
if (MUT.retouchIdeas)
  plugins.push(
    swap(
      'retouch-ideas-operation',
      /playground\/ideas\.ts$/,
      "'uncreased fabric continuing the surrounding cloth',",
      "'remove the crease',",
    ),
  );
if (MUT.pantoneName)
  plugins.push(
    swap(
      'pantone-name-dropped',
      /tiles\/change-color\.tsx$/,
      'words: pantoneName(pick.code) },',
      "words: '' },",
    ),
  );
if (MUT.pantonePrefix)
  plugins.push(
    swap(
      'pantone-name-prefix',
      /tiles\/change-color\.tsx$/,
      "return hit && hit.code.toLowerCase() === clean.toLowerCase() ? hit.name.trim() : '';",
      "return hit ? hit.name.trim() : '';",
    ),
  );
if (MUT.wire)
  plugins.push(
    swap(
      'ask-untrimmed',
      /tiles\/change-color\.tsx$/,
      'ask: textOf(draft, GARMENT).trim(),',
      'ask: textOf(draft, GARMENT),',
    ),
  );
if (MUT.validate)
  plugins.push(
    swap(
      'cap-plus-one',
      /tiles\/change-color\.tsx$/,
      'if (ids.length > RECOLOR_SOURCES_MAX) {',
      'if (ids.length > RECOLOR_SOURCES_MAX + 1) {',
    ),
  );
if (MUT.legacy)
  plugins.push(
    swap(
      'aside-to-create',
      /core\/chain\.ts$/,
      "['aside', { step: 'playground', wf: 'change_color' }]",
      "['aside', { step: 'playground', wf: 'create_edit' }]",
    ),
  );
if (MUT.capability)
  plugins.push(
    swap(
      'absent-means-all',
      /registry\/common\.ts$/,
      'if (offered === undefined) return notYet();',
      'if (offered === undefined) return { available: true };',
    ),
  );
if (MUT.recall)
  plugins.push(
    swap(
      'cutout-lost',
      /registry\/run-workflow\.ts$/,
      "if (kind === 'cutout') return 'remove_background';",
      '',
    ),
  );

if (MUT.presetMatch)
  plugins.push(
    swap(
      'match-on-preset',
      /tiles\/create-edit\.tsx$/,
      "match: matchesWorkflow('create_edit'),",
      "match: (run) => (run.kind ?? '').trim().toLowerCase() === 'freeform' && (run.params === undefined || (run.params.freeform?.preset ?? '').trim() === 'free'),",
    ),
  );

// ─── C-07: плитки 2, 3, 5, 6, 7 и правило «прогон → плитка» ────────────────────────────────────
if (MUT.swapEcho)
  plugins.push(
    swap('swap-no-echo', /tiles\/swap-fabrics\.tsx$/, 'fabricMediaId: id,', 'fabricMediaId: 0,'),
  );
if (MUT.logoRole)
  plugins.push(
    swap(
      'logo-as-subject',
      /tiles\/add-logo\.tsx$/,
      "[{ mediaId: logo, regions: [], texts: [], role: 'logo' }]",
      "[{ mediaId: logo, regions: [], texts: [], role: 'subject' }]",
    ),
  );
if (MUT.creativity)
  plugins.push(
    swap(
      'booster-dropped',
      /tiles\/design-variations\.tsx$/,
      'creativity: creativityOf(draft),',
      'creativity: 0,',
    ),
  );
if (MUT.formatDefault)
  plugins.push(
    swap(
      'fabric-format-2-3',
      /tiles\/fabric-to-image\.tsx$/,
      "formatSection({ initial: '9:16' })",
      "formatSection({ initial: '1:1' })",
    ),
  );
if (MUT.c07Validate)
  plugins.push(
    swap(
      'swap-same-picture',
      /tiles\/swap-fabrics\.tsx$/,
      'if (design === fabric) {',
      'if (false) {',
    ),
  );
if (MUT.c07Gate)
  plugins.push(
    swap(
      'logo-always-open',
      /tiles\/add-logo\.tsx$/,
      "gate: (band) => workflowOffered(band, 'add_logo'),",
      'gate: () => ({ available: true }),',
    ),
  );
if (MUT.runWorkflow)
  plugins.push(
    swap(
      'cloth-is-change-color',
      /registry\/run-workflow\.ts$/,
      "return cloth ? 'swap_fabrics' : 'change_color';",
      "return 'change_color';",
    ),
  );
if (MUT.stamp)
  plugins.push(
    swap(
      'stamp-dropped',
      /design\/bench-kinds\.ts$/,
      'if (!onPage && stamped) STAMPED_WORKFLOW.set(run, stamped);',
      '',
    ),
  );

// ─── C-08: мутации ворот фазы 2 и движка. Две правки одного файла — одним плагином (esbuild
// берёт первый onLoad, который ответил).
const COMMON = /registry\/common\.ts$/;
const commonSwaps = [];
if (MUT.gateLegacy)
  commonSwaps.push([
    'return band.playgroundWorkflows === undefined ? legacy() : workflowOffered(band, key);',
    'return legacy();',
  ]);
if (MUT.imageAbsent)
  commonSwaps.push([
    "const rows = (band.imageModels ?? []).filter((m) => (m.slug ?? '').trim() !== '');",
    "const rows = (band.imageModels ?? [{ slug: 'openai/gpt-image-2', label: 'GPT Image 2', isDefault: true, qualities: ['low', 'medium', 'high'], aspectRatios: ['auto', '2:3'] }]).filter((m) => (m.slug ?? '').trim() !== '');",
  ]);
if (MUT.quality)
  commonSwaps.push(['quality: qualityOf(model, draft, opts.engine),', "quality: '',"]);
if (MUT.snap)
  commonSwaps.push([
    `    choices[field.key] = snapRatio(
      draft.choices[field.key] ?? field.initial,
      allowedRatios(model, field),
    );`,
    '    choices[field.key] = draft.choices[field.key] ?? field.initial;',
  ]);
if (MUT.snapRead)
  commonSwaps.push(['return snapRatio(chosen, allowedRatios(model, field));', 'return chosen;']);
if (MUT.sections)
  commonSwaps.push([
    `export const enginesOffered = (band: GetDesignBandResponse): boolean =>
  imageModelsOf(band) !== null;`,
    'export const enginesOffered = (_band: GetDesignBandResponse): boolean => true;',
  ]);
if (MUT.p06Params)
  commonSwaps.push([
    '    inpaint: undefined,',
    '    inpaint: { sourceMediaId: 0, maskMediaId: 0 },',
  ]);
if (MUT.drawn)
  commonSwaps.push(['return out.length ? out : [...field.ratios];', 'return [...field.ratios];']);
if (MUT.sourceCap)
  commonSwaps.push(['w > 0 && h > 0 && w * h > COMPOSITE_MAX_SOURCE_PIXELS;', 'false;']);
if (commonSwaps.length)
  plugins.unshift({
    name: 'c08-common',
    setup(b) {
      b.onLoad({ filter: COMMON }, async (args) => {
        let src = await readFile(args.path, 'utf8');
        for (const [needle, replacement] of commonSwaps) {
          if (!src.includes(needle))
            throw new Error(`мутация C-08 не нашла свою строку: ${needle.slice(0, 60)}`);
          src = src.replace(needle, replacement);
        }
        return { contents: src, loader: 'ts' };
      });
    },
  });

// ─── C-09: мутации плитки 1 и её пикеров — по плагину на файл, правки файла одним плагином.
const fileSwaps = (name, file, pairs) =>
  pairs.length
    ? plugins.unshift({
        name,
        setup(b) {
          b.onLoad({ filter: file }, async (args) => {
            let src = await readFile(args.path, 'utf8');
            for (const [needle, replacement] of pairs) {
              if (!src.includes(needle))
                throw new Error(`мутация ${name} не нашла свою строку: ${needle.slice(0, 60)}`);
              src = src.replace(needle, replacement);
            }
            return { contents: src, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
          });
        },
      })
    : 0;
const tryonSwaps = [];
if (MUT.tryonRole)
  tryonSwaps.push(["out.push(item(m.id ?? 0, 'product'));", "out.push(item(m.id ?? 0, ''));"]);
if (MUT.tryonScene)
  tryonSwaps.push([
    "if (sceneMode(draft) === 'reference' && scene) out.push(",
    'if (scene) out.push(',
  ]);
if (MUT.tryonValidate)
  tryonSwaps.push([
    "if (sceneMode(draft) === 'reference' && !scenePhoto(draft)) {",
    'if (false) {',
  ]);
if (MUT.tryonGate)
  tryonSwaps.push([
    "gate: (band) => workflowOffered(band, 'virtual_try_on'),",
    'gate: () => ({ available: true }),',
  ]);
if (MUT.tryonVocab)
  tryonSwaps.push(["{ value: 'portrait', label:", "{ value: 'portrait_face', label:"]);
fileSwaps('c09-tile', /tiles\/virtual-try-on\.tsx$/, tryonSwaps);
fileSwaps(
  'c09-renders',
  /fields\/colourway-render-picker\.tsx$/,
  MUT.tryonColourway
    ? [
        [
          'if (usable(picture) && isRender(picture) && colorwayOf(picture) === want) take(picture);',
          'if (usable(picture) && isRender(picture)) take(picture);',
        ],
        ["outputsOfKind(band, 'render', want)", "outputsOfKind(band, 'render')"],
      ]
    : [],
);
fileSwaps(
  'c09-photos',
  /fields\/model-photo-picker\.tsx$/,
  MUT.tryonPhotos
    ? [
        [
          'for (const m of [model.thumbnail, ...(model.media ?? [])]) {',
          'for (const m of model.media ?? []) {',
        ],
      ]
    : [],
);
// ─── C-11: мутации маски ──────────────────────────────────────────────────────────────────────
const GEOMETRY = /mask\/geometry\.ts$/;
const geometrySwaps = [];
if (MUT.maskHull)
  geometrySwaps.push([
    'const { rx, ry } = radiiOf(stroke.size, aspect);',
    'const { rx, ry } = { rx: 0 * stroke.size * aspect, ry: 0 };',
  ]);
if (MUT.maskRing)
  geometrySwaps.push(['if (hull.length > REGION_MAX_POINTS) hull = circumscribed(hull);', '']);
if (geometrySwaps.length)
  plugins.unshift({
    name: 'c11-geometry',
    setup(b) {
      b.onLoad({ filter: GEOMETRY }, async (args) => {
        let src = await readFile(args.path, 'utf8');
        for (const [needle, replacement] of geometrySwaps) {
          if (!src.includes(needle))
            throw new Error(`мутация C-11 не нашла свою строку: ${needle.slice(0, 60)}`);
          src = src.replace(needle, replacement);
        }
        return { contents: src, loader: 'ts' };
      });
    },
  });
const RETOUCH = /tiles\/retouch-zone\.tsx$/;
const retouchSwaps = [];
if (MUT.maskRefusal)
  retouchSwaps.push(["if (!input.painted) return { reason: 'paint the zone to change' };", '']);
if (MUT.maskGate)
  retouchSwaps.push([
    "workflowOffered(band, 'retouch_zone').available;",
    "workflowOffered(band, 'retouch_zone').available || true;",
  ]);
if (MUT.retouchSlot)
  retouchSwaps.push([
    `      key: RETOUCH_SOURCE_KEY,
      title: 'Picture',`,
    `      key: RETOUCH_SOURCE_KEY,
      when: () => false,
      title: 'Picture',`,
  ]);
if (MUT.retouchRecall)
  retouchSwaps.push([
    'flags: { [RETOUCH_MASKING_KEY]: !!found },',
    'flags: { [RETOUCH_MASKING_KEY]: false },',
  ]);
if (retouchSwaps.length)
  plugins.unshift({
    name: 'c11-retouch',
    setup(b) {
      b.onLoad({ filter: RETOUCH }, async (args) => {
        let src = await readFile(args.path, 'utf8');
        for (const [needle, replacement] of retouchSwaps) {
          if (!src.includes(needle))
            throw new Error(`мутация C-11 не нашла свою строку: ${needle.slice(0, 60)}`);
          src = src.replace(needle, replacement);
        }
        return { contents: src, loader: 'tsx' };
      });
    },
  });
// ─── C-10: мутации плитки 12 и рельса. Правки одного файла — одним плагином, как у C-08.
const multiSwap = (name, file, loader, pairs) => ({
  name,
  setup(b) {
    b.onLoad({ filter: file }, async (args) => {
      let src = await readFile(args.path, 'utf8');
      for (const [needle, replacement] of pairs) {
        if (!src.includes(needle))
          throw new Error(`мутация ${name} не нашла свою строку: ${needle.slice(0, 60)}`);
        src = src.replace(needle, replacement);
      }
      return { contents: src, loader };
    });
  },
});
const tileSwaps = [];
if (MUT.threedOptions)
  tileSwaps.push([
    "return (band.threedOptions ?? []).some((raw) => (raw ?? '').trim() === name);",
    'return true;',
  ]);
if (MUT.threedPbr)
  tileSwaps.push([
    "pbr: offers(band, PBR) ? (textured && c.pbr ? 'on' : 'off') : '',",
    "pbr: offers(band, PBR) ? (c.pbr ? 'on' : 'off') : '',",
  ]);
if (MUT.threedGate)
  tileSwaps.push([
    'return band.threedOptions === undefined ? notYet() : { available: true };',
    'return { available: true };',
  ]);
if (MUT.threedColorway)
  tileSwaps.push(['if ((media?.id ?? 0) === mediaId) return colorwayOf(slot);', '']);
if (MUT.pbrDefault)
  tileSwaps.push(['pbr: draft.flags[PBR] ?? true,', 'pbr: draft.flags[PBR] ?? false,']);
if (MUT.threedCarry)
  tileSwaps.push(['presentation: presentationOf(draft),', "presentation: 'air',"]);
if (MUT.threedReconcile)
  tileSwaps.push([
    '.filter(([name, word]) => word && !offers(band, name))',
    '.filter(() => false)',
  ]);
if (MUT.threedPrice)
  tileSwaps.push(["shape: () => '1 model',", "shape: () => '1 model · about $1.20',"]);
if (tileSwaps.length)
  plugins.unshift(multiSwap('c10-tile', /tiles\/image-to-3d\.tsx$/, 'tsx', tileSwaps));
const chainSwaps = [];
if (MUT.railThreed)
  chainSwaps.push([
    'return threedStepOnRail(ctx) ? STEPS_WITH_THREED : STEPS;',
    'return STEPS_WITH_THREED;',
  ]);
if (MUT.legacyThreed)
  chainSwaps.push(["if (value === 'threed' && !threedRetired) return null;", '']);
if (MUT.stepFirst)
  chainSwaps.push([
    `  const legacy = legacyStep(value, threedRetired);
  if (legacy) return legacy.step;
  return isStepId(value) ? value : null;`,
    `  if (isStepId(value)) return value;
  return legacyStep(value, threedRetired)?.step ?? null;`,
  ]);
if (chainSwaps.length)
  plugins.unshift(multiSwap('c10-chain', /core\/chain\.ts$/, 'ts', chainSwaps));

// ─── C-12: мутации интеграции полос.
if (MUT.stubTryon)
  plugins.push(
    swap(
      'tryon-preset-only',
      /tiles\/virtual-try-on\.tsx$/,
      "match: matchesWorkflow('virtual_try_on'),",
      "match: (run) => (run.params?.freeform?.preset ?? '').trim() === 'tryon',",
    ),
  );
if (MUT.threedRun)
  plugins.push(
    swap(
      'threed-no-tile',
      /registry\/run-workflow\.ts$/,
      "if (kind === 'threed') return 'image_to_3d';",
      '',
    ),
  );
if (MUT.threedRecall)
  plugins.push(
    swap(
      'threed-recall-step5',
      /design\/history-recall\.tsx$/,
      "if (kind === 'threed') return threedRetired ? 'playground' : 'threed';",
      "if (kind === 'threed') return 'threed';",
    ),
  );

// ─── G-02 client fix: мутации починок ревью.
const resultsSwaps = [];
if (MUT.pinRoom)
  resultsSwaps.push([
    'const pinMatch = def?.run?.results.match ?? inPlaygroundRoom;',
    'const pinMatch = match;',
  ]);
if (MUT.retouchPin) resultsSwaps.push(['shown.has(retouchSourceId(run))', 'shown.has(-1)']);
if (MUT.workflowCaption)
  resultsSwaps.push([
    'return workflowOutputsHorizon(band, def.key);',
    'return outputsHorizon(band, 0);',
  ]);
if (resultsSwaps.length)
  plugins.unshift(multiSwap('g02-results', /playground\/results\.tsx$/, 'tsx', resultsSwaps));
if (MUT.engineNote)
  plugins.push(
    swap(
      'engine-note-silent',
      /registry\/common\.ts$/,
      "if (rows.some((m) => (m.slug ?? '').trim() === want)) return null;",
      'return null;',
    ),
  );
if (MUT.reuseLabel)
  plugins.push(
    swap(
      'reuse-lowercase',
      /fields\/reuse\.tsx$/,
      "export const REUSE_LABEL = 'Reuse';",
      "export const REUSE_LABEL = 'reuse';",
    ),
  );
if (MUT.sceneFold)
  plugins.push(
    swap(
      'scene-folded',
      /tiles\/virtual-try-on\.tsx$/,
      '      defaultOpen: true,',
      '      defaultOpen: false,',
    ),
  );

if (MUT.p06Band)
  plugins.push(
    swap('p06-band', /design\/use-design-band\.ts$/, '  runKinds: undefined,', '  runKinds: [],'),
  );

if (MUT.ideasMediaCap)
  plugins.push(
    swap(
      'ideas-media-cap',
      /playground\/ideas-server\.ts$/,
      'export const SUGGEST_MEDIA_MAX = 2;',
      'export const SUGGEST_MEDIA_MAX = 3;',
    ),
  );

const RECENT_SWAPS = [];
if (MUT.recentScene)
  RECENT_SWAPS.push([
    'virtual_try_on: { pose: ask, scene: sceneText },',
    'virtual_try_on: { pose: ask, scene: ask },',
  ]);
if (MUT.recentInpaint)
  RECENT_SWAPS.push(["isMaskRetouch(run) ? run.ask ?? '' :", "isMaskRetouch(run) ? '' :"]);
fileSwaps('c16-card-recent', /playground\/card-recent\.ts$/, RECENT_SWAPS);

// ─── C-13: мутации плитки 9.
const EXTEND_SWAPS = [];
if (MUT.extendTolerance)
  EXTEND_SWAPS.push([
    'export const EXTEND_SAME_RATIO_TOLERANCE = 0.005;',
    'export const EXTEND_SAME_RATIO_TOLERANCE = 0.05;',
  ]);
if (MUT.extendWire)
  EXTEND_SWAPS.push([
    'extend: { aspectRatio: formatOf(band, draft, FORMAT.field) },',
    "extend: { aspectRatio: '' },",
  ]);
if (MUT.extendList)
  EXTEND_SWAPS.push([
    "return route.available ? workflowOffered(band, 'extend_image') : route;",
    'return route;',
  ]);
fileSwaps('c13-extend', /tiles\/extend-image\.tsx$/, EXTEND_SWAPS);
if (MUT.extendGate)
  plugins.push(
    swap(
      'run-kinds-absent-means-all',
      /registry\/common\.ts$/,
      'if (kinds === undefined) return notYet();',
      'if (kinds === undefined) return { available: true };',
    ),
  );
if (MUT.extendRun)
  plugins.push(
    swap(
      'extend-no-tile',
      /registry\/run-workflow\.ts$/,
      "if (kind === 'extend') return 'extend_image';",
      '',
    ),
  );

// ─── C-14: мутации маршрута маски.
if (MUT.inpaintRoute)
  retouchSwaps.push([
    "if (!inpaintOffered(band)) return 'window';",
    "if (inpaintOffered(band) && false) return 'window';",
  ]);
if (MUT.inpaintRoute && retouchSwaps.length === 1)
  plugins.unshift({
    name: 'c14-retouch',
    setup(b) {
      b.onLoad({ filter: RETOUCH }, async (args) => {
        let src = await readFile(args.path, 'utf8');
        for (const [needle, replacement] of retouchSwaps) {
          if (!src.includes(needle))
            throw new Error(`мутация C-14 не нашла свою строку: ${needle.slice(0, 60)}`);
          src = src.replace(needle, replacement);
        }
        return { contents: src, loader: 'tsx' };
      });
    },
  });
fileSwaps('c14-mask-once', /mask\/mask-upload\.ts$/, [
  ...(MUT.maskVoid
    ? [["return errorInfoWhy(error) !== 'the mask picture does not exist';", 'return true;']]
    : []),
  ...(MUT.uploadNoAbort
    ? [
        [
          '            reject(new MaskUploadStalled(deadlineMs));\n            abort.abort();',
          '            reject(new MaskUploadStalled(deadlineMs));',
        ],
      ]
    : []),
  ...(MUT.maskOnce ? [['if (held) return held;', '']] : []),
  ...(MUT.maskStore
    ? [['const kept = store?.recall(mediaId, key);', 'const kept = undefined;']]
    : []),
  ...(MUT.uploadDeadline
    ? [['abandoned = true;\n            reject(new MaskUploadStalled(deadlineMs));', '']]
    : []),
  ...(MUT.lateMask
    ? [['if (!abandoned) store?.keep(mediaId, key, got);', 'store?.keep(mediaId, key, got);']]
    : []),
  ...(MUT.maskForget
    ? [['      memo.delete(key);\n      store?.forget?.(mediaId, key);', '']]
    : []),
]);
fileSwaps('g03r2-mask-draft', /mask\/mask-draft\.ts$/, [
  ...(MUT.draftCas
    ? [
        [
          'if (paintSignature(was.strokes, was.words) !== pressed.paint || was.sent !== pressed.sent)\n    return false;',
          '',
        ],
      ]
    : []),
  ...(MUT.saveSilent
    ? [['  } catch {\n    return false;\n  }', '  } catch {\n    return true;\n  }']]
    : []),
]);
fileSwaps('g03r2-orientation', /mask\/orientation\.ts$/, [
  ...(MUT.exifParse ? [["const little = order === 'II';", 'const little = true;']] : []),
  ...(MUT.exifMoves
    ? [['orientation >= 2 && orientation <= 8;', 'orientation >= 5 && orientation <= 8;']]
    : []),
]);
fileSwaps(
  'g03r2-run-words',
  /generation\/run-state\.ts$/,
  MUT.waitingWords
    ? [["  paid_collect_waiting: 'already paid, waiting to collect the result',\n", '']]
    : [],
);
fileSwaps('g03r2-ledger-freed', /render\/run-ledger\.ts$/, [
  ...(MUT.ledgerFreed ? [['    freed = true;\n', '']] : []),
  ...(MUT.settleAnyId ? [['if (!found || found.id !== id)', 'if (!found)']] : []),
  ...(MUT.ledgerStoredLie
    ? [['  } catch {\n    return false;\n  }', '  } catch {\n    return true;\n  }']]
    : []),
]);
fileSwaps(
  'g03r3-orientation-deadline',
  /mask\/orientation\.ts$/,
  MUT.orientationHang ? [['        }, deadlineMs);', '        }, 1e9);']] : [],
);
fileSwaps(
  'g03-canvas-cap',
  /mask\/geometry\.ts$/,
  MUT.canvasCap ? [['  width * height <= MASK_MAX_AREA;', '  true;']] : [],
);
fileSwaps(
  'g03-ideas-first-ref',
  /tiles\/create-edit\.tsx$/,
  MUT.ideasFirstRef
    ? [['ideaMediaIds(...imagesOf(draft, REFS))', 'ideaMediaIds(imagesOf(draft, REFS)[0])']]
    : [],
);
fileSwaps(
  'g03-recent-kind',
  /playground\/card-recent\.ts$/,
  MUT.recentKind
    ? [
        [
          "if ((workflowOfRun(run) ?? '') !== workflowKey) continue;",
          "if ((run.kind === 'inpaint' ? null : workflowOfRun(run) ?? '') !== workflowKey) continue;",
        ],
      ]
    : [],
);
fileSwaps(
  'g03-unconfirmed-words',
  /generation\/run-state\.ts$/,
  MUT.unconfirmedWords
    ? [
        [
          `  submit_unconfirmed:
    'the provider did not confirm the request; it may have been charged; this run is not retried automatically',`,
          '',
        ],
      ]
    : [],
);
fileSwaps(
  'g03-exif-blind',
  RETOUCH,
  MUT.exifBlind
    ? [['const turned = orientationRefusal(input.orientation);\n  if (turned) return turned;', '']]
    : [],
);

const outfile = resolve(tmpdir(), `playground-registry-probe-${process.pid}.mjs`);
try {
  await esbuild({
    entryPoints: [resolve(HERE, 'playground-registry-entry.tsx')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    // react-dom/server is CommonJS and requires node built-ins; an ESM bundle needs a real `require`.
    banner: {
      js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    },
    absWorkingDir: REPO,
    outfile,
    logLevel: 'silent',
    plugins,
    loader: { '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.css': 'empty' },
    define: { 'import.meta.env': '{"MODE":"probe","DEV":false,"PROD":true,"VITE_SERVER_URL":""}' },
    alias: {
      api: resolve(REPO, 'src/api'),
      components: resolve(REPO, 'src/components'),
      ui: resolve(REPO, 'src/ui'),
      lib: resolve(REPO, 'src/lib'),
      constants: resolve(REPO, 'src/constants'),
      hooks: resolve(REPO, 'src/hooks'),
      utils: resolve(REPO, 'src/utils'),
      types: resolve(REPO, 'src/types'),
      context: resolve(REPO, 'src/context'),
      '@': resolve(REPO, 'src'),
    },
  });
} catch (e) {
  console.log(`ПРОБА НЕ ВЫПОЛНЕНА: сборка упала — ${e.message}`);
  process.exit(2);
}
const M = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

// ─── общие данные ─────────────────────────────────────────────────────────────────────────────
const media = (id) => ({ id, thumbnail: { mediaUrl: `https://x/${id}.jpg` } });
const band = (over = {}) => ({ freeformPresets: ['free', 'cutout'], runs: [], ...over });
const ctx = { band: band() };
const draft = (over = {}) => ({ ...M.EMPTY_DRAFT, ...over });
const def = (key) => M.workflowByKey(key);
const run = (key) => def(key).run;

/** Every field of DesignRunParams, written out by hand — not `emptyParams()`. */
const EMPTY_PARAMS = {
  views: [],
  layout: '',
  colour: undefined,
  threed: undefined,
  fixTarget: '',
  extraInputMediaIds: [],
  fixTargets: [],
  fixSlotIds: [],
  autoSplit: false,
  detailSlotIds: [],
  pattern: undefined,
  useFlatSlots: false,
  colorwayId: 0,
  flatSlotIds: [],
  freeform: undefined,
  // Phase-2 per-run engine (P-04): the playground tiles of phase 1 do not state it, so it never
  // reaches the wire — `same()` compares the JSON the request becomes.
  image: undefined,
};
const same = (got, want) =>
  isDeepStrictEqual(JSON.parse(JSON.stringify(got)), JSON.parse(JSON.stringify(want)));
const show = (x) => JSON.stringify(x);

// ─── A · wire() ───────────────────────────────────────────────────────────────────────────────
head('A', 'wire(): тело, которое уезжает, на заполненный черновик');
{
  const d = draft({
    images: { photos: [media(11), media(12), media(11), media(0)] },
    texts: { garment: '  The cropped denim jacket  ' },
    colours: { colour: { code: '19-4052 TCX', hex: '#0f4c81' } },
  });
  const got = run('change_color').wire(d, ctx);
  const want = {
    kind: 'recolor',
    ask: 'The cropped denim jacket',
    params: {
      ...EMPTY_PARAMS,
      extraInputMediaIds: [11, 12],
      colour: {
        colourMaps: [],
        source: 'dictionary',
        code: '19-4052 TCX',
        hex: '#0f4c81',
        // 20-PROMPTS §3.7: the swatch's name travels beside the code.
        words: 'Classic Blue',
        fabricMediaId: 0,
        fabrics: [],
      },
    },
  };
  ck(
    same(got, want),
    'change_color → recolor: фото без повторов и нулей, слова обрезаны, Pantone со своим hex и именем, colorwayId 0',
    show(got),
  );

  const half = run('change_color').wire(
    draft({
      images: { photos: [media(11)] },
      colours: { colour: { code: '19-4052 TCX', hex: '#0f4c8' } },
    }),
    ctx,
  );
  ck(
    half.params.colour?.hex === '' && half.params.colour?.code === '19-4052 TCX',
    'change_color: полунабранный hex не уезжает, код остаётся',
    show(half.params.colour),
  );
}
{
  const got = run('remove_background').wire(
    draft({ images: { image: [media(21)] }, texts: { stray: 'words' } }),
    ctx,
  );
  const want = { kind: 'cutout', ask: '', params: { ...EMPTY_PARAMS, extraInputMediaIds: [21] } };
  ck(
    same(got, want),
    'remove_background → cutout: одна картинка и ничего больше, без слов',
    show(got),
  );
}
{
  const got = run('create_edit').wire(
    draft({
      texts: { prompt: '  add sunglasses  ' },
      images: { refs: [media(31), media(32), media(31), media(33), media(34)] },
    }),
    ctx,
  );
  const item = (mediaId) => ({ mediaId, regions: [], texts: [], role: '' });
  const want = {
    kind: 'freeform',
    ask: 'add sunglasses',
    params: {
      ...EMPTY_PARAMS,
      freeform: { preset: 'free', items: [item(31), item(32), item(33)], options: undefined },
    },
  };
  ck(
    same(got, want),
    'create_edit → freeform/free: слова обрезаны, первые 3 референса без повторов, extraInputMediaIds пуст',
    show(got),
  );
  const long = run('create_edit').wire(
    draft({ texts: { prompt: 'x'.repeat(4100) }, images: { refs: [media(31)] } }),
    ctx,
  );
  ck(
    long.ask.length === 4000,
    'create_edit: ask срезан по потолку двери 4000',
    `длина ${long.ask.length}`,
  );
}

// ─── B · validate() ───────────────────────────────────────────────────────────────────────────
head('B', 'validate(): отказы до денег');
const PANTONE = { colour: { code: '19-4052 TCX', hex: '#0f4c81' } };
const photos = (n) => Array.from({ length: n }, (_, i) => media(100 + i));
{
  const v = (d) => run('change_color').validate(d, ctx);
  const none = v(draft({ colours: PANTONE }));
  ck(none?.section === 'photos', 'change_color: нет фото → отказ на секции photos', show(none));
  const over = v(draft({ images: { photos: photos(25) }, colours: PANTONE }));
  ck(
    over?.section === 'photos' && /24/.test(over.reason),
    'change_color: 25 фото → отказ, называет 24',
    show(over),
  );
  const cap = v(draft({ images: { photos: photos(24) }, colours: PANTONE }));
  ck(cap === null, 'change_color: ровно 24 фото проходят', show(cap));
  const noColour = v(draft({ images: { photos: photos(1) } }));
  ck(
    noColour?.section === 'colour',
    'change_color: нет Pantone → отказ на секции colour',
    show(noColour),
  );
  const ok = v(draft({ images: { photos: photos(2) }, colours: PANTONE }));
  ck(ok === null, 'change_color: заполненный черновик проходит', show(ok));
}
{
  const v = (d) => run('create_edit').validate(d, ctx);
  const empty = v(draft({ texts: { prompt: '   ' }, images: { refs: [media(31)] } }));
  ck(
    empty?.section === 'prompt',
    'create_edit: пустой (пробелы) промпт → отказ на секции prompt',
    show(empty),
  );
  const noRefs = v(draft({ texts: { prompt: 'add sunglasses' } }));
  ck(noRefs?.section === 'refs', 'create_edit: 0 референсов → отказ на секции refs', show(noRefs));
  const ok = v(draft({ texts: { prompt: 'add sunglasses' }, images: { refs: [media(31)] } }));
  ck(ok === null, 'create_edit: заполненный черновик проходит', show(ok));
}
{
  const v = (d) => run('remove_background').validate(d, ctx);
  ck(v(draft())?.section === 'image', 'remove_background: нет картинки → отказ на секции image');
  ck(
    v(draft({ images: { image: [media(21)] } })) === null,
    'remove_background: одна картинка проходит',
  );
}

// ─── C · legacyStep ───────────────────────────────────────────────────────────────────────────
head('C', "legacyStep('aside') — старый адрес ON MODEL");
{
  const got = M.legacyStep('aside');
  ck(
    same(got, { step: 'playground', wf: 'change_color' }),
    "'aside' → playground + change_color",
    show(got),
  );
  ck(M.legacyStep('playground') === null, "'playground' — не старый шаг");
  ck(M.legacyStep(null) === null && M.legacyStep('') === null, 'пустое значение — не старый шаг');
  ck(M.legacyStep('onmodel') === null, "'onmodel' никогда не был шагом адреса");
}

// ─── D · возможности → приглушённые плитки ────────────────────────────────────────────────────
head('D', 'возможности: чего сервер не перечислил, то приглушено и не открывается');
const liveKeys = (markup) =>
  new Set(
    [...markup.matchAll(/data-workflow-tile="([a-z_0-9]+)" data-workflow-live=""/g)].map(
      (m) => m[1],
    ),
  );
const buttons = (markup) => (markup.match(/<button/g) ?? []).length;
const shapes = [
  ['freeformPresets отсутствует', band({ freeformPresets: undefined }), ['change_color']],
  ["без 'cutout'", band({ freeformPresets: ['free'] }), ['change_color', 'create_edit']],
  ["без 'free'", band({ freeformPresets: ['cutout'] }), ['change_color', 'remove_background']],
  ['пустой список', band({ freeformPresets: [] }), ['change_color']],
  [
    'оба есть',
    band({ freeformPresets: [' free ', 'cutout'] }),
    ['change_color', 'remove_background', 'create_edit'],
  ],
];
for (const [name, b, open] of shapes) {
  const markup = M.gridMarkup(b);
  const live = liveKeys(markup);
  ck(
    same([...live].sort(), [...open].sort()),
    `${name}: живые плитки сетки = ${open.join(', ')}`,
    `живые: ${[...live].join(', ')}`,
  );
  ck(
    buttons(markup) === open.length,
    `${name}: кнопок в сетке ровно ${open.length} (приглушённая — не кнопка)`,
    `кнопок ${buttons(markup)}`,
  );
  for (const key of ['remove_background', 'create_edit']) {
    if (open.includes(key)) continue;
    ck(M.openWorkflow(key, b) === null, `${name}: адрес ?wf=${key} не открывает форму`);
    ck(M.playgroundHistoryMatch(key, b) === null, `${name}: история под ?wf=${key} не сужается`);
  }
}
{
  const markup = M.gridMarkup(band({ freeformPresets: undefined }));
  ck(/not on this server yet/.test(markup), 'приглушённая плитка говорит причину словами');
  const b = band();
  const m1 = M.playgroundHistoryMatch('create_edit', b);
  const m2 = M.playgroundHistoryMatch(' create_edit ', band());
  ck(
    typeof m1 === 'function' && m1 === m2,
    'матчер открытой плитки — одна и та же ссылка при каждом вызове',
  );
  ck(
    M.playgroundHistoryMatch(null, b) === null && M.playgroundHistoryMatch('', b) === null,
    'на сетке матчера нет (studio-tab берёт комнату)',
  );
  ck(
    M.playgroundHistoryMatch('virtual_try_on', b) === null,
    'приглушённая «not on this server yet» плитка не сужает историю',
  );
  const runs = [
    { kind: 'recolor', params: {} },
    { kind: 'cutout', params: {} },
    { kind: 'freeform', params: { freeform: { preset: 'free' } } },
    { kind: 'freeform', params: { freeform: { preset: 'add_hardware' } } },
    { kind: 'render', params: {} },
  ];
  const pick = (key) =>
    runs
      .filter(M.playgroundHistoryMatch(key, b))
      .map((r) => `${r.kind}/${r.params.freeform?.preset ?? ''}`);
  ck(
    same(pick('change_color'), ['recolor/']),
    'история change_color — только recolor',
    show(pick('change_color')),
  );
  ck(
    same(pick('remove_background'), ['cutout/']),
    'история remove_background — только cutout',
    show(pick('remove_background')),
  );
  ck(
    same(pick('create_edit'), ['freeform/free', 'freeform/add_hardware']),
    'история create_edit — каждый freeform, и свободный, и отставленного пресета (Q17)',
    show(pick('create_edit')),
  );
  // G-01 m-3: один и тот же прогон заглушкой (страница ещё не пришла) и целиком (пришла) —
  // одинаково свой, иначе оплаченная картинка уходит с плитки, пока лента листается.
  const stub = { id: 9, kind: 'freeform' };
  const loaded = { id: 9, kind: 'freeform', params: { freeform: { preset: 'add_hardware' } } };
  const m = M.playgroundHistoryMatch('create_edit', b);
  ck(
    m(stub) === true && m(loaded) === true,
    'create_edit: заглушка и загруженный прогон — оба свои',
  );
}

// ─── E · рекол ────────────────────────────────────────────────────────────────────────────────
head('E', 'рекол: прогон → плитка, и честные слова там, где плитки нет');
{
  ck(M.workflowOfRun({ kind: 'recolor' }) === 'change_color', 'recolor → change_color');
  ck(M.workflowOfRun({ kind: 'cutout' }) === 'remove_background', 'cutout → remove_background');
  ck(M.workflowOfRun({ kind: ' Freeform ' }) === 'create_edit', 'freeform → create_edit');
  // C-12: a 3D run is tile 12's (its recall opens Image to 3D); render / vector are no tile's.
  ck(M.workflowOfRun({ kind: ' Threed ' }) === 'image_to_3d', 'threed → image_to_3d');
  ck(
    M.workflowOfRun({ kind: 'render' }) === null && M.workflowOfRun({ kind: 'vector' }) === null,
    'render / vector → не плитка',
  );

  const byId = new Map([
    [11, media(11)],
    [31, media(31)],
  ]);
  const rc = run('change_color').recall(
    {
      kind: 'recolor',
      ask: ' jacket ',
      params: { extraInputMediaIds: [11, 12], colour: { code: '19-4052 TCX', hex: '#0f4c81' } },
    },
    byId,
  );
  ck(
    same(
      rc.draft.images.photos.map((m) => m.id),
      [11],
    ) &&
      rc.lost === 1 &&
      rc.draft.texts.garment === 'jacket' &&
      rc.draft.colours.colour.code === '19-4052 TCX',
    'recolor → черновик change_color: фото, слова, Pantone; пропавшее фото посчитано',
    show({ ...rc, draft: { ...rc.draft, images: undefined } }),
  );

  const free = run('create_edit').recall(
    {
      kind: 'freeform',
      ask: 'add sunglasses',
      params: { freeform: { preset: 'free', items: [{ mediaId: 31, regions: [] }] } },
    },
    byId,
  );
  ck(
    free.said.length === 0 &&
      free.draft.texts.prompt === 'add sunglasses' &&
      free.draft.images.refs.length === 1,
    'freeform free → create_edit без оговорок',
    show(free.said),
  );

  let hw;
  let threw = '';
  try {
    hw = run(M.workflowOfRun({ kind: 'freeform' })).recall(
      {
        kind: 'freeform',
        ask: 'brass snaps',
        params: {
          freeform: { preset: 'add_hardware', items: [{ mediaId: 31, regions: [{ points: [] }] }] },
        },
      },
      byId,
    );
  } catch (e) {
    threw = e.message;
  }
  ck(!threw, 'freeform add_hardware: рекол не падает', threw);
  ck(
    !!hw && hw.said.some((s) => /add hardware/.test(s) && /not a workflow any more/.test(s)),
    'freeform add_hardware: говорит, что «add hardware» больше не плитка',
    show(hw?.said),
  );
  ck(
    !!hw && hw.said.some((s) => /marked areas/.test(s)),
    'freeform add_hardware: говорит, что размеченные области не приехали',
    show(hw?.said),
  );
  ck(
    !!hw && hw.draft.texts.prompt === 'brass snaps' && hw.draft.images.refs.length === 1,
    'freeform add_hardware: слова и картинка разложены в create_edit',
  );
}

// ─── F · ворота фазы 2 ────────────────────────────────────────────────────────────────────────
head('F', 'ворота фазы 2: playgroundWorkflows решает, freeformPresets не читается');
{
  const ALL = [
    'virtual_try_on',
    'fabric_to_image',
    'ghost_mannequin',
    'change_color',
    'swap_fabrics',
    'add_logo',
    'design_variations',
    'remove_background',
    'extend_image',
    'retouch_zone',
    'create_edit',
    'image_to_3d',
  ];
  const cases = [
    // freeformPresets говорит «free, cutout», новый список — только create_edit: решает список.
    [
      'список [create_edit] при freeformPresets free+cutout',
      band({ playgroundWorkflows: ['create_edit'] }),
      ['create_edit'],
    ],
    ['пустой список гасит все три плитки фазы 1', band({ playgroundWorkflows: [] }), []],
    // freeformPresets НЕТ (старый ключ сервер мог бы и не слать) — список всё равно открывает.
    [
      'список всех двенадцати, freeformPresets нет',
      band({
        playgroundWorkflows: ALL,
        freeformPresets: undefined,
        threedOptions: ['texture', 'pbr', 'quality'],
      }),
      // C-12: every tile built in phase 2 is live — written out by hand, so a tile that loses its
      // `run` turns this red; only Extend (phase 3) stays dimmed.
      [
        'virtual_try_on',
        'fabric_to_image',
        'ghost_mannequin',
        'change_color',
        'swap_fabrics',
        'add_logo',
        'design_variations',
        'remove_background',
        'retouch_zone',
        'create_edit',
        'image_to_3d',
      ],
    ],
    [
      // Tile 12 also waits for threed_options (C-10): listed without them, it alone stays dimmed.
      'список всех двенадцати без threed_options: 3D приглушён, остальные живы',
      band({ playgroundWorkflows: ALL, freeformPresets: undefined }),
      [
        'virtual_try_on',
        'fabric_to_image',
        'ghost_mannequin',
        'change_color',
        'swap_fabrics',
        'add_logo',
        'design_variations',
        'remove_background',
        'retouch_zone',
        'create_edit',
      ],
    ],
    [
      'список [change_color, remove_background]',
      band({ playgroundWorkflows: [' change_color ', 'remove_background'] }),
      ['change_color', 'remove_background'],
    ],
  ];
  for (const [name, b, open] of cases) {
    const live = liveKeys(M.gridMarkup(b));
    ck(
      same([...live].sort(), [...open].sort()),
      `${name}: живые = ${open.join(', ') || 'ни одной'}`,
      `живые: ${[...live].join(', ')}`,
    );
  }
  const off = band({ playgroundWorkflows: ['create_edit'] });
  ck(
    /not wired on this server/.test(M.gridMarkup(off)),
    'ключа нет в списке → плитка говорит «not wired on this server»',
  );
  ck(
    M.openWorkflow('remove_background', off) === null,
    'не перечисленная remove_background не открывается по адресу',
  );
  const w = (b, k) => M.workflowOffered(b, k);
  ck(
    same(w(band(), 'virtual_try_on'), { available: false, reason: 'not on this server yet' }),
    'workflowOffered: списка нет → «not on this server yet» (откат)',
    show(w(band(), 'virtual_try_on')),
  );
  ck(
    same(w(band({ playgroundWorkflows: ['create_edit'] }), 'add_logo'), {
      available: false,
      reason: 'not wired on this server',
    }),
    'workflowOffered: ключа нет → «not wired on this server»',
  );
  ck(
    w(band({ playgroundWorkflows: ['add_logo'], freeformPresets: [] }), 'add_logo').available ===
      true,
    'workflowOffered: ключ есть → доступно, пустой freeformPresets не мешает',
  );
}

// ─── G · params.image ─────────────────────────────────────────────────────────────────────────
head('G', 'params.image: тело движка, старый сервер, плитка без пикера');
const GPT2 = 'openai/gpt-image-2';
const GPT25 = 'openai/gpt-image-2.5-sunburst';
const RATIOS = ['auto', '9:16', '1:1', '3:4', '2:3', '16:9', '4:3', '3:2', '21:9'];
const MODELS = [
  {
    slug: GPT2,
    label: 'GPT Image 2',
    aspectRatios: RATIOS,
    qualities: ['low', 'medium', 'high'],
    isDefault: true,
    maxReferences: 16,
    backgrounds: [],
  },
  {
    slug: GPT25,
    label: 'GPT Image 2.5',
    aspectRatios: RATIOS,
    qualities: ['low', 'medium', 'high'],
    isDefault: false,
    maxReferences: 16,
    backgrounds: ['transparent'],
  },
];
const newBand = (over = {}) =>
  band({ playgroundWorkflows: ['create_edit'], imageModels: MODELS, ...over });
const ce = () => run('create_edit');
const fresh = () => ({
  ...M.initialDraft(ce()),
  texts: { prompt: ' a red coat on a white ground ' },
});
{
  const b = newBand();
  const got = ce().wire(
    {
      ...fresh(b),
      choices: { engine: GPT25, 'engine.quality': 'high', format: '16:9' },
      flags: { background: true },
    },
    { band: b },
  );
  const want = {
    kind: 'freeform',
    ask: 'a red coat on a white ground',
    params: {
      ...EMPTY_PARAMS,
      freeform: { preset: 'free', items: [], options: undefined },
      image: { model: GPT25, quality: 'high', aspectRatio: '16:9', background: 'transparent' },
    },
  };
  ck(
    same(got, want),
    'create_edit, новый сервер: 2.5 · high · 16:9 · transparent, без референсов — тело целиком',
    show(got),
  );

  const def0 = ce().wire(fresh(b), { band: b });
  ck(
    same(def0.params.image, { model: GPT2, quality: 'medium', aspectRatio: '2:3', background: '' }),
    'свежий черновик: модель по умолчанию (isDefault), medium, 2:3 — как в шапках',
    show(def0.params.image),
  );
  const auto = ce().wire({ ...fresh(b), choices: { format: 'auto' } }, { band: b });
  ck(auto.params.image?.aspectRatio === '', "формат auto уезжает как ''", show(auto.params.image));
  const noBg = ce().wire(
    { ...fresh(b), choices: { engine: GPT2 }, flags: { background: true } },
    { band: b },
  );
  ck(
    noBg.params.image?.background === '',
    'флаг фона у модели без transparent не уезжает',
    show(noBg.params.image),
  );
  const gone = ce().wire({ ...fresh(b), choices: { engine: 'openai/retired' } }, { band: b });
  ck(
    gone.params.image?.model === GPT2,
    'снятая с сервера модель читается как модель по умолчанию',
    show(gone.params.image),
  );

  ck(
    ce().validate(fresh(b), { band: b }) === null,
    'новый сервер: промпт без референсов проходит (текст → картинка)',
  );
}
{
  const choices = { engine: GPT25, 'engine.quality': 'high', format: '16:9' };
  for (const [name, b] of [
    ['imageModels нет', band({ playgroundWorkflows: ['create_edit'] })],
    ['imageModels пуст', band({ playgroundWorkflows: ['create_edit'], imageModels: [] })],
    ['старый сервер целиком', band()],
  ]) {
    const got = ce().wire({ ...fresh(b), choices, images: { refs: [media(31)] } }, { band: b });
    ck(got.params.image === undefined, `${name}: params.image не уезжает`, show(got.params.image));
  }
  const old = band();
  const v = ce().validate(fresh(old), { band: old });
  ck(
    v?.section === 'refs',
    'старый сервер: 0 референсов → отказ на секции refs (дверь фазы 1)',
    show(v),
  );
}
{
  // Плитка без пикера (D6: 2, 3) — через тот же imageOptionsOf.
  const b = newBand();
  const F11 = M.formatSection({ initial: '1:1' }).field;
  const one = M.imageOptionsOf(
    b,
    { ...M.EMPTY_DRAFT, choices: { format: '1:1' } },
    { format: F11 },
  );
  ck(
    same(one, { model: GPT2, quality: '', aspectRatio: '1:1', background: '' }),
    "без пикера, 1:1: модель по умолчанию, quality '' (тир развёртывания), 1:1",
    show(one),
  );
  const none = M.imageOptionsOf(
    b,
    { ...M.EMPTY_DRAFT, choices: { format: 'auto' } },
    { format: F11 },
  );
  ck(none === undefined, 'без пикера, auto: блок не уезжает вовсе (сказать нечего)', show(none));
  ck(
    M.imageOptionsOf(band(), { ...M.EMPTY_DRAFT, choices: { format: '1:1' } }, { format: F11 }) ===
      undefined,
    'без пикера, старый сервер: блок не уезжает',
  );
}

// ─── H · защёлкивание ─────────────────────────────────────────────────────────────────────────
head('H', 'формат защёлкивается к модели; уровень переносится; строка шапки');
{
  const NARROW = {
    slug: 'x/narrow',
    label: 'Narrow',
    aspectRatios: ['auto', '1:1', '9:16', '16:9'],
    qualities: ['low', 'medium'],
    isDefault: false,
  };
  const b = newBand({ imageModels: [...MODELS, NARROW] });
  const sections = ce().sections;
  const start = { ...fresh(b), choices: { format: '2:3', engine: GPT2, 'engine.quality': 'high' } };
  const next = M.chooseEngine(start, b, sections, 'engine', 'x/narrow');
  ck(
    next.choices.format === '9:16',
    'смена на модель без 2:3 → формат 9:16 (ближайшая форма)',
    show(next.choices),
  );
  ck(
    next.choices['engine.quality'] === 'medium',
    'high нет у новой модели → medium',
    show(next.choices),
  );
  const wire = ce().wire(next, { band: b });
  ck(
    same(wire.params.image, {
      model: 'x/narrow',
      quality: 'medium',
      aspectRatio: '9:16',
      background: '',
    }),
    'после смены тело говорит то же, что форма',
    show(wire.params.image),
  );
  const back = M.chooseEngine(
    { ...start, choices: { ...start.choices, engine: GPT25 } },
    b,
    sections,
    'engine',
    GPT2,
  );
  ck(
    back.choices['engine.quality'] === 'high' && back.choices.format === '2:3',
    'уровень и формат, которые есть у новой модели, остаются',
    show(back.choices),
  );
  const autoKeep = M.chooseEngine(
    { ...start, choices: { format: 'auto' } },
    b,
    sections,
    'engine',
    'x/narrow',
  );
  ck(
    autoKeep.choices.format === 'auto',
    'auto остаётся auto, если модель его делает',
    show(autoKeep.choices),
  );

  // Начальный 4:5 у модели без 4:5: сетка, шапка и провод — одно значение.
  const F45 = M.formatSection({ initial: '4:5' }).field;
  const d45 = { ...M.EMPTY_DRAFT };
  ck(
    M.formatOf(b, d45, F45) === '3:4',
    'начальный 4:5 у GPT Image 2 читается как 3:4',
    M.formatOf(b, d45, F45),
  );
  const img = M.imageOptionsOf(b, d45, { engine: 'engine', format: F45 });
  ck(img?.aspectRatio === '3:4', '…и уезжает как 3:4', show(img));
  ck(
    M.formatOf(band(), d45, F45) === '4:5',
    'без моделей формат не трогается (не к чему защёлкивать)',
  );

  ck(
    M.engineSummary(b, fresh(b), 'engine') === 'GPT Image 2 · medium',
    'шапка свежего черновика: «GPT Image 2 · medium»',
    M.engineSummary(b, fresh(b), 'engine'),
  );
  ck(
    M.engineSummary(
      b,
      { ...M.EMPTY_DRAFT, choices: { engine: GPT25, 'engine.quality': 'high' } },
      'engine',
    ) === 'GPT Image 2.5 · high',
    'шапка после выбора: «GPT Image 2.5 · high»',
  );
  ck(M.engineSummary(band(), fresh(b), 'engine') === '—', 'без моделей шапка — прочерк');
  // Сетка рисует то, что делает ХОТЬ ОДНА модель сервера: 4:5 и 5:4 не делает ни одна GPT Image.
  const drawn = M.drawnRatios(newBand(), F45);
  ck(
    !drawn.includes('4:5') &&
      !drawn.includes('5:4') &&
      drawn.includes('21:9') &&
      drawn[0] === 'auto',
    'сетка на сервере с GPT Image: без 4:5 и 5:4, порядок владельца',
    show(drawn),
  );
  const withNarrow = M.drawnRatios(b, F45);
  ck(
    same(withNarrow, drawn),
    'сетка не зависит от выбранной модели (объединение по серверу)',
    show(withNarrow),
  );
  ck(
    M.drawnRatios(band(), F45).length === 11,
    'без моделей — полный список поля',
    show(M.drawnRatios(band(), F45)),
  );
}

// ─── I · разметка формы ───────────────────────────────────────────────────────────────────────
head('I', 'форма create_edit: секции AI model и Format только на сервере с моделями');
{
  const neu = M.panelMarkup(newBand(), 'create_edit');
  ck(
    /data-fold-section="create_edit\.engine-section"/.test(neu),
    'новый сервер: секция AI model есть',
  );
  ck(/GPT Image 2 · medium/.test(neu), 'новый сервер: её шапка «GPT Image 2 · medium»');
  ck(
    /data-fold-section="create_edit\.format-section"/.test(neu),
    'новый сервер: секция Format есть',
  );
  const values = [...neu.matchAll(/data-fold-value="">([^<]*)</g)].map((m) => m[1]);
  ck(
    values.includes('GPT Image 2 · medium') && values.includes('2:3'),
    'новый сервер: шапки свёрнутых секций — «GPT Image 2 · medium» и «2:3»',
    show(values),
  );
  ck(!/needs at least one/.test(neu), 'новый сервер: строки «needs at least one» нет');
  const old = M.panelMarkup(band(), 'create_edit');
  ck(old.length > 0, 'старый сервер: форма нарисована', `${old.length} символов`);
  ck(!/engine-section|format-section/.test(old), 'старый сервер: ни AI model, ни Format');
  ck(/needs at least one/.test(old), 'старый сервер: строка «needs at least one» есть');
  const noModels = M.panelMarkup(band({ playgroundWorkflows: ['create_edit'] }), 'create_edit');
  ck(
    !/engine-section|format-section/.test(noModels) && !/needs at least one/.test(noModels),
    'список есть, моделей нет: без AI model/Format, но и без «needs at least one» (текст → картинка)',
  );
}

// ─── J · C-07: тела пяти плиток ───────────────────────────────────────────────────────────────
head('J', 'C-07 wire(): тела плиток 2, 3, 5, 6, 7 целиком');
const FIVE = [
  'fabric_to_image',
  'ghost_mannequin',
  'swap_fabrics',
  'add_logo',
  'design_variations',
];
const c07Band = (over = {}) =>
  band({ playgroundWorkflows: [...FIVE, 'create_edit'], imageModels: MODELS, ...over });
const fresh7 = (key, over = {}) => ({ ...M.initialDraft(run(key)), ...over });
const item0 = (mediaId, role = '') => ({ mediaId, regions: [], texts: [], role });
const OPTIONS0 = {
  framing: '',
  angle: '',
  sceneMode: '',
  sceneText: '',
  modelId: 0,
  productColorwayId: 0,
  logoSize: '',
  creativity: 0,
};
const SHELF = {
  id: 7,
  kind: 'pattern',
  name: 'Stripe 40',
  mediaId: 53,
  media: media(53),
  colourCode: '',
  colourHex: '',
  note: '',
  repeatMm: 40,
};
const cloth = (over) => ({
  mapHex: '',
  assetId: 0,
  name: 'fabric',
  mediaId: 0,
  colourCode: '',
  colourHex: '',
  words: '',
  parts: '',
  kind: '',
  repeatMm: 0,
  ...over,
});
const recolour = (fabric) => ({
  colourMaps: [],
  source: 'photo',
  code: '',
  hex: '',
  words: '',
  fabricMediaId: fabric.mediaId,
  fabrics: [fabric],
});
const W = {};
{
  const b = c07Band();
  const d = fresh7('fabric_to_image', {
    images: { image: [media(41), media(42)] },
    texts: { region: '  the pleated skirt ' },
  });
  W.fabric = { d, w: run('fabric_to_image').wire(d, { band: b }) };
  ck(
    same(W.fabric.w, {
      kind: 'freeform',
      ask: 'the pleated skirt',
      params: {
        ...EMPTY_PARAMS,
        freeform: { preset: 'fabric_extract', items: [item0(41)], options: undefined },
        image: { model: GPT2, quality: '', aspectRatio: '9:16', background: '' },
      },
    }),
    'fabric_to_image → freeform/fabric_extract: одна картинка, role "", модель по умолчанию, 9:16 (4.png, G-02 m-6)',
    show(W.fabric.w),
  );
  const old = run('fabric_to_image').wire(d, { band: band({ playgroundWorkflows: FIVE }) });
  ck(old.params.image === undefined, 'fabric_to_image без моделей: image не уезжает', show(old));
  const auto = run('fabric_to_image').wire({ ...d, choices: { format: 'auto' } }, { band: b });
  ck(auto.params.image === undefined, 'fabric_to_image, auto: блока image нет', show(auto));
}
{
  const b = c07Band();
  const d = fresh7('ghost_mannequin', {
    images: { image: [media(43)] },
    texts: { garment: ' the cropped denim jacket ' },
  });
  W.ghost = { d, w: run('ghost_mannequin').wire(d, { band: b }) };
  ck(
    same(W.ghost.w, {
      kind: 'freeform',
      ask: 'the cropped denim jacket',
      params: {
        ...EMPTY_PARAMS,
        freeform: { preset: 'ghost_mannequin', items: [item0(43)], options: undefined },
        image: { model: GPT2, quality: '', aspectRatio: '2:3', background: '' },
      },
    }),
    'ghost_mannequin → freeform/ghost_mannequin: одна картинка, модель по умолчанию, 2:3',
    show(W.ghost.w),
  );
}
{
  const b = c07Band();
  const d = fresh7('swap_fabrics', {
    slots: { images: { design: media(51), fabric: media(52) } },
    texts: { garment: ' the jacket body ' },
  });
  W.swap = { d, w: run('swap_fabrics').wire(d, { band: b }) };
  ck(
    same(W.swap.w, {
      kind: 'recolor',
      ask: 'the jacket body',
      params: {
        ...EMPTY_PARAMS,
        extraInputMediaIds: [51],
        colour: recolour(cloth({ mediaId: 52 })),
      },
    }),
    'swap_fabrics → recolor: дизайн в extraInputMediaIds, ткань в fabrics[] И эхом в fabricMediaId, цвета нет',
    show(W.swap.w),
  );
  const shelf = c07Band({ assets: [SHELF] });
  const ds = { ...d, slots: { images: { design: media(51), fabric: media(53) } } };
  W.swapShelf = { d: ds, w: run('swap_fabrics').wire(ds, { band: shelf }), band: shelf };
  ck(
    same(
      W.swapShelf.w.params.colour,
      recolour(
        cloth({ assetId: 7, name: 'Stripe 40', mediaId: 53, kind: 'pattern', repeatMm: 40 }),
      ),
    ),
    'swap_fabrics, ткань с полки: строка полки (asset 7, имя, род, раппорт) и эхо 53',
    show(W.swapShelf.w.params.colour),
  );
  ck(
    /re-clothed in Stripe 40/.test(run('swap_fabrics').shape(ds, W.swapShelf.w)),
    'swap_fabrics: строка у кнопки читается с тела — «re-clothed in Stripe 40»',
    run('swap_fabrics').shape(ds, W.swapShelf.w),
  );
}
{
  const b = c07Band();
  const d = fresh7('add_logo', {
    slots: { images: { garment: media(61), logo: media(62) } },
    texts: { placement: ' on the chest, left side ' },
    choices: { logo_size: 'large' },
  });
  W.logo = { d, w: run('add_logo').wire(d, { band: b }) };
  ck(
    same(W.logo.w, {
      kind: 'freeform',
      ask: 'on the chest, left side',
      params: {
        ...EMPTY_PARAMS,
        freeform: {
          preset: 'add_logo',
          items: [item0(61, 'subject'), item0(62, 'logo')],
          options: { ...OPTIONS0, logoSize: 'large' },
        },
      },
    }),
    'add_logo → freeform/add_logo: subject + logo по порядку, logo_size, без image',
    show(W.logo.w),
  );
  const def0 = run('add_logo').wire(fresh7('add_logo'), { band: b });
  ck(
    def0.params.freeform?.options?.logoSize === 'medium',
    'add_logo: размер по умолчанию — medium',
    show(def0.params.freeform?.options),
  );
}
{
  const b = c07Band();
  const d = fresh7('design_variations', {
    images: { image: [media(71)] },
    texts: { variation: ' longer length, relaxed fit ' },
  });
  const w0 = run('design_variations').wire(d, { band: b });
  ck(
    same(w0, {
      kind: 'freeform',
      ask: 'longer length, relaxed fit',
      params: {
        ...EMPTY_PARAMS,
        freeform: { preset: 'variations', items: [item0(71)], options: OPTIONS0 },
        image: { model: GPT2, quality: 'medium', aspectRatio: '2:3', background: '' },
      },
    }),
    'design_variations, свежий черновик: creativity 0 (Off), GPT Image 2 · medium · 2:3',
    show(w0),
  );
  const dh = {
    ...d,
    choices: { ...d.choices, booster: '2', engine: GPT25, 'engine.quality': 'high', format: '3:4' },
  };
  W.vary = { d: dh, w: run('design_variations').wire(dh, { band: b }) };
  ck(
    W.vary.w.params.freeform?.options?.creativity === 2 &&
      same(W.vary.w.params.image, {
        model: GPT25,
        quality: 'high',
        aspectRatio: '3:4',
        background: '',
      }),
    'design_variations: Medium → creativity 2, выбранные модель/качество/формат',
    show(W.vary.w.params),
  );
}

// ─── K · C-07: отказы до денег ────────────────────────────────────────────────────────────────
head('K', 'C-07 validate(): отказы пяти плиток');
{
  const b = c07Band();
  const v = (key, d) => run(key).validate({ ...fresh7(key), ...d }, { band: b });
  for (const key of ['fabric_to_image', 'ghost_mannequin']) {
    ck(v(key, {})?.section === 'image', `${key}: нет картинки → отказ на секции image`);
    ck(
      v(key, { images: { image: [media(41)] } }) === null,
      `${key}: картинка без слов проходит (слова необязательны, как у владельца и у ремесла)`,
    );
  }
  const sw = (slots, texts) => v('swap_fabrics', { slots: { images: slots }, texts });
  ck(sw({})?.section === 'images', 'swap_fabrics: пусто → отказ на секции images');
  ck(
    /new fabric/.test(sw({ design: media(51) })?.reason ?? ''),
    'swap_fabrics: без ткани → «add the new fabric»',
    show(sw({ design: media(51) })),
  );
  ck(
    /your design/.test(sw({ fabric: media(52) })?.reason ?? ''),
    'swap_fabrics: без дизайна → «add your design»',
  );
  ck(
    /same picture/.test(sw({ design: media(51), fabric: media(51) })?.reason ?? ''),
    'swap_fabrics: одна картинка в обоих слотах → отказ (cloth_is_also_a_photograph)',
    show(sw({ design: media(51), fabric: media(51) })),
  );
  ck(
    sw({ design: media(51), fabric: media(52) }) === null,
    'swap_fabrics: дизайн + ткань без слов проходят',
  );
  const lg = (slots, placement) =>
    v('add_logo', { slots: { images: slots }, texts: placement ? { placement } : {} });
  ck(/garment/.test(lg({}, 'chest')?.reason ?? ''), 'add_logo: без вещи → отказ');
  ck(
    /logo/.test(lg({ garment: media(61) }, 'chest')?.reason ?? ''),
    'add_logo: без логотипа → отказ',
  );
  ck(
    /same picture/.test(lg({ garment: media(61), logo: media(61) }, 'chest')?.reason ?? ''),
    'add_logo: одна картинка в обоих слотах → отказ',
  );
  ck(
    lg({ garment: media(61), logo: media(62) }, '  ')?.section === 'placement',
    'add_logo: без места → отказ на секции placement',
  );
  ck(
    lg({ garment: media(61), logo: media(62) }, 'chest') === null,
    'add_logo: заполнено → проходит',
  );
  ck(
    v('design_variations', { texts: { variation: 'x' } })?.section === 'image',
    'design_variations: нет картинки → отказ на секции image',
  );
  ck(
    v('design_variations', { images: { image: [media(71)] } })?.section === 'variation',
    'design_variations: нет слов → отказ на секции variation',
  );
  ck(
    v('design_variations', { images: { image: [media(71)] }, texts: { variation: 'x' } }) === null,
    'design_variations: заполнено → проходит',
  );
}

// ─── L · C-07: ворота ─────────────────────────────────────────────────────────────────────────
head('L', 'C-07 ворота: пять плиток живы ровно по playgroundWorkflows');
{
  const absent = band();
  const live0 = liveKeys(M.gridMarkup(absent));
  ck(
    FIVE.every((k) => !live0.has(k)),
    'списка нет → все пять приглушены',
    [...live0].join(', '),
  );
  for (const k of FIVE) {
    ck(
      same(M.workflowOffered(absent, k), { available: false, reason: 'not on this server yet' }) &&
        M.openWorkflow(k, absent) === null,
      `${k}: списка нет → «not on this server yet», адрес не открывает`,
    );
  }
  const other = band({ playgroundWorkflows: ['create_edit'] });
  const liveO = liveKeys(M.gridMarkup(other));
  ck(
    FIVE.every((k) => !liveO.has(k)),
    'ключей нет в списке → все пять приглушены',
  );
  ck(M.openWorkflow('add_logo', other) === null, 'add_logo не в списке → адрес не открывает');
  const on = band({ playgroundWorkflows: FIVE });
  const liveOn = liveKeys(M.gridMarkup(on));
  ck(
    FIVE.every((k) => liveOn.has(k)) && !liveOn.has('create_edit'),
    'список пяти → живы ровно они (create_edit не в списке — приглушён)',
    [...liveOn].join(', '),
  );
  ck(
    FIVE.every((k) => M.openWorkflow(k, on)?.key === k),
    'список пяти → каждая открывается',
  );
  const half = band({ playgroundWorkflows: ['swap_fabrics'] });
  const liveH = liveKeys(M.gridMarkup(half));
  ck(
    liveH.has('swap_fabrics') && !liveH.has('add_logo'),
    'список [swap_fabrics] → жив только он',
    [...liveH].join(', '),
  );
}

// ─── M · C-07: прогон → плитка ────────────────────────────────────────────────────────────────
head('M', 'C-07 прогон → плитка: правило сервера, штамп заглушки, матчеры');
{
  const ff = (preset) => ({ kind: 'freeform', params: { freeform: { preset } } });
  const rows = [
    [ff('fabric_extract'), 'fabric_to_image'],
    [ff('ghost_mannequin'), 'ghost_mannequin'],
    [ff('add_logo'), 'add_logo'],
    [ff('variations'), 'design_variations'],
    [ff('tryon'), 'virtual_try_on'],
    [ff('retouch'), 'retouch_zone'],
    [ff('free'), 'create_edit'],
    [ff('add_hardware'), 'create_edit'],
    [{ kind: 'recolor', params: { colour: { fabrics: [{ mediaId: 52 }] } } }, 'swap_fabrics'],
    [
      { kind: 'recolor', params: { colour: { fabrics: [{ mediaId: 0 }], code: 'x' } } },
      'change_color',
    ],
    [{ kind: 'recolor', params: {} }, 'change_color'],
  ];
  for (const [r, want] of rows) {
    const got = M.workflowOfRun(r);
    ck(
      got === want,
      `${r.kind}/${r.params.freeform?.preset ?? (r.params.colour ? 'colour' : '')} → ${want}`,
      got,
    );
  }

  const stubBand = band({
    runs: [],
    outputs: [
      {
        picture: { id: 901, runId: 555 },
        runId: 555,
        runKind: 'freeform',
        runWorkflow: 'fabric_to_image',
      },
      { picture: { id: 903, runId: 557 }, runId: 557, runKind: 'freeform', runWorkflow: '' },
      {
        picture: { id: 902, runId: 556 },
        runId: 556,
        runKind: 'recolor',
        runWorkflow: 'swap_fabrics',
      },
      {
        picture: { id: 904, runId: 558 },
        runId: 558,
        runKind: 'recolor',
        runWorkflow: 'change_color',
      },
    ],
  });
  const pg = M.cardOutputRows(stubBand, 'playground') ?? [];
  const om = M.cardOutputRows(stubBand, 'onmodel') ?? [];
  const byRun = (list, id) => list.find((r) => r.run.id === id)?.run;
  const s555 = byRun(pg, 555);
  const s557 = byRun(pg, 557);
  const s556 = byRun(om, 556);
  const s558 = byRun(om, 558);
  ck(
    !!s555 && s555.params === undefined && M.workflowOfRun(s555) === 'fabric_to_image',
    'заглушка вне страницы со штампом fabric_to_image → fabric_to_image',
    show(s555 && M.workflowOfRun(s555)),
  );
  ck(
    !!s557 && M.workflowOfRun(s557) === 'create_edit',
    'заглушка без штампа → create_edit (как в фазе 1)',
  );
  ck(
    !!s556 && M.workflowOfRun(s556) === 'swap_fabrics',
    'заглушка recolor со штампом swap_fabrics → swap_fabrics',
  );
  ck(
    !!s558 && M.workflowOfRun(s558) === 'change_color',
    'заглушка recolor со штампом change_color → change_color',
  );
  ck(
    !!s555 && M.runWorkflowWord(s555) === 'fabric to image',
    'подпись результата на сетке: «fabric to image»',
    s555 && M.runWorkflowWord(s555),
  );

  const loaded555 = {
    id: 555,
    kind: 'freeform',
    params: { freeform: { preset: 'fabric_extract' } },
  };
  const m = (key) => run(key).results.match;
  ck(
    !!s555 && m('fabric_to_image')(s555) && m('fabric_to_image')(loaded555),
    'fabric_to_image: заглушка и загруженный прогон — оба свои (картинка не прыгает при листании)',
  );
  ck(
    !!s555 && !m('create_edit')(s555) && !m('create_edit')(loaded555),
    'create_edit больше не забирает картинки fabric_extract',
  );
  const swapRun = { id: 556, kind: 'recolor', params: { colour: { fabrics: [{ mediaId: 52 }] } } };
  ck(
    m('swap_fabrics')(swapRun) && !m('change_color')(swapRun) && !!s556 && m('swap_fabrics')(s556),
    'swap_fabrics забирает recolor с тканью, change_color — нет',
  );
  const plain = { id: 558, kind: 'recolor', params: { colour: { code: '19-4052 TCX' } } };
  ck(m('change_color')(plain) && !m('swap_fabrics')(plain), 'recolor с Pantone — change_color');
  for (const [key, preset] of [
    ['ghost_mannequin', 'ghost_mannequin'],
    ['add_logo', 'add_logo'],
    ['design_variations', 'variations'],
  ]) {
    const r = ff(preset);
    const owners = FIVE.concat(['create_edit', 'change_color']).filter((k) => m(k)(r));
    ck(same(owners, [key]), `freeform/${preset} — ровно одна плитка: ${key}`, show(owners));
  }
  ck(
    same(run('swap_fabrics').results.reps, ['onmodel']) && run('swap_fabrics').results.selectable,
    'swap_fabrics: результаты — представление onmodel, с отметкой select',
  );
}

// ─── N · C-07: разметка форм ──────────────────────────────────────────────────────────────────
head('N', 'C-07 разметка форм пяти плиток');
{
  const b = c07Band();
  const noModels = band({ playgroundWorkflows: FIVE });
  const values = (markup) => [...markup.matchAll(/data-fold-value="">([^<]*)</g)].map((x) => x[1]);
  const has = (markup, re) => re.test(markup);

  const f = M.panelMarkup(b, 'fabric_to_image');
  ck(
    has(f, /Reference image/) && has(f, />required</i) && has(f, /Fabric pattern to extract from/),
    'fabric_to_image: Reference image (REQUIRED) и «Fabric pattern to extract from»',
  );
  ck(has(f, /placeholder="The pleated skirt"/), 'fabric_to_image: плейсхолдер владельца');
  ck(
    has(f, /fabric_to_image\.format-section/) &&
      values(f).includes('9:16') &&
      !has(f, /engine-section/),
    'fabric_to_image: Format 9:16 в шапке (4.png), без пикера модели (D6)',
    show(values(f)),
  );
  const g = M.panelMarkup(b, 'ghost_mannequin');
  ck(
    has(g, /Image with your garment/) &&
      has(g, /Garment to recreate/) &&
      has(g, /placeholder="The cropped denim jacket"/) &&
      values(g).includes('2:3') &&
      !has(g, /engine-section/),
    'ghost_mannequin: «Image with your garment», «Garment to recreate», Format 2:3, без пикера',
    show(values(g)),
  );
  for (const key of ['fabric_to_image', 'ghost_mannequin', 'design_variations']) {
    const mk = M.panelMarkup(noModels, key);
    ck(
      mk.length > 0 && !has(mk, /format-section|engine-section/),
      `${key}: сервер без моделей — ни Format, ни AI model`,
    );
  }
  const s5 = M.panelMarkup(b, 'swap_fabrics');
  ck(
    has(s5, /data-image-slot="design"/) &&
      has(s5, /Your design/) &&
      has(s5, /data-image-slot="fabric"/) &&
      has(s5, /New fabric/) &&
      has(s5, /Garment to swap fabric on/) &&
      !has(s5, /format-section|engine-section/),
    'swap_fabrics: два слота «Your design» / «New fabric», промпт, без Format и модели',
  );
  const l = M.panelMarkup(b, 'add_logo');
  ck(
    has(l, /Your garment/) &&
      has(l, /Your logo \(PNG\)/) &&
      has(l, /data-option-row="Logo size"/) &&
      has(l, /Logo placement/) &&
      has(l, /placeholder="On the chest, left sleeve, back, hip pocket…"/),
    'add_logo: слоты, строка «Logo size», «Logo placement» с плейсхолдером владельца',
  );
  ck(
    l.indexOf('data-option-row="Logo size"') < l.indexOf('Logo placement'),
    'add_logo: «Logo size» стоит между картинками и местом, как на 9.png',
  );
  const v = M.panelMarkup(b, 'design_variations');
  ck(
    has(v, /Describe the variation/) &&
      has(v, /placeholder="Same jacket, cropped shorter, wider sleeves"/) &&
      has(v, /data-slider="Creative booster"/),
    'design_variations: «Describe the variation» и слайдер Creative booster',
  );
  ck(
    // C-12: the picture section counts its slot («0/1») like every picture section of the room.
    same(values(v), ['0/1', 'Off', 'GPT Image 2 · medium', '2:3']),
    'design_variations: шапки — «0/1», «Off», «GPT Image 2 · medium», «2:3»',
    show(values(v)),
  );
  const v2 = M.panelMarkup(b, 'design_variations', {
    ...fresh7('design_variations'),
    choices: { ...fresh7('design_variations').choices, booster: '3' },
  });
  ck(values(v2)[1] === 'High', 'design_variations: шаг 3 → «High» в шапке', show(values(v2)));
}

// ─── O · C-07: рекол ──────────────────────────────────────────────────────────────────────────
head('O', 'C-07 рекол: тело → черновик → то же тело');
{
  const b = c07Band();
  const all = new Map([41, 43, 51, 52, 53, 61, 62, 71].map((id) => [id, media(id)]));
  const trip = (key, entry, bb = b) => {
    const past = { kind: entry.w.kind, ask: entry.w.ask, params: entry.w.params };
    const back = run(key).recall(past, all);
    const again = run(key).wire(back.draft, { band: bb });
    ck(
      same(again, entry.w) && back.said.length === 0 && back.lost === 0,
      `${key}: рекол собирает то же тело`,
      show({ again, said: back.said }),
    );
  };
  trip('fabric_to_image', W.fabric);
  trip('ghost_mannequin', W.ghost);
  trip('swap_fabrics', W.swap);
  trip('swap_fabrics', W.swapShelf, W.swapShelf.band);
  trip('add_logo', W.logo);
  trip('design_variations', W.vary);

  const bare = run('fabric_to_image').recall(
    {
      kind: 'freeform',
      ask: '',
      params: { freeform: { preset: 'fabric_extract', items: [{ mediaId: 41 }] } },
    },
    all,
  );
  ck(
    bare.draft.choices.format === 'auto',
    'fabric_to_image: прогон без image → формат auto',
    show(bare.draft.choices),
  );
  const multi = run('swap_fabrics').recall(
    {
      kind: 'recolor',
      ask: '',
      params: {
        extraInputMediaIds: [51, 54],
        colour: { code: '19-4052 TCX', fabrics: [{ mediaId: 52 }], fabricMediaId: 52 },
      },
    },
    all,
  );
  ck(
    multi.said.some((x) => /1 more photograph/.test(x)) && multi.said.some((x) => /colour/.test(x)),
    'swap_fabrics: лишние фото и цвет прошлого прогона названы словами',
    show(multi.said),
  );
  ck(
    M.workflowOfRun({ kind: 'recolor', params: { colour: { fabrics: [{ mediaId: 52 }] } } }) ===
      'swap_fabrics',
    'рекол recolor с тканью открывает swap_fabrics',
  );
}

// ─── P · плитка 1 Virtual Try-On (C-09) ──────────────────────────────────────────────────────
head('P', 'virtual_try_on: тело tryon, отказы до денег, ворота, пулы пикеров, рекол, форма');
{
  // Картинка с адресом, как её рисует mediaThumb (media.media.thumbnail).
  const pic = (id) => ({ id, media: { thumbnail: { mediaUrl: `https://x/${id}.jpg` } } });
  const GPT = 'openai/gpt-image-2';
  const tryBand = (over = {}) =>
    band({
      playgroundWorkflows: ['virtual_try_on', 'create_edit'],
      imageModels: [
        {
          slug: GPT,
          label: 'GPT Image 2',
          isDefault: true,
          qualities: ['low', 'medium', 'high'],
          aspectRatios: ['auto', '1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'],
          maxReferences: 16,
          backgrounds: [],
        },
      ],
      // Выходы карточки: рендеры ROSSO (7) и OLIVE (8), рендер без колорвея, скрытый и
      // display-only рендер ROSSO, кроп рендера ROSSO — и вывод freeform (не рендер).
      outputs: [
        {
          runId: 3,
          runKind: 'render',
          picture: { id: 301, kind: 'render', colorwayId: 7, media: pic(31) },
        },
        {
          runId: 3,
          runKind: 'render',
          picture: { id: 302, kind: 'render', colorwayId: 7, media: pic(32) },
        },
        {
          runId: 4,
          runKind: 'render',
          picture: { id: 401, kind: 'render', colorwayId: 8, media: pic(41) },
        },
        {
          runId: 5,
          runKind: 'render',
          picture: { id: 501, kind: 'render', colorwayId: 0, media: pic(51) },
        },
        {
          runId: 3,
          runKind: 'render',
          picture: {
            id: 303,
            kind: 'render',
            colorwayId: 7,
            media: pic(33),
            hiddenAt: { seconds: 1 },
          },
        },
        {
          runId: 3,
          runKind: 'render',
          picture: { id: 304, kind: 'render', colorwayId: 7, media: pic(34), displayOnly: true },
        },
        {
          runId: 6,
          runKind: 'freeform',
          picture: { id: 601, kind: 'freeform', colorwayId: 0, media: pic(61) },
        },
      ],
      // Рендер-верстак ROSSO держит плиту 35 (своя картинка без колорвея — её колорвей скажет слот).
      bench: [
        {
          id: 1,
          kind: 'render',
          colorwayId: 7,
          viewKey: 'front',
          picture: { id: 351, kind: 'render', colorwayId: 0, media: pic(35) },
        },
        {
          id: 2,
          kind: 'flat',
          colorwayId: 0,
          viewKey: 'front',
          picture: { id: 361, kind: 'flat', colorwayId: 0, media: pic(36) },
        },
      ],
      ...over,
    });
  const B = tryBand();
  const tctx = { band: B };
  const r = run('virtual_try_on');
  const filled = (over = {}) =>
    draft({
      ...M.initialDraft(r),
      ...over,
      texts: {
        pose: '  one hand on hip  ',
        scene: '  concrete wall, late sun ',
        ...(over.texts ?? {}),
      },
      images: {
        model_photo: [pic(90)],
        product: [pic(31), pic(35)],
        scene_photo: [pic(77)],
        ...(over.images ?? {}),
      },
      choices: {
        ...M.initialDraft(r).choices,
        model: '12',
        product_colorway: '7',
        framing: 'upper_body',
        angle: 'low_angle',
        ...(over.choices ?? {}),
      },
    });

  // ── wire: тело целиком, написанное руками ──
  const edit = r.wire(filled(), tctx);
  const wantEdit = {
    kind: 'freeform',
    ask: 'one hand on hip',
    params: {
      ...EMPTY_PARAMS,
      freeform: {
        preset: 'tryon',
        items: [
          { mediaId: 90, regions: [], texts: [], role: 'model' },
          { mediaId: 31, regions: [], texts: [], role: 'product' },
          { mediaId: 35, regions: [], texts: [], role: 'product' },
        ],
        options: {
          framing: 'upper_body',
          angle: 'low_angle',
          sceneMode: 'edit',
          sceneText: 'concrete wall, late sun',
          modelId: 12,
          productColorwayId: 7,
          logoSize: '',
          creativity: 0,
        },
      },
      image: { model: GPT, quality: 'medium', aspectRatio: '9:16', background: '' },
    },
  };
  ck(
    same(edit, wantEdit),
    'edit scene: тело tryon целиком (картинка сцены НЕ уезжает)',
    show(edit),
  );
  const ref = r.wire(filled({ choices: { scene_mode: 'reference' } }), tctx);
  ck(
    same(
      ref.params.freeform.items.map((i) => [i.mediaId, i.role]),
      [
        [90, 'model'],
        [31, 'product'],
        [35, 'product'],
        [77, 'scene'],
      ],
    ) && ref.params.freeform.options.sceneMode === 'reference',
    'with reference: сцена последней, role=scene, scene_mode=reference',
    show(ref.params.freeform),
  );
  ck(
    ref.params.extraInputMediaIds.length === 0 && ref.params.colorwayId === 0,
    'extra_input_media_ids пуст (one_list_per_fact), colorway_id 0',
  );
  const old = r.wire(filled(), { band: tryBand({ imageModels: undefined }) });
  ck(
    old.params.image === undefined,
    'без imageModels params.image не уезжает',
    show(old.params.image),
  );
  ck(same(r.shape(filled(), edit), '1 picture'), 'форма покупки: «1 picture»');

  // ── словарь сервера (design_freeform.go: IsDesignFraming / IsDesignAngle) ──
  const FRAMING = [
    'auto',
    'full_body',
    'upper_body',
    'portrait',
    'hands',
    'feet',
    'product_detail',
  ];
  const ANGLE = ['auto', 'eye_level', 'slightly_above', 'slightly_below', 'low_angle'];
  ck(
    same(
      M.FRAMING_OPTIONS.map((o) => o.value),
      FRAMING,
    ),
    'framing: семь слов сервера в порядке владельца',
    show(M.FRAMING_OPTIONS.map((o) => o.value)),
  );
  ck(
    same(
      M.ANGLE_OPTIONS.map((o) => o.value),
      ANGLE,
    ),
    'angle: пять слов сервера',
  );
  ck(
    M.FRAMING_OPTIONS[3].label === 'Portrait – face & neck' &&
      M.ANGLE_OPTIONS[4].label === 'Low angle, from the ground',
    'подписи — слова владельца',
  );

  // ── validate: отказы до денег ──
  const why = (d, b = B) => r.validate(d, { band: b })?.reason ?? null;
  ck(why(filled()) === null, 'заполненный черновик проходит', why(filled()));
  ck(
    /model profile/.test(why(filled({ images: { model_photo: [] } })) ?? ''),
    'нет фото модели → отказ «model profile»',
  );
  ck(
    /model profile/.test(why(filled({ choices: { model: '0' } })) ?? ''),
    'фото без профиля → отказ (model_id обязателен для провенанса)',
  );
  ck(/colourway/.test(why(filled({ images: { product: [] } })) ?? ''), 'нет продукта → отказ');
  ck(
    /at most 4/.test(
      why(
        filled({
          images: { product: [pic(31), pic(32), pic(35), pic(41), pic(51)] },
          choices: { product_colorway: '0' },
        }),
      ) ?? '',
    ),
    'пять продуктов → отказ «at most 4»',
  );
  ck(
    /scene picture/.test(
      why(filled({ choices: { scene_mode: 'reference' }, images: { scene_photo: [] } })) ?? '',
    ),
    'with reference без картинки → отказ',
  );
  ck(
    /used twice/.test(
      why(filled({ choices: { scene_mode: 'reference' }, images: { scene_photo: [pic(90)] } })) ??
        '',
    ),
    'сцена = фото модели → отказ (duplicate_picture)',
  );
  ck(
    why(filled({ images: { scene_photo: [pic(90)] } })) === null,
    'та же картинка в слоте сцены при edit не уезжает — и не отказ',
  );
  ck(
    /no longer a render/.test(why(filled({ images: { product: [pic(41)] } })) ?? ''),
    'рендер OLIVE под колорвеем ROSSO → отказ (product_not_colorway_render)',
  );
  ck(
    why(filled({ images: { product: [pic(51)] }, choices: { product_colorway: '0' } })) === null,
    'колорвей 0 ничего не утверждает → не отказ',
  );

  // ── ворота ──
  const liveNow = (b) => liveKeys(M.gridMarkup(b));
  ck(!liveNow(band()).has('virtual_try_on'), 'списка нет → плитка приглушена (откат)');
  ck(liveNow(B).has('virtual_try_on'), 'в списке → плитка открыта');
  ck(
    !liveNow(band({ playgroundWorkflows: ['create_edit'] })).has('virtual_try_on'),
    'список без ключа → приглушена',
  );

  // ── пулы пикеров ──
  const ids = (list) => list.map((m) => m.id);
  ck(
    same(ids(M.productRendersOf(B, 7)), [35, 31, 32]),
    'рендеры ROSSO: плита верстака, затем выходы; без скрытого, display-only, чужих и не-рендеров',
    show(ids(M.productRendersOf(B, 7))),
  );
  ck(
    same(ids(M.productRendersOf(B, 8)), [41]),
    'рендеры OLIVE: только свой',
    show(ids(M.productRendersOf(B, 8))),
  );
  ck(
    same(ids(M.productRendersOf(B, 0)), [51]),
    'колорвей 0: рендер без колорвея',
    show(ids(M.productRendersOf(B, 0))),
  );
  const cws = M.productColorwaysOf(B, [
    { colorwayId: 7, devName: 'ROSSO' },
    { colorwayId: 8, devName: 'OLIVE' },
    { colorwayId: 9, devName: 'NERO' },
  ]);
  ck(
    same(cws, [
      { id: 0, label: 'sample', renders: 1 },
      { id: 7, label: 'ROSSO', renders: 3 },
      { id: 8, label: 'OLIVE', renders: 1 },
      { id: 9, label: 'NERO', renders: 0 },
    ]),
    'селект колорвеев: sample (есть рендер), колорвеи карточки со счётом',
    show(cws),
  );
  const noSample = M.productColorwaysOf(
    tryBand({ outputs: B.outputs.filter((o) => o.picture.id !== 501) }),
    [],
  );
  ck(
    !noSample.some((c) => c.id === 0),
    'sample не предлагается без своих рендеров',
    show(noSample),
  );
  const photos = M.modelPhotosOf({
    id: 12,
    thumbnail: pic(90),
    media: [pic(91), pic(90), { id: 92 }, pic(93)],
  });
  ck(
    same(ids(photos), [90, 91, 93]),
    'фото профиля: thumbnail первым, без повторов и без картинок без адреса',
    show(ids(photos)),
  );
  ck(M.modelPhotosOf(null).length === 0, 'нет профиля → нет фото');

  // ── results и рекол ──
  const past = {
    id: 55,
    kind: 'freeform',
    ask: 'chin up',
    params: {
      ...EMPTY_PARAMS,
      freeform: {
        preset: 'tryon',
        items: [
          { mediaId: 90, role: 'model', regions: [], texts: [] },
          { mediaId: 31, role: 'product', regions: [], texts: [] },
          { mediaId: 77, role: 'scene', regions: [], texts: [] },
        ],
        options: {
          framing: 'hands',
          angle: 'eye_level',
          sceneMode: 'reference',
          sceneText: 'grey seamless',
          modelId: 12,
          productColorwayId: 7,
          logoSize: '',
          creativity: 0,
        },
      },
      image: { model: GPT, quality: 'high', aspectRatio: '3:4', background: '' },
    },
  };
  ck(r.results.match(past), 'results.match: прогон tryon — свой');
  ck(
    !r.results.match({
      ...past,
      params: { ...past.params, freeform: { ...past.params.freeform, preset: 'free' } },
    }),
    'results.match: freeform free — чужой',
  );
  const mediaMap = new Map([90, 31, 77].map((id) => [id, pic(id)]));
  const back = r.recall(past, mediaMap);
  const again = r.wire(back.draft, tctx);
  ck(
    same(again.params.freeform, past.params.freeform) && again.ask === 'chin up',
    'рекол → wire: тот же freeform и те же слова',
    show(again.params.freeform),
  );
  ck(
    same(again.params.image, { model: GPT, quality: 'high', aspectRatio: '3:4', background: '' }),
    'рекол → wire: та же модель, качество и формат',
    show(again.params.image),
  );
  ck(
    back.said.length === 0 && back.lost === 0,
    'рекол полного прогона ничего не теряет',
    show(back),
  );
  const noProfile = r.recall(
    {
      ...past,
      params: {
        ...past.params,
        freeform: {
          ...past.params.freeform,
          options: { ...past.params.freeform.options, modelId: 0 },
        },
      },
    },
    mediaMap,
  );
  ck(
    (noProfile.draft.images.model_photo ?? []).length === 0 && noProfile.said.length === 1,
    'рекол без model_id: фото не ложится молча, сказано словами',
    show(noProfile.said),
  );

  // ── разметка формы ──
  const html = M.panelMarkup(B, 'virtual_try_on');
  const order = [
    'virtual_try_on.model',
    'virtual_try_on.engine-section',
    'virtual_try_on.shot',
    'virtual_try_on.pose',
    'virtual_try_on.product',
    'virtual_try_on.scene',
    'virtual_try_on.format-section',
  ].map((a) => html.indexOf(`data-fold-section="${a}"`));
  ck(
    order.every((i) => i >= 0) && order.every((i, k) => k === 0 || i > order[k - 1]),
    'секции в порядке владельца: модель, AI model, кадр, поза, продукт, сцена, формат',
    show(order),
  );
  const values = [...html.matchAll(/data-fold-value="">([^<]*)</g)].map((m) => m[1]);
  ck(
    values.includes('edit scene') && values.includes('9:16') && values.includes('0/4'),
    'шапки: «edit scene», «9:16», «0/4»',
    show(values),
  );
  ck(
    (html.match(/>required</gi) ?? []).length === 2,
    'REQUIRED ровно у модели и продукта',
    String((html.match(/>required</gi) ?? []).length),
  );
  ck(
    /one hand on hip, weight on one leg, chin up/.test(html),
    'плейсхолдер позы — слова владельца',
  );
  const oldHtml = M.panelMarkup(tryBand({ imageModels: undefined }), 'virtual_try_on');
  ck(
    !/engine-section|format-section/.test(oldHtml) && /virtual_try_on\.scene/.test(oldHtml),
    'без моделей: ни AI model, ни Format, остальная форма на месте',
  );
}

// ─── Q · Retouch a Zone: тело из мазков ───────────────────────────────────────────────────────
head('Q', 'Retouch a Zone: оболочка кисти → items[0].regions[0], слова → texts[0]');
const corner = (x, y) => ({ x: { value: x }, y: { value: y } });
/** A polygon region as the door reads it — written out by hand, every field of the annotation. */
const polygon = (points) => ({
  kind: 'TECH_CARD_ANNOTATION_KIND_POLYGON',
  points,
  text: '',
  labelX: undefined,
  labelY: undefined,
  color: 'TECH_CARD_ANNOTATION_COLOR_UNKNOWN',
  dashed: false,
  filled: false,
  caps: 'TECH_CARD_ANNOTATION_CAPS_UNSPECIFIED',
  pieceLineKey: '',
  pieceLineKeys: [],
});
const photo = (id, w = 1200, h = 1600) => ({
  id,
  media: {
    thumbnail: { mediaUrl: `https://x/${id}.jpg` },
    fullSize: { mediaUrl: `https://x/${id}-full.jpg`, width: w, height: h },
  },
});
{
  // One stroke from (0.4, 0.5) to (0.6, 0.5), brush radius 0.05 of the shorter side, square
  // picture. Each end is a disc sampled at 8 angles; the hull is the two half-octagons joined by
  // straight top and bottom edges: 10 corners, by hand (0.05·cos45° = 0.035355 → 4 decimals).
  const strokes = [
    {
      size: 0.05,
      points: [
        { x: 0.4, y: 0.5 },
        { x: 0.6, y: 0.5 },
      ],
    },
  ];
  const zone = M.zoneOfStrokes(strokes, 1);
  const got = M.retouchRequest({
    media: photo(41),
    zone,
    painted: true,
    words: '  remove the stain, keep the twill  ',
  });
  const want = {
    kind: 'freeform',
    ask: '',
    params: {
      ...EMPTY_PARAMS,
      freeform: {
        preset: 'retouch',
        items: [
          {
            mediaId: 41,
            regions: [
              polygon([
                corner('0.3500', '0.5000'),
                corner('0.3646', '0.4646'),
                corner('0.4000', '0.4500'),
                corner('0.6000', '0.4500'),
                corner('0.6354', '0.4646'),
                corner('0.6500', '0.5000'),
                corner('0.6354', '0.5354'),
                corner('0.6000', '0.5500'),
                corner('0.4000', '0.5500'),
                corner('0.3646', '0.5354'),
              ]),
            ],
            texts: ['remove the stain, keep the twill'],
            role: '',
          },
        ],
        options: undefined,
      },
    },
  };
  ck(
    same(got, want),
    'один мазок → freeform/retouch: 1 картинка, 1 полигон из 10 углов, слова в texts[0], ask пуст, без image',
    show(got),
  );
  const tall = M.zoneOfStrokes([{ size: 0.05, points: [{ x: 0.5, y: 0.5 }] }], 0.5);
  const xs = tall ? tall.map((p) => p.x) : [];
  const ys = tall ? tall.map((p) => p.y) : [];
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  ck(
    !!tall && Math.abs(spanX - 0.1) < 1e-9 && Math.abs(spanY - 0.05) < 1e-9,
    'кисть круглая на высокой картинке (1:2): диск 0.1 по x и 0.05 по y (доли своих осей)',
    show(tall),
  );
}
{
  // Forty dabs on a ring: the hull has far more than 12 corners and must become the
  // circumscribed twelve-gon — at most 12 corners, and every painted sample inside it.
  const strokes = Array.from({ length: 40 }, (_, i) => {
    const t = (2 * Math.PI * i) / 40;
    return { size: 0.01, points: [{ x: 0.5 + 0.3 * Math.cos(t), y: 0.5 + 0.3 * Math.sin(t) }] };
  });
  const hull = M.convexHull(M.paintedSamples(strokes, 1));
  ck(hull.length > 12, `кольцо: оболочка краски больше 12 углов (${hull.length})`);
  const zone = M.zoneOfStrokes(strokes, 1);
  ck(
    !!zone && zone.length >= 3 && zone.length <= 12,
    `кольцо → зона из 3..12 углов (${zone?.length ?? 'null'})`,
    show(zone),
  );
  const inside = (poly, p) => {
    // Convex, any orientation: the point is on one side of every edge (4-decimal rounding slack).
    let sign = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      if (Math.abs(c) < 1e-4) continue;
      if (sign === 0) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
    return true;
  };
  const samples = M.paintedSamples(strokes, 1);
  const out = zone ? samples.filter((p) => !inside(zone, p)) : samples;
  ck(out.length === 0, 'кольцо: вся краска внутри зоны (описанный, а не урезанный)', show(out[0]));
  const fourDecimals = (v) => Math.abs(Math.round(v * 1e4) - v * 1e4) < 1e-6;
  ck(
    !!zone && zone.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1),
    'кольцо: углы в 0..1',
  );
  ck(!!zone && zone.every((p) => fourDecimals(p.x) && fourDecimals(p.y)), 'кольцо: 4 знака');
  ck(!!zone && M.polygonArea(zone) >= 1e-5, 'кольцо: площадь ≥ 1e-5');
  const edge = M.zoneOfStrokes([{ size: 0.06, points: [{ x: 0, y: 0 }] }], 1);
  ck(
    !!edge && edge.every((p) => p.x >= 0 && p.y >= 0) && M.polygonArea(edge) >= 1e-5,
    'мазок в углу картинки: зона прижата к краю, не выходит за 0',
    show(edge),
  );
  ck(
    M.zoneOfStrokes([{ size: 0.001, points: [{ x: 0.5, y: 0.5 }] }], 1) === null,
    'мазок меньше 1e-5 площади кадра → null (дверь отказала бы region_degenerate)',
  );
  ck(M.zoneOfStrokes([], 1) === null, 'нет мазков → null');
}

// ─── R · отказы маски ─────────────────────────────────────────────────────────────────────────
head('R', 'маска: отказы до денег, в порядке двери');
{
  const zone = M.zoneOfStrokes([{ size: 0.05, points: [{ x: 0.5, y: 0.5 }] }], 1);
  const ok = { media: photo(41), zone, painted: true, words: 'a clean pocket' };
  ck(M.retouchRefusal(ok) === null, 'нарисовано, слова есть, картинка большая → готово');
  const blank = M.retouchRefusal({ ...ok, zone: null, painted: false });
  ck(
    blank?.reason === 'paint the zone to change',
    'ничего не нарисовано → «paint the zone to change»',
    show(blank),
  );
  const tiny = M.retouchRefusal({ ...ok, zone: null, painted: true });
  ck(/too small/.test(tiny?.reason ?? ''), 'нарисовано, но без площади → «too small»', show(tiny));
  const mute = M.retouchRefusal({ ...ok, words: '   ' });
  ck(
    mute?.reason === 'describe what should be there',
    'нет слов (пробелы) → «describe what should be there»',
    show(mute),
  );
  const small = M.retouchRefusal({ ...ok, media: photo(41, 50, 900) });
  ck(
    /50×900 px/.test(small?.reason ?? '') && /64 px/.test(small?.reason ?? ''),
    'картинка 50×900 → отказ, называет размер и 64 px (source_too_small до денег)',
    show(small),
  );
  ck(
    M.retouchRefusal({ ...ok, media: { id: 41, media: { thumbnail: { mediaUrl: 'x' } } } }) ===
      null,
    'размер не указан (старая строка медиа) → не отказ: сервер проверит сам',
  );
  ck(
    M.retouchRefusal({ ...ok, media: null })?.reason === 'pick a picture to retouch',
    'нет картинки → «pick a picture to retouch»',
  );
  const empty = M.retouchRequest({ ...ok, zone: null, painted: false });
  ck(
    same(empty.params.freeform, { preset: 'retouch', items: [], options: undefined }),
    'не нарисовано → items пуст (тело без зоны не собирается)',
    show(empty.params.freeform),
  );
  const long = M.retouchRequest({ ...ok, words: 'ж'.repeat(1200) });
  ck(
    Array.from(long.params.freeform.items[0]?.texts?.[0] ?? '').length === 1000,
    'слова срезаны по потолку двери 1000 символов',
  );
}

// ─── S · ворота ретуши ────────────────────────────────────────────────────────────────────────
head('S', 'ворота: плитка 10 и угол mask — только где сервер перечислил retouch_zone');
{
  const withList = band({ playgroundWorkflows: ['retouch_zone'] });
  const withoutKey = band({ playgroundWorkflows: ['create_edit'] });
  ck(liveKeys(M.gridMarkup(withList)).has('retouch_zone'), 'сетка: retouch_zone в списке → жива');
  ck(!liveKeys(M.gridMarkup(band())).has('retouch_zone'), 'сетка: списка нет → приглушена');
  ck(
    !liveKeys(M.gridMarkup(withoutKey)).has('retouch_zone'),
    'сетка: в списке нет retouch_zone → приглушена',
  );
  ck(
    M.retouchOffered(withList) && !M.retouchOffered(band()) && !M.retouchOffered(withoutKey),
    'retouchOffered: да только при retouch_zone в playgroundWorkflows',
  );
  const pic = (id, ordinal, mediaId) => ({
    id,
    ordinal,
    media: { id: mediaId, media: { thumbnail: { mediaUrl: `https://x/${mediaId}.jpg` } } },
  });
  const runs = [
    {
      id: 41,
      kind: 'freeform',
      status: 'succeeded',
      params: { ...EMPTY_PARAMS, freeform: { preset: 'free', items: [], options: undefined } },
      pictures: [pic(501, 1, 77)],
    },
    {
      id: 42,
      kind: 'freeform',
      status: 'succeeded',
      params: { ...EMPTY_PARAMS, freeform: { preset: 'retouch', items: [], options: undefined } },
      pictures: [pic(502, 1, 78)],
    },
  ];
  const masks = (markup) => (markup.match(/aria-label="mask picture/g) ?? []).length;
  const off = M.resultsMarkup(band({ runs }), null);
  ck(off.includes('data-pg-output="501"'), 'итоги нарисованы (сетка, старый сервер)');
  ck(masks(off) === 0, 'старый сервер: угла mask нет ни на одной картинке', `${masks(off)}`);
  ck(
    masks(M.resultsMarkup(band({ runs, playgroundWorkflows: ['create_edit'] }), null)) === 0,
    'список без retouch_zone: угла mask нет',
  );
  const on = M.resultsMarkup(band({ runs, playgroundWorkflows: ['retouch_zone'] }), null);
  ck(
    masks(on) === 2,
    'retouch_zone в списке: угол mask на каждой картинке комнаты',
    `${masks(on)}`,
  );
  ck(
    M.maskableRun({ kind: 'freeform' }) &&
      M.maskableRun({ kind: 'cutout' }) &&
      M.maskableRun({ kind: 'recolor' }) &&
      !M.maskableRun({ kind: 'threed' }) &&
      !M.maskableRun({ kind: 'flat' }),
    'mask — на растрах плейграунда (freeform, cutout, recolor), не на 3D и не на флэтах',
  );
  const under = M.resultsMarkup(
    band({ runs, playgroundWorkflows: ['retouch_zone', 'create_edit'] }),
    'retouch_zone',
  );
  ck(
    under.includes('data-pg-output="501"') && under.includes('data-pg-output="502"'),
    'итоги под плиткой 10 — вся комната (картинка «free» тоже, с ней и начинают)',
  );
  const panel = M.panelMarkup(withList, 'retouch_zone');
  ck(panel.includes('data-retouch-explanation'), 'панель плитки 10: объяснение нарисовано');
  ck(
    panel.includes(M.RETOUCH_CAVEAT) &&
      M.RETOUCH_CAVEAT === 'The rectangle around your zone may change.',
    'панель плитки 10: честная строка «The rectangle around your zone may change.»',
  );
  ck(!/credit/i.test(panel), 'панель плитки 10: ни слова о кредитах');
  ck(!/GENERATE/.test(panel), 'панель плитки 10: GENERATE нет — прогон начинается с Mask', '');
  const retouchMatch = M.playgroundHistoryMatch('retouch_zone', withList);
  ck(
    !!retouchMatch && retouchMatch(runs[1]) && !retouchMatch(runs[0]),
    'история под плиткой 10 сужается до ретушей',
  );
}

// ─── T · плитка 12 Image to 3D (C-10) ─────────────────────────────────────────────────────────
head('T', 'Image to 3D: тело режима референса, опции по слову сервера, ворота, разметка, рекол');
const OPTS3 = ['texture', 'pbr', 'quality'];
/** A render plate of colourway 5 on the render bench, and a flat plate — media 41 and 43. */
const BENCH3 = [
  {
    id: 1,
    kind: 'render',
    viewKey: 'front',
    colorwayId: 5,
    picture: { id: 901, media: media(41) },
  },
  { id: 2, kind: 'flat', viewKey: 'front', colorwayId: 0, picture: { id: 902, media: media(43) } },
];
const band3 = (over = {}) =>
  band({ playgroundWorkflows: ['image_to_3d'], threedOptions: OPTS3, bench: BENCH3, ...over });
const t3 = () => run('image_to_3d');
/** Every field of DesignThreedParams, written by hand. */
const THREED = (over) => ({
  frames: 0,
  presentation: 'air',
  modelId: 0,
  garmentSizeId: 0,
  fitOverride: '',
  bodyType: '',
  sourcePictureIds: [],
  referenceMediaIds: [],
  texture: '',
  pbr: '',
  quality: '',
  follow: '',
  surfaceHint: '',
  ...over,
});
{
  ck(!!t3(), 'image_to_3d: плитка runnable (run есть)');
  const b = band3();
  const fresh3 = (images) => ({ ...M.initialDraft(t3()), images: { reference: images } });

  // A plate of colourway 5, every option stated.
  const full = t3().wire(
    {
      ...fresh3([media(41)]),
      flags: { texture: true, pbr: true },
      choices: { quality: 'detailed' },
    },
    { band: b },
  );
  ck(
    same(full, {
      kind: 'threed',
      ask: '',
      params: {
        ...EMPTY_PARAMS,
        colorwayId: 5,
        threed: THREED({
          referenceMediaIds: [41],
          texture: 'on',
          pbr: 'on',
          quality: 'detailed',
        }),
      },
    }),
    'плита рендер-верстака колорвея 5, всё названо: тело целиком (colorwayId 5, [41], on/on/detailed, follow пуст)',
    show(full),
  );

  // A fresh draft over a picture that is not a render plate: the defaults, colourway 0.
  const plain = t3().wire(fresh3([media(42), media(44)]), { band: b });
  ck(
    same(plain, {
      kind: 'threed',
      ask: '',
      params: {
        ...EMPTY_PARAMS,
        threed: THREED({
          referenceMediaIds: [42],
          texture: 'on',
          // C-12: materials default ON where the band lists pbr (the owner's 14.png).
          pbr: 'on',
          quality: 'standard',
        }),
      },
    }),
    'свежий черновик, картинка не с верстака: [42] (одна), on/on/standard, colorwayId 0',
    show(plain),
  );
  ck(
    t3().wire(fresh3([media(43)]), { band: b }).params.colorwayId === 0,
    'плита ФЛЭТ-верстака колорвея не даёт (colorwayId 0)',
  );
  ck(M.plateColorway(b, 41) === 5 && M.plateColorway(b, 0) === 0, 'plateColorway: 41 → 5, 0 → 0');

  // Materials without the texture never leave as `on` (the door refuses the pair).
  const bare = t3().wire(
    { ...fresh3([media(42)]), flags: { texture: false, pbr: true } },
    { band: b },
  );
  ck(
    bare.params.threed.texture === 'off' && bare.params.threed.pbr === 'off',
    'текстура off + материалы on → уезжает off/off, никогда off/on',
    show(bare.params.threed),
  );
  // …and where the texture row is not the server's to switch, the texture is ON (its constant).
  const pbrOnly = t3().wire(
    { ...fresh3([media(42)]), flags: { texture: false, pbr: true } },
    { band: band3({ threedOptions: ['pbr'] }) },
  );
  ck(
    same(pbrOnly.params.threed, THREED({ referenceMediaIds: [42], pbr: 'on' })),
    'сервер объявил только pbr: texture/quality пусты (константа маршрута), pbr on',
    show(pbrOnly.params.threed),
  );

  // Nothing advertised → every option '' — today's constants.
  const none = t3().wire(
    {
      ...fresh3([media(42)]),
      flags: { texture: false, pbr: true },
      choices: { quality: 'detailed' },
    },
    { band: band3({ threedOptions: [] }) },
  );
  ck(
    same(none.params.threed, THREED({ referenceMediaIds: [42] })),
    'threed_options пуст: texture/pbr/quality/follow — все пустые',
    show(none.params.threed),
  );

  // Follow travels only when the server lists it (never in phase 2).
  ck(plain.params.threed.follow === '', 'follow не объявлен → пусто');
  const withFollow = t3().wire(
    { ...fresh3([media(42)]), choices: { follow: 'shape' } },
    { band: band3({ threedOptions: [...OPTS3, 'follow'] }) },
  );
  ck(
    withFollow.params.threed.follow === 'shape',
    'follow объявлен → уезжает выбранное слово (shape)',
    show(withFollow.params.threed),
  );

  // validate: the picture is the one refusal before money.
  const empty = t3().validate(M.initialDraft(t3()), { band: b });
  ck(empty?.section === 'reference', 'нет картинки → отказ на секции reference', show(empty));
  ck(t3().validate(fresh3([media(42)]), { band: b }) === null, 'с картинкой — отказа нет');

  // Shape and price words: NO FIGURE — the server may reserve more than any static number (G-02
  // Codex 3); the row adds «priced by the server when the run starts» itself.
  ck(
    t3().shape(fresh3([media(42)]), plain) === '1 model' &&
      t3().shape(fresh3([media(41)]), full) === '1 model',
    'строка GENERATE: «1 model» без суммы (обычная и detailed)',
    `${t3().shape(null, plain)} | ${t3().shape(null, full)}`,
  );
  ck(
    !/\$/.test(M.panelMarkup(band3({ threedOptions: OPTS3 }), 'image_to_3d')),
    'форма плитки 12: ни одной суммы в $ (и у Detailed)',
  );

  // The gate: the list AND the options field.
  const g = (bb) => def('image_to_3d').gate(bb);
  ck(
    same(g(band()), { available: false, reason: 'not on this server yet' }),
    'ворота: списка нет (старый сервер) → «not on this server yet»',
    show(g(band())),
  );
  ck(
    same(g(band({ playgroundWorkflows: ['image_to_3d'] })), {
      available: false,
      reason: 'not on this server yet',
    }),
    'ворота: в списке, но threed_options нет → приглушена',
    show(g(band({ playgroundWorkflows: ['image_to_3d'] }))),
  );
  ck(
    g(band({ playgroundWorkflows: ['image_to_3d'], threedOptions: [] })).available === true,
    'ворота: в списке и threed_options есть (даже пустой) → открыта',
  );
  ck(
    /not wired/.test(
      g(band({ playgroundWorkflows: ['create_edit'], threedOptions: OPTS3 })).reason ?? '',
    ),
    'ворота: не в списке → «not wired on this server»',
  );
  ck(
    liveKeys(M.gridMarkup(band3())).has('image_to_3d') &&
      !liveKeys(M.gridMarkup(band({ playgroundWorkflows: ['image_to_3d'] }))).has('image_to_3d'),
    'сетка: плитка жива только при threed_options',
  );

  // The form's markup: rows only for what the server lists; the fold's header says the quality.
  const all = M.panelMarkup(b, 'image_to_3d');
  ck(
    /data-toggle-row="texture"/.test(all) &&
      /data-toggle-row="pbr"/.test(all) &&
      /data-option-row="quality"/.test(all) &&
      !/data-option-row="follow"/.test(all),
    'форма: Texture, Realistic materials, Quality есть, Follow нет (не объявлен)',
  );
  ck(/Realistic materials/.test(all), 'строка «Realistic materials» названа словами владельца');
  const heads = [...all.matchAll(/data-fold-value="">([^<]*)</g)].map((m) => m[1]);
  ck(heads.includes('standard'), 'шапка «3D options» — «standard»', show(heads));
  ck(/data-fold-section="image_to_3d\.options"/.test(all), 'секция 3D options есть');
  const pbrOnlyForm = M.panelMarkup(band3({ threedOptions: ['pbr'] }), 'image_to_3d');
  ck(
    /data-toggle-row="pbr"/.test(pbrOnlyForm) &&
      !/data-toggle-row="texture"/.test(pbrOnlyForm) &&
      !/data-option-row="quality"/.test(pbrOnlyForm),
    'объявлен только pbr → только его строка',
  );
  const noneForm = M.panelMarkup(band3({ threedOptions: [] }), 'image_to_3d');
  ck(
    noneForm.length > 0 && !/data-fold-section="image_to_3d\.options"/.test(noneForm),
    'threed_options пуст → секции 3D options нет вовсе',
  );
  const followForm = M.panelMarkup(band3({ threedOptions: [...OPTS3, 'follow'] }), 'image_to_3d');
  ck(
    /data-option-row="follow"/.test(followForm) && /The photo/.test(followForm),
    'follow объявлен → строка Follow «The photo | The shape»',
  );
  const bareForm = M.panelMarkup(b, 'image_to_3d', {
    ...fresh3([media(42)]),
    flags: { texture: false, pbr: true },
  });
  ck(
    /turn it on first/.test(bareForm),
    'текстура off → у строки материалов сказано, почему она выключена',
  );

  // Results: its own block (the card's 3D models); the history narrows to threed runs.
  const r = t3().results;
  ck(
    typeof r.view === 'function' && same(r.reps, ['threed']),
    'результаты: свой блок (view) и reps [threed]',
  );
  const runs3 = [
    { id: 1, kind: 'threed' },
    { id: 2, kind: 'freeform' },
    { id: 3, kind: 'render' },
  ];
  const m3 = M.playgroundHistoryMatch('image_to_3d', b);
  ck(
    same(
      runs3.filter(m3).map((x) => x.id),
      [1],
    ),
    'история под плиткой: только threed-прогоны',
  );
  ck(
    M.playgroundHistoryRep('image_to_3d', b) === 'threed' &&
      M.playgroundHistoryRep('create_edit', band({ playgroundWorkflows: ['create_edit'] })) ===
        'playground' &&
      M.playgroundHistoryRep(null, b) === 'playground',
    'слово истории: threed под Image to 3D, playground под другими и на сетке',
  );

  // Recall: the first reference and the options; a bench build is said, not guessed.
  const past = {
    id: 77,
    kind: 'threed',
    params: {
      threed: THREED({
        referenceMediaIds: [42, 43],
        texture: 'off',
        pbr: 'off',
        quality: 'detailed',
      }),
    },
  };
  const back = t3().recall(
    past,
    new Map([
      [42, media(42)],
      [43, media(43)],
    ]),
  );
  ck(
    same(
      back.draft.images.reference.map((x) => x.id),
      [42],
    ) &&
      back.draft.flags.texture === false &&
      back.draft.choices.quality === 'detailed' &&
      back.said.some((w) => /1 more angle/.test(w)),
    'рекол: первая картинка, опции, лишний ракурс назван',
    show(back),
  );
  const bench = t3().recall({ id: 78, kind: 'threed', params: { threed: THREED({}) } }, new Map());
  ck(
    bench.draft.images.reference.length === 0 && bench.said.some((w) => /render bench/.test(w)),
    'рекол сборки STEP 5 (верстак): картинки нет, сказано почему',
    show(bench),
  );
}

// ─── U · рельс без STEP 5 (C-10) ───────────────────────────────────────────────────────────────
head('U', 'рельс: STEP 5 только у сервера без playground_workflows; ?step=threed; счёт шагов');
{
  const ids = (list) => list.map((st) => st.id).join(',');
  const oldSrv = { band: band(), bandless: false };
  const newSrv = { band: band({ playgroundWorkflows: [] }), bandless: false };
  const silent = { band: {}, bandless: true };
  ck(
    ids(M.railSteps(oldSrv)) === 'card,mood,flat,pattern,render,threed',
    'старый сервер (band без playground_workflows): шесть ячеек, STEP 5 последней',
    ids(M.railSteps(oldSrv)),
  );
  ck(
    ids(M.railSteps(newSrv)) === 'card,mood,flat,pattern,render',
    'новый сервер (список есть, даже пустой): пять ячеек, без 3d',
    ids(M.railSteps(newSrv)),
  );
  ck(
    ids(M.railSteps(silent)) === 'card,mood,flat,pattern,render',
    'сервер молчит (полоса грузится / не отвечает): STEP 5 не рисуется',
    ids(M.railSteps(silent)),
  );
  ck(
    !M.STEPS.some((st) => st.id === 'threed') && M.THREED_STEP.label === '3d',
    'STEPS без threed; STEP 5 — отдельная константа «3d»',
  );
  ck(M.stepOfKind('threed').label === '3d', 'stepOfKind(threed) — ярлык «3d» (слово пикеров)');

  ck(
    same(M.legacyStep('threed', true), { step: 'playground', wf: 'image_to_3d' }),
    '?step=threed на новом сервере → playground + image_to_3d',
    show(M.legacyStep('threed', true)),
  );
  ck(M.legacyStep('threed', false) === null, '?step=threed на старом — живой шаг, не старый адрес');
  ck(M.legacyStep('threed') === null, '…и без ответа сервера (флаг по умолчанию) — тоже нет');
  ck(
    M.legacyStep('threed', true) === M.legacyStep('threed', true),
    'ответ — одна ссылка (эффект перезаписи не перезапускается)',
  );
  ck(
    same(M.legacyStep('aside', true), { step: 'playground', wf: 'change_color' }),
    '?step=aside — как было',
  );
  // The composer's reading of `?step=` (studio-tab: `decided`).
  const at = (v, r) => M.addressedStep(v, r);
  ck(
    at('threed', true) === 'playground' &&
      at('threed', false) === 'threed' &&
      at('aside', false) === 'playground' &&
      at('flat', true) === 'flat' &&
      at('junk', true) === null &&
      at(null, true) === null,
    'addressedStep: threed → playground на новом, threed на старом; aside, flat, мусор — как прежде',
    show([
      at('threed', true),
      at('threed', false),
      at('aside', false),
      at('flat', true),
      at('junk', true),
    ]),
  );

  // A card where everything is done: the counter's ceiling is the rail's length.
  const plate = (kind, viewKey, id) => ({
    id,
    kind,
    viewKey,
    colorwayId: 0,
    picture: { id: 800 + id, media: media(800 + id) },
  });
  const doneBand = (over) =>
    band({
      bench: [
        plate('flat', 'front', 1),
        plate('flat', 'back', 2),
        plate('render', 'front', 3),
        plate('render', 'back', 4),
      ],
      runs: [{ id: 5, kind: 'threed', pictures: [{ id: 9 }] }],
      ...over,
    });
  const ctxOf = (b, threed) => ({
    band: b,
    bandless: false,
    now: null,
    card: { name: 'coat', styleNumber: 'S1', categoryId: 3, baseSampleSizeId: 0, pastIdea: false },
    moodPictures: 1,
    moodConcept: 'a coat',
    counts: { pattern: 1, render: 2, threed, onmodel: 0, playground: 0 },
    colorway: { id: 0, label: '', archived: false },
  });
  const oldDone = ctxOf(doneBand({}), 1);
  const newDone = ctxOf(doneBand({ playgroundWorkflows: ['image_to_3d'] }), 1);
  ck(
    M.doneCount(newDone) === 5 && M.railSteps(newDone).length === 5,
    'новый сервер, всё сделано: «5 of 5»',
    `${M.doneCount(newDone)} of ${M.railSteps(newDone).length}`,
  );
  ck(
    M.doneCount(oldDone) === 6 && M.railSteps(oldDone).length === 6,
    'старый сервер, всё сделано вместе с 3D: «6 of 6» (как до волны)',
    `${M.doneCount(oldDone)} of ${M.railSteps(oldDone).length}`,
  );
  // Only the 3D model is missing: the old server opens on STEP 5, the new one's chain is complete.
  const oldNo3d = ctxOf(doneBand({}), 0);
  const newNo3d = ctxOf(doneBand({ playgroundWorkflows: ['image_to_3d'] }), 0);
  ck(
    M.defaultStep(oldNo3d) === 'threed',
    'старый сервер без 3D-модели: карточка открывается на STEP 5',
    M.defaultStep(oldNo3d),
  );
  ck(
    M.defaultStep(newNo3d) === 'card',
    'новый сервер: цепь из пяти завершена — открывается там, где начиналась, не на 3d',
    M.defaultStep(newNo3d),
  );
  // A render bench with no FRONT blocks STEP 5 on the old rail; the new rail has no such link.
  const noFront = (over) =>
    band({
      bench: [plate('flat', 'front', 1), plate('flat', 'back', 2), plate('render', 'back', 4)],
      ...over,
    });
  const oldBlock = M.nearestBlock(ctxOf(noFront({}), 0));
  const newBlock = M.nearestBlock(ctxOf(noFront({ playgroundWorkflows: [] }), 0));
  ck(
    oldBlock?.stepId === 'threed',
    'старый сервер: рендер без FRONT держит STEP 5 (полоса LOCKED как прежде)',
    show(oldBlock),
  );
  ck(newBlock === null, 'новый сервер: полосы LOCKED про 3d нет', show(newBlock));

  // The rail itself, drawn by React: the cells and the counter on each server.
  const cells = (markup) => [...markup.matchAll(/data-step="([a-z]+)"/g)].map((m) => m[1]);
  const oldRail = M.railMarkup(oldDone);
  const newRail = M.railMarkup(newDone);
  ck(
    cells(oldRail).includes('threed') && /6 of 6 steps/.test(oldRail),
    'рельс старого сервера: ячейка 3d и «6 of 6 steps»',
    show(cells(oldRail)),
  );
  ck(
    !cells(newRail).includes('threed') && /5 of 5 steps/.test(newRail),
    'рельс нового сервера: без ячейки 3d, «5 of 5 steps»',
    show(cells(newRail)),
  );
  ck(cells(newRail).includes('playground'), 'PLAYGROUND на месте');
}

// ─── V · C-12: интеграция полос ───────────────────────────────────────────────────────────────
head('V', 'C-12: заглушки под своей плиткой, рекол 3D → плитка 12, материалы ON, surface_hint');
{
  // [run id, kind, the server's stamp = the ONE tile whose results take the stub]
  const STUBS = [
    [601, 'freeform', 'virtual_try_on'],
    [602, 'freeform', 'fabric_to_image'],
    [603, 'freeform', 'ghost_mannequin'],
    [604, 'freeform', 'add_logo'],
    [605, 'freeform', 'design_variations'],
    [606, 'freeform', 'retouch_zone'],
    [607, 'freeform', 'create_edit'],
    [608, 'recolor', 'swap_fabrics'],
    [609, 'recolor', 'change_color'],
    [610, 'cutout', 'remove_background'],
  ];
  const stubBand = band({
    runs: [],
    outputs: STUBS.map(([id, kind, stamp]) => ({
      picture: { id: id + 300, runId: id },
      runId: id,
      runKind: kind,
      runWorkflow: stamp,
    })),
  });
  const rows = [
    ...(M.cardOutputRows(stubBand, 'playground') ?? []),
    ...(M.cardOutputRows(stubBand, 'onmodel') ?? []),
  ];
  for (const [id, , key] of STUBS) {
    const stub = rows.find((r) => r.run.id === id)?.run;
    const claimed = M.WORKFLOWS.filter((w) => !!stub && !!w.run?.results.match(stub)).map(
      (w) => w.key,
    );
    ck(
      !!stub && stub.params === undefined && claimed.length === 1 && claimed[0] === key,
      `заглушка со штампом ${key} — под ${key} и только под ней`,
      show(claimed),
    );
  }

  // «Run that again» on a 3D run: STEP 5 on an old server, tile 12 on a new one, prefilled.
  ck(
    M.recallTargetKind({ kind: 'threed' }, 'input', true) === 'playground' &&
      M.recallTargetKind({ kind: 'threed' }, 'input', false) === 'threed' &&
      M.recallTargetKind({ kind: 'threed' }, 'input') === 'threed',
    'рекол 3D: новый сервер → playground, старый (и без слова) → STEP 5',
  );
  const run3 = {
    id: 77,
    kind: 'threed',
    params: {
      threed: { referenceMediaIds: [41], texture: 'on', pbr: 'off', quality: 'detailed' },
    },
  };
  const key3 = M.workflowOfRun(run3);
  const back3 = M.workflowByKey(key3)?.run?.recall?.(run3, new Map([[41, media(41)]]));
  ck(
    key3 === 'image_to_3d' &&
      back3?.draft.images.reference?.[0]?.id === 41 &&
      back3.draft.flags.texture === true &&
      back3.draft.flags.pbr === false &&
      back3.draft.choices.quality === 'detailed',
    'рекол 3D-прогона: плитка 12, его референс, texture on / pbr off / detailed',
    show({ key3, draft: back3?.draft }),
  );

  // Tile 12's defaults and the surface hint the backend made a route capability.
  const t12 = M.workflowByKey('image_to_3d').run;
  const drafted = { ...M.initialDraft(t12), images: { reference: [media(42)] } };
  const withHint = band({
    playgroundWorkflows: ['image_to_3d'],
    threedOptions: ['texture', 'pbr', 'quality', 'surface_hint'],
  });
  const w = t12.wire(drafted, { band: withHint }).params.threed;
  ck(w.texture === 'on' && w.pbr === 'on', 'pbr и texture в списке: по умолчанию оба ON', show(w));
  ck(w.surfaceHint === '', 'surface_hint в списке: подсказка уезжает пустой', show(w.surfaceHint));
  const form12 = M.panelMarkup(withHint, 'image_to_3d');
  ck(
    form12.length > 0 &&
      /data-toggle-row="pbr"/.test(form12) &&
      !/data-(toggle|option)-row="surface/.test(form12) &&
      !/surface hint/i.test(form12),
    'surface_hint в списке: поля подсказки в форме нет',
  );
  const noPbr = t12.wire(drafted, {
    band: band({ playgroundWorkflows: ['image_to_3d'], threedOptions: ['texture'] }),
  }).params.threed;
  ck(noPbr.pbr === '', 'pbr не в списке: уезжает пустым (константа маршрута)', show(noPbr.pbr));

  // impeccable (C-12): every grown picture section counts its slots beside REQUIRED — «0/N».
  const everyBand = band({
    playgroundWorkflows: M.WORKFLOWS.map((d) => d.key),
    threedOptions: ['texture', 'pbr', 'quality'],
  });
  for (const [key, want] of [
    ['fabric_to_image', '0/1'],
    ['ghost_mannequin', '0/1'],
    ['design_variations', '0/1'],
    ['image_to_3d', '0/1'],
    ['remove_background', '0/1'],
    ['change_color', '0/24'],
  ]) {
    const heads = [...M.panelMarkup(everyBand, key).matchAll(/data-fold-value="">([^<]*)</g)].map(
      (x) => x[1],
    );
    ck(heads[0] === want, `${key}: секция картинки считает слоты «${want}»`, show(heads));
  }
}

// ─── W · починки G-02 (клиент) ─────────────────────────────────────────────────────────────────
head(
  'W',
  'G-02: слот плитки 10, рекол ретуши, приколотое, подпись окна, рекол 3D, модель, Reuse, Scene',
);
{
  const wfBand = (over = {}) =>
    band({
      playgroundWorkflows: M.WORKFLOWS.map((d) => d.key),
      threedOptions: ['texture', 'pbr', 'quality'],
      ...over,
    });

  // M-1 · tile 10's panel: the owner's words, the honest line, the price line, ONE picture slot.
  const p10 = M.panelMarkup(wfBand(), 'retouch_zone');
  ck(
    p10.includes('Open or upload any picture') &&
      p10.includes(
        'press <b>Mask</b>, paint the zone to change and describe what should be there.',
      ) &&
      p10.includes(
        'The retouch is generated as a new picture beside the original — nothing is overwritten.',
      ) &&
      p10.includes(M.RETOUCH_CAVEAT) &&
      !/credit/i.test(p10),
    'плитка 10: слова владельца (12.png) и честная строка, без «credit»',
  );
  ck(
    M.RETOUCH_PRICE === '1 new picture per retouch · priced by the server when the run starts' &&
      p10.includes('data-retouch-price') &&
      !p10.includes('$'),
    'плитка 10: строка цены — сервер ценит при старте, суммы нет (полоса цен не даёт) (m-3)',
    M.RETOUCH_PRICE,
  );
  ck(
    (p10.match(/data-retouch-source=/g) ?? []).length === 1 &&
      /data-fold-section="retouch_zone.source"/.test(p10) &&
      />Reuse</.test(p10) &&
      !/GENERATE/.test(p10),
    'плитка 10: один слот (+ / Reuse) в секции Picture, GENERATE на панели нет',
  );

  // Codex 5 · a retouch recalled: its picture, its words, the editor open on it; the zone is said.
  const r10 = run('retouch_zone');
  const past10 = {
    id: 90,
    kind: 'freeform',
    params: {
      ...EMPTY_PARAMS,
      freeform: {
        preset: 'retouch',
        items: [{ mediaId: 800, regions: [], texts: ['remove the stain'], role: '' }],
        options: undefined,
      },
    },
  };
  ck(M.retouchSourceId(past10) === 800, 'источник ретуши — items[0].mediaId');
  ck(
    M.retouchSourceId({
      kind: 'freeform',
      params: { freeform: { preset: 'free', items: [{ mediaId: 5 }] } },
    }) === 0 && M.retouchSourceId({ kind: 'freeform' }) === 0,
    'не ретушь / заглушка без params — источника нет (0)',
  );
  const back10 = r10.recall(past10, new Map([[800, media(800)]]), { band: wfBand() });
  ck(
    back10.draft.images[M.RETOUCH_SOURCE_KEY]?.[0]?.id === 800 &&
      back10.draft.texts.change_text === 'remove the stain' &&
      back10.draft.flags[M.RETOUCH_MASKING_KEY] === true &&
      back10.lost === 0 &&
      back10.said.some((w) => /paint the zone again/.test(w)),
    'рекол ретуши: картинка в слоте, слова, маска открыта, «paint the zone again»',
    show(back10),
  );
  const gone10 = r10.recall(past10, new Map(), { band: wfBand() });
  ck(
    (gone10.draft.images[M.RETOUCH_SOURCE_KEY] ?? []).length === 0 &&
      gone10.draft.flags[M.RETOUCH_MASKING_KEY] === false &&
      gone10.lost === 1,
    'рекол ретуши без картинки: маска не открывается, потеря названа',
    show(gone10),
  );
  const with10 = M.panelMarkup(wfBand(), 'retouch_zone', {
    ...M.EMPTY_DRAFT,
    images: { [M.RETOUCH_SOURCE_KEY]: [media(800)] },
  });
  ck(
    /data-retouch-source="800"/.test(with10) &&
      /aria-label="mask this picture/.test(with10) &&
      /aria-label="remove the picture to retouch"/.test(with10) &&
      /data-fold-value="">1\/1</.test(with10),
    'слот с картинкой: угол mask и ✕, шапка «1/1»',
  );

  // Codex 8 + m-2 · what is pinned above the pictures.
  const pic = (id, mediaId) => ({
    id,
    ordinal: 1,
    media: { id: mediaId, media: { thumbnail: { mediaUrl: `https://x/${mediaId}.jpg` } } },
  });
  const free = (id, status, pictures = []) => ({
    id,
    kind: 'freeform',
    status,
    params: { ...EMPTY_PARAMS, freeform: { preset: 'free', items: [], options: undefined } },
    pictures,
  });
  const retouch = (id, status, source) => ({
    id,
    kind: 'freeform',
    status,
    params: {
      ...EMPTY_PARAMS,
      freeform: {
        preset: 'retouch',
        items: [{ mediaId: source, regions: [], texts: ['x'], role: '' }],
        options: undefined,
      },
    },
    pictures: [],
  });
  const pinBand = wfBand({
    runs: [
      retouch(93, 'pending', 777),
      retouch(92, 'pending', 500),
      free(91, 'pending'),
      free(41, 'succeeded', [pic(601, 500)]),
    ],
  });
  const pinned = (markup) => [...markup.matchAll(/data-pg-pinned="(\d+)"/g)].map((x) => +x[1]);
  const under10 = M.resultsMarkup(pinBand, 'retouch_zone');
  ck(
    same(pinned(under10).sort(), [92, 93]),
    'под плиткой 10: приколоты только ретуши — живой Create or edit нет (Codex 8)',
    show(pinned(under10)),
  );
  const underCE = M.resultsMarkup(pinBand, 'create_edit');
  ck(
    same(pinned(underCE).sort(), [91, 92]) &&
      /A retouch of a picture below: it lands under Retouch a Zone/.test(underCE),
    'под Create or edit: свой живой прогон и живая ретушь ЕГО картинки, со словами куда она ляжет (m-2)',
    show(pinned(underCE)),
  );
  ck(!pinned(underCE).includes(93), 'ретушь чужой картинки под Create or edit не приколота');

  // m-1 / Codex 2 · the caption of a tile's own window (band 31).
  const out = (id, stamp) => ({
    picture: { id, runId: id, colorwayId: 0, ordinal: 1 },
    runId: id,
    runKind: 'freeform',
    runWorkflow: stamp,
  });
  const winBand = (over = {}) =>
    wfBand({
      outputs: [out(1, 'create_edit'), out(2, 'create_edit'), out(3, 'virtual_try_on')],
      outputsTotalByColorway: { 0: 500 },
      ...over,
    });
  ck(
    same(
      M.workflowOutputsHorizon(
        winBand({ outputsTotalByWorkflow: { create_edit: 120 } }),
        'create_edit',
      ),
      {
        total: 120,
        carried: 2,
      },
    ),
    'окно Create or edit: 2 пришли из 120 — его число, не 3 из 500',
  );
  ck(
    M.workflowOutputsHorizon(winBand(), 'create_edit') === null &&
      M.workflowOutputsHorizon(
        winBand({ outputsTotalByWorkflow: { virtual_try_on: 1 } }),
        'virtual_try_on',
      ) === null,
    'поля 31 нет — подписи нет; всё пришло (1 из 1) — подписи нет',
  );
  const capCE = M.resultsMarkup(
    winBand({ outputsTotalByWorkflow: { create_edit: 120 } }),
    'create_edit',
  );
  ck(
    /data-pg-horizon="workflow"/.test(capCE) &&
      capCE.includes('Only the newest 2 of this workflow’s 120 pictures are sent here'),
    'под Create or edit подпись — «2 of this workflow’s 120»',
  );
  ck(
    !/data-pg-horizon/.test(M.resultsMarkup(winBand(), 'create_edit')),
    'старый сервер (поля 31 нет): под плиткой подписи нет',
  );
  ck(
    /data-pg-horizon="room"/.test(M.resultsMarkup(winBand(), null)),
    'сетка: подпись окна комнаты (колорвей 0) осталась',
  );

  // Codex 4 · a STEP 5 build «on a model» recalled into tile 12 keeps its block.
  const t12 = run('image_to_3d');
  const step5 = {
    id: 66,
    kind: 'threed',
    params: {
      ...EMPTY_PARAMS,
      threed: {
        frames: 0,
        presentation: 'model',
        modelId: 12,
        garmentSizeId: 3,
        fitOverride: 'relaxed',
        bodyType: 'tall',
        sourcePictureIds: [],
        referenceMediaIds: [42],
        texture: 'off',
        pbr: '',
        quality: 'detailed',
        follow: '',
        surfaceHint: 'matte wool',
      },
    },
  };
  const onlyTexture = band({ playgroundWorkflows: ['image_to_3d'], threedOptions: ['texture'] });
  const back12 = t12.recall(step5, new Map([[42, media(42)]]), { band: onlyTexture });
  const w12 = t12.wire(back12.draft, { band: onlyTexture }).params.threed;
  ck(
    w12.presentation === 'model' &&
      w12.modelId === 12 &&
      w12.garmentSizeId === 3 &&
      w12.fitOverride === 'relaxed' &&
      w12.bodyType === 'tall',
    'рекол 3D: presentation «model» и немые поля уезжают как были, не «air»',
    show(w12),
  );
  ck(
    back12.said.some((w) => /built «model» — this build keeps that/.test(w)),
    'рекол 3D: сказано, что presentation сохранён',
    show(back12.said),
  );
  ck(
    back12.said.some((w) => /no longer offers detailed quality/.test(w)) &&
      !back12.said.some((w) => /texture off/.test(w)),
    'рекол 3D: снятая маршрутом опция названа (detailed), объявленная (texture) — нет',
    show(back12.said),
  );
  ck(
    back12.said.some((w) => /surface words did not come along/.test(w)) && w12.surfaceHint === '',
    'рекол 3D: слова поверхности не уезжают (surface_hint — решение) и это сказано',
    show(back12.said),
  );
  const shown12 = M.panelMarkup(onlyTexture, 'image_to_3d', back12.draft);
  ck(
    /data-threed-carried="model"/.test(shown12),
    'форма плитки 12 говорит, что presentation взят из рекола',
  );
  const fresh12 = t12.wire(
    { ...M.initialDraft(t12), images: { reference: [media(42)] } },
    { band: onlyTexture },
  ).params.threed;
  ck(
    fresh12.presentation === 'air' && fresh12.modelId === 0 && fresh12.bodyType === '',
    'свежий черновик: presentation «air», немые поля пусты',
    show(fresh12),
  );
  ck(
    !/data-threed-carried/.test(M.panelMarkup(onlyTexture, 'image_to_3d')),
    'свежая форма плитки 12 — строки о реколе нет',
  );

  // Codex 3 · no figure on tile 12.
  ck(
    t12.shape(null, {}) === '1 model' &&
      !/\$/.test(
        M.panelMarkup(
          band({ playgroundWorkflows: ['image_to_3d'], threedOptions: OPTS3 }),
          'image_to_3d',
        ),
      ),
    'плитка 12: «1 model», ни одной суммы в форме',
  );

  // Codex 7 · a model the server no longer lists: the default that replaces it is named.
  const models = [
    { slug: 'openai/gpt-image-2', label: 'GPT Image 2', isDefault: true, qualities: ['medium'] },
    { slug: 'openai/gpt-image-2.5-sunburst', label: 'GPT Image 2.5', qualities: ['medium'] },
  ];
  const ran = (model) => ({
    id: 5,
    kind: 'freeform',
    params: { ...EMPTY_PARAMS, image: { model } },
  });
  ck(
    M.recallEngineNote(ran('google/gemini-3'), band({ imageModels: models })) ===
      'its AI model (google/gemini-3) is no longer offered — GPT Image 2 replaces it',
    'модели больше нет — названа замена по умолчанию',
    String(M.recallEngineNote(ran('google/gemini-3'), band({ imageModels: models }))),
  );
  ck(
    M.recallEngineNote(ran('openai/gpt-image-2.5-sunburst'), band({ imageModels: models })) ===
      null && M.recallEngineNote(ran(''), band({ imageModels: models })) === null,
    'модель есть / не названа — строки нет',
  );
  ck(
    /cannot be chosen on this server/.test(
      M.recallEngineNote(ran('openai/gpt-image-2'), band()) ?? '',
    ),
    'сервер без выбора модели — сказано, что рисует его собственная',
  );

  // n-5 · one name for the door; Scene open (2.png); surface_hint: no field (documented decision).
  ck(
    M.REUSE_LABEL === 'Reuse' &&
      />Reuse</.test(M.panelMarkup(wfBand(), 'change_color')) &&
      !/>reuse</.test(M.panelMarkup(wfBand(), 'create_edit')),
    'дверь называется «Reuse» везде',
  );
  const tryon = M.panelMarkup(wfBand({ imageModels: models }), 'virtual_try_on');
  const scene = tryon.slice(tryon.indexOf('data-fold-section="virtual_try_on.scene"'));
  ck(
    scene.length > 0 &&
      /aria-expanded="true"/.test(scene.slice(0, 1500)) &&
      scene.includes('placeholder="Same as model reference"'),
    'Scene открыта по умолчанию (2.png): Source и поле сцены видны',
  );
}

// ─── X · P-06: ключи фазы 3 — `undefined`, провод прежний ────────────────────────────────────
head('X', 'P-06: новые ключи контракта стоят undefined — тело и пустая полоса прежние');
{
  const params = M.emptyParams();
  ck(
    'inpaint' in params && 'extend' in params,
    'emptyParams() перечисляет inpaint и extend (обязательные ключи сгенерированного типа)',
    Object.keys(params).join(','),
  );
  const body = run('change_color').wire(
    draft({
      images: { photos: [media(11)] },
      texts: { garment: 'jacket' },
      colours: { colour: { code: '19-4052 TCX', hex: '#0f4c81' } },
    }),
    ctx,
  );
  const wire = JSON.parse(JSON.stringify(body));
  ck(
    !('inpaint' in wire.params) && !('extend' in wire.params),
    'тело плитки фазы 1 не везёт inpaint / extend — провод прежний',
    show(wire.params),
  );
  const EMPTY = M.EMPTY_BAND;
  ck(
    'runKinds' in EMPTY && EMPTY.runKinds === undefined,
    'пустая полоса: runKinds ОТСУТСТВУЕТ (старый бинарь), а не пуст (генерация выключена)',
    show(EMPTY.runKinds),
  );
  ck(
    'suggestPromptsModel' in EMPTY && EMPTY.suggestPromptsModel === undefined,
    'пустая полоса: suggestPromptsModel отсутствует — Ideas рисуют только статический список',
    show(EMPTY.suggestPromptsModel),
  );
}

// ─── Y · C-15: вопрос серверу Ideas ─────────────────────────────────────────────────────────────
head('Y', 'C-15: ideasFrom плиток, тело SuggestPrompts, чистка, меню как данные');
{
  const many = [media(301), media(302), media(301), media(0), media(303)];
  const full = draft({
    images: {
      photos: many,
      image: many,
      refs: many,
      model_photo: [media(401)],
      product: [media(402), media(403)],
    },
    slots: {
      images: { design: media(501), fabric: media(502), garment: media(601), logo: media(602) },
    },
  });
  const WANT = {
    'virtual_try_on.pose': [401, 402],
    'virtual_try_on.scene': [401, 402],
    'fabric_to_image.region': [301],
    'ghost_mannequin.garment': [301],
    'change_color.garment': [301],
    'swap_fabrics.garment': [501],
    'add_logo.placement': [601],
    'design_variations.variation': [301],
    'create_edit.prompt': [301, 302],
  };
  const seen = {};
  for (const wf of M.WORKFLOWS) {
    for (const section of wf.run?.sections ?? [])
      for (const f of section.fields)
        if (f.type === 'prompt') {
          const ids = f.ideasFrom ? [...f.ideasFrom(full, ctx).mediaIds] : null;
          seen[`${wf.key}.${f.key}`] = ids;
        }
  }
  for (const [key, want] of Object.entries(WANT))
    ck(
      same(seen[key], want) && seen[key].length <= 2 && seen[key].every((id) => id > 0),
      `${key}: ideasFrom → ${show(want)} (≤ 2, без нулей и повторов)`,
      show(seen[key]),
    );
  ck(
    M.ideaMediaIds(media(1), media(2), media(3)).length === 2 &&
      same(M.ideaMediaIds(media(0), null, media(5), media(5)), [5]),
    'ideaMediaIds: не больше двух, без нулей, пустых и повторов',
  );
  const long = 'ж'.repeat(2100);
  const req = M.suggestRequest(
    'change_color',
    'garment',
    { techCardId: 7, mediaIds: [9, 9, 0, 8, 7], context: long },
    long,
  );
  ck(
    same(req.mediaIds, [9, 8]) &&
      Array.from(req.context).length === 2000 &&
      Array.from(req.text).length === 2000,
    'тело SuggestPrompts: 2 картинки, 2000 рун контекста и текста — до всякой траты',
    show({ ids: req.mediaIds, c: req.context.length, t: req.text.length }),
  );
  ck(
    same(M.cleanServerIdeas([' a  b ', 'A B', '', 7, 'c', 'd', 'e', 'f', 'g']), [
      'a b',
      'c',
      'd',
      'e',
      'f',
    ]),
    'чистка: обрезка, схлопывание, без повторов в любом регистре, не больше пяти',
  );
  const statics = ['one', 'two', 'three'];
  const done = M.ideasMenu(statics, { status: 'done', ideas: ['TWO', 'four'] }, 1);
  ck(
    done.server?.label === 'for this picture' &&
      same(done.server?.ideas, ['TWO', 'four']) &&
      same(done.more, ['one', 'three']),
    'меню: сервер выше, повтор уходит из статических, «for this picture»',
    show(done),
  );
  ck(
    M.ideasMenu(statics, { status: 'failed' }, 1).server === null &&
      M.ideasMenu(statics, { status: 'done', ideas: [] }, 0).server === null &&
      M.ideasMenu(statics, { status: 'off' }, 0).server === null &&
      M.ideasMenu(statics, { status: 'thinking' }, 0).server?.label === 'for this field' &&
      M.ideasMenu(statics, { status: 'thinking' }, 2).server?.label === 'for these pictures',
    'сбой, пустой ответ и «off» — только статические; подпись по числу картинок (0 / 1 / 2)',
  );
  ck(
    M.bandSuggestsPrompts({ suggestPromptsModel: 'google/gemini-3.1-flash-lite' }) &&
      !M.bandSuggestsPrompts({ suggestPromptsModel: '  ' }) &&
      !M.bandSuggestsPrompts({}),
    'поле 33: непустое — да; пустое и отсутствующее — нет',
  );
  const keys = Object.entries(M.PROMPT_IDEAS)
    .flatMap(([wf, fields]) => Object.keys(fields).map((f) => `${wf}.${f}`))
    .sort();
  console.log(`  ключи PROMPT_IDEAS (для сверки с B-15): ${keys.join(' ')}`);
  ck(
    keys.length === 11,
    'ключей PROMPT_IDEAS 11 (9 плиток, у retouch_zone два)',
    String(keys.length),
  );
}

// ─── Z · C-16: прошлые слова карточки ──────────────────────────────────────────────────────────
head('Z', 'C-16: cardRecentTexts по полосе, recentMenu');
{
  const tryon = (id, ask, sceneText) => ({
    id,
    kind: 'freeform',
    ask,
    params: { freeform: { preset: 'tryon', items: [], options: { sceneText } } },
  });
  const retouch = (id, words) => ({
    id,
    kind: 'freeform',
    ask: '',
    params: { freeform: { preset: 'retouch', items: [{ mediaId: 5, texts: [words] }] } },
  });
  const inpaint = (id, ask) => ({
    id,
    kind: 'inpaint',
    ask,
    params: { inpaint: { sourceMediaId: 5 } },
  });
  // Newest first, as the band orders them.
  const runs = [
    tryon(20, 'hands in pockets', 'grey seamless backdrop'),
    inpaint(19, 'remove the stain'),
    // An off-page stub: no params — it gives its `ask` and nothing else.
    { id: 18, kind: 'recolor', ask: 'the sleeves only' },
    retouch(17, 'straighten the hem'),
    { id: 16, kind: 'recolor', ask: 'the cropped jacket', params: { colour: { fabrics: [] } } },
    tryon(15, '  Hands   in pockets ', ''),
    tryon(14, '', 'concrete wall at dusk'),
    {
      id: 13,
      kind: 'freeform',
      ask: 'add sunglasses',
      params: { freeform: { preset: 'free', items: [] } },
    },
  ];
  const band = { runs };
  const cases = [
    ['virtual_try_on', 'pose', ['hands in pockets']],
    ['virtual_try_on', 'scene', ['grey seamless backdrop', 'concrete wall at dusk']],
    ['retouch_zone', 'change_text', ['remove the stain', 'straighten the hem']],
    ['change_color', 'garment', ['the sleeves only', 'the cropped jacket']],
    ['create_edit', 'prompt', ['add sunglasses']],
    ['swap_fabrics', 'garment', []],
    ['retouch_zone', 'zone', []],
    ['nope', 'nothing', []],
  ];
  for (const [wf, f, want] of cases)
    ck(
      same(M.cardRecentTexts(band, wf, f), want),
      `${wf}.${f} → ${show(want)}`,
      show(M.cardRecentTexts(band, wf, f)),
    );
  const nine = { runs: Array.from({ length: 9 }, (_, i) => tryon(100 - i, `pose ${i}`, '')) };
  const got = M.cardRecentTexts(nine, 'virtual_try_on', 'pose');
  ck(
    got.length === 8 && got[0] === 'pose 0' && got[7] === 'pose 7',
    '9 прогонов → 8 текстов, новые сверху',
    show(got),
  );
  const menu = M.recentMenu(
    ['hands in pockets', 'walking toward the camera'],
    ['HANDS in pockets'],
  );
  ck(
    same(menu.card, ['walking toward the camera']) && same(menu.browser, ['HANDS in pockets']),
    'recentMenu: повтор остаётся в браузерной группе',
    show(menu),
  );
}

// ─── AA · C-13: плитка 9 Extend Image ───────────────────────────────────────────────────────────
head('AA', 'C-13 Extend Image: тело extend, ворота по run_kinds, отказы, форма 11.png, рекол');
{
  const sized = (id, width, height) => ({
    id,
    thumbnail: { mediaUrl: `https://x/${id}.jpg` },
    media: { fullSize: { mediaUrl: `https://x/${id}-full.png`, width, height } },
  });
  const ext = run('extend_image');
  const on = band({
    runKinds: ['freeform', 'cutout', 'extend'],
    playgroundWorkflows: ['extend_image'],
  });
  const octx = { band: on };
  ck(!!ext, 'у плитки 9 есть run (фаза 3)');

  // wire — whole body, written by hand.
  const d = draft({ images: { image: [sized(21, 1000, 1500)] } });
  ck(
    same(ext.wire(d, octx), {
      kind: 'extend',
      ask: '',
      params: { ...EMPTY_PARAMS, extraInputMediaIds: [21], extend: { aspectRatio: '2:3' } },
    }),
    'тело по умолчанию: kind extend, ask пуст, одна картинка, extend.aspect_ratio 2:3, без image',
    show(ext.wire(d, octx)),
  );
  const d921 = draft({
    images: { image: [sized(21, 1000, 1500), sized(22, 10, 10)] },
    choices: { [M.EXTEND_FORMAT_KEY]: '9:21' },
  });
  ck(
    same(ext.wire(d921, octx), {
      kind: 'extend',
      ask: '',
      params: { ...EMPTY_PARAMS, extraInputMediaIds: [21], extend: { aspectRatio: '9:21' } },
    }),
    '9:21 уезжает; из двух картинок едет одна (первая)',
    show(ext.wire(d921, octx)),
  );
  ck(
    ext.wire(d, {
      band: band({ runKinds: ['extend'], imageModels: [{ slug: 'm', aspectRatios: ['2:3'] }] }),
    }).params.image === undefined,
    'image не уезжает никогда, и на сервере с моделями (image_options_forbidden)',
  );

  // gate — strictly run_kinds.
  const g = (b) => def('extend_image').gate(b);
  ck(
    same(g(band({ playgroundWorkflows: ['extend_image'] })), {
      available: false,
      reason: 'not on this server yet',
    }),
    'run_kinds нет (старый сервер) → «not on this server yet», даже если плитка в playground_workflows',
    show(g(band({ playgroundWorkflows: ['extend_image'] }))),
  );
  ck(
    same(g(band({ runKinds: ['freeform', 'cutout'] })), {
      available: false,
      reason: 'not wired on this server',
    }),
    'run_kinds без extend → «not wired on this server»',
  );
  ck(
    same(g(band({ runKinds: [] })), { available: false, reason: 'not wired on this server' }),
    'run_kinds пуст → погашена',
  );
  ck(same(g(on), { available: true }), 'run_kinds с extend → живая');
  ck(
    same(g(band({ runKinds: ['extend'], playgroundWorkflows: ['create_edit'] })), {
      available: false,
      reason: 'not wired on this server',
    }),
    'run_kinds с extend, но playground_workflows без extend_image → погашена (G-03 n-1: и список плиток)',
  );
  const oldGrid = M.gridMarkup(band({ playgroundWorkflows: ['create_edit'] }));
  ck(
    !liveKeys(oldGrid).has('extend_image') &&
      /data-workflow-tile="extend_image"[^>]*>[\s\S]*?not on this server yet/.test(oldGrid),
    'сетка старого сервера: плитка 9 приглушена со словами «not on this server yet»',
  );
  ck(
    liveKeys(M.gridMarkup({ ...on, playgroundWorkflows: ['extend_image'] })).has('extend_image'),
    'сетка сервера с extend: плитка 9 живая (кнопка)',
  );
  ck(
    M.openWorkflow('extend_image', band()) === null,
    'старый сервер: ?wf=extend_image не открывает форму',
  );

  // validate — the door's order.
  const v = (dr) => ext.validate(dr, octx)?.reason ?? null;
  ck(
    v(draft({ images: { image: [sized(23, 6000, 4000)] } })) === M.SOURCE_TOO_LARGE &&
      v(draft({ images: { image: [sized(24, 4000, 4500)] } })) === null &&
      M.SOURCE_TOO_LARGE ===
        'this picture is too large to edit here (over 18 MP); downscale it and upload it again',
    'больше 18 МП (6000×4000) — отказ даром до сети; ровно 18 МП (4000×4500) — нет (source_too_large)',
    String(v(draft({ images: { image: [sized(23, 6000, 4000)] } }))),
  );
  ck(v(draft()) === 'add the picture to extend', 'нет картинки → «add the picture to extend»');
  ck(
    v(
      draft({
        images: { image: [sized(21, 1000, 1500)] },
        choices: { [M.EXTEND_FORMAT_KEY]: 'auto' },
      }),
    ) === 'pick the new final format',
    'auto (не из девяти) → «pick the new final format»',
  );
  ck(
    v(
      draft({ images: { image: [sized(21, 50, 80)] }, choices: { [M.EXTEND_FORMAT_KEY]: '16:9' } }),
    ) === 'this picture is 50×80 px; an extend needs at least 64 px on each side',
    'картинка меньше 64 px → отказ размера (раньше формата — порядок двери)',
  );
  ck(
    v(draft({ images: { image: [sized(21, 1000, 1500)] } })) ===
      'this picture is already 2:3 — pick another format',
    '1000×1500 → 2:3: «this picture is already 2:3 — pick another format»',
  );
  ck(
    v(draft({ images: { image: [sized(21, 1003, 1500)] } })) ===
      'this picture is already 2:3 — pick another format',
    '1003×1500 (0.45 % от 2:3) → тоже «already»',
  );
  ck(
    v(draft({ images: { image: [sized(21, 1000, 1450)] } })) === null,
    '1000×1450 (3.4 % от 2:3) → готово: сервер добавит пиксели (допуск сервера 0.5 %, не 5 %)',
    String(v(draft({ images: { image: [sized(21, 1000, 1450)] } }))),
  );
  ck(
    v(draft({ images: { image: [media(21)] } })) === null,
    'размер не указан (0×0) → решает дверь, экран не отказывает',
  );
  ck(
    M.extendTargetAddsNothing(1000, 1000, '1:1') === true &&
      M.extendTargetAddsNothing(1000, 1000, '4:3') === false &&
      M.extendTargetAddsNothing(0, 0, '4:3') === null &&
      M.extendTargetAddsNothing(1000, 1000, '4:5') === null,
    'extendTargetAddsNothing: тот же формат / растёт / нет размера / не из девяти',
  );

  // form — 11.png.
  const html = M.panelMarkup(band({ runKinds: ['extend'] }), 'extend_image');
  const ratios = [...html.matchAll(/>(auto|\d+:\d+)<\/span>/g)].map((m) => m[1]);
  ck(
    html.includes('Image to expand') && /REQUIRED|required/i.test(html),
    'форма: «Image to expand» REQUIRED',
  );
  ck(html.includes('New final format'), 'форма: «New final format» (без моделей на сервере тоже)');
  const grid = html.slice(html.indexOf('data-format-grid'));
  const cells = [...grid.matchAll(/>(auto|\d+:\d+)<\/span>/g)].map((m) => m[1]);
  ck(
    same(cells, ['9:16', '1:1', '3:4', '2:3', '16:9', '4:3', '3:2', '21:9', '9:21']),
    'сетка: ровно девять форматов владельца по порядку 11.png, без auto, с 9:21',
    show(cells),
  );
  ck(
    ratios.includes('2:3') && ratios.indexOf('2:3') < ratios.indexOf('9:16'),
    'шапка New final format показывает 2:3',
    show(ratios),
  );
  ck((html.match(/data-format-grid/g) ?? []).length === 1, 'New final format открыт по умолчанию');
  ck(!html.includes('<textarea'), 'нет поля промпта');
  ck(!html.includes('AI model'), 'нет складки AI model');

  // run → tile, representation, recall target.
  ck(
    M.workflowOfRun({ kind: 'extend', params: {} }) === 'extend_image',
    'workflowOfRun(extend) → extend_image',
  );
  ck(
    M.workflowOfRun({ kind: 'extend' }) === 'extend_image',
    'заглушка extend без params → extend_image',
  );
  ck(
    M.workflowOfRun({ kind: 'inpaint', params: {} }) === 'retouch_zone',
    'workflowOfRun(inpaint) → retouch_zone',
  );
  ck(
    M.runRepresentation({ kind: 'extend' }) === 'playground' &&
      M.runRepresentation({ kind: 'inpaint' }) === 'playground' &&
      M.inPlaygroundRoom({ kind: 'extend' }),
    'runRepresentation(extend|inpaint) → playground (комната)',
  );
  ck(
    M.recallTargetKind({ kind: 'extend' }, 'input') === 'playground' &&
      M.recallTargetKind({ kind: 'inpaint' }, 'input') === 'playground',
    'recallTargetKind(extend|inpaint) → playground',
  );
  ck(
    M.runWorkflowWord({ kind: 'extend', params: {} }) === 'extend image',
    'слово под результатом: «extend image»',
  );
  const r = ext.results;
  ck(
    r.match({ kind: 'extend', params: {} }) && !r.match({ kind: 'cutout', params: {} }),
    'итоги плитки 9 — только прогоны extend',
  );

  // recall: body → draft → the same body.
  const body = ext.wire(d921, octx);
  const pic = sized(21, 1000, 1500);
  const back = ext.recall({ kind: 'extend', params: body.params }, new Map([[21, pic]]), octx);
  ck(
    same(ext.wire(back.draft, octx), body) && back.lost === 0,
    'рекол: тело → черновик → то же тело',
  );
  const gone = ext.recall({ kind: 'extend', params: body.params }, new Map(), octx);
  ck(
    gone.lost === 1 && (gone.draft.images.image ?? []).length === 0,
    'рекол без картинки в снимке: lost 1',
  );
  const odd = ext.recall(
    { kind: 'extend', params: { ...body.params, extend: { aspectRatio: '5:4' } } },
    new Map([[21, pic]]),
    octx,
  );
  ck(
    odd.draft.choices[M.EXTEND_FORMAT_KEY] === '2:3' && odd.said.length === 1,
    'рекол с форматом не из девяти: 2:3 и слова об этом',
    show(odd),
  );
}

// ─── AB · C-14: маршрут маски плитки 10 ─────────────────────────────────────────────────────────
head(
  'AB',
  'C-14 Retouch: маршрут маски (inpaint), загрузка маски раз на краску, строки по маршруту',
);
await (async () => {
  const sized = (id, width, height) => ({
    id,
    thumbnail: { mediaUrl: `https://x/${id}.jpg` },
    media: { fullSize: { mediaUrl: `https://x/${id}-full.png`, width, height } },
  });
  const NEW = band({ runKinds: ['freeform', 'inpaint'], playgroundWorkflows: ['retouch_zone'] });
  const OLD = band({ playgroundWorkflows: ['retouch_zone'] });
  const NO_INPAINT = band({ runKinds: ['freeform'], playgroundWorkflows: ['retouch_zone'] });
  const pic = sized(800, 1024, 1536);
  const bare = media(801);
  const stroke = [{ size: 0.03, points: [{ x: 0.5, y: 0.5 }] }];
  const zone = M.zoneOfStrokes(stroke, 1024 / 1536);

  // the route
  ck(M.retouchRoute(OLD, pic) === 'window', 'старый сервер (run_kinds нет) → окно фазы 2');
  ck(M.retouchRoute(NO_INPAINT, pic) === 'window', 'run_kinds без inpaint → окно');
  ck(M.retouchRoute(NEW, pic) === 'mask', 'run_kinds с inpaint и размер картинки известен → маска');
  ck(
    M.retouchRoute(NEW, bare) === 'window',
    'маска предложена, но размер 0×0 → окно для ЭТОЙ картинки',
  );
  ck(
    M.retouchPriceLine(NEW, bare) ===
      'this picture states no size; the rectangle path is used · 1 picture · priced by the server when the run starts' &&
      M.retouchPriceLine(NEW, pic) === '1 picture · priced by the server when the run starts' &&
      M.retouchPriceLine(OLD, bare) === '1 picture · priced by the server when the run starts',
    'строка цены: «states no size» только где маска предложена, а картинка без размера',
    M.retouchPriceLine(NEW, bare),
  );

  // one RetouchInput, two bodies (written by hand)
  const input = { media: pic, zone, painted: true, words: '  remove the stain  ' };
  const window = M.retouchRequest({ ...input, route: 'window' });
  ck(
    window.kind === 'freeform' &&
      window.ask === '' &&
      window.params.freeform.preset === 'retouch' &&
      window.params.freeform.items[0].mediaId === 800 &&
      window.params.freeform.items[0].texts[0] === 'remove the stain' &&
      window.params.inpaint === undefined,
    'окно: тело фазы 2 (freeform/retouch, слова в texts[0]), inpaint не уезжает',
    show(window),
  );
  const mask = M.retouchRequest({ ...input, route: 'mask', maskMediaId: 5001 });
  ck(
    same(mask, {
      kind: 'inpaint',
      ask: 'remove the stain',
      params: { ...EMPTY_PARAMS, inpaint: { sourceMediaId: 800, maskMediaId: 5001 } },
    }),
    'маска: kind inpaint, ask = слова, params.inpaint = {800, 5001}, больше ничего',
    show(mask),
  );
  ck(
    same(M.retouchRequest({ ...input, route: 'mask' }), window),
    'маршрут маски без загруженной маски (0) — тело не inpaint: маска приходит только с нажатием',
  );

  // refusals on the mask route: no hull
  ck(
    M.retouchRefusal({ media: pic, zone: null, painted: true, words: 'x', route: 'mask' }) === null,
    'маска: нарисованное без годной оболочки не отказывает (оболочка не уезжает)',
  );
  ck(
    M.retouchRefusal({ media: pic, zone: null, painted: true, words: 'x', route: 'window' })
      ?.reason === 'the painted zone is too small: paint a larger one',
    'окно: та же краска — «too small», как в фазе 2',
  );
  ck(
    M.retouchRefusal({ media: pic, zone: null, painted: false, words: 'x', route: 'mask' })
      ?.reason === 'paint the zone to change' &&
      M.retouchRefusal({ media: pic, zone: null, painted: true, words: ' ', route: 'mask' })
        ?.reason === 'describe what should be there' &&
      M.retouchRefusal({
        media: sized(9, 40, 90),
        zone: null,
        painted: true,
        words: 'x',
        route: 'mask',
      })?.reason === 'this picture is 40×90 px; a retouch needs at least 64 px on each side',
    'маска: порядок двери — картинка → краска → слова → размер',
  );

  // the uploader: once per paint
  let uploads = 0;
  let painted = 0;
  const up = M.createMaskUploader(
    async (strokes, w, h) => {
      painted++;
      return `data:image/png;base64,${w}x${h}:${strokes.length}`;
    },
    async () => 5000 + ++uploads,
  );
  const a1 = await up.maskFor(800, stroke, 1024, 1536);
  const a2 = await up.maskFor(800, stroke, 1024, 1536);
  ck(
    a1 === a2 && uploads === 1,
    'та же краска дважды → одна загрузка, тот же id',
    `${a1} ${a2} (${uploads})`,
  );
  const both = await Promise.all([
    up.maskFor(800, [...stroke, ...stroke], 1024, 1536),
    up.maskFor(800, [...stroke, ...stroke], 1024, 1536),
  ]);
  ck(
    both[0] === both[1] && uploads === 2,
    'новая краска → новая загрузка; два быстрых нажатия — одна',
    `${both} (${uploads})`,
  );
  const again = await up.maskFor(800, stroke, 1024, 1536);
  ck(
    again === a1 && uploads === 2,
    'назад к краске, уже загруженной (штрих, затем undo), — её маска, без новой загрузки',
    `${again} ${a1} (${uploads})`,
  );
  ck(
    M.maskKey(800, stroke, 1024, 1536) !== M.maskKey(801, stroke, 1024, 1536) &&
      M.maskKey(800, stroke, 1024, 1536) !== M.maskKey(800, stroke, 1024, 1537),
    'ключ краски различает картинку и её размер',
  );
  const body1 = M.retouchRequest({ ...input, route: 'mask', maskMediaId: a1 });
  const body2 = M.retouchRequest({ ...input, route: 'mask', maskMediaId: a2 });
  ck(
    same(body1, body2),
    'два нажатия одной краски → одно и то же тело (отпечаток журнала повторится)',
  );
  let fails = 1;
  let tries = 0;
  const flaky = M.createMaskUploader(
    async () => 'data:image/png;base64,AA',
    async () => {
      tries++;
      if (fails-- > 0) throw new Error('network');
      return 77;
    },
  );
  const firstTry = await flaky.maskFor(1, stroke, 10, 10).catch((e) => e.message);
  const secondTry = await flaky.maskFor(1, stroke, 10, 10);
  ck(
    firstTry === 'network' && secondTry === 77 && tries === 2,
    'сбой загрузки не запоминается: следующее нажатие грузит снова',
  );
  const noCanvas = M.createMaskUploader(
    async () => null,
    async () => 1,
  );
  const notDrawn = await noCanvas.maskFor(1, stroke, 10, 10).catch((e) => e);
  ck(
    notDrawn instanceof M.MaskNotDrawn &&
      notDrawn.message === 'this browser could not draw the mask at 10×10 px',
    'маску не нарисовать (холст) → MaskNotDrawn со словами, без загрузки',
    String(notDrawn?.message),
  );

  // caveat per route — the panel and the editor read one function
  ck(
    M.retouchCaveat(OLD) === M.RETOUCH_CAVEAT &&
      M.retouchCaveat(NEW) === M.RETOUCH_MASK_CAVEAT &&
      M.retouchCaveat(NEW, bare) === M.RETOUCH_CAVEAT &&
      M.RETOUCH_MASK_CAVEAT === 'Only the painted zone changes; everything else keeps its pixels.',
    'честная строка: окно — «rectangle may change», маска — «only the painted zone», без размера — окно',
  );
  const pNew = M.panelMarkup(NEW, 'retouch_zone');
  const pOld = M.panelMarkup(OLD, 'retouch_zone');
  ck(
    pNew.includes('Only the painted zone changes') &&
      !pNew.includes('The rectangle around your zone may change'),
    'панель плитки 10 на сервере с inpaint: строки про прямоугольник нет',
  );
  ck(
    pOld.includes('The rectangle around your zone may change') &&
      !pOld.includes('Only the painted zone'),
    'панель плитки 10 на старом сервере: прежняя строка',
  );

  // run → tile, source, recall
  const INPAINT = {
    id: 93,
    kind: 'inpaint',
    status: 'done',
    ask: 'a clean pocket',
    params: { ...EMPTY_PARAMS, inpaint: { sourceMediaId: 800, maskMediaId: 5001 } },
  };
  ck(
    M.retouchSourceId(INPAINT) === 800,
    'retouchSourceId(inpaint) = params.inpaint.source_media_id',
  );
  ck(M.retouchSourceId({ kind: 'inpaint' }) === 0, 'заглушка inpaint без params → 0');
  const rec = run('retouch_zone').recall(INPAINT, new Map([[800, pic]]), { band: NEW });
  ck(
    rec.draft.texts.change_text === 'a clean pocket' &&
      (rec.draft.images.source ?? [])[0]?.id === 800 &&
      rec.draft.flags[M.RETOUCH_MASKING_KEY] === true &&
      rec.lost === 0,
    'рекол inpaint: картинка в слоте, маска открыта, слова из ask',
    show(rec.draft),
  );
  ck(
    M.maskableRun({ kind: 'extend' }) &&
      M.maskableRun({ kind: 'inpaint' }) &&
      !M.maskableRun({ kind: 'threed' }),
    'maskableRun: ответы extend и inpaint — растры, угол Mask у них есть',
  );
  ck(
    !M.retouchOffered(band({ runKinds: ['inpaint'], playgroundWorkflows: ['create_edit'] })),
    'inpaint в run_kinds без retouch_zone в списке: Mask не предлагается (плитка решает)',
  );
})();

// ─── AC · G-03 client fix: бюджет холста, повёрнутый файл, хранилище маски, слова панели ───────
head('AC', 'G-03: бюджет холста маски (M-1), повёрнутый файл (m-1), маска переживает редактор');
await (async () => {
  const sized = (id, width, height) => ({
    id,
    thumbnail: { mediaUrl: `https://x/${id}.jpg` },
    media: { fullSize: { mediaUrl: `https://x/${id}-full.jpg`, width, height } },
  });
  const NEW = band({ runKinds: ['freeform', 'inpaint'], playgroundWorkflows: ['retouch_zone'] });
  const OLD = band({ playgroundWorkflows: ['retouch_zone'] });
  const base = '1 picture · priced by the server when the run starts';

  // M-1 · the budget
  ck(
    M.MASK_MAX_AREA === 16777216 &&
      M.maskDrawable(4096, 4096) &&
      M.maskDrawable(2048, 8192) &&
      !M.maskDrawable(4097, 4096) &&
      !M.maskDrawable(6000, 4000) &&
      !M.maskDrawable(16385, 10) &&
      !M.maskDrawable(0, 10),
    'бюджет маски: 4096² пикселей и 16384 на сторону — больше не рисуется',
  );
  const big = sized(900, 6000, 4000);
  const ok = sized(901, 1024, 1536);
  ck(
    M.retouchRoute(NEW, big) === 'window' &&
      M.retouchWindowReason(NEW, big) === M.RETOUCH_TOO_LARGE &&
      M.retouchPriceLine(NEW, big) === `${M.RETOUCH_TOO_LARGE} · ${base}` &&
      M.retouchCaveat(NEW, big) === M.RETOUCH_CAVEAT,
    '24 МП на сервере с маской: окно, строка цены «cannot draw a mask this size», строка про прямоугольник',
    M.retouchPriceLine(NEW, big),
  );
  ck(
    M.RETOUCH_TOO_LARGE === 'this browser cannot draw a mask this size; the rectangle path is used',
    'слова отката: одна строка',
  );
  ck(
    M.retouchRoute(NEW, ok, false) === 'window' &&
      M.retouchPriceLine(NEW, ok, false) === `${M.RETOUCH_TOO_LARGE} · ${base}` &&
      M.retouchRoute(NEW, ok) === 'mask' &&
      M.retouchWindowReason(NEW, ok) === null,
    'холст отказал при нажатии (canDraw=false) → та же картинка идёт окном и говорит почему',
  );
  ck(
    M.retouchWindowReason(OLD, big) === null && M.retouchPriceLine(OLD, big) === base,
    'старый сервер: причины отката нет (маски и не предлагали)',
  );

  // m-1 (Codex r2) · the shown file's orientation, from its tag: the refusal on both routes
  const stored = sized(902, 1000, 800);
  const words = { zone: M.zoneOfStrokes([{ size: 0.03, points: [{ x: 0.5, y: 0.5 }] }], 0.8) };
  for (const route of ['mask', 'window'])
    ck(
      M.retouchRefusal({
        media: stored,
        ...words,
        painted: true,
        words: 'x',
        route,
        orientation: 6,
      })?.reason === M.RETOUCH_TURNED &&
        M.retouchRefusal({
          media: stored,
          ...words,
          painted: false,
          words: '',
          route,
          orientation: 6,
        })?.reason === M.RETOUCH_TURNED &&
        M.retouchRefusal({
          media: stored,
          ...words,
          painted: true,
          words: 'x',
          route,
          orientation: 1,
        }) === null &&
        M.retouchRefusal({ media: stored, ...words, painted: true, words: 'x', route }) === null,
      `${route}: файл с тегом 6 отказан даром, до краски; тег 1 и «не спрашивали» — нет`,
    );

  // BLOCKER · the mask id outlives the uploader (a closed editor)
  const shelf = new Map();
  const store = {
    recall: (mediaId, key) => shelf.get(`${mediaId}|${key}`),
    keep: (mediaId, key, id) => shelf.set(`${mediaId}|${key}`, id),
  };
  let ups = 0;
  const paintOf = async () => 'data:image/png;base64,AA';
  const uploadOf = async () => 7000 + ++ups;
  const stroke = [{ size: 0.03, points: [{ x: 0.4, y: 0.4 }] }];
  const first = await M.createMaskUploader(paintOf, uploadOf, store).maskFor(
    901,
    stroke,
    1024,
    1536,
  );
  const reopened = await M.createMaskUploader(paintOf, uploadOf, store).maskFor(
    901,
    stroke,
    1024,
    1536,
  );
  ck(
    first === 7001 && reopened === 7001 && ups === 1,
    'новый загрузчик (редактор закрыт и открыт) с тем же хранилищем — та же маска, без загрузки',
    `${first} ${reopened} (${ups})`,
  );
  const other = await M.createMaskUploader(paintOf, uploadOf, store).maskFor(
    901,
    [...stroke, ...stroke],
    1024,
    1536,
  );
  ck(other === 7002 && ups === 2, 'другая краска — новая маска');

  // m-2 · n-2 · the panel's words
  const pNew = M.panelMarkup(NEW, 'retouch_zone');
  const pOld = M.panelMarkup(OLD, 'retouch_zone');
  ck(
    pNew.includes(M.RETOUCH_PANEL_FALLBACK) && !pOld.includes(M.RETOUCH_PANEL_FALLBACK),
    'панель на сервере с маской говорит, что не каждая картинка идёт маской (n-2); старый сервер — нет',
  );
  ck(
    !pNew.includes('generated in place') && pNew.includes('nothing is overwritten'),
    'панель: ответ — новая картинка рядом, ничего не перезаписано (m-2)',
  );
})();

// ─── AD · submit_unconfirmed словами (G-03, бэкенд d8b7bca) ─────────────────────────────────────
head('AD', 'G-03: submit_unconfirmed — «провайдер не подтвердил, мог списать, не повторяется»');
{
  const WORDS =
    'the provider did not confirm the request; it may have been charged; this run is not retried automatically';
  const failed = {
    id: 1,
    kind: 'inpaint',
    status: 'failed',
    errorCode: 'submit_unconfirmed',
    lastError: 'fal: submit unconfirmed: the provider may have been charged; reconcile with fal',
  };
  ck(
    M.runOutcomeNote(failed) === `failed · ${WORDS}`,
    'исход прогона (история, пин итогов плейграунда): словами, а не голым кодом',
    M.runOutcomeNote(failed),
  );
  ck(
    M.runOutcomeChip(failed).startsWith('failed · the provider did not confirm') &&
      M.runOutcomeChip(failed).endsWith('…'),
    'пилюля: те же слова, усечены по ширине (целиком — в title)',
    M.runOutcomeChip(failed),
  );
  const f = M.runFailureText(failed);
  ck(
    f.code === 'submit_unconfirmed' && f.words === WORDS && f.text.includes('reconcile with fal'),
    'выноска панели: код, слова и текст сервера',
    JSON.stringify(f),
  );
  ck(
    M.runCodeWords('submit_unconfirmed') === WORDS &&
      M.runCodeWords(' source_too_small ') === 'source_too_small' &&
      M.runOutcomeNote({ ...failed, errorCode: 'job_too_large' }) === 'failed · job_too_large' &&
      M.runFailureText({ errorCode: 'job_too_large' }).words === '',
    'прочие коды (job_too_large, source_too_small) — как сервер их пишет',
  );
  ck(
    M.runOutcomeNote({ ...failed, status: 'cancelled' }) === `cancelled · ${WORDS}`,
    'отменённый с этим кодом — те же слова',
  ); // G-03 r2 (backend): two waits of a live run and the 18 MP refusal, in words
  ck(
    M.runOutcomeNote({ id: 2, kind: 'extend', status: 'pending', errorCode: 'submit_settling' }) ===
      'pending · waiting for the provider to confirm the earlier request' &&
      M.runOutcomeNote({
        id: 3,
        kind: 'inpaint',
        status: 'running',
        errorCode: 'paid_collect_waiting',
      }) === 'running · already paid, waiting to collect the result' &&
      M.runOutcomeNote({
        id: 4,
        kind: 'extend',
        status: 'pending',
        errorCode: 'provider_timeout',
      }) === 'retrying · provider_timeout' &&
      M.runFailureText({ errorCode: 'paid_collect_waiting' }).code === 'paid_collect_waiting',
    'submit_settling / paid_collect_waiting: живой прогон «ждёт» словами (не «retrying»), код в панели цел',
  );
  ck(
    M.runOutcomeNote({ id: 5, kind: 'extend', status: 'failed', errorCode: 'source_too_large' }) ===
      'failed · the picture is too large to edit here (over 18 MP); downscale it and try again',
    'source_too_large словами',
  );
}

// ─── AE · G-03 Codex r2: ориентация из байтов, сравни-и-удали, хранилище, срок и отказ маски ────
head(
  'AE',
  'G-03 r2: EXIF из байтов, черновик краски (CAS, оператор, хранилище), срок и отказ маски',
);
await (async () => {
  const sized = (id, width, height) => ({
    id,
    media: { thumbnail: { mediaUrl: `https://x/${id}.jpg` }, fullSize: { width, height } },
  });

  // ── 4 · the EXIF parser, on hand-built byte fixtures ──
  const tiff = (order, orientation, withTag = true) => {
    const le = order === 'II';
    const u16 = (v) => (le ? [v & 255, v >> 8] : [v >> 8, v & 255]);
    const u32 = (v) =>
      le
        ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24]
        : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255];
    // IFD0 at 8: an ImageWidth entry first (so the tag is not simply the first), then Orientation.
    const entries = [[...u16(0x0100), ...u16(3), ...u32(1), ...u16(640), 0, 0]];
    if (withTag) entries.push([...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0]);
    return Uint8Array.from([
      ...[...order].map((c) => c.charCodeAt(0)),
      ...u16(42),
      ...u32(8),
      ...u16(entries.length),
      ...entries.flat(),
      ...u32(0),
    ]);
  };
  const bytes = (s) => [...s].map((c) => c.charCodeAt(0));
  const be16 = (v) => [v >> 8, v & 255];
  const jpeg = (block) => {
    const app0 = [0xff, 0xe0, ...be16(16), ...bytes('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0];
    const xmp = [0xff, 0xe1, ...be16(2 + 5), ...bytes('http:')]; // an APP1 that is not EXIF
    const app1 = block
      ? [0xff, 0xe1, ...be16(2 + 6 + block.length), ...bytes('Exif\0\0'), ...block]
      : [];
    return Uint8Array.from([0xff, 0xd8, ...app0, ...xmp, ...app1, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
  };
  const png = (block) => {
    const len = (n) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
    const ch = (type, data) => [...len(data.length), ...bytes(type), ...data, 0, 0, 0, 0];
    return Uint8Array.from([
      0x89,
      ...bytes('PNG\r\n\x1a\n'),
      ...ch('IHDR', new Array(13).fill(0)),
      ...(block ? ch('eXIf', [...block]) : []),
      ...ch('IDAT', [1, 2, 3]),
      ...ch('IEND', []),
    ]);
  };
  const webp = (block, prefix) => {
    const le32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24];
    const data = block ? [...(prefix ? bytes('Exif\0\0') : []), ...block] : [];
    const pad = data.length & 1 ? [0] : [];
    const vp8x = [...bytes('VP8X'), ...le32(10), ...new Array(10).fill(0)];
    const img = [...bytes('VP8L'), ...le32(5), 1, 2, 3, 4, 5, 0];
    const exif = block ? [...bytes('EXIF'), ...le32(data.length), ...data, ...pad] : [];
    const body = [...bytes('WEBP'), ...vp8x, ...img, ...exif];
    return Uint8Array.from([...bytes('RIFF'), ...le32(body.length), ...body]);
  };
  const o = M.exifOrientation;
  ck(
    o(jpeg(tiff('II', 6))) === 6 && o(jpeg(tiff('MM', 6))) === 6 && o(jpeg(tiff('MM', 3))) === 3,
    'JPEG APP1 «Exif»: тег 0x0112 в обоих порядках байт (II и MM), после APP0 и чужого APP1',
    `${o(jpeg(tiff('II', 6)))} ${o(jpeg(tiff('MM', 6)))} ${o(jpeg(tiff('MM', 3)))}`,
  );
  ck(
    o(jpeg(null)) === 1 && o(jpeg(tiff('II', 6, false))) === 1 && o(jpeg(tiff('II', 9))) === 1,
    'JPEG без EXIF, EXIF без тега, тег вне 1–8 → 1 («как хранится»)',
  );
  ck(
    o(png(tiff('MM', 8))) === 8 && o(png(null)) === 1,
    'PNG: eXIf до IDAT читается; без него — 1',
    `${o(png(tiff('MM', 8)))} ${o(png(null))}`,
  );
  ck(
    o(webp(tiff('II', 5), false)) === 5 &&
      o(webp(tiff('II', 7), true)) === 7 &&
      o(webp(null)) === 1,
    'WebP: чанк EXIF (голый TIFF и с префиксом «Exif\\0\\0»); без него — 1',
    `${o(webp(tiff('II', 5), false))} ${o(webp(tiff('II', 7), true))}`,
  );
  const cut = jpeg(tiff('MM', 6)).slice(0, 40);
  ck(
    o(cut) === 1 &&
      o(new Uint8Array(0)) === 1 &&
      o(Uint8Array.from([0xff, 0xd8, 0xff])) === 1 &&
      o(Uint8Array.from(bytes('GIF89a'))) === 1,
    'обрезанный файл, пустой, мусор, GIF → 1 и без исключения',
  );
  // the decision: from the tag, never from the proportion
  const squareish = sized(910, 1000, 995);
  const cropped = sized(911, 1011, 1000);
  const ready = (media, orientation) =>
    M.retouchRefusal({ media, zone: null, painted: true, words: 'x', route: 'mask', orientation });
  ck(
    ready(squareish, 6)?.reason === M.RETOUCH_TURNED &&
      ready(squareish, 8)?.reason === M.RETOUCH_TURNED &&
      ready(squareish, o(jpeg(tiff('MM', 6))))?.reason === M.RETOUCH_TURNED,
    '1000×995 с тегом 6/8 (эвристика r1 его пропускала) — отказ даром',
  );
  ck(
    ready(cropped, 1) === null && ready(cropped, o(jpeg(null))) === null,
    '1011×1000 без тега (эвристика r1 его отказывала) — не отказ',
  );
  ck(
    ready(squareish, 3)?.reason === M.RETOUCH_TURNED &&
      ready(squareish, 2)?.reason === M.RETOUCH_TURNED,
    'тег 3 (вверх ногами) и 2 (зеркало) тоже двигают зону — отказ',
  );
  ck(
    ready(sized(912, 6000, 4000), 1)?.reason === M.SOURCE_TOO_LARGE &&
      M.retouchRefusal({
        media: sized(912, 6000, 4000),
        zone: null,
        painted: false,
        words: '',
        route: 'window',
        orientation: 1,
      })?.reason === M.SOURCE_TOO_LARGE &&
      ready(sized(913, 4000, 4500), 1) === null,
    'ретушь больше 18 МП — отказ на обоих маршрутах, ещё до краски; 18 МП ровно — нет',
  );
  ck(
    ready(squareish, 'reading')?.reason === M.RETOUCH_READING &&
      ready(squareish, 'unknown')?.reason === M.RETOUCH_UNREADABLE &&
      M.orientationMoves(1) === false,
    'пока тег читается — «checking the picture…»; файл не прочитан — отказ, а не догадка',
  );

  // ── the kept paint: a fake tab (sessionStorage) and two operators (localStorage.authToken) ──
  const jwt = (sub) => `x.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.y`;
  const session = new Map();
  let full = false;
  const local = new Map([['authToken', jwt('operator-a')]]);
  globalThis.window = {
    sessionStorage: {
      getItem: (k) => session.get(k) ?? null,
      setItem: (k, v) => {
        if (full) throw new Error('QuotaExceededError');
        session.set(k, String(v));
      },
    },
    localStorage: { getItem: (k) => local.get(k) ?? null },
  };
  const A = [
    {
      size: 0.03,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.1 },
      ],
    },
  ];
  const B = [...A, { size: 0.06, points: [{ x: 0.7, y: 0.8 }] }];
  const at = M.maskDraftAt(7, 900);
  const keyA = M.maskKey(900, A, 800, 1000);
  const keyB = M.maskKey(900, B, 800, 1000);
  // press A (its answer lost), then B
  M.recordPress(at, {
    strokes: A,
    words: 'a pocket',
    mask: { key: keyA, id: 6001 },
    sent: 'wire-A',
  });
  const pressedA = { paint: M.paintSignature(A, 'a pocket'), sent: 'wire-A' };
  M.writeMaskDraft(at, { strokes: B, words: 'a pocket' });
  M.recordPress(at, {
    strokes: B,
    words: 'a pocket',
    mask: { key: keyB, id: 6002 },
    sent: 'wire-B',
  });
  const pressedB = { paint: M.paintSignature(B, 'a pocket'), sent: 'wire-B' };
  const lateA = M.forgetMaskDraft(at, pressedA);
  ck(
    lateA === false &&
      JSON.stringify(M.readMaskDraft(at)?.strokes) === JSON.stringify(B) &&
      M.keptMaskId(at, keyB) === 6002,
    'BLOCKER: поздний «принят» для A не удаляет черновик B — краска и маска B на месте',
    JSON.stringify({ lateA, draft: M.readMaskDraft(at) }),
  );
  // an unpressed edit after A: A's paint no longer on screen → kept
  const at2 = M.maskDraftAt(7, 901);
  M.recordPress(at2, { strokes: A, words: 'w', sent: 'wire-A2' });
  M.writeMaskDraft(at2, { strokes: B, words: 'w' });
  ck(
    M.forgetMaskDraft(at2, { paint: M.paintSignature(A, 'w'), sent: 'wire-A2' }) === false &&
      !!M.readMaskDraft(at2),
    'краска изменена после нажатия A (не нажата) — ответ A её не стирает',
  );
  ck(
    M.forgetMaskDraft(at, pressedB) === true && M.readMaskDraft(at) === null,
    'ответ ровно на тот запрос и ту краску — черновик забыт',
  );
  // the operator is taken at the press: A's late answer after B signs in touches only A's draft
  const atOpA = M.maskDraftAt(7, 902);
  M.recordPress(atOpA, { strokes: A, words: 'mine', sent: 'wire-opA' });
  local.set('authToken', jwt('operator-b'));
  const atOpB = M.maskDraftAt(7, 902);
  M.recordPress(atOpB, { strokes: A, words: 'mine', sent: 'wire-opA' });
  const spentA = M.forgetMaskDraft(atOpA, { paint: M.paintSignature(A, 'mine'), sent: 'wire-opA' });
  ck(
    atOpA !== atOpB && spentA && M.readMaskDraft(atOpA) === null && !!M.readMaskDraft(atOpB),
    'адрес с оператором, взятый при нажатии: поздний ответ A после входа B стирает только черновик A',
  );
  local.set('authToken', jwt('operator-a'));

  // ── 2 · storage that refuses is SAID, and the reload gives back the same mask ──
  const at3 = M.maskDraftAt(7, 903);
  const keyC = M.maskKey(903, B, 800, 1000);
  ck(
    M.recordPress(at3, {
      strokes: B,
      words: 'kept',
      mask: { key: keyC, id: 7003 },
      sent: 'wire-C',
    }) === true,
    'запись в sessionStorage прошла — true',
  );
  M.resetMaskDraftsForProbe();
  ck(
    M.keptMaskId(at3, keyC) === 7003 &&
      JSON.stringify(M.readMaskDraft(at3)?.strokes) === JSON.stringify(B) &&
      M.readMaskDraft(at3)?.sent === 'wire-C',
    'перезагрузка (память сброшена): краска, запрос и id маски из sessionStorage, тот же ключ маски',
    JSON.stringify(M.readMaskDraft(at3)),
  );
  const stored = JSON.parse(session.get(M.MASK_DRAFT_STORAGE_KEY))[at3];
  ck(
    Array.isArray(stored.s) &&
      typeof stored.s[0][0] === 'number' &&
      stored.m &&
      stored.m.s === undefined,
    'хранится плоско: мазок — список чисел, маска своих мазков не повторяет',
    JSON.stringify(stored),
  );
  full = true;
  ck(
    M.writeMaskDraft(at3, { strokes: A, words: 'x' }) === false &&
      M.recordPress(at3, { strokes: A, words: 'x', sent: 'wire-D' }) === false &&
      M.keepMaskId(at3, keyC, 1) === false,
    'хранилище отказало (квота) — каждая запись говорит false (редактор не шлёт платный запрос)',
  );
  full = false;
  // the r1 shape (objects, the full key) still reads back into the same mask
  const at4 = M.maskDraftAt(7, 904);
  session.set(
    M.MASK_DRAFT_STORAGE_KEY,
    JSON.stringify({
      [at4]: {
        strokes: A,
        words: 'old',
        mask: { key: JSON.stringify([904, 800, 1000, A]), id: 5004 },
      },
    }),
  );
  M.resetMaskDraftsForProbe();
  ck(
    M.keptMaskId(at4, M.maskKey(904, A, 800, 1000)) === 5004 &&
      M.readMaskDraft(at4)?.words === 'old',
    'черновик формата r1 читается: та же маска под новым ключом',
  );

  // ── 5 · a mask the door refused is forgotten, here and where it is kept ──
  ck(
    M.maskRefused({
      status: 400,
      details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'mask_invalid' }],
    }) &&
      M.maskRefused({ status: 400, details: [{ reason: 'mask_size_mismatch' }] }) &&
      !M.maskRefused({ status: 400, details: [{ reason: 'words_required' }] }) &&
      !M.maskRefused({ status: 400 }),
    'отказ по маске (mask_invalid, mask_size_mismatch) узнаётся; прочие отказы — нет',
  );
  let ups = 0;
  const shelf = new Map();
  const store = {
    recall: (m, k) => shelf.get(`${m}|${k}`),
    keep: (m, k, id) => shelf.set(`${m}|${k}`, id),
    forget: (m, k) => shelf.delete(`${m}|${k}`),
  };
  const paintOf = async () => 'data:image/png;base64,AA';
  const up = M.createMaskUploader(paintOf, async () => 8000 + ++ups, store);
  const first = await up.maskFor(905, A, 800, 1000);
  const same = await up.maskFor(905, A, 800, 1000);
  up.forget(905, A, 800, 1000);
  const after = await up.maskFor(905, A, 800, 1000);
  ck(
    first === 8001 &&
      same === 8001 &&
      after === 8002 &&
      shelf.get(`905|${M.maskKey(905, A, 800, 1000)}`) === 8002,
    'forget после отказа: следующее нажатие грузит маску заново (и в памяти, и в хранилище)',
    `${first} ${same} ${after}`,
  );
  const at5 = M.maskDraftAt(7, 906);
  const keyE = M.maskKey(906, A, 800, 1000);
  M.recordPress(at5, { strokes: A, words: 'w', mask: { key: keyE, id: 9006 }, sent: 's' });
  M.forgetMaskId(at5, M.maskKey(906, B, 800, 1000));
  const kept = M.keptMaskId(at5, keyE);
  M.forgetMaskId(at5, keyE);
  ck(
    kept === 9006 && M.keptMaskId(at5, keyE) === undefined && !!M.readMaskDraft(at5),
    'forgetMaskId: только маска с этим ключом, краска остаётся',
  );

  // ── 3 · an upload that never answers is given up; its late id is nobody's ──
  let release;
  let sent = 0;
  const kept3 = new Map();
  const slow = M.createMaskUploader(
    paintOf,
    () => {
      sent++;
      return sent === 1 ? new Promise((res) => (release = res)) : Promise.resolve(9100 + sent);
    },
    { recall: (m, k) => kept3.get(k), keep: (m, k, id) => kept3.set(k, id) },
    60,
  );
  const stalled = await Promise.race([
    slow.maskFor(907, A, 800, 1000).then(
      () => 'resolved',
      (e) => e,
    ),
    new Promise((r) => setTimeout(() => r('still waiting'), 400)),
  ]);
  ck(
    stalled instanceof M.MaskUploadStalled &&
      stalled.message === 'the mask upload got no answer in 0 s',
    'загрузка без ответа: по сроку — MaskUploadStalled, а не вечное ожидание',
    String(stalled?.message ?? stalled),
  );
  const retry = await Promise.race([
    slow.maskFor(907, A, 800, 1000),
    new Promise((r) => setTimeout(() => r('hung'), 400)),
  ]);
  release?.(9100);
  await new Promise((r) => setTimeout(r, 20));
  ck(
    retry === 9102 && sent === 2 && kept3.get(M.maskKey(907, A, 800, 1000)) === 9102,
    'после срока следующее нажатие грузит заново; поздний id брошенной загрузки не хранится',
    `${retry} (${sent}) kept ${kept3.get(M.maskKey(907, A, 800, 1000))}`,
  );

  // ── the ledger says whether a refusal freed the key (only then is a mask forgotten) ──
  const OP = M.operatorKey();
  const fp = 'fp-ledger';
  const s1 = M.ledgerSend(7, 'probe', fp, OP);
  const refusedClean = M.ledgerSettle(7, 'probe', fp, 'refused', s1.id, OP).freed;
  const s2 = M.ledgerSend(7, 'probe', fp, OP);
  M.ledgerSettle(7, 'probe', fp, 'unknown', s2.id, OP);
  M.ledgerSend(7, 'probe', fp, OP);
  const refusedAfterSilence = M.ledgerSettle(7, 'probe', fp, 'refused', s2.id, OP).freed;
  const accepted = M.ledgerSettle(7, 'probe', fp, 'accepted', s2.id, OP).freed;
  ck(
    refusedClean === true && refusedAfterSilence === false && accepted === true,
    'журнал: отказ — ключ освобождён (true); отказ повтора после тишины — ключ держится (false)',
    `${refusedClean} ${refusedAfterSilence} ${accepted}`,
  );
  delete globalThis.window;
})();

// ─── AF · G-03 Codex r3: ключ по id, журнал говорит «записан», срок чтения картинки, отказ маски ──
head(
  'AF',
  'G-03 r3: сравни-и-закрой по id и оператору, «записан ли ключ», срок EXIF, отказ маски после тишины',
);
await (async () => {
  const jwt = (sub) => `x.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.y`;
  const session = new Map();
  let full = false;
  const local = new Map([['authToken', jwt('operator-a')]]);
  globalThis.window = {
    sessionStorage: {
      getItem: (k) => session.get(k) ?? null,
      setItem: (k, v) => {
        if (full) throw new Error('QuotaExceededError');
        session.set(k, String(v));
      },
    },
    localStorage: { getItem: (k) => local.get(k) ?? null },
  };
  const opA = M.operatorKey();
  const fp = 'fp-r3';
  // A/id1 goes out, its answer is lost; the retry of id1 is accepted
  const a = M.ledgerSend(7, 'r3', fp, opA);
  M.ledgerSettle(7, 'r3', fp, 'unknown', a.id, opA);
  const retry = M.ledgerSend(7, 'r3', fp, opA);
  const retryAccepted = M.ledgerSettle(7, 'r3', fp, 'accepted', retry.id, opA);
  // the same request is pressed again: a new intent, a new key
  const b = M.ledgerSend(7, 'r3', fp, opA);
  // A's ORIGINAL answer arrives now, late
  const lateA = M.ledgerSettle(7, 'r3', fp, 'accepted', a.id, opA);
  const bRetry = M.ledgerSend(7, 'r3', fp, opA);
  ck(
    retry.id === a.id &&
      retryAccepted.matched &&
      b.id !== a.id &&
      lateA.matched === false &&
      lateA.freed === false &&
      bRetry.id === b.id,
    'BLOCKER r3: поздний ответ id1 не трогает ключ id2 того же запроса — повтор B несёт id2, не id3',
    JSON.stringify({ a: a.id, b: b.id, bRetry: bRetry.id, lateA }),
  );
  // the operator of the SEND: an answer read after B signs in settles A's namespace only
  local.set('authToken', jwt('operator-b'));
  const opB = M.operatorKey();
  const bOwn = M.ledgerSend(7, 'r3', 'fp-op', opB);
  const aOwn = M.ledgerSend(7, 'r3', 'fp-op', opA);
  const settledA = M.ledgerSettle(7, 'r3', 'fp-op', 'accepted', aOwn.id, opA);
  const crossed = M.ledgerSettle(7, 'r3', 'fp-op', 'accepted', aOwn.id, opB);
  ck(
    opA !== opB &&
      settledA.matched &&
      !crossed.matched &&
      M.ledgerSend(7, 'r3', 'fp-op', opB).id === bOwn.id,
    'оператор взят при отправке: ответ A закрывает ключ A, ключ B того же запроса цел',
  );
  local.set('authToken', jwt('operator-a'));
  // MAJOR r3: the ledger says whether its entry reached sessionStorage
  const kept = M.ledgerSend(7, 'r3', 'fp-store', opA);
  full = true;
  const lost = M.ledgerSend(7, 'r3', 'fp-store-2', opA);
  full = false;
  ck(
    kept.stored === true && lost.stored === false && !!lost.id,
    'ledgerSend: запись дошла — stored true; квота — stored false (id всё равно есть в памяти)',
  );
  // MINOR r3: a mask refusal of the same id after a silence frees the key ('void')
  const u = M.ledgerSend(7, 'r3', 'fp-void', opA);
  M.ledgerSettle(7, 'r3', 'fp-void', 'unknown', u.id, opA);
  M.ledgerSend(7, 'r3', 'fp-void', opA);
  const voided = M.ledgerSettle(7, 'r3', 'fp-void', 'void', u.id, opA);
  const refusal = (reason, why) => ({
    status: 400,
    details: [
      { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason, metadata: why ? { why } : {} },
    ],
  });
  ck(
    voided.matched && voided.freed && M.ledgerSend(7, 'r3', 'fp-void', opA).id !== u.id,
    'отказ, доказывающий «не заведён» (void), освобождает ключ и после тишины',
  );
  ck(
    M.maskRefusalProvesUnbooked(refusal('mask_invalid', 'it is not a readable PNG')) &&
      M.maskRefusalProvesUnbooked(refusal('mask_size_mismatch')) &&
      M.maskRefusalProvesUnbooked(refusal('mask_empty')) &&
      !M.maskRefusalProvesUnbooked(refusal('mask_invalid', 'the mask picture does not exist')) &&
      !M.maskRefusalProvesUnbooked(refusal('words_required')),
    'доказывают: байты/размер/пустота маски; НЕ доказывают: «маски больше нет» и прочие отказы',
  );

  // MAJOR r3: reading the shown file has a deadline, and a timed-out read is not cached
  const realFetch = globalThis.fetch;
  let fetches = 0;
  let firstSignal;
  const jpeg6 = Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe1,
    0,
    34,
    ...[...'Exif\0\0'].map((c) => c.charCodeAt(0)),
    0x4d,
    0x4d,
    0,
    42,
    0,
    0,
    0,
    8,
    0,
    1,
    0x01,
    0x12,
    0,
    3,
    0,
    0,
    0,
    1,
    0,
    6,
    0,
    0,
    0,
    0,
    0,
    0,
    0xff,
    0xda,
    0,
    2,
    0xff,
    0xd9,
  ]);
  globalThis.fetch = (url, init) => {
    fetches++;
    if (fetches === 1) {
      firstSignal = init?.signal;
      return new Promise(() => {}); // a proxy that never answers, and ignores the abort
    }
    return Promise.resolve(new Response(jpeg6));
  };
  const first = await Promise.race([
    M.orientationOf('https://x/hang.jpg', 60).then(
      (o) => o,
      (e) => e,
    ),
    new Promise((r) => setTimeout(() => r('still reading'), 400)),
  ]);
  const second = await Promise.race([
    M.orientationOf('https://x/hang.jpg', 60).catch((e) => e),
    new Promise((r) => setTimeout(() => r('still reading'), 400)),
  ]);
  globalThis.fetch = realFetch;
  ck(
    first instanceof M.OrientationTimeout && firstSignal?.aborted === true,
    'чтение картинки без ответа: по сроку — отказ OrientationTimeout, запрос оборван (abort)',
    String(first?.message ?? first),
  );
  ck(
    second === 6 && fetches === 2,
    'сорванное чтение не кэшируется: повторное открытие читает снова и получает тег 6',
    `${second} (${fetches})`,
  );

  // MINOR r3: the given-up mask upload is aborted
  let uploadSignal;
  const hung = M.createMaskUploader(
    async () => 'data:image/png;base64,AA',
    (_url, signal) => {
      uploadSignal = signal;
      return new Promise(() => {});
    },
    undefined,
    60,
  );
  const gaveUp = await Promise.race([
    hung.maskFor(1, [{ size: 0.03, points: [{ x: 0.5, y: 0.5 }] }], 10, 10).catch((e) => e),
    new Promise((r) => setTimeout(() => r('hung'), 400)),
  ]);
  ck(
    gaveUp instanceof M.MaskUploadStalled && uploadSignal?.aborted === true,
    'брошенная загрузка маски ОБОРВАНА (сигнал отменён), а не висит',
  );
  delete globalThis.window;
})();

// ─── AG · 20-PROMPTS: слова, которые уезжают в модель ────────────────────────────────────────
head('AG', '20-PROMPTS §3.5 идеи ретуши — результат; §3.7 имя Pantone на проводе плитки 4');
{
  // §3.5 — written out by hand from the document, not read from the module.
  const SIX = [
    'uncreased fabric continuing the surrounding cloth',
    'a clean hem line continuing the stitching',
    'the same print continuing across the zone',
    'a patch pocket in the same fabric',
    'a metal zip in the same cloth',
    'plain cloth matching the surroundings',
  ];
  const zone = [...(M.PROMPT_IDEAS.retouch_zone?.zone ?? [])];
  const text = [...(M.PROMPT_IDEAS.retouch_zone?.change_text ?? [])];
  ck(same(zone, SIX), 'идеи ретуши — ровно шесть фраз §3.5, в их порядке', show(zone));
  const ops = zone.filter((p) => /^(remove|delete|fix|straighten)\b/i.test(p.trim()));
  ck(ops.length === 0, 'ни одна идея ретуши не начинается с операции', show(ops));
  ck(same(text, zone), 'zone и change_text читают один список', show(text));

  // §3.7 — the name of the swatch travels in colour.words, exact codes only.
  const wireOf = (code, hex = '') =>
    run('change_color').wire(
      draft({ images: { photos: [media(11)] }, colours: { colour: { code, hex } } }),
      ctx,
    );
  const known = wireOf('19-4052 TCX', '#0f4c81');
  ck(
    known.params.colour?.words === 'Classic Blue',
    'знакомый код 19-4052 TCX → words «Classic Blue»',
    show(known.params.colour),
  );
  const unknown = wireOf('DH-0412');
  ck(
    unknown.params.colour?.words === '' && unknown.params.colour?.code === 'DH-0412',
    'незнакомый код (номер дайхауса) → words пуст, код уезжает',
    show(unknown.params.colour),
  );
  const prefix = wireOf('19-4052');
  ck(
    prefix.params.colour?.words === '',
    'огрызок кода «19-4052» не занимает имя книжного свотча',
    show(prefix.params.colour),
  );
  const none = wireOf('');
  ck(none.params.colour?.words === '', 'нет цвета → words пуст', show(none.params.colour));

  const d = draft({
    images: { photos: [media(11)] },
    colours: { colour: { code: '19-4052 TCX', hex: '#0f4c81' } },
  });
  const shape = run('change_color').shape(d, known);
  ck(
    /recoloured to 19-4052 TCX, Classic Blue$/.test(shape),
    'строка цены: «recoloured to 19-4052 TCX, Classic Blue»',
    shape,
  );
  const inv = run('change_color').inventory(d, known, ctx);
  const colourLine = inv.groups.find((g) => g.key === 'colour')?.text ?? '';
  ck(
    /^Pantone 19-4052 TCX, Classic Blue — its name and the value #0f4c81 travel beside it$/.test(
      colourLine,
    ),
    '«what the model gets»: код, имя и значение',
    colourLine,
  );
  const invUnknown = run('change_color').inventory(d, unknown, ctx);
  const unknownLine = invUnknown.groups.find((g) => g.key === 'colour')?.text ?? '';
  ck(
    /the code alone travels$/.test(unknownLine) && !/Classic Blue/.test(unknownLine),
    '«what the model gets» без имени у незнакомого кода',
    unknownLine,
  );

  const recalled = (words) =>
    run('change_color').recall(
      {
        kind: 'recolor',
        ask: '',
        params: {
          extraInputMediaIds: [11],
          colour: { code: '19-4052 TCX', hex: '#0f4c81', words },
        },
      },
      new Map([[11, media(11)]]),
    );
  const own = recalled('Classic Blue');
  ck(
    !own.said.some((w) => /colour words/.test(w)),
    'рекол: имя свотча — свои слова плитки, о потере не сказано',
    show(own.said),
  );
  const other = recalled('a deep navy');
  ck(
    other.said.some((w) => /colour words did not come along/.test(w)),
    'рекол: чужие слова цвета — сказано, что не пришли',
    show(other.said),
  );
  const again = run('change_color').wire(own.draft, ctx);
  ck(
    again.params.colour?.words === 'Classic Blue',
    'рекол → провод: имя собирается заново из кода',
    show(again.params.colour),
  );
}

const expected = MUTATED ? ' (прогон С МУТАЦИЕЙ — провалы ожидаются)' : '';
console.log(
  `\n${bad === 0 ? 'ЗЕЛЕНО' : 'КРАСНО'}: ${total - bad} / ${total} проверок прошло, провалов ${bad}` +
    (bad ? ` в группах ${[...failedIn].join(', ')}` : '') +
    expected,
);
process.exit(bad === 0 ? 0 : 1);
