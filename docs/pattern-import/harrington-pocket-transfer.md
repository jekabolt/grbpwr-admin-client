# Harrington MDF502 · перенос E POCKETS в общую ветку

Ветка `fix-pattern-pdf-open-lines`, HEAD `3d1f5f9287a094689940ec119e845de7691bc0e2` с рабочими изменениями. База снята непосредственно перед переносом. Выбран один оригинал MDF502 с SHA-256 `83a30840de9184bfb0d734c61612c7ce42ae7882bf96fd8178d6994321193e1d`. Карта в обоих прогонах задаёт 34, 36, 38, 40, 42, 44, 46, 48, 50, 52. Снимки и журналы сохранены в `/private/tmp/harrington-pocket-transfer.QPap5s`. SHA-256 собранных программ до и после — `5f230d74754f7454ec1272fb3b14d00ea89523912cbf44f194ed1100ad798cee` и `e4c2977e4e679b70e21c5289d4960c0b5c2303229d1cfcb197d6a5330ce81505`.

В Pieces добавлено восстановление повторного обхода по меткам собственного размерного пера перед существующим обработчиком материалов. В Meaning подпись вдоль видимой прямой и симметричные залитые наконечники её двух концов дают два признака долевой. В детали E на стр. 9 вал — операция 7145, тёмные наконечники — 7150 и 7162, белые вставки — 7156 и 7168, подпись GRAINLINE — 7368. На стр. 3 для E указано FABRIC - CUT 2 MIRRORED. Координаты приведены в мм собранного листа, операции — индексы PDF.js с нуля.

## Приёмка

**70/70 замкнутых до и после, 0 утечек.** Сверка координат всех вершин сохранила 69 прежних срезов. Единственное изменение — E50. У исходного обхода 46 вершин и площадь 144228,556 мм². В итоговой сессии лежит простой пятиугольник площадью 72124,030 мм². Его вершины в точности совпали с восстановлением по собственному перу размера 50, проверка самопересечений пройдена.

| Проверка по PDF | Результат |
|---|---|
| Видимые центры меток E50 | 792. На стр. 8, 9, 15 и 16 соответственно 165, 237, 175 и 215. Максимальное расстояние от центра до контура 0,00006421 мм. Индексы операций перечислены в proof.json. |
| Исходная долевая | От (1022,112833; 1452,767336) до (1022,059917; 1386,147722), длина 66,619635 мм, направление 89,954489° по модулю 180°. В каждом из десяти размеров координаты распознанного отрезка совпали с операцией 7145. |
| Слой 7 в перечитанном DXF | Проверены PCK_L и PCK_R для каждого размера 34–52. Во всех 20 блоках ровно одна ось. Максимальная ошибка середины 0,000000472 мм, направления 0,000000043°. Писатель удлиняет линию до 180 мм вокруг исходной середины. |

Контрольный DXF построен из двух фактических спецификаций Meaning. Для диагностической записи им присвоен MAIN по стр. 3, поскольку мастер остановился до выбора материалов. Диагностический DXF и JSON измерений побайтово совпали с принятой изолированной реализацией. Удаление одного наконечника в контрольной копии снимает автоматическое признание долевой. Исключение полосы меток шириной 40 мм приводит к отказу восстановления E50.

| Условия | Остановка мастера | Check / write / apply |
|---|---|---|
| Историческая карта, до переноса | Pieces 70/70. Meaning просит нарисовать долевую E, поскольку ось не помещается во всех размерах | Check не достигнут, write 0 областей, apply не выполнен |
| Историческая карта, после переноса | Pieces 70/70. E принят. Meaning удерживает B FRONT 46 (отклонение параллельного контура 8,675 мм), A BACK 38 (0,417 мм), G WAISTBAND 38 (0,715 мм) | Check не достигнут, write 0 областей, apply не выполнен |
| Без оракула страниц и предзаданных ответов, после переноса | Pieces спрашивает, считать ли деталями пять отложенных неподписанных контуров. Ответов оператора 0, Meaning не достигнут | Check не достигнут, write 0 областей, apply не выполнен |

Исторический профиль разрешает ответы pages, asides и outline=seam. Трасса после переноса зарегистрировала один ответ в Pieces, ответов по долевой не было. PIECES_OPEN_PASS выключен.

[Диагностический DXF](harrington-pocket/E-POCKETS-FABRIC-diagnostic.dxf) · [792 операции и результаты для всех 20 блоков](harrington-pocket/proof.json)

## Тесты

Финальный запуск всего набора pattern-import прошёл **335/335** (55 файлов). Команда — `node_modules/.bin/vitest run src/lib/pattern-import --maxWorkers=1 --testTimeout=60000`.

В первом запуске `node_modules/.bin/vitest run src/lib/pattern-import --maxWorkers=2` прошли 330/335. У пяти тестов в двух файлах сработал таймаут в 5 секунд. При отдельном повторе этих файлов прошли все 76/76, включая эти пять. Команда повтора:

```sh
node_modules/.bin/vitest run src/lib/pattern-import/pieces/gfit/nest-walk.test.ts src/lib/pattern-import/pieces/nest-judge.test.ts --maxWorkers=1 --testTimeout=60000
```

## Воспроизведение

Команды запускаются из корня общей ветки. Сохранённая до переноса программа позволяет воспроизвести базу без переключения ветки. Вызов штатного рабочего процесса ниже использует новую папку, чтобы каждый раз перечитывать оригинал. Переменная D указывает папку для диагностического DXF и результатов его перечитывания.

```sh
R=/private/tmp/harrington-pocket-transfer.QPap5s
T=/private/tmp/harrington-proof
M=/private/tmp/patimport-runs/olympia-integrated-80/input-manifest.json
ID=$(cat "$T/ids")
PDF=$(node -p 'require(process.argv[1]).find(x=>x.id===process.argv[2]).path' "$M" "$ID")
OUT=$(mktemp -d)
D="$OUT/proof"
mkdir -p "$OUT/baseline/$ID" "$D"
cp "$R/before/replay-runtime.mjs" "$OUT/baseline-runtime.mjs"
ln -s "$PWD/node_modules" "$OUT/node_modules"
export PATIMPORT_REPO="$PWD"
env -u PIECES_OPEN_PASS AUTOPILOT_OUTLINES=1 node scripts/pattern-import/automatic-gap-replay.mjs --worker "$OUT/baseline-runtime.mjs" "$R/before/$ID/case.json" "$OUT/baseline/$ID"
env -u PIECES_OPEN_PASS AUTOPILOT_OUTLINES=1 node scripts/pattern-import/automatic-gap-replay.mjs "$T/paths.json" "$T/short.json" "$OUT/after" "$T/final" --files "$T/ids"
env -u PIECES_OPEN_PASS -u GOLDEN_ANSWERS -u AUTOPILOT_ORACLE_PAGES node scripts/pattern-import/trace-harrington-pocket.mjs "$OUT/after/replay-runtime.mjs" "$M" "$OUT/strict.json"
env -u PIECES_OPEN_PASS AUTOPILOT_ORACLE_PAGES=1 GOLDEN_ANSWERS='{"pages":true,"asides":true,"outline":"seam"}' node scripts/pattern-import/trace-harrington-pocket.mjs "$OUT/after/replay-runtime.mjs" "$M" "$OUT/meaning.json"
node scripts/pattern-import/source-check-harrington-pocket.mjs "$PDF" "$OUT/baseline/$ID" "$OUT/after/$ID" "$OUT/meaning.json" "$D"
```
